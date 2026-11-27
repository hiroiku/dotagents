# dotagents

AI のコーディングエージェントに仕事を任せるためのハーネスです。ロールごとに毎回読み込ませる 1 枚の指示、固定した進め方(trunk の git 運用と layered の設計)、外部に影響する操作をブロックまたは確認する仕組みを、同じ中身のまま **Claude Code** と **Codex** に提供します。**Google Antigravity** にも、制約つきで提供します(後述)。

[English](../README.md) | 日本語

## 何をするか

- **ロールごとに 1 枚。** 各ロールは、必要な指示を毎回すべて読みます。常時読み込まれる文は、オーケストレーターで約 5,900 字、ビルダーで約 3,600 字、レビュアーで約 3,900 字です。オーケストレーターは 6,000 字、サブエージェントは 4,000 字に収まることを、テストで検証しています。スキルとして残しているのは、利用者が頼んだときに使う `setup`、`architecture`、`prompting`、`releases`、`triage` だけです。
- **選ばせず、1 つに決める。** git は trunk(デフォルトブランチにマージし、tag でリリースする)、アーキテクチャーは layered(依存を内側へ向ける 6 つの層)に固定しています。プロジェクトごとには選べません。git の運用は、hook が守る共有ブランチと、PR の base も決めます。合わないプロジェクトでは、利用者の指示とプロジェクトの決めごと(AGENTS.md や `decisions`)が優先します。
- **文ではなく、仕組みで守る。** 守らせられるものは、モデルに覚えさせる文にせず、hook にしています。外部に影響する操作、コミットに混じる AI の署名、プロジェクトがオーケストレーターのために取っておいた重いチェック、下の 3 つの手順です。チェックそのものはプロジェクトのコマンドで、`dotagents.jsonc` の `checks` に書いたコマンドがエージェントに伝わります。ハーネスはチェックを実行しません。時間の上限やエージェントの数の上限は、ハーネスにはありません。
- **確認が要るのは、外部に影響する操作だけ。** 取り消せることは、エージェントが自分で決めます。利用者に確認するのは、外部に影響する操作だけです。共有ブランチと tag への push、`gh` での PR のマージ、リリース、workflow の起動、リポジトリー設定の変更、指示ファイルと `dotagents.jsonc` の書き換え、他者への連絡が該当します。プロジェクト自身のコマンドは判定しません。何を守るかはプロジェクトが決めることなので、`terraform apply` や `npm publish` で確認したいプロジェクトは、各ツールの権限の設定(Claude Code なら `permissions` の `ask` など)に書いてください。確認なしで進めてよい種類は、`dotagents.jsonc` に書いて委任できます。
- **自分を計測する。** 確認した回数とブロックした回数を、コマンドの文字列を残さずに `~/.dotagents/log` に記録します。このリポジトリーの `tools/stats.mjs` で、ハーネスがどれだけ割り込んでいるかを種類ごとに、ロールごとに使った時間とトークンと一緒に確認できます。

### ブロックする手順

| 手順 | ブロックするとき | 通すとき |
|---|---|---|
| 追従のための merge | 共有ブランチ以外のブランチの上で、共有ブランチを `git merge` する。rebase なしで `git pull` する | 共有ブランチの上でのマージ。`pull.rebase` の設定がある。`--ff-only` |
| PR の base | `gh pr create` の base が GitHub のデフォルトブランチではない | ほかのリポジトリーへの PR。GitHub が応答しない |
| CI の実行中の push | push するブランチに開いた PR があり、workflow の実行が終わっていない。その push が確認の要る操作でもブロックする | `gh` が無い、数秒で応答しない、または応答を読み取れない |

前の 2 つは、利用者が明示して求めたときに、オーケストレーターが確認済みフラグ `DOTAGENTS_CONFIRMED=1` を付けて実行し直せます。CI の待ちは、ほかのどの判定より先に返し、確認済みフラグでも利用者の承認でも通りません。完了を待つか、`gh run cancel` で停止するよう案内します。GitHub への問い合わせ(CI の状態とデフォルトブランチ)には、ローカルの git への問い合わせとは別に数秒のタイムアウトを設けています。そのため、`gh` の応答が遅くても、ローカルの判定が時間切れにならず、外部に影響する操作を見落としません。

## インストール

### 自分の環境に

| ツール | インストール | 更新 |
|---|---|---|
| Claude Code | `/plugin install dotagents --marketplace hiroiku/dotagents` | `/plugin` で marketplace の自動更新をオンにします。または `claude plugin update dotagents@dotagents` |
| Codex | `codex plugin marketplace add hiroiku/dotagents` のあと `codex plugin add dotagents@dotagents`。hook は `/hooks` で承認します | `codex plugin marketplace upgrade dotagents`(更新のあと、hook をもう一度承認します) |
| Antigravity | このリポジトリーを clone し、`agy plugin install <clone>/antigravity` | `git pull` のあと、同じコマンドでインストールし直します(未検証) |

