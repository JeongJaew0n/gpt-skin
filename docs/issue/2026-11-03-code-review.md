# 전체 코드 리뷰 (2026-11-03) — 고친 것 여덟 · 못 잰 후보 넷

0.32.0 기준 `src/` 리뷰. 두 번에 걸쳐 읽었다.

- **1차** — 위험한 곳부터 끝까지 읽었다: 스트림(tap) → 전송(compose) → 상태(store) → 부팅·배선(index) → 입력(prompt) →
  명령(commands) → 대화 원본 · 조작(conversation · convops · oai · navigate) → 탭 · 서비스 워커 · 배지(tabs ·
  service-worker · health · skin · cover · protocol) → config · bugs · popup. 약 4,500줄이다.
  사이드바 · markdown · picker 는 일부만, 세 스킨 · theme · chats · messup · image · palette · renderplan ·
  clipboard · options · welcome 은 리스너 정리만 grep 으로 봤다. **처음 이 문서는 "`src/` 를 다시 읽었다" 고 적었는데
  사실이 아니었다** — 사용자가 "진짜 다했어?" 라고 물어 이 세션 기록에서 실제로 연 파일을 뽑아 보고 알았다.
- **2차** — 나머지를 끝까지 읽었다: skins/terminal · sheet · none, sidebar, markdown, picker, renderplan, clipboard,
  chats, messup, image, palette, theme(로직), options, welcome, popup.html. CSS 는 모양만이라 읽지 않았다.

기준선: `tools/test.sh` 2178 케이스 · 58 파일 통과. 끝: 2241 케이스 · 62 파일 통과. `tools/package.sh` 통과(0.32.8, 240K, 64 파일).

## 고친 것 `[확정]`

| 판 | 무엇 | 어떻게 드러났나 |
|---|---|---|
| 0.32.1 | **`:rm 3 yes` 가 엉뚱한 대화를 지울 수 있었다.** 대상 고르기가 `:ls` 번호가 목록에 없으면 같은 글자로 id 앞자리 → 제목 일부를 찾고, 여럿이 맞아도 첫 번째를 골랐다 | 테스트로 재현. 고친 뒤 하네스(진짜 브라우저)에서 `:ls` 전 번호 · 범위 밖 번호 · 여러 개 맞는 앞자리를 넣어 거절과 안내 문구를 확인 |
| 0.32.2 | **새 채팅의 임시 주소 `/c/local-chatgpt%3A…` 를 대화로 봤다.** 'local-chatgpt' 탭이 저장돼 남고, `GET /backend-api/conversation/local-chatgpt`(404)를 읽으러 갔다 | 코드. 임시 주소 모양은 2026-10-16 실측 |
| 0.32.3 | **배지가 실제와 어긋났다.** 잠들었다 깬 서비스 워커는 'visible' 만 받아 경고(⚠)를 잃고 초록으로 그렸다. show · hide 는 배지에 알리지 않아 노 스킨의 Ctrl+; · esc · 바깥 클릭과 부팅 때 먼저 켜는 것이 배지에 닿지 않았다 | 코드 · 워커를 새로 띄운 모의 |
| 0.32.4 | **없는 명령 `:q` 로 안내했다** (모델 · 추론 수준 선택기를 못 찾을 때). 같은 종류를 막는 검사가 터미널 파일만 봤다 | 코드. 검사를 사전 · 명령 · 스킨 전체로 넓혔다 |
| 0.32.5 | **DOM 수확이 'thinking ×N' 과 받는 중 표시를 지웠다.** 수확이 레코드를 새로 만들며 수확이 모르는 값을 버렸다 | 테스트로 재현 |
| 0.32.6 | **사이드바 '⋯ → 삭제' 가 두 번 눌러도 지우지 않았다.** 두 번째 누름을 나중에 붙인 bubble 리스너(once)가 받게 했는데, 같은 항목의 capture 리스너가 매번 `stopPropagation` 을 불러 once 가 한 번도 불리지 않았다. 처음 만든 커밋(45d0002, 2026-09-01)부터 그랬다. `:rm` · 선택 모드 삭제는 다른 길이라 영향 없다 | 2차 리뷰. 크롬 실측 — 아래 표 |
| 0.32.7 | **보관 뒤 안내하는 `:archive <id> off` 가 대상을 못 찾았다.** 대상 고르기는 `:ls` 목록과 사이드바 목록에서만 찾는데, 대화 목록은 보관한 대화를 뺀다(`chats.group`, 서버도 목록에서 뺀다 — 2026-09-01 실측). `convops.archive` 가 이 탭에서 성공한 보관을 기억하고 `… off` 일 때만 거기서도 찾는다 | 2차 리뷰. 하네스 실측 — 아래 표 |
| 0.32.8 | **설정 화면 '모두 기본값' 뒤에 이전 스킨의 항목 · 언어가 남았다.** 한 항목씩 바꿀 때는 언어 · 스킨 · 탭별 분할이 바뀌면 다시 그리는데, '모두 기본값' 은 저장만 했다 | 2차 리뷰. 헤드리스 크롬 실측 — 아래 표 |

