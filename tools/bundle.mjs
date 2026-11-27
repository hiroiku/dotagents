// hook の入口(plugin/dotagents.mjs)を、plugin/src/ のモジュールと plugin/core/ の文から作る。
//
//   node tools/bundle.mjs
//
// 正は plugin/src/ と plugin/core/ で、入口は生成物である。手で直さず、src/ か core/ を直してからこれを実行する。
// 作り直して差分が出ないことを、テストが守る。
//
// 入口を 1 つのファイルにするのは、プロジェクトのリポジトリーに置くファイルを減らすためである。hook はこのファイルだけを読み、
// core/ の文も埋め込むので、ファイルを読まずに動く。
//
// まとめ方は、モジュールを依存の順に並べてつなぐだけにする(道具に頼らず、実行時の依存も足さない)。そのために、src/ のモジュールは
// 次の形に限る。外れたものがあれば、黙ってまとめずに止める。
// - import は、`import 名前 from 'node:…'`、`import { 名前, … } from 'node:…'`、`import { 名前, … } from './<モジュール>.mjs'` だけ。
//   別名(as)、default の export、`export * from` は使わない。
// - 一番外側で宣言する名前は、モジュールをまたいで重ならない。
// - 依存は循環しない。

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { BUNDLE_FILE } from '../plugin/src/root.mjs';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const PLUGIN = path.join(ROOT, 'plugin');
const SRC = path.join(PLUGIN, 'src');
export const OUT = path.join(PLUGIN, BUNDLE_FILE);

const LOCAL_IMPORT = /^import \{ ([\w$, ]+) \} from '\.\/([\w-]+)\.mjs';$/;
const NODE_DEFAULT = /^import ([\w$]+) from '(node:[\w/]+)';$/;
const NODE_NAMED = /^import \{ ([\w$, ]+) \} from '(node:[\w/]+)';$/;
const REEXPORT = /^export \{ ([\w$, ]+) \};$/;
const DECLARED = /^(?:export )?(?:async )?(?:const|let|var|function\*?|class) +([\w$]+)/;

const names = (text) => text.split(',').map((name) => name.trim()).filter(Boolean);

// 入口では、モジュールの一部を置き換える。開発中の経路(ファイルを読む、src/ から根を求める)を、入口の経路にする。
function replaceOnce(text, from, to, file) {
  const parts = text.split(from);
  if (parts.length !== 2) throw new Error(`${file}: 置き換える箇所が 1 か所ではない: ${from}`);
  return parts.join(to);
}

const OVERRIDES = {
  // 入口は plugin の根に置くので、根は入口のあるディレクトリーである。
  'root.mjs': (text) => replaceOnce(text, "path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')", 'path.dirname(fileURLToPath(import.meta.url))', 'root.mjs'),
  // core/ の文を埋め込み、ファイルを読まない。
  'core.mjs': () => {
    const dir = path.join(PLUGIN, 'core');
    const texts = Object.fromEntries(fs.readdirSync(dir).filter((name) => name.endsWith('.md')).sort().map((name) => [name.slice(0, -3), fs.readFileSync(path.join(dir, name), 'utf8').trim()]));
    return [
      '// core/ の文(常時読み込まれる既定のルールの部分)を、名前で引く。tools/bundle.mjs が core/ から埋め込んだもの。',
      '// 開発中の経路(ファイルが無ければ投げる)と同じく、知らない名前では投げる。',
      '',
      `const CORE = ${JSON.stringify(texts, null, 2)};`,
      '',
      'export const coreText = (name) => {',
      '  if (!Object.hasOwn(CORE, name)) throw new Error(`core の文が無い: ${name}`);',
      '  return CORE[name];',
      '};',
      '',
    ].join('\n');
  },
};

