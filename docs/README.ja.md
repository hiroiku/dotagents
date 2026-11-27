# dotagents

AI のコーディングエージェントに仕事を任せるためのハーネス。ロールごとに毎回入る 1 枚、固定したやり方(trunk と layered の設計)、手元の外へ届く操作を止める仕組みを、同じ中身のまま **Claude Code** と **Codex** へ届ける。

[English](../README.md) | 日本語

## 何をするか

- **ロールごとに 1 枚。** 各ロールは、要る文を毎回すべて読む。オーケストレーターで約 5,600 字、ビルダーで約 3,500 字、レビュアーで約 3,800 字である。オーケストレーターは 6,000 字、サブエージェントは 4,000 字に収まることを、テストが守る。スキルとして残すのは、利用者が頼んだときに使う `setup`、`architecture`、`prompting`、`releases`、`triage` だけである。
- **選ばせず、1 つに決める。** git は trunk(既定のブランチに統合し、tag でリリースする)、アーキテクチャは layered(依存を内へ向ける 6 つの層)に固定する。プロジェクトごとには選べない。git の流れは、hook が守る共有のブランチと PR の base も決める。合わないプロジェクトは、利用者の指示とプロジェクトの決めごと(AGENTS.md や `decisions`)が優先する。
- **文ではなく、仕組みで守る。** 守らせられるものは、モデルに覚えさせる文にせず、hook にする。外へ届く操作、コミットに混じる AI の署名、プロジェクトがオーケストレーターのために取っておいた重いチェック、下の 3 つの手順である。チェックそのものはプロジェクトのコマンドで、`dotagents.jsonc` の `checks` がチェックの入口としてエージェントに届く。ハーネスはチェックを実行しない。時間の上限やエージェントの数の上限は、ハーネスには無い。
- **確かめる線は 1 本。** 取り消せることは、エージェントが自分で決める。止まるのは、手元の外へ届く操作だけである。共有のブランチと tag への push、`gh` での PR のマージ、リリース、workflow の起動、リポジトリーの設定、指示ファイルと `dotagents.jsonc` の書き換え、人への連絡である。プロジェクト自身のコマンドは読まない。何を守るかはプロジェクトが決めることなので、`terraform apply` や `npm publish` を確かめたいプロジェクトは、ホストの権限の設定(Claude Code なら `permissions` の `ask` など)に自分で書く。プロジェクトは、任せる種類を `dotagents.jsonc` に書ける。
- **自分を測る。** 確かめた回数と止めた回数を、コマンドの文字列を残さずに `~/.dotagents/log` に記録する。このリポジトリーの `tools/stats.mjs` で、ハーネスがどれだけ割り込んでいるかを種類ごとに、ロールごとに使った時間とトークンと一緒に見られる。

### 止める手順

| 手順 | 止めるとき | 通すとき |
|---|---|---|
| 追従の merge | 共有でないブランチの上で、共有のブランチを `git merge` する。rebase なしで `git pull` する | 共有のブランチの上での取り込み。`pull.rebase` の設定がある。`--ff-only` |
| PR の base | `gh pr create` の base が GitHub の既定のブランチではない | ほかのリポジトリーへの PR。GitHub が答えない |
| CI が走っている間の push | push するブランチに開いた PR があり、workflow の実行が終わっていない。その push が確かめの要る操作でも止める | `gh` が無い、数秒で答えない、または答えが読めない |

前の 2 つは、利用者が明示して求めたときに、オーケストレーターが `DOTAGENTS_CONFIRMED=1` を付けて実行し直せる。CI の待ちは、ほかのどの答えより先に返し、了承の印でも利用者の受け入れでも通らない。待つか、`gh run cancel` で止めるよう案内する。GitHub に尋ねる判定(CI の状態と既定のブランチ)は、手元の判定とは別の数秒の内で尋ねるので、gh が遅くても外へ届く操作を見落とさない。

## 入れる

### 自分の環境に

| ホスト | 入れる | 更新 |
|---|---|---|
| Claude Code | `/plugin install dotagents --marketplace hiroiku/dotagents` | `/plugin` で marketplace の自動更新をオンにする。または `claude plugin update dotagents@dotagents` |
| Codex | `codex plugin marketplace add hiroiku/dotagents` のあと `codex plugin add dotagents@dotagents`。hook は `/hooks` で承認する | `codex plugin marketplace upgrade dotagents`(更新のあと、hook をもう一度承認する) |

hook は、`bun` があれば `bun` で、無ければ `node` で動く。

### リポジトリーで共有する

plugin は、ホストの普通の手順で入れる。設定ファイルが無くても、既定で動く。リポジトリーに必要なものは無い。チームで同じ入れ方にしたいときだけ、plugin への参照をリポジトリーに書く。

