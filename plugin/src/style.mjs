// プロジェクトが選ぶスタイル(style)。軸ごとに 1 つを、`dotagents.json` の style で選ぶ。どの軸も省ける。
//
//   styles/<軸>/<名前>.md
//
// frontmatter に、文を入れるロール(roles: orchestrator か all)と、仕組みが読む値を持つ。値は JSON で書き、読めなければ文字列とする。
// 本文は、選んだプロジェクトの、そのロールの文脈にだけ入る。スタイルの文と値の正は、このファイルの 1 か所にする。
//
// スタイルごとにハーネスを分けない。共通ルール、エージェント、外へ届く操作の確かめ、テストの基準を、スタイルの数だけ持つことになるからである。

import fs from 'node:fs';
import path from 'node:path';
import { PLUGIN_ROOT } from './root.mjs';

export const STYLE_ROOT = path.join(PLUGIN_ROOT, 'styles');
const NAME = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;

function parseValue(text) {
  try {
    return JSON.parse(text);
  } catch {
    return text;
  }
}

export function readStyle(axis, name, root = STYLE_ROOT) {
  if (!NAME.test(String(axis)) || !NAME.test(String(name))) return null;
  const file = path.join(root, axis, `${name}.md`);
  let text;
  try {
    text = fs.readFileSync(file, 'utf8');
  } catch {
    return null;
  }
  const match = text.match(/^---\r?\n([\s\S]*?)\r?\n---\r?\n([\s\S]*)$/);
  if (!match) throw new Error(`スタイルの部品に frontmatter が無い: ${file}`);
  const values = Object.fromEntries([...match[1].matchAll(/^([A-Za-z]+): *(.+)$/gm)].map(([, key, value]) => [key, parseValue(value.trim())]));
  if (values.roles !== 'orchestrator' && values.roles !== 'all') throw new Error(`スタイルの部品の roles は orchestrator か all: ${file}`);
  return { axis, name, dir: path.join(root, axis), values, body: match[2].trim() };
}

// 軸と、その軸で選べる名前の一覧。ファイルの置き場から導く。
export function catalog(root = STYLE_ROOT) {
  const result = {};
  for (const axis of fs.existsSync(root) ? fs.readdirSync(root).sort() : []) {
    if (!NAME.test(axis) || !fs.statSync(path.join(root, axis)).isDirectory()) continue;
    result[axis] = fs.readdirSync(path.join(root, axis)).filter((file) => file.endsWith('.md')).map((file) => file.slice(0, -3)).sort();
  }
  return result;
}

// `dotagents.json` の style から、選んだ部品と、読めなかった選び方を返す。知らない名前は無いものとして扱う。
export function chosenStyles(declaration, root = STYLE_ROOT) {
  const chosen = [];
  const unknown = [];
  const style = declaration?.style;
  if (style === undefined) return { chosen, unknown };
  if (!style || typeof style !== 'object' || Array.isArray(style)) return { chosen, unknown: ['style はオブジェクトで書く'] };
  for (const [axis, name] of Object.entries(style)) {
    const found = typeof name === 'string' ? readStyle(axis, name, root) : null;
    if (found) chosen.push(found);
    else unknown.push(`${axis}: ${JSON.stringify(name)}`);
  }
  return { chosen, unknown };
}

export const appliesTo = (style, role) => style.values.roles === 'all' || role === 'orchestrator';
