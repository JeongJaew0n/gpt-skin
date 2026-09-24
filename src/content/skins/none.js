// gpt-skin — none 스킨. 원본 화면을 그대로 두고, 우리 명령만 쓸 수 있게 한다.
// 원본 위에 명령줄 하나와 그 결과를 보여 줄 패널만 띄운다. 평소에는 닫혀 있다.
//   Ctrl+;  명령줄 열기      esc (빈 줄)  닫기      Ctrl+`  열기/닫기
// 스킨 계약: src/content/shell/skin.js · docs/plan/2026-09-24-skin-architecture.md §2.9
//
// 실측 2026-09-24 (docs/plan/2026-09-24-skin-architecture.md §5단계 실측)
//   · 원본은 컴포저 포커스 상태에서 Ctrl+; 를 막지도 쓰지도 않는다
//   · 호스트에 pointer-events: none, 위젯에만 auto 를 주면 원본 클릭은 원본으로,
//     위젯 클릭은 위젯으로만 간다 (위젯 아래 원본 링크는 눌리지 않는다)
(function () {
  'use strict';

  const el = (t, c, x) => { const n = document.createElement(t); if (c) n.className = c; if (x !== undefined) n.textContent = x; return n; };

  let shadow = null, root = null, varStyle = null;
  const ui = {};
  const log = [];            // 명령 결과. 명령줄 위 패널에 보인다
  let seq = 0;

  // 터미널 CSS 를 그대로 싣는다 — 사이드바 · 팔레트 · 시스템 줄 모양을 같이 쓴다.
  // 그 위에 루트를 투명하게 하고 클릭을 통과시키는 규칙만 덮는다.
  const CSS = `
.gt-root.gn-root { background: transparent; pointer-events: none; }
.gn-root > * { pointer-events: auto; }
.gn-dock {
  position: absolute; left: 50%; bottom: 20px; transform: translateX(-50%);
  width: min(760px, calc(100% - 32px));
  display: flex; flex-direction: column; gap: 6px;
}
.gn-dock[hidden] { display: none; }
.gn-out {
  max-height: 42vh; overflow: auto; padding: 8px 12px;
  background: var(--gt-bg-0); border: 1px solid var(--gt-border); border-radius: 8px;
  box-shadow: 0 10px 30px rgba(1, 4, 9, 0.45);
}
.gn-out[hidden] { display: none; }
.gn-out .gt-sys + .gt-sys { margin-top: 2px; }
.gn-bar {
  display: flex; flex-direction: column; gap: 4px; padding: 8px 12px;
  background: var(--gt-bg-1); border: 1px solid var(--gt-border); border-radius: 8px;
  box-shadow: 0 10px 30px rgba(1, 4, 9, 0.45);
}
.gn-bar[data-bell="1"] { border-color: var(--gt-yellow); }
.gn-line { display: flex; align-items: flex-start; gap: 8px; }
.gn-mark { color: var(--gt-green); line-height: var(--gt-lh); }
.gn-input {
  flex: 1; min-height: calc(var(--gt-size) * var(--gt-lh)); padding: 0; margin: 0;
  background: transparent; border: 0; outline: 0; resize: none; overflow: hidden;
  color: var(--gt-fg); font: inherit; line-height: var(--gt-lh); caret-color: var(--gt-green);
}
.gn-input::placeholder { color: var(--gt-fg-faint); }
.gn-mode { color: var(--gt-fg-faint); font-size: 11px; line-height: var(--gt-lh); }
.gn-bar .gt-suggest { padding: 0; }
`;

  function build() {
    ({ shadow } = GT.cover.host());
    const base = el('style'); base.textContent = GT.theme.CSS + CSS; shadow.appendChild(base);
    varStyle = el('style'); shadow.appendChild(varStyle);

    root = el('div', 'gt-root gn-root');

    // 사이드바 자리. 사용자가 Ctrl+B 로 열었을 때만 붙인다 (syncSidebar).
    ui.sidebarSlot = GT.sidebar.build();

    ui.dock = el('div', 'gn-dock');
    ui.out = el('div', 'gn-out');
    ui.out.hidden = true;
    ui.bar = el('div', 'gn-bar');
    ui.suggest = el('div', 'gt-suggest');
    ui.suggest.hidden = true;
    const line = el('div', 'gn-line');
    line.appendChild(el('span', 'gn-mark', '❯'));
    ui.input = el('textarea', 'gn-input');
    ui.input.rows = 1;
    ui.input.spellcheck = false;
    ui.input.placeholder = GT_T('none.placeholder');
    line.appendChild(ui.input);
    ui.mode = el('span', 'gn-mode', '');
    line.appendChild(ui.mode);
    ui.bar.appendChild(ui.suggest);
    ui.bar.appendChild(line);
    ui.dock.appendChild(ui.out);
    ui.dock.appendChild(ui.bar);
    root.appendChild(ui.dock);

    shadow.appendChild(root);
  }

  function applyConfig(cfg) {
    if (!varStyle) return;
    // 색은 터미널의 기본 팔레트를 쓴다. 원본은 라이트 모드일 수 있어서(실측: html.light)
    // 우리 위젯은 자기 배경을 칠해 어느 쪽에서도 읽히게 한다.
    varStyle.textContent = GT.theme.vars({ ...cfg, 'terminal.theme': 'modern-dark' });
  }

  function drawLog() {
    if (!ui.out) return;
    ui.out.textContent = '';
    log.forEach((rec) => {
      const row = el('div', 'gt-sys');
      row.dataset.level = rec.level;
      row.appendChild(el('span', 'gt-sys-tag', `[${rec.level}]`));
      const b = el('span', 'gt-sys-body');
      if (rec.node) b.appendChild(rec.node); else b.textContent = rec.text;
      row.appendChild(b);
      ui.out.appendChild(row);
    });
    ui.out.hidden = log.length === 0;
    ui.out.scrollTop = ui.out.scrollHeight;
  }

  function system(level, text, node, opts) {
    if (opts && opts.quiet && GT.config.get('log') === false) {
      if (text) GT.log(`[${level}] ${text}`);
      return;
    }
    // 조용한 진단 줄(부팅 배너 등)은 원본 위에 띄울 만큼 중요하지 않다. 로그로만 남긴다.
    if (opts && opts.quiet && level === 'info') {
      if (text) GT.log(`[${level}] ${text}`);
      return;
    }
    log.push({ id: ++seq, level, text, node });
    if (log.length > 30) log.shift();
    drawLog();
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
    ui.suggest.appendChild(el('span', 'gt-suggest-hint', note || '⇥ 완성'));
    ui.suggest.hidden = false;
  }

  // 사이드바는 사용자가 직접 열었을 때만 원본 위에 띄운다.
  // 창이 넓으면 기본으로 펼치는 규칙(sidebar.minColumns)도, 저장된 sidebar.visible 도 따르지 않는다 —
  // 원본에 이미 대화 목록이 있고, 여기서 여닫는 것은 잠깐이다.
  function sidebarShown() {
    const st = GT.sidebar.state ? GT.sidebar.state() : {};
    return !!st.forcedOpen && !st.dismissed;
  }

  function syncSidebar() {
    if (!root || !ui.sidebarSlot) return;
    const want = sidebarShown();
    const attached = ui.sidebarSlot.parentElement === root;
    if (want && !attached) root.insertBefore(ui.sidebarSlot, ui.dock);
    else if (!want && attached) ui.sidebarSlot.remove();
  }

  function focus() { if (ui.input) ui.input.focus(); }

  GT.skins.register({
    id: 'none',
    covers: false,              // 원본을 가리지 않는다. 호스트는 클릭을 통과시킨다
    capturesTyping: false,      // 원본 컴포저에 치는 글자를 가로채지 않는다
    keys: { open: 'Semicolon', escapeHides: true },
    persistSidebar: false,      // 잠깐 여는 목록이다. 터미널의 sidebar.visible 을 건드리지 않는다
    // 고를 테마가 없다. 위젯 색은 터미널 기본 팔레트로 고정한다.
    get themes() { return { 'modern-dark': GT.theme.THEMES['modern-dark'] }; },
    defaultTheme: 'modern-dark',
    get configKeys() { return GT_SCHEMA.filter((f) => f.skin && GT_SKIN_HAS(f, 'none')).map((f) => f.key); },
    // 글씨 크기 · 테마는 원본이 정한다. :messup 은 스크롤백이 없어 끼울 자리가 없다.
    hiddenCommands: [':font', ':theme', ':messup'],

    get ui() { return ui; },    // 계약 밖
    get prompt() {
      return {
        el: ui.input || null,
        autosize() { const i = ui.input; if (!i) return; i.style.height = 'auto'; i.style.height = Math.min(i.scrollHeight, 160) + 'px'; }
      };
    },
    mount(cfg) { build(); applyConfig(cfg); return root; },
    destroy() {
      shadow = null; root = null; varStyle = null;
      Object.keys(ui).forEach((k) => { delete ui[k]; });
    },
    applyConfig,
    // 대화를 그리지 않는다 — 원본이 그린다
    render() {},
    renderChrome() {},
    tick() {},
    syncSidebar,
    sidebarShown,
    system,
    clearSystem() { const n = log.length; log.length = 0; drawLog(); return n; },
    local() { return 0; },
    clearLocal() { return 0; },
    setMode(m) { if (ui.mode) ui.mode.textContent = m === 'NORMAL' || m === 'INSERT' ? '' : m; },
    setSuggest,
    syncFocus() {},
    bell() {
      if (!ui.bar) return;
      ui.bar.dataset.bell = '1';
      setTimeout(() => { if (ui.bar) ui.bar.dataset.bell = '0'; }, 120);
    },
    focus,
    overlayRoot() { return root; }
  });
})();
