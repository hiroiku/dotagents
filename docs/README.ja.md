# dotagents

AI のコーディングエージェント向けのハーネスです。次のものを、同じ内容で **Claude Code** と **Codex** に提供します。**Google Antigravity** にも、制約つきで提供します(後述)。

- ロールごとに毎回読み込ませる指示
- 固定した進め方(trunk の git 運用と layered の設計)
- 外部に影響する操作をブロックまたは確認する hook

[English](../README.md) | 日本語

## 機能

- **ロールごとの指示**: 各ロールは、必要な指示を毎回すべて読み込みます。常時読み込まれる文は、オーケストレーターで約 7,750 字、ビルダーで約 4,960 字、レビュアーで約 5,500 字です。スキルとして残しているのは、利用者が頼んだときに使う `architecture`、`prompting`、`releases`、`triage` だけです。
- **git の運用と設計の固定**: git は trunk(デフォルトブランチにマージし、tag でリリースする)、アーキテクチャーは layered(依存を内側へ向ける 6 つの層)に固定しています。プロジェクトごとには選べません。git の運用は、hook が守る共有ブランチと、PR の base も決めます。合わないプロジェクトでは、利用者の指示とプロジェクトの決めごと(AGENTS.md や `decisions`)が優先します。
- **hook による制御**: hook で強制できる決まりは、指示の文ではなく hook で扱います。対象は、外部に影響する操作、サブエージェントが実行する push 時とリリース前のチェック、下の表の 2 つの手順、AI の署名(`allowAiAttribution` で許可しない限り)です。チェックそのものはプロジェクトのコマンドで、`dotagents.jsonc` の `checks` に書いたコマンドがエージェントに伝わります。ハーネスはチェックを実行しません。時間の上限やエージェントの数の上限は、ハーネスにはありません。
- **利用者への確認**: 取り消せることは、エージェントが自分で決めます。利用者に確認するのは、外部に影響する操作だけです。共有ブランチと tag への push、`gh` での PR のマージ、リリース、workflow の起動、リポジトリー設定の変更、指示ファイルと `dotagents.jsonc` の書き換え、他者への連絡が該当します。プロジェクト自身のコマンドは判定しません。どの操作を確認の対象にするかはプロジェクトの判断なので、`terraform apply` や `npm publish` で確認したいプロジェクトは、各ツールの権限の設定(Claude Code なら `permissions` の `ask` など)に書いてください。確認なしで進めてよい種類は、`dotagents.jsonc` に書いて委任できます。
- **記録と集計**: 確認した回数とブロックした回数を、コマンドの文字列を残さずに `~/.dotagents/log` に記録します。このリポジトリーの `tools/stats.mjs` で、確認とブロックの回数を種類ごとに、使った時間とトークンをロールごとに集計できます。

### ブロックする手順

| 手順 | ブロックするとき | 通すとき |
|---|---|---|
| 追従のための merge | 共有ブランチ以外のブランチの上で、共有ブランチを `git merge` する。rebase なしで `git pull` する | 共有ブランチの上でのマージ。`pull.rebase` の設定がある。`--ff-only` |
| PR の base | `gh pr create` の base が GitHub のデフォルトブランチではない | ほかのリポジトリーへの PR。GitHub が応答しない |

どちらも、利用者が明示して求めたときに、オーケストレーターが確認済みフラグ `DOTAGENTS_CONFIRMED=1` を付けて実行し直せます。GitHub への問い合わせ(デフォルトブランチ)には、ローカルの git への問い合わせとは別に数秒のタイムアウトを設けています。そのため、`gh` の応答が遅くても、ローカルの判定が時間切れにならず、外部に影響する操作を見落としません。

## インストール

### 個人の環境へのインストール

| ツール | インストール | 更新 |
|---|---|---|
| Claude Code | `/plugin install dotagents --marketplace hiroiku/dotagents` | `/plugin` で marketplace の自動更新をオンにします。または `claude plugin update dotagents@dotagents` |
| Codex | `codex plugin marketplace add hiroiku/dotagents` のあと `codex plugin add dotagents@dotagents`。hook は `/hooks` で承認します | `codex plugin marketplace upgrade dotagents`(更新のあと、hook をもう一度承認します) |
| Antigravity | このリポジトリーを clone し、`agy plugin install <clone>/antigravity` | `git pull` のあと、同じコマンドでインストールし直します(未検証) |

hook は、`bun` があれば `bun` で、無ければ `node` で動きます。Antigravity の hook は `node` で動きます。

### Antigravity(制約つき)

Antigravity の plugin は、`node tools/antigravity.mjs` で `plugin/` から `antigravity/` に生成します。Antigravity は plugin の `agents/` を読みますが、そこにある Claude Code のエージェントの定義を読めないためです。Antigravity の資料だけをもとに実装しており、**実機では検証していません**。`agy plugin install https://github.com/<owner>/<repo>` は、リポジトリーのルートが plugin のときの手順として資料にあります。サブディレクトリーを URL でインストールできるかは資料に無いので、clone してからインストールしてください。

