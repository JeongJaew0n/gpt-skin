// 사이드바 '⋯' 메뉴 — 진짜 sidebar.js · convops.js · commands.js 를 싣고 누름을 흘려 본다 (리뷰 2026-11-03).
//
// 1. '삭제' 는 두 번 눌러야 지워진다. 예전에는 두 번째 누름을 나중에 붙인 bubble 리스너(once)가 받게 했는데,
//    같은 항목의 capture 리스너가 stopPropagation 을 불러 once 가 한 번도 불리지 않았다 — 메뉴로는 지울 수 없었다.
//
// 가짜 DOM 의 이벤트 순서는 크롬과 같게 둔다 (DOM 표준 dispatch — 크롬 156 실측, 리뷰 2026-11-03):
//   조상 capture → 대상 capture → 대상 bubble → 조상 bubble. stopPropagation 은 다음 '노드' 로 넘어가기를 막는다 —
//   대상의 capture 리스너가 부르면 대상의 bubble 리스너도 불리지 않는다.
// 정적 검사('armed' 라는 글자가 있는가)는 깨진 동안에도 통과했다 — 그래서 동작으로 본다.
import fs from 'node:fs'; import vm from 'node:vm';

const results = []; const t = (n, ok) => results.push([n, ok]);
const read = (f) => fs.readFileSync(f, 'utf8');
const tick = () => new Promise((r) => setTimeout(r, 0));

class N {
  constructor(tag) {
    this.tagName = String(tag).toUpperCase();
    this.children = []; this.parent = null; this.listeners = [];
    this.dataset = {}; this.style = { setProperty() {}, removeProperty() {} };
    this.className = ''; this.title = ''; this.hidden = false; this.value = ''; this._text = '';
  }
  appendChild(c) {
    if (c.isFrag) { c.children.slice().forEach((k) => this.appendChild(k)); return c; }
    if (c.parent) c.parent.removeChild(c);
    c.parent = this; this.children.push(c); return c;
  }
  removeChild(c) { const i = this.children.indexOf(c); if (i >= 0) this.children.splice(i, 1); c.parent = null; return c; }
  insertBefore(c, ref) {
    if (!ref) return this.appendChild(c);
    if (c.parent) c.parent.removeChild(c);
    c.parent = this; this.children.splice(this.children.indexOf(ref), 0, c); return c;
  }
  remove() { if (this.parent) this.parent.removeChild(this); }
  set textContent(v) { this.children.forEach((c) => { c.parent = null; }); this.children = []; this._text = String(v); }
  get textContent() { return this._text + this.children.map((c) => c.textContent).join(''); }
  setAttribute() {}
  getAttribute() { return null; }
  getBoundingClientRect() { return { top: 0, left: 0, right: 0, bottom: 0, width: 0, height: 0 }; }
  contains(n) { for (let x = n; x; x = x.parent) if (x === this) return true; return false; }
  getRootNode() { let x = this; while (x.parent) x = x.parent; return x; }
  get isConnected() { return this.getRootNode() === OVERLAY; }
  get classList() { const n = this; return { contains: (c) => n.className.split(/\s+/).includes(c), add() {}, remove() {}, toggle() {} }; }
  all() { return this.children.flatMap((c) => [c, ...c.all()]); }
  querySelector(sel) {
    const want = (n) => (sel.startsWith('.') ? n.className.split(/\s+/).includes(sel.slice(1)) : n.tagName === sel.toUpperCase());
    return this.all().find(want) || null;
  }
  addEventListener(type, fn, opts) { this.listeners.push({ type, fn, capture: opts === true || !!(opts && opts.capture) }); }
  removeEventListener(type, fn, opts) {
    const capture = opts === true || !!(opts && opts.capture);
    this.listeners = this.listeners.filter((l) => !(l.type === type && l.fn === fn && l.capture === capture));
  }
  // 크롬과 같은 순서로 부른다 (위 머리말)
  press(type = 'mousedown') {
    const path = []; for (let n = this; n; n = n.parent) path.push(n);
    const ev = { type, target: this, button: 0, stopped: false, composedPath: () => path,
      preventDefault() {}, stopPropagation() { this.stopped = true; } };
    const invoke = (n, capture) => {
      if (ev.stopped) return;
      n.listeners.filter((l) => l.type === type && l.capture === capture).forEach((l) => l.fn.call(n, ev));
    };
    for (let i = path.length - 1; i >= 0; i -= 1) invoke(path[i], true);
    for (let i = 0; i < path.length; i += 1) invoke(path[i], false);
  }
}
const OVERLAY = new N('div');      // 스킨의 overlayRoot (shadow root 자리)
const find = (pred) => OVERLAY.all().find(pred) || null;

