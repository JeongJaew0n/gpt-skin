// 답변 중에는 메시지 보내기를 막는다 (0.30.0)
// docs/plan/2026-10-12-block-send-while-answering.md
import fs from 'node:fs'; import vm from 'node:vm';

const results = []; const t = (n, ok) => results.push([n, ok]);
const read = (f) => fs.readFileSync(f, 'utf8');
const tick = () => new Promise((r) => setTimeout(r, 0));

// ---------------------------------------------------------------- 판정 (compose.answering)
function compose({ stop = false, streamingId = null, lastStreamAt = 0, now = 1_000_000 } = {}) {
  const sb = { console, Object, Array, String, Set, Math, JSON, Promise, Number,
    Date: { now: () => now },
    document: { querySelector: (q) => (stop && /stop/i.test(q) ? { click() {} } : null), querySelectorAll: () => [] },
    requestAnimationFrame: (f) => f() };
  sb.window = sb;
  sb.GT = { store: { state: { streamingId, lastStreamAt } } };
  vm.createContext(sb);
  vm.runInContext(read('src/content/compose.js'), sb, { filename: 'compose.js' });
  return sb.GT.compose;
}
{
  const NOW = 1_000_000;
  t('중지 버튼이 있으면 답변 중 (정본)', compose({ stop: true }).answering() === true);
  t('받는 중이고 조각이 최근이면 답변 중', compose({ streamingId: 'a', lastStreamAt: NOW - 5000, now: NOW }).answering() === true);
  const C = compose({ streamingId: 'a', lastStreamAt: NOW - 61000, now: NOW });
  t('조각이 60초 넘게 없고 중지 버튼도 없으면 막지 않는다 (끝을 놓쳐도 영영 막히지 않게)', C.answering() === false && C.STREAM_STALE_MS === 60000);
  t('아무 신호도 없으면 답변 중이 아니다', compose().answering() === false);
}

// ---------------------------------------------------------------- 입력줄 Enter (shell/prompt.js)
function prompt({ answering = false } = {}) {
  const calls = { send: [], run: [], sys: [], busy: [] };
  const input = new EventTarget();
  Object.assign(input, { value: '', selectionStart: 0, selectionEnd: 0, style: {}, setSelectionRange() {}, focus() {} });
  const win = new EventTarget();
  let busyNow = answering;
  const sb = { console, Object, Array, String, JSON, Promise, setTimeout, AbortController, Event, window: win,
    GT_T: (k) => k,
    GT: { skin: { visible: () => true, current: { setSuggest() {}, setMode() {}, syncFocus() {}, focus() {}, system: (l, x) => calls.sys.push([l, x]), setBusy: (on) => calls.busy.push(on) } },
      store: { isStreaming: () => false, userHistory: () => [], userSent() {} },
      commands: { parse: (l) => (l.startsWith(':') ? { name: l } : null), complete: () => ({ candidates: [] }), applyCompletion: () => null,
        run: async (l) => { calls.run.push(l); return l.startsWith(':'); } },
      compose: { answering: () => busyNow, send: async (x) => { calls.send.push(x); return { ok: true }; }, stopButton: () => null, stop: () => true },
      bugs: { record() {} }, health: { soft() {} },
      sidebar: { selecting: false, isOpen: () => false, filtering: false, element: null, toggle() {} }, palette: { isOpen: () => false } } };
  vm.createContext(sb);
  vm.runInContext(read('src/content/shell/prompt.js'), sb, { filename: 'prompt.js' });
  sb.GT.prompt.attach({ el: input, autosize() {} }, { toggle() {}, capturesTyping: true });
  const enter = async (text) => {
    input.value = text;
    const e = new Event('keydown', { cancelable: true });
    Object.assign(e, { key: 'Enter', code: 'Enter', shiftKey: false, ctrlKey: false, metaKey: false, altKey: false, isComposing: false, keyCode: 13 });
    input.dispatchEvent(e); await tick(); await tick();
  };
  return { P: sb.GT.prompt, calls, input, enter, setAnswering: (v) => { busyNow = v; } };
}
{
  const { calls, input, enter } = prompt({ answering: true });
  await enter('다음 질문');
  t('답변 중 Enter 는 원본에 보내지 않는다', calls.send.length === 0);
  t('쓴 글을 입력줄에 그대로 둔다', input.value === '다음 질문');
  t('막았다고 한 줄 알린다', calls.sys.length === 1 && calls.sys[0][1] === 'compose.busy.blocked');
  await enter('다음 질문');
  t('같은 답 동안 다시 쳐도 알림은 한 번', calls.sys.length === 1 && calls.send.length === 0);
}
{
  const { calls, enter } = prompt({ answering: true });
  await enter(':help');
  t('답변 중에도 명령은 실행한다 (원본에 보내지 않는 우리 일)', calls.run.includes(':help') && calls.send.length === 0 && calls.sys.length === 0);
}
{
  const { calls, input, enter } = prompt({ answering: false });
  await enter('보낼 글');
  t('답변 중이 아니면 예전처럼 보낸다', calls.send.join() === '보낼 글' && input.value === '');
}
{
  const { P, calls, enter, setAnswering } = prompt({ answering: true });
  P.setBusy(true);
  t('답변 시작을 스킨에 알린다 (자리표시)', calls.busy.at(-1) === true && P.busy === true);
  await enter('a');
  P.setBusy(false); setAnswering(true); P.setBusy(true);
  await enter('b');
  t('답이 끝나면 알림을 다시 할 수 있다 (다음 답에서 또 한 번)', calls.sys.length === 2);
  P.setBusy(false);
  t('답이 끝나면 스킨 자리표시를 되돌린다', calls.busy.at(-1) === false && P.busy === false);
}

