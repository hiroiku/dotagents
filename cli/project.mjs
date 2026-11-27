// プロジェクトのリポジトリーに dotagents を置く、置き直す、外す。
//
// 置くものは 2 種類ある。
// - ファイルごと置くもの: 本体(.agents/dotagents/。hook の入口と schema)と、各ホストが読む場所に置くエージェント、スキル、
//   ルール(Claude Code は .claude/、Codex は .codex/、Antigravity は .agents/)。中身は plugin/ から導き、手で直さない。置いたファイルのハッシュとバージョンを、本体の中の記録(placed.json)に持ち、
//   手で書き換えられたことを見つける。
// - 項目だけを足すもの: 入口の設定ファイル(.claude/settings.json、.codex/hooks.json、.agents/hooks.json)と、.gitattributes。
//   dotagents の項目だけを足し引きし、ほかの項目と書式は変えない。
//
// 読むことと組み立てをすべて済ませてから書く。読めない設定や、手で書き換えられたファイルが 1 つでもあれば、何も変えずに止める。
// 記録は最後に書く。途中で止まっても、次の sync が、新しい中身と同じファイルを手の書き換えとみなさずに続きから置き直す。

import { spawnSync } from 'node:child_process';
import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { sharedText } from '../plugin/src/context.mjs';
import { antigravityAgent, claudeAgent, codexAgent, roles } from '../plugin/src/roles.mjs';
import { BUNDLE_FILE, PLACED_DIR, PLACED_RECORD, PLUGIN_ROOT } from '../plugin/src/root.mjs';
import { nameSkills } from '../plugin/src/skills.mjs';
import { list } from '../plugin/src/declaration.mjs';
import { parseJsonc } from '../plugin/src/jsonc.mjs';
import { editJsonText } from './jsontext.mjs';
import { removeTopLevel, setTopLevelString } from './jsonctext.mjs';
import { dropTables, TomlShapeError } from './tomltext.mjs';

const MANIFEST = JSON.parse(fs.readFileSync(path.join(PLUGIN_ROOT, '.claude-plugin', 'plugin.json'), 'utf8'));
export const VERSION = MANIFEST.version;
// 9.2.0 までは、Claude Code に本体を、この名前の directory の marketplace の plugin として読ませていた。Claude Code は
// marketplace の名前を利用者のプロファイル全体で 1 つの登録として持つので、同じ名前を持つ別のリポジトリーや worktree の本体を
// 読み合った。いまは置かないが、sync と remove は、残った項目を .claude/settings.json から外す。
export const MARKETPLACE = `${MANIFEST.name}-project`;
export const PLUGIN_ID = `${MANIFEST.name}@${MARKETPLACE}`;

export const RECORD = `${PLACED_DIR}/${PLACED_RECORD}`;
export const CLAUDE_SETTINGS = '.claude/settings.json';
export const CODEX_HOOKS = '.codex/hooks.json';
export const ANTIGRAVITY_HOOKS = '.agents/hooks.json';
export const CODEX_CONFIG = '.codex/config.toml';
export const DECLARATION_FILE = '.agents/dotagents.jsonc';
// 設定ファイルの $schema に書く、置いた本体の schema の場所(設定ファイルからの相対パス)。置いたバージョンと schema がずれない。
export const SCHEMA_REF = `./${path.posix.relative(path.posix.dirname(DECLARATION_FILE), `${PLACED_DIR}/schema/dotagents.schema.json`)}`;
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
// ルートは git に求める。Claude Code は、起動したディレクトリーを $CLAUDE_PROJECT_DIR で渡す。サブディレクトリーで起動すると、
// $CLAUDE_PROJECT_DIR はそのサブディレクトリーになり、ルートの .claude/settings.local.json の hook は動く(2.1.332 で確かめた。
// .claude/settings.json の hook は動かなかった)。どの設定から動いても本体を見つけられるよう、$CLAUDE_PROJECT_DIR を起点に、
// ルートを git に求める。hook の cwd は、セッションの中の cd で動くので起点にしない。
const HOOK_SCRIPT = `$(git rev-parse --show-toplevel)/${PLACED_DIR}/${BUNDLE_FILE}`;
const CLAUDE_HOOK_SCRIPT = `$(git -C "$CLAUDE_PROJECT_DIR" rev-parse --show-toplevel)/${PLACED_DIR}/${BUNDLE_FILE}`;
const callsHook = (command, script) => typeof command === 'string' && command.includes(`/${PLACED_DIR}/${script}`);
// 9.1.0 までは、本体の src/hook.mjs を呼んでいた。置き直すときに、その組も dotagents の組として置き換える。
const isOurCommand = (command) => callsHook(command, BUNDLE_FILE) || callsHook(command, 'src/hook.mjs');

