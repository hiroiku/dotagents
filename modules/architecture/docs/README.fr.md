# architecture

[English](../README.md) | [日本語](README.ja.md) | [简体中文](README.zh-CN.md) | [繁體中文](README.zh-TW.md) | [한국어](README.ko.md) | [Deutsch](README.de.md) | [Español](README.es.md) | Français

Un module qui fixe le sens des dépendances, la place d'un fichier, la façon de nommer et le chemin de l'échec — sous une forme qu'une machine peut vérifier. Les règles elles-mêmes sont dans [skills/design/SKILL.md](../skills/design/SKILL.md).

## Comment faire confiance à ce qu'on ne peut pas lire ?

Le volume de changements produit par une IA a dépassé ce qu'une personne peut lire. La revue passe de chaque ligne à un échantillon, et souvent à la simple vérification que cela tourne encore. Autrement dit, on cesse de contrôler **COMMENT cela a été écrit pour faire confiance à CE QUE cela fait**.

Que cette confiance soit fondée ne dépend pas de l'endurance du lecteur, mais de ce que **le COMMENT soit tenu par un mécanisme**. Quoi qui se cache dans la partie que personne n'a lue : si la forme rend la chose impossible à écrire, elle n'y est pas.

Il y a là une tension. La limite des conventions strictes a longtemps été ce qu'une personne peut retenir. On ne pouvait pas en écrire plus que ce dont on se souvient, le respect ne se vérifiait qu'à l'œil, et donc plus les règles étaient nombreuses, moins elles tenaient. La rigueur est l'idéal qui coûte trop cher : tel était le taux de change de l'ère humaine.

Quand c'est une IA qui écrit, ce taux change. L'effort d'écrire du code répétitif disparaît presque. Ce qui coûte cher à une IA, c'est de **deviner où va chaque chose**, et une structure qui exige de deviner augmente d'autant les chances qu'une chose atterrisse au mauvais endroit. La rigueur est devenue bon marché, l'ambiguïté coûteuse. Le rapport s'est inversé.

Mais trop contraindre tue le jugement du modèle. Ces règles ne contraignent donc que la **structure**, jamais le **jugement**. Les couches sont fixées à six ; les `<kind>` à l'intérieur ne le sont pas. Les frontières sont posées ; ce qui se résout à l'intérieur, et comment, revient à celui qui écrit.

## Non pas « s'en apercevoir », mais « ne pas pouvoir l'écrire »

La plupart des règles sont déplacées de l'espace où la revue doit **s'en apercevoir** vers celui où elles sont d'emblée **impossibles à écrire**.

| Ce qui est protégé                          | Ce qui le protège                                            |
| ------------------------------------------- | ------------------------------------------------------------ |
| Une dépendance qui traverse les couches     | la configuration de build (une couche invisible ne résout pas les types) |
| Le vocabulaire technique qui gagne l'intérieur | l'absence même de paquet externe importable               |
| Un adaptateur sans port correspondant       | la règle de nommage des fichiers                             |
| Un enregistrement manquant dans la composition | les types                                                 |
| Un échec avalé en silence                   | le type de retour `Result`                                   |
| Une dépendance qui contourne le graphe      | ne pas transmettre le conteneur                              |

Ce n'est pas une conception dont les manquements se trouvent en revue, mais une conception qui **échoue au moment où on l'écrit**. Dès lors que plus personne ne lit tout, cet écart est exactement la quantité de sérénité disponible.

Qu'une chose ait une place unique et qu'un nom dise son rôle sert la même fin : c'est de la lisibilité pour les humains et, en même temps, un faible coût de recherche pour une IA.

## Ce qui est emprunté, et ce qui ne l'est pas

| Règle                                                                  | Origine                       |
| ---------------------------------------------------------------------- | ----------------------------- |
| Les dépendances pointent toujours vers l'intérieur                     | Clean Architecture            |
| Les adaptateurs se divisent en driving et driven                       | Ports et adaptateurs          |
| L'axe `<bounded_context>` ; à l'intérieur, la langue du métier seule   | DDD                           |
| Une seule racine de composition                                        | composition root de l'injection |
| L'échec est renvoyé comme valeur, `throw` réservé aux bugs             | gestion fonctionnelle des erreurs |
| Une configuration de build par couche qui fait de l'entorse une erreur de compilation | propre à ce module |
| Les tests en miroir des couches, le miroir soumis à la même règle       | propre à ce module           |

