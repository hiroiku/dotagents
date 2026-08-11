# github

[English](../README.md) | [日本語](README.ja.md) | [简体中文](README.zh-CN.md) | [繁體中文](README.zh-TW.md) | [한국어](README.ko.md) | Deutsch | [Español](README.es.md) | [Français](README.fr.md)

Ein Modul darüber, was ein GitHub-Issue tragen kann und welche Bedeutung von welchem Mechanismus getragen wird. Die Regeln selbst stehen in [skills/issues/SKILL.md](../skills/issues/SKILL.md).

## Alles wird zum Label

Labels sind der eine Mechanismus, den jedes Modell bereits kennt. Also saugen sie auf, was anderswohin gehört: die Art der Arbeit, das anvisierte Release, das Stück einer größeren Aufgabe, auf das sie sich bezieht, das, worauf sie wartet. Nichts schlägt fehl. Das Issue steht, es ist eingefärbt, es sieht geordnet aus.

Verloren geht die Abfrage. Steht das Release als Label, findet `is:open no:milestone` die Arbeit ohne Release nicht. Werden die Kinder nur im Fließtext erwähnt, lässt sich der Fortschritt des Elternteils nicht zählen. **Ein Tracker wird einmal geschrieben und hundertfach gelesen** — und jede Bedeutung auf der falschen Achse wird von jedem späteren Lesen abgezogen.

Deshalb ist dieser Skill keine Führung durch `gh issue`. Er handelt davon, was jede Funktion einkauft — welche spätere Frage sie beantwortbar macht. Einen anderen Grund, zu einer zu greifen, gibt es nicht.

## Beantwortbar, oder nicht

Die Linie, an der sich entscheidet, ob der Einsatz einer Funktion etwas wert war:

| | |
| --- | --- |
| Eine Checkbox ist kein Sub-Issue | Beide sehen gleich aus. Das eine ist ein Objekt mit eigenem Zustand, das ein Elternteil zählen kann; das andere ist Text. Der gesamte Ertrag der Zerlegung liegt auf einer Seite dieser Linie. |
| Blockierung ist nicht durchsuchbar | `is:blocked` sieht aus wie ein Filter und ist keiner — nichts legt die Beziehung einer Abfrage offen. Die Reihenfolge gehört weiterhin in den Tracker, aber nur dort, wo jemand daraus die Warteschlange berechnen wird. |
| Ein Milestone, der nicht schließen kann, beantwortet nichts | Burn-down und die Lesart „schaffen wir es?" entstehen aus einer Menge, die an einem Datum endet. `backlog` und `someday` liefern beides nicht und nehmen still allem, was sie enthalten, diese Lesart. |
| Ein Typ überspannt Repositories, ein Label nicht | Typen gehören der Organisation, also kann eine Frage alle Repositories auf einmal durchqueren. Zwei Labels namens `bug` garantieren einander gar nichts. |

## Wo die Entscheidung auch anders hätte fallen können

**Keine Konventionen für Label-Namen.** Ein Schema, das zum Arbeitsablauf eines Teams passt, ist für das nächste falsch, und eine Regel, der niemand folgt, kostet Aufmerksamkeit, ohne etwas dafür zu kaufen. Dieses Modul bindet, auf welche Achse eine Bedeutung gehört; welche Labels auf dieser Achse stehen, gehört dem Team.

**Keine Vorlage für den Issue-Text.** Was ein guter Bericht enthält, ist Urteilssache, und ein fähiges Modell hat sie bereits. Das Modul legt fest, wohin eine Bedeutung gehört, nie, wie sie zu formulieren ist.

**Benannt nach dem Host, nicht nach Issues.** Pull Requests, Releases und Actions laufen auf derselben Plattform und haben dieselbe Problemform. Das Modul heißt `github`, damit der nächste Skill einen Ort zum Landen hat.
