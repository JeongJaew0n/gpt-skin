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
  const FIELDS = ['id', 'covers', 'capturesTyping', 'themes', 'defaultTheme', 'configKeys', 'hiddenCommands'];
  // 함수
  const METHODS = [
    'mount', 'destroy', 'applyConfig',                    // 생명주기
    'render', 'renderChrome', 'tick', 'syncSidebar',      // 자료 → 화면
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
    show() { GT.cover.on(); this.current.focus(); },
    hide() { GT.cover.off(); },
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
