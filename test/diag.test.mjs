// UX 후속 묶음 4 — 진단 복사 · 터미널의 새 내용 알림 (정적)
// docs/plan/2026-09-29-ux-followup.md
import fs from 'node:fs'; import vm from 'node:vm';

const results = []; const t = (n, ok) => results.push([n, ok]);
const read = (f) => fs.readFileSync(f, 'utf8');

// ---------------------------------------------------------------- 진단 글
// 0.19.0 부터 진단 글은 버그 보고서(src/content/bugs.js)와 같다 — 팝업 '진단 복사' 와 :bug 가 함께 쓴다.
const idx = read('src/content/index.js');
{
  const sb = {
    navigator: { userAgent: 'Mozilla/5.0 (Macintosh) Chrome/140.0.1 Safari/537.36', platform: 'MacIntel' },
    location: { pathname: '/c/6aba1bc9-ccc4-83ea-ac72-06e31b58fd14' },
    GT_VERSION: '9.9.9', GT_BUILD: '2026-09-29 12:00', GT_LOCALE: 'ko', Object, JSON, Date, String, Array,
    GT: {
      log() {},
      health: { CHECKS: { tap: { ok: true }, composer: { ok: false } }, reasons: ['드리프트 12%'], degraded: false },
      skin: { current: { id: 'sheet' }, visible: () => true },
      config: { get: () => 'warn' },
      store: { state: { conversationTitle: '비밀 대화', messages: [{ text: '비밀 본문' }] } }
    }
  };
  vm.createContext(sb);
  vm.runInContext(read('src/content/bugs.js'), sb, { filename: 'bugs.js' });
  const d = sb.GT.bugs.report();
  t('버전 · 빌드', /gpt-skin 9\.9\.9 · build 2026-09-29 12:00/.test(d));
  t('크롬 버전만 (전체 UA 가 아니다)', /Chrome\/140\.0\.1/.test(d) && !/Macintosh\)/.test(d));
  t('스킨 · 보임 · 정책', /skin sheet · visible yes · onBreak warn · degraded no/.test(d));
  t('점검 결과', /tap:ok composer:FAIL/.test(d));
  t('경고 목록', /warnings 1\n  - 드리프트 12%/.test(d));
  t('대화 내용이 새지 않는다', !/비밀/.test(d));
  t('대화 id 가 새지 않는다 (경로 모양만)', /page \/c\/…/.test(d) && !/6aba1bc9/.test(d));
  t('보고서가 대화 제목 · 본문을 읽지 않는다', !/conversationTitle|messages|\.text\b/.test(read('src/content/bugs.js')));
}
t('진단은 버그 보고서와 같다', /const diagText = \(\) => GT\.bugs\.report\(\);/.test(idx));
t('팝업 메시지 diag 에 답한다', /msg\.kind === 'diag'\) reply\(\{ text: diagText\(\) \}\)/.test(idx));

// ---------------------------------------------------------------- 팝업 버튼
function popupRun(reply) {
  const html = read('src/popup/popup.html');
  const ids = [...html.matchAll(/id="([^"]+)"/g)].map((x) => x[1]);
  const nodes = new Map();
  const mk = (id) => ({ id, dataset: {}, textContent: '', title: '', disabled: false, listeners: {}, children: [], attrs: {},
    addEventListener(tp, fn) { (this.listeners[tp] = this.listeners[tp] || []).push(fn); },
    click() { return Promise.all((this.listeners.click || []).map((f) => f())); },
    appendChild(c) { this.children.push(c); return c; }, setAttribute(k, v) { this.attrs[k] = v; } });
  ids.forEach((id) => nodes.set('#' + id, mk(id)));
  const copied = [];
  const chrome = {
    runtime: { lastError: null, openOptionsPage() {}, getManifest: () => ({ version: '9.9.9' }) },
    tabs: { query: async () => [{ id: 7, url: 'https://chatgpt.com/c/x' }], sendMessage: (id, msg, cb) => cb(reply(msg)), create() {} },
    storage: { sync: { get: async (d) => ({ ...d }), set: async () => {} } }
  };
  const sb = { console, Object, Array, String, Number, Boolean, JSON, Promise, Error, RegExp, Date, chrome, setTimeout, clearTimeout,
    document: { querySelector: (s) => nodes.get(s) || null, createElement: () => mk('') },
    navigator: { platform: 'MacIntel', clipboard: { writeText: async (x) => { copied.push(x); } } } };
  sb.window = sb; sb.window.close = () => {};
  vm.createContext(sb);
  ['src/shared/i18n.js', 'src/shared/defaults.js', 'src/popup/popup.js'].forEach((f) => vm.runInContext(read(f), sb, { filename: f }));
  return { $: (s) => nodes.get(s), copied };
}
const settle = () => new Promise((r) => setTimeout(r, 0));
{
  const p = popupRun((msg) => (msg.kind === 'diag' ? { text: 'gpt-skin 진단 글' } : { visible: true, degraded: false }));
  await settle(); await settle(); await settle();
  t('팝업에 진단 복사 버튼', p.$('#diag').textContent === '진단 복사');
  await p.$('#diag').click();
  t('누르면 진단 글을 클립보드에', p.copied[0] === 'gpt-skin 진단 글');
  t('복사했다고 알린다', p.$('#diag').textContent === '복사했습니다');
}
{
  const p = popupRun((msg) => (msg.kind === 'diag' ? null : { visible: true, degraded: false }));
  await settle(); await settle(); await settle();
  await p.$('#diag').click();
  t('탭이 답하지 않아도 버전만이라도 복사한다', /gpt-skin 9\.9\.9/.test(p.copied[0] || '') && /붙어 있지 않습니다/.test(p.copied[0]));
}

// ---------------------------------------------------------------- 터미널 새 내용 알림 (정적)
{
  const term = read('src/content/skins/terminal.js');
  t('터미널 상태줄에 새 내용 버튼', /ui\.below = el\('button', 'gt-below', GT_T\('below\.new'\)\)/.test(term));
  t('바닥에 있지 않은데 바뀌면 띄운다', /if \(changed && stickBottom\) ui\.scroll\.scrollTop = ui\.scroll\.scrollHeight;\s*\n\s*else if \(changed && ui\.below\) ui\.below\.hidden = false;/.test(term));
  t('바닥까지 내리면 숨긴다', /ui\.scroll\.addEventListener\('scroll'/.test(term));
}

let bad = 0;
results.forEach(([n, ok]) => { if (!ok) bad++; console.log(`  ${ok ? 'PASS' : 'FAIL'}  ${n}`); });
console.log(bad ? `\n${bad}건 실패` : '\n전부 통과');
process.exit(bad ? 1 : 0);
