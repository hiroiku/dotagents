# dotagents

**一个面向 AI 代理所遵循规则的包管理器。** 技能、审查代理与 hooks——打包成一个个 module,安装进你所选择的项目。

[English](../README.md) | [日本語](README.ja.md) | 简体中文 | [繁體中文](README.zh-TW.md) | [한국어](README.ko.md) | [Deutsch](README.de.md) | [Español](README.es.md) | [Français](README.fr.md)

[![npm](https://img.shields.io/npm/v/%40hiroiku%2Fdotagents)](https://www.npmjs.com/package/@hiroiku/dotagents)
[![license: MIT](https://img.shields.io/badge/license-MIT-blue.svg)](../LICENSE)

- **module 是基本单位。** 一个目录声明它需要什么、承载它交付什么,并说明它为何存在。把它安装进一个项目或整台机器;也能同样干净地移除。
- **代理原生读取结果。** 没有运行时,没有守护进程,也没有任何接入你 shell 的东西——安装程序把纯粹的文件写到每个代理本就会查看的位置,然后便不再插手。
- **一套规则,多个代理。** 同一个 module 会送达 Claude Code 与 Codex,并各自以该代理所理解的形式呈现。

## 安装一个 module

```sh
bun add -g @hiroiku/dotagents      # 一次性——或 npm i -g @hiroiku/dotagents

dotagents list                     # 你可以安装什么
dotagents install harness          # 安装进当前项目
dotagents install harness -g       # 面向本机上的每一个项目
dotagents install harness -C ~/x   # 安装进指定的项目
```

没有准备步骤。各个 module 就装在这个包里,因此第一条命令便直接安装——没有要克隆的东西,没有要取回的东西,也没有必须先迁移才能开工的状态。若不想全局安装,`bunx @hiroiku/dotagents install harness` 做的是同一件事。

目标默认是当前项目——影响范围最小的那一个——而更广的作用域始终需要显式加上标志。装入什么则从不取默认值:要么指名一个 module,要么交互式挑选。非交互式 shell 会直接停止,而不会替你做出选择。

Node 或 Bun,这台机器上有哪个都行——CLI 自身会挑选那台机器上真正存在的 runtime。

## module 是什么

一个带有 `module.json` 的目录。其余一切皆为可选,且每个种类都有唯一的落地位置:

```
modules/<name>/
├── module.json    它是什么,以及它期望 PATH 上存在什么
├── README.md      它为何存在——写给人看,从不部署
├── AGENTS.md      注入每一次会话的规则
├── skills/        只在时机到来时才被读取的规则
├── agents/        子代理角色,拥有各自的上下文与工具
└── hooks/         随代理工作而运行的事件处理器
```

| 种类 | Claude Code | Codex |
|---|---|---|
| `skills/` · `agents/` · `hooks/` | `.claude/skills/dotagents/`——**一个 plugin 目录**,既不需要 marketplace 也不需要任何安装步骤即被加载,并把它所容纳的内容置于 `/dotagents:*` 命名空间之下。hooks 正是借此在完全不触碰 `settings.json` 的情况下送达 | 仅限技能,作为 `.codex/skills/dotagents-*`——Codex 没有 plugin,因此命名空间被折叠进目录名之中 |
| `AGENTS.md` | `.claude/CLAUDE.md` 中的受管块 | `AGENTS.md` 中的受管块 |

一个 module 可以声明它期望 `PATH` 上存在什么。这些依赖**只被检测,绝不被安装**:`list` 与 `install` 会报告缺少了什么,但不会阻断任何事情,因此日后再补上该工具也无需重新安装。

[modules/](../modules/) 是分发内容的权威定义——安装程序并不持有文件清单,因此不会有任何东西因失去同步而腐坏。随包附带的两个 module 既是默认项,也同样是范例,而不是一套要你整份照单全收的集合:[harness](../modules/harness/docs/README.zh-CN.md) 承载审查代理,以及模型无法自行猜出的约定;[architecture](../modules/architecture/docs/README.zh-CN.md) 则是一条依赖规则——它对某些项目而言是对的,对另一些则不然。

你自己的 module 以同样的形状放在 `~/.dotagents/modules/`。它们由同样的命令安装,并留在你的机器上——绝不进入任何仓库,也绝不进入任何已发布的包。`list` 会同时展示这两个来源;同一个名字被占用两次会被视为错误,而不是无声的覆盖。

## 它存放在哪里

```
~/.dotagents/         属于你的一切,尽在一处
├── modules/          你自己的 module
└── state/            关于什么被放到了哪里的记录
```

凡是来自 npm 的东西都不住在这里——安装程序不在,随包附带的 module 也不在。两者都在它们各自的来处被替换。

`DOTAGENTS_HOME` 可以整体迁移这个主目录;除此之外无需再告知任何地方。只有一个根,而每一条路径都由它派生——`status` 与 `--help` 会打印当前生效的那一个,因此一台机器绝不会隐瞒它的规则从何而来。

## 命令

```sh
dotagents update               # 把记录在案的内容重新交付一遍——无需参数,它记得你选择了哪些 module
dotagents uninstall <module>   # 移除一个 module,其余保持不变;不指名则移除全部
dotagents status               # 校验每一个已交付的文件——存在漂移时以退出码 1 结束
dotagents --help               # 全部命令、选项、示例
```

`install` 是增量式的,`uninstall` 是削减式的,因此一次部署所持有的集合是逐个 module 地建立与拆除的。`update` 以 manifest 所记得的内容为准:重新交付那一组,移除仍在记录中但已不再交付的东西,并清理它所发现的任何旧布局。

**没有任何东西会自行移动。** 交付的是治理你的代理行为的文本,因此交付既不会自动发生,也不会悄无声息:每条命令都会说明它放置了什么、保留了什么、移除了什么。

## 只有一条更新路径

新的规则靠更新这个包而来,而不是靠运行某条命令。用你当初安装它的方式更新它,然后重新交付:

```sh
bun add -g @hiroiku/dotagents   # 或 npm i -g @hiroiku/dotagents
dotagents update -g             # 以及 dotagents update -C <项目>
```

| | 从哪里来 | 如何更新 |
|---|---|---|
| **安装程序,以及随它一起发布的 module** | npm | 与你安装的任何工具一样 |
| **你自己的 module** | `~/.dotagents/modules/` | 它们属于你;不会有别的东西往那里写 |

一条路径,而不是两条。两条就意味着必有一条会陈旧下去——而**迁移你这套配置的代码,会被困在被迁移的那一侧**,眼巴巴等着它本该送达的那次更新。只有一条时,修复与它所修复的规则会一同抵达,成为一个你叫得出名字的版本。

## 安装程序会触碰什么、不会触碰什么

一切都是幂等且**由哈希所有**的:安装程序只会触及自己放置且仍然识别的内容。你自己的技能永远不会被触碰,你就地编辑过的文件会被保留并报告(可用 `--force` 覆盖),而 `uninstall` 只会移除记录所载明的、由它放置的内容——除此之外一概不动。这份记录存放在 `~/.dotagents/state/` 中,从不落入项目。

项目作用域的 plugin 只在 Claude Code 于仓库根目录启动时才会加载,并且要在你接受工作区信任对话框之后。对代理与 hooks 的改动会在下一次会话或执行 `/reload-plugins` 之后生效;对 `SKILL.md` 的编辑则会立即被采纳。

## 布局

```
bin/agents-setup      CLI(list / install / update / uninstall / status)
test/                 安装程序的契约测试(npm test · bun test)
modules/              随包一起发布的各个 module
├── harness/          审查代理,以及 git · testing · prompting 方面的约定
└── architecture/     由构建强制的依赖规则
```

本仓库是两者的上游,而 npm 同时携带两者:`bin/` 与 `modules/` 作为同一个版本一起发布。
