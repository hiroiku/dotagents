# github

[English](../README.md) | [日本語](README.ja.md) | [简体中文](README.zh-CN.md) | 繁體中文 | [한국어](README.ko.md) | [Deutsch](README.de.md) | [Español](README.es.md) | [Français](README.fr.md)

一個關於 GitHub issue 能承載什麼、哪種意義由哪種機制承載的 module。規約本身在 [skills/issues/SKILL.md](../skills/issues/SKILL.md)。

## 什麼都變成了 label

label 是每個模型都已經知道的唯一機制。於是它把本不屬於自己的東西一併吸收:工作的種類、瞄準的發布、它是哪件大事的一部分、它在等什麼。不會報錯。issue 立起來了,上了顏色,看起來井井有條。

丟掉的是提問的能力。把發布寫成 label,`is:open no:milestone` 就找不到尚未安排發布的工作;子任務只在內文裡被提到,父任務的進度就無從計數。**tracker 被寫一次,卻被讀上幾百次**,每一份放錯軸的意義,都要從此後的每一次閱讀裡扣除。

所以這份 skill 不是 `gh issue` 的導覽。它是一張從意義到軸的地圖,而且很短——其餘的都在 `--help` 裡。

## 模型推導不出來的東西

`gh issue create --help` 隨時可讀。從那裡得不到的是:

| | |
| --- | --- |
| 關係如今是原生的 | `--parent`、`--add-sub-issue`、`--add-blocked-by` 是最近才進入 `gh` 的。以舊版 `gh` 為準的模型會去找社群擴充或手寫 GraphQL,得到的是一個已內建之物的劣化版。 |
| 洞在 milestone | 其餘每一條軸都是 flag,唯獨 milestone 本身走 REST。準確知道洞在哪裡,才能同時避開兩側的錯誤——為指派去臆造一次 API 呼叫,以及去尋找並不存在的 `gh milestone`。 |
| type 不是 label | issue type 面向組織定義,所有儲存庫共用同一套。它很新、容易被忽略,也正是名為 `bug` 的 label 通常不該存在的原因。 |
| sub-issue 不是核取方塊 | 內文裡的任務清單看起來一模一樣,卻不帶狀態。什麼都查不了,父任務也無法據此計數。 |

## 判斷可能分歧之處

**不規定 label 的命名體系。** 合某個團隊流程的體系,對下一個團隊就是錯的;而沒人遵守的規則,只花掉注意力,什麼也換不來。這個 module 約束的是意義歸屬於哪條軸,至於那條軸上擺著哪些 label,那是團隊自己的事。

**不提供內文範本。** 一份好的報告該寫什麼是判斷,有能力的模型本就具備。值得寫明的機械事實只有一條——內文從 stdin 傳入,因為 shell 的引號會把 markdown 弄壞。說到這裡為止,其餘不碰。

**以宿主命名,而非以 issue 命名。** pull request、release、Actions 都跑在同一個平台上,問題的形狀也相同。module 叫 `github`,是為了讓下一份 skill 有地方落腳。
