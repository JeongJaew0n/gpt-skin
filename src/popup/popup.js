// gpt-skin — 툴바 팝업.
//
// 아이콘을 누르면 곧바로 토글하던 것을 이 화면으로 바꿨다. 토글이 둘이라서다.
//   · 이 탭에 스킨 켜기       — 지금 보고 있는 탭에만. 콘텐츠 스크립트에 메시지를 쏜다
//   · 열면 바로 스킨으로      — 기본 동작. chrome.storage.sync 의 'enabled'
// 위에 스킨 고르기(terminal · sheet · none)가 있다. 'skin' 에 저장하면 열린 탭이 바로 따라간다.
//
// 둘은 다른 것이다. 기본을 켜지 않고도 이 탭만 터미널로 볼 수 있어야 한다.
(async function () {
  'use strict';

  const $ = (s) => document.querySelector(s);
  const CHATGPT = /^https:\/\/chatgpt\.com\//;

  const ui = {
    dot: $('#dot'),
    build: $('#build'),
    rowTerm: $('#row-terminal'), swTerm: $('#sw-terminal'), helpTerm: $('#terminal-help'),
    rowDef: $('#row-default'), swDef: $('#sw-default')
  };

  ui.build.textContent = typeof GT_BUILD === 'string' ? GT_BUILD : '';

  const setSwitch = (el, on) => { el.dataset.on = on ? '1' : '0'; };

  // ---------------------------------------------------------------- 이 탭
  //
  // 콘텐츠 스크립트가 없을 수 있다 — ChatGPT 가 아닌 탭, 확장을 다시 로드한 뒤
  // 새로고침하지 않은 탭. 그때는 토글을 잠그고 이유를 적는다.
  let tab = null;
  let termOn = false;
  let termUsable = false;

  const ask = (msg) => new Promise((resolve) => {
    if (!tab || !tab.id) return resolve(null);
    chrome.tabs.sendMessage(tab.id, msg, (res) => {
      if (chrome.runtime.lastError) return resolve(null);   // 확인하지 않으면 콘솔에 남는다
      resolve(res || null);
    });
  });

  function paintTerminal() {
    setSwitch(ui.swTerm, termOn);
    ui.rowTerm.disabled = !termUsable;
    ui.dot.dataset.on = termOn ? '1' : '0';
  }

  async function readTab() {
    const [t] = await chrome.tabs.query({ active: true, currentWindow: true });
    tab = t || null;

    if (!tab || !CHATGPT.test(tab.url || '')) {
      termUsable = false; termOn = false;
      ui.helpTerm.textContent = 'ChatGPT 탭에서만 쓸 수 있습니다.';
      paintTerminal();
      return;
    }

    const state = await ask({ kind: 'state' });
    if (!state) {
      termUsable = false; termOn = false;
      ui.helpTerm.textContent = '아직 이 탭에 붙지 않았습니다. 새로고침이 필요합니다.';
      paintTerminal();
      return;
    }
    if (state.degraded) {
      termUsable = false; termOn = false;
      ui.dot.dataset.broken = '1';
      ui.helpTerm.textContent = '전제가 깨져 복귀했습니다. :health 로 사유를 확인하세요.';
      paintTerminal();
      return;
    }

    termUsable = true;
    termOn = !!state.visible;
    ui.helpTerm.textContent = '이 탭에만 적용됩니다.';
    paintTerminal();
  }

  ui.rowTerm.addEventListener('click', async () => {
    if (!termUsable) return;
    const res = await ask({ kind: 'toggle' });
    if (!res) { termUsable = false; ui.helpTerm.textContent = '응답이 없습니다. 새로고침이 필요합니다.'; }
    else termOn = !!res.visible;
    paintTerminal();
  });

  // ------------------------------------------------------------- 기본 동작
  const stored = await chrome.storage.sync.get(
    { enabled: GT_DEFAULTS.enabled, locale: GT_DEFAULTS.locale, skin: GT_DEFAULTS.skin });
  GT_SET_LOCALE(stored.locale);
  $('#skins-label').textContent = GT_T('popup.skin.label');
  $('#tab-label').textContent = GT_T('popup.tab.label');
  $('#default-label').textContent = GT_T('popup.default.label');
  $('#default-help').textContent = GT_T('popup.default.help');

  // ------------------------------------------------------------- 스킨 고르기
  //
  // 선택지는 스키마(skin 의 choices)에서 만든다. 이름은 설정 화면과 같은 사전 항목에서 괄호 설명만 뺀다
  // ('시트 (스프레드시트)' → '시트'). 좁은 팝업에 설명까지 넣으면 줄이 넘친다.
  const skinField = GT_SCHEMA.find((f) => f.key === 'skin');
  let skin = skinField.choices.includes(stored.skin) ? stored.skin : skinField.def;
  const shortName = (id) => GT_T('opt.skin.choice.' + id).replace(/\s*\([^)]*\)\s*$/, '');
  const skinButtons = skinField.choices.map((id) => {
    const b = document.createElement('button');
    b.type = 'button';
    b.className = 'skin';
    b.textContent = shortName(id);
    b.title = GT_T('opt.skin.choice.' + id);
    b.dataset.skin = id;
    b.setAttribute('role', 'radio');
    b.addEventListener('click', async () => {
      if (skin === id) return;
      skin = id;
      paintSkins();
      await chrome.storage.sync.set({ skin: id });
      // 열린 탭이 스킨을 바꾸면 보임 상태가 달라질 수 있다 (none 은 닫힌 채 시작한다). 다시 읽는다.
      setTimeout(() => { readTab(); }, 250);
    });
    $('#skin-list').appendChild(b);
    return b;
  });
  function paintSkins() {
    skinButtons.forEach((b) => {
      const on = b.dataset.skin === skin;
      b.dataset.on = on ? '1' : '0';
      b.setAttribute('aria-checked', on ? 'true' : 'false');
    });
  }
  paintSkins();
  let defOn = !!stored.enabled;
  setSwitch(ui.swDef, defOn);

  ui.rowDef.addEventListener('click', async () => {
    defOn = !defOn;
    setSwitch(ui.swDef, defOn);
    await chrome.storage.sync.set({ enabled: defOn });
  });

  $('#options').addEventListener('click', () => { chrome.runtime.openOptionsPage(); window.close(); });

  await readTab();
})();
