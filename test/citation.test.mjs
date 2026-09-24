// 인용 마커. 같은 인용이 경로마다 다른 표기로 오고, 출처는 메타에만 있다.
// docs/issue/2026-09-04-citation-markers-shown-raw.md
import fs from 'node:fs'; import vm from 'node:vm';

const E200 = '', E201 = '', E202 = '';
const pua = (kind, payload) => E200 + kind + (payload === undefined ? '' : E202 + payload) + E201;
const oai = (n) => `:contentReference[oaicite:${n}]{index=${n}}`;

function makeDom() {
  const mk = (tag) => ({
    tag, className: '', children: [], attrs: {}, dataset: {}, style: {}, _t: '',
    get textContent() { return this._t || this.children.map((c) => c.textContent || '').join(''); },
    set textContent(v) { this._t = String(v); this.children = []; },
    get title() { return this.attrs.title; }, set title(v) { this.attrs.title = v; },
    get href() { return this.attrs.href; }, set href(v) { this.attrs.href = v; },
    appendChild(c) { this.children.push(c); return c; },
    setAttribute(k, v) { this.attrs[k] = v; }, addEventListener() {}, replaceChild() {},
    all(pred, acc) { acc = acc || []; if (pred(this)) acc.push(this);
      this.children.forEach((c) => c.all && c.all(pred, acc)); return acc; }
  });
  return { createElement: mk, createElementNS: (ns, t) => mk(t),
    createTextNode: (t) => ({ tag: '#text', children: [], textContent: t, all: (p, a) => a || [] }),
    createDocumentFragment: () => mk('#frag') };
}

function load() {
  // URL 을 넣어야 도메인 추출이 실제로 돈다. 없으면 hostOf 의 catch 가 삼켜
  // 늘 번호만 나오고, 그러면 이 파일이 아무것도 검증하지 못한다.
  const sandbox = { console, Object, Array, String, Number, Boolean, JSON, Math, Promise, Error, RegExp, Date, URL,
    document: makeDom(), setTimeout };
  sandbox.window = sandbox; sandbox.globalThis = sandbox; sandbox.GT = {};
  vm.createContext(sandbox);
  vm.runInContext(fs.readFileSync('src/content/markdown.js', 'utf8'), sandbox, { filename: 'markdown.js' });
  return { M: sandbox.GT.markdown, GT: sandbox.GT };
}

const loaded = load();
const M = loaded.M;
// 설정이 아예 없는 상태가 기본값 경로다. mode(v) 로 갈아 끼운다.
const mode = (v) => { loaded.GT.config = v === null ? undefined : { get: (k) => (k === 'citations' ? v : undefined) }; };
const results = []; const t = (n, ok) => results.push([n, ok]);
const cls = (c) => (n) => new RegExp('(^| )' + c + '( |$)').test(n.className || '');
const text = (frag) => frag.textContent;
const cites = (frag) => frag.all(cls('gt-cite'));
const links = (frag) => frag.all((n) => n.tag === 'a' && /gt-cite-link/.test(n.className || ''));

const REF = (over) => Object.assign({
  type: 'grouped_webpages', matched: '', title: '기사 제목', url: 'https://example.com/a', attribution: 'ZDNet'
}, over || {});

// 아래 블록들은 번호 매김·마커 처리를 본다. 표기는 number 로 고정해 둔다 —
// 도메인이 붙고 안 붙고는 바로 아래 전용 블록에서 따로 본다.
mode('number');

// --- 두 표기 모두 각주가 된다 ---
{
  const refs = [REF()];
  const a = M.render('앞 ' + pua('cite', 'turn0search1') + ' 뒤', { refs });
  const b = M.render('앞 ' + oai(0) + ' 뒤', { refs });
  t('PUA 표기를 각주로 바꾼다', cites(a).length === 1 && cites(a)[0].textContent === '[1]');
  t('fiber 표기도 각주로 바꾼다', cites(b).length === 1 && cites(b)[0].textContent === '[1]');
  t('PUA 원문이 본문에 남지 않는다', !text(a).includes(E200) && !text(a).includes('cite'));
  t('fiber 원문이 본문에 남지 않는다', !text(b).includes('contentReference'));
  t('앞뒤 글자는 그대로', /앞 .*뒤/.test(text(a)) && /앞 .*뒤/.test(text(b)));
  t('두 표기의 결과가 같다', text(a) === text(b));
}

