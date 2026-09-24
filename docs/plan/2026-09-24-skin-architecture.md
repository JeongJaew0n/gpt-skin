# 스킨 구조 — 터미널 하나에서 갈아끼울 수 있는 껍데기로

**skin** = ChatGPT 웹 위에 씌우는 UI 의 종류. 이 저장소의 도메인 용어다.
지금은 터미널 하나뿐이고 코드 전체가 그 전제로 짜여 있다. 이 문서는
**그 전제를 걷어내고 스킨을 고르고 추가할 수 있는 구조**로 가는 길을 적는다.

처음 만들 스킨은 셋이다.

| 스킨 | 무엇 | 상태 |
|---|---|---|
| `terminal` | 지금의 tty. 상단바 · 스크롤백 · 입력줄 | 있다 — `tty.js` 782줄 |
| `sheet` | 스프레드시트. 행 번호 · 열 · 수식 입력줄 · 시트 탭 | 설계와 목업만 — [`2026-09-21-sheet-skin.md`](2026-09-21-sheet-skin.md) |
| `none` | 원본 UI 그대로. **명령만** 쓸 수 있다 | 없다 |

관련 문서: 시트 스킨의 화면 설계는 위 문서가 정본이다. 여기서는 **셋을 같은 틀에 끼우는 구조**만 다룬다.

---

## 1. 현 상황 — 실측 <sub>2026-09-24, 커밋 e1bb017 기준</sub>

### 1.1 껍데기는 `tty.js` 하나고, 모두가 그것을 직접 부른다

`GT.tty.*` 호출은 **7개 파일에서 107곳**이다. `index.js` 만의 문제가 아니다.

| 호출하는 쪽 | 건수 | 무엇을 부르나 |
|---|---:|---|
| `index.js` | 46 | `visible` 8 · `ui` 7 · `render` 6 · `setSuggest` 5 · `system` 4 · `show` `setMode` `renderChrome` `focus` `syncCursorFocus` 각 2 · `mount` `hide` `destroy` `tickSpin` `syncSidebar` `applyConfig` 각 1 |
| `sidebar.js` | 28 | `system` 12 · `shadow` 5 · `focus` 3 · `ui` `syncSidebar` `refreshChrome` `applyConfig` 각 2 |
| `commands.js` | 22 | `system` 10 · `applyConfig` 4 · `render` 2 · `ui` `local` `hide` `focus` `clearSystem` `clearLocal` 각 1 |
| `palette.js` | 4 | `setMode` 2 · `shadow` · `focus` |
| `health.js` | 4 | `system` 2 · `setMode` · `hide` |
| `markdown.js` | 2 | `copy` |
| `compose.js` | 1 | `focus` |

호출을 **역할**로 묶으면 여섯 가지다. 이게 곧 스킨이 내줘야 하는 것의 목록이다.

| 역할 | 호출 | 뜻 |
|---|---|---|
| 생명주기 | `mount` `destroy` `show` `hide` `visible` `applyConfig` | 끼우고 빼고 보이고 숨긴다 |
| 자료 → 화면 | `render` `renderChrome` `refreshChrome` `tickSpin` `syncSidebar` | store 를 읽어 그린다 |
| 시스템 출력 | `system` `clearSystem` `local` `clearLocal` | 명령 결과·경고를 어디에 보여 주나 (28곳) |
| 상태 표시 | `setMode` `setSuggest` `syncCursorFocus` | NORMAL/INSERT/STREAM/BROKEN · 자동완성 후보 |
| 입력 위젯 | `ui.input` `focus` | 프롬프트 `<textarea>` 자체를 밖에서 만진다 |
| 마운트 지점 | `shadow` `ui` | 사이드바·팔레트·피커가 `.gt-root` 안에 스스로 들어간다 |
| 그 외 | `copy` | 클립보드 복사. 껍데기와 무관한데 여기 있다 |

### 1.2 입력 처리 로직이 `index.js` 에 있다

`index.js` 336~483행이 프롬프트 입력의 전부다 — 자동 높이, 자동완성 후보 갱신,
포커스에 따른 모드 전환, **IME 조합 가드**, ↑↓ 기록, Tab 완성, Enter 전송·명령 실행.
전부 `GT.tty.ui.input` 이라는 `<textarea>` 하나에 `addEventListener` 로 붙어 있다.

