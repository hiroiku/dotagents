# プロンプト更新のガイドライン

プロンプトやエージェント定義を更新するときは以下に従う。

- [2025/09/29: Effective context engineering for AI agents](https://www.anthropic.com/engineering/effective-context-engineering-for-ai-agents)
- [2026/07/06: A field guide to Claude Fable 5: Finding your unknowns](https://claude.com/blog/a-field-guide-to-claude-fable-finding-your-unknowns)
- [2026/07/24: The new rules of context engineering for Claude 5 generation models](https://claude.com/blog/the-new-rules-of-context-engineering-for-claude-5-generation-models)

## 構成の原則

- 規則の正本は dotagents リポジトリ(現在は `/Volumes/Repositories/hiroiku/dotagents`)。編集・レビュー・版管理・bd 台帳はここで行う。将来はこのリポジトリをそのまま公開し bun / npm から利用できる形にする(`package.json` は準備済み、`private: true`)。
- インストール先はコピー配布: ユーザーレベルは `~/.agents`、プロジェクトレベルは `<project>/.agents` に payload の実体を複製し、manifest(`.dotagents.json`)に source・commit・kind・内容ハッシュ・断片の所有権・所有するスキル名の一覧を記録する。skills はスキル単位の所有で、記録に無い entry(自前スキル)には installer は触れない。更新は正本で `bin/agents-setup update`。payload の定義は installer の `PAYLOAD` が正で(`package.json` の `files` と一致、`status` が機械照合)、ここには列挙しない — 列挙の複製は黙って古くなる。
- 各ハーネスはシンボリックリンクでインストール先を参照する: Claude Code は `.claude/CLAUDE.md → .agents/AGENTS.md`、スキルとエージェント定義は常に単体リンク(`.claude/skills/{name}`、`.claude/agents/{name}.md`)。Codex も同形(`.codex/AGENTS.md`、`.codex/skills/{name}`)。ディレクトリごとのリンクは張らない — 自前の実体との同居を壊すため(installer が管理)。プロジェクトレベルでは相対リンクにし、既存ファイルは上書きしない。環境断片・symlink の参照先は常にインストール先(`~/.agents`)であり、正本の場所に依存しない。
- プロンプト内のパスは `.agents/` ルート相対で書き、インストール位置(ユーザー / プロジェクト)に依存させない。settings.json はマシン固有の環境設定であり版管理しない — ハーネスが必要とする断片(permissions.ask / SessionStart hook / env.BASH_ENV)の正本は `bin/agents-setup` が定義し、install / uninstall / status で冪等に書き込み・除去・照合する(インストーラー方式)。
- 三層に配置する: 遍在的に効く規則(観測の瞬間を選ばないもの)はコア(`AGENTS.md`)、特定の瞬間にだけ効く規則はスキル(`skills/*/SKILL.md`。コアの「スキル参照」がその瞬間を定める)、機械的に守れる規則は enforcement(permissions / `hooks/` / `bin/` のコマンドラッパー)。
- enforcement は対象の argv・実環境変数など構造化された入力で判定する。コマンド文字列の構文解析やパターン列挙で近似しない — 列挙はシェル構文の変形(改行・サブシェル・bash -c 等)で必ず漏れる。配達経路はハーネスの**実シェル**に対して検証する(このハーネスの Bash ツールの実体は zsh。bash 前提の機構は届かない)。
- enforcement で閉じられない契約は、穴のあるガードを置かず**検出型**に落とす。bd の close 子残置は予防できない(close 経路が CLI 表面で収束しない)ため、完了ゲートの `bd children` 突き合わせと SessionStart の残置注入で検出する。bd remember の書き込みは、`hooks/shellenv.sh` が bd を**シェル関数**として定義し `bin/bd` ラッパー(argv 判定)へ委譲することで確認を強制する(bash は BASH_ENV、zsh は `~/.zshenv` の管理行から source。関数は PATH 解決に常に優先するため、後続 rc やシェルスナップショットの PATH 操作に埋もれない — 配達経路はハーネスの実起動形 `zsh -c "source <snapshot> && …"` に対して検証する)。ガードは習慣的な誤操作を止める装置であり、絶対パスや `command bd` による明示的な迂回は AGENTS_BD_MEMO_OK と同様に監査可能な選択として扱う。push / merge の ask 断片はインストーラーが理想状態として定義する — 環境側に包括的な Bash allow がある場合は発火しない(この端末はユーザーの選択で包括 allow を維持)。
- 規則を足すときは先に層を下げられないかを問う: 機械で守れるなら enforcement へ、瞬間が特定できるならスキルへ。コアに足してよいのは遍在的な規則だけ。
- 更新はアブレーションで検証する: 行を消した状態で実タスクを回し、挙動が実際に劣化した行だけ戻す。「消したら劣化した」という観測記録の無い行は戻さない。
- モデル世代の変わり目には全体を作り直す前提で見直す(旧世代の弱さを補正していた指示は新世代では制約になる)。

## アブレーション除外(観測実績が付くまで凍結)

2026-07-31 のセッション(c389fc24)で追加された収束規則群 — 起票反転(観測を既定で open にしない)、消化の経路、同型の畳み込み、`bd children` 完了ゲート、memory 契約 — は、実際の失敗(issue の発散・memory の陳腐化)への対策として追加されたばかりで観測実績が無い。効果の観測が付くまでアブレーションの対象にしない。

2026-08-01: このうち起票反転は `AGENTS_BD_OPEN_OK` ガード(`payload/bin/bd`)として強制則化された。観測は SessionStart の計器(open の stock と当日 inflow)が常時取る — 期間ではなく、注入を見た瞬間に判断する。ガードの発火実績が付いたら、強制則が覆う遍在則側の該当文はアブレーション候補になる(上位で封じたら下位を撤去する、の適用)。
