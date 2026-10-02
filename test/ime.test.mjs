// 한글(IME) 조합 중의 Enter 는 '보내기' 가 아니라 '조합 확정' 이다.
// 이걸 전송으로 받으면 마지막 글자가 빠진 채 실행되고, 확정된 글자가 빈 입력줄에 남는다.
import fs from 'node:fs'; import vm from 'node:vm';

// 입력 처리는 2026-09-24 에 index.js 에서 shell/prompt.js 로 옮겼다.
const idx = fs.readFileSync('src/content/shell/prompt.js', 'utf8');
const results = []; const t = (n, ok) => results.push([n, ok]);

// --- 실제 소스에서 판별식을 꺼내 돌린다 (테스트용으로 다시 쓰지 않는다) ---
const line = /^\s*const composing = \(e\) => .*$/m.exec(idx);
t('판별식이 소스에 있다', !!line);
if (line) {
  const ctx = vm.createContext({});
  vm.runInContext(line[0].trim() + '; globalThis.__c = composing;', ctx);
  const composing = ctx.__c;

  t('조합 중이면 참', composing({ isComposing: true, keyCode: 229, key: 'Enter' }) === true);
  t('isComposing 만으로도 참', composing({ isComposing: true, keyCode: 13, key: 'Enter' }) === true);
  t('keyCode 229 만으로도 참 (안 채우는 브라우저 보험)',
    !!composing({ isComposing: false, keyCode: 229, key: 'Process' }));
  t('평범한 Enter 는 거짓', !composing({ isComposing: false, keyCode: 13, key: 'Enter' }));
  t('평범한 글자도 거짓', !composing({ isComposing: false, keyCode: 65, key: 'a' }));
  t('필드가 없어도 터지지 않는다', !composing({ key: 'Enter' }));
}

// --- 두 핸들러 모두 조합 중에는 손을 뗀다 ---
{
  const guards = idx.match(/if \(composing\(e\)\) return;/g) || [];
  t('입력줄과 전역 키 두 곳에 건다', guards.length === 2);

  const iInput = idx.indexOf("input.addEventListener('keydown'");
  const iGuard = idx.indexOf('if (composing(e)) return;', iInput);
  const iTab = idx.indexOf("e.key === 'Tab'", iInput);
  const iEnter = idx.indexOf("e.key === 'Enter' && !e.shiftKey", iInput);
  t('입력줄 핸들러 맨 앞에서 막는다', iGuard > iInput && iGuard < iTab && iGuard < iEnter);

  const iWin = idx.indexOf("window.addEventListener('keydown'");
  const iWinGuard = idx.indexOf('if (composing(e)) return;', iWin);
  const iToggle = idx.indexOf("e.code === 'Backquote' && e.ctrlKey", iWin);   // 2026-09-29 물리 키로
  // 단, 토글 키는 가드보다 먼저 본다 — 맥 한글 입력 상태에선 조합 중이 아니어도 keyCode 229 로 와서
  // 가드 뒤에 두면 한글일 때 Ctrl+` 가 먹지 않았다 (사용자 보고 2026-10-02, 0.20.2)
  t('토글 키는 조합 가드보다 먼저 본다', iToggle > iWin && iToggle < iWinGuard);
  // 0.21.1 — Ctrl · ⌘ 단축키도 모두 가드 앞에서 물리 키로 본다. 글자 키(esc · / 등)는 가드 뒤
  const iOpen = idx.indexOf('opts.openCode && e.ctrlKey', iWin);
  const iB = idx.indexOf("e.code === 'KeyB'", iWin);
  const iK = idx.indexOf("e.code === 'KeyK'", iWin);
  t('Ctrl · ⌘ 단축키도 가드 앞 (한글 상태)', iOpen < iWinGuard && iB < iWinGuard && iK < iWinGuard);
  t('esc 처리는 가드 뒤', iWinGuard < idx.indexOf("e.key === 'Escape' && GT.sidebar.selecting", iWin));
  t('글자로 단축키를 보지 않는다', !/e\.key === '[a-z]'/.test(idx));

  t('판별식이 두 핸들러보다 먼저 정의된다', idx.indexOf('const composing =') < iInput);
}

