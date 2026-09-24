// verify — 스트림으로 받은 본문을 원본(fiber)과 대조한다.
//
// fiber 를 정답으로 믿고 덮어쓰던 것이 마지막 문장이 잘리는 원인이었다.
// docs/issue/2026-09-18-last-sentence-truncated.md
import fs from 'node:fs'; import vm from 'node:vm';

const idx = fs.readFileSync('src/content/index.js', 'utf8');
const results = []; const t = (n, ok) => results.push([n, ok]);

// --- 소스에서 verify 핸들러를 통째로 꺼내 실제로 돌린다 ---
// 다시 쓰면 아무것도 검증하지 못한다.
const handlerSrc = (() => {
  const i = idx.indexOf("GT.on('verify'");
  if (i < 0) return null;
  // 핸들러 끝: 들여쓰기 두 칸의 `});`
  const j = idx.indexOf('\n  });', i);
  return j < 0 ? null : idx.slice(i, j + 6);
})();
const retriesSrc = (/^\s*const VERIFY_RETRIES = \d+;$/m.exec(idx) || [])[0];

t('verify 핸들러를 꺼냈다', !!handlerSrc);
t('재시도 횟수가 소스에 있다', !!retriesSrc);

// streamed(우리가 받은 것)와 fiber(원본이 그린 것)를 주면 결과를 돌려준다
function run(streamed, fiber, tries) {
  const rec = { text: streamed, verifyTries: tries || 0 };
  const log = [];
  const timers = [];
  let rendered = 0;
  let reconciled = null;

  const sb = {
    console, Object, Array, String, Number, Boolean, JSON, Math, RegExp, Error,
    setTimeout: (fn, ms) => { timers.push(ms); return 0; }
  };
  sb.window = sb; sb.globalThis = sb;
  let handler = null;
  sb.GT = {
    on: (name, fn) => { if (name === 'verify') handler = fn; },
    store: { state: { byId: new Map([['m1', rec]]) } },
    skin: { current: { render: () => { rendered += 1; } } },
    health: { reconcile: (a, b) => { reconciled = [a, b]; } },
    // 마커가 없는 평범한 글이면 그대로 — 여기서는 길이 비교만 본다
    markdown: { stripMarks: (x) => String(x == null ? '' : x) },
    toMain: () => {},
    log: (...a) => log.push(a.join(' '))
  };
  vm.createContext(sb);
  vm.runInContext(`${retriesSrc}\n${handlerSrc}`, sb, { filename: 'verify.js' });
  handler({ id: 'm1', text: fiber });
  return { text: rec.text, rendered, reconciled, log, timers, tries: rec.verifyTries };
}

if (handlerSrc && retriesSrc) {
  // --- 핵심: 짧은 fiber 로 덮어쓰지 않는다 ---
  {
    // 실측값 그대로: 522자 응답의 fiber 가 1자였다
    const streamed = '가'.repeat(522);
    const r = run(streamed, '경');
    t('1자 fiber 로 522자를 덮어쓰지 않는다', r.text === streamed);
    t('화면을 다시 그리지 않는다', r.rendered === 0);
    t('대신 다시 본다', r.timers.length === 1);
  }
  {
    // 예전 임계(50%)를 넘는 조각 — 여기가 실제로 잘리던 구간이다
    const streamed = '가'.repeat(100);
    const r = run(streamed, '나'.repeat(80));      // 80% — 예전에는 통과했다
    t('80% 짜리 조각도 덮어쓰지 않는다', r.text === streamed);
    t('80% 에서도 다시 본다', r.timers.length === 1);
  }
  {
    const streamed = '가'.repeat(100);
    const r = run(streamed, '나'.repeat(99));      // 한 글자 모자란 것도
    t('한 글자 모자라도 덮어쓰지 않는다', r.text === streamed);
  }

  // --- 여러 번 봐도 짧으면 스트림을 지킨다 ---
  {
    const streamed = '가'.repeat(100);
    const r = run(streamed, '나'.repeat(50), 3);   // 이미 3번 봤다
    t('재시도를 다 쓰면 스트림을 지킨다', r.text === streamed);
    t('더 이상 다시 보지 않는다', r.timers.length === 0);
    t('왜 그랬는지 남긴다', r.log.some((x) => /스트림보다 짧다 \(50\/100\)/.test(x)));
  }

  // --- fiber 가 길거나 같으면 교정으로 받는다 ---
  {
    const streamed = '가'.repeat(100);
    const fiber = '나'.repeat(120);                // 인용 마커가 치환되면 길어진다
    const r = run(streamed, fiber);
    t('더 길면 교정한다', r.text === fiber);
    t('교정하면 다시 그린다', r.rendered === 1);
    t('그때 대조도 한다', !!r.reconciled);
  }
  {
    const streamed = '가'.repeat(100);
    const fiber = '나'.repeat(100);                // 길이가 같고 내용이 다르다
    const r = run(streamed, fiber);
    t('같은 길이면 교정한다', r.text === fiber);
  }

  // --- 스트림이 비었으면 fiber 라도 쓴다 ---
  {
    const r = run('', '원본이 그린 것');
    t('스트림이 비었으면 fiber 를 쓴다', r.text === '원본이 그린 것');
  }

  // --- fiber 가 비었으면 아무것도 하지 않는다 ---
  {
    const streamed = '지켜야 하는 본문';
    const r = run(streamed, '');
    t('빈 fiber 로 화면을 비우지 않는다', r.text === streamed);
    t('빈 fiber 에는 다시 보지도 않는다', r.rendered === 0 && r.timers.length === 0);
  }

  // --- 짧은 fiber 로는 드리프트 경고도 내지 않는다 ---
  // 조각 fiber 와 온전한 스트림을 비교하면 크게 어긋나 오탐이 된다
  {
    const r = run('가'.repeat(500), '나');
    t('조각 fiber 로 드리프트 경고를 내지 않는다', r.reconciled === null);
  }
}

// --- 정적: 비율이 아니라 방향을 본다 ---
{
  t('비율 임계를 쓰지 않는다', !/VERIFY_MIN_RATIO/.test(idx));
  t('짧으면 손실이라고 적어뒀다', /'교정' 이 아니라 '손실' 이다/.test(idx));
  t('실측값을 남겼다', /522자 응답의 fiber 가 1자/.test(idx));
  t('방향으로 판단한다', /const shorter = sLen > 0 && fLen < sLen;/.test(idx));
  t('문서를 가리킨다', /2026-09-18-last-sentence-truncated\.md/.test(idx));
}

let bad = 0;
results.forEach(([n, ok]) => { if (!ok) bad++; console.log(`  ${ok ? 'PASS' : 'FAIL'}  ${n}`); });
console.log(bad ? `\n${bad}건 실패` : '\n전부 통과');
process.exit(bad ? 1 : 0);
