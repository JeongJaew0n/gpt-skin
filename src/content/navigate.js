// gpt-skin — 대화 전환.
// location.href 로 전체 페이지를 다시 띄우면 확장이 재부팅되고,
// 콜드 로드에서 앞쪽 턴이 빠지는 문제(docs/issue/2026-08-31-partial-thread-harvest.md)를 정통으로 밟는다.
// 원본의 클라이언트 라우팅을 그대로 태운다.
GT.navigate = (function () {
  'use strict';

  // 원본 링크가 화면에 보이는가. 숨은 링크(접힌 사이드바 등)는 click() 해도 이동하지 않았다 (실측 2026-10-02).
  const shown = (el) => !!(el && typeof el.getClientRects === 'function' && el.getClientRects().length);

  function to(href) {
    if (!href) return false;
    if (location.pathname === href) return true;

    // 원본 링크가 보이면 그걸 클릭하는 게 가장 안전하다 — 라우터가 자기 방식대로 상태를 정리한다.
    const a = document.querySelector(`a[href="${CSS.escape(href)}"]`);
    const from = location.pathname;
    if (a && shown(a)) { a.click(); verify(href, from); return true; }

    // 아니면 직접 라우팅한다. history.state 에 원본 라우터(React Router)의 표식(idx · key)을 맞춰 넣어야 한다 —
    // 빈 상태({})로 넣으면 라우터가 모르는 이동으로 보고 원래 주소로 되돌렸다
    // (실측 2026-10-02, 로그인 ChatGPT: 콘솔 'You should call navigate() in a React.useEffect()' · 주소 그대로.
    //  idx 를 맞추자 이동하고 스킨도 따라왔다).
    const cur = history.state;
    const idx = (cur && typeof cur.idx === 'number' ? cur.idx : 0) + 1;
    history.pushState({ usr: null, key: Math.random().toString(36).slice(2, 10), idx }, '', href);
    window.dispatchEvent(new PopStateEvent('popstate', { state: history.state }));
    verify(href, from);
    return true;
  }

  // 그래도 안 넘어갔으면 마지막 수단으로 페이지를 새로 연다. 확장이 다시 뜨지만 적어도 그 대화로 간다.
  //
  // 새로 여는 것은 '이동이 아예 안 일어났을 때' 만이다 — 마지막 이동이고, 주소가 떠나기 전 그대로일 때.
  // 예전에는 1.2초 뒤 주소가 목적지와 다르기만 하면 새로 열었다. 탭을 Ctrl+. 로 빠르게 넘기면
  // 앞선 이동의 확인이 '주소가 A 가 아니다(이미 B)' 로 읽혀 A 로 페이지를 새로 열었고, 그동안 원본 화면이 드러났다
  // (사용자 보고 2026-10-02: 단축키를 연달아 누르면 스킨이 벗겨진다).
  const VERIFY_MS = 1200;
  let seq = 0;
  function verify(href, from) {
    const mine = ++seq;
    setTimeout(() => {
      if (mine !== seq) return;                      // 그 뒤에 다른 이동이 있었다 — 그쪽이 확인한다
      if (location.pathname === href) return;        // 넘어갔다
      if (location.pathname !== from) return;        // 다른 곳으로라도 움직였다 — 라우터는 살아 있다
      try { GT.bugs.record('navigate-fallback', `라우팅이 안 먹어 새로 연다: ${href.replace(/\/c\/[^/]+/, '/c/…')}`); } catch (_) {}
      location.assign(href);
    }, VERIFY_MS);
  }

  function newChat() { return to('/'); }

  return { to, newChat };
})();
