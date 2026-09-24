// gpt-skin — 전송 경로.
// 자체 API 호출은 불가능하다. /backend-api/f/conversation 앞에 sentinel proof-of-work 가 붙고
// 그 토큰은 페이지가 만든다. 그래서 텍스트를 원본 컴포저에 주입하고 페이지가 보내게 한다.
GT.compose = (function () {
  'use strict';

  const COMPOSER = '#prompt-textarea';
  const raf = () => new Promise((r) => requestAnimationFrame(() => r()));

  const composer = () => document.querySelector(COMPOSER);

  function stopButton() {
    return document.querySelector('[data-testid="stop-button"]')
      || document.querySelector('button[aria-label*="중지"]')
      || document.querySelector('button[aria-label*="Stop"]');
  }

  function sendButton() {
    return document.querySelector('[data-testid="send-button"]')
      || document.querySelector('button[aria-label*="보내기"]')
      || document.querySelector('button[aria-label*="Send"]');
  }

  // ProseMirror 는 value 대입을 무시한다. beforeinput 을 발생시키는 execCommand 로 넣는다.
  function inject(text) {
    const pm = composer();
    if (!pm) return false;
    pm.focus();
    const sel = window.getSelection();
    const range = document.createRange();
    range.selectNodeContents(pm);
    sel.removeAllRanges();
    sel.addRange(range);
    const ok = document.execCommand('insertText', false, text);
    if (!ok) return false;
    pm.dispatchEvent(new Event('input', { bubbles: true }));
    return true;
  }

  async function send(text) {
    if (!inject(text)) return { ok: false, reason: 'composer-inject-failed' };
    await raf(); await raf();

    const btn = sendButton();
    if (btn && !btn.disabled) {
      btn.click();
    } else {
      const pm = composer();
      ['keydown', 'keypress', 'keyup'].forEach((type) => {
        pm.dispatchEvent(new KeyboardEvent(type, {
          key: 'Enter', code: 'Enter', keyCode: 13, which: 13,
          bubbles: true, cancelable: true, composed: true
        }));
      });
    }
    await raf();
    GT.skin.current.focus();
    return { ok: true, via: btn ? 'button' : 'enter' };
  }

  function stop() {
    const b = stopButton();
    if (b) { b.click(); return true; }
    return false;
  }

  // 대화 목록은 GT.chats 가 담당한다. 여기 있던 DOM 스크래핑은 그쪽 폴백으로 옮겼다 —
  // 구현이 둘이면 출처가 갈릴 때 서로 다른 목록을 보여준다.
  return { composer, send, stop, inject, sendButton, stopButton };
})();
