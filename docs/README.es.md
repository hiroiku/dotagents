# dotagents

**Un arnés de agentes de IA que posees.** Reglas, skills y agentes de revisión para Claude Code y Codex — versionados como un único corpus, desplegados a cada proyecto desde él.

[English](../README.md) | [日本語](README.ja.md) | [简体中文](README.zh-CN.md) | [繁體中文](README.zh-TW.md) | [한국어](README.ko.md) | [Deutsch](README.de.md) | Español | [Français](README.fr.md)

[![npm](https://img.shields.io/npm/v/%40hiroiku%2Fdotagents)](https://www.npmjs.com/package/@hiroiku/dotagents)
[![license: MIT](https://img.shields.io/badge/license-MIT-blue.svg)](../LICENSE)

- **Un corpus, muchos despliegues.** Los prompts, skills y roles de agente viven en un único repositorio git. El instalador los copia directamente en los directorios que leen Claude Code y Codex (`.claude/`, `.codex/`) — archivos simples, sin enlaces simbólicos, sin árbol intermedio.
- **Un libro de reglas, no una biblioteca.** Editas las reglas, las confirmas (commit) y sigues el upstream solo cuando tú lo decides — nada cambia a tus espaldas.
- **Escrito para modelos que juzgan.** El corpus registra solo lo que un modelo capaz no puede derivar — tus convenciones, tus anclas de requisitos, tus fronteras de roles. Todo lo demás se deja al juicio del modelo. El razonamiento vive en [El arnés incluido](../payload/docs/README.es.md).

## Cómo funciona

Un corpus alimenta cada entorno. Los despliegues son copias simples — las sesiones nunca dependen de que el corpus sea accesible, y nada se despliega a tus espaldas:

```mermaid
flowchart LR
    UP["upstream<br>github.com/hiroiku/dotagents"]
    C["tu corpus<br>~/dotagents — un repo git que editas"]
    A["despliegues<br>~/.claude + ~/.codex · .claude/ por proyecto"]
    S["sesiones<br>Claude Code · Codex"]
    UP -->|"clone · una vez"| C
    UP -->|"pull · cuando tú eliges"| C
    C -->|"install · update — copias simples"| A
    A -->|"lectura nativa"| S
```

## Inicio rápido

**1 · Consigue tu corpus** (requiere git y Node.js ≥ 18)

```sh
npx @hiroiku/dotagents clone ~/dotagents
```

Un simple `git clone`, y es tuyo: edita las reglas, confírmalas, personalízalo.

**2 · Despliégalo**

```sh
cd ~/dotagents
bin/agents-setup install project /path/to/project   # un proyecto    → <dir>/.claude + <dir>/.codex
bin/agents-setup install user                       # esta máquina   → ~/.claude + ~/.codex
```

Omite el destino para elegirlo de forma interactiva. En un shell no interactivo, un destino omitido detiene el proceso sin escribir nada — ningún valor por defecto decide nunca dónde aterrizan las reglas.

**3 · Opera**

```sh
bin/agents-setup pull                 # seguir el upstream: registro de cambios → rebase → pruebas
bin/agents-setup update  project ...  # resincronizar un despliegue
bin/agents-setup status  project ...  # verificar archivos y bloques de reglas — exit 1 si hay deriva
bin/agents-setup --help               # todos los comandos, destinos, opciones, ejemplos
```

## Los tres verbos

| Verbo | Cadencia | Qué hace |
|---|---|---|
| **clone** | una vez | materializa el corpus como un repositorio git que posees |
| **pull** | cuando tú eliges | obtiene el upstream, muestra los títulos de los commits entrantes, hace rebase de tus commits encima, ejecuta las pruebas del corpus |
| **install · update** | por máquina, por proyecto | copia el payload en los directorios que leen las herramientas |

Tres reglas los conectan:

- **No se despliega desde algo desechable.** Fuera de un corpus (una caché de npx, un tarball descomprimido) los comandos de despliegue delegan en el corpus que tu máquina ya conoce — o se detienen y señalan `clone`.
- **Seguir es deliberado.** Lo que haces pull son los textos que gobiernan tus agentes, así que `pull` muestra primero los títulos de los commits entrantes — escritos en lenguaje de dominio, se leen como un registro de cambios — y luego hace rebase y ejecuta las pruebas. Nada se actualiza automáticamente.
- **La deriva es visible.** `status` compara cada archivo y cada bloque de reglas desplegados con el corpus y termina con exit 1 si hay deriva; `update` resincroniza exactamente lo que el instalador posee.

## Dónde aterriza cada cosa

| Pieza | Destino | Entrega |
|---|---|---|
| Regla ubicua (`AGENTS.md`) | `.claude/CLAUDE.md` · `~/.codex/AGENTS.md` · el `AGENTS.md` en la raíz de un proyecto | un bloque gestionado entre marcadores — lo que tú escribiste alrededor nunca se toca, y `uninstall` restaura el archivo |
| Skills | `.claude/skills/` y `.codex/skills/` | copias simples, un directorio por skill, coexistiendo con los skills que escribiste tú mismo |
| Agentes de revisión | `.claude/agents/` | copias simples, un archivo por agente |
| Registro local de la máquina (manifest) | `~/.dotagents/` | nunca aterriza en un proyecto — el libro mayor de hashes de lo que el instalador colocó vive con la máquina |

Todo es idempotente y de **posesión por hash**: el instalador solo toca lo que él colocó y aún reconoce. Tus propios skills nunca se tocan, los archivos que editaste en su lugar se conservan y se informan (`--force` para sobrescribir), y `uninstall` elimina exactamente lo que el manifest registra — nada más. Una estructura `.agents` heredada (enlaces simbólicos, línea en zshenv, fragmentos de settings) dejada por versiones anteriores se detecta y se migra automáticamente en `install` / `update`.

## Estructura

```
bin/agents-setup      CLI del instalador (clone / pull / install / update / uninstall / status)
test/                 pruebas de contrato para el instalador (npm test)
payload/              la única definición de lo que se distribuye
├── AGENTS.md         la única regla ubicua — entregada como un bloque gestionado
├── skills/           reglas momentáneas (leídas solo cuando llega su momento)
├── agents/           roles de revisión (adversarial · seguridad · accesibilidad)
├── README.md         el arnés incluido — qué se entrega, y por qué dice tan poco
└── docs/             traducciones de esa guía (documentación; no se despliega)
```

[payload/](../payload/) es la definición canónica de la distribución: sus tipos de primer nivel deciden dónde aterrizan las cosas, y el instalador no mantiene ninguna lista de los archivos — las listas replicadas se pudren en silencio, así que [package.json](../package.json) `files` solo nombra `bin` y `payload`. Lo que entrega el payload se describe en [El arnés incluido](../payload/docs/README.es.md).

## Actualizar los prompts

El corpus lleva consigo su propia disciplina de edición: el skill [dotagents-prompting](../payload/skills/dotagents-prompting/SKILL.md) nombra las guías de ingeniería de contexto que hay que leer antes de tocar cualquier prompt o definición de agente. Edita solo en este repositorio y entrega con `agents-setup update` — editar un árbol instalado directamente hace que `update` proteja el archivo y avise, lo cual es la detección de deriva funcionando.
