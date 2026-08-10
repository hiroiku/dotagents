# dotagents

**Un gestor de paquetes para las reglas que siguen tus agentes de IA.** Skills, agentes de revisión y hooks — empaquetados como módulos, instalados en los proyectos que tú elijas.

[English](../README.md) | [日本語](README.ja.md) | [简体中文](README.zh-CN.md) | [繁體中文](README.zh-TW.md) | [한국어](README.ko.md) | [Deutsch](README.de.md) | Español | [Français](README.fr.md)

[![npm](https://img.shields.io/npm/v/%40hiroiku%2Fdotagents)](https://www.npmjs.com/package/@hiroiku/dotagents)
[![license: MIT](https://img.shields.io/badge/license-MIT-blue.svg)](../LICENSE)

- **El módulo es la unidad.** Un directorio declara lo que necesita, lleva consigo lo que entrega y explica por qué existe. Instálalo en un proyecto o en una máquina entera; retíralo con la misma limpieza.
- **Los agentes leen el resultado de forma nativa.** Sin runtime, sin demonio, nada conectado a tu shell — el instalador escribe archivos simples donde cada agente ya mira, y se aparta del camino.
- **Un conjunto de reglas, muchos agentes.** El mismo módulo llega a Claude Code y a Codex, a cada uno en la forma que ese agente entiende.

## Instalar un módulo

```sh
bun add -g @hiroiku/dotagents      # una vez — o: npm i -g @hiroiku/dotagents

dotagents list                     # lo que puedes instalar
dotagents install harness          # en el proyecto actual
dotagents install harness -g       # para todos los proyectos de esta máquina
dotagents install harness -C ~/x   # en un proyecto concreto
```

No hay paso de preparación. Los módulos viajan dentro del paquete, así que el primer comando ya instala — nada que clonar, nada que traer, ningún estado que migrar antes de poder trabajar. `bunx @hiroiku/dotagents install harness` hace lo mismo sin instalar nada de forma global.

El destino por defecto es este proyecto — el menor radio de impacto — y el alcance más amplio siempre requiere un flag. Lo que entra nunca tiene valor por defecto: nombra un módulo o elígelo de forma interactiva. Un shell no interactivo se detiene en lugar de elegir por ti.

Node o Bun, el que tenga la máquina — la propia CLI elige el runtime que esté presente.

## Qué es un módulo

Un directorio con un `module.json`. Todo lo demás es opcional, y cada tipo tiene un único destino:

```
modules/<name>/
├── module.json    qué es, y qué espera en el PATH
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

[modules/](../modules/) es la definición canónica de la distribución — el instalador no mantiene ninguna lista de los archivos, así que nada se pudre por quedar desincronizado. Los dos módulos que vienen incluidos son tanto ejemplos como opciones por defecto, no un conjunto que debas tomar entero: [harness](../modules/harness/docs/README.es.md) lleva agentes de revisión y las convenciones que un modelo no puede adivinar; [architecture](../modules/architecture/docs/README.es.md), una regla de dependencias que es acertada para unos proyectos y no para otros.

Tus propios módulos van en `~/.dotagents/modules/`, con la misma forma. Se instalan con los mismos comandos y se quedan en tu máquina — nunca en un repositorio, nunca en un paquete publicado. `list` muestra ambas fuentes; un nombre reclamado dos veces es un error, no una sobrescritura silenciosa.

## Dónde vive

```
~/.dotagents/         todo lo que es tuyo, en un solo lugar
├── modules/          tus propios módulos
└── state/            el registro de qué se colocó y dónde
```

Nada de lo que vino de npm vive aquí — ni el instalador ni los módulos que trae. Ambos se reemplazan allí de donde vinieron.

`DOTAGENTS_HOME` mueve el conjunto entero; no hay que avisar a nada más. Una única raíz, y todas las rutas derivan de ella — `status` y `--help` imprimen la que está en vigor, así que una máquina nunca esconde de dónde vinieron sus reglas.

## Comandos

```sh
dotagents update               # volver a entregar lo que está registrado — sin argumentos, recuerda tu elección
dotagents uninstall <module>   # quitar un módulo, conservar el resto; sin nombrar ninguno, elimina todo
dotagents status               # verificar cada archivo entregado — exit 1 si hay deriva
dotagents --help               # todos los comandos, opciones, ejemplos
```

`install` es aditivo y `uninstall`, sustractivo, así que el conjunto de módulos de un despliegue se construye y se desmonta módulo a módulo. `update` parte de lo que el manifiesto recuerda: vuelve a entregar ese conjunto, retira lo que sigue registrado pero ya no se entrega, y poda cualquier disposición antigua que encuentre.

**Nada se mueve por su cuenta.** Lo que se entrega son los textos que gobiernan tus agentes, así que la entrega nunca es automática ni silenciosa: cada comando dice qué colocó, qué conservó y qué retiró.

## Una sola vía de actualización

Las reglas nuevas llegan actualizando el paquete, no ejecutando un comando. Actualízalo igual que lo instalaste, y después vuelve a entregar:

```sh
bun add -g @hiroiku/dotagents   # o: npm i -g @hiroiku/dotagents
dotagents update -g             # y: dotagents update -C <proyecto>
```

| | De dónde viene | Cómo se mueve |
|---|---|---|
| **El instalador y los módulos que trae** | npm | como cualquier otra herramienta que instalas |
| **Tus propios módulos** | `~/.dotagents/modules/` | son tuyos; nada más escribe ahí |

Una vía, no dos. Dos significaría que una de ellas se queda atrás — y que **el código que migra tu configuración quedaría atrapado dentro de aquello que se migra**, esperando la misma actualización que debía traer. Con una sola, la corrección y las reglas que corrige llegan juntas, en una versión que puedes nombrar.

## Qué toca el instalador y qué no

Todo es idempotente y de **posesión por hash**: el instalador solo toca lo que él colocó y aún reconoce. Tus propios skills nunca se tocan, los archivos que editaste in situ se conservan y se informan (`--force` para sobrescribir), y `uninstall` elimina exactamente lo que el registro dice que colocó — nada más. Ese registro vive en `~/.dotagents/state/`, nunca en un proyecto.

Los plugins de alcance de proyecto solo se cargan cuando Claude Code arranca en la raíz del repositorio, y solo después de que aceptes el diálogo de confianza del workspace. Los cambios en agentes y hooks surten efecto en la sesión siguiente o tras `/reload-plugins`; las ediciones de un `SKILL.md` se recogen de inmediato.

## Estructura

```
bin/agents-setup      la CLI (list / install / update / uninstall / status)
test/                 pruebas de contrato del instalador (npm test · bun test)
modules/              los módulos que vienen con el paquete
├── harness/          agentes de revisión, convenciones de git · testing · prompting
└── architecture/     una regla de dependencias que impone la compilación
```

Este repositorio es el upstream de ambos, y npm lleva ambos: `bin/` y `modules/` se publican juntos, como una sola versión.
