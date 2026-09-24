// 복사 버튼. 누른 순간의 원문을 집어야 하고, 실패를 삼키면 안 된다.
import fs from 'node:fs'; import vm from 'node:vm';

// ---- 최소 DOM. markdown.js 가 쓰는 것만 흉내낸다 ----
function makeDom() {
  const mk = (tag) => {
    const n = {
      tag, className: '', children: [], attrs: {}, dataset: {}, style: {},
      listeners: {}, isConnected: true, _text: '',
      get textContent() {
        if (this._text) return this._text;
        return this.children.map((c) => c.textContent || '').join('');
      },
      set textContent(v) { this._text = String(v); this.children = []; },
      appendChild(c) { this.children.push(c); return c; },
      replaceChild(next, old) {
        const i = this.children.indexOf(old);
        if (i < 0) throw new Error('replaceChild: 없는 자식');
        this.children[i] = next;
        return old;
      },
      setAttribute(k, v) { this.attrs[k] = v; },
      addEventListener(type, fn) { (this.listeners[type] = this.listeners[type] || []).push(fn); },
      fire(type, ev) { (this.listeners[type] || []).forEach((f) => f(ev || { preventDefault(){}, stopPropagation(){} })); },
      find(pred) {
        if (pred(this)) return this;
        for (const c of this.children) { const r = c.find && c.find(pred); if (r) return r; }
        return null;
      },
      all(pred, acc) {
        acc = acc || [];
        if (pred(this)) acc.push(this);
        this.children.forEach((c) => c.all && c.all(pred, acc));
        return acc;
      }
    };
    return n;
  };
  return {
    createElement: mk,
    createElementNS: (ns, tag) => { const n = mk(tag); n.ns = ns; return n; },
    createTextNode: (t) => ({ tag: '#text', children: [], textContent: t, find: () => null, all: (p, a) => a || [] }),
    createDocumentFragment: () => mk('#frag')
  };
}

// 복사는 2026-09-24 에 tty.js 에서 shell/clipboard.js 로 옮겼다. markdown 은 GT.clipboard 를 부른다.
function load(clipStub) {
  const document = makeDom();
  const sandbox = { console, Object, Array, String, Number, Boolean, JSON, Promise, Error, RegExp, Math,
    document, setTimeout, clearTimeout };
  sandbox.window = sandbox; sandbox.globalThis = sandbox;
  sandbox.GT = { clipboard: clipStub };
  vm.createContext(sandbox);
  vm.runInContext(fs.readFileSync('src/content/markdown.js', 'utf8'), sandbox, { filename: 'markdown.js' });
  return sandbox.GT.markdown;
}

const results = []; const t = (n, ok) => results.push([n, ok]);
const isBtn = (n) => n.tag === 'button' && /gt-copy/.test(n.className);
const wait = () => new Promise((r) => setTimeout(r, 0));

// 버튼 안의 svg 를 path 개수와 모양으로 구분한다.
function iconKind(b) {
  const svg = b.children.find((c) => c.tag === 'svg');
  if (!svg) return null;
  const ds = svg.children.map((p) => p.attrs.d || '');
  if (ds.length === 2 && /a1\.3 1\.3/.test(ds[0])) return 'copy';
  if (ds.length === 1) return 'ok';
  if (ds.length === 2) return 'fail';
  return null;
}

