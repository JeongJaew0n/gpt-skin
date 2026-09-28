// UX 후속 묶음 3 — ⌘K 팔레트 = 대화 검색 + 명령. ':' 로 시작하면 명령만. 명령 옆 단축키. 팝업의 '명령 열기'.
// docs/plan/2026-09-29-ux-followup.md
import fs from 'node:fs'; import vm from 'node:vm';

const results = []; const t = (n, ok) => results.push([n, ok]);
const read = (f) => fs.readFileSync(f, 'utf8');

function makeDom() {
  class N {
    constructor(tag) { this.tagName = String(tag).toUpperCase(); this.children = []; this.parentElement = null;
      this.dataset = {}; this.style = {}; this.className = ''; this.listeners = {}; this._text = ''; this.value = ''; this.placeholder = ''; }
    get textContent() { return this.tagName === '#TEXT' ? this._text : this.children.map((c) => c.textContent).join(''); }
    set textContent(v) { this.children = []; if (v !== '' && v != null) { const x = new N('#text'); x._text = String(v); this.appendChild(x); } }
    appendChild(c) { if (c.frag) { [...c.children].forEach((k) => this.appendChild(k)); return c; } if (c.parentElement) c.remove(); c.parentElement = this; this.children.push(c); return c; }
    remove() { const p = this.parentElement; if (p) { p.children = p.children.filter((k) => k !== this); this.parentElement = null; } }
    addEventListener(tp, fn) { (this.listeners[tp] = this.listeners[tp] || []).push(fn); }
    fire(tp, ev) { const e = Object.assign({ type: tp, preventDefault() {}, stopPropagation() {} }, ev); (this.listeners[tp] || []).forEach((f) => f(e)); }
    focus() {}
  }
  return {
    createElement: (tg) => new N(tg),
    createTextNode: (v) => { const x = new N('#text'); x._text = v; return x; },
    createDocumentFragment: () => { const f = new N('#frag'); f.frag = true; return f; },
    N
  };
}

function load(chatsState) {
  const doc = makeDom();
  const root = new doc.N('div');
  const calls = { nav: [], fill: [] };
  const sb = { console, Object, Array, Map, Set, String, Number, Boolean, JSON, Math, Promise, Error, RegExp, Date,
    document: doc, navigator: { platform: 'MacIntel' }, location: { pathname: '/' } };
  sb.window = sb; sb.globalThis = sb;
  vm.createContext(sb);
  ['src/shared/i18n.js', 'src/shared/defaults.js'].forEach((f) => vm.runInContext(read(f), sb, { filename: f }));
  sb.GT = {
    theme: { names: () => [] },
    config: { keys: () => [], get: () => 13, set: async (k, v) => v, has: () => true, all: {} },
    chats: { state: chatsState, projects: () => [] },
    store: { state: { messages: [], superseded: 0, orphanDeltas: 0 } },
    skin: { current: { id: 'terminal', hiddenCommands: [], themes: {}, system() {}, applyConfig() {}, render() {}, setMode() {}, focus() {}, overlayRoot: () => root }, hide() {} },
    skins: { names: () => ['terminal'], label: (id) => id },
    sidebar: { chats: () => [], isOpen: () => false }, picker: {}, convops: {}, health: { CHECKS: {}, reasons: [] },
    conversation: {}, oai: {}, compose: {},
    navigate: { to: (h) => calls.nav.push(h), newChat() {} },
    prompt: { fill: (x) => calls.fill.push(x) }
  };
  vm.runInContext(read('src/content/palette.js'), sb, { filename: 'palette.js' });
  vm.runInContext(read('src/content/commands.js'), sb, { filename: 'commands.js' });
  const box = () => root.children.find((c) => c.className === 'gt-palette');
  const rows = () => box().children.find((c) => c.className === 'gt-palette-list').children;
  const input = () => box().children[0].children[1];
  const mark = () => box().children[0].children[0];
  const type = (v) => { input().value = v; input().fire('input'); };
  return { GT: sb.GT, sb, calls, box, rows, input, mark, type };
}

