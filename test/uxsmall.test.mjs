// UX 후속 묶음 1 — 경고 상태 팝업 문구 · 시트 커서 움직임 줄이기 · 운영체제별 단축키 표기 · 생성 상태 알림
// docs/plan/2026-09-29-ux-followup.md
import fs from 'node:fs'; import vm from 'node:vm';

const results = []; const t = (n, ok) => results.push([n, ok]);
const read = (f) => fs.readFileSync(f, 'utf8');

// ---------------------------------------------------------------- A4 수정키 표기
function i18nWith(nav) {
  const sb = { navigator: nav };
  vm.createContext(sb);
  vm.runInContext(read('src/shared/i18n.js'), sb, { filename: 'i18n.js' });
  return sb;
}
{
  t('맥이면 ⌘', i18nWith({ platform: 'MacIntel' }).GT_MOD() === '⌘');
  t('윈도우면 Ctrl+', i18nWith({ platform: 'Win32' }).GT_MOD() === 'Ctrl+');
  t('userAgentData 를 먼저 본다', i18nWith({ platform: 'Win32', userAgentData: { platform: 'macOS' } }).GT_MOD() === '⌘');
  t('알 수 없으면 Ctrl+', i18nWith({}).GT_MOD() === 'Ctrl+');
  const term = read('src/content/skins/terminal.js');
  t('터미널 상태줄이 수정키를 박지 않는다', !/'⌘K 팔레트/.test(term) && /GT_T\('term\.hint', GT_MOD\(\) \+ 'K'\)/.test(term));
  const sb = i18nWith({ platform: 'Win32' });
  t('윈도우 안내는 Ctrl+K', sb.GT_T('term.hint', sb.GT_MOD() + 'K').startsWith('Ctrl+K 팔레트'));
}

// ---------------------------------------------------------------- A3 시트 커서
{
  const sheet = read('src/content/skins/sheet.js');
  t('움직임 줄이기에서 시트 커서가 멈춘다', /@media \(prefers-reduced-motion: reduce\) \{ \.gs-caret \{ animation: none; \} \}/.test(sheet));
}

// ---------------------------------------------------------------- A5 생성 상태 알림
function registry() {
  const kids = [];
  const mk = (tag) => ({ tagName: tag, dataset: {}, style: {}, attrs: {}, textContent: '', children: [],
    setAttribute(k, v) { this.attrs[k] = v; }, appendChild(c) { this.children.push(c); return c; } });
  const root = mk('div');
  const sb = { console, Object, Array, Map, String, Error, Promise, document: { createElement: mk } };
  vm.createContext(sb);
  sb.GT = { cover: {}, health: {}, sendToSW() {} };
  vm.runInContext(read('src/content/shell/skin.js'), sb, { filename: 'skin.js' });
  const def = { id: 'terminal', covers: true, capturesTyping: true, keys: {}, persistSidebar: true, themes: { a: {} }, defaultTheme: 'a',
    configKeys: [], hiddenCommands: [], prompt: { el: null, autosize() {} } };
  sb.GT.skins.METHODS.forEach((m) => { def[m] = () => {}; });
  def.overlayRoot = () => root;
  sb.GT.skins.register(def);
  return { GT: sb.GT, root, kids };
}
{
  const { GT, root } = registry();
  GT.skin.announce('응답 중');
  const n = root.children[0];
  t('role=status 요소를 만든다', n && n.attrs.role === 'status' && n.attrs['aria-live'] === 'polite');
  t('글을 쓴다', n.textContent === '응답 중');
  t('눈에는 안 보인다', /clip:rect\(0 0 0 0\)/.test(n.style.cssText));
  GT.skin.announce('응답 완료');
  t('요소는 하나를 재사용한다', root.children.length === 1 && root.children[0].textContent === '응답 완료');
  const idx = read('src/content/index.js');
  t('생성의 가장자리에서만 알린다 (토큰마다가 아니다)', /if \(now !== wasStreaming\) \{ wasStreaming = now; GT\.skin\.announce\(/.test(idx));
}

// ---------------------------------------------------------------- A2 경고 상태 팝업
function popupRun(state) {
  const html = read('src/popup/popup.html');
  const ids = [...html.matchAll(/id="([^"]+)"/g)].map((m) => m[1]);
  const nodes = new Map();
  const mk = (id) => ({ id, dataset: {}, textContent: '', disabled: false, listeners: {}, children: [], attrs: {},
    addEventListener(tp, fn) { (this.listeners[tp] = this.listeners[tp] || []).push(fn); },
    appendChild(c) { this.children.push(c); return c; }, setAttribute(k, v) { this.attrs[k] = v; } });
  ids.forEach((id) => nodes.set('#' + id, mk(id)));
  const document = { querySelector: (s) => nodes.get(s) || null, createElement: () => mk('') };
  const chrome = {
    runtime: { lastError: null, openOptionsPage() {} },
    tabs: { query: async () => [{ id: 7, url: 'https://chatgpt.com/c/x' }], sendMessage: (id, m, cb) => cb(state), create() {} },
    storage: { sync: { get: async (d) => ({ ...d }), set: async () => {} } }
  };
  const sb = { console, Object, Array, String, Number, Boolean, JSON, Promise, Error, RegExp, Date, document, chrome, setTimeout, clearTimeout, navigator: { platform: 'MacIntel' } };
  sb.window = sb; sb.window.close = () => {};
  vm.createContext(sb);
  ['src/shared/i18n.js', 'src/shared/defaults.js', 'src/popup/popup.js'].forEach((f) => vm.runInContext(read(f), sb, { filename: f }));
  return { $: (s) => nodes.get(s) };
}
const settle = () => new Promise((r) => setTimeout(r, 0));
{
  const p = popupRun({ visible: true, degraded: false, warned: true, reasons: ['드리프트: 12% 어긋남', '둘째 경고'] });
  await settle(); await settle(); await settle();
  t('경고가 있으면 개수와 첫 경고를 보여 준다', /경고 2개 — 드리프트: 12% 어긋남/.test(p.$('#terminal-help').textContent));
  t(':health 로 잇는다', /:health/.test(p.$('#terminal-help').textContent));
  t('줄에 경고 표시', p.$('#row-terminal').dataset.warned === '1');
}
{
  const p = popupRun({ visible: true, degraded: false, warned: false, reasons: [] });
  await settle(); await settle(); await settle();
  t('경고가 없으면 평소 문구', p.$('#terminal-help').textContent === '이 탭에만 적용됩니다.');
}
{
  const idx = read('src/content/index.js');
  t('상태 응답에 경고를 실어 보낸다', /msg\.kind === 'state'\) reply\(\{[\s\S]{0,120}warned: GT\.health\.warned, reasons: GT\.health\.reasons/.test(idx));
}

let bad = 0;
results.forEach(([n, ok]) => { if (!ok) bad++; console.log(`  ${ok ? 'PASS' : 'FAIL'}  ${n}`); });
console.log(bad ? `\n${bad}건 실패` : '\n전부 통과');
process.exit(bad ? 1 : 0);
