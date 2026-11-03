// 번호 목록 — '1. 2. 3.' 이 번호 그대로 보이는가 (리뷰 2026-11-03).
// 예전에는 blocks() 가 표지를 버려 터미널 · 시트 모두 '· · ·' 로 그렸다. 원본(CommonMark)은 첫 항목의 번호에서
// 시작해 1씩 올린다 — 모든 항목을 '1.' 로 써도 1 · 2 · 3 이다.
import fs from 'node:fs'; import vm from 'node:vm';

const results = []; const t = (n, ok) => results.push([n, ok]);

function makeDom() {
  const mk = (tag) => ({
    tag, className: '', children: [], attrs: {}, dataset: {}, style: {}, _t: '',
    get textContent() { return this._t || this.children.map((c) => c.textContent || '').join(''); },
    set textContent(v) { this._t = String(v); this.children = []; },
    appendChild(c) { this.children.push(c); return c; },
    setAttribute(k, v) { this.attrs[k] = v; }, addEventListener() {}, replaceChild() {},
    all(pred, acc) { acc = acc || []; if (pred(this)) acc.push(this); this.children.forEach((c) => c.all && c.all(pred, acc)); return acc; }
  });
  return { createElement: mk, createElementNS: (ns, tg) => mk(tg),
    createTextNode: (x) => ({ tag: '#text', children: [], textContent: x, all: (p, a) => a || [] }),
    createDocumentFragment: () => mk('#frag') };
}

const sb = { console, Object, Array, String, Number, JSON, RegExp, Math, URL, document: makeDom(), GT: { config: { get: () => 'domain' } } };
sb.window = sb; sb.globalThis = sb;
vm.createContext(sb);
vm.runInContext(fs.readFileSync('src/content/markdown.js', 'utf8'), sb, { filename: 'markdown.js' });
const M = sb.GT.markdown;

const nums = (src) => M.blocks(src).filter((b) => b.type === 'item').map((b) => (b.num == null ? '·' : b.num)).join(' ');
const marks = (src) => M.render(src).all((n) => n.className === 'gt-bullet').map((n) => n.textContent).join(' ');

// ---------------------------------------------------------------- 번호
{
  t('번호 그대로', nums('1. 하나\n2. 둘\n3. 셋') === '1 2 3');
  t('모두 1. 이어도 1 · 2 · 3 (CommonMark)', nums('1. 하나\n1. 둘\n1. 셋') === '1 2 3');
  t('시작 번호를 따른다', nums('5. 다섯\n6. 여섯') === '5 6');
  t('괄호 표지도 번호 목록', nums('1) 하나\n2) 둘') === '1 2');
  t('글머리 목록은 번호가 없다', nums('- 가\n* 나\n+ 다') === '· · ·');
}

// ---------------------------------------------------------------- 이어짐 · 끊김
{
  t('하위 글머리를 지나도 이어진다', nums('1. 하나\n   - 가\n   - 나\n2. 둘') === '1 · · 2');
  t('하위 번호 목록은 따로 센다', nums('1. 하나\n   1. 가\n   2. 나\n2. 둘\n   1. 다') === '1 1 2 2 1');
  t('빈 줄로 띄운 항목도 이어진다', nums('1. 하나\n\n2. 둘\n\n1. 셋') === '1 2 3');
  t('들여쓴 문단 · 코드를 지나도 이어진다', nums('1. 하나\n\n   설명 문단\n\n   ```bash\n   ls\n   ```\n2. 둘') === '1 2');
  t('들여쓰지 않은 문단이 끼면 새 목록', nums('1. 하나\n\n문단\n\n1. 새로') === '1 1');
  t('제목이 끼면 새 목록', nums('1. 하나\n## 제목\n1. 새로') === '1 1');
  t('들여쓰지 않은 코드가 끼면 새 목록 (그 뒤 번호는 원문을 따른다)', nums('1. 하나\n```\nx\n```\n2. 둘') === '1 2'
    && nums('1. 하나\n```\nx\n```\n1. 둘') === '1 1');
  t('같은 깊이에서 글머리로 바뀌면 새 목록', nums('1. 하나\n- 가\n1. 새로') === '1 · 1');
  t('인용 안 목록은 따로 센다', nums('1. 하나') === '1' && marks('> 3. 셋\n> 4. 넷') === '3. 4.');
}

// ---------------------------------------------------------------- 그리기 (터미널 · 시트 같은 표지)
{
  t('터미널: 번호 목록은 번호를 그린다', marks('1. 하나\n2. 둘') === '1. 2.');
  t('터미널: 글머리는 · ▸ 그대로', marks('- 가\n  - 나') === '· ▸');
  const rows = JSON.parse(JSON.stringify(M.lines('1. 하나\n   - 가\n2. 둘')));
  t('시트 행에 번호가 실린다', rows.map((r) => (r.num == null ? '·' : r.num)).join(' ') === '1 · 2');
  const B = typeof M.bullet === 'function' ? M.bullet : () => null;
  t('시트와 같은 표지 함수', B({ num: 3, depth: 0 }) === '3.' && B({ num: null, depth: 0 }) === '·' && B({ num: null, depth: 1 }) === '▸');
  const sheet = fs.readFileSync('src/content/skins/sheet.js', 'utf8');
  t('시트가 표지 함수를 쓴다', /el\('span', 'gs-bullet', GT\.markdown\.bullet\(r\) \+ ' '\)/.test(sheet));
}

let bad = 0;
results.forEach(([n, ok]) => { if (!ok) bad++; console.log(`  ${ok ? 'PASS' : 'FAIL'}  ${n}`); });
console.log(bad ? `\n${bad}건 실패` : '\n전부 통과');
process.exit(bad ? 1 : 0);
