# dotagents

**A package manager for the rules your AI agents follow.** Skills, review agents and hooks — packaged as modules, installed into the projects you choose.

English | [日本語](docs/README.ja.md) | [简体中文](docs/README.zh-CN.md) | [繁體中文](docs/README.zh-TW.md) | [한국어](docs/README.ko.md) | [Deutsch](docs/README.de.md) | [Español](docs/README.es.md) | [Français](docs/README.fr.md)

[![npm](https://img.shields.io/npm/v/%40hiroiku%2Fdotagents)](https://www.npmjs.com/package/@hiroiku/dotagents)
[![license: MIT](https://img.shields.io/badge/license-MIT-blue.svg)](./LICENSE)

- **The module is the unit.** One directory declares what it needs, carries what it delivers, and explains why it exists. Install it into a project or a whole machine; drop it just as cleanly.
- **Agents read the result natively.** No runtime, no daemon, nothing wired into your shell — the installer writes plain files where each agent already looks, and gets out of the way.
- **One rule set, many agents.** The same module reaches Claude Code and Codex, each in the form that agent understands.

## Install

One package. It brings the mechanism and **places a curated set of modules in `~/.dotagents/modules/` as ordinary directories you own** — delete the ones you don't want, edit the ones you nearly want, drop your own beside them. Everything that comes from me says `from hiroiku`, so you can always tell whose opinion you are reading.

```sh
bun add -g @hiroiku/dotagents      # once — or: npm i -g @hiroiku/dotagents

dotagents list                     # what you can install
dotagents install review           # into the current project
dotagents install review -g        # for every project on this machine
dotagents install review -C ~/x    # into a specific project
```

Nothing to clone, nothing to fetch, and no state to migrate before you can work: the modules travel inside the package, so the first command places them and the next installs one straight away.

The target defaults to this project — the smallest blast radius — and the wider scope always takes a flag. What goes in never defaults: name a module, or pick interactively. A non-interactive shell stops rather than choosing for you.

Node or Bun, whichever the machine has — the CLI runs on either runtime.

## What a module is

A directory with a `module.json`. Everything else is optional, and each kind has one destination:

```
modules/<name>/
├── module.json    what it is, what it expects on PATH, what it replaces
├── README.md      why it exists — for people, never deployed
├── AGENTS.md      rules injected into every session
├── skills/        rules read only when their moment arrives
├── agents/        subagent roles, with their own context and tools
└── hooks/         event handlers that run as the agent works
```

| Kind | Claude Code | Codex |
|---|---|---|
| `skills/` · `agents/` · `hooks/` | `.claude/skills/dotagents/` — **one plugin directory**, loaded with no marketplace and no install step, namespacing what it holds as `/dotagents:*`. This is how hooks arrive without ever touching `settings.json` | skills only, as `.codex/skills/dotagents-*` — Codex has no plugins, so the namespace folds into the directory name |
| `AGENTS.md` | a managed block in `.claude/CLAUDE.md` | a managed block in `AGENTS.md` |

A module may declare what it expects on `PATH`. Requirements are **detected, never installed**: `list` and `install` report what is missing and block nothing, so adding the tool later needs no reinstall.

It may also declare a retired name it took over (`replaces`), so a record that remembers the old one follows the rules to wherever they went — renamed, or split across several. The installer keeps no table of its own: the corpus says where a name went, and when the migration has run its course the line is deleted from the module, not from the installer.

[modules/](./modules/) is the canonical definition of that set. The installer holds no list: not of the files, and not of the modules either — it reads whatever is in `~/.dotagents/modules/`. The set is a starting point as much as a default, not something you are meant to take whole: [review](./modules/review/README.md) hands verification to a context that did not write the code, [code](./modules/code/README.md) what a comment is for, [git](./modules/git/README.md) · [testing](./modules/testing/README.md) · [prompting](./modules/prompting/README.md) the conventions a model cannot guess, each read at the moment it applies, [architecture](./modules/architecture/README.md) a dependency rule that is right for some projects and not others, [github](./modules/github/README.md) which mechanism of an issue carries which meaning, and the loop from picking one up to cleaning up after it.

Modules are cut so that one of them can be wrong for you without taking the rest with it. Nothing here is a bundle: install `git` and `testing` on a machine where the review roles would not fit, or `review` alone into the one repository that needs it.

There is one place a module can live: `~/.dotagents/modules/`. The sample set is *placed* there rather than read from inside the package, so the set you can install and the set you can edit are the same set. Anything in the same shape works — however you got it, put the directory there and it is a module.

Once placed, a module is yours:

| | |
|---|---|
| you left it alone | refreshed when the package brings a newer version |
| you edited it | kept and reported (`--force` to take the sample version) |
| you deleted it | never placed again |

`list` still says where each one came from — `from hiroiku` for the set I ship, the same with `edited by you` once you have changed it, and nothing at all for the ones you wrote.

## Where it lives

```
~/.dotagents/         everything that is yours, in one place
├── modules/          every module — the sample set is placed here too
└── state/            what was placed where, and which samples you changed
```

The installer itself never lives here; it is replaced where it came from. The modules do live here, including the ones the package placed — that is the point. `state/` records what was placed where, and which sample copies you have since changed or removed.

`DOTAGENTS_HOME` moves the whole thing; nothing else needs to be told. One root, and every path derives from it — `status` and `--help` print the one in effect, so a machine never hides where its rules came from.

## Commands

```sh
dotagents update               # redeliver what is recorded — no arguments, it remembers what you chose
dotagents uninstall <module>   # drop one module, keep the rest; name none to remove everything
dotagents status               # verify every delivered file — exit 1 on drift
dotagents --help               # every command, option, example
```

`install` is additive and `uninstall` subtractive, so the set a deployment holds is built up and torn down one module at a time. `update` works from what the manifest remembers: it redelivers that set and prunes any legacy layout it finds.

**Only `uninstall` removes rules from a deployment.** Deleting a module from `~/.dotagents/modules/` is a small, everyday act; rewriting every project you installed it into is not. So when a delivered module no longer has a source, `update` keeps the files, keeps the record, keeps its lines in `CLAUDE.md`, and says what it kept and how to remove it. `status` reports the state as drift, because with no source there is nothing to verify the files against.

**Nothing moves on its own.** What arrives are the texts that govern your agents, so the delivery is never automatic and never silent: every command prints what it placed, kept and removed.

## One update path

New rules arrive by updating the package, not by running a command. Update it the way you installed it, then redeliver:

```sh
bun add -g @hiroiku/dotagents   # or: npm i -g @hiroiku/dotagents
dotagents update -g             # and: dotagents update -C <project>
```

| | Where it comes from | How it moves |
|---|---|---|
| **The mechanism** (`@hiroiku/dotagents`) | npm | like any other tool you install |
| **The sample set** (`hiroiku`) | inside that same package | placed in `~/.dotagents/modules/`, refreshed wherever you left it alone |
| **Modules of your own** | `~/.dotagents/modules/` | they are yours; nothing else writes there |

One path, not two. Two would mean one of them going stale — and the code that migrates your setup would be trapped inside the thing being migrated, waiting on the very update it is supposed to deliver. Here a fix and the rules it fixes arrive together, in one version you can name.

## What the installer will and will not touch

Everything is idempotent and **hash-owned**: it touches only what it placed and still recognizes. Your own skills are never touched, files you edited in place are kept and reported (`--force` to overwrite), and `uninstall` removes exactly what the record says it placed — nothing else. That record lives in `~/.dotagents/state/`, never in a project.

Project-scope plugins load only when Claude Code starts at the repository root, and only after you accept the workspace trust dialog. Changes to agents and hooks take effect on the next session or after `/reload-plugins`; edits to a `SKILL.md` are picked up immediately.

## Layout

```
bin/agents-setup      the CLI (list / install / update / uninstall / status)
test/                 contract tests for the installer (npm test · bun test)
modules/              the sample set that travels with it — from hiroiku
├── review/           adversarial review, OWASP, WCAG — in a context of their own
├── code/             what a comment is for
├── git/              commit titles, squash, rebase
├── testing/          the twelve properties of a good test
├── prompting/        what to read before editing a prompt
├── architecture/     a dependency rule the build can enforce
└── github/           what an issue can carry, and the loop around one
```

One package, one version: the mechanism and the rules it places are always the pair that was verified together. `modules/` here is where the sample comes from, not where it lives — once placed, the copy in `~/.dotagents/modules/` is yours.
