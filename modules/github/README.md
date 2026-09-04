# github

A module about working through GitHub: which mechanism carries which meaning, and what the loop around one issue looks like from picking it up to cleaning up after it. The rules themselves are in [skills/issues/SKILL.md](skills/issues/SKILL.md), with a Japanese copy in [docs/SKILL.ja.md](docs/SKILL.ja.md).

## Everything becomes a label

Labels are the one mechanism every model already knows. So they absorb what belongs elsewhere: the kind of work, the release it is aimed at, the piece of a larger job it is part of, the thing it is waiting on. Nothing errors. The issue is filed, it is coloured, it looks organized.

What is lost is the query. `is:open no:milestone` cannot find work that has no release when the release is written as a label. A parent's progress cannot be counted when the children are only mentioned in prose. **The tracker is written once and read hundreds of times**, and every meaning put on the wrong axis is subtracted from every later reading.

## The other half is the loop

A tracker only answers if what it says is true right now. So the module also fixes the few moves that keep it true: the status changes before the work starts rather than after it ends, one worktree and one branch per issue named after that issue, sub-issues integrating into the parent's branch instead of the trunk, the pull request pointing back at what it closes, and the worktree and branch going away once the change has landed. None of it is difficult. All of it is skipped when nobody wrote it down.

## Answerable, or not

The line that decides whether a feature was worth using:

| | |
| --- | --- |
| A checkbox is not a sub-issue | They render identically. One is an object with its own state that a parent can count; the other is text. Anything that has to be tracked on its own sits on one side of that line. |
| Dependencies cannot be filtered on | Every other axis narrows a list; this one does not. Order still belongs in the tracker, but only where someone will follow the edge by hand. |
| A type spans repositories, a label does not | Types belong to the organization, so one question can cross every repository at once. Two labels both named `bug` guarantee nothing about each other. |
| A stale status is worse than none | A board nobody trusts gets replaced by asking the person, and then everyone pays for the asking. That is why the status moves when the work starts, not when it is remembered. |
| The branch name is the only tie | `.worktrees/issue-{id}` and `issues/issue#{id}` make the mapping from a working tree to an issue readable without a lookup, by a person or by the next session. GitHub keeps no other: the branch link an issue can hold does not reach the pull request. |
| A linked pull request has one reliable route | `addCloseIssueReferences` fills the issue's Linked pull requests whatever the base branch is. `Closes #123` in the body is interpreted only for a pull request that targets the default branch, and one opened from a branch linked to the issue never appears, though the documentation says it does. Measured, not read. |
| The closing reason is data | Done and abandoned are two different histories: one becomes the release note, the other is the record of a decision to stop. A farewell comment is neither. |

## Where the call could have gone otherwise

**No conventions for label names.** A scheme that fits one team's workflow is wrong for the next, and a rule nobody follows costs attention without buying anything. The module binds which axis a meaning belongs on; which labels exist on that axis is the team's.

**One API name is written down, against the habit of the rest.** The rules avoid naming tools, because `--help` is newer than any document written about it. `addCloseIssueReferences` is the exception: GitHub's own documentation states the opposite of what the API does, so a reader who trusts the documentation takes a route that silently produces nothing. What cannot be derived from the documentation is the part worth carrying.

**No template for the issue body.** What a good report contains is judgment, and a capable model already has it. The module settles where a meaning goes, never how to word it.

**No menu item named where the name can change.** The rules say to pick the closing reason that matches what happened, not to pick `not planned`; to move to the status that means in progress, not to a column spelled *In Progress*. GitHub renames things, and a rule written against the current wording of a menu stops being followed the day it changes.

**Branch names are fixed here, though `git` leaves them alone.** That module says nothing about them because a branch name is gone the week after the work lands. Here the name is doing a job while it is alive: it is what ties a working tree to the issue it belongs to, and it is read by whoever opens the repository next.

**AI signatures are refused here as well as in commits.** The `git` module keeps them out of commit messages. Issue bodies, comments and pull requests are the same text read by the same people, and they are the half that is public.

**Named for the host, not for issues.** Pull requests, releases and Actions run on the same platform and have the same shape of problem. The module is `github` so the next skill has a place to land.

This module expects `gh` on `PATH` — detected, never installed.
