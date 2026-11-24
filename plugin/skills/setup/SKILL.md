---
name: setup
description: このハーネスをプロジェクトに入れるとき、外すとき、プロジェクトの宣言や流を書くとき、点検するとき、ハーネスの働きを集計するときに読む。
---

# ハーネスを整える

道具は、このスキルのディレクトリーから見て `../../scripts/dotagents.mjs` にある。node か bun で実行する。

| したいこと | コマンド |
|---|---|
| プロジェクトに入れる(各ホストの設定に参照を書く) | `dotagents.mjs install <dir> [--git <流>] [--architecture <流>]` |
| 参照を外す | `dotagents.mjs uninstall <dir>` |
| 宣言、参照、流、ブランチの保護を点検する | `dotagents.mjs doctor <dir>` |
| 確かめた回数、止めた回数、役が使った時間とトークンを見る | `dotagents.mjs stats --days 7` |

入れ方は参照だけで、プロジェクトに版ごとのコミットはできない。書き換えた設定をコミットする。8.x の写し(`.claude/skills/dotagents`)と、8.x が Pi の設定に書いた行は、`install` が消す。`install` の出力に、ホストごとに各人がすることが出るので、利用者に伝える。

Claude Code は、参照を設定に書いただけでは、対話のセッションの始めに読まれない。自分で入れていない人は、1 回 `claude plugin install dotagents@dotagents --scope project`(すべてのプロジェクトで使うなら `--scope user`)を実行する。この環境に入っているかは `doctor` が知らせる。

## 入れるとき

1. 流を利用者に尋ねる。先に、ブランチ、tag、workflow、文書から推した案を示す。git の流れは `trunk`(既定のブランチだけに統合し、tag で版を切る)と `release-branches`(開発は trunk と同じで、版の系列ごとに `release/` のブランチを切る)から選ぶ。設計の形は `layered` を選ぶか、選ばない。どちらの軸も省ける。
2. 選んだ値で `install` を実行する。`layered` を選んだら、層の依存の向きを落とす lint か検査がプロジェクトにあるかを確かめる。ハーネスは決まりを入れるだけで、検査の道具は入れない。無ければ、作ることを利用者に提案し、作ったら検査の段に置く。
3. `checks` を、プロジェクトの script と workflow から当てはめて宣言に書く。CI が呼んでいる入口を、push の段に置く。無い段は、作ることを提案する。
4. `outward` の案を作る。プロジェクトの script、設定(package.json、Makefile、CI の workflow、配備の道具の設定)、使っている道具を読み、配備、パッケージの公開、手元の外のデータや秘密への書き込みをするコマンドを、正規表現で挙げる。ハーネスは道具の名前を持たないので、ここに書かなかったものは確かめずに通る。たとえば Terraform なら `^terraform apply`、Cloudflare の D1 なら `^wrangler d1 .*--remote`、コンテナーの公開なら `^docker push`、手元から本番へ届く script なら `^npm run db:migrate:prod` である。下位のコマンドが公開か配備の動詞(publish、release、deploy、promote、rollback、destroy)のものは、書かなくても確かめる。案を利用者に見せ、確かめてから宣言に書く。
5. `doctor` で点検し、知らせが残れば利用者に伝える。

## プロジェクトの宣言

プロジェクトごとに違う事実は、`.agents/dotagents.json` の 1 か所に書く。hook と、どの役の文脈も、ここを読む。どの項目も省ける。

```json
{
  "style": { "git": "release-branches", "architecture": "layered" },
  "protected": ["staging"],
  "outward": ["^terraform apply", "^wrangler d1 .*--remote", "^docker push", "scripts/ship\\.sh"],
  "delegated": ["merge:main", "tag", "deploy:staging"],
  "checks": {
    "edit": "biome check {file}",
    "commit": "npm run check:changed",
    "push": "npm run check",
    "release": "npm run e2e"
  },
  "decisions": ["コントラストはデザイナーの指示で決まっている。指摘にしない。"]
}
```

- `style`: 選んだ流。git の流れは、進める役の文脈に入り、共有のブランチの既定と PR の base を決める。設計の形は、どの役の文脈にも入る。知らない名前は、無いものとして扱う。
- `protected`: 流の既定に足す、共有のブランチの名前。リモートのデフォルトブランチと、`main`、`master` は、書かなくても含まれる。
- `outward`: このプロジェクトで外へ届くコマンドの正規表現。ハーネスは道具の名前を持たず、git と gh のほかは、下位のコマンドが公開か配備の動詞(publish、release、deploy、promote、rollback、destroy)のものだけを確かめる。道具によって外へ届くコマンドは、ここに書かなければ確かめずに通る。単純なコマンドごとに当てるので、`^` から書ける。
- `delegated`: 確かめずに進めてよい種類。`種類` か `種類:対象` で書く。種類は push、tag、merge、release、deploy、settings、workflow、message、instructions、project である。共有のブランチの書き換え、保護を飛ばすマージ、この宣言の書き換えは、任せられない。
- `checks`: 検査の段ごとの入口。役の文脈に入り、役が自分で回す。hook は検査を実行しない。`edit` には、編集したファイルを `{file}` で受ける軽い検査を置く。`push` と `release` に置いたコマンドは、作る役と確かめる役が実行すると止まる(引数を足して絞った実行は止まらない)。どの段のコマンドも、作る役と確かめる役がバックグラウンドで始めると止まる。CI も同じ入口を呼ぶ形にする。
- `decisions`: どの役も読む、続いている決定。レビューで見ないもの、採っている設計の配置、環境の名前のように、会話から消えると困るものを 1 行ずつ書く。

`decisions` のほかは、確かめる線を動かす。書き換えるときは、利用者に確かめが出る。

## 宣言を書くとき

- `delegated` は、利用者がその種類を任せると言ったときに足す。`stats` で同じ種類の確かめが続いていたら、任せるかを利用者に尋ねる。
- 速さと消費のどちらを優先するか、束を並べてよいか、確かめをどこまで頼むかを利用者が決めたら、`decisions` に 1 行で残す。会話にだけあると、新しいセッションと、文脈を圧縮したあとに届かない。
- ハーネスの文に、時間や数の上限は無い。上限が要るプロジェクトは、理由と一緒に `decisions` に書く。
- `doctor` が、共有のブランチが GitHub で守られていないと知らせたら、利用者に伝える。ハーネスを入れていない人と道具は、この仕組みでは止まらない。