// 서버 흉내. 보관하면 목록 API 에서 빠진다 (docs/plan/2026-09-01-conversation-ops.md 실측 — '목록에서 사라짐/복귀')
const SERVER = [
  { id: 'x2aa1111-0000', title: 'K8s 설명' },
  { id: 'abcd2222-0000', title: '도커 정리' },
  { id: 'ef013333-0000', title: '배포 계획' }
];
const listed = () => SERVER.filter((c) => !c.archived).map((c) => ({ kind: 'chat', id: c.id, title: c.title, href: '/c/' + c.id }));
const shaped = () => { const rows = listed(); return { rows, source: 'api', total: rows.length, loaded: rows.length, hasMore: false }; };

const patches = [];
const sys = [];
const sb = { console, Object, Array, Set, Map, String, Number, Boolean, JSON, Math, Promise, Error, RegExp, Date, encodeURIComponent,
  // 4초 뒤 '삭제' 로 되돌리는 타이머는 이 검사와 상관없다 — 프로세스를 붙잡지 않게 버린다
  setTimeout: (fn, ms) => (ms >= 1000 ? 0 : setTimeout(fn, ms)), clearTimeout,
  location: { pathname: '/c/abcd2222-0000' },
  document: {
    createElement: (tag) => new N(tag),
    createDocumentFragment: () => { const f = new N('#fragment'); f.isFrag = true; return f; },
    createTextNode: (s) => { const n = new N('#text'); n._text = String(s); return n; }
  },
  chrome: { storage: { local: { get: async () => ({}), set: async () => {} } } }
};
sb.window = sb; sb.globalThis = sb;
sb.GT = {
  oai: {
    patch: async (url, body) => {
      patches.push({ url, body });
      const id = decodeURIComponent(url.split('/').pop());
      const c = SERVER.find((x) => x.id === id);
      if (c && 'is_archived' in body) c.archived = !!body.is_archived;
      if (c && body.is_visible === false) c.archived = true;      // 목록에서 사라진다
      return { success: true };
    }
  },
  chats: { load: async () => shaped(), flatten: (g) => g.rows, get state() { return shaped(); }, projects: () => [],
    isProjectLoaded: () => true, loadProject: async () => shaped() },
  config: { get: (k) => (k === 'sidebar.closeOnOpen' ? true : null), keys: () => [], DEFAULTS: {} },
  conversation: { idFromPath: () => 'abcd2222-0000' },
  tabs: { close() {} },
  navigate: { newChat() {}, to() {} },
  palette: {},
  prompt: { fill() {} },
  store: { state: { messages: [], superseded: 0, orphanDeltas: 0, conversationTitle: '' }, setTitle() {} },
  skin: { hide() {}, current: { system: (lvl, txt) => sys.push(`${lvl}:${txt == null ? '' : txt}`), overlayRoot: () => OVERLAY,
    syncSidebar() {}, focus() {}, sidebarShown: () => true, persistSidebar: false, applyConfig() {}, render() {} } },
  theme: { names: () => [] }, picker: {}, health: { CHECKS: {}, reasons: [] }, compose: {}
};
vm.createContext(sb);
vm.runInContext(read('src/shared/i18n.js'), sb, { filename: 'i18n.js' });
vm.runInContext(read('src/content/convops.js'), sb, { filename: 'convops.js' });
vm.runInContext(read('src/content/sidebar.js'), sb, { filename: 'sidebar.js' });
vm.runInContext(read('src/content/commands.js'), sb, { filename: 'commands.js' });
const GT = sb.GT;

OVERLAY.appendChild(GT.sidebar.build());
await GT.sidebar.refresh();

const rowOf = (title) => find((n) => n.className === 'gt-sb-row' && n.textContent.includes(title));
const openMenu = async (title) => {
  const row = rowOf(title);
  const dots = row && row.querySelector('.gt-sb-dots');
  if (!dots) return false;
  dots.press();
  await tick();                    // 메뉴는 바깥 누름 감시를 다음 틱에 붙인다
  return true;
};
const item = (pred) => find((n) => n.className === 'gt-ctx-item' && pred(n));

// --- 1. '⋯ → 삭제' ---
{
  t('행과 메뉴를 찾는다', await openMenu('K8s 설명'));
  const del = item((n) => n.dataset.danger === '1');
  t('삭제 항목이 있다', !!del);
  del.press();
  await tick(); await tick();
  t('한 번 누르면 지우지 않고 한 번 더 묻는다', patches.length === 0 && /한 번 더/.test(del.textContent));
  del.press();
  for (let i = 0; i < 4; i += 1) await tick();
  const p = patches.at(-1) || {};
  t('두 번째 누름에 삭제 요청이 나간다', patches.length === 1 && /x2aa1111-0000$/.test(p.url || '') && JSON.stringify(p.body) === '{"is_visible":false}');
  t('지운 뒤 메뉴가 닫힌다', !find((n) => n.className === 'gt-ctx'));
  t('지운 뒤 목록을 다시 읽어 행이 빠진다', !rowOf('K8s 설명'));
}

let bad = 0;
results.forEach(([n, ok]) => { if (!ok) bad++; console.log(`  ${ok ? 'PASS' : 'FAIL'}  ${n}`); });
console.log(bad ? `\n${bad}건 실패` : '\n전부 통과');
process.exit(bad ? 1 : 0);
