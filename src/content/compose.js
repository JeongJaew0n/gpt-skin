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

  // 화면에 실제로 보이는가. 숨긴 요소(display none · 크기 0)에는 초점이 안 들어가 글 넣기가 거절된다.
  const shown = (el) => {
    if (!el || typeof el.getClientRects !== 'function') return true;      // 판단할 수 없으면 보인다고 본다
    if (!el.getClientRects().length) return false;
    const r = el.getBoundingClientRect();
    return r.width > 0 && r.height > 0;
  };

  // 후보 전부. 목록 순서대로, 겹치면 한 번만. 보이는 것을 앞에 둔다.
  //
  // 테스터 보고(2026-10-02, 0.22.0): 편집기가 3개 있는 화면에서 send-failed · inject-rejected 가 6번.
  // 예전에는 목록의 첫 모양에 걸리는 첫 요소를 보이는지 따지지 않고 골랐다 — 숨은 편집기를 골랐다고 본다 [가정].
  function candidates() {
    const seen = new Set();
    const all = [];
    COMPOSERS.forEach((sel, i) => {
      let list = [];
      try { list = document.querySelectorAll(sel); } catch (_) { list = []; }
      Array.from(list || []).forEach((el) => { if (!seen.has(el)) { seen.add(el); all.push({ el, i }); } });
    });
    return all.filter((c) => shown(c.el)).concat(all.filter((c) => !shown(c.el)));
  }

  const composer = () => { const c = candidates()[0]; return c ? c.el : null; };
  let lastUsed = null;                 // 마지막으로 글을 넣은 입력창 — 보냈는지 확인할 때 같은 것을 본다

  function stopButton() {
    return document.querySelector('[data-testid="stop-button"]')
      || document.querySelector('button[aria-label*="중지"]')
      || document.querySelector('button[aria-label*="Stop"]');
  }

  // 보내기 버튼. 글을 넣은 입력창의 폼 안 submit 버튼이 먼저다 — 구조라 언어와 무관하다.
  // 실측(2026-10-15, 로그인 ChatGPT · GPT-6): data-testid="send-button" 이 없어졌고, 버튼은 aria-label '보내기' · type=submit 이다.
  // 영어 화면은 aria-label 이 다르다(그래서 예전엔 'Send' 를 따로 찾았다) — submit 은 같다.
  function sendButton(from) {
    const form = from && from.closest ? from.closest('form') : null;
    const own = form ? form.querySelector('button[type="submit"]') : null;
    return own
      || document.querySelector('[data-testid="send-button"]')
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
  // 보이는 후보부터 넣어 본다. 브라우저가 거절하면(inject-rejected) 다음 후보로 — 거절은 아무것도 안 바꾸므로 안전하다.
  // 글이 들어갔는데 다르면(mismatch) 거기서 멈춘다 — 다른 곳에 또 넣으면 두 군데에 글이 남는다.
  function tryInject(text) {
    const list = candidates();
    if (!list.length) return 'composer-not-found';
    let why = 'inject-rejected';
    for (const c of list) {
      why = injectInto(c.el, text);
      if (why === '') { lastUsed = c.el; return ''; }
      if (why !== 'inject-rejected') return why;
    }
    return why;
  }

  function injectInto(pm, text) {
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

  // 보고서(:bug)에 넣을 입력창 상태. 글 내용은 넣지 않는다 — 개수 · 크기 · 있음/없음만.
  function probe() {
    const q = (s) => { try { return document.querySelectorAll(s).length; } catch (_) { return -1; } };
    const list = candidates();
    const first = list[0];
    return {
      found: first ? COMPOSERS[first.i] : 'none',
      counts: COMPOSERS.map(q),
      // 후보마다: 어느 모양으로 · 크기 · 보이나 · 초점 · 폼 안인가 (최대 6개)
      candidates: list.slice(0, 6).map((c) => {
        let w = null, h = null;
        try { const r = c.el.getBoundingClientRect(); w = Math.round(r.width); h = Math.round(r.height); } catch (_) {}
        return { i: c.i, w, h, shown: shown(c.el), active: c.el === document.activeElement,
          inForm: !!(c.el.closest && c.el.closest('form')) };
      }),
      contenteditable: q('[contenteditable="true"]'),
      textarea: q('textarea'),
      sendButton: !!sendButton(),
      stopButton: !!stopButton(),
      focus: typeof document.hasFocus === 'function' ? document.hasFocus() : null,
      visibility: document.visibilityState || null
    };
  }

  // 보내기 버튼이 나타날 때까지 기다린다.
  // 실측(2026-10-15): 글이 비어 있을 때 그 자리는 '음성 대화 시작' 버튼이고, 글을 넣고 35~53ms 뒤에야 보내기 버튼으로 바뀐다(5회).
  // 예전에는 화면을 두 번 그릴 동안(rAF ×2 — 60Hz 33ms · 120Hz 16ms)만 기다려 버튼이 아직 없었고, Enter 흉내로 넘어갔는데
  // 원본은 흉내 낸 Enter 를 무시해 '원본이 메시지를 보내지 않았습니다' 가 떴다.
  // rAF 대신 타이머로 본다 — rAF 는 뒤에 숨은 탭에서 오지 않아 멈춘다(측정하다 실제로 멈췄다).
  const SEND_WAIT_MS = 1500;
  // 버튼은 있는데 잠겨 있으면 더 기다린다 — Enter 흉내는 원본이 무시하므로(2026-10-15 실측) 넘어가 봐야 안 보내진다.
  const SEND_DISABLED_WAIT_MS = 5000;
  const SEND_POLL_MS = 30;
  const wait = (ms) => new Promise((r) => setTimeout(r, ms));
  async function waitSendButton(from) {
    const t0 = Date.now();
    for (;;) {
      const b = sendButton(from);
      if (b && !b.disabled) return b;
      const waited = Date.now() - t0;
      if (waited >= (b ? SEND_DISABLED_WAIT_MS : SEND_WAIT_MS)) return b || null;
      await wait(SEND_POLL_MS);
    }
  }

  // 눌렀는데 원본이 받지 않았으면 한 번만 다시 누른다 (사용자 결정 2026-10-16).
  // 실측(2026-10-16): 정상 전송 5번 모두 누르는 즉시 원본 입력창이 비고 60ms 안에 중지 버튼이 떴다.
  // 그래서 SEND_RETRY_MS 뒤에도 '글이 그대로 · 중지 버튼 없음 · 보내기 버튼이 눌릴 수 있음' 이면 클릭이 안 먹힌 것이다 —
  // 사용자 탭의 미전송 1건(10-15 18:59 KST)이 이 모양이었다: 직전 답은 74초 전에 끝났고, 서버에 그 메시지가 없었다.
  // 셋 중 하나라도 아니면 누르지 않는다(늦게 비우는 중이거나 이미 보내는 중일 수 있다 — 두 번 보내면 안 된다).
  const SEND_RETRY_MS = 1500;
  function retryIfIgnored(text, how) {
    setTimeout(() => {
      const el = lastUsed || composer();
      if (!holding(el, text) || stopButton()) return;
      const b = sendButton(el);
      if (!b || b.disabled) return;
      b.click();
      how.retried = true;
      try { GT.bugs.record('send-retried', '원본이 클릭을 받지 않아 한 번 더 눌렀다', { ...probe(), send: how }); } catch (_) {}
    }, SEND_RETRY_MS);
  }

  async function send(text) {
    const why = tryInject(text);
    if (why) return { ok: false, reason: why };

    const t0 = Date.now();
    const btn = await waitSendButton(lastUsed);
    const how = btn && !btn.disabled ? 'button' : (btn ? 'enter-disabled' : 'enter-no-button');
    if (how === 'button') {
      btn.click();
    } else {
      const pm = lastUsed || composer();
      ['keydown', 'keypress', 'keyup'].forEach((type) => {
        pm.dispatchEvent(new KeyboardEvent(type, {
          key: 'Enter', code: 'Enter', keyCode: 13, which: 13,
          bubbles: true, cancelable: true, composed: true
        }));
      });
    }
    await wait(SEND_POLL_MS);
    GT.skin.current.focus();
    // 보고서용 — 어떻게 눌렀는지 · 버튼을 몇 ms 기다렸는지 · 글의 길이와 줄 수 (글 내용은 남기지 않는다).
    // 실측(사용자 보고서 2026-10-15): 여러 줄 긴 글(입력창 높이 156px)에서 한 번 안 보내졌는데, 눌렀는지 · 버튼이 잠겼었는지가 없어 원인을 못 가렸다.
    const info = { via: how, waitMs: Date.now() - t0, chars: String(text).length, lines: String(text).split('\n').length };
    if (how === 'button') retryIfIgnored(text, info);     // 다시 누르기 판단(1.5초)이 '안 보내졌다' 확인(2초)보다 먼저다
    watchSent(text, info);
    return { ok: true, via: how === 'button' ? 'button' : 'enter' };
  }

  // 원본이 실제로 보냈는지 뒤에서 확인한다. 보내면 원본은 입력창을 비운다.
  // 실측(비로그인 화면, 2026-09-28): 같은 방법으로 넣고 눌러도 가끔 안 보내지고 글이 입력창에 남았다.
  // 예전에는 그때 아무 말이 없어 보낸 줄 알았다.
  //
  // 다시 누르기는 retryIfIgnored 가 조건을 따져 한 번만 한다(0.31.8). 그래도 남아 있으면 알리기만 한다 —
  // 사용자가 원본에서 확인하고 보내면 된다. 예전에는 '늦게 비우는 것뿐이면 두 번 보내진다' 는 까닭으로 다시 누르지 않았다.
  const SENT_CHECK_MS = 2000;
  // contenteditable 은 공백 · 줄바꿈을 빼고 비교한다 — ProseMirror 는 줄바꿈을 문단으로 바꿔 textContent 에서 사라지므로,
  // 그대로 비교하면 여러 줄 글은 남아 있어도 '보냈다' 로 읽혔다 (리뷰 2026-10-02, 0.26.7). 넣을 때(injectInto)와 같은 기준이다.
  const holding = (el, text) => {
    if (!el) return false;
    if (!String(text || '').trim()) return false;
    if (el.tagName === 'TEXTAREA' || el.tagName === 'INPUT') return String(el.value || '').trim() === String(text).trim();
    return squash(el.textContent) === squash(text);
  };
  function watchSent(text, how) {
    setTimeout(() => {
      if (!holding(lastUsed || composer(), text)) return;
      try { GT.bugs.record('not-sent', '원본이 2초 안에 입력창을 비우지 않았다', { ...probe(), send: how || null }); } catch (_) {}
      // health.soft 는 같은 사유를 한 번만 찍는다 — 보낼 때마다 알려야 하므로 직접 찍는다
      try { GT.skin.current.system('warn', GT_T('compose.notSent')); } catch (_) {}
    }, SENT_CHECK_MS);
  }

  // 답변 중인가 — 이때는 메시지를 보내지 않는다 (docs/plan/2026-10-12-block-send-while-answering.md).
  // 정본은 원본의 중지 버튼이다(생각 중 표시 · esc 중단과 같은 기준). 우리 스트림 상태는 보조로만 —
  // 마지막 조각이 STREAM_STALE_MS 넘게 없으면 끝(end)을 놓친 것으로 보고 막지 않는다. 영영 막히면 안 된다.
  const STREAM_STALE_MS = 60000;
  function answering() {
    if (stopButton()) return true;
    const st = GT.store && GT.store.state;
    return !!(st && st.streamingId && Date.now() - (st.lastStreamAt || 0) < STREAM_STALE_MS);
  }

  function stop() {
    const b = stopButton();
    if (b) { b.click(); return true; }
    return false;
  }

  // 대화 목록은 GT.chats 가 담당한다. 여기 있던 DOM 스크래핑은 그쪽 폴백으로 옮겼다 —
  // 구현이 둘이면 출처가 갈릴 때 서로 다른 목록을 보여준다.
  return { composer, send, stop, inject, tryInject, probe, sendButton, stopButton, answering, STREAM_STALE_MS, SEND_WAIT_MS, SEND_DISABLED_WAIT_MS, SEND_RETRY_MS, SELECTOR, COMPOSERS, holding, SENT_CHECK_MS };
})();
