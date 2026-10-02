// gpt-skin — 오류 기록과 버그 보고서.
//
// 오류는 사용자 화면에 늘어놓지 않고 여기 조용히 쌓는다. 사용자는 :bug 한 번으로 보고서를 복사해
// 개발자에게 붙여 넣는다. 테스터가 "에러가 났다" 고만 알려 줄 때 원인을 가릴 근거를 남기려는 것이다.
//   · 직접 기록    GT.bugs.record(code, message, extra) — 실패를 아는 곳에서 부른다 (전송 실패 등)
//   · 놓친 예외    우리 파일에서 난 window error · unhandledrejection 을 잡는다 (원본 페이지 것은 건너뛴다)
//
// 보고서에 넣지 않는 것: 대화 본문 · 제목 · 대화 id · 입력한 글. 주소는 경로 모양만 남긴다 (/c/…).
// 팝업의 '진단 복사' 도 같은 보고서를 쓴다 — 두 벌로 두면 갈린다.
GT.bugs = (function () {
  'use strict';

  const MAX = 50;
  const LIST = [];            // { at, code, message, where, extra, count }
  let seq = 0;

  const short = (s, n) => { s = String(s == null ? '' : s); return s.length > n ? s.slice(0, n) + '…' : s; };

  // 대화 id · 긴 토큰을 지운다. 경로 모양만 남는다: /c/6aba… → /c/…
  function maskPath(p) {
    return String(p || '').replace(/\/(c|g|uc|project|share)\/[^/?#]+/g, '/$1/…').replace(/[?#].*$/, '');
  }

  // 같은 오류가 이어지면 한 줄로 세기만 한다. 보고서가 같은 줄로 덮이지 않게.
  function record(code, message, extra) {
    const msg = short(message, 300);
    const last = LIST[LIST.length - 1];
    if (last && last.code === code && last.message === msg) { last.count += 1; last.at = Date.now(); return last.id; }
    LIST.push({ id: ++seq, at: Date.now(), code: String(code || 'error'), message: msg,
      where: maskPath(typeof location !== 'undefined' ? location.pathname : ''), extra: extra || null, count: 1 });
    if (LIST.length > MAX) LIST.shift();
    try { GT.log(`[bug] ${code}: ${msg}`); } catch (_) {}
    return seq;
  }

  function list() { return LIST.map((r) => ({ ...r })); }
  function count() { return LIST.reduce((n, r) => n + r.count, 0); }
  function clear() { const n = LIST.length; LIST.length = 0; return n; }

  // ------------------------------------------------------------------ 놓친 예외
  //
  // 콘텐츠 스크립트 월드의 window 에서 오류 이벤트를 듣는다. 우리 파일(chrome-extension://<id>/)에서
  // 난 것만 남긴다 — 원본 페이지의 오류까지 담으면 보고서가 쓸모없어진다.
  const ours = (s) => {
    const id = (typeof chrome !== 'undefined' && chrome.runtime && chrome.runtime.id) || '';
    return !!s && (id ? String(s).includes(id) : /chrome-extension:\/\//.test(String(s)));
  };
  const topFrames = (stack) => String(stack || '').split('\n').slice(0, 4)
    .map((l) => l.trim().replace(/chrome-extension:\/\/[^/]+\//g, '')).join(' | ');

  function onError(e) {
    const err = e && e.error;
    const file = (e && e.filename) || '';
    if (!ours(file) && !ours(err && err.stack)) return;
    record('uncaught', (err && err.message) || (e && e.message) || 'error', { stack: topFrames(err && err.stack) || file.replace(/^.*\//, '') + ':' + (e.lineno || '?') });
  }
  function onRejection(e) {
    const r = e && e.reason;
    const stack = r && r.stack;
    if (!ours(stack)) return;
    record('unhandled-rejection', (r && r.message) || String(r), { stack: topFrames(stack) });
  }

  let listening = false;
  function start() {
    if (listening || typeof window === 'undefined' || !window.addEventListener) return;
    window.addEventListener('error', onError, { capture: true });
    window.addEventListener('unhandledrejection', onRejection);
    listening = true;
  }
  function stop() {
    if (!listening) return;
    window.removeEventListener('error', onError, { capture: true });
    window.removeEventListener('unhandledrejection', onRejection);
    listening = false;
  }

  // ------------------------------------------------------------------ 보고서
  function safe(fn, fallback) { try { return fn(); } catch (_) { return fallback; } }

  function header() {
    const nav = typeof navigator !== 'undefined' ? navigator : {};
    const ua = ((nav.userAgent || '').match(/Chrome\/[\d.]+/) || ['Chrome/?'])[0];
    const plat = (nav.userAgentData && nav.userAgentData.platform) || nav.platform || '?';
    const checks = safe(() => Object.entries(GT.health.CHECKS).map(([k, v]) => `${k}:${v.ok ? 'ok' : 'FAIL'}`).join(' '), '?');
    const reasons = safe(() => GT.health.reasons, []);
    return [
      `gpt-skin ${typeof GT_VERSION !== 'undefined' ? GT_VERSION : '?'} · build ${typeof GT_BUILD !== 'undefined' ? GT_BUILD : '?'}`,
      `${ua} · ${plat} · locale ${typeof GT_LOCALE !== 'undefined' ? GT_LOCALE : '?'}`,
      `page ${maskPath(typeof location !== 'undefined' ? location.pathname : '')}`,
      safe(() => `host ${GT.cover.attached() ? 'attached' : 'DETACHED'} · restored ${GT.cover.restored}`, 'host ?'),
      // 탭별로 분할 적용이면 이 탭이 따로 고른 스킨인지(tab) 기본을 따르는지(default) — 같은 사용자도 탭마다 화면이 다르다 (0.28.1)
      safe(() => `skin ${GT.skin.current.id}${GT.skin.perTab && GT.skin.perTab() ? (GT.skin.tabSkin ? ' (tab)' : ' (default)') : ''} · visible ${GT.skin.visible() ? 'yes' : 'no'} · onBreak ${GT.config.get('onBreak')} · degraded ${GT.health.degraded ? 'yes' : 'no'}`, 'skin ?'),
      `checks ${checks}`,
      `warnings ${reasons.length}` + (reasons.length ? '\n' + reasons.map((r) => '  - ' + r).join('\n') : '')
    ];
  }

  function report() {
    const lines = header();
    const probe = safe(() => (GT.compose && GT.compose.probe ? GT.compose.probe() : null), null);
    if (probe) lines.push(`composer ${JSON.stringify(probe)}`);
    lines.push(`errors ${count()}`);
    LIST.forEach((r) => {
      const time = new Date(r.at).toISOString().replace('T', ' ').slice(0, 19);
      lines.push(`  - ${time} ${r.code}${r.count > 1 ? ' ×' + r.count : ''} @ ${r.where || '/'}: ${r.message}`);
      if (r.extra) lines.push(`      ${short(JSON.stringify(r.extra), 600)}`);
    });
    return lines.join('\n');
  }

  start();

  return { record, list, count, clear, report, start, stop, maskPath };
})();
