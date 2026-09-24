// 한글(IME) 조합 중의 Enter 는 '보내기' 가 아니라 '조합 확정' 이다.
// 이걸 전송으로 받으면 마지막 글자가 빠진 채 실행되고, 확정된 글자가 빈 입력줄에 남는다.
import fs from 'node:fs'; import vm from 'node:vm';

// 입력 처리는 2026-09-24 에 index.js 에서 shell/prompt.js 로 옮겼다.
const idx = fs.readFileSync('src/content/shell/prompt.js', 'utf8');
const results = []; const t = (n, ok) => results.push([n, ok]);

// --- 실제 소스에서 판별식을 꺼내 돌린다 (테스트용으로 다시 쓰지 않는다) ---
const line = /^\s*const composing = \(e\) => .*$/m.exec(idx);
t('판별식이 소스에 있다', !!line);
if (line) {
  const ctx = vm.createContext({});
  vm.runInContext(line[0].trim() + '; globalThis.__c = composing;', ctx);
  const composing = ctx.__c;

  t('조합 중이면 참', composing({ isComposing: true, keyCode: 229, key: 'Enter' }) === true);
  t('isComposing 만으로도 참', composing({ isComposing: true, keyCode: 13, key: 'Enter' }) === true);
  t('keyCode 229 만으로도 참 (안 채우는 브라우저 보험)',
    !!composing({ isComposing: false, keyCode: 229, key: 'Process' }));
  t('평범한 Enter 는 거짓', !composing({ isComposing: false, keyCode: 13, key: 'Enter' }));
  t('평범한 글자도 거짓', !composing({ isComposing: false, keyCode: 65, key: 'a' }));
  t('필드가 없어도 터지지 않는다', !composing({ key: 'Enter' }));
}

// --- 두 핸들러 모두 조합 중에는 손을 뗀다 ---
{
  const guards = idx.match(/if \(composing\(e\)\) return;/g) || [];
  t('입력줄과 전역 키 두 곳에 건다', guards.length === 2);

  const iInput = idx.indexOf("input.addEventListener('keydown'");
  const iGuard = idx.indexOf('if (composing(e)) return;', iInput);
  const iTab = idx.indexOf("e.key === 'Tab'", iInput);
  const iEnter = idx.indexOf("e.key === 'Enter' && !e.shiftKey", iInput);
  t('입력줄 핸들러 맨 앞에서 막는다', iGuard > iInput && iGuard < iTab && iGuard < iEnter);

  const iWin = idx.indexOf("window.addEventListener('keydown'");
  const iWinGuard = idx.indexOf('if (composing(e)) return;', iWin);
  const iToggle = idx.indexOf("e.key === '`' && e.ctrlKey", iWin);
  t('전역 핸들러도 맨 앞에서 막는다', iWinGuard > iWin && iWinGuard < iToggle);

  t('판별식이 두 핸들러보다 먼저 정의된다', idx.indexOf('const composing =') < iInput);
}

// --- 조합이 끝나면 후보를 다시 계산한다 ---
{
  t('compositionend 를 듣는다', /input\.addEventListener\('compositionend'/.test(idx));
  t('끝난 값으로 후보를 다시 만든다', /compositionend', \(\) => \{ autosize\(\); refreshSuggest\(\); \}/.test(idx));
}

// --- 왜 필요한지 코드에 남겼는가 ---
{
  t('증상을 주석에 적어뒀다', /':rename 안뇽' \+ Enter/.test(idx));
  t('추측이 아니라 실측이라고 적었다', /실측: 조합 중 Enter 가/.test(idx));
}

let bad = 0;
results.forEach(([n, ok]) => { if (!ok) bad++; console.log(`  ${ok ? 'PASS' : 'FAIL'}  ${n}`); });
console.log(bad ? `\n${bad}건 실패` : '\n전부 통과');
process.exit(bad ? 1 : 0);
