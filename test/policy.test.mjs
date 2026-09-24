// onBreak 정책이 실제로 동작하는지 검증한다.
// 이 파일이 존재하는 이유: 드리프트가 원본 UI 복귀를 유발하던 회귀를 다시 만들지 않기 위해서다.
import fs from 'node:fs'; import vm from 'node:vm';

function makeWorld(cfg) {
  const hidden = { called: false };
  const sandbox = {
    console: { warn(){}, error(){}, debug(){}, log(){} },
    chrome: { runtime: { id: 'x', sendMessage(){}, lastError: null } },
    Object, Math, Number, String, Boolean, Array, JSON
  };
  sandbox.globalThis = sandbox;
  vm.createContext(sandbox);
  vm.runInContext(fs.readFileSync('src/shared/defaults.js','utf8'), sandbox, {filename:'defaults'});
  // GT 스텁 — health 가 기대는 최소 표면만
  const logged = [];
  sandbox.GT = {
    sendToSW() {},
    log: (...a) => logged.push(a.join(' ')),      // health 가 진단을 GT.log 로 남긴다
    config: { get: (k) => (k in cfg ? cfg[k] : sandbox.GT_DEFAULTS[k]) },
    skin: { current: { system(){}, setMode(){} }, hide(){ hidden.called = true; } },
    markdown: { stripMarks: (x) => String(x == null ? '' : x) }
  };
  vm.runInContext(fs.readFileSync('src/content/health.js','utf8'), sandbox, {filename:'health'});
  return { GT: sandbox.GT, hidden, logged };
}

const results = [];
const t = (name, ok) => results.push([name, ok]);

// 1. 드리프트는 기본값(warn)에서 복귀시키지 않는다 — 이번 회귀의 본체
// 길이를 키워 둔다. 90자 차이라 절대량 하한(20자)을 넘고 비율만 남는다.
{
  const w = makeWorld({});
  w.GT.health.reconcile('a'.repeat(910), 'b'.repeat(1000)); // 9% 차이
  t('드리프트 9% → 복귀하지 않음', w.hidden.called === false && w.GT.health.degraded === false);
  t('드리프트 9% → 경고로는 남음', w.GT.health.warned === true && w.GT.health.reasons.length === 1);
}

// 2. 임계값 미만이면 경고조차 없다
{
  const w = makeWorld({ 'drift.threshold': 20 });
  w.GT.health.reconcile('a'.repeat(910), 'b'.repeat(1000));
  t('임계값 20% > 실제 9% → 조용함', w.GT.health.warned === false && w.GT.health.reasons.length === 0);
}

// 2-1. 몇 자 차이로는 알리지 않는다 (2026-09-15)
// 어긋나는 양은 마커 개수에 비례하는 고정량인데 분모는 응답 길이다.
// 비율만 보면 짧은 응답에서 반드시 터진다 — 내용은 멀쩡한데.
// docs/issue/2026-09-15-drift-warning-on-most-chats.md
{
  const w = makeWorld({});
  w.GT.health.reconcile('a'.repeat(27), 'b'.repeat(30));   // 3자 = 10%, 임계 8% 초과
  t('짧은 응답의 3자 차이는 조용하다', w.GT.health.warned === false && w.GT.health.reasons.length === 0);
}
{
  const w = makeWorld({});
  w.GT.health.reconcile('', 'b'.repeat(12));               // 본문이 통째로 비었지만 12자
  t('하한 미만이면 빈 본문이어도 조용하다', w.GT.health.warned === false);
}
{
  // 본문이 실제로 날아가면 수십~수백 자가 어긋나므로 여전히 잡힌다
  const w = makeWorld({});
  w.GT.health.reconcile('a'.repeat(30), 'b'.repeat(200));
  t('진짜로 날아가면 잡는다', w.GT.health.warned === true && w.GT.health.reasons.length === 1);
}

// 2-2. 공백만 다르면 같다고 본다
// 원본은 마커를 치환하면서 앞뒤 개행을 다르게 넣는다.
//
// 공백 차이를 하한(20자)보다 크게 잡는다. 작게 잡으면 하한에 먼저 걸려서
// 정규화를 빼도 통과한다 — 아무것도 검증하지 못하는 검사가 된다.
{
  const w = makeWorld({});
  const body = '가나다'.repeat(40);
  w.GT.health.reconcile(body + '\n\n' + body, body + '\n'.repeat(60) + body);
  t('개행이 58개 더 많아도 조용하다', w.GT.health.warned === false);
}
{
  const w = makeWorld({});
  const body = '앞뒤'.repeat(40);
  w.GT.health.reconcile('   ' + body.split('').join('  ') + '   ', body.split('').join(' '));
  t('중간 공백 개수가 달라도 조용하다', w.GT.health.warned === false);
}

// 3. onBreak=revert 를 고르면 치명 실패는 복귀시킨다
{
  const w = makeWorld({ onBreak: 'revert' });
  w.GT.health.fail('tap', '응답 없음');
  t('onBreak=revert → 복귀함', w.hidden.called === true && w.GT.health.degraded === true);
}

