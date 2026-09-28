// UX 후속 묶음 5 — 설치 직후 한 번 여는 환영 페이지
// docs/plan/2026-09-29-ux-followup.md
import fs from 'node:fs'; import vm from 'node:vm';

const results = []; const t = (n, ok) => results.push([n, ok]);
const read = (f) => fs.readFileSync(f, 'utf8');
const tick = () => new Promise((r) => setTimeout(r, 0));

// ---------------------------------------------------------------- 서비스 워커: 언제 여나
function worker() {
  let onInstalled = null; const created = [];
  const chrome = {
    runtime: { onMessage: { addListener() {} }, onInstalled: { addListener: (fn) => { onInstalled = fn; } }, lastError: null, reload() {},
               getManifest: () => ({ content_scripts: [] }) },
    commands: { onCommand: { addListener() {} } },
    storage: { session: { get: async () => ({}), set: async () => {}, remove: async () => {} } },
    tabs: { query: async () => [], sendMessage() {}, reload: async () => {}, create: async (o) => { created.push(o); },
            onRemoved: { addListener() {} }, onUpdated: { addListener() {} } },
    scripting: { executeScript: async () => [] },
    action: { setBadgeText: async () => {}, setBadgeBackgroundColor: async () => {}, setTitle: async () => {} }
  };
  const sb = { console, Map, Set, Object, Promise, Array, String, Error, chrome, setTimeout };
  vm.createContext(sb);
  vm.runInContext(read('src/background/service-worker.js'), sb, { filename: 'service-worker.js' });
  return { fire: (d) => onInstalled(d), created };
}
{
  const w = worker();
  w.fire({ reason: 'install' });
  await tick();
  t('설치하면 환영 페이지를 연다', w.created.length === 1 && w.created[0].url === '/src/welcome/welcome.html');
}
{
  const w = worker();
  w.fire({ reason: 'update', previousVersion: '0.15.0' });
  await tick();
  t('업데이트 · ↻ · :reload 로는 열지 않는다', w.created.length === 0);
  w.fire({ reason: 'chrome_update' });
  await tick();
  t('크롬 업데이트로도 열지 않는다', w.created.length === 0);
}

// ---------------------------------------------------------------- 페이지
function page(platform) {
  const nodes = new Map();
  const mk = (tag) => ({ tagName: tag, className: '', textContent: '', children: [], href: '',
    appendChild(c) { this.children.push(c); return c; } });
  const html = read('src/welcome/welcome.html');
  [...html.matchAll(/id="([^"]+)"/g)].forEach((m) => nodes.set('#' + m[1], mk('x')));
  const document = { querySelector: (s) => nodes.get(s) || null, createElement: mk,
    createTextNode: (x) => ({ textContent: x }), documentElement: { lang: 'ko' }, title: '' };
  const chrome = { storage: { sync: { get: async (d) => ({ ...d }) } } };
  const sb = { console, Object, Array, String, JSON, Promise, Error, RegExp, document, chrome, navigator: { platform } };
  sb.window = sb;
  vm.createContext(sb);
  ['src/shared/i18n.js', 'src/shared/defaults.js', 'src/welcome/welcome.js'].forEach((f) => vm.runInContext(read(f), sb, { filename: f }));
  return { $: (s) => nodes.get(s), sb, document };
}
{
  const p = page('MacIntel');
  await tick(); await tick();
  t('제목', p.$('#title').textContent === 'gpt-skin 을 설치했습니다' && p.document.title === 'gpt-skin 을 설치했습니다');
  t('할 일 하나 — ChatGPT 를 열고 Ctrl+`', /ChatGPT 를 열고 Ctrl\+` 를 누르세요/.test(p.$('#step').textContent));
  t('기본값이 꺼짐이라는 것을 먼저 말한다', /처음에는 아무것도 바뀌지 않습니다/.test(p.$('#lead').textContent));
  const skins = p.$('#skins').children;
  t('스킨 설명이 스키마 선택지만큼', skins.length === p.sb.GT_SCHEMA.find((f) => f.key === 'skin').choices.length);
  const keys = p.$('#keys').children.map((tr) => tr.children[0].children[0].textContent);
  t('단축키 넷', keys.length === 4);
  t('맥은 ⌘ 로 적는다', keys[1] === '⌘K' && /⌘⇧S/.test(keys[2]));
  t('개인정보 한 줄', /어디로도 보내지 않습니다/.test(p.$('#privacy').textContent));
}
{
  const p = page('Win32');
  await tick(); await tick();
  const keys = p.$('#keys').children.map((tr) => tr.children[0].children[0].textContent);
  t('윈도우는 Ctrl+ 로 적는다', keys[1] === 'Ctrl+K');
}
{
  const html = read('src/welcome/welcome.html');
  t('ChatGPT 로 가는 링크 하나', /href="https:\/\/chatgpt\.com\/"/.test(html) && /rel="noopener"/.test(html));
  t('문구를 HTML 에 박아 두지 않고 사전에서 채운다', /GT_T\('welcome\.step'\)/.test(read('src/welcome/welcome.js')));
  const i18n = read('src/shared/i18n.js');
  const keys = [...new Set((i18n.match(/'welcome\.[a-z.]+'/g) || []))];
  t('환영 문구가 ko · en 둘 다 있다', keys.every((k) => (i18n.split(k).length - 1) === 2));
  t('이모지를 쓰지 않는다', !/[\u{1F300}-\u{1FAFF}\u{2600}-\u{27BF}]/u.test(html + read('src/welcome/welcome.js')));
}

let bad = 0;
results.forEach(([n, ok]) => { if (!ok) bad++; console.log(`  ${ok ? 'PASS' : 'FAIL'}  ${n}`); });
console.log(bad ? `\n${bad}건 실패` : '\n전부 통과');
process.exit(bad ? 1 : 0);
