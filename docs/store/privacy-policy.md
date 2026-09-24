# Privacy Policy — gpt-skin (Terminal UI for ChatGPT)

**Last updated: 2026-09-07**

> **TODO before submission** — this document must be reachable at a public URL, and that
> URL goes in the Chrome Web Store dashboard under *Privacy → Privacy policy URL*.
> Nothing else in this file needs changing.

gpt-skin is a browser extension that redraws the ChatGPT web app as a terminal-style
interface. This policy describes exactly what it touches, what it keeps, and what it
never does. Every statement below is verifiable in the source code, which is public.

---

## Summary

**gpt-skin sends no data to anyone. There is no server, no analytics, and no advertising.**

Everything the extension does happens inside your browser, on `chatgpt.com` tabs only.

---

## What the extension accesses

gpt-skin runs only on `https://chatgpt.com/*`. On those pages it:

1. **Reads your conversation content** so it can draw it as terminal output.
   It obtains this in two ways, both of which stay inside the page:
   - It reads the responses of requests the ChatGPT page **already makes** — including the
     streaming response that delivers a reply as it is generated.
   - It calls ChatGPT's own backend endpoints (`/backend-api/…`) from within the page to
     fetch the full conversation and your conversation list, so that older messages are
     not missing from the scrollback.
2. **Reads your session access token** from the page's own `/api/auth/session` endpoint.
   The token is required to call those backend endpoints. See *Access token* below.
3. **Sends changes you ask for.** When you run a command such as `:rename`, `:pin`,
   `:archive`, `:rm` or `:mv`, the extension calls the same ChatGPT backend endpoints to
   apply that change to your account. Nothing is sent unless you invoke the command.

The extension does not read any other website, browsing history, bookmarks, downloads,
cookies of other sites, or clipboard contents.

## Where data goes

**Nowhere but ChatGPT.** All network requests the extension makes go to `chatgpt.com`
— the same service you are already using and already logged into. There is no
gpt-skin server. No data is transmitted to the developer or to any third party.

## What is stored on your device

Two areas of Chrome's extension storage are used, both local to you.

| Where | What | Why |
|---|---|---|
| `chrome.storage.sync` | Your settings only — theme, font size, line height, wrap width, sidebar width and visibility, cursor style, timestamp format, notification style, breakage policy, drift threshold, and whether the terminal starts automatically. | So your preferences persist, and follow your Chrome profile if you have Chrome Sync enabled. **No conversation content is stored here.** |
| `chrome.storage.local` | A cache of your **conversation list** — the summary objects returned by ChatGPT's list endpoint (conversation id, title, timestamps, project membership, pinned/archived flags), plus project names, and which sidebar groups you collapsed. | So the conversation list can be shown immediately, and still be shown if the network call fails. |

**Conversation bodies (the messages themselves) are never written to storage.** They are
held in memory only while the tab is open and are gone when the tab closes.

### Clearing stored data

- Conversation-list cache: run `:sidebar clear-cache` in the terminal.
- Settings: **Options → 전체 기본값으로** (reset all to defaults).
- Everything: remove the extension. Chrome deletes its storage with it.

## Access token

To call ChatGPT's backend endpoints on your behalf, the extension reads the access token
that the ChatGPT page itself issues at `/api/auth/session`.

- It is held **in memory only**, for at most 5 minutes, then re-read as needed.
- It is **never written to storage**, never logged to the console, and never sent to any
  origin other than `chatgpt.com`.
- It is discarded when the tab is closed.

Source: `src/content/oai.js`.

## Logging

The extension writes diagnostic lines to the page's developer console (prefixed
`[gpt-skin]`). These contain counts and status only — for example "conversation loaded,
12 messages". **They never contain message text, titles, or the access token.**

## Data we do not collect

gpt-skin does not collect, transmit, sell, or share any of the following:

- Personally identifiable information
- Health, financial, or authentication information
- Personal communications (your conversations are read to display them, and are never
  transmitted anywhere)
- Location
- Web history or user activity analytics
- Website content from any site other than `chatgpt.com`

No data is used or transferred for purposes unrelated to the extension's single purpose,
for creditworthiness or lending, or for sale to third parties.

## Permissions and why they are needed

| Permission | Why |
|---|---|
| `storage` | To keep your settings and the conversation-list cache described above. |
| `https://chatgpt.com/*` (host access) | The extension only works on ChatGPT. This is the single site it needs, and it requests no others. |

## Children

gpt-skin is not directed at children and collects no data from anyone.

## Changes

If this policy changes, the "Last updated" date above changes with it, and the extension's
store listing will point to the current version.

## Contact

**TODO** — issue tracker or contact email for the published listing.

## Not affiliated with OpenAI

gpt-skin is an independent extension. It is not affiliated with, endorsed by, or
sponsored by OpenAI. "ChatGPT" and "OpenAI" are trademarks of OpenAI.

---
---

# 개인정보처리방침 — gpt-skin

**최종 수정: 2026-09-07**

> **제출 전 TODO** — 이 문서를 공개된 URL 에 올리고, 그 URL 을 웹스토어 대시보드의
> *개인정보 보호 → 개인정보처리방침 URL* 에 넣어야 합니다. 그 외에 고칠 것은 없습니다.

gpt-skin 은 ChatGPT 웹을 터미널 화면으로 다시 그리는 브라우저 확장입니다.
이 방침은 확장이 무엇에 접근하고, 무엇을 남기고, 무엇을 하지 않는지를 적습니다.
아래 내용은 모두 공개된 소스 코드에서 확인할 수 있습니다.

## 요약

**gpt-skin 은 어떤 데이터도 외부로 보내지 않습니다. 서버도, 분석 도구도, 광고도 없습니다.**

