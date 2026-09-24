// gpt-skin — terminal 스킨. 상단바 · 스크롤백 · 입력줄을 shadow root 안에 전부 그린다.
// 원본 가리기와 호스트는 GT.cover, 입력 키 처리는 GT.prompt, 클립보드는 GT.clipboard 가 맡는다.
// 스킨 계약: src/content/shell/skin.js · docs/plan/2026-09-24-skin-architecture.md §2.2
(function () {
  'use strict';

  const el = (t, c, x) => { const n = document.createElement(t); if (c) n.className = c; if (x !== undefined) n.textContent = x; return n; };

  let host = null, shadow = null, root = null, varStyle = null;
  const ui = {};
  let mode = 'NORMAL';
  // key -> {el, sig, at}. 서명이 같으면 노드를 그대로 쓴다 —
  // 손대지 않은 블록에 걸린 선택이 살아남는 지점이다.
  const pool = new Map();
  let epoch = 0;
  // 회전자. 프레임을 한 곳에서 돌리고, 화면의 .gt-spin 노드를 제자리에서 갈아준다.
  // 스크롤백을 다시 그리면 선택이 깨지므로(2026-09-02 이슈) 렌더를 돌리지 않는다.
  const SPIN = ['⠋', '⠙', '⠹', '⠸', '⠼', '⠴', '⠦', '⠧', '⠇', '⠏'];
  let spinAt = 0;

  const systemLog = [];
  const localLog = [];        // 우리가 화면에만 끼워 넣은 블록 (:messup). 서버로 가지 않는다
  let localSeq = 0;
  let sysSeq = 0;

  function build() {
    ({ host, shadow } = GT.cover.host());

    const base = el('style'); base.textContent = GT.theme.CSS; shadow.appendChild(base);
    varStyle = el('style'); shadow.appendChild(varStyle);

    root = el('div', 'gt-root');

    // topbar
    const top = el('div', 'gt-topbar');

    // 대화 목록 손잡이. 원본의 햄버거 자리다.
    // 글리프 대신 그린다 — 폰트에 없는 문자에 기대지 않으려고.
    ui.burger = el('button', 'gt-burger');
    ui.burger.type = 'button';
    const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
    svg.setAttribute('viewBox', '0 0 14 14');
    svg.setAttribute('width', '14');
    svg.setAttribute('height', '14');
    svg.setAttribute('aria-hidden', 'true');
    [3, 7, 11].forEach((y) => {
      const line = document.createElementNS('http://www.w3.org/2000/svg', 'line');
      line.setAttribute('x1', '1.5'); line.setAttribute('x2', '12.5');
      line.setAttribute('y1', String(y)); line.setAttribute('y2', String(y));
      line.setAttribute('stroke', 'currentColor');
      line.setAttribute('stroke-width', '1.5');
      line.setAttribute('stroke-linecap', 'square');
      svg.appendChild(line);
    });
    ui.burger.appendChild(svg);
    ui.burger.addEventListener('click', (e) => { e.preventDefault(); GT.sidebar.toggle(); });
    top.appendChild(ui.burger);

    ui.dot = el('span', 'gt-dot');
    const brand = el('div'); brand.style.display = 'flex'; brand.style.alignItems = 'center'; brand.style.gap = '8px';
    brand.appendChild(ui.dot); brand.appendChild(el('span', 'gt-dim', 'gpt-skin'));
    ui.title = el('div', 'gt-title', '~');
    ui.model = el('span', null, ''); ui.model.style.color = 'var(--gt-magenta)';
    ui.effort = el('span', 'gt-dim gt-effort', '');
    ui.effort.title = '추론 수준 바꾸기';
    ui.effort.addEventListener('mousedown', (e) => {
      e.preventDefault(); e.stopPropagation();
      if (!GT.picker || !GT.picker.available() || GT.picker.pending) return;
      const st = GT.picker.effortChoices();
      popup(ui.effort, st.map((c) => ({
        label: c.label, hint: c.current ? '● 현재' : '', current: c.current,
        onPick: () => { if (!c.current) GT.picker.setEffort(c.index); }
      })));
    });
    ui.clock = el('span', 'gt-dim', '');
    const right = el('div'); right.style.display = 'flex'; right.style.gap = '14px'; right.style.alignItems = 'center';
    right.appendChild(ui.model); right.appendChild(ui.effort); right.appendChild(ui.clock);
    top.appendChild(brand); top.appendChild(ui.title); top.appendChild(right);
    root.appendChild(top);

    // tabbar — v1 은 현재 대화 하나만 보여준다
    ui.tabs = el('div', 'gt-tabbar');
    root.appendChild(ui.tabs);

    // 중간 행 = 사이드바 + 스크롤백. 탭바·입력·상태줄은 전체 폭을 유지한다.
    ui.middle = el('div', 'gt-middle');
    ui.sidebarSlot = GT.sidebar.build();
    ui.middle.appendChild(ui.sidebarSlot);
    ui.scroll = el('div', 'gt-scroll');
    ui.middle.appendChild(ui.scroll);
    root.appendChild(ui.middle);

    // composer
    const comp = el('div', 'gt-composer');
    ui.suggest = el('div', 'gt-suggest');
    ui.suggest.hidden = true;
    comp.appendChild(ui.suggest);
    ui.compMeta = el('div', 'gt-composer-meta');
    const row = el('div', 'gt-composer-row');
    ui.mark = el('span', 'gt-prompt-mark', '❯');
    ui.input = el('textarea', 'gt-input');
    ui.input.rows = 1;
    ui.input.placeholder = '메시지 또는 명령 (:help)';
    ui.input.spellcheck = false;
    ui.cursor = cursorEl();
    row.appendChild(ui.mark); row.appendChild(ui.input); row.appendChild(ui.cursor);
    ui.cursor.dataset.focus = '0';        // 켜자마자 깜빡이지 않는다. 포커스가 오면 켠다
    ui.input.addEventListener('focus', syncCursorFocus);
    ui.input.addEventListener('blur', syncCursorFocus);
    comp.appendChild(ui.compMeta); comp.appendChild(row);
    root.appendChild(comp);

    // statusline
    const st = el('div', 'gt-status');
    ui.mode = el('span', 'gt-mode', 'NORMAL');
    ui.stat1 = el('span', 'gt-status-seg', '');
    ui.stat2 = el('span', 'gt-status-seg', '');
    // 로그가 켜졌는지 꺼졌는지 화면 어디에도 없어서 알 수가 없었다.
    ui.stat3 = el('span', 'gt-status-seg gt-log-state', '');
    ui.hint = el('span', 'gt-status-hint', '⌘K 팔레트   :help   esc·^C 중단');
    st.appendChild(ui.mode); st.appendChild(ui.stat1); st.appendChild(ui.stat2);
    st.appendChild(ui.stat3);
    st.appendChild(el('span', 'gt-spacer')); st.appendChild(ui.hint);
    root.appendChild(st);

    // 터미널 아무 데나 클릭하면 입력창이 잡힌다. 진짜 터미널이 그렇게 동작한다.
    // 다만 두 가지는 건드리지 않는다 —
    //   · 버튼·링크·다른 입력창을 눌렀을 때 (그쪽 일을 뺏으면 안 된다)
    //   · 드래그로 텍스트를 고른 직후 (포커스를 옮기면 선택이 날아간다)
    const CONTROLS = 'input, textarea, select, button, a, [contenteditable="true"]';
    const hit = (e) => (e.composedPath ? e.composedPath()[0] : e.target);
    const onControl = (el) => !!(el && el.closest && el.closest(CONTROLS));
    const picked = () => {
      const sel = shadow.getSelection ? shadow.getSelection() : document.getSelection();
      return sel ? String(sel).length : 0;
    };
    // 목록은 본문 위에 떠 있다. 바깥을 누르면 비켜난다 — 오버레이의 기본 동작이다.
    // 목록 자신·손잡이·메뉴·팔레트를 누른 것은 '바깥'이 아니다.
    const INSIDE_OVERLAY = '.gt-sidebar, .gt-burger, .gt-ctx, .gt-palette, .gt-scrim';

    // 안쪽인지는 composedPath 로 판단한다. closest 로 보면 안 된다 —
    // 누른 행이 그 사이에 DOM 에서 떨어져 나갔으면 조상이 끊겨 null 이 나오고,
    // 그러면 '바깥을 눌렀다' 로 잘못 읽는다.
    //
    // 실제로 그랬다: 선택 모드에서 행을 누르면 togglePick 이 곧바로 목록을
    // 다시 그려(listEl.textContent = '') 누른 행이 사라지고, 뒤이어 올라온
    // 이 핸들러가 사이드바를 닫아 버렸다.
    //
    // composedPath 는 이벤트가 났을 때의 경로라 노드가 떨어져도 그대로 남는다.
    const insideOverlay = (e) => {
      const path = (e.composedPath && e.composedPath()) || [];
      for (let i = 0; i < path.length; i += 1) {
        const n = path[i];
        if (n && n.nodeType === 1 && n.matches && n.matches(INSIDE_OVERLAY)) return true;
      }
      // composedPath 가 없는 환경에서는 예전처럼 본다
      const el = hit(e);
      return !!(el && el.closest && el.closest(INSIDE_OVERLAY));
    };

    root.addEventListener('mousedown', (e) => {
      if (e.button !== 0) return;
      if (!GT.sidebar || !GT.sidebar.isOpen || !GT.sidebar.isOpen()) return;
      if (insideOverlay(e)) return;
      GT.sidebar.dismiss();
    });

    root.addEventListener('mouseup', (e) => {
      if (e.button !== 0) return;
      if (onControl(hit(e))) return;
      if (picked()) return;
      focusInput();
    });

    shadow.appendChild(root);
    return root;
  }

  function applyConfig(cfg) {
    if (!varStyle) return;
    epoch += 1;              // 렌더 결과가 달라질 수 있다. 다음 렌더에서 전부 다시 만든다
    varStyle.textContent = GT.theme.vars(cfg);
    syncSidebar();
    root.classList.toggle('gt-scanlines', !!cfg.scanlines);
    dressCursor(ui.cursor);
    syncCursorFocus();
  }

  // 커서는 세 군데에 뜬다 — 입력줄, 스트리밍 본문 끝, '생각 중' 줄.
  // 셋이 같아야 하는데 본문 쪽에는 속성을 안 붙여서 모양·깜빡임 설정이 먹지 않았다.
  // 만드는 자리를 하나로 모은다.
  function dressCursor(n) {
    if (!n) return n;
    n.dataset.style = GT.config.get('cursor.style');
    n.dataset.blink = GT.config.get('cursor.blink') ? '1' : '0';
    return n;
  }

  const cursorEl = () => dressCursor(el('span', 'gt-cursor'));

  // 입력줄 커서는 '지금 여기 치면 들어간다' 는 표시다. 포커스가 없으면
  // 사실이 아니므로 깜빡이지 않는다. 창이 뒤로 가 있을 때도 마찬가지다 —
  // 진짜 터미널이 그렇게 동작한다.
  function syncCursorFocus() {
    if (!ui.cursor || !ui.input) return;
    const here = document.activeElement === host
      && shadow.activeElement === ui.input
      && document.hasFocus();
    ui.cursor.dataset.focus = here ? '1' : '0';
  }

  // 수확한 메시지는 at 이 null 이다 — 원본 DOM 이 시각을 노출하지 않는다.
  // 수확 시각을 대신 보여주면 "전부 46초 전"처럼 사실이 아닌 값이 찍힌다. 그럴 바엔 비운다.
  function stamp(at) {
    const cfg = GT.config.get('timestamps');
    if (cfg === 'off' || !at) return '';
    const d = new Date(at);
    if (cfg === 'absolute') return d.toLocaleTimeString('ko-KR', { hour12: false });
    const s = Math.round((Date.now() - at) / 1000);
    if (s < 60) return `${s}초 전`;
    if (s < 3600) return `${Math.round(s / 60)}분 전`;
    return d.toLocaleTimeString('ko-KR', { hour12: false });
  }

  function turnUser(m) {
    const wrap = el('div', 'gt-turn');
    const meta = el('div', 'gt-meta');
    const u = el('span', null, 'user@gpt'); u.style.color = 'var(--gt-green)';
    const p = el('span', null, GT.store.state.path); p.style.color = 'var(--gt-cyan)';
    meta.appendChild(u); meta.appendChild(p);
    meta.appendChild(el('span', 'gt-spacer'));
    meta.appendChild(el('span', 'gt-stamp', stamp(m.at)));
    const line = el('div', 'gt-user-line');
    line.appendChild(el('span', 'gt-prompt-mark', '❯'));
    const body = el('span'); body.style.whiteSpace = 'pre-wrap'; body.style.wordBreak = 'break-word';
    body.style.maxWidth = 'var(--gt-wrap)';
    body.textContent = m.text;
    line.appendChild(body);
    wrap.appendChild(meta); wrap.appendChild(line);
    return wrap;
  }

  function turnAssistant(m) {
    const wrap = el('div', 'gt-turn');
    const meta = el('div', 'gt-meta');
    const head = el('span');
    head.style.color = m.streaming ? 'var(--gt-cyan)' : 'var(--gt-magenta)';
    if (m.streaming) head.appendChild(el('span', 'gt-spin', SPIN[spinAt]));
    else head.appendChild(el('span', null, '⏺'));
    // 그림을 그린 메시지에는 model_slug 가 없다(실측: image_gen_title 만 있다).
    // 다른 메시지의 모델명을 물려주면 만들지 않은 모델 이름을 붙이는 셈이다.
    // 무엇인지만 밝힌다.
    const who = m.model || ((m.images || []).length ? 'image' : 'assistant');
    head.appendChild(document.createTextNode(` ${who}`));
    meta.appendChild(head);
    if (m.streaming) {
      meta.appendChild(el('span', 'gt-faint', '·'));
      meta.appendChild(el('span', 'gt-faint gt-elapsed', `${GT.store.elapsed().toFixed(1)}s`));
    }
    meta.appendChild(el('span', 'gt-spacer'));
    // 스트리밍 중에는 붙이지 않는다. 아직 안 끝난 본문을 복사하게 된다.
    if (!m.streaming && (m.text || '').trim()) {
      meta.appendChild(GT.markdown.copyBtn(() => m.text || '', '복사'));
    }
    meta.appendChild(el('span', 'gt-faint gt-stamp', stamp(m.at)));

    const shell = el('div', 'gt-assistant');
    // 추론 과정 자체는 원본이 본문으로 주지 않는다. 있었다는 사실만 한 줄로 남긴다.
    if (m.thinking) {
      const th = el('div', 'gt-thinking');
      th.appendChild(el('span', null, '⏵'));
      th.appendChild(el('span', null, `thinking ×${m.thinking}`));
      wrap.appendChild(th);
    }
    if (GT.config.get('gutter.markers')) {
      const g = el('span', 'gt-gutter');
      if (m.streaming) g.dataset.streaming = '1';
      shell.appendChild(g);
    }
    const body = el('div', 'gt-body');
    body.appendChild(GT.markdown.render(m.text || '', { refs: m.refs }));
    if (m.streaming) body.appendChild(cursorEl());

    (m.images || []).forEach((im) => body.appendChild(imageBox(im)));

    // tty 로 그릴 수 없는 파트는 자리표시자로 남긴다.
    // 이미지는 위에서 그렸으므로 여기서 또 세지 않는다 — 같은 것을 두 번 알린다.
    const drew = (m.images || []).length > 0;
    const nonText = (m.parts || []).filter((t) => t && t !== 'text' && !(drew && t === 'image'));
    if (nonText.length) {
      const ph = el('div', 'gt-placeholder');
      ph.appendChild(el('span', null, '▤'));
      ph.appendChild(el('span', 'gt-spacer'));
      ph.appendChild(el('span', null, `${nonText.join(', ')} — ^\` 로 원본에서 봅니다`));
      body.appendChild(ph);
    }

    shell.appendChild(body);
    wrap.appendChild(meta); wrap.appendChild(shell);
    return wrap;
  }

  // ------------------------------------------------------------------ 이미지
  //
  // 주소는 포인터를 한 번 더 물어봐야 나온다(서명 URL). 그래서 자리를 먼저 만들고
  // 주소가 오면 그 자리를 채운다 — 렌더를 기다리게 하면 스크롤백 전체가 멈춘다.
  //
  // docs/plan/2026-09-09-image-generation.md
  function imageBox(im) {
    const box = el('div', 'gt-img');
    const mode = GT.config.get('image');
    const label = `${im.mime || 'image'} ${im.w}×${im.h}`;
    const foot = (text) => {
      const f = el('div', 'gt-img-foot');
      f.appendChild(el('span', null, '▤'));
      f.appendChild(el('span', 'gt-spacer'));
      f.appendChild(el('span', null, text));
      return f;
    };

    if (mode === 'off') {
      box.appendChild(foot(GT_T('img.placeholder', label, GT.image.size(im.bytes) || '?')));
      return box;
    }

    // 이미 주소를 받아 둔 그림이면 '불러옵니다' 를 거치지 않는다.
    // 설정이 바뀌어 전체가 다시 그려질 때마다 깜빡이면 눈에 거슬린다.
    box.appendChild(foot(GT.image.peek(im.pointer) ? label : GT_T('img.loading')));
    fill(box, im, mode, label);
    return box;
  }

  // 자리를 채운다. 실패하면 자리표시자로 떨어진다 — 빈 칸을 남기지 않는다.
  function fill(box, im, mode, label) {
    // 이 박스가 그 사이 화면에서 밀려났어도 그냥 채운다. 붙지 않은 노드를 채우는 것은
    // 무해하고, isConnected 로 걸러내면 '아직 안 붙은 첫 렌더' 까지 함께 걸러진다.
    const done = (node, text) => {
      box.textContent = '';
      if (node) box.appendChild(node);
      const f = el('div', 'gt-img-foot');
      f.appendChild(el('span', null, '▤'));
      f.appendChild(el('span', 'gt-spacer'));
      f.appendChild(el('span', null, text));
      box.appendChild(f);
    };

    Promise.resolve(GT.image.resolve(im.pointer)).then((e) => {
      if (!e || !e.url) return done(null, GT_T('img.failed'));
      const cols = Number(GT.config.get('image.columns')) || 48;
      const name = e.name || label;
      const meta = `${name} · ${im.w}×${im.h}${e.bytes ? ' · ' + GT.image.size(e.bytes) : ''}`;

      const img = new Image();
      // 문자 블록은 canvas 로 픽셀을 읽어야 하고, 그러려면 CORS 를 켜고 받아야 한다.
      if (mode === 'blocks') img.crossOrigin = 'anonymous';
      img.alt = GT_T('img.alt');
      img.onload = () => {
        if (mode !== 'blocks') {
          img.className = 'gt-img-pic';
          img.style.width = `${cols}ch`;
          return done(img, meta);
        }
        let node = null;
        // getImageData 는 오리진이 어긋나면 던진다. 그때는 그림으로 떨어진다 —
        // 못 그리는 것보다 원본을 보여주는 편이 낫다.
        try { node = GT.image.blocks(img, cols); } catch (err) { GT.log('문자 블록 실패', err); }
        if (node) return done(node, meta);
        img.className = 'gt-img-pic';
        img.style.width = `${cols}ch`;
        done(img, meta);
      };
      img.onerror = () => done(null, GT_T('img.failed'));
      img.src = e.url;
    });
  }

  // 화면에만 있는 블록. 대화 기록이 아니라는 걸 메타줄에서 분명히 한다 —
  // 나중에 스크롤백을 되돌아볼 때 진짜 응답과 헷갈리면 안 된다.
  function turnLocal(rec) {
    const wrap = el('div', 'gt-turn gt-turn-local');
    const meta = el('div', 'gt-meta');
    const head = el('span', null, '⏺ local');
    head.style.color = 'var(--gt-yellow)';
    meta.appendChild(head);
    meta.appendChild(el('span', 'gt-faint', '·'));
    meta.appendChild(el('span', 'gt-faint', ':messup — 화면에만 있는 출력'));
    meta.appendChild(el('span', 'gt-spacer'));
    meta.appendChild(el('span', 'gt-faint gt-stamp', stamp(rec.at)));

    const shell = el('div', 'gt-assistant');
    const body = el('div', 'gt-body');
    body.appendChild(GT.markdown.render(rec.text || ''));
    shell.appendChild(body);
    wrap.appendChild(meta); wrap.appendChild(shell);
    return wrap;
  }

  // 본문이 오기 전, 추론이 도는 구간을 보여준다. 원본이 "생각 중…" 을 띄우는 자리다.
  // 서명에 경과 시각을 넣지 않는다 — 넣으면 매 틱 노드가 새로 만들어진다.
  function thinkingRow() {
    const wrap = el('div', 'gt-turn gt-turn-thinking');
    const row = el('div', 'gt-thinking-live');
    row.appendChild(el('span', 'gt-spin', SPIN[spinAt]));
    row.appendChild(el('span', 'gt-thinking-label', '생각 중'));
    row.appendChild(cursorEl());          // 답할 때 본문 끝에 뜨는 그 커서와 같은 것
    row.appendChild(el('span', 'gt-spacer'));
    row.appendChild(el('span', 'gt-faint gt-think-elapsed', `${GT.store.thinkingElapsed().toFixed(1)}s`));
    wrap.appendChild(row);
    return wrap;
  }

  // 그림을 만드는 동안. '생각 중' 과 같은 자리, 같은 회전자를 쓴다 —
  // 둘 다 '답이 나올 자리에서 기다리는 중' 이라는 같은 뜻이다.
  function drawingRow() {
    const wrap = el('div', 'gt-turn gt-turn-thinking');
    const row = el('div', 'gt-thinking-live');
    row.appendChild(el('span', 'gt-spin', SPIN[spinAt]));
    row.appendChild(el('span', 'gt-thinking-label', GT_T('img.drawing')));
    row.appendChild(cursorEl());
    row.appendChild(el('span', 'gt-spacer'));
    row.appendChild(el('span', 'gt-faint gt-think-elapsed', `${GT.store.drawingElapsed().toFixed(1)}s`));
    wrap.appendChild(row);
    return wrap;
  }

  function systemRow(rec) {
    const row = el('div', 'gt-sys');
    row.dataset.level = rec.level;
    row.appendChild(el('span', 'gt-sys-tag', `[${rec.level}]`));
    const b = el('span', 'gt-sys-body');
    if (rec.node) b.appendChild(rec.node); else b.textContent = rec.text;
    row.appendChild(b);
    return row;
  }

  let stickBottom = true;

  // 스크롤백은 바뀐 것만 갈아끼운다.
  // 통째로 다시 그리면 선택 앵커가 사라진다 (docs/issue/2026-09-02-…).
  function renderScrollback() {
    const s = GT.store.state;
    const ctx = { epoch, path: s.path };

    const next = [];

    // id 가 없다고 건너뛰면 그 메시지가 화면에서 조용히 사라진다.
    // 위치 기반 키로라도 반드시 그린다.
    const byKey = new Map();
    const keys = s.messages.map((m, i) => {
      const key = m.id ? 'm:' + m.id : 'i:' + i;
      byKey.set(key, m);
      return key;
    });

    // :messup 블록을 제자리에 끼운다. 순서 규칙은 renderplan 이 갖는다.
    GT.renderplan.interleave(keys, localLog).forEach((slot) => {
      if (slot.local) {
        const r = slot.local;
        next.push({ key: 'l:' + r.id, sig: JSON.stringify(['local', r.id, epoch]), local: r });
        return;
      }
      const m = byKey.get(slot.key);
      next.push({ key: slot.key, sig: GT.renderplan.signature(m, ctx), m });
    });

    systemLog.forEach((rec) => {
      next.push({ key: 's:' + rec.id, sig: JSON.stringify(['sys', rec.id, epoch]), rec });
    });

    // '생각 중' 은 항상 맨 아래다. 답이 나올 자리이기 때문이다.
    if (GT.store.isThinking()) {
      next.push({ key: 'thinking', sig: JSON.stringify(['thinking', epoch]), thinking: true });
    }
    // 그림을 만드는 중. 같은 자리에 대신 뜬다 — isThinking 이 이미 비켜 준다.
    if (GT.store.isDrawing()) {
      next.push({ key: 'drawing', sig: JSON.stringify(['drawing', epoch]), drawing: true });
    }

    const prev = [...pool.entries()].map(([key, v]) => ({ key, sig: v.sig }));
    const plan = GT.renderplan.reconcile(prev, next);
    if (GT.renderplan.unchanged(plan, prev)) return false;

    plan.remove.forEach((key) => {
      const rec = pool.get(key);
      if (rec && rec.el.parentElement) rec.el.remove();
      pool.delete(key);
    });

    next.forEach((n, i) => {
      let rec = pool.get(n.key);
      if (!rec || rec.sig !== n.sig) {
        const node = n.m
          ? (n.m.role === 'user' ? turnUser(n.m) : turnAssistant(n.m))
          : (n.thinking ? thinkingRow()
            : (n.drawing ? drawingRow()
              : (n.local ? turnLocal(n.local) : systemRow(n.rec))));
        if (rec && rec.el.parentElement) rec.el.remove();
        rec = { el: node, sig: n.sig, at: n.m ? n.m.at : null };
        pool.set(n.key, rec);
      }
      const cur = ui.scroll.children[i];
      if (cur !== rec.el) ui.scroll.insertBefore(rec.el, cur || null);
    });

    while (ui.scroll.children.length > next.length) ui.scroll.lastElementChild.remove();
    return true;
  }

  // 시각과 경과시간은 노드를 갈아끼우지 않고 자리에서 고친다.
  // 서명에 넣으면 1분마다 블록이 교체되어 선택을 다시 깨뜨린다.
  function refreshTimes() {
    pool.forEach((rec) => {
      if (rec.at == null) return;
      const st = rec.el.querySelector('.gt-stamp');
      if (st) { const v = stamp(rec.at); if (st.textContent !== v) st.textContent = v; }
    });
    if (GT.store.state.streamingId) {
      const rec = pool.get('m:' + GT.store.state.streamingId);
      const e = rec && rec.el.querySelector('.gt-elapsed');
      if (e) e.textContent = `${GT.store.elapsed().toFixed(1)}s`;
    }
  }

  // 회전자만 돌린다. 렌더를 돌리지 않으므로 선택도, 스크롤도 건드리지 않는다.
  // 돌 게 없으면 DOM 을 훑지도 않는다 — 이 틱은 초당 열한 번 돈다.
  function tickSpin() {
    if (!root || !shadow) return;
    const s = GT.store.state;
    const drawing = GT.store.isDrawing();
    if (!s.streamingId && !GT.store.isThinking() && !drawing) return;
    spinAt = (spinAt + 1) % SPIN.length;
    const f = SPIN[spinAt];
    shadow.querySelectorAll('.gt-spin').forEach((n) => { n.textContent = f; });
    const t = shadow.querySelector('.gt-think-elapsed');
    if (t) {
      const sec = drawing ? GT.store.drawingElapsed() : GT.store.thinkingElapsed();
      t.textContent = `${sec.toFixed(1)}s`;
    }
  }

  // 상단바·탭·입력줄 메타·상태줄. 싸므로 매 틱 돌아도 된다.
  function renderChrome() {
    if (!root) return;
    const s = GT.store.state;
    refreshTimes();

    // chrome
    ui.title.textContent = `${s.path}${s.conversationTitle ? ' — ' + s.conversationTitle : ''}`;
    const last = [...s.messages].reverse().find((m) => m.model);
    ui.model.textContent = last ? last.model : '';
    // 추론 수준. 원본 pill 의 라벨이 정본이라 메뉴를 열지 않고 읽는다.
    // 바꾸는 중에는 스크롤백에 글을 남기는 대신 여기에 상태로 보여준다.
    if (GT.picker && GT.picker.available()) {
      const p = GT.picker.pending;
      const label = GT.picker.effortLabel();
      ui.effort.textContent = p ? `· ⠴ ${p.from || ''} →` : (label ? '· ' + label : '');
      ui.effort.dataset.pending = p ? '1' : '0';
    } else {
      ui.effort.textContent = '';
      ui.effort.dataset.pending = '0';
    }
    ui.clock.textContent = new Date().toLocaleTimeString('ko-KR', { hour12: false, hour: '2-digit', minute: '2-digit' });

    ui.tabs.textContent = '';
    const tab = el('div', 'gt-tab'); tab.dataset.active = '1';
    tab.appendChild(el('span', null, '1'));
    tab.appendChild(el('span', null, s.conversationTitle || 'new'));
    if (s.streamingId) { const d = el('span', null, '⠴'); d.style.color = 'var(--gt-cyan)'; tab.appendChild(d); }
    ui.tabs.appendChild(tab);
    ui.tabs.appendChild(el('span', 'gt-spacer'));
    const plus = el('div', 'gt-tab', '+ :new'); ui.tabs.appendChild(plus);

    ui.compMeta.textContent = '';
    const g = el('span', null, 'user@gpt'); g.style.color = 'var(--gt-green)';
    const c = el('span', null, s.path); c.style.color = 'var(--gt-cyan)';
    ui.compMeta.appendChild(g); ui.compMeta.appendChild(c);
    if (ui.model.textContent) {
      const mm = el('span', null, `(${ui.model.textContent})`); mm.style.color = 'var(--gt-magenta)';
      ui.compMeta.appendChild(mm);
    }

    ui.stat1.textContent = `msg ${s.messages.length}`;
    ui.stat2.textContent = `~${(GT.store.approxChars() / 1000).toFixed(1)}k chars`;
    const logOn = GT.config.get('log') !== false;
    const buffered = typeof GT.logCount === 'function' ? GT.logCount() : 0;
    ui.stat3.textContent = `log ${logOn ? 'on' : 'off'}${buffered ? ' (' + buffered + ')' : ''}`;
    ui.stat3.dataset.on = logOn ? '1' : '0';
    ui.dot.dataset.state = s.streamingId ? 'stream' : 'ok';
    refreshChrome();
    setMode(s.streamingId ? 'STREAM' : mode === 'STREAM' ? 'NORMAL' : mode);

  }

  function render() {
    if (!root) return;
    stickBottom = ui.scroll.scrollTop + ui.scroll.clientHeight >= ui.scroll.scrollHeight - 40;
    const changed = renderScrollback();
    renderChrome();
    if (changed && stickBottom) ui.scroll.scrollTop = ui.scroll.scrollHeight;
  }

  // 설정과 창 폭에 따라 사이드바를 붙이거나 뗀다.
  function syncSidebar() {
    if (!ui.middle || !ui.sidebarSlot) return;
    refreshChrome();
    const want = GT.sidebar.shouldShow();
    const attached = ui.sidebarSlot.parentElement === ui.middle;
    if (want && !attached) ui.middle.insertBefore(ui.sidebarSlot, ui.scroll);
    else if (!want && attached) ui.sidebarSlot.remove();
  }

  // 손잡이의 눌림 상태와 툴팁을 현재 사이드바 상태에 맞춘다.
  function refreshChrome() {
    if (!ui.burger) return;
    const open = GT.sidebar && GT.sidebar.isOpen ? GT.sidebar.isOpen() : false;
    ui.burger.dataset.open = open ? '1' : '0';
    ui.burger.title = open ? '대화 목록 접기 (^B)' : '대화 목록 펼치기 (^B)';
    ui.burger.setAttribute('aria-label', ui.burger.title);
    ui.burger.setAttribute('aria-expanded', open ? 'true' : 'false');
  }

  // 작은 선택 팝업. 사이드바 컨텍스트 메뉴와 같은 모양을 쓴다.
  let popupEl = null;
  function closePopup() { if (popupEl) { popupEl.remove(); popupEl = null; } }

  function popup(anchor, rows) {
    closePopup();
    if (!root) return;
    const box = el('div', 'gt-ctx');
    const a = anchor.getBoundingClientRect();
    const host = root.getBoundingClientRect();
    box.style.top = Math.round(a.bottom - host.top + 4) + 'px';
    // 오른쪽 끝에 붙은 앵커라 오른쪽 정렬이 자연스럽다
    box.style.right = Math.round(host.right - a.right) + 'px';

    rows.forEach((r) => {
      const it = el('div', 'gt-ctx-item');
      it.appendChild(el('span', null, r.label));
      if (r.hint) { const h = el('span', 'gt-ctx-hint', r.hint); it.appendChild(h); }
      if (r.current) it.dataset.current = '1';
      it.addEventListener('mousedown', (e) => {
        e.preventDefault(); e.stopPropagation();
        closePopup();
        try { r.onPick(); } catch (err) { system('error', String(err.message || err)); }
      });
      box.appendChild(it);
    });

    root.appendChild(box);
    popupEl = box;
    setTimeout(() => {
      const away = (e) => {
        const t = e.composedPath ? e.composedPath()[0] : e.target;
        if (popupEl && !popupEl.contains(t)) { closePopup(); shadow.removeEventListener('mousedown', away, true); }
      };
      shadow.addEventListener('mousedown', away, true);
    }, 0);
  }

  // 입력줄 위 제안 행. 명령을 치는 동안 후보를 보여준다.
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

  function focusInput() { if (ui.input) ui.input.focus(); }

  function setMode(m) {
    mode = m;
    if (ui.mode) { ui.mode.textContent = m; ui.mode.dataset.mode = m; }
  }

  // opts.quiet — 사용자가 시킨 일의 결과가 아니라 우리가 알아서 남기는 줄.
  // 부팅 배너, 상태 알림, health 경고가 그렇다. :log off 면 화면에 올리지 않고
  // 진단 버퍼에만 남긴다(:log dump 로 볼 수 있다).
  //
  // 명령의 결과(:ls · :health · '이름 변경: …')는 quiet 이 아니다.
  // 사용자가 친 것에 답을 안 하면 터미널이 고장 난 것처럼 보인다.
  function system(level, text, node, opts) {
    if (opts && opts.quiet && GT.config.get('log') === false) {
      if (text) GT.log(`[${level}] ${text}`);
      return;
    }
    systemLog.push({ id: ++sysSeq, level, text, node });
    if (systemLog.length > 60) systemLog.shift();
    render();
  }

  // 시각 벨. 상태줄의 모드 표시를 잠깐 뒤집는다.
  function bell() {
    const m = ui.mode;
    if (!m) return;
    const prev = m.style.filter;
    m.style.filter = 'invert(1)';
    setTimeout(() => { m.style.filter = prev; }, 120);
  }

  GT.skins.register({
    id: 'terminal',
    covers: true,                 // 원본을 가리고 전체 화면을 쓴다
    capturesTyping: true,         // 아무 데서나 타이핑하면 입력줄로
    keys: { open: null, escapeHides: false },   // 여닫기는 Ctrl+` 하나
    get themes() { return GT.theme.THEMES; },
    defaultTheme: 'modern-dark',
    // 정본은 스키마의 skin: 'terminal' 표시다. 여기에 또 적으면 갈린다.
    get configKeys() { return GT_SCHEMA.filter((f) => f.skin === 'terminal').map((f) => f.key); },
    hiddenCommands: [],

    get ui() { return ui; },      // 계약 밖. 다른 모듈이 의존하면 안 된다 (test/skin.test.mjs 가 막는다)
    // 입력 위젯을 GT.prompt 에 넘긴다. 키 처리는 거기 있고, 여기는 위젯과 높이 규칙만 안다.
    get prompt() {
      return {
        el: ui.input || null,
        autosize() { const i = ui.input; if (!i) return; i.style.height = 'auto'; i.style.height = Math.min(i.scrollHeight, 240) + 'px'; }
      };
    },
    mount(cfg) { build(); applyConfig(cfg); return root; },
    // 확장이 다시 로드되면 이 스크립트는 고아가 된다. 호스트 제거는 GT.skin.destroy 가 cover 로 한다.
    destroy() {
      pool.clear();
      host = null; shadow = null; root = null;
    },
    applyConfig,
    render,
    renderChrome,
    tick: tickSpin,
    syncSidebar,
    system,
    clearSystem() { const n = systemLog.length; systemLog.length = 0; render(); return n; },
    // 화면에만 끼워 넣는 블록. 지금 마지막 메시지를 앵커로 잡는다.
    local(text) {
      const s = GT.store.state;
      const last = s.messages.length - 1;
      const m = last >= 0 ? s.messages[last] : null;
      const anchorKey = m ? (m.id ? 'm:' + m.id : 'i:' + last) : '';
      localLog.push({ id: ++localSeq, anchorKey, at: Date.now(), text: String(text == null ? '' : text) });
      render();
      return localLog.length;
    },
    clearLocal() { const n = localLog.length; localLog.length = 0; render(); return n; },
    setMode,
    setSuggest,
    syncFocus: syncCursorFocus,
    bell,
    focus: focusInput,
    // 사이드바 · 팔레트 · 메뉴가 붙는 자리
    overlayRoot() { return root; }
  });
})();
