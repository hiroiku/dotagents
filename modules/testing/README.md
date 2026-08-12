# testing

A module that gives the vocabulary for choosing a test's shape deliberately, instead of arriving at one by habit. The rules are in [skills/testing/SKILL.md](skills/testing/SKILL.md).

## A canon, named

[Test Desiderata](https://testdesiderata.com/) rendered as a prompt: the twelve properties of a good test — isolated, composable, deterministic, fast, writable, readable, behavioral, structure-insensitive, automated, specific, predictive, inspiring.

Two of them carry the rest. **Behavioral**: the result changes when the behaviour changes. **Structure-insensitive**: it does not change when only the shape of the code does. Together they say a test fails when a promised behaviour breaks, and at no other time — which is the whole reason a suite is worth keeping once an AI is doing the refactoring, because a test that breaks on a rename is a test that will be deleted.

The list arrives with the canon's own framing: the properties trade off against each other, and the mix is chosen deliberately. Like every other anchor in this corpus, the module names its source and stops there.

## Properties, not rules

A rule — test every branch, never mock, one assertion per test — settles the trade-off in advance, for every test, before anyone knows which properties are in tension in this particular case. It is followed where it does not apply and quietly abandoned where it does.

Properties leave the call where the information is. "This one is slower because it is more predictive, and that is the trade I want here" is a sentence a model can produce, defend, and be argued out of. "It has 80% coverage" is not.

## Where the call could have gone otherwise

**No coverage target.** A number that can be reached without testing any behaviour, and the fastest route to it is the structure-sensitive test this module is trying to prevent.

**Nothing about frameworks or layout.** Which runner, where the files go, what a fixture looks like — that belongs to the project and is discoverable from it in seconds. A convention written here would be wrong for the next repository and read in both.

**No pyramid, no ratio.** The shape of a suite follows from where the risk is, and the twelve properties are the language for arguing about that. A fixed ratio is the same trade-off settled by someone who never saw the code.

This module declares no external requirements: it is a prompt, and works wherever Claude Code or Codex runs.
