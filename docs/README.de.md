# dotagents

**Ein Paketmanager für die Regeln, denen deine KI-Agenten folgen.** Skills, Review-Agenten und Hooks — verpackt als Module, installiert in die Projekte, die du wählst.

[English](../README.md) | [日本語](README.ja.md) | [简体中文](README.zh-CN.md) | [繁體中文](README.zh-TW.md) | [한국어](README.ko.md) | Deutsch | [Español](README.es.md) | [Français](README.fr.md)

[![npm](https://img.shields.io/npm/v/%40hiroiku%2Fdotagents)](https://www.npmjs.com/package/@hiroiku/dotagents)
[![license: MIT](https://img.shields.io/badge/license-MIT-blue.svg)](../LICENSE)

- **Das Modul ist die Einheit.** Ein Verzeichnis deklariert, was es braucht, trägt, was es liefert, und erklärt, warum es existiert. Installiere es in ein Projekt oder auf eine ganze Maschine; entferne es genauso sauber wieder.
- **Agenten lesen das Ergebnis nativ.** Keine Runtime, kein Daemon, nichts in deine Shell verdrahtet — der Installer schreibt schlichte Dateien dorthin, wo jeder Agent ohnehin schaut, und geht dir dann aus dem Weg.
- **Ein Regelwerk, viele Agenten.** Dasselbe Modul erreicht Claude Code und Codex, jeden in der Form, die dieser Agent versteht.

## Ein Modul installieren

```sh
bun add -g @hiroiku/dotagents      # einmalig — oder: npm i -g @hiroiku/dotagents

dotagents list                     # was du installieren kannst
dotagents install harness          # in das aktuelle Projekt
dotagents install harness -g       # für jedes Projekt auf dieser Maschine
dotagents install harness -C ~/x   # in ein bestimmtes Projekt
```

Es gibt keinen Einrichtungsschritt. Die Module stecken im Paket selbst, daher installiert der erste Befehl sofort — nichts zu klonen, nichts zu holen, und kein Zustand, der erst migriert werden müsste, bevor du arbeiten kannst. `bunx @hiroiku/dotagents install harness` tut dasselbe, ohne global etwas zu installieren.

Das Ziel ist standardmäßig dieses Projekt — der kleinste Wirkungsradius — und der weitere Geltungsbereich verlangt immer ein Flag. Was hineinkommt, hat nie einen Standardwert: Benenne ein Modul oder wähle interaktiv. Eine nicht-interaktive Shell stoppt, statt für dich zu entscheiden.

Node oder Bun, je nachdem, was die Maschine hat — die CLI wählt selbst die Runtime, die dort vorhanden ist.

## Was ein Modul ist

Ein Verzeichnis mit einer `module.json`. Alles Weitere ist optional, und jede Art hat genau ein Ziel:

```
modules/<name>/
├── module.json    was es ist und was es auf PATH erwartet
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

[modules/](../modules/) ist die kanonische Definition der Distribution — der Installer hält keine Liste der Dateien, also kann nichts still auseinanderdriften. Die beiden mitgelieferten Module sind ebenso Beispiele wie Voreinstellungen, kein Satz, den du als Ganzes übernehmen sollst: [harness](../modules/harness/docs/README.de.md) trägt Review-Agenten und die Konventionen, die ein Modell nicht erraten kann, [architecture](../modules/architecture/docs/README.de.md) eine Abhängigkeitsregel, die für manche Projekte richtig ist und für andere nicht.

Deine eigenen Module liegen in derselben Form in `~/.dotagents/modules/`. Sie werden von denselben Befehlen installiert und bleiben auf deiner Maschine — nie in einem Repository, nie in einem veröffentlichten Paket. `list` zeigt beide Quellen; ein doppelt vergebener Name ist ein Fehler statt einer stillen Überschreibung.

## Wo es liegt

```
~/.dotagents/         alles, was dir gehört, an einem Ort
├── modules/          deine eigenen Module
└── state/            die Aufzeichnung, was wohin platziert wurde
```

Nichts, was von npm kam, wohnt hier — weder der Installer noch ein mitgeliefertes Modul. Beide werden dort ersetzt, wo sie herkamen.

`DOTAGENTS_HOME` verschiebt das Ganze; nichts sonst muss davon erfahren. Ein Home, und jeder Pfad leitet sich daraus ab — `status` und `--help` geben das jeweils wirksame Home aus, damit eine Maschine nie verbirgt, woher ihre Regeln stammen.

## Befehle

```sh
dotagents update               # neu ausliefern, was verzeichnet ist — keine Argumente, es merkt sich deine Wahl
dotagents uninstall <module>   # ein Modul entfernen, den Rest behalten; ohne Namen wird alles entfernt
dotagents status               # jede ausgelieferte Datei prüfen — exit 1 bei Drift
dotagents --help               # jeder Befehl, jede Option, jedes Beispiel
```

`install` ist additiv und `uninstall` subtraktiv, daher wird die Menge, die eine Bereitstellung hält, Modul für Modul auf- und abgebaut. `update` arbeitet mit dem, woran sich das Manifest erinnert: Es liefert diese Menge neu aus, entfernt, was verzeichnet, aber nicht mehr ausgeliefert ist, und beschneidet jedes alte Layout, das es findet.

**Nichts bewegt sich von selbst.** Ausgeliefert werden die Texte, die deine Agenten regieren, also geschieht die Auslieferung nie automatisch und nie stillschweigend: Jeder Befehl zeigt, was er platziert, behalten und entfernt hat.

## Ein einziger Aktualisierungsweg

Neue Regeln kommen, indem du das Paket aktualisierst, nicht indem du einen Befehl ausführst. Aktualisiere es so, wie du es installiert hast, und liefere dann neu aus:

```sh
bun add -g @hiroiku/dotagents   # oder: npm i -g @hiroiku/dotagents
dotagents update -g             # und: dotagents update -C <projekt>
```

| | Woher es kommt | Wie es sich bewegt |
|---|---|---|
| **Der Installer und die mitgelieferten Module** | npm | wie jedes andere Werkzeug, das du installierst |
| **Deine eigenen Module** | `~/.dotagents/modules/` | sie gehören dir; nichts anderes schreibt dorthin |

Ein Weg, nicht zwei. Zwei hieße, dass einer von beiden veraltet — und **der Code, der deine Einrichtung migriert, wäre in dem eingesperrt, was migriert wird**, wartend auf genau das Update, das er liefern soll. So kommen eine Korrektur und die Regeln, die sie korrigiert, gemeinsam an, in einer Version, die du benennen kannst.

## Was der Installer anrührt — und was nicht

Alles ist idempotent und **Hash-besessen**: Der Installer rührt nur an, was er selbst platziert hat und noch erkennt. Deine eigenen Skills werden nie berührt, Dateien, die du an Ort und Stelle bearbeitet hast, werden behalten und gemeldet (`--force` zum Überschreiben), und `uninstall` entfernt genau das, was die Aufzeichnung als platziert verzeichnet — nichts sonst. Diese Aufzeichnung lebt in `~/.dotagents/state/`, nie in einem Projekt.

Plugins im Projekt-Geltungsbereich werden nur geladen, wenn Claude Code in der Repository-Wurzel startet, und erst, nachdem du den Workspace-Trust-Dialog bestätigt hast. Änderungen an Agents und Hooks wirken ab der nächsten Sitzung oder nach `/reload-plugins`; Bearbeitungen an einer `SKILL.md` werden sofort übernommen.

## Layout

```
bin/agents-setup      die CLI (list / install / update / uninstall / status)
test/                 Vertragstests für den Installer (npm test · bun test)
modules/              die Module, die mit dem Paket ausgeliefert werden
├── harness/          Review-Agenten, Konventionen für git · testing · prompting
└── architecture/     eine Abhängigkeitsregel, die der Build erzwingt
```

Dieses Repository ist der Upstream von beidem, und npm trägt beides: `bin/` und `modules/` werden gemeinsam veröffentlicht, als eine Version.
