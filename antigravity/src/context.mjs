// ロールごとに、常にコンテキストに読み込ませる文を組み立てる。どのホストの受け口も、同じこの関数を呼ぶ。
//
// 入れるのは、共通ルールとレイヤー構成(layered)(どのロールにも)、オーケストレーターの文(git の流れ(trunk)を含む。オーケストレーターにだけ)、
// `dotagents.jsonc` から導いた事実である。git は trunk、設計は layered に固定していて、プロジェクトは選べない。
// 合わないプロジェクトは、共通ルールのとおり、プロジェクトの決めごと(`decisions`、AGENTS.md)が優先する。サブエージェントの仕事の中身は、エージェントの定義
// (agents/)が持ち、ホストがサブエージェントのコンテキストに読み込ませる。
// 利用者が頼んだ場面の手順は、スキルが持つ。

import fs from 'node:fs';
import path from 'node:path';
import { CHECK_STAGES, list, readDeclaration } from './declaration.mjs';
import { roles } from './roles.mjs';
import { PLUGIN_ROOT } from './root.mjs';

export { PLUGIN_ROOT };

export const coreText = (name) => fs.readFileSync(path.join(PLUGIN_ROOT, 'core', `${name}.md`), 'utf8').trim();

// ビルダーとレビュアーが実行しないチェック。
const HEAVY = { push: ['push 時', 'バッチを push する前'], release: ['リリース前', 'リリースの前'] };

function projectFacts({ role, value, error }) {
  const parts = [];
  if (role === 'orchestrator' && error) parts.push(`dotagents.jsonc を読めなかったので、無いものとして動いている。次のエラーを利用者に伝える。\n\nエラー: ${error}`);
  const decisions = list(value.decisions);
  if (decisions.length) parts.push(['# プロジェクトの決定事項', ...decisions.map((line) => `- ${line}`)].join('\n'));
  const checks = CHECK_STAGES.filter((key) => typeof value.checks?.[key] === 'string' && value.checks[key]);
  if (checks.length) {
    const lines = ['# チェックのコマンド', ...checks.map((key) => `- ${key}: \`${value.checks[key]}\``)];
    const heavy = checks.filter((key) => key in HEAVY).map((key) => HEAVY[key]);
    if (heavy.length && (role === 'builder' || role === 'reviewer')) lines.push('', `${heavy.map(([label]) => label).join('と')}のチェックのコマンドは、${heavy.map(([, when]) => when).join('と')}に、メインのセッションで 1 回だけ実行する。このエージェントがそのまま実行すると、hook がブロックする。対象を絞った実行はブロックしない。`);
    parts.push(lines.join('\n'));
  }
  if (role === 'orchestrator') {
    const delegated = list(value.delegated);
    if (delegated.length) parts.push(`# 委任された操作\n\n次の種類は、利用者に確認せずに進める: ${delegated.join('、')}`);
  }
  return parts.join('\n\n');
}

// どのロールにも入る文。Antigravity では、hook ではなく plugin のルール(rules/AGENTS.md)として入れる。
const SHARED = ['core', 'layered'];
export const sharedText = () => SHARED.map(coreText).join('\n\n');

// `dotagents.jsonc` から導かない文。共通ルールとレイヤー構成はどのロールにも、オーケストレーターの文はオーケストレーターにだけ入る。
// shared が偽のときは、ほかの経路で入る共通ルールとレイヤー構成を外す。同じ文を 2 回入れないためである。
function standing(role, shared = true) {
  const parts = shared ? SHARED.map(coreText) : [];
  if (role === 'orchestrator') parts.push(coreText('orchestrator'));
  return parts;
}

// ロールが毎回読む文の字数。hook が入れる文に、ホストが入れるエージェントの定義の本文を加えて数える。
// 数えるのは、共通ルール、レイヤー構成、オーケストレーターの文、エージェントの定義の本文である。`dotagents.jsonc` から導いた事実
// (決定、チェックのコマンド)は、プロジェクトが持つものなので数えない。README の字数の目安と、Codex に切らずに渡せるかの確認に使う。
export function standingSize(role) {
  const body = roles().find((definition) => definition.name === role)?.body ?? '';
  return [...standing(role), body].filter(Boolean).join('\n\n').length;
}

export function contextFor({ role = 'orchestrator', cwd = process.cwd(), shared = true } = {}) {
  const { value, error } = readDeclaration(cwd);
  const parts = standing(role, shared);
  const facts = projectFacts({ role, value, error });
  if (facts) parts.push(facts);
  return parts.join('\n\n');
}
