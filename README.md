# dotagents

AI エージェントハーネス(Claude Code / Codex 共用)の正本リポジトリ。
プロンプト・スキル・enforcement をここで版管理し、[bin/agents-setup](./bin/agents-setup) で各環境へ配布する。

## コンセプト

このハーネスは「1 つの有能なエージェント」ではなく、**限られた注意(コンテキスト)を役割で分割し、外部記録で接続した組織**を作る。以下は忘れないための地図であり、規範の正本は [payload/AGENTS.md](./payload/AGENTS.md) と [payload/skills/](./payload/skills/) にある(規則をここへ書き写さない — 複製は黙って古くなる)。

### 三層アーキテクチャ

規則を足すときは、まず下の層に置けないかを問う。

1. **enforcement**(hooks / bin)— 機械的に守れる規則。argv・実環境変数など構造化された入力で判定し、コマンド文字列の構文解析やパターン列挙で近似しない。閉じられない契約は穴のあるガードを置かず検出型に落とす
2. **スキル**(skills/)— 特定の瞬間にだけ効く規則。コアの「スキル参照」表がその瞬間を定め、必要になるまで読まれない(progressive disclosure)
3. **コア**(AGENTS.md)— 遍在的に効く規則だけ。全セッションの注意を常時消費する場所なので、ここに置けるのは観測の瞬間を選ばないものに限る

### 役割とサブエージェントのオーケストレーション

- `マネージャー` はユーザーと対話する唯一の管理役(設計・組成・トリアージ・統合・起票)。`サブエージェント` は委譲された担当範囲だけを遂行し、bd に書き込まず、発見は報告で返す
- 委譲とはコンテキストの設計である: 各役割にはその判断に必要な**最小の高信号情報だけ**を渡す。渡した情報は注意を占有し、渡さなかった情報はその役割には存在しない
- 入力は依頼書(actor / issue / 対象コミット / 報告スキーマ / マネージャーに戻す条件)で固定し、出力はスキーマで受け取る。作業経過の転写はマネージャーの context に入れない

### 品質サイクル

`完了主張`(実装側の報告)→ `検証`(証拠の独立再実行)→ `反証レビュー` → `完了判定` を分離する。**作った者は合否を決めない**。

- 着手前に、ドメイン言語の合格条件と 2 種のレビュー憲章(共有版 / 反証版)を凍結する。品質の律速は実装力ではなく、着手前に不確実性をどれだけ潰せたか(盲点洗い出し)
- レビュアーに差分・実装側の報告を先に渡さない。注意が「書かれたもの」の検証に占有され、「書かれなかったもの」(欠落)が探索されなくなる
- 指摘は個別に潰さない。指摘は症状であり、それが壊した契約(`欠陥クラス`)の単位で直す場所を決め、`再発ガード` は機械的に守れる最も下位の層(設計 > 型・lint > 契約テスト 1 本)に置く
- `完了判定` はゲートへの機械的な突き合わせであり、サブエージェントにも代行させない

### Git と worktree

- worktree は「ここで作業が進行中」という宣言。1 つの worktree の書き手は同時に 1 人。並列化は worktree を分けられる単位に限る
- 統合ブランチは worktree 分割で守れない唯一の合流点であり、bd の merge-slot(排他ロック)を保持している間だけ merge する
- 検証・レビューは成果物のコミットから作った専用 worktree で、実物に対して行う。役目を終えた worktree に、そこにしか無い成果を残さない

### Beads(bd)

台帳の目的はただ 1 つ — **コンテキストゼロの誰かが、bd への問い合わせだけで「次に何をすべきか・誰が何を作業中か・何がなぜ止まっているか」を即断できる状態を保つ**。運用判断はすべて 4 つの失敗クラス(乖離・停滞/循環・欠落・孤立)からの導出である。

- `open` は「やると決めた」という宣言。観測・指摘を既定で open にしない(収束バイアス)。記録するなら起票して即 close、条件があるなら defer、同型は 1 つの `欠陥クラス` issue に畳む
- 起票時に消化の経路(親子・blocks・ラベル)を与える。依存・重複・置換は文章ではなく関係で表現し、孤立 issue を作らない
- 占有(claim)・帰属(actor)・排他(merge-slot)・停滞検出(stale)・重複検出は bd のネイティブ機能を使い、自前で再実装しない

### 記憶の線引き

知識ごとに正本の住所を 1 つ決め、書き写さない。書き写した瞬間から複製は古くなり、`乖離` の主因になる。