// plugin/hosts/ の hook の定義から、コマンドの本体の場所だけを書き換えて導く。
function hostHooks(host, from, to) {
  const rewrite = (value) => {
    if (Array.isArray(value)) return value.map(rewrite);
    if (!isObject(value)) return value;
    return Object.fromEntries(Object.entries(value).map(([key, item]) => {
      if (key !== 'command') return [key, rewrite(item)];
      const command = item.replace(from, to);
      if (!callsHook(command, BUNDLE_FILE)) throw new Error(`${host} の hook のコマンドを書き換えられない: ${item}`);
      return [key, command];
    }));
  };
  return rewrite(JSON.parse(fs.readFileSync(path.join(PLUGIN_ROOT, 'hosts', host, 'hooks.json'), 'utf8')));
}
export const claudeHooks = () => hostHooks('claude', `\${CLAUDE_PLUGIN_ROOT}/${BUNDLE_FILE}`, CLAUDE_HOOK_SCRIPT).hooks;
export const codexHooks = () => hostHooks('codex', `\${PLUGIN_ROOT}/${BUNDLE_FILE}`, HOOK_SCRIPT).hooks;
export const antigravityHooks = () => hostHooks('antigravity', `./${BUNDLE_FILE}`, `"${HOOK_SCRIPT}"`)[ANTIGRAVITY_SET];

// 本体として置く、plugin/ の中のもの。リポジトリーでは、どのホストも本体を plugin として読まない。hook の定義は CLI が
// プロジェクトの設定ファイルに書き、エージェントとスキルは CLI が各ホストの読む場所に置くので、本体に要るのは、hook の入口
// (src/ と core/ をまとめたもの。スキルの名前も埋め込む)と、エージェントに示す schema だけである。
export const BODY = [BUNDLE_FILE, 'schema'];

const RULE_FRONT = ['---', 'trigger: always_on', 'description: dotagents の既定のルール(どのエージェントにも入る部分)', '---'].join('\n');

// 置くファイル(ルートからの相対パスと中身)。
export function layout() {
  const files = new Map();
  const put = (rel, content) => files.set(rel, Buffer.isBuffer(content) ? content : Buffer.from(content));
  for (const part of BODY) {
    const source = path.join(PLUGIN_ROOT, part);
    if (!fs.existsSync(source)) throw new Error(`本体として置くものが plugin/ に無い: ${part}`);
    const rels = fs.statSync(source).isDirectory() ? walk(source).map((rel) => `${part}/${rel}`) : [part];
    for (const rel of rels) put(`${PLACED_DIR}/${rel}`, fs.readFileSync(path.join(PLUGIN_ROOT, rel)));
  }
  // Antigravity のワークスペースのルールは、trigger の無いファイルを読まない(資料による)。
  put('.agents/rules/dotagents.md', `${RULE_FRONT}\n\n${sharedText('placed')}\n`);
  for (const role of roles()) {
    const antigravity = antigravityAgent(role, 'placed');
    put(`.agents/agents/${antigravity.file}`, antigravity.content);
    const codex = codexAgent(role, 'placed');
    put(`.codex/agents/${codex.file}`, codex.content);
    const claude = claudeAgent(role, 'placed');
    put(`.claude/agents/${claude.file}`, claude.content);
  }
  // Codex と Antigravity は .agents/skills/ を、Claude Code は .claude/skills/ を読む。中身は同じである。プロジェクトのスキルと
  // ぶつからないよう、名前に dotagents- を付け、本文がスキルを指す箇所もその名前にする。
  for (const rel of walk(path.join(PLUGIN_ROOT, 'skills'))) {
    const [name, ...rest] = rel.split('/');
    let content = fs.readFileSync(path.join(PLUGIN_ROOT, 'skills', rel));
    if (rel.endsWith('.md')) content = nameSkills(content.toString('utf8'), 'placed');
    if (rest.join('/') === 'SKILL.md') {
      const text = content;
      const renamed = text.replace(/^(---\n[\s\S]*?^name: )(.+)$/m, `$1${MANIFEST.name}-${name}`);
      if (renamed === text) throw new Error(`スキルの name を書き換えられない: ${rel}`);
      content = renamed;
    }
    for (const dir of ['.agents/skills', '.claude/skills']) put(`${dir}/${MANIFEST.name}-${name}/${rest.join('/')}`, content);
  }
  return files;
}

