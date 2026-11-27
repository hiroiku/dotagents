# dotagents

AI のコーディングエージェント向けのハーネスです。次のものを、同じ内容で **Claude Code** と **Codex** に提供します。**Google Antigravity** にも、制約つきで提供します(後述)。

- ロールごとに毎回読み込ませる指示
- 固定した進め方(trunk の git 運用と layered の設計)
- 外部に影響する操作をブロックまたは確認する hook

[English](../README.md) | 日本語

## 機能

- **ロールごとの指示**: 各ロールは、必要な指示を毎回すべて読み込みます。常時読み込まれる文は、オーケストレーターで約 8,540 字、ビルダーで約 5,740 字、レビュアーで約 6,250 字です。スキルとして残しているのは、利用者が頼んだときに使う `architecture`、`prompting`、`releases`、`triage` だけです。
- **git の運用と設計の固定**: git は trunk(デフォルトブランチにマージし、tag でリリースする)、アーキテクチャーは layered(依存を内側へ向ける 6 つの層)に固定しています。プロジェクトごとには選べません。git の運用は、hook が守る共有ブランチと、PR の base も決めます。合わないプロジェクトでは、利用者の指示とプロジェクトの決めごと(AGENTS.md)が優先します。
- **hook による制御**: hook で強制できる決まりは、指示の文ではなく hook で扱います。対象は、外部に影響する操作、サブエージェントが実行する push 時とリリース前のチェック、下の表の 2 つの手順、AI の署名(`allowAiAttribution` で許可しない限り)です。チェックそのものはプロジェクトのコマンドで、`dotagents.jsonc` の `checks` に書いたコマンドがエージェントに伝わります。ハーネスはチェックを実行しません。時間の上限やエージェントの数の上限は、ハーネスにはありません。
- **利用者への確認**: 取り消せることは、エージェントが自分で決めます。利用者に確認するのは、外部に影響する操作だけです。共有ブランチと tag への push、`gh` での PR のマージ、リリース、workflow の起動、リポジトリー設定の変更、指示ファイルと `dotagents.jsonc` の書き換え、他者への連絡が該当します。プロジェクト自身のコマンドは判定しません。どの操作を確認の対象にするかはプロジェクトの判断なので、`terraform apply` や `npm publish` で確認したいプロジェクトは、各ツールの権限の設定(Claude Code なら `permissions` の `ask` など)に書いてください。確認なしで進めてよい種類は、`dotagents.jsonc` に書いて委任できます。

### ブロックする手順

| 手順 | ブロックするとき | 通すとき |
|---|---|---|
| 追従のための merge | 共有ブランチ以外のブランチの上で、共有ブランチを `git merge` する。rebase なしで `git pull` する | 共有ブランチの上でのマージ。`pull.rebase` の設定がある。`--ff-only` |
| PR の base | `gh pr create` の base が GitHub のデフォルトブランチではない | ほかのリポジトリーへの PR。GitHub が応答しない |

どちらも、利用者が明示して求めたときに、オーケストレーターが確認済みフラグ `DOTAGENTS_CONFIRMED=1` を付けて実行し直せます。GitHub への問い合わせ(デフォルトブランチ)には、ローカルの git への問い合わせとは別に数秒のタイムアウトを設けています。そのため、`gh` の応答が遅くても、ローカルの判定が時間切れにならず、外部に影響する操作を見落としません。

## インストール

インストールの方法は 2 つあります。チームで使うときは、リポジトリーに置く方法をすすめます。clone や pull をした人に、同じバージョンがそのまま適用されます。

### チームで使う(リポジトリーに置く。すすめ)

リポジトリーのルートで次のコマンドを実行し、変わったファイルをコミットして PR にします。Node.js 22 以降と git が必要です。

```sh
npx @hiroiku/dotagents@latest sync
```

置くファイルは次のとおりです。どれも CLI が `plugin/` から作るもので、手で編集しません。

