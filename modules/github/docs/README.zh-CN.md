# github

[English](../README.md) | [日本語](README.ja.md) | 简体中文 | [繁體中文](README.zh-TW.md) | [한국어](README.ko.md) | [Deutsch](README.de.md) | [Español](README.es.md) | [Français](README.fr.md)

一个关于 GitHub issue 能承载什么、哪种含义由哪种机制承载的 module。规约本身在 [skills/issues/SKILL.md](../skills/issues/SKILL.md)。

## 什么都变成了 label

label 是每个模型都已经知道的唯一机制。于是它把本不属于自己的东西一并吸收:工作的种类、瞄准的发布、它是哪件大事的一部分、它在等什么。不会报错。issue 立起来了,上了颜色,看起来井井有条。

丢掉的是提问的能力。把发布写成 label,`is:open no:milestone` 就找不到尚未安排发布的工作;子任务只在正文里被提到,父任务的进度就无从计数。**tracker 被写一次,却被读上几百次**,每一份放错轴的含义,都要从此后的每一次阅读里扣除。

所以这份 skill 不是 `gh issue` 的导览。它是一张从含义到轴的地图,而且很短——其余的都在 `--help` 里。

## 模型推导不出来的东西

`gh issue create --help` 随时可读。从那里得不到的是:

| | |
| --- | --- |
| 关系如今是原生的 | `--parent`、`--add-sub-issue`、`--add-blocked-by` 是最近才进入 `gh` 的。以旧版 `gh` 为准的模型会去找社区扩展或手写 GraphQL,得到的是一个已内置之物的劣化版。 |
| 洞在 milestone | 其余每一条轴都是 flag,唯独 milestone 本身走 REST。准确知道洞在哪里,才能同时避开两侧的错误——为指派去臆造一次 API 调用,以及去寻找并不存在的 `gh milestone`。 |
| type 不是 label | issue type 面向组织定义,所有仓库共用同一套。它很新、容易被忽略,也正是名为 `bug` 的 label 通常不该存在的原因。 |
| sub-issue 不是复选框 | 正文里的任务清单看起来一模一样,却不带状态。什么都查不了,父任务也无法据此计数。 |

## 判断可能分歧之处

**不规定 label 的命名体系。** 合某个团队流程的体系,对下一个团队就是错的;而没人遵守的规则,只花掉注意力,什么也换不来。这个 module 约束的是含义归属于哪条轴,至于那条轴上摆着哪些 label,那是团队自己的事。

**不提供正文模板。** 一份好的报告该写什么是判断,有能力的模型本就具备。值得写明的机械事实只有一条——正文从 stdin 传入,因为 shell 的引号会把 markdown 弄坏。说到这里为止,其余不碰。

**以宿主命名,而非以 issue 命名。** pull request、release、Actions 都跑在同一个平台上,问题的形状也相同。module 叫 `github`,是为了让下一份 skill 有地方落脚。
