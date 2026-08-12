# prompting

A module read before a prompt or an agent definition is edited — including every prompt in this corpus. The list is in [skills/prompting/SKILL.md](skills/prompting/SKILL.md).

## Written for models that judge

The rules here are built for the current generation of models, which follow judgment better than they follow instructions. Every instruction is a cost twice over: it occupies the session's finite attention, and it binds the model where its own judgment may have been better. So what gets written down is only what a capable model cannot derive:

- **Opinions** — conventions no amount of capability can guess: how commits are titled, what never goes in a commit message
- **Anchors** — the external canon a piece of work must satisfy: OWASP Top 10, WCAG 2.2 AA, Test Desiderata
- **Boundaries** — who may do what: a reviewer that cannot edit

Everything else — how to search, how deep to go, what a finding looks like — is left to the model. When a failure mode is actually observed, the smallest instruction that prevents it is added; nothing is added in advance, because an instruction written against an imagined failure is paid for by every session and prevents nothing.

## A reading list, not a house style

The skill holds three links and one instruction: read them before touching a prompt.

Guidance on prompting is the fastest-moving thing in this corpus — it turns over with each model generation, and the advice that was load-bearing two generations ago is now the thing to unlearn. A summary written here would be a copy that rots, and worse than the rot is the confidence: a stale rule reads exactly like a current one.

So the module points at the source, and each entry carries the date it was published. A reader can see how old the advice is before deciding how much of it still holds.

## Where the call could have gone otherwise

**Three links, and the effort of keeping them current.** The alternative is no such skill at all, leaving each session to whatever it happens to remember. That is the same bet as a stale summary, made silently.

**Named for the act, not for the artifact.** `prompts` would suggest a place where prompts are stored. This module is about the act of editing one, at the moment it is being edited.

This module declares no external requirements: it is a prompt, and works wherever Claude Code or Codex runs.
