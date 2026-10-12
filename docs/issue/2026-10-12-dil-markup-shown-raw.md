# 답에 `<box> <row> <divider …/>` 같은 마크업이 그대로 보인다 — 원본의 생성형 UI(DIL) 본문

관측: 2026-10-12 · 0.29.0 · 사용자 크롬(로그인 ChatGPT) · 모델 `gpt-6-thinking`

## 증상

```
</box> </row> <divider color="subtle"/> <row align="start" gap={3}> <box background="surface-secondary" radius="lg" padding={2}> <icon name="plane" size="lg"/> </box> <box flex="1" gap={1}> 3단계 — 2027년 여름 이후
```

답 한가운데에 태그가 한 줄로 이어져 보인다. 터미널 · 시트 둘 다 같은 본문(store)을 그리므로 둘 다 해당한다.

## 확인한 것 `[확정]`

문제의 대화를 대화 원본 API(`/backend-api/conversation/<id>`)로 읽었다.

### 1. 본문(`content.parts`)에 JSX 꼴 마크업이 맨몸으로 들어 있다

- 코드 펜스(```` ``` ````)도, 인용 봉투(`U+E200 … U+E201`)도 없다. 마크다운 사이에 그냥 줄로 들어 있다
- 블록 앞은 평범한 문단('내가 파악한 핵심적인 특징은 다음과 같아.'), 블록은 `<box gap={3}>` 로 시작해 `</box>` 로 끝난다
- 관측한 태그와 속성

| 태그 | 속성 |
|---|---|
| `box` | gap · background · radius · padding · flex |
| `row` | align · gap · justify |
| `icon` | name · size · color |
| `divider` | color |
| `text` | color · weight · size |
| `title` | size |
| `Cite` | ref (`<Cite ref="turn295970search0"/>`) — 인용이 봉투가 아니라 태그로 온다 |
| `MemoryCite` | (없음) |
| `AsyncImage` | query · aspectRatio … (다른 답) |
| `Link` | (requiredComponents 에만 보임) |

### 2. 메타데이터 `model_dil_v2` 가 같이 온다

- 키: `code` · `constants` · `fallbackMarkdown` · `fallbackMarkdownVersion`(1) · `requiredComponents` · `appData`
- `code` 는 컴파일된 JS 다: `DIL.render(__dil.jsx(()=>{…}))`. 원본 화면은 본문 글이 아니라 이 코드로 카드 UI 를 그리는 것으로 보인다 `[가정 — 원본 화면이 가상 스크롤이라 그 카드를 화면에서 직접 보지 못했다]`
- `requiredComponents` 예: `["Cite","MemoryCite"]` · `["AsyncImage","Cite","Link","MemoryCite"]`
- 예전에 본 `genui` 봉투의 content_references 타입이 `dil` 이었다 (docs/issue/2026-09-04-citation-markers-shown-raw.md) — 같은 계열로 보인다 `[가정]`

### 3. `fallbackMarkdown` 은 우리가 이미 그릴 수 있는 모양이다

이 대화 답 22개(전부 `gpt-6-thinking`):

```
model_dil_v2 있음        22 / 22
본문에 태그가 섞임         9   (UI 블록 · <Cite> · <MemoryCite> · <AsyncImage>)
fallbackMarkdown 에 태그   0
  인용                    U+E200 cite U+E202 turn… U+E201   ← markdown.js 가 처리하는 봉투
  그림 묶음               U+E200 image_group U+E202 {…} U+E201
태그 없는 답 13 개: fallbackMarkdown 과 본문이 같다 5 · 다르다 8 (fallback 이 2~28자 길다 — 무엇이 다른지 [미정])
```

UI 블록 자리는 fallback 에서 평범한 마크다운 문단 · 굵은 글씨로 풀려 있다.

### 4. 우리 렌더러로 재현했다

`GT.markdown.blocks()` 에 같은 모양의 마크업을 넣으면 태그 줄이 어느 블록 규칙에도 안 걸려 문단으로 모이고,
문단은 줄을 공백으로 잇는다 → 증상과 같은 한 줄이 나온다:

```
para | <box gap={3}> <row align="start" gap={3}> <box background="surface-secondary" radius="lg" padding={2}> <icon name="compass" size="lg"/> </box> <box flex="1" gap={1}> 2단계 — 2026년 </box> </row> <divider color="subtle"/> …
```

## 원인

새 모델(이번 관측 `gpt-6-thinking`)의 답이 **생성형 UI 마크업(DIL)을 본문에 섞어** 보낸다. 원본은 `model_dil_v2.code` 로 UI 를 그리고,
우리는 `content.parts` 를 마크다운으로 그리므로 태그가 글자로 보인다.

- 대화 원본 경로(`conversation.js` `toRecords`): `parts` 를 그대로 쓴다 → 새로고침해도 보인다 `[확정 — 코드]`
- 스트림 경로(`tap.js`): 본문 델타를 그대로 쌓는다 → 답을 받는 동안에도 보인다 `[가정 — 이번에 스트림은 잡지 않았다]`
- 인용이 `<Cite ref=…/>` 태그로 오므로 인용 번호도 안 붙는다

## 고치는 방향

0.29.1 에서 1 · 2 를 했다 — `conversation` 5건 · `bugs` 1건 검사, 고친 줄을 되돌리면 실패. 3(스트림)은 실측 전이라 남겼다.

1. **대화 원본 경로** — `model_dil_v2.fallbackMarkdown` 이 문자열이면 본문 대신 그것을 쓴다. 우리 렌더러가 이미 아는 모양(봉투 인용 · 마크다운)이라 고칠 곳이 이것 하나다.
   DIL UI 를 직접 흉내 내 그리지 않는다 — 터미널 · 시트에 카드 UI 는 맞지 않고, 컴파일된 코드를 실행하는 것은 위험하다.
2. **0.28.3 안전망과의 충돌** — 답이 끝난 뒤 원본으로 맞출 때 '원본이 화면보다 짧으면 맞추지 않는다' 가드가 있다.
   fallback 은 마크업이 빠져 본문보다 짧으므로(13008 / 15949자) 그대로면 맞추지 못한다. DIL 답이면 가드를 건너뛰어야 한다.
3. **스트림 경로** — 스트림이 `fallbackMarkdown` 을 실어 보내는지 모른다 `[미정]`. 확인: 인용 · UI 가 나올 만한 질문을 하나 보내 SSE 의
   `/message/metadata/model_dil_v2` 쪽 op 를 본다. 안 실어 보내면 받는 동안은 태그 줄을 숨기고(2의 안전망이 끝난 뒤 바로잡는다),
   실어 보내면 end 때 바꾼다.
4. 회귀 검사는 이번 실측 모양(태그 · 속성 · fallback 의 봉투) 그대로 만든다.

## 남은 것 `[미정]`

- 원본 화면이 이 블록을 실제로 어떻게 그리는지 (카드인지) — 화면에서 확인하지 못했다
- 태그 없는 답에서 fallback 과 본문이 2~28자 다른 이유
- 다른 모델(예: gpt-5 계열)도 DIL 을 쓰는지 · 언제부터인지
