# dotagents

**AI エージェントが従う規則のパッケージマネージャ。** スキル・レビューエージェント・hook — module としてまとめられ、選んだプロジェクトへ install される。

[English](../README.md) | 日本語 | [简体中文](README.zh-CN.md) | [繁體中文](README.zh-TW.md) | [한국어](README.ko.md) | [Deutsch](README.de.md) | [Español](README.es.md) | [Français](README.fr.md)

[![npm](https://img.shields.io/npm/v/%40hiroiku%2Fdotagents)](https://www.npmjs.com/package/@hiroiku/dotagents)
[![license: MIT](https://img.shields.io/badge/license-MIT-blue.svg)](../LICENSE)

- **module が単位である。** 1 つのディレクトリが、必要とする物を宣言し、届ける物を携え、存在理由を語る。プロジェクトへもマシン全体へも install でき、外すのも同じだけ綺麗に済む。
- **エージェントは結果をそのまま読む。** ランタイムもデーモンも、シェルへの組み込みも無い — installer は各エージェントが既に見ている場所へ素のファイルを書き、あとは身を引く。
- **規則は 1 組、エージェントは複数。** 同じ module が、それぞれのエージェントが理解する形で Claude Code と Codex に届く。

## module を install する

```sh
bun add -g @hiroiku/dotagents      # 初回のみ — もしくは npm i -g @hiroiku/dotagents

dotagents list                     # install できる物
dotagents install harness          # 現在のプロジェクトへ
dotagents install harness -g       # このマシンの全プロジェクトへ
dotagents install harness -C ~/x   # 指定したプロジェクトへ
```

準備手順は無い。module はパッケージの中に同梱されているので、最初のコマンドがそのまま install になる — clone する物も、取ってくる物も、作業を始める前に移行しておくべき状態も無い。グローバルに入れずに済ませるなら `bunx @hiroiku/dotagents install harness` でも同じことができる。

対象の既定はこのプロジェクトである — 影響範囲が最小だからだ。より広い範囲には必ず flag が要る。何を入れるかに既定値は無い: module を名指しするか、対話で選ぶ。非対話シェルでは、代わりに選ぶのではなく停止する。

node と bun のどちらでもよい — CLI 自身がその機械に在る runtime を選ぶ。

## module とは何か

`module.json` を持つディレクトリである。それ以外はすべて任意で、種別ごとに届く先は 1 つ:

```
modules/<name>/
├── module.json    それが何者で、PATH に何を期待するか
├── README.md      存在理由 — 人のための物で、決して配備されない
├── AGENTS.md      全セッションに注入される規則
├── skills/        その時が来たときにだけ読まれる規則
├── agents/        独自の context とツールを持つサブエージェントの役割
└── hooks/         エージェントの作業中に走るイベントハンドラ
```

| 種別 | Claude Code | Codex |
|---|---|---|
| `skills/` · `agents/` · `hooks/` | `.claude/skills/dotagents/` — **1 つの plugin directory**。marketplace も install 手順も無しに読み込まれ、その中身を `/dotagents:*` という名前空間に収める。hook が `settings.json` に一切触れずに届くのは、これによる | スキルのみ、`.codex/skills/dotagents-*` として — Codex に plugin は無いので、名前空間はディレクトリ名に畳み込まれる |
| `AGENTS.md` | `.claude/CLAUDE.md` 内の管理ブロック | `AGENTS.md` 内の管理ブロック |

module は `PATH` に期待する物を宣言してよい。要件は**検出されるだけで、決して install されない**: `list` と `install` は欠けている物を報告するが、何も妨げない。だから後からツールを足しても、再 install は要らない。

[modules/](../modules/) が配布物の正本の定義である — installer 側にファイルの列挙は存在しないので、同期のずれで古びる物が無い。同梱の module は既定であると同時に見本でもあり、丸ごと受け取るべき一式ではない: [harness](../modules/harness/docs/README.ja.md) はレビューエージェントと、モデルには推測できない慣習を携え、[architecture](../modules/architecture/docs/README.ja.md) はプロジェクトによって適する物にも適さない物にもなる依存規則を、[github](../modules/github/docs/README.ja.md) は issue のどの仕組みがどの意味を担うかを携える。

自分の module は、同じ形のまま `~/.dotagents/modules/` に置く。同じコマンドで install され、自分のマシンに留まる — リポジトリにも、公開されるパッケージにも決して入らない。`list` は両方の出所を見せる。同じ名前が二度主張されたときは、黙って上書きするのではなくエラーになる。

## どこに住むか

```
~/.dotagents/         あなたの物すべてが、1 箇所に
├── modules/          自分の module
└── state/            何がどこへ置かれたかの記録
```

npm から来た物はここに住まない — installer も、同梱の module もである。どちらも、来た場所で入れ替わる。

`DOTAGENTS_HOME` を移せば全体が移る。他に知らせるべき物は無い。本拠地は 1 つで、あらゆるパスがそこから導かれる — `status` と `--help` は現に効いている本拠地を表示するので、マシンが規則の出所を隠すことは無い。

## コマンド

```sh
dotagents update               # 記録されている物を配り直す — 引数は不要、選んだ module を憶えている
dotagents uninstall <module>   # module を 1 つ外し、残りは保つ。名指ししなければすべてを除去する
dotagents status               # 配備された全ファイルを検査 — 乖離があれば exit 1
dotagents --help               # 全コマンド・オプション・例
```

`install` は加算、`uninstall` は減算であり、配備先が保持する集合は module 1 つずつ積み上げられ、取り崩される。`update` は manifest が憶えている物を起点に働く: その集合を配り直し、記録に残るが既に配られていない物を除き、見つけた旧レイアウトを刈り取る。

**勝手には動かない。** 配るのはエージェントを支配する文書なので、配備が自動で起きることも、黙って起きることも無い。どのコマンドも、置いた物・残した物・除いた物をそのつど示す。

## 更新の経路は 1 本

新しい規則は、コマンドを走らせて来るのではなく、パッケージを更新することで来る。入れたときと同じやり方で更新し、そのうえで配り直す:

```sh
bun add -g @hiroiku/dotagents   # もしくは npm i -g @hiroiku/dotagents
dotagents update -g             # と dotagents update -C <project>
```

| | どこから来るか | どう動くか |
|---|---|---|
| **installer と、同梱の module** | npm | 他の道具と同じように入れ替える |
| **自分の module** | `~/.dotagents/modules/` | あなたの物である。他の誰もそこへ書かない |

経路は 2 本ではなく 1 本である。2 本あれば必ず片方が古くなり、**設定を移行するコードが、移行される側の中に閉じ込められる** — 自分が届けるはずの更新を、自分が待つことになる。1 本なら、修正と、その修正が直す規則とが、名前の付いた 1 つのバージョンとして一緒に届く。

## installer が触れる物、触れない物

すべて冪等で**ハッシュ所有**である: installer が触れるのは、自分が置いて今も認識できる物だけ。自分で書いたスキルには一切触れず、配備先で編集したファイルは残して報告し(`--force` で上書き)、`uninstall` が除去するのは記録が置いたと言う物ちょうどそれだけである — それ以外には触れない。その記録は `~/.dotagents/state/` に住み、プロジェクトには決して置かれない。

プロジェクト範囲の plugin が読み込まれるのは、Claude Code をリポジトリのルートで起動したときだけであり、workspace の信頼ダイアログを承認した後だけである。エージェントと hook への変更は次のセッション、または `/reload-plugins` の後に効く。`SKILL.md` への編集は即座に取り込まれる。

## 構成

```
bin/agents-setup      CLI(list / install / update / uninstall / status)
test/                 installer の契約テスト(npm test · bun test)
modules/              パッケージに同梱される module 群
├── harness/          レビューエージェントと、git・testing・prompting の慣習
├── architecture/     ビルドが強制する依存規則
└── github/           issue が何を担えるか、どの軸に載せるか
```

このリポジトリは両方の上流であり、npm は両方を運ぶ: `bin/` と `modules/` は、1 つのバージョンとして一緒に公開される。
