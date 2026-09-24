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

let bad = 0;
results.forEach(([n, ok]) => { if (!ok) bad++; console.log(`  ${ok ? 'PASS' : 'FAIL'}  ${n}`); });
console.log(bad ? `\n${bad}건 실패` : '\n전부 통과');
process.exit(bad ? 1 : 0);
