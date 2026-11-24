// プロジェクトに入れる。各ホストのプロジェクトの設定に書くだけで、利用者の環境には触れない。
//
// 入れ方は 2 つある。
//
// - 参照(install): 設定に、この plugin の置き場(GitHub のリポジトリー)を書く。版はホストが取りにいくので、
//   プロジェクトに版ごとのコミットはできない。7.x は写して配り、1 か月で 22 のリポジトリーに 309 のコミットを作った。
// - 写し(vendor): リポジトリーの中の marketplace(.agents/plugins/)に写し、設定はそこを指す。版を上げるたびに
//   コミットが要るので、利用者が選んだときだけ使う。
//
// どちらも、ほかの設定には触れず、この道具が書いた項目だけを書き換える。2 つは同時には置かない。
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
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { DECLARATION, readDeclaration } from './declaration.mjs';
import { PLUGIN_ROOT } from './root.mjs';
import { catalog, chosenStyles } from './style.mjs';

export const NAME = 'dotagents';
// この plugin を載せている marketplace の名前(リポジトリーの根の marketplace.json)。
const MARKETPLACE = NAME;
// 写しを載せる、リポジトリーの中の marketplace の名前は、プロジェクトごとに変える。ホストは marketplace の置き場を
// 名前ごとに利用者の環境へ 1 つだけ覚えるので、同じ名前を 2 つのプロジェクトが使うと、片方のセッションでもう片方の
// 写しの hook が動く(2.1.331 の Claude Code で確かめた)。利用者が自分で登録した dotagents とも分ける。
const VENDORED = new RegExp(`^${NAME}-[a-z0-9-]+$`);
const isOurMarket = (name) => name === MARKETPLACE || VENDORED.test(name ?? '');
const MARKET_DIR = path.join('.agents', 'plugins');
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
const writeJson = (file, value) => {
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(file, `${JSON.stringify(value, null, 2)}\n`);
};
const manifest = () => readJson(path.join(PLUGIN_ROOT, '.claude-plugin', 'plugin.json'), {});
export const version = () => manifest().version;
const repository = () => String(manifest().repository).replace(/^https?:\/\/github\.com\//, '').replace(/\.git$/, '');
// 8.x が Pi の設定に書いた package。いつも版の tag を付けて固定していた。
const isOldPi = (entry) => String(typeof entry === 'string' ? entry : entry?.source).startsWith(`git:github.com/${repository()}@`);

// JSON の設定を読み、変えて、書き戻す。変えたあとに空になった入れ物は消し、ファイルごと空になれば消す。
// 中身が変わらなければ書かない。読めないファイルは、書き戻すと利用者の設定が消えるので、触らずに止める。
function editJson(file, change) {
  const exists = fs.existsSync(file);
  let data = {};
  if (exists) {
    try {
      data = JSON.parse(fs.readFileSync(file, 'utf8'));
    } catch (error) {
      throw new Error(`${file} が JSON として読めないので、書き換えない: ${error.message}`);
    }
  }
  const before = JSON.stringify(data);
  change(data);
  for (const [key, value] of Object.entries(data)) if (value && typeof value === 'object' && !Array.isArray(value) && !Object.keys(value).length) delete data[key];
  if (JSON.stringify(data) === before) return;
  if (Object.keys(data).length) writeJson(file, data);
  else if (exists) fs.rmSync(file);
}

// 写しの marketplace の名前。置いてあればその名前を保ち、無ければ origin のリポジトリーの名前か、ディレクトリーの名前から作る。
function vendoredName(root) {
  for (const file of [path.join(MARKET_DIR, '.claude-plugin', 'marketplace.json'), path.join(MARKET_DIR, 'marketplace.json')]) {
    const name = readJson(path.join(root, file), {}).name;
    if (VENDORED.test(name ?? '')) return name;
  }
  let origin = '';
  try {
    origin = execFileSync('git', ['remote', 'get-url', 'origin'], { cwd: root, encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] }).trim();
  } catch {}
  const words = origin ? origin.replace(/\.git$/, '').split(/[/:]/).slice(-2) : [path.basename(root)];
  const slug = words.join('-').toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 60) || 'project';
  return `${NAME}-${slug}`;
}

// ---------------------------------------------------------------- Claude Code

