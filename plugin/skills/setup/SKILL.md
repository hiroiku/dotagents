---
name: setup
description: このハーネスをプロジェクトに入れるとき、外すとき、8.x から移るとき、プロジェクトの宣言や流を書くとき、点検するときに読む。
---

# ハーネスを整える

入れる、外す、点検するための道具は無い。下の手順に沿って、その場でファイルを読み、書き換える。

入れ方は、各ホストのプロジェクトの設定に、このハーネスの置き場への参照を書くことだけである。ハーネスはリポジトリーに写さないので、版を上げてもプロジェクトにコミットはできない。設定は、この道具の項目だけを足し引きし、ほかの項目と字(並び、字下げ、注釈)は変えない。JSON として読めない設定(注釈の入ったものなど)は書き換えず、利用者に知らせる。書き換えたものは、利用者に見せてからコミットする。

## 入れるとき

1. 流を利用者に尋ねる。先に、ブランチ、tag、workflow、文書から推した案を示す。git の流れは `trunk`(既定のブランチだけに統合し、tag で版を切る)と `release-branches`(開発は trunk と同じで、版の系列ごとに `release/` のブランチを切る)から選ぶ。設計の形は `layered` を選ぶか、選ばない。どちらの軸も省ける。`layered` を選んだら、層の依存の向きを落とす lint か検査がプロジェクトにあるかを確かめる。ハーネスは決まりを入れるだけで、検査の道具は入れない。無ければ、作ることを利用者に提案し、作ったら検査の段に置く。
2. `checks` を、プロジェクトの script と workflow から当てはめる。CI が呼んでいる入口を、push の段に置く。無い段は、作ることを提案する。
3. `.agents/dotagents.json` に、選んだ流と、`checks` を書く(書き方は「プロジェクトの宣言」)。ファイルがあれば、ほかの項目は残す。
4. `.claude/settings.json` に、次の 2 つの項目を足す。ファイルが無ければ、この中身で作る。`enabledPlugins` と `extraKnownMarketplaces` がすでにあれば、その中に、この鍵だけを足す。各人の `claude plugin install --scope project` は `enabledPlugins` を先に置いて書き直すので、新しく足すときは、この順にしておくと差分ができない。

   ```json
   {
     "enabledPlugins": {
       "dotagents@dotagents": true
     },
     "extraKnownMarketplaces": {
       "dotagents": {
         "source": { "source": "github", "repo": "hiroiku/dotagents" },
         "autoUpdate": true
       }
     }
   }
   ```

5. `.codex/config.toml` の終わりに、空の行を 1 つ挟んで、次の 2 つの表を足す。ファイルが無ければ、この中身で作る。同じ見出しの表がすでにあれば、表の中のこの鍵の行だけをそろえ、利用者が表に足した行(`ref` など)は残す。版は固定しない。

   ```toml
   [marketplaces.dotagents]
   source_type = "git"
   source = "https://github.com/hiroiku/dotagents.git"

   [plugins."dotagents@dotagents"]
   enabled = true
   ```

6. 根に `ARCHITECTURE.md` が無ければ、作ることを利用者に提案する。作るときは、architecture のスキルに沿う。
7. 8.x の残りがあれば、下の「8.x と 7.x から移るとき」に沿って消す。
8. 下の「点検」の項目を確かめ、残ったものを利用者に伝える。
9. 各人がすることを、利用者に伝える。
   - Claude Code: フォルダーを信頼する。自分で入れていない人は、1 回 `claude plugin install dotagents@dotagents --scope project` を実行する(すべてのプロジェクトで使うなら `--scope user`)。設定で有効にしただけでは、対話のセッションの始めに読まれない。
   - Codex: プロジェクトを信頼し(`trust_level = "trusted"`)、`/hooks` で dotagents の hook を承認する。plugin の中身が変わるたびに、承認し直す。

## 外すとき

1. `.claude/settings.json` から、`enabledPlugins` の `dotagents@dotagents` と、`extraKnownMarketplaces` の `dotagents` を消す。消して空になった入れ物だけを消し、それでファイルが `{}` になれば、ファイルを消す。
2. `.codex/config.toml` から、`[marketplaces.dotagents]` と `[plugins."dotagents@dotagents"]` の表を、利用者が表に足した行も含めて、見出しから最後の値の行まで消す。見出しの直前の空の行 1 つも消す。表の後ろの注釈と空の行は残す。ファイルが空になれば、ファイルを消す。
3. 宣言(`.agents/dotagents.json`)は残す。消すかは利用者に尋ねる。

## 8.x と 7.x から移るとき

9.0.0 は、写しで入れることも、Pi に入れることもしない。次のものだけを消し、ほかは残す。

- `.claude/skills/dotagents`: 中に `VENDORED.json` があるときだけ、8.x の写しなので、ディレクトリーごと消す。親の `.claude/skills` とほかのスキルは残す。`VENDORED.json` が無ければ、利用者のものなので触れない。
- `.pi/settings.json`: `packages` のうち、`git:github.com/hiroiku/dotagents@` で始まる行(8.x が書いた、版を固定した行。`{ "source": … }` の形でも同じ)だけを消す。`@` の無い行と、ほかの package は残す。`packages` が空になれば、`packages` を消す。
- 7.x が配ったもの: `.claude/dotagents.json`、`.claude/rules/dotagents`、`.codex/dotagents`。9.0.0 は読まない。中に、このプロジェクトの決めごとがあれば、宣言の `decisions` などに移してから消す。

