// sheet 스킨 — 대화를 스프레드시트처럼 그린다. 한 행에 한 줄.
// docs/plan/2026-09-21-sheet-skin.md · docs/plan/2026-09-24-skin-architecture.md (7·8단계)
import fs from 'node:fs'; import vm from 'node:vm';

const results = []; const t = (n, ok) => results.push([n, ok]);
const read = (f) => fs.readFileSync(f, 'utf8');
const tick = () => new Promise((r) => setTimeout(r, 0));

// ---------------------------------------------------------------- 흉내 DOM
function makeDom() {
  let created = { tr: 0 };
  class N {
    constructor(tag) { this.tagName = String(tag).toUpperCase(); this.children = []; this.parentElement = null;
      this.dataset = {}; this.style = {}; this.className = ''; this.listeners = {}; this._text = ''; this.attrs = {}; }
    get firstChild() { return this.children[0] || null; }
    get lastElementChild() { return this.children[this.children.length - 1] || null; }
    get textContent() { return this.tagName === '#TEXT' ? this._text : this.children.map((c) => c.textContent).join(''); }
    set textContent(v) { this.children.forEach((c) => { c.parentElement = null; }); this.children = [];
      if (v !== '' && v != null) this.appendChild(text(String(v))); }
    get isConnected() { let n = this; while (n.parentElement) n = n.parentElement; return !!n.root; }
    get classList() { const self = this; return { contains: (c) => self.className.split(/\s+/).includes(c) }; }
    appendChild(c) { if (c.frag) { [...c.children].forEach((k) => this.appendChild(k)); return c; }
      if (c.parentElement) c.remove(); c.parentElement = this; this.children.push(c); return c; }
    insertBefore(c, ref) { if (!ref) return this.appendChild(c); if (c.parentElement) c.remove();
      const i = this.children.indexOf(ref); c.parentElement = this; this.children.splice(i < 0 ? this.children.length : i, 0, c); return c; }
    remove() { const p = this.parentElement; if (!p) return; p.children = p.children.filter((k) => k !== this); this.parentElement = null; }
    setAttribute(k, v) { this.attrs[k] = v; }
    addEventListener(tp, fn) { (this.listeners[tp] = this.listeners[tp] || []).push(fn); }
    dispatch(tp, ev) { const e = Object.assign({ type: tp, target: this, preventDefault() { this.defaultPrevented = true; } }, ev);
      let n = this; while (n) { (n.listeners[tp] || []).forEach((f) => f(e)); n = n.parentElement; } return e; }
    closest(sel) { let n = this; while (n) { if (n.tagName === sel.toUpperCase()) return n; n = n.parentElement; } return null; }
    matches(sel) {
      const m = /^([a-z]*)(?:\[data-([a-z]+)="([^"]*)"\])?(?:\.([\w-]+))?$/i.exec(sel);
      if (!m) return false;
      if (m[1] && this.tagName !== m[1].toUpperCase()) return false;
      if (m[2] && this.dataset[m[2]] !== m[3]) return false;
      if (m[4] && !this.classList.contains(m[4])) return false;
      return true;
    }
    querySelectorAll(sel) { const out = []; const walk = (n) => n.children.forEach((c) => { if (c.tagName !== '#TEXT' && c.matches(sel)) out.push(c); walk(c); }); walk(this); return out; }
    querySelector(sel) { return this.querySelectorAll(sel)[0] || null; }
    scrollIntoView() {}
    focus() { doc.activeElement = this; }
  }
  const text = (v) => { const n = new N('#text'); n._text = v; return n; };
  const doc = {
    createElement: (tg) => { if (tg === 'tr') created.tr++; return new N(tg); },
    createElementNS: (_, tg) => new N(tg),
    createTextNode: text,
    createDocumentFragment: () => { const f = new N('#frag'); f.frag = true; return f; },
    getSelection: () => '',
    activeElement: null
  };
  return { doc, N, created: () => created.tr };
}

