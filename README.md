# dotagents

A harness for delegating work to AI coding agents. One set of contents — one always-on page per role, a fixed way of working (trunk and a layered design), and mechanisms that stop operations reaching outside your machine — delivered natively to **Claude Code** and **Codex**, and with limits to **Google Antigravity** (below).

English | [日本語](docs/README.ja.md)

## What it does

- **One page per role.** Each role reads everything it needs on every run: the orchestrator session about 9,110 characters, a builder about 6,260, a reviewer about 6,770. The only skills left are the ones a user asks for: `architecture`, `prompting`, `releases`, `triage`.
- **One way of working, not a menu.** Git is trunk: work integrates into the default branch and a release is a tag on it. The design is layered: six layers with dependencies pointing inward. Both are fixed, not chosen per project, and the git flow also sets the shared branches and the pull-request base the hooks enforce. A project that does not fit them says so in its own documents (`AGENTS.md`, `ARCHITECTURE.md`); the user's instructions and the project's decisions take precedence over the harness's defaults.
- **Mechanism over prose.** What can be enforced is enforced by a hook, not by a sentence the model has to remember: outward-reaching git and `gh` operations, the push and release checks when a subagent runs them, two procedures (below), and AI attribution in commits unless a project allows it (`allowAiAttribution`). Checks themselves are the project's commands: the declaration's `checks` reach every role as entry points, and the harness runs none of them. The harness sets no time limits or agent counts.
- **One confirmation line.** The agent decides everything reversible on its own. It stops only for operations that reach outside: pushes to shared branches and tags, pull-request merges, releases, workflow runs and repository settings through `gh`, edits of instruction files and the declaration, messages to people. The harness does not read a project's own commands, since what to guard is the project's decision: a project that wants `terraform apply` or `npm publish` confirmed writes that in the host's permission settings (for example `ask` under `permissions` in Claude Code). Each project can delegate the kinds it trusts.

### Procedures it stops

| Procedure | Stopped when | Passes when |
|---|---|---|
| Catching up by merge | On a non-shared branch, `git merge` of a shared branch, or `git pull` without rebase | On a shared branch (integrating work); `pull.rebase` is set; `--ff-only` |
| Pull-request base | `gh pr create` whose base is not the default branch on GitHub | another repository; GitHub does not answer |

Both can be re-run by the orchestrator with `DOTAGENTS_CONFIRMED=1` when the user explicitly asks for it. Questions to GitHub (the default branch) have their own timeout of a few seconds, separate from the local git queries, so a slow `gh` never uses up the local checks' time and never hides an outward operation.

## Install

There are two ways to install. For a team, placing the harness in the repository is recommended: everyone who clones or pulls gets the same version with no install of their own.

### For a team (placed in the repository, recommended)

Run this at the repository root, then commit the changed files and open a pull request. It needs Node.js 22 or later and git.

```sh
npx @hiroiku/dotagents@latest sync
```

It places these files. The CLI builds all of them from `plugin/`; do not edit them by hand.

| Path | What |
|---|---|
| `.agents/dotagents/` | The harness itself: the hook entry point every host calls (`dotagents.mjs`, the rule texts, the skill names, and the guard scripts bundled into one file), the schema, and a record of the placed files' hashes and version (`placed.json`). |
| `.claude/settings.json`, `.claude/agents/dotagents-*.md`, `.claude/skills/dotagents-*/` | Claude Code hooks (`SessionStart`, `SubagentStart`, `PreToolUse` under `hooks`), agent definitions, and skills. The hooks call the harness at the root that `git` finds from `$CLAUDE_PROJECT_DIR` (the directory Claude Code started in), so each repository and each worktree runs its own copy. A hook of yours in the same events stays; dotagents' hooks are told apart by calling the placed harness. |
| `.codex/hooks.json`, `.codex/agents/dotagents-*.toml` | Codex hooks and agent definitions. The hooks call the harness from the root that `git rev-parse --show-toplevel` finds. |
| `.agents/hooks.json`, `.agents/agents/dotagents-*.md`, `.agents/rules/dotagents.md` | Antigravity hooks, agent definitions, and the always-on rule. |
| `.agents/dotagents.jsonc` | Created with only the `$schema` line (`./dotagents/schema/dotagents.schema.json`) when missing; otherwise only its `$schema` line is rewritten (see "The project declaration" below). |
| `.agents/skills/dotagents-*/` | Skills for Codex and Antigravity, the same as Claude Code's. Every host's skills and agents are prefixed with `dotagents-` so they do not collide with the project's own. |
| `.gitattributes` | Lines that mark the placed files (the harness and the dotagents files above) `linguist-generated=true`, so GitHub treats them as generated and collapses them in pull-request diffs. The lines sit in one block from `# dotagents: ここから` to `# dotagents: ここまで`; other lines are left as they are. The file is created when missing. |

