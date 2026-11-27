// 道具の呼び出しを、実行の前に判定する。2 つのホストの受け口が、同じこの関数を呼ぶ。
//
// 返すのは次のどれかである。
//   null                         通す
//   { decision: 'deny', … }      止めて、理由をモデルへ返す
//   { decision: 'ask', … }       利用者に確かめる(確かめる手段のあるホストでだけ返す)
//
// 確かめるのは、手元の外へ届く操作と、確かめる線そのものを動かす操作だけにする。プロジェクトが `dotagents.jsonc` で
// 任せた種類は通す。読めない形は通す。判定の誤りで、作業そのものを止めないためである。
// これは誤りを防ぐ仕掛けで、隔離ではない。スクリプトの中に隠した操作までは読まない。

import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { attribution } from './attribution.mjs';
import { DECLARATION, list, parseDeclaration, policyOf, readDeclaration } from './declaration.mjs';
import { simpleCommands } from './shell.mjs';

export const CONFIRMED = 'DOTAGENTS_CONFIRMED';

// 守るファイルを書き換える道具。これ以外は、読むだけとして通す。
const WRITERS = new Set(['sed', 'tee', 'cp', 'mv', 'rm', 'ln', 'truncate', 'dd', 'perl', 'install', 'rsync', 'patch', 'ed']);
// 人へ届くコネクターの操作。
const MESSAGE = /(?:^|[_-])(?:send|reply|forward|share|post|publish|invite|respond)(?:[_-]|$)/;

export const KIND_LABELS = {
  push: '共有のブランチへの push',
  rewrite: '共有のブランチの書き換えか削除',
  tag: 'tag の push',
  merge: 'PR のマージ',
  bypass: 'ブランチの保護を飛ばすマージ',
  release: '公開(リリースやパッケージ)',
  settings: 'リポジトリーの設定の変更',
  workflow: 'workflow の起動',
  message: '人への連絡や共有',
  instructions: '指示ファイル(AGENTS.md、CLAUDE.md)の書き換え',
  policy: '確かめる線(dotagents.jsonc)の書き換え',
};
const PACED = new Set(['builder', 'reviewer']);
// 任せられない種類。線そのものを動かすか、保護を外す操作である。
const NEVER_DELEGATED = new Set(['rewrite', 'bypass', 'policy']);
// 任せられる種類。schema の `delegated` の列挙と一致することを、テストが守る。
export const DELEGABLE = Object.keys(KIND_LABELS).filter((kind) => !NEVER_DELEGATED.has(kind));

// 1 回の判定で、手元の git に尋ねてよい時間と、GitHub に尋ねてよい時間。片方の遅さがもう片方の答えを変えないよう、
// 別々に持つ。合わせても hook の上限(10 秒)より十分短くする。上限を過ぎると、ホストは hook を失敗として扱い、
// 確かめそのものが届かない。
export const LOCAL_MS = 3000;
export const GITHUB_MS = 4000;

// file を実行する関数を返す。最初に呼ばれたときから ms の間だけ答えを待ち、過ぎたら答えが無いもの(null)とする。
export const command = (file, ms) => {
  let until = null;
  return (cwd, ...args) => {
    until ??= Date.now() + ms;
    const left = until - Date.now();
    if (left <= 0) return null;
    try {
      return execFileSync(file, args, { cwd, encoding: 'utf8', timeout: left, stdio: ['ignore', 'pipe', 'ignore'] }).trim();
    } catch {
      return null;
    }
  };
};

// 手元の git と、GitHub に尋ねる gh。
export const runners = ({ local = LOCAL_MS, github = GITHUB_MS } = {}) => ({ git: command('git', local), gh: command('gh', github) });

const glob = (pattern) => new RegExp(`^${pattern.split('*').map((part) => part.replace(/[.+?^${}()|[\]\\]/g, '\\$&')).join('.*')}$`);
const matches = (patterns, name) => patterns.some((pattern) => glob(pattern).test(name));
const first = (words) => words.find((word) => !word.startsWith('-'));

export function delegated(entries, finding) {
  if (NEVER_DELEGATED.has(finding.kind)) return false;
  return list(entries).some((entry) => {
    const at = entry.indexOf(':');
    const kind = at < 0 ? entry : entry.slice(0, at);
    if (kind !== finding.kind) return false;
    return at < 0 || glob(entry.slice(at + 1)).test(finding.target ?? '');
  });
}

// ---------------------------------------------------------------- git と gh

// main と master は、デフォルトブランチでなくても共有のブランチとして扱う。デフォルトが develop のプロジェクトでは、
// 本番のブランチがこの名前で残っていることが多く、`dotagents.jsonc` を書くまで、そこへの push が確かめなしで通っていた。
const CONVENTIONAL = ['main', 'master'];