// ---------------------------------------------------------------- 불러오기
function load(opts = {}) {
  const { doc, N, created } = makeDom();
  const cfg = { 'font.size': 13, 'sheet.theme': 'green', 'sheet.ribbon': true, 'sidebar.width': 30, citations: 'number', log: true, ...opts.cfg };
  const calls = { nav: [], newChat: 0, run: [], copy: [], cfgSet: [] };
  const state = { messages: [], path: '/c/abc', conversationTitle: '도커 정리', streamingId: null };
  let thinking = false;
  const sb = { console, Object, Array, Map, Set, String, Number, Boolean, JSON, Math, Promise, Error, RegExp, Date, setTimeout,
    document: doc, navigator: { language: 'ko' }, CSS: { escape: (x) => x },
    chrome: { runtime: { getManifest: () => ({ version: '0.0.0' }) } } };
  sb.window = sb; sb.globalThis = sb;
  vm.createContext(sb);
  ['src/shared/i18n.js', 'src/shared/defaults.js'].forEach((f) => vm.runInContext(read(f), sb, { filename: f }));
  sb.GT = {
    config: { get: (k) => cfg[k], set: async (k, v) => { cfg[k] = v; calls.cfgSet.push([k, v]); } },
    cover: { host: () => { const sh = new N('#shadow'); sh.root = true; sh.getSelection = () => ''; sb.__shadow = sh; return { host: new N('div'), shadow: sh }; } },
    theme: { CSS: '' },
    sidebar: { build: () => new N('div'), state: () => opts.sidebarState || {} },
    store: { get state() { return state; }, isThinking: () => thinking, isDrawing: () => false, approxChars: () => state.messages.reduce((n, m) => n + (m.text || '').length, 0),
      thinkingElapsed: () => 1.5, drawingElapsed: () => 0 },
    chats: { state: { pinned: [], chats: [], projects: [] },
      load: async () => ({ pinned: [{ id: 'p1', title: '고정 대화', href: '/c/p1' }], chats: [{ id: 'abc', title: '도커 정리', href: '/c/abc' }, { id: 'x2', title: 'K8s 설명', href: '/c/x2' }], projects: [] }) },
    conversation: { idFromPath: () => 'abc' },
    navigate: { to: (h) => calls.nav.push(h), newChat: () => { calls.newChat++; } },
    commands: { run: async (x) => { calls.run.push(x); return true; } },
    clipboard: { copy: async (x) => { calls.copy.push(x); return true; } },
    log() {}
  };
  vm.runInContext(read('src/content/markdown.js'), sb, { filename: 'markdown.js' });
  vm.runInContext(read('src/content/shell/skin.js'), sb, { filename: 'skin.js' });
  vm.runInContext(read('src/content/skins/sheet.js'), sb, { filename: 'sheet.js' });
  const S = sb.GT.skins.get('sheet');
  return { S, sb, state, cfg, calls, created, setThinking: (v) => { thinking = v; }, doc };
}

const rowsText = (S) => S.ui.body.children.map((tr) => tr.children.map((td) => td.textContent));

// ---------------------------------------------------------------- 행 계획
{
  const { S } = load();
  const u = JSON.parse(JSON.stringify(S.rowsOf({ role: 'user', text: '첫 줄\n**둘째** 줄', at: Date.parse('2026-09-24T14:26:00') })));
  t('내 글은 줄마다 한 행', u.length === 2);
  t('내 글은 마크다운으로 해석하지 않는다', u[1].raw === true && u[1].text === '**둘째** 줄');
  t('A 열 이름은 첫 행에만', u[0].label === '나' && u[1].label === '');
  t('시각은 첫 행에만', /\d\d:\d\d/.test(u[0].time) && u[1].time === '');

  const a = JSON.parse(JSON.stringify(S.rowsOf({ role: 'assistant', model: 'gpt-5', text: '여기!\n\n- 하나\n- 둘\n\n```yaml\nservices:\n  web:\n```', streaming: true })));
  t('답은 블록을 행으로 편다', a.map((r) => r.kind).join() === 'text,item,item,code,code');
  t('A 열은 모델 이름', a[0].label === 'gpt-5');
  t('스트리밍 표시는 마지막 행에만', a.filter((r) => r.streaming).length === 1 && a[a.length - 1].streaming);
  const noModel = JSON.parse(JSON.stringify(S.rowsOf({ role: 'assistant', text: '답' })));
  t('모델을 모르면 GPT', noModel[0].label === 'GPT');
  const img = JSON.parse(JSON.stringify(S.rowsOf({ role: 'assistant', text: '', images: [{ mime: 'image/png', w: 1024, h: 1024, pointer: 'p1' }], parts: ['image', 'code'] })));
  t('그림은 자리표시 행', img.some((r) => r.kind === 'image' && /1024×1024/.test(r.text)));
  t('그릴 수 없는 파트는 알린다 (그림은 두 번 세지 않는다)', img.some((r) => r.kind === 'placeholder' && /code/.test(r.text) && !/image/.test(r.text)));
  const empty = JSON.parse(JSON.stringify(S.rowsOf({ role: 'assistant', text: '', streaming: true })));
  t('빈 답도 한 행 (스트리밍 첫 순간)', empty.length === 1 && empty[0].streaming);
}

