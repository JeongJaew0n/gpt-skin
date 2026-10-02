# 탭별 스킨 — '탭별로 분할 적용' 옵션

작성 · 구현: 2026-10-02 · 0.26.8 ~ 0.28.1

## 1. 무엇을 하나

설정에 **탭별로 분할 적용**(`skin.perTab`, 기본 끔)을 둔다.

| | 끔 (기본 · 지금과 같다) | 켬 |
|---|---|---|
| `:skin sheet` · 팝업의 스킨 버튼 | 모든 ChatGPT 탭이 바뀐다 | **지금 탭만** 바뀐다 |
| 옵션 화면의 스킨 | 모든 탭 | **기본 스킨** — 새로 여는 탭 · 아직 따로 고르지 않은 탭이 따른다 |
| 새로고침 | 전역 스킨 | 그 탭에서 고른 스킨 유지 |
| 브라우저를 다시 켬 | 전역 스킨 | 모두 기본 스킨 (탭별 값은 브라우저 세션 동안만) |
| 탭 복제 | 전역 스킨 | 기본 스킨 (새 탭이다) |

켰다가 끄면 모든 탭이 전역 스킨으로 돌아오고, 탭별로 고른 값은 지운다 — 다시 켰을 때 예전 값이 되살아나면 왜 그 탭만 다른지 알 수 없다.

## 2. 지금 구조 (코드에서 확인 `[확정]`)

- 스킨은 `chrome.storage.sync` 의 `skin` 하나 (`src/shared/defaults.js` `GT_SCHEMA`)
- 바꾸는 길 셋, 모두 같은 키에 쓴다
  - `:skin` → `GT.skin.switch` → 끝에서 `GT.config.set('skin', id)` (`shell/skin.js:150`)
  - 팝업 → `chrome.storage.sync.set({ skin: id })` (`popup/popup.js:126`)
  - 옵션 화면 → 저장 뒤 화면을 다시 읽는다 (`options/options.js:40`)
- 열린 모든 탭이 따라가는 길: `config.js` 의 `storage.onChanged`(sync) → `index.js` `GT.config.onChange` → 스킨이 다르면 `GT.skin.switch(c.skin, { persist: false })`
- 부팅: `GT.config.load()` → `GT.skin.use(cfg.skin)` → `mount`

## 3. 저장 위치 — `chrome.storage.session` (서비스워커가 관리)

| 후보 | 새로고침 | 누가 읽고 쓰나 | 판단 |
|---|---|---|---|
| 메모리 | 잃는다 | 확장 | 새로고침하면 기본 스킨으로 돌아가 버그처럼 보인다 — 탈락 |
| `window.sessionStorage` | 남는다 | **ChatGPT 페이지 스크립트도** (같은 오리진) | 원본이 읽고 지울 수 있다 · 탭 복제 때 따라 복사된다 — 탈락 |
| `chrome.storage.session` | 남는다 | 확장만 | **채택**. 브라우저를 닫으면 사라진다 |

- 키: `tabSkin.<tabId>` → `'terminal' | 'sheet' | 'none'`
- 콘텐츠 스크립트는 자기 tabId 를 모른다 → 서비스워커가 `sender.tab.id` 로 대신 읽고 쓴다
  - `{ kind: 'tabSkin:get' }` → `{ skin: <값 또는 null> }`
  - `{ kind: 'tabSkin:set', skin }` (skin 이 null 이면 지운다)
  - 팝업은 `chrome.tabs.query` 로 활성 탭 id 를 알므로 서비스워커에 `{ kind: 'tabSkin:set', tabId, skin }` 을 보낸다
  - 서비스워커가 저장한 뒤 그 탭에 `{ kind: 'skin', skin }` 을 보내 바로 바꾸게 한다 (sync 변경처럼 저절로 퍼지지 않으므로)
- 정리: `chrome.tabs.onRemoved` 에서 그 탭의 키를 지운다. `skin.perTab` 을 끄면 `tabSkin.*` 를 모두 지운다
- 콘텐츠 스크립트에 storage.session 접근 권한(`setAccessLevel`)은 열지 않는다 — 서비스워커를 거치므로 필요 없다

## 4. 바뀌는 곳