function claude(root, mode, market) {
  editJson(path.join(root, CLAUDE_SETTINGS), (data) => {
    // enabledPlugins を先に置く。各人の claude plugin install --scope project は、この順に書き直すので、先にそろえておくと
    // 差分ができない。
    data.enabledPlugins ??= {};
    data.extraKnownMarketplaces ??= {};
    for (const name of Object.keys(data.extraKnownMarketplaces)) if (isOurMarket(name)) delete data.extraKnownMarketplaces[name];
    for (const id of Object.keys(data.enabledPlugins)) if (id.startsWith(`${NAME}@`) && isOurMarket(id.slice(NAME.length + 1))) delete data.enabledPlugins[id];
    if (mode === 'reference') {
      data.extraKnownMarketplaces[MARKETPLACE] = { source: { source: 'github', repo: repository() }, autoUpdate: true };
      data.enabledPlugins[`${NAME}@${MARKETPLACE}`] = true;
    } else if (mode === 'copy') {
      data.extraKnownMarketplaces[market] = { source: { source: 'directory', path: `./${MARKET_DIR.split(path.sep).join('/')}` } };
      data.enabledPlugins[`${NAME}@${market}`] = true;
    }
  });
}

// ---------------------------------------------------------------- Codex(TOML は、この道具が書く表だけを読み書きする)

const isCodexTable = (header) => {
  const market = header.match(/^\[marketplaces\.([\w-]+)\]$/)?.[1] ?? header.match(new RegExp(`^\\[plugins\\."${NAME}@([\\w-]+)"\\]$`))?.[1];
  return header.startsWith('[marketplaces.') ? market === MARKETPLACE : isOurMarket(market);
};

