// 프롬프트 입력 컨트롤러 — 스킨이 여럿이어도 키 처리는 한 벌이다.
// docs/plan/2026-09-24-skin-architecture.md §2.4 (1단계)
import fs from 'node:fs'; import vm from 'node:vm';

const prm = fs.readFileSync('src/content/shell/prompt.js', 'utf8');
const idx = fs.readFileSync('src/content/index.js', 'utf8');
const mf = JSON.parse(fs.readFileSync('manifest.json', 'utf8'));
const results = []; const t = (n, ok) => results.push([n, ok]);

// ---------------------------------------------------------------- 배치 (정적)
{
  const js = mf.content_scripts.find((c) => c.world === 'ISOLATED').js;
  const iP = js.indexOf('src/content/shell/prompt.js');
  t('매니페스트에 있다', iP >= 0);
  t('index.js 보다 먼저 로드된다', iP >= 0 && iP < js.indexOf('src/content/index.js'));
  t('preflight 가 GT.prompt 를 확인한다', /'health', 'prompt'\]/.test(idx));

  // 입력 로직이 index.js 에 다시 생기면 한 벌이 두 벌이 된다
  t('index.js 에 IME 가드가 없다', !/isComposing/.test(idx));
  t('index.js 가 입력 위젯에 리스너를 붙이지 않는다', !/input\.addEventListener/.test(idx));
  t('index.js 가 GT.tty.ui.input 을 만지지 않는다', !/GT\.tty\.ui\.input/.test(idx));
  t('prompt.js 는 스킨의 DOM(ui) 을 들여다보지 않는다', !/GT\.tty\.ui\b/.test(prm));
  t('index.js 가 해체 때 detach 한다', /disposers\.push\(\(\) => GT\.prompt\.detach\(\)\)/.test(idx));
}

// ---------------------------------------------------------------- 실제로 돌린다
//
// Node 의 EventTarget 은 addEventListener 의 signal 을 지원한다. 브라우저와 같은 규칙으로
// 떼어지는지 여기서 본다.
function boot({ capturesTyping = true } = {}) {
  const calls = { run: [], send: [], suggest: [], focus: 0, toggle: 0 };
  const input = new EventTarget();
  Object.assign(input, { value: '', selectionStart: 0, selectionEnd: 0, style: {},
    setSelectionRange(a, b) { this.selectionStart = a; this.selectionEnd = b; }, focus() {} });
  const win = new EventTarget();
  const sb = {
    console, Object, Array, String, JSON, Promise, setTimeout, AbortController, Event,
    window: win,
    GT: {
      tty: { setSuggest: (l) => calls.suggest.push(l), setMode() {}, syncCursorFocus() {}, system() {},
             focus: () => { calls.focus++; }, visible: () => true },
      store: { isStreaming: () => false, userHistory: () => ['첫째', '둘째'], userSent() {} },
      commands: { parse: (l) => /^:/.test(l), complete: () => ({ candidates: [] }), applyCompletion: () => null,
                  run: async (x) => { calls.run.push(x); return x.startsWith(':'); }, openPalette() {} },
      compose: { send: async (x) => { calls.send.push(x); return { ok: true }; }, stop: () => false, stopButton: () => null },
      health: { soft() {} },
      sidebar: { selecting: false, isOpen: () => false, filtering: false, element: null, toggle() {} },
      palette: { isOpen: () => false }
    }
  };
  vm.createContext(sb);
  vm.runInContext(prm, sb, { filename: 'prompt.js' });
  sb.GT.prompt.attach({ el: input, autosize() {} }, { toggle: () => { calls.toggle++; }, capturesTyping });
  const key = (target, props) => {
    const e = new Event('keydown', { cancelable: true });
    Object.assign(e, { isComposing: false, keyCode: 0, shiftKey: false, ctrlKey: false, metaKey: false, altKey: false }, props);
    target.dispatchEvent(e);
    return e;
  };
  const tick = () => new Promise((r) => setTimeout(r, 0));
  return { P: sb.GT.prompt, input, win, calls, key, tick };
}