// ---------------------------------------------------------------- 그리기
{
  const { S, state } = load();
  S.mount({ 'font.size': 13, 'sheet.theme': 'green', 'sheet.ribbon': true });
  state.messages = [
    { id: 'u1', role: 'user', text: 'docker 사이트 알려줘.' },
    { id: 'a1', role: 'assistant', model: 'gpt-5', text: '여기!\n\n- Docker 공식: docker.com\n- Hub: hub.docker.com' },
    { id: 'u2', role: 'user', text: 'compose 예시' },
    { id: 'a2', role: 'assistant', text: '```yaml\nservices:\n  web:\n```' }
  ];
  S.render();
  const rows = rowsText(S);
  t('행 수 = 펼친 줄 수', rows.length === 1 + 3 + 1 + 2);
  t('행 번호가 1부터', rows.map((r) => r[0]).join() === '1,2,3,4,5,6,7');
  t('A 열은 메시지 첫 행에만', rows.map((r) => r[1]).join('|') === '나|gpt-5|||나|GPT|');
  t('목록 항목에 글머리', rows[2][2].startsWith('· '));
  const code = S.ui.body.children[6].children[2];
  t('코드 행은 코드 칸', code.dataset.kind === 'code' && code.textContent === '  web:');
  const mirror = S.ui.tail.children[0];
  t('입력 미러 행은 다음 번호', mirror.children[0].textContent === '8');
  t('이름 상자는 다음 입력 칸', S.ui.namebox.textContent === 'B8');

  S.ui.input.value = '다음 질문';
  S.ui.input.dispatch('input');
  t('치는 글자를 다음 행에 비춘다', mirror.children[2].textContent === '다음 질문' && mirror.children[1].textContent === '나');
  S.ui.input.value = '';
  S.ui.input.dispatch('input');
  t('지우면 미러도 비운다', mirror.children[2].textContent === '' && mirror.children[1].textContent === '');

  S.renderChrome();
  t('제목 표시줄은 대화 제목.xlsx', S.ui.name.textContent === '도커 정리.xlsx');
  t('상태 표시줄에 메시지 수', S.ui.count.textContent === '메시지 4');
  t('확대 비율은 글자 크기에서', S.ui.zoom.textContent === '100%');
  t('제품 이름을 쓰지 않는다', !/Excel/i.test(read('src/content/skins/sheet.js').replace(/\/\/[^\n]*/g, '')));
}

// ---------------------------------------------------------------- 스트리밍 중 증분
{
  const { S, state, created } = load();
  S.mount({ 'font.size': 13 });
  const full = '첫 문단입니다.\n\n- 항목 하나\n- 항목 둘\n\n```sh\ndocker compose up\ndocker ps\n```\n\n끝.';
  state.messages = [{ id: 'u1', role: 'user', text: '질문' }, { id: 'a1', role: 'assistant', text: '', streaming: true }];
  state.streamingId = 'a1';
  S.render();
  const firstTr = S.ui.body.children[0];
  let maxPerTick = 0;
  for (let n = 1; n <= full.length; n++) {
    state.messages[1] = { ...state.messages[1], text: full.slice(0, n) };
    const before = created();
    S.render();
    maxPerTick = Math.max(maxPerTick, created() - before);
  }
  t('스트리밍 한 글자에 두 행 넘게 만들지 않는다', maxPerTick <= 2);
  t('내 질문 행은 한 번도 다시 만들지 않는다', S.ui.body.children[0] === firstTr);
  state.messages[1] = { ...state.messages[1], streaming: false };
  state.streamingId = null;
  S.render();
  t('끝나면 커서가 사라진다', !S.ui.body.querySelector('.gs-caret'));
}

