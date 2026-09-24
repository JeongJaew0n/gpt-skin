// gpt-skin — sheet 스킨. 대화를 스프레드시트처럼 그린다.
//   제목 표시줄 · 리본(장식) · 수식 입력줄(= 프롬프트) · 격자 · 시트 탭(= 대화 목록) · 상태 표시줄
// 한 행에 한 줄: A 열은 누가 말했나, B 열은 본문, C 열은 시각.
// 설계: docs/plan/2026-09-21-sheet-skin.md · 스킨 계약: src/content/shell/skin.js
//
// 리본은 누르면 아무 일도 안 일어나는 그림이다 — 스프레드시트 기능을 흉내 내지 않는다.
// 제품 이름·로고는 쓰지 않는다. 격자와 초록 리본의 모양만 빌린다.
(function () {
  'use strict';

  const el = (t, c, x) => { const n = document.createElement(t); if (c) n.className = c; if (x !== undefined) n.textContent = x; return n; };
  const SPIN = ['⠋', '⠙', '⠹', '⠸', '⠼', '⠴', '⠦', '⠧', '⠇', '⠏'];

  // 색은 --gt-* 변수로 정의한다. 사이드바 · 팔레트 · 명령 결과 표가 터미널 CSS 를 그대로 쓰면서
  // 밝은 시트 색으로 보이게 하려는 것이다. --gs-* 는 시트에만 있는 자리다.
  const THEMES = {
    green: {
      '--gt-bg-0': '#ffffff', '--gt-bg-1': '#ffffff', '--gt-bg-2': '#f3f3f3', '--gt-bg-3': '#e6e6e6',
      '--gt-border': '#d4d4d4', '--gt-fg': '#1e1e1e', '--gt-fg-dim': '#616161', '--gt-fg-faint': '#9e9e9e', '--gt-fg-strong': '#000000',
      '--gt-green': '#217346', '--gt-magenta': '#7a3ad1', '--gt-cyan': '#0b7a75',
      '--gt-yellow': '#9d5d00', '--gt-red': '#c42b1c', '--gt-blue': '#0563c1',
      '--gs-accent': '#217346', '--gs-accent-d': '#1a5c38', '--gs-hdr': '#f5f5f5', '--gs-hdr-b': '#c6c6c6',
      '--gs-hdron': '#d8e9df', '--gs-hdron-fg': '#0f4c2f', '--gs-code': '#f7f7f7'
    },
    blue: {
      '--gt-bg-0': '#ffffff', '--gt-bg-1': '#ffffff', '--gt-bg-2': '#f2f5fa', '--gt-bg-3': '#e3e9f3',
      '--gt-border': '#d0d7e2', '--gt-fg': '#1b1f27', '--gt-fg-dim': '#5b6474', '--gt-fg-faint': '#98a1b0', '--gt-fg-strong': '#000000',
      '--gt-green': '#1f7a45', '--gt-magenta': '#6a3fc4', '--gt-cyan': '#0b6f8a',
      '--gt-yellow': '#9d5d00', '--gt-red': '#c42b1c', '--gt-blue': '#1d5fbf',
      '--gs-accent': '#2b5797', '--gs-accent-d': '#1e3f70', '--gs-hdr': '#f3f5f9', '--gs-hdr-b': '#c3cbd8',
      '--gs-hdron': '#dbe5f1', '--gs-hdron-fg': '#1f3864', '--gs-code': '#f5f7fb'
    }
  };

  const CSS = `
.gt-root.gs-root { font-family: "Malgun Gothic", "Apple SD Gothic Neo", Calibri, -apple-system, sans-serif; }
.gs-title { flex: 0 0 auto; height: 30px; display: flex; align-items: center; gap: 12px; padding: 0 12px;
  background: var(--gs-accent); color: #fff; font-size: 12px; }
.gs-title .gs-name { font-weight: 600; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
.gs-title .gs-meta { margin-left: auto; display: flex; gap: 12px; opacity: .92; white-space: nowrap; }
.gs-rtabs { flex: 0 0 auto; display: flex; align-items: flex-end; height: 26px; padding: 0 6px;
  background: var(--gs-accent); user-select: none; }
.gs-rtabs span { padding: 4px 11px; color: #fff; font-size: 11.5px; opacity: .88; cursor: default; }
.gs-rtabs span[data-on="1"] { background: #fff; color: var(--gt-fg); opacity: 1; border-radius: 3px 3px 0 0; font-weight: 600; }
.gs-ribbon { flex: 0 0 auto; display: flex; gap: 4px; align-items: stretch; height: 58px; padding: 5px 8px;
  border-bottom: 1px solid var(--gs-hdr-b); background: #fff; user-select: none; }
.gs-ribbon[hidden] { display: none; }
.gs-grp { display: flex; flex-direction: column; align-items: center; justify-content: center; gap: 3px;
  padding: 0 12px; border-right: 1px solid var(--gt-bg-3); cursor: default; }
.gs-grp b { font-size: 17px; line-height: 1; font-weight: 400; color: var(--gt-fg); }
.gs-grp i { font-style: normal; font-size: 10px; color: var(--gt-fg-dim); }
.gs-fx { flex: 0 0 auto; display: flex; align-items: stretch; min-height: 26px;
  border-bottom: 1px solid var(--gs-hdr-b); background: #fff; }
.gs-namebox { width: 96px; flex: 0 0 auto; padding: 0 8px; display: flex; align-items: center;
  border-right: 1px solid var(--gs-hdr-b); font-size: 12px; }
.gs-fxsym { width: 34px; flex: 0 0 auto; display: flex; align-items: center; justify-content: center;
  border-right: 1px solid var(--gs-hdr-b); color: var(--gt-fg-dim); font-style: italic; }
.gs-fxbody { flex: 1; min-width: 0; display: flex; flex-direction: column; justify-content: center; padding: 3px 8px; }
.gs-input { width: 100%; margin: 0; padding: 0; border: 0; outline: 0; resize: none; overflow: hidden;
  background: transparent; color: var(--gt-fg); font: inherit; line-height: 1.5; min-height: 1.5em; }
.gs-input::placeholder { color: var(--gt-fg-faint); }
.gs-fxbody .gt-suggest { padding: 2px 0 0; font-size: 11px; }
/* 기준 높이를 0 으로 둔다. auto 면 크롬이 행을 하나 끼울 때마다 격자 내용 전체의 높이를 다시 잰다 —
   하네스 실측(1390행): 행 하나 추가 뒤 레이아웃 11.5ms → flex-basis 0 으로 0.2ms. contain 은 그 격리를 굳힌다. */
.gs-grid { flex: 1 1 0; min-height: 0; overflow: auto; background: #fff; outline: 0; contain: strict; }
/* 격자는 표 요소(tr/td)를 쓰되 배치는 CSS 그리드로 한다. 표 배치는 칸 하나가 바뀌어도 모든 행을
   다시 잰다 — 하네스 실측: 1390행에서 칸 하나 바꾼 뒤 레이아웃 18.4ms. 행마다 그리드로 두고 화면 밖 행은
   content-visibility 로 건너뛴다. */
.gs-grid > table, .gs-grid > table > thead, .gs-grid > table > tbody { display: block; }
.gs-grid > table > colgroup { display: none; }
.gs-grid > table > * > tr { display: grid; grid-template-columns: 44px 72px minmax(0, 1fr) 64px; }
.gs-grid > table > tbody > tr { content-visibility: auto; contain-intrinsic-size: auto 23px; }
.gs-grid > table > thead { position: sticky; top: 0; z-index: 1; }
.gs-grid > table > * > tr > th, .gs-grid > table > * > tr > td { border-right: 1px solid var(--gt-border); border-bottom: 1px solid var(--gt-border);
  padding: 1px 6px; font-weight: 400; text-align: left; line-height: 1.5; min-width: 0; }
.gs-grid > table > thead > tr > th { background: var(--gs-hdr); color: #444; text-align: center; border-color: var(--gs-hdr-b); font-size: 11px; }
.gs-grid > table > thead > tr > th[data-on="1"] { background: var(--gs-hdron); color: var(--gs-hdron-fg); font-weight: 600; }
.gs-grid td.gs-rn { background: var(--gs-hdr); color: #444; text-align: center; border-color: var(--gs-hdr-b);
  font-size: 11px; user-select: none; }
.gs-grid > table > * > tr[data-sel="1"] > td.gs-rn { background: var(--gs-hdron); color: var(--gs-hdron-fg); font-weight: 600; }
.gs-grid td.gs-a { color: var(--gt-fg-dim); white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
.gs-grid td.gs-a[data-who="user"] { color: var(--gs-accent-d); font-weight: 600; }
.gs-grid td.gs-a[data-who="assistant"] { color: var(--gt-magenta); font-weight: 600; }
.gs-grid td.gs-a[data-who="info"] { color: var(--gt-fg-faint); }
.gs-grid td.gs-a[data-who="warn"] { color: var(--gt-yellow); }
.gs-grid td.gs-a[data-who="error"] { color: var(--gt-red); }
.gs-grid td.gs-b { white-space: pre-wrap; word-break: break-word; }
.gs-grid td.gs-c { color: var(--gt-fg-dim); white-space: nowrap; font-size: 11px; }
.gs-grid > table > * > tr > td[data-sel="1"] { outline: 2px solid var(--gs-accent); outline-offset: -2px; }
.gs-grid td.gs-b[data-kind="heading"] { font-weight: 700; }
.gs-grid td.gs-b[data-kind="code"] { font-family: ui-monospace, "SF Mono", Menlo, Consolas, monospace;
  font-size: .92em; background: var(--gs-code); white-space: pre; overflow-x: auto; }
.gs-grid td.gs-b[data-kind="table"] { font-family: ui-monospace, "SF Mono", Menlo, Consolas, monospace; font-size: .92em; }
.gs-grid td.gs-b[data-kind="table"][data-header="1"] { font-weight: 700; }
.gs-grid td.gs-b[data-kind="hr"] { background: linear-gradient(transparent 48%, var(--gt-border) 48%, var(--gt-border) 56%, transparent 56%); }
.gs-grid td.gs-b[data-kind="placeholder"], .gs-grid td.gs-b[data-kind="image"] { color: var(--gt-fg-dim); font-style: italic; }
.gs-grid td.gs-b[data-kind="sys"] { color: var(--gt-fg-dim); }
.gs-grid td.gs-b[data-quote] { border-left: 3px solid var(--gt-border); color: var(--gt-fg-dim); }
.gs-grid td.gs-b[data-kind="thinking"] { color: var(--gt-fg-dim); font-style: italic; }
.gs-grid > table > * > tr.gs-mirror > td.gs-b { color: var(--gt-fg-dim); }
/* 빈 행은 칸 내용만 숨긴다. 행 번호까지 숨기면 격자가 12행에서 끊겨 보인다 (하네스 실측) */
.gs-grid > table > * > tr.gs-blank > td:not(.gs-rn) { color: transparent; }
.gs-bullet { color: var(--gt-fg-dim); }
.gs-caret { display: inline-block; width: 7px; height: 1.1em; vertical-align: text-bottom; background: var(--gs-accent);
  margin-left: 2px; animation: gs-blink 1s steps(1) infinite; }
@keyframes gs-blink { 50% { opacity: 0; } }
.gs-grid a { color: var(--gt-blue); }
.gs-grid .gt-sys-body { white-space: pre-wrap; }
.gs-tabs { flex: 0 0 auto; display: flex; align-items: stretch; height: 26px; padding: 0 4px;
  border-top: 1px solid var(--gs-hdr-b); background: var(--gs-hdr); font-size: 11.5px; user-select: none; }
.gs-tabnav { display: flex; align-items: center; gap: 2px; padding: 0 4px; color: var(--gt-fg-dim); }
.gs-tabnav button, .gs-plus, .gs-zoom button { all: unset; cursor: pointer; padding: 0 5px; }
.gs-tabnav button:hover, .gs-plus:hover, .gs-zoom button:hover { color: var(--gt-fg); }
.gs-tablist { flex: 1; min-width: 0; display: flex; overflow: hidden; scroll-behavior: smooth; }
.gs-tab { flex: 0 0 auto; display: flex; align-items: center; max-width: 220px; padding: 0 13px;
  border: 1px solid transparent; color: #444; cursor: pointer; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
.gs-tab:hover { background: #fff; }
.gs-tab[data-on="1"] { background: #fff; border-color: var(--gs-hdr-b); border-top-color: #fff;
  color: var(--gs-accent); font-weight: 600; }
.gs-plus { display: flex; align-items: center; color: var(--gt-fg-dim); padding: 0 10px; }
.gs-status { flex: 0 0 auto; display: flex; align-items: center; gap: 16px; height: 24px; padding: 0 10px;
  background: var(--gs-accent); color: #fff; font-size: 11px; white-space: nowrap; }
.gs-status[data-bell="1"] { background: var(--gt-yellow); }
.gs-status .gs-right { margin-left: auto; display: flex; gap: 14px; align-items: center; }
.gs-zoom { display: flex; align-items: center; gap: 4px; }
`;

  let shadow = null, root = null, varStyle = null;
  const ui = {};
  const pool = new Map();      // row key → { tr, sig, after:[seen,n] }
  let epoch = 0;
  let mode = 'NORMAL';
  let spinAt = 0;
  let sel = null;              // { key, col }  고른 셀
  let stickBottom = true;
  let chats = [];              // 시트 탭에 보일 대화 [{id,title,href}]
  let chatsAt = 0;
  let chatsPath = '';
  const systemLog = [];
  let sysSeq = 0;
  // 메시지 키 → 펼친 행과 행 서명. 바뀌지 않은 메시지를 매번 다시 펴지 않는다.
  // 하네스 실측(1351행 대화에서 긴 답 스트리밍): 캐시 전 한 델타 21.9ms(중앙값) — 매 델타마다
  // 150개 메시지 전부를 markdown.lines 로 다시 펴고 모든 행 서명을 다시 만들었다.
  const memo = new Map();

  const T = (k, ...a) => GT_T(k, ...a);
  const cols = () => ['A', 'B', 'C'];

  // ---------------------------------------------------------------- 골격
  function build() {
    ({ shadow } = GT.cover.host());
    const base = el('style'); base.textContent = GT.theme.CSS + CSS; shadow.appendChild(base);
    varStyle = el('style'); shadow.appendChild(varStyle);
    root = el('div', 'gt-root gs-root');

    ui.title = el('div', 'gs-title');
    ui.name = el('span', 'gs-name', '');
    ui.meta = el('span', 'gs-meta', '');
    ui.title.appendChild(ui.name); ui.title.appendChild(ui.meta);

    ui.rtabs = el('div', 'gs-rtabs');
    T('sheet.ribbon.tabs').split('|').forEach((name, i) => {
      const s = el('span', null, name);
      if (i === 1) s.dataset.on = '1';
      ui.rtabs.appendChild(s);
    });
    ui.rtabs.title = T('sheet.ribbon.toggle');
    // 실제 스프레드시트처럼 리본 탭을 두 번 누르면 리본을 접는다. 설정에 저장한다.
    ui.rtabs.addEventListener('dblclick', () => { GT.config.set('sheet.ribbon', !GT.config.get('sheet.ribbon')); });

    ui.ribbon = el('div', 'gs-ribbon');
    const glyph = ['⎘', 'B', '≡', '%', '▦', 'Σ'];
    T('sheet.ribbon.groups').split('|').forEach((name, i) => {
      const g = el('div', 'gs-grp');
      g.appendChild(el('b', null, glyph[i] || '·'));
      g.appendChild(el('i', null, name));
      ui.ribbon.appendChild(g);
    });

    ui.fx = el('div', 'gs-fx');
    ui.namebox = el('div', 'gs-namebox', 'B1');
    ui.fx.appendChild(ui.namebox);
    ui.fx.appendChild(el('div', 'gs-fxsym', 'fx'));
    const fxbody = el('div', 'gs-fxbody');
    ui.input = el('textarea', 'gs-input');
    ui.input.rows = 1;
    ui.input.spellcheck = false;
    ui.input.placeholder = T('sheet.fx.placeholder');
    // 입력 중인 글자를 다음 빈 행에 비춘다. 입력 자체는 여기 하나뿐이다 (셀은 읽기 전용 그림).
    ui.input.addEventListener('input', () => drawMirror());
    ui.input.addEventListener('focus', () => { sel = null; paintSel(); updateNamebox(); });
    ui.suggest = el('div', 'gt-suggest');
    ui.suggest.hidden = true;
    fxbody.appendChild(ui.input);
    fxbody.appendChild(ui.suggest);
    ui.fx.appendChild(fxbody);

    ui.grid = el('div', 'gs-grid');
    ui.grid.tabIndex = -1;
    const table = el('table');
    const cg = el('colgroup');
    [44, 72, null, 64].forEach((w) => { const c = el('col'); if (w) c.style.width = w + 'px'; cg.appendChild(c); });
    table.appendChild(cg);
    const thead = el('thead');
    const hr = el('tr');
    hr.appendChild(el('th', null, ''));
    ui.colHeads = cols().map((c) => { const th = el('th', null, c); hr.appendChild(th); return th; });
    thead.appendChild(hr);
    table.appendChild(thead);
    ui.body = el('tbody');
    table.appendChild(ui.body);
    ui.tail = el('tbody');     // 입력 미러 행 + 빈 행. 대화 행과 따로 둔다 (재조정 대상이 아니다)
    table.appendChild(ui.tail);
    ui.grid.appendChild(table);
    ui.grid.addEventListener('mousedown', onGridDown);
    ui.grid.addEventListener('keydown', onGridKey);

    ui.tabs = el('div', 'gs-tabs');
    const nav = el('div', 'gs-tabnav');
    const prev = el('button', null, '◀'); prev.title = T('sheet.tabs.prev');
    const next = el('button', null, '▶'); next.title = T('sheet.tabs.next');
    prev.addEventListener('click', () => { ui.tablist.scrollLeft -= 240; });
    next.addEventListener('click', () => { ui.tablist.scrollLeft += 240; });
    nav.appendChild(prev); nav.appendChild(next);
    ui.tablist = el('div', 'gs-tablist');
    ui.tablist.addEventListener('wheel', (e) => { ui.tablist.scrollLeft += e.deltaY || e.deltaX; e.preventDefault(); }, { passive: false });
    const plus = el('button', 'gs-plus', '+'); plus.title = T('sheet.newTab');
    plus.addEventListener('click', () => GT.navigate.newChat());
    ui.tabs.appendChild(nav); ui.tabs.appendChild(ui.tablist); ui.tabs.appendChild(plus);

    ui.status = el('div', 'gs-status');
    ui.mode = el('span', null, T('sheet.status.ready'));
    ui.cell = el('span', null, '');
    const right = el('div', 'gs-right');
    ui.count = el('span', null, '');
    ui.chars = el('span', null, '');
    const zoom = el('span', 'gs-zoom');
    const zo = el('button', null, '−'); zo.title = T('sheet.zoom.out');
    const zi = el('button', null, '+'); zi.title = T('sheet.zoom.in');
    ui.zoom = el('span', null, '100%');
    zo.addEventListener('click', () => GT.commands.run(':font -'));
    zi.addEventListener('click', () => GT.commands.run(':font +'));
    zoom.appendChild(zo); zoom.appendChild(ui.zoom); zoom.appendChild(zi);
    right.appendChild(ui.count); right.appendChild(ui.chars); right.appendChild(zoom);
    ui.status.appendChild(ui.mode); ui.status.appendChild(ui.cell); ui.status.appendChild(right);

    ui.sidebarSlot = GT.sidebar.build();

    [ui.title, ui.rtabs, ui.ribbon, ui.fx, ui.grid, ui.tabs, ui.status].forEach((n) => root.appendChild(n));
    shadow.appendChild(root);
    loadChats(true);
  }

  function applyConfig(cfg) {
    if (!varStyle) return;
    const t = THEMES[cfg['sheet.theme']] || THEMES.green;
    const decls = Object.entries(t).map(([k, v]) => `${k}:${v}`).join(';');
    varStyle.textContent = `.gt-root{${decls};--gt-font:inherit;--gt-size:${cfg['font.size']}px;`
      + `--gt-lh:1.5;--gt-sb-w:${Number(cfg['sidebar.width']) || 30}ch;font-size:${cfg['font.size']}px;}`;
    if (ui.ribbon) ui.ribbon.hidden = cfg['sheet.ribbon'] === false;
    epoch += 1;
  }

  // ---------------------------------------------------------------- 행 계획 (DOM 없음)
  //
  // 메시지 하나를 행 목록으로 편다. 테스트가 직접 부른다 — 무엇이 몇 행이 되는지가 이 스킨의 핵심이다.
  function stamp(at) {
    if (!at) return '';
    return new Date(at).toLocaleTimeString('ko-KR', { hour12: false, hour: '2-digit', minute: '2-digit' });
  }

  function rowsOf(m) {
    const rows = [];
    if (m.role === 'user') {
      // 내가 보낸 글은 마크다운으로 해석하지 않는다 (터미널도 원문 그대로 보여 준다). 줄마다 한 행.
      String(m.text || '').split('\n').forEach((line) => rows.push({ kind: 'text', text: line, raw: true }));
    } else {
      GT.markdown.lines(m.text || '').forEach((r) => rows.push(r));
      (m.images || []).forEach((im) => rows.push({ kind: 'image', text: `${im.mime || 'image'} ${im.w}×${im.h}`, pointer: im.pointer }));
      const drew = (m.images || []).length > 0;
      const nonText = (m.parts || []).filter((t) => t && t !== 'text' && !(drew && t === 'image'));
      if (nonText.length) rows.push({ kind: 'placeholder', text: T('sheet.nonText', nonText.join(', ')) });
    }
    if (!rows.length) rows.push({ kind: 'text', text: '', raw: m.role === 'user' });
    const who = m.role === 'user' ? 'user' : 'assistant';
    return rows.map((r, i) => ({
      ...r,
      first: i === 0,
      last: i === rows.length - 1,
      who,
      label: i === 0 ? (who === 'user' ? T('sheet.who.user') : (m.model || T('sheet.who.assistant'))) : '',
      time: i === 0 ? stamp(m.at) : '',
      streaming: !!m.streaming && i === rows.length - 1
    }));
  }

  // 행을 다시 펴야 하는지 가르는 지문. 행을 만드는 데 쓰는 값을 전부 넣는다 — 빠뜨리면 낡은 행이 남는다.
  // 본문은 길이가 아니라 문자열 전체를 비교한다 (길이가 같고 내용만 바뀌는 교정이 실제로 있다).
  function fingerprint(m) {
    return [m.role, m.text || '', m.streaming ? 1 : 0, m.model || '', m.at || 0,
      (m.images || []).map((im) => im.pointer).join(','), (m.parts || []).join(','), (m.refs || []).length].join('\u0001');
  }

  function rowsCached(mk, m) {
    const fp = fingerprint(m);
    const hit = memo.get(mk);
    if (hit && hit.fp === fp) return hit;
    const entry = { fp, rows: rowsOf(m), sigs: null, sigEpoch: -1 };
    memo.set(mk, entry);
    return entry;
  }

  function plan(state) {
    const out = [];
    const live = new Set();
    state.messages.forEach((m, idx) => {
      const mk = m.id ? 'm:' + m.id : 'i:' + idx;
      live.add(mk);
      const entry = rowsCached(mk, m);
      entry.rows.forEach((r, i) => out.push({ key: mk + ':' + i, msgKey: mk, refs: m.refs || [], row: r, memo: entry, at: i }));
    });
    // 대화를 옮기면 이전 대화의 캐시를 버린다
    [...memo.keys()].forEach((k) => { if (!live.has(k)) memo.delete(k); });
    systemLog.forEach((rec) => out.push({ key: 's:' + rec.id, sys: rec }));
    if (GT.store.isThinking()) out.push({ key: 'thinking', live: 'thinking' });
    if (GT.store.isDrawing()) out.push({ key: 'drawing', live: 'drawing' });
    return out;
  }

  // ---------------------------------------------------------------- 행 그리기
  function cell(cls, text) { const td = el('td', cls); if (text !== undefined) td.textContent = text; return td; }

  function buildRow(item, ctx) {
    const tr = el('tr');
    tr.appendChild(cell('gs-rn', ''));
    const a = cell('gs-a');
    const b = cell('gs-b');
    const c = cell('gs-c');
    if (item.sys) {
      a.dataset.who = item.sys.level;
      a.textContent = `[${item.sys.level}]`;
      b.dataset.kind = 'sys';
      const body = el('span', 'gt-sys-body');
      if (item.sys.node) body.appendChild(item.sys.node); else body.textContent = item.sys.text || '';
      b.appendChild(body);
    } else if (item.live) {
      a.dataset.who = 'assistant';
      a.textContent = T('sheet.who.assistant');
      b.dataset.kind = 'thinking';
      b.appendChild(el('span', 'gt-spin', SPIN[spinAt]));
      b.appendChild(document.createTextNode(' ' + (item.live === 'drawing' ? T('img.drawing') : T('sheet.thinking')) + ' '));
      b.appendChild(el('span', 'gs-elapsed', ''));
    } else {
      const r = item.row;
      a.dataset.who = r.who;
      a.textContent = r.label;
      if (r.label) a.title = r.label;
      c.textContent = r.time;
      b.dataset.kind = r.kind;
      if (r.quote) b.dataset.quote = String(r.quote);
      if (r.kind === 'table' && r.header) b.dataset.header = '1';
      if (r.kind === 'item') {
        b.style.paddingLeft = (6 + 14 * (r.depth || 0)) + 'px';
        b.appendChild(el('span', 'gs-bullet', (r.depth ? '▸' : '·') + ' '));
        GT.markdown.inline(r.text, b, ctx);
      } else if (r.kind === 'code' || r.kind === 'table' || r.raw) {
        b.textContent = r.text;
      } else if (r.kind === 'hr') {
        b.textContent = '';
      } else if (r.kind === 'image' || r.kind === 'placeholder') {
        b.textContent = r.kind === 'image' ? T('sheet.image', r.text) : r.text;
      } else {
        GT.markdown.inline(r.text, b, ctx);
      }
      if (r.streaming) b.appendChild(el('span', 'gs-caret'));
    }
    tr.appendChild(a); tr.appendChild(b); tr.appendChild(c);
    return tr;
  }

  function renderGrid() {
    const s = GT.store.state;
    const items = plan(s);
    const next = [];
    let ctx = null, ctxMsg = null;
    items.forEach((it) => {
      let before = null;
      if (it.row) {
        if (ctxMsg !== it.msgKey) { ctx = GT.markdown.newCtx({ refs: it.refs }); ctxMsg = it.msgKey; }
        before = [ctx.seen, ctx.n];
      }
      // 서명: 행 내용 + 그리기 전 인용 번호 상태 + 설정 세대 + 인용 출처 개수.
      // 인용 번호가 앞 행에서 이어지므로, 앞에서 번호가 밀리면 이 행도 다시 그린다.
      // 메시지가 그대로면 지난번 서명을 쓴다 (같은 행 · 같은 시작 번호 상태 → 같은 서명).
      let sig;
      const mm = it.memo;
      if (mm && mm.sigEpoch === epoch && mm.sigs && mm.sigs[it.at] && mm.sigs[it.at].before[0] === before[0] && mm.sigs[it.at].before[1] === before[1]) {
        sig = mm.sigs[it.at].sig;
      } else {
        sig = JSON.stringify([it.row || null, it.sys ? it.sys.id : null, it.live || null, before, it.row ? it.refs.length : 0, epoch]);
        if (mm) {
          if (mm.sigEpoch !== epoch || !mm.sigs) { mm.sigs = []; mm.sigEpoch = epoch; }
          mm.sigs[it.at] = { sig, before: before.slice() };
        }
      }
      let rec = pool.get(it.key);
      if (rec && rec.sig === sig) {
        if (rec.after && ctx) { ctx.seen = rec.after[0]; ctx.n = rec.after[1]; }
      } else {
        const tr = buildRow(it, ctx);
        tr.dataset.key = it.key;
        if (rec && rec.tr.parentElement) rec.tr.remove();
        rec = { tr, sig, after: it.row ? [ctx.seen, ctx.n] : null };
        pool.set(it.key, rec);
      }
      next.push({ key: it.key, rec });
    });
    const wanted = new Set(next.map((n) => n.key));
    let changed = false;
    [...pool.keys()].forEach((k) => {
      if (!wanted.has(k)) { const r = pool.get(k); if (r.tr.parentElement) r.tr.remove(); pool.delete(k); changed = true; }
    });
    next.forEach((n, i) => {
      const cur = ui.body.children[i];
      if (cur !== n.rec.tr) { ui.body.insertBefore(n.rec.tr, cur || null); changed = true; }
      // 행 번호는 위치에서 나온다. 서명에 넣으면 앞에 한 행이 끼일 때 전부 다시 그린다 — 자리에서 고친다.
      const rn = n.rec.tr.firstChild;
      const want = String(i + 1);
      if (rn.textContent !== want) rn.textContent = want;
    });
    while (ui.body.children.length > next.length) { ui.body.lastElementChild.remove(); changed = true; }
    drawMirror();
    return changed;
  }

  // 입력 미러 행과 빈 행. 입력 중인 글자를 '나' 의 다음 행에 비춘다.
  function drawMirror() {
    if (!ui.tail) return;
    const n = ui.body.children.length;
    if (!ui.tail.children.length) {
      const tr = el('tr', 'gs-mirror');
      tr.appendChild(cell('gs-rn', ''));
      const a = cell('gs-a'); a.dataset.who = 'user';
      tr.appendChild(a); tr.appendChild(cell('gs-b')); tr.appendChild(cell('gs-c'));
      ui.tail.appendChild(tr);
      for (let i = 0; i < 12; i++) {
        const b = el('tr', 'gs-blank');
        b.appendChild(cell('gs-rn', '')); b.appendChild(cell('gs-a', '.')); b.appendChild(cell('gs-b', '.')); b.appendChild(cell('gs-c', '.'));
        ui.tail.appendChild(b);
      }
    }
    [...ui.tail.children].forEach((tr, i) => { const v = String(n + 1 + i); if (tr.firstChild.textContent !== v) tr.firstChild.textContent = v; });
    const mirror = ui.tail.firstChild;
    const text = ui.input ? ui.input.value : '';
    mirror.children[1].textContent = text ? T('sheet.who.user') : '';
    mirror.children[2].textContent = text;
    updateNamebox();
  }

  // ---------------------------------------------------------------- 셀 선택
  function allRows() { return [...ui.body.children, ...ui.tail.children]; }

  function address() {
    if (!sel) return 'B' + (ui.body ? ui.body.children.length + 1 : 1);
    const rows = allRows();
    const idx = rows.findIndex((tr) => tr.dataset.key === sel.key || tr === sel.tr);
    return sel.col + (idx + 1);
  }

  function updateNamebox() {
    if (!ui.namebox) return;
    const a = address();
    ui.namebox.textContent = a;
    ui.cell.textContent = T('sheet.status.cell', a);
    const col = a.charAt(0);
    ui.colHeads.forEach((th, i) => { th.dataset.on = cols()[i] === col ? '1' : '0'; });
  }

  function paintSel() {
    if (!root) return;
    root.querySelectorAll('[data-sel="1"]').forEach((n) => { n.dataset.sel = '0'; });
    if (!sel) return;
    const tr = sel.tr && sel.tr.isConnected ? sel.tr : ui.body.querySelector(`tr[data-key="${CSS.escape(sel.key || '')}"]`);
    if (!tr) { sel = null; return; }
    sel.tr = tr;
    tr.dataset.sel = '1';
    const td = tr.children[1 + cols().indexOf(sel.col)];
    if (td) td.dataset.sel = '1';
  }

  function select(tr, col) {
    sel = { key: tr.dataset.key || null, tr, col };
    paintSel();
    updateNamebox();
  }

  function onGridDown(e) {
    const td = e.target.closest && e.target.closest('td');
    if (!td || td.classList.contains('gs-rn')) return;
    const tr = td.parentElement;
    const col = cols()[[...tr.children].indexOf(td) - 1];
    if (!col) return;
    select(tr, col);
  }

  // 고른 셀이 있으면 방향키로 옮기고, ⌘/Ctrl+C 로 셀 글자를 복사한다.
  // 글자를 치면 전역 키 처리가 수식 입력줄로 옮겨 준다 (capturesTyping).
  function onGridKey(e) {
    if (!sel) return;
    const rows = allRows();
    let r = rows.indexOf(sel.tr);
    let c = cols().indexOf(sel.col);
    const move = { ArrowUp: [-1, 0], ArrowDown: [1, 0], ArrowLeft: [0, -1], ArrowRight: [0, 1] }[e.key];
    if (move && !e.metaKey && !e.ctrlKey && !e.altKey) {
      e.preventDefault();
      r = Math.max(0, Math.min(rows.length - 1, r + move[0]));
      c = Math.max(0, Math.min(2, c + move[1]));
      select(rows[r], cols()[c]);
      const tr = rows[r];
      if (tr.scrollIntoView) tr.scrollIntoView({ block: 'nearest' });
      return;
    }
    if ((e.metaKey || e.ctrlKey) && (e.key === 'c' || e.key === 'C')) {
      const picked = (shadow.getSelection ? shadow.getSelection() : document.getSelection());
      if (picked && String(picked).length) return;       // 드래그로 고른 글자가 있으면 그걸 복사한다 (기본 동작)
      const td = sel.tr.children[1 + c];
      if (td) { e.preventDefault(); GT.clipboard.copy(cellText(td)); }
    }
  }

  // 셀의 글자. 목록 글머리(· ▸)는 보이기 위한 장식이라 복사에서 뺀다 (하네스 실측: '▸ 맥은…' 이 복사됐다).
  function cellText(td) {
    const nodes = td.childNodes || td.children || [];
    return [...nodes].filter((n) => !(n.classList && n.classList.contains('gs-bullet') || n.className === 'gs-bullet'))
      .map((n) => n.textContent).join('');
  }

  // ---------------------------------------------------------------- 시트 탭 (대화 목록)
  async function loadChats(force) {
    const now = Date.now();
    if (!force && now - chatsAt < 30000) return;
    chatsAt = now;
    const shape = (g) => {
      if (!g) return [];
      const list = [].concat(g.pinned || [], g.chats || [], ...((g.projects || []).map((p) => p.items || [])));
      const seen = new Set();
      return list.filter((c) => c && c.id && !seen.has(c.id) && seen.add(c.id));
    };
    try { chats = shape(GT.chats.state); } catch (_) { chats = []; }
    drawTabs();
    try { chats = shape(await GT.chats.load()); } catch (_) { /* 목록을 못 읽어도 지금 대화 탭은 보인다 */ }
    drawTabs();
  }

  function drawTabs() {
    if (!ui.tablist) return;
    const s = GT.store.state;
    const curId = GT.conversation && GT.conversation.idFromPath ? GT.conversation.idFromPath() : null;
    ui.tablist.textContent = '';
    const cur = el('div', 'gs-tab', s.conversationTitle || T('sheet.newChat'));
    cur.dataset.on = '1';
    cur.title = cur.textContent;
    ui.tablist.appendChild(cur);
    chats.filter((c) => c.id !== curId).slice(0, 40).forEach((c) => {
      const t = el('div', 'gs-tab', c.title);
      t.title = c.title;
      t.addEventListener('click', () => GT.navigate.to(c.href));
      ui.tablist.appendChild(t);
    });
    ui.tablist.scrollLeft = 0;
  }

  // ---------------------------------------------------------------- 상단 · 하단
  const MODE_TEXT = { NORMAL: 'sheet.status.ready', INSERT: 'sheet.status.input', STREAM: 'sheet.status.stream',
    COMMAND: 'sheet.status.command', BROKEN: 'sheet.status.broken' };

  function renderChrome() {
    if (!root) return;
    const s = GT.store.state;
    ui.name.textContent = `${s.conversationTitle || T('sheet.newChat')}.xlsx`;
    const last = [...s.messages].reverse().find((m) => m.model);
    const bits = [];
    if (last) bits.push(last.model);
    if (GT.picker && GT.picker.available && GT.picker.available()) {
      const p = GT.picker.pending;
      const label = GT.picker.effortLabel();
      if (p) bits.push(`${p.from || ''} →`); else if (label) bits.push(label);
    }
    bits.push(new Date().toLocaleTimeString('ko-KR', { hour12: false, hour: '2-digit', minute: '2-digit' }));
    ui.meta.textContent = bits.join(' · ');
    if (s.path !== chatsPath) { chatsPath = s.path; drawTabs(); loadChats(false); }
    else if (ui.tablist.firstChild && ui.tablist.firstChild.textContent !== (s.conversationTitle || T('sheet.newChat'))) drawTabs();
    ui.count.textContent = T('sheet.status.messages', s.messages.length);
    ui.chars.textContent = T('sheet.status.chars', GT.store.approxChars().toLocaleString('ko-KR'));
    ui.zoom.textContent = Math.round((Number(GT.config.get('font.size')) || 13) / 13 * 100) + '%';
    let m = s.streamingId ? 'STREAM' : (mode === 'STREAM' ? 'NORMAL' : mode);
    if (m !== mode) mode = m;
    const live = GT.store.isThinking() ? 'sheet.status.thinking' : (GT.store.isDrawing() ? 'sheet.status.drawing' : null);
    ui.mode.textContent = T(live || MODE_TEXT[mode] || 'sheet.status.ready');
    updateNamebox();
  }

  function render() {
    if (!root) return;
    stickBottom = ui.grid.scrollTop + ui.grid.clientHeight >= ui.grid.scrollHeight - 40;
    const changed = renderGrid();
    paintSel();
    renderChrome();
    if (changed && stickBottom) ui.grid.scrollTop = ui.grid.scrollHeight;
  }

  function tick() {
    if (!root || !shadow) return;
    const s = GT.store.state;
    const drawing = GT.store.isDrawing();
    if (!s.streamingId && !GT.store.isThinking() && !drawing) return;
    spinAt = (spinAt + 1) % SPIN.length;
    shadow.querySelectorAll('.gt-spin').forEach((n) => { n.textContent = SPIN[spinAt]; });
    const e = shadow.querySelector('.gs-elapsed');
    if (e) e.textContent = `${(drawing ? GT.store.drawingElapsed() : GT.store.thinkingElapsed()).toFixed(1)}s`;
  }

  function system(level, text, node, opts) {
    if (opts && opts.quiet && GT.config.get('log') === false) {
      if (text) GT.log(`[${level}] ${text}`);
      return;
    }
    systemLog.push({ id: ++sysSeq, level, text, node });
    if (systemLog.length > 60) systemLog.shift();
    render();
  }

  function setSuggest(list, note) {
    if (!ui.suggest) return;
    ui.suggest.textContent = '';
    if (!list || !list.length) { ui.suggest.hidden = true; return; }
    list.slice(0, 8).forEach((v, i) => {
      const it = el('span', 'gt-suggest-item', v);
      if (i === 0) it.dataset.first = '1';
      ui.suggest.appendChild(it);
    });
    if (list.length > 8) ui.suggest.appendChild(el('span', 'gt-suggest-more', `+${list.length - 8}`));
    ui.suggest.appendChild(el('span', 'gt-spacer'));
    ui.suggest.appendChild(el('span', 'gt-suggest-hint', note || '⇥'));
    ui.suggest.hidden = false;
  }

  // 대화 목록 오버레이는 직접 열었을 때만 (시트 탭이 이미 목록이다). 여닫은 것은 저장하지 않는다.
  function sidebarShown() {
    const st = GT.sidebar.state ? GT.sidebar.state() : {};
    return !!st.forcedOpen && !st.dismissed;
  }
  function syncSidebar() {
    if (!root || !ui.sidebarSlot) return;
    const want = sidebarShown();
    const attached = ui.sidebarSlot.parentElement === root;
    if (want && !attached) root.appendChild(ui.sidebarSlot);
    else if (!want && attached) ui.sidebarSlot.remove();
  }

  GT.skins.register({
    id: 'sheet',
    covers: true,
    capturesTyping: true,
    keys: { open: null, escapeHides: false },
    persistSidebar: false,
    themes: THEMES,
    defaultTheme: 'green',
    get configKeys() { return GT_SCHEMA.filter((f) => f.skin === 'sheet').map((f) => f.key); },
    // :messup 은 스크롤백에 가짜 블록을 끼우는 진단이다. 시트에는 끼울 자리를 두지 않았다.
    hiddenCommands: [':messup'],

    get ui() { return ui; },      // 계약 밖
    rowsOf,                       // 계약 밖 — 테스트가 행 계획을 직접 본다
    plan,
    get prompt() {
      return {
        el: ui.input || null,
        autosize() { const i = ui.input; if (!i) return; i.style.height = 'auto'; i.style.height = Math.min(i.scrollHeight, 120) + 'px'; }
      };
    },
    mount(cfg) { build(); applyConfig(cfg); return root; },
    destroy() {
      pool.clear();
      memo.clear();
      systemLog.length = 0;
      sel = null; chats = []; chatsAt = 0; chatsPath = '';
      shadow = null; root = null; varStyle = null;
      Object.keys(ui).forEach((k) => { delete ui[k]; });
    },
    applyConfig,
    render,
    renderChrome,
    tick,
    syncSidebar,
    sidebarShown,
    system,
    clearSystem() { const n = systemLog.length; systemLog.length = 0; render(); return n; },
    local() { return 0; },
    clearLocal() { return 0; },
    setMode(m) { mode = m; if (root) renderChrome(); },
    setSuggest,
    syncFocus() {},
    bell() {
      if (!ui.status) return;
      ui.status.dataset.bell = '1';
      setTimeout(() => { if (ui.status) ui.status.dataset.bell = '0'; }, 120);
    },
    focus() { if (ui.input) ui.input.focus(); },
    overlayRoot() { return root; }
  });
})();
