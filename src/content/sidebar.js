// gpt-skin — 좌측 대화 목록 페인.
// 데이터는 GT.chats 가 준다. 여기는 그리기·선택·필터·키 처리만 한다.
GT.sidebar = (function () {
  'use strict';

  const el = (t, c, x) => { const n = document.createElement(t); if (c) n.className = c; if (x !== undefined) n.textContent = x; return n; };

  let root = null, listEl = null, footEl = null, filterEl = null;
  const COLLAPSED_KEY = 'sidebar.collapsed';

  let rows = [];          // flatten 결과
  let visibleRows = [];   // 필터 적용 후
  let sel = 0;
  let filtering = false;
  let query = '';
  let source = 'none';
  let total = 0;
  let loaded = 0;
  let hasMore = false;
  let loading = false;
  let collapsed = new Set();

  // 다중 선택. 원본에는 없는 기능이라 기본은 꺼져 있고, 메뉴나 :select 로 들어간다.
  let selecting = false;
  let selected = new Set();
  let armed = false;      // 삭제 확인 단계
  let busy = '';          // 진행 중 표시

  async function loadCollapsed() {
    try {
      const got = await chrome.storage.local.get(COLLAPSED_KEY);
      collapsed = new Set(got[COLLAPSED_KEY] || []);
    } catch (_) { collapsed = new Set(); }
  }

  async function saveCollapsed() {
    try { await chrome.storage.local.set({ [COLLAPSED_KEY]: [...collapsed] }); } catch (_) {}
  }

  async function toggleGroup(key) {
    const opening = collapsed.has(key);
    if (opening) collapsed.delete(key); else collapsed.add(key);
    saveCollapsed();
    rebuild();

    // 프로젝트를 처음 펼치면 그 안의 대화를 그때 읽어온다.
    // 첫 페이지(40개)에 안 걸린 프로젝트는 비어 보이기 때문이다.
    const gid = key.startsWith('p:') ? key.slice(2) : null;
    if (!opening || !gid || GT.chats.isProjectLoaded(gid)) return;
    busy = '프로젝트 읽는 중…'; draw();
    try { absorb(await GT.chats.loadProject(gid)); }
    catch (e) { GT.skin.current.system('warn', `프로젝트를 읽지 못했습니다: ${e.message}`); }
    busy = ''; draw();
  }

  const currentId = () => {
    const m = /^\/c\/([0-9a-f-]+)/.exec(location.pathname);
    return m ? m[1] : null;
  };

  function applyFilter() {
    if (!query) { visibleRows = rows; return; }
    const hits = [];
    rows.forEach((r) => {
      if (r.kind !== 'chat') return;
      const m = GT.palette.fuzzy ? GT.palette.fuzzy(query, r.title) : null;
      if (m) hits.push({ ...r, _hits: m.hits, _score: m.score });
    });
    hits.sort((a, b) => b._score - a._score);
    visibleRows = hits;
  }

  function chatRows() { return visibleRows.filter((r) => r.kind === 'chat'); }

  function draw() {
    if (!root) return;
    listEl.textContent = '';
    const cur = currentId();
    let chatIndex = -1;

    visibleRows.forEach((r) => {
      if (r.kind === 'header') {
        const h = el('div', 'gt-sb-head');
        h.appendChild(el('span', 'gt-sb-caret', r.collapsed ? '▸' : '▾'));
        h.appendChild(el('span', 'gt-sb-headlabel', r.label));
        h.appendChild(el('span', 'gt-sb-count', String(r.count)));
        h.addEventListener('mousedown', (e) => { e.preventDefault(); toggleGroup(r.key); });
        listEl.appendChild(h);
        return;
      }
      chatIndex += 1;
      const isSel = filtering && chatIndex === sel;
      const isCur = cur && r.id === cur;
      const row = el('div', 'gt-sb-row');
      if (isSel) row.dataset.sel = '1';
      if (isCur) row.dataset.cur = '1';
      if (selecting && selected.has(r.id)) row.dataset.checked = '1';
      if (selecting) {
        row.appendChild(el('span', 'gt-sb-check', selected.has(r.id) ? '[×]' : '[ ]'));
      } else {
        row.appendChild(el('span', 'gt-sb-mark', isCur ? '❯' : ' '));
      }
      const t = el('span', 'gt-sb-title');
      if (r._hits && GT.palette.highlight) t.appendChild(GT.palette.highlight(r.title, r._hits));
      else t.textContent = r.title;
      row.appendChild(t);
      if (r.pinned) row.appendChild(el('span', 'gt-sb-pin', '★'));
      if (!selecting) {
        const dots = el('span', 'gt-sb-dots', '⋯');
        dots.title = '대화 메뉴';
        dots.addEventListener('mousedown', (e) => { e.preventDefault(); e.stopPropagation(); menu(r, dots); });
        row.appendChild(dots);
        row.addEventListener('contextmenu', (e) => { e.preventDefault(); menu(r, row); });
      }
      row.addEventListener('mousedown', (e) => {
        e.preventDefault();
        if (selecting) { togglePick(r.id); return; }
        open(r);
      });
      listEl.appendChild(row);
    });

    if (!visibleRows.length) {
      const why = loading ? '읽는 중…'
        : source === 'none' ? '목록을 가져오지 못했습니다 — :health'
        : query ? '일치 없음'
        : '대화 없음';
      listEl.appendChild(el('div', 'gt-sb-empty', why));
    }

    // 검색은 이미 읽어온 것만 훑는다. 전부인 척하지 않는다.
    if (filtering && hasMore) {
      listEl.appendChild(el('div', 'gt-sb-note', `읽어온 ${loaded}개에서만 검색 중 (전체 ${total})`));
    }

    if (!filtering && hasMore) {
      const more = el('div', 'gt-sb-more');
      more.appendChild(el('span', null, loading ? '읽는 중…' : `… ${total - loaded}개 더`));
      if (!loading) more.appendChild(el('span', 'gt-sb-hint', '⏎'));
      more.addEventListener('mousedown', (e) => { e.preventDefault(); loadMore(); });
      listEl.appendChild(more);
    }

    footEl.textContent = '';
    if (selecting) { drawActions(); return; }
    const n = chatRows().length;
    footEl.appendChild(el('span', null, query ? `${n} / ${loaded}` : `${loaded} / ${total}`));
    footEl.appendChild(el('span', 'gt-spacer'));
    const src = el('span', 'gt-sb-src', source);
    if (source === 'cache') src.dataset.stale = '1';
    if (source === 'none') src.dataset.bad = '1';
    footEl.appendChild(src);

    filterEl.hidden = !filtering;
    if (filtering) filterEl.querySelector('input').value = query;
  }

  // 원본 사이드바의 "..." 에 해당한다. 동작은 백엔드를 직접 부른다(GT.convops).
  let menuEl = null;

  function closeMenu() {
    if (menuEl) { menuEl.remove(); menuEl = null; }
  }

  function menu(rec, anchor) {
    closeMenu();
    const box = el('div', 'gt-ctx');
    const rect = anchor.getBoundingClientRect();
    const host = GT.skin.current.overlayRoot().getBoundingClientRect();
    box.style.top = Math.round(rect.bottom - host.top + 2) + 'px';
    box.style.left = Math.round(rect.left - host.left) + 'px';

    const act = (label, fn, danger) => {
      const it = el('div', 'gt-ctx-item', label);
      if (danger) it.dataset.danger = '1';
      it.addEventListener('mousedown', async (e) => {
        e.preventDefault(); e.stopPropagation();
        closeMenu();
        try { await fn(); } catch (err) { GT.skin.current.system('error', `실패: ${err.message}`); }
      });
      box.appendChild(it);
      return it;
    };

    // 모달을 띄우지 않는다. 입력줄에 명령을 채워주고 편집하게 한다 — 터미널이 그렇게 동작한다.
    act('선택 모드', () => enterSelect(rec.id));

    act('이름 바꾸기', () => {
      GT.prompt.fill(`:rename @${rec.id.slice(0, 8)} ${rec.title}`);
      GT.skin.current.system('info', '이름을 고치고 Enter 를 누르세요');
    });

    act(rec.pinned ? '고정 해제' : '채팅 고정', async () => {
      await GT.convops.pin(rec.id, !rec.pinned);
      GT.skin.current.system('info', rec.pinned ? '고정을 해제했습니다' : '고정했습니다');
      await refresh();
    });

    act('아카이브에 보관', async () => {
      await GT.convops.archive(rec.id, true);
      GT.skin.current.system('info', `보관했습니다 — :archive ${rec.id.slice(0, 8)} off 로 되돌립니다`);
      if (currentId() === rec.id) GT.navigate.newChat();
      await refresh();
    });

    // 삭제는 되돌릴 수 없다. 한 번 더 누르게 한다.
    const del = act('삭제', () => {}, true);
    del.addEventListener('mousedown', (e) => {
      e.preventDefault(); e.stopPropagation();
      if (del.dataset.armed) return;
      del.dataset.armed = '1';
      del.textContent = '정말 삭제? 한 번 더';
      setTimeout(() => { if (del.isConnected) { del.dataset.armed = ''; del.textContent = '삭제'; } }, 4000);
      const once = async (ev) => {
        ev.preventDefault(); ev.stopPropagation();
        del.removeEventListener('mousedown', once);
        closeMenu();
        try {
          await GT.convops.remove(rec.id);
          GT.skin.current.system('warn', `삭제 요청: ${rec.title}`);
          if (currentId() === rec.id) GT.navigate.newChat();
          await refresh();
        } catch (err) { GT.skin.current.system('error', `삭제 실패: ${err.message}`); }
      };
      setTimeout(() => del.addEventListener('mousedown', once), 0);
    }, true);

    act('프로젝트로 이동', () => {
      GT.prompt.fill(`:mv ${rec.id.slice(0, 8)} `);
      GT.skin.current.system('info', '프로젝트 이름을 이어 쓰고 Enter 를 누르세요 (빼려면 none) — :mv 만 쳐도 목록이 나옵니다');
    });

    // 공유는 공개 링크를 만드는 동작이다. 우리 UI 에서 한 번 클릭으로 공개되면 안 된다.
    // 원본의 공유 대화상자를 띄워 ChatGPT 자신의 확인 절차를 거치게 한다.
    act('공유하기', () => GT.commands.run(`:share ${rec.id.slice(0, 8)}`));

    GT.skin.current.overlayRoot().appendChild(box);
    menuEl = box;
    setTimeout(() => {
      const away = (e) => {
        if (menuEl && !menuEl.contains(e.composedPath ? e.composedPath()[0] : e.target)) {
          closeMenu();
          GT.skin.current.overlayRoot().getRootNode().removeEventListener('mousedown', away, true);
        }
      };
      GT.skin.current.overlayRoot().getRootNode().addEventListener('mousedown', away, true);
    }, 0);
  }

  // ---------------------------------------------------------------- 다중 선택
  function togglePick(id) {
    if (selected.has(id)) selected.delete(id); else selected.add(id);
    armed = false;
    draw();
  }

  function enterSelect(seedId) {
    selecting = true; armed = false; busy = '';
    selected = new Set(seedId ? [seedId] : []);
    closeMenu(); draw();
  }

  function exitSelect() {
    selecting = false; armed = false; busy = '';
    selected.clear(); draw();
  }

  const pickedRecords = () => chatRows().filter((r) => selected.has(r.id));

  function drawActions() {
    const n = selected.size;
    if (busy) { footEl.appendChild(el('span', 'gt-sb-busy', busy)); return; }

    const act = (label, cls, fn) => {
      const b = el('span', 'gt-sb-act ' + (cls || ''), label);
      b.addEventListener('mousedown', (e) => { e.preventDefault(); e.stopPropagation(); fn(); });
      footEl.appendChild(b);
      return b;
    };

    if (armed) {
      footEl.appendChild(el('span', 'gt-sb-warn', `${n}개 · 되돌릴 수 없습니다`));
      footEl.appendChild(el('span', 'gt-spacer'));
      act('정말 삭제', 'danger', doRemove);
      act('취소', '', () => { armed = false; draw(); });
      return;
    }

    footEl.appendChild(el('span', null, `${n}개 선택`));
    footEl.appendChild(el('span', 'gt-spacer'));
    if (n) {
      act('삭제', 'danger', () => { armed = true; draw(); });
      act('보관', '', doArchive);
    }
    act('취소', '', exitSelect);
  }

  async function doArchive() {
    const recs = pickedRecords();
    if (!recs.length) return;
    busy = `보관 중 0/${recs.length}`; draw();
    let ok = 0; const bad = [];
    for (let i = 0; i < recs.length; i += 1) {
      try { await GT.convops.archive(recs[i].id, true); ok += 1; }
      catch (e) { bad.push(recs[i].title); }
      busy = `보관 중 ${i + 1}/${recs.length}`; draw();
    }
    GT.skin.current.system('info', `보관 ${ok}건${bad.length ? ` · 실패 ${bad.length}건: ${bad.join(', ')}` : ''}`);
    exitSelect();
    await refresh();
  }

  async function doRemove() {
    const recs = pickedRecords();
    if (!recs.length) return;

    // 무엇을 지웠는지 스크롤백에 남긴다. 되돌릴 수 없으니 기록이라도 있어야 한다.
    const listing = document.createDocumentFragment();
    listing.appendChild(el('div', null, `${recs.length}개를 삭제합니다 — 되돌릴 수 없습니다`));
    recs.forEach((r) => listing.appendChild(el('div', 'gt-dim', `  ${r.id.slice(0, 8)}  ${r.title}`)));
    GT.skin.current.system('warn', null, listing);

    busy = `삭제 중 0/${recs.length}`; draw();
    const res = await GT.convops.removeMany(recs.map((r) => r.id), (i, n) => { busy = `삭제 중 ${i}/${n}`; draw(); });

    const openId = currentId();
    GT.skin.current.system(res.failed.length ? 'warn' : 'info',
      `삭제 ${res.done.length}건${res.failed.length ? ` · 실패 ${res.failed.length}건` : ''}`);
    res.failed.forEach((f) => GT.skin.current.system('error', `  ${String(f.id).slice(0, 8)} — ${f.error}`));

    exitSelect();
    if (openId && res.done.includes(openId)) GT.navigate.newChat();
    await refresh();
  }

  function open(r) {
    if (!r || !r.href) return;
    exitFilter();
    if (GT.config.get('sidebar.closeOnOpen')) dismiss();
    GT.navigate.to(r.href);
  }

  function enterFilter() {
    filtering = true; sel = 0;
    draw();
    const inp = filterEl.querySelector('input');
    inp.value = query; inp.focus();
  }

  function exitFilter() {
    filtering = false; query = ''; sel = 0;
    applyFilter(); draw();
    GT.skin.current.focus();
  }

  function move(d) {
    const n = chatRows().length;
    if (!n) return;
    sel = Math.max(0, Math.min(n - 1, sel + d));
    draw();
  }

  function build() {
    root = el('div', 'gt-sidebar');

    const head = el('div', 'gt-sb-topline');
    head.appendChild(el('span', null, 'CHATS'));
    head.appendChild(el('span', 'gt-spacer'));
    head.appendChild(el('span', 'gt-sb-hint', '/ 검색'));
    const shut = el('span', 'gt-sb-close', '‹');
    shut.title = '목록 접기 (^B)';
    shut.addEventListener('mousedown', (e) => { e.preventDefault(); toggle(false); });
    head.appendChild(shut);
    root.appendChild(head);

    filterEl = el('div', 'gt-sb-filter');
    filterEl.hidden = true;
    const slash = el('span', null, '/');
    const inp = el('input');
    inp.spellcheck = false;
    inp.addEventListener('input', () => { query = inp.value.trim(); sel = 0; applyFilter(); draw(); });
    inp.addEventListener('keydown', (e) => {
      e.stopPropagation();
      if (e.key === 'Escape') { e.preventDefault(); exitFilter(); }
      else if (e.key === 'ArrowDown' || (e.ctrlKey && e.key === 'n')) { e.preventDefault(); move(1); }
      else if (e.key === 'ArrowUp' || (e.ctrlKey && e.key === 'p')) { e.preventDefault(); move(-1); }
      else if (e.key === 'Enter') { e.preventDefault(); open(chatRows()[sel]); }
    });
    filterEl.appendChild(slash); filterEl.appendChild(inp);
    root.appendChild(filterEl);

    listEl = el('div', 'gt-sb-list');
    root.appendChild(listEl);

    footEl = el('div', 'gt-sb-foot');
    root.appendChild(footEl);

    root.appendChild(resizeHandle());
    return root;
  }

  function absorb(g) {
    source = g.source;
    total = g.total;
    loaded = g.loaded != null ? g.loaded : g.total;
    hasMore = !!g.hasMore;
    rows = GT.chats.flatten(g, collapsed);
    applyFilter();
  }

  // 접힘 상태만 바뀌었을 때 — 다시 읽지 않고 다시 그린다.
  function rebuild() {
    absorb(GT.chats.state);
    draw();
  }

  // 오른쪽 가장자리를 끌어 폭을 바꾼다.
  // 설정은 ch 단위인데 드래그는 px 이므로, 실제 글자 폭을 재서 환산한다
  // (font-size × 0.6 같은 어림값은 폰트가 바뀌면 어긋난다).
  function charWidth() {
    const probe = el('span', null, '0'.repeat(20));
    probe.setAttribute('style', 'position:absolute;visibility:hidden;white-space:pre');
    root.appendChild(probe);
    const w = probe.getBoundingClientRect().width / 20;
    probe.remove();
    return w > 0 ? w : (Number(GT.config.get('font.size')) || 13) * 0.6;
  }

  function resizeHandle() {
    const h = el('div', 'gt-sb-resize');
    h.title = '드래그로 폭 조절 · 더블클릭으로 기본값';
    h.addEventListener('mousedown', (e) => {
      e.preventDefault(); e.stopPropagation();
      const cw = charWidth();
      const startX = e.clientX;
      const startW = root.getBoundingClientRect().width;
      const rootEl = GT.skin.current.overlayRoot();

      const move = (ev) => {
        const px = Math.max(cw * 16, Math.min(cw * 80, startW + (ev.clientX - startX)));
        rootEl.style.setProperty('--gt-sb-w', px + 'px');   // 끌리는 동안은 즉시 반영
      };
      const up = async (ev) => {
        window.removeEventListener('mousemove', move, true);
        window.removeEventListener('mouseup', up, true);
        const px = Math.max(cw * 16, Math.min(cw * 80, startW + (ev.clientX - startX)));
        rootEl.style.removeProperty('--gt-sb-w');           // 설정값이 다시 이기게 되돌린다
        await GT.config.set('sidebar.width', Math.round(px / cw));
        GT.skin.current.applyConfig(GT.config.all);
      };
      window.addEventListener('mousemove', move, true);
      window.addEventListener('mouseup', up, true);
    });
    h.addEventListener('dblclick', async (e) => {
      e.preventDefault();
      await GT.config.reset('sidebar.width');
      GT.skin.current.applyConfig(GT.config.all);
    });
    return h;
  }

  async function refresh() {
    if (!collapsed.size) await loadCollapsed();
    loading = true; draw();
    const g = await GT.chats.load();
    loading = false;
    absorb(g);
    draw();
    return g;
  }

  async function loadMore() {
    if (loading || !hasMore) return;
    loading = true; draw();
    const g = await GT.chats.more();
    loading = false;
    absorb(g);
    draw();
    return g;
  }

  // 목록은 본문 위에 덮이므로 본문이 좁아지지는 않는다.
  // 다만 창이 좁으면 목록이 화면 대부분을 가리므로 처음에는 접어둔다.
  // 사용자가 손잡이를 눌러 직접 켠 경우에는 폭 규칙보다 그 의사를 우선한다.
  let forcedOpen = false;

  // 대화를 고르면 목록이 비켜난다(원본과 같다). 설정을 끄는 게 아니라 이번만 물러난다 —
  // config 를 건드리면 다음에 열 때도 안 나온다.
  let dismissed = false;

  function shouldShow() {
    if (!GT.config.get('sidebar.visible')) return false;
    if (dismissed) return false;
    if (forcedOpen) return true;
    const min = Number(GT.config.get('sidebar.minColumns')) || 0;
    if (!min) return true;
    const size = Number(GT.config.get('font.size')) || 13;
    const cols = Math.floor(window.innerWidth / (size * 0.6));
    return cols >= min;
  }

  // 이번만 물러난다. 설정은 그대로 둔다.
  function dismiss() {
    if (!isOpen()) return false;
    dismissed = true;
    forcedOpen = false;
    GT.skin.current.syncSidebar();
    return true;
  }

  // 켜고 끄는 유일한 경로. 햄버거 손잡이 · Ctrl+B · :sidebar 가 모두 여기로 온다.
  async function toggle(force) {
    // DOM 부착 여부가 아니라 '보여야 하는가'로 뒤집는다.
    // 비켜난 상태(config 는 켜짐, 화면엔 없음)나 폭 때문에 접힌 상태에서
    // ≡ 를 누르면 열려야 한다. DOM 에 기대면 마운트 타이밍에 흔들린다.
    // '보여야 하는가' 는 스킨이 답한다. none 은 창 폭 규칙을 따르지 않으므로 shouldShow() 로
    // 뒤집으면 보이지 않는 목록을 '닫는' 것이 된다 — 첫 Ctrl+B 가 아무 일도 안 하던 원인이다.
    // docs/issue/2026-09-24-none-ctrl-b-closes-hidden-sidebar.md
    const skin = GT.skin.current;
    const now = skin && skin.sidebarShown ? skin.sidebarShown() : shouldShow();
    const next = force === undefined ? !now : !!force;
    dismissed = false;
    forcedOpen = next;
    if (!skin || skin.persistSidebar !== false) await GT.config.set('sidebar.visible', next);
    GT.skin.current.syncSidebar();
    if (next) await refresh();
    return next;
  }

  const isOpen = () => !!root && root.isConnected;

  return {
    build, refresh, loadMore, rebuild, draw, shouldShow, toggle, isOpen, closeMenu,
    chats: () => rows.filter((r) => r.kind === 'chat'),
    enterSelect, exitSelect, dismiss,
    state: () => ({
      visible: GT.config.get('sidebar.visible'),
      closeOnOpen: GT.config.get('sidebar.closeOnOpen'),
      dismissed, forcedOpen, selecting,
      attached: isOpen(), rows: chatRows().length, source
    }),
    get selecting() { return selecting; },
    enterFilter, exitFilter, toggleGroup,
    get hasMore() { return hasMore; },
    get filtering() { return filtering; },
    get element() { return root; },
    get source() { return source; }
  };
})();
