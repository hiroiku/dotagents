# dotagents

**An AI agent harness you own.** Rules, skills, and review agents for Claude Code and Codex — version-controlled as a single corpus, deployed to every project from it.

English | [日本語](docs/README.ja.md) | [简体中文](docs/README.zh-CN.md) | [繁體中文](docs/README.zh-TW.md) | [한국어](docs/README.ko.md) | [Deutsch](docs/README.de.md) | [Español](docs/README.es.md) | [Français](docs/README.fr.md)

[![npm](https://img.shields.io/npm/v/%40hiroiku%2Fdotagents)](https://www.npmjs.com/package/@hiroiku/dotagents)
[![license: MIT](https://img.shields.io/badge/license-MIT-blue.svg)](./LICENSE)

- **One corpus, many deployments.** Prompts, skills and agent roles live in one git repository. The installer copies them into `~/.agents` or `<project>/.agents` and wires the symlinks that Claude Code and Codex read.
- **A rulebook, not a library.** You edit the rules, commit them, and follow upstream only when you choose to — nothing changes behind your back.
- **Written for models that judge.** The corpus records only what a capable model cannot derive — your conventions, your requirement anchors, your role boundaries. Everything else is left to the model's judgment. The reasoning lives in [The bundled harness](./payload/README.md).

## How it works

One corpus feeds every environment. Deployments are plain copies — sessions never depend on the corpus being reachable, and nothing deploys behind your back:

```mermaid
flowchart LR
    UP["upstream<br>github.com/hiroiku/dotagents"]
    C["your corpus<br>~/dotagents — a git repo you edit"]
    A["deployments<br>~/.agents · per-project .agents"]
    S["sessions<br>Claude Code · Codex"]
    UP -->|"clone · once"| C
    UP -->|"pull · when you choose"| C
    C -->|"install · update"| A
    A -->|"symlinks"| S
```

## Quick start

**1 · Get your corpus** (requires git and Node.js ≥ 18)

```sh
npx @hiroiku/dotagents clone ~/dotagents
```

A plain git clone, and it is yours: edit the rules, commit them, personalize.

**2 · Deploy it**

```sh
cd ~/dotagents
bin/agents-setup install project /path/to/project   # one project   → <dir>/.agents
bin/agents-setup install user                       # this machine  → ~/.agents
```

Omit the target to pick it interactively. In a non-interactive shell an omitted target stops without writing anything — no default ever decides where rules land.

**3 · Operate**

```sh
bin/agents-setup pull                 # follow upstream: changelog → rebase → tests
bin/agents-setup update  project ...  # resync a deployment
bin/agents-setup status  project ...  # verify files and links — exit 1 on drift
bin/agents-setup --help               # every command, target, option, example
```

## The three verbs

| Verb | Cadence | What it does |
|---|---|---|
| **clone** | once | materialize the corpus as a git repository you own |
| **pull** | when you choose | fetch upstream, show the incoming commit titles, rebase your commits on top, run the corpus tests |
| **install · update** | per machine, per project | copy the corpus into `.agents/` and wire the links |

Three rules connect them:

- **No deploying from a throwaway.** Outside a corpus (an npx cache, an unpacked tarball) the deploy commands delegate to the corpus your machine already knows — or stop and point to `clone`.
- **Following is deliberate.** What you pull are the texts that govern your agents, so `pull` shows the incoming commit titles first — written in domain language, they read as a changelog — then rebases and runs the tests. Nothing auto-updates.
- **Drift is visible.** `status` compares every deployed file and link against the corpus and exits 1 on drift; `update` resyncs exactly what the installer owns.

## What lands where

| Piece | Destination | Delivery |
|---|---|---|
| Ubiquitous rule (`AGENTS.md`) | `.agents/AGENTS.md` | symlink `.claude/CLAUDE.md → .agents/AGENTS.md`; Codex gets the same shape under `.codex/` |
| Skills | `.agents/skills/` | one link per skill into `.claude/skills/` and `.codex/skills/`, so they coexist with skills you wrote yourself |
| Review agents | `.agents/agents/` | one link per agent into `.claude/agents/` |
| Machine-local products (manifest) | `.agents/` | kept out of version control by a `.gitignore` that ships with the payload |

Everything is idempotent and **hash-owned**: the installer touches only what it placed and still recognizes. Your own skills are never touched, files you edited in place are kept and reported (`--force` to overwrite), and `uninstall` removes exactly what the manifest records — nothing else.

## Layout

```
bin/agents-setup      installer CLI (clone / pull / install / update / uninstall / status)
test/                 contract tests for the installer (npm test)
payload/              the single definition of what gets distributed; this tree becomes .agents/
├── README.md         the bundled harness — what ships, and why it says so little
├── AGENTS.md         the one ubiquitous rule (read by every session, always)
├── skills/           momentary rules (read only when their moment arrives)
└── agents/           review roles (adversarial · security · accessibility)
```

[payload/](./payload/) is the canonical definition of the distribution; the installer holds no list of its contents — replicated lists silently rot, so [package.json](./package.json) `files` names only `bin` and `payload`. What the payload ships is described in [The bundled harness](./payload/README.md), and the description travels with every deployment.

## Updating the prompts

The corpus carries its own editing discipline: the [dotagents-prompting](./payload/skills/dotagents-prompting/SKILL.md) skill names the context-engineering guides to read before touching any prompt or agent definition. Edit only in this repository and deliver with `agents-setup update` — editing an installed tree directly makes `update` protect the file and warn, which is the drift detection working.
