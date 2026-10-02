// 열린 탭 (VS Code 에디터 탭처럼) · Ctrl+, / Ctrl+. 이동 (0.25.0)
// 예전 :chats 는 최근 대화 40개를 전부 그렸다. 이제 '내가 연 대화' 만 · 닫을 수 있고 · 저장된다 (사용자 요청 2026-10-02).
// docs/plan/2026-10-02-open-tabs.md
import fs from 'node:fs'; import vm from 'node:vm';

const results = []; const t = (n, ok) => results.push([n, ok]);
const read = (f) => fs.readFileSync(f, 'utf8');

function load({ stored, path = '/c/a' } = {}) {
  const store = { ...(stored ? { 'gt.openTabs': stored } : {}) };
  const nav = [];
  let clock = 1000;
  // 가짜 타이머 — 여러 개를 들고, 지연 시간별로 골라 돌린다 (이동 250ms · 로딩바 300ms)
  let timers = []; let tid = 0;
  const sb = { console, Object, Array, String, Number, JSON, Math, Promise,
    Date: { now: () => (clock += 1) },
    setTimeout: (f, ms) => { timers.push({ id: ++tid, f, ms }); return tid; },
    clearTimeout: (id) => { timers = timers.filter((x) => x.id !== id); },
    location: { pathname: path },
    chrome: { storage: { local: { get: async (k) => (k in store ? { [k]: store[k] } : {}), set: async (o) => { Object.assign(store, JSON.parse(JSON.stringify(o))); } } } } };
  sb.GT = { navigate: { to: (h) => { nav.push(h); sb.location.pathname = h; }, newChat: () => { nav.push('/'); sb.location.pathname = '/'; } } };
  vm.createContext(sb);
  vm.runInContext(read('src/content/tabs.js'), sb, { filename: 'tabs.js' });
  // ms 만큼 시간을 흘리고 그 안에 끝나는 타이머를 돌린다. 인자가 없으면 이동 타이머(250ms)까지.
  const flush = (ms = 250) => {
    clock += ms;
    const due = timers.filter((x) => x.ms <= ms);
    timers = timers.filter((x) => x.ms > ms).map((x) => ({ ...x, ms: x.ms - ms }));
    due.forEach((x) => x.f());
  };
  return { T: sb.GT.tabs, store, nav, sb, flush, pending: () => timers.length };
}
const ids = (T) => T.list().map((x) => x.id).join(',');

