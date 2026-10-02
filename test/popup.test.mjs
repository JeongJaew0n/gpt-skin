// 툴바 팝업. 토글이 둘이고, 콘텐츠 스크립트가 없을 수 있다.
import fs from 'node:fs'; import vm from 'node:vm';

const results = []; const t = (n, ok) => results.push([n, ok]);

// ---- 팝업 HTML 의 id 를 그대로 쓰는 최소 DOM ----
function makeDom(html) {
  const ids = [...html.matchAll(/id="([^"]+)"/g)].map((m) => m[1]);
  const nodes = new Map();
  const mk = (id) => ({
    id, dataset: {}, textContent: '', disabled: false, listeners: {}, children: [], attrs: {},
    addEventListener(type, fn) { (this.listeners[type] = this.listeners[type] || []).push(fn); },
    click() { return Promise.all((this.listeners.click || []).map((f) => f())); },
    appendChild(c) { this.children.push(c); return c; },
    setAttribute(k, v) { this.attrs[k] = v; }
  });
  ids.forEach((id) => nodes.set('#' + id, mk(id)));
  return { querySelector: (s) => nodes.get(s) || null, createElement: (tag) => { const n = mk(''); n.tagName = tag; return n; }, _nodes: nodes };
}

// ---- 크롬 API 스텁 ----
function makeChrome({ tab, state, lastError, sync }) {
  const sent = [];
  const store = { ...sync };
  return {
    sent, store,
    api: {
      runtime: {
        get lastError() { return lastError; },
        openOptionsPage() { sent.push({ openOptions: true }); },
        sendMessage(msg, cb) { sent.push({ sw: msg }); if (cb) cb({ ok: true }); }   // 서비스 워커로 (탭별 스킨)
      },
      tabs: {
        query: async () => (tab ? [tab] : []),
        sendMessage(id, msg, cb) { sent.push({ id, msg }); cb(state(msg)); }
      },
      storage: { sync: {
        get: async (d) => { const o = {}; Object.keys(d).forEach((k) => { o[k] = k in store ? store[k] : d[k]; }); return o; },
        set: async (o) => Object.assign(store, o)
      } }
    }
  };
}

const html = fs.readFileSync('src/popup/popup.html', 'utf8');
const src = fs.readFileSync('src/popup/popup.js', 'utf8');
const defaults = fs.readFileSync('src/shared/defaults.js', 'utf8');
const i18n = fs.readFileSync('src/shared/i18n.js', 'utf8');

async function run(opts) {
  const document = makeDom(html);
  const c = makeChrome(opts);
  const sandbox = { console, Object, Array, String, Number, Boolean, JSON, Promise, Error, RegExp, Date,
    document, chrome: c.api, setTimeout, clearTimeout };
  sandbox.window = sandbox; sandbox.globalThis = sandbox;
  sandbox.window.close = () => { c.sent.push({ closed: true }); };
  vm.createContext(sandbox);
  vm.runInContext(i18n, sandbox, { filename: 'i18n.js' });
  vm.runInContext(defaults, sandbox, { filename: 'defaults.js' });
  vm.runInContext(src, sandbox, { filename: 'popup.js' });
  await new Promise((r) => setTimeout(r, 0));
  await new Promise((r) => setTimeout(r, 0));
  await new Promise((r) => setTimeout(r, 0));
  return { $: (s) => document.querySelector(s), ...c };
}

const CHAT = { id: 7, url: 'https://chatgpt.com/c/abc' };

// --- 스킨 고르기 ---
{
  const p = await run({ tab: CHAT, sync: { skin: 'sheet' }, state: () => ({ visible: false, degraded: false }) });
  const btns = p.$('#skin-list').children;
  t('스킨 버튼이 스키마 선택지만큼', btns.map((b) => b.dataset.skin).join() === 'terminal,sheet,none');
  t('이름은 괄호 설명을 뺀 짧은 이름', btns.map((b) => b.textContent).join() === '터미널,시트,노 스킨');
  t('긴 이름은 툴팁에', btns[1].title === '시트 (스프레드시트)');
  t('저장된 스킨이 켜져 있다', btns[1].dataset.on === '1' && btns[1].attrs['aria-checked'] === 'true' && btns[0].dataset.on === '0');
  await btns[2].click();
  t('누르면 skin 에 저장한다 (열린 탭이 따라간다)', p.store.skin === 'none');
  t('누른 버튼이 켜진다', btns[2].dataset.on === '1' && btns[1].dataset.on === '0');
  t('토글 문구가 터미널이 아니라 스킨이다', /스킨/.test(p.$('#tab-label').textContent) && /스킨/.test(p.$('#default-label').textContent));
}
{
  const p = await run({ tab: CHAT, sync: { skin: '없는스킨' }, state: () => ({ visible: false, degraded: false }) });
  t('모르는 스킨이 저장돼 있으면 기본 스킨을 켠다', p.$('#skin-list').children[0].dataset.on === '1');
}

