// ↑↓ 로 이전·다음 프롬프트. 원본에 없는 기능이다.
// textarea 라 ↑↓ 는 원래 커서 키다 — 그걸 언제 뺏을지가 이 기능의 전부다.
// docs/plan/2026-09-09-cite-label-and-history.md
import fs from 'node:fs'; import vm from 'node:vm';

const idx = fs.readFileSync('src/content/index.js', 'utf8');
const results = []; const t = (n, ok) => results.push([n, ok]);

// ---------------------------------------------------------------- 기록 뽑기

function loadStore() {
  const sb = { console, Object, Array, Set, Map, String, Number, Boolean, JSON, Math, Date, Error };
  sb.window = sb; sb.globalThis = sb; sb.GT = {};
  vm.createContext(sb);
  vm.runInContext(fs.readFileSync('src/content/store.js', 'utf8'), sb, { filename: 'store.js' });
  return sb.GT.store;
}

{
  const S = loadStore();
  t('처음에는 비어 있다', S.userHistory().length === 0);

  S.userSent('첫 번째');
  S.begin({ id: 'a', role: 'assistant', text: '' }); S.end('a', '답');
  S.userSent('두 번째');
  t('보낸 순서대로 쌓인다', S.userHistory().join('|') === '첫 번째|두 번째');
  t('응답은 섞이지 않는다', S.userHistory().every((x) => x !== '답'));
}

{
  // 같은 것을 연달아 보내면 한 번만. 되짚을 때 같은 줄이 반복되면 성가시다.
  const S = loadStore();
  S.userSent('같은 것'); S.userSent('같은 것'); S.userSent('다른 것'); S.userSent('같은 것');
  t('연속 중복은 접는다', S.userHistory().join('|') === '같은 것|다른 것|같은 것');
}

{
  const S = loadStore();
  S.userSent('   ');
  S.userSent('');
  S.userSent('진짜');
  t('공백뿐인 것은 안 넣는다', S.userHistory().join('|') === '진짜');
}

{
  // 대화를 옮기면 그 대화의 기록이 된다
  const S = loadStore();
  S.userSent('이전 대화');
  S.replaceAll([{ id: 'u1', role: 'user', text: '새 대화 질문' }], { path: '/c/x', title: 'T' });
  t('대화를 갈아엎으면 그쪽 기록', S.userHistory().join('|') === '새 대화 질문');
}

{
  // 원본 UI 에서 보낸 것도 들어온다 — 별도 배열을 뒀다면 놓쳤을 것
  const S = loadStore();
  S.replaceAll([
    { id: 'u1', role: 'user', text: '원본에서 보낸 것' },
    { id: 'a1', role: 'assistant', text: '답' },
    { id: 'u2', role: 'user', text: '우리가 보낸 것' }
  ], { path: '/c/x', title: 'T' });
  t('원본에서 보낸 것도 기록에 있다', S.userHistory().join('|') === '원본에서 보낸 것|우리가 보낸 것');
}

{
  // 낙관적 렌더가 남긴 local- 레코드가 진짜 id 로 바뀌어도 두 번 세지 않는다
  const S = loadStore();
  S.userSent('중복될까');
  S.userSent('중복될까', 'real-id-1');
  t('낙관적 렌더가 기록을 두 번 만들지 않는다', S.userHistory().length === 1);
}

// ------------------------------------------------- 커서 판정 (소스에서 꺼내 돌린다)
//
// 여기가 이 기능의 핵심이다. 판정을 테스트용으로 다시 쓰면 아무것도 검증하지 못하므로
// 실제 소스의 그 줄을 꺼내 실행한다.

const grab = (re) => { const m = re.exec(idx); return m ? m[0].trim() : null; };
const srcCaret = grab(/^\s*const caretAlone = \(\) => .*$/m);
const srcFirst = grab(/^\s*const onFirstLine = \(\) => .*$/m);
const srcLast = grab(/^\s*const onLastLine = \(\) => .*$/m);

t('커서 판정이 소스에 있다', !!srcCaret && !!srcFirst && !!srcLast);

