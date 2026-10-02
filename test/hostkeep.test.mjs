// 원본이 문서를 다시 그려 스킨 호스트를 지워도 화면이 하얗게 되지 않는다 (0.20.1)
//
// 실측(로그인 ChatGPT, 2026-10-02): 원본이 하이드레이션 오류(React #418, 대상 HTML) 뒤 문서를 다시 그리며
// #gpt-skin-host 와 <html> 의 data-gpt-skin-gen 을 지웠다. Ctrl+` 를 누르면 원본만 가려져 빈 화면이 됐다.
// 예전 코드는 body 가 없으면(document_start) 호스트를 <html> 에 바로 붙였다 — 하이드레이션을 깨는 쪽이다.
// docs/issue/2026-10-02-blank-screen-host-removed.md
import fs from 'node:fs'; import vm from 'node:vm';

const results = []; const t = (n, ok) => results.push([n, ok]);
const read = (f) => fs.readFileSync(f, 'utf8');

function makeDom({ body = true } = {}) {
  const observers = [];
  class El {
    constructor(tag) { this.tagName = tag.toUpperCase(); this.children = []; this.parentNode = null; this.id = ''; this.textContent = ''; }
    appendChild(c) { if (c.parentNode) c.remove(); c.parentNode = this; this.children.push(c); fire(this); return c; }
    remove() { const p = this.parentNode; if (!p) return; p.children = p.children.filter((x) => x !== this); this.parentNode = null; fire(p); }
    get isConnected() { let n = this; while (n.parentNode) n = n.parentNode; return n === html; }
    attachShadow() { this.shadowRoot = { textContent: '' }; return this.shadowRoot; }
  }
  const classes = new Set();
  const html = new El('html');
  html.classList = { add: (c) => { classes.add(c); fire(html, 'class'); }, remove: (c) => { classes.delete(c); fire(html, 'class'); }, contains: (c) => classes.has(c) };
  const head = new El('head'); html.children.push(head); head.parentNode = html;
  let bodyEl = null;
  const doc = {
    documentElement: html, head,
    get body() { return bodyEl; },
    createElement: (tg) => new El(tg),
    getElementById: (id) => { const walk = (n) => { if (n.id === id) return n; for (const c of n.children) { const r = walk(c); if (r) return r; } return null; }; return walk(html); }
  };
  function fire(target, attr) {
    observers.forEach((o) => o.targets.forEach(([tg, cfg]) => {
      if (tg !== target) return;
      if (attr ? cfg.attributes : cfg.childList) o.pending = true;
    }));
  }
  class MO {
    constructor(cb) { this.cb = cb; this.targets = []; this.pending = false; observers.push(this); }
    observe(tg, cfg) { this.targets.push([tg, cfg]); }
    disconnect() { this.targets = []; }
  }
  const flush = () => { for (let i = 0; i < 5; i++) observers.forEach((o) => { if (o.pending) { o.pending = false; o.cb([]); } }); };
  const addBody = () => { bodyEl = new El('body'); html.appendChild(bodyEl); return bodyEl; };
  // 원본이 문서를 다시 그린다: <body> 를 새것으로 바꾸고 <html> 클래스를 지운다
  const rerender = () => { if (bodyEl) bodyEl.remove(); classes.clear(); fire(html, 'class'); addBody(); };
  if (body) addBody();
  return { doc, MO, html, flush, addBody, rerender, classes };
}

function load(dom) {
  const sb = { console, Object, Array, String, document: dom.doc, MutationObserver: dom.MO };
  sb.GT = { log() {} };
  vm.createContext(sb);
  vm.runInContext(read('src/content/shell/cover.js'), sb, { filename: 'cover.js' });
  return sb.GT.cover;
}

// ---------------------------------------------------------------- body 가 없을 때
{
  const dom = makeDom({ body: false });
  const C = load(dom);
  const { host } = C.host();
  t('body 가 없으면 <html> 에 붙이지 않는다', !host.isConnected && dom.html.children.every((c) => c !== host));
  dom.addBody(); dom.flush();
  t('body 가 생기면 그 안에 붙인다', host.isConnected && host.parentNode === dom.doc.body);
}

// ---------------------------------------------------------------- 원본이 문서를 다시 그릴 때
{
  const dom = makeDom();
  const C = load(dom);
  const { host, shadow } = C.host();
  shadow.textContent = '스킨 화면';
  C.on();
  t('처음엔 붙어 있다', C.attached() && C.isOn());
  dom.rerender(); dom.flush();
  t('지워지면 새 body 에 다시 붙인다', host.isConnected && host.parentNode === dom.doc.body);
  t('shadow 안의 화면은 그대로 (다시 그리지 않아도 된다)', host.shadowRoot.textContent === '스킨 화면');
  t('켜 둔 상태(<html> 클래스)를 되살린다', dom.classes.has(C.ON_CLASS));
  t('다시 붙인 횟수를 센다 (보고서용)', C.restored === 1);
  host.remove(); dom.flush();
  t('body 는 그대로 두고 호스트만 떼어도 다시 붙인다', host.isConnected && C.restored === 2);
  C.off(); dom.rerender(); dom.flush();
  t('꺼 둔 상태에서는 클래스를 되살리지 않는다', !dom.classes.has(C.ON_CLASS));
  C.remove(); dom.rerender(); dom.flush();
  t('remove 뒤에는 다시 붙이지 않는다 (확장이 물러날 때)', !C.attached() && dom.doc.getElementById(C.HOST_ID) === null);
}

// ---------------------------------------------------------------- 가리는 규칙은 호스트가 있을 때만
{
  const src = read('src/content/shell/cover.js');
  t('원본을 가리는 규칙이 호스트가 붙어 있을 때만 걸린다 (:has)',
    /html\.\$\{ON_CLASS\}:has\(> body > #\$\{HOST_ID\}\) body > \*:not\(#\$\{HOST_ID\}\) \{ opacity: 0/.test(src));
  t('<html> 에 바로 붙이던 코드가 없다', !/document\.body \|\| document\.documentElement\)\.appendChild/.test(src));
  const idx = read('src/content/index.js');
  t('지워진 세대 표식을 되살린다',
    /if \(!gone && !pageRoot\.dataset\.gptSkinGen\) pageRoot\.dataset\.gptSkinGen = GEN;/.test(idx));
  t('보고서에 호스트 상태', /host \$\{GT\.cover\.attached\(\) \? 'attached' : 'DETACHED'\}/.test(read('src/content/bugs.js')));
}

let bad = 0;
results.forEach(([n, ok]) => { if (!ok) bad++; console.log(`  ${ok ? 'PASS' : 'FAIL'}  ${n}`); });
console.log(bad ? `\n${bad}건 실패` : '\n전부 통과');
process.exit(bad ? 1 : 0);
