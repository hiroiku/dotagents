# dotagents

**AI エージェントが従う規則のパッケージマネージャ。** スキル・レビューエージェント・hook — module としてまとめられ、選んだプロジェクトへ install される。

[English](../README.md) | 日本語 | [简体中文](README.zh-CN.md) | [繁體中文](README.zh-TW.md) | [한국어](README.ko.md) | [Deutsch](README.de.md) | [Español](README.es.md) | [Français](README.fr.md)

[![npm](https://img.shields.io/npm/v/%40hiroiku%2Fdotagents)](https://www.npmjs.com/package/@hiroiku/dotagents)
[![license: MIT](https://img.shields.io/badge/license-MIT-blue.svg)](../LICENSE)

- **module が単位である。** 1 つのディレクトリが、必要とする物を宣言し、届ける物を携え、存在理由を語る。プロジェクトへもマシン全体へも install でき、外すのも同じだけ綺麗に済む。
- **エージェントは結果をそのまま読む。** ランタイムもデーモンも、シェルへの組み込みも無い — installer は各エージェントが既に見ている場所へ素のファイルを書き、あとは身を引く。
- **規則は 1 組、エージェントは複数。** 同じ module が、それぞれのエージェントが理解する形で Claude Code と Codex に届く。

## install する

パッケージは 1 つ。仕組みを運び、あわせて**選別された module の一式を `~/.dotagents/modules/` にあなたの物として実体で置く** — 要らない物は消し、惜しい物は直し、隣に自分の物を足せばよい。私から来る物はすべて `from hiroiku` と名乗るので、誰の意見を読んでいるかは常に分かる。

```sh
bun add -g @hiroiku/dotagents      # 一度だけ。もしくは npm i -g @hiroiku/dotagents

dotagents list                     # install できる物
dotagents install review           # 現在のプロジェクトへ
dotagents install review -g        # このマシンの全プロジェクトへ
dotagents install review -C ~/x    # 指定したプロジェクトへ
```

clone する物も、取ってくる物も、作業を始める前に移行しておくべき状態も無い: module はパッケージの中を一緒に旅してくるので、最初のコマンドがそれを置き、次のコマンドがそのまま install できる。

対象の既定はこのプロジェクトである — 影響範囲が最小だからだ。より広い範囲には必ず flag が要る。何を入れるかに既定値は無い: module を名指しするか、対話で選ぶ。非対話シェルでは、代わりに選ぶのではなく停止する。

`dotagents install` は **module 選択 → インストール先選択** の順に進む。2 画面目で **Claude Code / Codex を複数選択**でき、各ツールへの導入済み件数とドリフトも表示する。名指しした module を入れる場合も、`--agent` を省略すればインストール先を選べる。

```sh
dotagents install
dotagents install review prompting --agent codex
dotagents install git --agent claude,codex
dotagents install review -g --agent codex
```

インストール先ごとに module の集合を記録する。`update`・`uninstall`・`status` は記録済みの全インストール先に働き、`--agent codex` などで対象を絞れる。非対話実行では module 名が必須。`--agent` を省略すると記録済みの先を使い、新規の場合は従来互換で Claude と、`.codex/` またはプロジェクトの `AGENTS.md` が存在すれば Codex を選ぶ。CI などでは `--agent` の明示を推奨する。

node と bun のどちらでもよい — CLI 自身がその機械に在る runtime を選ぶ。

対話選択では対象の `project / global` を上部に示し、**今回の選択** (`[ ]` / `[x]`) と **現在の導入状態** を分けて表示する。灰色の `○` は未導入、緑の `●` は導入済み、黄色の `↑` は更新待ち、青の `~` は配備先の編集、赤の `!` は欠落や配備を妨げる状態。カーソルを合わせた module の説明・出どころ・差分の理由は一覧の下に表示する。配るのはチェックした module だけで、チェックしていない導入済みの module は、正本が変わっていても前回配った内容のまま残り、`update` で配り直される。チェックを外しても uninstall にはならない。外すときは `uninstall` の対話選択を使う。

選択画面と `status` は配布内容を同じ方法で比較する。配布元の変更と配備先の編集は両方表示でき、版番号だけが変わっても全 module を更新待ちにはしない。共通の plugin 情報の差分は別に表示し、module ごとの区切りを持たない規則ブロックの編集は `shared rules changed` として示す。`NO_COLOR` でも記号とラベルで状態を判別できる。

## module とは何か

`module.json` を持つディレクトリである。それ以外はすべて任意で、種別ごとに届く先は 1 つ:

```
modules/<name>/
├── module.json    それが何者で、PATH に何を期待し、何を受け継いだか
├── README.md      存在理由 — 人のための物で、決して配備されない
├── AGENTS.md      全セッションに注入される規則
├── skills/        その時が来たときにだけ読まれる規則
├── agents/        独自の context とツールを持つサブエージェントの役割
├── hooks/         エージェントの作業中に走るイベントハンドラ
└── codex/         Codex 固有のネイティブ設定（任意）
```

| 種別 | Claude Code | Codex |
|---|---|---|
| `skills/` | `.claude/skills/dotagents/skills/` — `/dotagents:*` | `.agents/skills/dotagents-*/` — スキルの `name` も `dotagents-*` にする |
| `agents/*.md` | plugin 内の `agents/` | `.codex/agents/dotagents-*.toml` に変換。同梱レビュー役は `read-only` sandbox |
| `hooks/` | plugin 内の `hooks/` | Claude 固有の hook は自動変換しない。`codex/hooks.json` にネイティブ形式を用意する |
| `codex/` | 配布しない | `.codex/` へネイティブ設定を配る。`codex/agents/dotagents-<name>.toml` は同名の変換結果より優先 |
| `AGENTS.md` | `.claude/CLAUDE.md` 内の管理ブロック | プロジェクトは `AGENTS.md`、`-g` は `~/.codex/AGENTS.md`。無ければ作成 |

Codex の配置は公式の[スキル検出](https://learn.chatgpt.com/docs/build-skills#where-codex-loads-local-skills)と[カスタムエージェント](https://learn.chatgpt.com/docs/agent-configuration/subagents)の形式に従う。`-g` ではスキルを `~/.agents/skills/`、エージェントを `~/.codex/agents/` に置く。既存の `.codex/skills/dotagents-*` は `update` で移行し、手修正した旧ファイルは残して報告する。旧 `.agents/.dotagents.json` が残る環境では、先に `--agent` なしの `update` を1回実行してから個別のインストール先を選ぶ。

同梱の全 module は Codex に配布できる。自作エージェントの変換では単一行の `name`・`description`・`tools` を読み、本文を `developer_instructions` にする。Claude のモデル指定は移さず、Codex の設定を引き継ぐ。より細かい制御や複雑なメタデータが必要ならネイティブ TOML を用意する。ネイティブ設定にもハッシュ所有の規則が適用され、既存のユーザー設定と競合すれば保持して報告する。

Codex はインストール後に新しいセッションで読み込む。独自の hook を配る場合は、Codex の [`/hooks` による信頼確認](https://learn.chatgpt.com/docs/hooks)が必要で、installer は信頼設定を変更しない。

プロジェクトの規則を共通正本へまとめる場合は、実ファイルの `.agents/AGENTS.md` を用意し、
`AGENTS.md → .agents/AGENTS.md` と `.claude/CLAUDE.md → ../.agents/AGENTS.md` のシンボリックリンクを張れる。
この構成では、正本内の管理ブロックを1つだけ配布・更新・検査・削除し、リンクとプロジェクト自身の記述は保持する。
正本や `.agents` 自体がシンボリックリンクの場合や、別の行き先を指す規則ファイルは対象にしない。
正本が欠けている場合も、リンクを通常ファイルへ置き換えず警告する。

module は `PATH` に期待する物を宣言してよい。要件は**検出されるだけで、決して install されない**: `list` と `install` は欠けている物を報告するが、何も妨げない。だから後からツールを足しても、再 install は要らない。

退役した名前を受け継いだのなら、それも宣言してよい(`replaces`)。古い名前を憶えている記録は、規則が行った先まで — 改名であれ、複数への分割であれ — ついていく。installer は対応表を持たない: どこへ行ったかを言うのは正本であり、移行が済んだと判断したときに消すのは module の 1 行であって、installer ではない。

[modules/](../modules/) がその一式の正本の定義である。installer は列挙を持たない。ファイルの列挙も、module の列挙も持たず、`~/.dotagents/modules/` に在る物をそのまま読む。この一式は既定であると同時に出発点でもあり、丸ごと受け取るべき物ではない: [review](../modules/review/README.md) はコードを書かなかった context へ検証を渡し、[code](../modules/code/README.md) はコメントが何のためにあるかを、[git](../modules/git/README.md)・[testing](../modules/testing/README.md)・[prompting](../modules/prompting/README.md) はモデルには推測できない慣習を、それぞれ効く瞬間に読ませる形で携え、[architecture](../modules/architecture/docs/README.ja.md) はプロジェクトによって適する物にも適さない物にもなる依存規則を、[github](../modules/github/README.md) は issue のどの仕組みがどの意味を担うかと、着手から後片付けまでの一巡りを携える。

module は、そのうちの 1 つが自分に合わなくても、残りを道連れにしないように切ってある。ここに束は無い: レビュー役が馴染まない機械へ `git` と `testing` だけを入れることも、必要な 1 つのリポジトリへ `review` だけを入れることもできる。

module が住める場所は 1 つ、`~/.dotagents/modules/` だけである。見本はパッケージの中から読まれるのではなく、そこへ*置かれる* — だから install できる集合と、編集できる集合が同じ集合になる。同じ形の物なら何でも効く: どんな手で入手した物でも、そのディレクトリをそこへ置けば module である。

置かれた後、module はその人の物である:

| | |
|---|---|
| 触っていない | パッケージが新しい版を運んできたら追従する |
| 編集した | 残して報告する(`--force` で見本の内容にする) |
| 消した | 二度と置かれない |

`list` は今もそれぞれの出どころを言う — 私が運ぶ一式は `from hiroiku`、手が入っていれば同じ物に `edited by you`、自分で書いた物には何も付かない。

## どこに住むか

```
~/.dotagents/         あなたの物すべてが、1 箇所に
├── modules/          すべての module — 見本もここに置かれる
└── state/            何がどこへ置かれたか、見本のどれを変えたか
```

installer 自体はここに住まない。来た場所で入れ替わる。module はここに住む — パッケージが置いた物も含めて。それがこの設計の要点である。

`DOTAGENTS_HOME` を移せば全体が移る。他に知らせるべき物は無い。本拠地は 1 つで、あらゆるパスがそこから導かれる — `status` と `--help` は現に効いている本拠地を表示するので、マシンが規則の出所を隠すことは無い。

## コマンド

```sh
dotagents update               # 記録されている物を配り直す — 引数は不要、選んだ module を憶えている
dotagents uninstall            # ここに導入済みの物から、外す module を選ぶ
dotagents uninstall <module>   # module を 1 つ外し、残りは保つ
dotagents status               # 配備された全ファイルを検査 — 乖離があれば exit 1
dotagents update --agent codex # Codex の配布内容だけ更新
dotagents status --agent codex # Codex だけ検査
dotagents --help               # 全コマンド・オプション・例
```

`install` は加算、`uninstall` は減算であり、配備先が保持する集合は module 1 つずつ積み上げられ、取り崩される。どちらも触れるのは渡された module だけで、残りは前回配った内容のまま保つ。`update` は manifest が憶えている物を起点に働く: その集合全体を配り直し、見つけた旧レイアウトを刈り取る。

端末で `uninstall` を名指しせずに実行すると、対象に導入済みの module を選ぶ画面が開く。選んだ module が Claude Code と Codex の両方に入っていれば、続けてどちらから外すかを選ぶ。非対話実行で名指ししなければ、すべてを除去する。

**配備先から規則を消すのは `uninstall` だけである。** `~/.dotagents/modules/` から module を消すのは日常の軽い操作であり、それを入れた全プロジェクトを書き換えてよい理由にはならない。だから配達済みの module が供給元を失ったとき、`update` はファイルを残し、記録を残し、`CLAUDE.md` の行も残し、何を残したか・どう消すかを言う。`status` はそれを乖離として報告する — 照合する元が無い以上、合っているとは言えないからである。

**勝手には動かない。** 配るのはエージェントを支配する文書なので、配備が自動で起きることも、黙って起きることも無い。どのコマンドも、置いた物・残した物・除いた物をそのつど示す。

## 更新の経路は 1 本

新しい規則は、コマンドを走らせて来るのではなく、パッケージを更新することで来る。入れたときと同じやり方で更新し、そのうえで配り直す:

```sh
bun add -g @hiroiku/dotagents   # もしくは npm i -g @hiroiku/dotagents
dotagents update -g             # と dotagents update -C <project>
```

| | どこから来るか | どう動くか |
|---|---|---|
| **仕組み**(`@hiroiku/dotagents`) | npm | 他の道具と同じように入れ替える |
| **見本の一式**(`hiroiku`) | その同じパッケージの中 | `~/.dotagents/modules/` へ置かれ、触っていない物だけが追従する |
| **自分の module** | `~/.dotagents/modules/` | あなたの物である。他の誰もそこへ書かない |

経路は 2 本ではなく 1 本である。2 本あれば必ず片方が古くなり、**設定を移行するコードが、移行される側の中に閉じ込められる** — 自分が届けるはずの更新を、自分が待つことになる。1 本なら、修正と、その修正が直す規則とが、名前の付いた 1 つのバージョンとして一緒に届く。

## installer が触れる物、触れない物

すべて冪等で**ハッシュ所有**である: installer が触れるのは、自分が置いて今も認識できる物だけ。自分で書いたスキルには一切触れず、配備先で編集したファイルは残して報告し(`--force` で上書き)、`uninstall` が除去するのは記録が置いたと言う物ちょうどそれだけである — それ以外には触れない。その記録は `~/.dotagents/state/` に住み、プロジェクトには決して置かれない。

プロジェクト範囲の plugin が読み込まれるのは、Claude Code をリポジトリのルートで起動したときだけであり、workspace の信頼ダイアログを承認した後だけである。エージェントと hook への変更は次のセッション、または `/reload-plugins` の後に効く。`SKILL.md` への編集は即座に取り込まれる。

## 構成

```
bin/agents-setup      CLI(list / install / update / uninstall / status)
test/                 installer の契約テスト(npm test · bun test)
modules/              一緒に旅する見本の一式 — 配布元は hiroiku
├── review/           反証としてのレビュー、OWASP、WCAG — 自分の context で
├── code/             コメントが何のためにあるか
├── git/              コミットタイトル、squash、rebase
├── testing/          良いテストの 12 の性質
├── prompting/        プロンプトを編集する前に読む物
├── architecture/     ビルドが強制する依存規則
└── github/           issue が何を担えるか、着手から後片付けまで
```

パッケージは 1 つ、版も 1 つ: 仕組みと、それが置く規則は、常に一緒に検証された組でしかない。ここの `modules/` は見本の出どころであって、住処ではない — 置かれた後、`~/.dotagents/modules/` の写しはあなたの物である。
