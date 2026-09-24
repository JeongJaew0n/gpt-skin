// gpt-skin — isolated world 전역 네임스페이스와 MAIN world 브리지.
// 진단 줄을 메모리에만 쌓아 둔다. 저장하지 않는다 —
// 개인정보처리방침의 '기기에 저장되는 것' 을 늘리지 않기 위해서다.
// 지금 로그는 건수·상태만 담고 대화 본문을 담지 않는다.
var GT = (function () {
  'use strict';
  const CH = '__gpt_skin__';
  const RING_MAX = 200;
  const RING = [];

  // 인자에 Error·객체가 올 수 있다. 버퍼에는 안전한 문자열만 넣는다.
  const fmtArg = (x) => {
    if (typeof x === 'string') return x;
    if (x instanceof Error) return x.name + ': ' + x.message;
    try { return JSON.stringify(x); } catch (_) { return String(x); }
  };

  const handlers = new Map();
  // MAIN world 는 document_start 에 곧바로 ready 를 쏜다. 그때 isolated 쪽 핸들러가
  // 아직 안 붙어 있으면 postMessage 는 그냥 사라진다 — 핸드셰이크가 통째로 깨진다.
  // 그래서 임자 없는 메시지는 버리지 않고 담아뒀다가 핸들러가 붙는 순간 흘려준다.
  const pending = new Map();
  const MAX_PENDING = 50;

  const deliver = (fn, payload) => {
    try { fn(payload); } catch (err) { console.error('[gpt-skin]', err); }
  };

  window.addEventListener('message', (e) => {
    if (e.source !== window) return;
    const d = e.data;
    if (!d || d[CH] !== true || d.dir !== 'm2i') return;
    const hs = handlers.get(d.kind);
    if (hs && hs.length) { hs.forEach((fn) => deliver(fn, d.payload || {})); return; }
    const q = pending.get(d.kind) || [];
    q.push(d.payload || {});
    while (q.length > MAX_PENDING) q.shift();
    pending.set(d.kind, q);
  });

  return {
    CH,
    on(kind, fn) {
      if (!handlers.has(kind)) handlers.set(kind, []);
      handlers.get(kind).push(fn);
      const q = pending.get(kind);
      if (q && q.length) { pending.delete(kind); q.forEach((payload) => deliver(fn, payload)); }
    },
    toMain(kind, payload) {
      window.postMessage({ [CH]: true, dir: 'i2m', kind, payload: payload || {} }, location.origin);
    },
    // 서비스 워커로 보내는 유일한 통로.
    // 콜백을 반드시 넘긴다 — 콜백이 없으면 전달 실패가 unchecked runtime.lastError 가 되어
    // try/catch 로 잡히지 않고 chrome://extensions 에 빨간 에러로 남는다.
    // chrome.runtime.id 검사는 언팩 확장을 리로드했을 때(컨텍스트 무효화) 터지는 걸 막는다.
    sendToSW(msg) {
      try {
        if (!chrome.runtime || !chrome.runtime.id) return;
        chrome.runtime.sendMessage(msg, () => void chrome.runtime.lastError);
      } catch (_) { /* 컨텍스트가 이미 죽었다 */ }
    },
    // 진단 로그. 설정으로 끌 수 있다(:log off).
    //
    // config 를 지연해서 읽는다 — protocol 은 config 보다 먼저 로드되므로
    // 부팅 초반에는 GT.config 가 아직 없다. 그때는 찍는다. 부팅 진단을
    // 조용히 잃는 것이 더 나쁘다.
    //
    // console.debug 가 아니라 console.log 를 쓴다. debug 는 크롬 콘솔에서
    // Verbose 레벨이라 기본 필터에 숨는다 — 켜 놓고도 안 보여서 켠 건지
    // 끈 건지 알 수 없었다.
    //
    // 꺼져 있어도 링 버퍼에는 쌓는다. 나중에 :log dump 로 꺼내 본다.
    // 콘솔 필터와 무관하게 '우리 로그만' 확인할 수 있는 유일한 길이다.
    log(...a) {
      const line = a.map(fmtArg).join(' ');
      RING.push({ at: Date.now(), line });
      if (RING.length > RING_MAX) RING.shift();
      if (GT.config && typeof GT.config.get === 'function' && GT.config.get('log') === false) return;
      console.log('[gpt-skin]', ...a);
    },

    // 쌓아 둔 진단 줄. 최근 것이 뒤에 온다.
    logs(n) {
      const k = Math.max(1, Math.min(Number(n) || RING_MAX, RING_MAX));
      return RING.slice(-k).map((r) => ({ at: r.at, line: r.line }));
    },
    logCount() { return RING.length; },
    logClear() { const n = RING.length; RING.length = 0; return n; }
  };
})();