| 場所 | 内容 |
|---|---|
| `.agents/dotagents/` | 本体。`plugin/` のうち、Claude Code が plugin として読むもの(manifest、エージェント、スキル、hook の定義)、hook の入口(`dotagents.mjs`。ルールの文と判定のスクリプトを 1 つにまとめたファイル)、schema です。これに、Claude Code の marketplace の定義(`.claude-plugin/marketplace.json`)と、置いたファイルのハッシュとバージョンの記録(`placed.json`)を足します。 |
| `.claude/settings.json` | `extraKnownMarketplaces` の `dotagents-project`(本体を指す相対パスの `directory`)と、`enabledPlugins` の `dotagents@dotagents-project`。 |
| `.codex/hooks.json`、`.codex/agents/dotagents-*.toml` | Codex の hook とエージェントの定義。hook は、`git rev-parse --show-toplevel` で求めたルートから本体を呼びます。 |
| `.agents/hooks.json`、`.agents/agents/dotagents-*.md`、`.agents/rules/dotagents.md` | Antigravity の hook、エージェントの定義、常に読み込まれるルール。 |
| `.agents/dotagents.jsonc` | 無ければ、`$schema`(`./dotagents/schema/dotagents.schema.json`)の行だけを持つファイルを作ります。あれば、`$schema` の行だけを書き換えます(下の「dotagents.jsonc」を参照)。 |
| `.agents/skills/dotagents-*/` | Codex と Antigravity が読むスキル。プロジェクトのスキルと重ならないよう、名前に `dotagents-` を付けています。Claude Code は、スキルを本体の plugin から読みます。 |
| `.gitattributes` | 置いたファイル(本体と、上の dotagents のファイル)に `linguist-generated=true` を付ける行。GitHub は、これらを生成物として扱い、PR の差分で畳みます。行は `# dotagents: ここから` から `# dotagents: ここまで` の区画にまとめ、ほかの行は変えません。ファイルが無ければ作ります。 |

設定ファイル(`.claude/settings.json`、`.codex/hooks.json`、`.agents/hooks.json`)と `.gitattributes` は、dotagents の項目だけを追加または置き換え、ほかの項目と書式(順序、インデント)は変えません。JSON として読めないファイルがあると、何も変えずにエラーになります。

プロジェクトの設定に、GitHub の `hiroiku/dotagents` を marketplace として入れる参照(`.claude/settings.json` の `extraKnownMarketplaces` と `enabledPlugins`、`.codex/config.toml` の `[marketplaces.<名前>]` と `[plugins."dotagents@<名前>"]` の表)が残っていると、リポジトリーに置いたものと両方が有効になります。`sync` はこの参照を外し、外したものを表示します。`remove` は、外した参照を元に戻しません。

#### 更新

同じコマンドを実行し、変わったファイルをコミットして PR にします。本体は丸ごと置き換え、新しいバージョンに無いファイルは削除します。9.1.0 までを置いたリポジトリーでは、本体の `src/`、`core/` など、もう置かないファイルを削除します。置いたファイルが手で書き換えられていると、どのファイルかを示して何も変えずに止まります。書き換えを捨ててよければ、`--force` を付けて実行し直します。

```sh
npx @hiroiku/dotagents@latest sync          # 初回も更新も同じコマンドです
npx @hiroiku/dotagents@latest sync --force  # 手で書き換えたファイルも上書きします
```

#### clone した人の手順

| ツール | 手順 |
|---|---|
| Claude Code | フォルダーを信頼します。インストールは要りません。pull した変更は、次のセッションから読み込まれます。 |
| Codex | プロジェクトを信頼し、`/hooks` で dotagents の hook を承認します。hook の定義や呼び出すスクリプトが変わると承認し直しになるので、更新を取り込んだあとも `/hooks` で承認します。承認するまで、Codex では dotagents の hook が動きません。 |
| Antigravity | フォルダーを信頼します。 |

自分の環境にも dotagents をインストールしている人は、そのままでかまいません。dotagents を置いたリポジトリーの中では、個人の環境にインストールした plugin の hook は何もせず、リポジトリーに置いたバージョンが動きます。

#### アンインストール

次のコマンドを実行し、変わったファイルをコミットして PR にします。置いたファイルと、設定ファイルと `.gitattributes` の dotagents の項目だけを削除します。`.gitattributes` が dotagents の区画だけなら、ファイルごと削除します。`.agents/dotagents.jsonc` は、`sync` が作ったまま(`$schema` だけ)なら削除し、項目を書いてあれば `$schema` の行だけを外して残します。

```sh
npx @hiroiku/dotagents@latest remove
```

#### 実機で確認していないこと

各ツールの資料をもとに実装しており、次のことは実機で確認していません。

- Claude Code: 相対パスの `directory` の marketplace を、インストールなしで読み込むこと。git worktree から起動したときに、メインのチェックアウトの本体を読み込むこと。別のプロジェクトにも同じ名前の marketplace(`dotagents-project`)があるときに、それぞれのプロジェクトの本体を読み込むこと。個人の環境の plugin も有効なときに、エージェントとスキル(どちらも `dotagents:` で始まる)が重複して見えるかどうか。
- Codex: `.codex/hooks.json` の形と、hook のコマンドが実行されるディレクトリー。`.codex/agents/` と `.agents/skills/` を読み込むこと。個人の環境の plugin のスキルとの重複。
- Antigravity: hook のコマンドが実行されるディレクトリーとシェル(資料に記載がありません。コマンドは `$(git rev-parse --show-toplevel)` でルートを求めるので、シェルを通して実行され、cwd がリポジトリーの中であれば動きます)。`.agents/rules/` の `trigger: always_on` のルール、`.agents/agents/`、`.agents/skills/` を読み込むこと。

