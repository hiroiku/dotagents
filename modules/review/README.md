# review

A module that hands verification to a context that did not write the code. The roles are in [agents/](agents/); the one line that reaches for them is in [AGENTS.md](AGENTS.md).

## "Done!" when it is not done

The failure mode peculiar to AI agents is not lying but omission: a context that holds only what it wrote cannot see what it did not write. Asking that same context to check its work confirms what is there and stays blind to what is missing — the most expensive kind of confirmation, because it feels like verification and buys none.

So verification goes to agents whose context is clean. They receive the requirements, how to locate the target, and how to run it — never the implementer's own report, which is the very thing under suspicion.

That is what the module's single ubiquitous line buys: _when implementation or a fix is done, delegate verification to the applicable review agents before reporting completion._ It is injected into every session rather than left to a trigger, because the moment it applies — the end of the work, when the session is convinced it is finished — is exactly the moment nothing will go looking for a rule.

## Two passes, in order

[review](agents/review.md) is falsification:

1. **Existence** — start from each requirement and find the implementation that satisfies it. An omission is invisible in a diff, so the scan runs from the requirements toward the code, not from the diff outward.
2. **Correctness** — examine whether what was found is done right.

Reviewers read and run; they do not edit. `Read, Glob, Grep, Bash` is the whole toolset — what a role must not do is enforced by the tools it is not given, not by a sentence it must remember.

## Requirement anchors, not checklists

[security](agents/security.md) verifies against the [OWASP Top 10](https://owasp.org/Top10/); [accessibility](agents/accessibility.md) against [WCAG 2.2](https://www.w3.org/TR/WCAG22/) conformance level AA. Each names its canon and stops there: no copied checklist (a copy rots as the canon moves), no house criteria on top (an enumeration binds judgment to the enumerator's imagination). Which category applies, and how, is judged against the code at hand.

## Where the call could have gone otherwise

**The three roles ship together.** Security and accessibility could each be a module, installed only where they apply. But the rule says _applicable_, and which role applies is decided per piece of work, not per project — a role that was never installed is not judged inapplicable, it is simply invisible. Delivering the set keeps the judgment where the work is.

**The reviewer cannot fix.** One that could would return the fix instead of the finding, and the finding is the only thing the delegating session cannot produce for itself. Removing `Edit` costs a round trip and keeps the two contexts from collapsing into one.

**No format for a finding.** What a report should contain is judgment, and a capable model has it. The module settles who reviews, against what, and in which order — never how to word the result.

This module declares no external requirements: it is prompts and role definitions only, and works wherever Claude Code or Codex runs.
