// 오류 기록과 버그 보고서 (:bug) · 전송 실패 사유 나누기 (0.19.0)
//
// 테스터가 "'원본 컴포저를 찾지 못했습니다' 가 뜬다" 고만 알려 줬는데, 그 문구는 서로 다른 세 실패를
// 하나로 묶고 있었고 상세 기록도 없어 원인을 가릴 수 없었다 (2026-10-01).
// 이제 오류는 화면에 늘어놓지 않고 GT.bugs 에 쌓고, :bug 로 보고서를 복사해 개발자에게 보낸다.
import fs from 'node:fs'; import vm from 'node:vm';

const results = []; const t = (n, ok) => results.push([n, ok]);
const read = (f) => fs.readFileSync(f, 'utf8');
const tick = () => new Promise((r) => setTimeout(r, 0));

function loadBugs(extra = {}) {
  const win = new EventTarget();
  const sb = { console, Object, Array, String, Number, JSON, Date, Math, EventTarget, Event,
    window: win, location: { pathname: '/c/6aba1bc9-ccc4-83ea-ac72-06e31b58fd14' },
    chrome: { runtime: { id: 'abcdefextid' } },
    navigator: { userAgent: 'x Chrome/153.0.1 y', platform: 'MacIntel' },
    GT_VERSION: '0.19.0', GT_BUILD: '2026-10-01 18:00', GT_LOCALE: 'ko',
    GT: { log() {}, health: { CHECKS: { composer: { ok: true } }, reasons: [], degraded: false },
      skin: { current: { id: 'sheet' }, visible: () => true }, config: { get: () => 'warn' }, ...extra } };
  vm.createContext(sb);
  vm.runInContext(read('src/content/bugs.js'), sb, { filename: 'bugs.js' });
  return { B: sb.GT.bugs, win, sb };
}

// ---------------------------------------------------------------- 기록
{
  const { B } = loadBugs();
  t('처음엔 비어 있다', B.count() === 0 && B.list().length === 0);
  B.record('send-failed', 'composer-not-found', { found: 'none' });
  t('기록한다', B.count() === 1 && B.list()[0].code === 'send-failed' && B.list()[0].message === 'composer-not-found');
  t('어느 화면인지 경로 모양만 남긴다', B.list()[0].where === '/c/…');
  B.record('send-failed', 'composer-not-found');
  B.record('send-failed', 'composer-not-found');
  t('같은 오류가 이어지면 한 줄에 센다', B.list().length === 1 && B.list()[0].count === 3 && B.count() === 3);
  B.record('not-sent', 'x');
  t('다른 오류는 새 줄', B.list().length === 2);
  for (let i = 0; i < 80; i++) B.record('e' + i, 'm');
  t('최근 50건만 갖는다', B.list().length === 50 && B.list().at(-1).code === 'e79');
  t('clear 는 지운 줄 수를 돌려준다', B.clear() === 50 && B.count() === 0);
  t('경로 가리기', B.maskPath('/g/g-abc/c/123') === '/g/…/c/…' && B.maskPath('/uc/9f?x=1') === '/uc/…' && B.maskPath('/') === '/');
}

// ---------------------------------------------------------------- 놓친 예외
{
  const { B, win } = loadBugs();
  const err = (filename, message, stack) => { const e = new Event('error'); Object.assign(e, { filename, message, lineno: 3, error: { message, stack } }); win.dispatchEvent(e); };
  err('https://chatgpt.com/cdn/assets/app.js', '원본 페이지 오류', 'at f (https://chatgpt.com/cdn/assets/app.js:1:1)');
  t('원본 페이지의 오류는 담지 않는다', B.count() === 0);
  err('chrome-extension://abcdefextid/src/content/skins/sheet.js', 'boom', 'TypeError: boom\n    at paintSel (chrome-extension://abcdefextid/src/content/skins/sheet.js:646:98)');
  t('우리 파일의 오류는 담는다', B.count() === 1 && B.list()[0].code === 'uncaught' && B.list()[0].message === 'boom');
  t('스택에서 확장 id 를 지운다', /src\/content\/skins\/sheet\.js:646/.test(B.list()[0].extra.stack) && !/abcdefextid/.test(B.list()[0].extra.stack));
  const rej = (reason) => { const e = new Event('unhandledrejection'); e.reason = reason; win.dispatchEvent(e); };
  rej({ message: 'x', stack: 'Error: x\n at y (https://chatgpt.com/a.js:1:1)' });
  t('원본 페이지의 거부된 프로미스는 담지 않는다', B.count() === 1);
  rej({ message: 'nope', stack: 'Error: nope\n at z (chrome-extension://abcdefextid/src/content/oai.js:9:9)' });
  t('우리 프로미스 거부는 담는다', B.count() === 2 && B.list()[1].code === 'unhandled-rejection');
  B.stop();
  err('chrome-extension://abcdefextid/src/content/index.js', 'after stop', 'at a (chrome-extension://abcdefextid/src/content/index.js:1:1)');
  t('stop 뒤에는 듣지 않는다 (교대할 때 옛 인스턴스가 떼어 낸다)', B.count() === 2);
}

