# '원본 컴포저를 찾지 못했습니다' — 원인을 가릴 수 없었다

테스터 보고: 메시지를 보내면 `전송 실패(composer-inject-failed) — 원본 컴포저를 찾지 못했습니다` 가 뜬다.
상세 로그 · 화면 · 로그인 여부는 없다.

조사 · 수정: 2026-10-01 · 0.19.0

---

## 1. 코드로 확인한 것 `[확정 — 코드]`

문구는 `shell/prompt.js` 가 `GT.compose.send` 의 실패를 받으면 찍었다. 그런데 `send` 는 **서로 다른 세 실패를
하나의 사유로** 돌려줬다.

| 실제로 일어난 일 | 예전 사유 | 예전 문구 |
|---|---|---|
| 입력창 목록의 어떤 모양도 화면에 없다 | `composer-inject-failed` | 찾지 못했습니다 |
| 찾았지만 브라우저가 글 넣기를 거절했다 (`execCommand` false) | `composer-inject-failed` | 찾지 못했습니다 |
| (textarea) 넣었는데 값이 보낸 글과 다르다 | `composer-inject-failed` | 찾지 못했습니다 |

그래서 보고만으로는 어느 쪽인지 알 수 없었고, 오류 기록도 남지 않았다.

**하나 더 — 실패하면 쓴 글이 사라졌다.** 보내기 전에 입력줄을 비우고(`prompt.js`), 실패해도 되돌리지 않았다.

## 2. 실측 `[확정]`

비로그인 ChatGPT(2026-10-01, 화면 밖 일반 크롬): 입력창은 `textarea#mobile-composer-prompt name="prompt"` 하나,
목록으로 찾는다. 이 화면의 폼에는 0.11.3 이 기대는 `data-chatgpt-composer` 가 없었다
(`landing` · `loggedOut` · `mobileComposer` …).

로그인 화면은 확인하지 못했다 `[미정]` — 테스트 브라우저에 계정이 없다. 테스터 화면이 로그인 화면이고
`data-chatgpt-composer` 까지 사라졌다면 "찾지 못함" 이 맞다 `[가정]`.

## 3. 고친 것

- **사유를 나눈다** (`compose.js` `tryInject`): `composer-not-found` · `inject-rejected` · `inject-mismatch`.
  ProseMirror 도 넣은 뒤 글이 들어갔는지 본다(줄바꿈은 문단이 되므로 공백을 빼고 비교)
- **예비 선택자** `.ProseMirror[contenteditable="true"]` — ChatGPT 의 id · data 속성이 사라져도 라이브러리가 붙이는
  클래스로 찾는다 `[가정 — 로그인 화면 미확인]`
- **사용자에게는 짧게**: "메시지를 보내지 못했습니다. 쓴 글은 입력줄에 되돌려 두었습니다. 계속되면 :bug 로…"
  기술적인 사유는 화면에 내지 않는다
- **쓴 글을 입력줄에 되돌린다**
- **오류 기록과 `:bug`** (`src/content/bugs.js`) — 아래

## 4. 오류 기록 · `:bug`

요청: 에러는 내부에 갖고 있고(사용자에게 표시하지 않음), 명령으로 복사해 개발자에게 알릴 수 있게.

- `GT.bugs.record(code, message, extra)` — 실패를 아는 곳에서 조용히 쌓는다. 같은 오류가 이어지면 한 줄에 센다(×N).
  최근 50건
- **놓친 예외**도 잡는다 — 콘텐츠 스크립트 월드의 `error` · `unhandledrejection` 중 **우리 파일**에서 난 것만.
  실측(크롬 154, 비로그인 화면): `renderplan.js` 안에서 일부러 낸 TypeError 가 `uncaught` 로, 프로미스 안에서 낸 것이
  `unhandled-rejection` 으로 잡혔다. 스택에서 확장 id 는 지운다
