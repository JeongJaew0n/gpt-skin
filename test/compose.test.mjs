// 원본 입력창 찾기와 글 넣기. 화면마다 입력창 모양이 다르다.
//   로그인 화면   #prompt-textarea (ProseMirror, contenteditable)
//   비로그인 화면 textarea#mobile-composer-prompt name="prompt" (실측 2026-09-28)
// docs/issue/2026-09-28-shortcuts-dead-after-refresh.md §5
import fs from 'node:fs'; import vm from 'node:vm';

const results = []; const t = (n, ok) => results.push([n, ok]);

// React 가 값을 들고 있는 textarea 를 흉내낸다: 인스턴스에 value 를 그냥 대입하면(React 가 덮어쓴 setter)
// 기록되지 않고, 원래 프로토타입 setter 로 넣고 input 이 나야 '입력됨' 으로 친다.
function load(dom) {
  class HTMLTextAreaElement {}
  let protoValue = '';
  Object.defineProperty(HTMLTextAreaElement.prototype, 'value', {
    get() { return this._v != null ? this._v : protoValue; },
    set(v) { this._v = String(v); },
    configurable: true
  });
  class HTMLInputElement {}
  Object.defineProperty(HTMLInputElement.prototype, 'value', { get() { return this._v || ''; }, set(v) { this._v = String(v); }, configurable: true });

  const made = (dom.make || (() => ({})))(HTMLTextAreaElement);
  const events = [];
  const later = [];   // 긴 타이머(보냈는지 확인)는 잡아 두고 테스트가 직접 돌린다
  const warns = [];
  const sb = {
    console, Object, Array, String, Number, Boolean, JSON, Math, Promise, Error, RegExp,
    HTMLTextAreaElement, HTMLInputElement,
    Event: function Event(type, o) { this.type = type; Object.assign(this, o || {}); },
    KeyboardEvent: function KeyboardEvent(type, o) { this.type = type; Object.assign(this, o || {}); },
    requestAnimationFrame: (f) => setTimeout(f, 0),
    setTimeout: (f, ms) => (ms >= 1000 ? later.push({ f, ms }) : setTimeout(f, ms)),
    GT_T: (k) => k,
    window: { getSelection: () => ({ removeAllRanges() {}, addRange() {} }) },
    document: {
      querySelector: (sel) => (made[sel] || (dom.button && /send-button|메시지 보내기|submit/.test(sel) ? dom.button : null)),
      querySelectorAll: (sel) => (made[sel] ? [made[sel]] : []),
      createRange: () => ({ selectNodeContents() {} }),
      execCommand: (cmd, _u, text) => (dom.execCommand ? dom.execCommand(cmd, text, made) : false)
    }
  };
  sb.GT = { skin: { current: { focus() {}, system: (lv, msg) => warns.push([lv, msg]) } } };
  vm.createContext(sb);
  vm.runInContext(fs.readFileSync('src/content/compose.js', 'utf8'), sb, { filename: 'compose.js' });
  return { C: sb.GT.compose, GT: sb.GT, made, events, HTMLTextAreaElement, later, warns };
}

// 비로그인 화면의 textarea 를 만든다
const makeTextarea = (Proto) => {
  const ta = Object.create(Proto.prototype);
  Object.assign(ta, { tagName: 'TEXTAREA', id: 'mobile-composer-prompt', focused: false, selected: false, events: [],
    focus() { this.focused = true; }, select() { this.selected = true; },
    dispatchEvent(e) { this.events.push(e.type); return true; } });
  return ta;
};

// --- 목록 ---
{
  const { C } = load({});
  t('입력창 목록이 로그인 · 비로그인 모양을 모두 담는다',
    C.COMPOSERS.includes('#prompt-textarea') && C.COMPOSERS.includes('textarea#mobile-composer-prompt'));
  t('id 가 바뀌어도 name 으로 잡는다', C.COMPOSERS.includes('textarea[name="prompt"]'));
  t('로그인 화면(ProseMirror)을 먼저 찾는다', C.COMPOSERS[0] === '#prompt-textarea');
  t('점검용 선택자는 목록을 이은 것', C.SELECTOR === C.COMPOSERS.join(', '));
}

