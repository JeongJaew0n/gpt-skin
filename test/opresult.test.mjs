// 대화 조작 API 가 200 이면서 success 가 거짓이면 실패로 알린다 (0.26.4)
// 리뷰 재현(2026-10-02): :rename 이 '이름 변경: …' 을 찍고 상단바 제목까지 바꿨다 · :pin 은 '고정: …'.
// docs/plan/2026-10-02-review-fixes.md §4
import fs from 'node:fs'; import vm from 'node:vm';

const results = []; const t = (n, ok) => results.push([n, ok]);
const read = (f) => fs.readFileSync(f, 'utf8');

function load(ok) {
  const calls = { title: [], nav: [], closed: [] }; const out = [];
  const sb = { console, Object, Array, Set, Map, String, Number, Boolean, JSON, Math, Promise, Error, RegExp, Date,
    location: { pathname: '/c/cur-1234' }, document: { createElement: () => ({ style: {}, appendChild() {}, addEventListener() {} }), title: '옛 이름' } };
  sb.window = sb; sb.globalThis = sb;
  sb.GT = { theme: { names: () => [] }, config: { keys: () => [], get: () => 13, DEFAULTS: {} }, chats: { projects: () => [] },
    store: { state: { messages: [] }, setTitle: (x) => calls.title.push(x) },
    skin: { hide() {}, current: { system: (l, x) => out.push(l + ':' + (x || '')), applyConfig() {}, render() {} } },
    sidebar: { chats: () => [{ id: 'cur-1234', title: '지금 대화', href: '/c/cur-1234' }], isOpen: () => false },
    convops: { rename: async () => ok, pin: async () => ok, archive: async () => ok, remove: async () => ok },
    conversation: { idFromPath: () => 'cur-1234' },
    navigate: { newChat: () => calls.nav.push('/'), to: (h) => calls.nav.push(h) },
    tabs: { close: (id) => calls.closed.push(id) }, picker: {}, health: { CHECKS: {}, reasons: [] }, palette: {}, oai: {}, compose: {} };
  vm.createContext(sb);
  vm.runInContext(read('src/shared/i18n.js'), sb, { filename: 'i18n.js' });
  vm.runInContext(read('src/content/commands.js'), sb, { filename: 'commands.js' });
  return { C: sb.GT.commands, calls, out, doc: sb.document };
}
const failed = (out) => out.length === 1 && /^error:바뀌지 않았습니다/.test(out[0]);

{
  const { C, calls, out, doc } = load(false);
  await C.run(':rename 새 이름');
  t(':rename — 거절되면 실패로 알린다', failed(out));
  t(':rename — 거절되면 상단바 · 문서 제목을 안 바꾼다', calls.title.length === 0 && doc.title === '옛 이름');
}
for (const cmd of [':pin cur-1234', ':archive cur-1234', ':rm cur-1234 yes']) {
  const { C, calls, out } = load(false);
  await C.run(cmd);
  t(`${cmd.split(' ')[0]} — 거절되면 실패로 알리고 대화를 옮기지 않는다`, failed(out) && calls.nav.length === 0);
}
{
  const { C, calls, out } = load(true);
  await C.run(':rename 새 이름');
  t(':rename — 받아들여지면 예전처럼 알리고 제목을 바꾼다', out[0] === 'info:이름 변경: 새 이름' && calls.title[0] === '새 이름');
}
// 지우거나 보관한 대화는 열린 탭에서도 닫는다 — 남겨 두면 누를 때 없는 대화로 간다 (0.26.5)
for (const cmd of [':archive cur-1234', ':rm cur-1234 yes']) {
  const ok = load(true); await ok.C.run(cmd);
  const no = load(false); await no.C.run(cmd);
  t(`${cmd.split(' ')[0]} — 성공하면 열린 탭에서도 닫고, 거절되면 그대로 둔다`, ok.calls.closed.join() === 'cur-1234' && no.calls.closed.length === 0);
}
{
  const { C, calls } = load(true);
  await C.run(':archive cur-1234 off');
  t(':archive off(보관 해제)는 탭을 닫지 않는다', calls.closed.length === 0);
}
{
  const sb = read('src/content/sidebar.js');
  t('사이드바 메뉴 보관 · 삭제 · 다중 보관 · 다중 삭제도 탭을 닫는다',
    (sb.match(/GT\.tabs\.close\(rec\.id\)/g) || []).length === 2 && /ok \+= 1; GT\.tabs\.close\(recs\[i\]\.id\)/.test(sb) && /res\.done\.forEach\(\(id\) => GT\.tabs\.close\(id\)\)/.test(sb));
  const n = (sb.match(/if \(!\(await GT\.convops\.(pin|archive|remove)\([^)]*\)\)\) \{ GT\.skin\.current\.system\('error', GT_T\('cmd\.op\.rejected'/g) || []).length;
  t('사이드바 메뉴의 고정 · 보관 · 삭제도 거절을 실패로 알린다', n === 3);
  t('다중 보관은 거절을 실패 개수로 센다', /if \(await GT\.convops\.archive\(recs\[i\]\.id, true\)\) \{ ok \+= 1;[^}]*\} else bad\.push/.test(sb));
  const i18n = read('src/shared/i18n.js');
  t('문구는 사전에 ko · en 둘 다', (i18n.match(/'cmd\.op\.rejected':/g) || []).length === 2);
}

let bad = 0;
results.forEach(([n, ok]) => { if (!ok) bad++; console.log(`  ${ok ? 'PASS' : 'FAIL'}  ${n}`); });
console.log(bad ? `\n${bad}건 실패` : '\n전부 통과');
process.exit(bad ? 1 : 0);
