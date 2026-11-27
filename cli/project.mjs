// プロジェクトのリポジトリーに dotagents を置く、置き直す、外す。
//
// 置くものは 2 種類ある。
// - ファイルごと置くもの: 本体(.agents/dotagents/、plugin/ と同じ中身に Claude Code の marketplace の定義を足したもの)と、
//   Codex と Antigravity が読む場所に置くエージェント、スキル、ルール。中身は plugin/ から導き、手で直さない。
//   置いたファイルのハッシュとバージョンを、本体の中の記録(placed.json)に持ち、手で書き換えられたことを見つける。
// - 項目だけを足すもの: 入口の設定ファイル(.claude/settings.json、.codex/hooks.json、.agents/hooks.json)。
//   dotagents の項目だけを足し引きし、ほかの項目と書式は変えない。
//
// 読むことと組み立てをすべて済ませてから書く。読めない設定や、手で書き換えられたファイルが 1 つでもあれば、何も変えずに止める。
// 記録は最後に書く。途中で止まっても、次の sync が、新しい中身と同じファイルを手の書き換えとみなさずに続きから置き直す。

import { spawnSync } from 'node:child_process';
import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { sharedText } from '../plugin/src/context.mjs';
import { antigravityAgent, codexAgent, roles } from '../plugin/src/roles.mjs';
import { PLACED_DIR, PLACED_RECORD, PLUGIN_ROOT } from '../plugin/src/root.mjs';
import { editJsonText } from './jsontext.mjs';

const MANIFEST = JSON.parse(fs.readFileSync(path.join(PLUGIN_ROOT, '.claude-plugin', 'plugin.json'), 'utf8'));
export const VERSION = MANIFEST.version;
// 個人の環境の marketplace(dotagents)と同じ名前は、1 人の環境に 2 つ登録できないので、別の名前にする。
export const MARKETPLACE = `${MANIFEST.name}-project`;
export const PLUGIN_ID = `${MANIFEST.name}@${MARKETPLACE}`;

export const RECORD = `${PLACED_DIR}/${PLACED_RECORD}`;
export const CLAUDE_SETTINGS = '.claude/settings.json';
export const CODEX_HOOKS = '.codex/hooks.json';
export const ANTIGRAVITY_HOOKS = '.agents/hooks.json';
// Antigravity の hooks.json の中の、dotagents の組の名前。
const ANTIGRAVITY_SET = MANIFEST.name;

// 利用者に示す、止まったときの理由とその一覧。
export class StopError extends Error {
  constructor(message, details = []) {
    super(message);
    this.details = details;
  }
}

const isObject = (value) => value !== null && typeof value === 'object' && !Array.isArray(value);
const json = (value) => `${JSON.stringify(value, null, 2)}\n`;
// Windows の checkout で改行が CRLF になっても、手の書き換えとみなさない。
const digest = (content) => crypto.createHash('sha256').update(content.toString('utf8').replace(/\r\n/g, '\n')).digest('hex');

function walk(dir, prefix = '') {
  let entries;
  try {
    entries = fs.readdirSync(dir, { withFileTypes: true });
  } catch {
    return [];
  }
  return entries.sort((a, b) => a.name.localeCompare(b.name)).flatMap((entry) => {
    if (entry.name === '.DS_Store') return [];
    const rel = prefix ? `${prefix}/${entry.name}` : entry.name;
    return entry.isDirectory() ? walk(path.join(dir, entry.name), rel) : [rel];
  });
}

const readFile = (root, rel) => {
  try {
    return fs.readFileSync(path.join(root, rel));
  } catch {
    return null;
  }
};

// ---------------------------------------------------------------- 置くファイル

// hook のコマンドが本体を呼ぶ場所。Codex はサブディレクトリーから始まることがあり、Antigravity は hook の cwd が資料に無いので、
// ルートは git に求める。
const HOOK_SCRIPT = `$(git rev-parse --show-toplevel)/${PLACED_DIR}/src/hook.mjs`;
const isOurCommand = (command) => typeof command === 'string' && command.includes(`/${PLACED_DIR}/src/hook.mjs`);