// ---------------------------------------------------------------- 인용 번호는 행을 건너 이어진다
{
  const { S, state } = load();
  S.mount({ 'font.size': 13 });
  const c = '\uE200cite\uE202turn0search1\uE201';
  state.messages = [{ id: 'a1', role: 'assistant', text: `첫째 ${c}\n\n둘째\n\n셋째 ${c}` }];
  S.render();
  const cites = () => S.ui.body.querySelectorAll('.gt-cite').map((n) => n.textContent);
  t('행마다 번호가 이어진다', cites().join() === '[1],[2]');
  const kept = S.ui.body.children[0];
  state.messages = [{ id: 'a1', role: 'assistant', text: `첫째 ${c}\n\n둘째\n\n셋째 ${c}\n\n넷째 ${c}` }];
  S.render();
  t('뒤에 붙은 행만 새로 그려도 번호가 이어진다', cites().join() === '[1],[2],[3]');
  t('앞 행은 그대로 둔다', S.ui.body.children[0] === kept);
  state.messages = [{ id: 'a1', role: 'assistant', text: `첫째 ${c} ${c}\n\n둘째\n\n셋째 ${c}\n\n넷째 ${c}` }];
  S.render();
  t('앞에서 번호가 밀리면 뒤 행도 다시 매긴다', cites().join() === '[1],[2],[3],[4]');
}

// ---------------------------------------------------------------- 셀 선택 · 방향키 · 복사
{
  const { S, state, calls } = load();
  S.mount({ 'font.size': 13 });
  state.messages = [{ id: 'u1', role: 'user', text: '가\n나' }, { id: 'a1', role: 'assistant', text: '다' }];
  S.render();
  const td = S.ui.body.children[1].children[2];      // B2
  td.dispatch('mousedown');
  t('셀을 누르면 고른다', td.dataset.sel === '1' && S.ui.namebox.textContent === 'B2');
  t('상태 표시줄에 셀 주소', S.ui.cell.textContent === '셀 B2');
  t('열 머리글이 켜진다', S.ui.colHeads[1].dataset.on === '1' && S.ui.colHeads[0].dataset.on === '0');
  S.ui.grid.dispatch('keydown', { key: 'ArrowDown' });
  t('↓ 로 아래 셀', S.ui.namebox.textContent === 'B3' && S.ui.body.children[2].children[2].dataset.sel === '1');
  S.ui.grid.dispatch('keydown', { key: 'ArrowLeft' });
  t('← 로 A 열', S.ui.namebox.textContent === 'A3');
  S.ui.grid.dispatch('keydown', { key: 'ArrowUp' });
  S.ui.grid.dispatch('keydown', { key: 'ArrowUp' });
  S.ui.grid.dispatch('keydown', { key: 'ArrowUp' });
  t('맨 위에서 더 올라가지 않는다', S.ui.namebox.textContent === 'A1');
  S.ui.grid.dispatch('keydown', { key: 'ArrowRight' });
  const e = S.ui.grid.dispatch('keydown', { key: 'c', metaKey: true });
  t('⌘C 로 셀 글자를 복사한다', calls.copy.at(-1) === '가' && e.defaultPrevented);
  state.messages = [{ id: 'u0', role: 'user', text: '새 첫 줄' }, ...state.messages];
  S.render();
  t('앞에 행이 생겨도 고른 셀을 따라간다', S.ui.namebox.textContent === 'B2');
  S.ui.input.dispatch('focus');
  t('입력줄에 들어가면 선택을 푼다', S.ui.namebox.textContent === 'B5' && !S.ui.body.querySelector('[data-sel="1"]'));
}