시트 스킨의 수식 입력줄도, none 스킨의 명령줄도 **이 로직이 똑같이 필요하다.**
지금 구조로는 복사해야 한다. IME 가드는 이슈에서 나온 것이라 복사되면 반드시 한쪽만 고쳐진다.

### 1.3 원본을 덮는 방식은 터미널 전제다

```
html.gpt-skin-on body > *:not(#gpt-skin-host) { opacity: 0; pointer-events: none }
#gpt-skin-host { position: fixed; inset: 0; z-index: 2147483000 }
```

`tty.js` 의 `pageStyle()` 이 이 스타일을 페이지 문서에 넣고, `show()`/`hide()` 가
`html` 의 클래스를 넣고 뺀다. **원본을 전부 가리고 전체 화면을 우리가 쓴다** 는 방식이다.

- 터미널과 시트는 이 방식 그대로 쓸 수 있다.
- **none 스킨은 정반대다.** 원본이 보여야 하고, 우리는 명령줄 하나만 띄운다.
  가리기 스타일이 있으면 안 되고, 호스트는 클릭을 통과시켜야 한다.

`health.js` 의 `onBreak: revert` 도 `GT.tty.hide()` 를 부른다 — "복귀" 가 "터미널을 숨긴다" 로 굳어 있다.

### 1.4 테마는 색이고, 설정은 터미널 항목이다

- `theme.js` 는 CSS 변수 한 벌(`THEMES`) 과 **셸 CSS 전체**(`CSS`, 400줄) 를 한 파일에 들고 있다.
  CSS 는 `.gt-tabbar` `.gt-scroll` `.gt-input` 등 터미널 DOM 을 전제한다.
- `defaults.js` 스키마의 `display` `cursor` 절은 터미널 항목이다 — `cursor.style` `cursor.blink`
  `scanlines` `gutter.markers` `wrap.columns` `timestamps`. 시트에는 뜻이 없고 none 에는 아예 없다.
- `theme` 값(`modern-dark` …)은 터미널 팔레트다. 시트의 초록 리본 팔레트와 한 목록에 있으면 안 된다.

### 1.5 명령은 대부분 껍데기와 무관하다 — 몇 개만 아니다

`commands.js` 의 23개 명령 중 **껍데기를 전제하는 것은 여섯**이다.

| 명령 | 왜 껍데기에 묶이나 |
|---|---|
| `:font` | 터미널 글꼴 크기. 시트는 확대/축소, none 은 없음 |
| `:theme` | 터미널 팔레트 목록 |
| `:sidebar` | 오버레이 사이드바의 폭·표시. none 에서도 오버레이로는 쓸 수 있다 |
| `:select` | 사이드바 다중 선택 모드 |
| `:messup` | 스크롤백에 가짜 출력을 끼운다 (진단) |
| `:set` 의 일부 키 | 위의 터미널 항목들 |

나머지(`:ls` `:open` `:rename` `:pin` `:archive` `:rm` `:mv` `:share` `:new` `:model` `:effort`
`:config` `:health` `:version` `:log` `:options` `:help`)는 API·라우팅·원본 DOM 만 쓴다.
**none 스킨이 "명령은 쓸 수 있다" 고 말할 근거가 이것이다.**

### 1.6 테스트는 소스를 정규식으로 본다

`test/` 는 DOM 없이 돈다. 상당수가 `readFileSync('src/content/index.js')` 처럼 **소스 파일을
읽어 정규식으로 검사**한다 — `index.js` 22곳, `tty.js` 17곳, `commands.js` 15곳.
코드를 파일 사이로 옮기면 **동작이 같아도 테스트가 깨진다.** 이건 회귀가 아니라 경로 갱신이다.
단계마다 이 갱신을 별도 커밋으로 떼어야 진짜 회귀와 섞이지 않는다.

### 1.7 정리 — 무엇이 문제인가

1. 껍데기 인터페이스가 **암묵적**이다. `GT.tty` 가 내주는 것을 7개 파일이 각자 골라 쓴다.
2. 입력 로직이 껍데기 밖(`index.js`)에서 껍데기 안의 요소(`ui.input`)를 만진다.
3. "원본을 가린다" 가 껍데기 안에 박혀 있어 **가리지 않는 스킨**을 만들 수 없다.
4. 설정·테마·일부 명령이 터미널 전용인데 그렇게 표시돼 있지 않다.

