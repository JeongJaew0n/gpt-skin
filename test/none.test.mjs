// none 스킨과 스킨 전환 — 원본을 그대로 두고 명령만 쓴다.
// docs/plan/2026-09-24-skin-architecture.md §2.3 · §2.9 (5단계)
import fs from 'node:fs'; import vm from 'node:vm';

const results = []; const t = (n, ok) => results.push([n, ok]);
const read = (f) => fs.readFileSync(f, 'utf8');
const tick = () => new Promise((r) => setTimeout(r, 0));

function base(extra = {}) {
  const sb = { console, Object, Array, Map, Set, String, Number, Boolean, JSON, Math, Promise, Error, RegExp, Date,
    setTimeout, AbortController, Event, navigator: { language: 'ko' },
    chrome: { runtime: { getManifest: () => ({ version: '0.0.0' }) } }, ...extra };
  sb.window = sb.window || sb; sb.globalThis = sb;
  vm.createContext(sb);
  vm.runInContext(read('src/shared/i18n.js'), sb, { filename: 'i18n.js' });
  vm.runInContext(read('src/shared/defaults.js'), sb, { filename: 'defaults.js' });
  return sb;
}

// ---------------------------------------------------------------- 열기 키 · esc 닫기 (prompt.js)
function promptWith(options) {
  const calls = { show: 0, hide: 0, toggle: 0, sent: [] };
  let visible = !!options.visible;
  const input = new EventTarget();
  Object.assign(input, { value: '', selectionStart: 0, selectionEnd: 0, style: {}, setSelectionRange() {}, focus() {} });
  const win = new EventTarget();
  const sb = base({ window: win });
  sb.GT = {
    skin: { visible: () => visible, show: () => { calls.show++; visible = true; }, hide: () => { calls.hide++; visible = false; },
            current: { setSuggest() {}, setMode() {}, syncFocus() {}, system() {}, focus() {} } },
    store: { isStreaming: () => false, userHistory: () => [], userSent() {} },
    commands: { parse: () => null, complete: () => ({ candidates: [] }), applyCompletion: () => null, run: async () => false, openPalette() {} },
    compose: { send: async (x) => { calls.sent.push(x); return { ok: true }; }, stop: () => false, stopButton: () => null },
    health: { soft() {} },
    sidebar: { selecting: false, isOpen: () => false, filtering: false, element: null, toggle() {} },
    palette: { isOpen: () => false }
  };
  vm.runInContext(read('src/content/shell/prompt.js'), sb, { filename: 'prompt.js' });
  sb.GT.prompt.attach({ el: input, autosize() {} }, { toggle: () => calls.toggle++, capturesTyping: false, ...options.opts });
  const key = (target, props) => {
    const e = new Event('keydown', { cancelable: true });
    Object.assign(e, { isComposing: false, keyCode: 0, shiftKey: false, ctrlKey: false, metaKey: false, altKey: false, key: '', code: '' }, props);
    target.dispatchEvent(e); return e;
  };
  return { input, win, calls, key, isVisible: () => visible };
}

