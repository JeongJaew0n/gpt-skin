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
      emit();
    }, GO_DELAY_MS);
    return t;
  }

  // 대화 원본을 받는 중인가 — 탭에 작은 표시만 띄운다 (막지 않는다)
  let busy = false;
  function loading(on) { if (busy === !!on) return; busy = !!on; emit(); }

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
    onChange(fn) { subs.push(fn); }
  };
})();