---

## 2. 목표 구조

### 2.1 층을 셋으로 나눈다

```
┌──────────────────────────────────────────────────────────────┐
│  skins/                     껍데기. 스킨마다 하나.               │
│    terminal.js  sheet.js  none.js                              │
│    각자 DOM 골격 · CSS · 테마 팔레트 · 스킨 전용 설정 항목을 갖는다 │
├──────────────────────────────────────────────────────────────┤
│  shell 계층                 스킨이 공통으로 쓰는 것. 스킨을 모른다.  │
│    skin.js      레지스트리 · 현재 스킨 · 전환                      │
│    prompt.js    입력 컨트롤러 (IME 가드 · ↑↓ 기록 · Tab 완성 · 전송) │
│    cover.js     원본 가리기 (page style · html 클래스)             │
│    overlay.js   사이드바 · 팔레트 · 피커가 붙는 자리                │
│    clipboard.js copy()                                          │
├──────────────────────────────────────────────────────────────┤
│  core                       지금 그대로. 화면을 모른다.            │
│    protocol config oai store chats conversation convops         │
│    markdown renderplan compose navigate commands health image   │
└──────────────────────────────────────────────────────────────┘
```

규칙 하나로 요약된다 — **core 와 shell 은 `GT.skin.current` 만 부른다. `GT.tty` 는 사라진다.**
(`GT.tty` 라는 이름은 `skins/terminal.js` 안에만 남는다.)

### 2.2 스킨 계약 (interface)

1.1 의 역할 표를 그대로 계약으로 만든다. 모든 스킨이 **전부** 채운다. 비어도 되는 것은
빈 함수를 명시적으로 둔다 — 없어서 `undefined is not a function` 이 나는 것과 "이 스킨에선 아무 일도 안 한다" 는 다르다.

```js
GT.skins.register('terminal', {
  id: 'terminal',
  label: { ko: '터미널', en: 'Terminal' },

  // 원본을 가리는가. cover.js 가 이걸 보고 page style 을 넣거나 뺀다.
  covers: true,                         // terminal · sheet: true, none: false

  // 이 스킨의 테마 팔레트. :theme 와 설정 화면이 이 목록을 쓴다.
  themes: { 'modern-dark': {...}, 'crt-green': {...} },
  defaultTheme: 'modern-dark',

  // 이 스킨에서만 뜻이 있는 설정 키. 설정 화면은 현재 스킨의 것만 보여 준다.
  configKeys: ['cursor.style', 'cursor.blink', 'scanlines', 'gutter.markers', 'wrap.columns', 'timestamps'],

  // 이 스킨에서 쓸 수 없는 명령. :help 와 팔레트에서 숨기고, 치면 "이 스킨에서는 없는 명령" 을 낸다.
  hiddenCommands: [],                   // none: [':font', ':theme', ':messup', ':select']

  // ---- 생명주기
  mount(host, cfg) {},                  // host: shadow root 를 가진 요소. skin.js 가 만들어 준다
  destroy() {},
  applyConfig(cfg) {},

  // ---- 자료 → 화면. store 를 읽어 그린다 (pull 모델은 그대로)
  render() {},                          // 본문 전체 (스킨이 알아서 증분한다)
  renderChrome() {},                    // 제목·모델·시계 같은 가벼운 것 (1초마다)
  tick() {},                            // 회전자 등 아주 잦은 것 (90ms). 없으면 빈 함수

  // ---- 시스템 출력
  system(level, text, node, opts) {},   // info | warn | error. 스킨이 어디에 어떻게 보일지 정한다
  clearSystem() { return 0; },
  local(text) {}, clearLocal() { return 0; },   // :messup 용. 없는 스킨은 빈 함수

  // ---- 상태 표시
  setMode(mode) {},                     // NORMAL | INSERT | STREAM | BROKEN
  setSuggest(list, note) {},            // 자동완성 후보. null 이면 닫기

  // ---- 입력. 스킨은 위젯을 만들고 prompt.js 에 어댑터를 준다
  prompt: {
    el: null,                           // 실제 <textarea> 또는 <input>. prompt.js 가 이벤트를 붙인다
    autosize() {},                      // 내용에 맞춰 높이 조절. 한 줄 입력이면 빈 함수
  },
  focus() {},

  // ---- 오버레이가 붙는 자리 (사이드바 · 팔레트 · 피커)
  overlayRoot() { return element; },    // 스킨 shadow root 안의 요소. none 도 투명 호스트를 준다
  ui: {}                                // 스킨이 밖에 보여 주고 싶은 요소. 계약 밖 — 다른 모듈이 의존하면 안 된다
});
```

