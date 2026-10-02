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
  const sb = { console, Object, Array, String, Number, JSON, Math, Promise,
    Date: { now: () => (clock += 1) },
    location: { pathname: path },
    chrome: { storage: { local: { get: async (k) => (k in store ? { [k]: store[k] } : {}), set: async (o) => { Object.assign(store, JSON.parse(JSON.stringify(o))); } } } } };
  sb.GT = { navigate: { to: (h) => { nav.push(h); sb.location.pathname = h; }, newChat: () => { nav.push('/'); sb.location.pathname = '/'; } } };
  vm.createContext(sb);
  vm.runInContext(read('src/content/tabs.js'), sb, { filename: 'tabs.js' });
  return { T: sb.GT.tabs, store, nav, sb };
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
  const { T, nav, sb } = load({ path: '/c/b' });
  T.open('/c/a', ''); T.open('/c/b', ''); T.open('/c/c', '');
  T.go(1); t('Ctrl+. 다음 탭', nav.at(-1) === '/c/c');
  T.go(1); t('끝에서 다음은 처음으로', nav.at(-1) === '/c/a');
  T.go(-1); t('Ctrl+, 이전 (처음에서 이전은 끝)', nav.at(-1) === '/c/c');
  sb.location.pathname = '/';
  T.go(1); t('새 대화 화면에서 다음은 첫 탭', nav.at(-1) === '/c/a');
  sb.location.pathname = '/';
  T.go(-1); t('새 대화 화면에서 이전은 끝 탭', nav.at(-1) === '/c/c');
  sb.location.pathname = '/c/b';
  const r = T.closeCurrent();
  t(':close 는 지금 탭을 닫고 오른쪽 탭으로', r.closed && ids(T) === 'a,c' && nav.at(-1) === '/c/c');
}
{
  const { T, nav } = load({ path: '/c/a' });
  T.open('/c/a', '');
  T.closeCurrent();
  t('마지막 탭을 닫으면 새 대화', nav.at(-1) === '/' && ids(T) === '');
  t('열린 탭에 없으면 닫지 않는다', T.closeCurrent().closed === false);
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

let bad = 0;
results.forEach(([n, ok]) => { if (!ok) bad++; console.log(`  ${ok ? 'PASS' : 'FAIL'}  ${n}`); });
console.log(bad ? `\n${bad}건 실패` : '\n전부 통과');
process.exit(bad ? 1 : 0);
