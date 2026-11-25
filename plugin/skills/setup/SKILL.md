---
name: setup
description: このハーネスをプロジェクトに入れるとき、外すとき、8.x と 7.x から移るとき、`dotagents.json` やスタイルを書くとき、点検するときに読む。
---

# ハーネスを整える

入れるには、インストーラー(`npx @hiroiku/dotagents init`)を使う。外す、点検する道具は無い。下の手順に沿って、その場でファイルを読み、書き換える。

ハーネスはリポジトリーに写さず、各ホストのプロジェクトの設定に、このハーネスの置き場への参照を書くだけなので、版を上げてもプロジェクトにコミットはできない。設定は、この道具の項目だけを足し引きし、ほかの項目と字(並び、字下げ、注釈)は変えない。JSON として読めない設定(注釈の入ったものなど)は書き換えず、利用者に知らせる。書き換えたものは、利用者に見せてからコミットする。

## 入れるとき

`dotagents.json`、`.claude/settings.json`、`.codex/config.toml` に何を書くか、8.x の残りの消し方は、インストーラーが 1 か所で持つ。スキルには書かない。インストーラーはコミットしない。

1. 利用者が、リポジトリーの中の端末で `npx @hiroiku/dotagents init` を実行する形を、先に示す。ホスト、git のスタイル、設計のスタイル、チェックの段階ごとの入口、plugin を入れる範囲を、画面で尋ね、書いたファイルと次にすることを見せる。
2. エージェントが代わりに行うときは、尋ねる中身を、先に利用者に尋ねる。
   - スタイルは、ブランチ、tag、workflow、文書から推した案を示す。git の流れは `trunk`(既定のブランチだけに統合し、tag で版を切る)と `release-branches`(開発は trunk と同じで、版の系列ごとに `release/` のブランチを切る)から選ぶ。設計の形は `layered` を選ぶか、選ばない。どちらの軸も省ける。`layered` を選んだら、層の依存の向きを落とす lint かチェックがプロジェクトにあるかを確かめる。ハーネスは決まりを入れるだけで、チェックの道具は入れない。無ければ、作ることを利用者に提案し、作ったらチェックの段階に置く。
   - `checks` は、プロジェクトの script と workflow から当てはめる。CI が呼んでいる入口を、push の段階に置く。無い段階は、作ることを提案する。
   - ホストと、plugin を入れる範囲(`project` か `user`)。
3. 答えを、質問なしの指定にして実行する。尋ねなかった質問は、いまの値か、推した値で答えられるので、すべて指定する。指定は `dotagents --help` にある。

   ```sh
   npx @hiroiku/dotagents init --yes --hosts claude,codex --git trunk --architecture layered --scope project --check push="npm run check"
   ```

   選ばない軸と範囲は `none`、空にする段階は `--check push=` と書く。
4. 書いたファイルを、利用者に見せる。インストーラーが「知らせ」に出したものは、利用者に伝える。
5. インストーラーが扱わないものは、ここで行う。
   - 根に `ARCHITECTURE.md` が無ければ、作ることを利用者に提案する。作るときは、architecture のスキルに沿う。
   - 7.x の残りがあれば、下の「8.x と 7.x から移るとき」に沿って消す。
   - `decisions` と `delegated` は、「dotagents.json を書くとき」に沿って、利用者の言葉から書く。
6. 下の「点検」の項目を確かめ、残ったものを利用者に伝える。
7. 各人がすることを、利用者に伝える。インストーラーも、終わりに同じことを出す。
   - Claude Code: フォルダーを信頼する。自分で入れていない人は、1 回 `claude plugin install dotagents@dotagents --scope project` を実行する(すべてのプロジェクトで使うなら `--scope user`)。設定で有効にしただけでは、対話のセッションの始めに読まれない。
   - Codex: プロジェクトを信頼し(`trust_level = "trusted"`)、`/hooks` で dotagents の hook を承認する。plugin の中身が変わるたびに、承認し直す。

## 外すとき

1. `.claude/settings.json` から、`enabledPlugins` の `dotagents@dotagents` と、`extraKnownMarketplaces` の `dotagents` を消す。消して空になった入れ物だけを消し、それでファイルが `{}` になれば、ファイルを消す。
2. `.codex/config.toml` から、`[marketplaces.dotagents]` と `[plugins."dotagents@dotagents"]` の表を、利用者が表に足した行も含めて、見出しから最後の値の行まで消す。見出しの直前の空の行 1 つも消す。表の後ろの注釈と空の行は残す。ファイルが空になれば、ファイルを消す。
3. `.agents/dotagents.json` は残す。消すかは利用者に尋ねる。

## 8.x と 7.x から移るとき

8.x の残り(`.claude/skills/dotagents` の写しと、`.pi/settings.json` の `git:github.com/hiroiku/dotagents@` で始まる package の行)は、インストーラーが消す。9.0.0 は、写しで入れることも、Pi に入れることもしない。インストーラーは、7.x の残りを消さず、知らせるだけにする。

7.x が配ったもの(`.claude/dotagents.json`、`.claude/rules/dotagents`、`.codex/dotagents`)は、9.0.0 は読まない。中に、このプロジェクトの決めごとがあれば、`dotagents.json` の `decisions` などに移してから消す。ほかは残す。

## 点検

次を確かめ、当てはまったものを利用者に伝える。