// --- 번호 자체가 링크다 (하단 목록은 없다) ---
{
  const frag = M.render('본문 ' + pua('cite', 'turn0search1'), { refs: [REF()] });
  const a = links(frag);
  t('번호가 링크가 된다', a.length === 1);
  // 없을 때 크래시로 죽으면 이 파일의 나머지 검사가 안 돈다. 빈 객체로 받는다.
  const one = a[0] || {};
  t('링크 글자는 번호', one.textContent === '[1]');
  t('주소가 그 출처를 가리킨다', one.href === 'https://example.com/a');
  // target·rel 은 setAttribute 가 아니라 프로퍼티로 넣는다
  t('새 탭으로 열고 referrer 를 안 준다',
    one.target === '_blank' && /noreferrer/.test(one.rel || ''));
  t('호버하면 출처 이름이 보인다', /ZDNet/.test(one.title || ''));

  t('하단 출처 목록을 만들지 않는다', frag.all(cls('gt-sources')).length === 0);
  t('본문에 출처 이름이 늘어붙지 않는다', !/ZDNet/.test(text(frag)));
  t('본문은 번호만', text(frag) === '본문 [1]');
}

// --- 주소를 모르면 번호만 (스트리밍 중이 그렇다) ---
{
  const frag = M.render('본문 ' + pua('cite', 'turn0search1'));
  t('refs 가 없어도 마커는 지운다', !text(frag).includes(E200));
  t('번호는 남긴다', cites(frag).length === 1);
  t('링크로 만들지 않는다', links(frag).length === 0);
  t('그래도 번호는 보인다', (cites(frag)[0] || {}).textContent === '[1]');
}
{
  const frag = M.render('본문 ' + pua('cite', 'x'), { refs: [REF({ title: '', url: '', attribution: '' })] });
  t('내용 없는 ref 는 링크가 아니다', links(frag).length === 0);
  t('그래도 번호는 매긴다', cites(frag).length === 1);
}
{
  // http(s) 가 아닌 주소는 링크로 만들지 않는다
  const frag = M.render('본문' + pua('cite', 'x'), { refs: [REF({ url: 'javascript:alert(1)' })] });
  t('http(s) 아닌 주소는 링크로 만들지 않는다', links(frag).length === 0);
  t('번호는 남는다', cites(frag).length === 1);
}

