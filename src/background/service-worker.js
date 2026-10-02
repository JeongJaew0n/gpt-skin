// gpt-skin — 배지와 토글.
// 배지는 네 상태를 말한다: 켜짐 / 경고를 안고 켜짐 / 원본으로 복귀함 / 꺼짐.
const STATE = new Map(); // tabId -> {reverted, warned, reasons, visible}

// MV3 에서 chrome.action.* 는 콜백을 주지 않으면 Promise 를 돌려준다.
// 그 사이 탭이 닫혔으면 거부되고, 잡지 않으면 unhandled rejection 으로 남는다.
const quiet = (p) => { if (p && typeof p.catch === 'function') p.catch(() => {}); };

function badgeFor(s) {
  if (s.reverted) {
    return { text: '!', color: '#f85149',
      title: 'gpt-skin — 원본 UI 로 복귀함\n' + (s.reasons || []).join('\n') };
  }
  if (s.warned) {
    return { text: '⚠', color: '#d29922',
      title: 'gpt-skin 켜짐 — 경고 있음\n' + (s.reasons || []).join('\n') };
  }
  if (s.visible) {
    return { text: '▮', color: '#3fb950', title: 'gpt-skin 켜짐' };
  }
  return { text: '', color: '#30363d', title: 'gpt-skin 꺼짐' };
}

function paint(tabId) {
  const b = badgeFor(STATE.get(tabId) || {});
  quiet(chrome.action.setBadgeText({ tabId, text: b.text }));
  quiet(chrome.action.setBadgeBackgroundColor({ tabId, color: b.color }));
  quiet(chrome.action.setTitle({ tabId, title: b.title }));
}

// :reload — 확장을 디스크에서 다시 읽는다. chrome://extensions 의 ↻ 와 같다.
// 콘텐츠 스크립트는 runtime.reload 를 부를 수 없어서 여기서 한다. 다시 읽으면 이 워커도 죽으므로,
// 요청한 탭을 storage.session 에 적어 두고 새 워커가 꺼낸다. 새 코드는 재주입(아래)으로 붙으므로
// 탭을 새로고침하지 않는다 — 재주입이 그 탭에 실패했을 때만 새로고침으로 붙인다.
// 입력줄에서 친 명령으로만 온다 (페이지 스크립트는 못 보낸다).
const RELOAD_KEY = 'gptSkinReloadTab';
function reloadExtension(tabId) {
  const go = () => chrome.runtime.reload();
  try {
    const p = chrome.storage.session.set({ [RELOAD_KEY]: tabId || 0 });
    if (p && typeof p.then === 'function') p.then(go, go); else go();
  } catch (_) { go(); }
}
try {
  const p = chrome.storage.session.get(RELOAD_KEY);
  if (p && typeof p.then === 'function') {
    p.then(async (got) => {
      const tabId = got && got[RELOAD_KEY];
      if (!tabId) return;
      quiet(chrome.storage.session.remove(RELOAD_KEY));
      // 재주입이 그 탭에 붙었으면 새로고침할 필요가 없다 — 보던 화면이 그대로 이어진다.
      // 재주입이 실패했거나 결과가 안 오면(3초) 예전처럼 새로고침으로 붙인다.
      const r = await Promise.race([reinjected, new Promise((res) => setTimeout(() => res(null), 3000))]);
      if (r && r.done && r.done.includes(tabId)) return;
      quiet(chrome.tabs.reload(tabId));
    }, () => {});
  }
} catch (_) { /* storage.session 이 없으면 탭 새로고침만 빠진다 */ }

