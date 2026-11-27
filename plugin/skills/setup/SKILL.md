---
name: setup
description: このハーネスをプロジェクトにインストールするとき、アンインストールするとき、8.x と 7.x から移行するとき、`dotagents.jsonc` を書くとき、診断するときに読む。
---

# セットアップ

plugin は、Claude Code、Codex、Antigravity それぞれの通常の手順でインストールする。インストールするだけで、設定ファイルが無くても既定の動作で動く。変えたいときだけ、`.agents/dotagents.jsonc` を手で書く。アンインストールや診断のためのコマンドは無い。下の手順に沿って、その場でファイルを読み、書き換える。

ハーネスはリポジトリーにコピーせず、Claude Code や Codex の設定に plugin への参照を書くだけである。そのため、ハーネスのバージョンを上げても、プロジェクトにコミットする差分は出ない。これらの設定ファイルを書き換えるときは、dotagents の項目だけを追加または削除し、ほかの項目と書式(順序、インデント、コメント)は変えない。JSON として読めない設定は書き換えず、利用者に伝える。書き換えたものは、利用者に見せてからコミットする。

## インストール

1. plugin をインストールする。自分だけで使うか、プロジェクトで共有するかを、利用者に確認する。
   - Claude Code、自分だけ: `claude plugin marketplace add hiroiku/dotagents` のあと、`claude plugin install dotagents@dotagents`。
   - Claude Code、プロジェクトで共有: 両方に `--scope project` を付ける(`claude plugin marketplace add hiroiku/dotagents --scope project`、`claude plugin install dotagents@dotagents --scope project`)。`.claude/settings.json` に参照が書かれるので、利用者に見せてコミットする。ほかの人は、ディレクトリーを信頼し、自分でインストールしていなければ、1 回 `claude plugin install dotagents@dotagents --scope project` を実行する。設定で有効にしただけでは、対話のセッションの開始時に読み込まれない。
   - Codex: `codex plugin marketplace add hiroiku/dotagents` のあと、`codex plugin add dotagents@dotagents`。プロジェクトを信頼し(`trust_level = "trusted"`)、`/hooks` で dotagents の hook を承認する。plugin の中身が変わるたびに、承認し直す。
   - Antigravity: このリポジトリーをローカルに clone し、`agy plugin install <clone>/antigravity`。バージョンを上げたら、`git pull` のあと同じコマンドでインストールし直す(資料による。実機では未検証)。プロジェクトで共有する参照の書き方は無い。`.agents/plugins/` に置くとコピーになるので置かない。Antigravity で守れない決まりは README にあり、インストールの前に利用者に伝える。
2. 設定ファイルが要るかを、利用者に確認する。要るのは、チェックのコマンドを渡したいとき、委任する操作を決めたいとき、共有ブランチを追加したいとき、続いている決定を残したいときである。
   - `checks` は、プロジェクトの script と workflow から当てはめる。CI が呼んでいるコマンドを、`push` に置く。無いチェックは、作ることを提案する。
   - レイヤー構成(layered)は、すべてのプロジェクトで読み込まれる。依存の向き、ファイルの配置、命名の違反を検出する lint がプロジェクトにあるかを調べる(下の「診断」の該当項目)。
   - `decisions` と `delegated` は、「dotagents.jsonc の書き方」に沿って、利用者の言葉から書く。
   - 書くときは、先頭に `$schema` の行を置く例(下の「dotagents.jsonc の項目」)に沿う。書くものが無ければ、ファイルは置かない。
3. ルートに `ARCHITECTURE.md` が無ければ、作ることを利用者に提案する。作るときは、architecture のスキルに沿う。
4. 7.x や 8.x の残りがあれば、下の「8.x と 7.x からの移行」に沿って消す。
5. 下の「診断」の項目を調べ、残ったものを利用者に伝える。

## アンインストール