hook は、`bun` があれば `bun` で、無ければ `node` で動きます。Antigravity の hook は `node` で動きます。

### Antigravity(制約つき)

Antigravity の plugin は、`node tools/antigravity.mjs` で `plugin/` から `antigravity/` に生成します。Antigravity は plugin の `agents/` を読みますが、そこにある Claude Code のエージェントの定義を読めないためです。Antigravity の資料だけをもとに実装しており、**実機では検証していません**。`agy plugin install https://github.com/<owner>/<repo>` は、リポジトリーのルートが plugin のときの手順として資料にあります。サブディレクトリーを URL でインストールできるかは資料に無いので、clone してからインストールしてください。

各ロールが受け取る文: どのエージェントも、plugin の常に読み込まれるルール(`rules/AGENTS.md`)から、共通ルールと設計の形を受け取ります。メインのセッションは、`SessionStart` の hook から、オーケストレーターの文と `.agents/dotagents.jsonc` の事実も受け取ります。ビルダーとレビュアーは、エージェントの定義をシステムプロンプトとして受け取ります(`model: inherit`、ツールの許可リスト。レビュアーは読み取りだけ)。hook は `run_command` と 3 つの編集ツールを判定します。外部に影響する操作には `force_ask`(「常に許可」のあとも毎回確認する)、ブロックする手順と AI の署名には理由を添えた `deny`、ほかには `allow` を返し、Antigravity 自身の許可の仕組みに任せます。確認を飛ばす `auto_approve` は返しません。

Antigravity で守れない決まり:

- **ビルダーとレビュアーへの制限は、文だけになります。** hook には、どのエージェントからの呼び出しかが渡されないので、すべてをオーケストレーターの呼び出しとして判定します。サブエージェントの外部に影響する操作は、ブロックせずに利用者に確認します。push 時とリリース前の重いチェックも、サブエージェントではブロックされません。
- **サブエージェントの開始時に事実を読み込ませられません。** サブエージェントの開始を知らせるイベントが無いので、`decisions` とチェックのコマンドは、メインのセッションにだけ届きます。サブエージェントに必要なものは、オーケストレーターが依頼に書きます。サブエージェントの中でも `SessionStart` が来るかは資料にありません。来るなら、サブエージェントにもオーケストレーターの文が読み込まれます。
- **バックグラウンドの判定がありません。** シェルの呼び出しに、バックグラウンドで動くかが渡されません。
- **コネクターの判定と、ロールごとの消費の記録がありません。** MCP のツールを通した連絡は、hook で判定しません(設定していない MCP の呼び出しは、Antigravity が既定で確認します)。スキルの読み込みと、ロールごとの時間とトークンは記録しません。

### リポジトリーで共有する

plugin は、各ツールの通常の手順でインストールします。設定ファイルが無くても、既定の動作で動きます。リポジトリーに必要なものはありません。チームで同じインストール方法にしたいときだけ、plugin への参照をリポジトリーに書いてください。

- Claude Code: `claude plugin marketplace add hiroiku/dotagents --scope project` のあと、`claude plugin install dotagents@dotagents --scope project`。`.claude/settings.json` が書かれるので、コミットしてください。ほかの人は、ディレクトリーを信頼し、自分でインストールしていなければ、インストールのコマンドを 1 回実行します。設定で有効にしただけでは、対話のセッションの開始時に読み込まれません。
- Codex: 各人が、上の Codex の 2 つのコマンドを実行し、プロジェクトを信頼し、`/hooks` で hook を承認します。plugin の中身が変わるたびに、承認し直します。

自分の環境にもインストールしている人でも、同じ plugin なので、文が二重に読み込まれることも、二重に確認されることもありません。書くのはこのリポジトリーへの**参照**だけで、コピーは置かないので、ハーネスのバージョンを上げても、プロジェクトにコミットする差分は出ません。

変えたいことがあるときは、`.agents/dotagents.jsonc` を手で書いてください(下)。インストールと設定ファイルの作成を、エージェントに頼むこともできます(`setup` スキル)。8.x と 7.x の残りの削除、`ARCHITECTURE.md` の提案、プロジェクトの診断(`dotagents.jsonc`、参照、共有ブランチが GitHub で保護されているか)も、`setup` スキルの手順で行います。

## dotagents.jsonc

