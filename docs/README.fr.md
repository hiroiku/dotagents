# dotagents

**Un gestionnaire de paquets pour les règles que suivent tes agents IA.** Skills, agents de revue et hooks — empaquetés en modules, installés dans les projets que tu choisis.

[English](../README.md) | [日本語](README.ja.md) | [简体中文](README.zh-CN.md) | [繁體中文](README.zh-TW.md) | [한국어](README.ko.md) | [Deutsch](README.de.md) | [Español](README.es.md) | Français

[![npm](https://img.shields.io/npm/v/%40hiroiku%2Fdotagents)](https://www.npmjs.com/package/@hiroiku/dotagents)
[![license: MIT](https://img.shields.io/badge/license-MIT-blue.svg)](../LICENSE)

- **Le module est l'unité.** Un répertoire déclare ce dont il a besoin, porte ce qu'il livre et explique pourquoi il existe. Installe-le dans un projet ou sur une machine entière ; retire-le tout aussi proprement.
- **Les agents lisent le résultat nativement.** Pas de runtime, pas de daemon, rien de branché dans ton shell — l'installeur écrit des fichiers ordinaires là où chaque agent regarde déjà, puis s'efface.
- **Un seul jeu de règles, de nombreux agents.** Le même module atteint Claude Code et Codex, chacun sous la forme que cet agent comprend.

## Installer un module

```sh
npx @hiroiku/dotagents clone      # une fois — dans ~/.dotagents/corpus, un dépôt git que tu possèdes
cd ~/.dotagents/corpus

bin/agents-setup list                     # ce que tu peux installer
bin/agents-setup install harness          # dans le projet courant
bin/agents-setup install harness -g       # pour tous les projets de cette machine
bin/agents-setup install harness -C ~/x   # dans un projet précis
```

La cible par défaut est ce projet — le plus petit rayon d'impact — et la portée plus large demande toujours un flag. Ce qui est installé n'a jamais de valeur par défaut : nomme un module, ou choisis de façon interactive. Un shell non interactif s'arrête plutôt que de choisir à ta place.

## Ce qu'est un module

Un répertoire doté d'un `module.json`. Tout le reste est optionnel, et chaque catégorie a une unique destination :

```
modules/<name>/
├── module.json    ce qu'il est, et ce qu'il attend dans le PATH
├── README.md      pourquoi il existe — pour les humains, jamais déployé
├── AGENTS.md      règles injectées dans chaque session
├── skills/        règles lues seulement quand leur moment arrive
├── agents/        rôles de sous-agents, avec leur propre contexte et leurs propres outils
└── hooks/         gestionnaires d'événements exécutés pendant que l'agent travaille
```

| Catégorie | Claude Code | Codex |
|---|---|---|
| `skills/` · `agents/` · `hooks/` | `.claude/skills/dotagents/` — **un unique répertoire de plugin**, chargé sans marketplace ni étape d'installation, qui place ce qu'il contient dans l'espace de noms `/dotagents:*`. C'est ainsi que les hooks arrivent sans jamais toucher à `settings.json` | skills uniquement, sous `.codex/skills/dotagents-*` — Codex n'a pas de plugins, l'espace de noms se replie donc dans le nom du répertoire |
| `AGENTS.md` | un bloc géré dans `.claude/CLAUDE.md` | un bloc géré dans `AGENTS.md` |

Un module peut déclarer ce qu'il attend dans le `PATH`. Les prérequis sont **détectés, jamais installés** : `list` et `install` signalent ce qui manque et ne bloquent rien, si bien qu'ajouter l'outil plus tard ne demande aucune réinstallation.

[modules/](../modules/) est la définition canonique de la distribution — l'installeur ne tient aucune liste des fichiers, donc rien ne pourrit en se désynchronisant. Les deux modules présents ici sont ceux que ce corpus propose, et non un ensemble que tu serais censé prendre en bloc : [harness](../modules/harness/docs/README.fr.md) porte des agents de revue et les conventions qu'un modèle ne peut pas deviner, [architecture](../modules/architecture/docs/README.fr.md) une règle de dépendance qui convient à certains projets et pas à d'autres.

Tes propres modules vont dans `~/.dotagents/modules/`. Ils s'installent avec les mêmes commandes et restent sur ta machine — jamais dans un dépôt, jamais dans un paquet publié. `list` montre les deux sources ; un nom revendiqué deux fois est une erreur, et non une substitution silencieuse.

## Où cela vit

```
~/.dotagents/         tout ce que cet outil conserve, au même endroit
├── corpus/           le clone que tu modifies et que tu mets à jour par pull
├── modules/          tes propres modules
└── state/            le relevé de ce qui a été placé, et où
```

`DOTAGENTS_HOME` déplace l'ensemble ; rien d'autre n'a besoin d'être prévenu. Une seule racine, et chaque chemin en dérive — `status` et `--help` affichent celle qui est en vigueur, si bien qu'une machine ne cache jamais d'où viennent ses règles.

## Commandes

```sh
bin/agents-setup pull                 # suivre l'upstream : montre ce qui arrive, rebase tes commits, exécute les tests
bin/agents-setup update               # livrer à nouveau ici — sans argument, il se souvient des modules que tu as choisis
bin/agents-setup uninstall <module>   # retirer un module, garder le reste ; n'en nommer aucun retire tout
bin/agents-setup status               # vérifier chaque fichier livré — exit 1 en cas de dérive
bin/agents-setup --help               # toutes les commandes, options, exemples
```

`install` est additif et `uninstall` soustractif, si bien que l'ensemble que détient un déploiement se construit et se défait module par module. `pull` est la seule commande qui modifie les modules eux-mêmes, et elle ne touche jamais un déploiement : ce que tu récupères par pull, ce sont les textes qui gouvernent tes agents, donc elle montre les titres des commits entrants avant de les intégrer, et rien ne se met à jour automatiquement.

## Ce que l'installeur touche et ne touche pas

Tout est idempotent et **possédé par empreinte** : il ne touche que ce qu'il a lui-même placé et reconnaît encore. Tes propres skills ne sont jamais touchés, les fichiers que tu as modifiés sur place sont conservés et signalés (`--force` pour écraser), et `uninstall` retire exactement ce que le relevé indique avoir placé — rien d'autre. Ce relevé vit dans `~/.dotagents/state/`, jamais dans un projet.

Les plugins de portée projet ne se chargent que si Claude Code démarre à la racine du dépôt, et seulement après que tu as accepté la boîte de dialogue de confiance de l'espace de travail. Les changements apportés aux agents et aux hooks prennent effet à la session suivante ou après `/reload-plugins` ; les modifications d'un `SKILL.md` sont prises en compte immédiatement.

## Arborescence

```
bin/agents-setup      la CLI (clone / pull / list / install / update / uninstall / status)
test/                 tests de contrat de l'installeur (npm test)
modules/              les modules que ce corpus propose
├── harness/          agents de revue, conventions git · testing · prompting
└── architecture/     une règle de dépendance imposée par le build
```
