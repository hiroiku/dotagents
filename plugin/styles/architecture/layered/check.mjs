#!/usr/bin/env node
// 層の依存の向きを確かめる検査。node だけで動き、依存は無い。
//
//   node scripts/layers/check.mjs            対応表のすべての層を見る(コミットや push の段に置く)
//   node scripts/layers/check.mjs <file>…    渡したファイルだけを見る(編集の段に置く)
//
// 層とパスの対応と、層ごとに import してよい層は、同じディレクトリーの layers.json が持つ。
// dotagents の layered の流から写した雛形である。写したあとはこのプロジェクトが持ち、自由に直してよい。
//
// layers.json:
//   root         プロジェクトの根(この表から見た場所)
//   aliases      import の別名と、それが指すパス({ "@/": "src/" })
//   composition  層をまたいで import してよいファイル(コンポジションルート)。`*` と `**` が使える
//   layers[]     name(層の名前)、path(層の置き場)、may(import してよい層)、
//                packages(省かなければ、import してよい外のパッケージ。`*` が使える)、
//                context(省かなければ、層の置き場から何段目のディレクトリーが bounded context か。0 から数える。
//                        同じ層の、別のコンテキストを import できなくする)

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const config = JSON.parse(fs.readFileSync(path.join(HERE, 'layers.json'), 'utf8'));
const ROOT = path.resolve(HERE, config.root ?? '../..');
const SOURCE = /\.(?:[cm]?[jt]sx?)$/;
const SKIP = new Set(['node_modules', 'dist', 'build', 'coverage', '.git']);
const SPECIFIERS = /(?:\bfrom|\bimport\s*\(?|\brequire\s*\()\s*(['"])([^'"\n]+)\1/g;

const posix = (file) => file.split(path.sep).join('/');
const glob = (pattern) => new RegExp(`^${pattern.split(/(\*\*|\*)/).map((part) => (part === '**' ? '.*' : part === '*' ? '[^/]*' : part.replace(/[.+?^${}()|[\]\\]/g, '\\$&'))).join('')}$`);
const layers = config.layers.map((layer) => ({ ...layer, prefix: `${layer.path.replace(/\/$/, '')}/` })).sort((a, b) => b.prefix.length - a.prefix.length);
const composition = (config.composition ?? []).map(glob);

const layerOf = (relative) => layers.find((layer) => relative.startsWith(layer.prefix));
const contextOf = (layer, relative) => {
  const parts = relative.slice(layer.prefix.length).split('/');
  return Number.isInteger(layer.context) && parts.length > layer.context + 1 ? parts[layer.context] : null;
};
const packageOf = (specifier) => (specifier.startsWith('@') ? specifier.split('/').slice(0, 2).join('/') : specifier.split('/')[0]);

function target(file, specifier) {
  if (specifier.startsWith('.')) return posix(path.relative(ROOT, path.resolve(path.dirname(file), specifier)));
  for (const [alias, to] of Object.entries(config.aliases ?? {})) if (specifier.startsWith(alias)) return posix(path.join(to, specifier.slice(alias.length)));
  return null;
}

// コメントの中の import の形は数えない。文字列の中の // まで消さないよう、行の頭からのコメントだけを消す。
const code = (text) => text.replace(/\/\*[\s\S]*?\*\//g, (block) => block.replace(/[^\n]/g, ' ')).replace(/^\s*\/\/.*$/gm, '');

function violations(file) {
  const relative = posix(path.relative(ROOT, file));
  const layer = layerOf(relative);
  if (!layer || composition.some((pattern) => pattern.test(relative))) return [];
  const text = code(fs.readFileSync(file, 'utf8'));
  const found = [];
  for (const match of text.matchAll(SPECIFIERS)) {
    const specifier = match[2];
    const line = text.slice(0, match.index).split('\n').length;
    const at = `${relative}:${line}`;
    const to = target(file, specifier);
    if (to === null) {
      const name = packageOf(specifier);
      if (Array.isArray(layer.packages) && !layer.packages.some((allowed) => glob(allowed).test(name))) found.push(`${at}: ${layer.name} は外のパッケージ ${name} を import しない`);
      continue;
    }
    const other = layerOf(to);
    if (!other) continue;
    if (other === layer) {
      const [mine, theirs] = [contextOf(layer, relative), contextOf(layer, to)];
      if (mine && theirs && mine !== theirs) found.push(`${at}: ${layer.name} のコンテキスト ${mine} は、${theirs} を import しない。またぐ調整は外側の層が持つ`);
    } else if (!(layer.may ?? []).includes(other.name)) {
      found.push(`${at}: ${layer.name} は ${other.name} を import しない(${specifier})`);
    }
  }
  return found;
}

function walk(dir, out) {
  if (!fs.existsSync(dir)) return out;
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    if (SKIP.has(entry.name)) continue;
    const file = path.join(dir, entry.name);
    if (entry.isDirectory()) walk(file, out);
    else if (SOURCE.test(entry.name)) out.push(file);
  }
  return out;
}

const args = process.argv.slice(2);
const files = args.length ? args.map((file) => path.resolve(file)).filter((file) => SOURCE.test(file) && fs.existsSync(file)) : layers.flatMap((layer) => walk(path.join(ROOT, layer.path), []));
const found = files.flatMap(violations);
for (const line of found) console.log(line);
if (found.length) {
  console.log(`\n層の依存の向きに反する import が ${found.length} 件ある。向きは layers.json が決める。`);
  process.exitCode = 1;
}