// --- ChatGPT 탭, 터미널 꺼짐 ---
{
  let visible = false;
  const p = await run({ tab: CHAT, sync: {}, state: (m) => {
    if (m.kind === 'state') return { visible, degraded: false };
    if (m.kind === 'toggle') { visible = !visible; return { visible }; }
    return null;
  } });
  t('현재 상태를 물어본다', p.sent.some((x) => x.msg && x.msg.kind === 'state'));
  t('꺼져 있으면 토글이 off', p.$('#sw-terminal').dataset.on === '0');
  t('쓸 수 있으면 잠그지 않는다', p.$('#row-terminal').disabled === false);
  t('빌드를 보여준다', /\d{4}-\d{2}-\d{2}/.test(p.$('#build').textContent));

  p.$('#row-terminal').click();
  await new Promise((r) => setTimeout(r, 0));
  t('누르면 토글을 보낸다', p.sent.some((x) => x.msg && x.msg.kind === 'toggle'));
  t('켜지면 토글도 on', p.$('#sw-terminal').dataset.on === '1');
  t('상단 점도 같이 켜진다', p.$('#dot').dataset.on === '1');
}

// --- ChatGPT 가 아닌 탭 ---
{
  const p = await run({ tab: { id: 1, url: 'https://example.com/' }, sync: {}, state: () => null });
  t('다른 사이트면 잠근다', p.$('#row-terminal').disabled === true);
  t('왜 못 쓰는지 적는다', /ChatGPT 탭/.test(p.$('#terminal-help').textContent));
  t('말 걸지 않는다', !p.sent.some((x) => x.msg));
}

// --- 콘텐츠 스크립트가 아직 없는 탭 (확장 리로드 후) ---
{
  const p = await run({ tab: CHAT, sync: {}, lastError: { message: 'no receiver' }, state: () => null });
  t('응답이 없으면 잠근다', p.$('#row-terminal').disabled === true);
  t('새로고침하라고 알려준다', /새로고침/.test(p.$('#terminal-help').textContent));
}

// --- 전제가 깨져 복귀한 탭 ---
{
  const p = await run({ tab: CHAT, sync: {}, state: () => ({ visible: false, degraded: true }) });
  t('복귀 상태면 잠근다', p.$('#row-terminal').disabled === true);
  t('점을 빨갛게 표시', p.$('#dot').dataset.broken === '1');
  t(':health 를 안내한다', /:health/.test(p.$('#terminal-help').textContent));
}

// --- 기본 동작 토글은 storage 를 쓴다 ---
{
  const p = await run({ tab: CHAT, sync: {}, state: () => ({ visible: false, degraded: false }) });
  t('기본값은 꺼짐', p.$('#sw-default').dataset.on === '0');

  p.$('#row-default').click();
  await new Promise((r) => setTimeout(r, 0));
  t('누르면 켜진다', p.$('#sw-default').dataset.on === '1');
  t('sync 에 저장한다', p.store.enabled === true);

  p.$('#row-default').click();
  await new Promise((r) => setTimeout(r, 0));
  t('다시 누르면 꺼진다', p.store.enabled === false);
}
{
  const p = await run({ tab: CHAT, sync: { enabled: true }, state: () => ({ visible: true, degraded: false }) });
  t('저장된 값을 읽어 온다', p.$('#sw-default').dataset.on === '1');
  t('탭 토글과 기본 토글은 별개다', p.$('#sw-terminal').dataset.on === '1');
}