In the settings files (`.claude/settings.json`, `.codex/hooks.json`, `.agents/hooks.json`) and `.gitattributes` only dotagents' entries are added or replaced; other entries and the formatting (order, indentation) stay as they are. If one of them is not valid JSON, the command stops with an error and changes nothing.

A reference that installs `hiroiku/dotagents` from GitHub as a marketplace in the project's settings (`extraKnownMarketplaces` and `enabledPlugins` in `.claude/settings.json`, the `[marketplaces.<name>]` and `[plugins."dotagents@<name>"]` tables in `.codex/config.toml`) would stay enabled alongside the placed harness. `sync` removes such references and lists what it removed; `remove` does not restore them.

Up to 9.2.0, Claude Code read the harness as a plugin from a `directory` marketplace named `dotagents-project` (`dotagents-project` under `extraKnownMarketplaces` and `dotagents@dotagents-project` under `enabledPlugins` in `.claude/settings.json`). Claude Code keeps one registration per marketplace name for the whole profile, so repositories and worktrees with the same name read each other's harness. `sync` and `remove` delete those two entries. The registration left in your Claude Code profile is no longer used once no project setting enables it; repositories still on 9.2.0 keep using it until they are updated.

#### Update

Run the same command, then commit the changed files and open a pull request. The harness is replaced as a whole, and files the new version no longer has are deleted. In a repository placed with an earlier version, this deletes the files no longer placed, such as the harness's `src/` and `core/` (9.1.0 and earlier) or its `.claude-plugin/`, `agents/`, `skills/`, and `hosts/` (9.2.0), and places Claude Code's files under `.claude/`. If a placed file was edited by hand, the command names it and stops without changing anything; add `--force` to overwrite the edits.

```sh
npx @hiroiku/dotagents@latest sync          # the same command installs and updates
npx @hiroiku/dotagents@latest sync --force  # also overwrite files edited by hand
```

#### After cloning

| Host | Steps |
|---|---|
| Claude Code | Trust the folder. No install is needed; pulled changes load from the next session. |
| Codex | Trust the project and approve the dotagents hooks in `/hooks`. Codex asks again whenever a hook definition or the script it calls changes, so approve again in `/hooks` after pulling an update. Until then the dotagents hooks do not run in Codex. |
| Antigravity | Trust the folder. |

If you also installed dotagents for yourself, leave it as it is: inside a repository that has dotagents placed, the hooks of your personal plugin do nothing, and the version placed in the repository runs. Claude Code still lists the personal plugin's skills and agents (`dotagents:<name>`) next to the placed ones (`dotagents-<name>`); the context the placed hooks give points at the placed names.

#### Uninstall

Run this, then commit the changed files and open a pull request. It deletes the placed files and dotagents' entries in the settings files and `.gitattributes`; `.gitattributes` is deleted if only dotagents' block was in it. `.agents/dotagents.jsonc` is deleted if it is still as `sync` created it (only `$schema`); otherwise only its `$schema` line is removed.

```sh
npx @hiroiku/dotagents@latest remove
```

#### Checked on real hosts

