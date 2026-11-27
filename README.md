# dotagents

A harness for delegating work to AI coding agents. One set of contents — one always-on page per role, a fixed way of working (trunk and a layered design), and mechanisms that stop operations reaching outside your machine — delivered natively to **Claude Code** and **Codex**, and with limits to **Google Antigravity** (below).

English | [日本語](docs/README.ja.md)

## What it does

- **One page per role.** Each role reads everything it needs on every run: the orchestrator session about 8,380 characters, a builder about 5,580, a reviewer about 6,130. The only skills left are the ones a user asks for: `architecture`, `prompting`, `releases`, `triage`.
- **One way of working, not a menu.** Git is trunk: work integrates into the default branch and a release is a tag on it. The design is layered: six layers with dependencies pointing inward. Both are fixed, not chosen per project, and the git flow also sets the shared branches and the pull-request base the hooks enforce. A project that does not fit them says so in its own instructions or `decisions`; the user's instructions and the project's decisions take precedence over the harness's defaults.
- **Mechanism over prose.** What can be enforced is enforced by a hook, not by a sentence the model has to remember: outward-reaching git and `gh` operations, the push and release checks when a subagent runs them, two procedures (below), and AI attribution in commits unless a project allows it (`allowAiAttribution`). Checks themselves are the project's commands: the declaration's `checks` reach every role as entry points, and the harness runs none of them. The harness sets no time limits or agent counts.
- **One confirmation line.** The agent decides everything reversible on its own. It stops only for operations that reach outside: pushes to shared branches and tags, pull-request merges, releases, workflow runs and repository settings through `gh`, edits of instruction files and the declaration, messages to people. The harness does not read a project's own commands, since what to guard is the project's decision: a project that wants `terraform apply` or `npm publish` confirmed writes that in the host's permission settings (for example `ask` under `permissions` in Claude Code). Each project can delegate the kinds it trusts.

### Procedures it stops

| Procedure | Stopped when | Passes when |
|---|---|---|
| Catching up by merge | On a non-shared branch, `git merge` of a shared branch, or `git pull` without rebase | On a shared branch (integrating work); `pull.rebase` is set; `--ff-only` |
| Pull-request base | `gh pr create` whose base is not the default branch on GitHub | another repository; GitHub does not answer |

Both can be re-run by the orchestrator with `DOTAGENTS_CONFIRMED=1` when the user explicitly asks for it. Questions to GitHub (the default branch) have their own timeout of a few seconds, separate from the local git queries, so a slow `gh` never uses up the local checks' time and never hides an outward operation.

## Install

### For yourself

| Host | Install | Update |
|---|---|---|
| Claude Code | `/plugin install dotagents --marketplace hiroiku/dotagents` | turn on auto-update for the marketplace in `/plugin`, or `claude plugin update dotagents@dotagents` |
| Codex | `codex plugin marketplace add hiroiku/dotagents` then `codex plugin add dotagents@dotagents`, and trust its hooks in `/hooks` | `codex plugin marketplace upgrade dotagents` (hooks need trusting again after an update) |
| Antigravity | clone this repository, then `agy plugin install <clone>/antigravity` | `git pull`, then the same install command (not confirmed) |

Hooks run with `bun` when it is installed and with `node` otherwise; Antigravity's hooks run with `node`.

### Antigravity (with limits)

The Antigravity plugin is generated from `plugin/` into `antigravity/` by `node tools/antigravity.mjs`, because Antigravity reads a plugin's `agents/` and cannot read the Claude Code agent definitions there. It was built from Antigravity's documentation only and **has not been run on a real Antigravity**. `agy plugin install https://github.com/<owner>/<repo>` is documented for a repository whose root is the plugin; whether a subdirectory can be installed by URL is not documented, so clone first.

What each role receives: every agent gets the parts of the default rules that every role reads from the plugin's always-on rule (`rules/AGENTS.md`); the main session also gets the main-session-only parts (headed "dotagents の既定のルール(続き)") and the project settings built from `.agents/dotagents.jsonc` from the `SessionStart` hook; the builder and the reviewer get their definition as their system prompt (`model: inherit`, a tool allowlist, the reviewer's read-only). The hooks judge `run_command` and the three editing tools: an outward operation answers `force_ask` (asked every time, even after "Always Allow"), a stopped procedure or AI attribution answers `deny` with the reason, and everything else answers `allow`, which leaves the call to Antigravity's own permission rules (`auto_approve`, which would skip them, is never returned).

What Antigravity cannot enforce:

- **Limits on the builder and the reviewer are text only.** A hook is not told which agent made a call, so every call is judged as the orchestrator's: a subagent's outward operation is asked of you instead of stopped, and the heavy `push` and `release` checks are not stopped in a subagent.
- **No facts at a subagent's start.** There is no subagent-start event, so `decisions` and the check entry points reach the main session only; when a subagent is used, what it needs has to be written in its request. The documentation does not say whether `SessionStart` also fires inside a subagent; if it does, the subagent also receives the main-session-only parts.
- **No connector check.** Messages through MCP tools are not judged by the hook (Antigravity asks for unconfigured MCP calls by default).

### Sharing it in a repository

The plugin is installed with each host's ordinary steps, and it works with no configuration file. Nothing in a repository is required; a project that wants to share the install writes a reference to the plugin:

- Claude Code: `claude plugin marketplace add hiroiku/dotagents --scope project`, then `claude plugin install dotagents@dotagents --scope project`. This writes `.claude/settings.json`, which you commit. Everyone else trusts the folder and, if they have not installed the harness themselves, runs the install command once. Enabling it in the settings alone does not load it at the start of an interactive session.
- Codex: each person runs the two commands above for Codex, trusts the project, and approves the hooks in `/hooks`. Codex asks again whenever the plugin's contents change.
- Antigravity: there is no reference a project can share. Do not put the plugin under `.agents/plugins/`, which makes a copy.

