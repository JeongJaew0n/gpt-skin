# 로그인 화면에서 스킨을 켜면 빈 화면이 된다

조사 · 수정: 2026-10-02 · 0.20.1 · 사용자 크롬(로그인)에서 Claude in Chrome 으로 실측

---

## 1. 관측 `[확정]`

`/c/6abdd151-…` 를 열고 `Ctrl+\``:

```
<html> 클래스         gpt-skin-on 붙음     ← 확장은 살아 있고 토글도 됐다
#gpt-skin-host        없음                 ← 스킨 화면 요소가 문서에 없다
#gpt-skin-page-style  있음                 ← 원본을 가리는 스타일은 남아 있다
data-gpt-skin-gen     없음                 ← <html> 의 세대 표식도 지워졌다
화면                   통째로 흰 화면
```

새로고침 직후 0.25초 간격으로 쟀더니 5.3초 시점부터 이미 호스트 · 세대 표식이 없었다.
콘솔: `Minified React error #418 … args[]=HTML` — 하이드레이션 불일치. 원본이 문서를 클라이언트에서 통째로 다시 그렸다.

## 2. 원인 `[확정 — 코드]` · `[가정 — 방아쇠]`

- **호스트를 지운 것은 원본의 재렌더다.** 재렌더가 `<html>` 속성과 `<body>` 아래 낯선 요소를 지웠다
- 우리는 사라진 호스트를 다시 붙이지 않았고, 가리는 스타일은 호스트가 있든 없든 걸렸다 → 빈 화면
- **방아쇠는 우리일 가능성이 높다 [가정].** `cover.host()` 가 `<body>` 가 없으면 `<html>` 에 호스트를 바로 붙였다
  (콘텐츠 스크립트는 document_start 에 돈다). 오류의 대상이 `HTML` 인 것과 맞는다. 다른 확장(이 브라우저엔 trancy 가
  `<html>` 에 클래스를 붙인다)일 수도 있어 확정하지 않는다

## 3. 고친 것

- `<body>` 안에만 붙인다. 없으면 생길 때까지 기다린다
- **지워지면 다시 붙인다** — `<html>` 의 자식(본문 교체)과 `<body>` 의 자식을 지켜본다. shadow root 는 떨어져 있는 동안에도
  살아 있어 다시 붙이기만 하면 화면이 돌아온다
- 켜 둔 상태(`<html>` 의 `gpt-skin-on`)와 세대 표식(`data-gpt-skin-gen`)이 지워지면 되살린다
- **안전망**: 원본을 가리는 규칙을 `:has(> body > #gpt-skin-host)` 로 묶었다. 어떤 이유로든 호스트가 없으면 빈 화면 대신 원본이 보인다
- 보고서(`:bug`)에 `host attached|DETACHED · restored N`

## 4. 같이 본 것 (이번에 고치지 않음)

- **로그인 화면에 `[data-message-id]` 가 없다.** 메시지는 `data-chatgpt-selection-message-id` · `data-turn-key` ·
  `data-markdown-text-style="assistant-message"` 로 그려진다. `tap.js` 의 DOM 수확과 `verify`(fiber) 가 이 선택자에 기대므로
  둘 다 지금 아무것도 못 읽을 것이다 `[가정 — 고친 판으로 확인 필요]`. 대화는 API(`pull`)로 읽으므로 화면은 나오지만,
  끊김 교정 · DOM 폴백은 꺼진 셈이다. 따로 고친다
- **로그인 화면의 입력창**: `#prompt-textarea` 없음, `form[data-chatgpt-composer] [contenteditable="true"]` 1 ·
  `.ProseMirror[contenteditable="true"]` 1 — 0.11.3 이후 판은 찾는다. 테스터의 '원본 컴포저를 찾지 못했습니다' 는
  0.11.3 이전 판이었거나 다른 화면이었을 것이다 `[가정]`

## 회귀 방지 — `test/hostkeep.test.mjs`

body 없을 때 기다림 · 본문 교체 뒤 다시 붙임 · 호스트만 떼어도 다시 붙임 · shadow 유지 · 클래스 되살림(켜 둔 때만) ·
remove 뒤 안 붙임 · :has 규칙 · 세대 표식 · 보고서. 6곳을 되돌려 실패를 확인했다.