// --- 찾기 ---
{
  const { C, made, HTMLTextAreaElement } = load({ make: (P) => ({ 'textarea#mobile-composer-prompt': makeTextarea(P) }) });
  t('비로그인 화면에서 textarea 를 찾는다', C.composer() === made['textarea#mobile-composer-prompt']);
  void HTMLTextAreaElement;
}
{
  const pm = { tagName: 'DIV' };
  const { C } = load({ make: (P) => ({ '#prompt-textarea': pm, 'textarea#mobile-composer-prompt': makeTextarea(P) }) });
  t('둘 다 있으면 ProseMirror 를 고른다', C.composer() === pm);
}
{
  // 실측 2026-09-28: 로그인 화면의 ProseMirror 에서 id="prompt-textarea" 가 없어졌다.
  // 남은 표식은 감싼 폼의 data-chatgpt-composer. 이걸 못 찾으면 Enter 를 쳐도 원본에 글이 안 들어간다.
  const FORM_PM = 'form[data-chatgpt-composer] [contenteditable="true"]';
  const pm = { tagName: 'DIV', focused: false, focus() { this.focused = true; }, dispatchEvent() { return true; } };
  let used = false;
  const { C } = load({ make: () => ({ [FORM_PM]: pm }), execCommand: (cmd) => { used = cmd === 'insertText'; return true; } });
  t('id 가 없는 ProseMirror 를 컴포저 폼 안에서 찾는다', C.composer() === pm);
  t('그 입력창에 글을 넣는다', C.inject('x') === true && used && pm.focused);
  t('textarea 보다 먼저 찾는다 (로그인 화면이 기본)', C.COMPOSERS.indexOf(FORM_PM) >= 0
    && C.COMPOSERS.indexOf(FORM_PM) < C.COMPOSERS.indexOf('textarea#mobile-composer-prompt'));
}
{
  const { C } = load({ make: () => ({}) });
  t('없으면 null', C.composer() === null);
  t('없으면 넣기 실패', C.inject('x') === false);
}

// --- textarea 에 넣기 ---
{
  // execCommand 가 먹는 경우 — 진짜 입력처럼 값이 들어간다
  const { C, made } = load({
    make: (P) => ({ 'textarea#mobile-composer-prompt': makeTextarea(P) }),
    execCommand: (cmd, text, m) => { const ta = m['textarea#mobile-composer-prompt']; if (cmd === 'insertText' && ta.selected) { Object.getOwnPropertyDescriptor(Object.getPrototypeOf(ta), 'value').set.call(ta, text); return true; } return false; }
  });
  const ok = C.inject('안녕하세요');
  const ta = made['textarea#mobile-composer-prompt'];
  t('execCommand 로 넣는다', ok === true && ta.value === '안녕하세요');
  t('넣기 전에 초점을 주고 전체를 고른다 (기존 글을 갈아엎는다)', ta.focused && ta.selected);
}
{
  // execCommand 가 안 먹는 경우 — 원래 setter 로 넣고 input 을 쏜다 (React 가 알아듣게)
  const { C, made } = load({ make: (P) => ({ 'textarea#mobile-composer-prompt': makeTextarea(P) }), execCommand: () => false });
  const ok = C.inject('두 번째 길');
  const ta = made['textarea#mobile-composer-prompt'];
  t('execCommand 가 안 되면 setter 로 넣는다', ok === true && ta.value === '두 번째 길');
  t('그때 input 을 쏜다', ta.events.includes('input'));
}
{
  // ProseMirror 길은 예전 그대로 selectNodeContents + execCommand
  const pm = { tagName: 'DIV', focused: false, focus() { this.focused = true; }, dispatchEvent() { return true; } };
  let used = false;
  const { C } = load({ make: () => ({ '#prompt-textarea': pm }), execCommand: (cmd) => { used = cmd === 'insertText'; return true; } });
  t('ProseMirror 는 예전 길로 넣는다', C.inject('x') === true && used && pm.focused);
}