{
  const { P, input, calls, key, tick } = boot();
  t('attach 뒤에는 붙어 있다', P.attached === true);

  input.value = ':help';
  key(input, { key: 'Enter' });
  await tick();
  t('Enter 가 명령을 실행한다', calls.run[0] === ':help');
  t('명령이면 보내지 않는다', calls.send.length === 0);
  t('보내고 나면 입력줄을 비운다', input.value === '');

  input.value = '안녕';
  key(input, { key: 'Enter' });
  await tick(); await tick();
  t('명령이 아니면 원본으로 보낸다', calls.send[0] === '안녕');

  input.value = ':rename 안';
  key(input, { key: 'Enter', isComposing: true, keyCode: 229 });
  await tick();
  t('조합 중 Enter 는 아무것도 안 한다', calls.run.length === 2 && input.value === ':rename 안');

  input.value = '';
  key(input, { key: 'ArrowUp' });
  t('↑ 가 마지막 기록을 불러온다', input.value === '둘째');
  key(input, { key: 'ArrowUp' });
  t('한 번 더 ↑ 는 그 앞', input.value === '첫째');
  P.resetHistory();
  input.value = '';
  key(input, { key: 'ArrowUp' });
  t('resetHistory 뒤에는 처음부터', input.value === '둘째');

  // detach — 이게 되어야 스킨을 바꿀 때 옛 위젯에 핸들러가 남지 않는다
  P.detach();
  t('detach 뒤에는 떨어져 있다', P.attached === false);
  const before = calls.run.length;
  input.value = ':ls';
  key(input, { key: 'Enter' });
  await tick();
  t('detach 뒤 입력줄 Enter 는 반응하지 않는다', calls.run.length === before && input.value === ':ls');
}

{
  const { P, win, calls, key } = boot();
  key(win, { key: '`', ctrlKey: true });
  t('Ctrl+` 가 넘겨받은 toggle 을 부른다', calls.toggle === 1);
  P.detach();
  key(win, { key: '`', ctrlKey: true });
  t('detach 뒤 전역 키는 반응하지 않는다', calls.toggle === 1);
}

{
  // 아무 데서나 타이핑하면 입력줄로 — 원본을 가리는 스킨에서만
  const on = boot({ capturesTyping: true });
  on.key(on.win, { key: 'a', composedPath: () => [{ closest: () => null }] });
  t('capturesTyping 이면 글자를 입력줄로 옮긴다', on.input.value === 'a' && on.calls.focus === 1);

  const off = boot({ capturesTyping: false });
  const e = off.key(off.win, { key: 'a', composedPath: () => [{ closest: () => null }] });
  t('capturesTyping=false 면 글자를 가로채지 않는다', off.input.value === '' && !e.defaultPrevented);
}

{
  // 다시 attach 하면 이전 것을 떼어 낸다. 스킨을 바꿀 때마다 핸들러가 쌓이면 안 된다.
  // 전송 횟수로는 못 본다 — 첫 핸들러가 입력줄을 비우면 둘째는 빈 줄을 보고 멈춘다.
  // 입력줄을 거치지 않는 전역 키(Ctrl+`)로 센다.
  const { P, input, win, calls, key } = boot();
  P.attach({ el: input, autosize() {} }, { toggle: () => { calls.toggle++; } });
  key(win, { key: '`', ctrlKey: true });
  t('두 번 attach 해도 핸들러는 한 벌', calls.toggle === 1);
}

let bad = 0;
results.forEach(([n, ok]) => { if (!ok) bad++; console.log(`  ${ok ? 'PASS' : 'FAIL'}  ${n}`); });
console.log(bad ? `\n${bad}건 실패` : '\n전부 통과');
process.exit(bad ? 1 : 0);