{
  const { T, store } = load();
  T.open('/c/a', '가'); T.open('/c/b', '나'); T.open('/c/c', '');
  t('연 순서대로 탭에 들어간다', ids(T) === 'a,b,c');
  T.open('/c/a', '');
  t('이미 있는 대화는 다시 넣지 않는다 (순서 그대로)', ids(T) === 'a,b,c');
  t('제목이 비어 있으면 기존 제목을 지킨다', T.list()[0].title === '가');
  t('새 대화 화면(/)은 탭이 아니다', T.open('/', '') === null && ids(T) === 'a,b,c');
  T.open('/g/g-p-1/c/p9', '프로젝트');
  t('프로젝트 안의 대화도 — id 는 /c/ 뒤 · href 는 주소 그대로', T.list()[3].id === 'p9' && T.list()[3].href === '/g/g-p-1/c/p9');
  t('제목은 늦게 들어와도 채운다', T.title('c', '다') === true && T.list()[2].title === '다');
  t('같은 제목이면 다시 저장하지 않는다', T.title('c', '다') === false);
  t('local 에 저장한다 (sync 아님)', Array.isArray(store['gt.openTabs']) && store['gt.openTabs'].length === 4);
  t('저장 키', T.KEY === 'gt.openTabs' && !/storage\.sync/.test(read('src/content/tabs.js')));
}
{
  const { T } = load({ stored: [{ id: 'x', href: '/c/x', title: '엑스', seen: 1 }, { bad: true }] });
  await T.load();
  t('저장해 둔 탭을 다시 읽는다 (망가진 항목은 버린다)', ids(T) === 'x' && T.list()[0].title === '엑스');
}
{
  const { T } = load();
  T.open('/c/a', ''); T.open('/c/b', ''); T.open('/c/c', '');
  t('닫으면 오른쪽 탭을 돌려준다', T.close('b').id === 'c' && ids(T) === 'a,c');
  t('맨 오른쪽을 닫으면 왼쪽', T.close('c').id === 'a');
  t('마지막 하나를 닫으면 없음', T.close('a') === null && ids(T) === '');
  t('없는 탭을 닫으면 아무것도 안 한다', T.close('zz') === null);
}
{
  const { T } = load();
  for (let i = 0; i < T.MAX + 5; i++) T.open('/c/n' + i, '');
  t(`최대 ${'MAX'} 개 — 넘치면 오래 안 본 탭부터 닫는다`, T.list().length === T.MAX && T.list()[0].id === 'n5');
  T.open('/c/n5', '');                       // n5 를 다시 본다
  T.open('/c/new', '');
  t('다시 본 탭은 살아남는다', T.list().some((x) => x.id === 'n5') && !T.list().some((x) => x.id === 'n6'));
}
{
  const { T, nav, sb, flush } = load({ path: '/c/b' });
  T.open('/c/a', ''); T.open('/c/b', ''); T.open('/c/c', '');
  T.go(1); flush(); t('Ctrl+. 다음 탭', nav.at(-1) === '/c/c');
  T.go(1); flush(); t('끝에서 다음은 처음으로', nav.at(-1) === '/c/a');
  T.go(-1); flush(); t('Ctrl+, 이전 (처음에서 이전은 끝)', nav.at(-1) === '/c/c');
  sb.location.pathname = '/';
  T.go(1); flush(); t('새 대화 화면에서 다음은 첫 탭', nav.at(-1) === '/c/a');
  sb.location.pathname = '/';
  T.go(-1); flush(); t('새 대화 화면에서 이전은 끝 탭', nav.at(-1) === '/c/c');
  sb.location.pathname = '/c/b';
  const r = T.closeCurrent();
  t(':close 는 지금 탭을 닫고 오른쪽 탭으로', r.closed && ids(T) === 'a,c' && nav.at(-1) === '/c/c');
}
{
  // 휙휙 넘기기 — 강조는 바로 옮기고, 실제 이동은 손을 멈춘 뒤 한 번만 (debounce 0.25초)
  const { T, nav, flush } = load({ path: '/c/a' });
  T.open('/c/a', ''); T.open('/c/b', ''); T.open('/c/c', '');
  let redraws = 0; T.onChange(() => { redraws++; });
  T.go(1);
  t('누르자마자 강조가 옮겨 간다 (아직 이동은 안 함)', T.activeId() === 'b' && nav.length === 0 && redraws === 1);
  t('옮겨 둔 동안은 받는 중 표시', T.isLoading() === true);
  T.go(1);
  t('한 번 더 누르면 강조가 그 다음으로 (주소가 아니라 강조 기준)', T.activeId() === 'c' && nav.length === 0);
  flush();
  t('손을 멈추면 마지막 탭으로 한 번만 간다 (중간 탭은 불러오지 않는다)', nav.join() === '/c/c');
  t('대기 시간 0.25초', T.GO_DELAY_MS === 250);
  T.loading(true); t('대화 원본을 받는 중 표시', T.isLoading() === true);
  T.loading(false); t('받으면 표시를 끈다', T.isLoading() === false);
}
{
  const { T, nav } = load({ path: '/c/a' });
  T.open('/c/a', '');
  T.closeCurrent();
  t('마지막 탭을 닫으면 새 대화', nav.at(-1) === '/' && ids(T) === '');
  t('열린 탭에 없으면 닫지 않는다', T.closeCurrent().closed === false);
}

