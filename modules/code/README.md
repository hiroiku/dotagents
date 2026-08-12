# code

A module for the conventions that govern the writing of code and have no moment to be triggered on. Today there is one, and it is in [AGENTS.md](AGENTS.md): _comments explain the intent of the code they sit on. No history, no ADRs, no provisions for the future._

## What a comment is for

The code already says what it does. The one thing it cannot say is why it is this way — which alternative was rejected, which constraint forced the shape, what will break if the order changes. That is the whole job of a comment, and a comment that restates the code instead starts lying the moment the code moves and it does not.

Three things are kept out, and they fail the same way: each is a second record of something that is already recorded better somewhere else.

**History** — `// changed from X in #1234`. Git holds it, holds it with the author and the date, and keeps holding it after the line is moved to another file. In the source it is a copy that nothing updates.

**Decision records** — the reasoning behind a design, pasted where one of its consequences happens to live. The reader who needs that reasoning is not in this file, and everyone who is pays for it on every pass.

**Provisions for the future** — `// TODO: when we support multi-tenancy`. A promise nobody is holding. It reads as a plan long after the plan was dropped, and the code around it gets shaped by a case that never arrives.

## Why it is ubiquitous, and not a skill

Everything injected into every session taxes every session's attention, so the bar for [AGENTS.md](AGENTS.md) is high: only rules whose moment cannot be trusted to a trigger.

Writing a comment has no moment. There is no command, no file, no phase of work that announces it — it happens inside every edit, a few tokens at a time, hundreds of times a session. A skill for it would be read after the comments were written, which is to say never.

## Where the call could have gone otherwise

**Not a ban on comments.** The rule narrows what a comment carries; it does not push toward fewer of them. "Self-documenting code needs no comments" settles in advance a question that belongs to the line at hand, and the intent that a name cannot carry is exactly what this rule protects.

**Named for the layer, not for the rule.** `comments` would name what is in it today. What belongs here is anything that governs how code gets written and has no moment to be triggered on — the module is `code` so the next such rule has a place to land.

This module declares no external requirements, and delivers no skills or agents: it is a few lines of prose that arrive as a managed block in `CLAUDE.md` / `AGENTS.md`.
