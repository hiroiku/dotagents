# El arnés incluido

[English](../README.md) | [日本語](README.ja.md) | [简体中文](README.zh-CN.md) | [繁體中文](README.zh-TW.md) | [한국어](README.ko.md) | [Deutsch](README.de.md) | Español | [Français](README.fr.md)

El [README](../../../docs/README.es.md) describe el mecanismo — un único corpus, dividido en módulos que `agents-setup` instala en `~/.claude` y en el `.claude/` de cada proyecto. Este documento describe el módulo que viene con él: un arnés completo y funcional, incluido como la muestra de la que partes y que personalizas.

## Escrito para modelos que juzgan

El arnés está construido para la generación actual de modelos, que siguen el juicio mejor que las reglas. Cada instrucción es un coste por partida doble: ocupa la atención finita de la sesión y ata al modelo donde su propio juicio podría ser mejor. Así que el corpus registra solo lo que un modelo capaz no puede derivar:

- **Opiniones** — convenciones que ninguna capacidad, por grande que sea, puede adivinar: cómo se titulan los commits, qué no va nunca en un mensaje de commit
- **Anclas** — el canon externo que una pieza de trabajo debe satisfacer: OWASP Top 10, WCAG 2.2 AA
- **Fronteras** — quién puede hacer qué: un revisor que no puede editar

Todo lo demás — cómo buscar, hasta dónde profundizar, qué aspecto tiene un hallazgo — se deja al modelo. Cuando un modo de fallo se observa de verdad, se añade la instrucción más pequeña que lo previene; nada se añade por adelantado. Las guías de calibración se nombran en el skill [prompting](../skills/prompting/SKILL.md) y se leen antes de editar cualquier prompt de este corpus.

## Tres formas de entrega

- **Ubicua** ([AGENTS.md](../AGENTS.md)) — inyectada en cada sesión, gravando la atención de cada sesión, así que contiene solo las pocas líneas cuyo momento no puede confiarse a un disparador: _delega la verificación en los agentes de revisión aplicables antes de informar de la finalización_, y _los comentarios explican la intención del código — sin historia, sin ADR, sin previsiones para el futuro._
- **Momentánea** ([skills/](../skills/)) — se leen solo cuando llega su momento: [git](../skills/git/SKILL.md) en el momento del commit, [testing](../skills/testing/SKILL.md) al escribir pruebas, [prompting](../skills/prompting/SKILL.md) al editar prompts. El detalle aquí no le cuesta nada a ningún otro momento.
- **Roles** ([agents/](../agents/)) — subagentes con un contexto propio y un conjunto de herramientas restringido. Lo que un rol no debe hacer se aplica mediante las herramientas que no se le dan, no mediante una frase que deba recordar.

Claude Code recibe las tres como un único plugin, así que un skill se invoca como `/dotagents:git` y un agente como `dotagents:review`. Codex, que no tiene plugins, recibe los skills como `dotagents-git` y similares.

## Revisión — un contexto limpio, a la caza de lo que falta

El modo de fallo peculiar de los agentes de IA es "¡hecho!" cuando no está hecho — no mentira sino omisión: un contexto que solo contiene lo que escribió no puede ver lo que no escribió. Así que la verificación va a agentes de revisión cuyo contexto está limpio. Reciben los requisitos, cómo localizar el objetivo y cómo ejecutarlo — nunca el autoinforme del implementador.

[review](../agents/review.md) trabaja en dos pasadas, en orden:

1. **Existencia** — partir de cada requisito y encontrar la implementación que lo satisface. Una omisión es invisible en un diff, así que el escaneo va de los requisitos hacia el código, no del diff hacia afuera.
2. **Corrección** — examinar si lo que se encontró está bien hecho.

Los revisores leen y ejecutan; no editan. `Read, Glob, Grep, Bash` es todo el conjunto de herramientas.

## Anclas de requisitos, no listas de verificación

[security](../agents/security.md) verifica contra el [OWASP Top 10](https://owasp.org/Top10/); [accessibility](../agents/accessibility.md) contra el nivel de conformidad AA de [WCAG 2.2](https://www.w3.org/TR/WCAG22/). Cada uno nombra su canon y se detiene ahí: ninguna lista de verificación copiada (una copia se pudre a medida que el canon avanza), ningún criterio de la casa por encima (una enumeración ata el juicio a la imaginación de quien enumera). Qué categoría aplica, y cómo, se juzga contra el código que se tiene delante.

## Git — las convenciones que un modelo no puede adivinar

[git](../skills/git/SKILL.md) contiene toda la opinión en unas pocas líneas: los títulos de commit dicen qué cambió para el negocio, nunca un nombre de archivo ni un identificador interno; ninguna atribución a IA en los mensajes de commit ni en los PR; squash es el valor por defecto para la integración; seguir el upstream con rebase, no con merge.

## Pruebas — los desiderata, en tamaño de prompt

[testing](../skills/testing/SKILL.md) es [Test Desiderata](https://testdesiderata.com/) vertido en un prompt: las doce propiedades de una buena prueba — ante todo, sensible al comportamiento e insensible a la estructura, de modo que una prueba solo falla cuando se rompe un comportamiento prometido — con el encuadre del propio canon, según el cual las propiedades se contrapesan entre sí y la mezcla se elige deliberadamente. Como cualquier otra ancla de este módulo, nombra el canon y se detiene ahí.

Este módulo no declara requisitos externos: son solo prompts y definiciones de roles, y funciona allí donde funcionen Claude Code o Codex.