// ---------------------------------------------------------------- 빠르게 넘길 때 탭 제목이 섞이던 것 (0.25.2)
// 사용자 보고: 1 → 2 → 3 을 빠르게 넘기면 2 · 3번 탭 이름이 1번으로 바뀐다.
// 주소는 먼저 바뀌고 화면 대화는 대화 원본이 도착한 뒤에 바뀐다. 그 사이 '지금 주소 + 지금 화면 제목' 을 짝지어 저장했다.
{
  const idx = read('src/content/index.js');
  const pullSrc = (/  async function pull\(why\) \{[\s\S]*?\n  \}\n/.exec(idx) || [''])[0];
  t('pull 을 꺼냈다', !!pullSrc);
  const sb = { console, Object, Array, String, Number, JSON, Math, Promise, Map, Set, Date,
    location: { pathname: '/c/1' },
    chrome: { storage: { local: { get: async () => ({}), set: async () => {} } } },
    setTimeout: (f) => 0, clearTimeout: () => {} };
  sb.GT = { log() {}, navigate: { to() {}, newChat() {} } };
  vm.createContext(sb);
  vm.runInContext(read('src/content/store.js'), sb, { filename: 'store.js' });
  vm.runInContext(read('src/content/conversation.js').replace(/async function load\(id\) \{[\s\S]*?\n  \}\n/, 'async function load(id) { return GT.__load(id); }\n'), sb, { filename: 'conversation.js' });
  vm.runInContext(read('src/content/tabs.js'), sb, { filename: 'tabs.js' });
  const S = sb.GT.store, T = sb.GT.tabs;
  // index.js 의 store 변경 처리기에서 탭 제목을 쓰는 부분을 그대로 돌린다
  const i0 = idx.indexOf('    const tabId = GT.tabs.idOf(location.pathname);');
  const onChangeSrc = i0 > 0 ? idx.slice(i0, idx.indexOf('    const now = !!GT.store.state.streamingId;', i0)) : '';
  t('제목 쓰는 조건을 꺼냈다', !!onChangeSrc);
  vm.runInContext(`GT.store.onChange(() => {\n${onChangeSrc}});\n${pullSrc}\nglobalThis.__pull = pull;`, sb);
  const titles = { 1: '하나', 2: '둘', 3: '셋' };
  const waits = {};
  sb.GT.__load = (id) => new Promise((res) => { waits[id] = () => res({ id, title: titles[id], messages: [{ id: 'm' + id, role: 'user', text: titles[id] }] }); });

  // 1번을 보고 있다
  T.open('/c/1', '');
  const p1 = sb.__pull('route'); waits[1](); await p1;
  t('1번 제목', T.list()[0].title === '하나' && S.state.conversationId === '1');
  // 2번으로, 응답이 오기 전에 3번으로
  sb.location.pathname = '/c/2'; T.open('/c/2', ''); const p2 = sb.__pull('route');
  S.setTitle(S.state.conversationTitle);                          // 그 사이 화면이 다시 그려진다 (onChange — 화면은 아직 1번)
  t('응답 전에 화면이 다시 그려져도 2번 탭에 1번 제목을 쓰지 않는다', T.list().find((x) => x.id === '2').title === '');
  sb.location.pathname = '/c/3'; T.open('/c/3', ''); const p3 = sb.__pull('route');
  waits[3](); await p3;                                          // 3번이 먼저 도착
  waits[2](); await p2;                                          // 2번이 늦게 도착
  const byId = Object.fromEntries(T.list().map((x) => [x.id, x.title]));
  t('2번 탭에 1번 제목이 들어가지 않는다', byId['2'] !== '하나');
  t('3번 탭은 3번 제목', byId['3'] === '셋');
  t('2번 탭은 늦게 와도 자기 제목 (API 가 준 그 대화의 것)', byId['2'] === '둘');
  t('늦게 온 2번 응답이 화면을 덮지 않는다 (3번 내용 그대로)', S.state.conversationId === '3' && S.state.messages.some((m) => m.text === '셋') && !S.state.messages.some((m) => m.text === '둘'));
}
{
  const conv = read('src/content/conversation.js');
  const sb = { location: { pathname: '/' } }; vm.createContext(sb);
  vm.runInContext(conv.slice(conv.indexOf('  const idFromPath'), conv.indexOf('};', conv.indexOf('  const idFromPath')) + 2) + '\nglobalThis.__id = idFromPath;', sb);
  t('프로젝트 안의 대화도 대화 id 를 안다 (/g/…/c/<id>)', sb.__id('/g/g-p-abc-name/c/6a95-x') === '6a95-x' && sb.__id('/c/6a95-x') === '6a95-x' && sb.__id('/g/g-p-abc/project') === null);
}