`ui` 는 남기지만 **계약이 아니다.** 지금 `index.js` 가 `ui.mode` `ui.suggest` `ui.input` 을 직접 만지는데,
그건 전부 `setMode` `setSuggest` `prompt.el` 로 흡수된다. 남는 `ui` 접근이 있으면 테스트가 잡는다 (§5).

### 2.3 `skin.js` — 레지스트리와 전환

```js
GT.skins = {
  register(def) {},                     // 스킨 파일이 로드되며 스스로 등록한다
  names() {},                           // ['terminal', 'sheet', 'none'] — 등록 순서
  get(id) {},
};
GT.skin = {
  get current() {},                     // 지금 스킨 정의. core/shell 은 이것만 부른다
  async switch(id, { persist = true }) {},
  visible() {}, show() {}, hide() {}, toggle() {},
};
```

**전환 순서** — 실패하면 이전 스킨으로 되돌리고 `system('error')` 를 낸다.

1. 새 스킨 정의를 찾는다. 없으면 실패.
2. 오버레이(사이드바·팔레트·피커)를 닫는다. 열린 상태를 새 스킨으로 옮기지 않는다.
3. 현재 스킨 `destroy()`. `cover` 는 `covers` 값에 따라 걷거나 남긴다.
4. 새 호스트(`#gpt-skin-host` + shadow root) 를 만들고 `mount(host, cfg)`.
5. `cover.apply(def.covers)`.
6. `prompt.attach(def.prompt)` — 이벤트 리스너를 새 위젯에 옮긴다.
7. `render()` `renderChrome()`.
8. `persist` 면 `config.set('skin', id)`.

**store 는 건드리지 않는다.** 대화 내용은 껍데기와 무관하다 — 스킨을 바꿔도 다시 수확하지 않는다.

### 2.4 `prompt.js` — 입력 컨트롤러

`index.js` 336~483행을 통째로 옮긴다. 달라지는 것은 `GT.tty.ui.input` 대신
`GT.skin.current.prompt.el` 을 잡고, 스킨이 바뀌면 리스너를 다시 붙이는 것뿐이다.

```js
GT.prompt = {
  attach(adapter) {},                   // 리스너를 붙인다. 이전 것은 떼어 낸다
  detach() {},
  value(), set(text),
  submit(),                             // Enter 와 같다. 명령이면 commands.run, 아니면 compose.send
  // 아래는 그대로 옮겨 온다
  //   IME 가드(composing) · ↑↓ 기록(histIdx/histDraft) · Tab 완성 · refreshSuggest · autosize
};
```

IME 가드가 여기 **한 곳**에 있게 된다. 이슈 `2026-09-02-ime-enter-eats-last-char` 의 검사도 여기를 본다.

전역 키(`Ctrl+\`` `⌘K` `Ctrl+B` `Alt+±` `esc` `/` · "아무 데서나 타이핑하면 입력줄로")는
`index.js` 486~560행이다. 이것도 `prompt.js` 로 간다 — 단 **none 스킨에서는 "아무 데서나 타이핑" 을 끈다.**
원본 컴포저에 치는 글자를 가로채면 안 된다. 스킨 계약에 `capturesTyping: boolean` 을 둔다. `[확정]`

### 2.5 `cover.js` — 원본 가리기

`tty.js` 의 `pageStyle()` `HIDE_CLASS` `show/hide/visible` 을 뽑아낸다.

```js
GT.cover = {
  apply(covers) {},                     // covers=true 면 page style 을 넣고, false 면 뺀다
  on() {}, off() {}, isOn() {},         // html.gpt-skin-on 토글. covers=false 인 스킨에서는 항상 off
};
```

호스트 스타일도 스킨에 따라 갈린다.

