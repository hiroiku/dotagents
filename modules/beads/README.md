# beads

Requires [bd](https://github.com/gastownhall/beads) on `PATH`. The installer detects it and reports what is missing; it never installs it for you.

## What it does

An agent that files an issue leaves `created_by` and an entry in `.beads/interactions.jsonl`. By default both carry a name that is the same for every session, so a row in the ledger cannot be traced back to the run that produced it.

This module injects an actor that names the session. A `PreToolUse` hook reads the session id Claude Code passes it and rewrites the command:

```
bd create --title="…"   →   bd --actor "claude/c502e943" create --title="…"
```

Three things follow from that:

- **The ledger joins to the transcript.** `bd audit` exists for asking "why did the agent do that?", and the session id is the address of the answer: `~/.claude/projects/<project>/<session-id>.jsonl`.
- **Occupancy is legible.** `bd update --claim` records the same actor, so `bd list --status=in_progress` tells you which session holds what — the thing you need when several run at once.
- **People and agents stay apart.** Everything an agent files is prefixed `claude/`.

The rewrite is deliberately narrow. It touches a command only when the whole thing is one `bd` invocation: a pipeline, a `&&` chain, a substitution, or an explicit `--actor` is left exactly as written.

## Static settings this module cannot carry

A plugin ships hooks, not environment variables, so these stay yours to place. Both belong in the project's `.claude/settings.json`, which is committed and shared:

```json
{
  "env": {
    "BD_NON_INTERACTIVE": "1",
    "BD_LIST_LIMIT": "20"
  }
}
```

`BD_NON_INTERACTIVE` matters most: without it `bd edit` opens `$EDITOR` and the agent hangs on a prompt nobody will answer. `BD_LIST_LIMIT` keeps a casual `bd list` from spending the session's attention on 50 rows.

Worth knowing but not worth defaulting: `BD_AGENT_PROFILE` (`conservative` · `minimal` · `team-maintainer`) decides whether `bd prime` grants the agent authority to commit and push, and `BEADS_DIR` pins the ledger when you work from a git worktree.
