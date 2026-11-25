# dotagents

A harness for delegating work to AI coding agents. One set of contents — one always-on page per role, project-selected styles, and mechanisms that stop operations reaching outside your machine — delivered natively to **Claude Code** and **Codex**.

English | [日本語](docs/README.ja.md)

## What it does

- **One page per role.** Each role reads everything it needs on every run: the lead session about 3,900 characters, a builder about 2,000, a reviewer about 2,400. Choosing styles adds their text only to the roles that need it. A test keeps the lead under 6,000 and a subagent under 4,000 characters whatever styles a project picks. The only skills left are the ones a user asks for: `setup`, `prompting`, `releases`, `triage`.
- **Styles chosen by declaration.** A project picks a git flow (`trunk` or `release-branches`) and a design shape (`layered`). Only the chosen text is injected, and the git flow also sets the shared branches and the pull-request base the hooks enforce.
- **Mechanism over prose.** What can be enforced is enforced by a hook, not by a sentence the model has to remember: outward-reaching operations, AI attribution in commits, the heavy checks a project reserves for the lead, and three procedures (below). Checks themselves are the project's commands: the declaration's `checks` reach every role as entry points, and the harness runs none of them. The harness sets no time limits or agent counts.
- **One confirmation line.** The agent decides everything reversible on its own. It stops only for operations that reach outside: pushes to shared branches and tags, pull-request merges, releases, workflow runs and repository settings through `gh`, edits of instruction files and the declaration, messages to people, and commands whose subcommand is a release or deploy verb (`publish`, `release`, `deploy`, `promote`, `rollback`, `destroy`, also inside script names such as `deploy:prod`, but not when the same name says it stays local, as in `deploy:dry-run` or `release:check`). The harness knows no tool names. Commands that reach outside only because of the project's stack (`terraform apply`, `wrangler d1 execute --remote`, `docker push`) are listed by the project in `outward`; without that they pass unchecked. Each project can delegate the kinds it trusts.
- **Measured.** Every confirmation and block is logged without command text in `~/.dotagents/log`; `tools/stats.mjs` in this repository shows how often the harness intervenes, by kind, and how much time and how many tokens each role used.

### Procedures it stops

| Procedure | Stopped when | Passes when |
|---|---|---|
| Catching up by merge | On a non-shared branch, `git merge` of a shared branch, or `git pull` without rebase | On a shared branch (integrating work); `pull.rebase` is set; `--ff-only` |
| Pull-request base | `gh pr create` whose base is not the default branch on GitHub while a git flow is chosen | a base the flow shares (`release/*` in `release-branches`); no git flow chosen; another repository; GitHub does not answer |
| Pushing while CI runs | The pushed branch has an open pull request whose workflow run has not finished, even when the push also needs confirmation | `gh` is missing, does not answer within a few seconds, or its answer cannot be read |

The first two can be re-run by the lead with `DOTAGENTS_CONFIRMED=1` when the user explicitly asks for it. The CI one comes before any other answer and neither the mark nor the user's approval passes it; it tells the agent to wait or `gh run cancel` the run. Questions to GitHub (the CI state and the default branch) have their own few seconds, separate from the local checks, so a slow `gh` never hides an outward operation.

## Install

### For yourself

| Host | Install | Update |
|---|---|---|
| Claude Code | `/plugin install dotagents --marketplace hiroiku/dotagents` | turn on auto-update for the marketplace in `/plugin`, or `claude plugin update dotagents@dotagents` |
| Codex | `codex plugin marketplace add hiroiku/dotagents` then `codex plugin add dotagents@dotagents`, and trust its hooks in `/hooks` | `codex plugin marketplace upgrade dotagents` (hooks need trusting again after an update) |

Hooks run with `bun` when it is installed and with `node` otherwise.

### Into a repository

Ask the agent to set the harness up in the repository (the `setup` skill). There is no install command: the agent edits the files in place, following the procedure in the skill, and shows you the result to commit.