各ロールが受け取る文: どのエージェントも、plugin の常に読み込まれるルール(`rules/AGENTS.md`)から、既定のルールのうちどのロールにも入る部分を受け取ります。メインのセッションは、`SessionStart` の hook から、メインのセッションだけの部分(見出しは「dotagents の既定のルール(続き)」)と、`.agents/dotagents.jsonc` から作るプロジェクトの設定も受け取ります。ビルダーとレビュアーは、エージェントの定義をシステムプロンプトとして受け取ります(`model: inherit`、ツールの許可リスト。レビュアーは読み取りだけ)。hook は `run_command` と 3 つの編集ツールを判定します。外部に影響する操作には `force_ask`(「常に許可」のあとも毎回確認する)、ブロックする手順と AI の署名には理由を添えた `deny`、ほかには `allow` を返し、Antigravity 自身の許可の仕組みに任せます。確認を飛ばす `auto_approve` は返しません。

Antigravity で守れない決まり:

- **ビルダーとレビュアーへの制限は、文だけになります。** hook には、どのエージェントからの呼び出しかが渡されないので、すべてをオーケストレーターの呼び出しとして判定します。サブエージェントの外部に影響する操作は、ブロックせずに利用者に確認します。push 時とリリース前の重いチェックも、サブエージェントではブロックされません。
- **サブエージェントの開始時に事実を読み込ませられません。** サブエージェントの開始を知らせるイベントが無いので、`decisions` とチェックのコマンドは、メインのセッションにだけ届きます。サブエージェントを使う場合は、必要なものを依頼に書く必要があります。サブエージェントの中でも `SessionStart` が来るかは資料にありません。来るなら、サブエージェントにもメインのセッションだけの部分が読み込まれます。
- **コネクターの判定と、ロールごとの消費の記録がありません。** MCP のツールを通した連絡は、hook で判定しません(設定していない MCP の呼び出しは、Antigravity が既定で確認します)。スキルの読み込みと、ロールごとの時間とトークンは記録しません。

### リポジトリーでの共有

plugin は、各ツールの通常の手順でインストールします。設定ファイルが無くても、既定の動作で動きます。リポジトリーに必要なものはありません。チームで同じインストール方法にしたいときだけ、plugin への参照をリポジトリーに書いてください。

- Claude Code: `claude plugin marketplace add hiroiku/dotagents --scope project` のあと、`claude plugin install dotagents@dotagents --scope project`。`.claude/settings.json` が書かれるので、コミットしてください。ほかの人は、ディレクトリーを信頼し、自分でインストールしていなければ、インストールのコマンドを 1 回実行します。設定で有効にしただけでは、対話のセッションの開始時に読み込まれません。
- Codex: 各人が、上の Codex の 2 つのコマンドを実行し、プロジェクトを信頼し、`/hooks` で hook を承認します。plugin の中身が変わるたびに、承認し直します。
- Antigravity: プロジェクトで共有できる参照はありません。`.agents/plugins/` に置くとコピーになるので、置かないでください。

自分の環境にもインストールしている人でも、同じ plugin なので、文が二重に読み込まれることも、二重に確認されることもありません。書くのはこのリポジトリーへの**参照**だけで、コピーは置かないので、ハーネスのバージョンを上げても、プロジェクトにコミットする差分は出ません。

### アンインストール

1. Claude Code: `.claude/settings.json` から、`enabledPlugins` の `dotagents@dotagents` と、`extraKnownMarketplaces` の `dotagents` を削除します。空になったオブジェクトも削除し、ファイルが `{}` になれば、ファイルも削除します。個人の環境にインストールしたときは、`claude plugin uninstall dotagents@dotagents` を実行します。
2. Codex: `.codex/config.toml` から、`[marketplaces.dotagents]` と `[plugins."dotagents@dotagents"]` の表を、自分で追加した行も含めて、見出しから最後の値の行まで削除します。見出しの直前の空行 1 つも削除します。ファイルが空になれば、ファイルも削除します。
3. Antigravity: `agy plugin uninstall dotagents` を実行します。
4. `.agents/dotagents.jsonc` は、残しても削除してもかまいません。plugin を削除したあとは、どこからも読まれません。

これらの設定ファイルは、手で編集します。dotagents の項目だけを削除し、ほかの項目と書式(順序、インデント、コメント)は変えないでください。

## dotagents.jsonc

プロジェクトごとに違う事実は、`.agents/dotagents.jsonc` の 1 か所に書きます。hook と、どのエージェントのコンテキストも、ここを読みます。どの項目も省けます。ファイルが無くても、既定の動作で動きます。先頭に `$schema` の行を書くと、エディターが項目の補完と誤りの表示を出します。

