# dotagents

AI 代理框架(由 Claude Code 与 Codex 共用)的权威文库:提示词、技能与强制机制,
在此进行版本控制,并通过 [bin/agents-setup](../bin/agents-setup) 部署到各个环境。

[English](../README.md) | [日本語](README.ja.md) | 简体中文 | [繁體中文](README.zh-TW.md) | [한국어](README.ko.md) | [Deutsch](README.de.md) | [Español](README.es.md) | [Français](README.fr.md)

## 快速开始

前置需求:git、Node.js ≥ 18,以及本框架所依赖的各个器官——
**[bd (beads)](https://github.com/gastownhall/beads) 为必需项**(登记、认领、
完成关卡与合并互斥赖以运行的议题账本),
**[codegraph](https://github.com/colbymchenry/codegraph) 为推荐项**
(用于结构查询;通过 `codegraph install` 接入,按项目用 `codegraph init`
建立索引)。本框架从不替你安装这些器官——安装程序与每次会话启动时都会检测并
报告缺失项。

```sh
# 获取(一次性):该文库会成为一个你拥有并可编辑的 git 仓库
npx @hiroiku/dotagents clone ~/dotagents

# 部署:明确指定目标,或省略以进入交互式选择
~/dotagents/bin/agents-setup install project /path/to/project   # 单个项目(<dir>/.agents)
~/dotagents/bin/agents-setup install user                       # 用户级(~/.agents)
~/dotagents/bin/agents-setup install shell                      # 仅守卫(hooks/bin + 一行 ~/.zshenv)

# 跟随上游(可重复执行):展示传入的提交标题、变基、运行测试
~/dotagents/bin/agents-setup pull

# 维护
~/dotagents/bin/agents-setup update  project   # 应用文库变更,清理 payload/ 中被移除的内容
~/dotagents/bin/agents-setup status  project   # 校验 manifest、payload、文件、链接、片段
~/dotagents/bin/agents-setup --help            # 命令、目标、选项、示例
```

这些动词分为三层:**clone(获取,一次性)/ pull(跟随,可重复)/
install · update(部署)**。这不是一个供你消费的库,而是一部供你操作与编辑
的规则手册,因此该文库始终是你自己可编辑的 git 仓库。不存在从 npx 缓存或
解包的 tarball 静默部署的路径——在文库之外,部署命令要么委托给你机器上已知
的文库,要么停止执行并给出 `clone` 的操作指引。

部署重新同步从不会被动推送:当文库领先于本地部署时,位于每次会话入口处的
仪器(agents-doctor)会报告"部署版本旧于文库",此时你需要在该项目中运行
`update`。

跟随上游这一步是刻意不自动化的。你所拉取的是治理你的代理行为的规则文本,
因此 `pull` 总是先展示传入的差异(提交标题以领域语言书写——读起来就像一份
变更日志),再以变基方式整合,最后运行文库自身的测试。你的个人修改以提交
的形式存在,并叠加在上游之上。

**目标是唯一的位置参数**(`user` / `project [dir]` / `shell`),且从不设
默认值:要么明确指定,要么进入交互式选择。在非交互环境(CI、管道)中省略
它会直接停止且不写入任何内容——不存在"忘记参数就静默修改到别处"这样的
路径。而且由于只有一个位置参数,"同时指定 user 和 project"这种写法根本
无法输入:互斥性由语法本身保证,而非运行时校验。

交互式提示是一个方向键选择器(`↑/↓` 移动、`enter` 确认、`ctrl-c` 取消),
选定后会折叠为单行显示你的选择。输出带有颜色,并在 `NO_COLOR` 环境变量存在
或没有 TTY 时自动关闭颜色。

## 安装程序的行为(全部幂等)

- 将 `payload/` 复制到 `.agents/`(内容哈希会记录在 manifest `.dotagents.json`
  中)
- 建立符号链接:`.claude/CLAUDE.md → .agents/AGENTS.md`;技能
  (`.claude/skills/<name>`)与代理定义(`.claude/agents/<name>.md`)**始终
  逐个建立链接**,以便与你自己撰写的条目共存(不做整目录链接)。当 `.codex/`
  目录存在时,Codex 也会获得相同结构
- 向 `~/.zshenv` 添加一行受守卫、受管理的内容(仅用户级安装;若其引用的
  文件不存在则为空操作)
- `settings.json` 片段:`env.BASH_ENV`、`hooks.SessionStart`、
  `permissions.ask`(仅推送场景——合并场景由 `AGENTS_MERGE_SLOT_OK` 守卫
  覆盖)。当 `.codex/` 存在时,Codex 会在 `.codex/hooks.json` 中获得相同的
  SessionStart 片段
- 机器相关的产物(manifest、指标文件)通过随 payload 一同分发的
  `.agents/.gitignore` 被排除在版本控制之外。dotagents 生成的一切都留在
  自己的领地(`.agents/`)之内——bd 只写入 `.beads/`,codegraph 只写入
  `.codegraph/`

所有权原则:安装程序只会触及自己放置且仍然拥有(哈希匹配)的内容。你自己
的技能永远不会被触碰,你就地编辑过的文件会被保留并报告(可用 `--force`
覆盖),而且只有它自己添加的 settings 片段才会被移除。

### shell 层——只存在一份的共享资源

守卫(git-guard、bd 的包装器)只通过 `hooks/shellenv.sh` 到达各个会话,而
zsh 没有按项目区分的启动文件——因此不论有多少个项目在使用本框架,这一层在
**每台机器上只存在一份**。安装程序会从两侧同时维护它,使先后顺序永远不会
成为需要记住的操作知识:`install project` 会在缺失时补上最小限度的 shell
作用域;`uninstall user` 在移除其他项目共享的内容前会先询问(`--keep-shell`
可非交互式地保留它);`uninstall project` 则从不触碰这一层。

### 后期采用与团队推广

- **与顺序无关**:之后再添加 bd 或 codegraph 不需要重新安装——器官、账本
  与索引在每次会话启动时都会被动态检测。若根目录的 AGENTS.md 已由
  `bd init` 创建,它不会被接管,只会被追加一段受管理的引用区块
- **两层交付**:提示词层(`.agents/` payload、链接、引用区块)搭乘版本
  控制,**仅凭 clone 即可生效**;注入与强制层(manifest、settings 片段、
  zshenv 行、shell 守卫)是机器相关的,**由安装程序在每台机器上分别铺设**
- **从第二人起**:克隆项目、克隆 dotagents、运行
  `bin/agents-setup install project <project>`——一条命令;若 shell 层
  缺失,会在过程中一并补全。安装程序是幂等且基于哈希校验的,因此它从不会
  与版本控制交付的内容相冲突

## 理念

本框架所构建的并非"一个能力全面的代理",而是**一个把有限注意力(上下文)
拆分到各个角色、并通过外部记录将它们连接起来的组织**。以下每一条规则都
源自同一个前提:上下文是有限的,并且会随会话一同消亡。

### 三层规则——普遍、瞬时、强制

在讨论内容之前,一条规则的性质首先由**它是如何被传递的**来决定。

- **普遍规则**(核心即 AGENTS.md)——始终被注入。它们会消耗每一次会话的
  注意力,并且只能作为**尽力而为**来遵守,因此这一层只应容纳那些少数
  无法为其指明具体观察时机的规则
- **瞬时规则**(技能)——即时注入。它们只在自己的时机到来时才进入上下文,
  因此写在这里的细节不会耗费任何其他时刻的成本
- **强制规则**(hooks / bin / permissions)——从不被注入。由机制来做
  判断,因此它们不消耗任何注意力,也无法被违反(即便被违反也会留下痕迹)

**下降律**:把每一条规则尽可能推到它能到达的最低层。更低的层次同时兼具
更强与更廉价两种性质——这是一道单向的斜坡,注意力成本消失的同时强度随之
上升。提示词不过是那些尚未被转化为机制的规则的等候室。

### 分割——不容许重复的边界

子代理的切分依据不是能力,而是**不会产生重复的边界**:各单元的输入
(上下文)、搜索范围与写入目标(worktree)彼此互不相交。把同一份信息交给
两个上下文,你就要为注意力多付一次账;让两者写同一个地方,你就制造出了
一个合并点。结构无法消除的那些合并点(集成分支与账本)才是唯一受互斥
保护的对象。

分割同时也是遮蔽。不了解实现的具体情形,恰恰是审查具备检测力的原因——
**"不传递它"与"传递它"是同样有力的设计决策**。

### 器官——声明与派生

每一个工具都作为一个器官,回答一类问题,而且任何器官的原生能力都不会
在别处被重新实现。这条轴线是**声明与派生**:

- **声明的记录**(被决定的事情无法被派生出来,所以要记录下来):bd = 意图
  与状态的账本(我们决定做什么、谁在负责什么、为何某事被搁置);ADR = 决策
  的轨迹;词汇表 = 通用语言
- **派生**(凡是机器能从产物中派生出来的东西,就绝不手写):codegraph =
  代码当前的结构(符号、调用路径、影响范围);git = 变更的历史

一旦你手写了某个本可被派生的东西,漂移便随之开始。记忆也处在同一条轴线
上:状态是被派生出来的(bd prime 的查询注入);只有不变量才被声明
(bd remember)。跨会话携带上下文的不是聊天记录,而是一份带有地址的外部
记录(**上下文桥**)。

codegraph 是日常探索所用的器官,它的普遍规则("先用 explore 派生")
**通过工具描述(MCP server instructions)来传递**——绝不会被复制进提示词,
否则就会变成一份陈旧的复制品。工具的选择无法被机器校验,因此它也无法落入
强制层:零注入成本的工具层,是这条规则能够安身的最低层。本框架的提示词
只在*不*使用它就会破坏某个契约的那些时刻才把话说清楚(冻结前的事实核验、
派生横向扫描、审查者的扫描)。接入(`codegraph install`)与建立索引
(`codegraph init`)是 codegraph 自身的职责——本框架既不校验也不重新实现
它们;SessionStart 只是检测 `.codegraph/` 是否存在,并注入一行提醒。

### 对抗式审查——遗漏在被寻找之前并不存在

AI 代理特有的失败模式,是明明没做完却说"做完了!",而其本质不是说谎,
而是**遗漏**——一个上下文里只装着自己写下之物的人,是看不见自己没写下
之物的。

因此审查不是检验(查看已存在之物并对其作出判断),而是**存在性证明**:
审查者必须从需求出发,在产物中找到满足每一条需求的实现与验证——这是一次
反方向的扫描。审查者不会先被给出 diff,因为被"核实已写之物"占据的注意力,
会停止寻找那些未被写下之物。

### 下沉——循环之所以收敛,是因为知识在下沉

单纯重复审查会发散(发现会源源不断地冒出来,永无止境)。循环之所以收敛,
是因为每一轮都让知识**下沉**一层:个别发现 → 被清楚表述的缺陷类别
(被打破的契约) → 强制机制(一个结构、一个类型、一道守卫)。已经下沉的
假设会从任务清单中移除,因此审查的燃料一轮比一轮减少。当同一类缺陷第二次
出现时,这传递的信号不是修复本身错了,而是**下沉这件事错了**。

议题账本收敛于同一条原则:不要把观察堆进 open 状态;只有已经决定要做的
事才能被开立;把形态相同的议题合并起来;每一笔登记在诞生之时就要指定它
的消化路径。

### 测试——数量不等于保护的份量

一个测试只应钉住一个**契约**(业务所依赖的一项承诺);单纯复制一个症状,
不能防止任何回归。第一道防线是不会破坏的结构(在其中失败条件根本无法
存在的设计与类型);测试是留给那些结构无法封住的契约的最后手段。

### 监视者与枚举——不做元质量检查

监视者的监视者、测试的测试、守卫的守卫——这些不守护任何业务契约的元
检查很容易不断增殖,吞噬维护成本却什么也保护不了。三条原则将它们排除
在外:

- **不要增加监视者,而要下沉**——想要监视一道守卫,本身就是它所处位置
  太高的症状。答案是下降律,而不是更多的监控:把它往下推,需要被监视的
  对象就会随之消失
- **检测只走一跳**——只有结构无法封住的契约才可以拥有检测器,而检测器
  本身不再拥有检测器。检测器坏掉却无人察觉,是被接受的代价,这正是检测器
  必须保持极简的原因
- **绝不通过枚举来守护**——任何覆盖范围依赖手工维护清单的方案,都会把
  被遗忘的新增项变成无声的漏洞。应优先选择结构本身即定义的形式(payload
  原则),或机器把清单作为副产品派生出来的形式(manifest 原则)

规则文本本身不会在此重复(payload 的副本会无声腐坏)。权威索引如下:
角色、质量不变量、git 权限与 beads 的普遍规则在 [AGENTS.md](../payload/AGENTS.md)
中;前置工作与组合方式在
[agents-kickoff](../payload/skills/agents-kickoff/SKILL.md) 中;质量循环
的运作方式在
[agents-quality-loop](../payload/skills/agents-quality-loop/SKILL.md) 中;
bd 操作与记忆边界在
[agents-beads-ops](../payload/skills/agents-beads-ops/SKILL.md) 中;测试
设计在 [agents-test-design](../payload/skills/agents-test-design/SKILL.md)
中;三层结构与消融纪律在
[prompt-guidelines.md](../payload/docs/prompt-guidelines.md) 中。

## 目录结构

```
bin/agents-setup      安装程序 CLI(clone / pull / install / update / uninstall / status)
test/                 面向安装程序与强制层的契约测试(npm test)
payload/              分发内容的唯一定义;这棵树会成为 .agents/
├── AGENTS.md         普遍规则(每次会话都会读取)
├── skills/           瞬时规则(只在其时机到来时才被读取)
├── agents/           角色定义(reviewer / verifier,受工具限制)
├── hooks/            shellenv.sh(守卫传递)/ beads-session.sh(SessionStart 注入)
├── bin/              强制机制(bd、git-guard、agents-gate、agents-reap)与自检(agents-doctor)
└── docs/             更新提示词的指南
```

[payload/](../payload/) 是分发内容的权威定义;安装程序自身并不持有其内容
的清单(重复维护的清单会无声腐坏——[package.json](../package.json) 的
`files` 字段只列出了 `bin` 与 `payload`)。

## 更新提示词

请遵循 [payload/docs/prompt-guidelines.md](../payload/docs/prompt-guidelines.md)。
只在本仓库中编辑,并通过 `agents-setup update` 交付——直接编辑已安装的
目录树,会让 `update` 保护该文件并发出警告,这正是漂移检测在起作用。

## 未决问题

- 在已有账本的项目中引入本框架时,如何批量分诊既有的 open 议题(需配合
  整体性的 `AGENTS_BD_OPEN_OK=1` 授权)
- 待仪器积累足够观察结果后,复审自造术语,并进一步精简 AGENTS.md 中的
  `<beads>` 区块
