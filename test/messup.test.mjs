// :messup — 화면에만 끼워 넣는 가짜 출력.
// 서버로 나가면 안 되고, 새 대화가 와도 제자리에서 위로 밀려야 한다.
import fs from 'node:fs'; import vm from 'node:vm';

const results = []; const t = (n, ok) => results.push([n, ok]);

// ---- 순서 규칙 (순수 함수) ----
{
  const sb = { console, Object, Array, Set, Map, String, Number, Boolean, JSON, Math };
  sb.window = sb; sb.globalThis = sb; sb.GT = {};
  vm.createContext(sb);
  vm.runInContext(fs.readFileSync('src/content/renderplan.js', 'utf8'), sb, { filename: 'renderplan.js' });
  const P = sb.GT.renderplan;
  const shape = (out) => out.map((x) => (x.local ? 'L' + x.local.id : x.key)).join(' ');

  t('블록이 없으면 메시지만', shape(P.interleave(['a', 'b'], [])) === 'a b');

  const L = (id, anchorKey) => ({ id, anchorKey });
  t('앵커 뒤에 끼운다', shape(P.interleave(['a', 'b'], [L(1, 'a')])) === 'a L1 b');
  t('마지막 뒤면 마지막에', shape(P.interleave(['a', 'b'], [L(1, 'b')])) === 'a b L1');

  // 핵심: 새 메시지가 와도 블록은 제자리다 (아래로 밀려나지 않는다)
  const before = shape(P.interleave(['a', 'b'], [L(1, 'b')]));
  const after = shape(P.interleave(['a', 'b', 'c', 'd'], [L(1, 'b')]));
  t('새 대화가 와도 블록은 제자리', before === 'a b L1' && after === 'a b L1 c d');

  t('앵커가 없으면 맨 앞', shape(P.interleave(['a'], [L(1, '')])) === 'L1 a');
  t('앵커가 사라졌으면 끝에 붙인다', shape(P.interleave(['a'], [L(1, '없는키')])) === 'a L1');
  t('여러 개는 넣은 순서대로', shape(P.interleave(['a'], [L(1, 'a'), L(2, 'a')])) === 'a L1 L2');
  t('서로 다른 앵커에 흩어진다',
    shape(P.interleave(['a', 'b'], [L(2, 'b'), L(1, 'a')])) === 'a L1 b L2');
  t('메시지가 없어도 그린다', shape(P.interleave([], [L(1, 'a')])) === 'L1');
  t('한 번씩만 그린다', P.interleave(['a'], [L(1, 'a')]).filter((x) => x.local).length === 1);
  t('locals 가 없어도 터지지 않는다', shape(P.interleave(['a'])) === 'a');
}

