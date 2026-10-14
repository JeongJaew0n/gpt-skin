# 스킨 — 기능 현황과 '스킨에 넣어줘' 작업 방법

**정본 문서다. 기능을 넣거나 뺄 때마다 이 표를 고친다.**
점검 기준: 2026-10-14 · 0.31.0 · 코드에서 확인(`src/content/skins/*.js`, `defaults.js` 스키마). 실제 화면 확인 여부는 칸마다 적지 않았다 — 각 기능의 plan/issue 문서에 있다.

## 0. 원칙

- **사용자의 '스킨에 넣어줘' = 터미널 · 시트 · none 세 스킨 모두에 넣는다는 뜻이다.** 한 스킨에만 넣으라는 말이 없으면 셋 다.
- 단, **none 은 원본 화면을 그대로 쓰는 스킨**이다. 원본에 이미 있는 것(대화 본문, 탭, 로딩 표시, 모델 버튼)을 none 에 다시 그리지 않는다. none 에 넣을지 애매하면 §2 의 '의도된 차이' 를 보고, 그래도 애매하면 묻는다.
- 로직은 한 벌, 그리기는 스킨마다. 같은 판단을 스킨 셋에 복사하면 한쪽만 고쳐진다 (예: IME 가드, 답변 중 판정).

## 1. 자리 대응표

같은 역할을 각 스킨의 어디에 두는가. 새 기능은 이 표에서 자리를 고른다.

| 역할 | terminal | sheet | none |
|---|---|---|---|
| 맨 위 정보 줄 (제목 · 모델 · 추론 수준 · 시각) | 상단바 (`gt-topbar`) | 초록 제목 줄 (`gs-title`) | 없음 — 원본 헤더 |
| 대화 탭 줄 | 위쪽 탭 줄 (`gt-tabbar`) | 아래쪽 시트 탭 줄 (`gs-tabs`) | 없음 — 원본 사이드바 |
| 본문 | 스크롤백 (`gt-scroll`) | 격자 (`gs-grid`, 한 행에 한 줄) | 없음 — 원본 본문 |
| 시스템 출력 (명령 결과 · 경고) | 스크롤백의 `[info]` 줄 | 격자의 `[info]` 행 | 명령줄 위 결과 패널 (`gn-out`) |
| 입력 | 아래 입력줄 (`gt-input`) | 수식 입력줄 (`gs-input`) | 떠 있는 명령줄 (`gn-input`) |
| 상태 표시 | 아래 상태줄 (`gt-status`) | 상태 표시줄 (`gs-status`) | 명령줄 옆 모드 글자 |
| 버튼 하나 둘 자리 | 상단바 오른쪽 | 제목 줄 오른쪽 · 시트 탭 줄 왼쪽 · 상태 표시줄 오른쪽 | 명령줄 |
| 떠 있는 창 (목록 · 팔레트 · 메뉴) | `overlayRoot()` — 셋 다 같은 함수, 같은 CSS(`GT.theme.CSS`) | | |

## 2. 기능 현황

✓ 있음 · — 없음 · ◐ 다른 방식으로 있음

### 2.1 공통 (스킨과 무관하게 한 벌 — 셋 다 같다)

명령(`commands.js`, 단 §2.3 숨긴 명령 제외) · ⌘K 팔레트 · Ctrl+B 대화 목록 · ↑↓ 기록 · Tab 완성 · 후보 줄 · 한글(IME) 가드 · 한글 상태 단축키 ·
답변 중 보내기 막기(0.30.0) · `:bug` 보고서 · 탭별 스킨(0.27.0) · 대화 원본 읽기 · 스트림 해석 · 생성형 UI(DIL) fallback(0.29.1)

### 2.2 스킨마다 그리는 것

| 기능 | terminal | sheet | none | 메모 |
|---|---|---|---|---|
| 대화 목록 여는 버튼 | ✓ 상단 ≡ | ✓ 탭 줄 왼쪽 ☰ (0.29.0) | — | none 은 Ctrl+B 만 |
| 열린 탭 줄 (`:chats`) | ✓ 위 | ✓ 아래 | — 의도 | |
| 로딩바 · 본문 흐림 | ✓ | ✓ | — 의도 | |
| 모델 버튼 (0.31.0) | ✓ 모델 이름 클릭 (0.31.1 에서 고침 — 실제 화면 확인) | ✓ 제목 줄 버튼 (실제 화면 확인) | — | none 은 `:model` |
| 추론 수준 표시 | ✓ | ✓ 제목 줄 글자 | — | |
| 추론 수준 클릭으로 바꾸기 | ✓ 상단바 팝업 | **— 빠짐** | — | 시트는 `:effort` 만 |
| 답 복사 | ✓ 답마다 복사 버튼 | ◐ 행 · 셀 고르고 ⌘C | — 의도 | |
| 코드 블록 복사 버튼 | ✓ | ◐ 행 고르고 ⌘C | — 의도 | |
| 표 | ✓ 표 | ✓ 칸으로 나눔 | — 의도 | |
| 인용 번호 · 링크 | ✓ | ✓ | — 의도 | 설정 `citations` 는 둘 다 |
| 그림 | ✓ 그림 · 문자 블록 | **◐ 자리 글자만** ('그림 …') | — 의도 | |
| 생각 중 · 그림 만드는 중 줄 | ✓ | ✓ | — 의도 | |
| 답 받는 중 경과 시간 | ✓ 답 머리에 | **— 빠짐** (생각 중 줄에만) | — | |
| 시각 표시 방식 설정 (`timestamps`) | ✓ 상대 · 절대 · 끔 | **— 빠짐** (늘 HH:MM) | — | |
| 새 내용 알림 (위로 스크롤 중) | ✓ | ✓ | — 의도 | |
| `:messup` | ✓ 터미널 맛 | ✓ 시트 맛 | — 숨김 | 끼울 본문이 없다 |
| 글씨 크기 (`:font`, ⌥=) | ✓ | ✓ + 확대 버튼 | — 숨김 | 원본이 정한다 |
| 테마 (`:theme`) | ✓ 여러 개 | ✓ green · blue | — 숨김 | |
| 답변 중 입력줄 안내 | ✓ | ✓ | ✓ | |
| 시각 벨 | ✓ | ✓ | ✓ | |
| 아무 데서나 타이핑하면 입력줄로 | ✓ | ✓ | — 의도 | 원본 입력을 가로채지 않는다 |
| 빈 줄 esc 로 닫기 | — | — | ✓ | none 만 평소 닫혀 있다 |

