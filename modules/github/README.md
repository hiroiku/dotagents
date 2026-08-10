# github

English | [日本語](docs/README.ja.md) | [简体中文](docs/README.zh-CN.md) | [繁體中文](docs/README.zh-TW.md) | [한국어](docs/README.ko.md) | [Deutsch](docs/README.de.md) | [Español](docs/README.es.md) | [Français](docs/README.fr.md)

A module about what a GitHub issue can carry and which mechanism carries which meaning. The rules themselves are in [skills/issues/SKILL.md](skills/issues/SKILL.md).

## Everything becomes a label

Labels are the one mechanism every model already knows. So they absorb what belongs elsewhere: the kind of work, the release it is aimed at, the piece of a larger job it is part of, the thing it is waiting on. Nothing errors. The issue is filed, it is coloured, it looks organized.

What is lost is the query. `is:open no:milestone` cannot find work that has no release when the release is written as a label. A parent's progress cannot be counted when the children are only mentioned in prose. **The tracker is written once and read hundreds of times**, and every meaning put on the wrong axis is subtracted from every later reading.

So the skill is not a tour of `gh issue`. It is the map from meaning to axis, and it is short, because the rest is in `--help`.

## What the model cannot derive

An agent can read `gh issue create --help` any time. What it cannot get from there:

| | |
| --- | --- |
| Relationships are native now | `--parent`, `--add-sub-issue`, `--add-blocked-by` came to `gh` recently. A model that learned an older `gh` reaches for a community extension or hand-written GraphQL, and gets a worse version of something already built in. |
| Milestones are the hole | Every other axis is a flag; the milestone itself is REST. Knowing exactly where the gap is prevents both halves of the mistake — inventing an API call for the assignment, and hunting for a `gh milestone` that does not exist. |
| Types are not labels | Issue types are defined for the organization and shared by every repository. They are recent, easy to miss, and the reason a label named `bug` should usually not exist. |
| Sub-issues are not checkboxes | A task list in the body renders the same and carries no state. Nothing can query it, and no parent can be counted from it. |

## Where the call could have gone otherwise

**No conventions for label names.** A scheme that fits one team's workflow is wrong for the next, and a rule nobody follows costs attention without buying anything. The module binds which axis a meaning belongs on; which labels exist on that axis is the team's.

**No template for the issue body.** What a good report contains is judgment, and a capable model already has it. The one mechanical fact worth stating — pass the body through stdin, because shell quoting mangles markdown — is stated, and the rest is left alone.

**Named for the host, not for issues.** Pull requests, releases and Actions run on the same platform and have the same shape of problem. The module is `github` so the next skill has a place to land.