// ---- 명령 ----
{
  const local = []; const said = [];
  const sb = { console, Object, Array, Set, Map, String, Number, Boolean, JSON, Math, Promise, Error, RegExp, Date,
    location: { pathname: '/c/x' },
    document: { createElement: () => ({ style: {}, appendChild() {}, addEventListener() {} }) } };
  sb.window = sb; sb.globalThis = sb;
  sb.GT = {
    theme: { names: () => ['modern-dark'] }, config: { keys: () => [], get: () => 13, DEFAULTS: {} },
    chats: { projects: () => [] },
    store: { state: { messages: [], superseded: 0, orphanDeltas: 0, conversationTitle: '' } },
    skin: { hide() {}, current: { system: (l, x) => said.push(l + ':' + x), applyConfig() {}, render() {},
      local: (x) => local.push(x),
      clearLocal() { const n = local.length; local.length = 0; return n; } } },
    sidebar: { chats: () => [], isOpen: () => false }, convops: {},
    conversation: { idFromPath: () => 'x' }, picker: {}, navigate: {},
    health: { CHECKS: {}, reasons: [] }, palette: {}, oai: {}, compose: {}
  };
  vm.createContext(sb);
  vm.runInContext(fs.readFileSync('src/shared/i18n.js', 'utf8'), sb, { filename: 'i18n.js' });
  vm.runInContext(fs.readFileSync('src/content/messup.js', 'utf8'), sb, { filename: 'messup.js' });
  vm.runInContext(fs.readFileSync('src/content/commands.js', 'utf8'), sb, { filename: 'commands.js' });
  const C = sb.GT.commands;

  await C.run(':messup');
  t('한 개 끼운다', local.length === 1);
  t('코드블록이 들어 있다', /```/.test(local[0]));
  t('로그 블록', /```log/.test(local[0]));
  t('코드 블록', /```ts/.test(local[0]));
  t('제목 줄이 있다', /^### /m.test(local[0]));
  t('서버로 가지 않는다고 알려준다', said.some((x) => /서버로 가지 않습니다/.test(x)));

  await C.run(':messup 3');
  t('횟수를 받는다', local.length === 4);

  const seen = new Set(local);
  t('매번 다른 내용', seen.size === local.length);

  await C.run(':messup 999');
  t('한 번에 10개를 넘지 않는다', local.length === 4 + 10);

  await C.run(':messup clear');
  t('clear 로 걷어낸다', local.length === 0);
  await C.run(':messup off');
  t('off 도 같은 뜻', said.some((x) => /걷어낼 것이 없습니다/.test(x)));

  t('자동완성이 clear 를 준다',
    C.complete(':messup ').candidates.includes('clear'));
}

// ---- 배선 ----
{
  const tty = fs.readFileSync('src/content/skins/terminal.js', 'utf8');
  const cmds = fs.readFileSync('src/content/commands.js', 'utf8');
  t('순서 규칙은 renderplan 이 갖는다', /GT\.renderplan\.interleave\(keys, localLog\)/.test(tty));
  t('전용 렌더가 있다', /function turnLocal\(/.test(tty));
  t('화면에만 있는 것임을 메타줄에 적는다', /화면에만 있는 출력/.test(tty));
  t('시스템 줄이 아니라 별도 목록', /const localLog = \[\]/.test(tty));
  t('전송 경로를 타지 않는다', !/GT\.compose\.send/.test(cmds.slice(cmds.indexOf("def(':messup'"), cmds.indexOf("def(':messup'") + 900)));
}

// ---- 맛: sheet (0.18.0) ----
// docs/plan/2026-10-01-sheet-messup.md
{
  const sb = { console, Object, Array, Set, Map, String, Number, Boolean, JSON, Math };
  sb.window = sb; sb.globalThis = sb; sb.GT = {};
  vm.createContext(sb);
  vm.runInContext(fs.readFileSync('src/shared/i18n.js', 'utf8'), sb, { filename: 'i18n.js' });
  vm.runInContext(fs.readFileSync('src/content/messup.js', 'utf8'), sb, { filename: 'messup.js' });
  const M = sb.GT.messup;
  const many = Array.from({ length: 40 }, () => M.make('sheet'));
  const one = many[0];
  t('sheet 맛: 수식 펜스', many.every((x) => /```formula\n=/.test(x)));
  t('sheet 맛: 계산 상태 펜스', many.every((x) => /```calc\n/.test(x)));
  t('sheet 맛: 절대참조 범위', many.every((x) => /![$][A-Z][$]\d+:[$][A-Z][$]\d+/.test(x)));
  t('sheet 맛: 오류값', many.every((x) => /#N\/A|#DIV\/0!|#REF!/.test(x)));
  t('sheet 맛: 회계 서식 표가 나올 때가 있다', many.some((x) => /\|--:\|--:\|/.test(x) && /₩[\d,]+/.test(x)));
  t('sheet 맛: 매크로가 나올 때가 있다', many.some((x) => /```vba\nSub /.test(x)));
  t('sheet 맛: 빌드 로그 모양이 아니다', !many.some((x) => /```log|```ts/.test(x)));
  t('sheet 맛: 매번 다르다', new Set(many).size === many.length);
  t('제품 이름을 쓰지 않는다', !many.some((x) => /excel|microsoft|google\s*sheets|numbers/i.test(x)));
  const RUDE = /(했다|한다|없다|있다|된다|간다|온다|린다|본다|아니다|해라|봐라|와라|어라)(?![다가-힣])/;
  t('반말 종결이 없다', !many.some((x) => RUDE.test(x)));
  t('모르는 맛은 terminal', /```log/.test(M.make('없는맛')) && /```log/.test(M.make()));
  t('맛 목록', M.flavors().join() === 'terminal,sheet');
  vm.runInContext('GT_SET_LOCALE("en")', sb);
  const en = M.make('sheet');
  t('영어면 영어 어휘 · 달러', /Calculating|recalculated/.test(en) && !/[가-힣]/.test(en));
  void one;
}