| 파일 | 변경 |
|---|---|
| `src/shared/defaults.js` | `{ section: 'skin', key: 'skin.perTab', type: 'bool', def: false }` |
| `src/shared/i18n.js` | 옵션 이름 · 설명, `:skin` 결과 '이 탭만' · '기본', 팝업 표시 — ko · en |
| `src/background/service-worker.js` | `tabSkin:get` · `tabSkin:set` · `onRemoved` 정리 · `perTab` 을 끄면 전부 지우기 |
| `src/content/index.js` | 부팅: `perTab` 이 켜져 있으면 `tabSkin:get` 을 받은 뒤 `skin.use(탭값 \|\| cfg.skin)`. config.onChange: 탭값이 있는 탭은 전역 `skin` 변경을 따르지 않는다. `perTab` 이 꺼지면 전역 스킨으로. `{kind:'skin'}` 메시지를 받으면 바꾼다 |
| `src/content/shell/skin.js` | `switch(id, { persist })` 의 저장 대상: `perTab` 이면 `tabSkin:set`, 아니면 지금처럼 `config.set('skin')` |
| `src/content/commands.js` | `:skin <id>` — 켜져 있으면 이 탭만. `:skin default <id>` — 기본(전역)을 바꾼다. 인자 없는 `:skin` 은 '이 탭: … · 기본: …' |
| `src/popup/popup.js` | 켜져 있으면 버튼이 지금 탭의 스킨을 보여 주고 지금 탭만 바꾼다. 아래 한 줄로 '이 탭만 · 기본은 설정에서' |
| `src/options/options.js` | 스킨 항목 이름을 켜져 있을 때 '기본 스킨' 으로. `skin.perTab` 토글 |
| `src/content/bugs.js` | 보고서 `skin` 줄에 `(tab)` · `(default)` 를 붙인다 — 같은 사용자가 탭마다 다른 화면을 보게 되므로 |

열린 탭 목록 · 사이드바 표시 · 글씨 크기 · 테마는 **그대로 전역**이다. 테마는 이미 스킨별 키(`terminal.theme` · `sheet.theme`)라 탭별 스킨과 부딪히지 않는다.

## 5. 트레이드오프

- **얻는 것**: 한 탭은 터미널, 다른 탭은 시트처럼 탭마다 다른 화면을 쓸 수 있다
- **잃는 것**
  - 두 층(기본 · 이 탭)이 생긴다. 옵션 화면에서 바꿨는데 어떤 탭은 안 바뀐다 → 옵션 화면 · 팝업 · `:skin` 이 모두 '이 탭' 과 '기본' 을 같이 보여 줘야 한다
  - 부팅이 서비스워커 왕복 하나를 더 기다린다. 서비스워커가 잠들어 있으면 깨우는 시간까지 `[미정]` — 아래 §7 에서 잰다
  - 탭별 값은 브라우저를 다시 켜면 사라진다 (의도. 영구 저장하려면 tabId 가 재시작 때 바뀌어 대응할 키가 없다)
- **옵션을 끈 사용자에게는 아무것도 바뀌지 않는다** — 기본 끔으로 둔 이유

## 6. 정하지 않고 남긴 것

- 부팅 때 서비스워커 응답이 늦으면: 기본 스킨으로 먼저 그리고 응답이 오면 바꿀지(깜빡임), 응답을 기다릴지(첫 화면이 늦음).
  §7 의 실측 값을 보고 정한다. 잠정안: 300ms 까지 기다리고 넘으면 기본 스킨으로 그린 뒤 바꾼다
- 재주입(확장 업데이트) 때: 새 인스턴스도 같은 tabId 로 `tabSkin:get` 하므로 이어진다 `[가정]` — 하네스에서 확인

## 7. 확인 계획

- 회귀 검사 (vm 샌드박스, 고친 코드를 깨뜨려 실패 확인)
  - 끔: `:skin` · 팝업이 전역에 쓰고 모든 탭이 따라간다 (지금과 같다)
  - 켬: `:skin` 이 `tabSkin:set` 만 보내고 전역 `skin` 은 그대로 · 다른 탭은 안 바뀐다
  - 켬: 전역 `skin` 이 바뀌면 탭값 없는 탭만 따라간다
  - 켬 → 끔: 모든 탭이 전역 스킨으로 · 서비스워커가 `tabSkin.*` 를 지운다
  - 서비스워커: get · set · 탭 닫힘 정리 · 다른 탭 id 를 콘텐츠 스크립트가 지정할 수 없다(`sender.tab.id` 만 쓴다. 팝업만 tabId 를 준다)
  - `:skin default` · 인자 없는 `:skin` 표시
