# dotagents

A harness for delegating work to AI coding agents. One set of contents — one always-on page per role, project-selected styles, and mechanisms that stop operations reaching outside your machine — delivered natively to **Claude Code** and **Codex**.

English | [日本語](docs/README.ja.md)

## What it does

- **One page per role.** Each role reads everything it needs on every run: the orchestrator session about 4,200 characters, a builder about 2,200, a reviewer about 2,500. Choosing styles adds their text only to the roles that need it. A test keeps the orchestrator under 6,000 and a subagent under 4,000 characters whatever styles a project picks. The only skills left are the ones a user asks for: `setup`, `architecture`, `prompting`, `releases`, `triage`.
- **Styles chosen by declaration.** A project picks a git flow (`trunk` or `release-branches`) and a design shape (`layered`). Only the chosen text is injected, and the git flow also sets the shared branches and the pull-request base the hooks enforce.
- **Mechanism over prose.** What can be enforced is enforced by a hook, not by a sentence the model has to remember: outward-reaching git and `gh` operations, AI attribution in commits, the heavy checks a project reserves for the orchestrator, and three procedures (below). Checks themselves are the project's commands: the declaration's `checks` reach every role as entry points, and the harness runs none of them. The harness sets no time limits or agent counts.
- **One confirmation line.** The agent decides everything reversible on its own. It stops only for operations that reach outside: pushes to shared branches and tags, pull-request merges, releases, workflow runs and repository settings through `gh`, edits of instruction files and the declaration, messages to people. The harness does not read a project's own commands, since what to guard is the project's decision: a project that wants `terraform apply` or `npm publish` confirmed writes that in the host's permission settings (for example `ask` under `permissions` in Claude Code). Each project can delegate the kinds it trusts.
- **Measured.** Every confirmation and block is logged without command text in `~/.dotagents/log`; `tools/stats.mjs` in this repository shows how often the harness intervenes, by kind, and how much time and how many tokens each role used.

### Procedures it stops

| Procedure | Stopped when | Passes when |
|---|---|---|
| Catching up by merge | On a non-shared branch, `git merge` of a shared branch, or `git pull` without rebase | On a shared branch (integrating work); `pull.rebase` is set; `--ff-only` |
| Pull-request base | `gh pr create` whose base is not the default branch on GitHub while a git flow is chosen | a base the flow shares (`release/*` in `release-branches`); no git flow chosen; another repository; GitHub does not answer |
| Pushing while CI runs | The pushed branch has an open pull request whose workflow run has not finished, even when the push also needs confirmation | `gh` is missing, does not answer within a few seconds, or its answer cannot be read |

The first two can be re-run by the orchestrator with `DOTAGENTS_CONFIRMED=1` when the user explicitly asks for it. The CI one comes before any other answer and neither the mark nor the user's approval passes it; it tells the agent to wait or `gh run cancel` the run. Questions to GitHub (the CI state and the default branch) have their own few seconds, separate from the local checks, so a slow `gh` never hides an outward operation.

## Install

### For yourself

| Host | Install | Update |
|---|---|---|
| Claude Code | `/plugin install dotagents --marketplace hiroiku/dotagents` | turn on auto-update for the marketplace in `/plugin`, or `claude plugin update dotagents@dotagents` |
| Codex | `codex plugin marketplace add hiroiku/dotagents` then `codex plugin add dotagents@dotagents`, and trust its hooks in `/hooks` | `codex plugin marketplace upgrade dotagents` (hooks need trusting again after an update) |

Hooks run with `bun` when it is installed and with `node` otherwise.

### Into a repository

Run the installer inside the repository (Node.js 22 or later):

```sh
npx @hiroiku/dotagents init
```

It asks, with a default for each answer (the current `.agents/dotagents.json`, otherwise a guess from `PATH`, branches, `package.json` scripts and the Makefile):

- the hosts: Claude Code, Codex
- the git flow (`trunk`, `release-branches`, or none) and the design shape (`layered` or none)
- the entry point of each check stage (`edit`, `commit`, `push`, `release`)
- where to install the plugin for Claude Code: this project, all your projects, or not at all

Then it writes the project declaration and the host settings, removes what 8.x left behind (the copy under `.claude/skills/dotagents` and the pinned line in `.pi/settings.json`), runs `claude plugin install` when `claude` is on `PATH`, lists the files it changed, and tells you what each person does next. It never commits. If a settings file is not valid JSON, it writes nothing and stops. Only a **reference** to this repository is written, never a copy, so upgrading the harness creates no commits in your project. Only the harness's own entries are added or removed; every other key and character of your settings stays as it was. If you already installed the harness yourself, it is the same plugin, so nothing is injected twice. Re-running it changes the choices later.

Without a terminal (an agent, CI), pass `--yes` or the answers:

