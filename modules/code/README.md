# code

A module for the conventions that govern the writing of code and have no moment to be triggered on. Today they are all about comments, and they are in [AGENTS.md](AGENTS.md): _a comment carries the intent of the code it sits on and what matters there. No history, no ADRs, no provisions for the future, and no lists of what the code already names._

## What a comment is for

The code already says what it does. The one thing it cannot say is why it is this way — which alternative was rejected, which constraint forced the shape, what will break if the order changes. That is the whole job of a comment, and a comment that restates the code instead starts lying the moment the code moves and it does not.

Four things are kept out, and they fail the same way: each is a second record of something that is already recorded better somewhere else.

**History** — `// changed from X in #1234`. Git holds it, holds it with the author and the date, and keeps holding it after the line is moved to another file. In the source it is a copy that nothing updates.

**Decision records** — the reasoning behind a design, pasted where one of its consequences happens to live. The reader who needs that reasoning is not in this file, and everyone who is pays for it on every pass.

**Provisions for the future** — `// TODO: when we support multi-tenancy`. A promise nobody is holding. It reads as a plan long after the plan was dropped, and the code around it gets shaped by a case that never arrives.

**Lists of what the code already names** — the keys under a `secrets` block, the flags a date turns on, the paths a script reads. Every item added or dropped asks for the same edit in the comment, and the one edit that is missed leaves the two disagreeing. The longer the list, the more ways it has to go stale.

What replaces the list is what its items have in common: the criterion for being here, the thing that must hold. `Secrets, or keys that differ per environment.` stays true as keys come and go. A line for each key does not, and the next key arrives with no line at all.

## Why it is ubiquitous, and not a skill

Everything injected into every session taxes every session's attention, so the bar for [AGENTS.md](AGENTS.md) is high: only rules whose moment cannot be trusted to a trigger.

Writing a comment has no moment. There is no command, no file, no phase of work that announces it — it happens inside every edit, a few tokens at a time, hundreds of times a session. A skill for it would be read after the comments were written, which is to say never.

## Where the call could have gone otherwise

**Not a ban on comments.** The rule narrows what a comment carries; it does not push toward fewer of them. "Self-documenting code needs no comments" settles in advance a question that belongs to the line at hand, and the intent that a name cannot carry is exactly what this rule protects.

**Named for the layer, not for the rule.** `comments` would name what is in it today. What belongs here is anything that governs how code gets written and has no moment to be triggered on — the module is `code` so the next such rule has a place to land.

This module declares no external requirements, and delivers no skills or agents: it is a few lines of prose that arrive as a file of rules: `.claude/rules/dotagents/code.md` for Claude Code, `.codex/dotagents/code/AGENTS.md` for Codex.