// ---------------------------------------------------------------- 배선 · 스킨
{
  const idx = read('src/content/index.js'), skin = read('src/content/shell/skin.js');
  t('200ms 틱이 바뀔 때만 알린다', /const busyNow = GT\.compose\.answering\(\);\s*if \(busyNow !== wasBusy\) \{ wasBusy = busyNow; GT\.prompt\.setBusy\(busyNow\); \}/.test(idx));
  t('스킨 계약에 setBusy', /'setBusy',/.test(skin));
  t('답변 중에 스킨을 바꿔도 자리표시가 따라간다', /if \(GT\.prompt && GT\.prompt\.busy\) s\.setBusy\(true\);/.test(skin));
  const tty = read('src/content/skins/terminal.js'), sheet = read('src/content/skins/sheet.js'), none = read('src/content/skins/none.js');
  t('터미널 · 시트 · none 모두 자리표시를 바꾸고 되돌린다',
    /ui\.input\.placeholder = on \? GT_T\('compose\.busy\.placeholder'\) : PLACEHOLDER/.test(tty)
    && /ui\.input\.placeholder = on \? T\('compose\.busy\.placeholder'\) : T\('sheet\.fx\.placeholder'\)/.test(sheet)
    && /ui\.input\.placeholder = GT_T\(on \? 'compose\.busy\.placeholder' : 'none\.placeholder'\)/.test(none));
  const store = read('src/content/store.js');
  t('스트림 조각 시각을 begin · delta 에서 남긴다', (store.match(/state\.lastStreamAt = Date\.now\(\);/g) || []).length === 2);
  const i18n = read('src/shared/i18n.js');
  t('문구 ko · en', (i18n.match(/'compose\.busy\.placeholder'/g) || []).length === 2 && (i18n.match(/'compose\.busy\.blocked'/g) || []).length === 2);
}

let bad = 0;
results.forEach(([n, ok]) => { if (!ok) bad++; console.log(`  ${ok ? 'PASS' : 'FAIL'}  ${n}`); });
console.log(bad ? `\n${bad}건 실패` : '\n전부 통과');
process.exit(bad ? 1 : 0);