- Claude Code: `claude plugin marketplace add hiroiku/dotagents --scope project` のあと、`claude plugin install dotagents@dotagents --scope project`。`.claude/settings.json` が書かれるので、コミットする。ほかの人は、フォルダーを信頼し、自分で入れていなければ、入れるコマンドを 1 回実行する。設定で有効にしただけでは、対話のセッションの始めに読まれない。
- Codex: 各人が、上の Codex の 2 つのコマンドを実行し、プロジェクトを信頼し、`/hooks` で hook を承認する。plugin の中身が変わるたびに、承認し直す。

自分の環境にも入れている人には、同じ plugin なので、文が二重に入ることも、二重に確かめることもない。書くのは、このリポジトリーへの**参照**だけで、写しは置かないので、ハーネスの版を上げても、プロジェクトにコミットはできない。

変えたいことがあるときは、`.agents/dotagents.jsonc` を手で書く(下)。エージェントに、入れることと設定ファイルを頼んでもよい(`setup` スキル)。8.x と 7.x の残りを消すこと、`ARCHITECTURE.md` の提案、プロジェクトの点検(`dotagents.jsonc`、参照、共有のブランチが GitHub で守られているか)も、`setup` スキルの手順で行う。

## dotagents.jsonc

プロジェクトごとに違う事実は、`.agents/dotagents.jsonc` の 1 か所に書く。hook と、どのエージェントの文脈も、ここを読む。どの項目も省ける。注釈(`//`、`/* */`)と末尾のカンマを書ける(だから拡張子は `.jsonc`)。古い名前の `.agents/dotagents.json` は読まない。名前を変える。読めないときは、オーケストレーターに行と列を知らせ、ファイルが無いものとして動く。

```jsonc
{
  // 既定に足す、共有のブランチ
  "protected": ["staging"],
  "delegated": ["merge:main", "tag", "release:v1"],
  "checks": { "edit": "biome check {file}", "commit": "npm run check:changed", "push": "npm run check", "release": "npm run e2e" },
  "decisions": ["コントラストはデザイナーの指示で決まっている。指摘にしない。"]
}
```

共有のブランチは、リモートの既定のブランチ、`main`、`master`、`protected` に書いた名前である。layered の設計は、どの層がどの層を import してよいかを文に書く。ハーネスは決まりを入れ、チェックの道具は入れないので、向きは、プロジェクトの lint かチェックで落とす。古い宣言に残った `style` と `outward` は、もう読まれない。残っていれば、消してよい。

`protected` は、共有のブランチに足す。`delegated` には、確かめずに進めてよい外への操作の種類を書く(`種類` か `種類:対象`)。共有のブランチの書き換え、ブランチの保護を飛ばすマージ、`dotagents.jsonc` の書き換えは、任せられない。項目の一覧は `setup` スキルにある。

## 中身

| 場所 | 中身 |
|---|---|
| `plugin/core/` | どのロールも読む共通ルール(`core.md`)と設計の形(`layered.md`)、trunk の流れを含むオーケストレーターの 1 枚(`orchestrator.md`)。大きさはテストが守る。 |
| `plugin/agents/` | `builder`(ビルダー)と `reviewer`(レビュアー)。Claude Code のエージェントと Codex の TOML は、ここから導く。 |
| `plugin/skills/` | `setup`、`architecture`、`prompting`、`releases`、`triage`。 |
| `plugin/src/` | `guard.mjs`(2 つのホストが呼ぶ 1 つの判定)、`context.mjs` など。 |
| `plugin/hosts/` | 薄い受け口。Claude Code の hook と Codex の hook。 |
| `tools/stats.mjs` | ハーネスの記録の集計。marketplace は `./plugin` だけを配るので、配られない。 |

## 限界

判定は、誤りを防ぐ仕掛けで、隔離ではない。読むのはコマンドで、スクリプトの中身までは読まない。縛れるのは、このハーネスで動くエージェントだけである。全員に守らせる決まりは、ブランチの保護と CI に置く。`setup` スキルの点検は、GitHub で守られていない共有のブランチを知らせる。

## 開発

```sh
npm test                       # node --test。依存は無い
node tools/stats.mjs --days 7  # この環境でハーネスが何をしたか。~/.dotagents/log を集計する
```

版を上げるときは、`plugin/package.json`、2 つの plugin の manifest、根の `package.json` をそろえる。そろっていることはテストが守る。

8.x から移るときは、`.claude/skills/dotagents` の写しと、8.x が `.pi/settings.json` に書いた版を固定した package の行を消す(`setup` スキルが行う)。9.0.0 は Pi に対応しない。

## ライセンス

MIT
