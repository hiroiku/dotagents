---
description: Use when creating, organizing or querying GitHub issues — labels, milestones, types, sub-issues, blocking relationships.
---

# GitHub issues

`gh` is the interface and `gh <command> --help` is the reference for its flags. What follows is what the flags do not say: which mechanism carries which meaning, and where `gh` has a hole.

## The axes

An issue is placed on axes that are independent of each other. Reaching for a label because the right axis was not obvious is how a tracker stops being answerable.

| Axis | Mechanism | The question it answers |
|---|---|---|
| kind | `--type` | what sort of work is this |
| when | `--milestone` | which release or period |
| decomposition | `--parent` · `--add-sub-issue` | what is this a part of |
| order | `--add-blocked-by` · `--add-blocking` | what has to land first |
| anything else | `--label` | the attributes this team invented |

- Types are defined once for the organization and every repository draws from the same set; labels are per-repository. A distinction every repository would make the same way is a type, not a label.
- A sub-issue is a piece of its parent's work, not a related issue. If the parent could be closed without it, it belongs somewhere else.
- Blocking is order, not hierarchy. Issues in different milestones, different parents, different repositories can block each other.
- The tracker is queried far more often than it is written. Prefer the axis that a later query can filter on over prose in the body.

## Relationships

Native to `gh` — no extension, no GraphQL.

- `gh issue create --parent`, `--blocked-by`, `--blocking`
- `gh issue edit --add-sub-issue`, `--remove-sub-issue`, `--parent`, `--remove-parent`, `--add-blocked-by`, `--add-blocking`, and the matching `--remove-*`

Up to 100 sub-issues under one parent, nested up to 8 levels. Read the structure back with `--json parent,subIssues,subIssuesSummary,blockedBy,blocking` — checkboxes in the body carry no state and nothing can query them.

## Milestones

There is no `gh milestone`. Putting an issue in one is a flag (`--milestone <title>` on create and edit); the milestone itself is REST:

```sh
gh api repos/{owner}/{repo}/milestones                                    # list
gh api repos/{owner}/{repo}/milestones -f title=… -f due_on=…             # create
gh api repos/{owner}/{repo}/milestones/{number} -X PATCH -f state=closed  # close
```

## Labels

`gh label list | create | edit | delete`. `gh label clone <source-repo>` carries a whole scheme into a new repository, which is how a convention survives the next repository.

## Reading

- `gh issue list` covers one repository; `gh search issues` crosses them. Only search has `--no-milestone`, `--no-label`, `--no-assignee` — the way to find what fell through.
- `--json` then `--jq`. `gh issue view --help` lists every field, including `issueType`, `stateReason` and `closedByPullRequestsReferences`.

## Closing

`--reason completed | "not planned" | duplicate`, with `--duplicate-of` when it is one. The reason is queryable (`--json stateReason`); a closing comment is not.

## The rest

`gh issue develop` links a branch before the first commit · `comment --edit-last` instead of a second comment · `pin` · `lock` · `transfer` · `delete` · `--project` and `gh project` for Projects v2.

Bodies go in by `--body-file -` from stdin. Shell quoting mangles multi-line markdown.
