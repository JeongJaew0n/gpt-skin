// gpt-skin — 스킨 레지스트리와 현재 스킨.
// skin = ChatGPT 웹 위에 씌우는 UI 의 종류. core 와 shell 은 GT.skin.current 만 부른다.
// docs/plan/2026-09-24-skin-architecture.md §2.2 · §2.3
//
// 스킨은 skins/<id>.js 에서 GT.skins.register({...}) 로 스스로 등록한다.
// 계약의 키가 하나라도 빠지면 등록을 거부한다 — 없는 채로 부팅되면 그 메서드를 처음
// 부르는 순간(대개 명령을 칠 때) 죽는다. 이 스킨에서 할 일이 없는 메서드는 빈 함수로 둔다.
GT.skins = (function () {
  'use strict';

  // 값. 화면에 보일 이름은 여기 없다 — i18n 사전의 opt.skin.choice.<id> 가 정본이다.
  // keys: { open, escapeHides } — open 은 스킨이 숨어 있을 때 여는 키의 e.code (없으면 null),
  //   escapeHides 는 빈 입력줄에서 esc 가 스킨을 숨기는가. 키 처리 자체는 GT.prompt 가 한다.
  // persistSidebar: 이 스킨에서 대화 목록을 여닫은 것을 sidebar.visible 에 저장하는가.
  //   none 은 저장하지 않는다 — 원본에 목록이 있어 잠깐 여는 것일 뿐이고, 터미널의 설정을 건드리면 안 된다.
  const FIELDS = ['id', 'covers', 'capturesTyping', 'keys', 'persistSidebar', 'themes', 'defaultTheme', 'configKeys', 'hiddenCommands'];
  // 함수
  const METHODS = [
    'mount', 'destroy', 'applyConfig',                    // 생명주기
    'render', 'renderChrome', 'tick', 'syncSidebar',      // 자료 → 화면
    'sidebarShown',                                       // 대화 목록이 지금 이 스킨에서 보여야 하는가
    'system', 'clearSystem', 'local', 'clearLocal',       // 시스템 출력
    'setMode', 'setSuggest', 'syncFocus', 'bell',         // 상태 표시
    'focus', 'overlayRoot'                                // 입력 · 오버레이 자리
  ];
  // prompt 는 { el, autosize } 를 돌려주는 getter 다 (mount 전에는 el 이 null)

  const defs = new Map();

  function missing(def) {
    const out = [];
    FIELDS.forEach((k) => { if (def[k] === undefined) out.push(k); });
    METHODS.forEach((k) => { if (typeof def[k] !== 'function') out.push(k + '()'); });
    if (!('prompt' in def)) out.push('prompt');
    return out;
  }

  function register(def) {
    const lack = missing(def || {});
    if (lack.length) throw new Error(`[gpt-skin] 스킨 '${def && def.id}' 이 계약을 채우지 않았습니다: ${lack.join(', ')}`);
    if (defs.has(def.id)) throw new Error(`[gpt-skin] 스킨 '${def.id}' 가 두 번 등록됐습니다`);
    defs.set(def.id, def);
    return def;
  }

  return {
    FIELDS, METHODS,
    register,
    missing,
    get: (id) => defs.get(id) || null,
    names: () => Array.from(defs.keys()),
    label: (id) => GT_T('opt.skin.choice.' + id)
  };
})();