// --- 조합이 끝나면 후보를 다시 계산한다 ---
{
  t('compositionend 를 듣는다', /input\.addEventListener\('compositionend'/.test(idx));
  t('끝난 값으로 후보를 다시 만든다', /compositionend', \(\) => \{ autosize\(\); refreshSuggest\(\); \}/.test(idx));
}

// --- 왜 필요한지 코드에 남겼는가 ---
{
  t('증상을 주석에 적어뒀다', /':rename 안뇽' \+ Enter/.test(idx));
  t('추측이 아니라 실측이라고 적었다', /실측: 조합 중 Enter 가/.test(idx));
}

// --- 한글 입력 상태의 Ctrl+` 를 실제로 돌린다 ---
{
  let toggled = 0;
  const input = new EventTarget();
  Object.assign(input, { value: '', selectionStart: 0, selectionEnd: 0, style: {}, setSelectionRange() {}, focus() {} });
  const win = new EventTarget();
  const sb = { console, Object, Array, String, JSON, Promise, setTimeout, AbortController, Event, window: win,
    GT: { skin: { visible: () => false, current: { setSuggest() {}, setMode() {}, syncFocus() {}, system() {}, focus() {} } },
      store: { isStreaming: () => false, userHistory: () => [] },
      commands: { parse: () => false, complete: () => ({ candidates: [] }), applyCompletion: () => null, run: async () => false, openPalette() {} },
      compose: { stop: () => false, stopButton: () => null }, health: { soft() {} },
      sidebar: { selecting: false, isOpen: () => false, filtering: false, element: null, toggle() {} }, palette: { isOpen: () => false } } };
  vm.createContext(sb);
  vm.runInContext(idx, sb, { filename: 'prompt.js' });
  sb.GT.prompt.attach({ el: input, autosize() {} }, { toggle: () => { toggled++; }, capturesTyping: true });
  const press = (props) => { const e = new Event('keydown', { cancelable: true }); Object.assign(e, { key: '₩', code: 'Backquote', ctrlKey: true, metaKey: false, altKey: false, shiftKey: false, isComposing: false, keyCode: 192 }, props); win.dispatchEvent(e); return e; };
  press({});
  t('한글 모드(key ₩)에서도 Ctrl+` 로 켠다', toggled === 1);
  const e2 = press({ keyCode: 229 });
  t('keyCode 229(조합 중 표시)로 와도 켠다', toggled === 2 && e2.defaultPrevented);
  press({ isComposing: true, keyCode: 229 });
  t('조합 중에도 켠다', toggled === 3);
  press({ key: '`', altKey: true });
  t('한글 상태처럼 Alt 가 붙어 와도 켠다 (실측: ctrl · alt 둘 다 true)', toggled === 4);
  press({ metaKey: true });
  t('Cmd 가 붙으면 켜지 않는다 (다른 단축키)', toggled === 4);
  press({ ctrlKey: false, key: '₩' });
  t('Ctrl 없이 ₩ 만 치면 켜지 않는다', toggled === 4);
}

// --- 한글 상태의 Ctrl · ⌘ 단축키를 실제로 돌린다 (0.21.1) ---
// 한글이면 글자 키가 한글로 온다(b → ㅠ, k → ㅏ, c → ㅊ). Alt 가 붙어 오기도 한다 (0.20.3 실측: Backquote).
{
  const calls = { sidebar: 0, palette: 0, stop: 0 };
  const input = new EventTarget();
  Object.assign(input, { value: '', selectionStart: 0, selectionEnd: 0, style: {}, setSelectionRange() {}, focus() {} });
  const win = new EventTarget();
  const sb = { console, Object, Array, String, JSON, Promise, setTimeout, AbortController, Event, window: win,
    GT: { skin: { visible: () => true, current: { setSuggest() {}, setMode() {}, syncFocus() {}, system() {}, focus() {} } },
      store: { isStreaming: () => false, userHistory: () => [] },
      commands: { parse: () => false, complete: () => ({ candidates: [] }), applyCompletion: () => null, run: async () => false, openPalette: () => { calls.palette++; } },
      compose: { stop: () => { calls.stop++; return true; }, stopButton: () => null }, health: { soft() {} },
      sidebar: { selecting: false, isOpen: () => false, filtering: false, element: null, toggle: () => { calls.sidebar++; } }, palette: { isOpen: () => false } } };
  vm.createContext(sb);
  vm.runInContext(idx, sb, { filename: 'prompt.js' });
  sb.GT.prompt.attach({ el: input, autosize() {} }, { toggle() {}, capturesTyping: true });
  const press = (target, props) => { const e = new Event('keydown', { cancelable: true }); Object.assign(e, { ctrlKey: false, metaKey: false, altKey: false, shiftKey: false, isComposing: false, keyCode: 0 }, props); target.dispatchEvent(e); return e; };
  press(win, { key: 'ㅠ', code: 'KeyB', ctrlKey: true, altKey: true });
  t('한글 Ctrl+B (ㅠ · Alt) 로 목록을 연다', calls.sidebar === 1);
  press(win, { key: 'ㅠ', code: 'KeyB', ctrlKey: true, isComposing: true, keyCode: 229 });
  t('조합 표시가 붙어 와도 연다', calls.sidebar === 2);
  press(win, { key: 'ㅏ', code: 'KeyK', metaKey: true });
  t('한글 ⌘K (ㅏ) 로 팔레트를 연다', calls.palette === 1);
  press(win, { key: 'ㄴ', code: 'KeyS', metaKey: true, shiftKey: true });
  t('한글 ⌘⇧S 로 목록을 연다', calls.sidebar === 3);
  press(win, { key: 'ㅠ', code: 'KeyB' });
  t('Ctrl 없이 ㅠ 만 치면 아무것도 안 한다', calls.sidebar === 3);
  press(input, { key: 'ㅊ', code: 'KeyC', ctrlKey: true });
  t('한글 Ctrl+C (ㅊ) 로 생성을 멈춘다', calls.stop === 1);
  // 고른 글이 있으면 복사 — 막지도, 생성을 멈추지도 않는다 (0.26.6)
  input.value = '복사할 글'; input.selectionStart = 0; input.selectionEnd = 5;
  const cp = press(input, { key: 'c', code: 'KeyC', ctrlKey: true });
  t('고른 글이 있는 Ctrl+C 는 브라우저 복사에 맡긴다', cp.defaultPrevented === false && calls.stop === 1);
  input.selectionStart = input.selectionEnd = 5;
  const st = press(input, { key: 'c', code: 'KeyC', ctrlKey: true });
  t('고른 글이 없으면 예전처럼 생성을 멈춘다', st.defaultPrevented === true && calls.stop === 2);
  input.value = ''; input.selectionStart = input.selectionEnd = 0;
}
{
  const pal = fs.readFileSync('src/content/palette.js', 'utf8'), sbar = fs.readFileSync('src/content/sidebar.js', 'utf8');
  const sheet = fs.readFileSync('src/content/skins/sheet.js', 'utf8');
  t('팔레트 · 목록의 Ctrl+N/P 도 물리 키', /e\.code === 'KeyN'/.test(pal) && /e\.code === 'KeyP'/.test(pal) && /e\.code === 'KeyN'/.test(sbar) && /e\.code === 'KeyP'/.test(sbar));
  t('시트 ⌘C 도 물리 키', !/e\.key === 'c'/.test(sheet) && (sheet.match(/e\.code === 'KeyC'/g) || []).length === 2);
}

let bad = 0;
results.forEach(([n, ok]) => { if (!ok) bad++; console.log(`  ${ok ? 'PASS' : 'FAIL'}  ${n}`); });
console.log(bad ? `\n${bad}건 실패` : '\n전부 통과');
process.exit(bad ? 1 : 0);
