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
    location: { pathname: '/c/abc' },
    chrome: { runtime: { getManifest: () => ({ version: '0.0.0' }) },
      storage: { local: { get: async () => ({}), set: async (o) => { sb.__stored = o; } } } } };
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
  vm.runInContext(read('src/content/renderplan.js'), sb, { filename: 'renderplan.js' });
  vm.runInContext(read('src/content/tabs.js'), sb, { filename: 'tabs.js' });
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
  const e = S.ui.grid.dispatch('keydown', { key: 'c', code: 'KeyC', metaKey: true });
  t('⌘C 로 셀 글자를 복사한다', calls.copy.at(-1) === '가' && e.defaultPrevented);
  state.messages = [{ id: 'u0', role: 'user', text: '새 첫 줄' }, ...state.messages];
  S.render();
  t('앞에 행이 생겨도 고른 셀을 따라간다', S.ui.namebox.textContent === 'B2');
  S.ui.input.dispatch('focus');
  t('입력줄에 들어가면 선택을 푼다', S.ui.namebox.textContent === 'B5' && !S.ui.body.querySelector('[data-sel="1"]'));
}

// ---------------------------------------------------------------- 하네스에서 찾은 것 (2026-09-24)
{
  const { S, state, calls } = load();
  S.mount({ 'font.size': 13 });
  state.messages = [{ id: 'a1', role: 'assistant', text: '- 하나\n  - 둘' }];
  S.render();
  S.ui.body.children[1].children[2].dispatch('mousedown');
  S.ui.grid.dispatch('keydown', { key: 'c', code: 'KeyC', ctrlKey: true });
  t('목록 행을 복사하면 글머리를 뺀다', calls.copy.at(-1) === '둘');
  const src = read('src/content/skins/sheet.js');
  t('빈 행은 칸만 숨기고 행 번호는 보인다', /tr\.gs-blank > td:not\(\.gs-rn\) \{ color: transparent; \}/.test(src) && !/gs-blank > td \{ color: transparent/.test(src));
  S.render();
  const blank = S.ui.tail.children[1];
  t('빈 행에도 번호가 있다', blank.children[0].textContent === String(S.ui.body.children.length + 2));
}
{
  // 하네스가 스킨 파일을 전부 싣는다 — 새 스킨을 넣고 하네스를 잊으면 브라우저 확인을 못 한다
  const html = read('tools/harness/index.html');
  const skins = fs.readdirSync('src/content/skins').filter((f) => f.endsWith('.js'));
  t('하네스가 모든 스킨을 싣는다', skins.every((f) => html.includes(`src/content/skins/${f}`)));
  t('하네스가 진짜 입력 컨트롤러와 명령을 싣는다', html.includes('src/content/shell/prompt.js') && html.includes('src/content/commands.js'));
}

// ---------------------------------------------------------------- 밝은 스킨과 공유하는 CSS (하네스 실측 2026-09-24)
{
  const theme = read('src/content/theme.js');
  const css = theme.slice(theme.indexOf('const CSS = `'), theme.indexOf('`;', theme.indexOf('const CSS = `')));
  // color: #fff 처럼 글자색을 박으면 시트의 흰 바탕에서 사라진다. var(--x, #fff) 의 기본값은 괜찮다.
  const fixed = (css.match(/(^|[;{\s])color:\s*(#[0-9a-f]{3,8}|rgba?\([^)]*\)|white|black)/gim) || []);
  t('공유 CSS 는 글자색을 고정값으로 쓰지 않는다', fixed.length === 0);
  if (fixed.length) console.log('    ', fixed.join(' | '));
  const { S } = load();
  t('시트 테마가 강조 글자색을 정의한다', Object.values(S.themes).every((th) => th['--gt-fg-strong'] && th['--gt-fg-strong'] !== '#fff' && th['--gt-fg-strong'] !== '#ffffff'));
  const sheet = read('src/content/skins/sheet.js');
  t('격자는 기준 높이 0 (행 추가마다 전체를 재지 않게)', /\.gs-grid \{ flex: 1 1 0;[^}]*contain: strict;/.test(sheet));
  t('화면 밖 행은 배치를 건너뛴다', /\.gs-grid > table > tbody > tr \{ content-visibility: auto;/.test(sheet));
  // 칸 안에 명령 결과 표(:ls)가 들어간다. 격자 규칙이 자손 선택자면 그 표까지 4열 그리드가 된다 (하네스 실측).
  // 클래스가 붙은 규칙(td.gs-a …)은 명령 결과 표에 걸리지 않는다. 클래스 없는 요소 규칙만 본다.
  const loose = sheet.match(/\.gs-grid (table|thead|tbody|tr|th|td|colgroup)(?![.\w-])[^{]*\{/g) || [];
  t('격자의 요소 규칙은 자식 선택자로만 (칸 안 표를 건드리지 않게)', loose.length === 0);
  if (loose.length) console.log('    ', loose.join(' | '));
}

// ---------------------------------------------------------------- 바뀌지 않은 메시지는 다시 펴지 않는다
{
  const { S, state, sb } = load();
  S.mount({ 'font.size': 13 });
  state.messages = [{ id: 'a1', role: 'assistant', text: '하나\n\n둘' }, { id: 'a2', role: 'assistant', text: '셋', streaming: true }];
  S.render();
  const orig = sb.GT.markdown.lines; let calls = 0;
  sb.GT.markdown.lines = (...a) => { calls++; return orig(...a); };
  state.messages[1] = { ...state.messages[1], text: '셋 넷' };
  S.render();
  t('스트리밍 중인 메시지만 다시 편다', calls === 1);
  calls = 0; S.render();
  t('아무것도 안 바뀌면 다시 펴지 않는다', calls === 0);
  state.messages[0] = { ...state.messages[0], text: '하나\n\n넷' };   // 길이 그대로, 내용만
  S.render();
  t('길이가 같아도 내용이 바뀌면 다시 편다', calls === 1 && S.ui.body.children[1].textContent.includes('넷'));
  sb.GT.markdown.lines = orig;
}

// ---------------------------------------------------------------- 묶음 4 — 새 내용 알림 · 메시지 복사 (2026-09-29)
{
  const { S, state } = load();
  S.mount({ 'font.size': 13 });
  state.messages = [{ id: 'u1', role: 'user', text: '질문' }];
  const g = S.ui.grid;
  Object.assign(g, { scrollTop: 0, clientHeight: 100, scrollHeight: 1000 });     // 위로 올려 둔 상태
  S.render();
  t('처음 그릴 때 위에 있으면 알린다 (내용이 바뀌었다)', S.ui.below.hidden === false);
  S.ui.below.hidden = true;
  S.render();
  t('바뀐 게 없으면 알리지 않는다', S.ui.below.hidden === true);
  state.messages = [...state.messages, { id: 'a1', role: 'assistant', text: '답' }];
  S.render();
  t('위로 올려 둔 사이 새 내용이 오면 알린다', S.ui.below.hidden === false);
  S.ui.below.dispatch('mousedown');
  t('누르면 바닥으로 가고 사라진다', S.ui.below.hidden === true && g.scrollTop === 1000);
  S.ui.below.hidden = false;
  Object.assign(g, { scrollTop: 900, clientHeight: 100, scrollHeight: 1000 });
  g.dispatch('scroll');
  t('바닥까지 내리면 사라진다', S.ui.below.hidden === true);
  state.messages = [...state.messages, { id: 'a2', role: 'assistant', text: '또' }];
  S.render();
  t('바닥에 있으면 알리지 않고 따라간다', S.ui.below.hidden === true);
}
{
  const { S, state, calls } = load();
  S.mount({ 'font.size': 13 });
  state.messages = [{ id: 'u1', role: 'user', text: '한 줄' }, { id: 'a1', role: 'assistant', text: '첫 문단\n\n- 항목 **굵게**' }];
  S.system('info', '명령 결과');
  S.render();
  S.ui.body.children[2].children[0].dispatch('mousedown');          // 답의 둘째 행 번호
  t('행 번호를 누르면 메시지 전체를 고른다', S.ui.body.children[1].dataset.msgsel === '1' && S.ui.body.children[2].dataset.msgsel === '1' && S.ui.body.children[0].dataset.msgsel !== '1');
  t('이름 상자는 행 범위', S.ui.namebox.textContent === '2:3');
  S.ui.grid.dispatch('keydown', { key: 'c', code: 'KeyC', metaKey: true });
  t('⌘C 는 메시지 원문(마크다운)을 복사한다', calls.copy.at(-1) === '첫 문단\n\n- 항목 **굵게**');
  S.ui.body.children[3].children[0].dispatch('mousedown');          // 명령 결과 행
  t('명령 결과 행은 메시지가 아니라 고르지 않는다', S.ui.body.children[3].dataset.msgsel !== '1' && S.ui.namebox.textContent === '2:3');
  S.ui.body.children[0].children[2].dispatch('mousedown');          // 셀을 누르면 셀 선택으로
  t('셀을 누르면 메시지 선택이 풀린다', S.ui.body.children[1].dataset.msgsel !== '1' && S.ui.namebox.textContent === 'B1');
}

// ---------------------------------------------------------------- 시트 탭 — 열린 탭 (0.25.0)
// 내가 연 대화만 · × 로 닫기 · 터미널과 같은 목록 (src/content/tabs.js). 기본은 지금 대화 탭만.
{
  const { S, calls, sb } = load();
  let loads = 0;
  sb.GT.chats.load = async () => { loads++; return { pinned: [], chats: [], projects: [] }; };
  sb.GT.tabs.open('/c/x2', 'K8s 설명');
  sb.GT.tabs.open('/c/abc', '도커 정리');
  sb.GT.tabs.open('/g/g-p-1/c/p9', '프로젝트 대화');
  S.mount({ 'font.size': 13 });
  await tick(); await tick();
  t('기본은 지금 대화 탭만', S.ui.tablist.children.length === 1 && S.ui.tablist.children[0].textContent === '도커 정리');
  t('넘기기 버튼도 숨긴다', S.ui.tabnav.hidden === true);
  S.ui.tabs.children[2].dispatch('click');
  t('숨겨도 + 는 새 대화', calls.newChat === 1);
  S.applyConfig({ 'font.size': 13, 'sheet.chatTabs': true });
  const names = () => S.ui.tablist.children.map((n) => n.children[0].textContent);
  t('켜면 열린 탭을 연 순서대로', names().join('|') === 'K8s 설명|도커 정리|프로젝트 대화' && S.ui.tabnav.hidden === false);
  t('지금 대화 탭이 켜져 있다', S.ui.tablist.children[1].dataset.on === '1');
  t('탭 줄 때문에 대화 목록 API 를 읽지 않는다', loads === 0);
  S.ui.tablist.children[2].dispatch('mousedown', { button: 0 });
  t('탭을 누르면 그 대화로 (프로젝트 경로 그대로)', calls.nav.at(-1) === '/g/g-p-1/c/p9');
  S.ui.tablist.children[0].children[1].dispatch('mousedown', { button: 0, stopPropagation() {} });
  t('× 로 닫는다 (다른 탭이면 이동 없이)', names().join('|') === '도커 정리|프로젝트 대화' && calls.nav.at(-1) === '/g/g-p-1/c/p9');
  S.ui.tablist.children[1].dispatch('mousedown', { button: 1 });
  t('가운데 버튼으로도 닫는다', names().join('|') === '도커 정리');
  S.ui.tablist.children[0].children[1].dispatch('mousedown', { button: 0, stopPropagation() {} });
  t('지금 탭을 닫고 남은 탭이 없으면 새 대화', calls.newChat === 2);
  S.applyConfig({ 'font.size': 13, 'sheet.chatTabs': false });
  t('다시 끄면 지금 대화 탭만', S.ui.tablist.children.length === 1);
  t('설정 항목이 시트 전용 · 기본 끔', (() => { const f = sb.GT_SCHEMA.find((x) => x.key === 'sheet.chatTabs'); return f && f.def === false && f.skin === 'sheet' && f.type === 'bool'; })());
}

// ---------------------------------------------------------------- 명령 결과 · 생각 중 · 설정
{
  const { S, state, setThinking, cfg, calls, sb } = load();
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
  S.applyConfig({ 'font.size': 13, 'line.height': 2, 'sheet.theme': 'green' });
  const varCss = sb.__shadow.children.filter((n) => n.tagName === 'STYLE').map((n) => n.textContent).join('');
  t('시트가 줄 간격 설정을 따른다', /--gt-lh:2;/.test(varCss));
  S.ui.status.children[2].children[3].children[2].dispatch('click');
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
  t('숨기는 명령이 없다 (:messup 도 시트 맛으로 쓴다)', S.hiddenCommands.length === 0 && S.messup === 'sheet');
}

// ---------------------------------------------------------------- 표는 칸으로 나눈다 (0.18.0)
// 예전에는 'a | b | c' 한 줄 글자로 그려 칸 너비가 행마다 달라 세로줄이 어긋났다.
// docs/plan/2026-10-01-sheet-messup.md
{
  const { S, state, calls } = load();
  const md = '표입니다\n\n| 지역 | 합계 | 비고 |\n|---|--:|---|\n| 수도권 | ₩12,480,000 | 많음 |\n| 영남 | (1,240,000) | 줄어듦 |\n| 합계 | ▲ 4.2% | - |\n\n끝';
  const rows = JSON.parse(JSON.stringify(S.rowsOf({ role: 'assistant', text: md })));
  const tbl = rows.filter((r) => r.kind === 'table');
  t('표 행이 넷 (머리 + 셋)', tbl.length === 4 && tbl[0].header);
  t('한 표의 행은 같은 칸 너비를 갖는다', tbl.every((r) => JSON.stringify(r.widths) === JSON.stringify(tbl[0].widths)));
  t('칸 너비는 가장 긴 칸 + 여백 (한글 · ₩ 같은 기호는 두 칸)', tbl[0].widths[0] === 6 + 2 && tbl[0].widths[1] === 12 + 2);
  t('숫자 열을 안다 (통화 · 회계 괄호 · 증감)', JSON.stringify(tbl[0].nums) === '[false,true,false]');

  const two = JSON.parse(JSON.stringify(S.rowsOf({ role: 'assistant', text: '| a |\n|---|\n| 1 |\n\n문단\n\n| 아주긴머리 |\n|---|\n| x |' })));
  const t2 = two.filter((r) => r.kind === 'table');
  t('표가 둘이면 너비를 따로 잰다', t2[0].widths[0] !== t2[2].widths[0]);

  S.mount({ 'font.size': 13 });
  state.messages = [{ id: 'a1', role: 'assistant', text: md }];
  S.render();
  const trs = S.ui.body.children.filter((tr) => tr.children[2].dataset.kind === 'table');
  const b0 = trs[0].children[2], b1 = trs[1].children[2];
  t('표 행의 B 칸이 칸(span)으로 나뉜다', b1.children.length === 3 && b1.children.every((c) => c.className.split(' ').includes('gs-tc')));
  t('칸 너비가 격자 열로 들어간다', /^minmax\(0, \d+ch\) minmax\(0, \d+ch\) minmax\(0, \d+ch\)$/.test(b1.style.gridTemplateColumns));
  t('모든 표 행이 같은 격자 열', trs.every((tr) => tr.children[2].style.gridTemplateColumns === b1.style.gridTemplateColumns));
  t('숫자 열은 오른쪽 정렬 칸', b1.children[1].className.includes('gs-num') && !b1.children[0].className.includes('gs-num'));
  t('머리 행은 숫자 정렬을 하지 않는다', !b0.children[1].className.includes('gs-num'));
  t('칸 글자가 그대로', b1.children[1].textContent === '₩12,480,000');
  b1.dispatch('mousedown');
  S.ui.grid.dispatch('keydown', { key: 'c', code: 'KeyC', metaKey: true });
  t('표 행을 복사하면 칸을 탭으로 잇는다', calls.copy.at(-1) === '수도권\t₩12,480,000\t많음');
}

// ---------------------------------------------------------------- :messup 블록 (0.18.0)
{
  const { S, state, calls } = load();
  S.mount({ 'font.size': 13 });
  state.messages = [{ id: 'u1', role: 'user', text: '질문' }, { id: 'a1', role: 'assistant', text: '답' }];
  S.render();
  const n = S.local('### 다시 계산 · 시트!$A$1:$B$9\n\n```formula\n=SUM(A:A)\n```\n\n| 구분 | 합계 |\n|---|--:|\n| 가 | ₩1,000 |');
  t('local 이 블록 수를 돌려준다', n === 1);
  let rows = rowsText(S);
  t('블록이 마지막 메시지 뒤에 들어간다', rows[0][2] === '질문' && rows[1][2] === '답' && rows[2][1] === 'local');
  t('첫 행은 라벨 행 — 화면에만 있는 출력', /화면에만 있는 출력/.test(rows[2][2]) && /서버로 가지 않습니다/.test(rows[2][2]));
  t('라벨 행에 시각', /\d\d:\d\d/.test(rows[2][3]));
  const lrows = S.ui.body.children.filter((tr) => tr.dataset.local);
  t('블록 행마다 표시가 붙는다 (점선)', lrows.length === rows.length - 2);
  t('점선의 처음과 끝', lrows[0].dataset.local === 'first' && lrows.at(-1).dataset.local === 'last'
    && lrows.slice(1, -1).every((tr) => tr.dataset.local === 'mid'));
  const fxRow = lrows.find((tr) => tr.children[2].children.some((c) => c.className === 'gs-fxchip'));
  t('수식 행에 fx 표시', !!fxRow && fxRow.children[2].textContent === 'fx=SUM(A:A)');
  fxRow.children[2].dispatch('mousedown');
  S.ui.grid.dispatch('keydown', { key: 'c', code: 'KeyC', metaKey: true });
  t('fx 표시는 복사하지 않는다', calls.copy.at(-1) === '=SUM(A:A)');
  t('블록의 표도 칸으로 나뉜다', lrows.some((tr) => tr.children[2].dataset.kind === 'table' && tr.children[2].children.length === 2));

  state.messages = state.messages.concat([{ id: 'u2', role: 'user', text: '다음 질문' }]);
  S.render();
  rows = rowsText(S);
  t('새 메시지가 와도 블록은 제자리 (새 글은 블록 아래)', rows.at(-1)[2] === '다음 질문' && rows[2][1] === 'local');

  S.local('두번째');
  t('두 번째 블록은 그때의 마지막 메시지 뒤', rowsText(S).at(-2)[1] === 'local' && rowsText(S).at(-1)[2] === '두번째');
  const only = S.ui.body.children.at(-1);
  t('한 행짜리 끝 행도 점선 끝', only.dataset.local === 'last');

  const gone = S.clearLocal();
  t('clearLocal 은 걷어낸 블록 수를 돌려준다', gone === 2);
  t('걷어내면 블록 행이 없다', S.ui.body.children.every((tr) => !tr.dataset.local) && rowsText(S).length === 3);
}
{
  const sheet = read('src/content/skins/sheet.js');
  t('움직이는 점선 CSS 가 있다', /@keyframes gs-ants-2/.test(sheet) && /tr\[data-local="first"\] > td\.gs-b/.test(sheet));
  t('움직임 줄이기면 멈춘다', /prefers-reduced-motion: reduce\) \{ \.gs-grid > table > tbody > tr\[data-local\] > td\.gs-b \{ animation: none;/.test(sheet));
  t('fx 칩이 수식 입력줄의 클래스(.gs-fx)와 겹치지 않는다', !/el\('span', 'gs-fx',/.test(sheet) && /'gs-fxchip'/.test(sheet));
  t('끼우는 순서는 renderplan 이 갖는다', /GT\.renderplan\.interleave\(keys, localLog\)/.test(sheet));
  t('라벨 문구는 사전에서 (ko · en)', /'sheet\.local\.label'/.test(read('src/shared/i18n.js'))
    && (read('src/shared/i18n.js').match(/'sheet\.local\.label'/g) || []).length === 2);
}

// 이 파일의 CSS 는 스타일 문자열이라 CSS.escape 가 없다 — 고른 행이 사라질 때 TypeError (0.17.1)
{
  const { S, state } = load();
  S.mount({ 'font.size': 13 });
  state.messages = [{ id: 'a1', role: 'assistant', text: '답' }];
  S.system('info', '명령 결과');
  S.render();
  const sysRow = S.ui.body.children.at(-1);
  sysRow.children[2].dispatch('mousedown');
  let threw = null;
  try { S.clearSystem(); } catch (e) { threw = e; }
  t('고른 행을 지워도 터지지 않는다', threw === null);
  const sheet = read('src/content/skins/sheet.js');
  t('CSS.escape 는 window 에서 꺼낸다', !/[^.\w]CSS\.escape\(/.test(sheet) && /window\.CSS\.escape\(/.test(sheet));
}

// ---------------------------------------------------------------- :chats — 시트 탭의 대화 목록 켜고 끄기 (0.21.2)
{
  const said = []; const cfgStore = { 'sheet.chatTabs': false };
  const sb = { console, Object, Array, Set, Map, String, Number, Boolean, JSON, Math, Promise, Error, RegExp, Date,
    location: { pathname: '/c/x' }, document: { createElement: () => ({ style: {}, appendChild() {}, addEventListener() {} }) } };
  sb.window = sb; sb.globalThis = sb;
  sb.GT = { theme: { names: () => [] }, config: { keys: () => [], get: (k) => cfgStore[k], set: async (k, v) => { cfgStore[k] = v; }, DEFAULTS: {} },
    chats: { projects: () => [] }, store: { state: { messages: [] } },
    skin: { hide() {}, current: { id: 'sheet', hiddenCommands: [], system: (l, x) => said.push([l, x]), applyConfig() {}, render() {} } },
    sidebar: { chats: () => [], isOpen: () => false }, convops: {}, conversation: { idFromPath: () => 'x' }, picker: {}, navigate: {},
    health: { CHECKS: {}, reasons: [] }, palette: {}, oai: {}, compose: {} };
  vm.createContext(sb);
  vm.runInContext(read('src/shared/i18n.js'), sb, { filename: 'i18n.js' });
  vm.runInContext(read('src/content/commands.js'), sb, { filename: 'commands.js' });
  const C = sb.GT.commands;
  await C.run(':chats');
  t(':chats 는 켜고 끄기를 번갈아 한다 (꺼짐 → 켜짐)', cfgStore['sheet.chatTabs'] === true && /보입니다/.test(said.at(-1)[1]));
  await C.run(':chats');
  t('한 번 더 치면 끈다', cfgStore['sheet.chatTabs'] === false && /숨깁니다/.test(said.at(-1)[1]));
  await C.run(':chats on'); t(':chats on', cfgStore['sheet.chatTabs'] === true);
  await C.run(':chats on'); t('on 은 켠 채로 둔다', cfgStore['sheet.chatTabs'] === true);
  await C.run(':chats off'); t(':chats off', cfgStore['sheet.chatTabs'] === false);
  await C.run(':chats 아무거나'); t('모르는 인자는 사용법', said.at(-1)[0] === 'error' && /사용법/.test(said.at(-1)[1]));
  t('자동완성 on · off · toggle', ['on', 'off', 'toggle'].every((x) => C.complete(':chats ').candidates.includes(x)));
  // 터미널에서는 위쪽 탭 줄(terminal.chatTabs)을 켜고 끈다 (0.23.0)
  sb.GT.skin.current.id = 'terminal';
  await C.run(':chats'); t('터미널 :chats 는 위쪽 탭 줄을 켠다', cfgStore['terminal.chatTabs'] === true && /보입니다/.test(said.at(-1)[1]));
  await C.run(':chats'); t('터미널 한 번 더 치면 끈다', cfgStore['terminal.chatTabs'] === false);
  await C.run(':chats on'); t('터미널 :chats on', cfgStore['terminal.chatTabs'] === true);
  t('터미널에서는 시트 설정을 건드리지 않는다', cfgStore['sheet.chatTabs'] === false);
  await C.run(':chats 뭐'); t('터미널에서도 모르는 인자는 사용법', said.at(-1)[0] === 'error' && cfgStore['terminal.chatTabs'] === true);
  const tty = read('src/content/skins/terminal.js'), none = read('src/content/skins/none.js');
  // 터미널 위쪽 탭 줄 (하네스 실측 2026-10-02: 끔 → 지금 대화 1개, 켬 → 4개, 탭을 누르면 그 대화로, 끄면 1개)
  t('터미널 탭 줄은 설정 terminal.chatTabs 로 켠다', /const wantTabs = cfg\['terminal\.chatTabs'\] === true;/.test(tty));
  t('탭 줄은 열린 탭(GT.tabs)을 그린다 — 대화 목록 API 를 읽지 않는다', /const open = chatTabs \? GT\.tabs\.list\(\) : \[\];/.test(tty) && !/GT\.chats\.load\(/.test(tty.slice(tty.indexOf('대화 탭 (:chats)'), tty.indexOf('function applyConfig'))));
  t('1초마다 다시 그리지 않는다 (지문이 같으면 그대로)', /if \(sig === tabsSig\) return;/.test(tty));
  t('탭을 누르면 그 대화로 · × 로 닫는다', /\(\) => GT\.navigate\.to\(t\.href\), \(\) => closeTab\(t\.id\)\)/.test(tty));
  t('스킨을 떼면 탭 상태도 비운다', /chatTabs = false; tabsSig = '';/.test(tty));
  t('터미널 탭 설정이 터미널 전용 · 기본 끔', (() => { const f = sb.GT_SCHEMA ? sb.GT_SCHEMA.find((x) => x.key === 'terminal.chatTabs') : null;
    const src = read('src/shared/defaults.js'); return /key: 'terminal\.chatTabs', type: 'bool', def: false, skin: 'terminal'/.test(src) && (f === null || f.def === false); })());
  t('터미널에서는 숨기지 않는다', !/':chats'/.test((/hiddenCommands: \[[^\]]*\]/.exec(tty) || [''])[0]));
  t('none 에서는 숨긴다 (원본에 목록이 있다)', /hiddenCommands: \[[^\]]*':chats'/.test(none));
  t('시트에서는 숨기지 않는다', !/':chats'/.test((/hiddenCommands: \[[^\]]*\]/.exec(read('src/content/skins/sheet.js')) || [''])[0]));
}

let bad = 0;
results.forEach(([n, ok]) => { if (!ok) bad++; console.log(`  ${ok ? 'PASS' : 'FAIL'}  ${n}`); });
console.log(bad ? `\n${bad}건 실패` : '\n전부 통과');
process.exit(bad ? 1 : 0);
