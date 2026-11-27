// dotagents の hook の入口。plugin/src/ のモジュールと plugin/core/ の文を、tools/bundle.mjs が 1 つにまとめた生成物で、手で編集しない。
//
//   node dotagents.mjs <claude|codex> <session|subagent|tool>
//   node dotagents.mjs antigravity <session|tool>

import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

// ======================================================================== src/attribution.mjs

// コミットメッセージ、PR、issue、リリースに、AI の関与を示す記述が入るのを止める。
// ホストが署名を追加するよう促すことがあり、決まりを読んでいても混じる。
//
// 見るのは、それらを書く git と gh の呼び出しだけにする。本文はコマンドの文字列に加え、
// -F や --body-file で渡すファイルの中身も読む。


const WRITES = [
  /\bgit\b[^|;&]*\bcommit\b/,
  /\bgh\s+(?:pr|issue|release)\s+(?:create|edit|comment|review|merge)\b/,
  /\bgh\s+api\b[^|;&]*\b(?:issues|pulls|releases)\b/,
];

// 署名の行と、セッションの URL
const MARKS = /Generated with \[?(?:Claude Code|Codex|Pi\b)|Co-Authored-By:[^\n]*(?:Claude|Codex|noreply@anthropic\.com|noreply@openai\.com)|claude\.ai\/code\/session/i;

// 本文をファイルで渡す指定。body=@ の形を先に試す。-F の後に body=@ が来たとき、-F <ファイル> と読み違えないため
const FILES = /(?:(?:\s-F|\s-f|\s--field)\s+body=@|\s-F\s+|\s--file[= ]|\s--body-file[= ]|\s--notes-file[= ])(['"]?)([^\s'"]+)\1/g;

export function attribution(command, cwd = process.cwd()) {
  if (!WRITES.some((pattern) => pattern.test(command))) return null;
  let text = command;
  for (const [, , file] of command.matchAll(FILES)) {
    try {
      text += `\n${fs.readFileSync(path.resolve(cwd, file), 'utf8')}`;
    } catch {}
  }
  const hit = text.match(MARKS);
  if (!hit) return null;
  return `コミットメッセージ、PR、issue、リリースに、AI の関与を示す記述(\`${hit[0].trim()}\`)を含めないでください。その行を削除してから実行し直してください。`;
}

// ======================================================================== src/core.mjs

// core/ の文(常時読み込まれる既定のルールの部分)を、名前で引く。tools/bundle.mjs が core/ から埋め込んだもの。
// 開発中の経路(ファイルが無ければ投げる)と同じく、知らない名前では投げる。

const CORE = {
  "architecture": "### ARCHITECTURE.md\n\nプロジェクトの構成(部品の境界、依存の向き、外部サービスとインフラ)は、ルートの `ARCHITECTURE.md` にある。あれば実装前に読み、構成を変えたら同じコミットで更新する。書き方は `dotagents:architecture` のスキルにある。",
  "branches": "### ブランチとマージ\n\n開発はデフォルトブランチ 1 本にマージする。リリースは、デフォルトブランチのコミットに tag を付けて行う。リリースごとのブランチは作らない。リリース済みのバージョンの修正もデフォルトブランチにマージし、次のリリースに含める。共有ブランチは、デフォルトブランチ、main、master と `.agents/dotagents.jsonc` の `protected` に書いた名前で、push には確認が要る。\n\n- 作業ブランチはデフォルトブランチから切り、マージ前に最新のデフォルトブランチへ rebase する。issue ごとのコミットを残してマージし、squash するときは、終えた issue すべての `Closes #番号` を本文に書く。\n- マージして push したら、作業ブランチを消す。worktree を使ったときは、worktree も消す。その前に、作業ブランチの最後のコミットがマージ先に入り、マージ先が push 済みであることを調べる。squash でマージしたブランチは `git branch --merged` では見分けられない。",
  "commits": "### コミット\n\n- issue ごとにコミットする。主題には、使う人や業務にとって何が変わったかを書く。プロジェクトにコミットメッセージの規約(Conventional Commits など)があれば、それに従う。issue を終えるコミットの本文に `Closes #番号` を書く。",
  "decisions": "過去の決定と、issue に書かれた修正方針は、文面ではなく意図に従う。構成が変わって合わなくなっていれば、意図に沿って改め、報告に書く。意図そのものを変えるときは、利用者に伝えてから進める。",
  "design": "### 判断基準\n\n構成は、既存の構成に近いかや、広く使われているかではなく、次の性質で選ぶ。\n\n- 安全性: 権限の無い操作と、あってはならない状態を、入力によって起こせないようにする。認可は入口の 1 か所で行い、あってはならない状態は型で表現できないようにする。\n- 安定性: 実行順、同時実行、途中の失敗、同じ操作の再実行で結果が変わらないようにする。障害は検知でき、手作業なしで復旧できるようにする。\n- メンテナンス性: 1 つの事実は 1 か所にだけ持ち、一覧も含めて、ほかはそこから導出する。変更の少ない中核を、変更の多い詳細に依存させない。一覧や規則を宣言するときは、実態と照合する検査と組にする。\n- パフォーマンス: 必要な処理量を超える計算、メモリー、待ち時間を生む構造にしない。件数に比例する往復を作らず、並列にできる待ちを直列にしない。\n- スケーラビリティ: コード、データ、利用者のどれが増えても、上の 4 つを保てるようにする。\n\n1. 案を考える前に、あってはならない状態、同時に起こりうること、正とするデータ(source of truth)の持ち場所、何がどれだけ増えるかを書き出す。\n2. 案には、既存の構成の延長のほかに、構造上その問題が起きなくなる案を含める。知らない領域では、設計の質で評価されている製品の解き方、使える部品、ほかの構成の失敗例を外部の資料で調べる。\n3. 5 つを同時に満たす構成を探す。状態と部品が少ない構成ほど満たしやすい。両立しないときに限り、上に書いた性質を優先する。実装コストは比較の基準に含めず、選んだあとで伝える。\n4. 症状を隠す案(キャッシュ、チェックの追加、例外の分岐)は、原因をなくす案が成り立たないと示せたときだけ選ぶ。\n5. 選んだ理由、譲ったもの、見直す条件を、issue か設計の文書に残す。この基準は長く使うコードに適用し、捨てる前提の試作には適用しない。",
  "documents": "### 記録の置き場所\n\n- issue は作業単位の記録にする。作業が終わっても続く事実は、文書に置く。\n- 文書の置き場所は、事実の種類で決める。\n  - コードに関する決めごと(仕様、構成、API、開発の手順)は、リポジトリーの docs と `ARCHITECTURE.md` に置き、コードと同じ PR で更新する。\n  - エージェントが毎回守る決めごと(採っている技術、ファイルの配置、使うコマンド、レビューで見ないもの)は、AGENTS.md に置く。詳しい仕様や構成は docs と `ARCHITECTURE.md` に置き、AGENTS.md からリンクする。同じ事実を 2 か所に書かない。\n  - 業務の決定、運用の手順、利用者向けのマニュアルは、Wiki に置く。Wiki が使えない環境では、`docs/wiki/` に Wiki と同じ形(1 ページを 1 つの Markdown ファイル、トップを `Home.md`)で置き、ほかの docs と同じく PR で更新する。\n  - 業務の決定がコードの制約になるときは、理由を Wiki に、制約をコード(型、テスト)に置き、docs からは Wiki へリンクする。同じ事実を 2 か所に書かない。\n- issue を閉じるときは、作業のあとも続く決定を上の置き場所へ移し、issue からリンクする。\n- 文書には、作業の状態、予定、進み具合を書かない。事実が変わったら書き直し、経緯は issue に残す。",
  "github": "### issue\n\n- 1 つの issue は、マージした時点で動作する範囲にする。タイプ、ラベル、マイルストーン、担当者は、そのリポジトリーで使われている値から選ぶ。マイルストーンの名前は、プロジェクトに決まりが無ければ、リリースの tag と同じにする。Projects を使っているリポジトリーでは、着手したらステータスを進める。\n- 本文は、それだけ読めばいまの状態が分かる要約に保ち、状態が変わるたびに書き直す。書くのは、いまの状態、決めたこと(日と人)、判断を求めていること(選択肢、おすすめ、トレードオフ)である。コメントは時系列の記録にし、書き直さない。issue とマイルストーンに、見込みから導いた期日や着手予定は書かない。利用者やプロジェクトが期日を決めたときは、それを書く。\n- issue は、変更がすべてマージ先に入ったときに閉じる。デフォルトブランチ以外へのマージでは `Closes` が効かないので、push のあとに自分で閉じ、PR は issue にリンクする。一部だけ入った issue は開いたままにし、入ったものと残りを本文に書く。閉じる理由は、実際に起きたことに合わせる。\n- 見つけた別の問題を issue にするかは、利用者の基準で決める。基準が無ければ、選べる形で示す。すべてを issue にすると、閉じる数より増える数が上回る。\n\n開いている issue が減らないときは `dotagents:triage` のスキルを読む。\n\n### PR\n\n- PR の base はデフォルトブランチにする。\n- PR を draft で開くリポジトリーでは、検証が済んでから ready にする。\n\n### リリース\n\nリリースするときは `dotagents:releases` のスキルを読む。",
  "layered": "### レイヤー構成(layered)\n\n層は `app-kernel`、`domain`、`application`、`interface`、`infrastructure`、`frameworks` の 6 つで、依存は外側から内側へ向ける。\n\nimport してよい層:\n\n- `app-kernel`: なし\n- `domain`: `app-kernel`\n- `application`: `app-kernel`、`domain`\n- `interface`: `app-kernel`、`application`\n- `infrastructure`: `app-kernel`、`application`\n- `frameworks`: `app-kernel`、`interface`(コンポジションルートは例外)\n\n`domain` は、ほかの bounded context も import しない。\n\n外部パッケージは、性質によって扱いを分ける。\n\n- 純粋な計算のパッケージ(金額の 10 進数計算、日付の計算、検証など)は、`domain` と `application` でも使ってよい。どれを許すかは、プロジェクトが lint の許可リストで決める。ライブラリの型は `domain` の公開する型に出さず、値オブジェクトで包む。\n- 実行のたびに結果が変わるもの(UUID の生成、現在時刻、乱数)は、`domain` の中で生成しない。ポートで受け取るか、`application` で生成して渡す。テストで値を固定できるようにするためである。\n- I/O、フレームワーク、ベンダーの SDK は、`domain` と `application` で import しない。import するのは `infrastructure` と `frameworks` だけである。\n\n依存の向き、下に書くファイルの配置と命名は、文やレビューではなく、プロジェクトの lint かチェックで検出する。それらを検出する lint がプロジェクトに無ければ、作ることを利用者に提案する。チェックを通すために例外を追加しない。\n\n- ファイルは `src/<層>/<種類>/<context>/<名前>.<種類>.ts` に置くのを既定にする。`<名前>` は、そのファイルが公開する型の名前を kebab-case にしたものである。\n- `<context>` は bounded context(同じ言葉が同じ意味を持つ業務の範囲)である。ユースケース、技術の仕組み、外部システムの名前で `<context>` を作らない。ユースケースはファイルで分ける。\n- bounded context の名前の一覧と、それぞれが指す業務の範囲(1 文)は、コードの 1 か所で宣言する。範囲の書き漏れは型で検出し、`<context>` の位置のディレクトリー名が一覧にあるかは lint で検出する。照合する lint の無い一覧は、実態とずれても気づけないので作らない。\n- `domain` は業務の概念と規則を持ち、bounded context ごとに分ける。bounded context をまたぐ調整は `application` が持つ。\n- `application` はユースケースを持つ。外部への依存は、ポート(種類は `port`)として `application` に業務の言葉で宣言し、実装(アダプター、種類は `adapter`)は `infrastructure` に置く。1 つのアダプターは 1 つのポートを実装する。\n- アダプターのクラス名とファイル名は、ポートの名前の先頭に、接続先の製品やサービスの名前を付けたものにする。ORM やクライアントライブラリの名前ではなく接続先の名前を使い、外部に接続しない実装には方式の名前を付ける。例: ポート `UserRepository` には `PostgresUserRepository` と `InMemoryUserRepository`、ポート `Mailer` には `SesMailer`。ポート `UserRepository` のファイルは `src/application/port/account/user-repository.port.ts`、アダプター `PostgresUserRepository` のファイルは `src/infrastructure/adapter/account/postgres-user-repository.adapter.ts` に置く。\n- `app-kernel` は、この形を動かす部品(`Result`、基底のエラー型)だけを持つ。別のプロダクトに持っていくときに名前を変えなければならないものは置かない。利用箇所が多いというだけでは、ここへ移す理由にならない。\n- 技術やベンダーの名前は、`infrastructure` と `frameworks` にだけ現れる。識別子、型名、ファイル名、コメント、エラーの文も同じである。例外は lint で許可した純粋な計算のパッケージで、その名前は `domain` と `application` の import と、値オブジェクトの実装の中にだけ現れてよい。\n- 層をまたいで組み立てるのは、デプロイ単位ごとに 1 つのコンポジションルートだけにする。内側は依存を引数で受け取る。コンテナーやリゾルバーを内側へ渡すと、import の関係が実際の依存を表さなくなる。\n- 型とヘルパーは、所有するもののそばに置く。ユースケースの入出力はユースケース、外部とのやりとりの型はポート、行や SDK の型は実装の中が持つ。`dtos/` や `types/` のようなディレクトリーを作らない。\n- 契約に含まれる失敗は `Result` で返し、`throw` は壊れた不変条件にだけ使う。層ごとのエラーは、境界で外側のエラーに包み直し、元のエラーを `cause` に残す。\n- テストは `test/<層>/` に `src/<層>/` と同じ構成で置き、その層と `app-kernel` だけを import する。",
  "preamble": "ここにある進め方は既定である。利用者の指示、ホストの権限設定(plan モード、許可ルールなど)、プロジェクトの決めごと(AGENTS.md と下の「このプロジェクトの設定」)が、これより優先する。食い違うときは、そちらに従い、食い違いを伝える。",
  "principles": "依頼された内容を、下の「設計」の判断基準に沿って実装する。進め方は状況に応じて自分で決める。\n\n- 取り消せることは、確認せずに決めて進める。利用者に確認するのは、取り消せない操作と、外部に影響する操作(本番、公開、他者への連絡、金銭)だけにする。プロジェクトが委任した種類は、確認しない。\n- 報告には、利用者から見えて変わること、自分で決めた前提、改めた決定、見つけた別の問題、実行した確認とその結果、実行しなかった確認、残っている失敗や障害を、漏らさず書く。記号や内部の呼び名に頼らず、それだけ読んで分かるように書く。",
  "progress": "この節と、「Git」の「ブランチとマージ」、「GitHub」は、利用者とやりとりするメインのセッションが、依頼の受け付けからマージとリリースまでの進行で従うルールである。作業は issue ではなく、依頼された成果物の単位で管理する。実装を自分で行うか、サブエージェントに任せるかは、利用者の設定に従う。\n\n### 依頼の受け付け\n\n- 依頼を、使う人から見た変化として言い直し、実装する内容と設計を実装前にまとめて決める。解釈によって実装する内容が変わるときや、完了の時期や範囲を大きく変えるときは、着手前に利用者に伝え、返事を待たずに進める。\n\n### 作業の分割\n\n- issue ごとに作業を分けると、準備、コンテキストの把握、マージの固定費を毎回払う。同じ場所を触る、同じ知識が要る、同じリリースに入る issue を 1 つのバッチ(作業のまとまり)にまとめ、1 つのブランチで実装して 1 回でマージする。sub-issue には分けない。\n- 見込みの時間は、作業の大きさの目安として伝え、膨らんだときに止める判断に使う。約束した予定ではないので、見込みを積み上げて着手の日時や順番の予定を立てず、前の作業が終わったら次の作業に着手する。着手を後に回すのは、ほかの作業の結果、利用者が指定した時期、外部の状態(CI、レビューの返事など)を待つときだけにする。\n\n### チェックの実行\n\n- edit のチェック(変更したファイルの lint と型)はファイルを編集するたびに、commit のチェック(変更したファイルと、それに依存するテスト)はコミットの前に実行する。push 時のチェック(マージ後の全体の型とビルド、主要な経路)はバッチを push する前に 1 回、リリース前のチェック(全体のテスト、E2E)はリリースの前に実行する。\n- チェックは、下の「このプロジェクトの設定」の「チェックのコマンド」(`.agents/dotagents.jsonc` の `checks`)にあるコマンドで実行する。節が無ければ、プロジェクトにある既存のコマンド(タスクランナーの定義、CI の workflow)から選び、`.agents/dotagents.jsonc` の `checks` に書くことを利用者に提案する。\n- 重いチェックと CI の完了を、待つだけのコマンドで待たない。失敗したら、そのチェックだけに絞って修正する。\n- CI はローカルよりリソースが少なく、実行のたびに費用がかかり、月の上限に達すると止まることがある。CI で何が実行されるかを CI の workflow で調べ、ローカルで通してから push する。失敗したらローカルで再現して修正し、修正できたかを見るために push し直さない。続けて終わるバッチをまとめて push すると、CI の実行回数は減るが、マージは遅れる。\n\n### レビュー\n\n- 認可、金銭、データの整合性、取り消せない移行、公開している API や保存形式、広く使われる部品に触れる変更は、実装した本人とは別の観点で検証する。別の観点の検証は時間と費用がかかるので、ほかの変更には行わない。検証はバッチごとに 1 回、差分の全体に対して行う。検証の手段は、利用者の環境に任せる。\n- 修正するのは、再現が示された要件の未達と、この変更が壊したものである。修正では、再現を失敗するテストとして先に書いてから直す。同じ種類の指摘が別のバッチでも出たら、型、lint、テスト、共通の部品で 1 か所で検出できるようにする。\n- 見込みを大きく超えた、同じ指摘が残った、修正が新しい不具合を持ち込んだ、のどれかが起きたら、場当たり的な修正を重ねずに要件を読み直し、設計を見直す。",
  "records": "- 実装の前に、依頼が触る場所に関係する issue(開いているものと閉じたもの)、AGENTS.md の決めごと、文書(`ARCHITECTURE.md`、docs、Wiki)の該当箇所を調べる。依頼と過去の決定の食い違いや、依頼に抜けている前提があれば、着手前に利用者に示し、返事を待たずに、新しい依頼を優先して進める。\n- 状態は issue に、プロジェクトの決定は AGENTS.md に残し、新しいセッションが引き継ぎなしで続けられるようにする。AGENTS.md の決定には、理由と見直す条件(日付ではなく条件)を添える。\n- 決定を改めたら、いまの状態を書く場所(issue の本文、AGENTS.md、文書)を、改めた変更と同じタイミングで書き直す。経緯の記録(issue のコメント、コミット、PR)は書き直さず、古い決定には置き換わった先を書き添える。1 つの決定を、いまの状態として書くのは 1 か所にする。",
  "testing": "### テスト\n\n- 決まりと不変条件は、文やレビューではなく、型、lint、テストで検出する。軽いチェックで検出できるものを、重いチェックに頼らない。\n- テストは、実行するたびに時間と CI の費用を使い、構成を変えるたびに更新の手間になる。[Test Desiderata](https://testdesiderata.com/)(Kent Beck)の性質から、対象に必要なものを選ぶ。性質は互いに補うことも、トレードオフになることもある。テストで検証するのは使う人や業務から見た振る舞いにし、構造だけを変えても失敗しないようにする。\n- 文言、色、配置はテストしない。フォーカスの移動先や読み上げは振る舞いなので、ブラウザーを起動しないテストで検証する。ブラウザーと E2E は、業務の責務として説明できる経路に絞る。\n- 要件が変わって期待値が変わったとき以外は、既存のテストを消す、スキップする、期待値を緩める、のどれかで通さない。テストが誤っているか、要件を満たせないと分かったら、回避せずに報告する。\n- 型、lint、ほかのテストが検出することに、テストを追加しない。ソースを文字列として読むチェック(未使用、構造、命名、配置)は lint として、振る舞いのテストと分ける。"
};

export const coreText = (name) => {
  if (!Object.hasOwn(CORE, name)) throw new Error(`core の文が無い: ${name}`);
  return CORE[name];
};

// ======================================================================== src/jsonc.mjs

// コメント(`//` と `/* */`)と、末尾のカンマを許す JSON の読み取り。依存を持たない。
//
// 文字列を読み分けるので、文字列の中の `//` やエスケープした引用符は壊さない。ほかは JSON と同じ文法で、読めないときは、
// 読めなくなった文字の行と列(1 から数える。列は UTF-16 の単位)を添えて投げる。
// JSON.parse の誤りの文は、実行環境ごとに違う。位置を自分で持つために、読み取りは自分で書く。

const MAX_DEPTH = 64;
const ESCAPES = { '"': '"', '\\': '\\', '/': '/', b: '\b', f: '\f', n: '\n', r: '\r', t: '\t' };
const NUMBER = /-?(?:0|[1-9]\d*)(?:\.\d+)?(?:[eE][+-]?\d+)?/y;

export function parseJsonc(text) {
  const source = String(text);
  let at = source.charCodeAt(0) === 0xfeff ? 1 : 0;

  function fail(message, position = at) {
    const before = source.slice(0, position);
    const line = before.split('\n').length;
    const column = position - (before.lastIndexOf('\n') + 1) + 1;
    throw new SyntaxError(`${line} 行 ${column} 列: ${message}`);
  }

  // 空白とコメントを読み飛ばす。
  function skip() {
    for (;;) {
      const char = source[at];
      if (char === ' ' || char === '\t' || char === '\n' || char === '\r') at += 1;
      else if (char === '/' && source[at + 1] === '/') {
        const end = source.indexOf('\n', at);
        at = end < 0 ? source.length : end + 1;
      } else if (char === '/' && source[at + 1] === '*') {
        const end = source.indexOf('*/', at + 2);
        if (end < 0) fail('コメントが閉じられていません', at);
        at = end + 2;
      } else return;
    }
  }

  function string() {
    at += 1;
    let out = '';
    for (;;) {
      const char = source[at];
      if (char === undefined || char === '\n' || char === '\r') fail('文字列が閉じられていません');
      if (char === '"') {
        at += 1;
        return out;
      }
      if (char < ' ') fail('文字列に、改行などの制御文字は書けません');
      if (char !== '\\') {
        out += char;
        at += 1;
        continue;
      }
      const next = source[at + 1];
      if (next === 'u') {
        const hex = source.slice(at + 2, at + 6);
        if (!/^[0-9a-fA-F]{4}$/.test(hex)) fail('\\u の後ろには 16 進数 4 桁が必要です', at + 2);
        out += String.fromCharCode(Number.parseInt(hex, 16));
        at += 6;
      } else if (next !== undefined && Object.hasOwn(ESCAPES, next)) {
        out += ESCAPES[next];
        at += 2;
      } else fail('使えないエスケープです', at + 1);
    }
  }

  function number() {
    NUMBER.lastIndex = at;
    const found = NUMBER.exec(source);
    if (!found) fail('値を読み取れません');
    at += found[0].length;
    if (/[\w.+-]/.test(source[at] ?? '')) fail('数値を読み取れません');
    return Number(found[0]);
  }

  function literal(word, value) {
    if (!source.startsWith(word, at) || /[\w$]/.test(source[at + word.length] ?? '')) fail('値を読み取れません');
    at += word.length;
    return value;
  }

  // 要素の並び。open の直後から、close の直前まで読む。末尾のカンマは許す。
  function sequence(close, item) {
    at += 1;
    skip();
    while (source[at] !== close) {
      item();
      skip();
      if (source[at] === ',') {
        at += 1;
        skip();
      } else if (source[at] !== close) fail(`',' か '${close}' が必要です`);
    }
    at += 1;
  }

  function value(depth) {
    skip();
    if (depth > MAX_DEPTH) fail('入れ子が深すぎます');
    const char = source[at];
    if (char === '{') {
      const object = {};
      sequence('}', () => {
        if (source[at] !== '"') fail('キーは " で囲んだ文字列で書いてください');
        const key = string();
        skip();
        if (source[at] !== ':') fail("':' が必要です");
        at += 1;
        // __proto__ も、ふつうのキーとして持つ。代入にすると、プロトタイプを書き換える。
        Object.defineProperty(object, key, { value: value(depth + 1), enumerable: true, writable: true, configurable: true });
      });
      return object;
    }
    if (char === '[') {
      const array = [];
      sequence(']', () => array.push(value(depth + 1)));
      return array;
    }
    if (char === '"') return string();
    if (char === 't') return literal('true', true);
    if (char === 'f') return literal('false', false);
    if (char === 'n') return literal('null', null);
    return number();
  }

  const result = value(0);
  skip();
  if (at < source.length) fail('値のあとに余分な文字があります');
  return result;
}

// ======================================================================== src/declaration.mjs

// プロジェクトの `.agents/dotagents.jsonc`。プロジェクトが自分で書き、仕組み(hook)が読む。どの項目も省ける。
// コメント(`//`、`/* */`)と末尾のカンマを書ける(jsonc.mjs)。古い名前の `dotagents.json` は読まない。
//
//   protected  共有ブランチとして扱う名前。リモートのデフォルトブランチと main、master は、書かなくても含まれる。
//              `*` が使える。
//   delegated  確かめずに進めてよいと、プロジェクトが任せた種類。`種類` か `種類:対象`。
//   checks     チェックごとのコマンド(edit、commit、push、release)。エージェントのコンテキストにチェックのコマンドとして入る。
//              hook はチェックを実行しない。push と release に置いたコマンドは、ビルダーとレビュアーが実行するとブロックする。
//   allowAiAttribution  true と書くと、コミット、PR、issue、リリースに AI の関与を示す記述を書くコマンドを通す。書かなければブロックする。
//   decisions  非推奨。プロジェクトの決めごとは AGENTS.md に書く。9.x のあいだは、どのエージェントも読む。10.0.0 で読まなくなる。
//
// decisions のほかは、確認ルールを動かすか、hook が実行するコマンドを決める。書き換えは、それ自体を確かめる
// (guard.mjs の policy)。
//
// `style`(git と設計のスタイルの選択)は、もう読まない。残っていても、エラーにも、確認ルールの変更にもしない。
//
// 時間や数の上限は、ここに持たない。数値は決まりとして読まれ、状況に合わなくても守られる。上限が要るプロジェクトは、
// 理由と一緒に AGENTS.md に書く。


export const DECLARATION = path.join('.agents', 'dotagents.jsonc');
// 読む項目。schema/dotagents.schema.json の項目と一致することを、テストが守る。`$schema` はエディターのための指定で、読まない。
export const KEYS = ['$schema', 'protected', 'delegated', 'checks', 'allowAiAttribution', 'decisions'];
export const CHECK_STAGES = ['edit', 'commit', 'push', 'release'];
const POLICY_KEYS = ['protected', 'delegated', 'checks', 'allowAiAttribution'];

// コメントと末尾のカンマを許す。読めなければ、行と列を添えて投げる。
export function parseDeclaration(text) {
  const value = parseJsonc(text);
  if (!value || typeof value !== 'object' || Array.isArray(value)) throw new Error('dotagents.jsonc は、全体を 1 つのオブジェクト({ … })で書いてください');
  return value;
}

// cwd から上へたどり、最初に見つかった `dotagents.jsonc` を読む。worktree の中では、その worktree のものが先に見つかる。
export function findDeclaration(cwd) {
  let dir = path.resolve(cwd);
  for (;;) {
    const file = path.join(dir, DECLARATION);
    if (fs.existsSync(file)) return file;
    const parent = path.dirname(dir);
    if (parent === dir) return null;
    dir = parent;
  }
}

export function readDeclaration(cwd) {
  const file = findDeclaration(cwd);
  if (!file) return { file: null, root: null, value: {} };
  const root = path.dirname(path.dirname(file));
  try {
    return { file, root, value: parseDeclaration(fs.readFileSync(file, 'utf8')) };
  } catch (error) {
    return { file, root, value: {}, error: String(error.message ?? error) };
  }
}

export const list = (value) => (Array.isArray(value) ? value.filter((item) => typeof item === 'string' && item) : []);

export const policyOf = (declaration) => JSON.stringify(POLICY_KEYS.map((key) => declaration?.[key] ?? null));

// ======================================================================== src/root.mjs

// この plugin の根。ほかのモジュールは、ここから中身の場所を導く。

export const PLUGIN_ROOT = path.dirname(fileURLToPath(import.meta.url));

// プロジェクトのリポジトリーに置いたときの、本体の場所(ルートからの相対パス)と、置いたファイルの記録。
// 記録は CLI(cli/)が書き、置いたファイルのハッシュと配ったバージョンを持つ。hook は、記録の有無だけを読む。
export const PLACED_DIR = '.agents/dotagents';
export const PLACED_RECORD = 'placed.json';

// hook の入口。src/ のモジュールと core/ の文を 1 つにまとめたファイルで、plugin の根に置く(tools/bundle.mjs が作る)。
// ホストの hook の定義は、このファイルを呼ぶ。
export const BUNDLE_FILE = 'dotagents.mjs';

// この plugin が、プロジェクトのリポジトリーに置いたものかどうか。個人の環境にインストールした plugin には、記録が無い。
export const PLACED = fs.existsSync(path.join(PLUGIN_ROOT, PLACED_RECORD));

// cwd から上へたどり、dotagents を置いたリポジトリーの中かを返す。git のルート(.git がある場所)で止める。
export function placedProject(cwd) {
  let dir = path.resolve(cwd);
  for (;;) {
    if (fs.existsSync(path.join(dir, PLACED_DIR, PLACED_RECORD))) return dir;
    const parent = path.dirname(dir);
    if (parent === dir || fs.existsSync(path.join(dir, '.git'))) return null;
    dir = parent;
  }
}

// ======================================================================== src/skills.mjs

// 文の中でスキルを指す書き方と、ホストごとにエージェントが実際に見るスキルの名前。
//
// 文(core/、agents/、skills/)は、スキルを Claude Code の plugin での名前で、`dotagents:<スキル>` と書く。個人の環境に入れた
// Claude Code の plugin は、エージェントの定義とスキルの本文を、置き換えずにそのまま読むからである。ほかの置き方に渡す文は、
// 組み立てるとき(hook の文、Antigravity の生成、CLI が置くファイル)に、その置き方での名前に置き換える。


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
export const skillNames = () => ["architecture","prompting","releases","triage"];

// 文の中のスキルを指す箇所を、naming の名前に置き換える。配っていないスキルを指していれば止める。
export function nameSkills(text, naming) {
  const known = new Set(skillNames());
  return text.replace(SKILL_REF, (_, name) => {
    if (!known.has(name)) throw new Error(`配っていないスキルを指している: ${name}`);
    return `\`${NAMING[naming](name)}\``;
  });
}

// ======================================================================== src/roles.mjs

// エージェントの定義(agents/*.md)を読み、ホストごとの形に直す。正は agents/*.md の 1 か所で、ほかはここから導く。


export function readRole(file) {
  const match = fs.readFileSync(file, 'utf8').match(/^---\r?\n([\s\S]*?)\r?\n---\r?\n([\s\S]*)$/);
  if (!match) throw new Error(`エージェントの定義に frontmatter が無い: ${file}`);
  const fields = Object.fromEntries([...match[1].matchAll(/^([A-Za-z-]+): *(.+)$/gm)].map(([, key, value]) => [key, value.trim()]));
  if (!fields.name || !fields.description) throw new Error(`エージェントの定義に name か description が無い: ${file}`);
  return { ...fields, body: match[2].trim() };
}

export function roles(root = PLUGIN_ROOT) {
  const dir = path.join(root, 'agents');
  return fs.readdirSync(dir).filter((name) => name.endsWith('.md')).sort().map((name) => readRole(path.join(dir, name)));
}

// Codex の利用者の設定に置く TOML の先頭の行。この行があるファイルだけを、dotagents が書いたものとして書き換える。
export const CODEX_MARK = '# dotagents が生成したファイル。dotagents の更新で書き換わるので、手で編集しない。';

// Codex は plugin でエージェントを運べないので、エージェントごとの TOML を置く。モデルは書かず、利用者の Codex の設定に従わせる。
// legacy は、印を入れる前のバージョンが同じ定義から書いた中身である。naming は、本文がスキルを指す名前の付け方(skills.mjs)。
export function codexAgent(role, naming, prefix = 'dotagents') {
  const fields = { name: `${prefix}-${role.name}`, description: role.description, developer_instructions: nameSkills(role.body, naming) };
  const body = `${Object.entries(fields).map(([key, value]) => `${key} = ${JSON.stringify(value)}`).join('\n')}\n`;
  return { file: `${fields.name}.toml`, content: `${CODEX_MARK}\n${body}`, legacy: body };
}

// リポジトリーに置くときの Claude Code のエージェントの定義(.claude/agents/)。plugin の定義と同じ形で、名前に prefix を付け、
// 本文がスキルを指す名前を naming にする。frontmatter のほかの項目(ツールの許可)は、そのまま写す。
export function claudeAgent(role, naming, prefix = 'dotagents') {
  const { body, ...fields } = role;
  const name = `${prefix}-${role.name}`;
  const front = Object.entries({ ...fields, name }).map(([key, value]) => `${key}: ${value}`);
  return { file: `${name}.md`, content: `---\n${front.join('\n')}\n---\n\n${nameSkills(body, naming)}\n` };
}

// Antigravity のツールの名前(資料による、実機で未確認)。資料は、知らない名前を許可の並びに書くと、サブエージェントが止まったまま
// 進まないことがあると書く。ここに無い名前は書かない。
const ANTIGRAVITY_BY_CLAUDE = {
  Read: ['view_file'],
  Glob: ['find_by_name', 'list_dir'],
  Grep: ['grep_search'],
  Bash: ['run_command', 'manage_task'],
  Edit: ['replace_file_content', 'multi_replace_file_content'],
  Write: ['write_to_file'],
  WebFetch: ['read_url_content'],
  WebSearch: ['search_web'],
};
export const ANTIGRAVITY_TOOLS = [...new Set(Object.values(ANTIGRAVITY_BY_CLAUDE).flat())];

// Antigravity は plugin の agents/ を読む。Claude Code の定義(モデルとツールの名前)はそのまま読めないので、frontmatter を直す。
// ツールを決めていないエージェントにも、許可の並びを書く。並びを省いたときの既定は、資料の頁によって「すべて」と「無し」に分かれる。
// ルールと hook がサブエージェントに届くよう、inheritCustomizations を書く(既定でも true と資料にある)。
export function antigravityAgent(role, naming, prefix = 'dotagents') {
  const named = role.tools ? role.tools.split(',').map((name) => name.trim()).filter(Boolean) : Object.keys(ANTIGRAVITY_BY_CLAUDE);
  const tools = [...new Set(named.flatMap((name) => {
    if (!ANTIGRAVITY_BY_CLAUDE[name]) throw new Error(`Antigravity のツール名に変換できない: ${name}(${role.name})`);
    return ANTIGRAVITY_BY_CLAUDE[name];
  }))];
  const name = `${prefix}-${role.name}`;
  const front = [`name: ${name}`, `description: ${JSON.stringify(role.description)}`, 'model: inherit', 'mainAgent: false', 'subagent: true', 'inheritCustomizations: true', 'tools:', ...tools.map((tool) => `  - ${tool}`)];
  return { file: `${name}.md`, content: `---\n${front.join('\n')}\n---\n\n${nameSkills(role.body, naming)}\n` };
}

// ======================================================================== src/context.mjs

// ロールごとに、常にコンテキストに読み込ませる文を組み立てる。どのホストの受け口も、同じこの関数を呼ぶ。
//
// 文は H1 が 2 つである。「dotagents の既定のルール」(core/ の文)と、「このプロジェクトの設定」(`dotagents.jsonc` から導いた事実)。
// 既定のルールは、H2 が分野、H3 が話題で、どの部分をどのロールが読むかは、下の OUTLINE の 1 か所にだけ持つ。
// git は trunk、設計は layered に固定していて、プロジェクトは選べない。合わないプロジェクトは、既定のルールの冒頭のとおり、
// プロジェクトの決めごと(AGENTS.md)が優先する。サブエージェントの仕事の中身は、エージェントの定義(agents/)が持ち、
// ホストがサブエージェントのコンテキストに読み込ませる。利用者が頼んだ場面の手順は、スキルが持つ。



export const RULES_TITLE = 'dotagents の既定のルール';
export const SETTINGS_TITLE = 'このプロジェクトの設定(.agents/dotagents.jsonc)';

// 既定のルールの順番と、各部分を読むロール。all はどのロールにも、main はメインのセッション(オーケストレーター)にだけ入る。
// 各部分のファイル(core/<file>.md)は、H3 以下だけを持つ。H2 は、中身のある部分が 1 つでもあるときだけ出す。
export const OUTLINE = [
  { title: '基本方針', parts: [{ file: 'principles', readers: 'all' }] },
  { title: '設計', parts: [{ file: 'design', readers: 'all' }, { file: 'layered', readers: 'all' }, { file: 'testing', readers: 'all' }, { file: 'architecture', readers: 'all' }] },
  { title: '決定と記録', parts: [{ file: 'decisions', readers: 'all' }, { file: 'records', readers: 'main' }, { file: 'documents', readers: 'all' }] },
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
// naming は、スキルの名前の付け方(skills.mjs)。ルールを置くホストでの名前にする。
export const sharedText = (naming = 'plugin') => nameSkills([`# ${RULES_TITLE}`, coreText('preamble'), ...sections('worker', ['all'])].join('\n\n'), naming);

// `dotagents.jsonc` から導かない文。shared が偽のときは、ほかの経路(rules/AGENTS.md)で入るどのロールにも入る部分を外し、
// schema の場所とメインのセッションだけの部分を「(続き)」として返す。同じ文を 2 回読み込ませないためである。
function standing(role, shared = true) {
  if (shared) return [`# ${RULES_TITLE}`, coreText('preamble'), ...sections(role, ['all', 'main'], true)];
  return [`# ${RULES_TITLE}(続き)`, `## ${POLICY_TITLE}\n\n${schemaNote()}`, ...sections(role, ['main'])];
}

// `decisions` は 9.1.0 で非推奨にした。決めごとは AGENTS.md に書く。10.0.0 で読むのをやめる。それまでは読み込み、オーケストレーターに移行を提案させる。
const DECISIONS_NOTICE = '`.agents/dotagents.jsonc` の `decisions` は非推奨で、10.0.0 で読まれなくなる。利用者に、AGENTS.md へ移すことを提案する。';

// ビルダーとレビュアーが実行しないチェック。
const HEAVY = { push: ['push 時', 'バッチを push する前'], release: ['リリース前', 'リリースの前'] };

function projectFacts({ role, value, error }) {
  const parts = [];
  if (role === 'orchestrator' && error) parts.push(`dotagents.jsonc を読めなかったので、無いものとして動いている。次のエラーを利用者に伝える。\n\nエラー: ${error}`);
  const decisions = list(value.decisions);
  if (decisions.length) {
    const lines = ['## 決定事項', '', ...decisions.map((line) => `- ${line}`)];
    if (role === 'orchestrator') lines.push('', DECISIONS_NOTICE);
    parts.push(lines.join('\n'));
  }
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

// host は、文を受け取るホスト。スキルを、そのホストでエージェントが見る名前で指す。
export function contextFor({ role = 'orchestrator', cwd = process.cwd(), shared = true, host = 'claude' } = {}) {
  const { value, error } = readDeclaration(cwd);
  const parts = [nameSkills(standing(role, shared).join('\n\n'), namingFor(host))];
  const facts = projectFacts({ role, value, error });
  if (facts) parts.push(facts);
  return parts.join('\n\n');
}

// ======================================================================== src/shell.mjs

// コマンドの文字列を、単純なコマンド(語の並び)に分ける。
//
// hook が知りたいのは「何が実行されるか」だけなので、シェルの文法をすべては読まない。引用符、連結、
// リダイレクト、ヒアドキュメント、`sh -c` の入れ子、前に付く起動の語(env、sudo、npx など)を読み、
// 残りは語のまま返す。読めない形で止めないためである。


const ASSIGNMENT = /^[A-Za-z_][A-Za-z0-9_]*=/;
const KEYWORDS = new Set(['then', 'do', 'else', 'elif', 'if', 'while', 'until', '!', '{', '}', 'time', 'fi', 'done', 'esac']);
// 後ろに続くのがコマンドではなく、繰り返す値や照らし合わせる語である文。
const HEADERS = new Set(['for', 'case', 'select', 'function']);
const PREFIXES = new Set(['sudo', 'command', 'exec', 'nohup', 'builtin']);
const SHELLS = new Set(['sh', 'bash', 'zsh', 'dash']);
// rtk(出力を縮めて別のツールを実行するツール)の、後ろのコマンドをそのまま実行する下位のコマンド。
const RTK_RUNNERS = new Set(['run', 'bypass', 'proxy', 'err', 'test', 'summary']);

// 文字列を、連結の区切りで分けた語の並びにする。リダイレクトの先は語に入れず、並びの targets に集める。
export function parse(text) {
  const commands = [];
  let words = [];
  let targets = [];
  let word = null;
  let skip = false; // 次の語はリダイレクトの先
  let heredocs = [];
  const push = () => {
    if (word === null) return;
    if (skip) {
      targets.push(word);
      skip = false;
    } else {
      words.push(word);
    }
    word = null;
  };
  const end = () => {
    push();
    skip = false;
    if (words.length || targets.length) commands.push(Object.assign(words, { targets }));
    words = [];
    targets = [];
  };
  const n = text.length;
  let i = 0;
  while (i < n) {
    const c = text[i];
    if (c === '\\') {
      const next = text[i + 1] ?? '';
      word = (word ?? '') + (next === '\n' ? '' : next);
      i += 2;
    } else if (c === "'") {
      const close = text.indexOf("'", i + 1);
      const stop = close < 0 ? n : close;
      word = (word ?? '') + text.slice(i + 1, stop);
      i = stop + 1;
    } else if (c === '"') {
      let j = i + 1;
      let buffer = '';
      while (j < n && text[j] !== '"') {
        if (text[j] === '\\' && j + 1 < n && '"\\$`\n'.includes(text[j + 1])) {
          buffer += text[j + 1] === '\n' ? '' : text[j + 1];
          j += 2;
        } else {
          buffer += text[j];
          j += 1;
        }
      }
      word = (word ?? '') + buffer;
      i = j + 1;
    } else if (c === '\n') {
      end();
      i += 1;
      for (const { terminator, strip } of heredocs) i = skipHeredoc(text, i, terminator, strip);
      heredocs = [];
    } else if (c === ' ' || c === '\t') {
      push();
      i += 1;
    } else if (c === '#' && word === null) {
      const eol = text.indexOf('\n', i);
      i = eol < 0 ? n : eol;
    } else if (c === '<' && text[i + 1] === '<' && text[i + 2] !== '<') {
      push();
      let j = i + 2;
      const strip = text[j] === '-';
      if (strip) j += 1;
      while (text[j] === ' ') j += 1;
      const found = /^(['"]?)([A-Za-z_][A-Za-z0-9_]*)\1/.exec(text.slice(j));
      if (found) {
        heredocs.push({ terminator: found[2], strip });
        i = j + found[0].length;
      } else {
        i = j;
      }
    } else if (c === '>' || c === '<' || (c === '&' && text[i + 1] === '>')) {
      if (word !== null && /^\d+$/.test(word)) word = null;
      else push();
      let j = i + 1;
      while (j < n && '>&|'.includes(text[j])) j += 1;
      skip = true;
      i = j;
    } else if (c === ';' || c === '(' || c === ')' || c === '`') {
      end();
      i += 1;
    } else if (c === '&') {
      end();
      i += text[i + 1] === '&' ? 2 : 1;
    } else if (c === '|') {
      end();
      i += text[i + 1] === '|' || text[i + 1] === '&' ? 2 : 1;
    } else {
      word = (word ?? '') + c;
      i += 1;
    }
  }
  end();
  return commands;
}

function skipHeredoc(text, from, terminator, strip) {
  let i = from;
  while (i < text.length) {
    const eol = text.indexOf('\n', i);
    const stop = eol < 0 ? text.length : eol;
    const line = text.slice(i, stop);
    i = stop + 1;
    if ((strip ? line.replace(/^\t+/, '') : line) === terminator) break;
  }
  return Math.min(i, text.length);
}

// 前に付く語(代入、env、sudo、timeout、npx、rtk など)を外し、実行されるツールを先頭にする。
// 代入は assignments に集める。
export function unwrap(input) {
  const words = input.slice();
  const assignments = {};
  const dropFlags = (valued) => {
    while (words[0]?.startsWith('-')) {
      const flag = words.shift();
      if (valued.includes(flag)) words.shift();
    }
  };
  for (;;) {
    const head = words[0];
    if (head === undefined) break;
    if (HEADERS.has(head)) {
      words.length = 0;
    } else if (ASSIGNMENT.test(head)) {
      const at = head.indexOf('=');
      assignments[head.slice(0, at)] = head.slice(at + 1);
      words.shift();
    } else if (KEYWORDS.has(head) || PREFIXES.has(head)) {
      words.shift();
      if (head === 'sudo') dropFlags(['-u', '-g', '-C', '-h', '-p']);
    } else if (head === 'env') {
      words.shift();
      while (words[0] && (words[0].startsWith('-') || ASSIGNMENT.test(words[0]))) {
        const item = words.shift();
        if (item === '-u' || item === '-C' || item === '-S') words.shift();
        else if (ASSIGNMENT.test(item)) assignments[item.slice(0, item.indexOf('='))] = item.slice(item.indexOf('=') + 1);
      }
    } else if (head === 'timeout' || head === 'gtimeout') {
      words.shift();
      dropFlags(['-s', '-k', '--signal', '--kill-after']);
      words.shift();
    } else if (head === 'rtk') {
      // `rtk git push` は git push を実行する。rtk を外して、実行されるツールを読む。
      // 文字列で渡す形(`rtk run -c '…'`、`rtk err --shell sh '…'`)は、シェルに渡す形へ直して、中身を読ませる。
      words.shift();
      dropFlags([]);
      if (RTK_RUNNERS.has(words[0])) {
        words.shift();
        let script;
        let viaShell = false;
        while (words[0]?.startsWith('-')) {
          const flag = words.shift();
          if (flag === '-c' || flag === '--command') script = words.shift();
          else if (flag.startsWith('--command=')) script = flag.slice('--command='.length);
          else if (flag === '--shell') viaShell = Boolean(words.shift());
          else if (flag.startsWith('--shell=')) viaShell = true;
        }
        if (script === undefined && viaShell && words.length) script = words.join(' ');
        if (script !== undefined) words.splice(0, words.length, 'sh', '-c', script);
      }
    } else if (head === 'nice') {
      words.shift();
      if (words[0] === '-n') words.splice(0, 2);
      else if (/^-\d+$/.test(words[0] ?? '')) words.shift();
    } else if (head === 'npx' || head === 'bunx' || head === 'pnpx') {
      words.shift();
      dropFlags(['-p', '--package', '-c']);
    } else if ((head === 'pnpm' || head === 'yarn') && (words[1] === 'exec' || words[1] === 'dlx')) {
      words.splice(0, 2);
    } else if (head === 'bun' && words[1] === 'x') {
      words.splice(0, 2);
    } else {
      break;
    }
  }
  if (words.length) words[0] = path.basename(words[0]);
  return { words, assignments };
}

// 文字列に含まれる単純なコマンドを、実行される場所(cwd)と一緒に順に返す。
// `cd` は後ろのコマンドの場所を変え、`sh -c '…'` と `eval` は中身を読む。
export function simpleCommands(text, cwd = process.cwd(), depth = 0) {
  const out = [];
  let here = cwd;
  for (const raw of parse(text)) {
    const { words, assignments } = unwrap(raw);
    if (!words.length) {
      if (raw.targets?.length) out.push({ words, assignments, targets: raw.targets, cwd: here });
      continue;
    }
    const head = words[0];
    if (head === 'cd' && words[1] && !words[1].startsWith('-')) {
      here = path.resolve(here, words[1]);
      continue;
    }
    if (depth < 3 && SHELLS.has(head)) {
      const at = words.findIndex((word, index) => index > 0 && /^-[a-z]*c[a-z]*$/.test(word));
      if (at > 0 && words[at + 1] !== undefined) {
        out.push(...simpleCommands(words[at + 1], here, depth + 1));
        continue;
      }
    }
    if (depth < 3 && head === 'eval' && words.length > 1) {
      out.push(...simpleCommands(words.slice(1).join(' '), here, depth + 1));
      continue;
    }
    out.push({ words, assignments, targets: raw.targets ?? [], cwd: here });
  }
  return out;
}

// ======================================================================== src/guard.mjs

// ツールの呼び出しを、実行の前に判定する。2 つのホストの受け口が、同じこの関数を呼ぶ。
//
// 返すのは次のどれかである。
//   null                         通す
//   { decision: 'deny', … }      止めて、理由をモデルへ返す
//   { decision: 'ask', … }       利用者に確かめる(確かめる手段のあるホストでだけ返す)
//
// 確かめるのは、外部に影響する操作と、確認ルールそのものを動かす操作だけにする。プロジェクトが `dotagents.jsonc` で
// 任せた種類は通す。読めない形は通す。判定の誤りで、作業そのものを止めないためである。
// これは誤りを防ぐ仕掛けで、隔離ではない。スクリプトの中に隠した操作までは読まない。


export const CONFIRMED = 'DOTAGENTS_CONFIRMED';

// 守るファイルを書き換えるツール。これ以外は、読むだけとして通す。
const WRITERS = new Set(['sed', 'tee', 'cp', 'mv', 'rm', 'ln', 'truncate', 'dd', 'perl', 'install', 'rsync', 'patch', 'ed']);
// 人へ届くコネクターの操作。
const MESSAGE = /(?:^|[_-])(?:send|reply|forward|share|post|publish|invite|respond)(?:[_-]|$)/;

export const KIND_LABELS = {
  push: '共有ブランチへの push',
  rewrite: '共有ブランチの書き換えか削除',
  tag: 'tag の push',
  merge: 'PR のマージ',
  bypass: 'ブランチ保護を迂回するマージ',
  release: 'リリースの公開や変更',
  settings: 'リポジトリー設定の変更',
  workflow: 'workflow の起動',
  message: '他者への連絡や共有',
  instructions: '指示ファイル(AGENTS.md、CLAUDE.md)の書き換え',
  policy: '確認ルール(dotagents.jsonc)の書き換え',
};
const PACED = new Set(['builder', 'reviewer']);
// 任せられない種類。線そのものを動かすか、保護を外す操作である。
const NEVER_DELEGATED = new Set(['rewrite', 'bypass', 'policy']);
// 任せられる種類。schema の `delegated` の列挙と一致することを、テストが守る。
export const DELEGABLE = Object.keys(KIND_LABELS).filter((kind) => !NEVER_DELEGATED.has(kind));

// 1 回の判定で、手元の git に尋ねてよい時間と、GitHub に尋ねてよい時間。片方の遅さがもう片方の答えを変えないよう、
// 別々に持つ。合わせても hook の上限(10 秒)より十分短くする。上限を過ぎると、ホストは hook を失敗として扱い、
// 確かめそのものが届かない。
export const LOCAL_MS = 3000;
export const GITHUB_MS = 4000;

// file を実行する関数を返す。最初に呼ばれたときから ms の間だけ答えを待ち、過ぎたら答えが無いもの(null)とする。
export const command = (file, ms) => {
  let until = null;
  return (cwd, ...args) => {
    until ??= Date.now() + ms;
    const left = until - Date.now();
    if (left <= 0) return null;
    try {
      return execFileSync(file, args, { cwd, encoding: 'utf8', timeout: left, stdio: ['ignore', 'pipe', 'ignore'] }).trim();
    } catch {
      return null;
    }
  };
};

// 手元の git と、GitHub に尋ねる gh。
export const runners = ({ local = LOCAL_MS, github = GITHUB_MS } = {}) => ({ git: command('git', local), gh: command('gh', github) });

const glob = (pattern) => new RegExp(`^${pattern.split('*').map((part) => part.replace(/[.+?^${}()|[\]\\]/g, '\\$&')).join('.*')}$`);
const matches = (patterns, name) => patterns.some((pattern) => glob(pattern).test(name));
const first = (words) => words.find((word) => !word.startsWith('-'));

export function delegated(entries, finding) {
  if (NEVER_DELEGATED.has(finding.kind)) return false;
  return list(entries).some((entry) => {
    const at = entry.indexOf(':');
    const kind = at < 0 ? entry : entry.slice(0, at);
    if (kind !== finding.kind) return false;
    return at < 0 || glob(entry.slice(at + 1)).test(finding.target ?? '');
  });
}

// ---------------------------------------------------------------- git と gh

// main と master は、デフォルトブランチでなくても共有ブランチとして扱う。デフォルトが develop のプロジェクトでは、
// 本番のブランチがこの名前で残っていることが多く、`dotagents.jsonc` を書くまで、そこへの push が確かめなしで通っていた。
const CONVENTIONAL = ['main', 'master'];

// 共有ブランチ。リモートのデフォルトブランチ、main と master、`dotagents.jsonc` の protected を合わせる。
// ask は、git にそのリポジトリーについて尋ねる関数である。
// リモートの既定が記録されていなければ、main と master を既定とみなす。git が答えなければ、どのブランチも既定かも
// しれないので、すべてを共有ブランチとして扱う(外部に影響する側に倒す)。
function guardedBranches(ask, remote, declaration) {
  const head = ask('symbolic-ref', '-q', '--short', `refs/remotes/${remote}/HEAD`);
  const unknown = !head && ask('for-each-ref', '--format=%(refname)', `refs/remotes/${remote}/HEAD`) === null;
  const defaults = head ? [head.slice(remote.length + 1)] : CONVENTIONAL;
  return { defaults, guarded: [...new Set([...(unknown ? ['*'] : []), ...defaults, ...CONVENTIONAL, ...list(declaration.protected)])] };
}

// git の前に付く大域の指定のうち、次の語を値に取るもの。
const GIT_GLOBAL_VALUED = new Set(['-C', '-c', '--git-dir', '--work-tree', '--namespace', '--config-env', '--super-prefix', '--attr-source']);
// 尋ねるときにも渡す指定。どのリポジトリーを見るかと、設定の上書きである。設定の上書きは、設定を読むときにだけ渡す。
const REPO_GLOBALS = new Set(['--git-dir', '--work-tree', '--namespace', '--bare']);
const CONFIG_GLOBALS = new Set(['-c', '--config-env']);

// git の前に付く大域の指定を外し、下位のコマンドと、残りの語と、同じリポジトリーへ尋ねる関数を返す。
function gitCommand(words, cwd, git) {
  let dir = cwd;
  const repo = [];
  const config = [];
  let i = 1;
  while (i < words.length && words[i].startsWith('-')) {
    const word = words[i];
    const taken = GIT_GLOBAL_VALUED.has(word) ? [word, words[i + 1] ?? ''] : [word];
    if (word === '-C') dir = path.resolve(dir, taken[1] || '.');
    const name = word.split('=')[0];
    if (REPO_GLOBALS.has(name)) repo.push(...taken);
    else if (CONFIG_GLOBALS.has(name)) config.push(...taken);
    i += taken.length;
  }
  return {
    dir,
    sub: words[i],
    rest: words.slice(i + 1),
    ask: (...args) => git(dir, ...repo, ...args),
    setting: (...args) => git(dir, ...repo, ...config, 'config', ...args),
  };
}

const isLocalRemote = (ask, remote) => /^(?:\/|\.{1,2}\/|file:)/.test(ask('remote', 'get-url', remote) ?? remote);

// push を読み、外部に影響する操作を返す。
function parsePush(words, cwd, declaration, git) {
  const none = [];
  const { sub, rest, ask } = gitCommand(words, cwd, git);
  if (sub !== 'push') return none;
  const args = [];
  const flags = new Set();
  for (let k = 0; k < rest.length; k += 1) {
    const word = rest[k];
    if (!word.startsWith('-')) args.push(word);
    else if (['-o', '--push-option', '--repo', '--receive-pack', '--exec'].includes(word)) k += 1;
    else flags.add(word.split('=')[0]);
  }
  if (flags.has('--dry-run') || flags.has('-n')) return none;
  const remote = args[0] ?? 'origin';
  // 手元のディスクにあるリモートは、外部ではない。
  if (isLocalRemote(ask, remote)) return none;
  const force = flags.has('--force') || flags.has('-f') || flags.has('--force-with-lease') || flags.has('--force-if-includes');
  const remove = flags.has('--delete') || flags.has('-d');
  const { defaults, guarded } = guardedBranches(ask, remote, declaration);
  const current = () => ask('symbolic-ref', '-q', '--short', 'HEAD');
  const found = [];
  // 行き先が今いるブランチで、それが分からないとき(git が答えないとき)は、共有ブランチかもしれないものとして扱う。
  const branch = (name, rewrites, removes = false) => {
    if (!name) {
      found.push({ kind: rewrites || removes ? 'rewrite' : 'push', target: 'HEAD' });
      return;
    }
    if (matches(guarded, name)) found.push({ kind: rewrites || removes ? 'rewrite' : 'push', target: name });
  };
  if (flags.has('--all') || flags.has('--mirror') || flags.has('--branches')) {
    for (const name of defaults) if (matches(guarded, name)) found.push({ kind: force || flags.has('--mirror') ? 'rewrite' : 'push', target: name });
  }
  if (flags.has('--tags') || flags.has('--mirror')) found.push({ kind: 'tag', target: '*' });
  const specs = args.slice(1);
  if (!specs.length && !flags.has('--all') && !flags.has('--mirror') && !flags.has('--tags')) {
    const name = current();
    const upstream = name && ask('rev-parse', '--abbrev-ref', '--symbolic-full-name', `${name}@{upstream}`);
    branch(upstream?.startsWith(`${remote}/`) ? upstream.slice(remote.length + 1) : name, force, remove);
  }
  for (let k = 0; k < specs.length; k += 1) {
    let spec = specs[k];
    if (spec === 'tag') {
      k += 1;
      if (specs[k]) found.push({ kind: 'tag', target: specs[k] });
      continue;
    }
    const forced = force || spec.startsWith('+');
    if (spec.startsWith('+')) spec = spec.slice(1);
    const at = spec.indexOf(':');
    const source = at < 0 ? spec : spec.slice(0, at);
    let target = at < 0 ? spec : spec.slice(at + 1);
    if (target === 'HEAD' || target === '@') {
      branch(current(), forced, remove);
      continue;
    }
    if (target.startsWith('refs/tags/')) {
      found.push({ kind: 'tag', target: target.slice(10) });
      continue;
    }
    if (target.startsWith('refs/heads/')) target = target.slice(11);
    // 守るブランチの名前でなければ、tag かどうかを git に尋ねる。答えが無いときは、バージョン番号の形なら tag として読む。
    const named = at < 0 && !matches(guarded, target) && (ask('rev-parse', '-q', '--verify', `refs/tags/${target}`) || /^(?:[\w.-]+\/)?v?\d+\.\d+/.test(target));
    if (named && !ask('rev-parse', '-q', '--verify', `refs/heads/${target}`)) found.push({ kind: 'tag', target });
    else branch(target, forced, remove || (at >= 0 && source === ''));
  }
  return found;
}

const gitPush = parsePush;

const API_KINDS = [
  [/\/pulls\/\d+\/merge$|\/merges$/, 'merge'],
  [/\/releases(?:\/|$)/, 'release'],
  [/\/dispatches$/, 'workflow'],
  [/rulesets|\/protection|\/environments|\/collaborators|\/hooks|\/actions\/(?:secrets|variables|permissions)|\/pages|\/transfer|\/topics/, 'settings'],
];
// リポジトリーそのものへの書き込み。経路に変数があると区切りを読み違えるので、変数の無い形だけを読む。
const REPO_ROUTE = /^\/?repos\/[^/$]+\/[^/$]+$/;

function ghApi(words, cwd, declaration, git) {
  const args = words.slice(2);
  let method = null;
  let fields = false;
  const bare = [];
  for (let i = 0; i < args.length; i += 1) {
    const word = args[i];
    if (word === '-X' || word === '--method') method = args[(i += 1)];
    else if (/^(?:-X|--method=)./.test(word)) method = word.replace(/^(?:-X|--method=)/, '');
    else if (['-f', '-F', '--field', '--raw-field', '--input'].includes(word)) {
      fields = true;
      i += 1;
    } else if (['-H', '--header', '-q', '--jq', '-t', '--template', '--hostname', '--cache', '-p', '--preview'].includes(word)) i += 1;
    else if (!word.startsWith('-')) bare.push(word);
  }
  const verb = (method ?? (fields ? 'POST' : 'GET')).toUpperCase();
  if (verb === 'GET') return [];
  const route = (bare[0] ?? '').split('?')[0];
  const ref = route.match(/\/git\/refs\/(heads|tags)\/(.+)$/);
  if (ref) {
    if (verb === 'POST') return [];
    if (ref[1] === 'tags') return [{ kind: 'tag', target: ref[2] }];
    return matches(guardedBranches((...query) => git(cwd, ...query), 'origin', declaration).guarded, ref[2]) ? [{ kind: 'rewrite', target: ref[2] }] : [];
  }
  if (verb !== 'POST' && REPO_ROUTE.test(route)) return [{ kind: 'settings', target: 'repo' }];
  const hit = API_KINDS.find(([pattern]) => pattern.test(route));
  return hit ? [{ kind: hit[1], target: route.split('/').slice(3).join('/') || 'repo' }] : [];
}

function gh(words, cwd, declaration, tools) {
  if (words.includes('--help') || words.includes('-h')) return [];
  const [, group, verb] = words;
  const rest = words.slice(3);
  if (group === 'api') return ghApi(words, cwd, declaration, tools.git);
  if (group === 'pr' && verb === 'merge') {
    if (rest.includes('--admin')) return [{ kind: 'bypass', target: '*' }];
    const number = first(rest);
    const base = tools.gh(cwd, 'pr', 'view', ...(number ? [number] : []), '--json', 'baseRefName', '--jq', '.baseRefName');
    return [{ kind: 'merge', target: base || '*' }];
  }
  if (group === 'release' && ['create', 'delete', 'edit', 'upload', 'delete-asset'].includes(verb)) return [{ kind: 'release', target: first(rest) ?? '*' }];
  if (group === 'workflow' && ['run', 'enable', 'disable'].includes(verb)) return [{ kind: 'workflow', target: first(rest) ?? '*' }];
  if (['secret', 'variable'].includes(group) && ['set', 'delete', 'remove'].includes(verb)) return [{ kind: 'settings', target: group }];
  if (group === 'ruleset' && verb && !['list', 'view', 'check'].includes(verb)) return [{ kind: 'settings', target: 'ruleset' }];
  if (group === 'repo' && ['delete', 'edit', 'rename', 'archive', 'unarchive', 'deploy-key'].includes(verb)) return [{ kind: 'settings', target: 'repo' }];
  return [];
}

// ---------------------------------------------------------------- 守るファイル

const INSTRUCTIONS = new Set(['AGENTS.md', 'CLAUDE.md']);
const DECLARATION_PATH = DECLARATION.split(path.sep).join('/');

function fileKind(file) {
  const normal = file.split(path.sep).join('/');
  if (normal === DECLARATION_PATH || normal.endsWith(`/${DECLARATION_PATH}`)) return 'policy';
  return INSTRUCTIONS.has(path.basename(normal)) ? 'instructions' : null;
}

function writtenFiles(command) {
  const args = WRITERS.has(command.words[0]) ? command.words.slice(1).filter((word) => !word.startsWith('-')) : [];
  return [...command.targets, ...args];
}

function editFinding(request) {
  const file = path.resolve(request.cwd, request.file ?? '');
  const kind = fileKind(file);
  if (kind !== 'policy') return kind ? { kind, target: path.basename(file) } : null;
  let before = policyOf({});
  try {
    before = policyOf(parseDeclaration(fs.readFileSync(file, 'utf8')));
  } catch {}
  let after = null;
  try {
    if (typeof request.after === 'string') after = policyOf(parseDeclaration(request.after));
  } catch {}
  // 書き換えたあとの中身が分からないときは、線が動くものとして確かめる。
  return after !== null && after === before ? null : { kind, target: path.basename(file) };
}

// ---------------------------------------------------------------- 止める手順
//
// 外部に影響する操作の確かめとは別に、外すと費用が大きく、見分けが確かな手順だけを止めて、理由を返す。任せることはできない。
// 追従の merge と PR の base は、利用者が明示して求めたときに、オーケストレーターが確認済みフラグを付けて実行し直せる。

export const PROCEDURE_LABELS = {
  follow: '追従のための merge',
  base: 'デフォルトブランチ以外を base にする PR',
};

// merge と pull で、値を 1 つ取る指定。
const GIT_VALUED = new Set(['-m', '-s', '-X', '-F', '--file', '--strategy', '--strategy-option', '--into-name', '--cleanup', '--depth', '--deepen', '--shallow-since', '--shallow-exclude', '-j', '--jobs', '--upload-pack', '-o', '--server-option', '--negotiation-tip']);
// pull.rebase と branch.<名前>.rebase が、真偽のほかに取る値。どれも rebase で取り込む。
const REBASE_MODES = new Set(['merges', 'm', 'interactive', 'i', 'preserve', 'p']);
// git が偽として読む値。
const FALSE = /^(?:false|no|off|0|)$/i;

function positional(words, valued) {
  const out = [];
  for (let k = 0; k < words.length; k += 1) {
    if (!words[k].startsWith('-')) out.push(words[k]);
    else if (valued.has(words[k])) k += 1;
  }
  return out;
}

// 取り込む ref を、ブランチの名前に直す。リモートの名前と refs/ の頭を外す。
function branchOf(ref, remotes) {
  if (ref.startsWith('refs/heads/')) return ref.slice(11);
  const name = ref.replace(/^refs\/remotes\//, '');
  const remote = remotes.find((candidate) => name.startsWith(`${candidate}/`));
  return remote ? name.slice(remote.length + 1) : name;
}

// リモートの名前だけと、<リモート>/HEAD は、そのリモートのデフォルトブランチを指す。
const remoteDefault = (ref, remotes) => remotes.some((remote) => [remote, `${remote}/HEAD`, `refs/remotes/${remote}/HEAD`].includes(ref));

// 設定が無いことを、git が答えなかったことと分けて受け取るための値。
const UNSET = '--default=dotagents-unset';
const unset = (value) => value === 'dotagents-unset';

// rebase で取り込むかを、git が pull.rebase と branch.<名前>.rebase を読むのと同じ意味で読む。範囲(利用者全体、
// リポジトリー、-c)ごとに値が違ってもよいよう、効いている値(最後の 1 つ)を読む。設定が無ければ null、git が
// 答えなければ undefined を返す。git config --type=bool は、どこか 1 つの範囲に merges があるだけで失敗するので使わない。
function rebaseSetting(setting, key) {
  const raw = setting(UNSET, '--get', key);
  if (raw === null) return undefined;
  if (unset(raw)) return null;
  // 値の無いキーは真、空の値は偽で、--get の答えでは区別できない。
  if (raw === '') return setting('--type=bool', '--get', key) === 'true';
  if (/^(?:true|yes|on)$/i.test(raw)) return true;
  if (/^(?:false|no|off)$/i.test(raw)) return false;
  const number = raw.match(/^[-+]?(\d+)[kmg]?$/i);
  if (number) return Number(number[1]) !== 0;
  // merges、interactive とその略は rebase する。読めない値では、git は pull をせずに止まる。どちらも merge の跡は残らない。
  return true;
}

function follow(command, declaration, git) {
  const { sub, rest, ask, setting } = gitCommand(command.words, command.cwd, git);
  if (sub !== 'merge' && sub !== 'pull') return null;
  const flag = (...names) => rest.find((word) => names.includes(word.split('=')[0]));
  if (flag('--abort', '--continue', '--quit', '--skip', '--ff-only', '--help', '-h')) return null;
  const current = ask('symbolic-ref', '-q', '--short', 'HEAD');
  if (!current) return null;
  const args = positional(rest, GIT_VALUED);
  const remotes = (ask('remote') ?? 'origin').split('\n').filter(Boolean);
  const remote = sub === 'pull' && args[0] ? args[0] : 'origin';
  const { guarded } = guardedBranches(ask, remote, declaration);
  // 共有ブランチの上で、作業ブランチを取り込む merge は、統合そのものなので止めない。
  if (matches(guarded, current)) return null;
  if (sub === 'pull') {
    // 指定は後に書いたものが勝つ。指定が無ければ、ブランチごとの設定、pull.rebase の順に読む。
    let rebase = null;
    for (const word of rest) {
      if (word === '-r' || word === '--rebase') rebase = true;
      else if (word.startsWith('--rebase=')) rebase = !FALSE.test(word.slice(9));
      else if (word === '--no-rebase') rebase = false;
    }
    const explicit = rebase !== null;
    if (!explicit) {
      const branch = rebaseSetting(setting, `branch.${current}.rebase`);
      rebase = branch === null ? rebaseSetting(setting, 'pull.rebase') : branch;
      // 設定を読めなければ、rebase するかが分からない。追従の merge は確かなときだけ止める。
      if (rebase === undefined) return null;
    }
    if (rebase) return null;
    // 早送りだけに限っていれば、merge の跡は残らない。
    if (!explicit && !flag('--ff', '--no-ff')) {
      const ff = setting(UNSET, '--get', 'pull.ff');
      if (ff === null || ff === 'only') return null;
    }
    return { kind: 'follow', reason: `rebase なしの git pull は、作業ブランチ(${current})にマージコミットを残します。\`git pull --rebase\` で追従してください。毎回そうする場合は、\`git config pull.rebase true\` を設定してください。` };
  }
  let refs = args.map((ref) => (/^@\{u(?:pstream)?\}$/.test(ref) ? ask('rev-parse', '--abbrev-ref', '--symbolic-full-name', ref) ?? '' : ref));
  if (!refs.length) refs = [ask('rev-parse', '--abbrev-ref', '--symbolic-full-name', '@{upstream}') ?? ''];
  const shared = refs.filter(Boolean).filter((ref) => remoteDefault(ref, remotes) || matches(guarded, branchOf(ref, remotes)));
  if (!shared.length) return null;
  return { kind: 'follow', reason: `共有ブランチ(${shared.join('、')})の変更に追従するときは、merge ではなく、作業ブランチ(${current})を rebase して取り込んでください(\`git fetch\` のあと \`git rebase ${shared[0]}\`)。マージコミットが残ると、マージするときの差分と履歴が読みにくくなります。` };
}

function optionValue(words, short, long) {
  for (let k = 0; k < words.length; k += 1) {
    const word = words[k];
    if (word === short || word === long) return words[k + 1];
    if (word.startsWith(`${long}=`)) return word.slice(long.length + 1);
    if (short && word.startsWith(short) && word.length > short.length && !word.startsWith('--')) return word.slice(short.length);
  }
  return undefined;
}

// リポジトリーの書き方(OWNER/REPO、HOST/OWNER/REPO、URL)をそろえて、owner/repo にする。
const repoName = (text) => String(text).replace(/\.git$/, '').split(/[/:]/).filter(Boolean).slice(-2).join('/').toLowerCase();

function prBase(command, gh) {
  const { words, cwd, assignments } = command;
  if (words[0] !== 'gh' || words[1] !== 'pr') return null;
  const rest = words.slice(2);
  if (positional(rest, new Set(['-R', '--repo']))[0] !== 'create' || rest.includes('--help') || rest.includes('-h')) return null;
  // 作業はデフォルトブランチへ統合する(git の流れは trunk に固定している)。base にしてよいのは、デフォルトブランチだけである。
  // デフォルトブランチは、GitHub に尋ねる。手元の origin/HEAD は、デフォルトブランチを変えたあとも古いまま残る。
  // 答えが無ければ、違う base へ導かないよう、確かめずに通す。
  let repo;
  try {
    repo = JSON.parse(gh(cwd, 'repo', 'view', '--json', 'nameWithOwner,defaultBranchRef') ?? '');
  } catch {
    return null;
  }
  const target = repo?.defaultBranchRef?.name;
  if (typeof target !== 'string' || !target) return null;
  // ほかのリポジトリーへの PR は見ない。-R と GH_REPO は、同じに読む。
  const named = optionValue(rest, '-R', '--repo') ?? assignments.GH_REPO;
  if (named && repoName(named) !== repoName(repo.nameWithOwner ?? '')) return null;
  const base = optionValue(rest, '-B', '--base') ?? target;
  if (base === target) return null;
  return { kind: 'base', reason: `このハーネスの git の運用(trunk)では、PR の base は ${target}(デフォルトブランチ)にしてください。base を ${base} にする PR の作成はブロックします。` };
}

// 単純なコマンドごとに check で止める手順を探す。オーケストレーターは、そのコマンドに確認済みフラグがあれば通す。
function stopIn(request, check) {
  for (const command of simpleCommands(request.command, request.cwd)) {
    if (!command.words.length) continue;
    const stop = check(command);
    if (!stop) continue;
    if (request.role === 'orchestrator') {
      if (command.assignments[CONFIRMED] === '1') continue;
      return { ...stop, reason: `${stop.reason}利用者が明示して求めたときだけ、先頭に確認済みフラグ ${CONFIRMED}=1 を付けて実行し直してください。` };
    }
    return stop;
  }
  return null;
}

// 追従の merge(手元の判定)と、PR の base(GitHub に尋ねる判定)。
export function procedure(request, declaration, tools) {
  if (request.tool !== 'shell') return null;
  return stopIn(request, (command) => (command.words[0] === 'git' ? follow(command, declaration, tools.git) : null))
    ?? stopIn(request, (command) => (command.words[0] === 'gh' ? prBase(command, tools.gh) : null));
}

// ---------------------------------------------------------------- 判定

export function findings(request, declaration, tools) {
  if (request.tool === 'edit') {
    const hit = editFinding(request);
    return hit ? [hit] : [];
  }
  if (request.tool === 'connector') {
    const [, server, ...action] = String(request.name ?? '').split('__');
    return MESSAGE.test(action.join('_').toLowerCase()) ? [{ kind: 'message', target: server ?? '*' }] : [];
  }
  // 見つけた操作ごとに、それを行う単純なコマンドに確認済みフラグ(confirmed)があるかを持つ。
  const found = [];
  const commands = simpleCommands(request.command, request.cwd);
  const marked = (command) => command.assignments[CONFIRMED] === '1';
  for (const command of commands) {
    const add = (...hits) => found.push(...hits.map((hit) => ({ ...hit, confirmed: marked(command) })));
    for (const file of writtenFiles(command)) {
      const kind = fileKind(file);
      if (kind) add({ kind, target: path.basename(file) });
    }
    if (!command.words.length) continue;
    const head = command.words[0];
    if (head === 'git') add(...gitPush(command.words, command.cwd, declaration, tools.git));
    else if (head === 'gh') add(...gh(command.words, command.cwd, declaration, tools));
  }
  return found;
}

const describe = (finding) => `${KIND_LABELS[finding.kind]}${finding.target && finding.target !== '*' ? `(${finding.target})` : ''}`;
const entryOf = (finding) => `"${finding.kind}${finding.target && finding.target !== '*' ? `:${finding.target}` : ''}"`;

// ビルダーとレビュアーが実行しないチェック。push 時とリリース前のチェックは、バッチを push する前とリリースの前に、メインのセッションで 1 回だけ実行する。
// 時間では切らない。止めるのは、プロジェクトがその段階に置いたコマンドそのものだけで、引数を足して絞った実行は通す。
// 同じコマンドを edit や commit のチェックにも置いているなら、このエージェントの持ち場なので止めない。
const HEAVY_TIERS = [
  ['release', { label: 'リリース前のチェック', when: 'リリースの前' }],
  ['push', { label: 'push 時のチェック', when: 'バッチを push する前' }],
];
const commandLines = (text, cwd) => simpleCommands(text, cwd).map(({ words }) => words.join(' ')).filter(Boolean);

const tierLines = (declaration, key, cwd) => (typeof declaration.checks?.[key] === 'string' ? commandLines(declaration.checks[key], cwd) : []);

function heavyChecks(declaration, cwd) {
  const tier = (key) => tierLines(declaration, key, cwd);
  const own = new Set([...tier('edit'), ...tier('commit')]);
  const heavy = new Map();
  for (const [key, label] of HEAVY_TIERS) for (const line of tier(key)) if (!own.has(line)) heavy.set(line, label);
  return heavy;
}

// 掛けるのは、ビルダーとレビュアーにだけである。長い確かめを任されたほかのサブエージェントまでは縛らない。
function pace(request, declaration) {
  if (request.tool !== 'shell' || !PACED.has(request.role)) return null;
  const heavy = heavyChecks(declaration, request.cwd);
  const hit = heavy.size ? commandLines(request.command, request.cwd).find((line) => heavy.has(line)) : undefined;
  if (hit) {
    const { label, when } = heavy.get(hit);
    return `\`${hit}\` は、${label}として、このプロジェクトの ${DECLARATION_PATH} の checks に書かれたコマンドなので、ブロックしました。このチェックは、${when}に、メインのセッションで 1 回だけ実行します。変更したファイルと、それに依存するテストに絞って実行してください。このチェックを実行していないことは、報告に書いてください。`;
  }
  return null;
}

// ホストが渡すエージェントの名前を、判定で使うロールに直す。サブエージェントでなければオーケストレーターである。
export function roleOf({ agentId, agentType } = {}) {
  if (!agentId && !agentType) return 'orchestrator';
  const name = String(agentType ?? '').split(/[:/]/).pop().replace(/^dotagents-/, '');
  return PACED.has(name) ? name : 'worker';
}

// 1 回の判定の中では、同じ問い合わせを 1 回だけにする。push の読み取りは、確かめと止める手順の両方が使う。
function remembered(tools) {
  const memo = new Map();
  return Object.fromEntries(Object.entries(tools).map(([name, call]) => [name, (cwd, ...args) => {
    const key = JSON.stringify([name, cwd, args]);
    if (!memo.has(key)) memo.set(key, call(cwd, ...args));
    return memo.get(key);
  }]));
}

// request: { tool: 'shell' | 'edit' | 'connector', cwd, role: 'orchestrator' | 'builder' | 'reviewer' | 'worker', canAsk,
//            command,                          … shell
//            file, after,                      … edit(after は書き換えたあとの全文。分からなければ省く)
//            name }                            … connector(ツールの名前)
// 判定は 2 つに分かれる。
//
// - 手元の判定(外部に影響する操作、追従の merge、署名、チェック): 手元の git に、手元の時間の内で尋ねる。要る答えが
//   得られなければ、外部に影響するものとして扱う(閉じる側)。gh pr merge の対象(base)だけは GitHub に尋ね、答えが無ければ
//   対象を決めず、任せた種類に当てない。
// - GitHub に尋ねる判定(PR の base): 手元の判定の結果に関わらず、GitHub の時間の内で尋ねる。答えが無ければ
//   止めない(開く側)。
export function decide(request, given) {
  const tools = remembered(given ?? runners());
  const { value: declaration } = readDeclaration(request.cwd);
  if (request.tool === 'shell') {
    // AI の関与を示す記述は、既定でブロックする。プロジェクトが `"allowAiAttribution": true` と書いたときだけ通す。
    const stamp = declaration.allowAiAttribution !== true ? attribution(request.command, request.cwd) : null;
    if (stamp) return { decision: 'deny', kind: 'attribution', reason: stamp };
    const slow = pace(request, declaration);
    if (slow) return { decision: 'deny', kind: 'pace', reason: slow };
    const stop = procedure(request, declaration, tools);
    if (stop) return { decision: 'deny', kind: stop.kind, reason: stop.reason };
  }
  const open = findings(request, declaration, tools).filter((finding) => !delegated(declaration.delegated, finding));
  return open.length ? outward(request, open) : null;
}

function outward(request, open) {
  // 確かめる手段の無いホストでは、モデルが会話で確かめ、確認済みフラグを付けて実行し直す。印は、その操作を行うコマンドに付いているときだけ効く。
  const waiting = request.role === 'orchestrator' && !request.canAsk && request.tool === 'shell' ? open.filter((finding) => !finding.confirmed) : open;
  if (!waiting.length) return null;
  const unique = [...new Map(waiting.map(({ kind, target }) => [`${kind}:${target}`, { kind, target }])).values()];
  const what = unique.map(describe).join('、');
  const base = { kind: unique[0].kind, findings: unique };
  if (request.role !== 'orchestrator') {
    return { ...base, decision: 'deny', reason: `外部に影響する操作です: ${what}。このエージェントからは実行できません。オーケストレーターが行うので、この操作が必要なことを報告に書いてください。` };
  }
  const entries = unique.filter((finding) => !NEVER_DELEGATED.has(finding.kind)).map(entryOf);
  const how = entries.length ? `毎回の確認を省くには、プロジェクトの ${DECLARATION_PATH} の delegated に ${entries.join('、')} を追加してください。` : '';
  if (request.canAsk) return { ...base, decision: 'ask', reason: `外部に影響する操作なので、実行してよいか確認します: ${what}。${how}` };
  return { ...base, decision: 'deny', reason: `外部に影響する操作です: ${what}。利用者に確認して承認を得てから、先頭に確認済みフラグ ${CONFIRMED}=1 を付けたシェルのコマンドで実行し直してください。${how}` };
}

// ======================================================================== src/hook.mjs

// hook の受け口。Claude Code と Codex は同じ入出力(stdin の JSON と hookSpecificOutput)を使い、Antigravity は別の形を使う。
//
//   node hook.mjs <claude|codex> <session|subagent|tool>
//   node hook.mjs antigravity <session|tool>
//
// ここは、ホストの言葉を判定の言葉に直すだけにする。判定は guard.mjs、文は context.mjs が持つ。
// 受け口の誤りで作業そのものを止めない。読めない入力と例外は、飲み込んで通す。


const EDIT_TOOLS = new Set(['Edit', 'Write', 'MultiEdit', 'NotebookEdit']);
const PATCH_FILE = /^\*\*\* (?:Add|Update|Delete) File: (.+)$/gm;

const roleFrom = (input) => roleOf({ agentId: input.agent_id, agentType: input.agent_id ? input.agent_type : undefined });

// 書き換えたあとの全文。`dotagents.jsonc` の書き換えが、確認ルールを動かすかどうかを見るために使う。
function afterOf(name, toolInput, file) {
  if (name === 'Write') return typeof toolInput.content === 'string' ? toolInput.content : undefined;
  if (name !== 'Edit' || typeof toolInput.old_string !== 'string' || typeof toolInput.new_string !== 'string') return undefined;
  try {
    const current = fs.readFileSync(file, 'utf8');
    return toolInput.replace_all ? current.split(toolInput.old_string).join(toolInput.new_string) : current.replace(toolInput.old_string, () => toolInput.new_string);
  } catch {
    return undefined;
  }
}

// Codex は plugin でエージェントを運べない。個人の環境にインストールしたときは、エージェントの定義から導いた TOML を、
// 利用者の設定に置き、バージョンが変わったら置き直す。リポジトリーに置いたときは、CLI が .codex/agents/ に置くので、ここは動かさない。
// 手で置く手順にすると、plugin のバージョンとエージェントの定義がずれる。書き換えるのは、無いファイル、印のあるファイル、
// 印を入れる前のバージョンが書いた中身と一致するファイルだけである。同じ名前で利用者が置いたファイルは上書きしない。
export function syncCodexAgents(home = process.env.CODEX_HOME ?? path.join(os.homedir(), '.codex')) {
  const dir = path.join(home, 'agents');
  for (const role of roles()) {
    const { file, content, legacy } = codexAgent(role, 'plugin');
    const target = path.join(dir, file);
    let current = null;
    try {
      current = fs.readFileSync(target, 'utf8');
    } catch {}
    if (current === content) continue;
    if (current !== null && !current.startsWith(`${CODEX_MARK}\n`) && current !== legacy) continue;
    fs.mkdirSync(dir, { recursive: true });
    fs.writeFileSync(target, content);
  }
}

// 1 回のツールの呼び出しを、判定に掛ける要求の並びに直す。
export function requests(host, input) {
  const name = input.tool_name;
  const toolInput = input.tool_input ?? {};
  const cwd = input.cwd ?? process.cwd();
  const role = roleFrom(input);
  // 確かめる画面を出せるのは Claude Code だけである。Codex は ask を受け取ると、止めずに通してしまう。
  const base = { cwd, role, canAsk: host === 'claude' };
  if (host === 'codex' && name === 'apply_patch') {
    return [...String(toolInput.command ?? '').matchAll(PATCH_FILE)].map(([, file]) => ({ ...base, tool: 'edit', file: file.trim() }));
  }
  if (name === 'Bash' && typeof toolInput.command === 'string') {
    return [{ ...base, tool: 'shell', command: toolInput.command }];
  }
  const file = toolInput.file_path ?? toolInput.notebook_path;
  if (EDIT_TOOLS.has(name) && typeof file === 'string') return [{ ...base, tool: 'edit', file, after: afterOf(name, toolInput, path.resolve(cwd, file)) }];
  if (typeof name === 'string' && name.startsWith('mcp__')) return [{ ...base, tool: 'connector', name }];
  return [];
}

// ---------------------------------------------------------------- Antigravity
//
// 形は資料による(https://antigravity.google/docs/hooks/)。実機では確かめていない。
// - cwd と、どのエージェントからの呼び出しかは来ない。シェルはツールの Cwd、ほかは最初のワークスペースで読む。hook そのものは
//   plugin の根で動くので、process.cwd() は使わない。
// - ロールは見分けられないので、常にオーケストレーターとして判定する。サブエージェントの外部に影響する操作も、止めずに利用者に確かめる。
// - 既定のルールのうちどのロールにも入る部分は、plugin のルール(rules/AGENTS.md)がどのエージェントにも入れる。hook が入れるのは、メインのセッションだけの部分(「(続き)」)と、プロジェクトの設定である。

const ANTIGRAVITY_EDITS = new Set(['write_to_file', 'replace_file_content', 'multi_replace_file_content']);

const antigravityCwd = (input) => {
  const args = input.toolCall?.args ?? {};
  if (typeof args.Cwd === 'string' && args.Cwd) return args.Cwd;
  const [workspace] = Array.isArray(input.workspacePaths) ? input.workspacePaths : [];
  return typeof workspace === 'string' && workspace ? workspace : process.cwd();
};

// 書き換えたあとの全文。置き換える文字列が 1 か所に決まらないとき(行の範囲で選ぶとき)は、分からないものとして返す。
// 分からなければ、判定は確認ルールが動くものとして扱う。ReplacementChunks の中の形は、資料に無いので、replace_file_content と同じ名前で読む。
function antigravityAfter(name, args, file) {
  if (name === 'write_to_file') return typeof args.CodeContent === 'string' ? args.CodeContent : undefined;
  const chunks = name === 'replace_file_content' ? [args] : Array.isArray(args.ReplacementChunks) ? args.ReplacementChunks : [];
  if (!chunks.length) return undefined;
  let text;
  try {
    text = fs.readFileSync(file, 'utf8');
  } catch {
    return undefined;
  }
  for (const chunk of chunks) {
    if (typeof chunk?.TargetContent !== 'string' || !chunk.TargetContent || typeof chunk.ReplacementContent !== 'string') return undefined;
    const parts = text.split(chunk.TargetContent);
    if (parts.length < 2 || (parts.length > 2 && chunk.AllowMultiple !== true)) return undefined;
    text = parts.join(chunk.ReplacementContent);
  }
  return text;
}

export function antigravityRequests(input) {
  const name = input.toolCall?.name;
  const args = input.toolCall?.args ?? {};
  const cwd = antigravityCwd(input);
  // 確かめる画面は、Antigravity が出す(資料による)。
  const base = { cwd, role: 'orchestrator', canAsk: true };
  if (name === 'run_command' && typeof args.CommandLine === 'string') return [{ ...base, tool: 'shell', command: args.CommandLine }];
  if (ANTIGRAVITY_EDITS.has(name) && typeof args.TargetFile === 'string') {
    return [{ ...base, tool: 'edit', file: args.TargetFile, after: antigravityAfter(name, args, path.resolve(cwd, args.TargetFile)) }];
  }
  return [];
}

// PreToolUse は decision を必ず返す。通すときは allow を返す。allow は、ほかの hook と既定の許可の流れに任せる。
// auto_approve は、利用者に確かめるはずの呼び出しを確かめずに通すので返さない。
// 確かめるときは force_ask を返す。ask は、利用者が前に「常に許可」した操作を確かめずに通すからである。
export const ANTIGRAVITY_PASS = { decision: 'allow' };

function antigravity(event, input) {
  const cwd = antigravityCwd(input);
  if (yields(cwd)) return event === 'tool' ? ANTIGRAVITY_PASS : null;
  if (event === 'session') return { injectSteps: [{ systemMessage: { systemMessage: contextFor({ role: 'orchestrator', cwd, shared: false, host: 'antigravity' }) } }] };
  if (event !== 'tool') return null;
  for (const request of antigravityRequests(input)) {
    const result = decide(request);
    if (!result) continue;
    return { decision: result.decision === 'ask' ? 'force_ask' : 'deny', reason: result.reason };
  }
  return ANTIGRAVITY_PASS;
}

// 個人の環境にインストールした plugin は、dotagents を置いたリポジトリーの中では何もしない。両方が動くと、同じ文を 2 回読み込ませ、
// 同じ操作を 2 回確かめる。リポジトリーに置いたものは、チームがそろえたバージョンなので、そちらに譲る。
// 譲るかは、置いたファイルの記録の有無だけで決める。リポジトリーに置いたものが動かない間(Codex で /hooks の承認の前など)は、
// どちらも動かない。README と CLI の表示が、承認の手順を伝える。
const yields = (cwd) => !PLACED && placedProject(cwd) !== null;

export function handle(host, event, input) {
  if (host === 'antigravity') return antigravity(event, input);
  const cwd = input.cwd ?? process.cwd();
  if (yields(cwd)) return null;
  if (event === 'session' || event === 'subagent') {
    if (host === 'codex' && event === 'session' && !PLACED) syncCodexAgents();
    // Claude Code は、サブエージェントのコンテキストを作り直したときにも、そのサブエージェントの中でセッションの開始を知らせる。
    // その知らせにはエージェントの ID が付く。ID が付いた知らせにメインのセッションだけの部分を返すと、作り直しのあと、サブエージェントがオーケストレーターとして振る舞う。
    const role = event === 'session' && !input.agent_id ? 'orchestrator' : roleOf({ agentId: input.agent_id ?? 'subagent', agentType: input.agent_type });
    return { hookSpecificOutput: { hookEventName: input.hook_event_name ?? (event === 'session' ? 'SessionStart' : 'SubagentStart'), additionalContext: contextFor({ role, cwd, host }) } };
  }
  if (event === 'tool') {
    for (const request of requests(host, input)) {
      const result = decide(request);
      if (!result) continue;
      return { hookSpecificOutput: { hookEventName: 'PreToolUse', permissionDecision: result.decision, permissionDecisionReason: result.reason } };
    }
    return null;
  }
  return null;
}

function main() {
  const [host, event] = process.argv.slice(2);
  // Antigravity の PreToolUse は、読めない入力と例外でも決定を返す。返さないときの扱いは、資料に無い。
  const fallback = host === 'antigravity' && event === 'tool' ? ANTIGRAVITY_PASS : null;
  const write = (output) => {
    if (output) process.stdout.write(JSON.stringify(output));
  };
  let input;
  try {
    input = JSON.parse(fs.readFileSync(0, 'utf8') || '{}');
    if (!input || typeof input !== 'object') throw new Error('入力がオブジェクトではない');
  } catch {
    write(fallback);
    return;
  }
  try {
    write(handle(host, event, input));
  } catch {
    write(fallback);
  }
}

if (import.meta.url === pathToFileURL(process.argv[1] ?? '').href) main();
