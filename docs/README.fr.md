# dotagents

Le corpus canonique d'un harnais d'agents IA (partagé par Claude Code et
Codex) : prompts, skills et application des règles, versionnés ici et
déployés dans chaque environnement avec [bin/agents-setup](../bin/agents-setup).

[English](../README.md) | [日本語](README.ja.md) | [简体中文](README.zh-CN.md) | [繁體中文](README.zh-TW.md) | [한국어](README.ko.md) | [Deutsch](README.de.md) | [Español](README.es.md) | Français

## Démarrage rapide

Prérequis : git, Node.js ≥ 18, et les organes sur lesquels repose le harnais
— **[bd (beads)](https://github.com/gastownhall/beads) est requis** (le
registre des tickets sur lequel reposent le dépôt, la réclamation, les
portes d'achèvement et l'exclusion de fusion),
**[codegraph](https://github.com/colbymchenry/codegraph) est recommandé**
(requêtes de structure ; à câbler avec `codegraph install`, à indexer par
projet avec `codegraph init`). Le harnais ne les installe jamais à ta place —
l'installeur et chaque démarrage de session détectent et signalent ce qui
manque.

```sh
# Obtenir (une fois) : le corpus arrive comme un dépôt git que tu possèdes et modifies
npx @hiroiku/dotagents clone ~/dotagents

# Déployer : choisis une cible explicitement, ou omets-la pour choisir de façon interactive
~/dotagents/bin/agents-setup install project /path/to/project   # un projet (<dir>/.agents)
~/dotagents/bin/agents-setup install user                       # niveau utilisateur (~/.agents)
~/dotagents/bin/agents-setup install shell                      # gardes uniquement (hooks/bin + une ligne dans ~/.zshenv)

# Suivre l'upstream (répétable) : affiche les titres des commits entrants, effectue un rebase, exécute les tests
~/dotagents/bin/agents-setup pull

# Maintenir
~/dotagents/bin/agents-setup update  project   # appliquer les changements du corpus, élaguer ce que payload/ a abandonné
~/dotagents/bin/agents-setup status  project   # vérifier manifest, payload, fichiers, liens, fragments
~/dotagents/bin/agents-setup --help            # commandes, cibles, options, exemples
```

Les verbes se déclinent en trois couches : **clone (obtenir, une fois) / pull
(suivre, de façon répétée) / install · update (déployer)**. Ce n'est pas une
bibliothèque que tu consommes, mais un livre de règles que tu opères et
modifies, si bien que le corpus reste toujours ton propre dépôt git
modifiable. Il n'existe aucun chemin qui déploie silencieusement depuis un
cache npx ou une archive tarball décompressée — en dehors d'un corpus, les
commandes de déploiement délèguent soit au corpus que ta machine connaît
déjà, soit s'arrêtent avec des instructions pour faire `clone`.

La resynchronisation du déploiement n'est jamais poussée : quand le corpus
avance, l'instrument à chaque entrée de session (agents-doctor) signale
« déploiement plus ancien que le corpus », et tu exécutes `update` dans ce
projet.

Le suivi n'est délibérément pas automatisé. Ce que tu récupères par pull, ce
sont les textes de règles qui gouvernent le comportement de tes agents, donc
`pull` montre toujours d'abord le diff entrant (les titres des commits sont
écrits en langage du domaine — ils se lisent comme un journal des
modifications), s'intègre par rebase, puis exécute les propres tests du
corpus. Tes modifications personnelles vivent comme des commits et
chevauchent l'upstream.

**La cible est un unique argument positionnel** (`user` / `project [dir]` /
`shell`) et n'a jamais de valeur par défaut : indique-la, ou choisis de façon
interactive. L'omettre dans un contexte non interactif (CI, tubes) arrête le
processus sans rien écrire — aucun chemin où un argument oublié modifierait
silencieusement un autre emplacement. Et comme il n'y a qu'une seule
position, « utilisateur et projet à la fois » ne peut même pas être saisi :
l'exclusivité est garantie par la syntaxe, pas par une validation à
l'exécution.

L'invite interactive est un sélecteur à flèches (`↑/↓` déplacer, `enter`
confirmer, `ctrl-c` annuler) qui se réduit à une seule ligne montrant ce que
tu as choisi. La sortie est colorée, et perd automatiquement la couleur sous
`NO_COLOR` ou sans TTY.

## Ce que fait l'installeur (tout est idempotent)

- Copie `payload/` → `.agents/` (les empreintes de contenu sont enregistrées
  dans le manifest `.dotagents.json`)