if (srcCaret && srcFirst && srcLast) {
  // value 와 커서 위치를 주면 실제 판정을 돌려준다
  const judge = (value, start, end) => {
    const input = { value, selectionStart: start, selectionEnd: end === undefined ? start : end };
    const ctx = vm.createContext({ input });
    vm.runInContext(`${srcCaret}\n${srcFirst}\n${srcLast}
      globalThis.__r = { first: onFirstLine(), last: onLastLine() };`, ctx);
    return ctx.__r;
  };

  // 한 줄이면 늘 기록으로 간다 — 셸과 같은 감각
  {
    const r = judge('한 줄짜리', 3);
    t('한 줄: ↑ 도 ↓ 도 기록으로', r.first === true && r.last === true);
  }
  {
    const r = judge('', 0);
    t('빈 입력줄도 기록으로', r.first === true && r.last === true);
  }

  // 여러 줄 — 여기서 뺏으면 편집이 깨진다
  {
    const v = '첫 줄\n가운데\n마지막 줄';
    const first = judge(v, 2);                 // 첫 줄 안
    const mid = judge(v, 5);                   // 가운데 줄 ('가나다' 는 4~6)
    const last = judge(v, v.length - 2);       // 마지막 줄

    t('첫 줄에서는 ↑ 만 기록으로', first.first === true && first.last === false);
    t('마지막 줄에서는 ↓ 만 기록으로', last.last === true && last.first === false);
    t('가운데 줄에서는 둘 다 커서 이동', mid.first === false && mid.last === false);
  }
  {
    // 줄 경계 — 개행 바로 앞뒤
    const v = 'A\nB';
    t('첫 줄 끝은 아직 첫 줄', judge(v, 1).first === true);
    t('개행을 넘으면 첫 줄이 아니다', judge(v, 2).first === false);
    t('마지막 줄 처음은 이미 마지막 줄', judge(v, 2).last === true);
    t('개행 앞은 마지막 줄이 아니다', judge(v, 1).last === false);
  }
  {
    // 선택 영역이 있으면 기본 동작이다 (shift+↑ 로 범위를 넓히는 중일 수 있다)
    const r = judge('한 줄짜리', 1, 4);
    t('선택 중이면 손대지 않는다', r.first === false && r.last === false);
  }
}

// ---------------------------------------------------------------- 상태 기계 (정적)

const block = (() => {
  const i = idx.indexOf("if (e.key === 'ArrowUp' && onFirstLine())");
  return i < 0 ? '' : idx.slice(i, i + 1400);
})();

t('↑ 처리가 있다', block.length > 0);
t('↓ 처리가 있다', /e\.key === 'ArrowDown' && onLastLine\(\)/.test(block));

// 기록이 없으면 아무것도 하지 않는다 — preventDefault 도 하면 안 된다
t('기록이 없으면 기본 동작 그대로', /if \(!h\.length\) return;[\s\S]{0,60}?e\.preventDefault\(\);/.test(block));
t('맨 앞에서 더 가지 않는다', /else return;\s*\/\/ 맨 앞/.test(block));
t('최신에서 한 번 더 누르면 초안으로', /histIdx >= h\.length - 1/.test(block) && /histPut\(draft\)/.test(block));
t('기록을 보고 있지 않으면 ↓ 는 그냥 둔다', /if \(histIdx === null\) return;\s*\/\/ 기록을 보고 있지 않다/.test(block));
t('처음 ↑ 에서 초안을 보관한다', /histDraft = input\.value; histIdx = h\.length - 1;/.test(block));

// 조합 중에는 손대지 않는다 — 그때의 ↑↓ 는 한글 후보를 고르는 키다
{
  const iInput = idx.indexOf("input.addEventListener('keydown'");
  const iGuard = idx.indexOf('if (composing(e)) return;', iInput);
  const iUp = idx.indexOf("e.key === 'ArrowUp'", iInput);
  t('IME 가드가 ↑↓ 보다 앞이다', iGuard > iInput && iGuard < iUp);
}

// 나가는 문 — 안 닫으면 위치가 남아 엉뚱한 줄이 뜬다
t('보내고 나면 위치를 비운다', /GT\.tty\.setSuggest\(null\); histReset\(\);/.test(idx));
t('대화를 옮기면 위치를 비운다', /GT\.sidebar\.draw\(\);[\s\S]{0,120}?histReset\(\);/.test(idx));
t('esc 로 초안이 돌아온다', /e\.key === 'Escape' && histIdx !== null/.test(idx));
// 기록을 보고 있지 않을 때의 esc 는 흘려보내야 생성 중단으로 간다
t('esc 를 늘 삼키지는 않는다', /histIdx !== null\) \{/.test(idx));
// 후보 목록이 떠 있으면 그게 먼저다
{
  const iSuggest = idx.indexOf("e.key === 'Escape' && GT.tty.ui.suggest");
  const iHist = idx.indexOf("e.key === 'Escape' && histIdx !== null");
  t('esc 는 후보 목록이 먼저', iSuggest > 0 && iHist > iSuggest);
}

t('불러온 뒤 커서는 끝에', /input\.setSelectionRange\(text\.length, text\.length\)/.test(idx));
t('불러온 뒤 높이를 다시 잡는다', /const histPut = \(text\) => \{[\s\S]{0,200}?autosize\(\);/.test(idx));
t('불러온 뒤 후보를 다시 계산한다', /const histPut = \(text\) => \{[\s\S]{0,300}?refreshSuggest\(\);/.test(idx));

let bad = 0;
results.forEach(([n, ok]) => { if (!ok) bad++; console.log(`  ${ok ? 'PASS' : 'FAIL'}  ${n}`); });
console.log(bad ? `\n${bad}건 실패` : '\n전부 통과');
process.exit(bad ? 1 : 0);
