# Der mitgelieferte Harness

[English](../README.md) | [日本語](README.ja.md) | [简体中文](README.zh-CN.md) | [繁體中文](README.zh-TW.md) | [한국어](README.ko.md) | Deutsch | [Español](README.es.md) | [Français](README.fr.md)

[README](../../../docs/README.de.md) beschreibt den Mechanismus — ein Korpus, geschnitten in Module, die `agents-setup` nach `~/.claude` und in das projekteigene `.claude/` installiert. Dieses Dokument beschreibt das Modul, das du dabei bekommst: einen vollständigen, funktionierenden Harness — mitgeliefert als das Beispiel, von dem du ausgehst und das du personalisierst.

## Geschrieben für Modelle, die urteilen

Der Harness ist für die aktuelle Generation von Modellen gebaut, die sich besser von Urteil leiten lässt als von Regeln. Jede Anweisung kostet doppelt: Sie besetzt die endliche Aufmerksamkeit der Sitzung, und sie bindet das Modell dort, wo sein eigenes Urteil besser sein könnte. Daher hält der Korpus nur fest, was ein fähiges Modell nicht ableiten kann:

- **Meinungen** — Konventionen, die keine noch so große Fähigkeit erraten kann: wie Commits betitelt werden, was nie in eine Commit-Message gehört
- **Anker** — der externe Kanon, den ein Stück Arbeit erfüllen muss: OWASP Top 10, WCAG 2.2 AA
- **Grenzen** — wer was tun darf: ein Reviewer, der nicht editieren kann

Alles andere — wie gesucht wird, wie tief gegangen wird, wie ein Befund aussieht — bleibt dem Modell überlassen. Wird ein Fehlermodus tatsächlich beobachtet, wird die kleinste Anweisung hinzugefügt, die ihn verhindert; nichts wird im Voraus hinzugefügt. Die Kalibrierungsleitfäden sind im [prompting](../skills/prompting/SKILL.md)-Skill benannt und werden gelesen, bevor irgendein Prompt in diesem Korpus bearbeitet wird.

## Drei Formen der Zustellung

- **Allgegenwärtig** ([AGENTS.md](../AGENTS.md)) — in jede Sitzung injiziert und damit eine Steuer auf die Aufmerksamkeit jeder Sitzung, daher stehen darin nur die wenigen Zeilen, deren Moment sich keinem Auslöser anvertrauen lässt: _delegiere die Verifikation an die anwendbaren Review-Agenten, bevor du Fertigstellung meldest_, und _Kommentare erklären die Absicht des Codes — keine Historie, keine ADRs, keine Vorkehrungen für die Zukunft._
- **Momentan** ([skills/](../skills/)) — nur gelesen, wenn ihr Moment eintritt: [git](../skills/git/SKILL.md) beim Committen, [testing](../skills/testing/SKILL.md) beim Schreiben von Tests, [prompting](../skills/prompting/SKILL.md) beim Bearbeiten von Prompts. Detail kostet hier keinen anderen Moment etwas.
- **Rollen** ([agents/](../agents/)) — Subagenten mit einem eigenen Kontext und einem beschränkten Werkzeugsatz. Was eine Rolle nicht tun darf, wird durch die Werkzeuge durchgesetzt, die sie nicht bekommt — nicht durch einen Satz, den sie sich merken muss.

Claude Code erhält alle drei als ein einziges Plugin, daher wird ein Skill als `/dotagents:git` aufgerufen und ein Agent als `dotagents:review`. Codex, das keine Plugins kennt, bekommt die Skills als `dotagents-git` und dergleichen.

## Review — ein sauberer Kontext, auf der Jagd nach dem, was fehlt

Der Fehlermodus, der für KI-Agenten eigentümlich ist, ist "erledigt!", wenn es nicht erledigt ist — nicht Lüge, sondern Auslassung: Ein Kontext, der nur enthält, was er geschrieben hat, kann nicht sehen, was er nicht geschrieben hat. Daher geht die Verifikation an Review-Agenten, deren Kontext sauber ist. Sie erhalten die Anforderungen, wie das Ziel zu finden ist und wie es auszuführen ist — nie den Selbstbericht des Implementierers.

[review](../agents/review.md) arbeitet in zwei Durchgängen, der Reihe nach:

1. **Existenz** — von jeder Anforderung ausgehen und die Implementierung finden, die sie erfüllt. Eine Auslassung ist in einem Diff unsichtbar, daher läuft der Scan von den Anforderungen zum Code, nicht vom Diff nach außen.
2. **Korrektheit** — prüfen, ob das Gefundene richtig gemacht ist.

Reviewer lesen und führen aus; sie editieren nicht. `Read, Glob, Grep, Bash` ist der gesamte Werkzeugsatz.

## Anforderungsanker, keine Checklisten

[security](../agents/security.md) verifiziert gegen die [OWASP Top 10](https://owasp.org/Top10/); [accessibility](../agents/accessibility.md) gegen [WCAG 2.2](https://www.w3.org/TR/WCAG22/), Konformitätsstufe AA. Jeder benennt seinen Kanon und hört dort auf: keine kopierte Checkliste (eine Kopie verrottet, während der Kanon sich bewegt), keine Hauskriterien obendrauf (eine Aufzählung bindet das Urteil an die Vorstellungskraft des Aufzählenden). Welche Kategorie zutrifft, und wie, wird am vorliegenden Code beurteilt.

## Git — die Konventionen, die ein Modell nicht erraten kann

[git](../skills/git/SKILL.md) hält die ganze Meinung in wenigen Zeilen: Commit-Titel sagen, was sich für das Geschäft geändert hat, nie einen Dateinamen oder einen internen Bezeichner; keine KI-Attribution in Commit-Messages oder PRs; Squash ist der Standard für die Integration; dem Upstream wird per Rebase gefolgt, nicht per Merge.

## Tests — die Desiderata, in Promptgröße

[testing](../skills/testing/SKILL.md) ist [Test Desiderata](https://testdesiderata.com/), als Prompt wiedergegeben: die zwölf Eigenschaften eines guten Tests — vor allem anderen empfindlich für Verhalten und unempfindlich für Struktur, sodass ein Test nur fehlschlägt, wenn ein versprochenes Verhalten bricht — mitsamt der Rahmung des Kanons selbst, dass die Eigenschaften gegeneinander abzuwägen sind und die Mischung bewusst gewählt wird. Wie jeder andere Anker in diesem Modul benennt es den Kanon und hört dort auf.

Dieses Modul deklariert keine externen Voraussetzungen: Es besteht nur aus Prompts und Rollendefinitionen und funktioniert überall dort, wo Claude Code oder Codex läuft.