// plugin/hosts/ の hook の定義から、コマンドの本体の場所だけを書き換えて導く。
function hostHooks(host, from, to) {
  const rewrite = (value) => {
    if (Array.isArray(value)) return value.map(rewrite);
    if (!isObject(value)) return value;
    return Object.fromEntries(Object.entries(value).map(([key, item]) => {
      if (key !== 'command') return [key, rewrite(item)];
      const command = item.replace(from, to);
      if (!isOurCommand(command)) throw new Error(`${host} の hook のコマンドを書き換えられない: ${item}`);
      return [key, command];
    }));
  };
  return rewrite(JSON.parse(fs.readFileSync(path.join(PLUGIN_ROOT, 'hosts', host, 'hooks.json'), 'utf8')));
}
export const codexHooks = () => hostHooks('codex', '${PLUGIN_ROOT}/src/hook.mjs', HOOK_SCRIPT).hooks;
export const antigravityHooks = () => hostHooks('antigravity', './src/hook.mjs', `"${HOOK_SCRIPT}"`)[ANTIGRAVITY_SET];

const BODY_README = `# dotagents

このディレクトリーは、\`npx @hiroiku/dotagents@latest sync\` が置いた dotagents ${VERSION} の本体です。手で編集しないでください。
更新するときは、リポジトリーのルートで同じコマンドを実行します。手で書き換えたファイルがあると、sync はどのファイルかを示して止まります。

This directory was placed by \`npx @hiroiku/dotagents@latest sync\`. Do not edit it; run the same command to update it.
`;

const RULE_FRONT = ['---', 'trigger: always_on', 'description: dotagents の既定のルール(どのエージェントにも入る部分)', '---'].join('\n');

// 置くファイル(ルートからの相対パスと中身)。
export function layout() {
  const files = new Map();
  const put = (rel, content) => files.set(rel, Buffer.isBuffer(content) ? content : Buffer.from(content));
  for (const rel of walk(PLUGIN_ROOT)) {
    if (rel !== PLACED_RECORD) put(`${PLACED_DIR}/${rel}`, fs.readFileSync(path.join(PLUGIN_ROOT, rel)));
  }
  // Claude Code は、本体を相対パスの directory の marketplace として読む。plugin はその根にある。
  put(`${PLACED_DIR}/.claude-plugin/marketplace.json`, json({
    name: MARKETPLACE,
    owner: MANIFEST.author,
    description: MANIFEST.description,
    plugins: [{ name: MANIFEST.name, source: './', description: MANIFEST.description }],
  }));
  put(`${PLACED_DIR}/README.md`, BODY_README);
  // Antigravity のワークスペースのルールは、trigger の無いファイルを読まない(資料による)。
  put('.agents/rules/dotagents.md', `${RULE_FRONT}\n\n${sharedText()}\n`);
  for (const role of roles()) {
    const antigravity = antigravityAgent(role);
    put(`.agents/agents/${antigravity.file}`, antigravity.content);
    const codex = codexAgent(role);
    put(`.codex/agents/${codex.file}`, codex.content);
  }
  // Codex と Antigravity は .agents/skills/ を読む。プロジェクトのスキルとぶつからないよう、名前に dotagents- を付ける。
  // Claude Code は、スキルを本体の plugin から読む。
  for (const rel of walk(path.join(PLUGIN_ROOT, 'skills'))) {
    const [name, ...rest] = rel.split('/');
    let content = fs.readFileSync(path.join(PLUGIN_ROOT, 'skills', rel));
    if (rest.join('/') === 'SKILL.md') {
      const text = content.toString('utf8');
      const renamed = text.replace(/^(---\n[\s\S]*?^name: )(.+)$/m, `$1${MANIFEST.name}-${name}`);
      if (renamed === text) throw new Error(`スキルの name を書き換えられない: ${rel}`);
      content = renamed;
    }
    put(`.agents/skills/${MANIFEST.name}-${name}/${rest.join('/')}`, content);
  }
  return files;
}

// ---------------------------------------------------------------- 入口の設定ファイル

function box(data, key, file) {
  data[key] ??= {};
  if (!isObject(data[key])) throw new StopError(`${file} の ${key} がオブジェクトではありません。`);
  return data[key];
}

// 入れ物から指定した名前を外す。外して空になったときだけ、入れ物ごと外す。
function prune(data, key, name) {
  if (!isObject(data[key]) || !Object.hasOwn(data[key], name)) return;
  delete data[key][name];
  if (!Object.keys(data[key]).length) delete data[key];
}

const groupIsOurs = (group) => isObject(group) && [group.command, ...(Array.isArray(group.hooks) ? group.hooks.map((hook) => hook?.command) : [])].some(isOurCommand);

