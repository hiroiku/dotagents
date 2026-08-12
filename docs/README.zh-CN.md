# dotagents

**一个面向 AI 代理所遵循规则的包管理器。** 技能、审查代理与 hooks——打包成一个个 module,安装进你所选择的项目。

[English](../README.md) | [日本語](README.ja.md) | 简体中文 | [繁體中文](README.zh-TW.md) | [한국어](README.ko.md) | [Deutsch](README.de.md) | [Español](README.es.md) | [Français](README.fr.md)

[![npm](https://img.shields.io/npm/v/%40hiroiku%2Fdotagents)](https://www.npmjs.com/package/@hiroiku/dotagents)
[![license: MIT](https://img.shields.io/badge/license-MIT-blue.svg)](../LICENSE)

- **module 是基本单位。** 一个目录声明它需要什么、承载它交付什么,并说明它为何存在。把它安装进一个项目或整台机器;也能同样干净地移除。
- **代理原生读取结果。** 没有运行时,没有守护进程,也没有任何接入你 shell 的东西——安装程序把纯粹的文件写到每个代理本就会查看的位置,然后便不再插手。
- **一套规则,多个代理。** 同一个 module 会送达 Claude Code 与 Codex,并各自以该代理所理解的形式呈现。

## 安装

只有一个包。它带来机制,同时**把一套经过甄选的 module 作为属于你的普通目录放进 `~/.dotagents/modules/`**——不要的删掉,差一点的改掉,自己的就放在它们旁边。凡是从我这里来的都标着 `from hiroiku`,所以你永远知道自己读的是谁的意见。

```sh
bun add -g @hiroiku/dotagents      # 只此一次——或:npm i -g @hiroiku/dotagents

dotagents list                     # 你可以安装什么
dotagents install review           # 安装进当前项目
dotagents install review -g        # 面向本机上的每一个项目
dotagents install review -C ~/x    # 安装进指定的项目
```

没有要克隆的东西,没有要取回的东西,也没有必须先迁移才能开工的状态:module 就在包里一同旅行,所以第一条命令把它们放下,下一条就能直接安装。

目标默认是当前项目——影响范围最小的那一个——而更广的作用域始终需要显式加上标志。装入什么则从不取默认值:要么指名一个 module,要么交互式挑选。非交互式 shell 会直接停止,而不会替你做出选择。

Node 或 Bun,这台机器上有哪个都行——CLI 自身会挑选那台机器上真正存在的 runtime。

## module 是什么

一个带有 `module.json` 的目录。其余一切皆为可选,且每个种类都有唯一的落地位置:

```
modules/<name>/
├── module.json    它是什么、它期望 PATH 上存在什么、它接手了什么
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

它也可以声明自己接手了哪个已退役的名字(`replaces`),于是仍记着旧名字的记录会一路跟到规约的去处——无论是改名,还是拆成了好几个。安装程序自己不持有任何对照表:说出名字去了哪里的是那份正本;等到迁移走完,要删掉的是 module 里的那一行,而不是安装程序里的代码。

[modules/](../modules/) 是那一套的权威定义。安装程序并不持有清单:文件的清单没有,module 的清单也没有;它只读 `~/.dotagents/modules/` 里实际存在的东西。这一套既是默认项,也同样是起点,而不是要你整份照单全收的集合:[review](../modules/review/README.md) 把验证交给没有写过这段代码的 context;[code](../modules/code/README.md) 承载注释是用来做什么的;[git](../modules/git/README.md)·[testing](../modules/testing/README.md)·[prompting](../modules/prompting/README.md) 承载模型无法自行猜出的约定,各自只在生效的那一刻才被读到;[architecture](../modules/architecture/docs/README.zh-CN.md) 则是一条依赖规则——它对某些项目而言是对的,对另一些则不然;[github](../modules/github/README.md) 承载 issue 的哪种机制承载哪种含义。

各个 module 是这样切分的:其中一个不适合你,也不会把其余的一并拖走。这里没有捆绑:可以只把 `git` 与 `testing` 装进那台不适合审查角色的机器,也可以只把 `review` 装进唯一需要它的那个仓库。

module 只能住在一个地方:`~/.dotagents/modules/`。范例并不是从包里被读取,而是被*放到*那里——于是你能安装的集合与你能修改的集合是同一个集合。形状相同的东西都算:无论你用什么办法拿到,把那个目录放进这里,它就是一个 module。

一旦放下,module 就是你的了:

| | |
|---|---|
| 你没有动过 | 包带来新版本时会跟着更新 |
| 你改过 | 保留并告知(`--force` 取用范例的内容) |
| 你删掉了 | 再也不会被放回来 |

`list` 依然会说出各自的来源——我带来的这一套标着 `from hiroiku`,动过的会再加上 `edited by you`,你自己写的则什么也不加。

## 它存放在哪里

```
~/.dotagents/         属于你的一切,尽在一处
├── modules/          所有 module——范例也放在这里
└── state/            什么被放到了哪里,以及你改过哪些范例
```

安装程序本身不住在这里,它在自己的来处被替换。module 住在这里——包括这个包放下的那些。这正是要点所在。

`DOTAGENTS_HOME` 可以整体迁移这个主目录;除此之外无需再告知任何地方。只有一个根,而每一条路径都由它派生——`status` 与 `--help` 会打印当前生效的那一个,因此一台机器绝不会隐瞒它的规则从何而来。

## 命令

```sh
dotagents update               # 把记录在案的内容重新交付一遍——无需参数,它记得你选择了哪些 module
dotagents uninstall <module>   # 移除一个 module,其余保持不变;不指名则移除全部
dotagents status               # 校验每一个已交付的文件——存在漂移时以退出码 1 结束
dotagents --help               # 全部命令、选项、示例
```

`install` 是增量式的,`uninstall` 是削减式的,因此一次部署所持有的集合是逐个 module 地建立与拆除的。`update` 以 manifest 所记得的内容为准:重新交付那一组,并清理它所发现的任何旧布局。

**只有 `uninstall` 会从部署处移除规则。** 从 `~/.dotagents/modules/` 删掉一个 module 是日常的、轻微的动作,它不足以成为改写你装过它的每一个项目的理由。所以当一个已交付的 module 失去了来源,`update` 会保留文件、保留记录,也保留 `CLAUDE.md` 里的那些行,并说明它保留了什么、以及要怎样移除。`status` 会把这种状态报告为偏离——既然没有可比对的来源,就不能说它是对的。

**没有任何东西会自行移动。** 交付的是治理你的代理行为的文本,因此交付既不会自动发生,也不会悄无声息:每条命令都会说明它放置了什么、保留了什么、移除了什么。

## 只有一条更新路径

新的规则靠更新这个包而来,而不是靠运行某条命令。用你当初安装它的方式更新它,然后重新交付:

```sh
bun add -g @hiroiku/dotagents   # 或 npm i -g @hiroiku/dotagents
dotagents update -g             # 以及 dotagents update -C <项目>
```

| | 从哪里来 | 如何更新 |
|---|---|---|
| **机制**(`@hiroiku/dotagents`) | npm | 与你安装的任何工具一样 |
| **范例这一套**(`hiroiku`) | 就在同一个包里 | 被放进 `~/.dotagents/modules/`,只有你没动过的才跟着更新 |
| **你自己的 module** | `~/.dotagents/modules/` | 它们属于你;不会有别的东西往那里写 |

一条路径,而不是两条。两条就意味着必有一条会陈旧下去——而**迁移你这套配置的代码,会被困在被迁移的那一侧**,眼巴巴等着它本该送达的那次更新。只有一条时,修复与它所修复的规则会一同抵达,成为一个你叫得出名字的版本。

## 安装程序会触碰什么、不会触碰什么

一切都是幂等且**由哈希所有**的:安装程序只会触及自己放置且仍然识别的内容。你自己的技能永远不会被触碰,你就地编辑过的文件会被保留并报告(可用 `--force` 覆盖),而 `uninstall` 只会移除记录所载明的、由它放置的内容——除此之外一概不动。这份记录存放在 `~/.dotagents/state/` 中,从不落入项目。

项目作用域的 plugin 只在 Claude Code 于仓库根目录启动时才会加载,并且要在你接受工作区信任对话框之后。对代理与 hooks 的改动会在下一次会话或执行 `/reload-plugins` 之后生效;对 `SKILL.md` 的编辑则会立即被采纳。

## 布局

```
bin/agents-setup      CLI(list / install / update / uninstall / status)
test/                 安装程序的契约测试(npm test · bun test)
modules/              随包同行的范例一套——来自 hiroiku
├── review/           反证式审查、OWASP、WCAG——在自己的 context 里
├── code/             注释是用来做什么的
├── git/              提交标题、squash、rebase
├── testing/          好测试的十二种性质
├── prompting/        编辑提示词之前要读的东西
├── architecture/     由构建强制的依赖规则
└── github/           issue 能承载什么,该放在哪条轴上
```

一个包,一个版本:机制与它放下的规则,永远是一起被验证过的那一对。这里的 `modules/` 是范例的来处,而不是它们的住处——一旦放下,`~/.dotagents/modules/` 里的那份副本就是你的。
