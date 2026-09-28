// gpt-skin — 설치 직후 한 번 여는 환영 페이지. 업데이트 때는 열지 않는다 (service-worker.js).
// 할 일 하나만 준다: ChatGPT 를 열고 Ctrl+` . 기본값이 꺼짐이라 설치해도 화면이 안 바뀌어서
// "고장" 으로 읽히는 것을 막는다. UX 조사 B3 · docs/plan/2026-09-29-ux-followup.md 묶음 5.
(async function () {
  'use strict';
  const $ = (s) => document.querySelector(s);
  let locale = 'auto';
  try { locale = (await chrome.storage.sync.get({ locale: 'auto' })).locale; } catch (_) { /* 기본 */ }
  GT_SET_LOCALE(locale);
  document.documentElement.lang = GT_LOCALE;
  const M = GT_MOD();

  document.title = GT_T('welcome.title');
  $('#title').textContent = GT_T('welcome.title');
  $('#lead').textContent = GT_T('welcome.lead');
  $('#step').textContent = GT_T('welcome.step');
  $('#open').textContent = GT_T('welcome.open');

  $('#skins-title').textContent = GT_T('welcome.skins');
  const skinField = GT_SCHEMA.find((f) => f.key === 'skin');
  skinField.choices.forEach((id) => {
    const li = document.createElement('li');
    const b = document.createElement('b');
    b.textContent = GT_T('opt.skin.choice.' + id);
    li.appendChild(b);
    li.appendChild(document.createTextNode(' ' + GT_T('welcome.skin.' + id)));
    $('#skins').appendChild(li);
  });

  $('#keys-title').textContent = GT_T('welcome.keys');
  [
    ['Ctrl+`', GT_T('welcome.key.toggle')],
    [M + 'K', GT_T('welcome.key.palette')],
    [M + '⇧S · Ctrl+B', GT_T('welcome.key.sidebar')],
    ['Ctrl+;', GT_T('welcome.key.none')]
  ].forEach(([k, v]) => {
    const tr = document.createElement('tr');
    const a = document.createElement('td');
    const kbd = document.createElement('span');
    kbd.className = 'ds-kbd';
    kbd.textContent = k;
    a.appendChild(kbd);
    const b = document.createElement('td');
    b.textContent = v;
    tr.appendChild(a); tr.appendChild(b);
    $('#keys').appendChild(tr);
  });

  $('#pin').textContent = GT_T('welcome.pin');
  $('#privacy').textContent = GT_T('welcome.privacy');
})();
