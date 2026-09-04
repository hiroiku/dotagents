---
description: Use when planning, tracking or querying work in GitHub issues, and when picking one up. Issues, Projects, branches, pull requests.
---

# GitHub

- Keep AI signatures (`Generated with Claude Code`, `Co-Authored-By: Claude`, and the like) and session URLs (`claude.ai/code/session_...`) out of commit messages, pull requests, and issue bodies and comments.

## GitHub Issues

- Scope one issue to the range that works the moment it is merged.
- If it is too large to close on its own, make it an epic and split the inside into sub-issues. A sub-issue does not have to be mergeable alone.
- Anything that has to be tracked on its own is a sub-issue. Steps that do not go in the body.
- Once it is filed, fill in whichever of type, labels, milestone, assignee, parent and dependencies apply. Take the values already in use in that organization and repository.
- A distinction every repository would draw the same way is a type; one that means something only there is a label. Create a new one when a filter is needed that none of the existing ones answers.
- Dependencies are a separate axis from hierarchy and may cross parents, milestones and repositories. They do not narrow a list, so record them only where someone will follow them.
- Put what was learned in a comment: the cause that was found, the approach tried and dropped, the constraint discovered along the way.
- When closing, pick the available reason that matches what actually happened. A reason that counts as done and a reason that records a decision to stop are read differently.
- Close a duplicate pointing at the one that survives.

## GitHub Projects

- On picking it up, move it to whatever status means in progress before doing anything else.
- When the situation changes, move it to the status closest to what is true at that moment.
- Never let the status lag behind the work.
- Anything a field can carry goes in the field, not in the body.

## Branches

- Create the worktree at `.worktrees/issue-{id}`, branch `issues/issue#{id}`, and work there.
- Link the branch to the issue before the first commit.
- A sub-issue integrates into the parent issue's branch. What reaches the trunk is the parent's branch alone.
- Close the parent once every sub-issue has landed in it.
- Once it is integrated, clean up the worktree and the branch.

## Pull Requests

- Open it pointing at the issue it closes, so the issue leads back to it.
- The change is explained in the pull request; the problem itself stays in the issue.
