# dotagents

**Ein Paketmanager für die Regeln, denen deine KI-Agenten folgen.** Skills, Review-Agenten und Hooks — verpackt als Module, installiert in die Projekte, die du wählst.

[English](../README.md) | [日本語](README.ja.md) | [简体中文](README.zh-CN.md) | [繁體中文](README.zh-TW.md) | [한국어](README.ko.md) | Deutsch | [Español](README.es.md) | [Français](README.fr.md)

[![npm](https://img.shields.io/npm/v/%40hiroiku%2Fdotagents)](https://www.npmjs.com/package/@hiroiku/dotagents)
[![license: MIT](https://img.shields.io/badge/license-MIT-blue.svg)](../LICENSE)

- **Das Modul ist die Einheit.** Ein Verzeichnis deklariert, was es braucht, trägt, was es liefert, und erklärt, warum es existiert. Installiere es in ein Projekt oder auf eine ganze Maschine; entferne es genauso sauber wieder.
- **Agenten lesen das Ergebnis nativ.** Keine Runtime, kein Daemon, nichts in deine Shell verdrahtet — der Installer schreibt schlichte Dateien dorthin, wo jeder Agent ohnehin schaut, und geht dir dann aus dem Weg.
- **Ein Regelwerk, viele Agenten.** Dasselbe Modul erreicht Claude Code und Codex, jeden in der Form, die dieser Agent versteht.

## Installation

Ein Paket. Es bringt den Mechanismus und **legt einen kuratierten Satz Module als gewöhnliche Verzeichnisse, die dir gehören, in `~/.dotagents/modules/`** — lösche, was du nicht willst, ändere, was fast passt, und lege dein Eigenes daneben. Alles, was von mir kommt, nennt sich `from hiroiku`, damit immer klar ist, wessen Meinung du liest.

```sh
bun add -g @hiroiku/dotagents      # einmalig — oder: npm i -g @hiroiku/dotagents

dotagents list                     # was du installieren kannst
dotagents install review           # in das aktuelle Projekt
dotagents install review -g        # für jedes Projekt auf dieser Maschine
dotagents install review -C ~/x    # in ein bestimmtes Projekt
```

Nichts zu klonen, nichts zu holen, kein Zustand, der erst migriert werden müsste: Die Module reisen im Paket mit, also legt der erste Befehl sie ab und der nächste installiert sofort.

Das Ziel ist standardmäßig dieses Projekt — der kleinste Wirkungsradius — und der weitere Geltungsbereich verlangt immer ein Flag. Was hineinkommt, hat nie einen Standardwert: Benenne ein Modul oder wähle interaktiv. Eine nicht-interaktive Shell stoppt, statt für dich zu entscheiden.

Node oder Bun, je nachdem, was die Maschine hat — die CLI wählt selbst die Runtime, die dort vorhanden ist.

## Was ein Modul ist

Ein Verzeichnis mit einer `module.json`. Alles Weitere ist optional, und jede Art hat genau ein Ziel:

```
modules/<name>/
├── module.json    was es ist, was es auf PATH erwartet, was es beerbt
├── README.md      warum es existiert — für Menschen, wird nie bereitgestellt
├── AGENTS.md      Regeln, die in jede Sitzung injiziert werden
├── skills/        Regeln, die erst gelesen werden, wenn ihr Moment gekommen ist
├── agents/        Subagenten-Rollen mit eigenem Kontext und eigenen Werkzeugen
└── hooks/         Event-Handler, die laufen, während der Agent arbeitet
```

| Art | Claude Code | Codex |
|---|---|---|
| `skills/` · `agents/` · `hooks/` | `.claude/skills/dotagents/` — **ein einziges Plugin-Verzeichnis**, geladen ohne Marketplace und ohne Installationsschritt, das seinen Inhalt in den Namensraum `/dotagents:*` stellt. So kommen Hooks an, ohne dass je `settings.json` angerührt wird | nur Skills, als `.codex/skills/dotagents-*` — Codex kennt keine Plugins, daher faltet sich der Namensraum in den Verzeichnisnamen |
| `AGENTS.md` | ein verwalteter Block in `.claude/CLAUDE.md` | ein verwalteter Block in `AGENTS.md` |

Ein Modul darf deklarieren, was es auf `PATH` erwartet. Voraussetzungen werden **erkannt, nie installiert**: `list` und `install` melden, was fehlt, und blockieren nichts — das Werkzeug später hinzuzufügen, erfordert also keine Neuinstallation.

Es darf auch deklarieren, welchen ausgemusterten Namen es übernommen hat (`replaces`), sodass ein Eintrag, der den alten Namen erinnert, den Regeln dorthin folgt, wohin sie gegangen sind — umbenannt oder auf mehrere aufgeteilt. Der Installer hält keine eigene Tabelle: Wohin ein Name ging, sagt der Korpus, und wenn die Migration ihren Lauf genommen hat, wird die Zeile aus dem Modul gelöscht, nicht aus dem Installer.

[modules/](../modules/) ist die kanonische Definition dieses Satzes. Der Installer hält keine Liste: keine der Dateien und keine der Module; er liest, was in `~/.dotagents/modules/` liegt. Der Satz ist ebenso ein Ausgangspunkt wie eine Voreinstellung, nichts, das du als Ganzes übernehmen sollst: [review](../modules/review/README.md) übergibt die Verifikation an einen Kontext, der den Code nicht geschrieben hat, [code](../modules/code/README.md) wofür ein Kommentar da ist, [git](../modules/git/README.md) · [testing](../modules/testing/README.md) · [prompting](../modules/prompting/README.md) die Konventionen, die ein Modell nicht erraten kann — jede gelesen in dem Moment, in dem sie greift, [architecture](../modules/architecture/docs/README.de.md) eine Abhängigkeitsregel, die für manche Projekte richtig ist und für andere nicht, [github](../modules/github/README.md) die Zuordnung, welcher Mechanismus eines Issues welche Bedeutung trägt.

Die Module sind so geschnitten, dass eines davon für dich falsch sein kann, ohne den Rest mitzunehmen. Hier gibt es kein Bündel: installiere `git` und `testing` auf einer Maschine, auf der die Review-Rollen nicht passen, oder `review` allein in das eine Repository, das sie braucht.

Es gibt einen Ort, an dem ein Modul leben kann: `~/.dotagents/modules/`. Der Beispielsatz wird nicht aus dem Paket gelesen, sondern dorthin *gelegt* — so ist die Menge, die du installieren kannst, dieselbe wie die, die du bearbeiten kannst. Alles in derselben Form zählt: wie auch immer du es bekommen hast, lege das Verzeichnis dorthin, und es ist ein Modul.

Einmal gelegt, gehört ein Modul dir:

| | |
|---|---|
| du hast es nicht angerührt | wird aktualisiert, wenn das Paket eine neuere Version bringt |
| du hast es bearbeitet | bleibt erhalten und wird gemeldet (`--force` übernimmt die Beispielfassung) |
| du hast es gelöscht | wird nie wieder gelegt |

`list` sagt weiterhin, woher jedes stammt — `from hiroiku` für den Satz, den ich mitgebe, bei Änderungen zusätzlich `edited by you`, und nichts bei denen, die du selbst geschrieben hast.

## Wo es liegt

```
~/.dotagents/         alles, was dir gehört, an einem Ort
├── modules/          alle Module — auch der Beispielsatz liegt hier
└── state/            was wohin platziert wurde, und welche Beispiele du geändert hast
```

Der Installer selbst wohnt nicht hier; er wird dort ersetzt, wo er herkam. Die Module wohnen hier — auch die, die das Paket gelegt hat. Genau das ist der Punkt.

`DOTAGENTS_HOME` verschiebt das Ganze; nichts sonst muss davon erfahren. Ein Home, und jeder Pfad leitet sich daraus ab — `status` und `--help` geben das jeweils wirksame Home aus, damit eine Maschine nie verbirgt, woher ihre Regeln stammen.

## Befehle

```sh
dotagents update               # neu ausliefern, was verzeichnet ist — keine Argumente, es merkt sich deine Wahl
dotagents uninstall <module>   # ein Modul entfernen, den Rest behalten; ohne Namen wird alles entfernt
dotagents status               # jede ausgelieferte Datei prüfen — exit 1 bei Drift
dotagents --help               # jeder Befehl, jede Option, jedes Beispiel
```

`install` ist additiv und `uninstall` subtraktiv, daher wird die Menge, die eine Bereitstellung hält, Modul für Modul auf- und abgebaut. `update` arbeitet mit dem, woran sich das Manifest erinnert: Es liefert diese Menge neu aus und beschneidet jedes alte Layout, das es findet.

**Nur `uninstall` entfernt Regeln aus einer Bereitstellung.** Ein Modul aus `~/.dotagents/modules/` zu löschen ist ein kleiner, alltäglicher Schritt; jedes Projekt umzuschreiben, in das du es installiert hast, ist es nicht. Verliert ein ausgeliefertes Modul also seine Quelle, behält `update` die Dateien, behält den Eintrag, behält seine Zeilen in `CLAUDE.md` — und sagt, was es behalten hat und wie es zu entfernen ist. `status` meldet diesen Zustand als Abweichung, denn ohne Quelle gibt es nichts, woran sich die Dateien prüfen ließen.

**Nichts bewegt sich von selbst.** Ausgeliefert werden die Texte, die deine Agenten regieren, also geschieht die Auslieferung nie automatisch und nie stillschweigend: Jeder Befehl zeigt, was er platziert, behalten und entfernt hat.

## Ein einziger Aktualisierungsweg

Neue Regeln kommen, indem du das Paket aktualisierst, nicht indem du einen Befehl ausführst. Aktualisiere es so, wie du es installiert hast, und liefere dann neu aus:

```sh
bun add -g @hiroiku/dotagents   # oder: npm i -g @hiroiku/dotagents
dotagents update -g             # und: dotagents update -C <projekt>
```

| | Woher es kommt | Wie es sich bewegt |
|---|---|---|
| **Der Mechanismus** (`@hiroiku/dotagents`) | npm | wie jedes andere Werkzeug, das du installierst |
| **Der Beispielsatz** (`hiroiku`) | in demselben Paket | wird in `~/.dotagents/modules/` gelegt und dort erneuert, wo du ihn nicht angerührt hast |
| **Deine eigenen Module** | `~/.dotagents/modules/` | sie gehören dir; nichts anderes schreibt dorthin |

Ein Weg, nicht zwei. Zwei hieße, dass einer von beiden veraltet — und **der Code, der deine Einrichtung migriert, wäre in dem eingesperrt, was migriert wird**, wartend auf genau das Update, das er liefern soll. So kommen eine Korrektur und die Regeln, die sie korrigiert, gemeinsam an, in einer Version, die du benennen kannst.

## Was der Installer anrührt — und was nicht

Alles ist idempotent und **Hash-besessen**: Der Installer rührt nur an, was er selbst platziert hat und noch erkennt. Deine eigenen Skills werden nie berührt, Dateien, die du an Ort und Stelle bearbeitet hast, werden behalten und gemeldet (`--force` zum Überschreiben), und `uninstall` entfernt genau das, was die Aufzeichnung als platziert verzeichnet — nichts sonst. Diese Aufzeichnung lebt in `~/.dotagents/state/`, nie in einem Projekt.

Plugins im Projekt-Geltungsbereich werden nur geladen, wenn Claude Code in der Repository-Wurzel startet, und erst, nachdem du den Workspace-Trust-Dialog bestätigt hast. Änderungen an Agents und Hooks wirken ab der nächsten Sitzung oder nach `/reload-plugins`; Bearbeitungen an einer `SKILL.md` werden sofort übernommen.

## Layout

```
bin/agents-setup      die CLI (list / install / update / uninstall / status)
test/                 Vertragstests für den Installer (npm test · bun test)
modules/              der Beispielsatz, der mitreist — von hiroiku
├── review/           adversariale Review, OWASP, WCAG — in eigenem Kontext
├── code/             wofür ein Kommentar da ist
├── git/              Commit-Titel, Squash, Rebase
├── testing/          die zwölf Eigenschaften eines guten Tests
├── prompting/        was vor dem Bearbeiten eines Prompts zu lesen ist
├── architecture/     eine Abhängigkeitsregel, die der Build erzwingt
└── github/           was ein Issue tragen kann, und auf welcher Achse
```

Ein Paket, eine Version: Der Mechanismus und die Regeln, die er legt, sind immer das Paar, das gemeinsam geprüft wurde. `modules/` hier ist die Herkunft des Beispiels, nicht sein Wohnort — einmal gelegt, gehört die Kopie in `~/.dotagents/modules/` dir.
