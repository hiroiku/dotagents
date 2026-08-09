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
npx @hiroiku/dotagents clone      # una vez — en ~/.dotagents/corpus, un repo git que posees
cd ~/.dotagents/corpus

bin/agents-setup list                     # lo que puedes instalar
bin/agents-setup install harness          # en el proyecto actual
bin/agents-setup install harness -g       # para todos los proyectos de esta máquina
bin/agents-setup install harness -C ~/x   # en un proyecto concreto
```

El destino por defecto es este proyecto — el menor radio de impacto — y el alcance más amplio siempre requiere un flag. Lo que entra nunca tiene valor por defecto: nombra un módulo o elígelo de forma interactiva. Un shell no interactivo se detiene en lugar de elegir por ti.

Node o Bun, el que tenga la máquina: `bunx` llega al mismo paquete, y la propia CLI elige el runtime que esté presente.

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

[modules/](../modules/) es la definición canónica de la distribución — el instalador no mantiene ninguna lista de los archivos, así que nada se pudre por quedar desincronizado. Los dos módulos que hay aquí son los que ofrece este corpus, no un conjunto que debas tomar entero: [harness](../modules/harness/docs/README.es.md) lleva agentes de revisión y las convenciones que un modelo no puede adivinar; [architecture](../modules/architecture/docs/README.es.md), una regla de dependencias que es acertada para unos proyectos y no para otros.

Tus propios módulos van en `~/.dotagents/modules/`. Se instalan con los mismos comandos y se quedan en tu máquina — nunca en un repositorio, nunca en un paquete publicado. `list` muestra ambas fuentes; un nombre reclamado dos veces es un error, no una sobrescritura silenciosa.

## Dónde vive

```
~/.dotagents/         todo lo que guarda esta herramienta, en un solo lugar
├── corpus/           el clon que editas y del que haces pull
├── modules/          tus propios módulos
└── state/            el registro de qué se colocó y dónde
```

`DOTAGENTS_HOME` mueve el conjunto entero; no hay que avisar a nada más. Una única raíz, y todas las rutas derivan de ella — `status` y `--help` imprimen la que está en vigor, así que una máquina nunca esconde de dónde vinieron sus reglas.

## Comandos

```sh
bin/agents-setup pull                 # seguir el upstream: muestra lo que viene, hace rebase de tus commits, ejecuta las pruebas
bin/agents-setup update               # volver a entregar aquí — sin argumentos, recuerda qué módulos elegiste
bin/agents-setup uninstall <module>   # quitar un módulo, conservar el resto; sin nombrar ninguno, elimina todo
bin/agents-setup status               # verificar cada archivo entregado — exit 1 si hay deriva
bin/agents-setup --help               # todos los comandos, opciones, ejemplos
```

`install` es aditivo y `uninstall`, sustractivo, así que el conjunto de módulos de un despliegue se construye y se desmonta módulo a módulo. `pull` es el único comando que cambia los módulos mismos, y nunca toca un despliegue: lo que traes con `pull` son los textos que gobiernan tus agentes, así que muestra los títulos de los commits entrantes antes de integrarlos, y nada se actualiza automáticamente.

## Qué toca el instalador y qué no

Todo es idempotente y de **posesión por hash**: el instalador solo toca lo que él colocó y aún reconoce. Tus propios skills nunca se tocan, los archivos que editaste in situ se conservan y se informan (`--force` para sobrescribir), y `uninstall` elimina exactamente lo que el registro dice que colocó — nada más. Ese registro vive en `~/.dotagents/state/`, nunca en un proyecto.

Los plugins de alcance de proyecto solo se cargan cuando Claude Code arranca en la raíz del repositorio, y solo después de que aceptes el diálogo de confianza del workspace. Los cambios en agentes y hooks surten efecto en la sesión siguiente o tras `/reload-plugins`; las ediciones de un `SKILL.md` se recogen de inmediato.

## Estructura

```
bin/agents-setup      la CLI (clone / pull / list / install / update / uninstall / status)
test/                 pruebas de contrato del instalador (npm test · bun test)
modules/              los módulos que ofrece este corpus
├── harness/          agentes de revisión, convenciones de git · testing · prompting
└── architecture/     una regla de dependencias que impone la compilación
```
