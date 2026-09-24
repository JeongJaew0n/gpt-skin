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

// :reload — 확장을 디스크에서 다시 읽고, 요청한 탭을 새로고침한다.
// chrome://extensions 의 ↻ + 탭 새로고침과 같다. 콘텐츠 스크립트는 runtime.reload 를 부를 수 없어서
// 여기서 한다. 다시 읽으면 이 워커도 죽으므로, 새로고침할 탭을 storage.session 에 적어 두고
// 새 워커가 시작할 때 꺼내 새로고침한다. 입력줄에서 친 명령으로만 온다 (페이지 스크립트는 못 보낸다).
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
    p.then((got) => {
      const tabId = got && got[RELOAD_KEY];
      if (!tabId) return;
      quiet(chrome.storage.session.remove(RELOAD_KEY));
      quiet(chrome.tabs.reload(tabId));
    }, () => {});
  }
} catch (_) { /* storage.session 이 없으면 탭 새로고침만 빠진다 */ }

chrome.runtime.onMessage.addListener((msg, sender) => {
  if (!msg) return;
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

chrome.tabs.onRemoved.addListener((tabId) => STATE.delete(tabId));
chrome.tabs.onUpdated.addListener((tabId, info) => {
  if (info.status === 'loading') { STATE.delete(tabId); quiet(chrome.action.setBadgeText({ tabId, text: '' })); }
});
