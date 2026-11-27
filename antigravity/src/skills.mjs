// 文の中でスキルを指す書き方と、ホストごとにエージェントが実際に見るスキルの名前。
//
// 文(core/、agents/、skills/)は、スキルを Claude Code の plugin での名前で、`dotagents:<スキル>` と書く。Claude Code は、
// plugin のエージェントの定義とスキルの本文を、置き換えずにそのまま読むからである。ほかのホストに渡す文は、組み立てるとき
// (hook の文、Antigravity の生成、CLI が置くファイル)に、そのホストでの名前に置き換える。

import fs from 'node:fs';
import path from 'node:path';
import { PLACED, PLUGIN_ROOT } from './root.mjs';

// スキルを指す書き方。バッククォートで囲む。
export const SKILL_REF = /`dotagents:([a-z0-9-]+)`/g;

// 名前の付け方。
// - plugin: Claude Code の plugin(個人の環境とリポジトリーに置いたときの両方)。Codex の plugin も同じと見る(資料に無い、未確認)。
// - bare: Antigravity の plugin。資料の例は、plugin のスキルを名前だけで呼ぶ(未確認)。
// - placed: リポジトリーに置いたときの Codex と Antigravity。CLI が .agents/skills/dotagents-<スキル>/ に置く。
export const NAMING = {
  plugin: (name) => `dotagents:${name}`,
  bare: (name) => name,
  placed: (name) => `dotagents-${name}`,
};

export function namingFor(host, placed = PLACED) {
  if (host === 'claude') return 'plugin';
  if (placed) return 'placed';
  return host === 'antigravity' ? 'bare' : 'plugin';
}

export const skillNames = (root = PLUGIN_ROOT) => fs.readdirSync(path.join(root, 'skills'), { withFileTypes: true }).filter((entry) => entry.isDirectory()).map((entry) => entry.name).sort();

// 文の中のスキルを指す箇所を、naming の名前に置き換える。配っていないスキルを指していれば止める。
export function nameSkills(text, naming) {
  const known = new Set(skillNames());
  return text.replace(SKILL_REF, (_, name) => {
    if (!known.has(name)) throw new Error(`配っていないスキルを指している: ${name}`);
    return `\`${NAMING[naming](name)}\``;
  });
}
