// 글씨 크기 조절. 맥에서 조용히 안 먹는 실수를 막는다.
import fs from 'node:fs';

// 전역 키는 2026-09-24 에 index.js 에서 shell/prompt.js 로 옮겼다.
const idx = fs.readFileSync('src/content/shell/prompt.js', 'utf8');
const cmds = fs.readFileSync('src/content/commands.js', 'utf8');
const defs = fs.readFileSync('src/shared/defaults.js', 'utf8');
const results = []; const t = (n, ok) => results.push([n, ok]);

// --- 단축키 ---
t('물리 키(e.code)로 본다', /\}\[e\.code\]/.test(idx));
t('e.key 로 보지 않는다 (맥에서 ≠ · – 로 온다)', !/\}\[e\.key\]/.test(idx));
t('왜 그런지 주석에 남겼다', /macOS 에서 ⌥= 는/.test(idx));
t('Equal / Minus / Digit0', /Equal: '\+'/.test(idx) && /Minus: '-'/.test(idx) && /Digit0: 'reset'/.test(idx));
t('넘패드도 받는다', /NumpadAdd/.test(idx) && /NumpadSubtract/.test(idx) && /Numpad0/.test(idx));
t('Alt 단독 조합만 (⌘·Ctrl 과 겹치지 않게)', /e\.altKey && !e\.ctrlKey && !e\.metaKey/.test(idx));
t('기본 동작을 막는다', /zoom\) \{ e\.preventDefault\(\)/.test(idx));

// --- 명령 ---
t(':font 명령 존재', /def\(':font'/.test(cmds));
t('+ · - · reset 를 받는다',
  /a === '\+'/.test(cmds) && /a === '-'/.test(cmds) && /a === 'reset'/.test(cmds));
t('숫자도 받는다', cmds.includes(String.raw`/^\d+$/.test(a)`));
t('범위를 벗어나지 않게 고정', /Math\.max\(MIN, Math\.min\(MAX, next\)\)/.test(cmds));
t('reset 은 스키마 기본값을 쓴다', /DEFAULTS\['font\.size'\]/.test(cmds));
t('바꾼 뒤 다시 그린다', /applyConfig\(GT\.config\.all\);\s*\n\s*GT\.skin\.current\.render\(\)/.test(cmds));
t('인자 없으면 현재값과 사용법', /글씨 크기 \$\{cur\}px/.test(cmds));

// --- 설정 ---
t('스키마에 font.size 가 있다', /key: 'font\.size'/.test(defs));
t('범위가 스키마와 명령에서 같다', /min: 10, max: 24/.test(defs) && /MIN = 10, MAX = 24/.test(cmds));

// --- 입력줄 커서는 포커스가 있을 때만 깜빡인다 ---
{
  const tty = fs.readFileSync('src/content/skins/terminal.js', 'utf8');
  const css = fs.readFileSync('src/content/theme.js', 'utf8');
  const idx = fs.readFileSync('src/content/shell/prompt.js', 'utf8');

  t('포커스 상태를 맞추는 함수가 있다', /function syncCursorFocus\(\)/.test(tty));
  t('shadow 안의 실제 포커스를 본다',
    /document\.activeElement === host/.test(tty) && /shadow\.activeElement === ui\.input/.test(tty));
  t('창 포커스도 함께 본다', /document\.hasFocus\(\)/.test(tty));
  t('입력줄 focus·blur 에 연결한다',
    /ui\.input\.addEventListener\('focus', syncCursorFocus\)/.test(tty)
    && /ui\.input\.addEventListener\('blur', syncCursorFocus\)/.test(tty));
  t('창 focus·blur 에도 연결한다',
    /window\.addEventListener\('focus', \(\) => GT\.skin\.current\.syncFocus\(\), sig\(\)\)/.test(idx)
    && /window\.addEventListener\('blur', \(\) => GT\.skin\.current\.syncFocus\(\), sig\(\)\)/.test(idx));
  t('켜자마자 깜빡이지 않는다', /ui\.cursor\.dataset\.focus = '0'/.test(tty));
  t('설정을 다시 입힐 때도 맞춘다', /dressCursor\(ui\.cursor\);\s*\n\s*syncCursorFocus\(\);/.test(tty));

  t('포커스가 없으면 애니메이션을 멈춘다',
    /\.gt-cursor\[data-focus="0"\] \{ animation: none/.test(css));
  t('멈추면서 흐려진다', /\.gt-cursor\[data-focus="0"\][^}]*opacity/.test(css));

  // data-focus 는 입력줄 커서에만 붙는다 — 본문·생각 중 커서는 그대로 깜빡여야 한다
  const marks = (tty.match(/dataset\.focus/g) || []).length;
  t('data-focus 를 입력줄 커서에만 쓴다', marks <= 2);
  t('본문 커서는 그대로', /if \(m\.streaming\) body\.appendChild\(cursorEl\(\)\)/.test(tty));
}

// --- 스크롤바 ---
// 규칙이 없는 요소는 macOS 오버레이(둥근 알약)를 쓴다. 입력줄이 그래서 튀었다.
{
  const css = fs.readFileSync('src/content/theme.js', 'utf8');
  const SCROLLERS = ['gt-scroll', 'gt-sb-list', 'gt-input', 'gt-palette-list', 'gt-code-body'];
  SCROLLERS.forEach((c) => {
    // \b 로 끝내면 ::-webkit-scrollbar-track 까지 매치해 폭 규칙이 없어도 통과한다.
    // 셀렉터가 여기서 끝나는지(, 또는 {) 까지 봐야 한다.
    t(`.${c} 에 스크롤바 규칙이 있다`, new RegExp('\\.' + c + '::-webkit-scrollbar\\s*[,{]').test(css));
    t(`.${c} 의 thumb 색을 정한다`, new RegExp('\\.' + c + '::-webkit-scrollbar-thumb\\s*[,{]').test(css));
    t(`.${c} 의 track 도 정한다`, new RegExp('\\.' + c + '::-webkit-scrollbar-track\\s*[,{]').test(css));
  });
  t('폭을 하나로 맞춘다', (css.match(/::-webkit-scrollbar \{ width: 6px; height: 6px; \}/g) || []).length === 1);
  t('thumb 은 각지다', /scrollbar-thumb \{ background: var\(--gt-bg-3\); border-radius: 0/.test(css));
  t('track 은 투명하다', /scrollbar-track \{ background: transparent/.test(css));
  t('가로·세로가 만나는 모서리도 지운다', /scrollbar-corner \{ background: transparent/.test(css));

  // 표준 속성을 같이 적으면 Chrome 121+ 가 위 규칙을 통째로 무시한다
  t('scrollbar-width 를 쓰지 않는다', !/scrollbar-width\s*:/.test(css));
  t('scrollbar-color 도 쓰지 않는다', !/scrollbar-color\s*:/.test(css));
  t('왜 안 쓰는지 적어뒀다', /Chrome 121\+ 는 그쪽을 먼저 보고/.test(css));

  // 예전처럼 요소별로 폭이 갈리면 통일이 깨진다
  t('8px·10px 짜리가 남아 있지 않다', !/::-webkit-scrollbar \{ width: (8|10)px/.test(css));
}

let bad = 0;
results.forEach(([n, ok]) => { if (!ok) bad++; console.log(`  ${ok ? 'PASS' : 'FAIL'}  ${n}`); });
console.log(bad ? `\n${bad}건 실패` : '\n전부 통과');
process.exit(bad ? 1 : 0);