## 点検

次を確かめ、当てはまったものを利用者に伝える。

- 宣言(`.agents/dotagents.json`)が無い: 外へ届く操作は、すべて確かめる。Claude Code はセッションを開くたびに画面で知らせ、進める役は最初の返答で入れることを提案する。入れないと決めたなら、中身が `{}` の宣言を置くと提案が止まる。読めない: hook と役は、宣言が無いものとして動く。
- 宣言に、知らない項目がある(知っている項目は `style`、`protected`、`delegated`、`checks`、`decisions`)。`outward` は、もう読まれない。残っていれば、何も確かめないので、消すことを提案する。
- `delegated` に、知らない種類がある(種類は「プロジェクトの宣言」にある)。
- `style` に、知らない流がある。選べるのは、git が `trunk` と `release-branches`、architecture が `layered` である。流を選んでいない軸は、その軸の文も決まりも入らない。
- `checks` が無い: 役の文脈に検査の入口が入らず、作る役が push の段の検査を回しても止まらない。一部の段だけが無いときは、その段を知らせる。
- どのホストの設定にも、参照が無い(`.claude/settings.json` の `enabledPlugins` に `dotagents@dotagents` が true で無く、`.codex/config.toml` に `[plugins."dotagents@dotagents"]` が無い): 各人が自分の環境に入れていなければ、このプロジェクトでは働かない。片方だけ無いときは、そのホストを知らせる。
- この環境の Claude Code に入っていない: `~/.claude/plugins/installed_plugins.json`(`CLAUDE_CONFIG_DIR` があればその下)の `plugins["dotagents@dotagents"]` に、`scope` が `user` の記録か、`projectPath` がこのプロジェクトで `scope` が `project` か `local` の記録が無い。
- 共有のブランチが GitHub で守られていない: リモートのデフォルトブランチ、選んだ流の共有のブランチ、`protected` の名前(`*` を含むものは除く)ごとに、`gh api repos/{owner}/{repo}/rules/branches/<ブランチ> --jq length` が 1 以上か、`gh api repos/{owner}/{repo}/branches/<ブランチ>/protection` が答えれば守られている。どちらも答えなければ、確かめられなかったと伝える。守られていなければ、ハーネスを入れていない人と道具は、確かめなしで push できる。
- 根に `ARCHITECTURE.md` が無い: 役は作りの地図を持たずに作る。あれば、書いた不変条件と置き場を落とす lint か検査が、検査の段にあるか。
- 8.x と 7.x の残りが、上の「8.x と 7.x から移るとき」のどれかに当てはまる。

## プロジェクトの宣言

プロジェクトごとに違う事実は、`.agents/dotagents.json` の 1 か所に書く。hook と、どの役の文脈も、ここを読む。どの項目も省ける。

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

- `style`: 選んだ流。git の流れは、進める役の文脈に入り、共有のブランチの既定と PR の base を決める。設計の形は、どの役の文脈にも入る。知らない名前は、無いものとして扱う。
- `protected`: 流の既定に足す、共有のブランチの名前。リモートのデフォルトブランチと、`main`、`master` は、書かなくても含まれる。
- `delegated`: 確かめずに進めてよい種類。`種類` か `種類:対象` で書く。種類は push、tag、merge、release、settings、workflow、message、instructions である。共有のブランチの書き換え、保護を飛ばすマージ、この宣言の書き換えは、任せられない。
- `checks`: 検査の段ごとの入口。役の文脈に入り、役が自分で回す。hook は検査を実行しない。`edit` には、編集したファイルを `{file}` で受ける軽い検査を置く。`push` と `release` に置いたコマンドは、作る役と確かめる役が実行すると止まる(引数を足して絞った実行は止まらない)。どの段のコマンドも、作る役と確かめる役がバックグラウンドで始めると止まる。CI も同じ入口を呼ぶ形にする。
- `decisions`: どの役も読む、続いている決定。レビューで見ないもの、採っている設計の配置、環境の名前のように、会話から消えると困るものを 1 行ずつ書く。

`decisions` のほかは、確かめる線を動かす。書き換えるときは、利用者に確かめが出る。

## 宣言を書くとき

- `delegated` は、利用者がその種類を任せると言ったときに足す。同じ種類の確かめが続いていたら、任せるかを利用者に尋ねる。
- 速さと消費のどちらを優先するか、束を並べてよいか、確かめをどこまで頼むかを利用者が決めたら、`decisions` に 1 行で残す。会話にだけあると、新しいセッションと、文脈を圧縮したあとに届かない。
- ハーネスの文に、時間や数の上限は無い。上限が要るプロジェクトは、理由と一緒に `decisions` に書く。
- 共有のブランチが GitHub で守られていなければ、利用者に伝える。ハーネスを入れていない人と道具は、この仕組みでは止まらない。
