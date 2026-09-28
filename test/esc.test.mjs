// esc 의 우선순위 — 열린 층을 먼저 닫고, 닫을 층이 없을 때만 생성을 멈춘다.
// 전역 처리기는 캡처 단계라 입력줄 · 팔레트보다 먼저 돈다. 예전에는 거기서 곧바로 생성을 멈춰,
// 후보 목록이나 팔레트를 닫으려던 esc 가 답까지 끊었다 (UX 조사 2026-09-28 에서 재현).
// docs/issue/2026-09-29-esc-stops-generation.md
import fs from 'node:fs'; import vm from 'node:vm';

const results = []; const t = (n, ok) => results.push([n, ok]);
const read = (f) => fs.readFileSync(f, 'utf8');

function boot({ generating = true, paletteOpen = false, escapeHides = false, visible = true, history = [] } = {}) {
  const calls = { stop: 0, suggestClosed: 0, hide: 0 };
  let vis = visible;
  const input = new EventTarget();
  Object.assign(input, { value: '', selectionStart: 0, selectionEnd: 0, style: {},
    setSelectionRange(a, b) { this.selectionStart = a; this.selectionEnd = b; }, focus() {} });
  const win = new EventTarget();
  const sb = { console, Object, Array, String, JSON, Promise, setTimeout, AbortController, Event, window: win };
  vm.createContext(sb);
  sb.GT = {
    skin: { visible: () => vis, hide: () => { calls.hide++; vis = false; },
            current: { setSuggest: (l) => { if (!l) calls.suggestClosed++; }, setMode() {}, syncFocus() {}, system() {}, focus() {} } },
    store: { isStreaming: () => generating, userHistory: () => history, userSent() {} },
    commands: { parse: (l) => /^:/.test(l), complete: () => ({ candidates: [':ls', ':load'], kind: 'command', token: ':l' }),
                applyCompletion: () => null, run: async () => true, openPalette() {} },
    compose: { send: async () => ({ ok: true }), stop: () => { calls.stop++; return true; }, stopButton: () => (generating ? {} : null) },
    health: { soft() {} },
    sidebar: { selecting: false, isOpen: () => false, filtering: false, element: null, toggle() {} },
    palette: { isOpen: () => paletteOpen }
  };
  vm.runInContext(read('src/content/shell/prompt.js'), sb, { filename: 'prompt.js' });
  sb.GT.prompt.attach({ el: input, autosize() {} }, { capturesTyping: !escapeHides, escapeHides });
  // 브라우저의 전파 순서: window(캡처) → 대상(입력줄). 앞에서 막았으면 뒤에도 막힌 채로 간다.
  const esc = () => {
    const mk = () => Object.assign(new Event('keydown', { cancelable: true }),
      { key: 'Escape', code: 'Escape', isComposing: false, keyCode: 27, ctrlKey: false, metaKey: false, altKey: false, shiftKey: false });
    const a = mk(); win.dispatchEvent(a);
    const b = mk(); if (a.defaultPrevented) b.preventDefault(); input.dispatchEvent(b);
  };
  const key = (k) => input.dispatchEvent(Object.assign(new Event('keydown', { cancelable: true }),
    { key: k, isComposing: false, keyCode: 0, ctrlKey: false, metaKey: false, altKey: false, shiftKey: false }));
  return { input, calls, esc, key, sb };
}

{
  const b = boot();
  b.input.value = ':l'; b.input.dispatchEvent(new Event('input'));       // 후보가 뜬다
  b.esc();
  t('생성 중 후보를 닫는 esc 는 생성을 멈추지 않는다', b.calls.stop === 0 && b.calls.suggestClosed >= 1);
  b.input.value = '';
  b.esc();
  t('닫을 것이 없으면 그다음 esc 가 생성을 멈춘다', b.calls.stop === 1);
}
{
  const b = boot({ history: ['이전 질문'] });
  b.input.value = '쓰던 초안';
  b.key('ArrowUp');
  t('전제: ↑ 로 기록을 불러왔다', b.input.value === '이전 질문');
  b.esc();
  t('기록을 보다가 누른 esc 는 초안으로 돌아가고 생성은 그대로', b.input.value === '쓰던 초안' && b.calls.stop === 0);
}
{
  const b = boot({ paletteOpen: true });
  b.esc();
  t('팔레트가 열려 있으면 esc 는 팔레트 몫 (생성은 그대로)', b.calls.stop === 0);
}
{
  const b = boot();
  b.esc();
  t('열린 층이 없으면 esc 한 번에 생성을 멈춘다 (예전 동작 유지)', b.calls.stop === 1);
}
{
  const b = boot({ generating: false });
  b.esc();
  t('생성 중이 아니면 멈출 것도 없다', b.calls.stop === 0);
}
{
  // none: 명령줄이 열려 있고 비어 있으면 esc 는 명령줄을 닫는다
  const b = boot({ escapeHides: true });
  b.esc();
  t('none 명령줄이 열려 있으면 esc 는 명령줄을 닫고 생성은 그대로', b.calls.hide === 1 && b.calls.stop === 0);
}
{
  // none: 명령줄에 쓰던 글이 있으면 닫지 않는다 — 그때의 esc 는 생성 중단으로 간다
  const b = boot({ escapeHides: true });
  b.input.value = ':ren';
  b.esc();
  t('none 명령줄에 글이 있으면 닫지 않고 생성을 멈춘다', b.calls.hide === 0 && b.calls.stop === 1);
}
{
  const src = read('src/content/shell/prompt.js');
  const iLayer = src.indexOf("if (e.key === 'Escape' && openLayer()) return;");
  const iStop = src.indexOf("if (e.key === 'Escape' && GT.compose.stopButton())");
  t('생성 중단보다 층 확인이 먼저다', iLayer > 0 && iStop > iLayer);
}

let bad = 0;
results.forEach(([n, ok]) => { if (!ok) bad++; console.log(`  ${ok ? 'PASS' : 'FAIL'}  ${n}`); });
console.log(bad ? `\n${bad}건 실패` : '\n전부 통과');
process.exit(bad ? 1 : 0);
