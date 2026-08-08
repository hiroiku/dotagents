# architecture

[English](../README.md) | [日本語](README.ja.md) | [简体中文](README.zh-CN.md) | [繁體中文](README.zh-TW.md) | [한국어](README.ko.md) | Deutsch | [Español](README.es.md) | [Français](README.fr.md)

Ein Modul, das die Richtung der Abhängigkeiten festlegt, den Ort einer Datei, ihre Benennung und den Weg des Scheiterns — in einer Form, die eine Maschine prüfen kann. Die Regeln selbst stehen in [skills/design/SKILL.md](../skills/design/SKILL.md).

## Wie vertraut man dem, was man nicht lesen kann?

Die Menge an Änderungen, die eine KI hervorbringt, hat das überschritten, was ein Mensch lesen kann. Das Review schrumpft von jeder Zeile auf eine Stichprobe und oft auf die Prüfung, ob es noch läuft. Das heißt: Menschen prüfen nicht mehr das **WIE es geschrieben wurde, sondern vertrauen dem WAS dabei herauskam**.

Ob dieses Vertrauen gerechtfertigt ist, entscheidet nicht die Ausdauer des Lesenden, sondern ob **das WIE von einem Mechanismus gehalten wird**. Was auch immer in dem Teil stecken mag, den niemand gelesen hat: Wenn die Form es unschreibbar macht, ist es nicht da.

Hier liegt ein Widerspruch. Die Obergrenze strenger Konventionen war bislang, wie viel ein Mensch behalten kann. Mehr als Erinnerbares ließ sich nicht aufschreiben, Einhaltung ließ sich nur mit dem Auge prüfen — und so galten Regeln umso weniger, je mehr es davon gab. Strenge ist das Ideal, das zu teuer ist: So stand der Kurs im Zeitalter des Menschen.

Schreibt eine KI, ändert sich dieser Kurs. Der Aufwand, Boilerplate zu tippen, verschwindet nahezu. Teuer ist für eine KI hingegen, **den richtigen Ort zu erraten**, und eine Struktur, die Raten verlangt, erhöht unmittelbar die Wahrscheinlichkeit, dass etwas falsch abgelegt wird. Strenge wurde billiger, Mehrdeutigkeit teurer. Der Kurs hat sich umgekehrt.

Bindet man jedoch zu viel, tötet man das Urteilsvermögen des Modells. Deshalb binden diese Regeln nur die **Struktur**, niemals das **Urteil**. Die Schichten sind auf sechs festgelegt; die `<kind>` darin nicht. Die Grenzen stehen fest; was innerhalb gelöst wird und wie, bleibt dem überlassen, der schreibt.

## Nicht „bemerken" — sondern „nicht schreiben können"

Die meisten Regeln sind aus dem Bereich, in dem ein Review sie **bemerken** muss, in den Bereich verschoben, in dem sie sich von vornherein **nicht schreiben lassen**.

| Was geschützt wird                       | Was es schützt                                          |
| ---------------------------------------- | ------------------------------------------------------- |
| Eine Abhängigkeit über Schichten hinweg  | die Build-Konfiguration (eine unsichtbare Schicht löst nicht auf) |
| Technisches Vokabular im Inneren         | dass es kein externes Paket zum Importieren gibt        |
| Ein Adapter ohne zugehörigen Port        | die Regel für Dateinamen                                |
| Eine fehlende Registrierung in der Komposition | Typen                                             |
| Ein verschlucktes Scheitern              | der Rückgabetyp `Result`                                |
| Eine Abhängigkeit am Graphen vorbei      | den Container nicht herauszugeben                       |

Das ist kein Entwurf, dessen Verstöße im Review gefunden werden, sondern einer, der **im Moment des Schreibens fehlschlägt**. Wenn niemand mehr alles liest, ist genau dieser Unterschied das Maß an Sicherheit.

Dass jede Sache genau einen Ort hat und der Name die Rolle nennt, dient demselben Zweck: Es ist Lesbarkeit für Menschen und zugleich niedrige Suchkosten für eine KI.

## Was übernommen ist — und was nicht