| | terminal · sheet (`covers: true`) | none (`covers: false`) |
|---|---|---|
| 원본 | `opacity: 0; pointer-events: none` | 그대로 |
| `#gpt-skin-host` | `position: fixed; inset: 0` — 전체 | `position: fixed; inset: 0; pointer-events: none` — **클릭 통과** |
| 호스트 안의 위젯 | 기본 | `pointer-events: auto` 를 위젯에만 |

`health.js` 의 `revert` 는 `GT.tty.hide()` → `GT.skin.hide()` 로 바뀐다. none 스킨에서는 명령줄을 접는다는 뜻이 된다.

### 2.6 `overlay.js` — 사이드바 · 팔레트 · 피커의 자리

세 모듈이 `GT.tty.shadow.querySelector('.gt-root')` 로 자리를 찾는다. 이것을
`GT.skin.current.overlayRoot()` 로 바꾼다. **그 외에는 손대지 않는다** — 오버레이는 이미
"본문을 밀어내지 않는" 떠 있는 층이라 어느 스킨 위에도 뜬다. none 스킨에서도 `Ctrl+B` 로
대화 목록을 띄울 수 있고, 그래서 `:select` 도 none 에서 살 수 있다. `[가정]` — none 위에 뜬
사이드바의 CSS 가 원본 위에서 읽히는지는 브라우저에서 봐야 한다.

사이드바 CSS 가 `theme.js` 의 터미널 CSS 안에 있다(80~165행). 오버레이 CSS 는 **shell 층으로
뽑아** 스킨 CSS 와 분리한다. 색은 `--gt-*` 변수를 쓰므로 스킨의 테마가 그대로 먹는다.

### 2.7 설정 — 스킨 키와 스킨별 항목

```js
// defaults.js
{ section: 'skin', key: 'skin', type: 'enum', def: 'terminal', choices: () => GT.skins.names() },
```

스킨 전용 항목은 스키마에 `skin: 'terminal'` 을 붙인다. 설정 화면과 `:config` 는
현재 스킨의 것과 공용만 보여 준다. 저장은 다 한다 — 스킨을 바꿨다가 돌아오면 그대로다.

| 항목 | 소속 |
|---|---|
| `locale` `enabled` `onBreak` `drift.threshold` `log` `skin` | 공용 |
| `sidebar.*` | 공용 (오버레이) |
| `font.family` `font.size` `line.height` `citations` `image` `image.columns` | 공용 — 시트도 글꼴·인용·이미지를 그린다 |
| `theme` | **스킨별로 갈라진다** — `terminal.theme` `sheet.theme`. 아래 이관 참고 |
| `cursor.style` `cursor.blink` `scanlines` `gutter.markers` `wrap.columns` `timestamps` | `terminal` |
| (시트 전용은 시트 문서에서 정한다 — 리본 접기, 열 폭 등) | `sheet` |
| `none.bar.position` (bottom | top) 정도 | `none` |

**`theme` 이관** — 지금 `theme` 키에 저장된 값은 터미널 팔레트다. 부팅 때 한 번,
`terminal.theme` 이 비어 있고 `theme` 이 있으면 복사한다. `theme` 키는 지우지 않는다(되돌릴 수 있게).
`:theme` 명령은 현재 스킨의 `themes` 목록을 보여 주고 `<skin>.theme` 에 쓴다.

### 2.8 `:skin` 명령과 토글 키

```
:skin                → 지금 스킨과 목록
:skin sheet          → 전환하고 저장
:skin none
```

`Ctrl+\`` 는 지금 "원본 ↔ 터미널" 이다. 스킨이 여럿이면 뜻을 다시 정해야 한다.

| 후보 | 뜻 | 판단 |
|---|---|---|
| A | 현재 스킨 보이기/숨기기 (지금과 같다). none 에서는 명령줄 접기/펴기 | **이걸 쓴다** — 손에 익은 동작을 바꾸지 않는다 `[확정]` |
| B | 스킨을 순환 (terminal → sheet → none → …) | 원본을 보려면 none 까지 돌아야 한다. 급할 때 나쁘다 |

순환은 `:skin next` 로 둔다. 키를 주고 싶으면 나중에 설정으로.

### 2.9 none 스킨 — 무엇이 보이나

원본 UI 위에 **명령줄 하나**. vim 의 `:` 줄이나 Spotlight 를 생각하면 된다.

