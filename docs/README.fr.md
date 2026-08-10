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
bun add -g @hiroiku/dotagents      # une fois — ou : npm i -g @hiroiku/dotagents

dotagents list                     # ce que tu peux installer
dotagents install harness          # dans le projet courant
dotagents install harness -g       # pour tous les projets de cette machine
dotagents install harness -C ~/x   # dans un projet précis
```

Il n'y a pas d'étape de préparation. Les modules voyagent à l'intérieur du paquet, si bien que la première commande installe directement — rien à cloner, rien à récupérer, aucun état à migrer avant de pouvoir travailler. `bunx @hiroiku/dotagents install harness` fait la même chose sans rien installer globalement.

La cible par défaut est ce projet — le plus petit rayon d'impact — et la portée plus large demande toujours un flag. Ce qui est installé n'a jamais de valeur par défaut : nomme un module, ou choisis de façon interactive. Un shell non interactif s'arrête plutôt que de choisir à ta place.

Node ou Bun, selon ce que la machine possède — la CLI choisit elle-même le runtime présent.

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

[modules/](../modules/) est la définition canonique de la distribution — l'installeur ne tient aucune liste des fichiers, donc rien ne pourrit en se désynchronisant. Les deux modules livrés avec le paquet sont autant des exemples que des choix par défaut, et non un ensemble que tu serais censé prendre en bloc : [harness](../modules/harness/docs/README.fr.md) porte des agents de revue et les conventions qu'un modèle ne peut pas deviner, [architecture](../modules/architecture/docs/README.fr.md) une règle de dépendance qui convient à certains projets et pas à d'autres.

Tes propres modules vont dans `~/.dotagents/modules/`, sous la même forme. Ils s'installent avec les mêmes commandes et restent sur ta machine — jamais dans un dépôt, jamais dans un paquet publié. `list` montre les deux sources ; un nom revendiqué deux fois est une erreur, et non une substitution silencieuse.

## Où cela vit

```
~/.dotagents/         tout ce qui t'appartient, au même endroit
├── modules/          tes propres modules
└── state/            le relevé de ce qui a été placé, et où
```

Rien de ce qui vient de npm ne vit ici — ni l'installeur, ni les modules qu'il apporte. Les deux sont remplacés là d'où ils viennent.

`DOTAGENTS_HOME` déplace l'ensemble ; rien d'autre n'a besoin d'être prévenu. Une seule racine, et chaque chemin en dérive — `status` et `--help` affichent celle qui est en vigueur, si bien qu'une machine ne cache jamais d'où viennent ses règles.

## Commandes

```sh
dotagents update               # relivrer ce qui est enregistré — sans argument, il se souvient de ton choix
dotagents uninstall <module>   # retirer un module, garder le reste ; n'en nommer aucun retire tout
dotagents status               # vérifier chaque fichier livré — exit 1 en cas de dérive
dotagents --help               # toutes les commandes, options, exemples
```

`install` est additif et `uninstall` soustractif, si bien que l'ensemble que détient un déploiement se construit et se défait module par module. `update` part de ce dont le manifeste se souvient : il relivre cet ensemble, retire ce qui reste enregistré mais n'est plus livré, et élague toute ancienne disposition qu'il rencontre.

**Rien ne bouge tout seul.** Ce qui est livré, ce sont les textes qui gouvernent tes agents : la livraison n'est donc jamais automatique ni silencieuse — chaque commande dit ce qu'elle a placé, gardé et retiré.

## Une seule voie de mise à jour

Les nouvelles règles arrivent en mettant à jour le paquet, pas en lançant une commande. Mets-le à jour comme tu l'as installé, puis relivre :

```sh
bun add -g @hiroiku/dotagents   # ou : npm i -g @hiroiku/dotagents
dotagents update -g             # et : dotagents update -C <projet>
```

| | D'où cela vient | Comment cela bouge |
|---|---|---|
| **L'installeur et les modules qu'il apporte** | npm | comme tout autre outil que tu installes |
| **Tes propres modules** | `~/.dotagents/modules/` | ils sont à toi ; rien d'autre n'y écrit |

Une voie, pas deux. Deux voudrait dire que l'une des deux vieillit — et que **le code qui migre ta configuration serait enfermé dans ce qui est migré**, à attendre la mise à jour même qu'il est censé apporter. Avec une seule, un correctif et les règles qu'il corrige arrivent ensemble, dans une version que tu peux nommer.

## Ce que l'installeur touche et ne touche pas

Tout est idempotent et **possédé par empreinte** : il ne touche que ce qu'il a lui-même placé et reconnaît encore. Tes propres skills ne sont jamais touchés, les fichiers que tu as modifiés sur place sont conservés et signalés (`--force` pour écraser), et `uninstall` retire exactement ce que le relevé indique avoir placé — rien d'autre. Ce relevé vit dans `~/.dotagents/state/`, jamais dans un projet.

Les plugins de portée projet ne se chargent que si Claude Code démarre à la racine du dépôt, et seulement après que tu as accepté la boîte de dialogue de confiance de l'espace de travail. Les changements apportés aux agents et aux hooks prennent effet à la session suivante ou après `/reload-plugins` ; les modifications d'un `SKILL.md` sont prises en compte immédiatement.

## Arborescence

```
bin/agents-setup      la CLI (list / install / update / uninstall / status)
test/                 tests de contrat de l'installeur (npm test · bun test)
modules/              les modules livrés avec le paquet
├── harness/          agents de revue, conventions git · testing · prompting
└── architecture/     une règle de dépendance imposée par le build
```

Ce dépôt est l'upstream des deux, et npm porte les deux : `bin/` et `modules/` sont publiés ensemble, comme une seule version.
