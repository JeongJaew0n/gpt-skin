// gpt-skin — 전송 경로.
// 자체 API 호출은 불가능하다. /backend-api/f/conversation 앞에 sentinel proof-of-work 가 붙고
// 그 토큰은 페이지가 만든다. 그래서 텍스트를 원본 컴포저에 주입하고 페이지가 보내게 한다.
GT.compose = (function () {
  'use strict';

  // 원본 입력창. 화면마다 모양이 다르다 — 앞에서부터 찾는다.
  //   #prompt-textarea                  ProseMirror(contenteditable). 로그인 화면 (예전 모양)
  //   form[data-chatgpt-composer] [contenteditable="true"]
  //                                     같은 ProseMirror 인데 id 가 없어졌다. 로그인 화면
  //                                     (실측 2026-09-28: #prompt-textarea 없음, 이 폼 안의 contenteditable 하나뿐.
  //                                      이것을 못 찾아 Enter 를 쳐도 원본 입력창에 글이 들어가지 않았다)
  //   .ProseMirror[contenteditable="true"]
  //                                     위 둘이 다 사라져도 잡으려는 예비. ProseMirror 라이브러리가 붙이는 클래스라
  //                                     ChatGPT 의 id · data 속성보다 덜 바뀐다 [가정 — 로그인 화면에서 확인 못 함].
  //                                     (2026-10-01: 비로그인 화면의 폼에서 data-chatgpt-composer 가 안 보였다)
  //   textarea#mobile-composer-prompt   평범한 textarea. 비로그인 화면
  //                                     (실측 2026-09-28: 이 화면엔 #prompt-textarea 가 없고 이것 하나뿐)
  //   textarea[name="prompt"]           위 textarea 의 name. id 가 바뀌어도 잡으려고
  // 부팅 점검(index.js)도 같은 목록을 쓴다 — 두 곳에 적으면 갈린다.
  const COMPOSERS = [
    '#prompt-textarea',
    'form[data-chatgpt-composer] [contenteditable="true"]',
    '.ProseMirror[contenteditable="true"]',
    'textarea#mobile-composer-prompt',
    'textarea[name="prompt"]'
  ];
  const SELECTOR = COMPOSERS.join(', ');
  const raf = () => new Promise((r) => requestAnimationFrame(() => r()));

  const composer = () => {
    for (const sel of COMPOSERS) {
      const el = document.querySelector(sel);
      if (el) return el;
    }
    return null;
  };

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

  // textarea 는 React 가 값을 들고 있다. value 를 그냥 대입하면 React 가 모르고 되돌린다.
  // 먼저 execCommand 로 넣고(진짜 입력처럼 input 이 난다), 안 되면 원래 setter 로 넣고 input 을 쏜다.
  function injectTextarea(el, text) {
    el.focus();
    el.select();
    let ok = false;
    try { ok = document.execCommand('insertText', false, text); } catch (_) { ok = false; }
    if (!ok || el.value !== text) {
      const proto = el.tagName === 'INPUT' ? HTMLInputElement.prototype : HTMLTextAreaElement.prototype;
      const desc = Object.getOwnPropertyDescriptor(proto, 'value');
      if (desc && desc.set) desc.set.call(el, text); else el.value = text;
      el.dispatchEvent(new Event('input', { bubbles: true }));
    }
    return el.value === text;
  }

  // 넣기. 실패하면 사유를 돌려준다 (성공이면 '').
  //   composer-not-found  목록의 어떤 모양도 화면에 없다 — 원본 화면 구조가 바뀌었거나 입력창이 없는 화면
  //   inject-rejected     찾았지만 브라우저가 글 넣기를 거절했다 (execCommand false) — 초점을 못 받은 경우 등
  //   inject-mismatch     넣었다고 했는데 입력창의 글이 보낸 글과 다르다
  // 예전에는 셋 다 '원본 컴포저를 찾지 못했습니다' 하나로 알려 테스터 보고만으로는 원인을 가릴 수 없었다 (2026-10-01).
  //
  // ProseMirror 는 value 대입을 무시한다. beforeinput 을 발생시키는 execCommand 로 넣는다.
  const squash = (t) => String(t || '').replace(/\s+/g, '');
  function tryInject(text) {
    const pm = composer();
    if (!pm) return 'composer-not-found';
    if (pm.tagName === 'TEXTAREA' || pm.tagName === 'INPUT') return injectTextarea(pm, text) ? '' : 'inject-mismatch';
    pm.focus();
    const sel = window.getSelection();
    const range = document.createRange();
    range.selectNodeContents(pm);
    sel.removeAllRanges();
    sel.addRange(range);
    let ok = false;
    try { ok = document.execCommand('insertText', false, text); } catch (_) { ok = false; }
    if (!ok) return 'inject-rejected';
    pm.dispatchEvent(new Event('input', { bubbles: true }));
    // 줄바꿈은 문단이 되어 textContent 에서 사라진다 — 공백을 빼고 비교한다
    if (pm.textContent != null && !squash(pm.textContent).includes(squash(text))) return 'inject-mismatch';
    return '';
  }
  const inject = (text) => tryInject(text) === '';

  // 보고서(:bug)에 넣을 입력창 상태. 글 내용은 넣지 않는다 — 개수 · 있음/없음만.
  function probe() {
    const q = (s) => { try { return document.querySelectorAll(s).length; } catch (_) { return -1; } };
    const found = COMPOSERS.findIndex((s) => q(s) > 0);
    return {
      found: found < 0 ? 'none' : COMPOSERS[found],
      counts: COMPOSERS.map(q),
      contenteditable: q('[contenteditable="true"]'),
      textarea: q('textarea'),
      sendButton: !!sendButton(),
      stopButton: !!stopButton(),
      focus: typeof document.hasFocus === 'function' ? document.hasFocus() : null,
      visibility: document.visibilityState || null
    };
  }

  async function send(text) {
    const why = tryInject(text);
    if (why) return { ok: false, reason: why };
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
    watchSent(text);
    return { ok: true, via: btn ? 'button' : 'enter' };
  }

  // 원본이 실제로 보냈는지 뒤에서 확인한다. 보내면 원본은 입력창을 비운다.
  // 실측(비로그인 화면, 2026-09-28): 같은 방법으로 넣고 눌러도 가끔 안 보내지고 글이 입력창에 남았다.
  // 예전에는 그때 아무 말이 없어 보낸 줄 알았다.
  //
  // 자동으로 한 번 더 누르지 않는다 — 원본이 늦게 비우는 것뿐이면 두 번 보내진다.
  // 남아 있으면 알리기만 한다. 사용자가 원본에서 확인하고 보내면 된다.
  const SENT_CHECK_MS = 2000;
  const holding = (el, text) => {
    if (!el) return false;
    const v = (el.tagName === 'TEXTAREA' || el.tagName === 'INPUT') ? el.value : el.textContent;
    return String(v || '').trim() === String(text || '').trim() && String(text || '').trim() !== '';
  };
  function watchSent(text) {
    setTimeout(() => {
      if (!holding(composer(), text)) return;
      try { GT.bugs.record('not-sent', '원본이 2초 안에 입력창을 비우지 않았다', probe()); } catch (_) {}
      // health.soft 는 같은 사유를 한 번만 찍는다 — 보낼 때마다 알려야 하므로 직접 찍는다
      try { GT.skin.current.system('warn', GT_T('compose.notSent')); } catch (_) {}
    }, SENT_CHECK_MS);
  }

  function stop() {
    const b = stopButton();
    if (b) { b.click(); return true; }
    return false;
  }

  // 대화 목록은 GT.chats 가 담당한다. 여기 있던 DOM 스크래핑은 그쪽 폴백으로 옮겼다 —
  // 구현이 둘이면 출처가 갈릴 때 서로 다른 목록을 보여준다.
  return { composer, send, stop, inject, tryInject, probe, sendButton, stopButton, SELECTOR, COMPOSERS, holding, SENT_CHECK_MS };
})();