모든 동작은 `chatgpt.com` 탭 안에서, 사용자의 브라우저 안에서만 일어납니다.

## 무엇에 접근하나

확장은 `https://chatgpt.com/*` 에서만 동작합니다. 그 페이지에서

1. **대화 내용을 읽습니다.** 터미널 출력으로 그리기 위해서입니다. 두 경로를 씁니다.
   - ChatGPT 페이지가 **이미 보내고 있는** 요청의 응답을 읽습니다. 응답이 생성되는
     동안 흘러오는 스트리밍 응답도 포함합니다.
   - 페이지 안에서 ChatGPT 자신의 백엔드(`/backend-api/…`)를 호출해 대화 전체와
     대화 목록을 받아옵니다. 그러지 않으면 앞쪽 메시지가 화면에서 누락됩니다.
2. **세션 액세스 토큰을 읽습니다.** 페이지 자신의 `/api/auth/session` 에서 받습니다.
   위 백엔드 호출에 필요합니다. 아래 *액세스 토큰* 항을 보십시오.
3. **사용자가 지시한 변경을 보냅니다.** `:rename` · `:pin` · `:archive` · `:rm` · `:mv`
   같은 명령을 실행하면 같은 백엔드를 호출해 계정에 반영합니다.
   명령을 실행하지 않으면 아무것도 보내지 않습니다.

다른 웹사이트, 방문 기록, 북마크, 다운로드, 다른 사이트의 쿠키, 클립보드 내용에는
접근하지 않습니다.

## 데이터가 어디로 가나

**ChatGPT 외에는 어디에도 가지 않습니다.** 확장이 보내는 모든 요청의 목적지는
`chatgpt.com` 이며, 이는 사용자가 이미 쓰고 있고 이미 로그인해 둔 서비스입니다.
gpt-skin 서버는 존재하지 않습니다. 개발자에게도, 제3자에게도 전송하지 않습니다.

## 기기에 저장되는 것

Chrome 확장 저장소 두 곳을 쓰며, 둘 다 사용자 기기에만 있습니다.

| 위치 | 무엇 | 왜 |
|---|---|---|
| `chrome.storage.sync` | **설정값만** — 테마, 글자 크기, 줄 간격, 본문 폭, 사이드바 폭·표시, 커서 모양, 타임스탬프 형식, 알림 방식, 깨짐 정책, 드리프트 임계값, 자동 시작 여부. | 설정을 유지하고, Chrome 동기화를 켜 두었다면 프로필을 따라가게 하려고. **대화 내용은 여기 저장되지 않습니다.** |
| `chrome.storage.local` | **대화 목록** 캐시 — ChatGPT 목록 API 가 주는 요약 객체(대화 id, 제목, 시각, 프로젝트 소속, 고정·보관 여부)와 프로젝트 이름, 그리고 접어 둔 그룹. | 목록을 즉시 띄우고, 네트워크 호출이 실패해도 보여주기 위해. |

**대화 본문(메시지 자체)은 저장소에 쓰지 않습니다.** 탭이 열려 있는 동안 메모리에만
있고 탭을 닫으면 사라집니다.

### 저장된 것을 지우려면

- 대화 목록 캐시 — 터미널에서 `:sidebar clear-cache`
- 설정 — **옵션 → 전체 기본값으로**
- 전부 — 확장을 삭제하면 Chrome 이 저장소까지 함께 지웁니다

## 액세스 토큰

ChatGPT 백엔드를 사용자 대신 호출하기 위해, ChatGPT 페이지가 스스로 발급하는
액세스 토큰을 `/api/auth/session` 에서 읽습니다.

- **메모리에만** 두며, 최대 5분까지만 유지하고 필요할 때 다시 읽습니다.
- **저장소에 쓰지 않고**, 콘솔에 찍지 않고, `chatgpt.com` 이외의 어디로도 보내지 않습니다.
- 탭을 닫으면 사라집니다.

근거: `src/content/oai.js`

## 로그

확장은 페이지 개발자 콘솔에 진단용 줄을 씁니다(`[gpt-skin]` 접두사). 건수와 상태만
담습니다 — 예: "대화 원본 12건". **메시지 본문·제목·토큰은 절대 찍지 않습니다.**

## 수집하지 않는 것

- 개인 식별 정보
- 건강·금융·인증 정보
- 개인 통신 — 대화는 화면에 그리기 위해 읽을 뿐, 어디로도 전송하지 않습니다
- 위치
- 방문 기록, 사용자 활동 분석
- `chatgpt.com` 이외 사이트의 콘텐츠

확장의 단일 목적과 무관한 용도, 신용 평가·대출 목적, 제3자 판매에 데이터를
사용하거나 이전하지 않습니다.

## 권한과 그 이유

| 권한 | 이유 |
|---|---|
| `storage` | 위에 적은 설정값과 대화 목록 캐시를 두기 위해. |
| `https://chatgpt.com/*` (호스트 접근) | 확장은 ChatGPT 에서만 동작합니다. 필요한 사이트는 이 하나이며 다른 사이트는 요청하지 않습니다. |

## 아동

gpt-skin 은 아동을 대상으로 하지 않으며, 누구로부터도 데이터를 수집하지 않습니다.

## 변경

이 방침이 바뀌면 위의 "최종 수정" 날짜도 함께 바뀝니다.

## 연락처

**TODO** — 게시용 이슈 트래커 또는 연락 메일

## OpenAI 와 무관합니다

gpt-skin 은 독립적인 확장입니다. OpenAI 와 제휴하거나 후원받지 않았습니다.
"ChatGPT" 와 "OpenAI" 는 OpenAI 의 상표입니다.
