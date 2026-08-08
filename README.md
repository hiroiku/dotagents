# dotagents

**A package manager for the rules your AI agents follow.** Skills, review agents and hooks — packaged as modules, installed into the projects you choose.

English | [日本語](docs/README.ja.md) | [简体中文](docs/README.zh-CN.md) | [繁體中文](docs/README.zh-TW.md) | [한국어](docs/README.ko.md) | [Deutsch](docs/README.de.md) | [Español](docs/README.es.md) | [Français](docs/README.fr.md)

[![npm](https://img.shields.io/npm/v/%40hiroiku%2Fdotagents)](https://www.npmjs.com/package/@hiroiku/dotagents)
[![license: MIT](https://img.shields.io/badge/license-MIT-blue.svg)](./LICENSE)

- **The module is the unit.** One directory declares what it needs, carries what it delivers, and explains why it exists. Install it into a project or a whole machine; drop it just as cleanly.
- **Agents read the result natively.** No runtime, no daemon, nothing wired into your shell — the installer writes plain files where each agent already looks, and gets out of the way.
- **One rule set, many agents.** The same module reaches Claude Code and Codex, each in the form that agent understands.

## Install a module

```sh
npx @hiroiku/dotagents clone      # once — into ~/.dotagents/corpus, a git repo you own
cd ~/.dotagents/corpus

bin/agents-setup list                     # what you can install
bin/agents-setup install harness          # into the current project
bin/agents-setup install harness -g       # for every project on this machine
bin/agents-setup install harness -C ~/x   # into a specific project
```

The target defaults to this project — the smallest blast radius — and the wider scope always takes a flag. What goes in never defaults: name a module, or pick interactively. A non-interactive shell stops rather than choosing for you.

## What a module is

A directory with a `module.json`. Everything else is optional, and each kind has one destination:

```
modules/<name>/
├── module.json    what it is, and what it expects on PATH
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

[modules/](./modules/) is the canonical definition of the distribution — the installer holds no list of the files, so nothing rots out of sync. The two modules here are the ones this corpus offers, not a set you are meant to take whole: [harness](./modules/harness/README.md) carries review agents and the conventions a model cannot guess, [architecture](./modules/architecture/README.md) a dependency rule that is right for some projects and not others.

Modules of your own go in `~/.dotagents/modules/`. They are installed by the same commands and stay on your machine — never in a repository, never in a published package. `list` shows both sources; a name claimed twice is an error rather than a silent override.

## Where it lives

```
~/.dotagents/         everything this tool keeps, in one place
├── corpus/           the clone you edit and pull
├── modules/          modules of your own
└── state/            the record of what was placed where
```

`DOTAGENTS_HOME` moves the whole thing; nothing else needs to be told. One root, and every path derives from it — `status` and `--help` print the one in effect, so a machine never hides where its rules came from.

## Commands

```sh
bin/agents-setup pull                 # follow upstream: shows what is coming, rebases your commits, runs the tests
bin/agents-setup update               # redeliver here — no arguments, it remembers which modules you chose
bin/agents-setup uninstall <module>   # drop one module, keep the rest; name none to remove everything
bin/agents-setup status               # verify every delivered file — exit 1 on drift
bin/agents-setup --help               # every command, option, example
```

`install` is additive and `uninstall` subtractive, so the set a deployment holds is built up and torn down one module at a time. `pull` is the only command that changes the modules themselves, and it never touches a deployment: what you pull are the texts that govern your agents, so it shows you the incoming commit titles before integrating, and nothing auto-updates.

## What the installer will and will not touch

Everything is idempotent and **hash-owned**: it touches only what it placed and still recognizes. Your own skills are never touched, files you edited in place are kept and reported (`--force` to overwrite), and `uninstall` removes exactly what the record says it placed — nothing else. That record lives in `~/.dotagents/state/`, never in a project.

Project-scope plugins load only when Claude Code starts at the repository root, and only after you accept the workspace trust dialog. Changes to agents and hooks take effect on the next session or after `/reload-plugins`; edits to a `SKILL.md` are picked up immediately.

## Layout

```
bin/agents-setup      the CLI (clone / pull / list / install / update / uninstall / status)
test/                 contract tests for the installer (npm test)
modules/              the modules this corpus offers
├── harness/          review agents, git · testing · prompting conventions
└── architecture/     a dependency rule the build can enforce
```