// ---- 명령이 스킨의 맛을 따른다 ----
{
  const local = [];
  const sb = { console, Object, Array, Set, Map, String, Number, Boolean, JSON, Math, Promise, Error, RegExp, Date,
    location: { pathname: '/c/x' }, document: { createElement: () => ({ style: {}, appendChild() {}, addEventListener() {} }) } };
  sb.window = sb; sb.globalThis = sb;
  sb.GT = {
    theme: { names: () => ['modern-dark'] }, config: { keys: () => [], get: () => 13, DEFAULTS: {} }, chats: { projects: () => [] },
    store: { state: { messages: [], superseded: 0, orphanDeltas: 0, conversationTitle: '' } },
    skin: { hide() {}, current: { messup: 'sheet', hiddenCommands: [], system() {}, applyConfig() {}, render() {},
      local: (x) => local.push(x), clearLocal() { return 0; } } },
    sidebar: { chats: () => [], isOpen: () => false }, convops: {}, conversation: { idFromPath: () => 'x' }, picker: {}, navigate: {},
    health: { CHECKS: {}, reasons: [] }, palette: {}, oai: {}, compose: {}
  };
  vm.createContext(sb);
  vm.runInContext(fs.readFileSync('src/shared/i18n.js', 'utf8'), sb, { filename: 'i18n.js' });
  vm.runInContext(fs.readFileSync('src/content/messup.js', 'utf8'), sb, { filename: 'messup.js' });
  vm.runInContext(fs.readFileSync('src/content/commands.js', 'utf8'), sb, { filename: 'commands.js' });
  await sb.GT.commands.run(':messup 2');
  t('스킨이 sheet 맛이면 시트 출력을 끼운다', local.length === 2 && local.every((x) => /```formula/.test(x)));
}

// ---- 싣는 순서 ----
{
  const mf = JSON.parse(fs.readFileSync('manifest.json', 'utf8'));
  const js = mf.content_scripts.find((c) => c.world !== 'MAIN').js;
  t('매니페스트가 생성기를 명령보다 먼저 싣는다',
    js.indexOf('src/content/messup.js') > 0 && js.indexOf('src/content/messup.js') < js.indexOf('src/content/commands.js'));
  const html = fs.readFileSync('tools/harness/index.html', 'utf8');
  t('하네스도 싣는다', html.indexOf('src/content/messup.js') > 0 && html.indexOf('src/content/messup.js') < html.indexOf('src/content/commands.js'));
  t('명령에 생성기가 남아 있지 않다 (한 곳에만)', !/const VERBS =|function terminal\(/.test(fs.readFileSync('src/content/commands.js', 'utf8')));
}

let bad = 0;
results.forEach(([n, ok]) => { if (!ok) bad++; console.log(`  ${ok ? 'PASS' : 'FAIL'}  ${n}`); });
console.log(bad ? `\n${bad}건 실패` : '\n전부 통과');
process.exit(bad ? 1 : 0);
