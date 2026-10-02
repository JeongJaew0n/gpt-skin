// 대화 전환 — 원본 라우터를 태운다 (0.24.1)
//
// 실측(사용자 크롬, 로그인 ChatGPT, 2026-10-02): 터미널 탭을 눌러도 대화가 안 바뀌었다.
//   · 원본 링크가 있어도 숨은 링크(접힌 사이드바)는 click() 해도 이동하지 않았다
//   · 링크가 없을 때 pushState({}) 로 넣으면 React Router 가 되돌렸다(콘솔: navigate() in a React.useEffect)
//   · history.state 에 라우터 표식(idx · key)을 맞추자 이동했고 스킨도 따라왔다
import fs from 'node:fs'; import vm from 'node:vm';

const results = []; const t = (n, ok) => results.push([n, ok]);
const src = fs.readFileSync('src/content/navigate.js', 'utf8');

function load({ anchors = {}, path = '/c/a', state = { idx: 3 } } = {}) {
  const calls = { pushed: [], pops: [], clicks: [], assigned: [], records: [] };
  const timers = [];
  const loc = { pathname: path, assign: (h) => calls.assigned.push(h) };
  // 브라우저처럼 pushState 하면 곧바로 주소가 바뀐다
  const hist = { state, pushState(st, _t, url) { this.state = st; calls.pushed.push([st, url]); loc.pathname = url; } };
  const sb = { console, Object, Math, String, Number,
    location: loc, history: hist,
    CSS: { escape: (x) => x },
    setTimeout: (f, ms) => { timers.push({ f, ms }); return 0; },
    PopStateEvent: function PopStateEvent(type, o) { this.type = type; Object.assign(this, o || {}); },
    window: { dispatchEvent: (e) => { calls.pops.push(e); return true; } },
    document: { querySelector: (q) => { const m = /a\[href="([^"]+)"\]/.exec(q); return m ? anchors[m[1]] || null : null; } } };
  sb.GT = { bugs: { record: (...a) => calls.records.push(a) } };
  vm.createContext(sb);
  vm.runInContext(src, sb, { filename: 'navigate.js' });
  const link = (href, visible) => ({ getClientRects: () => (visible ? [{}] : []), click() { calls.clicks.push(href); if (visible) loc.pathname = href; } });
  return { N: sb.GT.navigate, calls, loc, hist, timers, link, anchors };
}

{
  const L = load();
  L.anchors['/c/b'] = L.link('/c/b', true);
  L.N.to('/c/b');
  t('보이는 원본 링크는 누른다', L.calls.clicks[0] === '/c/b' && L.calls.pushed.length === 0);
  L.timers.forEach((x) => x.f());
  t('넘어갔으면 새로 열지 않는다', L.calls.assigned.length === 0);
}
{
  const L = load();
  L.anchors['/c/b'] = L.link('/c/b', false);
  L.N.to('/c/b');
  t('숨은 링크는 누르지 않는다', L.calls.clicks.length === 0);
  const [st, url] = L.calls.pushed[0] || [];
  t('대신 라우터 표식을 맞춰 주소를 바꾼다 (idx 는 지금 + 1 · key)', url === '/c/b' && st.idx === 4 && typeof st.key === 'string' && st.key.length > 0 && 'usr' in st);
  t('popstate 에 그 상태를 싣는다', L.calls.pops[0] && L.calls.pops[0].type === 'popstate' && L.calls.pops[0].state === st);
}
{
  const L = load({ state: null });
  L.N.to('/c/z');
  t('상태가 없으면 idx 1', L.calls.pushed[0][0].idx === 1);
}
{
  // 라우터가 되돌렸다 → 새로 연다 · 기록을 남긴다
  const L = load();
  L.N.to('/c/b');
  L.loc.pathname = '/c/a';
  L.timers.forEach((x) => x.f());
  t('그래도 안 넘어갔으면 페이지를 새로 연다', L.calls.assigned[0] === '/c/b');
  t('그 일을 버그 기록에 남긴다 (대화 id 는 가린다)', L.calls.records[0] && L.calls.records[0][0] === 'navigate-fallback' && !/\/c\/b/.test(L.calls.records[0][1]));
}
{
  const L = load({ path: '/c/b' });
  t('이미 그 대화면 아무것도 안 한다', L.N.to('/c/b') === true && L.calls.pushed.length === 0 && L.calls.clicks.length === 0);
  t('newChat 은 / 로', (() => { const M = load(); M.N.newChat(); return M.calls.pushed[0][1] === '/'; })());
}

// 빠르게 연달아 이동해도 페이지를 새로 열지 않는다 (0.25.1)
// 사용자 보고: 단축키를 연달아 누르면 스킨이 벗겨진다 — 앞선 이동의 확인이 '주소가 A 가 아니다' 로 읽혀 A 로 새로 열었다
{
  const L = load();                       // 지금 /c/a
  L.N.to('/c/b');                         // pushState 로 주소는 /c/b
  L.N.to('/c/c');                         // 곧바로 다음 탭 → /c/c
  L.timers.forEach((x) => x.f());         // 두 확인이 다 돈다
  t('연달아 이동하면 앞선 확인은 아무것도 안 한다', L.calls.assigned.length === 0 && L.loc.pathname === '/c/c');
}
{
  const L = load();
  L.N.to('/c/b');
  L.loc.pathname = '/c/zz';               // 원본 링크 등 다른 경로로 움직였다
  L.timers.forEach((x) => x.f());
  t('다른 곳으로라도 움직였으면 새로 열지 않는다', L.calls.assigned.length === 0);
}
{
  const L = load();
  L.N.to('/c/b'); L.N.to('/c/c');
  L.loc.pathname = '/c/b';                // 마지막 이동(b → c)이 되돌려져 출발지 b 로
  L.timers.forEach((x) => x.f());
  t('마지막 이동이 되돌려졌을 때만 새로 연다 (그것도 마지막 목적지로)', L.calls.assigned.length === 1 && L.calls.assigned[0] === '/c/c');
}

{
  // 왕복: Ctrl+. 로 a → b, 곧바로 Ctrl+, 로 b → a. 첫 확인이 '출발지 a 그대로' 로 읽히면 b 로 새로 열어 버린다
  const L = load();
  L.N.to('/c/b'); L.N.to('/c/a');
  L.timers.forEach((x) => x.f());
  t('왕복해도 새로 열지 않는다 (마지막 이동만 확인한다)', L.calls.assigned.length === 0 && L.loc.pathname === '/c/a');
}

let bad = 0;
results.forEach(([n, ok]) => { if (!ok) bad++; console.log(`  ${ok ? 'PASS' : 'FAIL'}  ${n}`); });
console.log(bad ? `\n${bad}건 실패` : '\n전부 통과');
process.exit(bad ? 1 : 0);