- 하네스(헤드리스 크롬, 확장 로드): 탭 두 개에서 하나만 시트 → 새로고침해도 유지 → 탭 닫으면 키가 지워지는지
- 실측 `[미정]`: 잠든 서비스워커를 깨워 `tabSkin:get` 응답까지 걸리는 시간 (하네스에서 `chrome://serviceworker-internals` 로 멈춘 뒤 새로고침)
- 실제 ChatGPT 확인 `[미정]`: 로그인 탭 두 개, 하나만 시트

## 8. 작업 순서 (원자 커밋)

1. 서비스워커 `tabSkin` 저장소 + 검사
2. 설정 항목 · 문구 + 부팅/따라가기 분기(`index.js` · `skin.js`) + 검사 → 0.27.0
3. `:skin` · `:skin default` + 검사
4. 팝업 · 옵션 화면 + 검사
5. 보고서 표시 · README 명령 표

## 9. 결과 (2026-10-02)

| 단계 | 버전 | 커밋 |
|---|---|---|
| 1 서비스 워커 저장소 | 0.26.8 | `ee3acb2` |
| 2 설정 항목 · 부팅 · 따라가기 | 0.27.0 | `6744007` |
| 3 `:skin` · `:skin default` | 0.27.1 | `530dadc` — 새 명령인데 PATCH 로 올렸다(규칙 위반). 0.28.0 에서 MINOR 로 맞췄다 |
| 4 팝업 · 설정 화면 | 0.28.0 | `36db0af` |
| 5 보고서 표시 · README | 0.28.1 | `119123b` |

`tools/test.sh` 2059 케이스 · 56개 파일 통과. 새 검사는 모두 고친 코드를 깨뜨려 실패하는 것을 확인했다.

### 헤드리스 크롬 실측 (크롬 154, 확장을 `Extensions.loadUnpacked` 로 올림, 비로그인 chatgpt.com 탭 둘) `[확정]`

```
set perTab: ok
A skin terminal · B skin terminal
A :skin sheet → sheet
after: A sheet tabSkin=sheet · B terminal tabSkin=null
session store: {"tabSkin.1496605707":"sheet"}
global skin: {"skin":"terminal"}
:skin default none (on B) → done
after default: A sheet · B none            ← 따로 고른 A 는 그대로, B 는 기본을 따름
cold askSW ms: 13 / 4 / 5                    ← ServiceWorker.stopAllWorkers 뒤
warm askSW ms: 1 / 1 / 1
after close A, session store: {}             ← 탭을 닫으면 지움
store before off: {"tabSkin.1496605708":"sheet"}
after off: B none tabSkin=null · store {}    ← 옵션을 끄면 기본으로 · 저장소 비움
```

새로고침 직후 화면(호스트 · shadow 안 루트) 시간순 — 깜빡임 없음:

```
warm reload timeline:    [[2,"-"],[11,"sheet"]]
cold SW reload timeline: [[2,"-"],[15,"sheet"]]
```

- §6 의 부팅 기다림: 잠든 서비스 워커도 수 ms 안에 답해 300ms 상한에 닿지 않았다. 잠정안(300ms 까지 기다림)을 그대로 둔다
- 처음 잰 'A after reload: terminal' 은 측정 오류였다 — 부팅이 `use()` 에 닿기 전에 `GT.skin.current`(기본값 getter)를 읽었다. 화면 시간순으로 다시 재서 확인

### 남은 것 `[미정]`
- 로그인한 실제 ChatGPT 에서 탭 둘 — 확인 방법: 설정에서 켜고 한 탭에서 `:skin sheet`, 다른 탭이 그대로인지 · 새로고침해도 시트인지
- 재주입(확장 업데이트) 때 이어받는지 — 같은 tabId 로 다시 묻는 구조라 이어질 것으로 본다 `[가정]`
- 이 탭을 '기본 따르기' 로 되돌리는 명령은 없다. 옵션을 껐다 켜면 모두 되돌아간다 (필요하면 `:skin follow` 같은 것을 따로 정한다)
