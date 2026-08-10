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

別途の準備手順は無い。最初のコマンドが、自分の所有する規則の git リポジトリ(corpus)を `~/.dotagents/corpus` へ取ってきてから続きを行う。打つコマンドは初日も、その後も同じである。

対象の既定はこのプロジェクトである — 影響範囲が最小だからだ。より広い範囲には必ず flag が要る。何を入れるかに既定値は無い: module を名指しするか、対話で選ぶ。非対話シェルでは、代わりに選ぶのではなく停止する。

node と bun のどちらでもよい — `bunx` は同じパッケージに届き、CLI 自身がその機械に在る runtime を選ぶ。

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

[modules/](../modules/) が配布物の正本の定義である — installer 側にファイルの列挙は存在しないので、同期のずれで古びる物が無い。ここにある 2 つの module は、この正本が提供する物であって、丸ごと受け取るべき一式ではない: [harness](../modules/harness/docs/README.ja.md) はレビューエージェントと、モデルには推測できない慣習を携え、[architecture](../modules/architecture/docs/README.ja.md) はプロジェクトによって適する物にも適さない物にもなる依存規則を携える。

自分の module は `~/.dotagents/modules/` に置く。同じコマンドで install され、自分のマシンに留まる — リポジトリにも、公開されるパッケージにも決して入らない。`list` は両方の出所を見せる。同じ名前が二度主張されたときは、黙って上書きするのではなくエラーになる。

## どこに住むか

```
~/.dotagents/         このツールが保つすべてが、1 箇所に
├── corpus/           自分の規則。編集し、追従する git リポジトリ
├── modules/          自分の module
└── state/            何がどこへ置かれたかの記録
```

ここに installer は住まない。規則だけである。installer は npm から来て、そこで入れ替わる。

`DOTAGENTS_HOME` を移せば全体が移る。他に知らせるべき物は無い。本拠地は 1 つで、あらゆるパスがそこから導かれる — `status` と `--help` は現に効いている本拠地を表示するので、マシンが規則の出所を隠すことは無い。

## コマンド

```sh
dotagents update               # 上流に追従してから再配備する — 引数は不要、選んだ module を記憶している
dotagents uninstall <module>   # module を 1 つ外し、残りは保つ。名指ししなければすべてを除去する
dotagents status               # 配備された全ファイルを検査 — 乖離があれば exit 1
dotagents pull                 # 追従だけを行い、再配備はしない
dotagents --help               # 全コマンド・オプション・例
```

`install` は加算、`uninstall` は減算であり、配備先が保持する集合は module 1 つずつ積み上げられ、取り崩される。両側を揃えておく唯一のコマンドが `update` である: `pull` と同じ形で上流に追従し、そのうえで manifest が憶えている物を配り直す。

**勝手には動かない。** 取り込むのはエージェントを支配する文書なので、統合の前に入ってくるコミットタイトルを見せる。上流に差分があるときは 1 日 1 回伝えるだけで、更新はしない。

## 別々に更新される 2 つ

installer とあなたの規則は種類の違うものであり、一緒には動かない。

| | どこから来るか | どう動くか |
|---|---|---|
| **installer** | npm — `bun add -g` / `npm i -g` | 他の道具と同じように入れ替える |
| **あなたの規則** | git — `~/.dotagents/corpus` | `pull` / `update` で、あなたの合図で |

corpus が持つのは規則だけである。この分離こそが修正を届かせる: **規則を移行するコードが、移行される側の中に無い**。だから corpus がどれだけ古くても、それに働きかける installer は常に最新である。コマンドを更新すれば、その時点で修正は手元にある — 先に何かへ追従する必要は無い。

## installer が触れる物、触れない物

すべて冪等で**ハッシュ所有**である: installer が触れるのは、自分が置いて今も認識できる物だけ。自分で書いたスキルには一切触れず、配備先で編集したファイルは残して報告し(`--force` で上書き)、`uninstall` が除去するのは記録が置いたと言う物ちょうどそれだけである — それ以外には触れない。その記録は `~/.dotagents/state/` に住み、プロジェクトには決して置かれない。

プロジェクト範囲の plugin が読み込まれるのは、Claude Code をリポジトリのルートで起動したときだけであり、workspace の信頼ダイアログを承認した後だけである。エージェントと hook への変更は次のセッション、または `/reload-plugins` の後に効く。`SKILL.md` への編集は即座に取り込まれる。

## 構成

```
bin/agents-setup      CLI(clone / pull / list / install / update / uninstall / status)
test/                 installer の契約テスト(npm test · bun test)
modules/              この正本が提供する module 群
├── harness/          レビューエージェントと、git・testing・prompting の慣習
└── architecture/     ビルドが強制する依存規則
```

このリポジトリは両方の上流だが、配られ方は別である: npm が運ぶのは `bin/` だけ、clone が持ってくるのは規則だけである。
