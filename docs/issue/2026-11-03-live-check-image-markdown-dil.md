# 실사용 점검 — 그림 · 마크다운 · 생성형 UI(HTML · 시각화)를 실제 ChatGPT 에서 세 스킨으로

관측: 2026-11-03 17:55~18:45 · 사용자 크롬(로그인 · Plus · 기본 모델 `gpt-6-thinking` · 추론 High) · 설치된 gpt-skin 을 `:reload` 로
0.32.12 → 0.32.18 까지 올려 가며 · 기본 스킨 시트, 탭별 스킨으로 터미널 · none 도 확인

사용자 요청(원문): "이미지 기능, 마크다운 기능, 요새 핫한 뭐 html같은거 그려주는 기능 전부 점검했어? 니가 직접 브라우저 띄워서
채팅쳐봐도 되니까 전부 테스트해보고 디버깅해. 모든 skin에 에러가 없는지 점검해야해."

## 어떻게 쟀나

- claude-in-chrome 으로 사용자 크롬의 탭 하나를 몰았다. ego lite 에도 Claude 확장이 있어 연결을 번갈아 빼앗았다 —
  ego 는 창을 닫아도 서비스(`--startup-ego-browser-service`)로 다시 떠서, 사용자가 ego 의 Claude 확장을 껐다.
- 화면: 스킨 shadow DOM 의 글 · 원본 DOM · 스크린샷. 원본 데이터: 대화 원본 API(`/backend-api/conversation/<id>`).
- 스트림: 페이지에서 `fetch` 를 한 번 더 감싸 `/backend-api/f/conversation` 응답을 tee 해 줄을 남겼다(측정용 · 저장소에 없음).
- 네트워크: 원본이 부르는 요청 목록.
- 출력에 `x = y` 꼴이 섞이면 도구가 쿠키로 오해해 막는다 — `= & ? ;` 를 전각으로 바꿔 꺼냈다.

## 시험한 것

| 무엇 | 대화 | 결과 |
|---|---|---|
| 마크다운 원문 되돌려 받기 (제목 · 강조 · 번호 목록 · 펜스 · 표 · 인용 · 수식 · 각주) | 마크다운 변환 출력 | 번호 목록 · 펜스는 0.32.9~10 이 실제로 동작. **링크 셋이 사라짐** → 0.32.13 |
| 그림 생성 다섯 번 | 고양이 아이콘 그리기 | **비동기 그림이 새로고침 전까지 안 보임 · 늦게 오면 다음 질문 아래** → 0.32.15. 터미널 inline · blocks 모두 실제 그림으로 그려짐 |
| HTML 페이지 두 번 | HTML 카운터 만들기 | 캔버스가 아니라 코드 실행으로 파일을 만들고 `sandbox:` 링크로 답. **받는 동안 `<icon … />` 태그가 글자로** → 0.32.17, **눌리지 않는 링크** → 0.32.18 |
| 인터랙티브 시각화(복리 계산기) | 복리 계산기 시각화 | 생성형 UI(DIL) 답 — 원본은 실행기 iframe 으로 슬라이더 · 그래프. 시트는 대체 마크다운(정적 글)으로, 코드 · 태그 누출 0 |
| 첨부 그림 업로드 | (같은 대화) | 시험 도구로 올린 파일을 원본 입력창이 받지 않아 두 번 실패 — 실사이트 확인 못 함 [미정] |
| 스킨 셋 | — | 시트 · 터미널 · none 모두 동작. 콘솔 오류 20건은 전부 원본 번들의 React #418 (우리 content script 예외 0) |

## 고친 것

| 판 | 무엇 | 실측 |
|---|---|---|
| 0.32.9 | 번호 목록이 `· · ·` 로 | 하네스 · 실제 답 모두 `1. 2. 3.` |
| 0.32.10 | 펜스 정보 문자열(`c#`) · 네 개 펜스 · 목록 안 들여쓴 펜스 | 하네스 |
| 0.32.11 | 굵게 · 기울임 안쪽의 코드 · 링크 · 취소선 | 하네스 |
| 0.32.12 | 내 첨부 그림이 안 보임 | 하네스(실사이트 업로드는 [미정]) |
| 0.32.13 | 생성형 UI 답의 링크가 사라짐 | 링크 셋이 다시 링크로 |
| 0.32.14 | 답이 끝난 뒤 친 글이 숨은 원본 입력창으로 가 메시지로 나감 | 그림 두 턴 동안 초점이 입력줄에 남음 |
| 0.32.15 | 비동기 그림이 안 보임 · 순서가 틀림 · 빈 스트림 헛경보 | 원본 순서로 보임, 다시 읽기 배선 실제 페이지에서 확인 |
| 0.32.16 | 마크다운 그림 `![…](sandbox:…)` 이 `!` + 죽은 링크 | `그림 · … — 원본 화면에서 봅니다` |
| 0.32.17 | 생성형 UI 태그가 받는 동안 글자로 | 32초 동안 0.5초마다 봐서 태그 0번 |
| 0.32.18 | `sandbox:` 파일 링크가 눌리지 않는 링크 | `… — 원본 화면에서 받습니다` |

## 원본에서 새로 확인한 것 `[확정]`

