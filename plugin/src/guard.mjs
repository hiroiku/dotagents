// 道具の呼び出しを、実行の前に判定する。3 つのホストの受け口が、同じこの関数を呼ぶ。
//
// 返すのは次のどれかである。
//   null                         通す
//   { decision: 'deny', … }      止めて、理由をモデルへ返す
//   { decision: 'ask', … }       利用者に確かめる(確かめる手段のあるホストでだけ返す)
//
// 確かめるのは、手元の外へ届く操作と、確かめる線そのものを動かす操作だけにする。プロジェクトが宣言で
// 任せた種類は通す。読めない形は通す。判定の誤りで、作業そのものを止めないためである。
// これは誤りを防ぐ仕掛けで、隔離ではない。スクリプトの中に隠した操作までは読まない。

import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { attribution } from './attribution.mjs';
import { DECLARATION, list, parseDeclaration, policyOf, readDeclaration } from './declaration.mjs';
import { simpleCommands } from './shell.mjs';
import { chosenStyles } from './style.mjs';

export const CONFIRMED = 'DOTAGENTS_CONFIRMED';

// 外へ届ける動詞。道具の名前ではなく動詞で読むので、道具ごとの決まりをほとんど持たない。
const RELEASE_VERBS = new Set(['publish', 'release']);
const DEPLOY_VERBS = new Set(['deploy', 'promote', 'rollback', 'destroy']);
// 動詞が一般的な語(apply、up、push)になる道具だけは、名前で持つ。
const NAMED = {
  terraform: { deploy: ['apply'] },
  tofu: { deploy: ['apply'] },
  pulumi: { deploy: ['up'] },
  kubectl: { deploy: ['apply', 'delete', 'replace', 'patch'] },
  helm: { deploy: ['install', 'upgrade', 'uninstall'] },
  docker: { release: ['push'] },
  podman: { release: ['push'] },
};
// script を名前で呼ぶ道具。`run` は省けるものがある。
const RUNNERS = new Set(['npm', 'pnpm', 'yarn', 'bun', 'make', 'just', 'task', 'mise', 'turbo', 'nx', 'deno']);
// script の名前にこの語があれば、外へは出さない確かめか、手元のビルドである。
const HARMLESS_SCRIPT = new Set(['dry', 'check', 'test', 'lint', 'verify', 'plan', 'diff', 'status', 'validate', 'build']);
// 動詞と同じ語を、引数(ファイル名や検索する語)として取る道具。ここに無い道具は、確かめる側に倒れる。
const TAKES_WORDS = new Set(['cat', 'ls', 'cd', 'grep', 'rg', 'find', 'fd', 'echo', 'printf', 'mkdir', 'rm', 'cp', 'mv', 'touch', 'test', '[', 'head', 'tail', 'wc', 'sed', 'awk', 'open', 'code', 'tree', 'du', 'stat', 'diff', 'which', 'type', 'man', 'export', 'git', 'gh']);
const DRY = new Set(['--dry-run', '--dry', '--help', '-h', '--check', '--list', 'plan', 'diff', 'status', 'list', 'logs', 'view']);
const ENVIRONMENTS = { production: 'production', prod: 'production', staging: 'staging', stg: 'staging', preview: 'preview', development: 'development', dev: 'development', local: 'local' };
// 書き込む文の形。語だけでは、列の名前や別の道具の引数と区別できない。
const SQL_WRITES = /\b(?:insert\s+(?:or\s+\w+\s+)?into|update\s+[\w."`[\]]+\s+set|delete\s+from|drop\s+(?:table|index|view|trigger)|alter\s+table|create\s+(?:unique\s+|virtual\s+)?(?:table|index|view|trigger)|replace\s+into|truncate\s+table)\b/i;
// 守るファイルを書き換える道具。これ以外は、読むだけとして通す。
const WRITERS = new Set(['sed', 'tee', 'cp', 'mv', 'rm', 'ln', 'truncate', 'dd', 'perl', 'install', 'rsync', 'patch', 'ed']);
// 作る役がバックグラウンドで始めると、完了を受け取れずに待つことになる処理。
const CHECKS = /\b(?:test|tests|spec|check|lint|verify|typecheck|tsc|build|e2e|vitest|jest|playwright|pytest)\b/;
// 人へ届くコネクターの操作。
const MESSAGE = /(?:^|[_-])(?:send|reply|forward|share|post|publish|invite|respond)(?:[_-]|$)/;

export const KIND_LABELS = {
  push: '共有のブランチへの push',
  rewrite: '共有のブランチの書き換えか削除',
  tag: 'tag の push',
  merge: 'PR のマージ',
  bypass: 'ブランチの保護を飛ばすマージ',
  release: '公開(リリースやパッケージ)',
  deploy: '配備',
  remote: '手元の外にあるデータや秘密への書き込み',
  settings: 'リポジトリーの設定の変更',
  workflow: 'workflow の起動',
  message: '人への連絡や共有',
  project: 'プロジェクトが外へ届くと宣言した操作',
  instructions: '指示ファイル(AGENTS.md、CLAUDE.md)の書き換え',
  policy: '確かめる線(プロジェクトの宣言)の書き換え',
};
const PACED = new Set(['builder', 'reviewer']);
// 任せられない種類。線そのものを動かすか、保護を外す操作である。
const NEVER_DELEGATED = new Set(['rewrite', 'bypass', 'policy']);

const run = (file) => (cwd, ...args) => {
  try {
    return execFileSync(file, args, { cwd, encoding: 'utf8', timeout: 4000, stdio: ['ignore', 'pipe', 'ignore'] }).trim();
  } catch {
    return null;
  }
};

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
// 本番のブランチがこの名前で残っていることが多く、宣言を書くまで、そこへの push が確かめなしで通っていた。
const CONVENTIONAL = ['main', 'master'];

// 選んだ流の値。流ごとの共有のブランチの既定を、流の部品(styles/)から読む。
export function styleValues(declaration) {
  const { chosen } = chosenStyles(declaration);
  const values = Object.assign({}, ...chosen.map((style) => style.values));
  const flow = chosen.find((style) => style.axis === 'git')?.name ?? null;
  return { flow, shared: list(values.shared) };
}

// 共有のブランチ。リモートの既定のブランチ、main と master、選んだ流の既定、宣言の protected を合わせる。
function guardedBranches(dir, remote, declaration, git) {
  const head = git(dir, 'symbolic-ref', '-q', '--short', `refs/remotes/${remote}/HEAD`);
  const defaults = head ? [head.slice(remote.length + 1)] : CONVENTIONAL;
  return { defaults, guarded: [...new Set([...defaults, ...CONVENTIONAL, ...styleValues(declaration).shared, ...list(declaration.protected)])] };
}

// git の前に付く大域の指定を外し、下位のコマンドと、それが動く場所と、残りの語を返す。
function gitCommand(words, cwd) {
  let dir = cwd;
  let i = 1;
  while (i < words.length && words[i].startsWith('-')) {
    if (words[i] === '-C') dir = path.resolve(dir, words[i + 1] ?? '.');
    i += words[i] === '-C' || words[i] === '-c' ? 2 : 1;
  }
  return { dir, sub: words[i], rest: words.slice(i + 1) };
}

const isLocalRemote = (dir, remote, git) => /^(?:\/|\.{1,2}\/|file:)/.test(git(dir, 'remote', 'get-url', remote) ?? remote);

// push を読み、外へ届く操作(found)と、書き換えて残すブランチ(updated)を返す。
function parsePush(words, cwd, declaration, git) {
  const none = { found: [], updated: [] };
  const { dir, sub, rest } = gitCommand(words, cwd);
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
  if (isLocalRemote(dir, remote, git)) return none;
  const force = flags.has('--force') || flags.has('-f') || flags.has('--force-with-lease') || flags.has('--force-if-includes');
  const remove = flags.has('--delete') || flags.has('-d');
  const { defaults, guarded } = guardedBranches(dir, remote, declaration, git);
  const current = () => git(dir, 'symbolic-ref', '-q', '--short', 'HEAD');
  const found = [];
  const updated = [];
  const branch = (name, rewrites, removes = false) => {
    if (!name) return;
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
    const upstream = name && git(dir, 'rev-parse', '--abbrev-ref', '--symbolic-full-name', `${name}@{upstream}`);
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
    if (target === 'HEAD' || target === '@') target = current() ?? target;
    if (target.startsWith('refs/tags/')) {
      found.push({ kind: 'tag', target: target.slice(10) });
      continue;
    }
    if (target.startsWith('refs/heads/')) target = target.slice(11);
    // 守るブランチの名前でなければ、tag かどうかを git に尋ねる。答えが無いときは、版の番号の形なら tag として読む。
    const named = at < 0 && !matches(guarded, target) && (git(dir, 'rev-parse', '-q', '--verify', `refs/tags/${target}`) || /^(?:[\w.-]+\/)?v?\d+\.\d+/.test(target));
    if (named && !git(dir, 'rev-parse', '-q', '--verify', `refs/heads/${target}`)) found.push({ kind: 'tag', target });
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
    return matches(guardedBranches(cwd, 'origin', declaration, git).guarded, ref[2]) ? [{ kind: 'rewrite', target: ref[2] }] : [];
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

// ---------------------------------------------------------------- 配備と公開

function environment(words, assignments) {
  for (let i = 0; i < words.length; i += 1) {
    const word = words[i];
    if (word === '--prod' || word === '--production') return 'production';
    if (word === '--local') return 'local';
    const value = ['--env', '-e', '--environment', '--stage'].includes(word) ? words[i + 1] : word.match(/^--(?:env|environment|stage)=(.+)$/)?.[1];
    if (value) return ENVIRONMENTS[value.toLowerCase()] ?? value;
  }
  for (const value of Object.values(assignments)) if (ENVIRONMENTS[value.toLowerCase()]) return ENVIRONMENTS[value.toLowerCase()];
  for (const word of words.slice(1)) {
    for (const token of word.split(/[:_-]/)) if (ENVIRONMENTS[token.toLowerCase()]) return ENVIRONMENTS[token.toLowerCase()];
  }
  return null;
}

const kindOf = (verb) => (RELEASE_VERBS.has(verb) ? 'release' : DEPLOY_VERBS.has(verb) ? 'deploy' : null);
const isFile = (word) => /[./]/.test(word ?? '');

function outwardVerb(words, assignments, text) {
  const head = words[0];
  if (TAKES_WORDS.has(head) || words.some((word) => DRY.has(word))) return [];
  const bare = words.filter((word) => !word.startsWith('-'));
  const found = (kind, fallback) => {
    const target = environment(words, assignments) ?? fallback;
    return target === 'local' ? [] : [{ kind, target }];
  };
  for (const [kind, verbs] of Object.entries(NAMED[head] ?? {})) if (verbs.includes(bare[1])) return found(kind, '*');
  if (head === 'wrangler') {
    if (bare.includes('secret') && bare.some((word) => ['put', 'delete', 'bulk'].includes(word))) return found('remote', 'production');
    if (words.includes('--remote')) {
      // 問い合わせの文がその場に書かれていればその文を、変数で渡されていればコマンドの全体を読む。
      // ファイルで渡された文は読めないので、書き込みとして扱う。
      const at = words.indexOf('--command');
      const sql = at >= 0 ? words[at + 1] : words.find((word) => word.startsWith('--command='))?.slice(10);
      const scope = sql === undefined ? null : sql.includes('$') ? text : sql;
      const writes = bare.some((word) => ['apply', 'put', 'delete', 'bulk', 'import', 'restore'].includes(word)) || (bare.includes('execute') && (scope === null || SQL_WRITES.test(scope)));
      if (writes) return found('remote', 'production');
    }
  }
  if (RUNNERS.has(head)) {
    const script = bare[1] === 'run' || bare[1] === 'x' ? bare[2] : bare[1];
    const tokens = (script ?? '').split(/[:_-]/);
    if (tokens.some((token) => HARMLESS_SCRIPT.has(token))) return [];
    const kind = tokens.map(kindOf).find(Boolean);
    return kind ? found(kind, '*') : [];
  }
  // 動詞は下位のコマンドとして読む。スクリプトのファイルに渡す引数としては読まない。
  const kind = kindOf(bare[1]) ?? (isFile(bare[1]) ? null : kindOf(bare[2]));
  return kind ? found(kind, head === 'wrangler' || head === 'vercel' ? 'production' : '*') : [];
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
// 追従の merge と PR の base は、利用者が明示して求めたときに、進める役が了承の印を付けて実行し直せる。
// CI の待ちは、利用者に確かめない。待つか、要らない実行を止めるかは、役が決められるからである。

export const PROCEDURE_LABELS = {
  follow: '追従の merge',
  base: '既定のブランチでも流が共有するブランチでもない PR の base',
  ci: 'CI が走っている間の push',
};

// merge と pull で、値を 1 つ取る指定。
const GIT_VALUED = new Set(['-m', '-s', '-X', '-F', '--file', '--strategy', '--strategy-option', '--into-name', '--cleanup', '--depth', '--deepen', '--shallow-since', '--shallow-exclude', '-j', '--jobs', '--upload-pack', '-o', '--server-option', '--negotiation-tip']);
const REBASING = /^(?:true|merges|interactive|i|m|preserve|p)$/;

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

function follow(command, declaration, git) {
  const { dir, sub, rest } = gitCommand(command.words, command.cwd);
  if (sub !== 'merge' && sub !== 'pull') return null;
  const flag = (...names) => rest.find((word) => names.includes(word.split('=')[0]));
  if (flag('--abort', '--continue', '--quit', '--skip', '--ff-only', '--help', '-h')) return null;
  const current = git(dir, 'symbolic-ref', '-q', '--short', 'HEAD');
  if (!current) return null;
  const args = positional(rest, GIT_VALUED);
  const remotes = (git(dir, 'remote') ?? 'origin').split('\n').filter(Boolean);
  const remote = sub === 'pull' && args[0] ? args[0] : 'origin';
  const { guarded } = guardedBranches(dir, remote, declaration, git);
  // 共有のブランチの上で、作業ブランチを取り込む merge は、統合そのものなので止めない。
  if (matches(guarded, current)) return null;
  if (sub === 'pull') {
    const rebase = flag('--rebase', '-r');
    if (rebase && !/=false$/.test(rebase)) return null;
    if (!rebase && !flag('--no-rebase')) {
      const config = (key) => git(dir, 'config', '--get', key) ?? '';
      if (REBASING.test(config(`branch.${current}.rebase`) || config('pull.rebase')) || config('pull.ff') === 'only') return null;
    }
    return { kind: 'follow', reason: `rebase なしの git pull は、作業ブランチ(${current})に merge の跡を残します。\`git pull --rebase\` で追従してください。いつもそうするなら \`git config pull.rebase true\` を設定します。` };
  }
  let refs = args.map((ref) => (/^@\{u(?:pstream)?\}$/.test(ref) ? git(dir, 'rev-parse', '--abbrev-ref', '--symbolic-full-name', ref) ?? '' : ref));
  if (!refs.length) refs = [git(dir, 'rev-parse', '--abbrev-ref', '--symbolic-full-name', '@{upstream}') ?? ''];
  const shared = refs.filter(Boolean).filter((ref) => matches(guarded, branchOf(ref, remotes)));
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

function prBase(command, declaration, git) {
  const { words, cwd } = command;
  if (words[0] !== 'gh' || words[1] !== 'pr' || words[2] !== 'create') return null;
  const rest = words.slice(3);
  if (rest.includes('--help') || rest.includes('-h') || optionValue(rest, '-R', '--repo')) return null;
  // どの流も、作業は既定のブランチへ統合する。ほかに base にしてよいのは、流が共有するブランチ(release/*)だけである。
  const { flow, shared } = styleValues(declaration);
  if (!flow) return null;
  const target = git(cwd, 'symbolic-ref', '-q', '--short', 'refs/remotes/origin/HEAD')?.replace(/^origin\//, '') ?? null;
  const base = optionValue(rest, '-B', '--base') ?? target;
  if (!base || !target || base === target || matches(shared, base)) return null;
  const others = shared.length ? `(ほかに通すのは ${shared.join('、')})` : '';
  return { kind: 'base', reason: `この git の流れ(${flow})では、PR の base は ${target} にします${others}。base を ${base} にする PR は作りません。` };
}

function ciRunning(command, declaration, tools) {
  const { updated, dir } = parsePush(command.words, command.cwd, declaration, tools.git);
  for (const branch of new Set(updated)) {
    let pr;
    try {
      pr = JSON.parse(tools.gh(dir, 'pr', 'view', branch, '--json', 'number,state,statusCheckRollup') ?? '');
    } catch {
      continue;
    }
    if (pr?.state !== 'OPEN' || !Array.isArray(pr.statusCheckRollup)) continue;
    const running = pr.statusCheckRollup.filter((check) => check?.__typename === 'CheckRun' && check.workflowName && check.status && check.status !== 'COMPLETED');
    if (!running.length) continue;
    const names = [...new Set(running.map((check) => check.workflowName))].join('、');
    const runs = [...new Set(running.map((check) => String(check.detailsUrl ?? '').match(/\/actions\/runs\/(\d+)/)?.[1]).filter(Boolean))];
    const cancel = runs.length ? `\`${runs.map((id) => `gh run cancel ${id}`).join(' && ')}\`` : '`gh run cancel`';
    return { kind: 'ci', reason: `${branch} の PR #${pr.number} で、workflow(${names})がまだ走っています。終わるのを待ってから push してください。もう要らない実行なら、${cancel} で止めてから push します。走っている間に push すると、同じ確かめに 2 回分の費用を払うことになります。` };
  }
  return null;
}

export function procedure(request, declaration, tools) {
  if (request.tool !== 'shell') return null;
  for (const command of simpleCommands(request.command, request.cwd)) {
    if (!command.words.length) continue;
    const head = command.words[0];
    const stop = head === 'git' ? follow(command, declaration, tools.git) ?? ciRunning(command, declaration, tools) : head === 'gh' ? prBase(command, declaration, tools.git) : null;
    if (!stop) continue;
    if (stop.kind !== 'ci' && request.role === 'lead') {
      if (command.assignments[CONFIRMED] === '1') continue;
      return { ...stop, reason: `${stop.reason} 利用者が明示して求めたときだけ、先頭に ${CONFIRMED}=1 を付けて実行し直してください。` };
    }
    return stop;
  }
  return null;
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
  const found = [];
  const project = list(declaration.outward).flatMap((source) => {
    try {
      return [new RegExp(source)];
    } catch {
      return [];
    }
  });
  if (project.some((pattern) => pattern.test(request.command))) found.push({ kind: 'project', target: '*' });
  for (const command of simpleCommands(request.command, request.cwd)) {
    for (const file of writtenFiles(command)) {
      const kind = fileKind(file);
      if (kind) found.push({ kind, target: path.basename(file) });
    }
    if (!command.words.length) continue;
    const head = command.words[0];
    if (head === 'git') found.push(...gitPush(command.words, command.cwd, declaration, tools.git));
    else if (head === 'gh') found.push(...gh(command.words, command.cwd, declaration, tools));
    else found.push(...outwardVerb(command.words, command.assignments, request.command));
  }
  return found;
}

const describe = (finding) => `${KIND_LABELS[finding.kind]}${finding.target && finding.target !== '*' ? `(${finding.target})` : ''}`;
const entryOf = (finding) => `"${finding.kind}${finding.target && finding.target !== '*' ? `:${finding.target}` : ''}"`;

// 作る役と確かめる役が回さない検査。push と版の段は、進める役が束ごとに 1 回回す。
// 時間では切らない。止めるのは、プロジェクトがその段に置いたコマンドそのものだけで、引数を足して絞った実行は通す。
// 同じコマンドを編集やコミットの段にも置いているなら、この役の持ち場なので止めない。
const HEAVY_TIERS = [
  ['release', '版の段'],
  ['push', 'push の段'],
];
const commandLines = (text, cwd) => simpleCommands(text, cwd).map(({ words }) => words.join(' ')).filter(Boolean);

function heavyChecks(declaration, cwd) {
  const tier = (key) => (typeof declaration.checks?.[key] === 'string' ? commandLines(declaration.checks[key], cwd) : []);
  const own = new Set([...tier('edit'), ...tier('commit')]);
  const heavy = new Map();
  for (const [key, label] of HEAVY_TIERS) for (const line of tier(key)) if (!own.has(line)) heavy.set(line, label);
  return heavy;
}

// 掛けるのは、作る役と確かめる役にだけである。長い確かめを任された別の役までは縛らない。
function pace(request, declaration) {
  if (request.tool !== 'shell' || !PACED.has(request.role)) return null;
  const heavy = heavyChecks(declaration, request.cwd);
  const hit = heavy.size ? commandLines(request.command, request.cwd).find((line) => heavy.has(line)) : undefined;
  if (hit) {
    return `\`${hit}\` は、このプロジェクトが ${heavy.get(hit)}に置いた検査です。進める役が束ごとに 1 回回すので、この役は回しません。変更したファイルと、それに依存するテストに絞って実行してください。この検査を回していないことは、報告に書いてください。`;
  }
  if (request.background && CHECKS.test(request.command)) {
    return 'この役は、バックグラウンドで始めた処理の完了を受け取れません。検査は、フォアグラウンドで実行してください。';
  }
  return null;
}

// ホストが渡す役の名前を、判定で使う役に直す。サブエージェントでなければ進める役である。
export function roleOf({ agentId, agentType } = {}) {
  if (!agentId && !agentType) return 'lead';
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

// request: { tool: 'shell' | 'edit' | 'connector', cwd, role: 'lead' | 'builder' | 'reviewer' | 'worker', canAsk,
//            command, background,              … shell
//            file, after,                      … edit(after は書き換えたあとの全文。分からなければ省く)
//            name }                            … connector(道具の名前)
export function decide(request, given = { git: run('git'), gh: run('gh') }) {
  const tools = remembered(given);
  const { value: declaration } = readDeclaration(request.cwd);
  if (request.tool === 'shell') {
    const stamp = attribution(request.command, request.cwd);
    if (stamp) return { decision: 'deny', kind: 'attribution', reason: stamp };
    const slow = pace(request, declaration);
    if (slow) return { decision: 'deny', kind: 'pace', reason: slow };
    const stop = procedure(request, declaration, tools);
    if (stop) return { decision: 'deny', kind: stop.kind, reason: stop.reason };
  }
  const open = findings(request, declaration, tools).filter((finding) => !delegated(declaration.delegated, finding));
  if (!open.length) return null;
  const unique = [...new Map(open.map((finding) => [`${finding.kind}:${finding.target}`, finding])).values()];
  const what = unique.map(describe).join('、');
  const base = { kind: unique[0].kind, findings: unique };
  if (request.role !== 'lead') {
    return { ...base, decision: 'deny', reason: `手元の外へ届く操作です: ${what}。この役は行いません。進める役が行うので、行わずに報告へ書いてください。` };
  }
  const entries = unique.filter((finding) => !NEVER_DELEGATED.has(finding.kind)).map(entryOf);
  const how = entries.length ? ` 毎回の確認を省くには、プロジェクトの宣言(${DECLARATION_PATH})の delegated に ${entries.join('、')} を足します。` : '';
  if (request.canAsk) return { ...base, decision: 'ask', reason: `手元の外へ届く操作です: ${what}。${how}` };
  // 確かめる手段の無いホストでは、モデルが会話で確かめ、了承の印を付けて実行し直す。
  if (request.tool === 'shell' && simpleCommands(request.command, request.cwd).some((command) => command.assignments[CONFIRMED] === '1')) return null;
  return { ...base, decision: 'deny', reason: `手元の外へ届く操作です: ${what}。利用者に確かめ、了承を得てから、先頭に ${CONFIRMED}=1 を付けたシェルのコマンドで実行し直してください。${how}` };
}
