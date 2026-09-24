# 권한 사유서 · 심사 노트

Chrome 웹스토어 개발자 대시보드에 붙여 넣을 내용이다.
심사관은 영어로 읽으므로 각 항목의 **영문이 정본**이고 한국어를 함께 둔다.

---

## 1. 단일 목적 (Single purpose)

> **English (대시보드 입력용)**
>
> gpt-skin has one purpose: to re-render the ChatGPT web app (`chatgpt.com`) as a
> terminal-style, keyboard-driven interface. Every feature exists to display or operate
> that one site's conversations. The extension does nothing on any other site.

> **한국어**
>
> 단일 목적은 하나다 — `chatgpt.com` 을 터미널식 키보드 중심 인터페이스로 다시 그린다.
> 모든 기능이 그 한 사이트의 대화를 표시하거나 조작하는 데 쓰인다.
> 다른 사이트에서는 아무 동작도 하지 않는다.

---

## 2. 권한 사유 (Permission justifications)

대시보드는 권한별로 사유 입력란을 따로 준다. 아래를 그대로 넣는다.

### `storage`

> Stores the user's own display preferences (theme, font size, line height, wrap width,
> sidebar width, cursor style, timestamp format, and whether the terminal starts
> automatically) in `chrome.storage.sync`, and a cache of the user's conversation **list**
> (ids, titles, timestamps, project names) in `chrome.storage.local` so the list appears
> immediately and survives a failed network call. Conversation bodies are never stored.

### Host permission — `https://chatgpt.com/*`

> The extension only functions on ChatGPT. It needs to run content scripts on that origin
> to (a) hide the original interface and draw its own, (b) read the conversation so it can
> render it as terminal output, and (c) inject the user's message into the site's own
> composer, which is the only way to send — the send request is protected by a
> proof-of-work token the page computes, so the extension cannot call the send API itself.
> No other origin is requested.

### Remote code

> None. The extension executes no remotely hosted code. There is no `eval`, no
> `new Function`, no remote script tag, and no external CDN. All code ships in the package.

---

## 3. 데이터 사용 공시 (Data usage disclosure)

대시보드의 체크박스에 대한 답이다.

| 항목 | 답 | 근거 |
|---|---|---|
| 개인 식별 정보 수집 | **아니오** | — |
| 건강 정보 | 아니오 | — |
| 금융·결제 정보 | 아니오 | — |
| 인증 정보 | **아니오 (수집하지 않음)** | 페이지가 자체 발급한 액세스 토큰을 **메모리에서만** 읽어 같은 사이트 호출에 쓴다. 저장·로그·전송하지 않는다 |
| 개인 통신 | **화면 표시를 위해 읽지만 수집·전송하지 않음** | 대화 본문은 탭이 열려 있는 동안 메모리에만 있다 |
| 위치 | 아니오 | — |
| 웹 기록 | 아니오 | — |
| 사용자 활동 | 아니오 | 분석 도구가 없다 |
| 웹사이트 콘텐츠 | `chatgpt.com` 만, 표시 목적 | — |

세 가지 확인 항목은 모두 **동의**할 수 있다.

- 승인된 용도로만 사용 — 예
- 제3자 판매·이전 없음 — 예
- 신용 평가·대출 목적 사용 없음 — 예

---

## 4. 심사관에게 미리 설명할 것

심사에서 눈에 걸릴 만한 구현을 먼저 밝힌다. 대시보드의 심사 노트란,
또는 리뷰 회신에 그대로 쓴다.

### (a) `world: "MAIN"` 콘텐츠 스크립트를 쓰는 이유

> One content script runs in the page's own JavaScript world
> (`src/main/tap.js`, `world: "MAIN"`). This is required because two pieces of state the
> extension must read are page-world expandos that an isolated world cannot see:
> React's `__reactFiber$…` (to recover the original Markdown source of a message, so the
> terminal renders the real text rather than re-parsing rendered HTML) and ProseMirror's
> `pmViewDesc` (to inject text into the site's composer correctly).
> Conversely `chrome.storage` is not available in the MAIN world, so that script holds no
> permissions and communicates only through `window.postMessage` targeted at
> `location.origin` — never `"*"`. It is the minimum surface needed.

한국어 — fiber 의 `__reactFiber$…` 와 ProseMirror 의 `pmViewDesc` 는 페이지 월드의
expando 라 isolated world 에서 보이지 않는다. 반대로 `chrome.storage` 는 MAIN 월드에서
못 쓴다. 그래서 tap 만 MAIN 에 두고 권한 없이, `postMessage` 로만(대상은
`location.origin`, 와일드카드 아님) 잇는다.

### (b) `window.fetch` 를 감싸는 이유

> The MAIN-world script wraps `window.fetch` **on chatgpt.com only**, and only to *observe*
> one endpoint: the streaming reply (`POST /backend-api/f/conversation`). It clones the
> response body with `res.body.tee()` and hands the original through untouched, so the page
> behaves exactly as before. This is how the terminal can show a reply as it is generated.
> The observed data is never stored or transmitted — it is parsed into on-screen text.
> No other request is inspected, altered, blocked, or redirected.

한국어 — chatgpt.com 에서만, 그리고 스트리밍 응답 한 엔드포인트를 **관찰**하려고 감싼다.
`res.body.tee()` 로 갈라 읽고 원본은 그대로 흘려보내므로 페이지 동작은 바뀌지 않는다.
읽은 내용은 저장·전송하지 않고 화면 텍스트로만 쓴다. 다른 요청은 건드리지 않는다.

### (c) 액세스 토큰을 읽는 이유

> The extension calls ChatGPT's own read endpoints (`GET /backend-api/conversation/<id>`,
> `GET /backend-api/conversations`) because the DOM alone is not a reliable source: the site
> does not render every turn on a cold load, so a DOM-only reading silently loses older
> messages. Those endpoints require the `Authorization: Bearer` token that the page itself
> issues at `/api/auth/session`.
>
> The token is kept in a module-local variable for at most 5 minutes, is **never** written
> to `chrome.storage`, never logged, and never sent to any origin except `chatgpt.com`.
> The relevant file is small and easy to audit: `src/content/oai.js` (60 lines).

