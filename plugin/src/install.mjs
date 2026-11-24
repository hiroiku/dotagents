// プロジェクトに入れる。各ホストのプロジェクトの設定に書くだけで、利用者の環境には触れない。
//
// 入れ方は 2 つある。
//
// - 参照(install): 設定に、この plugin の置き場(GitHub のリポジトリー)を書く。版はホストが取りにいくので、
//   プロジェクトに版ごとのコミットはできない。7.x は写して配り、1 か月で 22 のリポジトリーに 309 のコミットを作った。
// - 写し(vendor): リポジトリーの中の marketplace(.agents/plugins/)に写し、設定はそこを指す。版を上げるたびに
//   コミットが要るので、利用者が選んだときだけ使う。
//
// どちらも、この道具が書いた項目だけを足し引きし、ほかの文字は変えない。2 つは同時には置かない。
// 変える内容はすべて組み立ててから書く。読めない設定が 1 つでもあれば、何も変えずに止める。
//
// ホストごとの違い(0.172.0 の Codex、2.1.331 の Claude Code で確かめた):
//
// - Claude Code: .claude/settings.json の extraKnownMarketplaces と enabledPlugins。設定で有効にしただけでは、対話の
//   セッションの始めに読まれない(-p は裏で入れるので読まれる)。自分で入れていない人は、1 回
//   claude plugin install dotagents@dotagents --scope project を実行する。写し(相対パスの directory marketplace)は、
//   入れなくても、フォルダーを信頼すれば、marketplace を登録した最初のセッションの次から読まれる。
// - Codex: .codex/config.toml の marketplaces と plugins。git の marketplace は、プロジェクトの信頼と hook の承認
//   (/hooks)のあと、各人の操作なしで入る。hook の承認は、plugin の中身が変わるたびに要る。リポジトリーの中の
//   marketplace は、/plugins を一度開くまで入らない。
//
// 9.0.0 から Pi には入れない。8.x が .pi/settings.json に書いた、版を固定した package の行は、入れるときと外すときに消す。

import { execFileSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { DECLARATION } from './declaration.mjs';
import { editJsonText } from './jsontext.mjs';
import { PLUGIN_ROOT } from './root.mjs';
import { catalog } from './style.mjs';

export const NAME = 'dotagents';
// この plugin を載せている marketplace の名前(リポジトリーの根の marketplace.json)。
const MARKETPLACE = NAME;
// 写しを載せる、リポジトリーの中の marketplace の名前は、プロジェクトごとに変える。ホストは marketplace の置き場を
// 名前ごとに利用者の環境へ 1 つだけ覚えるので、同じ名前を 2 つのプロジェクトが使うと、片方のセッションでもう片方の
// 写しの hook が動く(2.1.331 の Claude Code で確かめた)。利用者が自分で登録した dotagents とも分ける。
const VENDORED = new RegExp(`^${NAME}-[a-z0-9-]+$`);
const isOurMarket = (name) => name === MARKETPLACE || VENDORED.test(name ?? '');
const MARKET_DIR = path.join('.agents', 'plugins');
const MARKET_FILES = [path.join(MARKET_DIR, 'marketplace.json'), path.join(MARKET_DIR, '.claude-plugin', 'marketplace.json')];
const COPY_DIR = path.join(MARKET_DIR, NAME);
const RECORD = 'VENDORED.json';
// 8.x の写しの置き場と、Pi の設定。
const OLD_COPY_DIR = path.join('.claude', 'skills', NAME);
const PI_SETTINGS = path.join('.pi', 'settings.json');

const CLAUDE_SETTINGS = path.join('.claude', 'settings.json');
const CODEX_CONFIG = path.join('.codex', 'config.toml');

const readJson = (file, fallback) => {
  try {
    return JSON.parse(fs.readFileSync(file, 'utf8'));
  } catch {
    return fallback;
  }
};
const isObject = (value) => value !== null && typeof value === 'object' && !Array.isArray(value);
const manifest = () => readJson(path.join(PLUGIN_ROOT, '.claude-plugin', 'plugin.json'), {});
export const version = () => manifest().version;
const repository = () => String(manifest().repository).replace(/^https?:\/\/github\.com\//, '').replace(/\.git$/, '');
// 8.x が Pi の設定に書いた package。いつも版の tag を付けて固定していた。
const oldPiPackage = () => `git:github.com/${repository()}@`;
const isOldPi = (entry) => String(typeof entry === 'string' ? entry : entry?.source).startsWith(oldPiPackage());

// ---------------------------------------------------------------- 変える内容の組み立て
//
// 途中まで書いたところで止まると、プロジェクトの設定が食い違ったまま残る。読むことと組み立ては先にすべて済ませ、
// 書くのは apply だけにする。

function planOf(root) {
  const texts = new Map();
  const removed = new Set();
  const copies = [];
  const read = (relative) => {
    if (texts.has(relative)) return texts.get(relative);
    const file = path.join(root, relative);
    return fs.existsSync(file) ? fs.readFileSync(file, 'utf8') : null;
  };
  const set = (relative, text) => texts.set(relative, text);
  return {
    root,
    read,
    set,
    exists: (relative) => fs.existsSync(path.join(root, relative)),
    json: (relative, change) => set(relative, editJsonText(read(relative), change, relative)),
    remove: (relative) => removed.add(relative),
    copy: (from, relative) => copies.push([from, relative]),
    apply() {
      for (const relative of removed) fs.rmSync(path.join(root, relative), { recursive: true, force: true });
      for (const [from, relative] of copies) {
        fs.mkdirSync(path.dirname(path.join(root, relative)), { recursive: true });
        fs.cpSync(from, path.join(root, relative), { recursive: true, filter: (source) => !['node_modules', '.DS_Store'].includes(path.basename(source)) });
      }
      for (const [relative, text] of texts) {
        const file = path.join(root, relative);
        const now = fs.existsSync(file) ? fs.readFileSync(file, 'utf8') : null;
        if (text === now) continue;
        if (text === null) {
          fs.rmSync(file);
          // 書いたファイルを消して空になった置き場(.codex/ など)も消す。
          try {
            fs.rmdirSync(path.dirname(file));
          } catch {}
        } else {
          fs.mkdirSync(path.dirname(file), { recursive: true });
          fs.writeFileSync(file, text);
        }
      }
      // 目録を消して空になった置き場だけを消す。
      for (const dir of [path.join(MARKET_DIR, '.claude-plugin'), MARKET_DIR]) {
        try {
          fs.rmdirSync(path.join(root, dir));
        } catch {}
      }
    },
  };
}

// JSON の設定の名前。読めなければ止める。
function nameIn(plan, file) {
  const text = plan.read(file);
  if (text === null) return undefined;
  let name;
  editJsonText(text, (data) => {
    name = data.name;
  }, file);
  return name;
}

// 写しの marketplace の名前。置いてあればその名前を保ち、無ければ origin のリポジトリーの名前から作る。origin が
// 無ければ、ディレクトリーの名前に、置き場の全体から導いた短い値を足す。名前だけでは、別の場所の同じ名前と重なる。
function vendoredName(plan) {
  for (const file of MARKET_FILES) {
    const name = nameIn(plan, file);
    if (VENDORED.test(name ?? '')) return name;
  }
  let origin = '';
  try {
    origin = execFileSync('git', ['remote', 'get-url', 'origin'], { cwd: plan.root, encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] }).trim();
  } catch {}
  const slug = (words) => words.join('-').toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 60) || 'project';
  if (origin) return `${NAME}-${slug(origin.replace(/\.git$/, '').split(/[/:]/).slice(-2))}`;
  const place = createHash('sha256').update(fs.realpathSync(plan.root)).digest('hex').slice(0, 8);
  return `${NAME}-${slug([path.basename(plan.root)])}-${place}`;
}

