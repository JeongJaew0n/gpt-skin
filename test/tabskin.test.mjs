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

// ---------------------------------------------------------------- 콘텐츠 쪽 (shell/skin.js)
function content(cfg, swSkin) {
  const calls = { set: [], ask: [] };
  const sb = { console, Object, Array, Map, Set, String, Number, Boolean, JSON, Math, Promise, Error, RegExp, Date, setTimeout,
    navigator: { language: 'ko' }, chrome: { runtime: { getManifest: () => ({ version: '0.0.0' }) } } };
  sb.window = sb; sb.globalThis = sb;
  vm.createContext(sb);
  vm.runInContext(read('src/shared/i18n.js'), sb);
  vm.runInContext(read('src/shared/defaults.js'), sb);
  const conf = { ...sb.GT_DEFAULTS, ...cfg };
  sb.GT = {
    cover: { apply() {}, remove() {}, on() {}, off() {}, isOn: () => true },
    prompt: { attach() {}, detach() {}, get attached() { return true; } },
    config: { get all() { return { ...conf }; }, get: (k) => conf[k], set: async (k, v) => { calls.set.push([k, v]); conf[k] = v; } },
    health: { degraded: false }, sendToSW() {}, store: { isStreaming: () => false },
    askSW: async (m) => { calls.ask.push(m); return m.kind === 'tabSkin:get' ? { skin: swSkin } : { ok: true }; }
  };
  vm.runInContext(read('src/content/shell/skin.js'), sb, { filename: 'skin.js' });
  ['terminal', 'sheet', 'none'].forEach((id) => {
    const d = { id, covers: id !== 'none', capturesTyping: true, keys: {}, persistSidebar: true, themes: {}, defaultTheme: 't', configKeys: [], hiddenCommands: [], prompt: { el: null } };
    sb.GT.skins.METHODS.forEach((m) => { d[m] = () => {}; });
    sb.GT.skins.register(d);
  });
  return { GT: sb.GT, calls, conf };
}
{
  const { GT, calls } = content({ skin: 'terminal' }, 'sheet');
  t('설정 항목 skin.perTab — 기본 끔', GT.config.get('skin.perTab') === false);
  await GT.skin.loadTab(GT.config.all);
  t('꺼져 있으면 서비스 워커에 묻지 않는다', calls.ask.length === 0 && GT.skin.wanted() === 'terminal');
  GT.skin.use('terminal');
  await GT.skin.switch('sheet');
  t('꺼져 있으면 :skin 이 설정(모든 탭)에 저장한다 — 지금과 같다', calls.set.some(([k, v]) => k === 'skin' && v === 'sheet') && calls.ask.length === 0);
}
{
  const { GT, calls } = content({ skin: 'terminal', 'skin.perTab': true }, 'sheet');
  await GT.skin.loadTab(GT.config.all);
  t('켜져 있으면 이 탭의 값을 묻는다', calls.ask.length === 1 && calls.ask[0].kind === 'tabSkin:get');
  t('이 탭에서 고른 스킨이 기본 스킨보다 먼저다', GT.skin.wanted() === 'sheet');
  GT.skin.use(GT.skin.wanted());
  await GT.skin.switch('none');
  t('켜져 있으면 :skin 이 이 탭에만 저장한다 (설정의 skin 은 그대로)', calls.set.length === 0 && calls.ask.at(-1).kind === 'tabSkin:set' && calls.ask.at(-1).skin === 'none' && GT.skin.tabSkin === 'none');
  GT.skin.setTabSkin(null);
  t('탭 값을 잊으면 기본 스킨으로', GT.skin.wanted() === 'terminal');
}
{
  const { GT } = content({ skin: 'terminal', 'skin.perTab': true }, null);
  await GT.skin.loadTab(GT.config.all);
  t('이 탭에서 고른 게 없으면 기본 스킨', GT.skin.wanted() === 'terminal');
  const g = content({ skin: 'terminal', 'skin.perTab': true }, 'zzz');
  await g.GT.skin.loadTab(g.GT.config.all);
  t('모르는 스킨 이름이 오면 무시하고 기본 스킨', g.GT.skin.wanted() === 'terminal' && g.GT.skin.tabSkin === null);
}
{
  const { GT, conf } = content({ skin: 'terminal', 'skin.perTab': true }, 'sheet');
  await GT.skin.loadTab(GT.config.all);
  conf['skin.perTab'] = false;
  t('옵션을 끄면 이 탭의 값보다 기본 스킨', GT.skin.wanted() === 'terminal');
}
{
  const idx = read('src/content/index.js');
  t('부팅: 이 탭의 스킨을 기다리되 상한이 있다', /const TAB_SKIN_WAIT_MS = 300;/.test(idx) && /await Promise\.race\(\[tabSkinAsk, new Promise\(\(r\) => setTimeout\(r, TAB_SKIN_WAIT_MS\)\)\]\);\s*GT\.skin\.use\(GT\.skin\.wanted\(cfg\)\);/.test(idx));
  t('부팅: 늦게 온 답이면 그때 바꾼다', /tabSkinAsk\.then\(\(\) => \{[\s\S]{0,200}GT\.skin\.switch\(want, \{ persist: false \}\)/.test(idx));
  t('설정 변경: 꺼지면 탭 값을 잊고, 기본 스킨 변경은 고르지 않은 탭만 따른다', /if \(!GT\.skin\.perTab\(\)\) GT\.skin\.setTabSkin\(null\);\s*const want = GT\.skin\.wanted\(c\);/.test(idx));
  t('팝업이 보낸 이 탭의 스킨을 받는다 (켜져 있을 때만)', /msg\.kind === 'skin'[\s\S]{0,120}if \(!GT\.skin\.perTab\(\) \|\| !GT\.skins\.get\(msg\.skin\)\) \{ reply\(\{ ok: false \}\); return; \}/.test(idx));
  const i18n = read('src/shared/i18n.js');
  t('옵션 문구 ko · en', (i18n.match(/'opt\.skin\.perTab\.label'/g) || []).length === 2 && (i18n.match(/'opt\.skin\.perTab\.help'/g) || []).length === 2);
}

let bad = 0;
results.forEach(([n, ok]) => { if (!ok) bad++; console.log(`  ${ok ? 'PASS' : 'FAIL'}  ${n}`); });
console.log(bad ? `\n${bad}건 실패` : '\n전부 통과');
process.exit(bad ? 1 : 0);
