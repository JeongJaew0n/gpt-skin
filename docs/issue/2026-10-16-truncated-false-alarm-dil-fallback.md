# 'truncated'(글자 끊김) 기록이 자주 남는다 — 생성형 UI 답의 fallback 과 잰 헛경보

관측: 2026-10-16 · 0.31.5 · 사용자 크롬(로그인 ChatGPT) · 모델 `gpt-6-thinking`

## 증상

사용자 탭 보고서(`:bug`)에 `truncated` 7건(10-15 ~ 10-16). 화면이 원본보다 21~57자 짧다고 기록됐다.
끊김 검사는 기록한 뒤 안전망으로 화면을 원본 글로 덮는다(0.28.3).

## 확인한 것 `[확정]`

문제의 대화(`/c/6ad16ff2…`)를 대화 원본 API 로 읽어 답마다 본문(`content.parts`)과 `metadata.model_dil_v2.fallbackMarkdown` 을 쟀다(공백 제외).

```
답        본문   fallback  이스케이프 걷은 fallback   보고서의 '원본'
54f31b    181    196       181 (본문과 똑같다)         196
e47ada    452    477       472 (표 구분선만 다르다)    477
b29ef3    603    631       623                         631
54b597    875    928       915                         928
ffb201    811    832       826                         832
06763d    330    337       330 (공백 무시 같음)
23ad16    294    302       294 (공백 무시 같음)
9f3aa6    483    494       483 (똑같다)
5aab95    176    166       164 — 본문에 UI 마크업 있음(<box> 등)
```

- 보고서 '원본' 7건 중 5건이 fallback 길이와 정확히 같다
- fallback 은 **같은 글을 마크다운으로 다시 써 낸 것**이다. 실측 차이는 둘뿐:
  - 백슬래시 이스케이프: `거의 맞았어\!` · `\*\*타테루는 ‘세우다’\*\*야` · `**立つ（たつ）**\: 서다`
  - 표 구분선: `|---|---|` → `|--------|--------|`
- 0.29.1 이 생성형 UI 답이면 늘 fallback 을 화면용 글로 썼고(`docs/issue/2026-10-12-dil-markup-shown-raw.md` — 그때 '태그 없는 답 8개는 fallback 이 2~28자 길다 [미정]' 이 이것),
  끊김 검사가 스트림 글(= 본문)과 그 fallback 을 재어 헛경보를 냈다

### 부작용 — 화면에 백슬래시가 보였다

안전망이 화면을 fallback 으로 덮는데, 우리 렌더러에는 백슬래시 이스케이프 처리가 없었다 `[확정 — 코드]`.
답이 끝나고 8초 뒤 `\!` `\:` `\*\*` 가 그대로 보였을 것이다(터미널 · 시트 둘 다 `GT.markdown.inline` 을 쓴다).

## 고친 것 (0.31.6)

1. `conversation.toRecords`: 본문에 마크업(코드 밖의 JSX 꼴 태그)이 **있을 때만** fallback, 없으면 본문. 본문은 `body` 로 따로 들고 있다.
   태그 이름은 보지 않는다(바뀔 수 있다). 코드 블록 · 인라인 코드 안의 태그는 세지 않는다
2. 끊김 검사: 스트림 글을 `orig.body`(스트림과 같은 출처)와 잰다
3. `markdown.inline`: CommonMark 백슬래시 이스케이프(ASCII 구두점 앞의 `\`) — 마크업 답은 여전히 fallback 을 쓰므로 필요하다

검사: `conversation` 6 · `bugs` 2 · `citation` 5. 고친 곳 넷을 하나씩 되돌리면 각각 실패.

## 진짜 빠짐도 있었다 — 메시지 객체만 오는 줄 (0.31.7) `[확정]`

승인받은 새 채팅 질문 1개(立つ와 立てる)의 스트림을 녹화(118KB)해, tap.js 의 `DeltaDecoder` 를 페이지 안에서 그대로 돌리고 대화 원본 본문과 비교했다.

```
우리 결과 868자 · 본문 873자 · 첫 글자부터 다르다
본문   **立つ(たつ)**와 **立てる(たて…
우리       たつ)**와 **立てる(たて…        ← 맨 앞 '**立つ(' 5자가 없다
droppedOps 0 · unknownOps 0 · 마커 cot_token:46d9fc → user_visible_token:e561de → final_channel_token:e561de
```

그 자리의 스트림 줄(값은 길이만):

```
14: marker cot_token 46d9fc
15: {"v":{"message":{46d9fc assistant reasoning_recap parts:[]},"conversation_id","error","error_code"},"c":…}
16: marker user_visible_token e561de
17: marker final_channel_token e561de
18: {"v":{"message":{e561de assistant text channel:final recipient:all parts:[5자]},…},"c":…}   ← 첫 조각
20: {"o":"patch","v":[{"p":"/message/content/parts/0","o":"append","v":20자}, {"p":"/message/metadata/model_dil_v2/code",…}, …]}
```

- 새 메시지가 **`p` · `o` 없이 `v` 에 메시지 객체만** 담겨 온다. `o` 가 없으면 `append` 로 읽던 규칙 때문에 메시지 생성(add)으로 알아보지 못했고,
  거기 실린 첫 조각이 버려졌다. 0.28.2 의 'o · p 없는 배열 줄' 과 같은 계열
- e561de 메타데이터에 `reasoning_status` · 숨김 표시 없음, recipient `all` — 본문으로 받는 것이 맞다
- 이 답의 화면 쪽 길이가 본문보다 짧던 `54f31b`(166 / 181) 도 같은 원인으로 본다 `[가정 — 그 답의 스트림은 녹화하지 못했다]`

고친 것: `v` 가 메시지 객체면 `o` 가 없어도 add 로 본다. 마커가 먼저 와 같은 메시지를 이미 받고 있으면 받은 본문을 덮지 않는다.
검사 `stream` 5건(실측 줄 순서 그대로) — 고친 두 곳을 되돌리면 각각 실패.

## 남은 것 `[미정]`

- 고친 tap.js 가 실제 크롬에서 같은 모양의 스트림을 끝까지 받는지 — 0.31.7 을 올린 뒤 질문 하나로 확인한다