// ---------------------------------------------------------------- 단축키 (prompt.js 를 실제로 돌린다)
{
  const calls = { go: [] };
  const input = new EventTarget();
  Object.assign(input, { value: '', selectionStart: 0, selectionEnd: 0, style: {}, setSelectionRange() {}, focus() {} });
  const win = new EventTarget();
  let visible = true;
  const sb = { console, Object, Array, String, JSON, Promise, setTimeout, AbortController, Event, window: win,
    GT: { skin: { visible: () => visible, current: { setSuggest() {}, setMode() {}, syncFocus() {}, system() {}, focus() {} } },
      store: { isStreaming: () => false, userHistory: () => [] },
      commands: { parse: () => false, complete: () => ({ candidates: [] }), applyCompletion: () => null, run: async () => false, openPalette() {} },
      compose: { stop: () => false, stopButton: () => null }, health: { soft() {} }, tabs: { go: (d) => calls.go.push(d) },
      sidebar: { selecting: false, isOpen: () => false, filtering: false, element: null, toggle() {} }, palette: { isOpen: () => false } } };
  vm.createContext(sb);
  vm.runInContext(read('src/content/shell/prompt.js'), sb, { filename: 'prompt.js' });
  sb.GT.prompt.attach({ el: input, autosize() {} }, { toggle() {}, capturesTyping: true });
  const press = (props) => { const e = new Event('keydown', { cancelable: true }); Object.assign(e, { ctrlKey: false, metaKey: false, altKey: false, shiftKey: false, isComposing: false, keyCode: 0 }, props); win.dispatchEvent(e); return e; };
  const e1 = press({ key: ',', code: 'Comma', ctrlKey: true });
  t('Ctrl+, 는 이전 탭', calls.go.at(-1) === -1 && e1.defaultPrevented);
  press({ key: '.', code: 'Period', ctrlKey: true });
  t('Ctrl+. 는 다음 탭', calls.go.at(-1) === 1);
  press({ key: ',', code: 'Comma', ctrlKey: true, altKey: true, isComposing: true, keyCode: 229 });
  t('한글 상태(Alt · 조합 표시)에서도 된다', calls.go.length === 3);
  press({ key: ',', code: 'Comma', metaKey: true });
  t('⌘, 는 건드리지 않는다 (브라우저 설정 키)', calls.go.length === 3);
  press({ key: ',', code: 'Comma' });
  t('Ctrl 없이 , 는 글자다', calls.go.length === 3);
  visible = false;
  press({ key: '.', code: 'Period', ctrlKey: true });
  t('스킨이 꺼져 있으면 원본에 맡긴다', calls.go.length === 3);
}