function readModule(name) {
  const text = (OVERRIDES[name] ?? ((source) => source))(fs.readFileSync(path.join(SRC, name), 'utf8'));
  const deps = [];
  const imported = new Set();
  const nodeImports = [];
  const body = [];
  for (const line of text.split('\n')) {
    let match;
    if ((match = line.match(LOCAL_IMPORT))) {
      deps.push(`${match[2]}.mjs`);
      for (const local of names(match[1])) imported.add(local);
    } else if ((match = line.match(NODE_DEFAULT))) nodeImports.push({ from: match[2], local: match[1], default: true });
    else if ((match = line.match(NODE_NAMED))) for (const local of names(match[1])) nodeImports.push({ from: match[2], local, default: false });
    else if ((match = line.match(REEXPORT))) {
      // ほかのモジュールから読んだ名前を出し直す行は、まとめると要らない(元のモジュールが export している)。
      const own = names(match[1]).filter((local) => !imported.has(local));
      if (own.length) throw new Error(`${name}: 自分で宣言した名前は、宣言に export を付ける: ${own.join(', ')}`);
    } else if (/^import\b/.test(line) || /^export (\*|default\b|\{)/.test(line)) throw new Error(`${name}: まとめられない import か export: ${line}`);
    else body.push(line);
  }
  for (const line of body) if (/^(?:export )?(?:const|let|var) +[{[]/.test(line)) throw new Error(`${name}: 一番外側で分割代入を使わない: ${line}`);
  const declared = body.map((line) => line.match(DECLARED)?.[1]).filter(Boolean);
  return { name, deps, nodeImports, body: body.join('\n').trim(), declared };
}

// 依存の順(依存されるものが先)。同じ段では名前の順にする。
function ordered(modules) {
  const done = new Set();
  const visiting = new Set();
  const out = [];
  const visit = (name, chain) => {
    if (done.has(name)) return;
    if (visiting.has(name)) throw new Error(`依存が循環している: ${[...chain, name].join(' → ')}`);
    const module = modules.get(name);
    if (!module) throw new Error(`無いモジュールを読んでいる: ${name}(${chain.at(-1)})`);
    visiting.add(name);
    for (const dep of [...module.deps].sort()) visit(dep, [...chain, name]);
    visiting.delete(name);
    done.add(name);
    out.push(module);
  };
  for (const name of [...modules.keys()].sort()) visit(name, []);
  return out;
}

export function bundle() {
  const modules = new Map(fs.readdirSync(SRC).filter((name) => name.endsWith('.mjs')).sort().map((name) => [name, readModule(name)]));
  const order = ordered(modules);

  const owner = new Map();
  for (const module of order) {
    for (const name of module.declared) {
      if (owner.has(name)) throw new Error(`一番外側の名前が重なる: ${name}(${owner.get(name)} と ${module.name})`);
      owner.set(name, module.name);
    }
  }
  const imports = new Map();
  for (const module of order) {
    for (const item of module.nodeImports) {
      const seen = imports.get(item.local);
      if (seen && (seen.from !== item.from || seen.default !== item.default)) throw new Error(`import の名前が重なる: ${item.local}(${seen.from} と ${item.from})`);
      if (owner.has(item.local)) throw new Error(`import の名前が、宣言と重なる: ${item.local}(${owner.get(item.local)})`);
      imports.set(item.local, item);
    }
  }
  const byModule = new Map();
  for (const item of imports.values()) {
    const entry = byModule.get(item.from) ?? { default: [], named: [] };
    (item.default ? entry.default : entry.named).push(item.local);
    byModule.set(item.from, entry);
  }
  const importLines = [...byModule.keys()].sort().flatMap((from) => {
    const entry = byModule.get(from);
    return [...entry.default.sort().map((local) => `import ${local} from '${from}';`), ...(entry.named.length ? [`import { ${entry.named.sort().join(', ')} } from '${from}';`] : [])];
  });

  return [
    '// dotagents の hook の入口。plugin/src/ のモジュールと plugin/core/ の文を、tools/bundle.mjs が 1 つにまとめた生成物で、手で編集しない。',
    '//',
    '//   node dotagents.mjs <claude|codex> <session|subagent|tool>',
    '//   node dotagents.mjs antigravity <session|tool>',
    '',
    ...importLines,
    '',
    ...order.flatMap((module) => [`// ======================================================================== src/${module.name}`, '', module.body, '']),
  ].join('\n');
}

if (import.meta.url === pathToFileURL(process.argv[1] ?? '').href) {
  const text = bundle();
  fs.writeFileSync(OUT, text);
  process.stdout.write(`${path.relative(process.cwd(), OUT)}: ${Buffer.byteLength(text)} bytes\n`);
}
