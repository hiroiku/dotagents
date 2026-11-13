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
2. **Correctness** — examine whether what was found behaves as required, whether the change broke what used to work or must hold (authorization, data integrity), and whether a test for the requirement exists and fails when the change is reverted.

Reviewers read and run; they do not edit. `Read, Glob, Grep, Bash, Skill` is the whole toolset — what a role must not do is enforced by the tools it is not given, not by a sentence it must remember. `Skill` is there because a subagent with an explicit tool list sees no skills without it: the reviewer reaches the project's skills — how to narrow a run, the design rules it verifies against — the same way the implementer did.

## Where the review runs

The review runs in the implementer's worktree, against the commit the implementer reported. No worktree or branch is created for it. Independence comes from a context that did not write the code, not from a separate checkout — and a separate checkout is not free: every one pays the project's setup (checkout hooks, dependency installs, local databases), once per review and again per re-review round.

What a fresh checkout did buy was a tree holding only what was committed, so a file the implementer forgot to add fails the review instead of passing on the implementer's disk. The reviewer keeps that by checking, before anything else, that HEAD is the requested commit and that nothing is uncommitted or untracked; if the tree differs, it returns the difference instead of a verdict.

Falsifying sometimes means changing the code for a moment: breaking the implementation to see a test fail, or putting back the old code to compare. In a shared tree that is safe only when the reviewer is alone in it — a parallel reviewer would run its own checks against the broken state — so the delegating session grants it in the request only when a single reviewer is running, the reviewer restores the tree, and the delegating session checks HEAD and the uncommitted state when the review returns. Under Codex the reviewers run in a `read-only` sandbox, so this falsification is not available there.

## What a finding is

What gets fixed is decided by what a finding shows, not by the severity word on it. A finding is one of three things: a requirement not met, something this change broke, or a requirement with no test that fails when the change is reverted. Each carries the condition under which it happens and a reproduction — a failing test, a command's output, or a concrete input traced through file:line. A bug that predates the change becomes an issue candidate; a requirement that reads two ways becomes a question for whoever delegated. Style, defensive additions, unmeasured performance worries, and what tools already decide are not raised at all — not as findings, and not as a side note next to them. Security and accessibility apply the same cut to their canon: an attack or failure that holds in this change, a failure of AA in the UI this change touches, even when the same failure exists elsewhere in the product.

The numbers behind the cut come from kuden-drive's reviews between 10/28 and 11/7 that ran two rounds or more: 89 pieces of work, 213 rounds, 1,333 findings. A quarter were none of the three; another 15% were pre-existing bugs or readings of the requirements, and 116 of those were fixed anyway. The severity words did not track substance: 216 findings that showed an unmet requirement — 149 with a reproduction — were marked low or a suggestion. A rule that fixed only what reviewers called blocking would have let those through.

After the cut shipped (7.9.0), the first 85 review rounds in kuden-drive carried 2.4 findings each instead of 6.3, and 26 of the 27 marked blocking came with a reproduction. Readings of the requirements and pre-existing bugs went out as questions and issue candidates, as intended. What did not change was the noise: a third of the output was still style and unproven worries, written as a separate "not a finding" list. Only 5 of 65 were fixed, so they no longer drove the loop, but they still cost the reviewer's output and the delegating session's reading — hence "not even as a side note". One accessibility review also left a contrast failure in a newly built input as a product-wide issue because the rest of the product had it too, which is the case the last clause now names.

Forbidding the side note (7.10.0) barely moved it. In kuden-drive, over the 316 classified rounds on either side of that change, notes that were none of the three went from 0.40 a round to 0.32, and did not fall at all in accessibility reviews; lists of what was checked and found fine, or not run, grew from 1.8 a round to 2.7, so reports stayed as long as before. Naming what not to write leaves the writer to decide which kind a thought is, and a reviewer that noticed something finds a kind that is allowed. So the report now has a closed set of sections — a verdict per requirement, findings, issue candidates, questions for whoever delegated, and what could not be verified — and what has no section is not written. "Checked, no problem" is a verdict row, not a list of its own, and a re-review reports only on the previous findings and on what the fix introduced.

The closed sections held (7.11.0). In the two projects with enough reviews to count, 97% of 73 first reviews and 92% of 14 carried all five sections, where none had before, and the free headings — side notes, file lists, clean-up logs — were gone. The reports were as long as before, because the last section filled up instead: it was never empty in 92 first reviews, and in the busier project it carried 2.4 entries a review, up from 1.2. About four in ten of that project's entries said that the screen had not been opened or that production data had not been checked; accessibility reviews, before the sections were fixed, had kept saying the same of a real screen reader. A review never does those things, so the entry changes no verdict and gives the delegating session nothing to act on. The last section is therefore tied to the verdict rows: it holds what the reviewer could not judge, with the reason, and a disclaimer that changes no verdict has no section.