// ---------------------------------------------------------------- 보고서
{
  const probe = { found: 'none', counts: [0, 0, 0, 0, 0], contenteditable: 0, textarea: 0, sendButton: false, stopButton: false, focus: true, visibility: 'visible' };
  const { B } = loadBugs({ compose: { probe: () => probe },
    store: { state: { conversationTitle: '비밀 대화', messages: [{ text: '비밀 본문' }] } } });
  B.record('send-failed', 'composer-not-found', probe);
  const r = B.report();
  t('머리: 버전 · 빌드 · 크롬', /gpt-skin 0\.19\.0 · build 2026-10-01 18:00/.test(r) && /Chrome\/153\.0\.1 · MacIntel/.test(r));
  t('어느 화면인지 (모양만)', /page \/c\/…/.test(r) && !/6aba1bc9/.test(r));
  t('입력창 상태를 담는다', /composer \{"found":"none"/.test(r));
  t('오류 줄 — 사유와 함께', /errors 1\n  - \d{4}-\d\d-\d\d \d\d:\d\d:\d\d send-failed @ \/c\/…: composer-not-found/.test(r));
  t('오류의 덧붙인 정보', /"contenteditable":0/.test(r));
  t('대화 내용이 새지 않는다', !/비밀/.test(r));
}

// ---------------------------------------------------------------- :bug 명령
async function runBug(copyOk) {
  const shown = []; const copied = [];
  const sb = { console, Object, Array, Set, Map, String, Number, Boolean, JSON, Math, Promise, Error, RegExp, Date,
    location: { pathname: '/c/x' },
    document: { createElement: (tg) => ({ tagName: tg, style: {}, appendChild() {}, addEventListener() {}, textContent: '' }) } };
  sb.window = sb; sb.globalThis = sb;
  sb.GT = {
    theme: { names: () => [] }, config: { keys: () => [], get: () => 13, DEFAULTS: {} }, chats: { projects: () => [] },
    store: { state: { messages: [], superseded: 0, orphanDeltas: 0 } },
    skin: { hide() {}, current: { hiddenCommands: [], system: (l, x, node) => shown.push([l, x, node]), applyConfig() {}, render() {} } },
    sidebar: { chats: () => [], isOpen: () => false }, convops: {}, conversation: { idFromPath: () => 'x' }, picker: {}, navigate: {},
    health: { CHECKS: {}, reasons: [] }, palette: {}, oai: {}, compose: {},
    clipboard: { copy: async (x) => { copied.push(x); return copyOk; } },
    bugs: { report: () => 'REPORT-TEXT', count: () => 3, clear: () => 7 }
  };
  vm.createContext(sb);
  vm.runInContext(read('src/shared/i18n.js'), sb, { filename: 'i18n.js' });
  vm.runInContext(read('src/content/commands.js'), sb, { filename: 'commands.js' });
  return { C: sb.GT.commands, shown, copied };
}
{
  const { C, shown, copied } = await runBug(true);
  await C.run(':bug');
  t(':bug 가 보고서를 복사한다', copied[0] === 'REPORT-TEXT');
  t('복사했다고 알리고 오류 수를 말한다', shown.some(([l, x]) => l === 'info' && /보고서를 복사했습니다 \(오류 3건\)/.test(x)));
  t('보고서 본문은 화면에 늘어놓지 않는다', !shown.some(([, , node]) => node));
  await C.run(':bug clear');
  t(':bug clear 는 기록을 비운다', shown.some(([, x]) => /오류 기록 7건을 비웠습니다/.test(x)));
  t('자동완성이 clear 를 준다', C.complete(':bug ').candidates.includes('clear'));
}
{
  const { C, shown } = await runBug(false);
  await C.run(':bug');
  t('복사가 막히면 보고서를 보여 주고 직접 고르게 한다',
    shown.some(([l, x]) => l === 'warn' && /복사하지 못했습니다/.test(x)) && shown.some(([, , node]) => node && node.textContent === 'REPORT-TEXT'));
}

// ---------------------------------------------------------------- 전송 실패 (prompt.js 를 실제로 돌린다)
{
  const calls = { system: [], bugs: [], soft: [], userSent: 0 };
  const input = new EventTarget();
  Object.assign(input, { value: '', selectionStart: 0, selectionEnd: 0, style: {},
    setSelectionRange(a, b) { this.selectionStart = a; this.selectionEnd = b; }, focus() {} });
  const sb = { console, Object, Array, String, JSON, Promise, setTimeout, AbortController, Event, window: new EventTarget() };
  vm.createContext(sb);
  vm.runInContext(read('src/shared/i18n.js'), sb, { filename: 'i18n.js' });
  sb.GT = {
    skin: { visible: () => true, current: { setSuggest() {}, setMode() {}, syncFocus() {}, focus() {}, system: (l, x) => calls.system.push([l, x]) } },
    store: { isStreaming: () => false, userHistory: () => [], userSent: () => { calls.userSent++; } },
    commands: { parse: () => false, complete: () => ({ candidates: [] }), applyCompletion: () => null, run: async () => false, openPalette() {} },
    compose: { send: async () => ({ ok: false, reason: 'composer-not-found' }), probe: () => ({ found: 'none' }), stop: () => false, stopButton: () => null },
    bugs: { record: (c, m, x) => calls.bugs.push([c, m, x]) },
    health: { soft: (x) => calls.soft.push(x) },
    sidebar: { selecting: false, isOpen: () => false, filtering: false, element: null, toggle() {} },
    palette: { isOpen: () => false }
  };
  vm.runInContext(read('src/content/shell/prompt.js'), sb, { filename: 'prompt.js' });
  sb.GT.prompt.attach({ el: input, autosize() {} }, { toggle() {}, capturesTyping: true });
  input.value = '보낼 글';
  const e = new Event('keydown', { cancelable: true });
  Object.assign(e, { key: 'Enter', isComposing: false, keyCode: 13, shiftKey: false, ctrlKey: false, metaKey: false, altKey: false });
  input.dispatchEvent(e);
  await tick(); await tick(); await tick();
  t('실패 사유를 버그 기록에 남긴다', calls.bugs.length === 1 && calls.bugs[0][0] === 'send-failed' && calls.bugs[0][1] === 'composer-not-found');
  t('입력창 상태도 같이 남긴다', calls.bugs[0][2] && calls.bugs[0][2].found === 'none');
  t('쓴 글을 입력줄에 되돌려 둔다', input.value === '보낼 글');
  t('사용자에게는 짧게 — 안 보내졌다 · :bug', calls.system.some(([l, x]) => l === 'warn' && /보내지 못했습니다/.test(x) && /:bug/.test(x)));
  t('기술적인 사유는 화면에 내지 않는다', !calls.system.some(([, x]) => /composer-not-found/.test(x)) && calls.soft.length === 0);
  t('실패하면 우리 화면에 올리지 않는다', calls.userSent === 0);
}

// ---------------------------------------------------------------- 실패 사유 나누기 (compose.js)
{
  const mk = (dom) => {
    const sb = { console, Object, Array, String, JSON, Promise, Error, RegExp,
      Event: function Event(type) { this.type = type; },
      requestAnimationFrame: (f) => setTimeout(f, 0), setTimeout,
      window: { getSelection: () => ({ removeAllRanges() {}, addRange() {} }) },
      document: { querySelector: (s) => (dom.q[s] || null), querySelectorAll: (s) => (dom.q[s] ? [dom.q[s]] : []),
        createRange: () => ({ selectNodeContents() {} }), execCommand: () => dom.exec, hasFocus: () => true, visibilityState: 'visible' } };
    sb.GT = { skin: { current: { focus() {} } }, bugs: { record() {} } };
    vm.createContext(sb);
    vm.runInContext(read('src/content/compose.js'), sb, { filename: 'compose.js' });
    return sb.GT.compose;
  };
  t('입력창이 없으면 composer-not-found', mk({ q: {} }).tryInject('x') === 'composer-not-found');
  const pm = (text) => ({ tagName: 'DIV', textContent: text, focus() {}, dispatchEvent() {} });
  t('브라우저가 거절하면 inject-rejected', mk({ q: { '#prompt-textarea': pm('') }, exec: false }).tryInject('x') === 'inject-rejected');
  t('넣었는데 글이 다르면 inject-mismatch', mk({ q: { '#prompt-textarea': pm('엉뚱') }, exec: true }).tryInject('보낼 글') === 'inject-mismatch');
  t('들어갔으면 성공 (줄바꿈은 문단이 되어도 같다고 본다)', mk({ q: { '#prompt-textarea': pm('첫줄둘째 줄') }, exec: true }).tryInject('첫줄\n둘째 줄') === '');
  const C = mk({ q: { '#prompt-textarea': pm('') }, exec: false });
  const r = await C.send('x');
  t('send 가 사유를 돌려준다', r.ok === false && r.reason === 'inject-rejected');
  t('ProseMirror 라이브러리 클래스로도 찾는다 (예비)', mk({ q: { '.ProseMirror[contenteditable="true"]': pm('x') }, exec: true }).tryInject('x') === '');
  const p = mk({ q: { 'textarea[name="prompt"]': { tagName: 'TEXTAREA' } } }).probe();
  t('probe 는 어느 모양으로 찾았는지와 개수만', p.found === 'textarea[name="prompt"]' && Array.isArray(p.counts) && p.counts.length === 5 && p.focus === true);
  t('probe 에 글 내용이 없다', !/value|textContent/.test(JSON.stringify(p)));
}

// ---------------------------------------------------------------- 배선 (정적)
{
  const mf = JSON.parse(read('manifest.json'));
  const js = mf.content_scripts.find((c) => c.world !== 'MAIN').js;
  t('매니페스트: protocol 다음 · 다른 모듈보다 먼저', js.indexOf('src/content/bugs.js') === js.indexOf('src/content/protocol.js') + 1);
  t('하네스도 싣는다', read('tools/harness/index.html').includes('src/content/bugs.js'));
  t('교대할 때 듣기를 멈춘다', /disposers\.push\(\(\) => GT\.bugs\.stop\(\)\)/.test(read('src/content/index.js')));
  const prm = read('src/content/shell/prompt.js');
  t('옛 문구가 사라졌다', !/원본 컴포저를 찾지 못했습니다/.test(prm));
  const i18n = read('src/shared/i18n.js');
  ['compose.failed', 'cmd.bug.desc', 'cmd.bug.copied', 'cmd.bug.copyFailed', 'cmd.bug.cleared'].forEach((k) => {
    t(`문구 ${k} 가 ko · en 둘 다`, (i18n.match(new RegExp(`'${k.replace('.', '\\.')}'`, 'g')) || []).length === 2);
  });
}

// ---------------------------------------------------------------- 글자 끊김 감지 (0.20.0)
// docs/issue/2026-10-01-truncation-detect.md
function loadHealth() {
  const sb = { console, Object, Array, String, Number, JSON, Math, RegExp, Date };
  sb.GT = { log() {}, sendToSW() {}, config: { get: () => 8 }, bugs: { record: (...a) => (sb.__rec = (sb.__rec || []).concat([a])) }, skin: { current: { system() {} } } };
  vm.createContext(sb);
  vm.runInContext(read('src/content/markdown.js'), sb, { filename: 'markdown.js' });
  vm.runInContext(read('src/content/health.js'), sb, { filename: 'health.js' });
  return sb;
}
{
  const sb = loadHealth();
  const H = sb.GT.health;
  const long = '가'.repeat(200);
  t('같으면 끊김이 아니다', H.truncation(long, long) === null);
  t('원본이 조금(20자 미만) 길면 끊김이 아니다 (마커 표기 차이)', H.truncation(long, long + '나'.repeat(19)) === null);
  const tr = H.truncation(long, long + '나'.repeat(40));
  t('원본이 20자 이상 길면 끊김', tr && tr.shown === 200 && tr.original === 240 && tr.diff === 40);
  t('공백 · 줄바꿈 차이는 세지 않는다', H.truncation('가 나\n\n다' + long, '가나다' + long) === null);
  t('화면이 더 길면 끊김이 아니다', H.truncation(long + long, long) === null);
  t('원본이 비었으면 판단하지 않는다', H.truncation(long, '') === null && H.truncation(long, null) === null);
  t('인용 마커는 걷어내고 잰다', H.truncation(long, long + 'citeturn0search1'.repeat(3)) === null);

  H.reconcile('가'.repeat(100), '가'.repeat(300));
  t('드리프트도 보고서에 남긴다 (글자 수만)', (sb.__rec || []).some(([c, , x]) => c === 'drift' && x.stream === 100 && x.original === 300));
}

// checkTruncation 을 index.js 에서 꺼내 돌린다 (테스트용으로 다시 쓰지 않는다)
{
  const idx = read('src/content/index.js');
  const m = /  const TRUNC_CHECK_MS = \d+;\n  const truncChecked = new Set\(\);\n  async function checkTruncation\(msgId, info\) \{[\s\S]*?\n  \}\n/.exec(idx);
  t('끊김 검사 함수가 있다', !!m);
  if (m) {
    const run = async ({ shown, orig, cid = 'c1', load }) => {
      const sb = loadHealth();
      const byId = new Map(shown ? [['m1', { id: 'm1', text: shown, verifyTries: 2 }]] : []);
      let loads = 0;
      sb.GT.store = { state: { byId } };
      sb.GT.conversation = { idFromPath: () => cid, load: load || (async () => { loads++; return { messages: orig == null ? [] : [{ id: 'm1', text: orig }] }; }) };
      vm.runInContext(m[0] + '\nglobalThis.__check = checkTruncation;', sb);
      await sb.__check('m1', { droppedOps: 3 });
      await sb.__check('m1', { droppedOps: 3 });
      return { rec: (sb.__rec || []).filter(([c]) => c === 'truncated'), loads: () => loads };
    };
    const base = '본문'.repeat(100);
    let r = await run({ shown: base, orig: base + '끝까지 왔어야 할 마지막 문장입니다. 여기까지.' });
    t('원본보다 짧으면 truncated 로 기록한다', r.rec.length === 1 && /화면 200자 \/ 원본 \d+자/.test(r.rec[0][1]));
    t('기록에 길이 · 버린 델타 · verify 횟수', r.rec[0][2].diff >= 20 && r.rec[0][2].droppedOps === 3 && r.rec[0][2].verifyTries === 2);
    t('답마다 한 번만 읽는다', r.loads() === 1);
    r = await run({ shown: base, orig: base });
    t('같으면 기록하지 않는다', r.rec.length === 0);
    r = await run({ shown: null, orig: base });
    t('대화를 옮겼으면(답이 없으면) 읽지 않는다', r.rec.length === 0 && r.loads() === 0);
    r = await run({ shown: base, orig: base, cid: null });
    t('대화 id 가 없으면(비로그인 등) 읽지 않는다', r.loads() === 0);
    r = await run({ shown: base, orig: null });
    t('원본에서 못 찾으면 기록하지 않는다', r.rec.length === 0);
    r = await run({ shown: base, load: async () => { throw new Error('401'); } });
    t('원본 API 가 실패해도 터지지 않는다', r.rec.length === 0);
  }
  const ms = Number((/const TRUNC_CHECK_MS = (\d+);/.exec(idx) || [])[1]);
  const retries = Number((/const VERIFY_RETRIES = (\d+);/.exec(idx) || [])[1]);
  // verify 는 400ms 뒤 시작해 900·1800·2700ms 간격으로 다시 본다 — 그 뒤에 재야 교정 전 길이로 헛경보를 내지 않는다
  const verifyWindow = 400 + 900 * (retries * (retries + 1) / 2);
  t('끊김 검사는 verify 재시도가 끝난 뒤', ms > verifyWindow);
  t('답이 끝날 때 예약하고, 교대 때 취소한다',
    /setTimeout\(\(\) => checkTruncation\(p\.id, \{ droppedOps: p\.droppedOps \|\| 0 \}\), TRUNC_CHECK_MS\);\n      disposers\.push\(\(\) => clearTimeout\(t\)\);/.test(idx));
  t('본문을 못 받은 턴은 건너뛴다 (이미 원본을 다시 읽는다)', /if \(p\.id && p\.began !== false\) \{/.test(idx));
  t('버린 델타를 기록한다', /GT\.bugs\.record\('deltas-dropped'/.test(idx));
  t('원본 화면이 짧았던 것을 기록한다', /GT\.bugs\.record\('original-partial'/.test(idx));
}

// ---------------------------------------------------------------- 편집기가 여럿일 때 (0.22.1)
// 테스터 보고(0.22.0): contenteditable 3개 · send-failed ×6 inject-rejected. 숨은 편집기를 골랐다고 본다 [가정].
{
  const mk = ({ editors, accept }) => {
    let active = null;
    const ed = editors.map((o, k) => ({ tagName: 'DIV', textContent: '', name: o.name,
      getClientRects: () => (o.hidden ? [] : [{}]), getBoundingClientRect: () => (o.hidden ? { width: 0, height: 0 } : { width: 400, height: 36 }),
      closest: () => ({}), focus() { if (!o.hidden) active = this; }, dispatchEvent() {} }));
    const sb = { console, Object, Array, String, JSON, Promise, Error, RegExp, Set, Math,
      Event: function Event(type) { this.type = type; },
      requestAnimationFrame: (f) => setTimeout(f, 0), setTimeout,
      window: { getSelection: () => ({ removeAllRanges() {}, addRange() {} }) },
      document: {
        get activeElement() { return active; },
        querySelector: (q) => (q.includes('[contenteditable') ? ed[0] : null),
        querySelectorAll: (q) => (q === 'form[data-chatgpt-composer] [contenteditable="true"]' ? [ed[0]] : (q === '.ProseMirror[contenteditable="true"]' ? ed : [])),
        createRange: () => ({ selectNodeContents() {} }),
        execCommand: (_c, _u, text) => { if (!active || !accept.includes(active.name)) return false; active.textContent = text; return true; },
        hasFocus: () => true, visibilityState: 'visible' } };
    sb.GT = { skin: { current: { focus() {} } }, bugs: { record() {} } };
    vm.createContext(sb);
    vm.runInContext(read('src/content/compose.js'), sb, { filename: 'compose.js' });
    return { C: sb.GT.compose, ed };
  };
  // 폼 안의 첫 편집기가 숨어 있고, 보이는 것은 둘째
  let r = mk({ editors: [{ name: 'hidden', hidden: true }, { name: 'visible' }, { name: 'other' }], accept: ['visible', 'other'] });
  t('보이는 편집기를 먼저 고른다 (숨은 것이 목록 앞에 있어도)', r.C.composer() === r.ed[1]);
  t('보이는 편집기에 넣는다', r.C.tryInject('보낼 글') === '' && r.ed[1].textContent === '보낼 글' && r.ed[0].textContent === '');
  // 보이는 첫 후보가 거절하면 다음 후보로
  r = mk({ editors: [{ name: 'a' }, { name: 'b' }], accept: ['b'] });
  t('거절하면 다음 후보로 넘어가 넣는다', r.C.tryInject('x') === '' && r.ed[1].textContent === 'x');
  r = mk({ editors: [{ name: 'a' }, { name: 'b' }], accept: [] });
  t('모두 거절하면 inject-rejected', r.C.tryInject('x') === 'inject-rejected');
  r = mk({ editors: [{ name: 'hidden', hidden: true }, { name: 'visible' }], accept: ['visible'] });
  const p = r.C.probe();
  t('보고서에 후보별 크기 · 보임 · 초점', p.candidates.length === 2 && p.candidates[0].shown === true && p.candidates[1].shown === false
    && p.candidates[1].w === 0 && 'active' in p.candidates[0] && 'inForm' in p.candidates[0]);
  t('보고서의 found 는 실제로 고를 후보', p.found === '.ProseMirror[contenteditable="true"]');
}

let bad = 0;
results.forEach(([n, ok]) => { if (!ok) bad++; console.log(`  ${ok ? 'PASS' : 'FAIL'}  ${n}`); });
console.log(bad ? `\n${bad}건 실패` : '\n전부 통과');
process.exit(bad ? 1 : 0);
