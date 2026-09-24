// 스크롤백 재구성 계획. 서명 누락은 조용히 낡은 화면을 만들므로 여기서 막는다.
import fs from 'node:fs'; import vm from 'node:vm';

const sandbox = { console, Object, Map, Set, Array, String, Number, Boolean, JSON };
sandbox.window = sandbox; sandbox.globalThis = sandbox; sandbox.GT = {};
vm.createContext(sandbox);
vm.runInContext(fs.readFileSync('src/content/renderplan.js', 'utf8'), sandbox, { filename: 'renderplan.js' });
const { signature, reconcile, unchanged } = sandbox.GT.renderplan;

const results = []; const t = (n, ok) => results.push([n, ok]);
const M = (o) => ({ role: 'assistant', text: '본문', streaming: false, model: 'gpt-5', thinking: 0, parts: null, ...o });
const ctx = { epoch: 1, path: '/c/x' };

// --- 서명: 렌더가 읽는 값이 바뀌면 반드시 바뀐다 ---
{
  const base = signature(M(), ctx);
  t('같은 상태면 같은 서명', signature(M(), ctx) === base);
  t('본문이 바뀌면', signature(M({ text: '다른 본문' }), ctx) !== base);
  t('스트리밍 여부', signature(M({ streaming: true }), ctx) !== base);
  t('모델', signature(M({ model: 'gpt-4o' }), ctx) !== base);
  t('추론 횟수', signature(M({ thinking: 2 }), ctx) !== base);
  t('역할', signature(M({ role: 'user' }), ctx) !== base);
  t('비텍스트 파트 수', signature(M({ parts: ['image'] }), ctx) !== base);
  t('설정 epoch', signature(M(), { ...ctx, epoch: 2 }) !== base);
  t('경로 (메타 줄에 찍힌다)', signature(M(), { ...ctx, path: '/c/y' }) !== base);
}

// --- 길이가 같고 내용만 다른 경우도 잡는다 (fiber 교정에서 실제로 있었다) ---
{
  const a = signature(M({ text: '가나다라마바사아자차카타' }), ctx);
  const b = signature(M({ text: '가나다라마바사아자차카파' }), ctx);
  const c = signature(M({ text: '나나다라마바사아자차카타' }), ctx);
  t('끝만 달라도 잡는다', a !== b);
  t('앞만 달라도 잡는다', a !== c);
}

// --- 시각은 서명에 없다 (있으면 1분마다 블록이 교체되어 선택을 깬다) ---
{
  t('at 은 서명에 영향 없다', signature(M({ at: 1 }), ctx) === signature(M({ at: 999999 }), ctx));
}

// --- reconcile ---
const P = (...ks) => ks.map((k) => ({ key: k, sig: k + '@1' }));
{
  const plan = reconcile(P('a', 'b'), P('a', 'b'));
  t('안 바뀌면 전부 keep', plan.ops.every((o) => o.op === 'keep') && !plan.remove.length);
  t('unchanged 가 참', unchanged(plan, P('a', 'b')) === true);
}
{
  const plan = reconcile(P('a', 'b'), P('a', 'b', 'c'));
  t('뒤에 추가: 앞은 keep', plan.ops[0].op === 'keep' && plan.ops[1].op === 'keep');
  t('뒤에 추가: 새 것만 create', plan.ops[2].op === 'create' && plan.ops[2].key === 'c');
  t('추가는 unchanged 가 아니다', unchanged(plan, P('a', 'b')) === false);
}
{
  const plan = reconcile(P('a', 'b', 'c'), P('a', 'c'));
  t('중간 삭제: remove 에 b', plan.remove.join(',') === 'b');
  t('중간 삭제: 나머지는 keep', plan.ops.every((o) => o.op === 'keep'));
}
{
  const prev = [{ key: 'a', sig: 'a@1' }];
  const plan = reconcile(prev, [{ key: 'a', sig: 'a@2' }]);
  t('서명이 바뀌면 create', plan.ops[0].op === 'create');
  t('서명이 바뀌면 unchanged 아님', unchanged(plan, prev) === false);
}
{
  const prev = P('a', 'b');
  const plan = reconcile(prev, P('b', 'a'));
  t('순서만 바뀌어도 unchanged 아님', unchanged(plan, prev) === false);
  t('순서만 바뀌면 노드는 재사용', plan.ops.every((o) => o.op === 'keep'));
}
{
  const plan = reconcile(P('a', 'b'), []);
  t('전부 제거', plan.remove.length === 2 && !plan.ops.length);
}
{
  const plan = reconcile([], P('a'));
  t('빈 상태에서 시작', plan.ops[0].op === 'create' && !plan.remove.length);
}

// --- 배선 (정적) ---
{
  const tty = fs.readFileSync('src/content/skins/terminal.js', 'utf8');
  const idx = fs.readFileSync('src/content/index.js', 'utf8');

  t('스크롤백을 통째로 비우지 않는다', !/ui\.scroll\.textContent = ''/.test(tty));
  t('노드 풀을 쓴다', /const pool = new Map\(\)/.test(tty));
  t('서명이 같으면 재사용', /rec\.sig !== n\.sig/.test(tty));
  t('안 바뀌면 조기 반환', /unchanged\(plan, prev\)\) return false/.test(tty));
  t('1초 틱은 크롬만 갱신', /every\(1000,[\s\S]{0,90}renderChrome\(\)/.test(idx));
  t('1초 틱이 render() 를 부르지 않는다', !/every\(1000,[\s\S]{0,90}GT\.tty\.render\(\)/.test(idx));
  t('시각은 자리에서 갱신', /function refreshTimes/.test(tty) && /\.gt-stamp/.test(tty));
  t('경과시간도 자리에서', /\.gt-elapsed/.test(tty));
  t('설정이 바뀌면 epoch 증가', /epoch \+= 1/.test(tty));
  t('설정 변경 후 다시 그린다', /applyConfig\(c\);[\s\S]{0,120}?GT\.skin\.current\.render\(\)/.test(idx));
  t('해체 시 풀도 비운다', /pool\.clear\(\)/.test(tty));
  t('id 없는 메시지를 버리지 않는다', /'i:' \+ i/.test(tty));
  t('여분 노드를 정리한다', /while \(ui\.scroll\.children\.length > next\.length\)/.test(tty));
}

let bad = 0;
results.forEach(([n, ok]) => { if (!ok) bad++; console.log(`  ${ok ? 'PASS' : 'FAIL'}  ${n}`); });
console.log(bad ? `\n${bad}건 실패` : '\n전부 통과');
process.exit(bad ? 1 : 0);
