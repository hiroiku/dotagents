# dotagents

A harness for delegating work to AI coding agents. One set of contents — one always-on page per role, a fixed way of working (trunk and a layered design), and mechanisms that stop operations reaching outside your machine — delivered natively to **Claude Code** and **Codex**.

English | [日本語](docs/README.ja.md)

## What it does

- **One page per role.** Each role reads everything it needs on every run: the orchestrator session about 5,600 characters, a builder about 3,500, a reviewer about 3,800. A test keeps the orchestrator under 6,000 and a subagent under 4,000 characters. The only skills left are the ones a user asks for: `setup`, `architecture`, `prompting`, `releases`, `triage`.
- **One way of working, not a menu.** Git is trunk: work integrates into the default branch and a release is a tag on it. The design is layered: six layers with dependencies pointing inward. Both are fixed, not chosen per project, and the git flow also sets the shared branches and the pull-request base the hooks enforce. A project that does not fit them says so in its own instructions or `decisions`; the user's instructions and the project's decisions take precedence over the harness's defaults.
- **Mechanism over prose.** What can be enforced is enforced by a hook, not by a sentence the model has to remember: outward-reaching git and `gh` operations, AI attribution in commits, the heavy checks a project reserves for the orchestrator, and three procedures (below). Checks themselves are the project's commands: the declaration's `checks` reach every role as entry points, and the harness runs none of them. The harness sets no time limits or agent counts.
- **One confirmation line.** The agent decides everything reversible on its own. It stops only for operations that reach outside: pushes to shared branches and tags, pull-request merges, releases, workflow runs and repository settings through `gh`, edits of instruction files and the declaration, messages to people. The harness does not read a project's own commands, since what to guard is the project's decision: a project that wants `terraform apply` or `npm publish` confirmed writes that in the host's permission settings (for example `ask` under `permissions` in Claude Code). Each project can delegate the kinds it trusts.
- **Measured.** Every confirmation and block is logged without command text in `~/.dotagents/log`; `tools/stats.mjs` in this repository shows how often the harness intervenes, by kind, and how much time and how many tokens each role used.

### Procedures it stops

| Procedure | Stopped when | Passes when |
|---|---|---|
| Catching up by merge | On a non-shared branch, `git merge` of a shared branch, or `git pull` without rebase | On a shared branch (integrating work); `pull.rebase` is set; `--ff-only` |
| Pull-request base | `gh pr create` whose base is not the default branch on GitHub | another repository; GitHub does not answer |
| Pushing while CI runs | The pushed branch has an open pull request whose workflow run has not finished, even when the push also needs confirmation | `gh` is missing, does not answer within a few seconds, or its answer cannot be read |

The first two can be re-run by the orchestrator with `DOTAGENTS_CONFIRMED=1` when the user explicitly asks for it. The CI one comes before any other answer and neither the mark nor the user's approval passes it; it tells the agent to wait or `gh run cancel` the run. Questions to GitHub (the CI state and the default branch) have their own few seconds, separate from the local checks, so a slow `gh` never hides an outward operation.

## Install

### For yourself

| Host | Install | Update |
|---|---|---|
| Claude Code | `/plugin install dotagents --marketplace hiroiku/dotagents` | turn on auto-update for the marketplace in `/plugin`, or `claude plugin update dotagents@dotagents` |
| Codex | `codex plugin marketplace add hiroiku/dotagents` then `codex plugin add dotagents@dotagents`, and trust its hooks in `/hooks` | `codex plugin marketplace upgrade dotagents` (hooks need trusting again after an update) |

Hooks run with `bun` when it is installed and with `node` otherwise.

### Sharing it in a repository

The plugin is installed with each host's ordinary steps, and it works with no configuration file. Nothing in a repository is required; a project that wants to share the install writes a reference to the plugin:

- Claude Code: `claude plugin marketplace add hiroiku/dotagents --scope project`, then `claude plugin install dotagents@dotagents --scope project`. This writes `.claude/settings.json`, which you commit. Everyone else trusts the folder and, if they have not installed the harness themselves, runs the install command once. Enabling it in the settings alone does not load it at the start of an interactive session.
- Codex: each person runs the two commands above for Codex, trusts the project, and approves the hooks in `/hooks`. Codex asks again whenever the plugin's contents change.

If you installed the harness yourself and the project also references it, it is the same plugin, so nothing is injected twice. Only a **reference** to this repository is written, never a copy, so upgrading the harness creates no commits in your project.

To change something, write `.agents/dotagents.jsonc` by hand (below). You can also ask the agent to do the install and the file for you (the `setup` skill): it also removes what 8.x and 7.x left behind, proposes an `ARCHITECTURE.md`, and checks a project (declaration, references, and whether GitHub protects the shared branches).

## The project declaration

Facts that differ per project live in one file, `.agents/dotagents.jsonc`. Hooks and every role's context read it. All keys are optional. Comments (`//`, `/* */`) and trailing commas are allowed, hence the `.jsonc` name. An older `.agents/dotagents.json` is not read: rename it. If the file cannot be read, the orchestrator is told where (line and column) and the harness runs as if it were absent.

```jsonc
{
  // Branches to treat as shared, in addition to the defaults
  "protected": ["staging"],
  "delegated": ["merge:main", "tag", "release:v1"],
  "checks": { "edit": "biome check {file}", "commit": "npm run check:changed", "push": "npm run check", "release": "npm run e2e" },
  "decisions": ["Contrast is set by the designer. Do not flag it in review."]
}
```

Shared branches are the remote's default branch, `main`, `master`, and the names in `protected`. The layered design states which layer may import which; the harness ships rules, not checking tools, so enforce the direction with the project's own lint or check. `style` and `outward` keys left in an older declaration are no longer read and may be deleted.

`protected` adds to the shared branches. `delegated` lists the kinds of outward operation the agent may perform without asking (`kind` or `kind:target`). Rewriting a shared branch, bypassing branch protection, and editing this file's policy keys can never be delegated. See the `setup` skill for every key.

## Contents

| Path | What |
|---|---|
| `plugin/core/` | The page every role reads (`core.md`), the layered design (`layered.md`, also read by every role), and the orchestrator's page, which includes the trunk flow (`orchestrator.md`). A test enforces their size. |
| `plugin/agents/` | `builder` and `reviewer`. The single source for Claude Code agents and Codex agent TOML. |
| `plugin/skills/` | `setup`, `architecture`, `prompting`, `releases`, `triage`. |
| `plugin/src/` | `guard.mjs` (one decision function for all hosts), `context.mjs`, and the host adapters' shared code. |
| `plugin/hosts/` | Thin adapters: Claude Code hooks and Codex hooks. |
| `tools/stats.mjs` | Totals of the harness's log. Not delivered by the marketplace, which ships `./plugin` only. |

## Limits

The guard is a tripwire for honest mistakes, not a sandbox: it reads commands, not what a script does internally. It binds only agents that run this harness. Rules that must hold for everyone belong in branch protection and CI; the `setup` skill's check reports shared branches that GitHub does not protect.

## Development

```sh
npm test                       # node --test, no dependencies
node tools/stats.mjs --days 7  # what the harness did on this machine, from ~/.dotagents/log
```

When you raise the version, change `plugin/package.json`, both plugin manifests, and the root `package.json` together; a test keeps them equal.

Coming from 8.x: remove the copy under `.claude/skills/dotagents` and the pinned package line 8.x wrote into `.pi/settings.json` (the `setup` skill does it); 9.0.0 no longer supports Pi.

## License

MIT
