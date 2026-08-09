# dotagents

**一個管理你的 AI 代理所遵循之規則的套件管理器。** 技能、審查代理與 hooks——打包為一個個 module,安裝進你所選擇的專案。

[English](../README.md) | [日本語](README.ja.md) | [简体中文](README.zh-CN.md) | 繁體中文 | [한국어](README.ko.md) | [Deutsch](README.de.md) | [Español](README.es.md) | [Français](README.fr.md)

[![npm](https://img.shields.io/npm/v/%40hiroiku%2Fdotagents)](https://www.npmjs.com/package/@hiroiku/dotagents)
[![license: MIT](https://img.shields.io/badge/license-MIT-blue.svg)](../LICENSE)

- **module 是基本單位。** 一個目錄宣告它需要什麼、承載它所交付的內容、並說明它為何存在。把它安裝進一個專案或整台機器;移除時同樣乾淨。
- **代理會原生讀取結果。** 沒有 runtime、沒有 daemon、沒有任何接進你 shell 的東西——安裝程式把純粹的檔案寫進每個代理原本就會查看的位置,然後便退到一旁。
- **一套規則,多個代理。** 同一個 module 會同時抵達 Claude Code 與 Codex,且各自採用該代理所理解的形式。

## 安裝一個 module

```sh
bun add -g @hiroiku/dotagents      # 一次性——或 npm i -g @hiroiku/dotagents

dotagents list                     # 你可以安裝什麼
dotagents install harness          # 安裝進目前的專案
dotagents install harness -g       # 為本機上的每一個專案安裝
dotagents install harness -C ~/x   # 安裝進指定的專案
```

沒有另外的準備步驟。第一道指令會先把 corpus——那個你所擁有的規則 git 儲存庫——複製進 `~/.dotagents/corpus`,然後繼續把事情做完。你敲下的指令,第一天與之後的每一天都相同。

目標預設為目前這個專案——影響範圍最小的那一個——而更廣的範圍一律需要旗標。至於要放入什麼,則從不預設:指名一個 module,或以互動方式挑選。非互動式 shell 會直接停止,而不替你做選擇。

Node 或 Bun,這台機器上有哪個都行:`bunx` 取到的是同一個套件,而 CLI 本身會挑選那台機器上真正存在的 runtime。

## 何謂 module

一個帶有 `module.json` 的目錄。其餘一切皆為可選,而每個種類各有一個落腳位置:

```
modules/<name>/
├── module.json    它是什麼、以及它期望 PATH 上有什麼
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

[modules/](../modules/) 是這份分發內容的權威定義——安裝程式並不持有檔案的清單,因此沒有任何東西會無聲地失去同步。這裡的兩個 module 是這份文庫所提供的,而非一組要你整套照收的東西:[harness](../modules/harness/docs/README.zh-TW.md) 承載審查代理,以及模型無法猜出的慣例;[architecture](../modules/architecture/docs/README.zh-TW.md) 則承載一條對某些專案適切、對另一些則否的依賴規則。

你自己的 module 放進 `~/.dotagents/modules/`。它們由完全相同的指令安裝,並留在你的機器上——永不進入任何儲存庫,也永不進入任何已發布的套件。`list` 會同時顯示這兩個來源;同一個名稱被佔用兩次是一個錯誤,而非一次無聲的覆寫。

## 它存放在哪裡

```
~/.dotagents/         這個工具所保存的一切,集中於一處
├── corpus/           你所編輯與拉取的那份複本
├── modules/          你自己的 module
└── state/            何物被放置於何處的紀錄
```

`DOTAGENTS_HOME` 能把這一整套搬走;其餘一切都無須被告知。只有一個家目錄,而每一條路徑都由它衍生——`status` 與 `--help` 會印出當前生效的那一個,因此一台機器絕不會隱瞞它的規則從何而來。

## 指令

```sh
dotagents update               # 先跟隨上游,再重新交付——不需引數,它記得你選了哪些 module
dotagents uninstall <module>   # 移除一個 module,其餘保留;不指名則全部移除
dotagents status               # 驗證每一個已交付的檔案——出現漂移時以結束碼 1 回報
dotagents pull                 # 只跟隨上游,不重新交付
dotagents --help               # 全部指令、選項、範例
```

`install` 是累加的,`uninstall` 是遞減的,因此一次部署所持有的集合是一個 module 一個 module 地累積與拆卸的。讓兩邊都保持最新的唯一指令是 `update`:它以 `pull` 相同的方式跟隨上游,然後把 manifest 所記得的內容重新交付一次。

**沒有任何東西會自行移動。** 你所取回的是治理你的代理的文本,因此在整合之前,會先顯示傳入的提交標題。上游有差異時,每天只告知一次——而不是替你更新。

你全域安裝的那道指令只是一層很薄的入口:它找到 corpus(沒有就先複製一個),然後把事情交給它。實作與規則都住在 corpus 裡,所以不必重新安裝這道指令本身,只靠 `update` 就能跟上最新。

## 安裝程式會觸碰什麼、不會觸碰什麼

一切都是冪等且**由雜湊擁有**的:安裝程式只會觸及自己放置且仍然識別的內容。你自己的技能永遠不會被觸碰,你就地編輯過的檔案會被保留並回報(可用 `--force` 覆寫),而 `uninstall` 只會移除紀錄中所載明由它放置的內容——不多不少。那份紀錄存放在 `~/.dotagents/state/` 中,永遠不落入專案。

專案範圍的 plugin 只在 Claude Code 於儲存庫根目錄啟動時才會載入,而且必須在你接受工作區信任對話框之後。對代理與 hooks 的變更會在下一次工作階段、或執行 `/reload-plugins` 之後生效;對 `SKILL.md` 的編輯則會立即被採用。

## 佈局

```
bin/agents-setup      CLI 本體(clone / pull / list / install / update / uninstall / status)
test/                 安裝程式的契約測試(npm test · bun test)
modules/              這份文庫提供的 module
├── harness/          審查代理,以及 git · testing · prompting 的慣例
└── architecture/     由建置強制的依賴規則
```
