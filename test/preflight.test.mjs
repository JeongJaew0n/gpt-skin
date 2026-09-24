// 매니페스트가 낡아 모듈이 빠졌을 때, 조용히 죽지 않고 이유를 말해야 한다.
// docs/issue/2026-08-31-stale-manifest-silent-death.md 회귀 방지.
import fs from 'node:fs'; import vm from 'node:vm';

function run(files) {
  const errors = [], appended = [];
  const mkNode = () => ({
    style: {}, textContent: '', id: '',
    setAttribute(k, v) { this[k] = v; }, appendChild(c) { appended.push(c); return c; },
    addEventListener() {}, remove() {}
  });
  const sandbox = {
    console: { log(){}, warn(){}, debug(){}, error: (...a) => errors.push(a.join(' ')) },
    document: {
      body: mkNode(), documentElement: mkNode(),
      createElement: mkNode, getElementById: () => null, addEventListener(){},
      querySelector: () => null, querySelectorAll: () => []
    },
    location: { origin: 'x', href: 'x', pathname: '/' },
    chrome: { runtime: { id: 'x', sendMessage(){}, onMessage: { addListener(){} } },
      storage: { sync: { get: async (d) => d, set: async () => {} }, onChanged: { addListener(){} } } },
    MutationObserver: class { observe(){} disconnect(){} },
    setTimeout, setInterval: () => 0, clearTimeout,
    Object, Map, Set, Array, Date, Number, String, Boolean, JSON, Math, Promise, Error, RegExp
  };
  sandbox.window = sandbox; sandbox.globalThis = sandbox;
  sandbox.addEventListener = () => {}; sandbox.window.addEventListener = () => {};
  vm.createContext(sandbox);
  for (const f of files) {
    try { vm.runInContext(fs.readFileSync(f, 'utf8'), sandbox, { filename: f }); } catch (_) { /* 그 파일만 죽는다 */ }
  }
  return { errors, appended, sandbox };
}

const ALL = JSON.parse(fs.readFileSync('manifest.json','utf8'))
  .content_scripts.find(c => c.world === 'ISOLATED').js;
const STALE = ALL.filter(f => !f.includes('shared/defaults'));   // 구 매니페스트 재현

const results = []; const t = (n, ok) => results.push([n, ok]);

{
  const r = run(STALE);
  const msg = r.errors.join('\n');
  t('빠진 모듈을 콘솔에 알린다', /모듈이 로드되지 않았습니다/.test(msg));
  t('GT_DEFAULTS 를 지목한다', /GT_DEFAULTS/.test(msg));
  t('해결 방법을 알려준다', /chrome:\/\/extensions/.test(msg) && /↻/.test(msg));
  t('제거 재설치가 불필요함을 명시', /재설치할 필요는 없습니다/.test(msg));
  t('화면에도 배너를 띄운다', r.appended.some(n => n.id === 'gpt-skin-preflight'));
}

{
  const r = run(ALL);
  t('정상 로드에서는 조용하다', r.errors.length === 0);
  t('정상 로드에서는 배너 없음', !r.appended.some(n => n.id === 'gpt-skin-preflight'));
}

let bad = 0;
results.forEach(([n, ok]) => { if (!ok) bad++; console.log(`  ${ok ? 'PASS' : 'FAIL'}  ${n}`); });
console.log(bad ? `\n${bad}건 실패` : '\n전부 통과');
process.exit(bad ? 1 : 0);
