# dotagents

AI のコーディングエージェントに仕事を任せるためのハーネス。常設の核、役の定義、スキル、手元の外へ届く操作を確かめる仕組みを、同じ中身のまま **Claude Code**、**Codex**、**Pi** へ届ける。

[English](../README.md) | 日本語

## 何をするか

- **決まりではなく、判断の基準を渡す。** 常に文脈へ入る文は、進める役で約 1,700 字、サブエージェントで約 900 字である。目的、決めることと確かめることの線、設計の 5 つの性質だけを書く。ほかは、要るときに読む。
- **文ではなく、仕組みで守る。** 守らせられるものは、モデルに覚えさせる文にせず、hook にする。外へ届く操作、コミットに混じる AI の署名、プロジェクトが進める役のために取っておいた重い検査、編集の直後の検査である。時間の上限や役の数の上限は、ハーネスには無い。引き換えを書き、数を決めるのは、モデルとホストと利用者に任せる。
- **確かめる線は 1 本。** 取り消せることは、エージェントが自分で決める。止まるのは、手元の外へ届く操作(共有のブランチ、tag、マージ、公開、配備、手元の外のデータ、リポジトリーの設定、人への連絡)だけである。プロジェクトは、任せる種類を宣言できる。
- **単位は成果。** 関係する issue を束ね、1 つの worktree で 1 体の作る役が作り、束ごとに 1 回確かめる。issue とはコミットで対応させる(`Closes #n`)。
- **自分を測る。** 確かめた回数と止めた回数を、コマンドの文字列を残さずに記録する。`stats` で、ハーネスが実際にどれだけ割り込んでいるかと、役ごとに使った時間とトークンが分かる。

## 入れる

どのホストも、同じディレクトリー(`plugin/`)を、そのホストのパッケージの仕組みで入れる。配布用のプログラムは無く、npm にも置かない。

| ホスト | 自分の環境に入れる | 更新 |
|---|---|---|
| Claude Code | `/plugin install dotagents --marketplace hiroiku/dotagents` | `/plugin` で marketplace の自動更新をオンにする。または `claude plugin update dotagents@dotagents` |
| Codex | `codex plugin marketplace add hiroiku/dotagents` のあと `codex plugin add dotagents@dotagents`。hook は `/hooks` で信頼する | `codex plugin marketplace upgrade dotagents`(更新のあと、hook をもう一度信頼する) |
| Pi | `pi install git:github.com/hiroiku/dotagents` | `pi update --extensions` |

hook は、`bun` があれば `bun` で、無ければ `node` で動く(計測した機械では、道具の呼び出し 1 回あたり約 20 ミリ秒と約 125 ミリ秒)。

### リポジトリーに入れる

自分では入れていない人のセッションにも届けたいときは、リポジトリーに写す。

```sh
node plugin/scripts/dotagents.mjs vendor /path/to/repo   # 書かれたものをコミットする
```

plugin を `.claude/skills/dotagents/` に写し、Pi には同じ版を `.pi/settings.json` で宣言する。どのホストも 1 つだけを読むので、文が二重に入ることも、二重に確かめることもない。

| ホスト | 自分の環境にも入れている人 | 入れていない人 |
|---|---|---|
| Claude Code | 自分の環境のものが働く。写しは、名前が同じなので読まれない。 | フォルダーを信頼し、リポジトリーの根でセッションを始めると、写しが読まれる。 |
| Pi | そのリポジトリーでは、リポジトリーが宣言した版が自分のものに代わる。 | プロジェクトを信頼すると、宣言された版が入る。 |
| Codex | 自分の環境のものが働く。 | 何も働かない。Codex はリポジトリーから plugin を読まないので、使う人がそれぞれ入れる。 |

リポジトリーの側から、自分の環境に入れたものを切ることはしない。版を上げるときは `vendor` をもう一度実行し、外すときは `unvendor` を実行する。

## プロジェクトの宣言

プロジェクトごとに違う事実は、`.agents/dotagents.json` の 1 か所に書く。hook と、どの役の文脈も、ここを読む。どの項目も省ける。

```json
{
  "protected": ["develop", "release/*"],
  "delegated": ["push:develop", "merge:develop", "tag", "remote:staging"],
  "checks": { "edit": "biome check {file}", "commit": "npm run check:changed", "push": "npm run check", "release": "npm run e2e" },
  "decisions": ["コントラストはデザイナーの指示で決まっている。指摘にしない。"]
}
```

`delegated` には、確かめずに進めてよい外への操作の種類を書く(`種類` か `種類:対象`)。共有のブランチの書き換え、ブランチの保護を飛ばすマージ、この宣言の書き換えは、任せられない。項目の一覧は `setup` スキルにある。

## 中身

| 場所 | 中身 |
|---|---|
| `plugin/core/` | 常設の核と、進める役にだけ入る文。大きさはテストが守る。 |
| `plugin/agents/` | `builder`(作る役)と `reviewer`(確かめる役)。Claude Code のエージェント、Codex の TOML、Pi の子の役は、ここから導く。 |
| `plugin/skills/` | `flow`(束ねる、検査の段、統合、issue、版)、`design`、`review`、`prompting`、`setup`。 |
| `plugin/src/` | `guard.mjs`(3 つのホストが呼ぶ 1 つの判定)、`context.mjs`、`check.mjs` など。 |
| `plugin/hosts/` | 薄い受け口。Claude Code の hook、Codex の hook、Pi の拡張。 |
| `plugin/scripts/dotagents.mjs` | `vendor`、`unvendor`、`doctor`、`stats`。 |

## 限界

判定は、誤りを防ぐ仕掛けで、隔離ではない。読むのはコマンドで、スクリプトの中身までは読まない。縛れるのは、このハーネスで動くエージェントだけである。全員に守らせる決まりは、ブランチの保護と CI に置く。`doctor` は、GitHub で守られていない共有のブランチを知らせる。

## 開発

```sh
npm test    # node --test。依存は無い
```

7.x から移るときは、各プロジェクトで `dotagents uninstall` を実行して配ったものを外し、上の手順で入れる。npm のパッケージ `@hiroiku/dotagents` は、もう公開しない。

## ライセンス

MIT
