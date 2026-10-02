// gpt-skin — 열린 탭 (VS Code 에디터 탭처럼).
//
// 예전 :chats 는 대화 목록 API 의 최근 대화 40개를 전부 탭으로 그렸다. 이제는 '내가 연 대화' 만 들고 있는다
// (사용자 요청 2026-10-02).
//   · 대화를 열면 탭에 들어간다(이미 있으면 그대로). 순서는 연 순서
//   · × 로 닫는다. 지금 탭을 닫으면 옆 탭으로 간다
//   · chrome.storage.local 에 저장한다 — 새로고침 · 브라우저를 다시 열어도 남는다.
//     sync 는 대화 id · 제목이 계정 동기화로 올라가므로 쓰지 않는다
//   · 최대 MAX 개. 넘치면 가장 오래 안 본 탭부터 닫는다
//   · Ctrl+, / Ctrl+. 로 이전 · 다음 탭 (shell/prompt.js)
// 터미널과 시트가 같은 목록을 쓴다 — 스킨을 바꿔도 탭이 그대로다.
// docs/plan/2026-10-02-open-tabs.md
GT.tabs = (function () {
  'use strict';

  const KEY = 'gt.openTabs';
  const MAX = 20;
  let list = [];                     // [{ id, href, title, seen }]
  const subs = [];

  // 대화 id. 프로젝트 안의 대화는 /g/<프로젝트>/c/<id> 다 — 주소 전체를 href 로 들고, id 는 /c/ 뒤에서 꺼낸다.
  const idOf = (path) => (/\/c\/([0-9a-zA-Z:-]+)/.exec(String(path || '')) || [])[1] || null;
  const valid = (t) => t && typeof t.id === 'string' && typeof t.href === 'string';

  function emit() { subs.forEach((f) => { try { f(); } catch (_) {} }); }
  function save() { try { chrome.storage.local.set({ [KEY]: list }); } catch (_) {} }

  async function load() {
    try {
      const got = await chrome.storage.local.get(KEY);
      list = Array.isArray(got[KEY]) ? got[KEY].filter(valid).slice(0, MAX) : [];
    } catch (_) { list = []; }
    emit();
    return list.slice();
  }

  // 다른 브라우저 탭이 저장한 목록을 받는다. 저장은 메모리의 목록을 통째로 쓰므로, 안 받으면
  // 두 탭이 서로의 탭을 지운다 — A · B 가 [x,y] 를 읽고 B 가 z 를 열고 A 가 w 를 열면 z 가 사라졌다
  // (리뷰 재현 2026-10-02). 같은 목록이면(자기 저장의 메아리) 다시 그리지 않는다.
  // 남는 경쟁: 두 탭이 같은 틱에 저장하면 여전히 나중 것이 이긴다 [가정: 드묾].
  function onStored(changes, area) {
    if (area !== 'local' || !changes || !changes[KEY]) return;
    const next = Array.isArray(changes[KEY].newValue) ? changes[KEY].newValue.filter(valid).slice(0, MAX) : [];
    if (JSON.stringify(next) === JSON.stringify(list)) return;
    list = next;
    emit();
  }
  try { chrome.storage.onChanged.addListener(onStored); } catch (_) {}

  // 넘치면 가장 오래 안 본 탭부터 닫는다. 방금 연 탭은 가장 최근에 본 탭이라 닫히지 않는다.
  function trim() {
    while (list.length > MAX) {
      let oldest = 0;
      list.forEach((t, i) => { if ((t.seen || 0) < (list[oldest].seen || 0)) oldest = i; });
      list.splice(oldest, 1);
    }
  }

  // 이 대화를 열었다. 탭에 없으면 끝에 넣고, 있으면 본 시각만 새로 한다.
  function open(path, title) {
    const id = idOf(path);
    if (!id) return null;
    let t = list.find((x) => x.id === id);
    if (!t) {
      t = { id, href: path, title: String(title || ''), seen: Date.now() };
      list.push(t);
      trim();
    } else {
      t.seen = Date.now();
      t.href = path;
      if (title) t.title = String(title);
    }
    save(); emit();
    return t;
  }

  // 제목이 늦게 들어온다(대화 원본을 읽은 뒤). 바뀌었을 때만 저장한다.
  function title(id, text) {
    const t = list.find((x) => x.id === id);
    if (!t || !text || t.title === text) return false;
    t.title = String(text);
    save(); emit();
    return true;
  }

  // 닫는다. 닫힌 자리의 오른쪽(없으면 왼쪽) 탭을 돌려준다 — 지금 탭을 닫았을 때 갈 곳.
  function close(id) {
    const i = list.findIndex((x) => x.id === id);
    if (i < 0) return null;
    list.splice(i, 1);
    save(); emit();
    return list[i] || list[i - 1] || null;
  }

  // dir = 1 다음 · -1 이전. 끝에서 넘어가면 반대쪽 끝으로. 지금 대화가 탭에 없으면(새 대화) 첫 · 끝 탭.
  function step(dir, curId) {
    if (!list.length) return null;
    const i = list.findIndex((x) => x.id === curId);
    if (i < 0) return dir > 0 ? list[0] : list[list.length - 1];
    if (list.length === 1) return null;
    return list[(i + dir + list.length) % list.length];
  }

  // 단축키 이동. 강조는 곧바로 옮기고, 실제 이동은 손을 멈춘 뒤 한 번만 한다 (debounce).
  // 1 → 2 → 3 을 휙휙 넘기면 2번은 불러오지도 않는다 — 브라우저의 탭 전환 목록과 같은 느낌 (사용자 결정 2026-10-02).
  const GO_DELAY_MS = 250;
  let pending = null;                // 강조만 옮겨 둔, 아직 안 간 탭
  let goTimer = 0;
  function go(dir) {
    const base = pending ? pending.id : idOf(location.pathname);
    const t = step(dir, base);
    if (!t) return null;
    pending = t;
    emit();
    clearTimeout(goTimer);
    goTimer = setTimeout(() => {
      const target = pending;
      pending = null;
      if (target) GT.navigate.to(target.href);
      syncBar();
      emit();
    }, GO_DELAY_MS);
    syncBar();
    return t;
  }

  // 대화 원본을 받는 중인가 — 탭에 작은 표시 · 본문 위 로딩바 (막지 않는다)
  // 켤 때 번호를 돌려준다. 끌 때 번호를 주면 그게 마지막 켜기일 때만 끈다 —
  // A 를 받는 사이 B 로 넘어가면 A 가 먼저 끝나며 표시를 꺼서, B 를 받는 동안 이전 대화가 흐림 없이 보였다
  // (리뷰 재현 2026-10-02). 번호 없이 끄면 예전처럼 그냥 끈다.
  let busy = false;
  let loadSeq = 0;
  function loading(on, token) {
    if (on) {
      const mine = ++loadSeq;
      if (!busy) { busy = true; syncBar(); emit(); }
      return mine;
    }
    if (token !== undefined && token !== loadSeq) return 0;
    if (!busy) return 0;
    busy = false; syncBar(); emit();
    return 0;
  }

  // ---------------------------------------------------------------- 로딩바 (사용자 결정 2026-10-02)
  //
  // 대화를 바꾸는 사이 본문에는 이전 대화가 남아 있다. 탭 구석의 ⠴ 만으로는 '아직 이전 대화' 라는 걸 놓친다.
  // 그래서 본문 위에 얇은 막대를 띄우고 본문을 흐리게 한다. 빠른 로딩에서 번쩍이지 않게:
  //   · BAR_DELAY_MS 넘게 걸릴 때만 띄운다
  //   · 띄웠으면 BAR_MIN_MS 는 유지한다
  // 두 스킨이 같은 규칙을 따르도록 판단은 여기서만 한다. 스킨은 barShown() 을 그리기만 한다.
  const BAR_DELAY_MS = 300;
  const BAR_MIN_MS = 300;
  let barOn = false;
  let barAt = 0;
  const now = () => Date.now();
  function setBar(on) {
    if (barOn === on) return;
    barOn = on;
    if (on) barAt = now();
    emit();
  }
  // 대기는 '받기 시작한 순간' 부터 센다 — 단축키를 계속 누르는 동안 다시 처음부터 세면 막대가 영영 안 뜬다.
  let barWait = 0;                   // 띄우기 대기 중인 타이머
  let barHide = 0;                   // 끄기 대기 중인 타이머
  function syncBar() {
    const want = busy || !!pending;
    if (want) {
      if (barHide) { clearTimeout(barHide); barHide = 0; }
      if (!barOn && !barWait) barWait = setTimeout(() => { barWait = 0; if (busy || pending) setBar(true); }, BAR_DELAY_MS);
      return;
    }
    if (barWait) { clearTimeout(barWait); barWait = 0; }
    if (!barOn || barHide) return;
    const left = BAR_MIN_MS - (now() - barAt);
    if (left > 0) { barHide = setTimeout(() => { barHide = 0; if (!busy && !pending) setBar(false); }, left); return; }
    setBar(false);
  }

  function closeCurrent() {
    const cur = idOf(location.pathname);
    if (!cur || !list.some((x) => x.id === cur)) return { closed: false };
    const next = close(cur);
    if (next) GT.navigate.to(next.href); else GT.navigate.newChat();
    return { closed: true, next };
  }

  return {
    KEY, MAX, idOf,
    load, open, title, close, step, go, closeCurrent, loading, GO_DELAY_MS,
    list: () => list.slice(),
    // 탭 줄이 '지금' 으로 강조할 대화 — 단축키로 옮겨 둔 탭이 있으면 그쪽
    activeId: () => (pending ? pending.id : idOf(location.pathname)),
    isLoading: () => busy || !!pending,
    barShown: () => barOn,
    BAR_DELAY_MS, BAR_MIN_MS,
    onChange(fn) { subs.push(fn); }
  };
})();
