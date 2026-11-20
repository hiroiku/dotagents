---
name: setup
description: このハーネスをプロジェクトに入れるとき、外すとき、プロジェクトの宣言を書くとき、点検するとき、ハーネスの働きを集計するときに読む。
---

# ハーネスを整える

道具は、このスキルのディレクトリーから見て `../../scripts/dotagents.mjs` にある。node か bun で実行する。

| したいこと | コマンド |
|---|---|
| プロジェクトに入れる(自分では入れていない人にも届ける) | `dotagents.mjs vendor <dir>` |
| プロジェクトから外す | `dotagents.mjs unvendor <dir>` |
| 宣言、ブランチの保護、入れた版を点検する | `dotagents.mjs doctor <dir>` |
| 確かめた回数、止めた回数、役が使った時間とトークンを見る | `dotagents.mjs stats --days 7` |

プロジェクトに入れたときは、置かれたものと書き換わった設定をコミットする。版を上げるときは、もう一度 `vendor` を実行する。

写しは、自分の環境に入れていない人のための控えである。自分の環境にも入れている人のセッションでは、Claude Code は自分の環境のものだけを読み、Pi はリポジトリーが宣言した版だけを読む。Codex はリポジトリーから plugin を読まないので、使う人がそれぞれ入れる。

## プロジェクトの宣言

プロジェクトごとに違う事実は、`.agents/dotagents.json` の 1 か所に書く。hook と、どの役の文脈も、ここを読む。どの項目も省ける。

```json
{
  "protected": ["develop", "release/*"],
  "outward": ["scripts/ship\\.sh"],
  "delegated": ["push:develop", "merge:develop", "tag", "remote:staging"],
  "checks": {
    "edit": "biome check {file}",
    "commit": "npm run check:changed",
    "push": "npm run check",
    "release": "npm run e2e"
  },
  "decisions": ["コントラストはデザイナーの指示で決まっている。指摘にしない。"]
}
```

- `protected`: 共有のブランチとして扱う名前。リモートのデフォルトブランチは、書かなくても含まれる。
- `outward`: このプロジェクトで外へ届くコマンドの正規表現。
- `delegated`: 確かめずに進めてよい種類。`種類` か `種類:対象` で書く。種類は push、tag、merge、release、deploy、remote、settings、workflow、message、instructions、project である。共有のブランチの書き換え、保護を飛ばすマージ、この宣言の書き換えは、任せられない。
- `checks`: 検査の段ごとの入口。`edit` は編集のたびに hook が実行するので、数秒で終わるものだけを置く。`push` と `release` に置いたコマンドは、作る役と確かめる役が実行すると止まる(引数を足して絞った実行は止まらない)。CI も同じ入口を呼ぶ形にする。
- `decisions`: どの役も読む、続いている決定。レビューで見ないもの、採っている設計の配置、環境の名前のように、会話から消えると困るものを 1 行ずつ書く。

`decisions` のほかは、確かめる線を動かす。書き換えるときは、利用者に確かめが出る。

## 宣言を書くとき

- `delegated` は、利用者がその種類を任せると言ったときに足す。`stats` で同じ種類の確かめが続いていたら、任せるかを利用者に尋ねる。
- `checks` は、プロジェクトの script と workflow を読んで、今ある入口を当てはめる。無い段は、作ることを提案する。
- 速さと消費のどちらを優先するか、束を並べてよいか、確かめをどこまで頼むかを利用者が決めたら、`decisions` に 1 行で残す。会話にだけあると、新しいセッションと、文脈を圧縮したあとに届かない。
- ハーネスの文に、時間や数の上限は無い。上限が要るプロジェクトは、理由と一緒に `decisions` に書く。
- `doctor` が、共有のブランチが GitHub で守られていないと知らせたら、利用者に伝える。ハーネスを入れていない人と道具は、この仕組みでは止まらない。
