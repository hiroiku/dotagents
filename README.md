# dotagents

AI エージェントハーネス(Claude Code / Codex 共用)の正本リポジトリ。
プロンプト・スキル・enforcement をここで版管理し、`bin/agents-setup` で各環境へ配布する。

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

三層の原則: 遍在的に効く規則はコア(`AGENTS.md`)、特定の瞬間にだけ効く規則はスキル、
機械的に守れる規則は enforcement(hooks / bin)。規則を足すときは先に層を下げられないかを問う。

`payload/` が配布物の正であり、installer 側に配布物の列挙は存在しない
(列挙の複製は黙って古くなるため。`package.json` の `files` は `bin` と `payload` の 2 項のみ)。

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