{
  const p = promptWith({ visible: false, opts: { openCode: 'Semicolon', escapeHides: true } });
  const e = p.key(p.win, { key: ';', code: 'Semicolon', ctrlKey: true });
  t('숨어 있을 때 Ctrl+; 가 연다', p.calls.show === 1 && e.defaultPrevented);
  p.key(p.win, { key: ';', code: 'Semicolon', ctrlKey: true });
  t('열려 있으면 Ctrl+; 는 다시 열지 않는다', p.calls.show === 1);
}
{
  const p = promptWith({ visible: false, opts: { openCode: 'Semicolon' } });
  p.key(p.win, { key: ';', code: 'Semicolon', ctrlKey: true, isComposing: true, keyCode: 229 });
  t('조합 중 Ctrl+; 는 무시한다', p.calls.show === 0);
  p.key(p.win, { key: ';', code: 'Semicolon', ctrlKey: true, metaKey: true });
  t('⌘ 가 섞이면 무시한다', p.calls.show === 0);
  p.key(p.win, { key: 'ㅣ', code: 'Semicolon', ctrlKey: true });
  t('레이아웃과 무관하게 물리 키로 본다', p.calls.show === 1);
}
{
  const p = promptWith({ visible: false, opts: {} });
  p.key(p.win, { key: ';', code: 'Semicolon', ctrlKey: true });
  t('열기 키가 없는 스킨(terminal)은 Ctrl+; 에 반응하지 않는다', p.calls.show === 0);
}
{
  const p = promptWith({ visible: true, opts: { openCode: 'Semicolon', escapeHides: true } });
  p.key(p.input, { key: 'Escape' });
  t('빈 명령줄에서 esc 는 숨긴다', p.calls.hide === 1);
}
{
  const p = promptWith({ visible: true, opts: { openCode: 'Semicolon', escapeHides: true } });
  p.input.value = ':ls';
  p.key(p.input, { key: 'Escape' });
  t('쓰던 게 있으면 esc 로 숨기지 않는다', p.calls.hide === 0);
}
{
  const p = promptWith({ visible: true, opts: { escapeHides: true } });
  const e = new Event('keydown', { cancelable: true });
  Object.assign(e, { key: 'Escape', isComposing: false, keyCode: 27, ctrlKey: false, metaKey: false, altKey: false, shiftKey: false });
  e.preventDefault();          // 전역 키가 먼저 가져갔다 (생성 중단 등)
  p.input.dispatchEvent(e);
  t('전역 키가 esc 를 가져갔으면 숨기지 않는다', p.calls.hide === 0);
}
{
  const p = promptWith({ visible: true, opts: { escapeHides: false } });
  p.key(p.input, { key: 'Escape' });
  t('escapeHides 가 아닌 스킨(terminal)은 esc 로 숨지 않는다', p.calls.hide === 0);
}
{
  const p = promptWith({ visible: true, opts: { openCode: 'Semicolon', escapeHides: true } });
  const e = p.key(p.win, { key: 'a', composedPath: () => [{ closest: () => null }] });
  t('none 은 원본에 치는 글자를 가로채지 않는다', p.input.value === '' && !e.defaultPrevented);
}

// ---------------------------------------------------------------- 숨긴 명령 (commands.js)
function commandsWith(hiddenCommands) {
  const out = [];
  let paletteItems = null;
  const sb = base({ location: { pathname: '/' }, document: { createElement: () => ({ style: {}, appendChild() {}, addEventListener() {} }) } });
  sb.GT = {
    theme: { names: () => [] },
    config: { keys: () => [], get: () => 13, set: async (k, v) => v, has: () => true, all: {} },
    chats: { projects: () => [] },
    store: { state: { messages: [], superseded: 0, orphanDeltas: 0 } },
    skin: { current: { id: 'none', hiddenCommands, themes: {}, system: (l, x, node) => out.push({ l, x, node }), applyConfig() {}, render() {} }, hide() {} },
    skins: { names: () => ['terminal', 'none'], label: (id) => sb.GT_T('opt.skin.choice.' + id) },
    sidebar: { chats: () => [], isOpen: () => false }, picker: {}, navigate: {}, convops: {},
    health: { CHECKS: {}, reasons: [] }, conversation: {}, oai: {}, compose: {},
    palette: { open: (items) => { paletteItems = items; } }
  };
  vm.runInContext(read('src/content/commands.js'), sb, { filename: 'commands.js' });
  return { C: sb.GT.commands, out, palette: () => paletteItems };
}
{
  const { C, out, palette } = commandsWith([':font', ':theme', ':messup']);
  await C.run(':font +');
  t('숨긴 명령은 실행하지 않고 이유를 말한다', out.at(-1).l === 'error' && /:font 은 노 스킨/.test(out.at(-1).x));
  t('자동완성에서 숨긴다', !C.complete(':fo').candidates.includes(':font'));
  t('숨기지 않은 명령은 그대로 완성된다', C.complete(':sk').candidates.includes(':skin'));
  C.openPalette();
  t('팔레트에서 숨긴다', palette() && !palette().some((i) => i.name === ':theme') && palette().some((i) => i.name === ':ls'));
}
{
  const { C } = commandsWith([]);
  t('숨긴 게 없으면 다 보인다', C.complete(':fo').candidates.includes(':font'));
}