// ---------------------------------------------------------------- 入口の設定ファイル

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
    // 9.2.0 までの、本体を plugin として読ませる項目。どちらの向きでも外す。
    prune(data, 'enabledPlugins', PLUGIN_ID);
    prune(data, 'extraKnownMarketplaces', MARKETPLACE);
    replaceGroups(data, 'hooks', install ? claudeHooks() : {}, CLAUDE_SETTINGS);
  },
  [CODEX_HOOKS]: (data, install) => replaceGroups(data, 'hooks', install ? codexHooks() : {}, CODEX_HOOKS),
  [ANTIGRAVITY_HOOKS]: (data, install) => {
    if (install) data[ANTIGRAVITY_SET] = antigravityHooks();
    else delete data[ANTIGRAVITY_SET];
  },
};

// ---------------------------------------------------------------- .gitattributes
//
// 置いたファイルを、GitHub が生成物として扱う(差分を畳み、言語の集計から外す)ように、.gitattributes に linguist-generated の行を書く。
// dotagents の行は、始まりと終わりの印の行で囲んだ 1 つの区画にまとめ、ほかの行には触れない。
// - sync: 区画が無ければ末尾に足し、あれば中身だけを置き換える。ファイルが無ければ作る。
// - remove: 区画を外す。残りが空なら、ファイルごと消す。
// 印の文は、外すときの目印なので、バージョンをまたいで変えない。印の対がそろっていなければ、どこまでが dotagents の行か分からないので、止める。

export const GITATTRIBUTES = '.gitattributes';
export const ATTRIBUTES_BEGIN = '# dotagents: ここから(sync が書き、remove が外します。手で編集しないでください)';
export const ATTRIBUTES_END = '# dotagents: ここまで';

// 本体は丸ごと、ほかの置いたファイルは 1 つずつ挙げる。プロジェクトが自分で置いた、似た名前のファイルを生成物にしない。
function attributeLines(files) {
  const rels = [`${PLACED_DIR}/**`, ...[...files.keys()].filter((rel) => !rel.startsWith(`${PLACED_DIR}/`)).sort()];
  return [ATTRIBUTES_BEGIN, ...rels.map((rel) => `${rel} linguist-generated=true`), ATTRIBUTES_END];
}

function attributesChange(root, files, changes) {
  const now = readFile(root, GITATTRIBUTES)?.toString('utf8') ?? null;
  if (now === null && !files) return;
  const eol = now?.includes('\r\n') ? '\r\n' : '\n';
  const lines = now === null || now === '' ? [] : now.split(/\r?\n/);
  // 末尾の改行で分けた、最後の空の要素は、行ではない。
  if (lines.at(-1) === '') lines.pop();
  const begins = lines.flatMap((line, index) => (line.trim() === ATTRIBUTES_BEGIN ? [index] : []));
  const ends = lines.flatMap((line, index) => (line.trim() === ATTRIBUTES_END ? [index] : []));
  if (begins.length > 1 || begins.length !== ends.length || (begins.length && ends[0] < begins[0])) {
    throw new StopError(`${GITATTRIBUTES} の dotagents の区画(「${ATTRIBUTES_BEGIN}」の行から「${ATTRIBUTES_END}」の行まで)の、始まりと終わりの行がそろっていません。区画を手で消すか直してから、実行し直してください。何も変えていません。`);
  }
  const ours = files ? attributeLines(files) : [];
  let next;
  if (begins.length) {
    const before = lines.slice(0, begins[0]);
    const after = lines.slice(ends[0] + 1);
    // 末尾の区画を外すときは、足すときに入れた区切りの空行も外す。
    if (!files && !after.length) while (before.length && before.at(-1).trim() === '') before.pop();
    next = [...before, ...ours, ...after];
  } else {
    if (!files) return;
    next = [...lines, ...(lines.length && lines.at(-1).trim() !== '' ? [''] : []), ...ours];
  }
  const text = next.some((line) => line.trim() !== '') ? `${next.join(eol)}${eol}` : null;
  if (text !== now) changes.set(GITATTRIBUTES, text === null ? null : Buffer.from(text));
}