| 知識 | 住む場所 | 仕組み・理由 |
|---|---|---|
| いまの状態(誰が何を作業中か、次に何をすべきか) | bd への問い合わせ | `bd prime` が動的に注入する。状態のスナップショットを文書にしない |
| 全セッションが例外なく必要とする少数の不変事項 | `bd remember` | 書き込みは enforcement(確認付きラッパー)。読み切れない分量に育つこと自体が乖離 |
| 作業の経緯・ラウンドの記録・リスク受容 | 対象 issue への追記 | 会話は消える。`完了判定` が突き合わせるのは外部記録である |
| 領域の設計判断とその経緯 | ADR | 「なぜこうしたか」は判断の記録として残し、現在の答えの正本とは分ける |
| ドメイン用語(ユビキタス言語) | 用語の正本(CONTEXT.md 等) | issue・合格条件・憲章・コミットはこの言葉で書く。コードの現状を issue に書き写さない |
| ガード化済みの `欠陥クラス` | ガード自身 | 仕組みが記憶する。憲章・文書からは取り除く |
| 特定の瞬間にだけ要る知識 | その瞬間に読むスキル / issue の note | progressive disclosure。遍在させない |

**コンテキストブリッジ**: セッション・エージェントの間で文脈を運ぶのは会話の転写ではなく、構造化された外部記録(依頼書・報告スキーマ・issue・コミット)である。context はセッションと共に消える前提で、残すべきものは住所の決まった正本へ移す。

### codegraph(プロンプト未組み込み)

grep + Read のループを 1 回の explore(該当シンボルの実ソース + 呼び出し経路 + 影響範囲)で置き換える just-in-time retrieval の道具。着手前の土地勘づくり、`横展開スイープ` の同型探索、レビューの影響範囲確認に使う。プロンプト・enforcement への組み込みはまだ無い。

### 収束

issue の増殖(台帳への信頼崩壊)への対策は 2 方向で、両輪が要る。

- **インフロー制御**: 起票反転(観測を既定で open にしない)・起票時に消化の経路を与える・同型の畳み込み
- **検出**: `bd children` 完了ゲート、SessionStart の残置注入、stale 検出

2026-07-31 導入の収束規則群は観測実績が付くまでアブレーション凍結([payload/docs/prompt-guidelines.md](./payload/docs/prompt-guidelines.md))。

### 検討中(未実装)

- `BD_OPEN_OK` ガード: 消化の経路を持たない open 起票を enforcement で一度止める(`BD_MEMO_OK` と同型)
- codegraph のプロンプト組み込み
- kuden-os の旧世代ハーネス(`.agents/rules/` + `prompts/beads.md`)からの移行

## 構成

```
bin/agents-setup      インストーラー CLI(install / update / uninstall / status)
payload/              配布物の唯一の定義。この木がそのまま .agents/ になる
├── AGENTS.md         コア規則(全セッションが常時読む。遍在的な規則だけを置く)
├── skills/           瞬間別の細則(その瞬間が来たときだけ読む)
├── hooks/            shellenv.sh(bd ラッパー配達)/ beads-session.sh(SessionStart)
├── bin/bd            enforcement ラッパー(bd remember の書き込み確認)
└── docs/             プロンプト更新のガイドライン
```

三層の原則: 遍在的に効く規則はコア([AGENTS.md](./payload/AGENTS.md))、特定の瞬間にだけ効く規則はスキル、
機械的に守れる規則は enforcement(hooks / bin)。規則を足すときは先に層を下げられないかを問う。

[payload/](./payload/) が配布物の正であり、installer 側に配布物の列挙は存在しない
(列挙の複製は黙って古くなるため。[package.json](./package.json) の `files` は `bin` と `payload` の 2 項のみ)。

## インストール

```sh
# ユーザーレベル(~/.agents)
bin/agents-setup install

# プロジェクトレベル(<project>/.agents。リンクは相対)
bin/agents-setup install --project /path/to/project
```

installer が行うこと(すべて冪等):

- `payload/` → `.agents/` のコピー(manifest `.dotagents.json` に内容ハッシュを記録)
- symlink: `.claude/CLAUDE.md → .agents/AGENTS.md`、`.claude/skills → .agents/skills`、
  Codex は `.codex/` が存在する環境にのみ `AGENTS.md` とスキル単位のリンクを張る
- `~/.zshenv` にガード付き管理行を追加(ユーザーレベルのみ。ファイルが無ければ何も起きない形):
  `[ -f "$HOME/.agents/hooks/shellenv.sh" ] && . "$HOME/.agents/hooks/shellenv.sh" # agents-harness`
- `settings.json` 断片: `env.BASH_ENV`、`hooks.SessionStart`、`permissions.ask`(push / merge)

## 更新・照合・アンインストール

```sh
bin/agents-setup update      # payload の変更を反映し、payload から消えた配布物を刈り込む
bin/agents-setup status      # manifest・payload・実体・リンク・断片を照合(乖離時 exit 1)
bin/agents-setup uninstall   # 自分が置いたものだけを除去する
```

所有権の原則: installer が触れるのは「自分が置き、内容ハッシュが一致するもの」だけ。

- `.agents/skills/` 内の自前スキル(manifest に無い entry)には一切触れない
- インストール先で改変されたファイルは残して警告する(`--force` で上書き)
- settings.json は「自分が追加した断片」だけを manifest に覚え、それだけを除去する

## プロンプトの更新

`payload/docs/prompt-guidelines.md` に従う。編集は必ずこのリポジトリで行い、
各環境へは `agents-setup update` で配る(インストール先を直接編集すると update が保護して
警告するようになる — それが乖離の検出である)。