- Liens symboliques : `.claude/CLAUDE.md → .agents/AGENTS.md` ; les skills
  (`.claude/skills/<name>`) et les définitions d'agents
  (`.claude/agents/<name>.md`) sont **toujours liés un par un**, afin qu'ils
  coexistent avec les entrées que tu as écrites toi-même (pas de liens par
  répertoire). Codex reçoit la même forme sous `.codex/` quand ce répertoire
  existe
- Ajoute une ligne protégée et gérée à `~/.zshenv` (niveau utilisateur
  uniquement ; une absence d'effet quand le fichier qu'elle source est
  absent)
- Fragments de `settings.json` : `env.BASH_ENV`, `hooks.SessionStart`,
  `permissions.ask` (push uniquement — la fusion est couverte par la garde
  `AGENTS_MERGE_SLOT_OK`). Codex reçoit le même fragment SessionStart dans
  `.codex/hooks.json` quand `.codex/` existe
- Les produits spécifiques à la machine (le manifest, le fichier de
  métriques) sont tenus hors du contrôle de version par un
  `.agents/.gitignore` livré avec le payload. Tout ce que dotagents génère
  reste dans son propre territoire (`.agents/`) — bd n'écrit que dans
  `.beads/`, codegraph que dans `.codegraph/`

Principe de propriété : l'installeur ne touche jamais qu'à ce qu'il a
lui-même placé et possède encore (empreinte correspondante). Tes propres
skills ne sont jamais touchés, les fichiers que tu as modifiés sur place sont
conservés et signalés (`--force` pour écraser), et seuls les fragments de
settings qu'il a ajoutés sont jamais retirés.

### La couche shell — une ressource partagée qui existe une seule fois

Les gardes (git-guard, l'enveloppe de bd) n'atteignent les sessions que par
`hooks/shellenv.sh`, et zsh n'a pas de fichier de démarrage par projet — donc
cette couche existe **une fois par machine**, quel que soit le nombre de
projets qui utilisent le harnais. L'installeur l'entretient des deux côtés
afin que l'ordre ne devienne jamais une connaissance opérationnelle :
`install project` ajoute la portée shell minimale quand elle manque ;
`uninstall user` demande confirmation avant de retirer ce que d'autres
projets partagent (`--keep-shell` la conserve sans interaction) ;
`uninstall project` n'y touche jamais.

### Adoption tardive et déploiement en équipe

- **Indépendant de l'ordre** : ajouter bd ou codegraph plus tard ne
  nécessite aucune réinstallation — les organes, les registres et les index
  sont détectés dynamiquement à chaque démarrage de session. Un AGENTS.md
  racine existant créé par `bd init` n'est pas repris ; seul un bloc de
  référence géré est ajouté
- **Deux couches de livraison** : la couche de prompts (le payload de
  `.agents/`, les liens, le bloc de référence) voyage avec le contrôle de
  version et **fonctionne dès le simple clonage** ; la couche d'injection et
  d'application des règles (manifest, fragments de settings, la ligne
  zshenv, les gardes shell) est spécifique à la machine et **est posée par
  l'installeur sur chaque machine**
- **À partir de la deuxième personne** : cloner le projet, cloner
  dotagents, exécuter `bin/agents-setup install project <project>` — une
  seule commande ; la couche shell est complétée au passage si elle manque.
  L'installeur est idempotent et vérifié par empreinte, si bien qu'il ne
  combat jamais ce que le contrôle de version a livré

## Concept

Ce que construit ce harnais n'est pas « un agent capable », mais **une
organisation qui répartit une attention finie (le contexte) entre des rôles
et les relie par des registres externes**. Chaque règle ci-dessous découle
d'une prémisse unique : le contexte est fini et meurt avec la session.

### Trois couches de règles — omniprésentes, momentanées, imposées

Avant même son contenu, la nature d'une règle est décidée par **la façon
dont elle est livrée**.

- **Règles omniprésentes** (le noyau = AGENTS.md) — toujours injectées.
  Elles taxent l'attention de chaque session et ne tiennent que comme un
  **effort maximal**, donc cette couche ne peut porter que les quelques
  règles dont le moment d'observation ne peut pas être nommé
- **Règles momentanées** (skills) — injectées juste à temps. Elles n'entrent
  dans le contexte que lorsque leur moment arrive, si bien que le détail n'y
  coûte rien à aucun autre moment
- **Règles imposées** (hooks / bin / permissions) — jamais injectées. Un
  mécanisme décide, si bien qu'elles ne consomment aucune attention et ne
  peuvent pas être enfreintes (ou laissent une trace quand elles le sont)