// ---------------------------------------------------------------- 古い参照
//
// 8.x までは、プロジェクトの設定に、GitHub のこのリポジトリーを marketplace として入れる参照を書いていた。残っていると、
// リポジトリーに置いたものと両方が有効になり、古いルールと新しいルールが両方入る。sync はそれを外し、remove は戻さない。
// marketplace の名前は利用者が決められるので、名前ではなく source がこのリポジトリーを指すかで判定する。

export const REPOSITORY = String(MANIFEST.repository).replace(/^https?:\/\/github\.com\//i, '').replace(/\.git$/i, '').toLowerCase();

// github の owner/repo、git の URL(https、ssh、git@)、ref の付いた形を、owner/repo に直して比べる。
export function pointsHere(value) {
  if (typeof value !== 'string') return false;
  const rest = value.trim().replace(/^(?:git\+)?(?:github:|https?:\/\/(?:www\.)?github\.com\/|ssh:\/\/git@github\.com\/|git@github\.com:)/i, '');
  const match = rest.match(/^([\w.-]+\/[\w.-]+?)(?:\.git)?\/?(?:[#@].*)?$/);
  return Boolean(match) && match[1].toLowerCase() === REPOSITORY;
}

function dropOldClaude(data, found) {
  if (!isObject(data.extraKnownMarketplaces)) return;
  for (const [name, entry] of Object.entries(data.extraKnownMarketplaces)) {
    const source = entry?.source;
    if (name === MARKETPLACE || !isObject(source) || ![source.repo, source.url].some(pointsHere)) continue;
    delete data.extraKnownMarketplaces[name];
    found.push(`extraKnownMarketplaces の ${name}`);
    if (!isObject(data.enabledPlugins)) continue;
    for (const id of Object.keys(data.enabledPlugins).filter((key) => key.endsWith(`@${name}`))) {
      delete data.enabledPlugins[id];
      found.push(`enabledPlugins の ${id}`);
    }
  }
  for (const key of ['extraKnownMarketplaces', 'enabledPlugins']) if (isObject(data[key]) && !Object.keys(data[key]).length) delete data[key];
}

// .codex/config.toml の [marketplaces.<名前>](source がこのリポジトリーを指すもの)と、[plugins."<plugin>@<名前>"] を外す。
function dropOldCodex(root, changes, found) {
  const now = readFile(root, CODEX_CONFIG)?.toString('utf8') ?? null;
  if (now === null) return;
  const stop = (reason) => {
    throw new StopError(`${CODEX_CONFIG} に、GitHub の ${REPOSITORY} から入れる古い参照があるかを判断できません(${reason})。この参照があれば手で外してから、実行し直してください。何も変えていません。`);
  };
  try {
    const names = new Set();
    let { text, dropped } = dropTables(now, (table) => {
      if (table.array || table.keys.length !== 2 || table.keys[0] !== 'marketplaces' || !pointsHere(table.string('source'))) return false;
      names.add(table.keys[1]);
      return true;
    });
    if (text !== null && names.size) {
      const plugins = dropTables(text, (table) => !table.array && table.keys.length === 2 && table.keys[0] === 'plugins' && [...names].some((name) => table.keys[1].endsWith(`@${name}`)));
      text = plugins.text;
      dropped = [...dropped, ...plugins.dropped];
    }
    // 表の形で書かれていない参照(インラインの表、ドットの付いた鍵)は外せない。残っていれば、黙って残さずに止める。
    const rest = (text ?? '').split('\n').map((line) => line.replace(/(^|\s)#.*$/, '')).join('\n');
    if (new RegExp(REPOSITORY.replace(/[.*+?^${}()|[\]\\/]/g, '\\$&'), 'i').test(rest)) stop('表の形で書かれていない参照があります');
    for (const name of names) if (rest.includes(`@${name}"`)) stop(`表の形で書かれていない plugins の項目があります(${name})`);
    if (!dropped.length) return;
    for (const table of dropped) found.push(table.header);
    changes.set(CODEX_CONFIG, text === null ? null : Buffer.from(text));
  } catch (error) {
    if (error instanceof TomlShapeError) stop(error.message);
    throw error;
  }
}

// ---------------------------------------------------------------- 設定ファイルの $schema
//
// 設定ファイル(.agents/dotagents.jsonc)の $schema は、置いた本体の schema を指す相対パスを標準にする。置いたバージョンと
// schema がずれず、push の前から読める。
// - sync: ファイルが無ければ、$schema だけを持つファイルを作る。設定を書き始めたときから、エディターの補完が効く。
//   あれば、$schema が無いか、このリポジトリーの schema の URL を指すときだけ書き換える。ほかを指していれば変えない。
// - remove: 中身が相対パスの $schema だけならファイルごと消し、ほかの項目があれば $schema の行だけを外す(指す先が無くなる)。
// 読めない設定ファイルは変えない。hook が、読めないことを利用者に伝える。

const escape = (text) => text.replace(/[.*+?^${}()|[\]\\/]/g, '\\$&');
const SCHEMA_URL = new RegExp(`^https?://(?:raw\\.githubusercontent\\.com/${escape(REPOSITORY)}/|github\\.com/${escape(REPOSITORY)}/(?:raw|blob)/|cdn\\.jsdelivr\\.net/gh/${escape(REPOSITORY)}@)[^?#]*/dotagents\\.schema\\.json$`, 'i');
export const isOurSchemaUrl = (value) => typeof value === 'string' && SCHEMA_URL.test(value);

function declarationChange(root, install, changes) {
  const now = readFile(root, DECLARATION_FILE)?.toString('utf8') ?? null;
  if (now === null) {
    if (install) changes.set(DECLARATION_FILE, Buffer.from(json({ $schema: SCHEMA_REF })));
    return;
  }
  let value;
  try {
    value = parseJsonc(now);
  } catch {
    return;
  }
  if (!isObject(value)) return;
  if (install) {
    if (value.$schema === undefined || isOurSchemaUrl(value.$schema)) {
      const text = setTopLevelString(now, '$schema', SCHEMA_REF);
      if (text !== now) changes.set(DECLARATION_FILE, Buffer.from(text));
    }
    return;
  }
  if (value.$schema !== SCHEMA_REF) return;
  changes.set(DECLARATION_FILE, Object.keys(value).length === 1 ? null : Buffer.from(removeTopLevel(now, '$schema')));
}

// install が真なら、dotagents の項目を足し、古い参照を外す。外した古い参照を、ファイルごとに返す。
function entryChanges(root, install, changes) {
  const old = [];
  for (const [rel, edit] of Object.entries(ENTRIES)) {
    const now = readFile(root, rel)?.toString('utf8') ?? null;
    const found = [];
    let text;
    try {
      text = editJsonText(now, (data) => {
        if (install && rel === CLAUDE_SETTINGS) dropOldClaude(data, found);
        edit(data, install);
      }, rel);
    } catch (error) {
      throw new StopError(`${error.message} このファイルを直してから、実行し直してください。何も変えていません。`);
    }
    if (text !== now) changes.set(rel, text === null ? null : Buffer.from(text));
    if (found.length) old.push({ rel, items: found });
  }
  if (install) {
    const found = [];
    dropOldCodex(root, changes, found);
    if (found.length) old.push({ rel: CODEX_CONFIG, items: found });
  }
  return old;
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

// 設定ファイルの `decisions`(9.1.0 で非推奨、10.0.0 で読まなくなる)。AGENTS.md に移してもらうために、文字列の項目を返す。
// 読めない、無い、空のときは空にする。AGENTS.md は利用者の指示ファイルなので、ここでは書かない。
function leftDecisions(root) {
  try {
    const value = parseJsonc(readFile(root, DECLARATION_FILE)?.toString('utf8') ?? '');
    return isObject(value) ? list(value.decisions) : [];
  } catch {
    return [];
  }
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
  const old = entryChanges(root, true, changes);
  declarationChange(root, true, changes);
  attributesChange(root, next, changes);
  const recordText = recordOf(next);
  if (readFile(root, RECORD)?.toString('utf8') !== recordText) changes.set(RECORD, Buffer.from(recordText));
  const applied = apply(root, changes);
  return { root, from: record?.version ?? null, to: VERSION, changes: applied, old, decisions: leftDecisions(root) };
}

export function remove(dir) {
  const root = projectRoot(dir);
  const record = readRecord(root);
  const changes = new Map();
  for (const rel of Object.keys(record?.files ?? {})) changes.set(rel, null);
  entryChanges(root, false, changes);
  declarationChange(root, false, changes);
  attributesChange(root, null, changes);
  if (record) changes.set(RECORD, null);
  const summary = apply(root, changes);
  // 記録に無いファイル(手で足したもの)は消さずに残し、知らせる。
  const left = walk(path.join(root, PLACED_DIR)).map((rel) => `${PLACED_DIR}/${rel}`);
  return { root, from: record?.version ?? null, changes: summary, left };
}