// 共有のブランチ。リモートの既定のブランチ、main と master、`dotagents.jsonc` の protected を合わせる。
// ask は、git にそのリポジトリーについて尋ねる関数である。
// リモートの既定が記録されていなければ、main と master を既定とみなす。git が答えなければ、どのブランチも既定かも
// しれないので、すべてを共有のブランチとして扱う(外へ届く側に倒す)。
function guardedBranches(ask, remote, declaration) {
  const head = ask('symbolic-ref', '-q', '--short', `refs/remotes/${remote}/HEAD`);
  const unknown = !head && ask('for-each-ref', '--format=%(refname)', `refs/remotes/${remote}/HEAD`) === null;
  const defaults = head ? [head.slice(remote.length + 1)] : CONVENTIONAL;
  return { defaults, guarded: [...new Set([...(unknown ? ['*'] : []), ...defaults, ...CONVENTIONAL, ...list(declaration.protected)])] };
}

// git の前に付く大域の指定のうち、次の語を値に取るもの。
const GIT_GLOBAL_VALUED = new Set(['-C', '-c', '--git-dir', '--work-tree', '--namespace', '--config-env', '--super-prefix', '--attr-source']);
// 尋ねるときにも渡す指定。どのリポジトリーを見るかと、設定の上書きである。設定の上書きは、設定を読むときにだけ渡す。
const REPO_GLOBALS = new Set(['--git-dir', '--work-tree', '--namespace', '--bare']);
const CONFIG_GLOBALS = new Set(['-c', '--config-env']);

// git の前に付く大域の指定を外し、下位のコマンドと、残りの語と、同じリポジトリーへ尋ねる関数を返す。
function gitCommand(words, cwd, git) {
  let dir = cwd;
  const repo = [];
  const config = [];
  let i = 1;
  while (i < words.length && words[i].startsWith('-')) {
    const word = words[i];
    const taken = GIT_GLOBAL_VALUED.has(word) ? [word, words[i + 1] ?? ''] : [word];
    if (word === '-C') dir = path.resolve(dir, taken[1] || '.');
    const name = word.split('=')[0];
    if (REPO_GLOBALS.has(name)) repo.push(...taken);
    else if (CONFIG_GLOBALS.has(name)) config.push(...taken);
    i += taken.length;
  }
  return {
    dir,
    sub: words[i],
    rest: words.slice(i + 1),
    ask: (...args) => git(dir, ...repo, ...args),
    setting: (...args) => git(dir, ...repo, ...config, 'config', ...args),
  };
}

const isLocalRemote = (ask, remote) => /^(?:\/|\.{1,2}\/|file:)/.test(ask('remote', 'get-url', remote) ?? remote);

// push を読み、外へ届く操作(found)と、書き換えて残すブランチ(updated)を返す。
function parsePush(words, cwd, declaration, git) {
  const none = { found: [], updated: [] };
  const { dir, sub, rest, ask } = gitCommand(words, cwd, git);
  if (sub !== 'push') return none;
  const args = [];
  const flags = new Set();
  for (let k = 0; k < rest.length; k += 1) {
    const word = rest[k];
    if (!word.startsWith('-')) args.push(word);
    else if (['-o', '--push-option', '--repo', '--receive-pack', '--exec'].includes(word)) k += 1;
    else flags.add(word.split('=')[0]);
  }
  if (flags.has('--dry-run') || flags.has('-n')) return none;
  const remote = args[0] ?? 'origin';
  // 手元のディスクにあるリモートは、手元の外ではない。
  if (isLocalRemote(ask, remote)) return none;
  const force = flags.has('--force') || flags.has('-f') || flags.has('--force-with-lease') || flags.has('--force-if-includes');
  const remove = flags.has('--delete') || flags.has('-d');
  const { defaults, guarded } = guardedBranches(ask, remote, declaration);
  const current = () => ask('symbolic-ref', '-q', '--short', 'HEAD');
  const found = [];
  const updated = [];
  // 行き先が今いるブランチで、それが分からないとき(git が答えないとき)は、共有のブランチかもしれないものとして扱う。
  const branch = (name, rewrites, removes = false) => {
    if (!name) {
      found.push({ kind: rewrites || removes ? 'rewrite' : 'push', target: 'HEAD' });
      return;
    }
    if (!removes) updated.push(name);
    if (matches(guarded, name)) found.push({ kind: rewrites || removes ? 'rewrite' : 'push', target: name });
  };
  if (flags.has('--all') || flags.has('--mirror') || flags.has('--branches')) {
    for (const name of defaults) if (matches(guarded, name)) found.push({ kind: force || flags.has('--mirror') ? 'rewrite' : 'push', target: name });
  }
  if (flags.has('--tags') || flags.has('--mirror')) found.push({ kind: 'tag', target: '*' });
  const specs = args.slice(1);
  if (!specs.length && !flags.has('--all') && !flags.has('--mirror') && !flags.has('--tags')) {
    const name = current();
    const upstream = name && ask('rev-parse', '--abbrev-ref', '--symbolic-full-name', `${name}@{upstream}`);
    branch(upstream?.startsWith(`${remote}/`) ? upstream.slice(remote.length + 1) : name, force, remove);
  }
  for (let k = 0; k < specs.length; k += 1) {
    let spec = specs[k];
    if (spec === 'tag') {
      k += 1;
      if (specs[k]) found.push({ kind: 'tag', target: specs[k] });
      continue;
    }
    const forced = force || spec.startsWith('+');
    if (spec.startsWith('+')) spec = spec.slice(1);
    const at = spec.indexOf(':');
    const source = at < 0 ? spec : spec.slice(0, at);
    let target = at < 0 ? spec : spec.slice(at + 1);
    if (target === 'HEAD' || target === '@') {
      branch(current(), forced, remove);
      continue;
    }
    if (target.startsWith('refs/tags/')) {
      found.push({ kind: 'tag', target: target.slice(10) });
      continue;
    }
    if (target.startsWith('refs/heads/')) target = target.slice(11);
    // 守るブランチの名前でなければ、tag かどうかを git に尋ねる。答えが無いときは、版の番号の形なら tag として読む。
    const named = at < 0 && !matches(guarded, target) && (ask('rev-parse', '-q', '--verify', `refs/tags/${target}`) || /^(?:[\w.-]+\/)?v?\d+\.\d+/.test(target));
    if (named && !ask('rev-parse', '-q', '--verify', `refs/heads/${target}`)) found.push({ kind: 'tag', target });
    else branch(target, forced, remove || (at >= 0 && source === ''));
  }
  return { found, updated, dir };
}