새로 쓴 검사는 고치기 전 코드로 돌려 실패하는 것을 하나씩 확인했다(각 커밋 메시지에 건수).

### 2차에서 잰 것 (크롬 156)

하네스(`tools/harness/`, 진짜 `src/` · 원본에 기대는 가장자리만 흉내)와 설정 화면을 헤드리스 크롬에 띄우고 CDP 로 눌렀다.
클릭은 `Input.dispatchMouseEvent`(isTrusted)다. 서버는 2026-09-01 실측대로 흉내 냈다 — 보관하면 목록 API 에서 빠진다.

| 무엇 | 고치기 전 | 고친 뒤 |
|---|---|---|
| 같은 배선만 떼어 낸 페이지(capture 리스너가 stopPropagation, 같은 요소의 bubble 리스너) | 두 번째 누름에 capture 리스너만 불리고 bubble 리스너는 안 불림 | — |
| '⋯ → 삭제' 두 번 (진짜 sidebar.js) | 메뉴가 '정말 삭제? 한 번 더' 로 남음 · `convops.remove` 0회 | 메뉴 닫힘 · `convops.remove('x2')` 1회 — 터미널 · 시트 · none |
| '⋯ → 보관' 뒤 안내대로 `:archive x2 off` | `[error] 대상을 찾지 못했습니다: x2` | `보관 해제: K8s 설명` · `PATCH {is_archived:false}` · 다시 읽은 목록에 복귀 — 터미널 · 시트 · none (하네스의 convops 흉내 대신 진짜 convops.js) |
| 설정 화면, 저장값 sheet · en 에서 '모두 기본값' | 저장소는 terminal · auto, 화면은 sheet.theme · ribbon · chatTabs 그대로, 다시 그림 0회 | 다시 그림 1회 → terminal.theme · terminal.chatTabs · wrap.columns · cursor.* |

**검사가 통과하는데 기능이 깨져 있던 예**: `test/convops.test.mjs` 의 '메뉴의 삭제는 두 번 눌러야 한다' 는 소스에 `armed` 라는
글자가 있는지만 봐서 0.32.5 까지 줄곧 통과했다. 새 `test/sidebarmenu.test.mjs` 는 진짜 sidebar.js · convops.js ·
commands.js 를 싣고 누름을 흘린다. 가짜 DOM 의 이벤트 순서는 위 실측과 같다(조상 capture → 대상 capture →
대상 bubble → 조상 bubble, stopPropagation 은 다음 노드로 넘어가기를 막는다). Node 의 `EventTarget` 은 이 순서를
흉내 내지 않아 이 버그를 재현하지 못한다 — Node 24 실측: capture 여부와 상관없이 등록 순서대로 부르고,
capture 리스너가 `stopPropagation` 을 불러도 같은 대상의 다음 리스너가 불린다.

## 못 잰 후보 `[미정]`

원본의 동작에 달려 있어 추측으로 고치지 않았다. 이번에는 원본 ChatGPT 를 잴 수 있는 브라우저가 없었다 — ego 브라우저의
ChatGPT 는 `/auth/login` 으로 넘어갔고(세션 응답에는 토큰이 있었다), 사용자 크롬은 claude-in-chrome 연결이 시간 초과였다.
2차의 헤드리스 크롬은 로그인이 없어 원본을 열 수 없다.