한국어 — DOM 만으로는 부족하다. 콜드 로드에서 원본이 앞쪽 턴을 안 그리므로 DOM 만
읽으면 옛 메시지가 조용히 빠진다. 그래서 백엔드 읽기 엔드포인트를 쓰는데 Bearer 토큰이
필요하다. 토큰은 모듈 지역 변수에 최대 5분, 저장·로그·외부 전송 없음. `src/content/oai.js`
60줄이라 감사하기 쉽다.

### (d) 사용자 계정의 데이터를 바꾸는 기능

> Commands `:rename`, `:pin`, `:archive`, `:rm` and `:mv` change the user's own
> conversations through ChatGPT's own endpoints — the same operations the site's UI offers
> in its "..." menu. They run **only** when the user types the command. Destructive ones
> are gated: `:rm` shows the target and stops unless the user repeats it with `yes`, and the
> menu equivalent requires a second click within 4 seconds. Nothing is deleted implicitly.

한국어 — 원본 UI 의 "⋯" 메뉴가 제공하는 것과 같은 조작이고, 사용자가 명령을 입력할 때만
실행된다. 되돌릴 수 없는 것은 이중 확인을 둔다.

### (e) `:messup` 이 deceptive 가 아닌 이유

> One command, `:messup`, inserts placeholder text (fake build logs and code) into the
> terminal view. It exists as a novelty. It is **not** deceptive:
> it runs only when the user types the command, the inserted block is labelled
> `local · :messup — 화면에만 있는 출력` ("shown on screen only") with a dashed marker,
> it is never sent to ChatGPT and never becomes part of the conversation, and
> `:messup clear` removes it. No content is attributed to ChatGPT or to any third party.

한국어 — 사용자가 직접 실행할 때만 동작하고, 블록에 "화면에만 있는 출력" 라벨과 점선
표시가 붙고, ChatGPT 로 전송되지 않으며 대화 기록에도 안 남는다. `:messup clear` 로 지운다.
어떤 내용도 ChatGPT 나 제3자의 것으로 표시하지 않는다.

### (f) 원본 UI 를 숨기는 방식

> The extension does not remove the site's interface. It sets a class on `<html>` that
> makes the original tree visually transparent and non-interactive, and renders its own UI
> inside a shadow root. `Ctrl+\`` or the toolbar toggle restores the original instantly.
> Nothing about the site is permanently altered.

한국어 — 지우지 않는다. `<html>` 에 클래스를 걸어 원본을 투명·비상호작용으로 만들고
shadow root 안에 우리 UI 를 그린다. `Ctrl+\`` 나 툴바 토글로 즉시 되돌아간다.

---

## 5. 감사하기 쉬운 지점 (심사관이 빨리 확인할 수 있는 곳)

| 확인하려는 것 | 볼 파일 | 줄 수 |
|---|---|---|
| 토큰 취급 전체 | `src/content/oai.js` | 60 |
| MAIN↔ISOLATED 통신 (postMessage 대상) | `src/content/protocol.js` | 51 |
| fetch 래핑과 SSE 관찰 | `src/main/tap.js` | 약 390 |
| 저장하는 것 전부 | `src/shared/defaults.js`, `src/content/chats.js` | 74 / 211 |
| 권한 선언 | `manifest.json` | — |

빠른 확인용 명령 (저장소 루트에서):

```bash
grep -rn "eval(\|new Function\|innerHTML\|sendBeacon" src/     # 결과 없음
grep -rn "https\?://" src/ | grep -v w3.org                    # 결과 없음 (외부 주소 없음)
grep -rn "postMessage(" src/                                   # 대상이 location.origin
```

---

## 6. 알려진 위험 (내부 메모 — 대시보드에는 넣지 않는다)

1. **비공개 API 사용** — `/backend-api/*` 는 문서화된 공개 API 가 아니다. 웹스토어 정책이
   직접 금지하지는 않지만, OpenAI 가 문제를 제기하면 리스팅이 내려갈 수 있다.
2. **이름에 "ChatGPT" 를 쓰는 것** — 나열적 사용이고 "제휴 아님" 을 설명문·방침에 명시했다.
   그래도 심사관 재량으로 이름 변경을 요구받을 수 있다. "gpt" 자체가 문제면
   `Scrollback` 으로 되돌린다(`docs/store/listing.md` 의 C안).
3. **호스트 사이트 구조 변경** — 원본이 바뀌면 확장이 깨진다. 배지로 알리고 설정에 따라
   원본으로 복귀한다. 리스팅 설명에 이 한계를 미리 적어 두었다.
