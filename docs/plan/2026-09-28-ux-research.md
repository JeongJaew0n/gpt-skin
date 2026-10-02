# UX 조사 — 세 번 되풀이한 결과

2026-09-28 · 조사 대상 0.9.1 → **0.12.0 에서 다시 확인** (terminal · sheet · none)

> **0.12.0 재확인** <sub>2026-09-29</sub> — 조사하는 사이 다른 작업이 0.10.0~0.12.0 을 올렸다(재주입 · 새로고침 직후 단축키 ·
> none 명령줄 바깥 누르면 닫기 · `:clear` · 팝업·설정 디자인 개편). 결론을 새 코드에 다시 대조했다.
> - **esc 버그는 그대로다** — 같은 재현 스크립트로 `{"stop":1,"suggestClosed":1}`.
> - A2~A5 · B1~B6 은 모두 아직 없다 (팝업 경고 표시 · 시트 커서 reduced-motion · ⌘K 고정 표기 · role=status ·
>   새 응답 알림 · 시트 메시지 복사 · chrome.commands · 토글 키 `e.key`).
> - 설치 이벤트 처리(`onInstalled`)가 생겼다 — 설치 전부터 열려 있던 탭에 스크립트를 다시 넣는다. 환영 페이지는 없다.
>   B3 는 이 처리기의 `install` 갈래에 붙이면 된다. 설치 직후 열린 탭에서 바로 쓸 수 있게 된 것만으로 첫 실행의
>   "아무 일도 안 일어남" 은 줄었다.
> - none 명령줄이 바깥을 누르면 닫히게 됐다 — '열림 표시 강화' 를 낮춘 판단(§4)을 더 받쳐 준다.

사용자 요청: "전체적으로 UX 를 조사해서 어떻게 고치면 좋을지 연구하고, 그게 좋을지 또 연구하라. 세 번 반복. 적극 서칭."

- **1차** — 현재 UX 를 코드로 점검하고, 바깥 자료를 넓게 찾아 후보안 15개를 만들었다.
- **2차** — 후보안을 코드와 대조했다(이미 된 것 · 실제 버그 · 없는 것). 반론 자료를 찾았다.
- **3차** — 남은 안을 하나씩 다시 따졌다(부작용 · 대안 · 기준의 실제 강도). 순위를 매겼다.

검색은 조사 에이전트 셋이 약 60회, 직접 약 12회 했다. 원문을 연 것과 요약만 본 것을 구분했다.
**원본 ChatGPT 의 동작은 이번에 실측하지 못했다** — 브라우저가 두 대 연결돼 있어 고르려면 물어야 했고,
이번 작업은 묻지 않고 진행했다. 원본 단축키는 웹 자료 기준 `[가정]` 이고 확인 방법을 적었다.

---

## 0. 결론 — 무엇을 먼저 고칠까

| 순위 | 안 | 근거의 강도 | 비용 |
|---|---|---|---|
| **A1** | **esc 한 번에 '닫기' 와 '생성 중단' 이 같이 일어나는 버그** | `[확정]` 코드로 재현 | 작음 |
| A2 | 경고(노랑) 상태에서 팝업이 경고 내용을 보여 준다 | `[확정]` 지금 없음 | 작음 |
| A3 | 시트의 깜빡이는 커서가 '움직임 줄이기' 를 따른다 | `[확정]` 터미널만 따름 | 아주 작음 |
| A4 | 단축키 안내를 운영체제에 맞게 (⌘K / Ctrl+K) | `[확정]` 지금 ⌘K 고정 | 아주 작음 |
| A5 | 생성 상태를 `role=status` 한 곳으로 알린다 (스크린리더) | 자료 여럿, 비용 최소 | 작음 |
| B1 | 단축키 정리 — 토글 키 판별을 물리 키로, 사이드바에 ⌘/Ctrl+⇧S, 바꿀 수 있는 대체 키 | `[가정]` 일부 실측 필요 | 중간 |
| B2 | ⌘K 를 '대화 검색 + 명령' 으로 — 원본 ⌘K(검색) 손버릇을 살린다 | 자료 + 원본 `[가정]` | 중간 |
| B3 | 설치 직후 환영 페이지 한 장 (업데이트 때는 안 연다) | 자료 여럿 | 작음 |
| B4 | 위로 스크롤한 동안 새 응답이 오면 알린다 | 자료 여럿, 지금 없음 | 작음 |
| B5 | 시트에서 메시지 전체를 복사한다 | 지금 셀 단위만 | 작음 |
| B6 | 팝업에서 '진단 복사' (버전 · 빌드 · 실패한 점검) | 타 확장 사례 | 작음 |
| C | 보류·기각 여덟 가지 — §4 | | |

