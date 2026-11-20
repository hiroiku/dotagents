// 役ごとに、常に文脈へ入れる文を組み立てる。3 つのホストの受け口が、同じこの関数を呼ぶ。
//
// 入れるのは、核(どの役にも)、進める役の文(進める役にだけ)、プロジェクトの宣言から導いた事実である。
// 役の仕事の中身は、役の定義(agents/)が持つ。場面ごとの手順は、スキルが持つ。

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { commandSeconds, list, readDeclaration } from './declaration.mjs';

export const PLUGIN_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

// 常設の文の上限(文字)。足すたびに、ほかの文が読まれる度合いが下がる。超えたらテストが落ちる。
export const BUDGET = { core: 900, lead: 800 };

const TIERS = [
  ['edit', '編集'],
  ['commit', 'コミット'],
  ['push', 'push'],
  ['release', '版'],
];

export const coreText = (name) => fs.readFileSync(path.join(PLUGIN_ROOT, 'core', `${name}.md`), 'utf8').trim();

export function projectFacts({ role, cwd }) {
  const { value, error } = readDeclaration(cwd);
  const parts = [];
  if (error && role === 'lead') parts.push(`プロジェクトの宣言が読めない(${error})。宣言が無いものとして動いている。利用者に知らせる。`);
  const decisions = list(value.decisions);
  if (decisions.length) parts.push(['# このプロジェクトで続いている決定', ...decisions.map((line) => `- ${line}`)].join('\n'));
  const checks = TIERS.filter(([key]) => typeof value.checks?.[key] === 'string' && value.checks[key]);
  if (checks.length) parts.push(['# 検査の入口', ...checks.map(([key, label]) => `- ${label}: \`${value.checks[key]}\``)].join('\n'));
  if (role === 'lead') {
    const delegated = list(value.delegated);
    if (delegated.length) parts.push(`# 任されている操作\n\n次の種類は、確かめずに進める: ${delegated.join('、')}`);
  }
  if (role === 'builder' || role === 'reviewer') parts.push(`この役の 1 コマンドの上限は ${commandSeconds(value)} 秒(${commandSeconds(value) * 1000} ミリ秒)である。`);
  return parts.join('\n\n');
}

export function contextFor({ role = 'lead', cwd = process.cwd() } = {}) {
  const parts = [coreText('core')];
  if (role === 'lead') parts.push(coreText('lead'));
  const facts = projectFacts({ role, cwd });
  if (facts) parts.push(facts);
  return parts.join('\n\n');
}
