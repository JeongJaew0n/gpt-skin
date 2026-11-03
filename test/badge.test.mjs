// 배지 — 서비스 워커가 잠들었다 깨도, 노 스킨을 Ctrl+; 로 여닫아도 실제 상태를 그리는가 (리뷰 2026-11-03).
// 워커는 30초쯤 쉬면 내려가며 탭별 상태(STATE)를 잃는다. 예전에는 깨어난 뒤 'visible' 만 받아 경고(⚠)를 잃고
// 초록으로 그렸고, show · hide 는 배지에 알리지 않아 노 스킨의 여닫기가 배지에 닿지 않았다.
import fs from 'node:fs'; import vm from 'node:vm';

const results = []; const t = (n, ok) => results.push([n, ok]);
const read = (f) => fs.readFileSync(f, 'utf8');

// --- 서비스 워커: 새로 뜬 워커(빈 STATE)가 메시지 하나로 배지를 그린다 ---
function worker() {
  const badge = new Map();
  let onMessage = null;
  const chrome = {
    runtime: { reload() {}, openOptionsPage() {}, onMessage: { addListener: (fn) => { onMessage = fn; } },
      onInstalled: { addListener() {} }, getManifest: () => JSON.parse(read('manifest.json')) },
    scripting: { executeScript: async () => {} },
    storage: { session: { get: async () => ({}), set: async () => {}, remove: async () => {} }, onChanged: { addListener() {} } },
    tabs: { reload: async () => {}, query: async () => [], sendMessage() {}, onRemoved: { addListener() {} }, onUpdated: { addListener() {} } },
    action: {
      setBadgeText: async ({ tabId, text }) => { badge.set(tabId, text); },
      setBadgeBackgroundColor: async () => {}, setTitle: async () => {}
    }
  };
  const sb = { console, Map, Set, Object, Array, Promise, JSON, String, Number, Error, setTimeout, chrome };
  vm.createContext(sb);
  vm.runInContext(read('src/background/service-worker.js'), sb, { filename: 'service-worker.js' });
  return { send: (msg, id = 7) => onMessage(msg, { tab: { id } }), badge: (id = 7) => badge.get(id) };
}
{
  const w = worker();                       // 잠들었다 깬 워커 — 이 탭의 경고를 모른다
  w.send({ kind: 'visible', visible: true, degraded: false, warned: true, reasons: ['drift'] });
  t('깨어난 워커도 켜짐 메시지 하나로 경고 배지를 그린다', w.badge() === '⚠');
  w.send({ kind: 'visible', visible: true, degraded: false, warned: false, reasons: [] });
  t('경고가 없으면 초록', w.badge() === '▮');
  w.send({ kind: 'visible', visible: false, degraded: false, warned: false, reasons: [] });
  t('꺼지면 비운다', w.badge() === '');
}
{
  const w = worker();
  w.send({ kind: 'health', degraded: false, warned: false, reasons: [], visible: false });
  t('점검 메시지가 꺼짐을 실어 오면 켜졌다고 추측하지 않는다', w.badge() === '');
  w.send({ kind: 'health', degraded: true, warned: true, reasons: ['tap'], visible: false });
  t('복귀는 빨강', w.badge() === '!');
}
{
  // 예전 메시지 모양(점검 상태 없이 visible 만)도 받는다 — 다른 판의 콘텐츠 스크립트가 남아 있을 수 있다
  const w = worker();
  w.send({ kind: 'health', degraded: false, warned: true, reasons: ['x'] });
  w.send({ kind: 'visible', visible: true });
  t('점검 상태 없는 visible 은 아는 경고를 지우지 않는다', w.badge() === '⚠');
}

// --- 콘텐츠: show · hide 가 배지에 알린다 (노 스킨의 Ctrl+; · esc · 바깥 클릭이 이 길을 탄다) ---
{
  const sw = [];
  let on = false;
  const sb = { console, Object, Array, Map, Set, String, Number, Boolean, JSON, Math, Promise, Error, RegExp, Date };
  sb.window = sb; sb.globalThis = sb;
  sb.document = { activeElement: null };
  vm.createContext(sb);
  vm.runInContext(read('src/shared/i18n.js'), sb, { filename: 'i18n.js' });
  sb.GT = {
    cover: { HOST_ID: 'h', apply() {}, remove() {}, on: () => { on = true; }, off: () => { on = false; }, isOn: () => on },
    health: { degraded: false, warned: true, reasons: ['drift'] },
    sendToSW: (m) => sw.push(m),
    compose: { composer: () => null }
  };
  vm.runInContext(read('src/content/shell/skin.js'), sb, { filename: 'skin.js' });
  const d = { id: 'terminal', covers: true, capturesTyping: true, keys: {}, persistSidebar: true, themes: {}, defaultTheme: '', configKeys: [], hiddenCommands: [], prompt: {} };
  sb.GT.skins.METHODS.forEach((m) => { d[m] = () => {}; });
  sb.GT.skins.register(d);
  sb.GT.skin.use('terminal');

  sb.GT.skin.show();
  const a = sw.at(-1);
  t('show 가 배지에 켜짐을 알린다', !!a && a.kind === 'visible' && a.visible === true);
  t('점검 상태를 함께 싣는다', !!a && a.warned === true && Array.isArray(a.reasons) && a.reasons[0] === 'drift');
  sb.GT.skin.hide();
  const h = sw.at(-1) || {};
  t('hide 가 배지에 꺼짐을 알린다', sw.length === 2 && h.kind === 'visible' && h.visible === false);
  const n = sw.length;
  sb.GT.skin.toggle();
  t('toggle 은 한 번만 알린다(show · hide 가 알린다)', sw.length === n + 1 && (sw.at(-1) || {}).visible === true);
}
{
  // 점검 메시지(health.report)도 켜짐을 싣는다
  const hp = read('src/content/health.js');
  t('점검 메시지가 켜짐을 싣는다', /kind: 'health',[\s\S]{0,120}visible,/.test(hp));
}

let bad = 0;
results.forEach(([n, ok]) => { if (!ok) bad++; console.log(`  ${ok ? 'PASS' : 'FAIL'}  ${n}`); });
console.log(bad ? `\n${bad}건 실패` : '\n전부 통과');
process.exit(bad ? 1 : 0);
