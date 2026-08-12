# dotagents

**Un gestionnaire de paquets pour les règles que suivent tes agents IA.** Skills, agents de revue et hooks — empaquetés en modules, installés dans les projets que tu choisis.

[English](../README.md) | [日本語](README.ja.md) | [简体中文](README.zh-CN.md) | [繁體中文](README.zh-TW.md) | [한국어](README.ko.md) | [Deutsch](README.de.md) | [Español](README.es.md) | Français

[![npm](https://img.shields.io/npm/v/%40hiroiku%2Fdotagents)](https://www.npmjs.com/package/@hiroiku/dotagents)
[![license: MIT](https://img.shields.io/badge/license-MIT-blue.svg)](../LICENSE)

- **Le module est l'unité.** Un répertoire déclare ce dont il a besoin, porte ce qu'il livre et explique pourquoi il existe. Installe-le dans un projet ou sur une machine entière ; retire-le tout aussi proprement.
- **Les agents lisent le résultat nativement.** Pas de runtime, pas de daemon, rien de branché dans ton shell — l'installeur écrit des fichiers ordinaires là où chaque agent regarde déjà, puis s'efface.
- **Un seul jeu de règles, de nombreux agents.** Le même module atteint Claude Code et Codex, chacun sous la forme que cet agent comprend.

## Installation

Un seul paquet. Il apporte le mécanisme et **dépose un ensemble de modules choisis dans `~/.dotagents/modules/` comme des répertoires ordinaires qui t'appartiennent** — supprime ceux dont tu ne veux pas, modifie ceux qui te vont presque, et place les tiens à côté. Tout ce qui vient de moi s'annonce `from hiroiku`, si bien que tu sais toujours de qui est l'opinion que tu lis.

```sh
bun add -g @hiroiku/dotagents      # une seule fois — ou : npm i -g @hiroiku/dotagents

dotagents list                     # ce que tu peux installer
dotagents install review           # dans le projet courant
dotagents install review -g        # pour tous les projets de cette machine
dotagents install review -C ~/x    # dans un projet précis
```

Rien à cloner, rien à récupérer, aucun état à migrer avant de pouvoir travailler : les modules voyagent dans le paquet, donc la première commande les dépose et la suivante en installe un aussitôt.

La cible par défaut est ce projet — le plus petit rayon d'impact — et la portée plus large demande toujours un flag. Ce qui est installé n'a jamais de valeur par défaut : nomme un module, ou choisis de façon interactive. Un shell non interactif s'arrête plutôt que de choisir à ta place.

Node ou Bun, selon ce que la machine possède — la CLI choisit elle-même le runtime présent.

## Ce qu'est un module

Un répertoire doté d'un `module.json`. Tout le reste est optionnel, et chaque catégorie a une unique destination :

```
modules/<name>/
├── module.json    ce qu'il est, ce qu'il attend dans le PATH, ce dont il hérite
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

Il peut aussi déclarer quel nom retiré il a repris (`replaces`), de sorte qu'un enregistrement qui se souvient de l'ancien nom suive les règles là où elles sont allées — renommées, ou réparties entre plusieurs. L'installeur ne tient aucune table à lui : c'est le corpus qui dit où un nom est parti, et quand la migration a fait son temps, ce qu'on supprime est la ligne du module, pas du code de l'installeur.

[modules/](../modules/) est la définition canonique de cet ensemble. L'installeur ne tient aucune liste : ni celle des fichiers, ni celle des modules ; il lit ce qui se trouve dans `~/.dotagents/modules/`. Cet ensemble est autant un point de départ qu'un choix par défaut, et non quelque chose que tu serais censé prendre en bloc : [review](../modules/review/README.md) confie la vérification à un contexte qui n'a pas écrit le code, [code](../modules/code/README.md) ce à quoi sert un commentaire, [git](../modules/git/README.md) · [testing](../modules/testing/README.md) · [prompting](../modules/prompting/README.md) les conventions qu'un modèle ne peut pas deviner, chacune lue au moment où elle s'applique, [architecture](../modules/architecture/docs/README.fr.md) une règle de dépendance qui convient à certains projets et pas à d'autres, [github](../modules/github/README.md) quel mécanisme d'une issue porte quelle signification.

Les modules sont découpés de sorte que l'un d'eux puisse ne pas te convenir sans emporter les autres. Il n'y a pas de lot ici : installe `git` et `testing` sur une machine où les rôles de revue ne conviennent pas, ou `review` seul dans le dépôt qui en a besoin.

Il y a un seul endroit où un module peut vivre : `~/.dotagents/modules/`. L'ensemble d'exemple n'est pas lu depuis le paquet, il y est *déposé* — de sorte que l'ensemble que tu peux installer et celui que tu peux modifier ne font qu'un. Tout ce qui a la même forme fonctionne : quelle que soit la manière dont tu l'as obtenu, place le répertoire ici et c'est un module.

Une fois déposé, un module est à toi :

| | |
|---|---|
| tu n'y as pas touché | mis à jour quand le paquet en apporte une version plus récente |
| tu l'as modifié | conservé et signalé (`--force` pour reprendre la version d'exemple) |
| tu l'as supprimé | plus jamais déposé |

`list` dit toujours d'où vient chacun — `from hiroiku` pour l'ensemble que je livre, avec `edited by you` en plus s'il a été touché, et rien du tout pour ceux que tu as écrits.

## Où cela vit

```
~/.dotagents/         tout ce qui t'appartient, au même endroit
├── modules/          tous les modules — l'exemple est déposé ici aussi
└── state/            ce qui a été placé où, et quels exemples tu as modifiés
```

L'installeur lui-même ne vit pas ici ; il est remplacé là d'où il vient. Les modules, eux, vivent ici — y compris ceux que le paquet a déposés. C'est tout l'intérêt.

`DOTAGENTS_HOME` déplace l'ensemble ; rien d'autre n'a besoin d'être prévenu. Une seule racine, et chaque chemin en dérive — `status` et `--help` affichent celle qui est en vigueur, si bien qu'une machine ne cache jamais d'où viennent ses règles.

## Commandes

```sh
dotagents update               # relivrer ce qui est enregistré — sans argument, il se souvient de ton choix
dotagents uninstall <module>   # retirer un module, garder le reste ; n'en nommer aucun retire tout
dotagents status               # vérifier chaque fichier livré — exit 1 en cas de dérive
dotagents --help               # toutes les commandes, options, exemples
```

`install` est additif et `uninstall` soustractif, si bien que l'ensemble que détient un déploiement se construit et se défait module par module. `update` part de ce dont le manifeste se souvient : il relivre cet ensemble et élague toute ancienne disposition qu'il rencontre.

**Seul `uninstall` retire des règles d'un déploiement.** Supprimer un module de `~/.dotagents/modules/` est un geste courant et anodin ; réécrire chacun des projets où tu l'avais installé ne l'est pas. Aussi, quand un module livré n'a plus de source, `update` conserve les fichiers, conserve l'enregistrement, conserve ses lignes dans `CLAUDE.md`, et dit ce qu'il a gardé et comment le retirer. `status` signale cet état comme un écart, car sans source il n'y a rien à quoi confronter les fichiers.

**Rien ne bouge tout seul.** Ce qui est livré, ce sont les textes qui gouvernent tes agents : la livraison n'est donc jamais automatique ni silencieuse — chaque commande dit ce qu'elle a placé, gardé et retiré.

## Une seule voie de mise à jour

Les nouvelles règles arrivent en mettant à jour le paquet, pas en lançant une commande. Mets-le à jour comme tu l'as installé, puis relivre :

```sh
bun add -g @hiroiku/dotagents   # ou : npm i -g @hiroiku/dotagents
dotagents update -g             # et : dotagents update -C <projet>
```

| | D'où cela vient | Comment cela bouge |
|---|---|---|
| **Le mécanisme** (`@hiroiku/dotagents`) | npm | comme tout autre outil que tu installes |
| **L'ensemble d'exemple** (`hiroiku`) | dans ce même paquet | déposé dans `~/.dotagents/modules/`, rafraîchi là où tu n'y as pas touché |
| **Tes propres modules** | `~/.dotagents/modules/` | ils sont à toi ; rien d'autre n'y écrit |

Une voie, pas deux. Deux voudrait dire que l'une des deux vieillit — et que **le code qui migre ta configuration serait enfermé dans ce qui est migré**, à attendre la mise à jour même qu'il est censé apporter. Avec une seule, un correctif et les règles qu'il corrige arrivent ensemble, dans une version que tu peux nommer.

## Ce que l'installeur touche et ne touche pas

Tout est idempotent et **possédé par empreinte** : il ne touche que ce qu'il a lui-même placé et reconnaît encore. Tes propres skills ne sont jamais touchés, les fichiers que tu as modifiés sur place sont conservés et signalés (`--force` pour écraser), et `uninstall` retire exactement ce que le relevé indique avoir placé — rien d'autre. Ce relevé vit dans `~/.dotagents/state/`, jamais dans un projet.

Les plugins de portée projet ne se chargent que si Claude Code démarre à la racine du dépôt, et seulement après que tu as accepté la boîte de dialogue de confiance de l'espace de travail. Les changements apportés aux agents et aux hooks prennent effet à la session suivante ou après `/reload-plugins` ; les modifications d'un `SKILL.md` sont prises en compte immédiatement.

## Arborescence

```
bin/agents-setup      la CLI (list / install / update / uninstall / status)
test/                 tests de contrat de l'installeur (npm test · bun test)
modules/              l'ensemble d'exemple qui voyage avec elle — de hiroiku
├── review/           revue adversariale, OWASP, WCAG — dans un contexte propre
├── code/             ce à quoi sert un commentaire
├── git/              titres de commit, squash, rebase
├── testing/          les douze propriétés d'un bon test
├── prompting/        quoi lire avant d'éditer un prompt
├── architecture/     une règle de dépendance imposée par le build
└── github/           ce qu'une issue peut porter, et sur quel axe
```

Un paquet, une version : le mécanisme et les règles qu'il dépose sont toujours la paire qui a été vérifiée ensemble. Ici, `modules/` est la provenance de l'exemple, non son domicile — une fois déposée, la copie dans `~/.dotagents/modules/` est à toi.