// --- 보낸 뒤 원본이 정말 보냈는지 본다 ---
// 실측(비로그인, 2026-09-28): 넣고 눌러도 가끔 안 보내지고 글이 입력창에 남았는데 아무 말이 없었다.
async function sendWith({ clears }) {
  const setter = (ta, v) => Object.getOwnPropertyDescriptor(Object.getPrototypeOf(ta), 'value').set.call(ta, v);
  let ta;
  const button = { disabled: false, clicks: 0, click() { this.clicks++; if (clears) setter(ta, ''); } };
  const L = load({ button, make: (P) => { ta = makeTextarea(P); return { 'textarea#mobile-composer-prompt': ta }; }, execCommand: () => false });
  const r = await L.C.send('보낼 글');
  return { ...L, r, button };
}
{
  const { r, later, warns, button, C } = await sendWith({ clears: true });
  t('보내기는 버튼을 누른다', r.ok === true && button.clicks === 1);
  t('보낸 뒤 확인 타이머를 건다 (다시 누르기 판단 · 안 보내졌다 확인)', later.length === 2 && later.some((x) => x.ms === C.SENT_CHECK_MS) && later.some((x) => x.ms === C.SEND_RETRY_MS));
  later.forEach((x) => x.f());
  t('원본이 비웠으면(보냈으면) 아무 말도 하지 않는다', warns.length === 0);
}
{
  const { later, warns, button } = await sendWith({ clears: false });
  later.forEach((x) => x.f());
  t('원본에 글이 남았으면 알린다', warns.length === 1 && warns[0][0] === 'warn' && warns[0][1] === 'compose.notSent');
  t('다시 누르는 것은 한 번까지다 (0.31.8 — 그 뒤엔 알리기만)', button.clicks === 2);
}
{
  const { C } = load({});
  t('남은 글 판정 — 같은 글', C.holding({ tagName: 'TEXTAREA', value: ' 보낼 글 ' }, '보낼 글'));
  t('남은 글 판정 — 사용자가 이어 쓴 글은 다른 글', !C.holding({ tagName: 'TEXTAREA', value: '다른 글' }, '보낼 글'));
  t('남은 글 판정 — 빈 글은 남은 게 아니다', !C.holding({ tagName: 'TEXTAREA', value: '' }, ''));
  t('남은 글 판정 — ProseMirror 는 textContent', C.holding({ tagName: 'DIV', textContent: '보낼 글' }, '보낼 글'));
  // ProseMirror 는 줄바꿈을 문단으로 바꿔 textContent 에서 사라진다 — 여러 줄 글도 남았다고 봐야 한다 (0.26.7)
  t('남은 글 판정 — ProseMirror 의 여러 줄 글', C.holding({ tagName: 'DIV', textContent: '첫 줄둘째 줄' }, '첫 줄\n둘째 줄'));
  t('남은 글 판정 — ProseMirror 에 다른 글이면 아니다', !C.holding({ tagName: 'DIV', textContent: '첫 줄' }, '첫 줄\n둘째 줄'));
  t('남은 글 판정 — textarea 는 줄바꿈까지 그대로 비교한다', !C.holding({ tagName: 'TEXTAREA', value: '첫 줄둘째 줄' }, '첫 줄\n둘째 줄'));
}
{
  const i18n = fs.readFileSync('src/shared/i18n.js', 'utf8');
  t('미전송 문구가 ko · en 둘 다 있다', (i18n.match(/'compose\.notSent'/g) || []).length === 2);
}

