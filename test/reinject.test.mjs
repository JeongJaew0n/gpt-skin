// 재주입 — 확장을 다시 로드해도 새로고침 없이 새 코드로 이어진다.
// docs/issue/2026-09-28-reinject-after-update.md
import fs from 'node:fs'; import vm from 'node:vm';

const results = []; const t = (n, ok) => results.push([n, ok]);
const manifest = JSON.parse(fs.readFileSync('manifest.json', 'utf8'));

// ================================================================ tap — 이중 래핑

// 같은 페이지(MAIN world)에 tap.js 를 여러 번 넣는 상황을 만든다.
function makePage() {
  const listeners = [];
  const posted = [];
  let nativeCalls = 0;
  const win = {
    location: { origin: 'https://chatgpt.com', href: 'https://chatgpt.com/' },
    fetch: function nativeFetch() { nativeCalls += 1; return Promise.resolve({ ok: true, body: null }); },
    addEventListener: (type, fn) => { if (type === 'message') listeners.push(fn); },
    removeEventListener: () => {},
    // 실제 postMessage 는 비동기지만, 여기서는 기록만 한다
    postMessage: (data) => { posted.push(data); }
  };
  const sb = { console, Object, Array, String, Number, Boolean, JSON, Math, Promise, Error, RegExp, Date,
    Map, Set, TextDecoder, setTimeout, clearTimeout, window: win, location: win.location,
    Response: function Response(b, init) { this.body = b; Object.assign(this, init || {}); this.ok = true; },
    document: { querySelectorAll: () => [], querySelector: () => null, getElementById: () => null } };
  vm.createContext(sb);
  const inject = () => vm.runInContext(fs.readFileSync('src/main/tap.js', 'utf8'), sb, { filename: 'tap.js' });
  // isolated → MAIN 메시지를 흉내낸다
  const send = (kind) => listeners.forEach((fn) => fn({ source: win, data: { __gpt_skin__: true, dir: 'i2m', kind, payload: {} } }));
  return { win, posted, listeners, inject, send, native: () => nativeCalls };
}

{
  const P = makePage();
  P.inject();
  t('처음 넣으면 세대 1', P.win.__gptSkinTap && P.win.__gptSkinTap.gen === 1);
  P.inject();
  t('다시 넣으면 세대 2', P.win.__gptSkinTap.gen === 2);

  // 두 tap 이 모두 message 리스너를 걸었지만, 답은 새 것만 해야 한다
  P.posted.length = 0;
  P.send('ping');
  const pongs = P.posted.filter((d) => d.kind === 'pong').length;
  t('ping 에 한 번만 답한다 (옛 tap 은 비킨다)', pongs === 1);

  // fetch 는 새 tap → 옛 tap → 원본 으로 이어진다. 원본은 한 번만 불려야 한다
  const before = P.native();
  P.win.fetch('https://chatgpt.com/backend-api/models');
  t('fetch 한 번에 원본은 한 번만 불린다', P.native() - before === 1);
}
{
  // 핵심: 스트림 주소일 때 이중 래핑이면 응답을 두 번 갈라(tee) 두 번 읽는다 →
  // 같은 답이 두 번 들어온다. 비스트림 주소로는 이걸 못 잡는다(원본 호출 수가 같다).
  const P = makePage();
  let tees = 0;
  const stream = () => ({ getReader: () => ({ read: async () => ({ done: true }) }) });
  const body = () => ({ tee: () => { tees += 1; return [body(), stream()]; } });
  P.win.fetch = function nativeFetch() { return Promise.resolve({ ok: true, status: 200, statusText: 'OK', headers: {}, body: body() }); };
  P.inject();
  P.inject();
  await P.win.fetch.call(P.win, 'https://chatgpt.com/backend-api/f/conversation');
  await new Promise((r) => setTimeout(r, 10));
  t('스트림 응답은 한 번만 갈라 읽는다 (옛 tap 은 통과)', tees === 1);
}
{
  // 세 번째 재주입에서도 답하는 것은 하나뿐이다
  const P = makePage();
  P.inject(); P.inject(); P.inject();
  P.posted.length = 0;
  P.send('ping');
  t('세 번 넣어도 한 번만 답한다', P.posted.filter((d) => d.kind === 'pong').length === 1);
  t('세대가 3', P.win.__gptSkinTap.gen === 3);
}
{
  // 표식은 페이지 스크립트가 열거하지 못하게 둔다 (Object.keys(window) 에 안 나온다)
  const P = makePage();
  P.inject();
  t('세대 표식이 열거되지 않는다', !Object.keys(P.win).includes('__gptSkinTap'));
}

// ================================================================ 서비스워커 — 다시 넣기