// 4. onBreak=warn 이면 치명 실패여도 복귀하지 않는다
{
  const w = makeWorld({ onBreak: 'warn' });
  w.GT.health.fail('tap', '응답 없음');
  t('onBreak=warn → 복귀 안 함, 경고만', w.hidden.called === false && w.GT.health.degraded === false && w.GT.health.warned === true);
}

// 5. onBreak=ignore 는 경고도 남기지 않는다
{
  const w = makeWorld({ onBreak: 'ignore' });
  w.GT.health.fail('tap', '응답 없음');
  t('onBreak=ignore → 조용함', w.hidden.called === false && w.GT.health.warned === false);
}

// 6. 같은 사유는 한 번만 쌓인다
{
  const w = makeWorld({});
  w.GT.health.fail('tap', '응답 없음');
  w.GT.health.fail('tap', '응답 없음');
  t('중복 사유 억제', w.GT.health.reasons.length === 1);
}

// 7. 스키마 기본값 — 사용자가 요청한 '복귀하지 마'가 기본이어야 한다
{
  const sandbox = { globalThis: null }; sandbox.globalThis = sandbox;
  vm.createContext(sandbox);
  vm.runInContext(fs.readFileSync('src/shared/defaults.js','utf8'), sandbox, {filename:'d'});
  t('기본 onBreak 이 warn', sandbox.GT_DEFAULTS.onBreak === 'warn');
  t('옵션 화면 스키마에 onBreak 존재', sandbox.GT_SCHEMA.some((f) => f.key === 'onBreak'));
}

// 8. fiber 판정 — 사용자 메시지 때문에 오탐이 나면 안 된다
{
  const w = makeWorld({});
  const v = (e, h) => w.GT.health.fiberVerdict(e, h);
  t('대상 0건이면 판단하지 않는다 (사용자 메시지만 있는 순간)', v(0, 0) === 'unknown');
  t('대상 있고 전부 성공 → ok', v(3, 3) === 'ok');
  t('대상 있고 전부 실패 → broken', v(3, 0) === 'broken');
  t('일부만 실패 → partial', v(3, 1) === 'partial');
}

// 9. 오탐이 배지를 노랗게 만들지 않는다
{
  const w = makeWorld({});
  if (w.GT.health.fiberVerdict(0, 0) === 'broken') w.GT.health.soft('fiber 실패');
  t('대상 0건에서는 경고도 배지도 없다', w.GT.health.warned === false && w.GT.health.reasons.length === 0);
}

// 10. 렌더 중 fiber 를 정답으로 삼지 않는다 (정적)
//
// 판단 기준이 두 번 바뀌었다.
//   접두사인가        → 인용 마커 표기가 달라 첫 인용부터 갈라졌다 (2026-09-08)
//   길이 비율 50%     → 50~99% 조각이 통과해 마지막 문장을 잘라먹었다 (2026-09-18)
//   길이 방향         → fiber 가 짧으면 무조건 안 받는다  ← 지금
// 자세한 검증은 test/verify.test.mjs 가 실제 핸들러를 돌려서 한다.
{
  const idx = fs.readFileSync('src/content/index.js', 'utf8');
  t('접두사 검사에 기대지 않는다', !/streamed\.startsWith\(fiber\)/.test(idx));
  t('비율 임계를 쓰지 않는다', !/VERIFY_MIN_RATIO/.test(idx));
  t('짧으면 받지 않는다 (방향으로 판단)', /const shorter = sLen > 0 && fLen < sLen;/.test(idx));
  t('비교 전에 인용 마커를 걷어낸다', /stripMarks/.test(idx));
  t('여러 번 다시 본다', /VERIFY_RETRIES/.test(idx) && /rec\.verifyTries/.test(idx));
  t('보류하면 화면을 덮지 않는다', /if \(shorter\) \{[\s\S]{0,400}?return;/.test(idx));
  t('끝내 짧으면 스트림을 지킨다', /스트림 본문을 지킨다/.test(idx));
}

// 10-1. 드리프트 경고는 관측만 적는다
{
  const h = fs.readFileSync('src/content/health.js', 'utf8');
  t('원인을 단정하지 않는다', !/델타 파서가 일부 op 를 놓치고 있다/.test(h));
  t('길이 차이를 보여준다', /스트림 \$\{a\.length\}자 \/ 원본 \$\{b\.length\}자/.test(h));
  t('비교 전에 마커를 걷어낸다', /stripMarks/.test(h));
  t('무엇을 보라고 안내한다', /:health/.test(h));
}

// 10-2. 이어받을 경로는 본문 경로일 때만 갱신한다
{
  const tap = fs.readFileSync('src/main/tap.js', 'utf8');
  t('메타데이터 경로가 lastPath 를 덮지 않는다',
    /\/\^\\\/message\\\/content\\\//.test(tap) || /message\\\/content\\\//.test(tap));
  t('왜 그런지 적어뒀다', /본문 델타가 메타데이터 경로를 상속해 버려진다/.test(tap));
}

let bad = 0;
results.forEach(([n, ok]) => { if (!ok) bad++; console.log(`  ${ok ? 'PASS' : 'FAIL'}  ${n}`); });
console.log(bad ? `\n${bad}건 실패` : '\n전부 통과');
process.exit(bad ? 1 : 0);
