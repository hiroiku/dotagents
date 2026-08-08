# architecture

English | [日本語](docs/README.ja.md) | [简体中文](docs/README.zh-CN.md) | [繁體中文](docs/README.zh-TW.md) | [한국어](docs/README.ko.md) | [Deutsch](docs/README.de.md) | [Español](docs/README.es.md) | [Français](docs/README.fr.md)

A module that settles the direction of dependencies, where a file belongs, what things are called, and how failure travels — in a form a machine can check. The rules themselves are in [skills/design/SKILL.md](skills/design/SKILL.md).

## How do you trust what you cannot read?

The volume of change an AI produces has passed what a person can read. Review shrinks from every line to a sample, and often to a check that it still runs. Which means people stop confirming **HOW it was written and start trusting WHAT it does**.

Whether that trust is warranted is not decided by the reader's stamina. It is decided by whether **the HOW is held in place by a mechanism**. Whatever might be hiding in the part nobody read: if the shape makes it impossible to write, it is not there.

There is a tension here. Strict conventions used to be capped by how much a person could hold. You could not write more than could be remembered, compliance could be confirmed only by eye, and so the more rules there were, the less they held. Strictness is the ideal that costs too much — that was the exchange rate of the human era.

With an AI writing, the rate changes. The effort of typing boilerplate all but disappears. What is expensive for an AI is **guessing where something belongs**, and a structure that requires guessing raises the odds of it landing in the wrong place. Strictness got cheaper; ambiguity got dearer. The rate inverted.

Bind too much, though, and you kill the model's judgment. So these rules bind **structure** only, never **judgment**. The layers are fixed at six; the `<kind>` inside them is not. The boundaries are decided; what is solved within them, and how, is left to whoever writes it.

## Not "notice it" — "cannot write it"

Most of the rules are pushed out of the space where review has to **notice** them and into the space where they **cannot be written** in the first place.

| What is protected                    | What protects it                                       |
| ------------------------------------ | ------------------------------------------------------ |
| A dependency crossing layers         | the build configuration (an unseen layer fails to type) |
| Technical vocabulary reaching inward | there being no external package it could import         |
| An adapter that answers to no port   | the filename rule                                       |
| A missing registration in the wiring | types                                                   |
| A swallowed failure                  | the `Result` return type                                |
| A dependency routed around the graph | never handing over the container                        |

This is not a design whose violations are found in review; it is a design that **fails as it is written**. Once nobody reads all of it, that difference is the amount of confidence you have.

A single, predictable place for everything, with a name that states its role, serves the same end. It is human readability and, at the same time, a low search cost for an AI.

## What is borrowed, and what is not

| Rule                                                              | Origin                      |
| ----------------------------------------------------------------- | --------------------------- |
| Dependencies always point inward                                  | Clean Architecture          |
| Adapters split into driving and driven                            | Ports and Adapters          |
| The `<bounded_context>` axis; only business words inside          | DDD                         |
| One composition root                                              | DI's composition root       |
| Failure returned as a value, `throw` reserved for bugs            | functional error handling   |
| Per-layer build configuration that makes a violation a build error | this module                 |
| Tests as a mirror of the layers, the mirror bound by the same rule | this module                 |

**This is not an implementation of Clean Architecture.** The only invariant taken from it is the dependency rule; the diagram is not copied over. Output ports in particular — a presenter implementing a port owned by the application — are not used.

**Nor is it an implementation of DDD.** Two things are borrowed, bounded context and ubiquitous language; the aggregates and the rest of strategic design are not brought along.

**Layers here are inner and outer, not upper and lower.** Unlike the classic layered style that flows top to bottom, dependencies always point inward, and the outside is unknown to the inside.

## Where the call could have gone otherwise

The places in the rules that admitted another answer, and why this one was taken.

**`interface` does not see `domain`.** When a controller touches an entity, the shape of the domain leaks into the shape of the wiring: refactoring the domain starts breaking the contract with the outside world, and the very thing CA was built to prevent comes back. The price is that a use-case carries its own input and output types and a presenter has to convert — but that conversion is exactly what a boundary is for.

**`frameworks` does not see `application`.** With two entrances, the cross-cutting work placed in the controller — authentication, validation, error translation — is **silently skipped** on the other path. Nothing errors; it simply goes through. That is the most dangerous way for this to break, so there is one entrance.

**No output ports.** In the classic shape where a use-case drives a presenter, the return type is `void`, so **the compiler stays silent when a caller ignores the result**. Return a `Result` and nothing type-checks until both success and failure are handled. The stronger type won.

**`ports/` keeps its extra level.** Put ports at the same height as every other kind and the declaration of *what is needed from outside* becomes indistinguishable, by name, from the layer's own logic. One level of asymmetry is the price of keeping that distinction visible.

**An adapter is prefixed with its port's name.** `google-drive-storage.integration.ts` against `storage.integration.ts`. Which port an implementation satisfies is readable from the name, and an orphan with no matching port can be caught mechanically.

**The container never crosses a boundary.** If the inside can be handed a resolver, it can reach anything without importing it. **The import graph stops telling the truth about dependencies**, and both the build configuration and the linter are left powerless. Dependencies arrive as arguments.

**Composition sits at every level, with a single root.** Keeping the wiring next to the code means adding a use-case touches one file next door. A layer's composition sees only its own layer, so it never breaks the layer's rule. Only the root crosses layers, and that is where the exception ends.

## What it suits, and what it does not

It suits a long-lived codebase with several external services, worked on heavily by AI. For something disposable, or small with a single external dependency, it is not worth what it costs.