**Ce n'est pas une implémentation de la Clean Architecture.** Seule la règle de dépendance en est reprise comme invariant ; le schéma n'est pas recopié. En particulier, les ports de sortie — un presenter implémentant un port de l'application — ne sont pas utilisés.

**Ce n'est pas non plus une implémentation du DDD.** Deux choses sont empruntées, le bounded context et l'ubiquitous language ; les agrégats et le reste de la conception stratégique ne suivent pas.

**Ici les couches sont intérieures et extérieures, non hautes et basses.** À la différence du style en couches classique qui s'écoule de haut en bas, les dépendances vont toujours vers l'intérieur, et l'extérieur reste inconnu de l'intérieur.

## Là où la décision aurait pu être autre

Les points des règles qui admettaient une autre réponse, et la raison de celle qui a été retenue.

**`app-kernel` n'est pas un noyau partagé.** Le shared kernel du DDD, c'est du domaine que deux contextes conviennent de tenir en commun ; il ne s'agit pas de cela. Ici vit la machinerie sur laquelle tourne l'architecture elle-même — `Result`, le type d'erreur de base — et rien qui existe à cause de ce que ce produit fait. Être l'unique feuille que tout le monde peut importer en fait l'endroit le moins coûteux où déposer ce qui est partagé : c'est donc la couche où s'accumulent en premier les concepts propres au produit, et celle qu'il faut définir par ce qu'elle exclut. L'intérieur du métier, c'est `domain`. `app-kernel` est sous le diagramme tout entier.

**`interface` ne voit pas `domain`.** Dès qu'un contrôleur touche une entité, la forme du domaine fuit dans la forme du câblage : refactorer le domaine se met à casser le contrat vers l'extérieur, et revient précisément ce que la CA voulait empêcher. Le prix, c'est qu'un cas d'usage porte ses propres types d'entrée et de sortie et que le presenter écrive la conversion ; mais cette conversion est justement la traduction de la frontière.

**`frameworks` ne voit pas `application`.** Avec deux entrées, le travail transverse placé dans le contrôleur — authentification, validation, traduction des erreurs — **saute en silence** sur l'autre chemin. Rien n'échoue ; cela passe, simplement. C'est la manière la plus dangereuse de casser, donc l'entrée reste unique.

**Pas de ports de sortie.** Dans la forme classique où le cas d'usage pilote le presenter, le retour est `void` : **le compilateur se tait quand l'appelant ignore le résultat**. En renvoyant un `Result`, rien ne compile tant que le succès et l'échec ne sont pas traités tous les deux. La force des types l'a emporté.

**`ports/` garde son niveau supplémentaire.** Mettre les ports à la même hauteur que les autres types rend la déclaration de *ce dont on a besoin de l'extérieur* indiscernable, au nom, de la logique propre à la couche. Un niveau d'asymétrie est le prix de cette distinction visible.

**Un adaptateur porte le nom de son port en préfixe.** `google-drive-storage.integration.ts` face à `storage.integration.ts`. Le port qu'une implémentation satisfait se lit dans le nom, et un orphelin sans port correspondant se repère mécaniquement.

**Le conteneur ne franchit pas de frontière.** Si l'intérieur peut recevoir un resolver, il atteint n'importe quoi sans l'importer. **Le graphe des imports cesse de dire la vérité sur les dépendances**, et la configuration de build comme le linter deviennent impuissants. Les dépendances arrivent en arguments.

**La composition se tient à chaque niveau, avec une racine unique.** Garder le câblage à côté du code fait qu'ajouter un cas d'usage ne touche qu'un fichier voisin. La composition d'une couche ne voit que sa couche et n'enfreint donc pas sa règle. Seule la racine traverse les couches, et l'exception s'arrête là.

## Ce à quoi cela convient, et ce à quoi cela ne convient pas

Cela convient à une base de code de longue vie, avec plusieurs services externes, beaucoup travaillée par l'IA. Pour du jetable, ou pour un petit projet à dépendance externe unique, cela ne vaut pas ce que cela coûte.
