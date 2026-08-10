# github

[English](../README.md) | [日本語](README.ja.md) | [简体中文](README.zh-CN.md) | [繁體中文](README.zh-TW.md) | [한국어](README.ko.md) | [Deutsch](README.de.md) | [Español](README.es.md) | Français

Un module sur ce qu'une issue GitHub peut porter, et sur le mécanisme qui porte chaque signification. Les règles elles-mêmes sont dans [skills/issues/SKILL.md](../skills/issues/SKILL.md).

## Tout finit en label

Les labels sont le seul mécanisme que tout modèle connaît déjà. Ils absorbent donc ce qui relève d'ailleurs : la nature du travail, la version visée, le morceau d'une tâche plus vaste dont il fait partie, ce qu'il attend. Rien n'échoue. L'issue est ouverte, colorée, elle a l'air rangée.

Ce qui se perd, c'est la requête. Si la version s'écrit en label, `is:open no:milestone` ne trouve pas le travail sans version. Si les enfants ne sont mentionnés qu'en prose, l'avancement du parent ne se compte pas. **Un tracker s'écrit une fois et se lit des centaines de fois**, et chaque signification posée sur le mauvais axe est retranchée de toutes les lectures suivantes.

Ce skill n'est donc pas une visite guidée de `gh issue`. C'est la carte qui va de la signification à l'axe, et elle est courte : le reste est dans `--help`.

## Ce que le modèle ne peut pas déduire

Un agent peut lire `gh issue create --help` à tout moment. Ce qu'il n'y trouvera pas :

| | |
| --- | --- |
| Les relations sont désormais natives | `--parent`, `--add-sub-issue`, `--add-blocked-by` sont arrivés récemment dans `gh`. Un modèle qui a appris un `gh` plus ancien se rabat sur une extension communautaire ou du GraphQL écrit à la main, et obtient une version dégradée de ce qui est déjà intégré. |
| Le trou, c'est le jalon | Tous les autres axes sont des flags ; seul le jalon lui-même passe par REST. Savoir précisément où est le manque évite les deux moitiés de l'erreur : inventer un appel d'API pour l'affectation, et chercher un `gh milestone` qui n'existe pas. |
| Les types ne sont pas des labels | Les types d'issue sont définis pour l'organisation et partagés par tous les dépôts. Ils sont récents, faciles à manquer, et la raison pour laquelle un label nommé `bug` ne devrait le plus souvent pas exister. |
| Les sous-issues ne sont pas des cases à cocher | Une liste de tâches dans le corps a la même apparence et ne porte aucun état. Rien ne peut l'interroger, et aucun parent ne s'en compte. |

## Là où la décision aurait pu être autre

**Aucune convention sur les noms de label.** Un schéma qui épouse le flux d'une équipe est faux pour la suivante, et une règle que personne ne suit coûte de l'attention sans rien acheter. Le module fixe sur quel axe une signification se pose ; quels labels vivent sur cet axe appartient à l'équipe.

**Aucun gabarit pour le corps de l'issue.** Ce que contient un bon rapport relève du jugement, et un modèle capable l'a déjà. Le seul fait mécanique qui mérite d'être dit — passer le corps par stdin, parce que la citation du shell abîme le markdown — est dit, et le reste est laissé tranquille.

**Nommé d'après l'hôte, pas d'après les issues.** Les pull requests, les releases et Actions tournent sur la même plateforme et présentent la même forme de problème. Le module s'appelle `github` pour que le prochain skill ait où se poser.