**한 줄 요약** — 가장 급한 것은 조사하다 찾은 esc 버그다. 그다음은 '발견성'(단축키를 어떻게 알게 하나)과
'신뢰'(고장·경고를 어떻게 알리나)다. 겉모양을 크게 바꿀 근거는 찾지 못했다.

---

## 1. 1차 — 지금 어떤가

### 1.1 코드에서 본 현재 UX

| 항목 | 관측 |
|---|---|
| 키 | `Ctrl+`` 토글 · `⌘/Ctrl+K` 팔레트 · `Ctrl+B` 사이드바 · `Ctrl+;` none 명령줄 · `⌥+/-/0` 글자 크기 · esc(다섯 가지 일) · `/` 사이드바 검색 · ↑↓ 기록 · Tab 완성 · 시트 방향키·⌘C |
| esc 가 하는 일 | 후보 닫기 · 기록 초안 복귀 · none 닫기 · 사이드바 닫기 · 생성 중단 — 한 키가 다섯 |
| 첫 실행 | 설치 이벤트 처리도 환영 화면도 없다. 기본값이 꺼짐이라 설치 직후에는 아무 변화가 없다 |
| 발견성 | 터미널 상태줄 `⌘K 팔레트 :help esc·^C 중단` (운영체제 무관 ⌘) · 부팅 줄 `:help 로 명령, ^\` 로 원본 토글` · 시트에는 단축키 안내 없음 · none 의 `Ctrl+;` 는 README 에만 |
| 다국어 | 사전 밖 한국어 문구 약 200줄 (명령 91 · 사이드바 45 · 부팅 27 · 터미널 15 …). 영어 사용자에게도 한국어가 보인다 |
| 이번 세션의 사용자 보고 | `:skin none` 뒤 "터미널 흔적" · `Ctrl+;` 로 닫고 싶다 · `Ctrl+B` 가 안 먹고 포커스가 빠진다 — 셋 다 0.6.1·0.6.2 에서 고쳤다 ([이슈](../issue/2026-09-24-none-ctrl-b-closes-hidden-sidebar.md)) |

### 1.2 바깥 자료의 핵심

**키보드·팔레트** — 팔레트는 어디서나 같은 키로 여닫고 모든 명령을 모은다. 항목 옆에 단축키를 보여 주면
쓰다 보면 키를 배운다(Superhuman · Linear · VS Code). 접두어로 범위를 나눈다(GitHub: 없으면 검색, `>` 면 명령).
`chrome.commands` 는 백틱·세미콜론을 받지 않고 Ctrl 이나 Alt 가 있어야 하며, 맥에서는 `Ctrl` 이 ⌘ 로 바뀐다.
맥 입력칸에서 `Ctrl+B/F/A/E/K` 는 Emacs 식 커서 키다. 문장부호 키는 비 US 배열에서 깨지므로 물리 키(`e.code`)로
보거나 대체 키를 둔다. 모드는 강한 시각 신호 둘 이상이 없으면 헷갈린다(NN/g). 오버레이는 닫을 때 포커스를
돌려준다(WAI-ARIA APG).

**온보딩·신뢰** — 설치 직후 짧은 페이지 한 장, 할 일 하나(모질라). 팝업은 즉시 반영되는 조작만, 범위가 다른
토글은 범위를 표시한다(uBlock · Dark Reader). 배지는 색에만 기대지 않는다. 제3자 사이트에 기대는 확장은
'알려진 문제' 와 자가 진단을 둔다(Refined GitHub · Superpower ChatGPT). 가장 나쁜 결과는 "ChatGPT 자체를 못 쓰게
되는 것" 이다(사용자가 확장을 지운 사례).

