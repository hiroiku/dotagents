# dotagents

A harness for delegating work to AI coding agents. One set of contents — one always-on page per role, project-selected styles, and mechanisms that stop operations reaching outside your machine — delivered natively to **Claude Code**, **Codex** and **Pi**.

English | [日本語](docs/README.ja.md)

## What it does

- **One page per role.** Each role reads everything it needs on every run: the lead session about 3,900 characters, a builder about 2,000, a reviewer about 2,400. Choosing styles adds their text only to the roles that need it. A test keeps the lead under 6,000 and a subagent under 4,000 characters whatever styles a project picks. The only skills left are the ones a user asks for: `setup`, `prompting`, `releases`, `triage`.
- **Styles chosen by declaration.** A project picks a git flow (`trunk` or `release-branches`) and a design shape (`layered`). Only the chosen text is injected, and the git flow also sets the shared branches and the pull-request base the hooks enforce.
- **Mechanism over prose.** What can be enforced is enforced by a hook, not by a sentence the model has to remember: outward-reaching operations, AI attribution in commits, the heavy checks a project reserves for the lead, an edit-time check, and three procedures (below). The harness sets no time limits or agent counts.
- **One confirmation line.** The agent decides everything reversible on its own. It stops only for operations that reach outside (shared branches, tags, merges, releases, deploys, remote data, repository settings, messages to people) — and each project can delegate the kinds it trusts.
- **Measured.** Every confirmation and block is logged without command text; `stats` shows how often the harness intervenes, by kind, and how much time and how many tokens each role used.

### Procedures it stops

| Procedure | Stopped when | Passes when |
|---|---|---|
| Catching up by merge | On a non-shared branch, `git merge` of a shared branch, or `git pull` without rebase | On a shared branch (integrating work); `pull.rebase` is set; `--ff-only` |
| Pull-request base | `gh pr create` whose base is not the default branch while a git flow is chosen | a base the flow shares (`release/*` in `release-branches`); no git flow chosen |
| Pushing while CI runs | The pushed branch has an open pull request whose workflow run has not finished | `gh` is missing or its answer cannot be read |

The first two can be re-run by the lead with `DOTAGENTS_CONFIRMED=1` when the user explicitly asks for it. The CI one tells the agent to wait or `gh run cancel` the run.

## Install

### For yourself

| Host | Install | Update |
|---|---|---|
| Claude Code | `/plugin install dotagents --marketplace hiroiku/dotagents` | turn on auto-update for the marketplace in `/plugin`, or `claude plugin update dotagents@dotagents` |
| Codex | `codex plugin marketplace add hiroiku/dotagents` then `codex plugin add dotagents@dotagents`, and trust its hooks in `/hooks` | `codex plugin marketplace upgrade dotagents` (hooks need trusting again after an update) |
| Pi | `pi install git:github.com/hiroiku/dotagents` | `pi update --extensions` |

Hooks run with `bun` when it is installed and with `node` otherwise.

### Into a repository

```sh
node plugin/scripts/dotagents.mjs install /path/to/repo --git release-branches --architecture layered
```

`install` writes the styles into the project declaration and a **reference** to this repository into each host's project settings. Nothing is copied, so upgrading the harness creates no commits in your project. With `layered`, it also copies a dependency-direction check (`scripts/layers/`) unless the project already has one; the project owns it afterwards. Commit what it wrote.

| Host | What `install` writes | What each person does |
|---|---|---|
| Claude Code | `.claude/settings.json`: `extraKnownMarketplaces` and `enabledPlugins` | Trust the folder. If you have not installed the harness yourself, run `claude plugin install dotagents@dotagents --scope project` once (`--scope user` for every project). Enabling it in the settings alone does not load it at the start of an interactive session. `doctor` tells you whether it is installed on your machine. |
| Codex | `.codex/config.toml`: a git marketplace and the plugin, unpinned | Trust the project, then approve the hooks in `/hooks`. Codex asks again whenever the plugin's contents change. |
| Pi | `.pi/settings.json`: an unpinned `git:` package | Trust the project. Update with `pi update --extensions`. |

If you already installed the harness yourself, it is the same plugin, so nothing is injected twice. `uninstall` removes the references.

`vendor` copies the plugin into the repository instead (`.agents/plugins/dotagents/`, a repository marketplace that all three hosts read) for people who cannot reach GitHub. Every upgrade then needs a commit, so use it only when you choose to. Claude Code needs no install: after you trust the folder, the first session registers the repository marketplace and the copy loads from the next session. Codex needs `/plugins` opened once to install it. `unvendor` removes it.

## The project declaration

Facts that differ per project live in one file, `.agents/dotagents.json`. Hooks and every role's context read it. All keys are optional.

```json
{
  "style": { "git": "release-branches", "architecture": "layered" },
  "protected": ["staging"],
  "delegated": ["push:develop", "merge:develop", "tag", "remote:staging"],
  "checks": { "edit": "biome check {file}", "commit": "npm run check:changed", "push": "npm run check", "release": "npm run e2e" },
  "decisions": ["Contrast is set by the designer. Do not flag it in review."]
}
```

| Style | Shape | Shared branches |
|---|---|---|
| `git: trunk` | Integrate into the default branch only; release by tag | default branch |
| `git: release-branches` | Same development as trunk; cut `release/…` per release line and cherry-pick fixes from the default branch | default branch, `release/*` |
| `architecture: layered` | Six layers with inward dependencies; the copied check enforces the direction | — |

`protected` adds to a flow's shared branches. `delegated` lists the kinds of outward operation the agent may perform without asking (`kind` or `kind:target`). Rewriting a shared branch, bypassing branch protection, and editing this file's policy keys can never be delegated. See the `setup` skill for every key.

## Contents

| Path | What |
|---|---|
| `plugin/core/` | The page every role reads (`core.md`) and the lead's page (`lead.md`). A test enforces their size. |
| `plugin/agents/` | `builder` and `reviewer`. The single source for Claude Code agents, Codex agent TOML and Pi child roles. |
| `plugin/styles/` | Git flows and design shapes. Front matter says which roles read the text and which values the hooks use. |
| `plugin/skills/` | `setup`, `prompting`, `releases`, `triage`. |
| `plugin/src/` | `guard.mjs` (one decision function for all hosts), `context.mjs`, `style.mjs`, `install.mjs`, `check.mjs`, and the host adapters' shared code. |
| `plugin/hosts/` | Thin adapters: Claude Code hooks, Codex hooks, a Pi extension. |
| `plugin/scripts/dotagents.mjs` | `install`, `uninstall`, `vendor`, `unvendor`, `doctor`, `stats`. |

## Limits

The guard is a tripwire for honest mistakes, not a sandbox: it reads commands, not what a script does internally. It binds only agents that run this harness. Rules that must hold for everyone belong in branch protection and CI; `doctor` reports shared branches that GitHub does not protect.

## Development

```sh
npm test    # node --test, no dependencies
```

Coming from 8.x: run `install` (or `vendor`) in each project. It replaces the copy under `.claude/skills/dotagents` and the pinned Pi package. `doctor` reports what is left.

## License

MIT