// --- 부팅 점검도 같은 목록을 쓴다 ---
{
  const idx = fs.readFileSync('src/content/index.js', 'utf8').replace(/\/\/.*$/gm, '');
  t('부팅 점검이 compose 목록으로 기다린다', /waitFor\(GT\.compose\.SELECTOR/.test(idx));
  t('점검 이름표도 두 모양을 말한다', /textarea\[name=prompt\]/.test(fs.readFileSync('src/content/health.js', 'utf8')));
}

// --- 보내기 버튼이 늦게 나타난다 (실측 2026-10-15: 글을 넣고 35~53ms 뒤) ---
// 예전에는 rAF 두 번(120Hz 면 16ms)만 기다려 버튼이 아직 없었고, Enter 흉내로 넘어가 원본이 무시했다.
{
  const setter = (ta, v) => Object.getOwnPropertyDescriptor(Object.getPrototypeOf(ta), 'value').set.call(ta, v);
  let ta;
  const dom = { button: null, make: (P) => { ta = makeTextarea(P); return { 'textarea#mobile-composer-prompt': ta }; }, execCommand: () => false };
  const btn = { disabled: false, clicks: 0, click() { this.clicks++; setter(ta, ''); } };
  const L = load(dom);
  setTimeout(() => { dom.button = btn; }, 60);
  const r = await L.C.send('늦게 뜨는 버튼');
  t('보내기 버튼이 늦게 나타나도 기다렸다가 누른다', btn.clicks === 1 && r.via === 'button');
  t('그때 Enter 를 흉내 내지 않는다', !ta.events.includes('keydown'));
}
{
  let ta;
  const L = load({ button: null, make: (P) => { ta = makeTextarea(P); return { 'textarea#mobile-composer-prompt': ta }; }, execCommand: () => false });
  const t0 = Date.now();
  const r = await L.C.send('버튼이 끝내 없다');
  const took = Date.now() - t0;
  t('끝내 버튼이 없으면 기다림 상한 뒤 Enter 로 넘어간다', r.via === 'enter' && ta.events.includes('keydown') && took >= L.C.SEND_WAIT_MS - 50 && took < L.C.SEND_WAIT_MS + 1000);
}

// --- '안 보내졌다' 기록에 어떻게 눌렀는지 남긴다 (사용자 보고서 2026-10-15: 여러 줄 긴 글에서 1건, 원인을 못 가렸다) ---
// 글 내용은 남기지 않는다 — 길이 · 줄 수만.
{
  let ta;
  const L = load({ button: null, make: (P) => { ta = makeTextarea(P); return { 'textarea#mobile-composer-prompt': ta }; }, execCommand: () => false });
  const recs = [];
  L.GT.bugs = { record: (code, msg, extra) => recs.push({ code, extra }) };
  await L.C.send('첫 줄\n둘째 줄\n셋째 줄');
  L.later.forEach((x) => x.f());
  const rec = recs.find((x) => x.code === 'not-sent');
  const send = rec && rec.extra && rec.extra.send;
  t('안 보내졌다 기록에 누른 방법이 남는다 (버튼이 끝내 없었음)', !!send && send.via === 'enter-no-button');
  t('버튼을 기다린 시간이 남는다', !!send && send.waitMs >= L.C.SEND_WAIT_MS - 50);
  t('글의 길이와 줄 수가 남는다', !!send && send.chars === 13 && send.lines === 3);
  t('글 내용은 기록에 들어가지 않는다', !!rec && !JSON.stringify(rec.extra).includes('둘째'));
}
{
  // 버튼은 있는데 잠겨 있었다 — 따로 가린다
  let ta;
  const locked = { disabled: true, clicks: 0, click() { this.clicks++; } };
  const L = load({ button: locked, make: (P) => { ta = makeTextarea(P); return { 'textarea#mobile-composer-prompt': ta }; }, execCommand: () => false });
  const recs = [];
  L.GT.bugs = { record: (code, msg, extra) => recs.push({ code, extra }) };
  await L.C.send('잠긴 버튼');
  L.later.forEach((x) => x.f());
  const rec = recs.find((x) => x.code === 'not-sent');
  t('버튼이 잠겨 있었으면 그렇게 남는다 (누르지 않는다)', !!(rec && rec.extra && rec.extra.send) && rec.extra.send.via === 'enter-disabled' && locked.clicks === 0);
}
{
  // 글을 넣은 입력창의 폼 안 submit 이 먼저다 — 문서의 다른 '보내기' 버튼(피드백 보내기 등)을 누르지 않는다
  const own = { disabled: false, clicks: 0, click() { this.clicks++; } };
  const other = { disabled: false, clicks: 0, click() { this.clicks++; } };
  let ta;
  const form = { querySelector: (q) => (q === 'button[type="submit"]' ? own : null) };
  const L = load({ button: other, make: (P) => { ta = makeTextarea(P); ta.closest = (q) => (q === 'form' ? form : null); return { 'textarea#mobile-composer-prompt': ta }; }, execCommand: () => false });
  await L.C.send('폼 안 버튼');
  t('입력창 폼 안의 submit 버튼을 누른다 (언어와 무관)', own.clicks === 1 && other.clicks === 0);
}

// --- 눌렀는데 원본이 받지 않았으면 한 번만 다시 누른다 (사용자 결정 2026-10-16, 0.31.8) ---
// 실측: 정상 전송은 누르는 즉시 입력창이 비고 60ms 안에 중지 버튼. 사용자 탭의 미전송은 '글 그대로 · 중지 없음 · 보내기 버튼 있음'.
{
  const setter = (ta, v) => Object.getOwnPropertyDescriptor(Object.getPrototypeOf(ta), 'value').set.call(ta, v);
  const run = async ({ firstIgnored = true, secondWorks = true, stop = false, disabledAtRetry = false } = {}) => {
    let ta; const made = {};
    const btn = { disabled: false, clicks: 0, click() { this.clicks++; if (this.clicks === 1 && firstIgnored) return; if (this.clicks >= 2 && !secondWorks) return; setter(ta, ''); } };
    const L = load({ button: btn, make: (P) => { ta = makeTextarea(P); made['textarea#mobile-composer-prompt'] = ta; return made; }, execCommand: () => false });
    const recs = [];
    L.GT.bugs = { record: (code, msg, extra) => recs.push({ code, extra }) };
    await L.C.send('여러 줄\n긴 글');
    if (stop) made['[data-testid="stop-button"]'] = { click() {} };
    if (disabledAtRetry) btn.disabled = true;
    L.later.sort((a, b) => a.ms - b.ms).forEach((x) => x.f());
    return { btn, recs, warns: L.warns, ta, C: L.C };
  };
  let r = await run();
  t('클릭이 안 먹히면(글 그대로 · 중지 없음) 한 번 더 누른다', r.btn.clicks === 2);
  t('다시 눌러 보내졌으면 경고를 띄우지 않는다', !r.warns.some(([lv, m]) => m === 'compose.notSent'));
  t('다시 누른 일을 기록한다 (글 내용 없이)', r.recs.some((x) => x.code === 'send-retried' && x.extra.send.retried === true) && !JSON.stringify(r.recs).includes('긴 글'));
  r = await run({ firstIgnored: false });
  t('처음 클릭이 먹혔으면(입력창이 비었으면) 다시 누르지 않는다', r.btn.clicks === 1 && !r.recs.some((x) => x.code === 'send-retried'));
  r = await run({ stop: true });
  t('중지 버튼이 있으면(이미 보내는 중) 다시 누르지 않는다', r.btn.clicks === 1);
  r = await run({ disabledAtRetry: true });
  t('그때 보내기 버튼이 잠겨 있으면 누르지 않는다', r.btn.clicks === 1);
  r = await run({ secondWorks: false });
  t('다시 누르는 것은 한 번뿐 — 그래도 남으면 경고', r.btn.clicks === 2 && r.warns.some(([lv, m]) => m === 'compose.notSent'));
  t('다시 누르기는 안 보내졌다 확인보다 먼저다', r.C.SEND_RETRY_MS < r.C.SENT_CHECK_MS);
}
{
  // 버튼이 잠겨 있다가 풀리면 Enter 흉내로 넘어가지 않고 누른다 (예전 상한 1.5초를 넘겨도)
  let ta;
  const btn = { disabled: true, clicks: 0, click() { this.clicks++; } };
  const L = load({ button: btn, make: (P) => { ta = makeTextarea(P); return { 'textarea#mobile-composer-prompt': ta }; }, execCommand: () => false });
  setTimeout(() => { btn.disabled = false; }, 2000);
  const r = await L.C.send('잠깐 잠긴 버튼');
  t('잠긴 버튼이 2초 뒤 풀리면 기다렸다가 누른다', btn.clicks === 1 && r.via === 'button' && !ta.events.includes('keydown'));
}

let bad = 0;
results.forEach(([n, ok]) => { if (!ok) bad++; console.log(`  ${ok ? 'PASS' : 'FAIL'}  ${n}`); });
console.log(bad ? `\n${bad}건 실패` : '\n전부 통과');
process.exit(bad ? 1 : 0);