// ---------------------------------------------------------------- 배선
{
  const mf = JSON.parse(read('manifest.json'));
  const js = mf.content_scripts.find((c) => c.world !== 'MAIN').js;
  t('매니페스트가 싣는다 (스킨 · 명령보다 먼저)', js.indexOf('src/content/tabs.js') > 0 && js.indexOf('src/content/tabs.js') < js.indexOf('src/content/skins/terminal.js'));
  t('하네스도 싣는다', read('tools/harness/index.html').includes('src/content/tabs.js'));
  const idx = read('src/content/index.js');
  t('대화가 바뀌면 탭에 넣는다', /lastPath = location\.pathname;\n\s*GT\.tabs\.open\(location\.pathname, ''\);/.test(idx));
  t('부팅 때 저장된 탭을 읽고 지금 대화를 넣는다', /GT\.tabs\.load\(\)\.then\(\(\) => GT\.tabs\.open\(location\.pathname/.test(idx));
  t('제목이 들어오면 채운다', /GT\.tabs\.title\(tabId, GT\.store\.state\.conversationTitle\)/.test(idx));
  t('탭이 바뀌면 상단을 다시 그린다', /GT\.tabs\.onChange\(\(\) => \{ try \{ GT\.skin\.current\.renderChrome\(\); \} catch/.test(idx));
  t('none 에서는 :close 를 숨긴다', /':close'/.test((/hiddenCommands: \[[^\]]*\]/.exec(read('src/content/skins/none.js')) || [''])[0]));
  const i18n = read('src/shared/i18n.js');
  ['cmd.close.desc', 'cmd.close.none', 'tabs.close', 'tabs.untitled'].forEach((k) => t(`문구 ${k} ko · en`, (i18n.match(new RegExp(`'${k.replace(/\./g, '\\.')}'`, 'g')) || []).length === 2));
}

// ---------------------------------------------------------------- 로딩바 (0.25.3)
// 대화를 바꾸는 사이 본문에는 이전 대화가 남아 있다 — 본문 위에 얇은 막대 · 본문 흐림. 300ms 넘을 때만, 뜨면 300ms 는 유지.
{
  const { T, flush } = load({ path: '/c/a' });
  T.open('/c/a', ''); T.open('/c/b', '');
  T.loading(true);
  t('받기 시작하자마자는 안 띄운다', T.barShown() === false);
  flush(299); t('300ms 전에는 안 띄운다', T.barShown() === false);
  flush(1); t('300ms 넘게 걸리면 띄운다', T.barShown() === true);
  flush(100); T.loading(false);
  t('뜬 지 300ms 안에 끝나도 바로 끄지 않는다 (번쩍임 방지)', T.barShown() === true);
  flush(200); t('최소 300ms 를 채우면 끈다', T.barShown() === false);
}
{
  const { T, flush } = load({ path: '/c/a' });
  T.loading(true); flush(150); T.loading(false); flush(500);
  t('빨리 끝나면 한 번도 안 띄운다', T.barShown() === false);
}
{
  const { T, flush } = load({ path: '/c/a' });
  T.open('/c/a', ''); T.open('/c/b', ''); T.open('/c/c', '');
  T.go(1); flush(100); T.go(1); flush(100); T.go(1);
  t('단축키를 계속 누르는 중에도 300ms 를 넘기면 띄운다 (누를 때마다 다시 세지 않는다)', (flush(100), T.barShown() === true));
}
{
  const sheet = read('src/content/skins/sheet.js'), tty = read('src/content/skins/terminal.js'), theme = read('src/content/theme.js');
  t('터미널: 본문 위 막대 · 본문 흐림', /ui\.loadbar = el\('div', 'gt-loadbar'\)/.test(tty) && /root\.dataset\.loading = on \? '1' : '0';/.test(tty) && /\.gt-root\[data-loading="1"\] \.gt-scroll \{ opacity:/.test(theme));
  t('시트: 격자 위 막대 · 격자 흐림', /ui\.loadbar = el\('div', 'gs-loadbar'\)/.test(sheet) && /root\.dataset\.loading = on \? '1' : '0';/.test(sheet) && /\.gs-root\[data-loading="1"\] \.gs-grid \{ opacity:/.test(sheet));
  t('움직임 줄이기면 흐르지 않는다', /prefers-reduced-motion: reduce\) \{ \.gt-loadbar/.test(theme) && /prefers-reduced-motion: reduce\) \{ \.gs-loadbar/.test(sheet));
  t('시트: 탭 줄을 숨겨도 지금 탭에 받는 중 표시', /tabEl\(\(s\.conversationTitle \|\| T\('sheet\.newChat'\)\) \+ \(busy \? ' …' : ''\), true\)/.test(sheet));
}

let bad = 0;
results.forEach(([n, ok]) => { if (!ok) bad++; console.log(`  ${ok ? 'PASS' : 'FAIL'}  ${n}`); });
console.log(bad ? `\n${bad}건 실패` : '\n전부 통과');
process.exit(bad ? 1 : 0);