// --- 설정 전체 열기 ---
{
  const p = await run({ tab: CHAT, sync: {}, state: () => ({ visible: false, degraded: false }) });
  p.$('#options').click();
  t('옵션 화면을 연다', p.sent.some((x) => x.openOptions));
  t('열고 나서 팝업을 닫는다', p.sent.some((x) => x.closed));
}

// --- 정적: 배선 ---
{
  const mf = JSON.parse(fs.readFileSync('manifest.json', 'utf8'));
  const sw = fs.readFileSync('src/background/service-worker.js', 'utf8');
  const idx = fs.readFileSync('src/content/index.js', 'utf8');

  t('매니페스트가 팝업을 건다', mf.action.default_popup === 'src/popup/popup.html');
  t('팝업 파일이 실제로 있다',
    ['popup.html', 'popup.css', 'popup.js'].every((f) => fs.existsSync('src/popup/' + f)));
  t('팝업이 스키마를 공유한다', /<script src="\.\.\/shared\/defaults\.js">/.test(html));

  // 주석에도 onClicked 라는 낱말이 있다. 등록 코드만 본다.
  t('default_popup 이 있으면 onClicked 는 안 온다 — 핸들러를 지웠다',
    !/chrome\.action\.onClicked\.addListener/.test(sw));
  t('왜 지웠는지 적어뒀다', /default_popup 이 걸리면/.test(sw));

  t('lastError 를 확인한다', /chrome\.runtime\.lastError/.test(src));
  t('부팅 때 실제 표시 상태를 알린다',
    /GT\.sendToSW\(\{ kind: 'visible', visible: GT\.skin\.visible\(\) \}\);\s*\n\s*GT\.health\.report\(\)/.test(idx));

  t('기본으로 터미널로 시작하지 않는다', /key: 'enabled'[\s\S]{0,120}def: false/.test(defaults));
}