1. `.claude/settings.json` から、`enabledPlugins` の `dotagents@dotagents` と、`extraKnownMarketplaces` の `dotagents` を消す。消して空になったオブジェクトだけを消し、それでファイルが `{}` になれば、ファイルを消す。
2. `.codex/config.toml` から、`[marketplaces.dotagents]` と `[plugins."dotagents@dotagents"]` の表を、利用者が表に追加した行も含めて、見出しから最後の値の行まで消す。見出しの直前の空行 1 つも消す。表の後ろのコメントと空行は残す。ファイルが空になれば、ファイルを消す。
3. Antigravity にインストールしていれば、`agy plugin uninstall dotagents`。
4. `.agents/dotagents.jsonc` は残す。消すかは利用者に確認する。

## 8.x と 7.x からの移行

9.0.0 は、リポジトリーへのコピーによるインストールも、Pi へのインストールもしない。8.x の残りは、見つけたら消す。

- `.claude/skills/dotagents` のコピー。中に `VENDORED.json` があるときだけ、ディレクトリーごと消す。
- `.pi/settings.json` の `packages` にある、`git:github.com/hiroiku/dotagents@` で始まる行。その行だけを消し、`packages` が空になれば `packages` も消す。JSON として読めなければ、書き換えず、利用者に伝える。
- `.agents/dotagents.json`(`c` の無い名前)があれば、名前を `.agents/dotagents.jsonc` に変える。`dotagents.json` は、もう読まれない。変えたあと、`style` と `outward` があれば、消す。どちらも、もう読まれない。

7.x が配布したもの(`.claude/dotagents.json`、`.claude/rules/dotagents`、`.codex/dotagents`)は、9.0.0 は読まない。中に、このプロジェクトの決めごとがあれば、`dotagents.jsonc` の `decisions` などに移してから消す。ほかは残す。消す前に、利用者に見せる。

## 診断

次を調べ、当てはまったものを利用者に伝える。

- `.agents/dotagents.jsonc` が無い: 既定の動作で動く。`.agents/dotagents.json` だけがあれば、名前を `dotagents.jsonc` に変えるよう伝える(`.json` は読まれない)。委任した操作が無いので、外部に影響する操作は、すべて利用者への確認が要る。異常ではないので、書く必要がなければ、そのままにする。読めない: hook とエージェントは、`dotagents.jsonc` が無いものとして動く。
- `dotagents.jsonc` に、知らない項目がある(知っている項目は `$schema`、`protected`、`delegated`、`checks`、`decisions`)。`outward` と `style` は、もう読まれない。残っていれば、何も効かないので、消してよいと伝える。
- `delegated` に、知らない種類がある(種類は「dotagents.jsonc の項目」にある)。
- `checks` が無い: エージェントのコンテキストにチェックのコマンドが入らず、ビルダーが push 時のチェックを実行してもブロックされない。一部のチェックだけが無いときは、どのチェックが無いかを伝える。
- Claude Code と Codex のどちらの設定にも、参照が無い(`.claude/settings.json` の `enabledPlugins` に `dotagents@dotagents` が true で無く、`.codex/config.toml` に `[plugins."dotagents@dotagents"]` が無い): 各人が自分の環境にインストールしていなければ、このプロジェクトでは働かない。片方だけ無いときは、どちらに無いかを伝える。
- この環境の Claude Code にインストールされていない: `~/.claude/plugins/installed_plugins.json`(`CLAUDE_CONFIG_DIR` があればその下)の `plugins["dotagents@dotagents"]` に、`scope` が `user` の記録か、`projectPath` がこのプロジェクトで `scope` が `project` か `local` の記録が無い。
- Antigravity を使う利用者の `agy plugin list` に、dotagents が enabled で出ない: Antigravity では働かない。バージョンが Claude Code の plugin と違えば、インストールし直すよう伝える。
- 共有ブランチが GitHub で保護されていない: 共有ブランチ(リモートのデフォルトブランチ、`main`、`master`、`protected` の名前。`*` を含むものは除く)ごとに、`gh api repos/{owner}/{repo}/rules/branches/<ブランチ> --jq length` が 1 以上か、`gh api repos/{owner}/{repo}/branches/<ブランチ>/protection` が応答すれば、保護されている。どちらも応答しなければ、検証できなかったと伝える。保護されていなければ、ハーネスをインストールしていない人やツールは、確認なしで push できる。
- レイヤー構成の依存の向き、ファイルの配置、命名を検出する lint がプロジェクトに無い(`domain` と `application` で許す純粋な計算のパッケージの許可リストを含む): 決まりが文だけになり、違反がレビューまで残る。作ることを利用者に提案し、作ったら `checks` に置く。ハーネスは決まりを読み込ませるだけで、lint のツールは提供しない。
- ルートに `ARCHITECTURE.md` が無い: エージェントは構成を知らないまま実装する。あれば、書いた不変条件と配置場所の違反を検出する lint かチェックが、`checks` にあるか。
- 8.x と 7.x の残りが、上の「8.x と 7.x からの移行」に当てはまる。

