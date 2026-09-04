---
description: GitHub の issue で作業を計画・追跡・照会するとき、issue へ着手するとき。issues、Projects、branches、pull requests。
---

# GitHub

- AI の署名 (`Generated with Claude Code`、`Co-Authored-By: Claude` など) とセッション URL (`claude.ai/code/session_...`) を、commit メッセージ、pull request、issue の本文とコメントへ残さない。

## GitHub Issues

- 1 つの issue は、マージされた時点でその機能が動く範囲にする。
- それだけで完結しない大きさなら epic にして、中身を sub-issue へ割る。sub-issue は単体でマージできなくてよい。
- 個別に追う必要があるものは sub-issue、追う必要のない手順は本文に書く。
- 立てたら、タイプ、ラベル、マイルストーン、担当、親子、依存のうち当てはまるものを埋める。値はその organization と repository で既に使われているものから選ぶ。
- どのリポジトリでも同じ線を引く区別はタイプ、そこでしか意味を持たない区別はラベル。新しく作るのは、既にあるどれでも答えられない絞り込みが要るとき。
- 依存は階層とは別の軸で、親もマイルストーンもリポジトリも跨いでよい。一覧の絞り込みには効かないので、辿る人がいる場所にだけ結ぶ。
- 分かったことはコメントへ置く。突き止めた原因、試して捨てた方法、途中で見つかった制約。
- 閉じるときは、選べる理由のうち実際に起きたことに合うものを選ぶ。done として数えられる理由と、やめた記録として残る理由は別に扱う。
- 重複は残るほうを指して閉じる。

## GitHub Projects

- 着手したら、手を動かす前に、進行中にあたるステータスへ移す。
- 状況が変わったら、その時点の実態に一番近いステータスへ移す。
- ステータスを作業の実態より遅らせない。
- フィールドで表せることは、本文へ書かずフィールドへ入れる。

## Branches

- worktree を `.worktrees/issue-{id}` に作り、`issues/issue#{id}` を切って、そこで作業する。
- 最初のコミットの前に、branch を issue へ結び付ける。
- sub-issue は親 issue の branch へ統合する。本線へ入るのは親の branch 1 つ。
- sub-issue が全て入ったら親を閉じる。
- 統合が済んだら worktree と branch を片付ける。

## Pull Requests

- 閉じる issue を指して出し、issue の側から辿れる状態にする。
- 変更の説明は pull request に書き、問題そのものは issue へ残す。
