---
name: setup
description: このハーネスをプロジェクトに入れるとき、外すとき、8.x と 7.x から移るとき、`dotagents.jsonc` を書くとき、点検するときに読む。
---

# ハーネスを整える

plugin は、ホストの普通の手順で入れる。入れるだけで、設定ファイルが無くても既定で動く。変えたいときだけ、`.agents/dotagents.jsonc` を手で書く。外す、点検する道具は無い。下の手順に沿って、その場でファイルを読み、書き換える。

ハーネスはリポジトリーに写さず、各ホストの設定に、このハーネスの置き場への参照を書くだけなので、版を上げてもプロジェクトにコミットはできない。ホストの設定を書き換えるときは、この道具の項目だけを足し引きし、ほかの項目と字(並び、字下げ、注釈)は変えない。JSON として読めない設定は書き換えず、利用者に知らせる。書き換えたものは、利用者に見せてからコミットする。

## 入れるとき

1. plugin を入れる。自分だけで使うか、プロジェクトで共有するかを、利用者に尋ねる。
   - Claude Code、自分だけ: `claude plugin marketplace add hiroiku/dotagents` のあと、`claude plugin install dotagents@dotagents`。
   - Claude Code、プロジェクトで共有: 両方に `--scope project` を付ける(`claude plugin marketplace add hiroiku/dotagents --scope project`、`claude plugin install dotagents@dotagents --scope project`)。`.claude/settings.json` に参照が書かれるので、利用者に見せてコミットする。ほかの人は、フォルダーを信頼し、自分で入れていなければ、1 回 `claude plugin install dotagents@dotagents --scope project` を実行する。設定で有効にしただけでは、対話のセッションの始めに読まれない。
   - Codex: `codex plugin marketplace add hiroiku/dotagents` のあと、`codex plugin add dotagents@dotagents`。プロジェクトを信頼し(`trust_level = "trusted"`)、`/hooks` で dotagents の hook を承認する。plugin の中身が変わるたびに、承認し直す。
   - Antigravity: このリポジトリーを手元に clone し、`agy plugin install <clone>/antigravity`。版を上げたら、`git pull` のあと同じコマンドで入れ直す(資料による、実機で未確認)。プロジェクトで共有する参照の書き方は無い。`.agents/plugins/` に置くと写しになるので置かない。Antigravity で守れない決まりは README にあり、入れる前に利用者に伝える。
2. 設定ファイルが要るかを、利用者に尋ねる。要るのは、チェックの入口を渡したいとき、任せる操作を決めたいとき、共有のブランチを足したいとき、続いている決定を残したいときである。
   - `checks` は、プロジェクトの script と workflow から当てはめる。CI が呼んでいる入口を、push の段階に置く。無い段階は、作ることを提案する。
   - 設計の形(layered)は、すべてのプロジェクトに入る。層の依存の向きを落とす lint かチェックがプロジェクトにあるかを確かめる。ハーネスは決まりを入れるだけで、チェックの道具は入れない。無ければ、作ることを利用者に提案し、作ったらチェックの段階に置く。
   - `decisions` と `delegated` は、「dotagents.jsonc を書くとき」に沿って、利用者の言葉から書く。
   - 書くときは、先頭に `$schema` の行を置く例(下の「dotagents.jsonc」)に沿う。書くものが無ければ、ファイルは置かない。
3. 根に `ARCHITECTURE.md` が無ければ、作ることを利用者に提案する。作るときは、architecture のスキルに沿う。
4. 7.x や 8.x の残りがあれば、下の「8.x と 7.x から移るとき」に沿って消す。
5. 下の「点検」の項目を確かめ、残ったものを利用者に伝える。

## 外すとき

1. `.claude/settings.json` から、`enabledPlugins` の `dotagents@dotagents` と、`extraKnownMarketplaces` の `dotagents` を消す。消して空になった入れ物だけを消し、それでファイルが `{}` になれば、ファイルを消す。
2. `.codex/config.toml` から、`[marketplaces.dotagents]` と `[plugins."dotagents@dotagents"]` の表を、利用者が表に足した行も含めて、見出しから最後の値の行まで消す。見出しの直前の空の行 1 つも消す。表の後ろの注釈と空の行は残す。ファイルが空になれば、ファイルを消す。
3. Antigravity に入れていれば、`agy plugin uninstall dotagents`。
4. `.agents/dotagents.jsonc` は残す。消すかは利用者に尋ねる。

## 8.x と 7.x から移るとき

9.0.0 は、写しで入れることも、Pi に入れることもしない。8.x の残りは、見つけたら消す。

- `.claude/skills/dotagents` の写し。中に `VENDORED.json` があるときだけ、ディレクトリーごと消す。
- `.pi/settings.json` の `packages` にある、`git:github.com/hiroiku/dotagents@` で始まる行。その行だけを消し、`packages` が空になれば `packages` も消す。JSON として読めなければ、書き換えず、利用者に知らせる。
- `.agents/dotagents.json`(`c` の無い名前)があれば、名前を `.agents/dotagents.jsonc` に変える。`dotagents.json` は、もう読まれない。変えたあと、`style` と `outward` があれば、消す。どちらも、もう読まれない。

7.x が配ったもの(`.claude/dotagents.json`、`.claude/rules/dotagents`、`.codex/dotagents`)は、9.0.0 は読まない。中に、このプロジェクトの決めごとがあれば、`dotagents.jsonc` の `decisions` などに移してから消す。ほかは残す。消す前に、利用者に見せる。