### 個人で使う(marketplace)

自分の環境にだけインストールします。どのプロジェクトでも動き、リポジトリーには何も置きません。

| ツール | インストール | 更新 |
|---|---|---|
| Claude Code | `/plugin install dotagents --marketplace hiroiku/dotagents` | `/plugin` で marketplace の自動更新をオンにします。または `claude plugin update dotagents@dotagents` |
| Codex | `codex plugin marketplace add hiroiku/dotagents` のあと `codex plugin add dotagents@dotagents`。hook は `/hooks` で承認します | `codex plugin marketplace upgrade dotagents`(更新のあと、hook をもう一度承認します) |
| Antigravity | このリポジトリーを clone し、`agy plugin install <clone>/antigravity` | `git pull` のあと、同じコマンドでインストールし直します(未検証) |

個人の環境だけで使うときは、本体の schema がリポジトリーに無いので、`.agents/dotagents.jsonc` の `$schema` に `https://raw.githubusercontent.com/hiroiku/dotagents/master/plugin/schema/dotagents.schema.json` を書きます。

hook は、`bun` があれば `bun` で、無ければ `node` で動きます。Antigravity の hook は `node` で動きます。Codex では、セッションの開始時に、エージェントの定義を `~/.codex/agents/dotagents-*.toml` に置きます(リポジトリーに置いたときは置きません)。

#### アンインストール

1. Claude Code: `claude plugin uninstall dotagents@dotagents` を実行します。
2. Codex: `~/.codex/config.toml` から、`[marketplaces.dotagents]` と `[plugins."dotagents@dotagents"]` の表を削除し、`~/.codex/agents/dotagents-*.toml` を削除します。
3. Antigravity: `agy plugin uninstall dotagents` を実行します。

### Antigravity(制約つき)

Antigravity の plugin は、`node tools/antigravity.mjs` で `plugin/` から `antigravity/` に生成します。Antigravity は plugin の `agents/` を読みますが、そこにある Claude Code のエージェントの定義を読めないためです。Antigravity の資料だけをもとに実装しており、**実機では検証していません**。`agy plugin install https://github.com/<owner>/<repo>` は、リポジトリーのルートが plugin のときの手順として資料にあります。サブディレクトリーを URL でインストールできるかは資料に無いので、clone してからインストールしてください。

各ロールが受け取る文: どのエージェントも、plugin の常に読み込まれるルール(`rules/AGENTS.md`)から、既定のルールのうちどのロールにも入る部分を受け取ります。メインのセッションは、`SessionStart` の hook から、メインのセッションだけの部分(見出しは「dotagents の既定のルール(続き)」)と、`.agents/dotagents.jsonc` から作るプロジェクトの設定も受け取ります。ビルダーとレビュアーは、エージェントの定義をシステムプロンプトとして受け取ります(`model: inherit`、ツールの許可リスト。レビュアーは読み取りだけ)。hook は `run_command` と 3 つの編集ツールを判定します。外部に影響する操作には `force_ask`(「常に許可」のあとも毎回確認する)、ブロックする手順と AI の署名には理由を添えた `deny`、ほかには `allow` を返し、Antigravity 自身の許可の仕組みに任せます。確認を飛ばす `auto_approve` は返しません。

Antigravity で守れない決まり:

- **ビルダーとレビュアーへの制限は、文だけになります。** hook には、どのエージェントからの呼び出しかが渡されないので、すべてをオーケストレーターの呼び出しとして判定します。サブエージェントの外部に影響する操作は、ブロックせずに利用者に確認します。push 時とリリース前の重いチェックも、サブエージェントではブロックされません。
- **サブエージェントの開始時に事実を読み込ませられません。** サブエージェントの開始を知らせるイベントが無いので、チェックのコマンド(と、非推奨の `decisions`)は、メインのセッションにだけ届きます。サブエージェントを使う場合は、必要なものを依頼に書く必要があります。サブエージェントの中でも `SessionStart` が来るかは資料にありません。来るなら、サブエージェントにもメインのセッションだけの部分が読み込まれます。
- **コネクターの判定がありません。** MCP のツールを通した連絡は、hook で判定しません(設定していない MCP の呼び出しは、Antigravity が既定で確認します)。