**스킨별 화면** — 스트리밍 중에는 마지막 블록만 갱신하고 스크롤을 존중한다(Claude Code 최다 불만 · Textual).
복사가 가장 먼저 빠진다(Warp). 줄 길이 50~75자, 한중일 문자는 40자(WCAG 1.4.8). 토큰마다 aria-live 를 갱신하면
스크린리더가 망가진다 — 작은 status 영역만 알린다. 모양만 스프레드시트면 `role=grid` 를 흉내 내지 말고 표로 둔다.
위장(boss key) 스킨은 "화면만 가린다" 는 한계를 알려야 하고, 스토어에서 Excel 이름·로고를 쓰지 않는다.

**원본 ChatGPT 단축키** `[가정: 웹 자료]` — ⌘/Ctrl+K 대화 검색, ⌘/Ctrl+⇧S 사이드바, ⌘/Ctrl+⇧O 새 대화,
⌘/Ctrl+/ 단축키 목록, ⌘/Ctrl+⇧; 마지막 코드 복사.

### 1.3 후보안 (1차)

P1 첫 실행 안내 · P2 팔레트 발견성(단축키 표시 · 최근 명령 · 팝업 입구 · `?`) · P3 단축키(대체 키 · 물리 키 · ⌘K
충돌 · Ctrl+B 충돌) · P4 esc 우선순위 고정 · P5 none 명령줄 열림 표시 강화 · P6 고장 알림(팝업 사유 · 진단 복사 ·
onBreak 기본값 revert) · P7 설정(숨긴 항목 알림 · 고급 접기 · 바뀐 항목 표시) · P8 새 응답 알림 · P9 복사 ·
P10 편집·재생성·첨부 위임 · P11 접근성(status · reduced-motion) · P12 줄 길이(터미널 80 · 시트 B열) ·
P13 시트 위장(탭 제목 · 파비콘) · P14 다국어 · P15 '아무 데서나 입력' 끄기

---

## 2. 2차 — 코드와 대조하고 반론을 찾았다

### 2.1 이미 된 것 — 권고에서 뺀다

| 권고 | 지금 |
|---|---|
| 설정: 즉시 저장 · "저장됨" · 바뀐 항목 표시 · 항목별 기본값 · 전체 초기화 (P7 일부) | 전부 있다 (`options.js`) |
| 스크롤: 바닥에 있을 때만 따라간다 (P8 일부) | 터미널 · 시트 둘 다 있다 |
| 스트리밍 중 마지막 블록만 갱신 | 터미널 증분 렌더, 시트 행 단위 (0.8.2 실측 1.8ms/델타) |
| 오버레이를 닫으면 포커스를 돌려준다 | 0.6.2 에서 원본 컴포저로 돌려준다 (브라우저 확인) |
| 원본이 아닌 탭 · 붙지 않은 탭에서 토글을 잠그고 이유를 적는다 | 팝업에 있다 |
| 빨강(복귀) 상태의 사유 | 팝업이 사유와 `:health` 를 안내한다 |
| 터미널 커서의 reduced-motion | 있다 (`theme.js`) |
| 스토어에서 Excel 이름 · 로고를 쓰지 않는다 | 쓰지 않는다 — 제목은 `<대화 제목>.xlsx`, 테스트가 막는다 |

### 2.2 확정된 버그 — esc (P4)

전역 키 처리기는 캡처 단계에서 돈다(`window.addEventListener(…, { capture: true })`). 그래서 입력줄 · 팔레트의
처리기보다 **먼저** 돌고, 안에 있는 `if (e.defaultPrevented) return` 은 결코 참이 되지 않는다.
생성 중에 esc 를 누르면 전역 처리기가 먼저 생성을 멈추고, 그다음 입력줄이 후보를 닫는다.

재현 (진짜 `prompt.js` 를 Node EventTarget 으로 돌림, 브라우저의 전파 순서대로 window 캡처 → 입력줄):

```
생성 중(중단 버튼 있음) + 자동완성 후보가 떠 있음 + esc 한 번
→ {"stop":1, "suggestClosed":1}      중단도 되고 후보도 닫혔다
```

팔레트도 같다 — 팔레트가 열려 있으면 사이드바 분기는 건너뛰지만 생성 중단 분기는 건너뛰지 않는다.
사용자 입장에서는 "후보 목록을 닫았더니 답이 끊겼다" 가 된다. 되돌릴 수 없다.

