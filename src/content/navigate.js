// gpt-skin — 대화 전환.
// location.href 로 전체 페이지를 다시 띄우면 확장이 재부팅되고,
// 콜드 로드에서 앞쪽 턴이 빠지는 문제(docs/issue/2026-08-31-partial-thread-harvest.md)를 정통으로 밟는다.
// 원본의 클라이언트 라우팅을 그대로 태운다.
GT.navigate = (function () {
  'use strict';

  function to(href) {
    if (!href) return false;
    if (location.pathname === href) return true;

    // 원본 링크가 DOM 에 있으면 그걸 클릭하는 게 가장 안전하다 —
    // 라우터가 자기 방식대로 상태를 정리한다.
    const a = document.querySelector(`a[href="${CSS.escape(href)}"]`);
    if (a) { a.click(); return true; }

    // 없으면 직접 라우팅한다. 좁은 창에서는 사이드바가 없어 링크도 없다.
    history.pushState({}, '', href);
    window.dispatchEvent(new PopStateEvent('popstate'));
    return true;
  }

  function newChat() { return to('/'); }

  return { to, newChat };
})();