function loadSW(opts) {
  const o = opts || {};
  const calls = [];
  const reloads = [];
  let onInstalled = null;
  const session = { ...(o.session || {}) };
  const chrome = {
    runtime: {
      getManifest: () => manifest,
      onInstalled: { addListener: (fn) => { onInstalled = fn; } },
      onMessage: { addListener: () => {} },
      reload: () => {},
      openOptionsPage: () => {}
    },
    tabs: {
      query: async () => o.tabs || [],
      reload: (id) => { reloads.push(id); return Promise.resolve(); },
      onRemoved: { addListener: () => {} },
      onUpdated: { addListener: () => {} }
    },
    scripting: {
      executeScript: async (arg) => {
        if ((o.failTabs || []).includes(arg.target.tabId)) throw new Error('Frame with ID 0 was removed.');
        calls.push({ tab: arg.target.tabId, world: arg.world, files: arg.files });
      }
    },
    action: { setBadgeText: () => Promise.resolve(), setBadgeBackgroundColor: () => Promise.resolve(), setTitle: () => Promise.resolve() },
    storage: { session: {
      get: async (k) => ({ [k]: session[k] }),
      set: async (v) => Object.assign(session, v),
      remove: async (k) => { delete session[k]; }
    } }
  };
  const warns = [];
  const sb = { console: { ...console, warn: (...a) => warns.push(a) }, Object, Array, String, Number, Boolean, JSON,
    Math, Promise, Error, Map, Set, setTimeout, chrome };
  vm.createContext(sb);
  vm.runInContext(fs.readFileSync('src/background/service-worker.js', 'utf8'), sb, { filename: 'sw.js' });
  return { calls, reloads, warns, fire: (d) => onInstalled && onInstalled(d), hasListener: () => !!onInstalled };
}
const tick = (ms) => new Promise((r) => setTimeout(r, ms || 0));

const isoFiles = manifest.content_scripts.find((c) => c.world !== 'MAIN').js;
const mainFiles = manifest.content_scripts.find((c) => c.world === 'MAIN').js;

{
  const S = loadSW({ tabs: [{ id: 11, url: 'https://chatgpt.com/c/a' }, { id: 12, url: 'https://chatgpt.com/' }] });
  t('onInstalled 를 듣는다', S.hasListener());
  S.fire({ reason: 'update' });
  await tick(10);
  t('열린 탭 둘 다 다시 넣는다', new Set(S.calls.map((c) => c.tab)).size === 2);
  const t11 = S.calls.filter((c) => c.tab === 11);
  t('탭마다 isolated 먼저, 그 다음 MAIN', t11.length === 2 && t11[0].world === 'ISOLATED' && t11[1].world === 'MAIN');
  t('넣는 파일은 매니페스트와 같다 (isolated)', JSON.stringify(t11[0].files) === JSON.stringify(isoFiles));
  t('넣는 파일은 매니페스트와 같다 (MAIN)', JSON.stringify(t11[1].files) === JSON.stringify(mainFiles));
}
{
  const S = loadSW({ tabs: [{ id: 1 }] });
  S.fire({ reason: 'install' });
  await tick(10);
  t('설치할 때도 넣는다 (설치 전부터 열린 탭)', S.calls.length === 2);
}
{
  const S = loadSW({ tabs: [{ id: 1 }] });
  S.fire({ reason: 'chrome_update' });
  await tick(10);
  t('크롬 자체 업데이트에는 넣지 않는다', S.calls.length === 0);
}
{
  // 한 탭이 실패해도 나머지는 계속한다
  const S = loadSW({ tabs: [{ id: 1 }, { id: 2 }, { id: 3 }], failTabs: [2] });
  S.fire({ reason: 'update' });
  await tick(10);
  const done = new Set(S.calls.map((c) => c.tab));
  t('실패한 탭을 건너뛰고 계속한다', done.has(1) && done.has(3) && !done.has(2));
  t('실패를 기록한다', S.warns.length === 1);
}
{
  const S = loadSW({ tabs: [{ id: 1, discarded: true }, { id: 2 }] });
  S.fire({ reason: 'update' });
  await tick(10);
  t('버려진 탭은 건드리지 않는다', !S.calls.some((c) => c.tab === 1) && S.calls.some((c) => c.tab === 2));
}

// ================================================================ :reload — 새로고침은 실패했을 때만

{
  // 재주입이 그 탭에 붙으면 새로고침하지 않는다
  const S = loadSW({ tabs: [{ id: 7 }], session: { gptSkinReloadTab: 7 } });
  S.fire({ reason: 'update' });
  await tick(30);
  t(':reload — 붙었으면 새로고침하지 않는다', S.reloads.length === 0);
}
{
  // 재주입이 그 탭에 실패하면 예전처럼 새로고침으로 붙인다
  const S = loadSW({ tabs: [{ id: 7 }], session: { gptSkinReloadTab: 7 }, failTabs: [7] });
  S.fire({ reason: 'update' });
  await tick(30);
  t(':reload — 실패했으면 새로고침한다', S.reloads.length === 1 && S.reloads[0] === 7);
}

// ================================================================ protocol — 리스너를 뗄 수 있다