// ---------------------------------------------------------------- 재주입
//
// 크롬은 확장을 다시 로드(업데이트)하면 이미 열려 있는 탭의 콘텐츠 스크립트를 확장에서
// 끊는다. 그리고 새 코드를 넣어 주지 않는다 — 새로 여는 페이지에만 들어간다.
// 그래서 예전에는 업데이트할 때마다 열린 ChatGPT 탭이 전부 멈추고 '새로고침해주세요' 가 떴다.
//
// 설치·업데이트 직후 열린 탭을 찾아 매니페스트의 콘텐츠 스크립트를 같은 순서로 다시 넣는다.
// 넣을 파일 목록은 매니페스트에서 읽는다 — 두 곳에 적으면 갈린다.
// 옛 인스턴스와의 교대는 스크립트 쪽이 한다(tap 은 세대 번호, isolated 는 takeover 이벤트).
// docs/issue/2026-09-28-reinject-after-update.md
async function reinject(reason) {
  if (!chrome.scripting || !chrome.tabs) return { tabs: 0, done: [], failed: [] };
  const groups = (chrome.runtime.getManifest().content_scripts || [])
    .map((c) => ({ world: c.world === 'MAIN' ? 'MAIN' : 'ISOLATED', js: c.js || [], matches: c.matches || [] }))
    .filter((g) => g.js.length);
  // isolated 를 먼저 넣는다. 그쪽이 먼저 옛 인스턴스를 비키게 하고 메시지를 받을 준비를 한 뒤에
  // 새 tap 이 ready 를 쏘게 하려는 것이다. (늦게 와도 ping/pong 으로 다시 맞춘다)
  groups.sort((a, b) => (a.world === 'ISOLATED' ? 0 : 1) - (b.world === 'ISOLATED' ? 0 : 1));

  const urls = [...new Set(groups.flatMap((g) => g.matches))];
  let tabs = [];
  try { tabs = await chrome.tabs.query({ url: urls }); } catch (_) { tabs = []; }

  const failed = [];
  const done = [];
  // 한 탭이 실패해도 나머지는 계속한다. 버려진(discarded) 탭·로딩 중인 탭은 실패할 수 있다 —
  // 그런 탭은 다음에 열거나 새로고침할 때 매니페스트 주입으로 붙는다.
  for (const tab of tabs) {
    if (!tab || tab.id == null || tab.discarded) continue;
    try {
      for (const g of groups) {
        await chrome.scripting.executeScript({ target: { tabId: tab.id }, files: g.js, world: g.world });
      }
      done.push(tab.id);
    } catch (e) {
      failed.push({ tabId: tab.id, error: String((e && e.message) || e) });
    }
  }
  if (failed.length) console.warn('[gpt-skin] 재주입 실패', reason, failed);
  return { tabs: tabs.length, done, failed };
}

// :reload 가 결과를 기다린다. onInstalled 가 안 오는 시작(브라우저 재시작 등)이면 빈 결과로 끝난다.
let settleReinject;
const reinjected = new Promise((res) => { settleReinject = res; });

if (chrome.runtime.onInstalled) chrome.runtime.onInstalled.addListener((d) => {
  // install: 설치 전부터 열려 있던 탭도 바로 쓸 수 있게 한다
  // update : 확장 업데이트 · chrome://extensions 의 ↻ · :reload 모두 이 이유로 온다
  if (d && (d.reason === 'install' || d.reason === 'update')) {
    reinject(d.reason).then(settleReinject, () => settleReinject(null));
    // 설치 때만 환영 페이지를 한 장 연다. 업데이트 · ↻ · :reload 로는 열지 않는다 (UX 조사 B3).
    // 경로는 확장 뿌리부터의 절대 경로 — 서비스 워커 기준 상대 경로가 되지 않게.
    if (d.reason === 'install' && chrome.tabs && chrome.tabs.create) quiet(chrome.tabs.create({ url: '/src/welcome/welcome.html' }));
  } else {
    settleReinject(null);
  }
});

// 사용자가 chrome://extensions/shortcuts 에서 정한 키. 기본 키는 없다 — 허용되는 키(영문 · 숫자 · 일부)는
// 원본 · 브라우저 · 운영체제와 겹칠 수 있고 실측하지 못했다. Ctrl+\` 는 이 API 가 받지 않는 키다(백틱 불가).
// 팝업 토글과 같은 경로로 지금 탭에 toggle 을 보낸다. UX 조사 B1.
if (chrome.commands && chrome.commands.onCommand) chrome.commands.onCommand.addListener((command, tab) => {
  if (command !== 'toggle-skin') return;
  const send = (t) => { if (t && t.id) chrome.tabs.sendMessage(t.id, { kind: 'toggle' }, () => void chrome.runtime.lastError); };
  if (tab && tab.id) return send(tab);
  const p = chrome.tabs.query({ active: true, currentWindow: true });
  if (p && typeof p.then === 'function') p.then((ts) => send(ts && ts[0]), () => {});
});

