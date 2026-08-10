# github

[English](../README.md) | [日本語](README.ja.md) | [简体中文](README.zh-CN.md) | [繁體中文](README.zh-TW.md) | [한국어](README.ko.md) | [Deutsch](README.de.md) | Español | [Français](README.fr.md)

Un módulo sobre qué puede cargar un issue de GitHub y qué mecanismo carga cada significado. Las reglas mismas están en [skills/issues/SKILL.md](../skills/issues/SKILL.md).

## Todo acaba siendo una etiqueta

Las etiquetas son el único mecanismo que todo modelo ya conoce. Así que absorben lo que pertenece a otra parte: el tipo de trabajo, la versión a la que apunta, la pieza de una tarea mayor de la que forma parte, aquello por lo que espera. Nada falla. El issue queda abierto, coloreado, con aspecto de estar ordenado.

Lo que se pierde es la consulta. Si la versión se escribe como etiqueta, `is:open no:milestone` no encuentra el trabajo sin versión asignada. Si los hijos solo se mencionan en prosa, el avance del padre no se puede contar. **Un tracker se escribe una vez y se lee cientos**, y cada significado puesto en el eje equivocado se resta de todas las lecturas posteriores.

Por eso este skill no es un recorrido por `gh issue`. Es el mapa del significado al eje, y es corto, porque el resto está en `--help`.

## Lo que el modelo no puede derivar

Un agente puede leer `gh issue create --help` cuando quiera. Lo que ahí no obtiene:

| | |
| --- | --- |
| Las relaciones ya son nativas | `--parent`, `--add-sub-issue` y `--add-blocked-by` llegaron a `gh` hace poco. Un modelo que aprendió un `gh` anterior recurre a una extensión de la comunidad o a GraphQL escrito a mano, y consigue una versión peor de algo que ya viene incorporado. |
| El hueco es el hito | Todos los demás ejes son flags; solo el hito en sí es REST. Saber exactamente dónde está el hueco evita las dos mitades del error: inventar una llamada a la API para la asignación, y buscar un `gh milestone` que no existe. |
| Los tipos no son etiquetas | Los tipos de issue se definen para la organización y los comparte cada repositorio. Son recientes, fáciles de pasar por alto, y la razón por la que una etiqueta llamada `bug` normalmente no debería existir. |
| Los sub-issues no son casillas | Una lista de tareas en el cuerpo se ve igual y no lleva estado. Nada puede consultarla, y ningún padre puede contarse a partir de ella. |

## Donde la decisión pudo haber sido otra

**Ninguna convención para los nombres de etiqueta.** Un esquema que encaja con el flujo de un equipo es erróneo para el siguiente, y una regla que nadie sigue cuesta atención sin comprar nada. El módulo fija en qué eje va cada significado; qué etiquetas viven en ese eje es del equipo.

**Ninguna plantilla para el cuerpo del issue.** Qué contiene un buen informe es cuestión de juicio, y un modelo capaz ya lo tiene. El único hecho mecánico que vale la pena decir —pasar el cuerpo por stdin, porque el entrecomillado del shell destroza el markdown— se dice, y lo demás se deja en paz.

**Nombrado por el host, no por los issues.** Los pull requests, las releases y Actions corren sobre la misma plataforma y tienen la misma forma de problema. El módulo se llama `github` para que el siguiente skill tenga dónde aterrizar.
