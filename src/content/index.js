// gpt-skin — 오케스트레이터. 부팅 순서와 이벤트 배선만 여기 있다.
// 모듈이 하나라도 빠지면 조용히 죽지 않고 이유를 말한다.
//
// 크롬은 언팩 확장의 매니페스트를 캐시한다. 매니페스트에 파일을 추가한 뒤 확장을 다시 로드하지 않으면
// 새 파일은 주입되지 않는데 나머지 파일은 디스크의 최신본이 들어온다.
// 그러면 그 파일을 참조하는 모듈이 ReferenceError 로 죽고, 뒤따르는 모듈이 전부 무너진다.
// 페이지를 새로고침해도 매니페스트는 다시 읽지 않으므로 증상이 계속된다.
// 이 검사가 없으면 화면에 아무것도 안 뜨고 이유도 안 보인다.
(function preflight() {
  'use strict';
  const missing = [];
  if (typeof GT === 'undefined') missing.push('GT (protocol.js)');
  else ['config', 'oai', 'store', 'chats', 'conversation', 'convops', 'markdown', 'renderplan', 'theme', 'skins', 'skin', 'palette', 'sidebar', 'compose', 'picker', 'navigate', 'commands', 'health', 'cover', 'clipboard', 'prompt']
    .forEach((k) => { if (!GT[k]) missing.push('GT.' + k); });
  if (typeof GT_DEFAULTS === 'undefined') missing.push('GT_DEFAULTS (shared/defaults.js)');
  if (typeof GT_T !== 'function') missing.push('GT_T (shared/i18n.js)');
  if (!missing.length) return;

  console.error(
    '[gpt-skin] 모듈이 로드되지 않았습니다: ' + missing.join(', ') +
    '\nchrome://extensions 에서 gpt-skin 카드의 ↻ 를 눌러 확장을 다시 로드한 뒤 이 페이지를 새로고침하세요. ' +
    '(제거 후 재설치할 필요는 없습니다)'
  );

  const show = () => {
    if (document.getElementById('gpt-skin-preflight')) return;
    const box = document.createElement('div');
    box.id = 'gpt-skin-preflight';
    box.setAttribute('style', [
      'position:fixed', 'left:16px', 'right:16px', 'bottom:16px', 'z-index:2147483647',
      'background:#161b22', 'color:#c9d1d9', 'border:1px solid #f85149',
      'padding:14px 16px', 'font:13px/1.6 ui-monospace,SFMono-Regular,Menlo,monospace',
      'display:flex', 'gap:14px', 'align-items:flex-start'
    ].join(';'));
    const tag = document.createElement('span');
    tag.textContent = '[error]';
    tag.setAttribute('style', 'color:#f85149;flex:0 0 auto');
    const body = document.createElement('div');
    body.style.flex = '1';
    const l1 = document.createElement('div');
    l1.textContent = 'gpt-skin 이 로드되지 않았습니다 — ' + missing.join(', ');
    const l2 = document.createElement('div');
    l2.setAttribute('style', 'color:#8b949e;margin-top:4px');
    l2.textContent = 'chrome://extensions 에서 gpt-skin 의 ↻ 를 누르고 이 페이지를 새로고침하세요. 제거 후 재설치할 필요는 없습니다.';
    body.appendChild(l1); body.appendChild(l2);
    const close = document.createElement('button');
    close.textContent = '닫기';
    close.setAttribute('style', 'background:none;border:1px solid #30363d;color:#8b949e;font:inherit;padding:2px 10px;cursor:pointer');
    close.addEventListener('click', () => box.remove());
    box.appendChild(tag); box.appendChild(body); box.appendChild(close);
    (document.body || document.documentElement).appendChild(box);
  };

  if (document.body) show();
  else document.addEventListener('DOMContentLoaded', show, { once: true });
})();