- **DOM 이 바뀌었다.** `[data-message-id]` · `[data-message-author-role]` · `.markdown` 이 없다. 메시지는
  `div[data-chatgpt-search-unit-key="fallback-turn-0:0:user"][data-chatgpt-search-message-ids=…]`, 본문은
  `div.MarkdownRoot-…[data-markdown-text-tone]` · `p.Paragraph-…`. → tap.js 의 DOM 수확 · fiber 대조(verify)와
  index.js 의 `watchThread` 가 아무것도 못 찾는다. 화면은 스트림 · 대화 원본이 채워서 영향이 없지만, 진단(드리프트 · fiber) 기능은 죽어 있다 [미정 — 새 DOM 으로 옮길지].
- 원본 입력창은 `form` 안의 `div.ProseMirror`(id 없음) — 예비 셀렉터로 잡힌다. 중지 버튼은 `data-testid` 없이 aria-label '중지' — 예비 셀렉터로 잡힌다.
- 스트림은 `[DONE]` 뒤 클라이언트가 끊는다(`AbortError`). 맨 앞에 `resume_conversation_token`(conduit · turn topic)이 온다.
- 비동기 그림: 그림 메시지에 `metadata.async_source`. 그리는 동안 대화의 `async_status` 가 `3`, 끝나면 `null`.
  분기 끝은 그림 도구 호출(assistant · recipient 가 도구 · end_turn false). 원본은 `GET /backend-api/conversations/<id>?num_turns=10&include_has_versions=true`
  를 몇 초마다 다시 읽는다. 끝 메시지는 assistant text(end_turn true)일 때도, reasoning_recap(end_turn false)일 때도 있었다.
  모델이 그림 도구를 두 번 부르고 코드 실행으로 잘라 `![…](sandbox:/mnt/data/….png)` 로 답한 턴도 있었다.
- 그림 파일: 원본은 `/backend-api/files/download/<file_id>?conversation_id=…&download_intent=false&inline=true` 로 받는다. `download_url` 은 같은 출처(`https://chatgpt.com`).
- 생성형 UI(DIL): 원본은 `https://cdn.platform.openai.com/deployments/dil/v15/runner.html` iframe 에서 `model_dil_v2.code` 를 돌린다.
  `model_dil_v2` 키에 `clientDefinedWidgets` 가 늘었고, `content_references` 앞쪽에 `client_defined_widget`(코드 블록 위젯) · `hidden` 이 온다.
  스트림은 본문 조각과 같은 patch 에 `/message/metadata/model_dil_v2/fallbackMarkdown` append 를 나란히 싣는다.
  대체 마크다운은 링크를 url 봉투로, `<br>` 을 `\<br>`, 수식을 `\[ … \]` 로 준다.
- 시각화를 부탁하면 별도 도구 없이 DIL 답(`{@body const […] = DIL.useState(…)}` + UI 마크업)으로 온다.

## 범위 밖 · 관찰 (손대지 않음)

- **시트 본문의 역슬래시가 ₩ 로 보인다.** 글꼴 순서가 `"Malgun Gothic", "Apple SD Gothic Neo", Calibri, …` 이고 맑은 고딕이 U+005C 를 ₩ 로 그린다
  (글자는 역슬래시). 엑셀 한국어판도 같다 — 디자인 선택이라 그대로 뒀다. 바꾸려면 라틴 글꼴(Calibri 등)을 앞에 둔다.
- 우리 입력줄에 친 마크다운이 원본 입력창을 거치며 이스케이프된다(``` → \`\`\`, `---` → `\---`). 원본 입력창의 직렬화다 — 원본에 직접 붙여넣었을 때와 같은지 [미정].
- 탭별 스킨(`skin.perTab`)으로 바꾼 탭이 `:reload` 뒤 기본 스킨으로 돌아갔다(서비스 워커가 다시 뜨며 탭 값이 사라지는 것으로 보인다 [가정]).
- React #418(하이드레이션 불일치, `<html>`)이 길을 옮길 때마다 났다. `<html>` 에 속성을 붙이는 확장(이 크롬엔 Trancy 의 `trancy-ko`, 우리 `data-gpt-skin-gen`)이 원인일 수 있다 [미정 — 확장을 끄고 비교해야 안다].
- 인터랙티브 DIL 답은 텍스트 스킨에서 정적 글로만 보인다('현재 값을 확인할 수 없습니다'). '원본에서 보세요' 안내 줄을 붙이는 것은 제안으로 남긴다.
- `sandbox:` 그림 · 파일을 우리 화면에서 직접 여는 것은 새 기능이다(경로 → 파일 id 짝을 찾아야 한다).

## 남은 것 `[미정]`

1. 진짜 비동기 그림 턴을 0.32.15 로 끝까지 — 0.32.14 뒤 두 번(판다 · 여우)은 동기로 와서 기존 그림 추적으로 떴다. 비동기 여부는 ChatGPT 가 정한다.
   확인: 그림을 몇 번 더 부탁해 스트림이 생각 조각만 싣고 끝나는 턴에서 `:log dump` 에 `stream-empty-N → 턴이 끝났다` 가 찍히고 그림이 제자리에 뜨는지 본다.
2. 첨부 업로드 실사이트 — 사람이 원본에서 그림을 붙이고 우리 입력줄로 보낸 뒤 터미널 · 시트에 내 그림이 뜨는지 본다.
3. 위 '범위 밖' 의 [미정] 셋.

## 시험 대화 (사용자 기록에 남음)

`마크다운 변환 출력` · `고양이 아이콘 그리기` · `HTML 카운터 만들기` · `복리 계산기 시각화`. 지울지는 사용자가 정한다.
