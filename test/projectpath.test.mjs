// 프로젝트 안의 대화(/g/<프로젝트>/c/<id>) — '/c/' + id 로 지금 대화를 판별하던 곳들 (0.26.2)
// 리뷰 재현(2026-10-02): 프로젝트 대화에서 :archive · :rm 으로 지금 대화를 치워도 새 대화로 안 넘어갔다 ·
// 사이드바의 지금 대화 표시가 사라졌다 · 버그 기록에 프로젝트 경로가 그대로 남았다.
// docs/plan/2026-10-02-review-fixes.md §2
import fs from 'node:fs'; import vm from 'node:vm';

const results = []; const t = (n, ok) => results.push([n, ok]);
const read = (f) => fs.readFileSync(f, 'utf8');
const PROJ = '/g/g-p-6a1b-my-project/c/cur-1234';

function load(path) {
  const calls = { nav: [] }; const out = [];
  const sb = { console, Object, Array, Set, Map, String, Number, Boolean, JSON, Math, Promise, Error, RegExp, Date,
    location: { pathname: path }, document: { createElement: () => ({ style: {}, appendChild() {}, addEventListener() {} }), querySelector: () => null, title: '' } };
  sb.window = sb; sb.globalThis = sb;
  sb.GT = { theme: { names: () => [] }, config: { keys: () => [], get: () => 13, DEFAULTS: {} }, chats: { projects: () => [] },
    store: { state: { messages: [] }, setTitle() {} },
    skin: { hide() {}, current: { system: (l, x) => out.push(l + ':' + (x || '')), applyConfig() {}, render() {} } },
    sidebar: { chats: () => [{ id: 'cur-1234', title: '지금 대화', href: PROJ }, { id: 'oth-9999', title: '다른 대화', href: '/c/oth-9999' }], isOpen: () => false },
    convops: { archive: async () => true, remove: async () => true, SHARE_BUTTON: '#share' },
    navigate: { newChat: () => calls.nav.push('/'), to: (h) => calls.nav.push(h) },
    tabs: { close() {} }, picker: {}, health: { CHECKS: {}, reasons: [] }, palette: {}, oai: {}, compose: {} };
  vm.createContext(sb);
  vm.runInContext(read('src/shared/i18n.js'), sb, { filename: 'i18n.js' });
  vm.runInContext(read('src/content/conversation.js'), sb, { filename: 'conversation.js' });
  vm.runInContext(read('src/content/commands.js'), sb, { filename: 'commands.js' });
  return { C: sb.GT.commands, calls, out };
}

{
  const { C, calls } = load(PROJ);
  await C.run(':archive cur-1234');
  t('프로젝트 대화에서 지금 대화를 보관하면 새 대화로 간다', calls.nav.join() === '/');
}
{
  const { C, calls } = load(PROJ);
  await C.run(':rm cur-1234 yes');
  t('프로젝트 대화에서 지금 대화를 지우면 새 대화로 간다', calls.nav.join() === '/');
}
{
  const { C, calls } = load(PROJ);
  await C.run(':archive oth-9999');
  t('다른 대화를 보관하면 그대로 있는다', calls.nav.length === 0);
}
{
  const { C, calls } = load(PROJ);
  await C.run(':share');
  t(':share — 지금 프로젝트 대화면 다른 주소로 옮기지 않는다', calls.nav.length === 0);
}
{
  const { C, calls } = load('/c/oth-9999');
  await C.run(':share cur-1234');
  t(':share — 다른 대화면 그 대화의 주소(프로젝트 경로)로 간다', calls.nav[0] === PROJ);
}
{
  const sb = read('src/content/sidebar.js');
  t('사이드바의 지금 대화는 conversation 이 판별한다 (프로젝트 경로 포함)', /const currentId = \(\) => GT\.conversation\.idFromPath\(\);/.test(sb));
  t('사이드바가 /c/ 로만 보는 정규식을 다시 쓰지 않는다', !/\^\\\/c\\\//.test(sb));
}
{
  const b = { console, String, Date, GT: { log() {} } };
  vm.createContext(b); vm.runInContext(read('src/content/bugs.js'), b);
  const masked = b.GT.bugs.maskPath(PROJ);
  t('버그 기록의 경로 가리기 — 프로젝트 이름 · 대화 id 가 남지 않는다', masked === '/g/…/c/…');
  t('navigate 는 bugs 의 가리기를 쓴다', /GT\.bugs\.maskPath\(href\)/.test(read('src/content/navigate.js')));
}

let bad = 0;
results.forEach(([n, ok]) => { if (!ok) bad++; console.log(`  ${ok ? 'PASS' : 'FAIL'}  ${n}`); });
console.log(bad ? `\n${bad}건 실패` : '\n전부 통과');
process.exit(bad ? 1 : 0);