## dotagents.jsonc の項目

プロジェクトごとに違う事実は、`.agents/dotagents.jsonc` の 1 か所に書く。hook と、どのエージェントのコンテキストも、ここを読む。どの項目も省ける。コメント(`//`、`/* */`)と末尾のカンマを書ける。先頭に `$schema` の行を置くと、エディターが補完と誤りの表示を出す(schema は、このリポジトリーの `schema/dotagents.schema.json`)。ハーネスは `$schema` を読まない。読めないときは、オーケストレーターに行と列を伝え、無いものとして動く。

```jsonc
{
  "$schema": "https://raw.githubusercontent.com/hiroiku/dotagents/master/schema/dotagents.schema.json",
  // 既定の共有ブランチ(リモートのデフォルトブランチ、main、master)に追加する名前
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

- `$schema`: schema の URL。エディターのための指定で、確認ルールを変えない。
- `protected`: 共有ブランチとして追加する名前。共有ブランチは、リモートのデフォルトブランチ、`main`、`master` と、ここに書いた名前である。リモートのデフォルトブランチが記録されていなければ、`main` と `master` をデフォルトブランチとみなし、git が応答しなければ、すべてのブランチを共有ブランチとして扱う。
- `delegated`: 利用者に確認せずに進めてよい(委任する)種類。`種類` か `種類:対象` で書く。種類は push、tag、merge、release、settings、workflow、message、instructions である。共有ブランチの書き換え、ブランチ保護を迂回するマージ、`dotagents.jsonc` の書き換えは、委任できない。
- `checks`: チェックごとのコマンド。エージェントのコンテキストに入り、エージェントが自分で実行する。hook はチェックを実行しない。`edit` には、編集したファイルを `{file}` で受ける軽いチェックを置く。`push` と `release` に置いたコマンドは、ビルダーとレビュアーがそのまま実行すると、hook がブロックする(引数を追加して絞った実行はブロックしない)。どのチェックのコマンドも、ビルダーとレビュアーがバックグラウンドで始めると、hook がブロックする。CI も同じコマンドを呼ぶ形にする。
- `decisions`: どのエージェントも読む、続いている決定。レビューで見ないもの、採っている設計の配置、環境の名前のように、会話から消えると困るものを 1 行ずつ書く。

`decisions` と `$schema` 以外は、確認が要る操作の範囲や、hook がブロックするコマンドを決める項目である。そのため、書き換えようとすると、利用者への確認が出る。

## dotagents.jsonc の書き方

- `delegated` は、利用者がその種類を委任すると言ったときに追加する。同じ種類の確認が続いていたら、委任するかを利用者に確認する。
- 速さと消費のどちらを優先するか、バッチを並列にしてよいか、レビューをどこまで頼むかを利用者が決めたら、`decisions` に 1 行で残す。会話にだけあると、新しいセッションと、コンテキストを圧縮したあとのエージェントには伝わらない。
- ハーネスの文に、時間や数の上限は無い。上限が要るプロジェクトは、理由と一緒に `decisions` に書く。
- 共有ブランチが GitHub で保護されていなければ、利用者に伝える。ハーネスをインストールしていない人やツールの操作は、この仕組みではブロックできない。
