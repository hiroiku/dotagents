# github

[English](../README.md) | [日本語](README.ja.md) | [简体中文](README.zh-CN.md) | [繁體中文](README.zh-TW.md) | [한국어](README.ko.md) | [Deutsch](README.de.md) | [Español](README.es.md) | Français

Un module sur ce qu'une issue GitHub peut porter, et sur le mécanisme qui porte chaque signification. Les règles elles-mêmes sont dans [skills/issues/SKILL.md](../skills/issues/SKILL.md).

## Tout finit en label

Les labels sont le seul mécanisme que tout modèle connaît déjà. Ils absorbent donc ce qui relève d'ailleurs : la nature du travail, la version visée, le morceau d'une tâche plus vaste dont il fait partie, ce qu'il attend. Rien n'échoue. L'issue est ouverte, colorée, elle a l'air rangée.

Ce qui se perd, c'est la requête. Si la version s'écrit en label, `is:open no:milestone` ne trouve pas le travail sans version. Si les enfants ne sont mentionnés qu'en prose, l'avancement du parent ne se compte pas. **Un tracker s'écrit une fois et se lit des centaines de fois**, et chaque signification posée sur le mauvais axe est retranchée de toutes les lectures suivantes.

Ce skill n'est donc pas une visite guidée de `gh issue`. Il porte sur ce que chaque fonctionnalité achète — à quelle question ultérieure elle permet de répondre. Il n'y a pas d'autre raison d'y recourir.

## Répondable, ou non

La ligne qui décide si l'emploi d'une fonctionnalité valait quelque chose :

| | |
| --- | --- |
| Une case à cocher n'est pas une sous-issue | Les deux ont la même apparence. L'une est un objet doté de son propre état, qu'un parent peut compter ; l'autre est du texte. Tout le bénéfice de la décomposition tient d'un seul côté de cette ligne. |
| Le blocage n'est pas cherchable | `is:blocked` ressemble à un filtre et n'en est pas un : rien n'expose la relation à une requête. L'ordre mérite toujours sa place dans le tracker, mais seulement là où quelqu'un en calculera la file. |
| Un jalon qui ne peut pas se fermer ne répond à rien | Le burn-down et la lecture « va-t-on y arriver ? » naissent d'un ensemble qui s'achève à une date. `backlog` et `someday` n'en produisent aucun, et retirent en silence cette lecture à tout ce qu'ils contiennent. |
| Un type traverse les dépôts, un label non | Les types appartiennent à l'organisation : une question peut donc traverser tous les dépôts d'un coup. Deux labels nommés `bug` ne se garantissent rien l'un l'autre. |

## Là où la décision aurait pu être autre

**Aucune convention sur les noms de label.** Un schéma qui épouse le flux d'une équipe est faux pour la suivante, et une règle que personne ne suit coûte de l'attention sans rien acheter. Le module fixe sur quel axe une signification se pose ; quels labels vivent sur cet axe appartient à l'équipe.

**Aucun gabarit pour le corps de l'issue.** Ce que contient un bon rapport relève du jugement, et un modèle capable l'a déjà. Le module fixe où va une signification, jamais comment la formuler.

**Nommé d'après l'hôte, pas d'après les issues.** Les pull requests, les releases et Actions tournent sur la même plateforme et présentent la même forme de problème. Le module s'appelle `github` pour que le prochain skill ait où se poser.