function codex(root, mode, market) {
  const file = path.join(root, CODEX_CONFIG);
  const lines = fs.existsSync(file) ? fs.readFileSync(file, 'utf8').split('\n') : [];
  const kept = [];
  let skipping = false;
  for (const line of lines) {
    const header = line.trim();
    if (/^\[/.test(header)) skipping = isCodexTable(header);
    if (!skipping) kept.push(line);
  }
  const body = kept.join('\n').replace(/\n{3,}/g, '\n\n').trim();
  const add = {
    reference: [`[marketplaces.${MARKETPLACE}]`, 'source_type = "git"', `source = "https://github.com/${repository()}.git"`, '', `[plugins."${NAME}@${MARKETPLACE}"]`, 'enabled = true'],
    copy: [`[plugins."${NAME}@${market}"]`, 'enabled = true'],
  }[mode];
  const text = [body, add?.join('\n')].filter(Boolean).join('\n\n');
  if (!text) {
    if (fs.existsSync(file)) fs.rmSync(file);
    return;
  }
  if (kept.length === lines.length && !add) return;
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(file, `${text}\n`);
}

// ---------------------------------------------------------------- 写し

// リポジトリーの中の marketplace の目録に、この plugin の項目を置くか外す。プロジェクトが自分の plugin を載せていれば、
// その項目と名前は残す。
function catalogue(file, entry, market) {
  editJson(file, (data) => {
    const others = (Array.isArray(data.plugins) ? data.plugins : []).filter((plugin) => plugin?.name !== NAME);
    if (!entry && !others.length) {
      for (const key of Object.keys(data)) delete data[key];
      return;
    }
    data.name ??= market;
    data.plugins = entry ? [...others, entry] : others;
  });
}

function removeCopy(root) {
  const copy = path.join(root, COPY_DIR);
  if (fs.existsSync(path.join(copy, RECORD))) fs.rmSync(copy, { recursive: true, force: true });
  catalogue(path.join(root, MARKET_DIR, 'marketplace.json'), null);
  catalogue(path.join(root, MARKET_DIR, '.claude-plugin', 'marketplace.json'), null);
  for (const dir of [path.join(MARKET_DIR, '.claude-plugin'), MARKET_DIR]) {
    try {
      fs.rmdirSync(path.join(root, dir));
    } catch {}
  }
}

// 8.x の残り。写し(.claude/skills/dotagents)は、この道具が置いた印があるときだけ消す。Pi の設定は、8.x が書いた
// package の行だけを消し、ほかの行は残す。
function removeOldCopy(root) {
  const old = path.join(root, OLD_COPY_DIR);
  if (fs.existsSync(path.join(old, RECORD))) fs.rmSync(old, { recursive: true, force: true });
  if (!fs.existsSync(path.join(root, PI_SETTINGS))) return;
  editJson(path.join(root, PI_SETTINGS), (data) => {
    if (!Array.isArray(data.packages) || !data.packages.some(isOldPi)) return;
    data.packages = data.packages.filter((entry) => !isOldPi(entry));
    if (!data.packages.length) delete data.packages;
  });
}

// ---------------------------------------------------------------- 宣言と雛形

function declare(root, style) {
  const chosen = Object.entries(style).filter(([, name]) => name !== undefined);
  if (!chosen.length && fs.existsSync(path.join(root, DECLARATION))) return;
  const known = catalog();
  for (const [axis, name] of chosen) if (!known[axis]?.includes(name)) throw new Error(`${axis} に ${name} という流は無い。選べるもの: ${(known[axis] ?? []).join('、') || 'なし'}`);
  editJson(path.join(root, DECLARATION), (data) => {
    if (chosen.length) data.style = { ...(data.style && typeof data.style === 'object' ? data.style : {}), ...Object.fromEntries(chosen) };
  });
  if (!fs.existsSync(path.join(root, DECLARATION))) writeJson(path.join(root, DECLARATION), {});
}

// 選んだ流の雛形を、プロジェクトに無いものだけ写す。写したあとはプロジェクトが持ち、版ごとに写し直さない。
function scaffold(root) {
  const placed = [];
  const skipped = [];
  for (const style of chosenStyles(readDeclaration(root).value).chosen) {
    const template = style.values.template;
    if (!template || typeof template !== 'object') continue;
    for (const [to, from] of Object.entries(template)) {
      const target = path.join(root, to);
      if (fs.existsSync(target)) {
        skipped.push(to);
        continue;
      }
      fs.mkdirSync(path.dirname(target), { recursive: true });
      fs.copyFileSync(path.join(style.dir, from), target);
      placed.push(to);
    }
  }
  return { placed, skipped };
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

export function install(dir, { style = {}, template = true } = {}) {
  const root = path.resolve(dir);
  declare(root, style);
  removeCopy(root);
  removeOldCopy(root);
  for (const host of [claude, codex]) host(root, 'reference');
  const templates = template ? scaffold(root) : { placed: [], skipped: [] };
  return { mode: 'reference', each: EACH.reference, ...templates };
}

export function uninstall(dir) {
  const root = path.resolve(dir);
  removeOldCopy(root);
  for (const host of [claude, codex]) host(root, 'none');
}

export function vendor(dir) {
  const root = path.resolve(dir);
  const target = path.join(root, COPY_DIR);
  for (const file of [path.join(MARKET_DIR, 'marketplace.json'), path.join(MARKET_DIR, '.claude-plugin', 'marketplace.json')]) {
    const name = readJson(path.join(root, file), {}).name;
    if (name && !VENDORED.test(name)) throw new Error(`${file} は、プロジェクトの marketplace(${name})である。写しは置かずに、install で参照を書く。`);
  }
  const market = vendoredName(root);
  if (target === PLUGIN_ROOT) throw new Error('写し自身から、同じ場所へは入れ直せない。入れてある plugin の道具から実行する。');
  if (fs.existsSync(target) && !fs.existsSync(path.join(target, RECORD))) throw new Error(`${target} に、この道具が置いたのではないものがある。`);
  removeOldCopy(root);
  fs.rmSync(target, { recursive: true, force: true });
  fs.cpSync(PLUGIN_ROOT, target, { recursive: true, filter: (source) => !['node_modules', '.DS_Store'].includes(path.basename(source)) });
  writeJson(path.join(target, RECORD), { version: version() });
  const description = manifest().description;
  catalogue(path.join(root, MARKET_DIR, 'marketplace.json'), { name: NAME, source: { source: 'local', path: `./${COPY_DIR.split(path.sep).join('/')}` }, policy: { installation: 'AVAILABLE', authentication: 'ON_INSTALL' }, category: 'Developer Tools' }, market);
  catalogue(path.join(root, MARKET_DIR, '.claude-plugin', 'marketplace.json'), { name: NAME, source: `./${NAME}`, description }, market);
  editJson(path.join(root, MARKET_DIR, '.claude-plugin', 'marketplace.json'), (data) => {
    data.owner ??= { name: repository().split('/')[0] };
  });
  for (const host of [claude, codex]) host(root, 'copy', market);
  return { mode: 'copy', target, version: version(), each: EACH.copy };
}

export function unvendor(dir) {
  const root = path.resolve(dir);
  removeCopy(root);
  removeOldCopy(root);
  for (const host of [claude, codex]) host(root, 'none');
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
  const packages = readJson(path.join(root, PI_SETTINGS), {}).packages;
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
    oldPi: (Array.isArray(packages) ? packages : []).some(isOldPi),
  };
}