```
┌─ 원본 ChatGPT 화면 ─────────────────────────────────────────┐
│  (그대로. 클릭도 타이핑도 원본으로 간다)                        │
│                                                              │
│                                                              │
│  ┌──────────────────────────────────────────────────────┐    │
│  │ ❯ :rename 도커 정리_                    ⇥ 완성 · 인자 │    │  ← 명령줄 (Ctrl+; 로 열고 esc 로 닫는다)
│  │ [info] 이름을 바꿨습니다: 도커 정리                     │    │  ← system() 출력. 몇 줄만, 시간 지나면 사라진다
│  └──────────────────────────────────────────────────────┘    │
└──────────────────────────────────────────────────────────────┘
```

- 명령줄은 **닫혀 있는 게 기본**이다. 여는 키는 `Ctrl+;` `[가정]` — `Ctrl+\`` 는 A 안대로 "숨기기" 라
  다른 키가 필요하다. 원본이 안 쓰는 키인지 실측한다.
- `⌘K` 팔레트와 `Ctrl+B` 사이드바는 그대로 동작한다.
- 메시지 전송은 **원본 컴포저로 한다.** 명령줄에 명령이 아닌 글을 치면 `compose.send()` 로
  보낼 수도 있지만(터미널과 같은 경로), 1차에서는 "명령이 아니면 안내 문구" 로 둔다. `[가정]`
- `system()` 출력은 명령줄 위에 토스트처럼 쌓인다. 5초 뒤 사라진다. `:health` 같은 긴 출력은 스크롤 가능한 패널.
- 숨긴 명령: `:font` `:theme` `:messup`. (`:select` 는 사이드바가 뜨므로 남긴다 — §2.6 가정이 맞으면.)
- `capturesTyping: false`. `covers: false`.

**store 와 tap 은 그대로 돈다.** 그래야 `:ls` 캐시, 모델 목록, `:health` 가 맞고, 스킨을 터미널로
바꿨을 때 즉시 대화가 그려진다. none 이라고 수확을 끄지 않는다.

### 2.10 sheet 스킨

화면 설계는 [`2026-09-21-sheet-skin.md`](2026-09-21-sheet-skin.md) 그대로다. 이 구조에서 달라지는 점만 적는다.

- 그 문서 §5 의 `GT.tty = cfg.skin === 'sheet' ? GT.sheet : GT.terminal` 은 **쓰지 않는다.** `GT.skin.current` 로 간다.
- 수식 입력줄이 `prompt.el` 이다. IME·기록·완성이 공짜로 붙는다.
- 시트 탭이 대화 목록이지만, 사이드바 오버레이도 `Ctrl+B` 로 뜬다. 둘이 같은 `GT.chats` 를 읽는다.
- `markdown.lines()` (줄 단위 출력) 와 행 단위 `renderplan` 은 그 문서대로 **core 에 추가**한다 — 시트만 쓰더라도 화면을 모르는 순수 함수이므로 core 자리다.
- 테마: `sheet.theme` — `m365-green` (목업) 을 기본으로, 하나 더 두면 충분하다.

### 2.11 파일 배치와 매니페스트

```
src/content/
  (core 는 그대로)
  shell/
    clipboard.js   cover.js   overlay.js   prompt.js   skin.js
  skins/
    terminal.js    terminal.css.js        ← tty.js + theme.js 의 터미널 부분
    sheet.js       sheet.css.js
    none.js        none.css.js
  index.js         부팅 · 배선만 (지금 658줄 → 300줄 안쪽이 목표)
```

`manifest.json` 의 `content_scripts[1].js` 가 로더다. 순서: core → shell → skins → index.
**스킨을 추가한다 = `skins/` 에 파일 하나 + 매니페스트에 한 줄 + `register()`.** 그 이상이 필요하면 구조가 잘못된 것이다.

CSS 는 지금처럼 JS 문자열로 둔다(`theme.js` 방식). 파일을 나누는 이유는 스킨별로 갈라 보기 위해서고, 로딩 방식을 바꾸는 게 아니다.

---

## 3. 단계 — 순서가 중요하다

원칙: **각 단계가 끝날 때 터미널 스킨의 동작은 하나도 바뀌지 않는다.** 바뀌면 그 단계가 잘못된 것이다.
단계마다 커밋하고, 테스트 경로 갱신은 별도 커밋으로 뗀다(§1.6).