const gitPush = (words, cwd, declaration, git) => parsePush(words, cwd, declaration, git).found;

const API_KINDS = [
  [/\/pulls\/\d+\/merge$|\/merges$/, 'merge'],
  [/\/releases(?:\/|$)/, 'release'],
  [/\/dispatches$/, 'workflow'],
  [/rulesets|\/protection|\/environments|\/collaborators|\/hooks|\/actions\/(?:secrets|variables|permissions)|\/pages|\/transfer|\/topics/, 'settings'],
];
// リポジトリーそのものへの書き込み。経路に変数があると区切りを読み違えるので、変数の無い形だけを読む。
const REPO_ROUTE = /^\/?repos\/[^/$]+\/[^/$]+$/;

function ghApi(words, cwd, declaration, git) {
  const args = words.slice(2);
  let method = null;
  let fields = false;
  const bare = [];
  for (let i = 0; i < args.length; i += 1) {
    const word = args[i];
    if (word === '-X' || word === '--method') method = args[(i += 1)];
    else if (/^(?:-X|--method=)./.test(word)) method = word.replace(/^(?:-X|--method=)/, '');
    else if (['-f', '-F', '--field', '--raw-field', '--input'].includes(word)) {
      fields = true;
      i += 1;
    } else if (['-H', '--header', '-q', '--jq', '-t', '--template', '--hostname', '--cache', '-p', '--preview'].includes(word)) i += 1;
    else if (!word.startsWith('-')) bare.push(word);
  }
  const verb = (method ?? (fields ? 'POST' : 'GET')).toUpperCase();
  if (verb === 'GET') return [];
  const route = (bare[0] ?? '').split('?')[0];
  const ref = route.match(/\/git\/refs\/(heads|tags)\/(.+)$/);
  if (ref) {
    if (verb === 'POST') return [];
    if (ref[1] === 'tags') return [{ kind: 'tag', target: ref[2] }];
    return matches(guardedBranches((...query) => git(cwd, ...query), 'origin', declaration).guarded, ref[2]) ? [{ kind: 'rewrite', target: ref[2] }] : [];
  }
  if (verb !== 'POST' && REPO_ROUTE.test(route)) return [{ kind: 'settings', target: 'repo' }];
  const hit = API_KINDS.find(([pattern]) => pattern.test(route));
  return hit ? [{ kind: hit[1], target: route.split('/').slice(3).join('/') || 'repo' }] : [];
}