```jsonc
{
  "$schema": "https://raw.githubusercontent.com/hiroiku/dotagents/master/plugin/schema/dotagents.schema.json",
  // 既定の共有ブランチに追加する名前
  "protected": ["staging"],
  "delegated": ["merge:main", "tag", "release:v1"],
  "checks": { "edit": "biome check {file}", "commit": "npm run check:changed", "push": "npm run check", "release": "npm run e2e" },
  // AI の関与を示す記述を許す(書かなければブロックする)
  "allowAiAttribution": true,
  "decisions": ["金額は円の整数で持ち、小数を使わない。決済代行の API が円の整数しか受け付けないため。外貨に対応するときに見直す。"]
}
```

各項目の意味と、いつ書くかは、[`plugin/schema/dotagents.schema.json`](../plugin/schema/dotagents.schema.json) の `description` の 1 か所にだけ書いています。エージェントには、セッションの開始時に、このファイルのパスを伝えます。

## ディレクトリー構成

| 場所 | 内容 |
|---|---|
| `plugin/core/` | 常時読み込まれる「dotagents の既定のルール」の部分(分野と話題ごとのファイル)。順番と、どのロールがどの部分を読むかは、`plugin/src/context.mjs` の `OUTLINE` にあります。 |
| `plugin/agents/` | `builder`(ビルダー)と `reviewer`(レビュアー)。Claude Code のエージェント、Codex の TOML、Antigravity のエージェントは、ここから生成します。どれもモデルを指定せず、呼び出す側と利用者の設定に従います。Codex の TOML は、先頭に dotagents が生成した印の行を持ち、印の無い同じ名前のファイルは上書きしません。 |
| `plugin/schema/` | `.agents/dotagents.jsonc` の JSON Schema。各項目の説明を書く 1 か所です。エディターが補完に使い、エージェントにはパスを伝えます。hook は読みません。 |
| `plugin/skills/` | `architecture`、`prompting`、`releases`、`triage`。 |
| `plugin/src/` | `guard.mjs`(どのツールからも呼ぶ 1 つの判定)、`context.mjs` など。 |
| `plugin/hosts/` | Claude Code、Codex、Antigravity の hook の薄い入口。 |
| `antigravity/` | Antigravity の plugin。`tools/antigravity.mjs` が `plugin/` から生成するもので、手で編集しません。古いとテストが失敗します。 |
| `tools/stats.mjs` | ハーネスの記録の集計。marketplace は `./plugin` だけを配布するので、配布されません。 |

## 制限事項

判定は、誤りを防ぐための仕組みで、隔離ではありません。読むのはコマンドで、スクリプトの中身までは読みません。制限できるのは、このハーネスで動くエージェントだけです。全員に守らせる決まりは、ブランチ保護と CI に置いてください。layered の設計も、決まりを文で伝えるだけで、ハーネスは lint のツールを提供しません。依存の向き、配置、命名の違反は、プロジェクトの lint かチェックで検出してください。

ホストの権限設定との関係は次のとおりです。

- **Claude Code**: 資料によると、hook の結果に関わらず、権限設定の deny と ask のルールは評価されます。hook の `allow` は確認を省きますが、plan モードでは、読み取り専用でない呼び出しに hook の `allow` は効きません。hook の `ask` が、利用者が許可ルールで許可したコマンドにも確認を出すかは、資料に書かれていません(未検証)。既定のルールの冒頭は、ホストの権限設定と利用者の指示を、ハーネスの確認の決まりより優先するようエージェントに伝えます。
- **Codex**: hook が `ask` を返すと、Codex はそれを hook の失敗として扱い、呼び出しを続行します。そのため dotagents は Codex では `deny` を返し、利用者の承認を得たうえで、確認済みフラグ `DOTAGENTS_CONFIRMED=1` を付けて実行し直すよう案内します。確認済みフラグは dotagents の hook だけが読む環境変数で、Codex の承認ポリシー(`approval_policy`)やサンドボックス(`sandbox_mode`)の設定を変えません。ただし、実行し直したコマンドが Codex の承認ポリシーとサンドボックスを通常どおり通ることは、Codex の資料には書かれていません(未検証)。Codex の資料は、tool の hook を「完全な強制の境界ではなく、ガードレール」と位置づけています。

## 開発

```sh
npm test                       # node --test。依存はありません
node tools/stats.mjs --days 7  # この環境でハーネスが何をしたか。~/.dotagents/log を集計します
node tools/antigravity.mjs     # plugin/ から antigravity/ を生成します
```

常時読み込まれる既定のルールは、`plugin/core/*.md` です。毎回の実行に必要な文だけを、`prompting` スキルの記述場所の順序に沿って置いてください。分野(H2)と話題(H3)を選び、どのロール(すべてのロール、またはメインのセッションだけ)が読むかは、`plugin/src/context.mjs` の一覧で決めます。見出しの構成は崩しません。H1 は 2 つ(既定のルールと、プロジェクトの設定)、H2 は分野、H3 は話題で、H4 は使いません。

バージョンを上げるときは、`plugin/package.json`、2 つの plugin の manifest、ルートの `package.json` をそろえ、`node tools/antigravity.mjs` を実行してください。そろっていることはテストで検証しています。`plugin/` の下を変えたときも、同じく実行してください。

## ライセンス

MIT