This was built from each host's documentation. What has and has not been checked on a real host:

- Claude Code (checked): on 2.1.332, two repositories and a git worktree each run their own placed harness, the placed skills show as `dotagents-<skill>`, and `git push origin main` is asked. When Claude Code starts in a subdirectory of the repository, 2.1.332 shows the skills and agents but does not run the hooks in the root's `.claude/settings.json`, so the rules and the confirmations are missing; start Claude Code at the repository root.
- Codex (not confirmed): the shape of `.codex/hooks.json` and the directory a hook command runs in; that `.codex/agents/` and `.agents/skills/` are read; duplicate skills with the personal plugin.
- Antigravity (not confirmed): the directory and the shell a hook command runs in (the documentation does not say; the commands find the root with `$(git rev-parse --show-toplevel)`, so they work when run through a shell from inside the repository); that the `trigger: always_on` rule in `.agents/rules/`, `.agents/agents/`, and `.agents/skills/` are read.

### For yourself (marketplace)

Installs the harness in your own environment only. It works in every project and places nothing in a repository.

| Host | Install | Update |
|---|---|---|
| Claude Code | `/plugin install dotagents --marketplace hiroiku/dotagents` | turn on auto-update for the marketplace in `/plugin`, or `claude plugin update dotagents@dotagents` |
| Codex | `codex plugin marketplace add hiroiku/dotagents` then `codex plugin add dotagents@dotagents`, and trust its hooks in `/hooks` | `codex plugin marketplace upgrade dotagents` (hooks need trusting again after an update) |
| Antigravity | clone this repository, then `agy plugin install <clone>/antigravity` | `git pull`, then the same install command (not confirmed) |

For a personal install only, the harness's schema is not in the repository, so write `https://raw.githubusercontent.com/hiroiku/dotagents/master/plugin/schema/dotagents.schema.json` as `$schema` in `.agents/dotagents.jsonc`.

Hooks run with `bun` when it is installed and with `node` otherwise; Antigravity's hooks run with `node`. On Codex, the agent definitions are written to `~/.codex/agents/dotagents-*.toml` at the start of a session (not when the harness is placed in the repository).

#### Uninstall

1. Claude Code: `claude plugin uninstall dotagents@dotagents`.
2. Codex: delete the `[marketplaces.dotagents]` and `[plugins."dotagents@dotagents"]` tables from `~/.codex/config.toml`, and delete `~/.codex/agents/dotagents-*.toml`.
3. Antigravity: `agy plugin uninstall dotagents`.

### Antigravity (with limits)

The Antigravity plugin is generated from `plugin/` into `antigravity/` by `node tools/antigravity.mjs`, because Antigravity reads a plugin's `agents/` and cannot read the Claude Code agent definitions there. It was built from Antigravity's documentation only and **has not been run on a real Antigravity**. `agy plugin install https://github.com/<owner>/<repo>` is documented for a repository whose root is the plugin; whether a subdirectory can be installed by URL is not documented, so clone first.

What each role receives: every agent gets the parts of the default rules that every role reads from the plugin's always-on rule (`rules/AGENTS.md`); the main session also gets the main-session-only parts (headed "dotagents の既定のルール(続き)") and the project settings built from `.agents/dotagents.jsonc` from the `SessionStart` hook; the builder and the reviewer get their definition as their system prompt (`model: inherit`, a tool allowlist, the reviewer's read-only). The hooks judge `run_command` and the three editing tools: an outward operation answers `force_ask` (asked every time, even after "Always Allow"), a stopped procedure or AI attribution answers `deny` with the reason, and everything else answers `allow`, which leaves the call to Antigravity's own permission rules (`auto_approve`, which would skip them, is never returned).

What Antigravity cannot enforce:

