# dotagents

**Un gestor de paquetes para las reglas que siguen tus agentes de IA.** Skills, agentes de revisión y hooks — empaquetados como módulos, instalados en los proyectos que tú elijas.

[English](../README.md) | [日本語](README.ja.md) | [简体中文](README.zh-CN.md) | [繁體中文](README.zh-TW.md) | [한국어](README.ko.md) | [Deutsch](README.de.md) | Español | [Français](README.fr.md)

[![npm](https://img.shields.io/npm/v/%40hiroiku%2Fdotagents)](https://www.npmjs.com/package/@hiroiku/dotagents)
[![license: MIT](https://img.shields.io/badge/license-MIT-blue.svg)](../LICENSE)

- **El módulo es la unidad.** Un directorio declara lo que necesita, lleva consigo lo que entrega y explica por qué existe. Instálalo en un proyecto o en una máquina entera; retíralo con la misma limpieza.
- **Los agentes leen el resultado de forma nativa.** Sin runtime, sin demonio, nada conectado a tu shell — el instalador escribe archivos simples donde cada agente ya mira, y se aparta del camino.
- **Un conjunto de reglas, muchos agentes.** El mismo módulo llega a Claude Code y a Codex, a cada uno en la forma que ese agente entiende.

## Instalación

Un solo paquete. Trae el mecanismo y **coloca un conjunto curado de módulos en `~/.dotagents/modules/` como directorios corrientes que son tuyos** — borra los que no quieras, edita los que casi te sirven, y pon los tuyos al lado. Todo lo que viene de mí se anuncia como `from hiroiku`, así siempre sabes de quién es la opinión que lees.

```sh
bun add -g @hiroiku/dotagents      # una sola vez — o: npm i -g @hiroiku/dotagents

dotagents list                     # lo que puedes instalar
dotagents install review           # en el proyecto actual
dotagents install review -g        # para todos los proyectos de esta máquina
dotagents install review -C ~/x    # en un proyecto concreto
```

Nada que clonar, nada que traer, ningún estado que migrar antes de poder trabajar: los módulos viajan dentro del paquete, así que el primer comando los coloca y el siguiente ya instala.

El destino por defecto es este proyecto — el menor radio de impacto — y el alcance más amplio siempre requiere un flag. Lo que entra nunca tiene valor por defecto: nombra un módulo o elígelo de forma interactiva. Un shell no interactivo se detiene en lugar de elegir por ti.

Node o Bun, el que tenga la máquina — la propia CLI elige el runtime que esté presente.

## Qué es un módulo

Un directorio con un `module.json`. Todo lo demás es opcional, y cada tipo tiene un único destino:

```
modules/<name>/
├── module.json    qué es, qué espera en el PATH, qué nombre hereda
├── README.md      por qué existe — para personas, nunca se despliega
├── AGENTS.md      reglas inyectadas en cada sesión
├── skills/        reglas que se leen solo cuando llega su momento
├── agents/        roles de subagente, con su propio contexto y herramientas
└── hooks/         manejadores de eventos que se ejecutan mientras el agente trabaja
```

| Tipo | Claude Code | Codex |
|---|---|---|
| `skills/` · `agents/` · `hooks/` | `.claude/skills/dotagents/` — **un único directorio de plugin**, cargado sin marketplace y sin paso de instalación, que pone lo que contiene en el espacio de nombres `/dotagents:*`. Así es como llegan los hooks sin tocar nunca `settings.json` | solo skills, como `.codex/skills/dotagents-*` — Codex no tiene plugins, así que el espacio de nombres se pliega dentro del nombre del directorio |
| `AGENTS.md` | un bloque gestionado en `.claude/CLAUDE.md` | un bloque gestionado en `AGENTS.md` |

Un módulo puede declarar qué espera en el `PATH`. Los requisitos se **detectan, nunca se instalan**: `list` e `install` informan de lo que falta y no bloquean nada, así que añadir la herramienta más tarde no requiere reinstalar.

También puede declarar qué nombre retirado ha heredado (`replaces`), de modo que un registro que recuerda el nombre viejo siga las reglas hasta donde hayan ido — renombradas, o repartidas entre varias. El instalador no guarda ninguna tabla propia: quien dice adónde fue un nombre es el corpus, y cuando la migración ha cumplido su curso lo que se borra es la línea del módulo, no código del instalador.

[modules/](../modules/) es la definición canónica de ese conjunto. El instalador no mantiene ninguna lista: ni de los archivos, ni de los módulos; lee lo que haya en `~/.dotagents/modules/`. El conjunto es tanto un punto de partida como una opción por defecto, no algo que debas tomar entero: [review](../modules/review/README.md) entrega la verificación a un contexto que no escribió el código; [code](../modules/code/README.md), para qué sirve un comentario; [git](../modules/git/README.md) · [testing](../modules/testing/README.md) · [prompting](../modules/prompting/README.md), las convenciones que un modelo no puede adivinar, cada una leída en el momento en que se aplica; [architecture](../modules/architecture/docs/README.es.md), una regla de dependencias que es acertada para unos proyectos y no para otros; [github](../modules/github/README.md), qué mecanismo de un issue carga cada significado y el ciclo que va de tomarlo a recoger lo que queda.

Los módulos están cortados de modo que uno de ellos pueda no servirte sin arrastrar a los demás. Aquí no hay ningún lote: instala `git` y `testing` en una máquina donde los roles de revisión no encajan, o solo `review` en el único repositorio que los necesita.

Hay un único lugar donde puede vivir un módulo: `~/.dotagents/modules/`. El conjunto de muestra no se lee desde dentro del paquete, sino que se *coloca* ahí — así el conjunto que puedes instalar y el que puedes editar son el mismo conjunto. Sirve cualquier cosa con la misma forma: como sea que lo hayas conseguido, pon el directorio ahí y es un módulo.

Una vez colocado, el módulo es tuyo:

| | |
|---|---|
| no lo has tocado | se actualiza cuando el paquete trae una versión más nueva |
| lo has editado | se conserva y se informa (`--force` para tomar la versión de muestra) |
| lo has borrado | no se vuelve a colocar nunca |

`list` sigue diciendo de dónde vino cada uno — `from hiroiku` para el conjunto que yo entrego, con `edited by you` añadido si tiene tus cambios, y nada en absoluto para los que escribiste tú.

## Dónde vive

```
~/.dotagents/         todo lo que es tuyo, en un solo lugar
├── modules/          todos los módulos — la muestra también se coloca aquí
└── state/            qué se colocó dónde, y qué muestras has cambiado
```

El instalador mismo no vive aquí; se reemplaza allí de donde vino. Los módulos sí viven aquí — incluidos los que colocó el paquete. En eso está la clave.

`DOTAGENTS_HOME` mueve el conjunto entero; no hay que avisar a nada más. Una única raíz, y todas las rutas derivan de ella — `status` y `--help` imprimen la que está en vigor, así que una máquina nunca esconde de dónde vinieron sus reglas.

## Comandos

```sh
dotagents update               # volver a entregar lo que está registrado — sin argumentos, recuerda tu elección
dotagents uninstall <module>   # quitar un módulo, conservar el resto; sin nombrar ninguno, elimina todo
dotagents status               # verificar cada archivo entregado — exit 1 si hay deriva
dotagents --help               # todos los comandos, opciones, ejemplos
```

`install` es aditivo y `uninstall`, sustractivo, así que el conjunto de módulos de un despliegue se construye y se desmonta módulo a módulo. `update` parte de lo que el manifiesto recuerda: vuelve a entregar ese conjunto y poda cualquier disposición antigua que encuentre.

**Solo `uninstall` retira reglas de un despliegue.** Borrar un módulo de `~/.dotagents/modules/` es un acto pequeño y cotidiano; reescribir todos los proyectos en los que lo instalaste, no. Así que cuando un módulo ya entregado se queda sin origen, `update` conserva los archivos, conserva el registro, conserva sus líneas en `CLAUDE.md`, y dice qué conservó y cómo eliminarlo. `status` informa de ese estado como deriva, porque sin un origen no hay nada con lo que verificar los archivos.

**Nada se mueve por su cuenta.** Lo que se entrega son los textos que gobiernan tus agentes, así que la entrega nunca es automática ni silenciosa: cada comando dice qué colocó, qué conservó y qué retiró.

## Una sola vía de actualización

Las reglas nuevas llegan actualizando el paquete, no ejecutando un comando. Actualízalo igual que lo instalaste, y después vuelve a entregar:

```sh
bun add -g @hiroiku/dotagents   # o: npm i -g @hiroiku/dotagents
dotagents update -g             # y: dotagents update -C <proyecto>
```

| | De dónde viene | Cómo se mueve |
|---|---|---|
| **El mecanismo** (`@hiroiku/dotagents`) | npm | como cualquier otra herramienta que instalas |
| **El conjunto de muestra** (`hiroiku`) | dentro de ese mismo paquete | se coloca en `~/.dotagents/modules/` y se actualiza allí donde no lo has tocado |
| **Tus propios módulos** | `~/.dotagents/modules/` | son tuyos; nada más escribe ahí |

Una vía, no dos. Dos significaría que una de ellas se queda atrás — y que **el código que migra tu configuración quedaría atrapado dentro de aquello que se migra**, esperando la misma actualización que debía traer. Con una sola, la corrección y las reglas que corrige llegan juntas, en una versión que puedes nombrar.

## Qué toca el instalador y qué no

Todo es idempotente y de **posesión por hash**: el instalador solo toca lo que él colocó y aún reconoce. Tus propios skills nunca se tocan, los archivos que editaste in situ se conservan y se informan (`--force` para sobrescribir), y `uninstall` elimina exactamente lo que el registro dice que colocó — nada más. Ese registro vive en `~/.dotagents/state/`, nunca en un proyecto.

Los plugins de alcance de proyecto solo se cargan cuando Claude Code arranca en la raíz del repositorio, y solo después de que aceptes el diálogo de confianza del workspace. Los cambios en agentes y hooks surten efecto en la sesión siguiente o tras `/reload-plugins`; las ediciones de un `SKILL.md` se recogen de inmediato.

## Estructura

```
bin/agents-setup      la CLI (list / install / update / uninstall / status)
test/                 pruebas de contrato del instalador (npm test · bun test)
modules/              el conjunto de muestra que viaja con ella — de hiroiku
├── review/           revisión adversarial, OWASP, WCAG — en su propio contexto
├── code/             para qué sirve un comentario
├── git/              títulos de commit, squash, rebase
├── testing/          las doce propiedades de una buena prueba
├── prompting/        qué leer antes de editar un prompt
├── architecture/     una regla de dependencias que impone la compilación
└── github/           qué puede cargar un issue, y el ciclo a su alrededor
```

Un paquete, una versión: el mecanismo y las reglas que coloca son siempre la pareja que se verificó junta. Aquí `modules/` es de donde sale la muestra, no donde vive — una vez colocada, la copia en `~/.dotagents/modules/` es tuya.