// ---------------------------------------------------------------- 탭별 스킨
//
// '탭별로 분할 적용'(skin.perTab)을 켜면 탭마다 스킨을 따로 둔다. 값은 storage.session 에 tabId 로 —
// 새로고침해도 남고 브라우저를 닫으면 사라진다. 페이지의 웹 저장소는 원본 페이지 스크립트도 읽고 써서 쓰지 않는다.
// 콘텐츠 스크립트는 자기 tabId 를 모르므로 여기서 sender.tab.id 로 대신 읽고 쓴다.
// 다른 탭을 지정할 수 있는 것은 팝업(sender.tab 이 없는 확장 페이지)뿐이다 — 콘텐츠 스크립트가 남의 탭을 바꾸지 못하게.
// docs/plan/2026-10-02-per-tab-skin.md §3
const TAB_SKIN = 'tabSkin.';
const SKIN_ID = /^[a-z][a-z0-9-]{0,31}$/;      // 실제 스킨인지는 콘텐츠 쪽 레지스트리가 판단한다
async function tabSkinGet(tabId) {
  try { const got = await chrome.storage.session.get(TAB_SKIN + tabId); return got[TAB_SKIN + tabId] || null; } catch (_) { return null; }
}
async function tabSkinSet(tabId, skin) {
  try {
    if (skin) await chrome.storage.session.set({ [TAB_SKIN + tabId]: skin });
    else await chrome.storage.session.remove(TAB_SKIN + tabId);
    return true;
  } catch (_) { return false; }
}
async function tabSkinClearAll() {
  try {
    const all = await chrome.storage.session.get(null);
    const keys = Object.keys(all || {}).filter((k) => k.indexOf(TAB_SKIN) === 0);
    if (keys.length) await chrome.storage.session.remove(keys);
    return keys.length;
  } catch (_) { return 0; }
}
// 옵션을 끄면 탭별 값을 모두 지운다 — 다시 켰을 때 옛 값이 되살아나면 왜 그 탭만 다른지 알 수 없다.
// 끄는 길(옵션 화면 · :set)이 어디든 여기 한 곳에서 지운다.
try {
  chrome.storage.onChanged.addListener((changes, area) => {
    if (area === 'sync' && changes['skin.perTab'] && changes['skin.perTab'].newValue !== true) tabSkinClearAll();
  });
} catch (_) {}

chrome.runtime.onMessage.addListener((msg, sender, reply) => {
  if (!msg) return;
  if (msg.kind === 'tabSkin:get') {
    const id = sender.tab && sender.tab.id;
    if (!id) { reply({ skin: null }); return; }
    tabSkinGet(id).then((skin) => reply({ skin }));
    return true;                         // 비동기로 답한다
  }
  if (msg.kind === 'tabSkin:set') {
    const fromTab = sender.tab && sender.tab.id;
    const id = fromTab || (Number.isInteger(msg.tabId) ? msg.tabId : null);
    const skin = msg.skin == null ? null : String(msg.skin);
    if (!id || (skin && !SKIN_ID.test(skin))) { reply({ ok: false }); return; }
    tabSkinSet(id, skin).then((ok) => {
      // 팝업이 바꿨으면 그 탭에 알린다. 콘텐츠 스크립트가 스스로 바꾼 것은 이미 바뀌었다
      if (ok && !fromTab && skin) chrome.tabs.sendMessage(id, { kind: 'skin', skin }, () => void chrome.runtime.lastError);
      reply({ ok });
    });
    return true;
  }
  if (msg.kind === 'openOptions') { chrome.runtime.openOptionsPage(); return; }
  if (msg.kind === 'reload') { reloadExtension(sender.tab && sender.tab.id); return; }

  const tabId = sender.tab && sender.tab.id;
  if (!tabId) return;
  const s = STATE.get(tabId) || {};
  if (msg.kind === 'health') {
    s.reverted = msg.degraded;
    s.warned = msg.warned;
    s.reasons = msg.reasons;
    if (!('visible' in s)) s.visible = !msg.degraded;
  }
  if (msg.kind === 'visible') s.visible = msg.visible;
  STATE.set(tabId, s);
  paint(tabId);
});

// 툴바 아이콘을 누르면 팝업(src/popup)이 뜬다. default_popup 이 걸리면
// chrome.action.onClicked 는 아예 발생하지 않으므로 여기서 토글을 다루지 않는다.
// 팝업이 콘텐츠 스크립트에 직접 토글을 쏘고, 콘텐츠 스크립트가 'visible' 로 알려준다.

chrome.tabs.onRemoved.addListener((tabId) => { STATE.delete(tabId); tabSkinSet(tabId, null); });
chrome.tabs.onUpdated.addListener((tabId, info) => {
  if (info.status === 'loading') { STATE.delete(tabId); quiet(chrome.action.setBadgeText({ tabId, text: '' })); }
});