- **Limits on the builder and the reviewer are text only.** A hook is not told which agent made a call, so every call is judged as the orchestrator's: a subagent's outward operation is asked of you instead of stopped, and the heavy `push` and `release` checks are not stopped in a subagent.
- **No facts at a subagent's start.** There is no subagent-start event, so the check entry points (and the deprecated `decisions`) reach the main session only; when a subagent is used, what it needs has to be written in its request. The documentation does not say whether `SessionStart` also fires inside a subagent; if it does, the subagent also receives the main-session-only parts.
- **No connector check.** Messages through MCP tools are not judged by the hook (Antigravity asks for unconfigured MCP calls by default).

The same limits apply when the harness is placed in a repository; the parts every role reads then come from `.agents/rules/dotagents.md`.

## The project declaration

Facts that differ per project live in one file, `.agents/dotagents.jsonc`. Hooks and every role's context read it. All keys are optional, and with no file the harness runs on its defaults. Put the `$schema` line first and editors complete the keys and flag mistakes. The standard `$schema` is a relative path to the schema of the harness placed in the repository (`./dotagents/schema/dotagents.schema.json`), so the schema always matches the placed version. `sync` creates the file with only the `$schema` line when it does not exist; when it does, `sync` rewrites `$schema` to the relative path only if it is missing or points at this repository's schema URL.

```jsonc
{
  "$schema": "./dotagents/schema/dotagents.schema.json",
  // Branches to treat as shared, in addition to the defaults
  "protected": ["staging"],
  "delegated": ["merge:main", "tag", "release:v1"],
  "checks": { "edit": "biome check {file}", "commit": "npm run check:changed", "push": "npm run check", "release": "npm run e2e" },
  // allow AI attribution (blocked when omitted)
  "allowAiAttribution": true
}
```

What each key means and when to write it is described once, in the `description` fields of [`plugin/schema/dotagents.schema.json`](plugin/schema/dotagents.schema.json). The agents are told that file's path at the start of every session.

### Project decisions go in AGENTS.md and ARCHITECTURE.md

The declaration holds only what the hooks judge by: `protected`, `delegated`, `checks`, `allowAiAttribution`. The project's own decisions go in two files, by what they are about:

- `AGENTS.md`: how agents work in the project (setting up the environment, the commands to run, how work proceeds, what review does not look at). It is the README for agents.
- `ARCHITECTURE.md`: the technology chosen, the structure, where things go, and the invariants, each with its reason and the condition for revisiting it.

Codex reads `AGENTS.md` as it is, and so does Claude Code from 2.1.277 when there is no `CLAUDE.md`; Claude Code's own `builder` and `reviewer` subagents also load the project's instructions, `AGENTS.md` included. If anyone on the project uses a Claude Code older than 2.1.277, make `CLAUDE.md` a symbolic link to `AGENTS.md` (`ln -s AGENTS.md CLAUDE.md`). Detailed specifications go in docs; `AGENTS.md` links to them and to `ARCHITECTURE.md`.

The declaration's `decisions` array is deprecated. 9.x still reads it and gives it to every role; 10.0.0 will not. While it is there, the orchestrator suggests moving each entry to `AGENTS.md` or `ARCHITECTURE.md` by what it is about, and `sync` prints the entries as Markdown you can paste (it never edits either file). The harness's own text has no limits on time or count; a project that needs one writes it in `AGENTS.md` with its reason.

## Contents

