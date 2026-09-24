// 명령 동작. :rename 은 기본이 '지금 대화' 다.
import fs from 'node:fs'; import vm from 'node:vm';

function load(path) {
  const calls = { rename: [], title: [] };
  const out = [];
  const sandbox = { console, Object, Array, Set, Map, String, Number, Boolean, JSON, Math, Promise, Error, RegExp, Date,
    location: { pathname: path },
    document: { createElement: () => ({ style: {}, appendChild(){}, addEventListener(){} }) } };
  sandbox.window = sandbox; sandbox.globalThis = sandbox;
  sandbox.GT = {
    theme: { names: () => ['modern-dark'] },
    config: { keys: () => [], get: () => 13, DEFAULTS: {} },
    chats: { projects: () => [] },
    store: { state: { messages: [], superseded: 0, orphanDeltas: 0, conversationTitle: '' },
             setTitle: (t) => calls.title.push(t) },
    skin: { hide(){}, current: { system: (lvl, txt) => out.push(lvl + ':' + (txt || '')), applyConfig(){}, render(){} } },
    sidebar: { chats: () => [{ id: 'aaaa1111-x', title: '다른 대화', href: '/c/aaaa1111-x' }], isOpen: () => false },
    convops: { rename: async (id, name) => { calls.rename.push({ id, name }); return true; } },
    conversation: { idFromPath: () => (path.startsWith('/c/') ? path.slice(3) : null) },
    picker: {}, navigate: {}, health: { CHECKS: {}, reasons: [] }, palette: {}, oai: {}, compose: {}
  };
  vm.createContext(sandbox);
  vm.runInContext(fs.readFileSync('src/shared/i18n.js', 'utf8'), sandbox, { filename: 'i18n.js' });
  vm.runInContext(fs.readFileSync('src/content/commands.js', 'utf8'), sandbox, { filename: 'commands.js' });
  return { C: sandbox.GT.commands, calls, out };
}

const results = []; const t = (n, ok) => results.push([n, ok]);

// --- 지금 대화 이름 바꾸기 ---
{
  const { C, calls } = load('/c/cur-1234');
  await C.run(':rename 새 이름 입니다');
  t('대상 없이 지금 대화를 바꾼다', calls.rename.length === 1 && calls.rename[0].id === 'cur-1234');
  t('공백이 든 이름을 통째로 쓴다', calls.rename[0].name === '새 이름 입니다');
  t('상단바 제목도 바로 고친다', calls.title[0] === '새 이름 입니다');
}

// --- 숫자로 시작하는 이름도 이름이다 ---
{
  const { C, calls } = load('/c/cur-1234');
  await C.run(':rename 3단계 계획');
  t('숫자로 시작해도 이름으로 본다', calls.rename[0].name === '3단계 계획' && calls.rename[0].id === 'cur-1234');
}

// --- @ 로 다른 대화 지정 ---
{
  const { C, calls } = load('/c/cur-1234');
  await C.run(':rename @aaaa1111 저쪽 이름');
  t('@ 로 다른 대화를 지정한다', calls.rename[0].id === 'aaaa1111-x');
  t('@ 뒤 나머지가 이름', calls.rename[0].name === '저쪽 이름');
  t('다른 대화면 상단바는 안 건드린다', calls.title.length === 0);
}

// --- 대화가 없을 때 ---
{
  const { C, calls, out } = load('/');
  await C.run(':rename 이름');
  t('대화 밖에서는 바꾸지 않는다', calls.rename.length === 0);
  t('오류로 알린다', out.some((o) => o.startsWith('error:')));
  t('@ 로 지정하는 법을 안내한다', out.some((o) => o.includes('@<n|id>')));
}

// --- 인자 없음 ---
{
  const { C, calls } = load('/c/cur-1234');
  await C.run(':rename');
  t('이름이 없으면 아무 일도 안 한다', calls.rename.length === 0);
}

// --- @ 만 주고 이름이 없으면 ---
{
  const { C, calls } = load('/c/cur-1234');
  await C.run(':rename @aaaa1111');
  t('대상만 주고 이름이 없으면 거부', calls.rename.length === 0);
}

// --- 다른 명령의 대상 지정에도 @ 가 통한다 ---
{
  const { C } = load('/c/cur-1234');
  t('@ 없이도 여전히 찾는다', !!C.parse(':pin aaaa1111'));
}

let bad = 0;
results.forEach(([n, ok]) => { if (!ok) bad++; console.log(`  ${ok ? 'PASS' : 'FAIL'}  ${n}`); });
console.log(bad ? `\n${bad}건 실패` : '\n전부 통과');
process.exit(bad ? 1 : 0);