// --- 가독성: 작은 글씨가 대부분이라 대비를 지킨다 ---
{
  // 터미널 팔레트를 그대로 쓰다가 도움말이 2.3:1 까지 떨어져 안 읽혔다.
  // 다시 어두워지지 않게 값 자체를 검사한다. 0.12.0 부터 색은 디자인 시스템(src/shared/ds.css)에 있고,
  // 라이트 · 다크 두 벌이다. 둘 다 검사한다.
  const ds = fs.readFileSync('src/shared/ds.css', 'utf8');
  const css = fs.readFileSync('src/popup/popup.css', 'utf8');
  const iDark = ds.indexOf('@media (prefers-color-scheme: dark)');
  const lightPart = ds.slice(0, iDark), darkPart = ds.slice(iDark);
  const token = (part, name) => (new RegExp('--ds-' + name + ': (#[0-9A-Fa-f]{6})').exec(part) || [])[1];

  const lin = (c) => { c /= 255; return c <= 0.04045 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4); };
  const lum = (h) => {
    const n = parseInt(h.slice(1), 16);
    return 0.2126 * lin((n >> 16) & 255) + 0.7152 * lin((n >> 8) & 255) + 0.0722 * lin(n & 255);
  };
  const ratio = (a, b) => {
    const x = lum(a), y = lum(b);
    return (Math.max(x, y) + 0.05) / (Math.min(x, y) + 0.05);
  };

  const FLOOR = 4.5;   // WCAG 본문 기준
  const UI = 3;        // WCAG 1.4.11 — 입력칸 테두리 · 스위치
  t('다크 토큰 구역이 있다', iDark > 0);
  for (const [name, part] of [['라이트', lightPart], ['다크', darkPart]]) {
    const T = {};
    for (const k of ['bg', 'surface', 'sunken', 'text', 'text-2', 'text-3', 'line-strong', 'accent', 'on-accent', 'danger']) T[k] = token(part, k);
    t(`${name} 팔레트를 다 읽었다`, Object.values(T).every(Boolean));
    if (!Object.values(T).every(Boolean)) continue;
    for (const bg of ['bg', 'surface']) {
      t(`${name} 라벨이 ${bg} 에서 ${FLOOR}:1 이상`, ratio(T.text, T[bg]) >= FLOOR);
      t(`${name} 도움말이 ${bg} 에서 ${FLOOR}:1 이상`, ratio(T['text-2'], T[bg]) >= FLOOR);
      t(`${name} 흐린 글자도 ${bg} 에서 ${FLOOR}:1 이상`, ratio(T['text-3'], T[bg]) >= FLOOR);
      t(`${name} 강조색이 ${bg} 에서 ${FLOOR}:1 이상`, ratio(T.accent, T[bg]) >= FLOOR);
      t(`${name} 위험색이 ${bg} 에서 ${FLOOR}:1 이상`, ratio(T.danger, T[bg]) >= FLOOR);
      t(`${name} 입력칸 테두리가 ${bg} 에서 ${UI}:1 이상`, ratio(T['line-strong'], T[bg]) >= UI);
    }
    t(`${name} 세그먼트 바닥에서도 흐린 글자 ${FLOOR}:1 이상`, ratio(T['text-3'], T.sunken) >= FLOOR);
    t(`${name} 강조색 위 글자 ${FLOOR}:1 이상`, ratio(T['on-accent'], T.accent) >= FLOOR);
    t(`${name} 라벨 > 도움말 > 흐린 글자 순으로 또렷하다`,
      ratio(T.text, T.bg) > ratio(T['text-2'], T.bg) && ratio(T['text-2'], T.bg) > ratio(T['text-3'], T.bg));
  }

  t('도움말을 가장 흐린 색으로 두지 않는다', /\.help \{ color: var\(--ds-text-2\)/.test(css));
  t('잠긴 줄도 읽히게 둔다', /\.row:disabled \.label \{ color: var\(--ds-text-2\)/.test(css));
  t('왜 팔레트를 바꿨는지 적어뒀다', /2\.3:1 까지 떨어져/.test(css));
  t('팝업이 디자인 시스템을 먼저 불러온다',
    html.indexOf('../shared/ds.css') > 0 && html.indexOf('../shared/ds.css') < html.indexOf('popup.css'));
  t('팝업 CSS 에 색을 직접 적지 않는다 (토큰만)', !/#[0-9a-fA-F]{3,8}\b|rgba?\(/.test(css.replace(/\/\*[\s\S]*?\*\//g, '')));
}

// --- 탭별로 분할 적용 (skin.perTab, 0.28.0) ---
{
  const p = await run({ tab: CHAT, sync: { skin: 'terminal', 'skin.perTab': true }, state: () => ({ visible: true, degraded: false, skin: 'sheet', tabSkin: 'sheet' }) });
  const btns = p.$('#skin-list').children;
  t('켜져 있으면 이 탭의 스킨이 켜져 보인다 (기본 스킨이 아니라)', btns[1].dataset.on === '1' && btns[0].dataset.on === '0');
  t('이 탭만 바뀐다고 밝힌다', p.$('#skin-note').hidden === false && /이 탭만/.test(p.$('#skin-note').textContent));
  await btns[2].click();
  const sw = p.sent.filter((x) => x.sw).map((x) => x.sw);
  t('누르면 서비스 워커에 이 탭 id 로 저장을 맡긴다', sw.length === 1 && sw[0].kind === 'tabSkin:set' && sw[0].tabId === 7 && sw[0].skin === 'none');
  t('기본 스킨(설정의 skin)은 그대로', p.store.skin === 'terminal');
}
{
  const p = await run({ tab: { id: 3, url: 'https://example.com/' }, sync: { skin: 'sheet', 'skin.perTab': true }, state: () => null });
  const btns = p.$('#skin-list').children;
  t('ChatGPT 탭이 아니면 기본 스킨을 보여 주고 그렇다고 밝힌다', btns[1].dataset.on === '1' && /기본 스킨/.test(p.$('#skin-note').textContent));
  await btns[0].click();
  t('그때 누르면 기본 스킨을 바꾼다', p.store.skin === 'terminal' && !p.sent.some((x) => x.sw));
}
{
  const p = await run({ tab: CHAT, sync: { skin: 'sheet' }, state: () => ({ visible: false, degraded: false, skin: 'none' }) });
  t('꺼져 있으면 안내가 없고 기본 스킨을 보여 준다 (예전 그대로)', p.$('#skin-note').hidden === true && p.$('#skin-list').children[1].dataset.on === '1');
}

let bad = 0;
results.forEach(([n, ok]) => { if (!ok) bad++; console.log(`  ${ok ? 'PASS' : 'FAIL'}  ${n}`); });
console.log(bad ? `\n${bad}건 실패` : '\n전부 통과');
process.exit(bad ? 1 : 0);
