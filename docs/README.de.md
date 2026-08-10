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

Es gibt keinen separaten Einrichtungsschritt. Der erste Befehl klont den Corpus — das Git-Repository der Regeln, das dir gehört — nach `~/.dotagents/corpus` und macht dann weiter. Der Befehl, den du tippst, ist am ersten Tag derselbe wie an jedem weiteren.

Das Ziel ist standardmäßig dieses Projekt — der kleinste Wirkungsradius — und der weitere Geltungsbereich verlangt immer ein Flag. Was hineinkommt, hat nie einen Standardwert: Benenne ein Modul oder wähle interaktiv. Eine nicht-interaktive Shell stoppt, statt für dich zu entscheiden.

Node oder Bun, je nachdem, was die Maschine hat: `bunx` erreicht dasselbe Paket, und die CLI wählt selbst die Runtime, die dort vorhanden ist.

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

[modules/](../modules/) ist die kanonische Definition der Distribution — der Installer hält keine Liste der Dateien, also kann nichts still auseinanderdriften. Die beiden Module hier sind die, die dieser Korpus anbietet, kein Satz, den du als Ganzes übernehmen sollst: [harness](../modules/harness/docs/README.de.md) trägt Review-Agenten und die Konventionen, die ein Modell nicht erraten kann, [architecture](../modules/architecture/docs/README.de.md) eine Abhängigkeitsregel, die für manche Projekte richtig ist und für andere nicht.

Deine eigenen Module liegen in `~/.dotagents/modules/`. Sie werden von denselben Befehlen installiert und bleiben auf deiner Maschine — nie in einem Repository, nie in einem veröffentlichten Paket. `list` zeigt beide Quellen; ein doppelt vergebener Name ist ein Fehler statt einer stillen Überschreibung.

## Wo es liegt

```
~/.dotagents/         alles, was dieses Werkzeug aufbewahrt, an einem Ort
├── corpus/           deine Regeln, als Git-Repository, das du bearbeitest und verfolgst
├── modules/          deine eigenen Module
└── state/            die Aufzeichnung, was wohin platziert wurde
```

Hier wohnt kein Installer, nur Regeln. Der Installer kommt von npm und wird dort ersetzt.

`DOTAGENTS_HOME` verschiebt das Ganze; nichts sonst muss davon erfahren. Ein Home, und jeder Pfad leitet sich daraus ab — `status` und `--help` geben das jeweils wirksame Home aus, damit eine Maschine nie verbirgt, woher ihre Regeln stammen.

## Befehle

```sh
dotagents update               # dem Upstream folgen, dann neu ausliefern — keine Argumente, es merkt sich deine Wahl
dotagents uninstall <module>   # ein Modul entfernen, den Rest behalten; ohne Namen wird alles entfernt
dotagents status               # jede ausgelieferte Datei prüfen — exit 1 bei Drift
dotagents pull                 # nur dem Upstream folgen, ohne neu auszuliefern
dotagents --help               # jeder Befehl, jede Option, jedes Beispiel
```

`install` ist additiv und `uninstall` subtraktiv, daher wird die Menge, die eine Bereitstellung hält, Modul für Modul auf- und abgebaut. Der eine Befehl, der beide Hälften aktuell hält, ist `update`: Er folgt dem Upstream so, wie `pull` es tut, und liefert dann neu aus, woran sich das Manifest erinnert.

**Nichts bewegt sich von selbst.** Was ankommt, sind die Texte, die deine Agenten regieren, daher werden die eingehenden Commit-Titel gezeigt, bevor irgendetwas integriert wird. Gibt es etwas im Upstream, wirst du einmal am Tag darauf hingewiesen — nicht aktualisiert.

## Zwei Dinge, getrennt aktualisiert

Der Installer und deine Regeln sind nicht dieselbe Art von Sache, und sie reisen nicht zusammen.

| | Woher es kommt | Wie es sich bewegt |
|---|---|---|
| **Der Installer** | npm — `bun add -g` / `npm i -g` | wie jedes andere Werkzeug, das du installierst |
| **Deine Regeln** | git — `~/.dotagents/corpus` | `pull` / `update`, auf dein Wort hin |

Der Corpus enthält Regeln und sonst nichts. Genau diese Trennung lässt eine Korrektur bei dir ankommen: **Der Code, der deine Regeln migriert, steckt nie in dem, was migriert wird**. Wie alt dein Corpus auch ist — der Installer, der daran arbeitet, ist der aktuelle. Aktualisiere den Befehl, und die Korrektur ist da; du musst nichts vorher verfolgen.

## Was der Installer anrührt — und was nicht

Alles ist idempotent und **Hash-besessen**: Der Installer rührt nur an, was er selbst platziert hat und noch erkennt. Deine eigenen Skills werden nie berührt, Dateien, die du an Ort und Stelle bearbeitet hast, werden behalten und gemeldet (`--force` zum Überschreiben), und `uninstall` entfernt genau das, was die Aufzeichnung als platziert verzeichnet — nichts sonst. Diese Aufzeichnung lebt in `~/.dotagents/state/`, nie in einem Projekt.

Plugins im Projekt-Geltungsbereich werden nur geladen, wenn Claude Code in der Repository-Wurzel startet, und erst, nachdem du den Workspace-Trust-Dialog bestätigt hast. Änderungen an Agents und Hooks wirken ab der nächsten Sitzung oder nach `/reload-plugins`; Bearbeitungen an einer `SKILL.md` werden sofort übernommen.

## Layout

```
bin/agents-setup      die CLI (clone / pull / list / install / update / uninstall / status)
test/                 Vertragstests für den Installer (npm test · bun test)
modules/              die Module, die dieser Korpus anbietet
├── harness/          Review-Agenten, Konventionen für git · testing · prompting
└── architecture/     eine Abhängigkeitsregel, die der Build erzwingt
```

Dieses Repository ist der Upstream beider Hälften, aber sie werden getrennt ausgeliefert: npm trägt nur `bin/`, ein Klon bringt nur die Regeln.
