// gpt-skin — :messup 이 끼워 넣는 가짜 출력 생성기.
//
// 화면에만 끼워 넣는다. 서버로 가지 않고 대화 기록에도 안 남는다.
// 바쁜 척하는 용도다 — 그래서 '있어 보이는' 모양을 쓴다.
// 스킨마다 맛이 다르다. 스킨 정의의 messup 필드가 고른다 (없으면 terminal).
//   terminal  빌드 로그 · 해시 · ts 코드
//   sheet     스프레드시트 작업 — 수식 · 계산 상태 · 회계 서식 표 · 매크로
// 결과는 마크다운 한 덩어리다. sheet 전용 모양은 코드 펜스 이름으로 전한다:
//   ```formula 수식 행 · ```calc 계산 상태 · ```vba 매크로
// 제품 이름(Excel 등)은 넣지 않는다 — 심사에서 상표·사칭으로 읽힐 수 있다.
// docs/plan/2026-10-01-sheet-messup.md
GT.messup = (function () {
  'use strict';

  const pick = (a) => a[Math.floor(Math.random() * a.length)];
  const hex = (n) => Array.from({ length: n }, () => '0123456789abcdef'[Math.floor(Math.random() * 16)]).join('');
  const num = (a, b) => a + Math.floor(Math.random() * (b - a + 1));
  const ms = () => (Math.random() * 900 + 12).toFixed(1);

  const NOUNS = ['kernel', 'shard', 'pipeline', 'lattice', 'vector', 'planner', 'reducer',
    'quorum', 'ledger', 'tensor', 'segment', 'manifold', 'router', 'cache'];
  const VERBS = ['reticulating', 'transposing', 'annealing', 'quantizing', 'rebalancing',
    'compacting', 'gossiping', 'coalescing', 'vectorizing', 'defragmenting'];
  const UNITS = ['MiB', 'ops/s', 'μs', 'shards', 'blocks', 'frames'];

  const LOG = () => `\`\`\`log
[${hex(8)}] ${pick(VERBS)} ${pick(NOUNS)}… ${num(3, 99)}% (${ms()}ms)
[${hex(8)}] ${pick(NOUNS)} ${num(2, 64)} → ${num(65, 512)} ${pick(UNITS)}
[${hex(8)}] warn  ${pick(NOUNS)} drift ${(Math.random() * 2).toFixed(3)}σ — within tolerance
[${hex(8)}] ok    ${num(120, 9800)} ${pick(UNITS)} in ${ms()}ms
\`\`\``;

  const CODE = () => {
    const n = pick(NOUNS);
    return `\`\`\`ts
export async function ${pick(VERBS).replace(/ing$/, '')}${n[0].toUpperCase() + n.slice(1)}(
  input: ReadonlyArray<Uint8Array>,
  opts: { window: number; epsilon?: number } = { window: ${num(8, 256)} }
): Promise<${n[0].toUpperCase() + n.slice(1)}Result> {
  const ε = opts.epsilon ?? ${(Math.random() * 0.1).toFixed(4)};
  const acc = new Float64Array(opts.window);
  for (const chunk of input) {
    if (chunk.byteLength % ${num(2, 16)} !== 0) continue;   // ${hex(4)}
    acc[chunk[0] % acc.length] += chunk.byteLength * (1 - ε);
  }
  return { checksum: 0x${hex(8)}, spread: acc.reduce((a, b) => a + b, 0) };
}
\`\`\``;
  };

  const TABLE = () => `| ${pick(NOUNS)} | ${pick(UNITS)} | drift |
|---|--:|--:|
| ${hex(6)} | ${num(10, 999)} | ${(Math.random()).toFixed(3)} |
| ${hex(6)} | ${num(10, 999)} | ${(Math.random()).toFixed(3)} |
| ${hex(6)} | ${num(10, 999)} | ${(Math.random()).toFixed(3)} |`;

  const PROSE = () => [
    `**${pick(NOUNS)}** ${num(2, 9)}단계까지 ${pick(VERBS)} 완료. 잔여 편차는 무시 가능한 수준이다.`,
    `- ${pick(NOUNS)} 재정렬 → ${num(3, 40)}개 세그먼트 병합`,
    `- ${pick(NOUNS)} 체크섬 \`${hex(12)}\` 검증됨`,
    `- 다음 단계: ${pick(VERBS)} ${pick(NOUNS)} (예상 ${ms()}ms)`
  ].join('\n');

  function terminal() {
    const head = `### ${pick(VERBS)} ${pick(NOUNS)} · ${hex(6)}`;
    const blocks = [head, PROSE(), LOG(), CODE()];
    if (Math.random() < 0.5) blocks.push(TABLE());
    return blocks.join('\n\n');
  }

  // ---------------------------------------------------------------- sheet
  //
  // 진짜처럼 보이게 하는 건 단어가 아니라 서식이다 — 절대참조 범위, 회계 서식 숫자, 오류값.
  // 어휘는 언어마다 한 벌. 번역할 문장이 아니라 무작위로 고르는 단어 목록이라 i18n 사전에 넣지 않는다.
  // 문장은 명사형으로 끝낸다 (화면 문구 존댓말 검사 대상).
  const VOCAB = {
    ko: {
      sheets: ['매출_3분기', '거래처', '재고_현황', '원가_집계', '월별_실적', '예산_대비'],
      jobs: ['피벗 테이블 새로 고침', '다시 계산', '외부 연결 새로 고침', '쿼리 단계 적용', '조건부 서식 재평가', '데이터 유효성 검사'],
      groups: [['수도권', '영남', '호남', '충청', '강원'], ['1분기', '2분기', '3분기', '4분기'], ['원자재', '부품', '완제품', '소모품']],
      head: ['구분', '합계', '전월 대비'],
      total: '합계',
      none: '없음',
      done: '완료',
      next: ['피벗 캐시 압축', '이름 정의 정리', '외부 참조 점검', '슬라이서 동기화'],
      calc: (th, bar, p) => `계산 중 (${th} 스레드) ${bar} ${p}%`,
      cells: (n, t) => `셀 ${n}개 다시 계산 · ${t}ms`,
      errs: (e, n, v) => `${e} ${n}건 → IFERROR 로 처리됨 · 순환 참조 0 · 휘발성 함수 ${v}개`,
      rules: (n) => `조건부 서식 규칙 ${n}개 적용 · 데이터 유효성 검사 통과`,
      nextJob: (j, t) => `다음 작업: ${j} (예상 ${t}ms)`,
      macro: '재계산',
      money: (v) => '₩' + v.toLocaleString('ko-KR'),
      plain: (v) => v.toLocaleString('ko-KR')
    },
    en: {
      sheets: ['Sales_Q3', 'Accounts', 'Inventory', 'Cost_Rollup', 'Monthly', 'Budget_vs_Actual'],
      jobs: ['Refreshing pivot table', 'Recalculating', 'Refreshing external links', 'Applying query steps', 'Re-evaluating conditional formats', 'Validating data'],
      groups: [['North', 'South', 'East', 'West', 'Central'], ['Q1', 'Q2', 'Q3', 'Q4'], ['Raw', 'Parts', 'Finished', 'Supplies']],
      head: ['Segment', 'Total', 'MoM'],
      total: 'Total',
      none: 'none',
      done: 'Done',
      next: ['compacting pivot cache', 'tidying named ranges', 'checking external refs', 'syncing slicers'],
      calc: (th, bar, p) => `Calculating (${th} threads) ${bar} ${p}%`,
      cells: (n, t) => `${n} cells recalculated · ${t}ms`,
      errs: (e, n, v) => `${e} ×${n} → handled by IFERROR · circular refs 0 · volatile functions ${v}`,
      rules: (n) => `${n} conditional format rules applied · data validation passed`,
      nextJob: (j, t) => `Next: ${j} (est. ${t}ms)`,
      macro: 'Recalc',
      money: (v) => '$' + v.toLocaleString('en-US'),
      plain: (v) => v.toLocaleString('en-US')
    }
  };
  const vocab = () => VOCAB[(typeof GT_LOCALE === 'string' && VOCAB[GT_LOCALE]) ? GT_LOCALE : 'ko'];
  const ERRS = ['#N/A', '#DIV/0!', '#REF!'];
  const col = () => pick(['B', 'C', 'D', 'E', 'F', 'G', 'H']);
  const shuffle = (a) => a.map((x) => [Math.random(), x]).sort((p, q) => p[0] - q[0]).map((x) => x[1]);

  const FORMULAS = [
    (V) => `=SUMIFS(D:D, B:B, "${pick(V.groups[0])}", C:C, ">="&$H$1)`,
    (V) => `=XLOOKUP($B${num(2, 90)}, ${pick(V.sheets)}!$A:$A, ${pick(V.sheets)}!$${col()}:$${col()}, "${V.none}")`,
    () => `=IFERROR(${col()}${num(2, 90)}/${col()}${num(2, 90)}-1, 0)`,
    (V) => `=SUMPRODUCT((${pick(V.sheets)}!$C$2:$C$${num(800, 9000)}="${V.done}")*${pick(V.sheets)}!$F$2:$F$${num(800, 9000)})`,
    () => `=LET(r, FILTER($A$2:$H$${num(400, 5000)}, $D$2:$D$${num(400, 5000)}>0), ROWS(r))`,
    (V) => `=INDEX(${pick(V.sheets)}!$B:$B, MATCH(MAX($F:$F), $F:$F, 0))`
  ];

  // 회계 서식: 음수는 괄호, 양수는 통화 기호
  const acct = (V, v) => (v < 0 ? '(' + V.plain(Math.abs(v)) + ')' : V.money(v));
  const delta = (d) => (d >= 0 ? '▲ ' : '▼ ') + Math.abs(d).toFixed(1) + '%';

  function sheet() {
    const V = vocab();
    const out = [];
    out.push(`### ${pick(V.jobs)} · ${pick(V.sheets)}!$A$1:$${col()}$${num(400, 9000)}`);
    out.push('```formula\n' + shuffle(FORMULAS).slice(0, num(1, 2)).map((f) => f(V)).join('\n') + '\n```');
    const p = num(41, 97);
    out.push('```calc\n' + [
      V.calc(pick([4, 8, 12, 16]), '·'.repeat(Math.round(p / 8)), p),
      V.cells(V.plain(num(1200, 48000)), ms()),
      V.errs(pick(ERRS), num(1, 9), num(1, 4))
    ].join('\n') + '\n```');
    if (Math.random() < 0.65) {
      let sum = 0;
      const body = shuffle(pick(V.groups)).slice(0, num(2, 3)).map((name) => {
        const v = Math.random() < 0.2 ? -num(80, 2400) * 1000 : num(800, 18000) * 1000;
        sum += v;
        return `| ${name} | ${acct(V, v)} | ${delta(Math.random() * 9 - 2)} |`;
      });
      out.push([`| ${V.head.join(' | ')} |`, '|---|--:|--:|', ...body,
        `| ${V.total} | ${acct(V, sum)} | ${delta(Math.random() * 5)} |`].join('\n'));
    }
    if (Math.random() < 0.5) {
      out.push('```vba\n' + [
        `Sub ${V.macro}_${hex(4)}()`,
        '    Application.Calculation = xlCalculationManual',
        `    Range("B2:${col()}${num(400, 9000)}").Calculate`,
        '    ThisWorkbook.RefreshAll',
        '    Application.Calculation = xlCalculationAutomatic',
        'End Sub'
      ].join('\n') + '\n```');
    }
    out.push([`- ${V.rules(num(2, 9))}`, `- ${V.nextJob(pick(V.next), ms())}`].join('\n'));
    return out.join('\n\n');
  }

  const FLAVORS = { terminal, sheet };
  // 스킨이 고른 맛. 모르는 이름이면 terminal.
  function make(flavor) { return (FLAVORS[flavor] || terminal)(); }

  return { make, terminal, sheet, flavors: () => Object.keys(FLAVORS) };
})();
