# code

A module for the conventions that govern the writing of code and have no moment to be triggered on. There are two today, and they are in [AGENTS.md](AGENTS.md): _a change to a feature or an item touches one place, its source, and everything else derives from it; and a comment carries the intent of the code it sits on and what matters there._

## One place to change

Add a feature, and a list somewhere has to learn about it: a registry of handlers, a table in the docs, an allowlist in a config, a page of terms that names every model it covers. Each of those lists is a second record of something already recorded, kept in step by hand. Every addition asks for the same edit in both, and the one edit that is missed fails nothing. The two simply disagree, and go on running.

So the rule asks for the shape in which a change happens once. The source sits in one place, and whatever uses it derives from it — through types, declarations, or a registration mechanism — instead of restating it. Where a place kept by hand cannot be avoided, a missed edit has to fail the type check, the linter or the build, and so does code that goes around the mechanism. Nobody reading, and no review, notices it every time.

It covers code, settings and documents alike. The project it was written down for had been saying it about all three: a shared mechanism that was not to need a new setting for every screen it was reused on, a page of terms that should not have to name each new model. Its maintainer made the same correction three times in one morning before putting it into the project's instructions, and dotagents' own gate carried the names of type checkers until 7.12.0. A rule that every project needs belongs here, not in each project's `AGENTS.md`.

## What a comment is for

The code already says what it does. The one thing it cannot say is why it is this way — which alternative was rejected, which constraint forced the shape, what will break if the order changes. That is the whole job of a comment, and a comment that restates the code instead starts lying the moment the code moves and it does not.

Four things are kept out, and they fail the same way: each is a second record of something that is already recorded better somewhere else.

**History** — `// changed from X in #1234`. Git holds it, holds it with the author and the date, and keeps holding it after the line is moved to another file. In the source it is a copy that nothing updates.

**Decision records** — the reasoning behind a design, pasted where one of its consequences happens to live. The reader who needs that reasoning is not in this file, and everyone who is pays for it on every pass.

**Provisions for the future** — `// TODO: when we support multi-tenancy`. A promise nobody is holding. It reads as a plan long after the plan was dropped, and the code around it gets shaped by a case that never arrives.

**Lists of what the code already names** — the keys under a `secrets` block, the flags a date turns on, the paths a script reads. This is the rule above, met in a comment: every item added or dropped asks for the same edit in the comment, and the one that is missed leaves the two disagreeing.

What replaces the list is what its items have in common: the criterion for being here, the thing that must hold. `Secrets, or keys that differ per environment.` stays true as keys come and go. A line for each key does not, and the next key arrives with no line at all.

## Why it is ubiquitous, and not a skill

Everything injected into every session taxes every session's attention, so the bar for [AGENTS.md](AGENTS.md) is high: only rules whose moment cannot be trusted to a trigger.

Neither of these has a moment. A list does not announce itself; it is added in the middle of an edit, as the obvious way to make a new thing known. Writing a comment happens inside every edit, a few tokens at a time, hundreds of times a session. There is no command, no file, no phase of work to hang a skill on, and a skill would be read after the list or the comment was already written.

## Where the call could have gone otherwise

**Not a ban on lists.** The source may well be a list — a union of states, a table of routes. What the rule removes is the second copy kept in step by hand. It carries its reason instead of a prohibition: a rule stated without exception gets applied to the cases where it is wrong, and the reason is what lets the model tell those cases apart.

**No examples in the rule.** Examples narrow where a model looks. The rule names the shape — an item that has to be added in more than one place — and leaves out the places it has turned up so far.

**One topic with the comment rule.** A list in a comment fails the same way as a list in code, so the comment rule takes its reason from the rule above instead of restating it.

**Not given to the reviewer.** The rule asks the build to catch the drift, and the reviewer reports only what fails a requirement or breaks with a reproduction ([review](../review/README.md)). A list kept by hand that no check covers will pass review; the answer is the check, not a reviewer told to look for it.

**Not a ban on comments.** The comment rule narrows what a comment carries; it does not push toward fewer of them. "Self-documenting code needs no comments" settles in advance a question that belongs to the line at hand, and the intent that a name cannot carry is exactly what this rule protects.

**Named for the layer, not for the rule.** `comments` would have named what was in it first. What belongs here is anything that governs how code gets written and has no moment to be triggered on — the module is `code` so the next such rule has a place to land, as the first one about lists did.

This module declares no external requirements, and delivers no skills or agents: it is a few lines of prose that arrive as a file of rules: `.claude/rules/dotagents/code.md` for Claude Code, `.codex/dotagents/code/AGENTS.md` for Codex.
