// 文の中でスキルを指す書き方と、ホストごとにエージェントが実際に見るスキルの名前。
//
// 文(core/、agents/、skills/)は、スキルを Claude Code の plugin での名前で、`dotagents:<スキル>` と書く。個人の環境に入れた
// Claude Code の plugin は、エージェントの定義とスキルの本文を、置き換えずにそのまま読むからである。ほかの置き方に渡す文は、
// 組み立てるとき(hook の文、Antigravity の生成、CLI が置くファイル)に、その置き方での名前に置き換える。

import fs from 'node:fs';
import path from 'node:path';
import { PLACED, PLUGIN_ROOT } from './root.mjs';

// スキルを指す書き方。バッククォートで囲む。
export const SKILL_REF = /`dotagents:([a-z0-9-]+)`/g;

// 名前の付け方。
// - plugin: 個人の環境に入れた Claude Code の plugin。Codex の plugin も同じと見る(資料に無い、未確認)。
// - bare: Antigravity の plugin。資料の例は、plugin のスキルを名前だけで呼ぶ(未確認)。
// - placed: リポジトリーに置いたとき。どのホストでも、CLI がスキルを dotagents-<スキル> の名前で置く
//   (Claude Code は .claude/skills/、Codex と Antigravity は .agents/skills/)。
export const NAMING = {
  plugin: (name) => `dotagents:${name}`,
  bare: (name) => name,
  placed: (name) => `dotagents-${name}`,
};

// placed は、hook の入口がリポジトリーに置いた本体かどうか(root.mjs)。置き方は入口の場所で決まるので、ホストに尋ねない。
export function namingFor(host, placed = PLACED) {
  if (placed) return 'placed';
  return host === 'antigravity' ? 'bare' : 'plugin';
}

// 配っているスキルの名前。hook の入口(tools/bundle.mjs が作る)には、名前の並びを埋め込む。リポジトリーに置いた本体は skills/ を持たない。
export const skillNames = (root = PLUGIN_ROOT) => fs.readdirSync(path.join(root, 'skills'), { withFileTypes: true }).filter((entry) => entry.isDirectory()).map((entry) => entry.name).sort();

// 文の中のスキルを指す箇所を、naming の名前に置き換える。配っていないスキルを指していれば止める。
export function nameSkills(text, naming) {
  const known = new Set(skillNames());
  return text.replace(SKILL_REF, (_, name) => {
    if (!known.has(name)) throw new Error(`配っていないスキルを指している: ${name}`);
    return `\`${NAMING[naming](name)}\``;
  });
}
