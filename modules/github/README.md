# github

A module about what a GitHub issue can carry and which mechanism carries which meaning. The rules themselves are in [skills/issues/SKILL.md](skills/issues/SKILL.md).

## Everything becomes a label

Labels are the one mechanism every model already knows. So they absorb what belongs elsewhere: the kind of work, the release it is aimed at, the piece of a larger job it is part of, the thing it is waiting on. Nothing errors. The issue is filed, it is coloured, it looks organized.

What is lost is the query. `is:open no:milestone` cannot find work that has no release when the release is written as a label. A parent's progress cannot be counted when the children are only mentioned in prose. **The tracker is written once and read hundreds of times**, and every meaning put on the wrong axis is subtracted from every later reading.

So the skill is not a tour of `gh issue`. It is about what each feature buys — which later question it makes answerable — because that is the only reason to reach for one.

## Answerable, or not

The line that decides whether a feature was worth using:

| | |
| --- | --- |
| A checkbox is not a sub-issue | They render identically. One is an object with its own state that a parent can count; the other is text. The entire payoff of decomposition sits on one side of that line. |
| Blocking cannot be filtered on | Every other axis narrows a list; this one does not. Order still belongs in the tracker, but only where someone will assemble the queue by hand. |
| A milestone that cannot close answers nothing | The burn-down and the "will we make it" reading come from a set that finishes on a date. `backlog` and `someday` produce neither, and quietly cost the reading for everything they hold. |
| A type spans repositories, a label does not | Types belong to the organization, so one question can cross every repository at once. Two labels both named `bug` guarantee nothing about each other. |

## Where the call could have gone otherwise

**No conventions for label names.** A scheme that fits one team's workflow is wrong for the next, and a rule nobody follows costs attention without buying anything. The module binds which axis a meaning belongs on; which labels exist on that axis is the team's.

**No template for the issue body.** What a good report contains is judgment, and a capable model already has it. The module settles where a meaning goes, never how to word it.

**Named for the host, not for issues.** Pull requests, releases and Actions run on the same platform and have the same shape of problem. The module is `github` so the next skill has a place to land.
