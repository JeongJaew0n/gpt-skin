# url 봉투를 통째로 지운다 · 스트림이 중간에 멈춘다

증상 두 가지가 한 대화에서 같이 나왔다. **원인은 서로 다르다.**

```
사용자: docker 사이트 알려줘.

원본 UI                          gpt-skin
──────────────────────────       ──────────────────────────
· Docker 공식 사이트: docker.com ↗   · Docker 공식 사이트:
· Docker Hub: hub.docker.com ↗       · Docker Hub:
· Docker 공식 문서: docs.docker.com ↗ · Docker 공식 문서:
```

측정 대화: `/c/6aa0ed97-da68-83ee-96fe-3856331f85ad` (2026-09-09 실측)

---

## 1. 링크가 사라진다 — `[확정]`

### 무엇을 봤나

`content_references` 세 개가 전부 **`type: "url"`** 이었다.

```json
{
  "type": "url",
  "start_idx": 22, "end_idx": 62,
  "matched_text": "urldocker.comhttps://…",
  "alt": "[docker.com](https://…?utm_source=chatgpt.com)"
}
```

본문의 마커 원문은 이렇게 생겼다.

```
urldocker.com<주소>
        ^종류    ^보여줄 글자     ^주소
```

**`` 가 두 번**이다. 지금까지 본 `cite`·`genui` 봉투는 한 번이었다.

```
citeturn0search17          ← 한 번
urldocker.com<주소>  ← 두 번
```

### 왜 사라졌나

`markdown.js` 의 인용 타입 목록에 `url` 이 없었다.

```js
const CITE_TYPES = /^(grouped_webpages|webpage|webpage_extended|sources_footnote)$/;
```

`mark()` 는 이 목록에 없으면 **빈 조각을 돌려준다** — 마커를 지우기만 한다.
"무엇인지 모르는 것을 출처인 양 번호 매기면 안 된다" 는 판단이었고, 그 자체는 맞다.
`url` 은 모르는 종류였을 뿐이다.

**두 경로 모두 막혀 있었다.** fiber 쪽은 `:contentReference[oaicite:0]{index=0}` 로
오는데, 종류는 결국 `refs[0].type` 을 봐야 알고 그게 `url` 이라 똑같이 지워졌다.

### 원본은 어떻게 하나

`content_references[].alt` 를 쓴다. 거기에 완성된 마크다운 링크가 들어 있다.

```
[docker.com](https://www.docker.com/?utm_source=chatgpt.com)
```

번호를 매기지 않는다. **인용이 아니라 문장 안에 박힌 링크다.**

### 고친 것

`url` 은 인용 번호를 매기지 않고 그냥 링크로 그린다.

```js
if (type === 'url') {
  const a = urlLink(ref, payload);
  if (a) return a;
  return document.createDocumentFragment();
}
```

주소를 어디서 얻느냐는 경로마다 다르다.

| 경로 | 무엇이 있나 | 무엇을 읽나 |
|---|---|---|
| SSE·API (봉투) | `url라벨주소` | 봉투 payload 를 `` 로 자른다 |
| fiber (`oaicite`) | 봉투 없음, `refs[n].alt` | `[글자](주소)` 를 정규식으로 읽는다 |

봉투를 먼저 본다. **스트리밍 중에는 `refs` 가 아직 없기 때문이다** — 봉투만으로
링크가 되어야 답이 흘러오는 동안에도 주소가 보인다.

주소가 `http(s)` 가 아니면 통째로 지운다. 글자만 남기면 눌리지 않는 가짜 링크가 된다.

`citations` 설정이 `off` 여도 이 링크는 남는다. 그 설정은 검색 인용 번호를
가리는 것이지 본문 링크를 지우는 것이 아니다.

---

## 2. 스트림이 중간에 멈춘다 — `[미정]`

### 무엇을 봤나

같은 대화에서 검색이 걸리는 질문을 하나 더 보내 스트리밍을 지켜봤다.

```
[warn] 스트림 본문과 원본이 67% 다릅니다 (스트림 48자 / 원본 145자)
```

화면 변화를 250ms 간격으로 기록한 결과다.

| 경과 | 화면 길이 | 끝 |
|---|---|---|
| 43.4s | 31자 | `…보면 돼. · Kubernetes 공식 사이트:` |
| 43.7s | 43자 | `…· Kubernetes 공식 사이트: · Kubernetes` |
| **49.0s** | **43자** | **그대로 — 여기서 9초간 멈춰 있었다** |
| 52.8s | 148자 | `…Concepts 쪽을 보는 게 제일 좋아. [5]` |

**사용자가 본 "마지막 글자 잘림" 은 이 43자 구간이다.** 52.8초에 `verify` 가
fiber 원문으로 교정하면서 뒤늦게 완전해진다. 새로고침하면 API 원문을 다시
읽으므로 흔적이 남지 않는다 — 그래서 처음 조사할 때 재현되지 않았다.

원문과 대조하면 멈춘 지점이 정확히 나온다.

```
index  0  응, 이것들 보면 돼.\n\n
index 12  - Kubernetes 공식 사이트:
index 35  <url 봉투 1>
index 77  \n- Kubernetes
index 90  ← 스트림이 여기서 멈췄다 (마커 제거 후 48자와 일치)
index 98  <url 봉투 2>
```

**두 번째 `url` 봉투 직전**이다.

### `schema FAIL` 은 원인이 아니다

`:health` 가 `schema FAIL` 을 보여주지만, 이건 결과다.
`health.reconcile()` 이 드리프트가 임계를 넘으면 `CHECKS.schema.ok = false` 로
내린다(`health.js:107`). 델타 인코딩을 못 읽어서가 아니다.

### 가설 — 아직 확인하지 못했다

`tap.js` 에서 본문이 끊길 수 있는 경로는 하나다.

```js
if (this.current && !this.current.accepted) return;   // 본문 델타를 버린다
```

`cot_token` 마커나 도구 호출 `add` 가 오면 `current.accepted` 가 `false` 로
내려가고, 그 뒤의 본문 델타가 전부 버려진다. 최종 답변으로 돌아오는
`user_visible_token` 마커를 다시 받지 못하면 영영 버려진다.

스트리밍 중 두 번째 검색이 발동하면 이 모양이 된다 — **는 추측이다.**
SSE 원문을 보지 못했다. ChatGPT 의 CSP 가 page world 스크립트 주입을 막아
확장 밖에서는 스트림을 잡을 수 없다.

### 확증을 위해 넣은 것

`tap.js` 가 끊긴 자리를 스스로 말하게 했다.

```js
markers: ['cot_token:b5841c', 'user_visible_token:5032df', …]
droppedOps, droppedChars   // accepted=false 라 버린 본문 델타
```

`end` 에 실려 오고 `index.js` 가 `GT.log` 로 남긴다. 경고로 올리지 않는다 —
드리프트 경고가 뜬 뒤 원인을 되짚는 용도다.

**다음: 같은 조건(검색이 걸리는 질문)을 재현해 `마커 전환` 로그를 읽는다.**
가설이 맞으면 `cot_token` 이 본문 도중에 끼어든 것이 보이고, `droppedChars` 가
잘려나간 글자 수와 맞아떨어져야 한다.

---

## 함께 볼 것

- [드리프트 경고 오탐](2026-09-08-drift-warning-false-positive.md) — 같은 경고가
  두 가지 다른 일을 보고한다는 점을 그때 적어뒀다. 이번 건은 **진짜 드리프트**다
- [인용 마커가 원문으로 보인다](2026-09-04-citation-markers-shown-raw.md) — 봉투 구조를 처음 뜯은 기록
