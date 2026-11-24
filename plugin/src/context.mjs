// 役ごとに、常に文脈へ入れる文を組み立てる。3 つのホストの受け口が、同じこの関数を呼ぶ。
//
// 入れるのは、核(どの役にも)、進める役の文(進める役にだけ)、プロジェクトが選んだ流の文(その流が入れる役にだけ)、
// プロジェクトの宣言から導いた事実である。役の仕事の中身は、役の定義(agents/)が持ち、ホストが役の文脈に入れる。
// 利用者が頼んだ場面の手順は、スキルが持つ。

import fs from 'node:fs';
import path from 'node:path';
import { list, readDeclaration } from './declaration.mjs';
import { roles } from './roles.mjs';
import { PLUGIN_ROOT } from './root.mjs';
import { appliesTo, catalog, chosenStyles, readStyle } from './style.mjs';

export { PLUGIN_ROOT };

// 役が毎回読む文の上限(文字)。足すたびに、ほかの文が読まれる度合いが下がる。超えたらテストが落ちる。
// 数えるのは、核、進める役の文、選んだ流の文、役の定義の本文である。宣言から導いた事実(決定、検査の入口)は、
// プロジェクトが持つものなので数えない。7.x では常設の文が 6,149 字になり、読まれない文が増えた。
// これは、ハーネスが自分の大きさに掛ける上限である。エージェントの働き方に掛ける上限は、持たない。
export const BUDGET = { lead: 6000, subagent: 4000 };

const TIERS = [
  ['edit', '編集'],
  ['commit', 'コミット'],
  ['push', 'push'],
  ['release', '版'],
];

export const coreText = (name) => fs.readFileSync(path.join(PLUGIN_ROOT, 'core', `${name}.md`), 'utf8').trim();

function projectFacts({ role, value, error, unknown }) {
  const parts = [];
  if (role === 'lead') {
    if (error) parts.push(`プロジェクトの宣言が読めない(${error})。宣言が無いものとして動いている。利用者に知らせる。`);
    if (unknown.length) parts.push(`宣言の style に、このハーネスの知らない流がある(${unknown.join('、')})。その軸は選ばれていないものとして動いている。利用者に知らせる。`);
  }
  const decisions = list(value.decisions);
  if (decisions.length) parts.push(['# このプロジェクトで続いている決定', ...decisions.map((line) => `- ${line}`)].join('\n'));
  const checks = TIERS.filter(([key]) => typeof value.checks?.[key] === 'string' && value.checks[key]);
  if (checks.length) {
    const lines = ['# 検査の入口', ...checks.map(([key, label]) => `- ${label}: \`${value.checks[key]}\``)];
    const heavy = checks.filter(([key]) => key === 'push' || key === 'release').map(([key, label]) => (key === 'push' ? 'push の段' : `${label}の段`));
    if (heavy.length && (role === 'builder' || role === 'reviewer')) lines.push('', `${heavy.join('と')}のコマンドは、進める役が回す。この役がそのまま実行すると止まる。対象を絞った実行は止まらない。`);
    parts.push(lines.join('\n'));
  }
  if (role === 'lead') {
    const delegated = list(value.delegated);
    if (delegated.length) parts.push(`# 任されている操作\n\n次の種類は、確かめずに進める: ${delegated.join('、')}`);
  }
  return parts.join('\n\n');
}

// 宣言から導かない文。核、進める役の文、選んだ流のうちこの役に入るもの。
function standing(role, styles) {
  const parts = [coreText('core')];
  if (role === 'lead') parts.push(coreText('lead'));
  for (const style of styles) if (appliesTo(style, role)) parts.push(style.body);
  return parts;
}

// 役が毎回読む文の字数。hook が入れる文に、ホストが入れる役の定義の本文を足す。上限と比べるのに使う。
export function standingSize(role, styles = []) {
  const body = roles().find((definition) => definition.name === role)?.body ?? '';
  return [...standing(role, styles), body].filter(Boolean).join('\n\n').length;
}

// どの流を選んでも上限に収まるかを見るための、軸ごとに最も長い流を選んだときの字数。
export function largestSize(role) {
  const styles = Object.entries(catalog()).flatMap(([axis, names]) => {
    const sized = names.map((name) => readStyle(axis, name)).filter((style) => appliesTo(style, role)).map((style) => [style, standingSize(role, [style])]);
    return sized.length ? [sized.sort((a, b) => b[1] - a[1])[0][0]] : [];
  });
  return standingSize(role, styles);
}

export const budgetOf = (role) => (role === 'lead' ? BUDGET.lead : BUDGET.subagent);

export function contextFor({ role = 'lead', cwd = process.cwd() } = {}) {
  const { value, error } = readDeclaration(cwd);
  const { chosen, unknown } = chosenStyles(value);
  const parts = standing(role, chosen);
  const facts = projectFacts({ role, value, error, unknown });
  if (facts) parts.push(facts);
  return parts.join('\n\n');
}
