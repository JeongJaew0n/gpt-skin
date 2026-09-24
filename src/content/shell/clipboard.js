// gpt-skin — 클립보드. 껍데기와 무관하므로 스킨 밖에 둔다.
// 비동기 API 를 먼저 쓰고, 막히면 execCommand 로 내려간다.
// 실패를 삼키지 않고 false 를 돌려준다 — 버튼이 '복사 실패' 를 보여줘야 한다.
GT.clipboard = (function () {
  'use strict';

  async function copy(text) {
    const s = String(text == null ? '' : text);
    if (!s) return false;
    try {
      if (navigator.clipboard && navigator.clipboard.writeText) {
        await navigator.clipboard.writeText(s);
        return true;
      }
    } catch (_) { /* 권한·포커스 문제. 아래 폴백으로 간다 */ }
    try {
      // execCommand 는 문서에 붙은 노드에서만 동작한다. shadow root 안에서는 안 잡힌다.
      const ta = document.createElement('textarea');
      ta.value = s;
      ta.setAttribute('readonly', '');
      ta.style.cssText = 'position:fixed;top:0;left:-9999px;opacity:0';
      document.body.appendChild(ta);
      ta.select();
      const ok = document.execCommand('copy');
      ta.remove();
      // 포커스를 입력줄로 돌려놓는다
      try { if (GT.tty && GT.tty.focus) GT.tty.focus(); } catch (_) {}
      return !!ok;
    } catch (_) { return false; }
  }

  return { copy };
})();
