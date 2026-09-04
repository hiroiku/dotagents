---
description: Use when planning, tracking or querying work in GitHub issues, and when picking one up. Issues, Projects, branches, pull requests.
---

# GitHub

- Keep AI signatures (`Generated with Claude Code`, `Co-Authored-By: Claude`, and the like) and session URLs (`claude.ai/code/session_...`) out of commit messages, pull requests, and issue bodies and comments.

## GitHub Issues

- Scope one issue to the range that works once it is merged.
- If it is too large to complete on its own, make it an epic and divide the inside into sub-issues. A sub-issue does not have to be mergeable on its own.
- Anything that has to be managed separately becomes a sub-issue. Steps that do not need managing go in the body.
- After creating it, set whichever of type, labels, milestone, assignee, parent and dependencies apply. Use the values already in use in that organization and repository.
- A distinction that means the same thing in every repository is a type; one that means something only in that repository is a label. Create a new one only when nothing that exists can filter for it.
- Dependencies are separate from the parent-child relationship and can point at issues under another parent, in another milestone, or in another repository. Search cannot filter on them, so set them only when someone will actually read them.
- Write what was learned in a comment: the cause identified, an approach tried and not adopted, a constraint found along the way.
- When closing, choose the available reason that matches what actually happened. A reason counted as completed and a reason kept as the record of stopping are different.
- Close a duplicate issue with a reference to the one being kept.

## GitHub Projects

- On picking it up, change the status to in progress before starting the work.
- When the situation changes, change the status to the one closest to the situation at that moment.
- Do not let the status update fall behind the work.
- Information a field can hold is set in the field, not written in the body.

## Branches

- Create the worktree at `.worktrees/issue-{id}` and a branch named `issues/issue#{id}`, and work there.
- A sub-issue is merged into the parent issue's branch. Only the parent's branch is merged into the integration branch.
- Close the parent issue once every sub-issue has been merged.
- Delete the worktree and the branch once the merge is complete.

## Pull Requests

- Link it to the issue it addresses immediately after creating it (`addCloseIssueReferences`). It appears in the issue's Linked pull requests whatever the base branch is.
- Do not link it with `Closes #123` in the body. That is interpreted only when the base is the default branch.
- A pull request created from a branch linked to the issue is not linked either. The docs say it is linked automatically; it does not appear.
- Write the explanation of the change in the pull request and leave the problem itself in the issue.
