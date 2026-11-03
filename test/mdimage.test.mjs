// 마크다운 그림 ![대체 글](주소) (리뷰 2026-11-03, 크롬 · gpt-6-thinking 실측).
// 코드 실행으로 만든 그림의 답이 '![귀여운 토끼 얼굴 아이콘](sandbox:/mnt/data/….png)' 한 줄로 왔는데, 링크 규칙이
// [대체 글](주소) 만 먹어 '!' 가 남고 sandbox: 주소는 눌리지 않는 링크(#)가 됐다 — '!귀여운 토끼 얼굴 아이콘'.
import fs from 'node:fs'; import vm from 'node:vm';

const results = []; const t = (n, ok) => results.push([n, ok]);
const mk = (tag) => ({
  tag, className: '', children: [], attrs: {}, dataset: {}, style: {}, _t: '',
  get textContent() { return this._t || this.children.map((c) => c.textContent || '').join(''); },
  set textContent(v) { this._t = String(v); this.children = []; },
  get href() { return this.attrs.href; }, set href(v) { this.attrs.href = v; },
  appendChild(c) { this.children.push(c); return c; }, setAttribute(k, v) { this.attrs[k] = v; }, addEventListener() {}
});
const sb = { console, Object, Array, String, Number, JSON, RegExp, Math, URL,
  document: { createElement: mk, createElementNS: (n, tg) => mk(tg), createTextNode: (x) => ({ tag: '#text', children: [], textContent: x }), createDocumentFragment: () => mk('#frag') },
  GT: { config: { get: () => 'domain' } } };
sb.window = sb; sb.globalThis = sb;
vm.createContext(sb);
vm.runInContext(fs.readFileSync('src/shared/i18n.js', 'utf8'), sb, { filename: 'i18n.js' });
vm.runInContext(fs.readFileSync('src/content/markdown.js', 'utf8'), sb, { filename: 'markdown.js' });
const M = sb.GT.markdown;
const nodes = (src) => M.inline(src).children;

{
  const n = nodes('![귀여운 토끼 얼굴 아이콘](sandbox:/mnt/data/귀여운_토끼_얼굴_아이콘.png)');
  t('sandbox 그림은 한 덩어리 자리 글자다 (! 가 남지 않는다)', n.length === 1 && n[0].tag === 'span' && /gt-img-ref/.test(n[0].className));
  t('자리 글자에 대체 글이 있다', /귀여운 토끼 얼굴 아이콘/.test(n[0].textContent) && !/^!/.test(n[0].textContent));
  t('열 수 없는 주소는 링크로 만들지 않는다', n[0].tag !== 'a');
}
{
  const n = nodes('![로고](https://example.com/logo.png) 끝');
  t('http 그림은 링크로 (불러오지 않는다)', n[0].tag === 'a' && n[0].href === 'https://example.com/logo.png' && /로고/.test(n[0].textContent));
  t('뒤 글은 그대로', n[1].textContent === ' 끝');
}
{
  const n = nodes('![](sandbox:/mnt/data/chart.png)');
  t('대체 글이 없으면 파일 이름을 쓴다', /chart\.png/.test(n[0].textContent));
}
{
  const n = nodes('[문서](https://a.example/doc)');
  t('평범한 링크는 그대로', n.length === 1 && n[0].tag === 'a' && n[0].textContent === '문서');
}
{
  const i18n = fs.readFileSync('src/shared/i18n.js', 'utf8');
  t('문구가 ko · en 사전에 있다', (i18n.match(/'img\.ref\.local':/g) || []).length === 2 && (i18n.match(/'img\.ref':/g) || []).length === 2);
}

let bad = 0;
results.forEach(([n, ok]) => { if (!ok) bad++; console.log(`  ${ok ? 'PASS' : 'FAIL'}  ${n}`); });
console.log(bad ? `\n${bad}건 실패` : '\n전부 통과');
process.exit(bad ? 1 : 0);