**권고** — 열린 층을 먼저 닫고, 닫을 층이 없을 때만 생성을 멈춘다(APG · WCAG 2.1.2 해설의 관례).
층의 순서: 자동완성 후보 → 기록 초안 → 팔레트 → 사이드바 선택 모드 → 사이드바 → none 명령줄 → 생성 중단.
전역 처리기에서 "열린 층이 있는가" 를 먼저 물어 보거나, esc 만 버블 단계로 옮긴다. 재현 스크립트를 회귀 검사로 남긴다.

### 2.3 없는 것 — 확인됨

- 경고(노랑) 상태에서 팝업이 경고 내용을 보여 주지 않는다. 배지 툴팁에만 있다 (P6).
- 위로 스크롤해 둔 사이 새 응답이 와도 알리지 않는다 (P8).
- 시트는 셀 단위 복사만 있고 메시지 전체 복사가 없다 (P9).
- 스크린리더용 상태 알림이 어디에도 없다 (P11).
- 시트의 스트리밍 커서(`gs-caret`)가 reduced-motion 을 따르지 않는다 (P11).
- 설정 화면에 '이 스킨에서 숨긴 항목' 이 있다는 표시가 없다 (P7).

### 2.4 반론과 수정

| 1차 안 | 반론 · 새 사실 | 수정 |
|---|---|---|
| onBreak 기본값을 `revert` 로 (조사 권고) | 드리프트 경고는 오탐 이력이 있다 — [09-08](../issue/2026-09-08-drift-warning-false-positive.md) · [09-15](../issue/2026-09-15-drift-warning-on-most-chats.md). 오탐에 원본으로 쫓겨나면 "확장이 안 켜진다" 가 된다 | **기각.** `warn` 유지. 대신 노랑 상태에서 팝업이 내용을 보여 준다(A2) |
| 터미널 본문을 80자로 (Glow 기본값) | 고정폭 글꼴에서 한글은 약 2칸 — 96ch 는 한글 약 48자다. WCAG 1.4.8 은 한중일 40자 · **AAA** · "바꿀 방법이 있으면" 충족이고, 터미널엔 `wrap.columns` 설정이 있다 | **기각.** 기본값 유지 |
| 시트 B열 폭 제한 | 같은 기준. 시트엔 폭을 바꿀 방법이 없다. 넓은 창에서 한 줄 한글 100자가 넘는다 | **낮춤.** 설정 하나(열 폭) 정도 |
| ⌘K 를 원본 검색에 돌려준다 | 터미널 · 시트에서는 원본 화면이 가려져 원본 검색을 어차피 못 쓴다 | **바꿈.** ⌘K 는 유지하되 아무것도 안 치면 대화 검색이 되게 (B2) |
| `Ctrl+B` 를 맥에서 바꾼다 | 맥 크롬은 ⌘⇧S 를 쓰지 않는다(공식 목록에 없음). 원본 ChatGPT 가 ⌘⇧S 를 사이드바에 쓴다 `[가정]` | **바꿈.** ⌘/Ctrl+⇧S 를 더하고, 입력줄 안의 `Ctrl+B` 는 맥에서 커서 키로 돌려준다 (B1) |
| 환영 탭 | 스토어 정책 원문에 설치 · 업데이트 때 탭을 여는 조항은 찾지 못했다. 모질라는 설치 때 한 번, 업데이트는 알릴 만할 때만 | **유지, 좁힘.** 설치 때만 (B3) |

---

## 3. 3차 — 다시 따져 본 것

남은 안마다 "그게 정말 좋은가" 를 부작용과 대안으로 다시 따졌다.

**A1 esc** — 부작용: 생성 중에 esc 한 번으로 멈추던 사람이, 후보가 떠 있으면 두 번 눌러야 한다.
이건 의도한 비용이다 — 되돌릴 수 없는 동작(중단)이 되돌릴 수 있는 동작(닫기) 뒤에 온다. 대안(생성 중엔 후보를
안 띄운다)은 입력을 막는 셈이라 더 나쁘다. **확정.**

**A2 노랑 상태 사유** — 부작용 없음. 팝업 도움말 줄에 "경고 N개 — 첫 경고" 를 적고 `:health` 로 잇는다.
Dark Reader · uBlock 이 모두 '왜 이 상태인가' 를 팝업 맨 위에 둔다. **확정.**

