# 답을 받는 도중 인용이 `citeturn841…` 로 깨지고 글자가 빠진다 — 이름 없는 배열 묶음을 버렸다

관측: 2026-10-06 · 0.28.1 · 사용자 크롬(로그인 ChatGPT)

## 증상

인용이 붙는 답에서 화면에 `citeturn841044search4…` 같은 글자가 그대로 보인다. 새로고침하면 사라진다.

## 확인한 것 `[확정]`

1. 대화 원본(API)은 멀쩡하다 — 문제의 대화 마지막 답에 `turn841` 이 두 번, 둘 다 봉투가 닫혀 있다:
   `<U+E200>cite<U+E202>turn841044search4<U+E201>`. content_references 의 matched_text 도 같다.
2. 새로 연 화면(API 로 그림)에는 `turn` 이 없다 → 깨짐은 **스트림으로 받은 글** 에만 있다.
3. 새 대화에서 인용이 붙는 질문을 하나 보내 SSE 원문과 tap 이 넘긴 글을 함께 잡았다
   (사용자 승인. 질문: '오늘 한국 코로나 격리 지침 최신 기준 출처랑 같이 알려줘'):

```
SSE 줄 모양별 개수
  "o,p,v v=array" 14     ← {"p":"","o":"patch","v":[…]}  — 지금도 처리한다
  "v v=array"     10     ← {"v":[{"p":"/message/content/parts/0","o":"append","v":"276se…"}, …]}  — o · p 없이 배열만
  "v v=str"       25 · "o,p,v v=str" 13 · "c,v" 20 · …

이름 없는 배열 줄 10개에 실린 본문 append 글자 수   279
스트림으로 받은 글 1078자 · 대화 원본 1357자          차이 279
봉투 문자(U+E200~E202) 스트림 17개 · 원본 26개
```

빠진 글자 수가 이름 없는 배열 줄의 본문 글자 수와 정확히 같다.

깨진 자리 예 (스트림 글):

```
<U+E200>cite<U+E202>turn754777search0<U+E202>turn612돼도 법적인 격리 …
                                              ^^^^^^ 여기서 '276search…<U+E201>' 이 이름 없는 배열 줄로 왔고 버려졌다
```

봉투가 닫히지 않으니 `PUA_MARK` 가 못 잡고, 보이지 않는 PUA 문자 사이의 `cite` · `turn…` 이 글자로 남는다.
같은 이유로 그 사이 본문도 빠진다 — 2026-10-01 의 '글자 끊김' 과 같은 경로일 수 있다 `[가정]`.

## 원인 (코드)

`src/main/tap.js` `DeltaDecoder.op()`:

```js
const op = o.o || (o.p === undefined ? 'append' : 'add');     // {v:[…]} → 'append'
if (op === 'patch' && Array.isArray(o.v)) { … }                // 'patch' 가 아니라 건너뜀
if (typeof o.v === 'string' && …) { … }                         // 문자열이 아니라 건너뜀
```

o · p 가 없고 v 가 배열인 줄은 어떤 분기에도 걸리지 않고 조용히 사라진다. `unknownOps` 에도 안 세진다(op 가 'append' 로 잡힌다).

## 함께 발견 — 원본 DOM 표식이 바뀌었다 `[확정]`

같은 날 원본 화면에서:

| 예전 | 지금 |
|---|---|
| `[data-message-id]` · `[data-message-author-role]` | 0개. `data-chatgpt-selection-message-id` · `data-turn-key` |
| `.markdown` | 0개. `.MarkdownRoot-<해시>` |

그래서 DOM 수확 · fiber 대조(verify) · 스레드 감시(`watchThread`)가 지금 아무것도 하지 않는다.
verify 는 못 찾으면 그냥 넘어가므로 이번 깨짐의 원인은 아니다. 별도로 고친다.

## 고치는 방향 (아직 안 했다)

1. tap: o · p 가 없고 v 가 배열이면 patch 로 본다(배열의 각 op 를 처리). 회귀 검사: 실측 줄 모양 그대로.
2. 안전망: 답이 끝나면(end) 대화 원본을 한 번 읽어 그 메시지를 원본 글로 맞춘다 — 끊김 검사가 이미 8초 뒤 같은 GET 을 하고 있다.
3. DOM 표식 변경 대응은 따로.