// イベントごとの配列の中で、dotagents の組だけを置き換える。最初の dotagents の組があった位置に置き、無ければ末尾に足す。
function replaceGroups(data, key, ours, file) {
  if (data[key] !== undefined && !isObject(data[key])) throw new StopError(`${file} の ${key} がオブジェクトではありません。`);
  const events = data[key] ?? {};
  for (const event of new Set([...Object.keys(events), ...Object.keys(ours)])) {
    const groups = events[event] ?? [];
    if (!Array.isArray(groups)) throw new StopError(`${file} の ${key}.${event} が配列ではありません。`);
    const first = groups.findIndex(groupIsOurs);
    const kept = groups.filter((group) => !groupIsOurs(group));
    const at = first < 0 ? kept.length : groups.slice(0, first).filter((group) => !groupIsOurs(group)).length;
    const next = [...kept.slice(0, at), ...(ours[event] ?? []), ...kept.slice(at)];
    if (next.length) events[event] = next;
    else delete events[event];
  }
  if (Object.keys(events).length) data[key] = events;
  else delete data[key];
}

// 設定ファイルごとの、dotagents の項目の書き換え。install が偽なら、dotagents の項目を外す。
export const ENTRIES = {
  [CLAUDE_SETTINGS]: (data, install) => {
    if (!install) {
      prune(data, 'enabledPlugins', PLUGIN_ID);
      prune(data, 'extraKnownMarketplaces', MARKETPLACE);
      return;
    }
    // 相対パスの directory の marketplace は、その場で読まれる。各人のインストールは要らない(資料による)。
    box(data, 'extraKnownMarketplaces', CLAUDE_SETTINGS)[MARKETPLACE] = { source: { source: 'directory', path: `./${PLACED_DIR}` } };
    box(data, 'enabledPlugins', CLAUDE_SETTINGS)[PLUGIN_ID] = true;
  },
  [CODEX_HOOKS]: (data, install) => replaceGroups(data, 'hooks', install ? codexHooks() : {}, CODEX_HOOKS),
  [ANTIGRAVITY_HOOKS]: (data, install) => {
    if (install) data[ANTIGRAVITY_SET] = antigravityHooks();
    else delete data[ANTIGRAVITY_SET];
  },
};

function entryChanges(root, install, changes) {
  for (const [rel, edit] of Object.entries(ENTRIES)) {
    const now = readFile(root, rel)?.toString('utf8') ?? null;
    let text;
    try {
      text = editJsonText(now, (data) => edit(data, install), rel);
    } catch (error) {
      throw new StopError(`${error.message} このファイルを直してから、実行し直してください。何も変えていません。`);
    }
    if (text !== now) changes.set(rel, text === null ? null : Buffer.from(text));
  }
}

// ---------------------------------------------------------------- 記録と、手の書き換えの検出

function readRecord(root, { force = false } = {}) {
  const content = readFile(root, RECORD);
  if (content === null) return null;
  try {
    const record = JSON.parse(content.toString('utf8'));
    if (!isObject(record) || !isObject(record.files)) throw new Error('files がありません');
    return record;
  } catch (error) {
    if (force) return null;
    throw new StopError(`${RECORD} を読めません(${error.message})。手で書き換えられています。上書きしてよければ、--force を付けて実行し直してください。何も変えていません。`);
  }
}

const recordOf = (files) => json({ version: VERSION, files: Object.fromEntries([...files].sort(([a], [b]) => a.localeCompare(b)).map(([rel, content]) => [rel, digest(content)])) });

// 手で書き換えられたファイル。新しいバージョンの中身と同じファイルは、続きから置き直すために、書き換えとみなさない。
export function findEdits(root, record, next) {
  const edits = [];
  const known = isObject(record?.files) ? record.files : {};
  for (const [rel, hash] of Object.entries(known)) {
    const now = readFile(root, rel);
    if (now === null) {
      if (next.has(rel)) edits.push({ kind: '削除', rel });
      continue;
    }
    if (digest(now) !== hash && !(next.has(rel) && digest(now) === digest(next.get(rel)))) edits.push({ kind: '変更', rel });
  }
  for (const [rel, content] of next) {
    if (Object.hasOwn(known, rel)) continue;
    const now = readFile(root, rel);
    if (now !== null && digest(now) !== digest(content)) edits.push({ kind: '既存', rel });
  }
  for (const rel of walk(path.join(root, PLACED_DIR)).map((name) => `${PLACED_DIR}/${name}`)) {
    if (rel !== RECORD && !Object.hasOwn(known, rel) && !next.has(rel)) edits.push({ kind: '追加', rel });
  }
  return edits.sort((a, b) => a.rel.localeCompare(b.rel));
}