// 入れ物から、この道具の項目を外す。外して空になったときだけ、入れ物ごと外す。
function prune(data, key, isOurs) {
  if (!isObject(data[key])) return;
  const ours = Object.keys(data[key]).filter(isOurs);
  for (const name of ours) delete data[key][name];
  if (ours.length && !Object.keys(data[key]).length) delete data[key];
}

function box(data, key, file) {
  data[key] ??= {};
  if (!isObject(data[key])) throw new Error(`${file} の ${key} がオブジェクトではないので、書き換えない。`);
  return data[key];
}

// ---------------------------------------------------------------- Claude Code

function claude(plan, mode, market) {
  plan.json(CLAUDE_SETTINGS, (data) => {
    prune(data, 'enabledPlugins', (id) => id.startsWith(`${NAME}@`) && isOurMarket(id.slice(NAME.length + 1)));
    prune(data, 'extraKnownMarketplaces', isOurMarket);
    if (mode === 'none') return;
    // enabledPlugins を先に置く。各人の claude plugin install --scope project は、この順に書き直すので、先にそろえておくと
    // 差分ができない。
    const plugins = box(data, 'enabledPlugins', CLAUDE_SETTINGS);
    const markets = box(data, 'extraKnownMarketplaces', CLAUDE_SETTINGS);
    if (mode === 'reference') {
      markets[MARKETPLACE] = { source: { source: 'github', repo: repository() }, autoUpdate: true };
      plugins[`${NAME}@${MARKETPLACE}`] = true;
    } else {
      markets[market] = { source: { source: 'directory', path: `./${MARKET_DIR.split(path.sep).join('/')}` } };
      plugins[`${NAME}@${market}`] = true;
    }
  });
}

// ---------------------------------------------------------------- Codex
//
// TOML は、この道具の表だけを足し引きし、ほかの表の字は変えない。
//
// - 入れるとき: この道具の表が無ければ、ファイルの終わりに、空の行を 1 つ挟んで足す。あれば、表の中の、この道具が
//   書く鍵の行だけをそろえ、利用者が表に足した行は残す。
// - 外すとき: この道具の表を、利用者が足した行も含めて、見出しから最後の値の行まで外す。見出しの直前の空の行 1 つも
//   外す。表の後ろの注釈と空の行は、次の表か利用者のものなので残す。
//
// 複数行の文字列と、複数行にまたがる配列の中の行は、見出しとして読まない。

const codexTables = (mode, market) => ({
  reference: [
    [`[marketplaces.${MARKETPLACE}]`, [['source_type', '"git"'], ['source', `"https://github.com/${repository()}.git"`]]],
    [`[plugins."${NAME}@${MARKETPLACE}"]`, [['enabled', 'true']]],
  ],
  copy: [[`[plugins."${NAME}@${market}"]`, [['enabled', 'true']]]],
})[mode] ?? [];

const isCodexTable = (header) => header === `[marketplaces.${MARKETPLACE}]` || isOurMarket(header.match(new RegExp(`^\\[plugins\\."${NAME}@([\\w-]+)"\\]$`))?.[1]);

const MULTILINE = ['"""', "'''"];

// 行ごとに、文字列と配列の外(TOML の一番上の段)で始まるかを返す。
function topLevel(lines) {
  let open = null;
  let depth = 0;
  return lines.map((line) => {
    const top = open === null && depth === 0;
    for (let at = 0; at < line.length; at += 1) {
      if (open !== null) {
        if (open === MULTILINE[0] && line[at] === '\\') at += 1;
        else if (line.startsWith(open, at)) {
          at += 2;
          open = null;
        }
      } else if (line[at] === '#') break;
      else if (MULTILINE.some((mark) => line.startsWith(mark, at))) {
        open = line.slice(at, at + 3);
        at += 2;
      } else if (line[at] === '"' || line[at] === "'") {
        const quote = line[at];
        for (at += 1; at < line.length && line[at] !== quote; at += 1) if (quote === '"' && line[at] === '\\') at += 1;
      } else if (line[at] === '[') depth += 1;
      else if (line[at] === ']') depth = Math.max(0, depth - 1);
    }
    return top;
  });
}