## Ending the loop

A fix goes back to the agent that implemented, and starts with the reproduction written as a failing test. It returns for re-review only after that test and the requirement tests pass. In the same data, 45% of the findings in second and later rounds were introduced by the previous fix, and most of those were another requirement not met — the kind a requirement test stops before a reviewer sees it.

The re-review goes back to the reviewer that raised the findings, continued rather than started fresh, given the fix commit and asked only whether its findings are resolved and whether the fix breaks anything. A fresh reviewer knows nothing of the last round: it reads everything again and finds something new, and the loop never converges. Narrowing to the fix loses little: of 218 blocking findings in later rounds, 10 were something an earlier round had missed.

When a re-review shows that the fix introduced a new defect, or that the same finding survived the fix, the loop stops patching. The implementer reconsiders how that part is built, and whoever delegated — the user, when the delegating session is the one talking to them — confirms any change to the requirements or the design. Half of the fix-introduced findings came from 8 of the 48 pieces of work that had any: concurrency, ordering, clocks, migrations, where every fix added a mechanism and every mechanism a new hole. There is no round limit. A count says nothing about why a loop goes on; this condition does.

That loop is inside one piece of work. The same kind of finding also recurs across pieces of work: in one project, 9 of the 10 pieces of work the accessibility reviewer saw lost focus after an operation, failed to announce a result, or had a name without its visible text; in a series that wrote E2E scenarios, 24 of the 26 first reviews raised findings, most of them a check that could not fail or an expected result left unchecked. Fixing each where it is found leaves the next piece of work to be caught by the same review at the same cost. When the delegating session sees a kind of finding repeat, it proposes fixing the cause once — a shared part, a project rule, a requirement written into the request — to whoever delegated.

## Requirement anchors, not checklists

[security](agents/security.md) verifies against the [OWASP Top 10](https://owasp.org/Top10/); [accessibility](agents/accessibility.md) against [WCAG 2.2](https://www.w3.org/TR/WCAG22/) conformance level AA. Each names its canon and stops there: no copied checklist (a copy rots as the canon moves), no house criteria on top (an enumeration binds judgment to the enumerator's imagination). Which category applies, and how, is judged against the code at hand.

## Accessibility: tests first, the browser for what only rendering shows

Two projects were built under an earlier rule that accessibility is never tested, and neither had a single test asserting where focus goes or what is announced. There the accessibility reviewer was the only place those behaviors were verified. It spent about four-fifths of its time running the app and writing and running browser scripts from scratch, raised findings in 17 of 20 first reviews, was the last reviewer to return in 31 of 40 parallel rounds, and took 16–17% of all subagent time. In kuden-drive, which has nearly a hundred test files asserting focus and status messages, the same reviewer reads and runs those tests and takes 1.5%. Of the 40 findings in one of the two projects, 26 were focus lost after an operation, a result or error that was not announced, or an accessible name without its visible text — all of which the DOM shows.

So the [testing](../testing/README.md) module now treats those three as behavior, tested in component tests, and the reviewer starts from the tests. What a test asserts is not verified again in a browser; the browser is for operations and states no test covers, and for what only rendering shows (contrast, layout at each width). A finding carries a reproduction the implementer can rerun — the steps and the expected result for a behavior the DOM shows, the script and how to run it for a browser check. A fix that cannot be checked before re-review comes back: 7 of those 40 findings were a fix that introduced a new failure or left the old one in place. Findings that only rendering shows are not turned into tests; the implementer confirms the fix with the reviewer's reproduction instead.

## Where the call could have gone otherwise

**The three roles ship together.** Security and accessibility could each be a module, installed only where they apply. But the rule says _applicable_, and which role applies is decided per piece of work, not per project — a role that was never installed is not judged inapplicable, it is simply invisible. Delivering the set keeps the judgment where the work is.

**The reviewer cannot fix.** One that could would return the fix instead of the finding, and the finding is the only thing the delegating session cannot produce for itself. Removing `Edit` costs a round trip and keeps the two contexts from collapsing into one.

**Sections are fixed; wording is not.** A finding must carry its condition and its reproduction, the requirement pass gives every requirement a verdict, so an omission shows as a missing row rather than a silence, and the report has a closed set of sections. An earlier version left the shape of the report to judgment and listed what not to write; reviewers kept writing it under another heading. Within a section, how to word a finding is still judgment, and a capable model has it.

This module declares no external requirements: it is prompts and role definitions only, and works wherever Claude Code or Codex runs.
