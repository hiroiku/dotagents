# dotagents

**AI 에이전트가 따르는 규칙을 위한 패키지 매니저.** 스킬, 리뷰 에이전트, 훅 — module로 묶어, 직접 고른 프로젝트에 설치한다.

[English](../README.md) | [日本語](README.ja.md) | [简体中文](README.zh-CN.md) | [繁體中文](README.zh-TW.md) | 한국어 | [Deutsch](README.de.md) | [Español](README.es.md) | [Français](README.fr.md)

[![npm](https://img.shields.io/npm/v/%40hiroiku%2Fdotagents)](https://www.npmjs.com/package/@hiroiku/dotagents)
[![license: MIT](https://img.shields.io/badge/license-MIT-blue.svg)](../LICENSE)

- **module이 단위다.** 디렉터리 하나가 무엇을 필요로 하는지 선언하고, 무엇을 전달하는지 담고, 왜 존재하는지 설명한다. 프로젝트 하나에도 머신 전체에도 설치할 수 있고, 똑같이 깔끔하게 뗄 수 있다.
- **에이전트는 결과를 네이티브로 읽는다.** 런타임도, 데몬도, 셸에 얽어 넣는 것도 없다 — installer는 각 에이전트가 이미 들여다보는 자리에 평범한 파일을 쓰고 물러난다.
- **규칙집은 하나, 에이전트는 여럿.** 같은 module이 Claude Code와 Codex에 도달하되, 각 에이전트가 이해하는 형태로 전달된다.

## module 설치

```sh
npx @hiroiku/dotagents clone      # 1회 — 직접 소유하는 git 저장소인 ~/.dotagents/corpus로
cd ~/.dotagents/corpus

bin/agents-setup list                     # 설치할 수 있는 것
bin/agents-setup install harness          # 현재 프로젝트에
bin/agents-setup install harness -g       # 이 머신의 모든 프로젝트에
bin/agents-setup install harness -C ~/x   # 특정 프로젝트에
```

대상의 기본값은 현재 프로젝트다 — 영향 범위가 가장 작은 곳 — 이고, 더 넓은 범위에는 언제나 플래그가 필요하다. 무엇을 넣을지에는 기본값이 없다: module을 지명하거나 대화형으로 고른다. 비대화형 셸은 대신 골라 주지 않고 멈춘다.

Node든 Bun이든, 그 기계에 있는 쪽이면 된다: `bunx`는 같은 패키지에 닿고, CLI 자신이 그 자리에 있는 런타임을 고른다.

## module이란 무엇인가

`module.json`을 가진 디렉터리다. 그 밖의 모든 것은 선택이며, 종류마다 도착지는 하나다:

```
modules/<name>/
├── module.json    무엇인지, 그리고 PATH에 무엇을 기대하는지
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

[modules/](../modules/)가 배포물의 정본 정의다 — installer 쪽에는 파일 목록이 따로 존재하지 않으므로, 어긋난 채 낡아가는 것도 없다. 여기 있는 두 module은 이 정본이 제공하는 것이지, 통째로 가져가라고 놓아둔 집합이 아니다: [harness](../modules/harness/docs/README.ko.md)는 리뷰 에이전트와 모델이 추측할 수 없는 관례를 담고, [architecture](../modules/architecture/docs/README.ko.md)는 어떤 프로젝트에는 맞고 어떤 프로젝트에는 맞지 않는 의존성 규칙을 담는다.

직접 만든 module은 `~/.dotagents/modules/`에 둔다. 같은 명령으로 설치되며 이 머신 안에 머문다 — 저장소에도, 공개된 패키지에도 절대 들어가지 않는다. `list`는 두 출처를 모두 보여주며, 한 이름을 둘이 주장하면 조용한 덮어쓰기가 아니라 오류가 된다.

## 어디에 사는가

```
~/.dotagents/         이 도구가 간직하는 모든 것이 한자리에
├── corpus/           직접 편집하고 pull하는 클론
├── modules/          직접 만든 module
└── state/            무엇이 어디에 놓였는지의 기록
```

`DOTAGENTS_HOME`이 이 홈 전체를 통째로 옮긴다; 그 밖에는 아무것에도 알려 줄 필요가 없다. 홈은 하나이고 모든 경로가 거기서 파생된다 — `status`와 `--help`는 지금 유효한 홈을 출력하므로, 머신이 자기 규칙이 어디서 왔는지 감추는 일은 없다.

## 명령

```sh
bin/agents-setup pull                 # upstream 추종: 무엇이 들어오는지 보여주고, 커밋을 rebase하고, 테스트를 실행한다
bin/agents-setup update               # 여기에 재전달 — 인자 없이, 어떤 module을 골랐는지 기억한다
bin/agents-setup uninstall <module>   # module 하나만 빼고 나머지는 남긴다; 이름 없이 쓰면 전부 제거
bin/agents-setup status               # 전달된 모든 파일을 검증 — 표류가 있으면 exit 1
bin/agents-setup --help               # 모든 명령, 옵션, 예시
```

`install`은 더하고(additive) `uninstall`은 빼는(subtractive) 명령이므로, 배포가 담는 집합은 module 하나씩 쌓이고 허물어진다. module 자체를 바꾸는 명령은 `pull`뿐이며, 그것은 배포를 절대 건드리지 않는다: pull로 받아오는 것은 에이전트를 지배하는 문서이므로, 통합하기 전에 들어오는 커밋 제목을 보여주며, 자동으로 업데이트되는 것은 없다.

## installer가 건드리는 것과 건드리지 않는 것

모든 것은 멱등이며 **해시로 소유**된다: 자신이 배치했고 지금도 인식할 수 있는 것만 건드린다. 직접 작성한 스킬은 절대 건드리지 않고, 그 자리에서 수정한 파일은 그대로 두고 보고하며(`--force`로 덮어쓰기), `uninstall`이 제거하는 것도 기록이 배치했다고 말하는 것뿐이다 — 그 외에는 건드리지 않는다. 그 기록은 `~/.dotagents/state/`에 살며, 프로젝트에는 절대 놓이지 않는다.

프로젝트 범위의 plugin은 Claude Code가 저장소 루트에서 시작했을 때, 그리고 workspace 신뢰 대화상자를 수락한 뒤에만 읽힌다. 에이전트와 훅의 변경은 다음 세션부터, 또는 `/reload-plugins` 이후에 반영된다; `SKILL.md`의 편집은 즉시 반영된다.

## 레이아웃

```
bin/agents-setup      CLI (clone / pull / list / install / update / uninstall / status)
test/                 installer의 계약 테스트 (npm test · bun test)
modules/              이 정본이 제공하는 module들
├── harness/          리뷰 에이전트, git · testing · prompting 관례
└── architecture/     빌드가 강제하는 의존성 규칙
```
