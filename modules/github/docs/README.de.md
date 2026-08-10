# github

[English](../README.md) | [日本語](README.ja.md) | [简体中文](README.zh-CN.md) | [繁體中文](README.zh-TW.md) | [한국어](README.ko.md) | Deutsch | [Español](README.es.md) | [Français](README.fr.md)

Ein Modul darüber, was ein GitHub-Issue tragen kann und welche Bedeutung von welchem Mechanismus getragen wird. Die Regeln selbst stehen in [skills/issues/SKILL.md](../skills/issues/SKILL.md).

## Alles wird zum Label

Labels sind der eine Mechanismus, den jedes Modell bereits kennt. Also saugen sie auf, was anderswohin gehört: die Art der Arbeit, das anvisierte Release, das Stück einer größeren Aufgabe, auf das sie sich bezieht, das, worauf sie wartet. Nichts schlägt fehl. Das Issue steht, es ist eingefärbt, es sieht geordnet aus.

Verloren geht die Abfrage. Steht das Release als Label, findet `is:open no:milestone` die Arbeit ohne Release nicht. Werden die Kinder nur im Fließtext erwähnt, lässt sich der Fortschritt des Elternteils nicht zählen. **Ein Tracker wird einmal geschrieben und hundertfach gelesen** — und jede Bedeutung auf der falschen Achse wird von jedem späteren Lesen abgezogen.

Deshalb ist dieser Skill keine Führung durch `gh issue`. Er ist die Karte von der Bedeutung zur Achse, und er ist kurz, denn der Rest steht in `--help`.

## Was das Modell nicht herleiten kann

`gh issue create --help` kann ein Agent jederzeit lesen. Was dort nicht steht:

| | |
| --- | --- |
| Beziehungen sind jetzt nativ | `--parent`, `--add-sub-issue`, `--add-blocked-by` kamen erst kürzlich zu `gh`. Ein Modell, das ein älteres `gh` gelernt hat, greift zu einer Community-Erweiterung oder handgeschriebenem GraphQL — und bekommt eine schlechtere Fassung von etwas, das längst eingebaut ist. |
| Das Loch heißt Milestone | Jede andere Achse ist ein Flag; nur der Milestone selbst ist REST. Wer die Lücke genau kennt, vermeidet beide Hälften des Fehlers — einen API-Aufruf für die Zuordnung zu erfinden und nach einem `gh milestone` zu suchen, das es nicht gibt. |
| Typen sind keine Labels | Issue-Typen werden für die Organisation definiert und von jedem Repository geteilt. Sie sind neu, leicht zu übersehen, und der Grund, warum ein Label namens `bug` meist nicht existieren sollte. |
| Sub-Issues sind keine Checkboxen | Eine Aufgabenliste im Text sieht genauso aus und trägt keinen Zustand. Nichts kann sie abfragen, und kein Elternteil lässt sich daraus zählen. |

## Wo die Entscheidung auch anders hätte fallen können

**Keine Konventionen für Label-Namen.** Ein Schema, das zum Arbeitsablauf eines Teams passt, ist für das nächste falsch, und eine Regel, der niemand folgt, kostet Aufmerksamkeit, ohne etwas dafür zu kaufen. Dieses Modul bindet, auf welche Achse eine Bedeutung gehört; welche Labels auf dieser Achse stehen, gehört dem Team.

**Keine Vorlage für den Issue-Text.** Was ein guter Bericht enthält, ist Urteilssache, und ein fähiges Modell hat sie bereits. Die eine mechanische Tatsache, die es zu nennen lohnt — den Text über stdin übergeben, weil die Quotierung der Shell Markdown zerlegt —, wird genannt, der Rest bleibt unangetastet.

**Benannt nach dem Host, nicht nach Issues.** Pull Requests, Releases und Actions laufen auf derselben Plattform und haben dieselbe Problemform. Das Modul heißt `github`, damit der nächste Skill einen Ort zum Landen hat.