## 点検

次を確かめ、当てはまったものを利用者に伝える。

- `.agents/dotagents.jsonc` が無い: 既定で動く。`.agents/dotagents.json` だけがあれば、名前を `dotagents.jsonc` に変えると伝える(`.json` は読まれない)。任せた操作は無いので、外へ届く操作は、すべて確かめる。異常ではないので、書く必要がなければ、そのままにする。読めない: hook とエージェントは、`dotagents.jsonc` が無いものとして動く。
- `dotagents.jsonc` に、知らない項目がある(知っている項目は `$schema`、`protected`、`delegated`、`checks`、`decisions`)。`outward` と `style` は、もう読まれない。残っていれば、何も効かないので、消してよいと伝える。
- `delegated` に、知らない種類がある(種類は「dotagents.jsonc」にある)。
- `checks` が無い: エージェントの文脈にチェックの入口が入らず、ビルダーが push の段階のチェックを回しても止まらない。一部の段階だけが無いときは、その段階を知らせる。
- どのホストの設定にも、参照が無い(`.claude/settings.json` の `enabledPlugins` に `dotagents@dotagents` が true で無く、`.codex/config.toml` に `[plugins."dotagents@dotagents"]` が無い): 各人が自分の環境に入れていなければ、このプロジェクトでは働かない。片方だけ無いときは、そのホストを知らせる。
- この環境の Claude Code に入っていない: `~/.claude/plugins/installed_plugins.json`(`CLAUDE_CONFIG_DIR` があればその下)の `plugins["dotagents@dotagents"]` に、`scope` が `user` の記録か、`projectPath` がこのプロジェクトで `scope` が `project` か `local` の記録が無い。
- Antigravity を使う利用者の `agy plugin list` に、dotagents が enabled で出ない: Antigravity では働かない。版が Claude Code の plugin と違えば、入れ直すと伝える。
- 共有のブランチが GitHub で守られていない: リモートのデフォルトブランチ、`main`、`master`、`protected` の名前(`*` を含むものは除く)ごとに、`gh api repos/{owner}/{repo}/rules/branches/<ブランチ> --jq length` が 1 以上か、`gh api repos/{owner}/{repo}/branches/<ブランチ>/protection` が答えれば守られている。どちらも答えなければ、確かめられなかったと伝える。守られていなければ、ハーネスを入れていない人と道具は、確かめなしで push できる。
- 根に `ARCHITECTURE.md` が無い: エージェントは作りの地図を持たずに作る。あれば、書いた不変条件と置き場を落とす lint かチェックが、チェックの段階にあるか。
- 8.x と 7.x の残りが、上の「8.x と 7.x から移るとき」に当てはまる。

## dotagents.jsonc

プロジェクトごとに違う事実は、`.agents/dotagents.jsonc` の 1 か所に書く。hook と、どのエージェントの文脈も、ここを読む。どの項目も省ける。注釈(`//`、`/* */`)と末尾のカンマを書ける。先頭に `$schema` の行を置くと、エディターが補完と誤りの表示を出す(schema は、このリポジトリーの `schema/dotagents.schema.json`)。ハーネスは `$schema` を読まない。読めないときは、オーケストレーターに行と列を知らせ、無いものとして動く。

```jsonc
{
  "$schema": "https://raw.githubusercontent.com/hiroiku/dotagents/master/schema/dotagents.schema.json",
  // 既定(リモートのデフォルトブランチ、main、master)に足す、共有のブランチ
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

- `$schema`: schema の URL。エディターのための印で、確かめる線を動かさない。
- `protected`: 共有のブランチとして足す名前。リモートのデフォルトブランチと、`main`、`master` は、書かなくても含まれる。
- `delegated`: 確かめずに進めてよい種類。`種類` か `種類:対象` で書く。種類は push、tag、merge、release、settings、workflow、message、instructions である。共有のブランチの書き換え、保護を飛ばすマージ、`dotagents.jsonc` の書き換えは、任せられない。
- `checks`: チェックの段階ごとの入口。エージェントの文脈に入り、エージェントが自分で回す。hook はチェックを実行しない。`edit` には、編集したファイルを `{file}` で受ける軽いチェックを置く。`push` と `release` に置いたコマンドは、ビルダーとレビュアーが実行すると止まる(引数を足して絞った実行は止まらない)。どの段階のコマンドも、ビルダーとレビュアーがバックグラウンドで始めると止まる。CI も同じ入口を呼ぶ形にする。
- `decisions`: どのエージェントも読む、続いている決定。レビューで見ないもの、採っている設計の配置、環境の名前のように、会話から消えると困るものを 1 行ずつ書く。

`decisions` と `$schema` のほかは、確かめる線を動かす。書き換えるときは、利用者に確かめが出る。

## dotagents.jsonc を書くとき

- `delegated` は、利用者がその種類を任せると言ったときに足す。同じ種類の確かめが続いていたら、任せるかを利用者に尋ねる。
- 速さと消費のどちらを優先するか、バッチを並べてよいか、確かめをどこまで頼むかを利用者が決めたら、`decisions` に 1 行で残す。会話にだけあると、新しいセッションと、文脈を圧縮したあとに届かない。
- ハーネスの文に、時間や数の上限は無い。上限が要るプロジェクトは、理由と一緒に `decisions` に書く。
- 共有のブランチが GitHub で守られていなければ、利用者に伝える。ハーネスを入れていない人と道具は、この仕組みでは止まらない。