**빠진 것(굵게)** — 넣을지는 사용자에게 묻는다: 시트 추론 수준 클릭 · 시트 그림 표시 · 시트 경과 시간 · 시트 시각 설정.

### 2.3 스킨 계약 필드 (`shell/skin.js` 가 등록 때 검사)

| 필드 | terminal | sheet | none |
|---|---|---|---|
| covers (원본을 가린다) | true | true | false |
| capturesTyping | true | true | false |
| keys.open / escapeHides | — / false | — / false | `Ctrl+;` / true |
| persistSidebar | true | false | false |
| hiddenCommands | 없음 | 없음 | `:font` `:theme` `:messup` `:chats` `:close` |
| messup 맛 | terminal | sheet | (숨김) |
| 테마 | `GT.theme.THEMES` | green · blue | modern-dark 고정 |

### 2.4 스킨 전용 설정 (`defaults.js` 의 `skin:` 표시)

- terminal 만: `terminal.theme` `terminal.chatTabs` `wrap.columns` `image` `image.columns` `gutter.markers` `scanlines` `cursor.style` `cursor.blink` `timestamps`
- sheet 만: `sheet.theme` `sheet.ribbon` `sheet.chatTabs`
- terminal · sheet: `citations` · terminal · none: `font.family`

## 3. '스킨에 넣어줘' 작업 순서

1. **이 문서 §2 를 본다** — 이미 있는지, 의도적으로 뺀 것인지(none 의 '의도'), 자리가 어디인지(§1).
2. **로직은 한 곳에** — 판단 · 상태 · 원본 조작은 `shell/`(prompt · skin · cover) · `commands.js` · `picker.js` · `compose.js` · `tabs.js` 같은 공통 모듈에. 스킨은 결과를 그리기만 한다.
   - 여러 스킨에서 부를 진입점이 필요하면 공통 모듈에 함수를 둔다 (예: `GT.commands.openModelMenu()` — 터미널 · 시트 버튼이 같이 부른다).
   - 떠 있는 목록이 필요하면 새로 만들지 말고 `GT.palette.open(items, pick, { placeholder })` 를 쓴다.
3. **스킨이 반드시 답해야 하는 것이면 계약에 넣는다** — `shell/skin.js` 의 `METHODS` 에 이름을 더하고 세 스킨 모두 구현(할 일이 없으면 빈 함수). 등록 때 빠지면 거부된다.
   - 스킨을 바꿀 때 상태를 이어받아야 하면 `GT.skin.switch` 의 `mountOne` 에서 넘긴다 (예: 답변 중 `setBusy`).
4. **스킨마다 그린다** — §1 의 자리에. 터미널은 '아무 데나 누르면 입력줄로 초점' 이 있다 — 원본 메뉴를 여는 버튼이면 초점이 옮겨지며 그 메뉴가 닫힌다(0.31.1). 누른 자리가 버튼이면 막히지만, 새 장치가 원본을 조작하면 터미널에서 진짜 클릭으로 확인한다. 버튼은 `mousedown` 에서 `preventDefault` (입력줄 초점을 뺏지 않는다) · 키보드(Enter/Space)도 · `aria-label` · `title`. 글리프 대신 SVG(폰트에 없는 문자에 기대지 않는다).
5. **문구는 `i18n.js` 에 ko · en 함께.** 이모지 금지 · 존댓말.
6. **설정이 필요하면** `defaults.js` 스키마에 — 특정 스킨에서만 뜻이 있으면 `skin:` 표시.
7. **검사** — 공통 로직은 vm 샌드박스로 실제 함수를 돌리고, 스킨 배선은 스킨마다. 고친 코드를 깨뜨려 실패하는지 확인한다.
8. **하네스로 본다** — `python3 -m http.server 8765` 후 `http://localhost:8765/tools/harness/?skin=terminal|sheet|none`. 원본에 기대는 기능이면 실제 ChatGPT 에서(`:reload` 후 `:version` 으로 build 확인).
9. **이 문서 §2 표를 고친다** — 같은 커밋에.

## 4. 관련 문서

- 스킨 구조의 처음 설계: `docs/plan/2026-09-24-skin-architecture.md` (당시 기록. 현재 상태는 이 문서)
- 시트 스킨 설계: `docs/plan/2026-09-21-sheet-skin.md`
- 기능별: `docs/plan/2026-10-02-open-tabs.md` · `2026-10-02-per-tab-skin.md` · `2026-10-12-block-send-while-answering.md`