| Festlegung                                                          | Herkunft                    |
| ------------------------------------------------------------------- | --------------------------- |
| Abhängigkeiten zeigen immer nach innen                              | Clean Architecture          |
| Adapter teilen sich in driving und driven                           | Ports und Adapter           |
| Die Achse `<bounded_context>`, innen nur die Sprache des Geschäfts  | DDD                         |
| Nur eine Wurzel der Komposition                                     | Composition Root der DI     |
| Scheitern als Wert zurückgeben, `throw` nur für Bugs                | funktionale Fehlerbehandlung |
| Build-Konfiguration je Schicht, die Verstöße zu Compilerfehlern macht | eigen für dieses Modul    |
| Tests als Spiegelbild der Schichten, auch der Spiegel regelgebunden  | eigen für dieses Modul     |

**Dies ist keine Umsetzung der Clean Architecture.** Als Invariante übernommen ist allein die Abhängigkeitsregel; das Diagramm ist nicht abgezeichnet. Insbesondere Ausgabe-Ports — ein Presenter, der einen Port der Anwendung implementiert — werden nicht verwendet.

**Es ist auch keine Umsetzung von DDD.** Geliehen sind nur zwei Dinge, Bounded Context und Ubiquitous Language; Aggregate und das übrige strategische Design sind nicht mitgenommen.

**Schichten sind hier innen und außen, nicht oben und unten.** Anders als im klassischen Schichtenmodell, das von oben nach unten fließt, zeigen Abhängigkeiten stets nach innen, und das Äußere bleibt dem Inneren unbekannt.

## Wo die Entscheidung auch anders hätte fallen können

Die Stellen der Regeln, die eine andere Antwort zugelassen hätten, und warum diese gewählt wurde.

**`interface` sieht `domain` nicht.** Berührt ein Controller eine Entität, sickert die Form der Domäne in die Form der Verdrahtung. Ein Refactoring der Domäne beginnt, den Vertrag nach außen zu brechen — genau das kehrt zurück, was die CA verhindern wollte. Der Preis ist, dass ein Use-Case eigene Ein- und Ausgabetypen trägt und ein Presenter die Umwandlung schreibt; doch diese Umwandlung ist gerade die Übersetzung an der Grenze.

**`frameworks` sieht `application` nicht.** Bei zwei Eingängen fällt die querschnittliche Arbeit im Controller — Authentifizierung, Validierung, Fehlerübersetzung — auf dem anderen Weg **stillschweigend aus**. Nichts schlägt fehl, es geht einfach durch. Das ist die gefährlichste Art zu brechen, also bleibt es bei einem Eingang.

**Keine Ausgabe-Ports.** In der klassischen Form, in der ein Use-Case einen Presenter treibt, ist der Rückgabewert `void` — **der Compiler schweigt, wenn der Aufrufer das Ergebnis ignoriert**. Wird ein `Result` zurückgegeben, typisiert nichts, solange nicht Erfolg und Fehlschlag behandelt sind. Die Stärke der Typen hat gewonnen.

**`ports/` behält seine zusätzliche Ebene.** Stünden Ports auf gleicher Höhe wie jede andere Art, wäre die Deklaration dessen, *was von außen gebraucht wird*, dem Namen nach nicht mehr von der eigenen Logik zu unterscheiden. Eine Ebene Asymmetrie ist der Preis dafür, diesen Unterschied sichtbar zu halten.

**Ein Adapter trägt den Namen seines Ports voran.** `google-drive-storage.integration.ts` zu `storage.integration.ts`. Welchen Port eine Implementierung erfüllt, ist am Namen ablesbar, und ein Waisenkind ohne passenden Port lässt sich maschinell aussortieren.

**Der Container überschreitet keine Grenze.** Kann das Innere einen Resolver entgegennehmen, erreicht es alles, ohne es zu importieren. **Der Import-Graph sagt dann nicht mehr die Wahrheit über Abhängigkeiten**, und Build-Konfiguration wie Linter sind machtlos. Abhängigkeiten kommen als Argumente.

**Komposition liegt auf jeder Ebene, die Wurzel bleibt einzig.** Steht die Verdrahtung neben dem Code, betrifft ein neuer Use-Case genau eine Datei nebenan. Die Komposition einer Schicht sieht nur die eigene Schicht und bricht deren Regel nicht. Nur die Wurzel überquert Schichten, und dort endet die Ausnahme.

## Wofür es taugt — und wofür nicht

Es taugt für eine langlebige Codebasis mit mehreren externen Diensten, an der eine KI viel arbeitet. Für Wegwerfbares oder für Kleines mit einer einzigen externen Abhängigkeit lohnt der Aufwand nicht.