**La loi de la descente** : pousse chaque règle aussi bas qu'elle peut aller.
Les couches inférieures sont à la fois plus fortes *et* moins coûteuses —
une pente à sens unique où la force augmente à mesure que le coût
d'attention disparaît. Un prompt n'est que la salle d'attente des règles qui
n'ont pas encore été transformées en mécanisme.

### Séparation — des frontières qui n'admettent aucune duplication

Les subagents ne sont pas découpés selon leur capacité, mais selon des
**frontières où la duplication ne peut pas se produire** : des unités dont
les entrées (le contexte), les plages de recherche et les cibles d'écriture
(worktrees) ne se recoupent pas. Donne la même information à deux contextes
et tu paies l'attention deux fois ; laisse deux contextes écrire au même
endroit et tu as créé un point de fusion. Les points de fusion que la
structure ne peut pas supprimer (la branche d'intégration et le registre)
sont les seuls protégés par exclusion.

La séparation est aussi une dissimulation. Ne pas connaître les
circonstances de l'implémentation est ce qui donne à la revue son pouvoir de
détection — **« ne pas le transmettre » est une décision de conception aussi
forte que « le transmettre »**.

### Organes — déclaration contre dérivation

Chaque outil sert d'organe répondant à un type de question, et aucune
capacité native d'un organe n'est réimplémentée ailleurs. L'axe est
**déclaration contre dérivation** :

- **Registres de déclaration** (ce qui a été décidé ne peut pas être dérivé,
  donc on l'enregistre) : bd = le registre de l'intention et de l'état (ce
  que nous avons décidé de faire, qui détient quoi, pourquoi quelque chose
  est arrêté) ; les ADR = la trace des décisions ; le glossaire = le
  langage omniprésent
- **Dérivation** (ce qu'une machine peut dériver de l'artefact n'est jamais
  écrit à la main) : codegraph = la structure actuelle du code (symboles,
  chemins d'appel, rayon d'impact) ; git = l'historique des changements

Au moment où tu écris à la main quelque chose de dérivable, la dérive
commence. La mémoire se situe sur le même axe : l'état est dérivé
(l'injection de requêtes de bd prime) ; seuls les invariants sont déclarés
(bd remember). Ce qui porte le contexte d'une session à l'autre n'est pas
une transcription, mais un registre externe muni d'une adresse (**le pont de
contexte**).

codegraph est l'organe d'exploration quotidien, et sa règle omniprésente
(« dériver d'abord avec explore ») est **livrée par la description de
l'outil (les instructions du serveur MCP)** — jamais copiée dans les
prompts, où elle deviendrait une réplique obsolète. Le choix de l'outil ne
peut pas être vérifié par une machine, donc il ne peut pas non plus relever
de l'application des règles : la couche d'outils à coût d'injection nul est
la couche la plus basse où cette règle peut vivre. Les prompts du harnais
n'énoncent que les moments où *ne pas* l'utiliser rompt un contrat (la
vérification avec la vérité de terrain avant le gel, la dérivation du
balayage horizontal, le scan du relecteur). Le câblage (`codegraph install`)
et l'index (`codegraph init`) relèvent de la responsabilité propre de
codegraph — le harnais ne les vérifie ni ne les réimplémente ; SessionStart
se contente de détecter `.codegraph/` et d'injecter une ligne de rappel.

### Revue contradictoire — les omissions n'existent pas tant qu'on ne les cherche pas

Le mode d'échec propre aux agents IA est le « c'est fait ! » alors que ce
n'est pas fait, et son fond n'est pas le mensonge mais **l'omission** —
quelqu'un dont le contexte ne contient que ce qu'il a écrit ne peut pas voir
ce qu'il n'a pas écrit.

La revue n'est donc pas une inspection (regarder ce qui existe et le juger),
mais une **preuve d'existence** : partant des exigences, le relecteur doit
trouver l'implémentation et la vérification qui satisfont chacune d'elles
dans l'artefact — un scan en sens inverse. Le diff n'est pas montré en
premier au relecteur, parce que l'attention capturée par la vérification de
ce qui a été écrit cesse de chercher ce qui n'a pas été écrit.

### Enfoncement — les boucles se terminent parce que le savoir descend

La revue répétée seule diverge (les constats surgissent sans fin). La
boucle converge parce que chaque tour fait **s'enfoncer** le savoir d'une
couche : des constats individuels → des classes de défauts articulées (des
contrats rompus) → l'application des règles (une structure, un type, une
seule garde). Une hypothèse qui s'est enfoncée est retirée de la charte, si
bien que le carburant de la revue se réduit tour après tour. Quand la même
classe de défaut resurgit deux fois, le signal n'est pas que le correctif
était erroné, mais que **c'est l'enfoncement qui l'était**.

Le registre des tickets converge sur le même principe : ne pas empiler
d'observations dans l'ouvert ; n'ouvrir que ce qui a été décidé ; replier
ensemble les tickets de même forme ; donner à chaque dépôt sa voie de
digestion dès sa naissance.

### Tests — le nombre n'est pas la mesure de la protection

Un test ne peut fixer qu'un **contrat** (une promesse dont dépend
l'activité) ; une copie d'un symptôme ne protège de rien contre la
régression. La première ligne de défense est une structure qui ne peut pas
se rompre (des conceptions et des types dans lesquels la condition de
défaillance ne peut pas exister) ; les tests sont le dernier recours pour
les contrats que la structure ne peut pas sceller.

### Observateurs et énumérations — pas de contrôles qualité méta

Des observateurs d'observateurs, des tests de tests, des gardes de gardes —
des contrôles méta qui ne protègent aucun contrat métier se multiplient
facilement et consomment de la maintenance sans rien protéger. Trois
principes les excluent :

- **Ne pas ajouter d'observateurs ; les enfoncer à la place** — vouloir
  observer une garde est le symptôme qu'elle est placée trop haut. La
  réponse est la loi de la descente, pas plus de surveillance : pousse-la
  vers le bas et ce qu'il fallait observer disparaît
- **La détection ne va qu'un cran plus loin** — seuls les contrats que la
  structure ne peut pas sceller peuvent avoir des détecteurs, et les
  détecteurs n'ont pas de détecteurs. Qu'un détecteur défaillant passe
  inaperçu est le prix accepté, c'est pourquoi les détecteurs restent
  minimaux et simples
- **Ne jamais garder par énumération** — tout schéma dont la couverture est
  une liste tenue à la main transforme les ajouts oubliés en lacunes
  silencieuses. Préférer les formes où la structure elle-même est la
  définition (le principe du payload) ou où la machine dérive la liste
  comme sous-produit (le principe du manifest)

Les textes de règles eux-mêmes ne sont pas dupliqués ici (une copie du
payload pourrirait en silence). L'index canonique : les rôles, les
invariants de qualité, l'autorité git et les règles omniprésentes de beads
sont dans [AGENTS.md](../payload/AGENTS.md) ; le travail préparatoire et la
composition dans [agents-kickoff](../payload/skills/agents-kickoff/SKILL.md) ;
la conduite de la boucle de qualité dans
[agents-quality-loop](../payload/skills/agents-quality-loop/SKILL.md) ; les
opérations bd et la limite de la mémoire dans
[agents-beads-ops](../payload/skills/agents-beads-ops/SKILL.md) ; la
conception des tests dans
[agents-test-design](../payload/skills/agents-test-design/SKILL.md) ; les
trois couches et la discipline d'ablation dans
[prompt-guidelines.md](../payload/docs/prompt-guidelines.md).

## Structure

```
bin/agents-setup      CLI de l'installeur (clone / pull / install / update / uninstall / status)
test/                 tests de contrat pour l'installeur et la couche d'application (npm test)
payload/              la définition unique de ce qui est distribué ; cet arbre devient .agents/
├── AGENTS.md         règles omniprésentes (lues par chaque session, toujours)
├── skills/           règles momentanées (lues seulement quand leur moment arrive)
├── agents/           définitions de rôles (reviewer / verifier, aux outils restreints)
├── hooks/            shellenv.sh (livraison des gardes) / beads-session.sh (injection SessionStart)
├── bin/              application des règles (bd, git-guard, agents-gate, agents-reap) et autovérification (agents-doctor)
└── docs/             directives pour la mise à jour des prompts
```

[payload/](../payload/) est la définition canonique de la distribution ;
l'installeur ne tient aucune liste de son contenu (les listes répliquées
pourrissent en silence — `files` dans [package.json](../package.json) ne
nomme que `bin` et `payload`).

## Mettre à jour les prompts

Suis [payload/docs/prompt-guidelines.md](../payload/docs/prompt-guidelines.md).
Modifie uniquement dans ce dépôt et livre avec `agents-setup update` —
modifier directement un arbre installé fait que `update` protège le fichier
et avertit, ce qui est la détection de dérive à l'œuvre.

## Questions ouvertes

- Triage massif des tickets ouverts préexistants lors de l'adoption du
  harnais dans un projet doté d'un registre déjà établi (avec une
  approbation générale via `AGENTS_BD_OPEN_OK=1`)
- Révision des termes forgés, et allègement supplémentaire du bloc
  `<beads>` dans AGENTS.md — une fois que les instruments auront rassemblé
  des observations
