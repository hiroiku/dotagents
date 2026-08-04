---
name: agents-beads-ops
description: bd(Beads)の運用細則。セッション開始時の残置処分、起票の形、一括書き込み・cleanup、merge-ready の定義、memory(bd remember)の整理、ラベル規約の整備を行うときに読む。
---

# Beads 運用細則

全エージェント共通規則(`.agents/` ルートの `AGENTS.md`)の `<beads>`(目的・4 失敗クラス・状態表・遍在規則)を前提とし、ここには特定の瞬間にだけ要る運用細則を置く。

## bd の前提

- bd は並列する全セッションが読み書きする共有ストアであり、コンテキストに読み込んだ状態はその時点から古くなりうる。
- 占有(claim。原子的・冪等)、書き込みの帰属(actor)、merge の排他(merge-slot)、停滞検出(stale)、重複検出(find-duplicates)は bd がネイティブに提供する。自前の読み書き手順で再実装しない。
- actor のデフォルト(git user.name / $USER)は並列セッション間で同一になり、占有の区別と冪等な claim が機能しなくなる。セッション開始時に注入される一意名を使う。
- ワークフロー文脈は `bd prime` が動的に提供し、`bd hooks install` 済みの環境ではセッション開始時に自動注入される。
- 台帳ファイル(`.beads/issues.jsonl`)は bd 本体の書き出し(導出物)であって正本ではない。統合・取り込みでこのファイルに他の作業領域の起票が入ったら、自分が次に台帳へ書き込む前に `bd import` で本体へ取り込む。競合を手編集で解消しない — 手で残した内容は本体に入らず次の書き出しで消え、取り込みを怠ると他領域の起票が黙って消える。
- 課題へのコメントは `bd comment <課題ID> "本文"`。`bd comment add <課題ID> ...` と書くと `add` が課題 ID として曖昧一致し、無関係な課題へ本文が入る(取り消す入口が無い。誤爆したら誤爆先に訂正を残し、正しい課題へ付け直す)。

## セッション開始時

- bd の文脈を持たないまま着手しない(自動注入が無ければ自分で取得する)。ready は全読みする。
- stale や assignee の無い in_progress を観測したら、着手前にまとめてユーザーへ処分を確認する。処分が作業になるなら起票して claim する。作業していない issue を in_progress に留めない規則があるからこそ、`停滞・循環` の検出は「in_progress なのに動きが無い = 異常」として信頼できる。
- 他セッションの占有の解除は、停滞に見えてもユーザーの判断に引き上げる。
- 低優先度の issue は、その内容と関係で結ばれている他の issue でついでに回収する(単独で選ばれるのを待たせない)。
- git の在庫(branch / worktree)の積み上がりは SessionStart の計器が伝える。処分は `bin/agents-reap` の分類に従う(細則は agents-quality-loop の Git 統合)。

## 起票の形

- 独立して完了判定できる合格条件を持つ単位だけを issue にし、合格条件は `--acceptance` に書く。
- 関係の型: 依存は `blocks`、重複は `duplicates`、置換は `supersedes`、分割は `parent` / `epic`。description の文章で代替しない。
- 統合ブランチ上で壊れている契約の issue からは、その領域に触る open へ `blocks` を張る(壊れた検査の上に新規変更を積ませない)。

## 一括の書き込み

bd(台帳と memory)は worktree 分割で守れないもう 1 つの合流点であり、一括の書き込みは merge-slot 保持中か、起票して claim した cleanup issue の中で行う。slot bead が無いプロジェクトでは、最初の並列運用を始める前に `bd merge-slot create` で作る。merge-slot の取得・解放は必ず `bd merge-slot acquire / release` で行う。slot bead(`gt:slot` ラベル、P0)は bd の設計として一覧にも ready にも見える — 状態表示(open = 空き)であって作業ではないので、拾わない。slot issue への `--claim` は保持にならない — ネイティブの保持者(metadata.holder)が設定されず、`git merge` ガードの照合(`AGENTS_MERGE_SLOT_OK=1` の宣言と `bd merge-slot check` の保持者の突き合わせ)が素通りになる。

## merge-ready の定義

未定義のプロジェクトではカテゴリ無しで定義する(`bd config set status.custom "merge-ready"`)。カテゴリ付き(`merge-ready:wip`)は jsonl import の検証が定義値をカテゴリ込みのまま比較して失敗し、git hook の自動 import が止まる。統合セッションは queue を速やかに空にする。

## memory

自動注入(`bd prime`)は状態のためにある — いま何が動いていて、次に何をすべきか。`bd remember` に置くのは全セッションが例外なく必要とする少数の不変事項だけ。memory は bd の DB に住みセッション横断で永続するが、`.beads/issues.jsonl` の同期経路には乗らない — 他のクローン・マシンへ届けたい判断は issue か正本の文書に書く。作業の記録は issue の note、領域の設計判断は CONTEXT.md / ADR、ガード化済みの `欠陥クラス` はガード自身が記憶、特定の瞬間にだけ要る知識はその瞬間に読む issue の note へ(統合時の注意は merge-slot へ)。過去の状態のスナップショットを memory にしない — 状態の正本は bd への問い合わせである。注入が読み切れない分量に育つこと自体が `乖離` で、memory の撤去は、それを不要にする変更(ガードの統合、正本への転記)と同じ変更の中で行う。

## ラベル

ラベルは必ず `{種類}/{値}` 形式で付ける(例: `context/checkout`)。bd のラベルはフラットな文字列で種類のネイティブ機能が無いため、プレフィックスが種類を表す唯一の手段であり、これが `--label-pattern '{種類}/*'` による種類単位の集計を成立させる。種類の新設は `マネージャー` の判断で行い、プレフィックス無しのラベルや規約外の種類は `乖離` として観測した時点で正す。

関心(bounded context)の分類は `context/{bounded-context名}` ラベルで表現し、分類のための epic を作らない。epic は閉じる成果物の分割にのみ使う。

- `bd label list-all` が関心の一覧、`bd list -l context/X` がその関心のタスク一覧になる(一覧の既定表示にラベルは出ない。確認は `bd show` か `--json`)。
- 横断タスクはラベルを複数付与し、issue 分割時は `bd label propagate` で子へ伝播する。`bd list --no-labels` で付け漏れを検出する。
- ラベルは分類であり関係ではない。`blocks` / `duplicates` / 親子の代替にならず、`孤立 issue` の解消にも数えない。