// --- 도메인을 같이 보여준다 ---
// 호버하기 전에는 어디로 가는지 알 수 없던 것을 고친 것이다.
// docs/plan/2026-09-09-cite-label-and-history.md
{
  mode(null);   // 설정이 없는 상태 = 기본값
  const frag = M.render('본문 ' + pua('cite', 'a'), { refs: [REF()] });
  const one = links(frag)[0] || {};
  t('기본값이 도메인이다', one.textContent === '[1 example.com]');
  t('주소는 그대로 그 출처', one.href === 'https://example.com/a');
  t('새 탭·noreferrer 도 그대로', one.target === '_blank' && /noreferrer/.test(one.rel || ''));
  t('호버 문구는 여전히 이름 — 주소', /^ZDNet — https:/.test(one.title || ''));
  t('위첨자를 푼다', (cites(frag)[0] || { dataset: {} }).dataset.wide === '1');
}
{
  mode('domain');
  const refs = [REF({ url: 'https://www.etnews.com/x' }), REF({ url: 'https://it.chosun.com/y' })];
  const frag = M.render(pua('cite', 'a') + ' ' + pua('cite', 'b'), { refs });
  const a = links(frag).map((n) => n.textContent);
  t('www 는 뗀다', a[0] === '[1 etnews.com]');
  t('서브도메인은 남긴다', a[1] === '[2 it.chosun.com]');
}
{
  mode('domain');
  // 주소가 깨졌거나 없으면 new URL 이 던진다 — 번호만 남고 위첨자로 돌아간다
  const frag = M.render('본문 ' + pua('cite', 'a'), { refs: [REF({ url: 'http://' })] });
  t('깨진 주소에 던지지 않는다', cites(frag).length === 1);
  t('그때는 번호만', (cites(frag)[0] || {}).textContent === '[1]');
  t('위첨자로 남는다', (cites(frag)[0] || { dataset: {} }).dataset.wide === undefined);

  const streaming = M.render('본문 ' + pua('cite', 'a'));   // refs 가 아직 없다
  t('스트리밍 중에는 번호만', (cites(streaming)[0] || {}).textContent === '[1]');
}
{
  mode('off');
  const frag = M.render('앞 ' + pua('cite', 'a') + ' 뒤 ' + pua('cite', 'b'), { refs: [REF(), REF()] });
  t('off 면 아무것도 안 남는다', cites(frag).length === 0 && links(frag).length === 0);
  t('마커는 지운다', !text(frag).includes(E200));
  t('본문은 그대로', text(frag) === '앞  뒤 ');
}
{
  mode('처음보는값');
  const frag = M.render('본문 ' + pua('cite', 'a'), { refs: [REF()] });
  t('모르는 값이면 기본값으로 돈다', (links(frag)[0] || {}).textContent === '[1 example.com]');
}
{
  mode('domain');
  // 한 응답 안에서 표기가 섞이면 안 된다 — 렌더 시작 때 한 번만 읽는다
  const opts = { refs: [REF(), REF()], mode: 'number' };
  const frag = M.render(pua('cite', 'a') + pua('cite', 'b'), opts);
  t('opts.mode 가 설정을 이긴다', links(frag).map((n) => n.textContent).join('') === '[1][2]');
}
mode('number');

// --- url 봉투는 본문 링크다 (인용 번호가 아니다) ---
// docs/issue/2026-09-09-url-marker-dropped.md
const URLREF = (over) => Object.assign({
  type: 'url', matched_text: 'urldocker.comhttps://www.docker.com/',
  alt: '[docker.com](https://www.docker.com/?utm_source=chatgpt.com)'
}, over || {});
const links2 = (frag) => frag.all((n) => n.tag === 'a' && /gt-link/.test(n.className || ''));
{
  mode('domain');
  // 실측 모양: \uE200url\uE202<보여줄 글자>\uE202<주소>\uE201 — \uE202 가 두 번이다
  const env = E200 + 'url' + E202 + 'docker.com' + E202 + 'https://www.docker.com/' + E201;
  const frag = M.render('Docker 공식 사이트: ' + env, { refs: [URLREF()] });
  const a = links2(frag)[0] || {};
  t('url 봉투를 링크로 그린다', links2(frag).length === 1);
  t('보여줄 글자가 링크 글자', a.textContent === 'docker.com');
  t('봉투가 준 주소를 쓴다', a.href === 'https://www.docker.com/');
  t('새 탭·noreferrer', a.target === '_blank' && /noreferrer/.test(a.rel || ''));
  t('인용 번호를 매기지 않는다', cites(frag).length === 0);
  t('본문에 봉투가 남지 않는다', !text(frag).includes(E200) && !text(frag).includes(E202));
  t('앞 글자는 그대로', text(frag) === 'Docker 공식 사이트: docker.com');
}
{
  mode('domain');
  // refs 가 없는 순간(스트리밍 중)에도 봉투만으로 링크가 된다
  const env = E200 + 'url' + E202 + 'kubernetes.io' + E202 + 'https://kubernetes.io/' + E201;
  const frag = M.render('앞 ' + env, {});
  const a = links2(frag)[0] || {};
  t('refs 없이도 링크가 된다', a.href === 'https://kubernetes.io/');
  t('글자도 봉투에서 온다', a.textContent === 'kubernetes.io');
}
{
  mode('domain');
  // fiber 표기에는 봉투가 없다. refs[n].alt 를 읽어야 한다
  const frag = M.render('앞 ' + oai(0), { refs: [URLREF()] });
  const a = links2(frag)[0] || {};
  t('fiber 표기도 링크가 된다', links2(frag).length === 1);
  t('alt 의 글자를 쓴다', a.textContent === 'docker.com');
  t('alt 의 주소를 쓴다', a.href === 'https://www.docker.com/?utm_source=chatgpt.com');
  t('여기서도 번호를 안 매긴다', cites(frag).length === 0);
}
{
  mode('domain');
  // 여러 개가 이어져도, cite 와 섞여도
  const mk = (l, u) => E200 + 'url' + E202 + l + E202 + u + E201;
  const refs = [URLREF(), URLREF({ alt: '[hub.docker.com](https://hub.docker.com/)' }), REF()];
  const src = 'a ' + mk('docker.com', 'https://www.docker.com/')
    + ' b ' + mk('hub.docker.com', 'https://hub.docker.com/')
    + ' c ' + pua('cite', 'turn0search1');
  const frag = M.render(src, { refs });
  t('url 링크 둘', links2(frag).length === 2);
  t('cite 는 여전히 번호', cites(frag).length === 1);
  t('url 이 인용 번호를 밀지 않는다', (links(frag)[0] || {}).textContent === '[1 example.com]');
}
{
  mode('domain');
  // 주소를 못 읽으면 눌리지 않는 가짜 링크를 만들지 않는다
  const bad = E200 + 'url' + E202 + 'docker.com' + E202 + 'javascript:alert(1)' + E201;
  const frag = M.render('앞 ' + bad + ' 뒤', { refs: [URLREF({ alt: '' })] });
  t('http(s) 아니면 링크로 만들지 않는다', links2(frag).length === 0);
  t('글자만 남기지도 않는다', text(frag) === '앞  뒤');

  const noPayload = E200 + 'url' + E201;   // 구분자가 아예 없는 봉투
  const f2 = M.render('앞' + noPayload, { refs: [URLREF({ alt: '깨진 값' })] });
  t('alt 가 링크 모양이 아니면 지운다', links2(f2).length === 0 && text(f2) === '앞');
}
{
  mode('off');
  const env = E200 + 'url' + E202 + 'docker.com' + E202 + 'https://www.docker.com/' + E201;
  const frag = M.render('앞 ' + env, { refs: [URLREF()] });
  t('citations off 여도 본문 링크는 남는다', links2(frag).length === 1);
}
mode('number');

