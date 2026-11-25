# @hiroiku/dotagents

[dotagents](https://github.com/hiroiku/dotagents)(Claude Code と Codex 向けの、AI に仕事を任せるためのハーネス)を、プロジェクトに対話で入れる。入れるときにも、設定を変えるときにも使う。

git のリポジトリーの中で実行する。

```sh
npx @hiroiku/dotagents init
```

Node.js 22 以上が要る。コミットはしない。尋ねたときは、書く前に、書くファイルを枠にまとめて見せ、書いてよいかを確かめる(「いいえ」なら何も書かずに終わる)。`--yes` と、質問をすべて指定した実行は、確かめない。

## 尋ねること

どの質問にも、既定の答えがある。いまの `.agents/dotagents.json` の値、無ければ、PATH とプロジェクト(ブランチ、`package.json` の scripts、Makefile)から推した値である。

- 入れるホスト: Claude Code(`.claude/settings.json`)、Codex(`.codex/config.toml`)
- git のスタイル: `trunk`、`release-branches`、選ばない
- アーキテクチャのスタイル: `layered`、選ばない
- チェックの段階(`edit`、`commit`、`push`、`release`)ごとの入口: プロジェクトのコマンド
- plugin を入れる範囲(Claude Code): このプロジェクトだけ、自分の全プロジェクト、入れない

答えは、`.agents/dotagents.json` と、各ホストのプロジェクトの設定に書く。書くのは、plugin の置き場への参照だけで、ハーネスの写しは置かない。足し引きするのは dotagents の項目だけで、ほかの項目と字は変えない。JSON として読めない設定があれば、何も書かずに止まる。8.x が残した写しと Pi の設定の行は、消す。Claude Code が PATH にあれば、`claude plugin install` も実行する。

## 画面

端末では、左の縦線でつなぐ画面を出す。色は端末の 16 色だけを使い、利用者のテーマに従う。どの質問にも、何を決めるか、選ぶと何が起きるかの説明が付く。`NO_COLOR` を設定すると色を出さず、`FORCE_COLOR` を設定すると、端末でなくても色を出す。`TERM=dumb` では、罫線と記号を ASCII に落とす。パイプと CI には、制御列も縦線も出さず、素の文を出す。

## 質問なしで実行する

端末でないとき(エージェントや CI)は、`--yes` か、質問の指定を付ける。指定した質問は尋ねない。

```sh
npx @hiroiku/dotagents init --yes --hosts claude,codex --git trunk --architecture layered --scope project --check push="npm run check"
```

| 指定 | 意味 |
|---|---|
| `--yes`, `-y` | 尋ねず、指定の無い質問をすべて既定で答える |
| `--hosts claude,codex` | 入れるホスト(`none` で入れない) |
| `--git trunk\|release-branches` | git のスタイル(`none` で選ばない) |
| `--architecture layered` | アーキテクチャのスタイル(`none` で選ばない) |
| `--scope project\|user` | plugin を入れる範囲(`none` で入れない) |
| `--check 段階=コマンド` | チェックの段階ごとの入口。空にするなら `--check push=` |

`--help` で使い方、`--version` で版を出す。

## ライセンス

MIT。ソース、plugin の中身、ハーネスの説明は [hiroiku/dotagents](https://github.com/hiroiku/dotagents) にある。
