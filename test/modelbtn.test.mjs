// 스킨의 모델 버튼 — 누르면 모델 고르기 창 (0.31.0). :model 명령은 그대로 남는다.
import fs from 'node:fs'; import vm from 'node:vm';

const results = []; const t = (n, ok) => results.push([n, ok]);
const read = (f) => fs.readFileSync(f, 'utf8');
const tick = () => new Promise((r) => setTimeout(r, 0));

function load({ available = true, list = [{ index: 0, label: 'GPT-6', current: true }, { index: 1, label: 'GPT-5.6 Sol', current: false }], chooseOk = true } = {}) {
  const calls = { open: [], choose: [], sys: [], chrome: 0, modelsCalls: 0 };
  const releases = [];
  const sb = { console, Object, Array, Set, Map, String, Number, Boolean, JSON, Math, Promise, Error, RegExp, Date, setTimeout,
    navigator: { language: 'ko' }, location: { pathname: '/' },
    document: { createElement: () => ({ style: {}, appendChild() {}, addEventListener() {} }) } };
  sb.window = sb; sb.globalThis = sb;
  vm.createContext(sb);
  vm.runInContext(read('src/shared/i18n.js'), sb);
  sb.GT = {
    picker: { available: () => available,
      models: async () => { calls.modelsCalls++; await new Promise((r) => { releases.push(r); }); return list; },
      chooseModel: async (i) => { calls.choose.push(i); return chooseOk ? { ok: true, picked: list[i].label } : { ok: false, reason: 'menu-not-found' }; } },
    palette: { open: (items, pick, opts) => calls.open.push({ items, pick, opts }) },
    skin: { current: { system: (l, x) => calls.sys.push(l + ':' + (x || '')), renderChrome: () => { calls.chrome++; } } },
    config: { keys: () => [], get: () => null }, chats: { projects: () => [] }, store: { state: { messages: [] } },
    sidebar: { chats: () => [], isOpen: () => false }, theme: { names: () => [] }, navigate: {}, convops: {}, health: { CHECKS: {}, reasons: [] }, conversation: {}, oai: {}, compose: {}, tabs: {}
  };
  vm.runInContext(read('src/content/commands.js'), sb, { filename: 'commands.js' });
  return { C: sb.GT.commands, calls, release: () => releases.splice(0).forEach((r) => r()) };
}

{
  const { C, calls, release } = load();
  const p = C.openModelMenu();
  await tick();
  t('목록을 읽는 동안 버튼에 표시할 수 있다 (modelMenuBusy)', C.modelMenuBusy === true && calls.chrome >= 1);
  C.openModelMenu(); await tick();
  t('읽는 중에 또 눌러도 목록을 두 번 읽지 않는다', calls.modelsCalls === 1);
  release(); await p;
  t('다 읽으면 표시를 끈다', C.modelMenuBusy === false);
  const o = calls.open[0];
  t('팔레트에 모델 목록을 띄운다', !!o && o.items.map((i) => i.name).join('|') === 'GPT-6|GPT-5.6 Sol');
  t('지금 모델에 표시', o.items[0].desc === '● 현재' && o.items[1].desc === '');
  t('입력칸 안내가 모델 고르기용', /모델 고르기/.test(o.opts.placeholder));
  await o.pick(o.items[1]);
  t('고르면 :model 과 같은 길(chooseModel 번호)로 바꾼다', calls.choose.join() === '1' && calls.sys.at(-1) === 'info:모델 → GPT-5.6 Sol');
  await o.pick(o.items[0]);
  t('지금 모델을 고르면 아무것도 안 한다', calls.choose.length === 1);
}
{
  const { C, calls } = load({ available: false });
  await C.openModelMenu();
  t('원본 선택기를 못 찾으면 이유를 알리고 목록을 읽지 않는다', calls.modelsCalls === 0 && /^error:원본의 모델 선택기/.test(calls.sys[0]));
}
{
  const { C, calls, release } = load({ chooseOk: false });
  const p = C.openModelMenu(); await tick(); release(); await p;
  await calls.open[0].pick(calls.open[0].items[1]);
  t('바꾸기 실패를 정직하게 알린다', /^error:전환 실패/.test(calls.sys.at(-1)));
}
{
  const tty = read('src/content/skins/terminal.js'), sheet = read('src/content/skins/sheet.js'), theme = read('src/content/theme.js'), pal = read('src/content/palette.js'), cmd = read('src/content/commands.js');
  t('터미널: 상단바 모델 이름을 누르면 모델 고르기 창', /ui\.model = el\('button', 'gt-model-pick', ''\)/.test(tty) && /ui\.model\.addEventListener\('mousedown'[\s\S]{0,140}GT\.commands\.openModelMenu\(\)/.test(tty));
  // 0.31.1 — 실측: 누르는 사이 버튼 글자가 줄어 뗀 자리가 제목 칸이 됐고, 입력줄로 초점을 옮기자 방금 연 원본 메뉴가 닫혔다
  t('터미널: 누른 자리가 버튼이면 뗄 때 입력줄로 초점을 옮기지 않는다', /root\.addEventListener\('mousedown', \(e\) => \{ downOnControl = onControl\(hit\(e\)\); \}, true\);/.test(tty) && /if \(downOnControl \|\| onControl\(hit\(e\)\)\) return;/.test(tty));
  t('터미널: 모델 목록을 읽는 중에는 초점을 옮기지 않는다', /if \(GT\.commands && GT\.commands\.modelMenuBusy\) return;\s*if \(picked\(\)\) return;\s*focusInput\(\);/.test(tty));
  t('터미널: 키보드(Enter · Space)로도 연다', (tty.match(/GT\.commands\.openModelMenu\(\)/g) || []).length === 2);
  t('시트: 제목 줄 모델 버튼 (마우스 · 키보드)', /ui\.modelBtn = el\('button', 'gs-modelbtn', ''\)/.test(sheet) && (sheet.match(/GT\.commands\.openModelMenu\(\)/g) || []).length === 2);
  t('누를 수 있을 때만 ▾ · 손가락 모양', /\.gt-model-pick\[data-pickable="1"\]::after/.test(theme) && /\.gs-modelbtn\[data-pickable="1"\]::after/.test(sheet));
  t('버튼에는 지금 고른 모델, 모르면 마지막 답의 모델', /const modelName = picked \|\| \(last \? last\.model : ''\);/.test(tty) && /const modelName = picked \|\| \(last \? last\.model : ''\);/.test(sheet));
  t('팔레트 자리표시를 바꿀 수 있다', /input\.placeholder = \(opts && opts\.placeholder\) \|\| GT_T\('palette\.placeholder'\);/.test(pal));
  t(':model 명령은 그대로 있다', /def\(':model'/.test(cmd));
  const i18n = read('src/shared/i18n.js');
  t('문구 ko · en', ['model.pick.title', 'model.menu.placeholder', 'model.menu.current', 'model.menu.unavailable', 'model.menu.unreadable'].every((k) => (i18n.match(new RegExp(`'${k.replace(/\./g, '\\.')}'`, 'g')) || []).length === 2));
}

let bad = 0;
results.forEach(([n, ok]) => { if (!ok) bad++; console.log(`  ${ok ? 'PASS' : 'FAIL'}  ${n}`); });
console.log(bad ? `\n${bad}건 실패` : '\n전부 통과');
process.exit(bad ? 1 : 0);
