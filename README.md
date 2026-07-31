# dotagents

AI エージェントハーネス(Claude Code / Codex 共用)の正本リポジトリ。
プロンプト・スキル・enforcement をここで版管理し、[bin/agents-setup](./bin/agents-setup) で各環境へ配布する。

## コンセプト

このハーネスが作るのは「1 つの有能なエージェント」ではなく、**限られた注意(コンテキスト)を役割で分割し、外部記録で接続した組織**である。個々の規則はすべて 1 つの前提から導かれる — context は有限で、セッションと共に消える。

- **オーケストレーション** — 委譲とはコンテキストの設計である。1 つの context に全部を持たせず、各役割へ判断に必要な最小の高信号情報だけを渡す
- **品質サイクル** — 作った者の context には「書いたもの」しか無く、欠落は見えない。だから検証と反証は別の context で行い、合否は作った者に決めさせない
- **git worktree** — 書き込みの合流点を構造(worktree 分割)で消し、構造で消せない合流点(統合ブランチと台帳)だけを排他で守る
- **beads** — 台帳は「コンテキストゼロの誰かが問い合わせだけで即断できる状態」のためにある。open は意思の宣言であり観測の置き場ではない。収束はインフロー制御(起票の反転・畳み込み)と検出(ゲート・残置注入)の両輪で守る
- **記憶** — 知識ごとに正本の住所を 1 つ決め、書き写さない。状態は文書ではなくクエリ(bd prime)。セッション間で文脈を運ぶのは会話の転写ではなく、住所を持つ外部記録(コンテキストブリッジ)
- **codegraph**(プロンプト未組み込み)— 探索の grep + Read ループを 1 回の explore(実ソース + 呼び出し経路 + 影響範囲)に置換する just-in-time retrieval
- **仕組み > 指示** — 機械で守れる規則は enforcement へ、瞬間を特定できる規則はスキルへ落とし、プロンプトに残すのは判断を要するものだけ

規則の本文はここに書かない(payload と二重管理になり、複製は黙って古くなる)。正本の索引:
役割・品質評価・Git 権限・Beads の遍在規則は [AGENTS.md](./payload/AGENTS.md)、
着手前と組成は [agents-kickoff](./payload/skills/agents-kickoff/SKILL.md)、
品質ループの運転は [agents-quality-loop](./payload/skills/agents-quality-loop/SKILL.md)、
bd 運用と記憶の線引きは [agents-beads-ops](./payload/skills/agents-beads-ops/SKILL.md)、
テスト設計は [agents-test-design](./payload/skills/agents-test-design/SKILL.md)、
三層配置とアブレーションの規律は [prompt-guidelines.md](./payload/docs/prompt-guidelines.md)。

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