| Path | What |
|---|---|
| `plugin/core/` | The parts of the always-loaded default rules, one file per field and topic. Their order and which role reads which part are listed once, in `OUTLINE` in `plugin/src/context.mjs`. |
| `plugin/agents/` | `builder` and `reviewer`. The single source for Claude Code agents, Codex agent TOML, and Antigravity agents. None of them sets a model, so the caller's and the user's settings decide. Each Codex TOML starts with a line marking it as generated by dotagents; a same-named file without that line is never overwritten. |
| `plugin/schema/` | JSON Schema of `.agents/dotagents.jsonc`: the one place that explains every key. Editors use it for completion, and agents are told its path. Hooks do not read it. |
| `plugin/skills/` | `architecture`, `prompting`, `releases`, `triage`. |
| `plugin/src/` | `guard.mjs` (one decision function for all hosts), `context.mjs`, and the host adapters' shared code. |
| `plugin/dotagents.mjs` | The hook entry point: the modules in `plugin/src/` and the texts in `plugin/core/` bundled into one file, which builds the context without reading files. Generated by `tools/bundle.mjs`; do not edit it. A test fails when it is stale. |
| `plugin/hosts/` | Hook definitions for Claude Code, Codex, and Antigravity. All of them call `plugin/dotagents.mjs`. |
| `cli/` | The CLI that places the harness in a repository (`npx @hiroiku/dotagents@latest sync`). The npm package `@hiroiku/dotagents` contains only `cli/` and `plugin/`. |
| `antigravity/` | The Antigravity plugin, generated from `plugin/` by `tools/antigravity.mjs`. Do not edit it; a test fails when it is stale. |

## Limits

The guard is a tripwire for honest mistakes, not a sandbox: it reads commands, not what a script does internally. It binds only agents that run this harness. Rules that must hold for everyone belong in branch protection and CI. Likewise the layered design is stated as rules, not enforced by a lint tool the harness ships: enforce dependency direction, placement, and naming with the project's own lint or check.

How the hooks relate to the host's own permissions:

- **Claude Code**: per the documentation, permission deny and ask rules are evaluated regardless of what a hook returns. A hook's `allow` skips the prompt, but in plan mode it has no effect on calls that are not read-only. Whether a hook's `ask` still prompts for a command the user has allowed with a permission rule is not documented (not verified). The opening of the default rules tells the agent that the host's permission settings and the user's instructions take precedence over the harness's confirmation rule.
- **Codex**: Codex treats an `ask` from a hook as a hook failure and lets the call continue, so dotagents returns `deny` on Codex and tells the agent to get the user's approval and re-run the command with `DOTAGENTS_CONFIRMED=1`. The flag is an environment variable read only by the dotagents hook; it does not change Codex's approval policy (`approval_policy`) or sandbox (`sandbox_mode`) settings. The Codex documentation does not state that the re-run command goes through the approval policy and sandbox as usual (not verified). It describes tool hooks as "a useful guardrail, not a complete enforcement boundary."

## Development

```sh
npm test                       # node --test, no dependencies
node tools/bundle.mjs          # generate plugin/dotagents.mjs from plugin/src/ and plugin/core/
node tools/antigravity.mjs     # generate antigravity/ from plugin/
```

After changing `plugin/src/` or `plugin/core/`, run `node tools/bundle.mjs`, then `node tools/antigravity.mjs`. `tools/bundle.mjs` is a small script that joins the modules in dependency order, with no tool or package dependency. So the modules in `plugin/src/` use only the plain import forms it accepts and never declare the same top-level name in two modules; otherwise it stops and says why.

The always-loaded default rules are `plugin/core/*.md`. Put a text there only when every run needs it, after the placement order in the `prompting` skill. Choose the field (H2) and the topic (H3), then decide which roles read it (every role, or the main session only) in the list in `plugin/src/context.mjs`. The headings keep their shape: two H1 (the default rules, and the project's settings), H2 for a field, H3 for a topic, and no H4.

To point at a skill in `core/`, `agents/`, or `skills/`, write its Claude Code plugin name, `` `dotagents:<skill>` ``; Claude Code's personal plugin reads these files as they are. Elsewhere, `plugin/src/skills.mjs` rewrites it to the name the agent sees (`<skill>` in the Antigravity plugin, `dotagents-<skill>` on every host when the harness is placed in a repository). The hook entry point knows it is placed from the `placed.json` next to it.

When you raise the version, change `plugin/package.json`, both plugin manifests, and the root `package.json` together, then run `node tools/antigravity.mjs`; a test keeps them equal. Run it after any change under `plugin/` as well. The CLI package is published from the root `package.json` (`npm publish`); the `plugin/` of the published version is what gets placed in repositories.

## License

MIT