function gh(words, cwd, declaration, tools) {
  if (words.includes('--help') || words.includes('-h')) return [];
  const [, group, verb] = words;
  const rest = words.slice(3);
  if (group === 'api') return ghApi(words, cwd, declaration, tools.git);
  if (group === 'pr' && verb === 'merge') {
    if (rest.includes('--admin')) return [{ kind: 'bypass', target: '*' }];
    const number = first(rest);
    const base = tools.gh(cwd, 'pr', 'view', ...(number ? [number] : []), '--json', 'baseRefName', '--jq', '.baseRefName');
    return [{ kind: 'merge', target: base || '*' }];
  }
  if (group === 'release' && ['create', 'delete', 'edit', 'upload', 'delete-asset'].includes(verb)) return [{ kind: 'release', target: first(rest) ?? '*' }];
  if (group === 'workflow' && ['run', 'enable', 'disable'].includes(verb)) return [{ kind: 'workflow', target: first(rest) ?? '*' }];
  if (['secret', 'variable'].includes(group) && ['set', 'delete', 'remove'].includes(verb)) return [{ kind: 'settings', target: group }];
  if (group === 'ruleset' && verb && !['list', 'view', 'check'].includes(verb)) return [{ kind: 'settings', target: 'ruleset' }];
  if (group === 'repo' && ['delete', 'edit', 'rename', 'archive', 'unarchive', 'deploy-key'].includes(verb)) return [{ kind: 'settings', target: 'repo' }];
  return [];
}

// ---------------------------------------------------------------- 守るファイル

const INSTRUCTIONS = new Set(['AGENTS.md', 'CLAUDE.md']);
const DECLARATION_PATH = DECLARATION.split(path.sep).join('/');

function fileKind(file) {
  const normal = file.split(path.sep).join('/');
  if (normal === DECLARATION_PATH || normal.endsWith(`/${DECLARATION_PATH}`)) return 'policy';
  return INSTRUCTIONS.has(path.basename(normal)) ? 'instructions' : null;
}

function writtenFiles(command) {
  const args = WRITERS.has(command.words[0]) ? command.words.slice(1).filter((word) => !word.startsWith('-')) : [];
  return [...command.targets, ...args];
}

function editFinding(request) {
  const file = path.resolve(request.cwd, request.file ?? '');
  const kind = fileKind(file);
  if (kind !== 'policy') return kind ? { kind, target: path.basename(file) } : null;
  let before = policyOf({});
  try {
    before = policyOf(parseDeclaration(fs.readFileSync(file, 'utf8')));
  } catch {}
  let after = null;
  try {
    if (typeof request.after === 'string') after = policyOf(parseDeclaration(request.after));
  } catch {}
  // 書き換えたあとの中身が分からないときは、線が動くものとして確かめる。
  return after !== null && after === before ? null : { kind, target: path.basename(file) };
}

// ---------------------------------------------------------------- 止める手順
//
// 外へ届く操作の確かめとは別に、外すと費用が大きく、見分けが確かな手順だけを止めて、理由を返す。任せることはできない。
// 追従の merge と PR の base は、利用者が明示して求めたときに、オーケストレーターが了承の印を付けて実行し直せる。
// CI の待ちは、利用者に確かめない。待つか、要らない実行を止めるかは、エージェントが決められるからである。

export const PROCEDURE_LABELS = {
  follow: '追従の merge',
  base: '既定のブランチではない PR の base',
  ci: 'CI が走っている間の push',
};

// merge と pull で、値を 1 つ取る指定。
const GIT_VALUED = new Set(['-m', '-s', '-X', '-F', '--file', '--strategy', '--strategy-option', '--into-name', '--cleanup', '--depth', '--deepen', '--shallow-since', '--shallow-exclude', '-j', '--jobs', '--upload-pack', '-o', '--server-option', '--negotiation-tip']);
// pull.rebase と branch.<名前>.rebase が、真偽のほかに取る値。どれも rebase で取り込む。
const REBASE_MODES = new Set(['merges', 'm', 'interactive', 'i', 'preserve', 'p']);
// git が偽として読む値。
const FALSE = /^(?:false|no|off|0|)$/i;

function positional(words, valued) {
  const out = [];
  for (let k = 0; k < words.length; k += 1) {
    if (!words[k].startsWith('-')) out.push(words[k]);
    else if (valued.has(words[k])) k += 1;
  }
  return out;
}