// ---------------------------------------------------------------- 書き込み

function apply(root, changes) {
  const summary = [];
  const order = [...changes.keys()].filter((rel) => rel !== RECORD).sort();
  if (changes.has(RECORD)) order.push(RECORD);
  for (const rel of order) {
    const file = path.join(root, rel);
    const content = changes.get(rel);
    const existed = fs.existsSync(file);
    if (content === null) {
      if (!existed) continue;
      fs.rmSync(file);
      // 消して空になったディレクトリーも消す。ルートと、ほかのファイルがあるディレクトリーは残す。
      for (let dir = path.dirname(file); dir !== root && dir.startsWith(root); dir = path.dirname(dir)) {
        try {
          fs.rmdirSync(dir);
        } catch {
          break;
        }
      }
      summary.push({ action: '削除', rel });
    } else {
      fs.mkdirSync(path.dirname(file), { recursive: true });
      fs.writeFileSync(file, content);
      summary.push({ action: existed ? '更新' : '追加', rel });
    }
  }
  return summary.sort((a, b) => a.rel.localeCompare(b.rel));
}

// ---------------------------------------------------------------- コマンド

// hook は git で求めたルートから本体を呼ぶので、置く場所は git のリポジトリーのルートに限る。
export function projectRoot(dir) {
  const resolved = path.resolve(dir);
  if (!fs.statSync(resolved, { throwIfNoEntry: false })?.isDirectory()) throw new StopError(`${resolved} はディレクトリーではありません。`);
  const result = spawnSync('git', ['rev-parse', '--show-toplevel'], { cwd: resolved, encoding: 'utf8' });
  if (result.error) throw new StopError('git を実行できません。git をインストールしてから、実行し直してください。');
  if (result.status !== 0) throw new StopError(`${resolved} は git のリポジトリーではありません。リポジトリーのルートを指定してください。`);
  const top = fs.realpathSync(result.stdout.trim());
  if (top !== fs.realpathSync(resolved)) throw new StopError(`${resolved} はリポジトリーのルートではありません。ルート(${top})を指定してください。`);
  return resolved;
}

export function sync(dir, { force = false } = {}) {
  const root = projectRoot(dir);
  const record = readRecord(root, { force });
  const next = layout();
  const edits = findEdits(root, record, next);
  if (edits.length && !force) {
    throw new StopError('dotagents が置いたファイルのうち、手で書き換えられたものがあります。置き直すと、その書き換えは失われます。上書きしてよければ、--force を付けて実行し直してください。何も変えていません。', edits);
  }
  const changes = new Map();
  for (const [rel, content] of next) {
    const now = readFile(root, rel);
    if (now === null || !now.equals(content)) changes.set(rel, content);
  }
  // 新しいバージョンに無いファイルを消す。--force のときは、本体のディレクトリーに足されたファイルも消し、丸ごと置き換える。
  const stale = [...Object.keys(record?.files ?? {}), ...(force ? edits.filter((edit) => edit.kind === '追加').map((edit) => edit.rel) : [])];
  for (const rel of stale) if (!next.has(rel)) changes.set(rel, null);
  entryChanges(root, true, changes);
  const recordText = recordOf(next);
  if (readFile(root, RECORD)?.toString('utf8') !== recordText) changes.set(RECORD, Buffer.from(recordText));
  return { root, from: record?.version ?? null, to: VERSION, changes: apply(root, changes) };
}

export function remove(dir) {
  const root = projectRoot(dir);
  const record = readRecord(root);
  const changes = new Map();
  for (const rel of Object.keys(record?.files ?? {})) changes.set(rel, null);
  entryChanges(root, false, changes);
  if (record) changes.set(RECORD, null);
  const summary = apply(root, changes);
  // 記録に無いファイル(手で足したもの)は消さずに残し、知らせる。
  const left = walk(path.join(root, PLACED_DIR)).map((rel) => `${PLACED_DIR}/${rel}`);
  return { root, from: record?.version ?? null, changes: summary, left };
}