| Host | What goes into the repository | What each person does |
|---|---|---|
| Claude Code | `.claude/settings.json`: `extraKnownMarketplaces` and `enabledPlugins` | Trust the folder. If you have not installed the harness yourself, run `claude plugin install dotagents@dotagents --scope project` once (`--scope user` for every project). Enabling it in the settings alone does not load it at the start of an interactive session. |
| Codex | `.codex/config.toml`: a git marketplace and the plugin, unpinned | Trust the project, then approve the hooks in `/hooks`. Codex asks again whenever the plugin's contents change. |

The agent also writes the project declaration (styles, `checks`, `outward`). Only a **reference** to this repository is written, never a copy, so upgrading the harness creates no commits in your project. Only the harness's own entries are added or removed; every other key and character of your settings stays as it was. If you already installed the harness yourself, it is the same plugin, so nothing is injected twice. The same skill removes it, cleans up what 8.x and 7.x left behind, and checks a project (declaration, references, styles, and whether GitHub protects the shared branches).

## The project declaration

Facts that differ per project live in one file, `.agents/dotagents.json`. Hooks and every role's context read it. All keys are optional.

```json
{
  "style": { "git": "release-branches", "architecture": "layered" },
  "protected": ["staging"],
  "outward": ["^terraform apply", "^wrangler d1 .*--remote", "^docker push"],
  "delegated": ["merge:main", "tag", "deploy:staging"],
  "checks": { "edit": "biome check {file}", "commit": "npm run check:changed", "push": "npm run check", "release": "npm run e2e" },
  "decisions": ["Contrast is set by the designer. Do not flag it in review."]
}
```

| Style | Shape | Shared branches |
|---|---|---|
| `git: trunk` | Integrate into the default branch only; release by tag | default branch |
| `git: release-branches` | Same development as trunk; cut `release/…` per release line and cherry-pick fixes from the default branch | default branch, `release/*` |
| `architecture: layered` | Six layers with inward dependencies; the text states which layer may import which. The harness ships rules, not checking tools: enforce the direction with the project's own lint or check | — |

`protected` adds to a flow's shared branches. `outward` lists, as regular expressions, the commands that reach outside in this project's stack (deploys, package publishing, writes to remote data); `setup` proposes them from the project's scripts and configuration. `delegated` lists the kinds of outward operation the agent may perform without asking (`kind` or `kind:target`). Rewriting a shared branch, bypassing branch protection, and editing this file's policy keys can never be delegated. See the `setup` skill for every key.

## Contents

| Path | What |
|---|---|
| `plugin/core/` | The page every role reads (`core.md`) and the lead's page (`lead.md`). A test enforces their size. |
| `plugin/agents/` | `builder` and `reviewer`. The single source for Claude Code agents and Codex agent TOML. |
| `plugin/styles/` | Git flows and design shapes. Front matter says which roles read the text and which values the hooks use. |
| `plugin/skills/` | `setup`, `prompting`, `releases`, `triage`. |
| `plugin/src/` | `guard.mjs` (one decision function for all hosts), `context.mjs`, `style.mjs`, and the host adapters' shared code. |
| `plugin/hosts/` | Thin adapters: Claude Code hooks and Codex hooks. |
| `tools/stats.mjs` | Totals of the harness's log. Not delivered by the marketplace, which ships `./plugin` only. |

## Limits

The guard is a tripwire for honest mistakes, not a sandbox: it reads commands, not what a script does internally. It binds only agents that run this harness. Rules that must hold for everyone belong in branch protection and CI; the `setup` skill's check reports shared branches that GitHub does not protect.

## Development

```sh
npm test                       # node --test, no dependencies
node tools/stats.mjs --days 7  # what the harness did on this machine, from ~/.dotagents/log
```

Coming from 8.x: ask the agent to set up each project again with the `setup` skill. It removes the copy under `.claude/skills/dotagents` and the pinned package line 8.x wrote into `.pi/settings.json`; 9.0.0 no longer supports Pi.

## License

MIT