If you installed the harness yourself and the project also references it, it is the same plugin, so nothing is injected twice. Only a **reference** to this repository is written, never a copy, so upgrading the harness creates no commits in your project.

### Uninstall

1. Claude Code: delete `dotagents@dotagents` from `enabledPlugins` and `dotagents` from `extraKnownMarketplaces` in `.claude/settings.json`. Delete an object that becomes empty, and the file if it becomes `{}`. For a personal install, run `claude plugin uninstall dotagents@dotagents`.
2. Codex: delete the `[marketplaces.dotagents]` and `[plugins."dotagents@dotagents"]` tables from `.codex/config.toml`, each from its heading to its last value (including lines you added), plus the one blank line before the heading. Delete the file if it becomes empty.
3. Antigravity: `agy plugin uninstall dotagents`.
4. Keep `.agents/dotagents.jsonc` or delete it, as you prefer. Once the plugin is gone, nothing reads it.

Edit these settings files by hand and change nothing but dotagents' entries, so the other entries and their formatting stay as they are.

## The project declaration

Facts that differ per project live in one file, `.agents/dotagents.jsonc`. Hooks and every role's context read it. All keys are optional, and with no file the harness runs on its defaults. Put the `$schema` line first and editors complete the keys and flag mistakes.

```jsonc
{
  "$schema": "https://raw.githubusercontent.com/hiroiku/dotagents/master/plugin/schema/dotagents.schema.json",
  // Branches to treat as shared, in addition to the defaults
  "protected": ["staging"],
  "delegated": ["merge:main", "tag", "release:v1"],
  "checks": { "edit": "biome check {file}", "commit": "npm run check:changed", "push": "npm run check", "release": "npm run e2e" },
  // allow AI attribution (blocked when omitted)
  "allowAiAttribution": true,
  "decisions": ["Store amounts as integer yen, never fractions, because the payment provider's API accepts only integer yen. Revisit when supporting other currencies."]
}
```

What each key means and when to write it is described once, in the `description` fields of [`plugin/schema/dotagents.schema.json`](plugin/schema/dotagents.schema.json). The agents are told that file's path at the start of every session.

## Contents

| Path | What |
|---|---|
| `plugin/core/` | The parts of the always-loaded default rules, one file per field and topic. Their order and which role reads which part are listed once, in `OUTLINE` in `plugin/src/context.mjs`. |
| `plugin/agents/` | `builder` and `reviewer`. The single source for Claude Code agents, Codex agent TOML, and Antigravity agents. None of them sets a model, so the caller's and the user's settings decide. Each Codex TOML starts with a line marking it as generated by dotagents; a same-named file without that line is never overwritten. |
| `plugin/schema/` | JSON Schema of `.agents/dotagents.jsonc`: the one place that explains every key. Editors use it for completion, and agents are told its path. Hooks do not read it. |
| `plugin/skills/` | `architecture`, `prompting`, `releases`, `triage`. |
| `plugin/src/` | `guard.mjs` (one decision function for all hosts), `context.mjs`, and the host adapters' shared code. |
| `plugin/hosts/` | Thin adapters: Claude Code, Codex, and Antigravity hooks. |
| `antigravity/` | The Antigravity plugin, generated from `plugin/` by `tools/antigravity.mjs`. Do not edit it; a test fails when it is stale. |

## Limits

The guard is a tripwire for honest mistakes, not a sandbox: it reads commands, not what a script does internally. It binds only agents that run this harness. Rules that must hold for everyone belong in branch protection and CI. Likewise the layered design is stated as rules, not enforced by a lint tool the harness ships: enforce dependency direction, placement, and naming with the project's own lint or check.

How the hooks relate to the host's own permissions:

- **Claude Code**: per the documentation, permission deny and ask rules are evaluated regardless of what a hook returns. A hook's `allow` skips the prompt, but in plan mode it has no effect on calls that are not read-only. Whether a hook's `ask` still prompts for a command the user has allowed with a permission rule is not documented (not verified). The opening of the default rules tells the agent that the host's permission settings and the user's instructions take precedence over the harness's confirmation rule.
- **Codex**: Codex treats an `ask` from a hook as a hook failure and lets the call continue, so dotagents returns `deny` on Codex and tells the agent to get the user's approval and re-run the command with `DOTAGENTS_CONFIRMED=1`. The flag is an environment variable read only by the dotagents hook; it does not change Codex's approval policy (`approval_policy`) or sandbox (`sandbox_mode`) settings. The Codex documentation does not state that the re-run command goes through the approval policy and sandbox as usual (not verified). It describes tool hooks as "a useful guardrail, not a complete enforcement boundary."

## Development

```sh
npm test                       # node --test, no dependencies
node tools/antigravity.mjs     # generate antigravity/ from plugin/
```

The always-loaded default rules are `plugin/core/*.md`. Put a text there only when every run needs it, after the placement order in the `prompting` skill. Choose the field (H2) and the topic (H3), then decide which roles read it (every role, or the main session only) in the list in `plugin/src/context.mjs`. The headings keep their shape: two H1 (the default rules, and the project's settings), H2 for a field, H3 for a topic, and no H4.

When you raise the version, change `plugin/package.json`, both plugin manifests, and the root `package.json` together, then run `node tools/antigravity.mjs`; a test keeps them equal. Run it after any change under `plugin/` as well.

## License

MIT