// ---------------------------------------------------------------- 시트 탭
{
  const { S, calls } = load();
  S.mount({ 'font.size': 13 });
  await tick(); await tick();
  const tabs = S.ui.tablist.children.map((n) => n.textContent);
  t('첫 탭은 지금 대화', tabs[0] === '도커 정리' && S.ui.tablist.children[0].dataset.on === '1');
  t('다른 대화가 탭으로 (지금 대화는 한 번만)', tabs.join('|') === '도커 정리|고정 대화|K8s 설명');
  S.ui.tablist.children[2].dispatch('click');
  t('탭을 누르면 그 대화로 간다', calls.nav.at(-1) === '/c/x2');
  S.ui.tabs.children[2].dispatch('click');
  t('+ 는 새 대화', calls.newChat === 1);
}

// ---------------------------------------------------------------- 명령 결과 · 생각 중 · 설정
{
  const { S, state, setThinking, cfg, calls } = load();
  S.mount({ 'font.size': 13 });
  state.messages = [{ id: 'u1', role: 'user', text: '질문' }];
  S.system('info', '이름을 바꿨습니다');
  const last = S.ui.body.lastElementChild;
  t('명령 결과가 행으로 붙는다', last.children[1].textContent === '[info]' && last.children[2].textContent === '이름을 바꿨습니다');
  t('clearSystem 이 걷어낸다', S.clearSystem() === 1 && S.ui.body.children.length === 1);
  S.system('info', '조용한 줄', null, { quiet: true });
  t('로그가 켜져 있으면 조용한 줄도 보인다 (터미널과 같다)', S.ui.body.children.length === 2);
  S.clearSystem();

  setThinking(true);
  S.render();
  const th = S.ui.body.lastElementChild;
  t('생각 중이면 GPT 행이 뜬다', th.children[1].textContent === 'GPT' && /생각 중/.test(th.children[2].textContent));
  state.streamingId = 'x';
  const spin0 = S.sb ? '' : th.querySelector('.gt-spin').textContent;
  S.tick();
  t('회전자가 돈다', th.querySelector('.gt-spin').textContent !== spin0);
  state.streamingId = null;
  setThinking(false);
  S.render();
  t('생각이 끝나면 사라진다', S.ui.body.children.length === 1);

  S.applyConfig({ 'font.size': 15, 'sheet.theme': 'blue', 'sheet.ribbon': false });
  t('리본을 끌 수 있다', S.ui.ribbon.hidden === true);
  S.ui.rtabs.dispatch('dblclick');
  t('리본 탭을 두 번 누르면 설정을 뒤집는다', calls.cfgSet.some(([k]) => k === 'sheet.ribbon'));
  t('파랑 테마', S.themes.blue['--gs-accent'] === '#2b5797');
  S.ui.status.children[2].children[2].children[2].dispatch('click');
  t('상태 표시줄 + 는 글자 크게', calls.run.at(-1) === ':font +');
  void cfg;
}

// ---------------------------------------------------------------- 계약 쪽
{
  const { S } = load({ sidebarState: { forcedOpen: false } });
  t('원본을 가린다', S.covers === true && S.capturesTyping === true);
  t('대화 목록 오버레이는 직접 열 때만', S.sidebarShown() === false && S.persistSidebar === false);
  const o = load({ sidebarState: { forcedOpen: true } }).S;
  t('직접 열면 보인다', o.sidebarShown() === true);
  t('테마 두 벌이 스키마 선택지와 같다', Object.keys(S.themes).join() === 'green,blue');
  t(':messup 만 숨긴다 (:font 은 확대/축소로 쓴다)', S.hiddenCommands.join() === ':messup');
}

let bad = 0;
results.forEach(([n, ok]) => { if (!ok) bad++; console.log(`  ${ok ? 'PASS' : 'FAIL'}  ${n}`); });
console.log(bad ? `\n${bad}건 실패` : '\n전부 통과');
process.exit(bad ? 1 : 0);