// --- 인용이 아닌 봉투는 지운다 ---
{
  const frag = M.render('앞' + pua('genui', '{"suggest_automation":{"label":"x"}}') + '뒤');
  t('genui 봉투를 지운다', text(frag) === '앞뒤');
  t('각주를 매기지 않는다', cites(frag).length === 0);
}
{
  // 실측된 조합: cite 4개 뒤에 genui 1개, content_references 는 그 순서 그대로
  const refs = [REF(), REF(), REF(), REF(), REF({ type: 'dil', title: '', url: '', attribution: '' })];
  const src = ['a' + pua('cite', 't0search17'), 'b' + pua('cite', 't0view0'),
    'c' + pua('cite', 't0news27'), 'd' + pua('cite', 't0view0'),
    'e' + pua('genui', '{"x":1}')].join(' ');
  const frag = M.render(src, { refs });
  t('인용 4개만 번호를 받는다', cites(frag).length === 4);
  t('번호가 1..4', cites(frag).map((c) => c.textContent).join('') === '[1][2][3][4]');
  t('genui 는 빠진다', !text(frag).includes('genui'));
  t('넷 다 링크', links(frag).length === 4);
}

// --- 마커 순서가 content_references 인덱스다 ---
{
  const refs = [REF({ attribution: '첫째' }), REF({ attribution: '둘째' })];
  const frag = M.render(pua('cite', 'a') + ' 그리고 ' + pua('cite', 'b'), { refs });
  const a = links(frag).map((n) => n.title || '');
  t('첫 마커가 refs[0]', /첫째/.test(a[0] || ''));
  t('둘째 마커가 refs[1]', /둘째/.test(a[1] || ''));
}
{
  // fiber 표기는 index 를 스스로 들고 있다 — 순서가 아니라 그 값을 쓴다
  const refs = [REF({ attribution: '첫째' }), REF({ attribution: '둘째' })];
  const frag = M.render(oai(1), { refs });
  t('fiber 는 index 로 찾는다', /둘째/.test((links(frag)[0] || {}).title || ''));
}

