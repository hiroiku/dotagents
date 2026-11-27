// ロールごとに、常に文脈へ入れる文を組み立てる。2 つのホストの受け口が、同じこの関数を呼ぶ。
//
// 入れるのは、共通ルールと設計の形(layered)(どのロールにも)、オーケストレーターの文(git の流れ(trunk)を含む。オーケストレーターにだけ)、
// `dotagents.jsonc` から導いた事実である。git は trunk、設計は layered に固定していて、プロジェクトは選べない。
// 合わないプロジェクトは、共通ルールのとおり、プロジェクトの決めごと(`decisions`、AGENTS.md)が優先する。サブエージェントの仕事の中身は、エージェントの定義
// (agents/)が持ち、ホストがサブエージェントの文脈に入れる。
// 利用者が頼んだ場面の手順は、スキルが持つ。

import fs from 'node:fs';
import path from 'node:path';
import { CHECK_STAGES, list, readDeclaration } from './declaration.mjs';
import { roles } from './roles.mjs';
import { PLUGIN_ROOT } from './root.mjs';

export { PLUGIN_ROOT };

// ロールが毎回読む文の上限(文字)。足すたびに、ほかの文が読まれる度合いが下がる。超えたらテストが落ちる。
// 数えるのは、共通ルール、設計の形、オーケストレーターの文、エージェントの定義の本文である。`dotagents.jsonc` から導いた事実(決定、チェックの入口)は、
// プロジェクトが持つものなので数えない。7.x では常設の文が 6,149 字になり、読まれない文が増えた。
// これは、ハーネスが自分の大きさに掛ける上限である。エージェントの働き方に掛ける上限は、持たない。
export const BUDGET = { orchestrator: 6000, subagent: 4000 };

export const coreText = (name) => fs.readFileSync(path.join(PLUGIN_ROOT, 'core', `${name}.md`), 'utf8').trim();

function projectFacts({ role, value, error }) {
  const parts = [];
  if (role === 'orchestrator' && error) parts.push(`dotagents.jsonc が読めない(${error})。無いものとして動いている。利用者に知らせる。`);
  const decisions = list(value.decisions);
  if (decisions.length) parts.push(['# このプロジェクトで続いている決定', ...decisions.map((line) => `- ${line}`)].join('\n'));
  const checks = CHECK_STAGES.filter((key) => typeof value.checks?.[key] === 'string' && value.checks[key]);
  if (checks.length) {
    const lines = ['# チェックの入口', ...checks.map((key) => `- ${key}: \`${value.checks[key]}\``)];
    const heavy = checks.filter((key) => key === 'push' || key === 'release').map((key) => `${key} の段階`);
    if (heavy.length && (role === 'builder' || role === 'reviewer')) lines.push('', `${heavy.join('と ')}のコマンドは、オーケストレーターが回す。このエージェントがそのまま実行すると止まる。対象を絞った実行は止まらない。`);
    parts.push(lines.join('\n'));
  }
  if (role === 'orchestrator') {
    const delegated = list(value.delegated);
    if (delegated.length) parts.push(`# 任されている操作\n\n次の種類は、確かめずに進める: ${delegated.join('、')}`);
  }
  return parts.join('\n\n');
}

// `dotagents.jsonc` から導かない文。共通ルールと設計の形はどのロールにも、オーケストレーターの文はオーケストレーターにだけ入る。
function standing(role) {
  const parts = [coreText('core'), coreText('layered')];
  if (role === 'orchestrator') parts.push(coreText('orchestrator'));
  return parts;
}

// ロールが毎回読む文の字数。hook が入れる文に、ホストが入れるエージェントの定義の本文を足す。上限と比べるのに使う。
export function standingSize(role) {
  const body = roles().find((definition) => definition.name === role)?.body ?? '';
  return [...standing(role), body].filter(Boolean).join('\n\n').length;
}

export const budgetOf = (role) => (role === 'orchestrator' ? BUDGET.orchestrator : BUDGET.subagent);

export function contextFor({ role = 'orchestrator', cwd = process.cwd() } = {}) {
  const { value, error } = readDeclaration(cwd);
  const parts = standing(role);
  const facts = projectFacts({ role, value, error });
  if (facts) parts.push(facts);
  return parts.join('\n\n');
}
