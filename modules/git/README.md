# git

A module of four opinions about git, read at the moment they apply. The rules are in [skills/git/SKILL.md](skills/git/SKILL.md).

## Opinions, not instructions

A model knows how to use git. What it cannot know is which of the defensible conventions this place settled on — and each of them is arbitrary in the honest sense: another team chose the opposite and is not wrong.

That is the only thing worth writing down. Nothing here says how to stage, when to commit, or how to word a body; that is judgment, and it is already present. Four lines, read when a commit is being made and at no other time.

## What each line buys

| | |
| --- | --- |
| A title says what changed for the business | The log is read by someone asking when a behaviour changed, never when a file did. A filename as the subject spends the one line that gets read on the one fact the diff already carries. |
| No sign of AI involvement | `Co-Authored-By`, `Generated with` and the like are inserted by default, by the tool, without being asked — so the only way they stay out is a line that says so. The history records what the project decided; which keyboard it came through is not part of that. |
| Squash is the default for integration | What lands on the trunk is one change with one reason to exist. The fifteen steps of getting there were a working process, not a shared history, and keeping them makes `git log` on the trunk unreadable and `git bisect` land on commits that never worked. |
| Follow upstream by rebase | A merge per sync fills the branch with commits that say nothing about the work, and the diff of the branch stops being the diff of the change. Rebase keeps the branch a straight statement of what it adds. |

## Where the call could have gone otherwise

**No commit-message format.** No Conventional Commits, no scope taxonomy, no length limit. A format buys machine-readable history — release notes, semantic versioning — and if a project wants that, it is the project's to add. The rule that survives without it is the one about what the title is *about*.

**Squash and rebase, not "never merge".** Both lines are defaults, not prohibitions. A merge that records a genuine convergence of two histories is a different act from a merge that syncs a branch, and the rule binds the second, which is the one that happens fifty times.

**Nothing about branch names.** They are gone the week after the work lands. A convention there is paid for daily and read almost never.

This module expects `git` on `PATH` — detected, never installed.