| 단계 | 하는 일 | 버전 | 끝났다는 증거 |
|---|---|---|---|
| **0** | 이 문서. README 계획 표에 줄 추가 | 없음 (문서) | — |
| **1** [완료] | `shell/prompt.js` — `index.js` 336~560행 이동. `GT.tty.ui.input` 을 어댑터로 받는다 (0.4.2, 2026-09-24) | PATCH | IME · 기록 · 완성 · 포커스 테스트가 새 경로에서 통과. 브라우저에서 한글 `:rename 안뇽` 실측 |
| **2** [완료] | `shell/cover.js` `shell/clipboard.js` — `tty.js` 에서 뽑는다 (0.4.3, 2026-09-24). `health.revert` 는 `GT.tty.hide()` → cover 로 이미 이어지고, `GT.skin.hide()` 로 바꾸는 것은 3단계에서 한다 | PATCH | `lifecycle` 테스트(page style 제거) 통과 |
| **3** | `shell/skin.js` 레지스트리 + `skins/terminal.js` = `tty.js` 이동 + `register`. **`GT.tty.*` 107곳을 `GT.skin.current.*` 로.** 오버레이 세 모듈은 `overlayRoot()` | PATCH | **`GT.tty` 가 `skins/terminal.js` 밖에 없다** (테스트). 기존 1124건 통과 |
| **4** | 설정: `skin` 키, 스킨별 항목 표시, `theme` → `terminal.theme` 이관, `:skin` `:theme` 갱신, 옵션·팝업에 스킨 선택 | MINOR | 스킨이 하나라도 `:skin` 이 목록을 내고, 옵션 화면이 터미널 항목만 보인다 |
| **5** | `skins/none.js` — 명령줄 · 토스트 · `covers:false` · `capturesTyping:false` | MINOR | `:skin none` 에서 원본이 온전하고 `:ls` `:rename` `Ctrl+B` 가 된다. `Ctrl+\`` 로 명령줄이 접힌다 |
| **6** | `markdown.lines()` + 행 단위 `renderplan` (core) | PATCH | 순수 함수 테스트. 화면 변화 없음 |
| **7** | `skins/sheet.js` 1단계 — 보이고, 읽고, 보낸다 (시트 문서 §6-1) | MINOR | 시트 문서 §7 회귀 목록 |
| **8** | sheet 2·3단계 | MINOR | 시트 문서 |
| **9** | 스킨 추가 안내 문서 + 계약 검사 테스트가 세 스킨을 다 돈다 | 없음 | §5 |

3단계가 가장 크고 가장 기계적이다. 107곳을 한 번에 바꾸되, **역할별로 커밋을 나눈다**
(system 28곳 → 생명주기 → 마운트 지점 → 나머지). 중간에 `GT.tty = GT.skin.current` 별칭을 두면
안 된다 — 별칭이 있으면 옮기다 만 상태가 영원히 남는다.

---

## 4. 확정 · 가정 · 미정

### 확정 `[확정]`
- 층은 core / shell / skins 셋. core 와 shell 은 `GT.skin.current` 만 부른다.
- 스킨 계약은 §2.2 의 목록이고 모든 스킨이 전부 채운다.
- 입력 로직은 `prompt.js` 한 곳. 스킨은 위젯과 어댑터만 준다.
- `Ctrl+\`` 는 "현재 스킨 보이기/숨기기" 그대로. 순환은 `:skin next`.
- none 스킨은 원본을 가리지 않고 타이핑을 가로채지 않는다. store·tap 은 계속 돈다.
- `theme` 은 스킨별 키로 갈라진다. 기존 값은 `terminal.theme` 으로 한 번 복사한다.
- 스킨 추가 = 파일 하나 + 매니페스트 한 줄 + `register()`.

### 가정 `[가정]` — 브라우저에서 확인해야 한다
- none 스킨의 명령줄 여는 키 `Ctrl+;` 를 원본이 쓰지 않는다.
  → 확인: 원본 컴포저에 포커스를 두고 `Ctrl+;` 를 눌러 아무 일도 없는지. 다른 후보 `Ctrl+.` `Ctrl+'`.
