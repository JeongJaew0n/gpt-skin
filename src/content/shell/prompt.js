// gpt-skin — 프롬프트 입력 컨트롤러.
// 스킨은 입력 위젯(textarea)과 높이 조절 함수만 준다. 키 처리는 전부 여기 있다 —
// IME 가드 · ↑↓ 기록 · Tab 완성 · Enter 전송 · 전역 키.
// 스킨이 여럿이어도 이 로직은 한 벌이어야 한다. 복사하면 IME 가드가 한쪽만 고쳐진다.
// docs/plan/2026-09-24-skin-architecture.md §2.4
GT.prompt = (function () {
  'use strict';

  let input = null;
  let autosizeImpl = null;
  let ctl = null;                         // 이번 attach 의 리스너를 한 번에 떼는 AbortController
  let opts = { toggle() {}, capturesTyping: true };

  const sig = (capture) => (capture ? { capture: true, signal: ctl.signal } : { signal: ctl.signal });
  const autosize = () => { if (autosizeImpl) autosizeImpl(); };

  // 후보 목록이 떠 있는지는 여기서 기억한다. 스킨의 DOM 을 들여다보지 않는다.
  let suggestOpen = false;
  const suggest = (list, note) => { suggestOpen = !!(list && list.length); GT.tty.setSuggest(list, note); };

  let resetHistory = () => {};

  // adapter: { el, autosize }   — 스킨이 준다
  // options: { toggle, capturesTyping } — toggle 은 Ctrl+` 가 부른다.
  //   capturesTyping=false 면 '아무 데서나 타이핑하면 입력줄로' 를 끈다 (원본을 가리지 않는 스킨).
  function attach(adapter, options) {
    detach();
    input = adapter.el;
    autosizeImpl = adapter.autosize || null;
    opts = { ...opts, ...(options || {}) };
    ctl = new AbortController();
    wire();
  }

  function detach() {
    if (ctl) ctl.abort();
    ctl = null;
    resetHistory();
    input = null;
    autosizeImpl = null;
    suggestOpen = false;
  }

  function wire() {
    // ------------------------------------------------------------------- 입력 처리

    // 명령을 치는 동안 후보를 보여준다. 메시지를 칠 때는 방해하지 않는다.
    function refreshSuggest() {
      const line = input.value;
      if (!GT.commands.parse(line) && !/^\s*:/.test(line)) { suggest(null); return; }
      const r = GT.commands.complete(line);
      if (!r.candidates.length || (r.candidates.length === 1 && r.candidates[0] === r.token)) {
        suggest(null);
        return;
      }
      suggest(r.candidates, r.kind === 'argument' ? '⇥ 완성 · 인자' : '⇥ 완성');
    }

    input.addEventListener('input', () => { autosize(); refreshSuggest(); }, sig());
    input.addEventListener('focus', () => GT.tty.setMode(GT.store.isStreaming() ? 'STREAM' : 'INSERT'), sig());
    input.addEventListener('blur', () => GT.tty.setMode(GT.store.isStreaming() ? 'STREAM' : 'NORMAL'), sig());

    // 창이 뒤로 가면 입력줄은 포커스를 유지하지만 타이핑은 이쪽으로 오지 않는다.
    // 그때도 커서를 멈춘다.
    window.addEventListener('focus', () => GT.tty.syncCursorFocus(), sig());
    window.addEventListener('blur', () => GT.tty.syncCursorFocus(), sig());

    // IME(한글) 조합 중에는 이 핸들러가 아무것도 하지 않는다.
    //
    // 조합 중의 Enter 는 '보내기' 가 아니라 '조합을 확정' 하는 키다.
    // 그걸 전송으로 받으면 마지막 글자가 아직 입력값에 없는 상태로 실행되고,
    // 우리가 입력줄을 비운 뒤에 확정된 글자가 빈 줄에 남는다.
    //   ':rename 안뇽' + Enter → ':rename 안' 이 실행되고 입력줄에 '뇽' 이 남는다
    // 실측: 조합 중 Enter 가 평범한 Enter 와 똑같이 명령을 실행했다.
    // e.isComposing 이 정본이고, keyCode 229 는 이를 안 채우는 브라우저용 보험이다.
    const composing = (e) => e.isComposing || e.keyCode === 229;

    // ------------------------------------------------------- 프롬프트 기록 (↑↓)
    //
    // 원본에 없는 기능이다. 셸처럼 이전에 보낸 것을 되짚는다.
    // 기록은 store 에서 뽑는다(userHistory) — 새 상태를 만들지 않는다.
    //
    // histIdx 가 null 이면 '지금 쓰던 것'. 처음 ↑ 를 누를 때 그 초안을 보관했다가
    // ↓ 로 돌아오면 되돌려 준다. 그게 없으면 쓰던 걸 날린다.
    //
    // 기록 안에서 고친 내용은 다음 이동 때 버린다 — bash 처럼 항목별 편집분을
    // 들고 있지 않는다. 단순함을 택했다.
    // docs/plan/2026-09-09-cite-label-and-history.md
    let histIdx = null;
    let histDraft = '';
    const histReset = () => { histIdx = null; histDraft = ''; };

    // textarea 라 ↑↓ 는 원래 커서를 움직이는 키다. 그걸 무조건 뺏으면 여러 줄 편집이
    // 깨진다. 커서가 첫 줄(↑)·마지막 줄(↓)에 있고 선택 영역이 없을 때만 기록으로 간다.
    // 한 줄짜리 입력에서는 둘 다 참이라 늘 기록으로 간다 — 셸과 같은 감각이다.
    const caretAlone = () => input.selectionStart === input.selectionEnd;
    const onFirstLine = () => caretAlone() && !input.value.slice(0, input.selectionStart).includes('\n');
    const onLastLine = () => caretAlone() && !input.value.slice(input.selectionEnd).includes('\n');

    const histPut = (text) => {
      input.value = text;
      autosize();
      // 커서는 끝에 둔다. 불러온 것을 이어서 고치는 게 자연스럽다.
      input.setSelectionRange(text.length, text.length);
      refreshSuggest();     // ':' 로 시작하는 기록이면 후보가 다시 떠야 한다
    };

    input.addEventListener('keydown', async (e) => {
      // 조합 중에는 손대지 않는다. 그때의 ↑↓ 는 한글 후보를 고르는 키다.
      // docs/issue/2026-09-02-ime-enter-eats-last-char.md
      if (composing(e)) return;

      if (e.key === 'ArrowUp' && onFirstLine()) {
        const h = GT.store.userHistory();
        if (!h.length) return;              // 기록이 없으면 기본 동작 그대로
        e.preventDefault();
        if (histIdx === null) { histDraft = input.value; histIdx = h.length - 1; }
        else if (histIdx > 0) { histIdx -= 1; }
        else return;                        // 맨 앞이다. 더 넘어가지 않는다
        histPut(h[histIdx] || '');
        return;
      }
      if (e.key === 'ArrowDown' && onLastLine()) {
        if (histIdx === null) return;       // 기록을 보고 있지 않다
        const h = GT.store.userHistory();
        e.preventDefault();
        if (histIdx >= h.length - 1) {      // 최신에서 한 번 더 → 쓰던 초안으로
          const draft = histDraft;
          histReset();
          histPut(draft);
          return;
        }
        histIdx += 1;
        histPut(h[histIdx] || '');
        return;
      }

      if (e.key === 'Tab' && !e.shiftKey) {
        e.preventDefault();
        const next = GT.commands.applyCompletion(input.value);
        if (next != null) {
          input.value = next;
          input.setSelectionRange(next.length, next.length);
          autosize();
        }
        refreshSuggest();
        return;
      }
      if (e.key === 'Escape' && suggestOpen) {
        e.preventDefault(); suggest(null); return;
      }
      // 기록을 보고 있었으면 쓰던 초안으로 돌아간다. 보고 있지 않으면 흘려보낸다 —
      // 그래야 esc 가 생성 중단으로 간다.
      if (e.key === 'Escape' && histIdx !== null) {
        e.preventDefault();
        const draft = histDraft;
        histReset();
        histPut(draft);
        return;
      }
      if (e.key === 'Enter' && !e.shiftKey) {
        e.preventDefault();
        const text = input.value.trim();
        if (!text) return;
        input.value = ''; autosize(); suggest(null); histReset();
        const handled = await GT.commands.run(text);
        if (handled) return;
        const r = await GT.compose.send(text);
        if (!r.ok) {
          GT.health.soft(`전송 실패(${r.reason}) — 원본 컴포저를 찾지 못했습니다`);
        } else {
          // 보낸 즉시 우리도 올린다. 원본이 하는 것과 같은 낙관적 렌더다.
          //
          // 이걸 안 하면 사용자 메시지가 SSE 의 input_message 로만 들어오는데,
          // 실측에서 원본보다 약 1초 늦었다. 그 사이 '생각 중' 이 먼저 떠서
          // 질문 없이 기다리는 표시만 보인다.
          // docs/issue/2026-09-07-user-message-appears-late.md
          GT.store.userSent(text);
        }
      } else if (e.key === 'c' && e.ctrlKey) {
        e.preventDefault();
        GT.compose.stop()
          ? GT.tty.system('info', '중단 요청', null, { quiet: true })
          : GT.tty.system('warn', '중단 버튼을 찾지 못했습니다', null, { quiet: true });
      }
    }, sig());

    // 조합이 끝난 값으로 후보를 다시 계산한다.
    input.addEventListener('compositionend', () => { autosize(); refreshSuggest(); }, sig());

    // 전역 키
    window.addEventListener('keydown', (e) => {
      if (composing(e)) return;
      if (e.key === '`' && e.ctrlKey) { e.preventDefault(); opts.toggle(); return; }
      if (!GT.tty.visible()) return;
      if (e.key === 'k' && (e.metaKey || e.ctrlKey)) { e.preventDefault(); GT.commands.openPalette(); return; }
      if (e.key === 'b' && e.ctrlKey) { e.preventDefault(); GT.sidebar.toggle(); return; }

      // 글씨 크기. ⌘/Ctrl +/- 는 브라우저 가속키라 콘텐츠 스크립트가 못 막는다.
      // 그래서 Alt(⌥) 조합을 쓴다 — 브라우저가 쓰지 않고, 입력 처리에서도 이미 제외된다.
      if (e.altKey && !e.ctrlKey && !e.metaKey) {
        // e.key 로 보면 안 된다 — macOS 에서 ⌥= 는 '≠', ⌥- 는 '–', ⌥0 은 'º' 로 온다.
        // e.code 는 물리 키라 레이아웃과 수정키의 영향을 받지 않는다.
        const zoom = {
          Equal: '+', NumpadAdd: '+',
          Minus: '-', NumpadSubtract: '-',
          Digit0: 'reset', Numpad0: 'reset'
        }[e.code];
        if (zoom) { e.preventDefault(); GT.commands.run(':font ' + zoom); return; }
      }
      // 입력줄에서 이미 처리한 esc(후보 닫기)를 두 번 쓰지 않는다.
      if (e.defaultPrevented) return;
      if (e.key === 'Escape' && GT.sidebar.selecting) { e.preventDefault(); GT.sidebar.exitSelect(); return; }
      if (e.key === 'Escape' && GT.sidebar.isOpen() && !GT.palette.isOpen()) {
        e.preventDefault(); GT.sidebar.dismiss(); return;
      }
      // 그 다음이 생성 중단. '중단 버튼이 있는가' 가 생성 중인지의 정본이다 —
      // 우리 쪽이 스트림 시작을 놓쳤더라도 멈출 수 있어야 한다.
      if (e.key === 'Escape' && GT.compose.stopButton()) {
        e.preventDefault();
        GT.compose.stop();
        GT.tty.system('info', '중단 요청 (esc)', null, { quiet: true });
        return;
      }
      // 입력창이 비어 있을 때만 '/' 를 사이드바 검색으로 가로챈다.
      if (e.key === '/' && !e.metaKey && !e.ctrlKey && !GT.sidebar.filtering
          && input.value === '' && GT.sidebar.element
          && GT.sidebar.element.isConnected) {
        e.preventDefault();
        GT.sidebar.enterFilter();
        return;
      }

      // 입력창을 먼저 클릭하지 않아도 그냥 타이핑하면 들어간다.
      //
      // 포커스만 옮기고 기본 동작에 맡기면 첫 글자가 새 포커스로 갈지 브라우저 구현에 달린다.
      // 그래서 기본 동작을 막고 우리가 직접 한 글자를 넣는다 — 두 번 들어가거나 빠지는 일이 없다.
      if (e.metaKey || e.ctrlKey || e.altKey) return;
      const from = e.composedPath ? e.composedPath()[0] : e.target;
      if (from && from.closest && from.closest('input, textarea, select, [contenteditable="true"]')) return;
      const inp = input;
      if (!inp || !opts.capturesTyping) return;
      if (e.key.length === 1) {
        e.preventDefault();
        GT.tty.focus();
        inp.value += e.key;                 // 방금 포커스했으니 캐럿은 끝이다
        inp.dispatchEvent(new Event('input', { bubbles: true }));
      } else if (e.key === 'Backspace' || e.key === 'Enter') {
        GT.tty.focus();                     // 파괴적인 키는 포커스만 옮기고 맡긴다
      }
    }, sig(true));

    resetHistory = histReset;
  }

  return {
    attach,
    detach,
    // 대화를 옮기면 기록 위치를 비운다. 그대로 두면 엉뚱한 줄을 가리킨다.
    resetHistory() { resetHistory(); },
    get attached() { return !!input; }
  };
})();
