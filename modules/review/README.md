# review

A module that hands verification to a context that did not write the code. The roles are in [agents/](agents/); the one line that reaches for them is in [AGENTS.md](AGENTS.md).

## "Done!" when it is not done

The failure mode peculiar to AI agents is not lying but omission: a context that holds only what it wrote cannot see what it did not write. Asking that same context to check its work confirms what is there and stays blind to what is missing — the most expensive kind of confirmation, because it feels like verification and buys none.

So verification goes to agents whose context is clean. They receive the requirements, how to locate the target, and how to run it — never the implementer's own report, which is the very thing under suspicion.

That is what the module's ubiquitous rule buys: _when implementation or a fix is done, delegate verification to the applicable review agents before reporting completion._ It is injected into every session rather than left to a trigger, because the moment it applies — the end of the work, when the session is convinced it is finished — is exactly the moment nothing will go looking for a rule.

The same rule asks the delegation to name how to run the target narrowly: the tests and operations that would falsify a requirement. Reviewers run within that scope and reach for a full-suite run only when a finding needs it. Re-running every check the implementer already ran on the same code falsifies nothing and costs minutes per review.

## Two passes, in order

[review](agents/review.md) is falsification:

1. **Existence** — start from each requirement and find the implementation that satisfies it. An omission is invisible in a diff, so the scan runs from the requirements toward the code, not from the diff outward.
2. **Correctness** — examine whether what was found is done right.

Reviewers read and run; they do not edit. `Read, Glob, Grep, Bash, Skill` is the whole toolset — what a role must not do is enforced by the tools it is not given, not by a sentence it must remember. `Skill` is there because a subagent with an explicit tool list sees no skills without it: the reviewer reaches the project's skills — how to narrow a run, the design rules it verifies against — the same way the implementer did.

## Where the review runs

The review runs in the implementer's worktree, against the commit the implementer reported. No worktree or branch is created for it. Independence comes from a context that did not write the code, not from a separate checkout — and a separate checkout is not free: every one pays the project's setup (checkout hooks, dependency installs, local databases), once per review and again per re-review round.

What a fresh checkout did buy was a tree holding only what was committed, so a file the implementer forgot to add fails the review instead of passing on the implementer's disk. The reviewer keeps that by checking, before anything else, that HEAD is the requested commit and that nothing is uncommitted or untracked; if the tree differs, it returns the difference instead of a verdict.

Falsifying sometimes means changing the code for a moment: breaking the implementation to see a test fail, or putting back the old code to compare. In a shared tree that is safe only when the reviewer is alone in it — a parallel reviewer would run its own checks against the broken state — so the delegating session grants it in the request only when a single reviewer is running, the reviewer restores the tree, and the delegating session checks HEAD and the uncommitted state when the review returns. Under Codex the reviewers run in a `read-only` sandbox, so this falsification is not available there.

## Ending the loop

Each finding is marked as blocking — a requirement not met, a defect, a failure of the canon — or as a suggestion. Only blocking findings send the work back; suggestions are carried in the report for whoever delegated to decide.

A fix goes back to the agent that implemented, and the re-review goes back to the reviewer that raised the findings, continued rather than started fresh, given the fix commit and asked only whether its findings are resolved and whether the fix breaks anything. A fresh reviewer knows nothing of the last round: it reads everything again and finds something new, and the loop never converges.

After two re-reviews with blocking findings still open, the work stops and goes back to whoever delegated — to the user, when the delegating session is the one talking to them — with the open findings and the point of disagreement. Findings that survive repeated fixes are more often a disagreement about the requirements or the design than a defect another fix will remove.

## Requirement anchors, not checklists

[security](agents/security.md) verifies against the [OWASP Top 10](https://owasp.org/Top10/); [accessibility](agents/accessibility.md) against [WCAG 2.2](https://www.w3.org/TR/WCAG22/) conformance level AA. Each names its canon and stops there: no copied checklist (a copy rots as the canon moves), no house criteria on top (an enumeration binds judgment to the enumerator's imagination). Which category applies, and how, is judged against the code at hand.

## Where the call could have gone otherwise

**The three roles ship together.** Security and accessibility could each be a module, installed only where they apply. But the rule says _applicable_, and which role applies is decided per piece of work, not per project — a role that was never installed is not judged inapplicable, it is simply invisible. Delivering the set keeps the judgment where the work is.

**The reviewer cannot fix.** One that could would return the fix instead of the finding, and the finding is the only thing the delegating session cannot produce for itself. Removing `Edit` costs a round trip and keeps the two contexts from collapsing into one.

**No format for a finding.** What a report should contain is judgment, and a capable model has it. The module settles who reviews, against what, and in which order — never how to word the result.

This module declares no external requirements: it is prompts and role definitions only, and works wherever Claude Code or Codex runs.