const STATE = { pinned: [{ id: 'p1', title: '고정 대화', href: '/c/p1' }],
  chats: [{ id: 'c1', title: '도커 정리', href: '/c/c1' }, { id: 'c2', title: 'K8s 설명', href: '/c/c2' },
    { id: 'c4', title: '메모: sidebar 정리', href: '/c/c4' }],   // ':' 가 든 제목 — 접두어 거르기를 가른다
  projects: [{ id: 'g1', name: '공부', items: [{ id: 'c3', title: '프로젝트 대화', href: '/c/c3' }, { id: 'c1', title: '도커 정리', href: '/c/c1' }] }] };

{
  const { GT } = load(STATE);
  const items = GT.commands.paletteItems();
  const chats = items.filter((i) => i.kind === 'chat');
  t('대화가 항목에 들어간다 (고정 · 일반 · 프로젝트)', chats.map((c) => c.name).join('|') === '고정 대화|도커 정리|K8s 설명|메모: sidebar 정리|프로젝트 대화');
  t('같은 대화는 한 번만', chats.filter((c) => c.name === '도커 정리').length === 1);
  t('아무것도 안 쳤을 때 대화가 명령보다 위', items[0].kind === 'chat' && items[items.length - 1].kind === 'command');
  const sidebar = items.find((i) => i.name === ':sidebar');
  t('명령 옆에 단축키 (맥은 ⌘)', sidebar && /Ctrl\+B/.test(sidebar.keys) && /⌘⇧S/.test(sidebar.keys));
}
{
  const { GT } = load(undefined);
  t('대화 목록을 아직 안 읽었으면 명령만', GT.commands.paletteItems().every((i) => i.kind === 'command'));
}
{
  const p = load(STATE);
  p.GT.commands.openPalette();
  t('팔레트가 열린다', !!p.box());
  t('안내 문구가 대화 검색을 말한다', /대화 검색/.test(p.input().placeholder));
  t('처음엔 › 표시', p.mark().textContent === '›');
  t('처음 줄은 대화', /고정 대화/.test(p.rows()[0].textContent));
  p.type('도커');
  t('대화 제목으로 찾는다', /도커 정리/.test(p.rows()[0].textContent));
  p.type(':si');
  t(': 로 시작하면 명령만 (제목에 : 가 든 대화도 빠진다)', p.rows().length > 0 && !p.rows().some((r) => /메모/.test(r.textContent)));
  p.type('si');
  t(': 없이 치면 그 대화도 찾는다', p.rows().some((r) => /메모: sidebar/.test(r.textContent)));
  p.type(':si');
  t(': 로 시작하면 : 표시', p.mark().textContent === ':');
  t('단축키가 줄에 보인다', p.rows().some((r) => /⌘⇧S/.test(r.textContent)));
  p.type('');
  p.rows()[1].fire('mousedown');
  t('대화를 고르면 그 대화로 간다', p.calls.nav.at(-1) === '/c/c1' && p.calls.fill.length === 0);
  p.GT.commands.openPalette();
  p.type(':sidebar');
  p.rows()[0].fire('mousedown');
  t('명령을 고르면 입력줄에 채운다', p.calls.fill.at(-1) === ':sidebar ');
}
{
  const idx = read('src/content/index.js');
  t('팝업의 명령 열기는 토글 경로로 켠다 (배지 · 복귀 거절)', /msg\.kind === 'palette'\)[\s\S]{0,300}GT\.skin\.toggle\(\);[\s\S]{0,120}GT\.commands\.openPalette\(\);/.test(idx));
  const js = read('src/popup/popup.js');
  t('팝업에 명령 열기 버튼', /id="palette"/.test(read('src/popup/popup.html')) && /ask\(\{ kind: 'palette' \}\)/.test(js));
  t('쓸 수 없는 탭에서는 잠근다', /ui\.palette\.disabled = !termUsable/.test(js));
}

let bad = 0;
results.forEach(([n, ok]) => { if (!ok) bad++; console.log(`  ${ok ? 'PASS' : 'FAIL'}  ${n}`); });
console.log(bad ? `\n${bad}건 실패` : '\n전부 통과');
process.exit(bad ? 1 : 0);