// ---------------------------------------------------------------- 스킨 전환 (skin.js)
function registry() {
  const calls = { cover: [], attach: [], set: [], sw: [], order: [] };
  let on = false;
  const sb = base();
  sb.GT = {
    cover: { apply: (c) => calls.cover.push(c), remove() {}, on: () => { on = true; }, off: () => { on = false; }, isOn: () => on },
    prompt: { attach: (a, o) => calls.attach.push({ a, o }), detach: () => calls.order.push('detach'), get attached() { return true; } },
    config: { all: { x: 1 }, set: async (k, v) => calls.set.push([k, v]) },
    health: { degraded: false },
    sendToSW: (m) => calls.sw.push(m),
    store: { isStreaming: () => false }
  };
  vm.runInContext(read('src/content/shell/skin.js'), sb, { filename: 'skin.js' });
  const make = (id, over = {}) => {
    const d = { id, covers: id !== 'b', capturesTyping: id !== 'b', keys: { open: id === 'b' ? 'Semicolon' : null, escapeHides: id === 'b' },
      themes: { t: {} }, defaultTheme: 't', configKeys: [], hiddenCommands: [], prompt: { el: id + '-input', autosize() {} },
      mounted: 0, destroyed: 0 };
    sb.GT.skins.METHODS.forEach((m) => { d[m] = () => {}; });
    d.mount = () => { d.mounted++; calls.order.push('mount:' + id); };
    d.destroy = () => { d.destroyed++; calls.order.push('destroy:' + id); };
    return Object.assign(d, over);
  };
  return { sb, GT: sb.GT, calls, make, isOn: () => on };
}
{
  const { GT, calls, make, isOn } = registry();
  const a = GT.skins.register(make('a'));
  const b = GT.skins.register(make('b'));
  GT.skin.use('a');
  GT.skin.show();
  const r = await GT.skin.switch('b');
  t('전환이 성공한다', r.ok && GT.skin.current === b);
  t('이전 스킨을 먼저 해체한다', calls.order.indexOf('destroy:a') < calls.order.indexOf('mount:b'));
  t('입력 컨트롤러를 먼저 뗀다', calls.order.indexOf('detach') < calls.order.indexOf('destroy:a'));
  t('새 스킨의 covers 로 가리기를 바꾼다', calls.cover.at(-1) === false);
  const at = calls.attach.at(-1);
  t('새 위젯에 입력을 붙인다', at && at.a.el === 'b-input');
  t('새 스킨의 키를 넘긴다', at && at.o.openCode === 'Semicolon' && at.o.escapeHides === true && at.o.capturesTyping === false);
  t('보이던 상태를 유지한다', isOn());
  t('저장한다', calls.set.some(([k, v]) => k === 'skin' && v === 'b'));
  t('서비스 워커에 알린다', calls.sw.length === 1);

  const same = await GT.skin.switch('b');
  t('같은 스킨이면 아무것도 안 한다', same.same && b.mounted === 1);
  const unknown = await GT.skin.switch('zzz');
  t('모르는 스킨이면 실패', !unknown.ok && GT.skin.current === b);
}
{
  const { GT, calls, make } = registry();
  GT.skins.register(make('a'));
  GT.skins.register(make('b'));
  GT.skin.use('a');
  await GT.skin.switch('b', { persist: false });
  t('persist:false 면 저장하지 않는다 (옵션 화면이 이미 저장했다)', calls.set.length === 0);
}
{
  const { GT, make, isOn } = registry();
  const a = GT.skins.register(make('a'));
  GT.skins.register(make('b', { mount() { throw new Error('boom'); } }));
  GT.skin.use('a');
  const r = await GT.skin.switch('b');
  t('새 스킨이 죽으면 실패를 돌려준다', !r.ok && /boom/.test(r.reason));
  t('이전 스킨으로 되돌린다', GT.skin.current === a && a.mounted === 1);
  t('숨어 있던 상태도 되돌린다', isOn() === false);
}