- `.agents/dotagents.json` が無い: 外へ届く操作は、すべて確かめる。Claude Code はセッションを開くたびに画面で知らせ、オーケストレーターは最初の返答で入れることを提案する。入れないと決めたなら、中身が `{}` の `dotagents.json` を置くと提案が止まる。読めない: hook とエージェントは、`dotagents.json` が無いものとして動く。
- `dotagents.json` に、知らない項目がある(知っている項目は `style`、`protected`、`delegated`、`checks`、`decisions`)。`outward` は、もう読まれない。残っていれば、何も確かめないので、消すことを提案する。
- `delegated` に、知らない種類がある(種類は「dotagents.json」にある)。
- `style` に、知らないスタイルがある。選べるのは、git が `trunk` と `release-branches`、architecture が `layered` である。スタイルを選んでいない軸は、その軸の文も決まりも入らない。
- `checks` が無い: エージェントの文脈にチェックの入口が入らず、ビルダーが push の段階のチェックを回しても止まらない。一部の段階だけが無いときは、その段階を知らせる。
- どのホストの設定にも、参照が無い(`.claude/settings.json` の `enabledPlugins` に `dotagents@dotagents` が true で無く、`.codex/config.toml` に `[plugins."dotagents@dotagents"]` が無い): 各人が自分の環境に入れていなければ、このプロジェクトでは働かない。片方だけ無いときは、そのホストを知らせる。
- この環境の Claude Code に入っていない: `~/.claude/plugins/installed_plugins.json`(`CLAUDE_CONFIG_DIR` があればその下)の `plugins["dotagents@dotagents"]` に、`scope` が `user` の記録か、`projectPath` がこのプロジェクトで `scope` が `project` か `local` の記録が無い。
- 共有のブランチが GitHub で守られていない: リモートのデフォルトブランチ、選んだスタイルの共有のブランチ、`protected` の名前(`*` を含むものは除く)ごとに、`gh api repos/{owner}/{repo}/rules/branches/<ブランチ> --jq length` が 1 以上か、`gh api repos/{owner}/{repo}/branches/<ブランチ>/protection` が答えれば守られている。どちらも答えなければ、確かめられなかったと伝える。守られていなければ、ハーネスを入れていない人と道具は、確かめなしで push できる。
- 根に `ARCHITECTURE.md` が無い: エージェントは作りの地図を持たずに作る。あれば、書いた不変条件と置き場を落とす lint かチェックが、チェックの段階にあるか。
- 8.x と 7.x の残りが、インストーラーが知らせたか、上の「8.x と 7.x から移るとき」に当てはまる。

## dotagents.json

プロジェクトごとに違う事実は、`.agents/dotagents.json` の 1 か所に書く。hook と、どのエージェントの文脈も、ここを読む。どの項目も省ける。

```json
{
  "style": { "git": "release-branches", "architecture": "layered" },
  "protected": ["staging"],
  "delegated": ["merge:main", "tag", "release:v1"],
  "checks": {
    "edit": "biome check {file}",
    "commit": "npm run check:changed",
    "push": "npm run check",
    "release": "npm run e2e"
  },
  "decisions": ["コントラストはデザイナーの指示で決まっている。指摘にしない。"]
}
```

- `style`: 選んだスタイル。git の流れは、オーケストレーターの文脈に入り、共有のブランチの既定と PR の base を決める。設計の形は、どのエージェントの文脈にも入る。知らない名前は、無いものとして扱う。
- `protected`: スタイルの既定に足す、共有のブランチの名前。リモートのデフォルトブランチと、`main`、`master` は、書かなくても含まれる。
- `delegated`: 確かめずに進めてよい種類。`種類` か `種類:対象` で書く。種類は push、tag、merge、release、settings、workflow、message、instructions である。共有のブランチの書き換え、保護を飛ばすマージ、`dotagents.json` の書き換えは、任せられない。
- `checks`: チェックの段階ごとの入口。エージェントの文脈に入り、エージェントが自分で回す。hook はチェックを実行しない。`edit` には、編集したファイルを `{file}` で受ける軽いチェックを置く。`push` と `release` に置いたコマンドは、ビルダーとレビュアーが実行すると止まる(引数を足して絞った実行は止まらない)。どの段階のコマンドも、ビルダーとレビュアーがバックグラウンドで始めると止まる。CI も同じ入口を呼ぶ形にする。
- `decisions`: どのエージェントも読む、続いている決定。レビューで見ないもの、採っている設計の配置、環境の名前のように、会話から消えると困るものを 1 行ずつ書く。

`decisions` のほかは、確かめる線を動かす。書き換えるときは、利用者に確かめが出る。

## dotagents.json を書くとき

- `delegated` は、利用者がその種類を任せると言ったときに足す。同じ種類の確かめが続いていたら、任せるかを利用者に尋ねる。
- 速さと消費のどちらを優先するか、バッチを並べてよいか、確かめをどこまで頼むかを利用者が決めたら、`decisions` に 1 行で残す。会話にだけあると、新しいセッションと、文脈を圧縮したあとに届かない。
- ハーネスの文に、時間や数の上限は無い。上限が要るプロジェクトは、理由と一緒に `decisions` に書く。
- 共有のブランチが GitHub で守られていなければ、利用者に伝える。ハーネスを入れていない人と道具は、この仕組みでは止まらない。
