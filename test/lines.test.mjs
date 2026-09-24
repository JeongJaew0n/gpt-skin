// 줄 단위 마크다운과 행 단위 재조정 — 시트 스킨이 쓴다. 화면을 모르는 순수 함수다.
// docs/plan/2026-09-24-skin-architecture.md §3 (6단계) · docs/plan/2026-09-21-sheet-skin.md §3 · §4
import fs from 'node:fs'; import vm from 'node:vm';

const results = []; const t = (n, ok) => results.push([n, ok]);
const read = (f) => fs.readFileSync(f, 'utf8');

const sb = { console, Object, Array, String, JSON, RegExp, Map, Set, Math, document: {}, GT: { config: { get: () => 'domain' } } };
sb.window = sb; vm.createContext(sb);
vm.runInContext(read('src/content/markdown.js'), sb, { filename: 'markdown.js' });
vm.runInContext(read('src/content/renderplan.js'), sb, { filename: 'renderplan.js' });
const M = sb.GT.markdown, R = sb.GT.renderplan;
const L = (src) => JSON.parse(JSON.stringify(M.lines(src)));
const kinds = (src) => L(src).map((r) => r.kind).join(',');

// ---------------------------------------------------------------- 한 행에 한 줄
{
  t('빈 원문은 행이 없다', L('').length === 0);
  t('문단 하나는 한 행', kinds('안녕하세요') === 'text');
  t('여러 줄 문단은 이어 붙여 한 행', L('첫 줄\n둘째 줄')[0].text === '첫 줄 둘째 줄' && L('첫 줄\n둘째 줄').length === 1);
  t('빈 줄로 나뉜 문단은 두 행', kinds('a\n\nb') === 'text,text');
  t('빈 줄 자체는 행이 되지 않는다', L('a\n\n\n\nb').length === 2);

  const h = L('## 제목 **굵게**')[0];
  t('제목은 level 을 갖는다', h.kind === 'heading' && h.level === 2 && h.text === '제목 **굵게**');
  t('인라인은 원문 그대로 넘긴다 (그리는 쪽이 inline 한다)', /\*\*굵게\*\*/.test(h.text));

  const li = L('- 하나\n  - 둘\n1. 셋');
  t('목록 항목마다 한 행', li.length === 3 && li.every((r) => r.kind === 'item'));
  t('들여쓰기 깊이를 준다', li[0].depth === 0 && li[1].depth === 1);
  t('번호 목록도 항목', li[2].text === '셋');

  const code = L('```js\nconst a = 1;\n\n  b();\n```');
  t('코드는 줄마다 한 행', code.length === 3 && code.every((r) => r.kind === 'code'));
  t('코드의 빈 줄도 행이다', code[1].text === '');
  t('코드 들여쓰기가 살아 있다', code[2].text === '  b();');
  t('언어를 준다', code.every((r) => r.lang === 'js'));
  t('처음과 끝을 표시한다', code[0].start && !code[0].end && code[2].end && !code[2].start);
  const empty = L('```\n```');
  t('빈 코드 블록도 한 행', empty.length === 1 && empty[0].start && empty[0].end);
  t('닫히지 않은 코드(스트리밍 중)도 행이 된다', kinds('```\n진행 중') === 'code');

  const q = L('> 인용\n> > 안쪽\n\n밖');
  t('인용 깊이를 준다', q[0].quote === 1 && q[1].quote === 2 && q[2].quote === 0);

  const tb = L('| a | b |\n|---|---|\n| 1 | 2 |');
  t('표는 행마다 한 행, 구분줄은 뺀다', tb.length === 2 && tb.every((r) => r.kind === 'table'));
  t('칸을 준다', tb[1].cells.join() === '1,2');
  t('첫 행은 머리글', tb[0].header === true && tb[1].header === false);

  t('구분선은 한 행', kinds('---') === 'hr');
  t('섞인 원문의 순서를 지킨다', kinds('# h\n문단\n- i\n```\nc\n```\n> q\n---') === 'heading,text,item,code,text,hr');
}

// ---------------------------------------------------------------- 문법은 한 벌
{
  const src = read('src/content/markdown.js');
  t('코드 울타리 판별이 한 곳에만 있다', (src.match(/\/\^\\s\*```\+\\s\*\(\[\\w\+-\]\*\)\\s\*\$\//g) || []).length === 1);
  t('목록 판별이 한 곳에만 있다', (src.match(/\/\^\(\\s\*\)\(\[-\*\+\]\|\\d\+\[\.\)\]\)\\s\+\(\.\*\)\$\//g) || []).length === 1);
  t('터미널 렌더가 blocks() 를 쓴다', /function renderInto\(src, ctx\) \{\s*\n\s*const out = [^\n]+\n\s*blocks\(src\)\.forEach/.test(src));
  t('줄 단위 출력도 blocks() 를 쓴다', /function lines\(src, quote\) \{[\s\S]{0,120}blocks\(src\)\.forEach/.test(src));
  // blocks 의 결과가 lines 와 같은 순서·개수인지 (인용·코드·표를 펴기 전 기준)
  const b = JSON.parse(JSON.stringify(M.blocks('# h\n\n문단\n- i')));
  t('blocks 가 블록 목록을 준다', b.map((x) => x.type).join() === 'heading,para,item');
}

// ---------------------------------------------------------------- 행 단위 재조정
{
  const reply = '첫 문단입니다.\n\n- 항목 하나\n- 항목 둘\n\n```sh\ndocker compose up\ndocker ps\n```\n\n끝 문단.';
  let prev = [];
  let created = 0, maxPerTick = 0, rebuiltOld = false;
  for (let n = 1; n <= reply.length; n++) {
    const next = R.rows('m1', M.lines(reply.slice(0, n)), { epoch: 0 });
    const plan = R.reconcile(prev, next);
    const made = plan.ops.filter((o) => o.op === 'create');
    created += made.length;
    maxPerTick = Math.max(maxPerTick, made.length);
    // 마지막 두 행보다 앞의 행을 다시 만들었는가 — 코드 블록의 end 표시가 옮겨 가면 바로 앞 행이 바뀐다
    if (made.some((o) => o.index < next.length - 2)) rebuiltOld = true;
    prev = next;
  }
  const finalRows = prev.length;
  t('스트리밍 한 글자에 두 행 넘게 다시 만들지 않는다', maxPerTick <= 2);
  t('끝에서 두 행보다 앞은 다시 만들지 않는다', !rebuiltOld);
  t('메시지 단위로 다시 그릴 때보다 훨씬 적게 만든다', created < reply.length * finalRows / 4);

  const same = R.rows('m1', M.lines(reply), { epoch: 0 });
  t('같은 원문이면 전부 그대로', R.unchanged(R.reconcile(prev, same), prev));
  const cfg = R.rows('m1', M.lines(reply), { epoch: 1 });
  t('설정이 바뀌면 전부 다시', R.reconcile(prev, cfg).ops.every((o) => o.op === 'create'));
  const other = R.rows('m2', M.lines(reply), { epoch: 0 });
  t('키에 메시지가 들어간다 (다른 메시지 행과 섞이지 않는다)', R.reconcile(prev, other).remove.length === prev.length);
}

let bad = 0;
results.forEach(([n, ok]) => { if (!ok) bad++; console.log(`  ${ok ? 'PASS' : 'FAIL'}  ${n}`); });
console.log(bad ? `\n${bad}건 실패` : '\n전부 통과');
process.exit(bad ? 1 : 0);