**A4 단축키 표기** — 운영체제 판별은 `navigator.userAgentData.platform` 또는 `navigator.platform` 으로 충분하다.
부작용 없음. **확정.**

**A5 role=status** — 반론: 스크린리더 사용자가 이 확장을 쓸 가능성은 낮다. 그러나 비용이 한 줄이고, 토큰마다
aria-live 를 다는 흔한 실수를 미리 막는 효과가 있다. 상태줄(터미널) · 상태 표시줄(시트) · 명령줄(none) 한 곳씩만.
**확정, 낮은 우선.**

**B1 단축키** — 세 갈래로 나눴다.
- 토글 키를 `e.key === '`'` 에서 `e.code === 'Backquote'` 로. 맥 한글 입력 모드에서 이 키는 ₩(U+20A9) 를 낸다
  `[확정: Apple · 위키]`. Ctrl 을 누른 채로도 `e.key` 가 ₩ 인지는 `[가정]` — 확인 방법: 한글 입력 모드에서
  `Ctrl+`` 를 누르고 keydown 의 `key` · `code` 를 기록한다. 물리 키로 바꾸면 한글 모드든 아니든 같은 자리의 키다.
  부작용: 독일 배열처럼 그 자리에 다른 문자가 있는 배열에서도 그 자리 키가 된다 — 토글 키는 '자리' 가 맞다.
- 사이드바에 ⌘/Ctrl+⇧S 를 더한다(원본과 같은 손버릇). `Ctrl+B` 는 입력줄 밖에서만 받거나 윈도우에서만 받는다.
  확인 방법: 원본 ChatGPT 에서 ⌘⇧S 가 실제로 사이드바를 여닫는지, 우리 스킨이 켜져 있을 때 원본이 이 키를 먼저 가져가지 않는지.
- `chrome.commands` 로 '스킨 켜고 끄기' 를 하나 등록한다(제안 기본값 없음 또는 Alt+Shift 계열). 사용자가
  `chrome://extensions/shortcuts` 에서 바꿀 수 있는 유일한 길이다. 부작용: 서비스 워커 → 탭 메시지 한 단계가 더 생긴다.
  대안(설정 화면에서 키 바꾸기)은 우리가 키 입력 캡처 UI 를 만들어야 해 더 비싸다.

**B2 ⌘K = 대화 검색 + 명령** — GitHub 식: 아무것도 안 치면 대화 제목, `:` 로 시작하면 명령. 원본에서 ⌘K 를
누르던 사람의 기대(대화 찾기)와 우리 팔레트(명령)가 한 창에서 만난다. 항목 오른쪽에 단축키를 보여 주면 치트시트
역할도 한다. 반론(NN/g · 블로그): 팔레트는 고급 사용자용이고 입구가 단축키뿐이면 발견성이 없다 → 팝업에
"명령 열기 (⌘K)" 입구를 둔다. **확정, 설계 필요** — 대화 목록 제공자(`GT.chats`)를 팔레트가 읽는다.

