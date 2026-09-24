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
  const COVERING = `
html.${ON_CLASS} body > *:not(#${HOST_ID}) { opacity: 0 !important; pointer-events: none !important; }
html.${ON_CLASS} { overflow: hidden !important; }
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
  function host() {
    let h = document.getElementById(HOST_ID);
    if (!h) { h = document.createElement('div'); h.id = HOST_ID; }
    if (!h.isConnected) (document.body || document.documentElement).appendChild(h);
    const shadow = h.shadowRoot || h.attachShadow({ mode: 'open' });
    shadow.textContent = '';
    return { host: h, shadow };
  }

  const cls = () => document.documentElement.classList;

  return {
    HOST_ID, ON_CLASS, STYLE_ID,
    apply,
    host,
    get covers() { return covers; },
    on() { cls().add(ON_CLASS); },
    off() { cls().remove(ON_CLASS); },
    isOn() { return cls().contains(ON_CLASS); },
    // 확장이 다시 로드되면 흔적 없이 물러난다 — 클래스 · 페이지 스타일 · 호스트.
    remove() {
      cls().remove(ON_CLASS);
      const st = document.getElementById(STYLE_ID);
      if (st) st.remove();
      const h = document.getElementById(HOST_ID);
      if (h) h.remove();
    }
  };
})();
