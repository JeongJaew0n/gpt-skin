// UX 후속 묶음 2 — 단축키: 물리 키 토글 · ⌘/Ctrl+⇧S 사이드바 · chrome.commands · 팝업 단축키 링크
// docs/plan/2026-09-29-ux-followup.md
import fs from 'node:fs'; import vm from 'node:vm';

const results = []; const t = (n, ok) => results.push([n, ok]);
const read = (f) => fs.readFileSync(f, 'utf8');

function prompt() {
  const calls = { toggle: 0, sidebar: 0 };
  const input = new EventTarget();
  Object.assign(input, { value: '', selectionStart: 0, selectionEnd: 0, style: {}, setSelectionRange() {}, focus() {} });
  const win = new EventTarget();
  const sb = { console, Object, Array, String, JSON, Promise, setTimeout, AbortController, Event, window: win };
  vm.createContext(sb);
  sb.GT = {
    skin: { visible: () => true, current: { setSuggest() {}, setMode() {}, syncFocus() {}, system() {}, focus() {} } },
    store: { isStreaming: () => false, userHistory: () => [], userSent() {} },
    commands: { parse: () => null, complete: () => ({ candidates: [] }), applyCompletion: () => null, run: async () => false, openPalette() {} },
    compose: { send: async () => ({ ok: true }), stop: () => false, stopButton: () => null },
    health: { soft() {} },
    sidebar: { selecting: false, isOpen: () => false, filtering: false, element: null, toggle: () => { calls.sidebar++; } },
    palette: { isOpen: () => false }
  };
  vm.runInContext(read('src/content/shell/prompt.js'), sb, { filename: 'prompt.js' });
  sb.GT.prompt.attach({ el: input, autosize() {} }, { toggle: () => { calls.toggle++; }, capturesTyping: true });
  const key = (props) => {
    const e = new Event('keydown', { cancelable: true });
    Object.assign(e, { isComposing: false, keyCode: 0, shiftKey: false, ctrlKey: false, metaKey: false, altKey: false, key: '', code: '' }, props);
    win.dispatchEvent(e); return e;
  };
  return { calls, key };
}

{
  const p = prompt();
  p.key({ key: '`', code: 'Backquote', ctrlKey: true });
  t('Ctrl+` 로 토글한다', p.calls.toggle === 1);
  p.key({ key: '₩', code: 'Backquote', ctrlKey: true });
  t('맥 한글 입력 모드(키가 ₩)에서도 토글한다', p.calls.toggle === 2);
  p.key({ key: '`', code: 'Backquote', ctrlKey: true, metaKey: true });
  t('⌘ 가 섞이면 토글하지 않는다', p.calls.toggle === 2);
  p.key({ key: '`', code: 'Digit1', ctrlKey: true });
  t('다른 자리의 키는 토글하지 않는다', p.calls.toggle === 2);
}
{
  const p = prompt();
  const e = p.key({ key: 'S', code: 'KeyS', shiftKey: true, metaKey: true });
  t('⌘⇧S 로 사이드바를 여닫는다 (원본과 같은 키)', p.calls.sidebar === 1 && e.defaultPrevented);
  p.key({ key: 'S', code: 'KeyS', shiftKey: true, ctrlKey: true });
  t('Ctrl+⇧S 도 (윈도우)', p.calls.sidebar === 2);
  p.key({ key: 's', code: 'KeyS', metaKey: true });
  t('⇧ 없는 ⌘S 는 건드리지 않는다 (저장 키)', p.calls.sidebar === 2);
  p.key({ key: 'b', code: 'KeyB', ctrlKey: true });
  t('Ctrl+B 는 그대로 된다 (손버릇 유지)', p.calls.sidebar === 3);
}

// ---------------------------------------------------------------- chrome.commands
{
  const mf = JSON.parse(read('manifest.json'));
  const c = mf.commands && mf.commands['toggle-skin'];
  t('매니페스트에 toggle-skin 명령', !!c);
  t('기본 키를 주지 않는다 (실측하지 않은 키와 겹치지 않게)', c && !c.suggested_key);
  t('설명은 사전에서 (ko · en)', c && c.description === '__MSG_cmdToggleSkin__'
    && JSON.parse(read('_locales/ko/messages.json')).cmdToggleSkin && JSON.parse(read('_locales/en/messages.json')).cmdToggleSkin);
  t('권한을 늘리지 않는다', JSON.stringify(mf.permissions) === '["storage"]' || (mf.permissions || []).every((p) => p !== 'commands'));

  // 서비스 워커가 명령을 받아 지금 탭에 toggle 을 보낸다
  let onCommand = null; const sent = [];
  const chrome = {
    runtime: { onMessage: { addListener() {} }, onInstalled: { addListener() {} }, lastError: null, reload() {}, getManifest: () => ({ content_scripts: [] }) },
    commands: { onCommand: { addListener: (fn) => { onCommand = fn; } } },
    storage: { session: { get: async () => ({}), set: async () => {}, remove: async () => {} } },
    tabs: { query: async () => [{ id: 9 }], sendMessage: (id, msg, cb) => { sent.push({ id, msg }); cb && cb(); }, reload: async () => {},
            onRemoved: { addListener() {} }, onUpdated: { addListener() {} } },
    scripting: { executeScript: async () => [] },
    action: { setBadgeText: async () => {}, setBadgeBackgroundColor: async () => {}, setTitle: async () => {} }
  };
  const sb = { console, Map, Set, Object, Promise, Array, String, Error, chrome, setTimeout };
  vm.createContext(sb);
  vm.runInContext(read('src/background/service-worker.js'), sb, { filename: 'service-worker.js' });
  t('서비스 워커가 명령을 듣는다', typeof onCommand === 'function');
  if (onCommand) {
    onCommand('toggle-skin', { id: 4 });
    t('명령이 온 탭에 toggle 을 보낸다', sent.some((s) => s.id === 4 && s.msg.kind === 'toggle'));
    onCommand('다른-명령', { id: 4 });
    t('모르는 명령은 무시한다', sent.length === 1);
    onCommand('toggle-skin', undefined);
    await new Promise((r) => setTimeout(r, 0));
    t('탭 정보가 없으면 지금 탭을 찾아 보낸다', sent.some((s) => s.id === 9));
  }
}

// ---------------------------------------------------------------- 팝업
{
  const html = read('src/popup/popup.html');
  const js = read('src/popup/popup.js');
  t('팝업에 단축키 링크', /id="shortcuts"/.test(html));
  t('크롬 단축키 화면을 연다', /chrome\.tabs\.create\(\{ url: 'chrome:\/\/extensions\/shortcuts' \}\)/.test(js));
}

let bad = 0;
results.forEach(([n, ok]) => { if (!ok) bad++; console.log(`  ${ok ? 'PASS' : 'FAIL'}  ${n}`); });
console.log(bad ? `\n${bad}건 실패` : '\n전부 통과');
process.exit(bad ? 1 : 0);
