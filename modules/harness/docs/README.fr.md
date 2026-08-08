# Le harnais fourni

[English](../README.md) | [日本語](README.ja.md) | [简体中文](README.zh-CN.md) | [繁體中文](README.zh-TW.md) | [한국어](README.ko.md) | [Deutsch](README.de.md) | [Español](README.es.md) | Français

[README](../../../docs/README.fr.md) décrit le mécanisme — un unique corpus, découpé en modules qu'`agents-setup` installe dans `~/.claude` et dans le `.claude/` de chaque projet. Ce document décrit le module que tu reçois avec lui : un harnais complet et fonctionnel, fourni comme l'exemple dont tu pars et que tu personnalises.

## Écrit pour des modèles qui jugent

Le harnais est construit pour la génération actuelle de modèles, qui suivent mieux le jugement que les règles. Chaque instruction est un coût à double titre : elle occupe l'attention finie de la session, et elle lie le modèle là où son propre jugement serait peut-être meilleur. Le corpus n'enregistre donc que ce qu'un modèle capable ne peut pas dériver :

- **Des opinions** — des conventions qu'aucune capacité, si grande soit-elle, ne peut deviner : comment les commits sont titrés, ce qui ne va jamais dans un message de commit
- **Des ancres** — le canon externe qu'un travail doit satisfaire : l'OWASP Top 10, WCAG 2.2 AA
- **Des frontières** — qui a le droit de faire quoi : un relecteur qui ne peut pas éditer

Tout le reste — comment chercher, jusqu'où creuser, à quoi ressemble un constat — est laissé au modèle. Quand un mode d'échec est effectivement observé, la plus petite instruction qui le prévient est ajoutée ; rien n'est ajouté par avance. Les guides de calibration sont nommés dans le skill [prompting](../skills/prompting/SKILL.md) et se lisent avant de modifier le moindre prompt de ce corpus.

## Trois formes de livraison

- **Omniprésente** ([AGENTS.md](../AGENTS.md)) — injectée dans chaque session, taxant l'attention de chacune, elle ne tient donc que les quelques lignes dont le moment ne peut être confié à aucun déclencheur : _délègue la vérification aux agents de revue applicables avant de signaler l'achèvement_, et _les commentaires expliquent l'intention du code — pas d'historique, pas d'ADR, pas de dispositions pour l'avenir._
- **Momentanées** ([skills/](../skills/)) — lues seulement quand leur moment arrive : [git](../skills/git/SKILL.md) au moment du commit, [testing](../skills/testing/SKILL.md) au moment d'écrire des tests, [prompting](../skills/prompting/SKILL.md) lors de la modification des prompts. Ici, le détail ne coûte rien à aucun autre moment.
- **Rôles** ([agents/](../agents/)) — des subagents dotés d'un contexte propre et d'un jeu d'outils restreint. Ce qu'un rôle ne doit pas faire est imposé par les outils qu'on ne lui donne pas, non par une phrase qu'il devrait retenir.

Claude Code reçoit les trois comme un unique plugin, si bien qu'un skill s'invoque par `/dotagents:git` et un agent par `dotagents:review`. Codex, qui n'a pas de plugins, reçoit les skills sous les noms `dotagents-git` et consorts.

## Revue — un contexte propre, en chasse de ce qui manque

Le mode d'échec propre aux agents IA est le « c'est fait ! » alors que ce n'est pas fait — pas un mensonge mais une omission : un contexte qui ne contient que ce qu'il a écrit ne peut pas voir ce qu'il n'a pas écrit. La vérification va donc à des agents de revue dont le contexte est propre. Ils reçoivent les exigences, la façon de localiser la cible et la façon de l'exécuter — jamais le compte rendu que l'implémenteur fait de son propre travail.

[review](../agents/review.md) travaille en deux passes, dans l'ordre :

1. **Existence** — partir de chaque exigence et trouver l'implémentation qui la satisfait. Une omission est invisible dans un diff, donc le scan va des exigences vers le code, non du diff vers l'extérieur.
2. **Justesse** — examiner si ce qui a été trouvé est fait correctement.

Les relecteurs lisent et exécutent ; ils n'éditent pas. `Read, Glob, Grep, Bash` est le jeu d'outils complet.

## Des ancres d'exigences, pas des checklists

[security](../agents/security.md) vérifie contre l'[OWASP Top 10](https://owasp.org/Top10/) ; [accessibility](../agents/accessibility.md) contre le niveau de conformité AA de [WCAG 2.2](https://www.w3.org/TR/WCAG22/). Chacun nomme son canon et s'arrête là : pas de checklist copiée (une copie pourrit à mesure que le canon avance), pas de critères maison par-dessus (une énumération lie le jugement à l'imagination de celui qui énumère). Quelle catégorie s'applique, et comment, se juge sur le code en présence.

## Git — les conventions qu'un modèle ne peut pas deviner

[git](../skills/git/SKILL.md) tient toute l'opinion en quelques lignes : les titres de commit disent ce qui a changé pour le métier, jamais un nom de fichier ni un identifiant interne ; pas d'attribution à l'IA dans les messages de commit ni dans les PR ; le squash est le défaut pour l'intégration ; on suit l'upstream par rebase, pas par merge.

## Tests — les desiderata, à la taille d'un prompt

[testing](../skills/testing/SKILL.md) est [Test Desiderata](https://testdesiderata.com/) restitué en prompt : les douze propriétés d'un bon test — avant tout sensible au comportement et insensible à la structure, de sorte qu'un test n'échoue que lorsqu'un comportement promis se rompt — avec le cadrage du canon lui-même, selon lequel les propriétés s'arbitrent les unes contre les autres et le dosage se choisit délibérément. Comme toute autre ancre de ce module, il nomme le canon et s'arrête là.

Ce module ne déclare aucun prérequis externe : il n'est fait que de prompts et de définitions de rôles, et fonctionne partout où tournent Claude Code ou Codex.