(async function boot() {
  'use strict';

  // 모듈이 빠졌으면 부팅하지 않는다. 위 preflight 가 이미 알렸다.
  if (typeof GT === 'undefined' || !GT.config || !GT.skin || !GT.health) return;

  // ---------------------------------------------------------------- 생명주기
  //
  // 확장을 다시 로드(chrome://extensions 의 ↻)하면 이미 주입된 콘텐츠 스크립트는
  // '고아'가 된다 — chrome.* 는 죽지만 타이머·옵저버·키 리스너는 그대로 살아 돈다.
  // 정리하지 않으면 죽은 터미널이 화면을 덮은 채 키 입력을 계속 가로채고,
  // 매 틱마다 무효화된 컨텍스트를 건드려 오류를 만든다.
  // 그래서 등록하는 모든 것을 추적하고, 무효화를 감지하면 스스로 물러난다.
  const disposers = [];
  let gone = false;

  // ---------------------------------------------------------------- 교대
  //
  // 확장을 다시 로드하면 서비스워커가 이 스크립트들을 열린 탭에 다시 넣는다(재주입).
  // 그러면 한 페이지에 옛 인스턴스(고아)와 새 인스턴스가 함께 있게 된다.
  // DOM 은 두 쪽이 공유한다 — 옛 것이 늦게 물러나며 호스트·페이지 스타일을 id 로 지우면
  // 새로 붙은 화면이 날아간다. 그래서 새 것이 뜨자마자 옛 것에게 '비켜라' 를 보내고,
  // 옛 것은 새 것이 아무것도 그리기 전에 동기로 물러난다. DOM 이벤트는 월드를 가리지 않는다.
  //
  // 옛 것이 켜 둔 상태(Ctrl+\` 로 탭에서 켠 것)는 이어받는다. 안 그러면 확장을 다시
  // 로드할 때마다 화면이 원본으로 돌아가 먹통처럼 보인다.
  // docs/issue/2026-09-28-reinject-after-update.md
  const GEN = String(Date.now()) + Math.random().toString(36).slice(2, 8);
  const pageRoot = document.documentElement;
  const MY = GT;                               // 같은 월드에 재주입되면 전역 GT 가 새 것으로 바뀐다
  // 옛 것이 아직 켜 둔 채면 클래스로 알 수 있다. 그런데 재주입보다 옛 것의 고아 감지(4초)가
  // 먼저 돌면 이미 화면을 치운 뒤다 — 그래서 물러날 때 켜져 있었다는 사실을 따로 남긴다.
  // 실측(헤드리스 크롬, 2026-09-28): 이 표식 없이는 업데이트 뒤 켜 둔 화면이 원본으로 돌아갔다.
  const inherited = !!(GT.cover && GT.cover.isOn()) || pageRoot.dataset.gptSkinWasOn === '1';
  delete pageRoot.dataset.gptSkinWasOn;
  pageRoot.dataset.gptSkinGen = GEN;
  pageRoot.dispatchEvent(new CustomEvent('gpt-skin:takeover'));
  // 예전 판이 남긴 '새로고침해주세요' 안내가 떠 있으면 걷는다
  const staleNotice = document.getElementById('gpt-skin-gone');
  if (staleNotice) staleNotice.remove();

  const every = (ms, fn) => { const t = setInterval(fn, ms); disposers.push(() => clearInterval(t)); return t; };
  const listen = (target, ev, fn, opts) => {
    target.addEventListener(ev, fn, opts);
    disposers.push(() => target.removeEventListener(ev, fn, opts));
  };
  const observe = (obs, node, cfg) => { obs.observe(node, cfg); disposers.push(() => obs.disconnect()); };

  // 물러난다. 안내를 띄우지 않는다 — 확장을 다시 로드하면 서비스워커가 새 코드를
  // 곧바로 다시 넣으므로 사용자가 할 일이 없다. 예전에는 '새로고침해주세요' 를 띄웠다.
  function shutdown(why) {
    if (gone) return;
    gone = true;
    disposers.forEach((d) => { try { d(); } catch (_) {} });
    disposers.length = 0;
    // 교대 신호로 물러날 때는 새 것이 아직 아무것도 안 그렸으므로 화면을 치워도 된다.
    // 그런데 고아 감지로 늦게 물러나는 순간 이미 새 것이 붙어 있으면, 호스트와 페이지 스타일은
    // 그쪽 것이다 — id 로 지우는 destroy 를 부르면 새 화면이 날아간다. 그때는 손대지 않는다.
    const replaced = pageRoot.dataset.gptSkinGen !== GEN;
    if (!replaced || why === 'takeover') {
      // 곧 들어올 새 인스턴스가 이어받을 수 있게, 켜져 있었으면 남겨 둔다.
      // 교대 신호로 물러날 때는 새 것이 이미 읽은 뒤라 남기면 찌꺼기가 된다 — 고아 감지로 먼저 물러날 때만.
      if (why !== 'takeover') { try { if (MY.cover.isOn()) pageRoot.dataset.gptSkinWasOn = '1'; } catch (_) {} }
      try { MY.skin.destroy(); } catch (_) {}
    }
    try { MY.stop(); } catch (_) {}
    try { MY.log('물러남:', why); } catch (_) {}
  }

  // 새 인스턴스가 들어왔다. 그쪽이 아무것도 그리기 전에 비켜 준다.
  listen(pageRoot, 'gpt-skin:takeover', () => {
    if (pageRoot.dataset.gptSkinGen !== GEN) shutdown('takeover');
  });

  const contextAlive = () => {
    try { return !!(chrome.runtime && chrome.runtime.id); } catch (_) { return false; }
  };

  // ---------------------------------------------------------- MAIN world 배선
  // await 보다 먼저 붙인다. tap 은 document_start 에 곧바로 쏘기 때문에
  // 여기서 한 박자라도 늦으면 ready 를 놓친다(놓친 건 protocol 의 버퍼가 받아둔다).
  let tapSeen = false;
  const markTap = () => { if (!tapSeen) { tapSeen = true; GT.health.pass('tap'); } };
  GT.on('ready', markTap);
  GT.on('pong', markTap);
  GT.on('broken', (p) => GT.health.fail('schema', `${p.reason} ${p.detail}`));

  GT.on('harvest', (p) => {
    const all = p.messages || [];
    // 아직 본문이 없는 assistant 노드는 메시지가 아니다. 원본이 그 자리에 그리는
    // 자리표시자를 응답으로 삼으면 "생각 중..." 이 스크롤백에 눌러앉는다.
    //
    // 다만 이걸 '생각 중' 표시의 근거로 쓰지는 않는다. 원본이 .markdown 을
    // 붙였다 뗐다 해서 판정이 오르내리고, 그게 깜빡임의 직접 원인이었다.
    // docs/issue/2026-09-07-thinking-indicator-flicker.md
    const messages = all.filter((m) => !(m && m.pending));
    const r = GT.store.applyHarvest(messages, { title: cleanTitle(p.title), path: p.path });
    if (r.mode === 'merge' && r.kept) {
      // 원본이 앞쪽 턴을 안 그린 상태다. 우리가 이미 가진 것을 지켜서 넘어간다.
      GT.log(`수확이 ${r.kept}건 적게 봤다 — 기존 레코드를 유지한다`);
    }
    const verdict = GT.health.fiberVerdict(p.fiberEligible || 0, p.fiberHits || 0);
    if (verdict === 'broken') {
      GT.health.CHECKS.fiber.ok = false;
      GT.health.soft('fiber 에서 마크다운 원문을 읽지 못했습니다 — 렌더된 텍스트로 대체합니다(서식 손실)');
    } else if (verdict === 'partial') {
      GT.health.soft(`마크다운 원문을 ${p.fiberEligible - p.fiberHits}/${p.fiberEligible} 건 못 읽었다`);
    } else if (verdict === 'ok') {
      GT.health.CHECKS.fiber.ok = true;
    }
  });

  GT.on('thinking', () => GT.store.thinking());

  // 그림을 만들기 시작했다. 스트림에서만 오는 신호다 —
  // 원본은 이 메시지를 [data-message-id] 로 그리지 않아 DOM 수확으로는 못 본다.
  let drewThisTurn = false;
  GT.on('image', (p) => {
    if (p && p.phase === 'start') {
      drewThisTurn = true;
      if (GT.store.drawing(true)) GT.skin.current.render();
      GT.log('그림을 만들기 시작했다', p.id || '');
    }
  });
  GT.on('user', (p) => GT.store.userSent(p.text, p.id));
  GT.on('begin', (p) => GT.store.begin(p));
  GT.on('delta', (p) => GT.store.delta(p.id, p.text));
  GT.on('end', (p) => {
    GT.store.end(p.id, p.text);
    // 응답이 끝났는데 본문을 한 번도 못 잡았다 = 판별자가 낡았다.
    if (p.began === false && (p.skipped || []).length) {
      GT.health.soft(`최종 응답을 찾지 못했습니다 — 건너뛴 종류: ${p.skipped.join(', ')}. 판별자가 낡았을 수 있습니다`);
    }
    // add 를 못 보고 본문부터 받은 스트림. 화면은 정상이지만 해석이 어긋났다는 신호다.
    if (p.orphan) {
      GT.health.soft('스트림이 메시지 생성(add) 없이 본문부터 보냈다 — 자리를 만들어 이어붙였다');
    }
    // 스트림에서 본문을 하나도 못 받았다. 화면을 비워두는 대신 정본(API)에서 다시 읽는다.
    // 스트림은 반응성용이고, 대화 원본이 정답이다.
    if (p.began === false) {
      setTimeout(() => pull('stream-empty'), 600);
    }
    if (p.totalOps && p.unknownOps / p.totalOps > 0.2) {
      GT.health.soft(`알 수 없는 델타 op ${p.unknownOps}/${p.totalOps} — 스키마가 바뀌었을 수 있습니다`);
    }
    // 스트림이 중간에 끊겼을 때 어디서 끊겼는지 남긴다. 경고는 아니다 —
    // 드리프트 경고가 뜬 뒤 원인을 되짚을 수 있어야 한다.
    if (p.droppedOps) {
      GT.log(`본문 델타 ${p.droppedOps}개(${p.droppedChars}자)를 버렸다 — 대상 메시지를 건너뛰기로 한 상태였다`);
    }
    if (p.markers && p.markers.length) GT.log('마커 전환:', p.markers.join(' → '));
    // 그림은 스트림으로 오지 않는다(실측: 부분 이미지가 없다).
    // 다 만들어졌으면 대화 원본을 다시 읽어야 화면에 뜬다 — 안 그러면
    // 새로고침할 때까지 아무것도 안 보인다.
    if (drewThisTurn) {
      drewThisTurn = false;
      // 스트림이 끝난 직후에는 원본에 아직 파트가 안 채워져 있을 수 있다.
      // 몇 번 더 본다. 그림이 붙으면 멈춘다.
      let tries = 0;
      const chase = () => {
        tries += 1;
        pull(`image-${tries}`).then(() => {
          const has = GT.store.state.messages.some((m) => m.images && m.images.length);
          if (has || tries >= IMAGE_PULL_TRIES) {
            if (GT.store.drawing(false)) GT.skin.current.render();
            if (!has) GT.log('그림을 만들었다는 신호는 받았지만 원본에서 찾지 못했다');
            return;
          }
          setTimeout(chase, IMAGE_PULL_WAIT_MS * tries);
        });
      };
      setTimeout(chase, IMAGE_PULL_WAIT_MS);
    }

    // 스트림 결과를 fiber 원문과 대조한다
    setTimeout(() => GT.toMain('verify', { id: p.id }), 400);
    if (GT.config.get('bell') === 'visual') GT.skin.current.bell();
  });
  // fiber 가 아직 다 안 그려졌으면 몇 번 더 본다.
  // 접두사 검사로는 못 잡는다 — 인용 마커의 표기가 달라 첫 인용부터 갈라지고,
  // 애초에 접두사가 아닌 조각도 온다(실측: 본문 2488자에 fiber 312자).
  // docs/issue/2026-09-08-drift-warning-false-positive.md
  const VERIFY_RETRIES = 3;

  // 그림이 원본에 붙기까지 걸리는 시간은 그때그때 다르다. 간격을 늘려 가며 몇 번 본다.
  const IMAGE_PULL_WAIT_MS = 700;
  const IMAGE_PULL_TRIES = 4;

  GT.on('verify', (p) => {
    const rec = p.id && GT.store.state.byId.get(p.id);
    if (!rec || !p.text) return;
    const streamed = rec.text || '';
    const fiber = p.text;

    const strip = (GT.markdown && GT.markdown.stripMarks) || ((x) => x);
    const sLen = strip(streamed).length;
    const fLen = strip(fiber).length;

    // fiber 가 스트림보다 짧으면 그것은 '교정' 이 아니라 '손실' 이다.
    //
    // fiber 를 정답으로 믿고 덮어쓰던 것이 마지막 문장이 잘리는 원인이었다.
    // 원본이 화면에 그리다 만 조각인 경우가 흔하다 — 실측(2026-09-18)에서
    // 522자 응답의 fiber 가 1자, 446자 응답의 fiber 가 38자였다.
    // innerText 도 같은 값이라 DOM 자체가 그만큼만 그려져 있었다.
    //
    // 예전에는 비율(절반 미만)로 걸렀는데, 그러면 50~99% 인 조각이 통과해
    // 뒤쪽을 잘라먹었다. 부분 렌더는 앞에서부터 채워지므로 빠지는 것은 늘 뒤다.
    // 비율이 아니라 방향을 본다.
    // docs/issue/2026-09-18-last-sentence-truncated.md
    const shorter = sLen > 0 && fLen < sLen;

    if (shorter) {
      // 아직 그리는 중일 수 있다. 간격을 늘려 가며 몇 번 더 본다.
      rec.verifyTries = (rec.verifyTries || 0) + 1;
      if (rec.verifyTries <= VERIFY_RETRIES) {
        setTimeout(() => GT.toMain('verify', { id: p.id }), 900 * rec.verifyTries);
        return;
      }
      // 여러 번 봐도 짧으면 그걸 정답이라 부르지 않는다. 스트림을 지킨다.
      GT.log(`fiber 가 스트림보다 짧다 (${fLen}/${sLen}) — 스트림 본문을 지킨다`);
      return;
    }

    // 여기까지 왔으면 fiber 가 스트림만큼 길거나 더 길다. 그때만 교정으로 받는다.
    // (인용 마커가 치환되면서 길어지는 경우가 이에 해당한다)
    rec.text = fiber;
    GT.skin.current.render();
    GT.health.reconcile(streamed, fiber);
  });

  // -------------------------------------------------------------- 부팅 시퀀스
  const cfg = await GT.config.load();
  GT_SET_LOCALE(cfg.locale);        // 첫 렌더 전에 정해야 화면이 두 번 안 바뀐다

  const domReady = () => new Promise((r) => {
    if (document.body) return r();
    new MutationObserver((_, o) => { if (document.body) { o.disconnect(); r(); } })
      .observe(document.documentElement, { childList: true, subtree: true });
  });
  await domReady();

  GT.skin.use(cfg.skin);
  GT.skin.mount(cfg);

  // ------------------------------------------------------------------- 입력 처리
  // 단축키(Ctrl+\` · Ctrl+; · ⌘K · Ctrl+B)와 팝업 토글은 **스킨을 붙이자마자** 연결한다.
  //
  // 예전에는 아래 부팅 점검(tap 최대 5초 · 컴포저 최대 15초 · 스레드 최대 15초) 뒤에 연결해서,
  // 새로고침 직후 그동안 단축키도 팝업도 먹지 않았다. 컴포저를 못 찾는 화면이면 15초를 꼬박 기다렸다.
  // 실측(비로그인 ChatGPT, 2026-09-28): 새로고침 후 13.9초까지 안 먹고 16.2초부터 먹었다.
  // 점검은 '원본이 멀쩡한가' 를 보는 것이지 키를 받을 준비와는 상관이 없다.
  // 점검이 실패해 원본으로 돌아가면(degraded) toggle · show 가 스스로 거절한다.
  // docs/issue/2026-09-28-shortcuts-dead-after-refresh.md
  GT.skin.attachPrompt();
  disposers.push(() => GT.prompt.detach());

  // 켜 두었으면(설정 enabled · 옛 인스턴스에서 이어받음) 여기서 곧바로 켠다.
  // 예전에는 아래 부팅 점검(최대 35초) 뒤에 켜서, 새로고침·업데이트 뒤 그만큼 원본 화면이 보였다.
  // 단, 점검이 실패하면 원본으로 돌아가기로 한 경우(onBreak = revert)만은 점검을 기다린다 —
  // 먼저 켰다가 실패하면 켜졌다 꺼지는 깜빡임이 된다. 기본값(warn)은 실패해도 내리지 않으므로 기다릴 이유가 없다.
  // docs/issue/2026-09-28-shortcuts-dead-after-refresh.md §4
  const autoShow = !!(cfg.enabled || inherited);
  const showEarly = autoShow && cfg.onBreak !== 'revert';
  if (showEarly) GT.skin.show();

  // 동기로 응답하므로 true 를 돌려주면 안 된다.
  // true 는 "나중에 응답하겠다"는 뜻이라, 처리하지 않는 메시지의 포트가 열린 채 남아
  // "message port closed before a response was received" 가 뜬다.
  // 팝업의 '진단 복사' 와 :bug 는 같은 보고서를 쓴다 (src/content/bugs.js). 두 벌로 두면 갈린다.
  const diagText = () => GT.bugs.report();
  disposers.push(() => GT.bugs.stop());

  chrome.runtime.onMessage.addListener((msg, _s, reply) => {
    if (!msg) return;
    if (msg.kind === 'toggle') { GT.skin.toggle(); reply({ visible: GT.skin.visible() }); }
    // 팝업의 '진단 복사' — 문제를 알릴 때 붙여 넣을 글. 대화 제목 · 본문 · 주소는 넣지 않는다 (UX 조사 B6).
    else if (msg.kind === 'diag') reply({ text: diagText() });
    // 팝업의 '명령 열기' — 스킨이 꺼져 있으면 켜고 팔레트를 연다 (UX 조사 B2: 입구가 단축키뿐이면 발견성이 없다)
    else if (msg.kind === 'palette') {
      // 켜기는 사용자 토글과 같은 경로로 — 복귀 상태면 거절하고, 켜면 배지(서비스 워커)에 알린다
      if (!GT.skin.visible()) GT.skin.toggle();
      if (!GT.skin.visible()) { reply({ ok: false }); return; }
      GT.commands.openPalette();
      reply({ ok: true, visible: GT.skin.visible() });
    }
    else if (msg.kind === 'state') reply({ visible: GT.skin.visible(), degraded: GT.health.degraded,
      warned: GT.health.warned, reasons: GT.health.reasons });
  });
  // 생성의 시작과 끝을 스크린리더에 알린다 (가장자리에서만 — 토큰마다가 아니다).
  let wasStreaming = false;
  GT.store.onChange(() => {
    const now = !!GT.store.state.streamingId;
    if (now !== wasStreaming) { wasStreaming = now; GT.skin.announce(GT_T(now ? 'status.answering' : 'status.answered')); }
    GT.skin.current.render();
  });
  GT.config.onChange((c) => {
    GT_SET_LOCALE(c.locale);
    // 옵션 화면에서 스킨을 바꾸면 열려 있는 탭도 바로 따라간다. 저장은 이미 됐다.
    if (c.skin && c.skin !== GT.skin.current.id && GT.skins.get(c.skin)) {
      GT.skin.switch(c.skin, { persist: false });
      return;
    }
    GT.skin.current.applyConfig(c);          // epoch 이 올라가 모든 노드를 다시 만든다
    GT.skin.current.render();
  });
  // 추론 수준이 바뀌는 동안 상단바가 즉시 따라오게 한다 (1초 틱을 기다리지 않는다)
  if (GT.picker && GT.picker.onChange) GT.picker.onChange(() => GT.skin.current.renderChrome());

  function cleanTitle(t) {
    return String(t || '').replace(/\s*[-–—]\s*ChatGPT\s*$/i, '').replace(/^ChatGPT$/i, '');
  }


  // ------------------------------------------------------------------ 부팅 점검
  const waitFor = (sel, ms) => new Promise((res) => {
    const hit = () => document.querySelector(sel);
    if (hit()) return res(true);
    const t = setTimeout(() => { obs.disconnect(); res(false); }, ms);
    const obs = new MutationObserver(() => { if (hit()) { clearTimeout(t); obs.disconnect(); res(true); } });
    obs.observe(document.documentElement, { childList: true, subtree: true });
  });

  // tap 부터 확인한다. 실패하면 다른 점검을 15초씩 기다릴 이유가 없다.
  const waitTap = async (ms) => {
    const until = Date.now() + ms;
    while (!tapSeen && Date.now() < until) {
      GT.toMain('ping');
      await new Promise((r) => setTimeout(r, 250));
    }
    return tapSeen;
  };
  if (!(await waitTap(5000))) {
    GT.health.fail('tap', 'MAIN world 스크립트가 5초 안에 응답하지 않았다');
  }

  const okComposer = await waitFor(GT.compose.SELECTOR, 15000);
  okComposer ? GT.health.pass('composer')
             : GT.health.fail('composer', '15초 안에 나타나지 않았다');

  const okThread = await waitFor('#thread, main', 15000);
  okThread ? GT.health.pass('thread') : GT.health.fail('thread', '찾지 못했습니다');

  // 실제로 원본 UI 로 돌아간 경우에만 멈춘다.
  // onBreak 가 warn/ignore 면 문제를 안고서도 계속 간다 — 사용자가 그렇게 고른 것이다.
  if (GT.health.degraded) return;

  // pagehide 에서는 해체하지 않는다.
  // 진짜 언로드면 어차피 문서가 사라지므로 정리할 이유가 없고,
  // bfcache 로 들어간 것이라면 페이지가 되살아나는데 우리는 이미 자폭한 뒤다.
  // 해체는 '확장이 다시 로드됐다'는 신호 하나에만 반응한다.

  // 사이드바 — 최초 로드, 대화 전환 시 갱신, 창 크기 변화 시 표시 여부 재계산
  if (GT.sidebar.shouldShow()) GT.sidebar.refresh();
  listen(window, 'resize', () => {
    GT.skin.current.syncSidebar();
    if (GT.sidebar.element && GT.sidebar.element.isConnected) GT.sidebar.draw();
  });


  // 라우팅(SPA) — 대화가 바뀌면 다시 수확한다
  let lastPath = location.pathname;
  every(600, () => {
    if (location.pathname !== lastPath) {
      lastPath = location.pathname;
      if (GT.conversation.idFromPath()) {
        pull('route').then((ok) => { if (!ok) GT.toMain('harvest'); });
      } else {
        // 새 대화 화면(/). 수확할 대화가 없다 — 수확을 기다리지 말고 바로 비운다.
        // 안 비우면 본문만 사라지고 상단바·탭에 이전 대화 제목이 남는다.
        GT.store.replaceAll([], { path: location.pathname, title: '' });
      }
      GT.sidebar.draw();                 // 현재 대화 강조를 옮긴다
      // 기록은 대화마다 다르다. 위치를 그대로 두면 엉뚱한 줄을 가리킨다.
      GT.prompt.resetHistory();
    }
  });
  // 이 틱의 목적은 시계와 경과시간이다. 본문을 갈아엎을 이유가 없다.
  every(1000, () => { if (GT.skin.visible()) GT.skin.current.renderChrome(); });

  // '생각 중' 은 이벤트의 가장자리가 아니라 상태에서 끌어낸다.
  //
  // 마커(cot_token → user_visible_token)는 118ms 간격으로 붙어 오고, 수확의
  // pending 은 원본의 렌더 사정에 따라 오르내린다. 둘 다 '지금 모델이 일하고
  // 있는가' 를 나타내는 신호가 아니라서, 그 가장자리를 쓰면 깜빡인다.
  // 정본은 원본의 중단 버튼이다 — esc 중단도 같은 것을 본다.
  // docs/issue/2026-09-07-thinking-indicator-flicker.md
  every(200, () => {
    const generating = !!GT.compose.stopButton();
    const want = generating && !GT.store.state.streamingId;
    if (GT.store.setThinking(want)) GT.skin.current.render();
  });
  // 회전자는 더 자주 돈다. 렌더가 아니라 해당 노드의 글자만 바꾸므로 싸다.
  every(90, () => { if (GT.skin.visible()) GT.skin.current.tick(); });

  // 확장이 다시 로드됐는지 지켜본다. 감지되면 조용히 물러난다.
  every(4000, () => { if (!contextAlive()) shutdown('확장이 다시 로드됨'); });

  // 대화 본문은 백엔드에서 직접 읽는 게 정답이다.
  // DOM 은 원본이 그려준 만큼만 보여준다(진입 경로에 따라 앞쪽 턴이 통째로 빠진다).
  // 실패하면 DOM 수확으로 내려간다.
  async function pull(why) {
    const id = GT.conversation.idFromPath();
    if (!id) return false;
    try {
      const conv = await GT.conversation.load(id);
      if (!conv) return false;
      GT.store.applyHarvest(conv.messages, { title: conv.title, path: location.pathname });
      GT.log(`대화 원본 ${conv.messages.length}건 (${why})`);
      return true;
    } catch (e) {
      GT.log('대화 원본 API 실패 — DOM 수확으로 내려간다:', e.message);
      return false;
    }
  }

  // 첫 로드 — API 를 먼저 시도하고, 안 되면 원본이 스레드를 붙일 시간을 주고 수확한다
  pull('boot').then((ok) => { if (!ok) setTimeout(() => GT.toMain('harvest'), 1200); });

  // 원본은 턴을 한 번에 다 그리지 않는다(진입 경로에 따라 앞쪽이 늦게 붙거나 아예 안 붙는다).
  // 한 번 수확하고 끝내면 그 차이가 그대로 스크롤백의 구멍이 된다.
  // 그래서 메시지 노드 집합이 변할 때마다 다시 수확한다.
  (function watchThread() {
    const countMsgs = () => document.querySelectorAll('[data-message-id]').length;
    let last = countMsgs();
    let timer = 0;
    const obs = new MutationObserver(() => {
      const now = countMsgs();
      if (now === last) return;
      last = now;
      clearTimeout(timer);
      timer = setTimeout(() => GT.toMain('harvest'), 400);
    });
    const root = document.getElementById('thread') || document.querySelector('main');
    if (root) observe(obs, root, { childList: true, subtree: true });
  })();

  if (autoShow && !showEarly) GT.skin.show();   // onBreak = revert — 점검을 통과한 뒤에 켠다
  // 배지·팝업이 실제 상태를 알아야 한다. 이걸 안 보내면 서비스 워커가
  // '점검이 멀쩡하니 켜져 있겠지' 로 추측한다 — 기본이 꺼짐이 되면서 그 추측이 틀리게 됐다.
  GT.sendToSW({ kind: 'visible', visible: GT.skin.visible() });
  GT.health.report();
  GT.skin.current.system('info', `gpt-skin ${GT_VERSION} · build ${GT_BUILD} — :help 로 명령, ^\` 로 원본 토글`,
    null, { quiet: true });
})();

// 이 파일의 마지막 값이 Promise 면 안 된다. 서비스워커의 재주입(chrome.scripting.executeScript)은
// 주입한 파일의 마지막 식이 Promise 면 그것이 끝날 때까지 기다린다. 부팅은 컴포저·스레드를
// 최대 수십 초 기다리므로, 그동안 다음 주입(MAIN 의 tap)이 줄 서서 멈췄다.
// 실측(헤드리스 크롬, 2026-09-28): 재주입 한 번에 30,276ms 가 걸렸다.
// docs/issue/2026-09-28-reinject-after-update.md
void 0;