プロジェクトごとに違う事実は、`.agents/dotagents.jsonc` の 1 か所に書きます。hook と、どのエージェントのコンテキストも、ここを読みます。どの項目も省けます。コメント(`//`、`/* */`)と末尾のカンマを書けます(そのため拡張子は `.jsonc` です)。先頭に `$schema` の行を書くと、エディターが項目の補完と誤りの表示を出します(`schema/dotagents.schema.json`。ハーネスは読みません)。schema は知らない項目を誤りとして扱うので、書き間違いや、もう読まれない `style` と `outward` も、エディター上で波線が引かれます。古い名前の `.agents/dotagents.json` は読みません。名前を変えてください。読み取れないときは、オーケストレーターに行と列を伝え、ファイルが無いものとして動きます。

```jsonc
{
  "$schema": "https://raw.githubusercontent.com/hiroiku/dotagents/master/schema/dotagents.schema.json",
  // 既定の共有ブランチに追加する名前
  "protected": ["staging"],
  "delegated": ["merge:main", "tag", "release:v1"],
  "checks": { "edit": "biome check {file}", "commit": "npm run check:changed", "push": "npm run check", "release": "npm run e2e" },
  "decisions": ["コントラストはデザイナーの指示で決まっている。指摘にしない。"]
}
```

共有ブランチは、リモートのデフォルトブランチ、`main`、`master` と、`protected` に書いた名前です。リモートのデフォルトブランチが記録されていなければ `main` と `master` をデフォルトブランチとみなし、git が応答しなければ、すべてのブランチを共有ブランチとして扱います。layered の設計は、どの層がどの層を import してよいかを文で伝えます。ハーネスは決まりを読み込ませるだけで、チェックツールは提供しないので、依存の向きの違反は、プロジェクトの lint かチェックで検出してください。古い設定ファイルに残った `style` と `outward` は、もう読まれません。残っていれば、削除してかまいません。

`protected` には、共有ブランチに追加する名前を書きます。`delegated` には、確認なしで進めてよい外部に影響する操作の種類を書きます(`種類` か `種類:対象`)。共有ブランチの書き換え、ブランチ保護を迂回するマージ、`dotagents.jsonc` の書き換えは、委任できません。項目の一覧は `setup` スキルにあります。

## 中身

| 場所 | 中身 |
|---|---|
| `plugin/core/` | どのロールも読む共通ルール(`core.md`)と設計の形(`layered.md`)、trunk の運用を含むオーケストレーターの 1 枚(`orchestrator.md`)。字数はテストで検証しています。 |
| `plugin/agents/` | `builder`(ビルダー)と `reviewer`(レビュアー)。Claude Code のエージェント、Codex の TOML、Antigravity のエージェントは、ここから生成します。 |
| `schema/` | `.agents/dotagents.jsonc` の JSON Schema。エディターのためのもので、hook は使いません。marketplace では配布しません。 |
| `plugin/skills/` | `setup`、`architecture`、`prompting`、`releases`、`triage`。 |
| `plugin/src/` | `guard.mjs`(どのツールからも呼ぶ 1 つの判定)、`context.mjs` など。 |
| `plugin/hosts/` | Claude Code、Codex、Antigravity の hook の薄い入口。 |
| `antigravity/` | Antigravity の plugin。`tools/antigravity.mjs` が `plugin/` から生成するもので、手で編集しません。古いとテストが失敗します。 |
| `tools/stats.mjs` | ハーネスの記録の集計。marketplace は `./plugin` だけを配布するので、配布されません。 |

## 限界

判定は、誤りを防ぐための仕組みで、隔離ではありません。読むのはコマンドで、スクリプトの中身までは読みません。制限できるのは、このハーネスで動くエージェントだけです。全員に守らせる決まりは、ブランチ保護と CI に置いてください。`setup` スキルの診断は、GitHub で保護されていない共有ブランチを利用者に伝えます。

## 開発

```sh
npm test                       # node --test。依存はありません
node tools/stats.mjs --days 7  # この環境でハーネスが何をしたか。~/.dotagents/log を集計します
node tools/antigravity.mjs     # plugin/ から antigravity/ を生成します
```

バージョンを上げるときは、`plugin/package.json`、2 つの plugin の manifest、ルートの `package.json` をそろえ、`node tools/antigravity.mjs` を実行してください。そろっていることはテストで検証しています。`plugin/` の下を変えたときも、同じく実行してください。

8.x から移行するときは、`.claude/skills/dotagents` のコピーと、8.x が `.pi/settings.json` に書いた、バージョンを固定した package の行を削除します(`setup` スキルが行います)。9.0.0 は Pi に対応していません。

## ライセンス

MIT