{
  const added = []; const removed = [];
  const win = { addEventListener: (t2, fn) => added.push(fn), removeEventListener: (t2, fn) => removed.push(fn),
    postMessage: () => {}, location: { origin: 'x' } };
  const sb = { console, Object, Array, String, Number, Boolean, JSON, Math, Map, Set, Error, window: win, location: win.location };
  vm.createContext(sb);
  vm.runInContext(fs.readFileSync('src/content/protocol.js', 'utf8') + '\n;globalThis.__GT = GT;', sb, { filename: 'protocol.js' });
  const G = sb.__GT;
  let got = 0;
  G.on('pong', () => { got += 1; });
  added[0]({ source: win, data: { __gpt_skin__: true, dir: 'm2i', kind: 'pong', payload: {} } });
  t('멈추기 전에는 받는다', got === 1);
  G.stop();
  t('stop 이 같은 리스너를 뗀다', removed.length === 1 && removed[0] === added[0]);
}

// ================================================================ index — 교대 (정적)

{
  const idx = fs.readFileSync('src/content/index.js', 'utf8');
  t('새 인스턴스가 옛 것에게 비키라고 알린다', /dispatchEvent\(new CustomEvent\('gpt-skin:takeover'\)\)/.test(idx));
  t('세대 표식을 알리기 전에 세운다',
    idx.indexOf('pageRoot.dataset.gptSkinGen = GEN') < idx.indexOf("dispatchEvent(new CustomEvent('gpt-skin:takeover'))"));
  t('옛 것은 교대 신호에 물러난다', /listen\(pageRoot, 'gpt-skin:takeover'/.test(idx));
  t('켜 둔 상태를 알리기 전에 읽는다',
    idx.indexOf('const inherited = ') < idx.indexOf("dispatchEvent(new CustomEvent('gpt-skin:takeover'))"));
  // 이어받은 상태는 autoShow 로 켠다 (0.11.2 부터 점검 앞에서)
  t('켜 둔 상태를 이어받는다', /const autoShow = !!\(cfg\.enabled \|\| inherited\);/.test(idx) && /if \(showEarly\) GT\.skin\.show\(\);/.test(idx));
  // 옛 것이 고아 감지로 먼저 물러나 화면을 치운 경우에도 이어받는다 (헤드리스 실측에서 잃었다)
  t('물러날 때 켜져 있었음을 남긴다', /if \(MY\.cover\.isOn\(\)\) pageRoot\.dataset\.gptSkinWasOn = '1'/.test(idx));
  t('남긴 표식을 읽고 지운다', /pageRoot\.dataset\.gptSkinWasOn === '1'/.test(idx) && /delete pageRoot\.dataset\.gptSkinWasOn/.test(idx));
  t('표식을 치우기 전에 남긴다',
    idx.indexOf("pageRoot.dataset.gptSkinWasOn = '1'") < idx.indexOf('MY.skin.destroy()'));
  t('물러날 때 메시지 리스너를 뗀다', /MY\.stop\(\)/.test(idx));
  t('물러날 때 자기 모듈을 쓴다 (전역 GT 가 바뀌어도)', /MY\.skin\.destroy\(\)/.test(idx) && /const MY = GT;/.test(idx));
  t('늦게 물러날 때 새 화면을 지우지 않는다', /const replaced = pageRoot\.dataset\.gptSkinGen !== GEN;/.test(idx));
  // 요청: '새로고침해주세요' 가 뜨지 않게
  t('새로고침 안내를 띄우지 않는다', !/function notifyGone/.test(idx) && !/notifyGone\(\)/.test(idx));
  t('예전 판이 남긴 안내를 걷는다', /getElementById\('gpt-skin-gone'\)[\s\S]{0,60}remove\(\)/.test(idx));
  t('scripting 권한이 있다', (manifest.permissions || []).includes('scripting'));
  t('교대 경로에서는 표식을 남기지 않는다 (찌꺼기)', /if \(why !== 'takeover'\) \{ try \{ if \(MY\.cover\.isOn\(\)\)/.test(idx));
}

// ================================================================ executeScript 가 부팅을 기다리지 않는다
// 주입한 파일의 마지막 식이 Promise 면 executeScript 가 그것을 기다린다. index.js 는 async boot 로 끝나므로
// 그대로면 부팅(최대 수십 초)이 끝날 때까지 다음 주입이 멈춘다. 실측 30,276ms.
{
  const src = fs.readFileSync('src/content/index.js', 'utf8');
  const code = src.replace(/\/\/.*$/gm, '').trimEnd();
  // 실제로 스크립트의 완료 값을 계산해 본다 — 마지막 식을 흉내낸 짧은 소스로
  const tail = code.slice(code.lastIndexOf('})();'));
  const completion = vm.runInNewContext('(async function boot(){ await 0; }' + tail.slice(1));
  t('index.js 의 완료 값이 Promise 가 아니다', !(completion && typeof completion.then === 'function'));
  t('마지막 문이 void 0', /void 0;$/.test(code));
}

let bad = 0;
results.forEach(([n, ok]) => { if (!ok) bad++; console.log(`  ${ok ? 'PASS' : 'FAIL'}  ${n}`); });
console.log(bad ? `\n${bad}건 실패` : '\n전부 통과');
process.exit(bad ? 1 : 0);
