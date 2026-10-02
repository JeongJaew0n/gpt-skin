// 탭별 스킨 ('탭별로 분할 적용', skin.perTab) — 서비스워커가 tabId 로 storage.session 에 들고 있는다 (0.27.0)
// docs/plan/2026-10-02-per-tab-skin.md
import fs from 'node:fs'; import vm from 'node:vm';

const results = []; const t = (n, ok) => results.push([n, ok]);
const read = (f) => fs.readFileSync(f, 'utf8');
const tick = () => new Promise((r) => setTimeout(r, 0));

// ---------------------------------------------------------------- 서비스워커
function sw() {
  const store = {}; const sent = [];
  let onMessage = null, onRemoved = null, onChanged = null;
  const chrome = {
    runtime: { reload() {}, openOptionsPage() {}, lastError: null, onMessage: { addListener: (fn) => { onMessage = fn; } },
      onInstalled: { addListener() {} }, getManifest: () => JSON.parse(read('manifest.json')) },
    scripting: { executeScript: async () => {} },
    storage: {
      session: {
        get: async (k) => (k === null ? { ...store } : (k in store ? { [k]: store[k] } : {})),
        set: async (o) => { Object.assign(store, o); },
        remove: async (k) => { [].concat(k).forEach((x) => delete store[x]); }
      },
      onChanged: { addListener: (fn) => { onChanged = fn; } }
    },
    tabs: { reload: async () => {}, query: async () => [], sendMessage: (id, m, cb) => { sent.push([id, m]); if (cb) cb(); },
      onRemoved: { addListener: (fn) => { onRemoved = fn; } }, onUpdated: { addListener() {} } },
    action: { setBadgeText: async () => {}, setBadgeBackgroundColor: async () => {}, setTitle: async () => {} }
  };
  const sb = { console, Map, Set, Object, Array, Promise, JSON, String, Number, Error, setTimeout, chrome };
  vm.createContext(sb);
  vm.runInContext(read('src/background/service-worker.js'), sb, { filename: 'service-worker.js' });
  // 답을 기다린다 — true 를 돌려주면 비동기 답이다
  const ask = (msg, sender) => new Promise((res) => { const r = onMessage(msg, sender, res); if (r !== true) setTimeout(() => res('(동기)'), 0); });
  return { store, sent, ask, removed: (id) => onRemoved(id), changed: (c, a) => onChanged(c, a) };
}

{
  const w = sw();
  const tab7 = { tab: { id: 7 } };
  t('처음엔 탭별 값이 없다', (await w.ask({ kind: 'tabSkin:get' }, tab7)).skin === null);
  t('콘텐츠 스크립트가 자기 탭 값을 쓴다', (await w.ask({ kind: 'tabSkin:set', skin: 'sheet' }, tab7)).ok === true && w.store['tabSkin.7'] === 'sheet');
  t('그 탭이 다시 읽으면 그 값 (새로고침해도 남는다)', (await w.ask({ kind: 'tabSkin:get' }, tab7)).skin === 'sheet');
  t('다른 탭은 영향 없다', (await w.ask({ kind: 'tabSkin:get' }, { tab: { id: 8 } })).skin === null);
  t('스스로 바꾼 탭에는 다시 알리지 않는다', w.sent.length === 0);

  await w.ask({ kind: 'tabSkin:set', skin: 'terminal', tabId: 8 }, tab7);
  t('콘텐츠 스크립트는 남의 탭을 지정할 수 없다 (sender.tab.id 만 쓴다)', !('tabSkin.8' in w.store) && w.store['tabSkin.7'] === 'terminal');

  t('팝업(탭 없는 확장 페이지)은 탭을 지정해 바꾼다', (await w.ask({ kind: 'tabSkin:set', skin: 'none', tabId: 9 }, {})).ok === true && w.store['tabSkin.9'] === 'none');
  t('팝업이 바꾸면 그 탭에 바로 알린다', w.sent.length === 1 && w.sent[0][0] === 9 && w.sent[0][1].kind === 'skin' && w.sent[0][1].skin === 'none');
  t('탭 없이 tabId 도 없으면 거절', (await w.ask({ kind: 'tabSkin:set', skin: 'sheet' }, {})).ok === false);
  t('스킨 이름 모양이 아니면 거절', (await w.ask({ kind: 'tabSkin:set', skin: '<x>' }, tab7)).ok === false && w.store['tabSkin.7'] === 'terminal');

  await w.ask({ kind: 'tabSkin:set', skin: null }, tab7);
  t('null 로 쓰면 지운다 (기본을 따른다)', !('tabSkin.7' in w.store));

  w.removed(9); await tick();
  t('탭을 닫으면 그 탭 값을 지운다', !('tabSkin.9' in w.store));

  w.store['tabSkin.1'] = 'sheet'; w.store['tabSkin.2'] = 'none'; w.store.gptSkinReloadTab = 5;
  w.changed({ 'skin.perTab': { oldValue: true, newValue: true } }, 'sync'); await tick(); await tick();
  t('옵션이 켜진 채면 지우지 않는다', w.store['tabSkin.1'] === 'sheet');
  w.changed({ 'skin.perTab': { oldValue: true, newValue: false } }, 'sync'); await tick(); await tick();
  t('옵션을 끄면 탭별 값을 모두 지운다', !('tabSkin.1' in w.store) && !('tabSkin.2' in w.store));
  t('다른 session 값은 건드리지 않는다', w.store.gptSkinReloadTab === 5);
}

let bad = 0;
results.forEach(([n, ok]) => { if (!ok) bad++; console.log(`  ${ok ? 'PASS' : 'FAIL'}  ${n}`); });
console.log(bad ? `\n${bad}건 실패` : '\n전부 통과');
process.exit(bad ? 1 : 0);