// 表ごとに、見出しの行と、最後の値の行を返す。
function tablesIn(lines) {
  const top = topLevel(lines);
  const headers = lines.flatMap((line, at) => (top[at] && /^\s*\[/.test(line) ? [at] : []));
  return headers.map((start, index) => {
    let end = start;
    for (let at = start + 1; at < (headers[index + 1] ?? lines.length); at += 1) {
      const text = lines[at].trim();
      if (!top[at] || (text && !text.startsWith('#'))) end = at;
    }
    return { start, end, header: lines[start].trim(), keyAt: (key) => lines.slice(start + 1, end + 1).findIndex((line, offset) => top[start + 1 + offset] && new RegExp(`^\\s*${key}\\s*=`).test(line)) };
  });
}

function codexText(text, mode, market) {
  const lines = text === null ? [] : text.split('\n');
  const wanted = codexTables(mode, market);
  const drop = new Set();
  const replace = new Map();
  const after = new Map();
  const present = new Set();
  for (const table of tablesIn(lines)) {
    if (!isCodexTable(table.header)) continue;
    const keys = present.has(table.header) ? null : wanted.find(([header]) => header === table.header)?.[1];
    if (!keys) {
      for (let at = table.start; at <= table.end; at += 1) drop.add(at);
      if (table.start > 0 && !lines[table.start - 1].trim()) drop.add(table.start - 1);
      continue;
    }
    present.add(table.header);
    const missing = [];
    for (const [key, value] of keys) {
      const offset = table.keyAt(key);
      const line = `${key} = ${value}`;
      if (offset < 0) missing.push(line);
      else if (lines[table.start + 1 + offset] !== line) replace.set(table.start + 1 + offset, line);
    }
    if (missing.length) after.set(table.start, missing);
  }
  const add = wanted.filter(([header]) => !present.has(header));
  if (!drop.size && !replace.size && !after.size && !add.length) return text;
  const kept = lines.flatMap((line, at) => (drop.has(at) ? [] : [replace.get(at) ?? line, ...(after.get(at) ?? [])])).join('\n');
  const blocks = add.map(([header, keys]) => [header, ...keys.map(([key, value]) => `${key} = ${value}`)].join('\n'));
  if (!blocks.length) return kept.trim() ? kept : null;
  const body = kept.trim() ? `${kept.endsWith('\n') ? kept : `${kept}\n`}\n` : '';
  return `${body}${blocks.join('\n\n')}\n`;
}

function codex(plan, mode, market) {
  plan.set(CODEX_CONFIG, codexText(plan.read(CODEX_CONFIG), mode, market));
}

// ---------------------------------------------------------------- 写し

const copyEntries = () => ({
  [MARKET_FILES[0]]: { name: NAME, source: { source: 'local', path: `./${COPY_DIR.split(path.sep).join('/')}` }, policy: { installation: 'AVAILABLE', authentication: 'ON_INSTALL' }, category: 'Developer Tools' },
  [MARKET_FILES[1]]: { name: NAME, source: `./${NAME}`, description: manifest().description },
});

// リポジトリーの中の marketplace の目録に、この plugin の項目を置くか外す。触れるのは、写しの形の名前を持つ目録だけで、
// プロジェクト自身の marketplace には触れない。プロジェクトが写しの目録に自分の plugin を載せていれば、それは残す。
function catalogue(plan, file, entry, market) {
  if (!entry && plan.read(file) === null) return;
  plan.json(file, (data) => {
    if (data.name !== undefined && !VENDORED.test(data.name)) return;
    const others = (Array.isArray(data.plugins) ? data.plugins : []).filter((plugin) => plugin?.name !== NAME);
    if (!entry && !others.length) {
      for (const key of Object.keys(data)) delete data[key];
      return;
    }
    data.name ??= market;
    if (entry && file === MARKET_FILES[1]) data.owner ??= { name: repository().split('/')[0] };
    data.plugins = entry ? [...others, entry] : others;
  });
}

function removeCopy(plan) {
  if (plan.exists(path.join(COPY_DIR, RECORD))) plan.remove(COPY_DIR);
  for (const file of MARKET_FILES) catalogue(plan, file, null);
}

// 8.x の残り。写し(.claude/skills/dotagents)は、この道具が置いた印があるときだけ消し、親の置き場は残す。
// Pi の設定は、8.x が書いた package の行だけを消す。9.0.0 は Pi に入れないので、Pi の設定が読めなくても止めない。
function removeOldCopy(plan) {
  if (plan.exists(path.join(OLD_COPY_DIR, RECORD))) plan.remove(OLD_COPY_DIR);
  if (!plan.exists(PI_SETTINGS)) return;
  try {
    plan.json(PI_SETTINGS, (data) => {
      if (!Array.isArray(data.packages) || !data.packages.some(isOldPi)) return;
      data.packages = data.packages.filter((entry) => !isOldPi(entry));
      if (!data.packages.length) delete data.packages;
    });
  } catch {}
}

// ---------------------------------------------------------------- 宣言

function declare(plan, style) {
  const chosen = Object.entries(style).filter(([, name]) => name !== undefined);
  const known = catalog();
  for (const [axis, name] of chosen) if (!known[axis]?.includes(name)) throw new Error(`${axis} に ${name} という流は無い。選べるもの: ${(known[axis] ?? []).join('、') || 'なし'}`);
  if (chosen.length) {
    plan.json(DECLARATION, (data) => {
      data.style = { ...(isObject(data.style) ? data.style : {}), ...Object.fromEntries(chosen) };
    });
  } else if (plan.read(DECLARATION) === null) plan.set(DECLARATION, '{}\n');
}

// ---------------------------------------------------------------- 入れる、外す

const EACH = {
  reference: [
    `Claude Code: 自分で入れていない人は、1 回 claude plugin install ${NAME}@${MARKETPLACE} --scope project を実行する(すべてのプロジェクトで使うなら --scope user)。設定で有効にしただけでは、対話のセッションの始めに読まれない。フォルダーの信頼も要る。`,
    'Codex: プロジェクトを信頼し(trust_level = "trusted")、/hooks で dotagents の hook を承認する。版が上がるたびに承認し直す。',
  ],
  copy: [
    'Claude Code: 入れる操作は要らない。フォルダーを信頼すると、最初のセッションで写しの marketplace が登録され、次のセッションから読まれる。',
    'Codex: プロジェクトを信頼し、/plugins を一度開いて入れ、/hooks で hook を承認する。写しを更新するたびに、入れ直しと承認が要る。',
  ],
};

export function install(dir, { style = {} } = {}) {
  const plan = planOf(path.resolve(dir));
  declare(plan, style);
  removeCopy(plan);
  removeOldCopy(plan);
  claude(plan, 'reference');
  codex(plan, 'reference');
  plan.apply();
  return { mode: 'reference', each: EACH.reference };
}

export function uninstall(dir) {
  const plan = planOf(path.resolve(dir));
  removeOldCopy(plan);
  claude(plan, 'none');
  codex(plan, 'none');
  plan.apply();
}

export function vendor(dir) {
  const plan = planOf(path.resolve(dir));
  for (const file of MARKET_FILES) {
    const name = nameIn(plan, file);
    if (name && !VENDORED.test(name)) throw new Error(`${file} は、プロジェクトの marketplace(${name})である。写しは置かずに、install で参照を書く。`);
  }
  const market = vendoredName(plan);
  const target = path.join(plan.root, COPY_DIR);
  if (target === PLUGIN_ROOT) throw new Error('写し自身から、同じ場所へは入れ直せない。入れてある plugin の道具から実行する。');
  if (fs.existsSync(target) && !fs.existsSync(path.join(target, RECORD))) throw new Error(`${target} に、この道具が置いたのではないものがある。`);
  removeOldCopy(plan);
  plan.remove(COPY_DIR);
  plan.copy(PLUGIN_ROOT, COPY_DIR);
  plan.set(path.join(COPY_DIR, RECORD), `${JSON.stringify({ version: version() }, null, 2)}\n`);
  for (const [file, entry] of Object.entries(copyEntries())) catalogue(plan, file, entry, market);
  claude(plan, 'copy', market);
  codex(plan, 'copy', market);
  plan.apply();
  return { mode: 'copy', target, version: version(), each: EACH.copy };
}

export function unvendor(dir) {
  const plan = planOf(path.resolve(dir));
  removeCopy(plan);
  removeOldCopy(plan);
  claude(plan, 'none');
  codex(plan, 'none');
  plan.apply();
}

// この環境の Claude Code に、この plugin が入っているか。参照を設定に書いただけでは、対話のセッションの始めに読まれない。
// user の scope か、このプロジェクトの project か local の scope の記録があれば入っている。記録が読めなければ null。
export function claudeInstalled(dir, home = process.env.CLAUDE_CONFIG_DIR ?? path.join(os.homedir(), '.claude')) {
  const record = readJson(path.join(home, 'plugins', 'installed_plugins.json'), null);
  if (!record || typeof record !== 'object') return null;
  const entries = record.plugins?.[`${NAME}@${MARKETPLACE}`];
  if (!Array.isArray(entries)) return false;
  const real = (file) => {
    try {
      return fs.realpathSync(file);
    } catch {
      return path.resolve(file);
    }
  };
  const root = real(dir);
  return entries.some((entry) => entry?.scope === 'user' || ((entry?.scope === 'project' || entry?.scope === 'local') && typeof entry.projectPath === 'string' && real(entry.projectPath) === root));
}

// どのホストに、どの入れ方で書いてあるか。点検に使う。
export function installed(dir) {
  const root = path.resolve(dir);
  const settings = readJson(path.join(root, CLAUDE_SETTINGS), {});
  const toml = fs.existsSync(path.join(root, CODEX_CONFIG)) ? fs.readFileSync(path.join(root, CODEX_CONFIG), 'utf8') : '';
  const pi = fs.existsSync(path.join(root, PI_SETTINGS)) ? fs.readFileSync(path.join(root, PI_SETTINGS), 'utf8') : '';
  const mode = (reference, copy) => (reference ? 'reference' : copy ? 'copy' : null);
  const enabled = Object.entries(settings.enabledPlugins ?? {}).filter(([id, on]) => on === true && id.startsWith(`${NAME}@`)).map(([id]) => id.slice(NAME.length + 1));
  const tables = [...toml.matchAll(new RegExp(`^\\[plugins\\."${NAME}@([\\w-]+)"\\]`, 'gm'))].map((match) => match[1]);
  return {
    hosts: {
      'Claude Code': mode(enabled.includes(MARKETPLACE), enabled.some((name) => VENDORED.test(name))),
      Codex: mode(tables.includes(MARKETPLACE), tables.some((name) => VENDORED.test(name))),
    },
    copy: readJson(path.join(root, COPY_DIR, RECORD), null),
    oldCopy: readJson(path.join(root, OLD_COPY_DIR, RECORD), null),
    // 読めない設定にも残っていることがあるので、文字で探す。
    oldPi: pi.includes(oldPiPackage()),
  };
}
