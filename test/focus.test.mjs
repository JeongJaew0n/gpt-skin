// 입력창을 직접 클릭하지 않아도 입력이 되어야 한다.
// 다만 선택·버튼·다른 입력창을 뺏으면 안 된다.
import fs from 'node:fs';

const tty = fs.readFileSync('src/content/tty.js', 'utf8');
// 입력 처리는 2026-09-24 에 index.js 에서 shell/prompt.js 로 옮겼다.
const idx = fs.readFileSync('src/content/shell/prompt.js', 'utf8');
const results = []; const t = (n, ok) => results.push([n, ok]);

// --- 클릭 ---
t('터미널 클릭이 포커스를 잡는다', /root\.addEventListener\('mouseup'/.test(tty) && /focusInput\(\)/.test(tty));
t('버튼·링크·입력은 건드리지 않는다', /onControl\(hit\(e\)\)\) return/.test(tty));
t('컨트롤 목록에 button·a·input 이 있다', /input, textarea, select, button, a/.test(tty));
t('드래그 선택을 깨지 않는다', /if \(picked\(\)\) return/.test(tty));
t('shadow 안의 선택을 본다', /shadow\.getSelection/.test(tty));
t('좌클릭만', /e\.button !== 0/.test(tty));
t('shadow 를 뚫고 실제 대상을 본다', /composedPath\(\)\[0\]/.test(tty));

// --- 타이핑 ---
t('타이핑이 입력창으로 간다', /inp\.value \+= e\.key/.test(idx));
t('첫 글자를 브라우저에 맡기지 않는다', /e\.preventDefault\(\);\s*\n\s*GT\.tty\.focus\(\);\s*\n\s*inp\.value/.test(idx));
t('input 이벤트로 자동 높이도 따라간다', /inp\.dispatchEvent\(new Event\('input'/.test(idx));
t('단축키는 가로채지 않는다', /if \(e\.metaKey \|\| e\.ctrlKey \|\| e\.altKey\) return;/.test(idx));
t('다른 입력창에 있으면 두고 본다', /closest\('input, textarea, select, \[contenteditable="true"\]'\)\) return/.test(idx));
t('파괴적인 키는 포커스만', /e\.key === 'Backspace' \|\| e\.key === 'Enter'[\s\S]{0,80}GT\.tty\.focus\(\)/.test(idx));
t('한 글자만 처리한다', /e\.key\.length === 1/.test(idx));

// --- 기존 동작과 충돌하지 않는가 ---
t("'/' 사이드바 검색이 먼저다", idx.indexOf("GT.sidebar.enterFilter()") < idx.indexOf('inp.value += e.key'));
t("'/' 처리 뒤 빠져나간다", /enterFilter\(\);\s*\n\s*return;/.test(idx));
t('팔레트·사이드바 입력은 editable 검사로 걸린다', /composedPath \? e\.composedPath\(\)\[0\] : e\.target;\s*\n\s*if \(from/.test(idx));

let bad = 0;
results.forEach(([n, ok]) => { if (!ok) bad++; console.log(`  ${ok ? 'PASS' : 'FAIL'}  ${n}`); });
console.log(bad ? `\n${bad}건 실패` : '\n전부 통과');
process.exit(bad ? 1 : 0);
