---
description: Use when planning, tracking or querying work in GitHub issues — decomposition, milestones, labels, types, relationships.
---

# GitHub issues

An issue is written once and read hundreds of times, by people and by sessions that were not there. Every feature below buys one specific later answer. Put a meaning somewhere that cannot answer, and it is subtracted from every reading that follows.

## Decomposition

Break work into sub-issues, not into checkboxes in the body. A checkbox looks the same and carries nothing — it cannot be assigned, discussed, closed on its own, or counted. A sub-issue is an ordinary issue, and the parent gets a progress count for free.

- The unit is what one person can finish in one sitting. If a sub-issue needs sub-issues, it was a parent.
- The parent holds the goal and the reasoning; the children hold the work. Restating the plan in each child is how they drift apart.
- Eight levels and a hundred children are available. Two levels is almost always the whole tree — depth costs a reader more than it buys.

## Order

Blocking says what has to land first. Hierarchy says what something is part of. They are unrelated: blocking crosses parents, milestones and repositories freely, and most issues have one without the other.

Record it only where it changes what someone picks up next. There is no search for it — `is:blocked` looks like a filter and is not one, and no qualifier exposes the relationship. The ready queue has to be computed from each issue's blockers, so a blocking edge nobody will compute is a note nobody will read.

## Milestones

A milestone is something that can be finished, on a date. That is what produces the burn-down and the answer to "are we going to make it". A permanent bucket — `backlog`, `someday`, `next` — never closes, so it yields no such reading; it is a label wearing a milestone's clothes.

Work with no milestone is work nobody has committed to a date. That set is worth looking at on purpose, and it is directly askable.

## Labels

A label earns its place when a query filters on it. One that has never appeared in a search is decoration, and its cost is paid again by every person choosing labels afterwards.

Add one when a question needs it, not in anticipation of one. Keep the set small enough to choose from without thinking — a taxonomy nobody can hold is applied at random, and random labels are worse than none.

## Types

An issue type belongs to the organization, so every repository draws from one set. That is what makes a question span repositories: how much of this quarter was bugs, everywhere. A label named `bug` in each repository cannot answer it, because nothing guarantees the two mean the same thing.

The type is the kind of work. Everything else is a label. If every repository would draw the distinction identically, it is a type.

## Memory

An issue outlives the session that worked on it, and it is where the next one starts. What was learned belongs there as a comment — the cause that was found, the approach that was tried and rejected, the constraint discovered halfway. A pull request explains a change; the issue holds the problem, and the problem is what comes back.

Link a branch to the issue before the first commit, and the code, the review and the reason stay attached to each other without anyone maintaining the link.

## Closing

The reason for closing is data; a farewell comment is not. `completed` and `not planned` are two different histories — one becomes the release note, the other is the record of a decision to stop, and only the first should be read as done. Point duplicates at the survivor so the trail can be followed from either end.

## What the platform will not answer

Hierarchy is searchable (issues with no parent) and blocking is not. Assigning a milestone is a flag on the issue; creating or closing the milestone itself is the one thing `gh` leaves to the REST API. Everything else, including all the relationships, is native to `gh` — no extension, no GraphQL.
