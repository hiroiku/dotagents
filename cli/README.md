# @hiroiku/dotagents

[dotagents](https://github.com/hiroiku/dotagents)(Claude Code と Codex 向けの、AI に仕事を任せるためのハーネス)を、対話形式でプロジェクトに設定するインストーラーです。初回のセットアップにも、設定の変更にも使えます。

git リポジトリーの中で実行します。

```sh
npx @hiroiku/dotagents init
```

Node.js 22 以上が必要です。変更はコミットしません。質問に答えた場合は、書き込む前にファイルの一覧を枠にまとめて表示し、書き込んでよいかを確認します(「いいえ」を選ぶと、何も書き込まずに終了します)。`--yes` を付けた場合と、すべての質問をオプションで指定した場合は、確認しません。

## 質問の内容

どの質問にも、既定値があります。現在の `.agents/dotagents.json` の値です。ない場合は、PATH とプロジェクト(ブランチ、`package.json` の scripts、Makefile)から検出した値になります。

- 対象のツール: Claude Code(`.claude/settings.json`)、Codex(`.codex/config.toml`)
- git のスタイル: `trunk`、`release-branches`、なし
- アーキテクチャのスタイル: `layered`、なし
- チェックの段階(`edit`、`commit`、`push`、`release`)ごとのコマンド: プロジェクトのコマンド
- plugin のインストール範囲(Claude Code): このプロジェクトだけ、自分のすべてのプロジェクト、インストールしない

## 答えの保存先

スタイルとチェックの答えは、`.agents/dotagents.json` の `style` と `checks` に保存されます。このファイルは、このリポジトリーの dotagents の設定です。コミットして、チームで共有してください。

```json
{
  "style": { "git": "trunk", "architecture": "layered" },
  "checks": { "commit": "npm run check:changed", "push": "npm run check" }
}
```

各ツールの設定ファイルには、plugin の配布元への参照だけを書き込みます。ハーネス本体はリポジトリーにコピーしません。追加や削除をするのは dotagents の項目だけで、ほかの項目と書式は変えません。JSON として読み込めない設定ファイルがあるときは、何も書き込まずに中止します。8.x が残したコピーと Pi の設定の行は、削除します。Claude Code が PATH にあれば、`claude plugin install` も実行します。

## 画面

端末では、左の縦線でつないだ画面を表示します。色は端末の 16 色だけを使い、利用者のテーマに従います。どの質問にも、何を決めるか、選ぶと何が起きるか、答えがどこに保存されるかの説明が付きます。`NO_COLOR` を設定すると色を出さず、`FORCE_COLOR` を設定すると、端末でなくても色を出します。`TERM=dumb` では、罫線と記号を ASCII にします。パイプと CI には、制御列も縦線も出さず、プレーンなテキストを出力します。

## 質問なしで実行する

端末でないとき(エージェントや CI)は、`--yes` か、質問に対応するオプションを指定します。指定した質問は表示しません。

```sh
npx @hiroiku/dotagents init --yes --hosts claude,codex --git trunk --architecture layered --scope project --check push="npm run check"
```

| オプション | 意味 |
|---|---|
| `--yes`, `-y` | 質問せず、指定のない項目をすべて既定値にします |
| `--hosts claude,codex` | 対象のツール(`none` で設定しない) |
| `--git trunk\|release-branches` | git のスタイル(`none` で使わない) |
| `--architecture layered` | アーキテクチャのスタイル(`none` で使わない) |
| `--scope project\|user` | plugin のインストール範囲(`none` でインストールしない) |
| `--check 段階=コマンド` | チェックの段階ごとのコマンド。空にするときは `--check push=` |

`--help` で使い方、`--version` でバージョンを表示します。

## ライセンス

MIT。ソース、plugin の内容、ハーネスの説明は [hiroiku/dotagents](https://github.com/hiroiku/dotagents) にあります。