リポジトリーに置いたときも、同じ制約があります。そのときは、どのロールにも入る部分を `.agents/rules/dotagents.md` から読み込みます。

## dotagents.jsonc

プロジェクトごとに違う事実は、`.agents/dotagents.jsonc` の 1 か所に書きます。hook と、どのエージェントのコンテキストも、ここを読みます。どの項目も省けます。ファイルが無くても、既定の動作で動きます。先頭に `$schema` の行を書くと、エディターが項目の補完と誤りの表示を出します。`$schema` は、リポジトリーに置いた本体の schema を指す相対パス(`./dotagents/schema/dotagents.schema.json`)を標準にします。置いたバージョンと schema がずれません。`sync` は、このファイルが無ければ `$schema` の行だけを持つファイルを作り、あれば、`$schema` が無いか、このリポジトリーの schema の URL を指すときだけ相対パスに書き換えます。

```jsonc
{
  "$schema": "./dotagents/schema/dotagents.schema.json",
  // 既定の共有ブランチに追加する名前
  "protected": ["staging"],
  "delegated": ["merge:main", "tag", "release:v1"],
  "checks": { "edit": "biome check {file}", "commit": "npm run check:changed", "push": "npm run check", "release": "npm run e2e" },
  // AI の関与を示す記述を許す(書かなければブロックする)
  "allowAiAttribution": true
}
```

各項目の意味と、いつ書くかは、[`plugin/schema/dotagents.schema.json`](../plugin/schema/dotagents.schema.json) の `description` の 1 か所にだけ書いています。エージェントには、セッションの開始時に、このファイルのパスを伝えます。

### プロジェクトの決めごとは AGENTS.md

設定ファイルに書くのは、hook が判定に使うもの(`protected`、`delegated`、`checks`、`allowAiAttribution`)だけです。プロジェクトの決めごと(採っている技術、ファイルの配置、使うコマンド、レビューで見ないもの)は、理由と見直す条件を添えて `AGENTS.md` に書きます。Codex は `AGENTS.md` をそのまま読みます。Claude Code も、2.1.277 以降は `CLAUDE.md` が無ければそのまま読み、Claude Code 独自のサブエージェント(`builder`、`reviewer`)にも、`AGENTS.md` を含むプロジェクトの指示が読み込まれます。2.1.277 より前の Claude Code を使う人がいるときは、`CLAUDE.md` を `AGENTS.md` へのシンボリックリンクにしてください(`ln -s AGENTS.md CLAUDE.md`)。詳しい仕様や構成は `ARCHITECTURE.md` と docs に置き、`AGENTS.md` からリンクします。

設定ファイルの `decisions` は非推奨です。9.x は、これまでどおり読んですべてのロールに渡し、10.0.0 で読まなくなります。残っているあいだは、オーケストレーターが `AGENTS.md` へ移すことを提案し、`sync` が、そのまま貼れる Markdown で項目を表示します(`AGENTS.md` は書き換えません)。ハーネスの文には、時間や数の上限がありません。上限が要るプロジェクトは、理由と一緒に `AGENTS.md` に書いてください。

## ディレクトリー構成

| 場所 | 内容 |
|---|---|
| `plugin/core/` | 常時読み込まれる「dotagents の既定のルール」の部分(分野と話題ごとのファイル)。順番と、どのロールがどの部分を読むかは、`plugin/src/context.mjs` の `OUTLINE` にあります。 |
| `plugin/agents/` | `builder`(ビルダー)と `reviewer`(レビュアー)。Claude Code のエージェント、Codex の TOML、Antigravity のエージェントは、ここから生成します。どれもモデルを指定せず、呼び出す側と利用者の設定に従います。Codex の TOML は、先頭に dotagents が生成した印の行を持ち、印の無い同じ名前のファイルは上書きしません。 |
| `plugin/schema/` | `.agents/dotagents.jsonc` の JSON Schema。各項目の説明を書く 1 か所です。エディターが補完に使い、エージェントにはパスを伝えます。hook は読みません。 |
| `plugin/skills/` | `architecture`、`prompting`、`releases`、`triage`。 |
| `plugin/src/` | `guard.mjs`(どのツールからも呼ぶ 1 つの判定)、`context.mjs` など。 |
| `plugin/dotagents.mjs` | hook の入口。`plugin/src/` のモジュールと `plugin/core/` の文を 1 つにまとめたもので、ファイルを読まずに文を組み立てます。`tools/bundle.mjs` が生成するもので、手で編集しません。古いとテストが失敗します。 |
| `plugin/hosts/` | Claude Code、Codex、Antigravity の hook の定義。どれも `plugin/dotagents.mjs` を呼びます。 |
| `cli/` | リポジトリーに置く CLI(`npx @hiroiku/dotagents@latest sync`)。npm のパッケージ `@hiroiku/dotagents` には、`cli/` と `plugin/` だけを含めます。 |
| `antigravity/` | Antigravity の plugin。`tools/antigravity.mjs` が `plugin/` から生成するもので、手で編集しません。古いとテストが失敗します。 |

