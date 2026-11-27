// ロールごとに、常にコンテキストに読み込ませる文を組み立てる。どのホストの受け口も、同じこの関数を呼ぶ。
//
// 文は H1 が 2 つである。「dotagents の既定のルール」(core/ の文)と、「このプロジェクトの設定」(`dotagents.jsonc` から導いた事実)。
// 既定のルールは、H2 が分野、H3 が話題で、どの部分をどのロールが読むかは、下の OUTLINE の 1 か所にだけ持つ。
// git は trunk、設計は layered に固定していて、プロジェクトは選べない。合わないプロジェクトは、既定のルールの冒頭のとおり、
// プロジェクトの決めごと(`decisions`、AGENTS.md)が優先する。サブエージェントの仕事の中身は、エージェントの定義(agents/)が持ち、
// ホストがサブエージェントのコンテキストに読み込ませる。利用者が頼んだ場面の手順は、スキルが持つ。

import fs from 'node:fs';
import path from 'node:path';
import { CHECK_STAGES, list, readDeclaration } from './declaration.mjs';
import { roles } from './roles.mjs';
import { PLUGIN_ROOT } from './root.mjs';

export { PLUGIN_ROOT };

export const coreText = (name) => fs.readFileSync(path.join(PLUGIN_ROOT, 'core', `${name}.md`), 'utf8').trim();

export const RULES_TITLE = 'dotagents の既定のルール';
export const SETTINGS_TITLE = 'このプロジェクトの設定(.agents/dotagents.jsonc)';

// 既定のルールの順番と、各部分を読むロール。all はどのロールにも、main はメインのセッション(オーケストレーター)にだけ入る。
// 各部分のファイル(core/<file>.md)は、H3 以下だけを持つ。H2 は、中身のある部分が 1 つでもあるときだけ出す。
export const OUTLINE = [
  { title: '基本方針', parts: [{ file: 'principles', readers: 'all' }] },
  { title: '設計', parts: [{ file: 'design', readers: 'all' }, { file: 'layered', readers: 'all' }, { file: 'testing', readers: 'all' }, { file: 'architecture', readers: 'all' }] },
  { title: '決定と記録', parts: [{ file: 'decisions', readers: 'all' }, { file: 'records', readers: 'main' }] },
  { title: '進行', parts: [{ file: 'progress', readers: 'main' }] },
  { title: 'Git', parts: [{ file: 'commits', readers: 'all' }, { file: 'branches', readers: 'main' }] },
  { title: 'GitHub', parts: [{ file: 'github', readers: 'main' }] },
];

// `.agents/dotagents.jsonc` の項目と書き方は、schema の description の 1 か所にだけ書く。エージェントがそこを読めるように、
// plugin の中の実際のパスを示す。パスは、plugin がインストールされた場所によって変わるので、core/ のファイルには書けない。
// そのため、Antigravity の静的なルール(rules/AGENTS.md)には入れず、hook が毎回導いて入れる。
export const SCHEMA_FILE = path.join(PLUGIN_ROOT, 'schema', 'dotagents.schema.json');
const POLICY_TITLE = OUTLINE[0].title;
const schemaNote = () => `\`.agents/dotagents.jsonc\` の項目と書き方は \`${SCHEMA_FILE}\` にある。`;

// readers に挙げた種類の部分のうち、role が読むものを、H2 を付けて並べる。withSchema が真なら、基本方針に schema の場所を添える。
function sections(role, readers, withSchema = false) {
  const reads = (part) => readers.includes(part.readers) && (part.readers === 'all' || role === 'orchestrator');
  return OUTLINE.flatMap(({ title, parts }) => {
    const texts = parts.filter(reads).map((part) => coreText(part.file));
    if (withSchema && title === POLICY_TITLE) texts.push(schemaNote());
    return texts.length ? [[`## ${title}`, ...texts].join('\n\n')] : [];
  });
}

// どのロールにも入る文。Antigravity では、hook ではなく plugin のルール(rules/AGENTS.md)として読み込ませる。
export const sharedText = () => [`# ${RULES_TITLE}`, coreText('preamble'), ...sections('worker', ['all'])].join('\n\n');

// `dotagents.jsonc` から導かない文。shared が偽のときは、ほかの経路(rules/AGENTS.md)で入るどのロールにも入る部分を外し、
// schema の場所とメインのセッションだけの部分を「(続き)」として返す。同じ文を 2 回読み込ませないためである。
function standing(role, shared = true) {
  if (shared) return [`# ${RULES_TITLE}`, coreText('preamble'), ...sections(role, ['all', 'main'], true)];
  return [`# ${RULES_TITLE}(続き)`, `## ${POLICY_TITLE}\n\n${schemaNote()}`, ...sections(role, ['main'])];
}

// ビルダーとレビュアーが実行しないチェック。
const HEAVY = { push: ['push 時', 'バッチを push する前'], release: ['リリース前', 'リリースの前'] };

function projectFacts({ role, value, error }) {
  const parts = [];
  if (role === 'orchestrator' && error) parts.push(`dotagents.jsonc を読めなかったので、無いものとして動いている。次のエラーを利用者に伝える。\n\nエラー: ${error}`);
  const decisions = list(value.decisions);
  if (decisions.length) parts.push(['## 決定事項', '', ...decisions.map((line) => `- ${line}`)].join('\n'));
  const checks = CHECK_STAGES.filter((key) => typeof value.checks?.[key] === 'string' && value.checks[key]);
  if (checks.length) {
    const lines = ['## チェックのコマンド', '', ...checks.map((key) => `- ${key}: \`${value.checks[key]}\``)];
    const heavy = checks.filter((key) => key in HEAVY).map((key) => HEAVY[key]);
    if (heavy.length && (role === 'builder' || role === 'reviewer')) lines.push('', `${heavy.map(([label]) => label).join('と')}のチェックのコマンドは、${heavy.map(([, when]) => when).join('と')}に、メインのセッションで 1 回だけ実行する。このエージェントがそのまま実行すると、hook がブロックする。対象を絞った実行はブロックしない。`);
    parts.push(lines.join('\n'));
  }
  if (role === 'orchestrator') {
    const delegated = list(value.delegated);
    if (delegated.length) parts.push(`## 委任された操作\n\n次の種類は、利用者に確認せずに進める: ${delegated.join('、')}`);
  }
  return parts.length ? [`# ${SETTINGS_TITLE}`, ...parts].join('\n\n') : '';
}

// ロールが毎回読む文の字数。hook が入れる文に、ホストが入れるエージェントの定義の本文を加えて数える。
// `dotagents.jsonc` から導いた事実(決定、チェックのコマンド)は、プロジェクトが持つものなので数えない。
// README の字数の目安と、Codex に切らずに渡せるかの確認に使う。
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