```sh
npx @hiroiku/dotagents init --yes --hosts claude,codex --git trunk --architecture layered --scope project --check push="npm run check"
```

| Option | Meaning |
|---|---|
| `--yes`, `-y` | Do not ask; answer every question without an option with its default |
| `--hosts claude,codex` | Hosts to set up (`none` for neither) |
| `--git trunk\|release-branches` | Git flow (`none` to choose none) |
| `--architecture layered` | Design shape (`none` to choose none) |
| `--scope project\|user` | Where to install the plugin (`none` to skip) |
| `--check stage=command` | Entry point of a check stage; `--check push=` clears one |

You can also ask the agent to set the harness up (the `setup` skill): it asks you the same questions, then runs the installer with those options. In a repository without a declaration, Claude Code shows a notice when a session opens and the orchestrator offers the setup in its first reply; a declaration containing just `{}` means you decided not to, and silences the offer.

| Host | What goes into the repository | What each person does |
|---|---|---|
| Claude Code | `.claude/settings.json`: `extraKnownMarketplaces` and `enabledPlugins` | Trust the folder. If you have not installed the harness yourself, run `claude plugin install dotagents@dotagents --scope project` once (`--scope user` for every project). Enabling it in the settings alone does not load it at the start of an interactive session. |
| Codex | `.codex/config.toml`: a git marketplace and the plugin, unpinned | Trust the project, then approve the hooks in `/hooks`. Codex asks again whenever the plugin's contents change. |

The installer has `init` only. The `setup` skill still does the rest: removing the harness, moving off 7.x, proposing an `ARCHITECTURE.md`, writing `decisions` and `delegated`, and checking a project (declaration, references, styles, and whether GitHub protects the shared branches).

## The project declaration

Facts that differ per project live in one file, `.agents/dotagents.json`. Hooks and every role's context read it. All keys are optional.

```json
{
  "style": { "git": "release-branches", "architecture": "layered" },
  "protected": ["staging"],
  "delegated": ["merge:main", "tag", "release:v1"],
  "checks": { "edit": "biome check {file}", "commit": "npm run check:changed", "push": "npm run check", "release": "npm run e2e" },
  "decisions": ["Contrast is set by the designer. Do not flag it in review."]
}
```

| Style | Shape | Shared branches |
|---|---|---|
| `git: trunk` | Integrate into the default branch only; release by tag | default branch |
| `git: release-branches` | Same development as trunk; cut `release/…` per release line and cherry-pick fixes from the default branch | default branch, `release/*` |
| `architecture: layered` | Six layers with inward dependencies; the text states which layer may import which. The harness ships rules, not checking tools: enforce the direction with the project's own lint or check | — |

`protected` adds to a flow's shared branches. `delegated` lists the kinds of outward operation the agent may perform without asking (`kind` or `kind:target`). Rewriting a shared branch, bypassing branch protection, and editing this file's policy keys can never be delegated. See the `setup` skill for every key.

## Contents

| Path | What |
|---|---|
| `plugin/core/` | The page every role reads (`core.md`) and the orchestrator's page (`orchestrator.md`). A test enforces their size. |
| `plugin/agents/` | `builder` and `reviewer`. The single source for Claude Code agents and Codex agent TOML. |
| `plugin/styles/` | Git flows and design shapes. Front matter says which roles read the text and which values the hooks use. |
| `plugin/skills/` | `setup`, `architecture`, `prompting`, `releases`, `triage`. |
| `plugin/src/` | `guard.mjs` (one decision function for all hosts), `context.mjs`, `style.mjs`, and the host adapters' shared code. |
| `plugin/hosts/` | Thin adapters: Claude Code hooks and Codex hooks. |
| `cli/` | The installer, published to npm as `@hiroiku/dotagents`. It holds what goes into `dotagents.json` and the host settings. Not delivered by the marketplace. |
| `tools/stats.mjs` | Totals of the harness's log. Not delivered by the marketplace, which ships `./plugin` only. |

## Limits

The guard is a tripwire for honest mistakes, not a sandbox: it reads commands, not what a script does internally. It binds only agents that run this harness. Rules that must hold for everyone belong in branch protection and CI; the `setup` skill's check reports shared branches that GitHub does not protect.

## Development

```sh
npm test                       # node --test, no dependencies
node tools/stats.mjs --days 7  # what the harness did on this machine, from ~/.dotagents/log
```

When you raise the version, change `plugin/package.json`, both plugin manifests, the root `package.json` and `cli/package.json` together; a test keeps them equal.

Coming from 8.x: run `npx @hiroiku/dotagents init` in each project again. It removes the copy under `.claude/skills/dotagents` and the pinned package line 8.x wrote into `.pi/settings.json`; 9.0.0 no longer supports Pi.

## License

MIT