// --- 모르는 타입은 각주를 매기지 않는다 ---
{
  const frag = M.render('본문' + pua('cite', 'x'), { refs: [REF({ type: '처음보는type' })] });
  t('모르는 type 은 지우기만 한다', cites(frag).length === 0 && !text(frag).includes(E200));
}

// --- 다른 블록 안에서도 동작한다 ---
{
  const refs = [REF(), REF()];
  const frag = M.render('- 목록 ' + pua('cite', 'a') + '\n\n> 인용문 ' + pua('cite', 'b'), { refs });
  t('리스트·인용문 안의 마커도 처리한다', cites(frag).length === 2);
  t('번호가 이어진다', cites(frag).map((c) => c.textContent).join('') === '[1][2]');
  t('블록 안에서도 링크가 된다', links(frag).length === 2);
}

// --- 마커가 없으면 아무것도 붙이지 않는다 ---
{
  const frag = M.render('평범한 문단이다.', { refs: [REF()] });
  t('마커가 없으면 아무것도 안 붙는다', links(frag).length === 0 && cites(frag).length === 0);
}

// --- 하단 목록은 아예 만들지 않는다 (정적) ---
{
  const md = fs.readFileSync('src/content/markdown.js', 'utf8');
  const css = fs.readFileSync('src/content/theme.js', 'utf8');
  t('출처 목록을 만드는 코드가 없다', !/sourceList|gt-sources/.test(md));
  t('죽은 CSS 도 없다', !/\.gt-sources|\.gt-source-n/.test(css));
  t('번호를 링크로 만든다', /el\('a', 'gt-cite-link'/.test(md));
  t('왜 목록을 안 두는지 적어뒀다', /논문 각주처럼 두 번 읽게 만들 이유가 없다/.test(md));
  t('링크 스타일이 있다', /\.gt-cite-link/.test(css));
  t('도메인일 때 위첨자를 푸는 CSS 가 있다', /\.gt-cite\[data-wide\]/.test(css));
  t('www 를 떼는 규칙이 있다', /replace\(\/\^www\\\.\/i, ''\)/.test(md));
  t('citations 설정을 읽는다', /get\('citations'\)/.test(md));
}

// --- 설정 항목이 실제로 있다 ---
{
  const def = fs.readFileSync('src/shared/defaults.js', 'utf8');
  const i18n = fs.readFileSync('src/shared/i18n.js', 'utf8');
  t('스키마에 citations 가 있다', /key: 'citations', type: 'enum', def: 'domain'/.test(def));
  t('세 값을 고를 수 있다', /choices: \['domain', 'number', 'off'\]/.test(def));
  t('한국어 문구가 있다', /'opt\.citations\.choice\.domain': '번호 \+ 도메인/.test(i18n));
  t('영어 문구도 있다', /'opt\.citations\.choice\.domain': 'Number \+ domain/.test(i18n));
  const keys = ['label', 'help', 'choice.domain', 'choice.number', 'choice.off'];
  const n = keys.filter((k) => (i18n.match(new RegExp("'opt\\.citations\\." + k.replace('.', '\\.') + "'", 'g')) || []).length === 2);
  t('두 언어에 다섯 키가 다 있다', n.length === keys.length);
}

// --- 배선 ---
{
  const conv = fs.readFileSync('src/content/conversation.js', 'utf8');
  const tty = fs.readFileSync('src/content/skins/terminal.js', 'utf8');
  const plan = fs.readFileSync('src/content/renderplan.js', 'utf8');
  const store = fs.readFileSync('src/content/store.js', 'utf8');
  t('API 가 content_references 를 실어준다', /content_references/.test(conv) && /refs: toRefs\(m\.metadata\)/.test(conv));
  t('tty 가 refs 를 넘긴다', /render\(m\.text \|\| '', \{ refs: m\.refs \}\)/.test(tty));
  t('서명에 refs 를 넣는다', /m\.refs \? m\.refs\.length : -1/.test(plan));
  t('수확이 refs 를 지운다면 각주가 죽는다 — 지키게 했다', /old\.refs && !m\.refs/.test(store));
}

// --- 두 표기를 걷어내면 같아진다 (드리프트 대조가 이걸 쓴다) ---
// docs/issue/2026-09-08-drift-warning-false-positive.md
{
  const body = '앞부분 텍스트 ';
  const tail = ' 뒷부분 텍스트';
  const streamed = body + pua('cite', 'turn692576search1') + tail;   // SSE·API 표기
  const fibered = body + oai(0) + tail;                              // fiber 표기

  t('두 표기의 길이가 애초에 다르다', streamed.length !== fibered.length);
  t('걷어내면 같아진다', M.stripMarks(streamed) === M.stripMarks(fibered));
  t('마커만 사라지고 본문은 그대로', M.stripMarks(streamed) === body + tail);

  // 인용이 여러 개여도, genui 같은 다른 봉투가 섞여도
  const many = body + pua('cite', 'a') + '가운데' + pua('genui', '{"x":1}') + tail + oai(3);
  t('여러 봉투를 다 걷어낸다', M.stripMarks(many) === body + '가운데' + tail);
  t('PUA 가 남지 않는다', !/[\uE200-\uE20F]/.test(M.stripMarks(many)));
  t('contentReference 가 남지 않는다', !/contentReference/.test(M.stripMarks(many)));

  t('마커가 없으면 그대로', M.stripMarks('평범한 본문') === '평범한 본문');
  t('빈 값도 처리한다', M.stripMarks('') === '' && M.stripMarks(null) === '');
}

// --- 원본이 남기는 앞 콜론 (2026-09-15 실측) ---
// image_group 같은 봉투를 치환할 때 '::contentReference…' 로 콜론이 하나 더 붙는다.
// 안 먹으면 화면에 콜론이 떠 있고 드리프트 대조도 어긋난다.
// docs/issue/2026-09-15-drift-warning-on-most-chats.md
{
  const doubled = '앞 :' + oai(4) + ' 뒤';
  t('연속된 콜론까지 걷어낸다', M.stripMarks(doubled) === '앞  뒤');
  t('콜론이 하나면 그대로 걷어낸다', M.stripMarks('앞 ' + oai(4) + ' 뒤') === '앞  뒤');

  // 의미 있는 콜론까지 먹으면 안 된다 — 사이에 공백이 있으면 마커의 일부가 아니다
  t('떨어진 콜론은 남긴다', M.stripMarks('설명: ' + oai(0) + ' 끝') === '설명:  끝');

  // 렌더 경로에서도 같아야 한다. 화면에 콜론이 남으면 안 된다.
  mode('number');
  const frag = M.render('본문 :' + oai(0), { refs: [REF()] });
  t('화면에도 콜론이 남지 않는다', text(frag) === '본문 [1]');
}

// --- 실측한 다섯 봉투를 모두 걷어낸다 (2026-09-15) ---
// 2026-09-08 에 고칠 때는 cite 하나만 알고 있었다. 표본 478개 응답에서 다섯이 나왔다.
{
  const KINDS = ['cite', 'entity', 'image_group', 'memcite', 'genui'];
  const body = KINDS.map((k) => '가' + pua(k, k === 'memcite' ? undefined : '{"x":1}')).join('');
  const out = M.stripMarks(body);
  t('다섯 봉투를 다 걷어낸다', out === '가'.repeat(KINDS.length));
  t('PUA 가 남지 않는다', !/[\uE200-\uE20F]/.test(out));
  // payload 없는 봉투(memcite 가 그랬다)도 걷어낸다
  t('payload 없는 봉투도 지운다', M.stripMarks('앞' + E200 + 'memcite' + E201 + '뒤') === '앞뒤');
}

let bad = 0;
results.forEach(([n, ok]) => { if (!ok) bad++; console.log(`  ${ok ? 'PASS' : 'FAIL'}  ${n}`); });
console.log(bad ? `\n${bad}건 실패` : '\n전부 통과');
process.exit(bad ? 1 : 0);
