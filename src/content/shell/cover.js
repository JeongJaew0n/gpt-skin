// gpt-skin — 원본 가리기와 스킨 호스트.
// 스킨은 호스트 안(shadow root)만 그린다. 원본을 가릴지, 호스트를 어떻게 띄울지는 여기서 정한다.
// docs/plan/2026-09-24-skin-architecture.md §2.5
//
// 원본 UI 는 지우지 않고 opacity 0 + pointer-events none 으로 덮는다.
// 지우면 하이드레이션과 컴포저 포커스가 깨진다(원본은 살아 있어야 우리가 전송할 수 있다).
GT.cover = (function () {
  'use strict';

  const HOST_ID = 'gpt-skin-host';
  const ON_CLASS = 'gpt-skin-on';
  const STYLE_ID = 'gpt-skin-page-style';

  let covers = true;

  // 원본을 가리는 스킨 (terminal · sheet). 켜져 있으면 전체 화면을 우리가 쓴다.
  //
  // 가리는 규칙은 호스트가 실제로 붙어 있을 때만 건다 (:has). 호스트가 사라졌는데 원본만 가리면 화면이 통째로
  // 하얗게 된다 — 실측(로그인 ChatGPT, 2026-10-02): 원본이 하이드레이션 오류(#418) 뒤 문서를 다시 그리며
  // 호스트를 지웠고, Ctrl+` 를 누르자 빈 화면만 남았다.
  const COVERING = `
html.${ON_CLASS}:has(> body > #${HOST_ID}) body > *:not(#${HOST_ID}) { opacity: 0 !important; pointer-events: none !important; }
html.${ON_CLASS}:has(> body > #${HOST_ID}) { overflow: hidden !important; }
#${HOST_ID} { position: fixed; inset: 0; z-index: 2147483000; }
html:not(.${ON_CLASS}) #${HOST_ID} { display: none; }
`;

  // 원본을 가리지 않는 스킨 (none). 호스트는 클릭을 통과시키고, 스킨이 자기 위젯에만
  // pointer-events: auto 를 준다.
  // [가정] 이렇게 하면 원본 클릭이 전부 통과한다 — 5단계(none 스킨)에서 브라우저로 확인한다.
  const PASSTHROUGH = `
#${HOST_ID} { position: fixed; inset: 0; z-index: 2147483000; pointer-events: none; }
html:not(.${ON_CLASS}) #${HOST_ID} { display: none; }
`;

  // 원본을 덮는 스타일은 page document 에 있어야 한다(shadow root 밖).
  function pageStyle() {
    let s = document.getElementById(STYLE_ID);
    if (!s) {
      s = document.createElement('style');
      s.id = STYLE_ID;
      (document.head || document.documentElement).appendChild(s);
    }
    return s;
  }

  // 스킨이 바뀌면 다시 부른다. 스타일 요소는 하나를 재사용한다.
  function apply(c) {
    covers = c !== false;
    pageStyle().textContent = covers ? COVERING : PASSTHROUGH;
  }

  // 호스트 요소와 그 shadow root. 있으면 재사용하고 안을 비운다.
  //
  // <body> 안에만 붙인다. 예전에는 body 가 아직 없으면(document_start) <html> 에 바로 붙였는데,
  // 원본은 <html> 까지 하이드레이션한다 — 낯선 자식이 있으면 하이드레이션이 깨져(#418, 대상 HTML)
  // 문서를 통째로 다시 그리고, 그때 호스트도 지워진다 (실측 2026-10-02, 로그인 ChatGPT).
  // 그래서 body 가 생길 때까지 기다리고, 그 뒤에도 원본이 지우면 다시 붙인다 (keep).
  // shadow root 는 떨어져 있는 동안에도 살아 있으므로 다시 붙이기만 하면 화면이 돌아온다.
  let hostEl = null;
  let keeper = null;
  let wantOn = false;                  // 켜 둔 상태. 원본이 <html> 클래스를 지워도 되살린다

  function attach() {
    if (!hostEl || hostEl.isConnected) return false;
    if (!document.body) return false;
    document.body.appendChild(hostEl);
    return true;
  }

  // 원본이 호스트를 떼어 내면 다시 붙인다. body 가 통째로 바뀌는 것도 본다(<html> 의 자식 변화).
  function keep() {
    if (keeper || typeof MutationObserver === 'undefined') return;
    let watchedBody = null;
    const watch = () => {
      if (document.body && document.body !== watchedBody) {
        watchedBody = document.body;
        keeper.observe(watchedBody, { childList: true });
      }
    };
    keeper = new MutationObserver(() => {
      watch();
      if (attach()) { try { GT.cover.restored += 1; GT.log('호스트가 지워져 다시 붙였다'); } catch (_) {} }
      if (wantOn && !cls().contains(ON_CLASS)) cls().add(ON_CLASS);
    });
    keeper.observe(document.documentElement, { childList: true, attributes: true, attributeFilter: ['class'] });
    watch();
  }

  function host() {
    hostEl = document.getElementById(HOST_ID) || hostEl;
    if (!hostEl) { hostEl = document.createElement('div'); hostEl.id = HOST_ID; }
    attach();
    keep();
    const shadow = hostEl.shadowRoot || hostEl.attachShadow({ mode: 'open' });
    shadow.textContent = '';
    return { host: hostEl, shadow };
  }

  const cls = () => document.documentElement.classList;

  return {
    HOST_ID, ON_CLASS, STYLE_ID,
    apply,
    host,
    get covers() { return covers; },
    on() { wantOn = true; cls().add(ON_CLASS); },
    off() { wantOn = false; cls().remove(ON_CLASS); },
    isOn() { return cls().contains(ON_CLASS); },
    // 확장이 다시 로드되면 흔적 없이 물러난다 — 클래스 · 페이지 스타일 · 호스트.
    restored: 0,                          // 원본이 지워 다시 붙인 횟수 (보고서용)
    attached: () => !!(hostEl && hostEl.isConnected),
    remove() {
      if (keeper) { keeper.disconnect(); keeper = null; }
      wantOn = false;
      cls().remove(ON_CLASS);
      const st = document.getElementById(STYLE_ID);
      if (st) st.remove();
      const h = document.getElementById(HOST_ID);
      if (h) h.remove();
      if (hostEl) hostEl.remove();
      hostEl = null;
    }
  };
})();
