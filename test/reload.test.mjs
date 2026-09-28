// :reload — 확장을 디스크에서 다시 읽는다. 새 코드는 재주입으로 붙고,
// 재주입이 그 탭에 실패했을 때만 새로고침한다 (2026-09-28).
import fs from 'node:fs'; import vm from 'node:vm';

const results = []; const t = (n, ok) => results.push([n, ok]);
const read = (f) => fs.readFileSync(f, 'utf8');
const tick = () => new Promise((r) => setTimeout(r, 0));

function boot(session = {}) {
  const calls = { reload: 0, tabReload: [], set: [], removed: [] };
  const store = { ...session };
  let onMessage = null;
  let onInstalled = null;
  const chrome = {
    runtime: { reload: () => { calls.reload++; }, openOptionsPage() {}, onMessage: { addListener: (fn) => { onMessage = fn; } },
      onInstalled: { addListener: (fn) => { onInstalled = fn; } }, getManifest: () => JSON.parse(read('manifest.json')) },
    scripting: { executeScript: async () => {} },
    storage: { session: {
      get: async (k) => (k in store ? { [k]: store[k] } : {}),
      set: async (o) => { calls.set.push(o); Object.assign(store, o); },
      remove: async (k) => { calls.removed.push(k); delete store[k]; }
    } },
    tabs: { reload: async (id) => { calls.tabReload.push(id); }, query: async () => [], onRemoved: { addListener() {} }, onUpdated: { addListener() {} } },
    action: { setBadgeText: async () => {}, setBadgeBackgroundColor: async () => {}, setTitle: async () => {} }
  };
  const sb = { console, Map, Set, Object, Array, Promise, JSON, String, Error, setTimeout, chrome };
  vm.createContext(sb);
  vm.runInContext(read('src/background/service-worker.js'), sb, { filename: 'service-worker.js' });
  return { calls, send: (msg, sender) => onMessage(msg, sender || { tab: { id: 7 } }), store,
    installed: (d) => onInstalled && onInstalled(d) };
}

{
  const w = boot();
  await tick();
  t('평소 시작에는 탭을 새로고침하지 않는다', w.calls.tabReload.length === 0);
  w.send({ kind: 'reload' }, { tab: { id: 42 } });
  await tick(); await tick();
  t('reload 요청이 탭 번호를 적어 둔다', w.calls.set.some((o) => o.gptSkinReloadTab === 42));
  t('적어 둔 뒤 확장을 다시 읽는다', w.calls.reload === 1);
  w.send({ kind: 'visible', visible: true });
  await tick();
  t('다른 메시지로는 다시 읽지 않는다', w.calls.reload === 1);
}
{
  // 다시 읽은 뒤 새 워커가 시작된다
  // 이 탭은 재주입 대상에 없었다(query 가 빈 목록) → 붙지 못했으니 새로고침으로 붙인다
  const w = boot({ gptSkinReloadTab: 42 });
  w.installed({ reason: 'update' });
  await tick(); await tick(); await tick();
  t('재주입이 못 붙은 탭은 새 워커가 새로고침한다', w.calls.tabReload.join() === '42');
  t('적어 둔 것을 지운다 (다음 시작에 또 새로고침하지 않게)', w.calls.removed.includes('gptSkinReloadTab'));
}
{
  // 입력줄에서 친 명령으로만 온다. 페이지 스크립트가 MAIN world 브리지로 보낼 수 있는 경로가 없어야 한다.
  const idx = read('src/content/index.js');
  const proto = read('src/content/protocol.js');
  const tap = read('src/main/tap.js');
  t('MAIN world 에서 reload 를 보내는 곳이 없다', !/reload/.test(tap));
  t('브리지 핸들러가 SW 로 reload 를 넘기지 않는다', !/kind: 'reload'/.test(idx) && !/kind: 'reload'/.test(proto));
  const cmds = read('src/content/commands.js');
  t(':reload 명령이 SW 에 요청한다', /def\(':reload'[\s\S]{0,160}GT\.sendToSW\(\{ kind: 'reload' \}\)/.test(cmds));
}

let bad = 0;
results.forEach(([n, ok]) => { if (!ok) bad++; console.log(`  ${ok ? 'PASS' : 'FAIL'}  ${n}`); });
console.log(bad ? `\n${bad}건 실패` : '\n전부 통과');
process.exit(bad ? 1 : 0);