## 制限事項

判定は、誤りを防ぐための仕組みで、隔離ではありません。読むのはコマンドで、スクリプトの中身までは読みません。制限できるのは、このハーネスで動くエージェントだけです。全員に守らせる決まりは、ブランチ保護と CI に置いてください。layered の設計も、決まりを文で伝えるだけで、ハーネスは lint のツールを提供しません。依存の向き、配置、命名の違反は、プロジェクトの lint かチェックで検出してください。

ホストの権限設定との関係は次のとおりです。

- **Claude Code**: 資料によると、hook の結果に関わらず、権限設定の deny と ask のルールは評価されます。hook の `allow` は確認を省きますが、plan モードでは、読み取り専用でない呼び出しに hook の `allow` は効きません。hook の `ask` が、利用者が許可ルールで許可したコマンドにも確認を出すかは、資料に書かれていません(未検証)。既定のルールの冒頭は、ホストの権限設定と利用者の指示を、ハーネスの確認の決まりより優先するようエージェントに伝えます。
- **Codex**: hook が `ask` を返すと、Codex はそれを hook の失敗として扱い、呼び出しを続行します。そのため dotagents は Codex では `deny` を返し、利用者の承認を得たうえで、確認済みフラグ `DOTAGENTS_CONFIRMED=1` を付けて実行し直すよう案内します。確認済みフラグは dotagents の hook だけが読む環境変数で、Codex の承認ポリシー(`approval_policy`)やサンドボックス(`sandbox_mode`)の設定を変えません。ただし、実行し直したコマンドが Codex の承認ポリシーとサンドボックスを通常どおり通ることは、Codex の資料には書かれていません(未検証)。Codex の資料は、tool の hook を「完全な強制の境界ではなく、ガードレール」と位置づけています。

## 開発

```sh
npm test                       # node --test。依存はありません
node tools/bundle.mjs          # plugin/src/ と plugin/core/ から plugin/dotagents.mjs を生成します
node tools/antigravity.mjs     # plugin/ から antigravity/ を生成します
```

`plugin/src/` か `plugin/core/` を変えたら、`node tools/bundle.mjs` を実行してから `node tools/antigravity.mjs` を実行してください。`tools/bundle.mjs` は、モジュールを依存の順につなぐだけの小さなスクリプトで、道具やパッケージの依存を使いません。そのため `plugin/src/` のモジュールは、決まった形の import だけを使い、一番外側の名前をモジュールをまたいで重ねません(外れると、生成が理由を示して止まります)。

常時読み込まれる既定のルールは、`plugin/core/*.md` です。毎回の実行に必要な文だけを、`prompting` スキルの記述場所の順序に沿って置いてください。分野(H2)と話題(H3)を選び、どのロール(すべてのロール、またはメインのセッションだけ)が読むかは、`plugin/src/context.mjs` の一覧で決めます。見出しの構成は崩しません。H1 は 2 つ(既定のルールと、プロジェクトの設定)、H2 は分野、H3 は話題で、H4 は使いません。

文の中でスキルを指すときは、`core/`、`agents/`、`skills/` のどこでも、Claude Code の plugin での名前で `` `dotagents:<スキル>` `` と書きます。Claude Code はこれらのファイルをそのまま読みます。ほかのホストに渡す文は、`plugin/src/skills.mjs` が、そのホストで見える名前(Antigravity の plugin では `<スキル>`、リポジトリーに置いたときの Codex と Antigravity では `dotagents-<スキル>`)に置き換えます。

バージョンを上げるときは、`plugin/package.json`、2 つの plugin の manifest、ルートの `package.json` をそろえ、`node tools/antigravity.mjs` を実行してください。そろっていることはテストで検証しています。`plugin/` の下を変えたときも、同じく実行してください。CLI のパッケージは、ルートの `package.json` から公開します(`npm publish`)。公開したバージョンの `plugin/` が、リポジトリーに置く本体になります。

## ライセンス

MIT