**B3 환영 페이지** — 반론: 설치하자마자 탭이 열리는 것을 싫어하는 사람이 있다. 그러나 기본값이 꺼짐이라
아무 변화가 없는 지금이 "고장" 으로 읽힐 위험이 더 크다. 한 장, 할 일 하나(ChatGPT 를 열고 `Ctrl+`` · 스킨 셋
미리보기), 업데이트 때는 열지 않는다. 마케팅 블로그의 수치("60초", "86%")는 출처가 불분명해 근거로 쓰지 않았다.

**B4 새 응답 알림** — 터미널: 상태줄에 "↓ 새 응답", 시트: 상태 표시줄에 "새 행 N". 누르면 바닥으로.
토큰마다 부드러운 스크롤은 하지 않는다. **확정.**

**B5 시트 메시지 복사** — 행 번호 칸을 누르면 그 메시지 전체를 고르고 ⌘C 로 원문 마크다운을 복사한다.
보이는 글자로 복사할지 원문으로 복사할지는 터미널 복사 버튼과 같게 원문으로. **확정.**

**B6 진단 복사** — Superpower ChatGPT 의 자가 진단처럼. 버전 · 빌드 · 스킨 · 실패한 점검 · 경고를 한 덩어리로
클립보드에. 대화 내용은 넣지 않는다(개인정보처리방침). **확정.**

---

## 4. 보류 · 기각

| 안 | 판단 | 이유 |
|---|---|---|
| onBreak 기본값 `revert` | 기각 | 오탐 이력 — §2.4 |
| 터미널 본문 80자 | 기각 | 한글 기준 이미 ~48자, 설정으로 충족 — §2.4 |
| none 명령줄 열림 표시 강화 | 낮춤 | 명령줄 자체가 원본(라이트) 위의 어두운 상자라 눈에 띈다. 핵심 혼란(포커스가 BODY 로 빠짐)은 0.6.2 에서 풀었다 |
| '아무 데서나 입력' 끄기 설정 (WCAG 2.1.4) | 낮춤 | 한 글자 단축키가 아니라 입력을 입력줄로 옮길 뿐이다. 요청이 오면 설정 하나 |
| 시트 B열 폭 | 낮춤 | AAA · 설정으로 충분 |
| 시트 위장 — 탭 제목 · 파비콘까지 바꾸기 | **결정 필요** | 시트가 '모양' 인지 '위장' 인지에 달렸다. 위장이라면 탭 제목에 "ChatGPT" 가 남는 것이 가장 큰 구멍이다. 다만 원본 React 가 제목을 계속 고쳐 써서 싸우게 된다 `[가정]` |
| 편집 · 재생성 · 첨부 위임 | 별도 조사 | 원본 버튼을 찾아 누르는 경로가 필요하다. 원본 구조 실측부터 |
| 다국어 부채 약 200줄 | 별도 계획 | [다국어 도입](2026-09-08-i18n.md) 의 순서를 따른다 |

---

## 5. 결정이 필요한 것

1. **시트는 모양인가 위장인가** — 위장이면 탭 제목 · 파비콘 · 즉시 전환 키(boss key)가 따라온다.
2. **`enabled` 와 `skin: none` 을 합칠까** — 5단계부터 남아 있다.
3. **`Ctrl+B` 를 맥 입력줄에서 커서 키로 돌려줄까** — 돌려주면 기존 손버릇이 바뀐다. ⌘⇧S 를 더하는 것은 부작용이 없다.

## 6. 실측이 필요한 것 `[가정]`

| 가정 | 확인 방법 |
|---|---|
| 원본 ChatGPT 가 ⌘K 검색 · ⌘⇧S 사이드바 · ⌘⇧O 새 대화 · ⌘/ 목록을 쓴다 | 확장을 끄고 원본에서 각 키를 눌러 본다 |
| 맥 한글 입력 모드에서 `Ctrl+`` 의 `e.key` 가 ₩ 다 | 한글 모드에서 keydown 의 key · code 를 기록한다 — **2026-10-02 사용자 보고: 0.20.1 에서도 한글일 때 안 켜졌다.** 물리 키 판별 앞에 조합 가드가 있었다. 0.20.2 에서 토글 키를 가드 앞으로 옮겼으나 여전히 안 됐다. **실측(사용자 크롬, 한글 상태): key '`' · code Backquote · keyCode 192 · ctrl true · alt true · isComposing false** — 한글 입력 상태에서는 Alt 가 붙어 왔고 `!e.altKey` 가 막았다. 0.20.3 에서 Alt 를 따지지 않는다 — **사용자 확인: 한글 상태에서 켜짐** `[확정]` · **0.21.1**: Ctrl+B 도 한글이면 안 먹었다(사용자 보고). 글자로 보던 단축키(Ctrl+B · ⌘K · Ctrl+C · Ctrl+N/P · 시트 ⌘C)를 모두 물리 키로, Ctrl · ⌘ 단축키는 조합 가드 앞에서 Alt 를 따지지 않고 본다. 한글 상태 실측은 Backquote 만 — 나머지 키는 같은 동작이라 본다 `[가정]` |
| 스킨이 켜져 있을 때 원본이 ⌘⇧S 를 먼저 가져가지 않는다 | 스킨을 켜고 ⌘⇧S → 원본 사이드바가 열리는지 본다 |
| 윈도우 크롬에서 ⌘K 대신 Ctrl+K 를 `preventDefault` 로 가로챌 수 있다 (크롬은 Ctrl+K 를 주소창 검색에 쓴다) | 윈도우 크롬에서 스킨을 켜고 Ctrl+K |

---

## 출처

- 키보드 · 팔레트: [Superhuman — command palette](https://blog.superhuman.com/how-to-build-a-remarkable-command-palette/) · [VS Code UI](https://code.visualstudio.com/docs/getstarted/userinterface) · [Linear 단축키](https://linear.app/changelog/2021-03-25-keyboard-shortcuts-help) · [GitHub command palette](https://docs.github.com/en/get-started/accessibility/github-command-palette) · [Raycast 인자](https://developers.raycast.com/information/lifecycle/arguments) · [chrome.commands](https://developer.chrome.com/docs/extensions/reference/api/commands) · [Chrome 단축키](https://support.google.com/chrome/answer/157179) · [macOS 텍스트 바인딩](https://developer.apple.com/library/archive/documentation/Cocoa/Conceptual/EventOverview/TextDefaultsBindings/TextDefaultsBindings.html) · [비 US 배열 단축키](https://tkainrad.dev/posts/why-keyboard-shortcuts-dont-work-on-non-us-keyboard-layouts-and-how-to-fix-it/) · [key vs code](https://www.bram.us/2022/03/31/wasd-controls-on-the-web/) · [Won sign](https://en.wikipedia.org/wiki/Won_sign) · [NN/g modes](https://www.nngroup.com/articles/modes/) · [WAI-ARIA dialog](https://www.w3.org/WAI/ARIA/apg/patterns/dialog-modal/) · [WCAG 2.1.2](https://www.w3.org/WAI/WCAG21/Understanding/no-keyboard-trap.html) · [WCAG 2.1.4](https://www.w3.org/WAI/WCAG21/Understanding/character-key-shortcuts.html)
- 온보딩 · 신뢰: [Firefox Extension Workshop — onboard](https://extensionworkshop.com/documentation/develop/onboard-upboard-offboard-users/) · [CWS quality FAQ](https://developer.chrome.com/docs/webstore/program-policies/quality-guidelines-faq) · [chrome.action](https://developer.chrome.com/docs/extensions/reference/api/action) · [NN/g toggle](https://www.nngroup.com/articles/toggle-switch-guidelines/) · [uBlock popup](https://github.com/gorhill/uBlock/wiki/Quick-guide:-popup-user-interface) · [Dark Reader help](https://darkreader.org/help/en/) · [Refined GitHub 추적 이슈](https://github.com/refined-github/refined-github/issues/10065) · [Superpower checkup](https://spchatgpt.com/checkup/) · [OpenAI 포럼 — Superpower 고장](https://community.openai.com/t/superpower-for-chatgpt-is-no-longer-working-at-all/659858) · [NN/g progressive disclosure](https://www.nngroup.com/articles/progressive-disclosure/) · [VS Code settings](https://code.visualstudio.com/docs/configure/settings)
- 화면: [Claude Code 깜빡임 이슈](https://github.com/anthropics/claude-code/issues/9935) · [Textual streaming markdown](https://willmcgugan.github.io/streaming-markdown/) · [Copilot CLI 사고 표시 이슈](https://github.com/github/copilot-cli/issues/3755) · [Warp 복사 이슈](https://github.com/warpdotdev/Warp/issues/5815) · [Glow](https://github.com/charmbracelet/glow) · [Baymard 줄 길이](https://baymard.com/blog/line-length-readability) · [WCAG 1.4.8](https://www.w3.org/WAI/WCAG22/Understanding/visual-presentation.html) · [WCAG 2.2.2](https://www.w3.org/WAI/WCAG22/Understanding/pause-stop-hide.html) · [MDN live regions](https://developer.mozilla.org/en-US/docs/Web/Accessibility/ARIA/Guides/Live_regions) · [ARIA grid 반대론](https://adrianroselli.com/2020/07/aria-grid-as-an-anti-pattern.html) · [Boss key](https://en.wikipedia.org/wiki/Boss_key) · [CWS 사칭 · 지재권](https://developer.chrome.com/docs/webstore/program-policies/impersonation-and-intellectual-property) · [Open WebUI 편집 이슈](https://github.com/open-webui/open-webui/issues/21564)
- 원본 단축키 (2차 자료): [ai-toolbox 치트시트](https://www.ai-toolbox.co/chatgpt-management-and-productivity/chatgpt-keyboard-shortcuts-guide)