// ---------------------------------------------------------------- none 스킨 본체
function mockDom() {
  const mk = (tag) => {
    const n = { tagName: tag, className: '', kids: [], style: {}, dataset: {}, hidden: false, parentElement: null, _text: '',
      get textContent() { return this._text; },
      set textContent(v) { this._text = v; this.kids.forEach((k) => { k.parentElement = null; }); this.kids = []; },
      appendChild(c) { c.parentElement = this; this.kids.push(c); return c; },
      insertBefore(c, ref) { c.parentElement = this; const i = this.kids.indexOf(ref); this.kids.splice(i < 0 ? this.kids.length : i, 0, c); return c; },
      remove() { if (this.parentElement) { const p = this.parentElement; p.kids = p.kids.filter((k) => k !== this); this.parentElement = null; } },
      focus() { mk.focused = this; }, addEventListener() {} };
    return n;
  };
  return mk;
}
function loadNone(sidebarState) {
  const mk = mockDom();
  const logged = [];
  const sb = base({ document: { createElement: mk } });
  let cfgLog = true;
  sb.GT = {
    cover: { host: () => { sb.__shadow = mk('#shadow'); return { shadow: sb.__shadow }; } },
    theme: { CSS: '', THEMES: { 'modern-dark': {} }, vars: (c) => 'theme=' + c['terminal.theme'] },
    sidebar: { build: () => mk('sidebar'), state: () => sidebarState, shouldShow: () => true },
    config: { get: (k) => (k === 'log' ? cfgLog : undefined) },
    log: (x) => logged.push(x)
  };
  vm.runInContext(read('src/content/shell/skin.js'), sb, { filename: 'skin.js' });
  vm.runInContext(read('src/content/skins/none.js'), sb, { filename: 'none.js' });
  const N = sb.GT.skins.get('none');
  return { N, mk, logged, setLog: (v) => { cfgLog = v; }, sb };
}
{
  const { N, logged } = loadNone({ forcedOpen: false });
  const root = N.mount({ 'terminal.theme': 'amber' });
  t('원본을 가리지 않는다', N.covers === false && N.capturesTyping === false);
  t('열기 키는 Ctrl+; (e.code Semicolon)', N.keys.open === 'Semicolon' && N.keys.escapeHides === true);
  t('루트가 클릭 통과 클래스를 단다', /gn-root/.test(root.className));
  t('출력 패널은 처음에 숨어 있다', N.ui.out.hidden === true);
  N.system('info', '이름을 바꿨습니다');
  t('명령 결과가 패널에 뜬다', N.ui.out.hidden === false && N.ui.out.kids.length === 1);
  N.system('info', '부팅 배너', null, { quiet: true });
  t('조용한 info 는 원본 위에 띄우지 않는다', N.ui.out.kids.length === 1 && logged.some((x) => /부팅 배너/.test(x)));
  N.system('error', '점검 실패', null, { quiet: true });
  t('조용해도 error 는 띄운다', N.ui.out.kids.length === 2);
  t('clearSystem 이 비운다', N.clearSystem() === 2 && N.ui.out.hidden === true);
  N.setSuggest([':ls', ':load'], '⇥ 완성');
  t('후보를 보여 준다', N.ui.suggest.hidden === false);
  N.setSuggest(null);
  t('후보를 닫는다', N.ui.suggest.hidden === true);
  t('대화를 그리지 않는다 (원본이 그린다)', N.render() === undefined && N.local('x') === 0);
  t('prompt 가 명령줄을 준다', N.prompt.el === N.ui.input);
  N.syncSidebar();
  t('사용자가 열지 않았으면 사이드바를 띄우지 않는다', !root.kids.some((k) => k.tagName === 'sidebar'));
  t('숨긴 명령: 글씨 · 테마 · messup', [':font', ':theme', ':messup'].every((c) => N.hiddenCommands.includes(c)));
}
{
  const { N } = loadNone({ forcedOpen: true });
  const root = N.mount({});
  N.syncSidebar();
  t('Ctrl+B 로 열었으면 사이드바를 띄운다', root.kids.some((k) => k.tagName === 'sidebar'));
}
{
  // 원본은 라이트 모드일 수 있다(실측). 위젯은 자기 배경을 칠하므로 팔레트를 고정한다.
  const { N, sb } = loadNone({ forcedOpen: false });
  N.mount({ 'terminal.theme': 'amber' });
  const styles = sb.__shadow.kids.filter((k) => k.tagName === 'style');
  t('터미널 테마를 amber 로 해도 none 위젯은 기본 팔레트', styles.some((st) => st.textContent === 'theme=modern-dark'));
}

// ---------------------------------------------------------------- 배선 (정적)
{
  const idx = read('src/content/index.js');
  t('옵션 화면에서 스킨을 바꾸면 열린 탭이 따라간다', /c\.skin !== GT\.skin\.current\.id[\s\S]{0,80}GT\.skin\.switch\(c\.skin, \{ persist: false \}\)/.test(idx));
  t('index 는 attachPrompt 로 붙인다', /GT\.skin\.attachPrompt\(\);/.test(idx) && !/GT\.prompt\.attach\(/.test(idx));
  const cmds = read('src/content/commands.js');
  t(':skin 은 바로 바꾼다', /await GT\.skin\.switch\(id\)/.test(cmds));
}

let bad = 0;
results.forEach(([n, ok]) => { if (!ok) bad++; console.log(`  ${ok ? 'PASS' : 'FAIL'}  ${n}`); });
console.log(bad ? `\n${bad}건 실패` : '\n전부 통과');
process.exit(bad ? 1 : 0);
