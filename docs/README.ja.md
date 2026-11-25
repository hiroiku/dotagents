# dotagents

AI のコーディングエージェントに仕事を任せるためのハーネス。役ごとに毎回入る 1 枚、プロジェクトが選ぶ流、手元の外へ届く操作を止める仕組みを、同じ中身のまま **Claude Code** と **Codex** へ届ける。

[English](../README.md) | 日本語

## 何をするか

- **役ごとに 1 枚。** 役は、要る文を毎回すべて読む。進める役で約 3,900 字、作る役で約 2,000 字、確かめる役で約 2,400 字である。流を選ぶと、その文が、要る役にだけ足される。どの流を選んでも、進める役は 6,000 字、サブエージェントは 4,000 字に収まることを、テストが守る。スキルとして残すのは、利用者が頼んだときに使う `setup`、`prompting`、`releases`、`triage` だけである。
- **流を宣言で選ぶ。** プロジェクトは、git の流れ(`trunk` か `release-branches`)と設計の形(`layered`)を選ぶ。選んだ文だけが入り、git の流れは、hook が守る共有のブランチと PR の base も決める。
- **文ではなく、仕組みで守る。** 守らせられるものは、モデルに覚えさせる文にせず、hook にする。外へ届く操作、コミットに混じる AI の署名、プロジェクトが進める役のために取っておいた重い検査、下の 3 つの手順である。検査そのものはプロジェクトのコマンドで、宣言の `checks` が検査の入口として役に届く。ハーネスは検査を実行しない。時間の上限や役の数の上限は、ハーネスには無い。
- **確かめる線は 1 本。** 取り消せることは、エージェントが自分で決める。止まるのは、手元の外へ届く操作だけである。共有のブランチと tag への push、`gh` での PR のマージ、リリース、workflow の起動、リポジトリーの設定、指示ファイルと宣言の書き換え、人への連絡、それに下位のコマンドが公開か配備の動詞(`publish`、`release`、`deploy`、`promote`、`rollback`、`destroy`。`deploy:prod` のような script の名前の中も読む。`deploy:dry-run` や `release:check` のように、同じ名前が外へ出さないことを表していれば読まない)のコマンドである。ハーネスは道具の名前を持たない。プロジェクトの技術によって外へ届くコマンド(`terraform apply`、`wrangler d1 execute --remote`、`docker push` など)は、プロジェクトが宣言の `outward` に書く。書かなければ、確かめずに通る。プロジェクトは、任せる種類を宣言できる。
- **自分を測る。** 確かめた回数と止めた回数を、コマンドの文字列を残さずに `~/.dotagents/log` に記録する。このリポジトリーの `tools/stats.mjs` で、ハーネスがどれだけ割り込んでいるかを種類ごとに、役ごとに使った時間とトークンと一緒に見られる。

### 止める手順

| 手順 | 止めるとき | 通すとき |
|---|---|---|
| 追従の merge | 共有でないブランチの上で、共有のブランチを `git merge` する。rebase なしで `git pull` する | 共有のブランチの上での取り込み。`pull.rebase` の設定がある。`--ff-only` |
| PR の base | git の流れを選んだプロジェクトで、`gh pr create` の base が GitHub の既定のブランチではない | 流が共有する base(`release-branches` の `release/*`)。git の流れを選んでいない。ほかのリポジトリーへの PR。GitHub が答えない |
| CI が走っている間の push | push するブランチに開いた PR があり、workflow の実行が終わっていない。その push が確かめの要る操作でも止める | `gh` が無い、数秒で答えない、または答えが読めない |

前の 2 つは、利用者が明示して求めたときに、進める役が `DOTAGENTS_CONFIRMED=1` を付けて実行し直せる。CI の待ちは、ほかのどの答えより先に返し、了承の印でも利用者の受け入れでも通らない。待つか、`gh run cancel` で止めるよう案内する。GitHub に尋ねる判定(CI の状態と既定のブランチ)は、手元の判定とは別の数秒の内で尋ねるので、gh が遅くても外へ届く操作を見落とさない。

## 入れる

### 自分の環境に

| ホスト | 入れる | 更新 |
|---|---|---|
| Claude Code | `/plugin install dotagents --marketplace hiroiku/dotagents` | `/plugin` で marketplace の自動更新をオンにする。または `claude plugin update dotagents@dotagents` |
| Codex | `codex plugin marketplace add hiroiku/dotagents` のあと `codex plugin add dotagents@dotagents`。hook は `/hooks` で承認する | `codex plugin marketplace upgrade dotagents`(更新のあと、hook をもう一度承認する) |

hook は、`bun` があれば `bun` で、無ければ `node` で動く。

### リポジトリーに

