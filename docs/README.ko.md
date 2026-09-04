# dotagents

**AI 에이전트가 따르는 규칙을 위한 패키지 매니저.** 스킬, 리뷰 에이전트, 훅 — module로 묶어, 직접 고른 프로젝트에 설치한다.

[English](../README.md) | [日本語](README.ja.md) | [简体中文](README.zh-CN.md) | [繁體中文](README.zh-TW.md) | 한국어 | [Deutsch](README.de.md) | [Español](README.es.md) | [Français](README.fr.md)

[![npm](https://img.shields.io/npm/v/%40hiroiku%2Fdotagents)](https://www.npmjs.com/package/@hiroiku/dotagents)
[![license: MIT](https://img.shields.io/badge/license-MIT-blue.svg)](../LICENSE)

- **module이 단위다.** 디렉터리 하나가 무엇을 필요로 하는지 선언하고, 무엇을 전달하는지 담고, 왜 존재하는지 설명한다. 프로젝트 하나에도 머신 전체에도 설치할 수 있고, 똑같이 깔끔하게 뗄 수 있다.
- **에이전트는 결과를 네이티브로 읽는다.** 런타임도, 데몬도, 셸에 얽어 넣는 것도 없다 — installer는 각 에이전트가 이미 들여다보는 자리에 평범한 파일을 쓰고 물러난다.
- **규칙집은 하나, 에이전트는 여럿.** 같은 module이 Claude Code와 Codex에 도달하되, 각 에이전트가 이해하는 형태로 전달된다.

## 설치

패키지는 하나다. 기제를 실어 오면서 **선별된 module 한 벌을 `~/.dotagents/modules/`에 당신의 것인 평범한 디렉터리로 놓는다** — 필요 없는 것은 지우고, 아쉬운 것은 고치고, 그 옆에 자기 것을 두면 된다. 내게서 온 것은 모두 `from hiroiku`라고 밝히므로, 누구의 의견을 읽고 있는지는 언제나 알 수 있다.

```sh
bun add -g @hiroiku/dotagents      # 한 번만 — 또는 npm i -g @hiroiku/dotagents

dotagents list                     # 설치할 수 있는 것
dotagents install review           # 현재 프로젝트에
dotagents install review -g        # 이 머신의 모든 프로젝트에
dotagents install review -C ~/x    # 특정 프로젝트에
```

클론할 것도, 받아올 것도, 일을 시작하기 전에 이행시켜 둘 상태도 없다: module은 패키지 안에 함께 실려 오므로, 첫 명령이 그것을 놓고 다음 명령이 곧바로 설치한다.

대상의 기본값은 현재 프로젝트다 — 영향 범위가 가장 작은 곳 — 이고, 더 넓은 범위에는 언제나 플래그가 필요하다. 무엇을 넣을지에는 기본값이 없다: module을 지명하거나 대화형으로 고른다. 비대화형 셸은 대신 골라 주지 않고 멈춘다.

Node든 Bun이든, 그 기계에 있는 쪽이면 된다 — CLI 자신이 그 자리에 있는 런타임을 고른다.

## module이란 무엇인가

`module.json`을 가진 디렉터리다. 그 밖의 모든 것은 선택이며, 종류마다 도착지는 하나다:

```
modules/<name>/
├── module.json    무엇인지, PATH에 무엇을 기대하는지, 무엇을 이어받았는지
├── README.md      왜 존재하는지 — 사람을 위한 것, 배포되지 않는다
├── AGENTS.md      모든 세션에 주입되는 규칙
├── skills/        그 순간이 왔을 때만 읽히는 규칙
├── agents/        자신의 컨텍스트와 도구를 가진 서브에이전트 역할
└── hooks/         에이전트가 일하는 동안 실행되는 이벤트 핸들러
```

| 종류 | Claude Code | Codex |
|---|---|---|
| `skills/` · `agents/` · `hooks/` | `.claude/skills/dotagents/` — **하나의 plugin 디렉터리**로, marketplace도 설치 단계도 없이 읽히며, 담긴 것을 `/dotagents:*`라는 네임스페이스에 넣는다. 훅이 `settings.json`을 한 번도 건드리지 않고 도착하는 것은 이 덕분이다 | 스킬만, `.codex/skills/dotagents-*`로 — Codex에는 plugin이 없으므로 네임스페이스가 디렉터리 이름 안으로 접혀 들어간다 |
| `AGENTS.md` | `.claude/CLAUDE.md` 안의 관리 블록 | `AGENTS.md` 안의 관리 블록 |

module은 `PATH`에 무엇을 기대하는지 선언할 수 있다. 요구 사항은 **감지될 뿐, 절대 설치되지 않는다**: `list`와 `install`은 빠진 것을 보고할 뿐 아무것도 막지 않으므로, 나중에 도구를 추가하더라도 재설치는 필요 없다.

퇴역한 이름을 이어받았다면 그것도 선언할 수 있다(`replaces`). 옛 이름을 기억하는 기록은 규칙이 간 곳까지 — 개명이든, 여럿으로 쪼개졌든 — 따라간다. installer는 자기 대조표를 갖지 않는다. 이름이 어디로 갔는지 말하는 것은 정본이고, 이행이 끝났다고 판단했을 때 지우는 것은 module의 한 줄이지 installer가 아니다.

[modules/](../modules/)가 그 집합의 정본 정의다. installer는 목록을 갖지 않는다. 파일 목록도, module 목록도: `~/.dotagents/modules/`에 있는 것을 그대로 읽는다. 이 집합은 기본값인 동시에 출발점이지, 통째로 가져가라고 놓아둔 것이 아니다: [review](../modules/review/README.md)는 그 코드를 쓰지 않은 context에 검증을 넘기고, [code](../modules/code/README.md)는 주석이 무엇을 위한 것인지를, [git](../modules/git/README.md)·[testing](../modules/testing/README.md)·[prompting](../modules/prompting/README.md)은 모델이 추측할 수 없는 관례를 저마다 그것이 듣는 순간에 읽히는 형태로 담고, [architecture](../modules/architecture/docs/README.ko.md)는 어떤 프로젝트에는 맞고 어떤 프로젝트에는 맞지 않는 의존성 규칙을, [github](../modules/github/README.md)는 issue의 어떤 장치가 어떤 의미를 담는지와, 착수부터 뒷정리까지의 한 바퀴를 담는다.

module은 그중 하나가 나에게 맞지 않더라도 나머지까지 함께 끌고 가지 않도록 잘라 두었다. 여기에 묶음은 없다: 리뷰 역할이 어울리지 않는 머신에 `git`과 `testing`만 넣을 수도 있고, 그것이 필요한 저장소 하나에만 `review`를 넣을 수도 있다.

module이 살 수 있는 곳은 하나, `~/.dotagents/modules/`뿐이다. 본보기는 패키지 안에서 읽히는 것이 아니라 그곳에 *놓인다* — 그래서 설치할 수 있는 집합과 고칠 수 있는 집합이 같은 집합이 된다. 같은 모양이면 무엇이든 된다: 어떤 경로로 얻었든, 그 디렉터리를 여기에 두면 module이다.

한번 놓인 뒤로 module은 그 사람의 것이다:

| | |
|---|---|
| 손대지 않았다 | 패키지가 새 버전을 실어 오면 따라간다 |
| 고쳤다 | 남기고 알린다(`--force`로 본보기 내용을 취한다) |
| 지웠다 | 다시는 놓이지 않는다 |

`list`는 여전히 각자의 출처를 말한다 — 내가 실어 보내는 한 벌은 `from hiroiku`, 손이 닿았으면 거기에 `edited by you`, 직접 쓴 것에는 아무것도 붙지 않는다.

## 어디에 사는가

```
~/.dotagents/         당신의 것이 한자리에
├── modules/          모든 module — 본보기도 여기에 놓인다
└── state/            무엇이 어디에 놓였는지, 본보기 중 무엇을 바꿨는지
```

installer 자체는 여기 살지 않는다. 자기가 온 곳에서 교체된다. module은 여기 산다 — 패키지가 놓은 것까지 포함해서. 그것이 이 설계의 요점이다.

`DOTAGENTS_HOME`이 이 홈 전체를 통째로 옮긴다; 그 밖에는 아무것에도 알려 줄 필요가 없다. 홈은 하나이고 모든 경로가 거기서 파생된다 — `status`와 `--help`는 지금 유효한 홈을 출력하므로, 머신이 자기 규칙이 어디서 왔는지 감추는 일은 없다.

## 명령

```sh
dotagents update               # 기록된 것을 다시 전달 — 인자 없이, 어떤 module을 골랐는지 기억한다
dotagents uninstall <module>   # module 하나만 빼고 나머지는 남긴다; 이름 없이 쓰면 전부 제거
dotagents status               # 전달된 모든 파일을 검증 — 표류가 있으면 exit 1
dotagents --help               # 모든 명령, 옵션, 예시
```

`install`은 더하고(additive) `uninstall`은 빼는(subtractive) 명령이므로, 배포가 담는 집합은 module 하나씩 쌓이고 허물어진다. `update`는 manifest가 기억하는 것에서 출발한다: 그 집합을 다시 전달하고, 눈에 띄는 옛 레이아웃을 정리한다.

**배포처에서 규칙을 지우는 것은 `uninstall`뿐이다.** `~/.dotagents/modules/`에서 module을 지우는 일은 일상의 가벼운 조작이며, 그것을 넣어 둔 모든 프로젝트를 고쳐 써도 된다는 근거가 되지는 않는다. 그래서 전달된 module이 공급원을 잃으면 `update`는 파일을 남기고, 기록을 남기고, `CLAUDE.md`의 줄도 남긴 뒤, 무엇을 남겼는지와 어떻게 지우는지를 말한다. `status`는 그 상태를 이탈로 보고한다 — 맞춰 볼 원본이 없는 이상, 맞다고는 말할 수 없기 때문이다.

**스스로 움직이는 것은 없다.** 전달하는 것은 에이전트를 지배하는 문서이므로, 전달이 저절로 일어나지도, 소리 없이 일어나지도 않는다. 어떤 명령이든 무엇을 놓았고, 무엇을 남겼고, 무엇을 지웠는지 그때마다 밝힌다.

## 갱신 경로는 하나

새 규칙은 명령을 실행해서가 아니라 패키지를 갱신해서 온다. 설치했던 방식 그대로 갱신하고, 그다음 다시 전달한다:

```sh
bun add -g @hiroiku/dotagents   # 또는 npm i -g @hiroiku/dotagents
dotagents update -g             # 그리고 dotagents update -C <프로젝트>
```

| | 어디서 오는가 | 어떻게 움직이는가 |
|---|---|---|
| **기제**(`@hiroiku/dotagents`) | npm | 설치하는 다른 도구와 똑같이 |
| **본보기 한 벌**(`hiroiku`) | 그 같은 패키지 안 | `~/.dotagents/modules/`에 놓이고, 손대지 않은 것만 따라간다 |
| **직접 만든 module** | `~/.dotagents/modules/` | 당신의 것이다; 다른 무엇도 그곳에 쓰지 않는다 |

경로는 둘이 아니라 하나다. 둘이면 반드시 한쪽이 낡고, **당신의 설정을 이행시키는 코드가 이행되는 쪽 안에 갇힌다** — 자기가 전해야 할 바로 그 갱신을 자기가 기다리게 된다. 하나면 고침과, 그 고침이 고치는 규칙이 이름 붙일 수 있는 하나의 버전으로 함께 도착한다.

## installer가 건드리는 것과 건드리지 않는 것

모든 것은 멱등이며 **해시로 소유**된다: 자신이 배치했고 지금도 인식할 수 있는 것만 건드린다. 직접 작성한 스킬은 절대 건드리지 않고, 그 자리에서 수정한 파일은 그대로 두고 보고하며(`--force`로 덮어쓰기), `uninstall`이 제거하는 것도 기록이 배치했다고 말하는 것뿐이다 — 그 외에는 건드리지 않는다. 그 기록은 `~/.dotagents/state/`에 살며, 프로젝트에는 절대 놓이지 않는다.

프로젝트 범위의 plugin은 Claude Code가 저장소 루트에서 시작했을 때, 그리고 workspace 신뢰 대화상자를 수락한 뒤에만 읽힌다. 에이전트와 훅의 변경은 다음 세션부터, 또는 `/reload-plugins` 이후에 반영된다; `SKILL.md`의 편집은 즉시 반영된다.

## 레이아웃

```
bin/agents-setup      CLI (list / install / update / uninstall / status)
test/                 installer의 계약 테스트 (npm test · bun test)
modules/              함께 실려 오는 본보기 한 벌 — 배포원은 hiroiku
├── review/           반증으로서의 리뷰, OWASP, WCAG — 자기만의 context에서
├── code/             주석은 무엇을 위한 것인가
├── git/              커밋 제목, squash, rebase
├── testing/          좋은 테스트의 열두 가지 성질
├── prompting/        프롬프트를 고치기 전에 읽을 것
├── architecture/     빌드가 강제하는 의존성 규칙
└── github/           issue가 무엇을 담을 수 있는지, 착수부터 뒷정리까지
```

패키지도 하나, 버전도 하나다: 기제와 그것이 놓는 규칙은 언제나 함께 검증된 한 짝이다. 여기의 `modules/`는 본보기가 나오는 곳이지 사는 곳이 아니다 — 한번 놓인 뒤 `~/.dotagents/modules/`의 사본은 당신의 것이다.
