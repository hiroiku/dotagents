# github

[English](../README.md) | [日本語](README.ja.md) | [简体中文](README.zh-CN.md) | [繁體中文](README.zh-TW.md) | [한국어](README.ko.md) | [Deutsch](README.de.md) | Español | [Français](README.fr.md)

Un módulo sobre qué puede cargar un issue de GitHub y qué mecanismo carga cada significado. Las reglas mismas están en [skills/issues/SKILL.md](../skills/issues/SKILL.md).

## Todo acaba siendo una etiqueta

Las etiquetas son el único mecanismo que todo modelo ya conoce. Así que absorben lo que pertenece a otra parte: el tipo de trabajo, la versión a la que apunta, la pieza de una tarea mayor de la que forma parte, aquello por lo que espera. Nada falla. El issue queda abierto, coloreado, con aspecto de estar ordenado.

Lo que se pierde es la consulta. Si la versión se escribe como etiqueta, `is:open no:milestone` no encuentra el trabajo sin versión asignada. Si los hijos solo se mencionan en prosa, el avance del padre no se puede contar. **Un tracker se escribe una vez y se lee cientos**, y cada significado puesto en el eje equivocado se resta de todas las lecturas posteriores.

Por eso este skill no es un recorrido por `gh issue`. Trata de qué compra cada función: qué pregunta posterior deja contestable. No hay otra razón para recurrir a una.

## Contestable, o no

La línea que decide si valió la pena usar una función:

| | |
| --- | --- |
| Una casilla no es un sub-issue | Se ven igual. Uno es un objeto con estado propio que un padre puede contar; la otra es texto. Todo el rédito de descomponer cae de un solo lado de esa línea. |
| El bloqueo no se puede buscar | `is:blocked` parece un filtro y no lo es: nada expone la relación a una consulta. El orden sigue mereciendo un lugar en el tracker, pero solo donde alguien vaya a calcular la cola con él. |
| Un hito que no puede cerrarse no contesta nada | El burn-down y la lectura de «¿llegamos?» salen de un conjunto que termina en una fecha. `backlog` y `someday` no dan ninguna de las dos, y en silencio le quitan esa lectura a todo lo que guardan. |
| Un tipo cruza repositorios; una etiqueta, no | Los tipos son de la organización, así que una pregunta puede cruzar todos los repositorios a la vez. Dos etiquetas llamadas `bug` no se garantizan nada entre sí. |

## Donde la decisión pudo haber sido otra

**Ninguna convención para los nombres de etiqueta.** Un esquema que encaja con el flujo de un equipo es erróneo para el siguiente, y una regla que nadie sigue cuesta atención sin comprar nada. El módulo fija en qué eje va cada significado; qué etiquetas viven en ese eje es del equipo.

**Ninguna plantilla para el cuerpo del issue.** Qué contiene un buen informe es cuestión de juicio, y un modelo capaz ya lo tiene. El módulo fija adónde va un significado, nunca cómo redactarlo.

**Nombrado por el host, no por los issues.** Los pull requests, las releases y Actions corren sobre la misma plataforma y tienen la misma forma de problema. El módulo se llama `github` para que el siguiente skill tenga dónde aterrizar.