エージェントに、リポジトリーへハーネスを入れるよう頼む(`setup` スキル)。入れるコマンドは無い。エージェントが、スキルの手順に沿ってその場でファイルを書き換え、結果を見せるので、それをコミットする。

| ホスト | リポジトリーに書くもの | 各人がすること |
|---|---|---|
| Claude Code | `.claude/settings.json` の `extraKnownMarketplaces` と `enabledPlugins` | フォルダーを信頼する。自分で入れていない人は、1 回 `claude plugin install dotagents@dotagents --scope project` を実行する(すべてのプロジェクトで使うなら `--scope user`)。設定で有効にしただけでは、対話のセッションの始めに読まれない。 |
| Codex | `.codex/config.toml` に、版を固定しない git の marketplace と plugin | プロジェクトを信頼し、`/hooks` で hook を承認する。plugin の中身が変わるたびに、承認し直す。 |

エージェントは、プロジェクトの宣言(流、`checks`、`outward`)も書く。書くのは、このリポジトリーへの**参照**だけで、写しは置かないので、ハーネスの版を上げても、プロジェクトにコミットはできない。足し引きするのはハーネスの項目だけで、設定のほかの項目と字は変えない。自分の環境にも入れている人には、同じ plugin なので、文が二重に入ることも、二重に確かめることもない。外すこと、8.x と 7.x の残りを消すこと、プロジェクトの点検(宣言、参照、流、共有のブランチが GitHub で守られているか)も、同じスキルの手順で行う。

## プロジェクトの宣言

プロジェクトごとに違う事実は、`.agents/dotagents.json` の 1 か所に書く。hook と、どの役の文脈も、ここを読む。どの項目も省ける。

```json
{
  "style": { "git": "release-branches", "architecture": "layered" },
  "protected": ["staging"],
  "outward": ["^terraform apply", "^wrangler d1 .*--remote", "^docker push"],
  "delegated": ["merge:main", "tag", "deploy:staging"],
  "checks": { "edit": "biome check {file}", "commit": "npm run check:changed", "push": "npm run check", "release": "npm run e2e" },
  "decisions": ["コントラストはデザイナーの指示で決まっている。指摘にしない。"]
}
```

| 流 | 形 | 共有のブランチ |
|---|---|---|
| `git: trunk` | 既定のブランチだけに統合し、版は tag で切る | 既定のブランチ |
| `git: release-branches` | 開発は trunk と同じ。版の系列ごとに `release/…` を切り、直しは既定のブランチから cherry-pick で移す | 既定のブランチ、`release/*` |
| `architecture: layered` | 依存を内へ向ける 6 つの層。どの層がどの層を import してよいかを文に書く。ハーネスは決まりを入れ、検査の道具は入れない。向きは、プロジェクトの lint か検査で落とす | なし |

`protected` は、流の共有のブランチに足す。`delegated` には、確かめずに進めてよい外への操作の種類を書く(`種類` か `種類:対象`)。共有のブランチの書き換え、ブランチの保護を飛ばすマージ、この宣言の書き換えは、任せられない。項目の一覧は `setup` スキルにある。

## 中身

| 場所 | 中身 |
|---|---|
| `plugin/core/` | どの役も読む 1 枚(`core.md`)と、進める役の 1 枚(`lead.md`)。大きさはテストが守る。 |
| `plugin/agents/` | `builder`(作る役)と `reviewer`(確かめる役)。Claude Code のエージェントと Codex の TOML は、ここから導く。 |
| `plugin/styles/` | git の流れと設計の形。frontmatter に、文を読む役と、hook が使う値を持つ。 |
| `plugin/skills/` | `setup`、`prompting`、`releases`、`triage`。 |
| `plugin/src/` | `guard.mjs`(2 つのホストが呼ぶ 1 つの判定)、`context.mjs`、`style.mjs` など。 |
| `plugin/hosts/` | 薄い受け口。Claude Code の hook と Codex の hook。 |
| `tools/stats.mjs` | ハーネスの記録の集計。marketplace は `./plugin` だけを配るので、配られない。 |

## 限界

判定は、誤りを防ぐ仕掛けで、隔離ではない。読むのはコマンドで、スクリプトの中身までは読まない。縛れるのは、このハーネスで動くエージェントだけである。全員に守らせる決まりは、ブランチの保護と CI に置く。`setup` スキルの点検は、GitHub で守られていない共有のブランチを知らせる。

## 開発

```sh
npm test                       # node --test。依存は無い
node tools/stats.mjs --days 7  # この環境でハーネスが何をしたか。~/.dotagents/log を集計する
```

8.x から移るときは、各プロジェクトで、エージェントに `setup` スキルで入れ直すよう頼む。`.claude/skills/dotagents` の写しと、8.x が `.pi/settings.json` に書いた版を固定した package の行が消える。9.0.0 は Pi に対応しない。

## ライセンス

MIT
