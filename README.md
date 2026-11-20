# dotagents

A harness for delegating work to AI coding agents. One set of contents — an always-on core, role definitions, skills, and a guard for operations that reach outside your machine — delivered natively to **Claude Code**, **Codex** and **Pi**.

English | [日本語](docs/README.ja.md)

## What it does

- **Judgment over rules.** The always-on text is about 1,400 characters for the lead session and 800 for a subagent. It states the goal, the line between deciding and asking, and five design qualities. Everything else loads on demand.
- **Mechanism over prose.** What can be enforced is enforced by a hook, not by a sentence the model has to remember: outward-reaching operations, AI attribution in commits, per-command time limits for builder and reviewer roles, an edit-time check.
- **One confirmation line.** The agent decides everything reversible on its own. It stops only for operations that reach outside (shared branches, tags, merges, releases, deploys, remote data, repository settings, messages to people) — and each project can delegate the kinds it trusts.
- **The outcome is the unit.** Related issues are bundled, built by one builder in one worktree, verified once per bundle, and mapped to issues by commit (`Closes #n`).
- **Measured.** Every confirmation and block is logged without command text; `stats` shows how often the harness actually intervenes.

## Install

Each host installs the same directory (`plugin/`) with its own package mechanism. There is no installer and nothing on npm.

| Host | Install for yourself | Update |
|---|---|---|
| Claude Code | `/plugin install dotagents --marketplace hiroiku/dotagents` | turn on auto-update for the marketplace in `/plugin`, or `claude plugin update dotagents@dotagents` |
| Codex | `codex plugin marketplace add hiroiku/dotagents` then `codex plugin add dotagents@dotagents`, and trust its hooks in `/hooks` | `codex plugin marketplace upgrade dotagents` (hooks need trusting again after an update) |
| Pi | `pi install git:github.com/hiroiku/dotagents` | `pi update --extensions` |

Hooks run with `bun` when it is installed and with `node` otherwise (about 20 ms against 125 ms per tool call on the machine this was measured on).

### Install into a repository

To cover collaborators who have not installed the harness themselves, vendor it:

```sh
node plugin/scripts/dotagents.mjs vendor /path/to/repo   # then commit what it wrote
```

This copies the plugin to `.claude/skills/dotagents/` and declares the same version for Pi in `.pi/settings.json`. Each host keeps one copy, so nothing is injected or asked twice:

| Host | You also installed it yourself | You did not |
|---|---|---|
| Claude Code | Your install runs. The copy is skipped because its name is taken. | The copy loads once you trust the folder and start the session at the repository root. |
| Pi | The version the repository declares replaces yours there. | Pi installs the declared version once you trust the project. |
| Codex | Your install runs. | Nothing runs. Codex does not load plugins from a repository, so each person installs it. |

The repository never switches your own install off. Re-run `vendor` to upgrade; `unvendor` removes it.

## The project declaration

Facts that differ per project live in one file, `.agents/dotagents.json`. Hooks and every role's context read it. All keys are optional.

```json
{
  "protected": ["develop", "release/*"],
  "delegated": ["push:develop", "merge:develop", "tag", "remote:staging"],
  "checks": { "edit": "biome check {file}", "commit": "npm run check:changed", "push": "npm run check", "release": "npm run e2e" },
  "decisions": ["Contrast is set by the designer. Do not flag it in review."]
}
```

`delegated` lists the kinds of outward operation the agent may perform without asking (`kind` or `kind:target`). Rewriting a shared branch, bypassing branch protection, and editing this file's policy keys can never be delegated. See the `setup` skill for every key.

## Contents

| Path | What |
|---|---|
| `plugin/core/` | The always-on core, and the lead-only text. A test enforces their size. |
| `plugin/agents/` | `builder` and `reviewer`. The single source for Claude Code agents, Codex agent TOML and Pi child roles. |
| `plugin/skills/` | `flow` (bundle, verify, integrate, issues, releases), `design`, `review`, `prompting`, `setup`. |
| `plugin/src/` | `guard.mjs` (one decision function for all hosts), `context.mjs`, `check.mjs`, and the host adapters' shared code. |
| `plugin/hosts/` | Thin adapters: Claude Code hooks, Codex hooks, a Pi extension. |
| `plugin/scripts/dotagents.mjs` | `vendor`, `unvendor`, `doctor`, `stats`. |

## Limits

The guard is a tripwire for honest mistakes, not a sandbox: it reads commands, not what a script does internally. It binds only agents that run this harness. Rules that must hold for everyone belong in branch protection and CI; `doctor` reports shared branches that GitHub does not protect.

## Development

```sh
npm test    # node --test, no dependencies
```

Coming from 7.x: remove what it delivered with `dotagents uninstall` in each project, then install as above. The npm package `@hiroiku/dotagents` is no longer published.

## License

MIT