1. **중지(esc · ^C)하면 '받는 중' 이 남는가.** `tap.js` 는 읽던 스트림이 `[DONE]` · `message_stream_complete` 없이 끝나면
   (중지로 요청이 끊기면 `AbortError`) `end` 를 보내지 않는다. 그러면 `store.streamingId` 와 그 답의 `streaming` 이 남아
   회전자 · 커서 · STREAM 모드가 다음 답이 시작할 때까지(그 답의 표시는 그 뒤로도) 남는다.
   하네스의 `compose.stop()` 은 `store.end()` 를 직접 불러 이 길을 흉내 내지 못한다.
   **확인 방법**: 승인받은 짧은 시험 글을 보내고 답이 흐르는 중에 원본 중지 버튼을 누른다. 페이지의 `fetch` 를 감싸
   그 스트림이 `[DONE]` 으로 끝나는지 · `AbortError` 로 끊기는지, 우리 화면의 `GT.store.state.streamingId` 를 본다.
   끊기는 것이면 tap 이 읽기를 마칠 때 `complete('abort')` 를 보내고, 아래 2 의 대비를 함께 넣는다.
2. **답을 받는 중에 다른 대화로 옮기면 그 답이 옮긴 대화에 붙는가.** 주소가 바뀌면 `replaceAll` 이 `streamingId` ·
   `slotId` 를 비운다. 앞 대화의 스트림이 계속 흐르면 `store.delta` 가 붙일 곳을 못 찾아 그 id 로 새 레코드를 만든다 —
   옮긴 대화 맨 아래에 앞 대화의 답이 뜬다. `store.end` 도 id 를 못 찾으면 화면의 마지막 메시지에 글을 쓴다.
   **확인 방법**: 받는 중에 사이드바로 다른 대화를 열고, 앞 스트림이 계속 읽히는지(위의 `fetch` 감싸기) · 화면에 붙는지 본다.
   붙는다면 스트림의 `conversation_id`(메시지 add 줄에 실려 온다)를 tap 이 함께 보내 지금 대화가 아니면 버린다.
3. **임시 주소에 얼마나 머무는가.** 0.32.2 는 주소 틱(600ms)이 임시 주소를 본다는 전제다. 숨은 탭에서는 198초 넘게 머물렀다
   (`docs/issue/2026-10-16-stale-warning-follows-conversations.md`). 보이는 탭에서는 재지 못했다 — 새 채팅에서 시험 글을 보내
   주소가 바뀌는 시각을 잰다.
4. **맨 주소(링크 표기 없는 `https://…`)가 어디서 끝나는가.** `markdown.js` 는 공백 · `<>()` 전까지를 주소로 본다.
   그래서 `https://example.com에서` 는 '에서' 까지, `https://example.com/a.` 은 끝의 마침표까지 주소가 된다 —
   한글이 붙으면 링크가 다른 도메인(IDN)을 가리킨다. 원본(GFM 자동 링크)이 어떻게 자르는지 재지 않았다.
   **확인 방법**: 원본 답에 이런 주소가 나온 대화에서 원본 링크의 `href` 와 우리 링크를 비교한다.

## 범위 밖에서 본 것 (손대지 않았다)

- **사전에 없는 화면 문구가 많다** — 영어 설정에서도 한국어로 나온다. 1차에서 본 팝업 도움말 다섯 줄 · `commands.js` 의 예전
  명령 결과 말고도: 터미널 입력줄 자리표시 '메시지 또는 명령 (:help)'(답변 중 문구는 사전에서 꺼내 둘이 섞인다) ·
  '생각 중' · 시각 '…초 전 · …분 전' · 복사 단추 '복사 · 복사됨 · 복사 실패'(markdown.js) · 손잡이 '대화 목록 접기 · 펼치기' ·
  '추론 수준 바꾸기' · '● 현재' · '⇥ 완성' · 자리표시자 '… ^` 로 원본에서 봅니다' · ':messup — 화면에만 있는 출력',
  사이드바 메뉴 · 선택 모드 · 빈 목록 문구 전부, picker 의 '낮음 · 중간 · 높음'. 파일 머리말대로 `docs/plan/2026-09-08-i18n.md` 의
  순서로 옮길 일이다.
- **팝업 · 메뉴의 바깥 누름 리스너가 남는다** — 터미널의 추론 수준 팝업(`popup`)과 사이드바 메뉴(`menu`)는 바깥을 눌러
  닫을 때만 리스너를 뗀다. 항목을 골라 닫으면 남았다가, 다음에 다른 팝업이 열린 채 바깥을 누를 때 떨어진다. 동작은 같다.
- **`config.set` 뒤 바뀜 알림이 두 번 돈다** — `set` 이 직접 한 번, `chrome.storage.onChanged` 가 한 번. 두 번째는 같은 값이라
  `applyConfig` · `render` 를 한 번 더 할 뿐이다.
