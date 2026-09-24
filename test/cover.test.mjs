// 원본 가리기와 스킨 호스트 — 가리는 스킨과 안 가리는 스킨이 같은 틀을 쓴다.
// docs/plan/2026-09-24-skin-architecture.md §2.5 (2단계)
import fs from 'node:fs'; import vm from 'node:vm';

const cover = fs.readFileSync('src/content/shell/cover.js', 'utf8');
const results = []; const t = (n, ok) => results.push([n, ok]);

// 필요한 만큼만 흉내 낸 document
function makeDoc() {
  const byId = new Map();
  const classes = new Set();
  const mk = (tag) => {
    const n = { tagName: tag, id: '', textContent: '', isConnected: false, shadowRoot: null,
      attachShadow() { this.shadowRoot = { textContent: 'old' }; return this.shadowRoot; },
      remove() { this.isConnected = false; byId.delete(this.id); } };
    return n;
  };
  const attach = (n) => { n.isConnected = true; if (n.id) byId.set(n.id, n); return n; };
  const doc = {
    createElement: mk,
    getElementById: (id) => byId.get(id) || null,
    head: { appendChild: attach },
    body: { appendChild: attach },
    documentElement: { classList: { add: (c) => classes.add(c), remove: (c) => classes.delete(c), contains: (c) => classes.has(c) } }
  };
  return { doc, classes, byId };
}

function load() {
  const d = makeDoc();
  const sb = { console, document: d.doc, GT: {} };
  vm.createContext(sb);
  vm.runInContext(cover, sb, { filename: 'cover.js' });
  return { C: sb.GT.cover, ...d };
}

{
  const { C, byId, classes } = load();
  C.apply(true);
  const st = byId.get(C.STYLE_ID);
  t('apply 가 페이지 스타일을 넣는다', !!st);
  t('가리는 스킨은 원본을 투명하게', /opacity: 0 !important/.test(st.textContent));
  t('가리는 스킨은 원본 클릭을 막는다', /body > \*:not\(#gpt-skin-host\) \{[^}]*pointer-events: none/.test(st.textContent));
  t('covers 가 참', C.covers === true);

  C.apply(false);
  t('스타일 요소는 하나를 재사용한다', byId.get(C.STYLE_ID) === st);
  t('안 가리는 스킨은 원본을 건드리지 않는다', !/opacity/.test(st.textContent) && !/body >/.test(st.textContent));
  t('안 가리는 스킨은 호스트가 클릭을 통과시킨다', /#gpt-skin-host \{[^}]*pointer-events: none/.test(st.textContent));
  t('covers 가 거짓', C.covers === false);
  t('어느 쪽이든 꺼져 있으면 호스트를 숨긴다', /html:not\(\.gpt-skin-on\) #gpt-skin-host \{ display: none; \}/.test(st.textContent));

  t('처음에는 꺼져 있다', C.isOn() === false);
  C.on();
  t('on 이 클래스를 단다', classes.has('gpt-skin-on') && C.isOn());
  C.off();
  t('off 가 클래스를 뗀다', !classes.has('gpt-skin-on') && !C.isOn());

  const a = C.host();
  t('host 가 호스트를 붙인다', a.host.isConnected && a.host.id === 'gpt-skin-host');
  t('shadow root 를 비워서 준다', a.shadow.textContent === '');
  a.shadow.textContent = 'drawn';
  const b = C.host();
  t('두 번째 host 는 같은 요소를 재사용한다', b.host === a.host);
  t('재사용할 때도 안을 비운다', b.shadow.textContent === '');

  C.on();
  C.remove();
  t('remove 가 클래스를 뗀다', !classes.has('gpt-skin-on'));
  t('remove 가 페이지 스타일을 지운다', !byId.get(C.STYLE_ID));
  t('remove 가 호스트를 지운다', !byId.get(C.HOST_ID));
}

// 가리기는 cover 한 곳에서만 — 다른 파일이 클래스나 스타일을 직접 만지면 스킨이 우회된다
{
  const walk = (d) => fs.readdirSync(d, { withFileTypes: true })
    .flatMap((e) => e.isDirectory() ? walk(`${d}/${e.name}`) : e.name.endsWith('.js') ? [`${d}/${e.name}`] : []);
  const files = walk('src/content').filter((f) => !f.endsWith('shell/cover.js'));
  const offenders = files.filter((f) => /gpt-skin-on|gpt-skin-page-style|gpt-skin-host|attachShadow/.test(fs.readFileSync(f, 'utf8')));
  t('가리기 식별자와 attachShadow 는 cover.js 에만 있다', offenders.length === 0);
  if (offenders.length) console.log('    ', offenders.join(', '));
}

let bad = 0;
results.forEach(([n, ok]) => { if (!ok) bad++; console.log(`  ${ok ? 'PASS' : 'FAIL'}  ${n}`); });
console.log(bad ? `\n${bad}건 실패` : '\n전부 통과');
process.exit(bad ? 1 : 0);
