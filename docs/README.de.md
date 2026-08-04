# dotagents

Der kanonische Korpus eines KI-Agenten-Harness (gemeinsam genutzt von Claude Code
und Codex): Prompts, Skills und Durchsetzung, hier versioniert und in jeder
Umgebung mit [bin/agents-setup](../bin/agents-setup) bereitgestellt.

[English](../README.md) | [日本語](README.ja.md) | [简体中文](README.zh-CN.md) | [繁體中文](README.zh-TW.md) | [한국어](README.ko.md) | Deutsch | [Español](README.es.md) | [Français](README.fr.md)

## Schnellstart

Voraussetzungen: git, Node.js ≥ 18, und die Organe, auf denen der Harness aufbaut —
**[bd (beads)](https://github.com/gastownhall/beads) ist erforderlich** (das
Issue-Journal, auf dem Anlegen, Beanspruchen, Abschlusssperren und
Merge-Ausschluss laufen), **[codegraph](https://github.com/colbymchenry/codegraph)
wird empfohlen** (Strukturabfragen; einbinden mit `codegraph install`, pro
Projekt indizieren mit `codegraph init`). Der Harness installiert sie nie für
dich — der Installer und jeder Sitzungsstart erkennen und melden, was fehlt.

```sh
# Holen (einmalig): der Korpus landet als Git-Repository, das dir gehört und das du bearbeitest
npx @hiroiku/dotagents clone ~/dotagents

# Bereitstellen: ein Ziel explizit wählen, oder weglassen, um interaktiv zu wählen
~/dotagents/bin/agents-setup install project /path/to/project   # ein Projekt (<dir>/.agents)
~/dotagents/bin/agents-setup install user                       # Benutzerebene (~/.agents)
~/dotagents/bin/agents-setup install shell                      # nur Guards (hooks/bin + eine ~/.zshenv-Zeile)

# Upstream folgen (wiederholbar): zeigt eingehende Commit-Titel, rebased, führt die Tests aus
~/dotagents/bin/agents-setup pull

# Warten
~/dotagents/bin/agents-setup update  project   # Korpus-Änderungen anwenden, entfernen, was payload/ fallen gelassen hat
~/dotagents/bin/agents-setup status  project   # Manifest, Payload, Dateien, Links, Fragmente prüfen
~/dotagents/bin/agents-setup --help            # Befehle, Ziele, Optionen, Beispiele
```

Die Verben kommen in drei Schichten: **clone (holen, einmalig) / pull (folgen,
wiederholt) / install · update (bereitstellen)**. Dies ist keine Bibliothek,
die du konsumierst, sondern ein Regelwerk, das du bedienst und bearbeitest,
sodass der Korpus stets dein eigenes editierbares Git-Repository ist. Es gibt
keinen Pfad, der still aus einem npx-Cache oder einem entpackten Tarball
bereitstellt — außerhalb eines Korpus delegieren die Deploy-Befehle entweder an
den Korpus, den deine Maschine bereits kennt, oder stoppen mit Anweisungen zu
`clone`.

Deploy-Resync wird nie gepusht: Wenn der Korpus vorausläuft, meldet das
Instrument bei jedem Sitzungseintritt (agents-doctor) "Bereitstellung älter als
der Korpus", und du führst `update` in diesem Projekt aus.

Das Folgen ist absichtlich nicht automatisiert. Was du pullst, sind die
Regeltexte, die das Verhalten deiner Agenten bestimmen, daher zeigt `pull`
immer zuerst den eingehenden Diff (Commit-Titel sind in Fachsprache
geschrieben — sie lesen sich wie ein Changelog), integriert per Rebase und
führt dann die eigenen Tests des Korpus aus. Deine persönlichen Änderungen
leben als Commits und reiten auf dem Upstream.

**Das Ziel ist ein einziges Positionsargument** (`user` / `project [dir]` /
`shell`) und wird nie mit einem Standardwert belegt: nenne es, oder wähle
interaktiv. Wird es in einem nicht-interaktiven Kontext (CI, Pipes)
weggelassen, stoppt der Vorgang, ohne etwas zu schreiben — kein Pfad, auf dem
ein vergessenes Argument still einen anderen Ort verändert. Und weil es nur
eine Position gibt, kann "Benutzer und Projekt gleichzeitig" gar nicht erst
getippt werden: Exklusivität wird durch Syntax garantiert, nicht durch
Laufzeitvalidierung.

Die interaktive Eingabeaufforderung ist eine Pfeiltasten-Auswahl (`↑/↓`
bewegen, `enter` bestätigen, `ctrl-c` abbrechen), die sich zu einer einzigen
Zeile zusammenfaltet, die zeigt, was du gewählt hast. Die Ausgabe ist farbig
und verliert die Farbe automatisch unter `NO_COLOR` oder ohne TTY.

## Was der Installer tut (alles idempotent)

- Kopiert `payload/` → `.agents/` (Inhalts-Hashes im Manifest `.dotagents.json`
  festgehalten)
- Symlinks: `.claude/CLAUDE.md → .agents/AGENTS.md`; Skills
  (`.claude/skills/<name>`) und Agentendefinitionen (`.claude/agents/<name>.md`)
  werden **immer einzeln verlinkt**, damit sie mit Einträgen koexistieren, die
  du selbst geschrieben hast (keine Verzeichnis-Links). Codex erhält dieselbe
  Form unter `.codex/`, wenn dieses Verzeichnis existiert
- Fügt eine bewachte, verwaltete Zeile zu `~/.zshenv` hinzu (nur auf
  Benutzerebene; ein No-op, wenn die Datei, die sie einbindet, fehlt)
- `settings.json`-Fragmente: `env.BASH_ENV`, `hooks.SessionStart`,
  `permissions.ask` (nur Push — Merge wird durch den `AGENTS_MERGE_SLOT_OK`-
  Guard abgedeckt). Codex erhält dasselbe SessionStart-Fragment in
  `.codex/hooks.json`, wenn `.codex/` existiert
- Maschinenspezifische Produkte (das Manifest, die Metrikdatei) werden durch
  eine `.agents/.gitignore`, die mit der Payload ausgeliefert wird, aus der
  Versionskontrolle herausgehalten. Alles, was dotagents erzeugt, bleibt in
  seinem eigenen Territorium (`.agents/`) — bd schreibt nur nach `.beads/`,
  codegraph nur nach `.codegraph/`

Eigentumsprinzip: Der Installer rührt nur an, was er selbst platziert hat und
noch besitzt (Hash-Abgleich). Deine eigenen Skills werden nie berührt, Dateien,
die du an Ort und Stelle bearbeitet hast, werden behalten und gemeldet
(`--force` zum Überschreiben), und nur die Settings-Fragmente, die er
hinzugefügt hat, werden je entfernt.

### Die Shell-Schicht — eine gemeinsame Ressource, die einmal existiert

Guards (git-guard, der bd-Wrapper) erreichen Sitzungen nur über
`hooks/shellenv.sh`, und zsh hat keine projektspezifische Startdatei — daher
existiert diese Schicht **einmal pro Maschine**, unabhängig davon, wie viele
Projekte den Harness nutzen. Der Installer pflegt sie von beiden Seiten,
sodass Reihenfolge nie zu operativem Wissen wird: `install project` fügt den
minimalen Shell-Scope hinzu, wenn er fehlt; `uninstall user` fragt nach, bevor
es wegnimmt, was andere Projekte teilen (`--keep-shell` behält ihn
nicht-interaktiv); `uninstall project` rührt ihn nie an.

### Späte Übernahme und Team-Rollout

- **Reihenfolge-unabhängig**: bd oder codegraph später hinzuzufügen erfordert
  keine Neuinstallation — Organe, Journale und Indizes werden dynamisch bei
  jedem Sitzungsstart erkannt. Eine bestehende Root-AGENTS.md, die von
  `bd init` erstellt wurde, wird nicht übernommen; nur ein verwalteter
  Referenzblock wird hinzugefügt
- **Zwei Zustellungsschichten**: Die Prompt-Schicht (`.agents/`-Payload,
  Links, Referenzblock) reitet auf der Versionskontrolle und **funktioniert
  allein aus dem Klon**; die Injektions- und Durchsetzungsschicht (Manifest,
  Settings-Fragmente, zshenv-Zeile, Shell-Guards) ist maschinenspezifisch und
  **wird vom Installer auf jeder Maschine gelegt**
- **Ab der zweiten Person**: das Projekt klonen, dotagents klonen, ausführen
  `bin/agents-setup install project <project>` — ein Befehl; die Shell-Schicht
  wird dabei mit vervollständigt, falls sie fehlt. Der Installer ist
  idempotent und Hash-geprüft, sodass er nie gegen das ankämpft, was die
  Versionskontrolle geliefert hat

## Konzept

Was dieser Harness baut, ist nicht "ein fähiger Agent", sondern **eine
Organisation, die endliche Aufmerksamkeit (Kontext) über Rollen aufteilt und
sie durch externe Aufzeichnungen verbindet**. Jede Regel unten leitet sich aus
einer einzigen Prämisse ab: Kontext ist endlich und stirbt mit der Sitzung.

### Drei Schichten von Regeln — allgegenwärtig, momentan, durchgesetzt

Vor ihrem Inhalt wird die Natur einer Regel dadurch bestimmt, **wie sie
zugestellt wird**.

- **Allgegenwärtige Regeln** (Kern = AGENTS.md) — immer injiziert. Sie
  besteuern die Aufmerksamkeit jeder Sitzung und gelten nur als
  **Bestmögliches**, daher darf diese Schicht nur die wenigen Regeln tragen,
  deren Beobachtungsmoment nicht benannt werden kann
- **Momentane Regeln** (Skills) — just-in-time injiziert. Sie treten nur in
  den Kontext ein, wenn ihr Moment eintritt, sodass Detail hier keinen anderen
  Moment etwas kostet
- **Durchgesetzte Regeln** (hooks / bin / permissions) — nie injiziert. Ein
  Mechanismus entscheidet, sodass sie keine Aufmerksamkeit verbrauchen und
  nicht gebrochen werden können (oder eine Spur hinterlassen, wenn sie es
  doch werden)

**Das Gesetz des Abstiegs**: Schiebe jede Regel so weit nach unten, wie sie
gehen wird. Untere Schichten sind zugleich stärker *und* billiger — ein
Einbahn-Gefälle, auf dem die Stärke steigt, während die Aufmerksamkeitskosten
verschwinden. Ein Prompt ist bloß das Wartezimmer für Regeln, die noch nicht
in Mechanismus verwandelt wurden.

### Trennung — Grenzen, die keine Duplizierung zulassen

Subagenten werden nicht nach Fähigkeit geschnitten, sondern nach **Grenzen, an
denen Duplizierung nicht auftreten kann**: Einheiten, deren Eingaben (Kontext),
Suchbereiche und Schreibziele (Worktrees) sich nicht überschneiden. Gib zwei
Kontexten dieselbe Information, und du zahlst die Aufmerksamkeit zweimal; lass
zwei an derselben Stelle schreiben, und du hast einen Merge-Punkt geschaffen.
Die Merge-Punkte, die Struktur nicht entfernen kann (der Integrations-Branch
und das Journal), sind die einzigen, die durch Ausschluss geschützt werden.

Trennung ist auch Verbergen. Die Umstände der Implementierung nicht zu kennen,
ist es, was dem Review seine Erkennungskraft gibt — **"nicht weitergeben" ist
eine Design-Entscheidung, so stark wie "weitergeben"**.

### Organe — Deklaration versus Ableitung

Jedes Werkzeug dient als Organ, das eine Art von Frage beantwortet, und keine
native Fähigkeit eines Organs wird anderswo neu implementiert. Die Achse ist
**Deklaration versus Ableitung**:

- **Aufzeichnungen der Deklaration** (was entschieden wurde, kann nicht
  abgeleitet werden, also wird es aufgezeichnet): bd = das Journal von Absicht
  und Zustand (was wir zu tun beschlossen haben, wer was hält, warum etwas
  gestoppt ist); ADRs = die Spur der Entscheidungen; das Glossar = die
  allgegenwärtige Sprache
- **Ableitung** (was eine Maschine aus dem Artefakt ableiten kann, wird nie
  von Hand geschrieben): codegraph = die aktuelle Struktur des Codes
  (Symbole, Aufrufpfade, Wirkungsradius); git = die Geschichte der Änderung

In dem Moment, in dem du etwas Ableitbares von Hand schreibst, beginnt Drift.
Das Gedächtnis sitzt auf derselben Achse: Zustand wird abgeleitet (die
Query-Injektion von bd prime); nur Invarianten werden deklariert (bd
remember). Was Kontext über Sitzungen hinweg trägt, ist kein Transkript,
sondern eine externe Aufzeichnung mit einer Adresse (**die Kontextbrücke**).

codegraph ist das alltägliche Explorations-Organ, und seine allgegenwärtige
Regel ("erst mit explore ableiten") wird **durch die Werkzeugbeschreibung
(MCP-Server-Anweisungen) zugestellt** — nie in Prompts kopiert, wo sie zu
einer veralteten Kopie würde. Werkzeugwahl kann nicht maschinell geprüft
werden, daher kann sie auch nicht an die Durchsetzung fallen: die
Werkzeugschicht mit Injektionskosten null ist die niedrigste Schicht, in der
diese Regel leben kann. Die Harness-Prompts benennen nur die Momente, in denen
das Werkzeug *nicht* zu benutzen einen Vertrag bricht (der Abgleich mit der
Grundwahrheit vor dem Einfrieren, das Ableiten des horizontalen Durchlaufs,
der Scan des Reviewers). Einbindung (`codegraph install`) und der Index
(`codegraph init`) sind codegraphs eigene Verantwortung — der Harness prüft
sie weder noch implementiert er sie neu; SessionStart erkennt lediglich
`.codegraph/` und injiziert eine Zeile Erinnerung.

### Kontradiktorisches Review — Auslassungen existieren nicht, bis man sie sucht

Der Fehlermodus, der für KI-Agenten eigentümlich ist, ist "erledigt!", wenn es
nicht erledigt ist, und seine Substanz ist nicht Lüge, sondern **Auslassung**
— jemand, dessen Kontext nur enthält, was er geschrieben hat, kann nicht
sehen, was er nicht geschrieben hat.

Review ist daher keine Inspektion (das Betrachten dessen, was existiert, und
das Urteilen darüber), sondern **Existenzbeweis**: ausgehend von den
Anforderungen muss der Reviewer die Implementierung und Verifikation finden,
die jede einzelne im Artefakt erfüllt — ein Scan in umgekehrter Richtung. Dem
Reviewer wird der Diff nicht zuerst gezeigt, weil Aufmerksamkeit, die durch
das Verifizieren des Geschriebenen gebunden ist, aufhört, nach dem zu suchen,
was nicht geschrieben wurde.

### Sinken — Schleifen enden, weil Wissen absteigt

Review, allein wiederholt, divergiert (Befunde quellen ohne Ende hervor). Die
Schleife konvergiert, weil jede Runde Wissen eine Schicht **sinken** lässt:
einzelne Befunde → artikulierte Fehlerklassen (gebrochene Verträge) →
Durchsetzung (eine Struktur, ein Typ, ein einziger Guard). Eine Hypothese, die
gesunken ist, wird aus der Charta entfernt, sodass der Treibstoff des Reviews
Runde für Runde schrumpft. Wenn dieselbe Fehlerklasse zweimal auftaucht, ist
das Signal nicht, dass die Behebung falsch war, sondern dass **das Sinken es
war**.

Das Issue-Journal konvergiert auf demselben Prinzip: keine Beobachtungen in
Open häufen; nur öffnen, was entschieden wurde; gleichförmige Issues
zusammenfalten; jedem neuen Issue seinen Verdauungsweg bei der Geburt
mitgeben.

### Tests — Anzahl ist nicht das Maß an Schutz

Ein Test darf nur einen **Vertrag** festnageln (ein Versprechen, auf das sich
das Geschäft verlässt); eine Kopie eines Symptoms schützt vor nichts vor
Regression. Die erste Verteidigungslinie ist Struktur, die nicht brechen kann
(Designs und Typen, in denen die Fehlerbedingung nicht existieren kann); Tests
sind das letzte Mittel für Verträge, die Struktur nicht abdichten kann.

### Beobachter und Aufzählungen — keine Meta-Qualitätsprüfungen

Beobachter von Beobachtern, Tests von Tests, Wächter von Wächtern —
Meta-Prüfungen, die keinen Geschäftsvertrag bewachen, vermehren sich leicht
und fressen Wartung, während sie nichts schützen. Drei Prinzipien schließen
sie aus:

- **Keine Beobachter hinzufügen; stattdessen sinken lassen** — der Wunsch,
  einen Wächter zu beobachten, ist ein Symptom, dass er zu hoch sitzt. Die
  Antwort ist das Gesetz des Abstiegs, nicht mehr Überwachung: schiebe ihn
  nach unten, und das zu Beobachtende verschwindet
- **Erkennung geht nur einen Schritt weit** — nur Verträge, die Struktur
  nicht abdichten kann, dürfen Detektoren haben, und Detektoren bekommen
  keine Detektoren. Dass ein defekter Detektor unbemerkt bleibt, ist der
  akzeptierte Preis, weshalb Detektoren minimal und einfach bleiben
- **Niemals durch Aufzählung absichern** — jedes Schema, dessen Abdeckung
  eine von Hand gepflegte Liste ist, macht vergessene Ergänzungen zu stillen
  Lücken. Formen bevorzugen, bei denen die Struktur selbst die Definition ist
  (das payload-Prinzip) oder bei denen die Maschine die Liste als
  Nebenprodukt ableitet (das manifest-Prinzip)

Die Regeltexte selbst werden hier nicht dupliziert (eine Kopie der payload
würde still verrotten). Der kanonische Index: Rollen, Qualitätsinvarianten,
Git-Autorität und die allgegenwärtigen beads-Regeln stehen in
[AGENTS.md](../payload/AGENTS.md); Vorarbeit und Komposition in
[agents-kickoff](../payload/skills/agents-kickoff/SKILL.md); der Betrieb der
Qualitätsschleife in
[agents-quality-loop](../payload/skills/agents-quality-loop/SKILL.md);
bd-Operationen und die Gedächtnisgrenze in
[agents-beads-ops](../payload/skills/agents-beads-ops/SKILL.md); Testdesign in
[agents-test-design](../payload/skills/agents-test-design/SKILL.md); die drei
Schichten und die Ablations-Disziplin in
[prompt-guidelines.md](../payload/docs/prompt-guidelines.md).

## Aufbau

```
bin/agents-setup      Installer-CLI (clone / pull / install / update / uninstall / status)
test/                 Vertragstests für den Installer und die Durchsetzungsschicht (npm test)
payload/              die einzige Definition dessen, was verteilt wird; dieser Baum wird zu .agents/
├── AGENTS.md         allgegenwärtige Regeln (von jeder Sitzung immer gelesen)
├── skills/           momentane Regeln (nur gelesen, wenn ihr Moment eintritt)
├── agents/           Rollendefinitionen (reviewer / verifier, werkzeugbeschränkt)
├── hooks/            shellenv.sh (Guard-Zustellung) / beads-session.sh (SessionStart-Injektion)
├── bin/              Durchsetzung (bd, git-guard, agents-gate, agents-reap) und Selbstprüfung (agents-doctor)
└── docs/             Richtlinien zur Aktualisierung der Prompts
```

[payload/](../payload/) ist die kanonische Definition der Distribution; der
Installer hält keine Liste seines Inhalts (replizierte Listen verrotten still
— [package.json](../package.json) `files` nennt nur `bin` und `payload`).

## Aktualisieren der Prompts

Folge [payload/docs/prompt-guidelines.md](../payload/docs/prompt-guidelines.md).
Bearbeite nur in diesem Repository und liefere mit `agents-setup update` aus —
einen installierten Baum direkt zu bearbeiten, lässt `update` die Datei
schützen und warnen, was die Drift-Erkennung ist, die funktioniert.

## Offene Fragen

- Massentriage vorbestehender offener Issues bei der Übernahme des Harness in
  einem Projekt mit einem etablierten Journal (mit pauschaler
  `AGENTS_BD_OPEN_OK=1`-Genehmigung)
- Überprüfung geprägter Begriffe, und weitere Verschlankung des `<beads>`-Blocks
  in AGENTS.md — nachdem die Instrumente Beobachtungen gesammelt haben
