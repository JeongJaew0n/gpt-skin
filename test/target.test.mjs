// 명령의 대상 고르기 — :rm · :archive · :pin · :mv · :share · :rename @ 가 같은 길을 쓴다.
// 되돌릴 수 없는 :rm 도 이 길이라 '아마 이것' 으로 고르면 안 된다 (리뷰 2026-11-03):
// 예전에는 :ls 없이 ':rm 3 yes' 가 id 가 3 으로 시작하는 대화나 제목에 3 이 든 대화를 지웠다.
import fs from 'node:fs'; import vm from 'node:vm';

function load(sidebarChats, listed) {
  const calls = { remove: [], archive: [], pin: [] };
  const out = [];
  const sandbox = { console, Object, Array, Set, Map, String, Number, Boolean, JSON, Math, Promise, Error, RegExp, Date,
    location: { pathname: '/c/cur-1234' },
    document: { createElement: () => ({ style: {}, appendChild(){}, addEventListener(){} }) } };
  sandbox.window = sandbox; sandbox.globalThis = sandbox;
  const flat = (listed || []).map((c) => ({ kind: 'chat', ...c }));
  sandbox.GT = {
    theme: { names: () => [] },
    config: { keys: () => [], get: () => null, DEFAULTS: {} },
    chats: { projects: () => [], load: async () => ({ total: flat.length, loaded: flat.length, source: 'api' }), flatten: () => flat },
    store: { state: { messages: [], superseded: 0, orphanDeltas: 0, conversationTitle: '' }, setTitle(){} },
    skin: { hide(){}, current: { system: (lvl, txt) => out.push(lvl + ':' + (txt || '')), applyConfig(){}, render(){} } },
    sidebar: { chats: () => sidebarChats || [], isOpen: () => false },
    tabs: { close(){} },
    convops: {
      remove: async (id) => { calls.remove.push(id); return true; },
      archive: async (id) => { calls.archive.push(id); return true; },
      pin: async (id) => { calls.pin.push(id); return true; }
    },
    conversation: { idFromPath: () => 'cur-1234' },
    navigate: { newChat(){} },
    picker: {}, health: { CHECKS: {}, reasons: [] }, palette: {}, oai: {}, compose: {}
  };
  vm.createContext(sandbox);
  vm.runInContext(fs.readFileSync('src/shared/i18n.js', 'utf8'), sandbox, { filename: 'i18n.js' });
  vm.runInContext(fs.readFileSync('src/content/commands.js', 'utf8'), sandbox, { filename: 'commands.js' });
  return { C: sandbox.GT.commands, calls, out };
}

const results = []; const t = (n, ok) => results.push([n, ok]);

// 사이드바에 보이는 대화. 하나는 id 가 3 으로 시작하고, 하나는 제목에 3 이 든다
const SIDE = [
  { id: '3f00aaaa-1111', title: '배포 계획', href: '/c/3f00aaaa-1111' },
  { id: 'abcd0000-2222', title: '회의록 3차', href: '/c/abcd0000-2222' },
  { id: 'abce0000-3333', title: '다른 대화', href: '/c/abce0000-3333' }
];

// --- :ls 를 안 했는데 번호로 지우려 한다 ---
{
  const { C, calls, out } = load(SIDE);
  await C.run(':rm 3 yes');
  t(':ls 없이 번호면 id 앞자리로 찾지 않는다(지우지 않는다)', calls.remove.length === 0);
  t(':ls 를 먼저 하라고 알린다', out.some((o) => o.startsWith('error:') && o.includes(':ls')));
  await C.run(':archive 3');
  t('보관도 같다', calls.archive.length === 0);
}

// --- :ls 범위 밖 번호 ---
{
  const { C, calls, out } = load(SIDE, [{ id: 'list-0', title: '첫째', href: '/c/list-0' }, { id: 'list-1', title: '둘째', href: '/c/list-1' }]);
  await C.run(':ls');
  await C.run(':rm 3 yes');
  t('범위 밖 번호는 제목·id 로 다시 찾지 않는다', calls.remove.length === 0);
  t('범위를 알려 준다', out.some((o) => o.startsWith('error:') && o.includes('0') && o.includes('1')));
  await C.run(':rm 1 yes');
  t('범위 안 번호는 그 대화', calls.remove.length === 1 && calls.remove[0] === 'list-1');
}

// --- id 앞자리가 여럿에 맞으면 고르지 않는다 ---
{
  const { C, calls, out } = load(SIDE);
  await C.run(':rm abc yes');
  t('여럿이 맞으면 지우지 않는다', calls.remove.length === 0);
  t('몇 개가 맞는지 알린다', out.some((o) => o.startsWith('error:') && o.includes('2')));
  await C.run(':rm abcd yes');
  t('하나만 맞으면 그 대화', calls.remove.length === 1 && calls.remove[0] === 'abcd0000-2222');
}

// --- 사이드바 메뉴가 넘기는 id 앞 8자리 — 숫자만이어도 찾는다 ---
{
  const { C, calls } = load([{ id: '12345678-aaaa', title: 'x', href: '/c/12345678-aaaa' }]);
  await C.run(':pin 12345678');
  t('숫자만인 id 앞 8자리도 찾는다', calls.pin.length === 1 && calls.pin[0] === '12345678-aaaa');
}

// --- 제목으로 찾기는 하나만 맞을 때 ---
{
  const { C, calls } = load(SIDE);
  await C.run(':pin 배포');
  t('제목이 하나만 맞으면 그 대화', calls.pin.length === 1 && calls.pin[0] === '3f00aaaa-1111');
  await C.run(':pin 대화');
  t('다른 제목도 하나만 맞으면 그 대화', calls.pin.length === 2 && calls.pin[1] === 'abce0000-3333');
}
{
  const { C, calls, out } = load(SIDE.concat([{ id: 'ffff0000-4444', title: '회의록 4차', href: '/c/ffff0000-4444' }]));
  await C.run(':rm 회의록 yes');
  t('제목이 여럿에 맞으면 지우지 않는다', calls.remove.length === 0 && out.some((o) => o.startsWith('error:') && o.includes('2')));
}

// --- :ls 목록과 사이드바에 같은 대화가 있으면 한 번만 센다 ---
{
  const dup = [{ id: 'abcd0000-2222', title: '회의록 3차', href: '/c/abcd0000-2222' }];
  const { C, calls } = load(dup, dup);
  await C.run(':ls');
  await C.run(':pin abcd');
  t('같은 대화를 두 번 세지 않는다', calls.pin.length === 1 && calls.pin[0] === 'abcd0000-2222');
}

// --- 사전 ---
{
  const i18n = fs.readFileSync('src/shared/i18n.js', 'utf8');
  for (const k of ['cmd.target.noList', 'cmd.target.range', 'cmd.target.ambiguous']) {
    t(`${k} 이 ko · en 모두에 있다`, (i18n.match(new RegExp(`'${k.replace(/\./g, '\\.')}'`, 'g')) || []).length === 2);
  }
}

let bad = 0;
results.forEach(([n, ok]) => { if (!ok) bad++; console.log(`  ${ok ? 'PASS' : 'FAIL'}  ${n}`); });
console.log(bad ? `\n${bad}건 실패` : '\n전부 통과');
process.exit(bad ? 1 : 0);