- 오버레이(사이드바·팔레트)가 원본 위에 떠도 읽힌다 — z-index, 원본의 다크/라이트 모드와 우리 배경 대비.
  → 확인: none 에서 `Ctrl+B`, 원본을 라이트 모드로 바꿔서도.
- 호스트에 `pointer-events: none` 을 주고 위젯에만 `auto` 를 주면 원본 클릭이 전부 통과한다.
  → 확인: none 에서 원본의 사이드바·컴포저·모델 선택을 클릭.
- none 에서 명령이 아닌 글을 명령줄에 치면 보내지 않고 안내만 한다 (1차).

### 미정 `[미정]` — 결정이 필요하다
- **스킨 전환 중 스트리밍이 진행 중이면?** store 는 계속 쌓이므로 새 스킨이 `render()` 하면 따라온다.
  단, `setMode('STREAM')` 을 누가 다시 불러 주나 — `skin.switch()` 끝에 `store.isStreaming()` 을 보고 부른다. 구현하며 확정.
- **`enabled: false` 의 뜻.** 지금은 "터미널을 켜지 않는다". 스킨이 여럿이면 "skin = none" 과 같은가?
  같다면 `enabled` 를 없애고 `skin: none` 으로 합칠 수 있다. 팝업의 토글이 바뀐다. → 4단계에서 정한다.
  기울어진 쪽: **합친다.** 상태가 둘(enabled × skin) 이면 `enabled:false, skin:sheet` 같은 조합이 생긴다.
- **계약 검사를 어디까지 하나.** 테스트에 DOM 이 없다. (a) 스킨 파일이 계약의 키를 전부 갖는지만 본다(정규식),
  (b) 최소 DOM 스텁을 만들어 `mount → render → destroy` 를 돌린다. → 9단계에서. (a) 는 3단계부터 둔다.
- 시트 문서 §8 의 미정(표·이미지·리본 범위)은 그대로 남아 있다.

---

## 5. 회귀 기준 — 테스트로 남길 것

| 검사 | 왜 |
|---|---|
| `GT.tty` 참조가 `skins/terminal.js` 밖에 없다 | 계약 우회를 막는다. 3단계 뒤 영구 |
| `GT.skin.current.ui.` 참조가 core/shell 에 없다 | `ui` 는 계약이 아니다 |
| 등록된 모든 스킨이 §2.2 의 키를 전부 갖는다 | 빠진 채 부팅되면 `:skin` 전환 때 죽는다 |
| `prompt.js` 에 IME 가드가 있고 `skins/` 에는 `isComposing` 이 없다 | 가드가 한 곳에만 있어야 한다 |
| `covers:false` 인 스킨은 `capturesTyping:false` 다 | 원본 위에서 타이핑을 가로채면 원본 컴포저가 깨진다 |
| `skin` 설정의 선택지가 레지스트리와 같다 | 매니페스트에 파일을 넣고 등록을 잊는 경우 |
| 스킨 전용 설정 키는 스키마에 `skin:` 표시가 있다 | 옵션 화면이 잘못된 스킨에 보여 주지 않도록 |
| `theme` → `terminal.theme` 이관이 한 번만 일어난다 | 두 번 돌면 사용자가 바꾼 값을 덮는다 |
| 기존 1124건 | 터미널 스킨은 안 바뀐다 |

**새 검사는 일부러 깨뜨려 실패하는지 본다.** (CLAUDE.md §5)

---

## 6. 스킨 추가 안내 (9단계에서 `docs/` 에 옮긴다)

1. `src/content/skins/<id>.js` 를 만든다. `GT.skins.register({...})` 로 §2.2 를 전부 채운다.
2. CSS 는 같은 파일이나 `<id>.css.js` 의 문자열로. 색은 `--gt-*` 변수를 쓰면 오버레이가 따라온다.
3. `manifest.json` 의 `content_scripts[1].js` 에 `index.js` **앞**, 다른 스킨 뒤에 넣는다.
4. 스킨 전용 설정이 있으면 `defaults.js` 에 `skin: '<id>'` 를 붙여 넣는다.
5. `i18n.js` 에 `skin.<id>.label` ko·en 을 넣는다.
6. `tools/test.sh` — 계약 검사가 자동으로 새 스킨을 포함한다. 그 외 스킨 고유 검사는 `test/skin.<id>.test.mjs`.
7. `manifest.json` 버전 MINOR.