GT.skin = (function () {
  'use strict';

  let cur = null;
  const DEFAULT = 'terminal';

  // 포커스가 우리 호스트 안에 있는가. 스킨을 숨기거나 해체하면 그 요소가 사라져
  // 포커스가 문서 본문(BODY)으로 빠진다 — 그때 무엇을 쳐도 어디에도 안 들어간다.
  // 실측 2026-09-24: :skin none 직후와 Ctrl+; 로 닫은 직후 activeElement = BODY.
  // docs/issue/2026-09-24-none-ctrl-b-closes-hidden-sidebar.md
  const focusInHost = () => {
    try { const a = document.activeElement; return !!a && a.id === GT.cover.HOST_ID; } catch (_) { return false; }
  };
  // 원본 컴포저로 돌려준다. 원본이 보이는 상태에서만 부른다.
  const giveBack = () => {
    try { const c = GT.compose && GT.compose.composer && GT.compose.composer(); if (c) c.focus(); } catch (_) {}
  };

  // 부팅 때 설정으로 고른다. 모르는 이름이면 기본 스킨으로 간다.
  function use(id) {
    cur = GT.skins.get(id) || GT.skins.get(DEFAULT);
    return cur;
  }

  return {
    DEFAULT,
    // use() 전에도 비어 있지 않게 기본 스킨을 준다 — 부팅 점검이 system() 을 먼저 부를 수 있다.
    get current() { return cur || GT.skins.get(DEFAULT); },
    use,
    mount(cfg) {
      const s = this.current;
      GT.cover.apply(s.covers);
      return s.mount(cfg);
    },
    // 확장이 다시 로드되면 흔적 없이 물러난다.
    destroy() {
      try { this.current.destroy(); } finally { GT.cover.remove(); }
    },
    // 입력 컨트롤러를 지금 스킨의 위젯에 붙인다. 스킨이 바뀔 때마다 다시 부른다.
    attachPrompt() {
      const s = this.current;
      GT.prompt.attach(s.prompt, {
        toggle: () => this.toggle(),
        capturesTyping: s.capturesTyping,
        openCode: (s.keys && s.keys.open) || null,
        escapeHides: !!(s.keys && s.keys.escapeHides)
      });
    },
    // 스킨을 바꾼다. store 는 건드리지 않는다 — 대화 내용은 껍데기와 무관하다.
    // 실패하면 이전 스킨으로 되돌리고 오류를 돌려준다.
    // docs/plan/2026-09-24-skin-architecture.md §2.3
    async switch(id, opts) {
      const persist = !opts || opts.persist !== false;
      const next = GT.skins.get(id);
      if (!next) return { ok: false, reason: 'unknown' };
      const prev = this.current;
      if (next === prev) return { ok: true, same: true };
      const wasVisible = this.visible();
      const hadFocus = focusInHost();
      const mountOne = (s) => {
        cur = s;
        GT.cover.apply(s.covers);
        s.mount(GT.config.all);
        if (GT.prompt.attached !== undefined) this.attachPrompt();
        s.syncSidebar();
        // 스킨이 사이드바를 새로 만든다. 목록이 비어 있으면 다시 불러온다 — 그리기만 하면
        // '목록을 가져오지 못했습니다' 가 뜬다 (하네스 실측: sheet → terminal).
        if (GT.sidebar && GT.sidebar.element && GT.sidebar.element.isConnected) {
          const empty = !GT.sidebar.chats || GT.sidebar.chats().length === 0;
          if (empty && GT.sidebar.refresh) GT.sidebar.refresh(); else GT.sidebar.draw();
        }
        s.render();
        s.renderChrome();
        if (GT.store && GT.store.isStreaming && GT.store.isStreaming()) s.setMode('STREAM');
      };
      // 열려 있던 오버레이는 옮기지 않는다
      try { if (GT.palette && GT.palette.isOpen && GT.palette.isOpen()) GT.palette.close(); } catch (_) {}
      try { if (GT.sidebar && GT.sidebar.closeMenu) GT.sidebar.closeMenu(); } catch (_) {}
      try { GT.prompt.detach(); } catch (_) {}
      try { prev.destroy(); } catch (_) {}
      try {
        mountOne(next);
      } catch (e) {
        try { next.destroy(); } catch (_) {}
        mountOne(prev);
        if (wasVisible) GT.cover.on(); else GT.cover.off();
        return { ok: false, reason: String((e && e.message) || e) };
      }
      // 원본을 가리지 않는 스킨은 닫힌 채로 시작한다. 이전 스킨이 보이던 상태를 넘기면
      // 명령줄이 열린 채로 떠서 스킨이 바뀐 게 아니라 무언가 열린 것처럼 보인다 (사용자 보고 2026-09-24).
      if (next.covers && wasVisible) this.show();
      else { GT.cover.off(); if (hadFocus) giveBack(); }
      if (persist) await GT.config.set('skin', id);
      GT.sendToSW({ kind: 'visible', visible: this.visible() });
      return { ok: true };
    },
    show() { GT.cover.on(); this.current.focus(); },
    hide() {
      const had = focusInHost();
      GT.cover.off();
      if (had) giveBack();
    },
    visible() { return GT.cover.isOn(); },
    // Ctrl+` · 툴바 버튼. 원본으로 복귀한 상태(degraded)에서는 다시 켜지 않는다.
    toggle() {
      if (GT.health.degraded) return this.visible();
      this.visible() ? this.hide() : this.show();
      GT.sendToSW({ kind: 'visible', visible: this.visible() });
      return this.visible();
    }
  };
})();
