// 굵게 · 기울임 · 취소선의 안쪽도 인라인으로 그리는가 (리뷰 2026-11-03).
// 예전에는 안쪽을 글자로 넣어 '**`npm install`**' 의 백틱, '**[링크](…)**' 의 링크 문법이 화면에 남았고,
// '***굵은 기울임***' 은 앞뒤에 * 가 남았다. '~~취소~~' 는 원문 그대로였다.
import fs from 'node:fs'; import vm from 'node:vm';

const results = []; const t = (n, ok) => results.push([n, ok]);

function makeDom() {
  const mk = (tag) => ({
    tag, className: '', children: [], attrs: {}, dataset: {}, style: {}, _t: '',
    get textContent() { return this._t || this.children.map((c) => c.textContent || '').join(''); },
    set textContent(v) { this._t = String(v); this.children = []; },
    get href() { return this.attrs.href; }, set href(v) { this.attrs.href = v; },
    appendChild(c) { this.children.push(c); return c; },
    setAttribute(k, v) { this.attrs[k] = v; }, addEventListener() {}, replaceChild() {}
  });
  return { createElement: mk, createElementNS: (ns, tg) => mk(tg),
    createTextNode: (x) => ({ tag: '#text', children: [], textContent: x }),
    createDocumentFragment: () => mk('#frag') };
}
const sb = { console, Object, Array, String, Number, JSON, RegExp, Math, URL, document: makeDom(), GT: { config: { get: () => 'number' } } };
sb.window = sb; sb.globalThis = sb;
vm.createContext(sb);
vm.runInContext(fs.readFileSync('src/content/markdown.js', 'utf8'), sb, { filename: 'markdown.js' });
const M = sb.GT.markdown;

// 노드 모양을 글로: strong(code(npm install)) " 로 설치"
const shape = (n) => n.children.length
  ? n.children.map((c) => (c.tag === '#text' ? JSON.stringify(c.textContent) : `${c.tag}(${shape(c)})`)).join(' ')
  : JSON.stringify(n.textContent);
const S = (src) => shape(M.inline(src));

{
  t('굵은 글씨 안 코드', S('**`npm install`** 로 설치') === 'strong(span("npm install")) " 로 설치"');
  t('굵은 글씨 안 링크', S('**[문서](https://a.com)** 참고') === 'strong(a("문서")) " 참고"');
  t('기울임 안 코드', S('*`x`* 값') === 'em(span("x")) " 값"');
  t('굵은 글씨 안 글자와 코드가 섞여도', S('**설치 (`brew install`)**') === 'strong("설치 (" span("brew install") ")")');
  t('굵은 기울임', S('***중요***') === 'strong(em("중요"))');
  t('취소선', S('~~옛 값~~ 새 값') === 'del("옛 값") " 새 값"');
  t('취소선 안 굵게', S('~~**굵게**~~') === 'del(strong("굵게"))');
  t('굵은 글씨 안 인용 번호도 이어 센다', (() => {
    const E = (p) => 'cite' + p + '';
    const f = M.inline('**결론' + E('a') + '** 그리고' + E('b'));
    const sups = []; const walk = (n) => { if (n.tag === 'sup') sups.push(n.textContent); (n.children || []).forEach(walk); }; walk(f);
    return sups.join(',') === '[1],[2]';
  })());
}

// 바뀌면 안 되는 것
{
  t('코드 안의 별표는 굵게가 아니다', S('`**x**`') === 'span("**x**")');
  t('이스케이프한 별표는 글자', S('\\*\\*굵지 않음\\*\\*') === '"*" "*" "굵지 않음" "*" "*"');
  t('평범한 굵게', S('**굵게**') === 'strong("굵게")');
  t('물결 하나는 취소선이 아니다', S('~대략~ 10분') === '"~대략~ 10분"');
}

{
  const theme = fs.readFileSync('src/content/theme.js', 'utf8');
  t('취소선 모양이 있다 (터미널 · 시트 공용 CSS)', /\.gt-strike \{ text-decoration: line-through; \}/.test(theme));
}

let bad = 0;
results.forEach(([n, ok]) => { if (!ok) bad++; console.log(`  ${ok ? 'PASS' : 'FAIL'}  ${n}`); });
console.log(bad ? `\n${bad}건 실패` : '\n전부 통과');
process.exit(bad ? 1 : 0);