- `:bug` — 보고서를 클립보드에 복사하고 "보고서를 복사했습니다 (오류 N건)" 만 알린다. 복사가 막힌 환경이면 보고서를
  화면에 보여 주고 직접 고르게 한다. `:bug clear` 로 비운다
- 팝업의 **진단 복사도 같은 보고서**다 (예전 `index.js` 의 `diagText` 를 옮겼다)

보고서에 들어가는 것: 버전 · 빌드 · 크롬 · 운영체제 · 언어 · 경로 모양(`/c/…`, id 없음) · 스킨 · 점검 · 경고 ·
입력창 상태(어느 모양으로 찾았나, 개수, 보내기 버튼, 초점) · 오류 목록.
**넣지 않는 것**: 대화 본문 · 제목 · 대화 id · 입력한 글 · `GT.log` 줄(제목 등이 섞일 수 있다).

### 범위 밖으로 둔 것

- 기존 경고(드리프트 · 수확 실패 등 `health.soft`)는 그대로 화면에 찍는다 — 이번 요청은 "에러" 였고, 경고는
  사용자가 알아야 하는 상태라 따로 정해야 한다
- 전송 실패는 사실(안 보내졌다)만 짧게 알린다. 숨기면 사용자가 보낸 줄 안다

## 5. 확인하는 법

테스터에게 문구가 다시 뜨면 그 탭에서 `:bug` 를 치고 붙여 넣어 달라고 한다. 보고서의 오류 줄이

- `send-failed … composer-not-found` 이고 `composer {"found":"none"…}` → 화면 구조가 바뀌었다. `counts` · `contenteditable` 개수로 새 모양을 짐작한다
- `send-failed … inject-rejected` → 찾았지만 글이 안 들어갔다. `focus` · `visibility` 를 본다
- `send-failed … inject-mismatch` → 들어간 글이 다르다

## 회귀 방지 — `test/bugs.test.mjs`

기록 · 같은 오류 세기 · 50건 · 경로 가리기 · 원본 페이지 오류 거르기 · stop · 보고서에 대화 내용 없음 · `:bug` 복사/실패/clear ·
전송 실패 시 기록 · 글 되돌리기 · 기술 사유 미노출 · 사유 셋 나누기 · 예비 선택자 · probe 에 글 없음 · 배선.
코드 8곳을 되돌려 모두 실패하는 것을 확인했다.

## 6. 첫 보고서 (2026-10-02, 0.22.0) — `inject-rejected`

테스터가 `:bug` 를 붙여 보냈다.

```
composer {"found":"form[data-chatgpt-composer] [contenteditable=\"true\"]","counts":[0,1,3,0,0],"contenteditable":3, …,"focus":true}
send-failed ×6 @ /c/…: inject-rejected
```

- 입력창은 **찾았다.** 브라우저가 글 넣기(`execCommand('insertText')`)를 **거절**했다
- 그 화면에는 편집기(`contenteditable`, `.ProseMirror`)가 **3개** 있었다. 사용자 크롬의 같은 계정 · 다른 대화에서는 1개였고
  거기서는 같은 방식으로 글이 들어갔다(넣은 뒤 지웠다)
- **원인 [가정]**: 목록의 첫 모양에 걸리는 첫 요소를 보이는지 따지지 않고 골랐다. 숨은 편집기에는 초점이 안 들어가 거절된다.
  편집기가 3개인 화면이 무엇인지(메시지 편집 중 · 캔버스 등)는 모른다 `[미정]`

**0.22.1 에서 고친 것**
- 후보를 전부 모아 **보이는 것부터** 넣어 본다. 거절되면 다음 후보로(거절은 아무것도 안 바꾼다). 글이 다르게 들어가면 멈춘다
- 보냈는지 확인 · Enter 대체도 실제로 글을 넣은 그 입력창을 본다
- 보고서에 후보별 `{i, w, h, shown, active, inForm}` — 다음 보고서에서 어느 편집기가 숨어 있었는지 보인다
