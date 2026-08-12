# dotagents

**一個管理你的 AI 代理所遵循之規則的套件管理器。** 技能、審查代理與 hooks——打包為一個個 module,安裝進你所選擇的專案。

[English](../README.md) | [日本語](README.ja.md) | [简体中文](README.zh-CN.md) | 繁體中文 | [한국어](README.ko.md) | [Deutsch](README.de.md) | [Español](README.es.md) | [Français](README.fr.md)

[![npm](https://img.shields.io/npm/v/%40hiroiku%2Fdotagents)](https://www.npmjs.com/package/@hiroiku/dotagents)
[![license: MIT](https://img.shields.io/badge/license-MIT-blue.svg)](../LICENSE)

- **module 是基本單位。** 一個目錄宣告它需要什麼、承載它所交付的內容、並說明它為何存在。把它安裝進一個專案或整台機器;移除時同樣乾淨。
- **代理會原生讀取結果。** 沒有 runtime、沒有 daemon、沒有任何接進你 shell 的東西——安裝程式把純粹的檔案寫進每個代理原本就會查看的位置,然後便退到一旁。
- **一套規則,多個代理。** 同一個 module 會同時抵達 Claude Code 與 Codex,且各自採用該代理所理解的形式。

## 安裝

只有一個套件。它帶來機制,同時**把一套經過甄選的 module 當作屬於你的普通目錄放進 `~/.dotagents/modules/`**——不要的刪掉,差一點的改掉,自己的就放在它們旁邊。凡是從我這裡來的都標著 `from hiroiku`,所以你永遠知道自己讀的是誰的意見。

```sh
bun add -g @hiroiku/dotagents      # 只此一次——或:npm i -g @hiroiku/dotagents

dotagents list                     # 你可以安裝什麼
dotagents install review           # 安裝進目前的專案
dotagents install review -g        # 為本機上的每一個專案安裝
dotagents install review -C ~/x    # 安裝進指定的專案
```

沒有要複製的東西、沒有要取回的東西,也沒有必須先遷移才能開工的狀態:module 就在套件裡一同旅行,所以第一道指令把它們放下,下一道就能直接安裝。

目標預設為目前這個專案——影響範圍最小的那一個——而更廣的範圍一律需要旗標。至於要放入什麼,則從不預設:指名一個 module,或以互動方式挑選。非互動式 shell 會直接停止,而不替你做選擇。

Node 或 Bun,這台機器上有哪個都行——CLI 本身會挑選那台機器上真正存在的 runtime。

## 何謂 module

一個帶有 `module.json` 的目錄。其餘一切皆為可選,而每個種類各有一個落腳位置:

```
modules/<name>/
├── module.json    它是什麼、它期望 PATH 上有什麼、它接手了什麼
├── README.md      它為何存在——寫給人看,永不部署
├── AGENTS.md      注入每一次工作階段的規則
├── skills/        只在時機到來時才被讀取的規則
├── agents/        子代理角色,各自擁有自己的上下文與工具
└── hooks/         在代理工作時執行的事件處理器
```

| 種類 | Claude Code | Codex |
|---|---|---|
| `skills/` · `agents/` · `hooks/` | `.claude/skills/dotagents/`——**單一個 plugin 目錄**,不需要 marketplace 也不需要任何安裝步驟即被載入,並將它所容納的內容納入 `/dotagents:*` 命名空間。這正是 hooks 得以在完全不觸碰 `settings.json` 的情況下抵達的方式 | 僅限技能,以 `.codex/skills/dotagents-*` 交付——Codex 沒有 plugin,因此命名空間折進了目錄名稱之中 |
| `AGENTS.md` | `.claude/CLAUDE.md` 中的一段受管理區塊 | `AGENTS.md` 中的一段受管理區塊 |

一個 module 可以宣告它期望 `PATH` 上有什麼。這些要求是**被偵測,而非被安裝**的:`list` 與 `install` 會回報缺少了什麼,但不阻擋任何事,因此日後才補上工具也無須重新安裝。

它也可以宣告自己接手了哪個已退役的名稱(`replaces`),於是仍記著舊名稱的記錄會一路跟到規約的去處——無論是改名,或是拆成了好幾個。安裝程式自己不持有任何對照表:說出名稱去了哪裡的是那份正本;等到遷移走完,要刪掉的是 module 裡的那一行,而不是安裝程式裡的程式碼。

[modules/](../modules/) 是那一套的權威定義。安裝程式並不持有清單:檔案的清單沒有,module 的清單也沒有;它只讀 `~/.dotagents/modules/` 裡實際存在的東西。這一套既是預設,也同樣是起點,而非一組要你整套照收的東西:[review](../modules/review/README.md) 把驗證交給沒有寫過這段程式碼的 context;[code](../modules/code/README.md) 承載註解是為了什麼而存在;[git](../modules/git/README.md)·[testing](../modules/testing/README.md)·[prompting](../modules/prompting/README.md) 承載模型無法猜出的慣例,各自只在生效的那一刻才被讀到;[architecture](../modules/architecture/docs/README.zh-TW.md) 則承載一條對某些專案適切、對另一些則否的依賴規則;[github](../modules/github/README.md) 承載 issue 的哪種機制承載哪種意義。

各個 module 是這樣切分的:其中一個不適合你,也不會把其餘的一併拖走。這裡沒有套裝:可以只把 `git` 與 `testing` 裝進那台不適合審查角色的機器,也可以只把 `review` 裝進唯一需要它的那個儲存庫。

module 只能住在一個地方:`~/.dotagents/modules/`。範例並不是從套件裡被讀取,而是被*放到*那裡——於是你能安裝的集合與你能修改的集合是同一個集合。形狀相同的東西都算:無論你用什麼辦法取得,把那個目錄放進這裡,它就是一個 module。

一旦放下,module 就是你的了:

| | |
|---|---|
| 你沒有動過 | 套件帶來新版本時會跟著更新 |
| 你改過 | 保留並告知(`--force` 取用範例的內容) |
| 你刪掉了 | 再也不會被放回來 |

`list` 依然會說出各自的來源——我帶來的這一套標著 `from hiroiku`,動過的會再加上 `edited by you`,你自己寫的則什麼也不加。

## 它存放在哪裡

```
~/.dotagents/         屬於你的一切,集中於一處
├── modules/          所有 module——範例也放在這裡
└── state/            什麼被放到了哪裡,以及你改過哪些範例
```

安裝程式本身不住在這裡,它在自己的來處被替換。module 住在這裡——包括這個套件放下的那些。這正是要點所在。

`DOTAGENTS_HOME` 能把這一整套搬走;其餘一切都無須被告知。只有一個家目錄,而每一條路徑都由它衍生——`status` 與 `--help` 會印出當前生效的那一個,因此一台機器絕不會隱瞞它的規則從何而來。

## 指令

```sh
dotagents update               # 把紀錄在案的內容重新交付一次——不需引數,它記得你選了哪些 module
dotagents uninstall <module>   # 移除一個 module,其餘保留;不指名則全部移除
dotagents status               # 驗證每一個已交付的檔案——出現漂移時以結束碼 1 回報
dotagents --help               # 全部指令、選項、範例
```

`install` 是累加的,`uninstall` 是遞減的,因此一次部署所持有的集合是一個 module 一個 module 地累積與拆卸的。`update` 以 manifest 所記得的內容為準:重新交付那一組,並清理它所發現的任何舊佈局。

**只有 `uninstall` 會從部署處移除規則。** 從 `~/.dotagents/modules/` 刪掉一個 module 是日常的、輕微的動作,它不足以成為改寫你裝過它的每一個專案的理由。所以當一個已交付的 module 失去了來源,`update` 會保留檔案、保留紀錄,也保留 `CLAUDE.md` 裡的那些行,並說明它保留了什麼、以及要怎樣移除。`status` 會把這種狀態報告為偏離——既然沒有可比對的來源,就不能說它是對的。

**沒有任何東西會自行移動。** 交付的是治理你的代理的文本,因此交付既不會自動發生,也不會悄無聲息:每一道指令都會說明它放置了什麼、保留了什麼、移除了什麼。

## 只有一條更新路徑

新的規則靠更新這個套件而來,而不是靠執行某道指令。用你當初安裝它的方式更新它,然後重新交付:

```sh
bun add -g @hiroiku/dotagents   # 或 npm i -g @hiroiku/dotagents
dotagents update -g             # 以及 dotagents update -C <專案>
```

| | 從哪裡來 | 如何更新 |
|---|---|---|
| **機制**(`@hiroiku/dotagents`) | npm | 與你安裝的任何工具一樣 |
| **範例這一套**(`hiroiku`) | 就在同一個套件裡 | 被放進 `~/.dotagents/modules/`,只有你沒動過的才跟著更新 |
| **你自己的 module** | `~/.dotagents/modules/` | 它們屬於你;不會有別的東西往那裡寫 |

一條路徑,而非兩條。兩條就意味著必有一條會陳舊下去——而**遷移你這套配置的程式碼,會被困在被遷移的那一側**,乾等著它本該送達的那次更新。只有一條時,修復與它所修復的規則會一同抵達,成為一個你叫得出名字的版本。

## 安裝程式會觸碰什麼、不會觸碰什麼

一切都是冪等且**由雜湊擁有**的:安裝程式只會觸及自己放置且仍然識別的內容。你自己的技能永遠不會被觸碰,你就地編輯過的檔案會被保留並回報(可用 `--force` 覆寫),而 `uninstall` 只會移除紀錄中所載明由它放置的內容——不多不少。那份紀錄存放在 `~/.dotagents/state/` 中,永遠不落入專案。

專案範圍的 plugin 只在 Claude Code 於儲存庫根目錄啟動時才會載入,而且必須在你接受工作區信任對話框之後。對代理與 hooks 的變更會在下一次工作階段、或執行 `/reload-plugins` 之後生效;對 `SKILL.md` 的編輯則會立即被採用。

## 佈局

```
bin/agents-setup      CLI 本體(list / install / update / uninstall / status)
test/                 安裝程式的契約測試(npm test · bun test)
modules/              隨套件同行的範例一套——來自 hiroiku
├── review/           反證式審查、OWASP、WCAG——在自己的 context 裡
├── code/             註解是為了什麼而存在
├── git/              提交標題、squash、rebase
├── testing/          好測試的十二種性質
├── prompting/        編輯提示詞之前要讀的東西
├── architecture/     由建置強制的依賴規則
└── github/           issue 能承載什麼,該放在哪條軸上
```

一個套件,一個版本:機制與它放下的規則,永遠是一起被驗證過的那一對。這裡的 `modules/` 是範例的來處,而不是它們的住處——一旦放下,`~/.dotagents/modules/` 裡的那份副本就是你的。