// 取り込む ref を、ブランチの名前に直す。リモートの名前と refs/ の頭を外す。
function branchOf(ref, remotes) {
  if (ref.startsWith('refs/heads/')) return ref.slice(11);
  const name = ref.replace(/^refs\/remotes\//, '');
  const remote = remotes.find((candidate) => name.startsWith(`${candidate}/`));
  return remote ? name.slice(remote.length + 1) : name;
}

// リモートの名前だけと、<リモート>/HEAD は、そのリモートの既定のブランチを指す。
const remoteDefault = (ref, remotes) => remotes.some((remote) => [remote, `${remote}/HEAD`, `refs/remotes/${remote}/HEAD`].includes(ref));

// 設定が無いことを、git が答えなかったことと分けて受け取るための値。
const UNSET = '--default=dotagents-unset';
const unset = (value) => value === 'dotagents-unset';

// rebase で取り込むかを、git が pull.rebase と branch.<名前>.rebase を読むのと同じ意味で読む。範囲(利用者全体、
// リポジトリー、-c)ごとに値が違ってもよいよう、効いている値(最後の 1 つ)を読む。設定が無ければ null、git が
// 答えなければ undefined を返す。git config --type=bool は、どこか 1 つの範囲に merges があるだけで失敗するので使わない。
function rebaseSetting(setting, key) {
  const raw = setting(UNSET, '--get', key);
  if (raw === null) return undefined;
  if (unset(raw)) return null;
  // 値の無い鍵は真、空の値は偽で、--get の答えでは区別できない。
  if (raw === '') return setting('--type=bool', '--get', key) === 'true';
  if (/^(?:true|yes|on)$/i.test(raw)) return true;
  if (/^(?:false|no|off)$/i.test(raw)) return false;
  const number = raw.match(/^[-+]?(\d+)[kmg]?$/i);
  if (number) return Number(number[1]) !== 0;
  // merges、interactive とその略は rebase する。読めない値では、git は pull をせずに止まる。どちらも merge の跡は残らない。
  return true;
}

function follow(command, declaration, git) {
  const { sub, rest, ask, setting } = gitCommand(command.words, command.cwd, git);
  if (sub !== 'merge' && sub !== 'pull') return null;
  const flag = (...names) => rest.find((word) => names.includes(word.split('=')[0]));
  if (flag('--abort', '--continue', '--quit', '--skip', '--ff-only', '--help', '-h')) return null;
  const current = ask('symbolic-ref', '-q', '--short', 'HEAD');
  if (!current) return null;
  const args = positional(rest, GIT_VALUED);
  const remotes = (ask('remote') ?? 'origin').split('\n').filter(Boolean);
  const remote = sub === 'pull' && args[0] ? args[0] : 'origin';
  const { guarded } = guardedBranches(ask, remote, declaration);
  // 共有のブランチの上で、作業ブランチを取り込む merge は、統合そのものなので止めない。
  if (matches(guarded, current)) return null;
  if (sub === 'pull') {
    // 指定は後に書いたものが勝つ。指定が無ければ、ブランチごとの設定、pull.rebase の順に読む。
    let rebase = null;
    for (const word of rest) {
      if (word === '-r' || word === '--rebase') rebase = true;
      else if (word.startsWith('--rebase=')) rebase = !FALSE.test(word.slice(9));
      else if (word === '--no-rebase') rebase = false;
    }
    const explicit = rebase !== null;
    if (!explicit) {
      const branch = rebaseSetting(setting, `branch.${current}.rebase`);
      rebase = branch === null ? rebaseSetting(setting, 'pull.rebase') : branch;
      // 設定を読めなければ、rebase するかが分からない。追従の merge は確かなときだけ止める。
      if (rebase === undefined) return null;
    }
    if (rebase) return null;
    // 早送りだけに限っていれば、merge の跡は残らない。
    if (!explicit && !flag('--ff', '--no-ff')) {
      const ff = setting(UNSET, '--get', 'pull.ff');
      if (ff === null || ff === 'only') return null;
    }
    return { kind: 'follow', reason: `rebase なしの git pull は、作業ブランチ(${current})に merge の跡を残します。\`git pull --rebase\` で追従してください。いつもそうするなら \`git config pull.rebase true\` を設定します。` };
  }
  let refs = args.map((ref) => (/^@\{u(?:pstream)?\}$/.test(ref) ? ask('rev-parse', '--abbrev-ref', '--symbolic-full-name', ref) ?? '' : ref));
  if (!refs.length) refs = [ask('rev-parse', '--abbrev-ref', '--symbolic-full-name', '@{upstream}') ?? ''];
  const shared = refs.filter(Boolean).filter((ref) => remoteDefault(ref, remotes) || matches(guarded, branchOf(ref, remotes)));
  if (!shared.length) return null;
  return { kind: 'follow', reason: `追従に merge は使いません。共有のブランチ(${shared.join('、')})の変更は、作業ブランチ(${current})を rebase して取り込みます(\`git fetch\` のあと \`git rebase ${shared[0]}\`)。merge の跡が残ると、取り込むときの差分と履歴が読めなくなります。` };
}

function optionValue(words, short, long) {
  for (let k = 0; k < words.length; k += 1) {
    const word = words[k];
    if (word === short || word === long) return words[k + 1];
    if (word.startsWith(`${long}=`)) return word.slice(long.length + 1);
    if (short && word.startsWith(short) && word.length > short.length && !word.startsWith('--')) return word.slice(short.length);
  }
  return undefined;
}

// リポジトリーの書き方(OWNER/REPO、HOST/OWNER/REPO、URL)をそろえて、owner/repo にする。
const repoName = (text) => String(text).replace(/\.git$/, '').split(/[/:]/).filter(Boolean).slice(-2).join('/').toLowerCase();

function prBase(command, gh) {
  const { words, cwd, assignments } = command;
  if (words[0] !== 'gh' || words[1] !== 'pr') return null;
  const rest = words.slice(2);
  if (positional(rest, new Set(['-R', '--repo']))[0] !== 'create' || rest.includes('--help') || rest.includes('-h')) return null;
  // 作業は既定のブランチへ統合する(git の流れは trunk に固定している)。base にしてよいのは、既定のブランチだけである。
  // 既定のブランチは、GitHub に尋ねる。手元の origin/HEAD は、既定のブランチを変えたあとも古いまま残る。
  // 答えが無ければ、違う base へ導かないよう、確かめずに通す。
  let repo;
  try {
    repo = JSON.parse(gh(cwd, 'repo', 'view', '--json', 'nameWithOwner,defaultBranchRef') ?? '');
  } catch {
    return null;
  }
  const target = repo?.defaultBranchRef?.name;
  if (typeof target !== 'string' || !target) return null;
  // ほかのリポジトリーへの PR は見ない。-R と GH_REPO は、同じに読む。
  const named = optionValue(rest, '-R', '--repo') ?? assignments.GH_REPO;
  if (named && repoName(named) !== repoName(repo.nameWithOwner ?? '')) return null;
  const base = optionValue(rest, '-B', '--base') ?? target;
  if (base === target) return null;
  return { kind: 'base', reason: `この git の流れ(trunk)では、PR の base は ${target} にします。base を ${base} にする PR は作りません。` };
}

// push するブランチの、開いている PR と、その最新のコミットの workflow の実行。ブランチの名前は変数で渡す。
const CHECK_RUNS = 'commits(last:1){nodes{commit{statusCheckRollup{contexts(first:100){nodes{__typename ...on CheckRun{status checkSuite{workflowRun{databaseId workflow{name}}}}}}}}}}';

// 1 回の問い合わせで、push するブランチすべての PR を尋ねる。ブランチごとに尋ねると、数だけ待つ。
function ciRunning(request, declaration, tools) {
  const pushed = new Map();
  for (const command of simpleCommands(request.command, request.cwd)) {
    if (command.words[0] !== 'git') continue;
    const { updated, dir } = parsePush(command.words, command.cwd, declaration, tools.git);
    if (updated.length) pushed.set(dir, [...new Set([...(pushed.get(dir) ?? []), ...updated])]);
  }
  for (const [dir, branches] of pushed) {
    const names = branches.map((_, index) => `b${index}`);
    const query = `query($owner:String!,$repo:String!${names.map((name) => `,$${name}:String!`).join('')}){repository(owner:$owner,name:$repo){${names.map((name) => `${name}:pullRequests(headRefName:$${name},states:OPEN,first:1){nodes{number ${CHECK_RUNS}}}`).join(' ')}}}`;
    let found;
    try {
      found = JSON.parse(tools.gh(dir, 'api', 'graphql', '-F', 'owner={owner}', '-F', 'repo={repo}', ...branches.flatMap((branch, index) => ['-f', `${names[index]}=${branch}`]), '-f', `query=${query}`) ?? '')?.data?.repository;
    } catch {
      continue;
    }
    for (const [index, branch] of branches.entries()) {
      const pr = found?.[names[index]]?.nodes?.[0];
      const contexts = pr?.commits?.nodes?.[0]?.commit?.statusCheckRollup?.contexts?.nodes;
      if (!Array.isArray(contexts)) continue;
      const running = contexts.filter((check) => check?.__typename === 'CheckRun' && check.checkSuite?.workflowRun && check.status && check.status !== 'COMPLETED');
      if (!running.length) continue;
      const workflows = [...new Set(running.map((check) => check.checkSuite.workflowRun.workflow?.name).filter(Boolean))].join('、');
      const runs = [...new Set(running.map((check) => check.checkSuite.workflowRun.databaseId).filter(Boolean))];
      const cancel = runs.length ? `\`${runs.map((id) => `gh run cancel ${id}`).join(' && ')}\`` : '`gh run cancel`';
      return { kind: 'ci', reason: `${branch} の PR #${pr.number} で、workflow(${workflows})がまだ走っています。終わるのを待ってから push してください。もう要らない実行なら、${cancel} で止めてから push します。走っている間に push すると、同じ確かめに 2 回分の費用を払うことになります。` };
    }
  }
  return null;
}

// 単純なコマンドごとに check で止める手順を探す。オーケストレーターは、そのコマンドに了承の印があれば通す。
function stopIn(request, check) {
  for (const command of simpleCommands(request.command, request.cwd)) {
    if (!command.words.length) continue;
    const stop = check(command);
    if (!stop) continue;
    if (request.role === 'orchestrator') {
      if (command.assignments[CONFIRMED] === '1') continue;
      return { ...stop, reason: `${stop.reason} 利用者が明示して求めたときだけ、先頭に ${CONFIRMED}=1 を付けて実行し直してください。` };
    }
    return stop;
  }
  return null;
}

// 追従の merge(手元の判定)と、PR の base(GitHub に尋ねる判定)。
export function procedure(request, declaration, tools) {
  if (request.tool !== 'shell') return null;
  return stopIn(request, (command) => (command.words[0] === 'git' ? follow(command, declaration, tools.git) : null))
    ?? stopIn(request, (command) => (command.words[0] === 'gh' ? prBase(command, tools.gh) : null));
}

// ---------------------------------------------------------------- 判定

export function findings(request, declaration, tools) {
  if (request.tool === 'edit') {
    const hit = editFinding(request);
    return hit ? [hit] : [];
  }
  if (request.tool === 'connector') {
    const [, server, ...action] = String(request.name ?? '').split('__');
    return MESSAGE.test(action.join('_').toLowerCase()) ? [{ kind: 'message', target: server ?? '*' }] : [];
  }
  // 見つけた操作ごとに、それを行う単純なコマンドに了承の印(confirmed)があるかを持つ。
  const found = [];
  const commands = simpleCommands(request.command, request.cwd);
  const marked = (command) => command.assignments[CONFIRMED] === '1';
  for (const command of commands) {
    const add = (...hits) => found.push(...hits.map((hit) => ({ ...hit, confirmed: marked(command) })));
    for (const file of writtenFiles(command)) {
      const kind = fileKind(file);
      if (kind) add({ kind, target: path.basename(file) });
    }
    if (!command.words.length) continue;
    const head = command.words[0];
    if (head === 'git') add(...gitPush(command.words, command.cwd, declaration, tools.git));
    else if (head === 'gh') add(...gh(command.words, command.cwd, declaration, tools));
  }
  return found;
}

const describe = (finding) => `${KIND_LABELS[finding.kind]}${finding.target && finding.target !== '*' ? `(${finding.target})` : ''}`;
const entryOf = (finding) => `"${finding.kind}${finding.target && finding.target !== '*' ? `:${finding.target}` : ''}"`;

// ビルダーとレビュアーが回さないチェック。push と release の段階は、オーケストレーターがバッチごとに 1 回回す。
// 時間では切らない。止めるのは、プロジェクトがその段階に置いたコマンドそのものだけで、引数を足して絞った実行は通す。
// 同じコマンドを edit や commit の段階にも置いているなら、このエージェントの持ち場なので止めない。
const HEAVY_TIERS = [
  ['release', 'release の段階'],
  ['push', 'push の段階'],
];
const commandLines = (text, cwd) => simpleCommands(text, cwd).map(({ words }) => words.join(' ')).filter(Boolean);

const tierLines = (declaration, key, cwd) => (typeof declaration.checks?.[key] === 'string' ? commandLines(declaration.checks[key], cwd) : []);

function heavyChecks(declaration, cwd) {
  const tier = (key) => tierLines(declaration, key, cwd);
  const own = new Set([...tier('edit'), ...tier('commit')]);
  const heavy = new Map();
  for (const [key, label] of HEAVY_TIERS) for (const line of tier(key)) if (!own.has(line)) heavy.set(line, label);
  return heavy;
}

// 掛けるのは、ビルダーとレビュアーにだけである。長い確かめを任されたほかのサブエージェントまでは縛らない。
function pace(request, declaration) {
  if (request.tool !== 'shell' || !PACED.has(request.role)) return null;
  const heavy = heavyChecks(declaration, request.cwd);
  const hit = heavy.size ? commandLines(request.command, request.cwd).find((line) => heavy.has(line)) : undefined;
  if (hit) {
    return `\`${hit}\` は、このプロジェクトが ${heavy.get(hit)}に置いたチェックです。オーケストレーターがバッチごとに 1 回回すので、このエージェントは回しません。変更したファイルと、それに依存するテストに絞って実行してください。このチェックを回していないことは、報告に書いてください。`;
  }
  // バックグラウンドで始めると、完了を受け取れずに待つことになる。チェックかどうかは、`dotagents.jsonc` の checks のコマンドで見分ける。
  // 絞った実行も同じである。edit の段階の {file} から後ろは、ファイルごとに変わるので比べない。
  if (request.background) {
    const declared = ['edit', 'commit', 'push', 'release'].flatMap((key) => tierLines(declaration, key, request.cwd)).map((line) => line.split('{file}')[0].trim()).filter(Boolean);
    const started = commandLines(request.command, request.cwd);
    if (started.some((line) => declared.some((check) => line === check || line.startsWith(`${check} `)))) {
      return 'このエージェントは、バックグラウンドで始めた処理の完了を受け取れません。チェックは、フォアグラウンドで実行してください。';
    }
  }
  return null;
}

// ホストが渡すエージェントの名前を、判定で使うロールに直す。サブエージェントでなければオーケストレーターである。
export function roleOf({ agentId, agentType } = {}) {
  if (!agentId && !agentType) return 'orchestrator';
  const name = String(agentType ?? '').split(/[:/]/).pop().replace(/^dotagents-/, '');
  return PACED.has(name) ? name : 'worker';
}

// 1 回の判定の中では、同じ問い合わせを 1 回だけにする。push の読み取りは、確かめと止める手順の両方が使う。
function remembered(tools) {
  const memo = new Map();
  return Object.fromEntries(Object.entries(tools).map(([name, call]) => [name, (cwd, ...args) => {
    const key = JSON.stringify([name, cwd, args]);
    if (!memo.has(key)) memo.set(key, call(cwd, ...args));
    return memo.get(key);
  }]));
}

// request: { tool: 'shell' | 'edit' | 'connector', cwd, role: 'orchestrator' | 'builder' | 'reviewer' | 'worker', canAsk,
//            command, background,              … shell
//            file, after,                      … edit(after は書き換えたあとの全文。分からなければ省く)
//            name }                            … connector(道具の名前)
// 判定は 2 つに分かれる。
//
// - 手元の判定(外へ届く操作、追従の merge、署名、チェックの段階): 手元の git に、手元の時間の内で尋ねる。要る答えが
//   得られなければ、外へ届くものとして扱う(閉じる側)。gh pr merge の対象(base)だけは GitHub に尋ね、答えが無ければ
//   対象を決めず、任せた種類に当てない。
// - GitHub に尋ねる判定(CI の待ち、PR の base): 手元の判定の結果に関わらず、GitHub の時間の内で尋ねる。答えが無ければ
//   止めない(開く側)。
//
// CI の待ちは、ほかのどの判定より先に返す。了承の印でも、利用者の受け入れでも通らないからである。
export function decide(request, given) {
  const tools = remembered(given ?? runners());
  const { value: declaration } = readDeclaration(request.cwd);
  if (request.tool === 'shell') {
    const ci = ciRunning(request, declaration, tools);
    if (ci) return { decision: 'deny', kind: ci.kind, reason: ci.reason };
    const stamp = attribution(request.command, request.cwd);
    if (stamp) return { decision: 'deny', kind: 'attribution', reason: stamp };
    const slow = pace(request, declaration);
    if (slow) return { decision: 'deny', kind: 'pace', reason: slow };
    const stop = procedure(request, declaration, tools);
    if (stop) return { decision: 'deny', kind: stop.kind, reason: stop.reason };
  }
  const open = findings(request, declaration, tools).filter((finding) => !delegated(declaration.delegated, finding));
  return open.length ? outward(request, open) : null;
}

function outward(request, open) {
  // 確かめる手段の無いホストでは、モデルが会話で確かめ、了承の印を付けて実行し直す。印は、その操作を行うコマンドに付いているときだけ効く。
  const waiting = request.role === 'orchestrator' && !request.canAsk && request.tool === 'shell' ? open.filter((finding) => !finding.confirmed) : open;
  if (!waiting.length) return null;
  const unique = [...new Map(waiting.map(({ kind, target }) => [`${kind}:${target}`, { kind, target }])).values()];
  const what = unique.map(describe).join('、');
  const base = { kind: unique[0].kind, findings: unique };
  if (request.role !== 'orchestrator') {
    return { ...base, decision: 'deny', reason: `手元の外へ届く操作です: ${what}。このエージェントは行いません。オーケストレーターが行うので、行わずに報告へ書いてください。` };
  }
  const entries = unique.filter((finding) => !NEVER_DELEGATED.has(finding.kind)).map(entryOf);
  const how = entries.length ? ` 毎回の確認を省くには、プロジェクトの ${DECLARATION_PATH} の delegated に ${entries.join('、')} を足します。` : '';
  if (request.canAsk) return { ...base, decision: 'ask', reason: `手元の外へ届く操作です: ${what}。${how}` };
  return { ...base, decision: 'deny', reason: `手元の外へ届く操作です: ${what}。利用者に確かめ、了承を得てから、先頭に ${CONFIRMED}=1 を付けたシェルのコマンドで実行し直してください。${how}` };
}
