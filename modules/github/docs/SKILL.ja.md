---
description: GitHub の issue で作業を計画・追跡・照会するとき、issue に着手するとき。issues、Projects、branches、pull requests。
---

# GitHub

- AI の署名 (`Generated with Claude Code`、`Co-Authored-By: Claude` など) とセッション URL (`claude.ai/code/session_...`) を、commit メッセージ、pull request、issue の本文とコメントに書かない。

## GitHub Issues

- 1 つの issue は、マージした時点でその機能が動作する範囲にする。
- それだけでは完結しない大きさなら epic にして、中身を sub-issue に分ける。sub-issue は単体でマージできなくてよい。
- 個別に管理する必要があるものは sub-issue にする。管理する必要のない手順は本文に書く。
- 作成したら、タイプ、ラベル、マイルストーン、担当者、親子関係、依存関係のうち該当するものを設定する。値はその organization と repository で既に使われているものから選ぶ。
- どのリポジトリでも同じ意味になる区別はタイプ、そのリポジトリでしか意味を持たない区別はラベル。新しく作るのは、既にあるどれでも絞り込めないときだけ。
- 依存関係は親子関係とは別で、別の親、別のマイルストーン、別のリポジトリの issue にも設定できる。検索では絞り込めないので、実際に参照する人がいるときだけ設定する。
- 分かったことはコメントに書く。判明した原因、試して採用しなかった方法、途中で見つかった制約。
- クローズするときは、選択できる理由のうち実際に起きたことに合うものを選ぶ。完了として集計される理由と、中止した記録として残る理由は区別する。
- 重複した issue は、残すほうを参照してクローズする。

## GitHub Projects

- 着手したら、作業を始める前にステータスを進行中に変更する。
- 状況が変わったら、その時点の状況に最も近いステータスに変更する。
- ステータスの更新を作業より遅らせない。
- フィールドで表せる情報は、本文ではなくフィールドに設定する。

## Branches

- worktree を `.worktrees/issue-{id}` に作成し、`issues/issue#{id}` という branch を作成して、そこで作業する。
- sub-issue は親 issue の branch にマージする。統合先のブランチにマージするのは親の branch だけ。
- sub-issue がすべてマージされたら親 issue をクローズする。
- マージが完了したら worktree と branch を削除する。

## Pull Requests

- 作成したらすぐ、対応する issue にリンクする (`addCloseIssueReferences`)。base がどのブランチでも、issue の Linked pull requests に表示される。
- 本文の `Closes #123` ではリンクしない。base がデフォルトブランチのときしか解釈されない。
- issue から作成したリンク済みブランチで pull request を作成しても、リンクされない。docs には自動でリンクされると書かれているが、実際には表示されない。
- 変更内容の説明は pull request に書き、問題そのものは issue に残す。