// --- 코드블록에 버튼이 붙는다 ---
{
  const copied = [];
  const M = load({ copy: (s) => { copied.push(s); return Promise.resolve(true); } });
  const frag = M.render('앞줄\n\n```js\nconst a = 1;\nconst b = 2;\n```\n뒷줄');
  const btns = frag.all(isBtn);
  t('코드블록마다 버튼이 하나', btns.length === 1);

  btns[0].fire('click');
  await wait();
  t('코드 본문을 그대로 복사한다', copied[0] === 'const a = 1;\nconst b = 2;');
  t('울타리(```)는 빼고 복사한다', !/```/.test(copied[0]));
  t('성공하면 아이콘이 체크로 바뀐다', iconKind(btns[0]) === 'ok');
  t('상태를 dataset 으로 표시', btns[0].dataset.state === 'ok');
  t('스크린리더용 이름도 바뀐다', btns[0].attrs['aria-label'] === '복사됨');
}

// --- 글자가 아니라 아이콘이다 ---
{
  const M = load({ copy: () => Promise.resolve(true) });
  const b = M.render('```\nx\n```').all(isBtn)[0];
  t('버튼에 글자를 넣지 않는다', b.textContent === '');
  t('처음엔 복사 아이콘', iconKind(b) === 'copy');
  t('아이콘은 그려서 만든다', b.children[0].ns === 'http://www.w3.org/2000/svg');
  t('색은 글자색을 따라간다', b.children[0].children.every((p) => p.attrs.stroke === 'currentColor'));
  t('아이콘은 보조기술에서 숨긴다', b.children[0].attrs['aria-hidden'] === 'true');
  t('이름은 버튼이 갖는다', b.attrs['aria-label'] === '복사' && b.title === '복사');
}

// --- 코드블록이 여럿이면 각자 자기 것만 ---
{
  const copied = [];
  const M = load({ copy: (s) => { copied.push(s); return Promise.resolve(true); } });
  const frag = M.render('```py\nfirst\n```\n\n```sh\nsecond\n```');
  const btns = frag.all(isBtn);
  t('버튼이 둘', btns.length === 2);
  btns[1].fire('click'); await wait();
  btns[0].fire('click'); await wait();
  t('각 버튼이 자기 블록을 복사', copied[0] === 'second' && copied[1] === 'first');
}

// --- 코드가 없으면 버튼도 없다 ---
{
  const M = load({ copy: () => Promise.resolve(true) });
  t('평범한 문단에는 버튼이 없다', M.render('그냥 문단이다').all(isBtn).length === 0);
}

// --- 실패를 삼키지 않는다 ---
{
  const M = load({ copy: () => Promise.resolve(false) });
  const b = M.render('```\nx\n```').all(isBtn)[0];
  b.fire('click'); await wait();
  t('실패하면 실패라고 보여준다', iconKind(b) === 'fail' && b.dataset.state === 'fail');
  t('실패도 이름으로 알린다', b.attrs['aria-label'] === '복사 실패');
}
{
  const M = load({ copy: () => Promise.reject(new Error('nope')) });
  const b = M.render('```\nx\n```').all(isBtn)[0];
  b.fire('click'); await wait();
  t('예외가 터져도 화면이 멈추지 않는다', iconKind(b) === 'fail');
}
{
  const M = load({});                       // clipboard.copy 가 아직 없는 순간
  const b = M.render('```\nx\n```').all(isBtn)[0];
  b.fire('click'); await wait();
  t('copy 가 없어도 던지지 않는다', iconKind(b) === 'fail');
}

// --- 누른 순간의 값을 집는다 ---
{
  const copied = [];
  const M = load({ copy: (s) => { copied.push(s); return Promise.resolve(true); } });
  let cur = '처음';
  const b = M.copyBtn(() => cur, '복사');
  cur = '나중';
  b.fire('click'); await wait();
  t('만들 때가 아니라 누를 때 읽는다', copied[0] === '나중');
}

// --- 클릭이 밖으로 새지 않는다 ---
{
  const M = load({ copy: () => Promise.resolve(true) });
  const b = M.render('```\nx\n```').all(isBtn)[0];
  let stopped = false; let prevented = false;
  b.fire('click', { preventDefault: () => { prevented = true; }, stopPropagation: () => { stopped = true; } });
  await wait();
  t('전파를 막는다 (입력창 포커스를 뺏기지 않게)', stopped);
  t('기본 동작도 막는다', prevented);
}

// --- 정적: 연결되지 않은 가짜 힌트가 남아 있지 않다 ---
{
  const md = fs.readFileSync('src/content/markdown.js', 'utf8');
  const tty = fs.readFileSync('src/content/tty.js', 'utf8');
  const clip = fs.readFileSync('src/content/shell/clipboard.js', 'utf8');
  const css = fs.readFileSync('src/content/theme.js', 'utf8');
  t("동작하지 않는 'yank/write/open' 힌트를 걷어냈다", !/yank/.test(md));
  t('clipboard 가 클립보드를 맡는다', /async function copy\(/.test(clip) && /navigator\.clipboard/.test(clip));
  t('tty 에는 클립보드 코드가 없다', !/navigator\.clipboard/.test(tty));
  t('비동기 API 가 막히면 폴백이 있다', /execCommand\('copy'\)/.test(clip));
  t('copy 를 밖으로 내보낸다', /return \{ copy \};/.test(clip));
  t('스트리밍 중에는 버튼을 안 단다', /!m\.streaming && \(m\.text/.test(tty));
  t('안 보일 때는 클릭도 안 먹는다', /\.gt-meta \.gt-copy \{ opacity: 0; pointer-events: none; \}/.test(css));
  t('버튼은 정사각형 아이콘 칸', /width: 21px; height: 21px/.test(css));
}

let bad = 0;
results.forEach(([n, ok]) => { if (!ok) bad++; console.log(`  ${ok ? 'PASS' : 'FAIL'}  ${n}`); });
console.log(bad ? `\n${bad}건 실패` : '\n전부 통과');
process.exit(bad ? 1 : 0);
