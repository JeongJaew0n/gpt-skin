// 새로고침 직후에도 단축키와 팝업 토글이 먹어야 한다.
//
// 예전에는 부팅 점검(tap 최대 5초 · 컴포저 최대 15초 · 스레드 최대 15초) 뒤에 연결해서,
// 새로고침 뒤 한동안 Ctrl+` 도 팝업도 먹지 않았다 (사용자 보고 2026-09-28).
// 실측(비로그인 ChatGPT): 13.9초까지 안 먹고 16.2초부터 먹었다.
// docs/issue/2026-09-28-shortcuts-dead-after-refresh.md
import fs from 'node:fs';

const results = []; const t = (n, ok) => results.push([n, ok]);
const idx = fs.readFileSync('src/content/index.js', 'utf8');
const prompt = fs.readFileSync('src/content/shell/prompt.js', 'utf8');

// 주석은 빼고 코드에서 위치를 잰다 — 주석이 옛 순서를 설명하느라 같은 글자를 담고 있다
const code = idx.replace(/\/\/.*$/gm, '');
const at = (s) => code.indexOf(s);

const iMount = at('GT.skin.mount(cfg);');
const iKeys = at('GT.skin.attachPrompt();');
const iPopup = at('chrome.runtime.onMessage.addListener(');
const iWaitTap = at('await waitTap(');
const iComposer = at('await waitFor(GT.compose.SELECTOR');
const iThread = at("await waitFor('#thread, main'");
const iDegraded = at('if (GT.health.degraded) return;');

t('위치를 모두 찾았다', [iMount, iKeys, iPopup, iWaitTap, iComposer, iThread, iDegraded].every((i) => i > 0));
t('단축키는 스킨을 붙인 뒤에 연결한다 (입력줄이 있어야 한다)', iMount < iKeys);
t('단축키는 tap 대기보다 먼저 연결한다', iKeys < iWaitTap);
t('단축키는 컴포저·스레드 대기보다 먼저 연결한다', iKeys < iComposer && iKeys < iThread);
t('단축키는 원본 복귀 판정보다 먼저 연결한다', iKeys < iDegraded);
t('팝업 토글도 대기보다 먼저 받는다', iPopup < iWaitTap && iPopup < iComposer);
t('단축키 연결은 한 번뿐', code.split('GT.skin.attachPrompt();').length === 2);
t('팝업 리스너도 한 번뿐', code.split('chrome.runtime.onMessage.addListener(').length === 2);
t('물러날 때 단축키를 뗀다', /GT\.skin\.attachPrompt\(\);\s*\n\s*disposers\.push\(\(\) => GT\.prompt\.detach\(\)\);/.test(idx));

// 키가 점검보다 먼저 붙으므로, 점검이 실패해 원본으로 돌아간 뒤에는 스스로 거절해야 한다
t('Ctrl+; 는 원본 복귀 상태에서 다시 열지 않는다',
  /else if \(!\(GT\.health && GT\.health\.degraded\)\) GT\.skin\.show\(\);/.test(prompt));
t('Ctrl+` 경로(toggle)도 거절한다',
  /toggle\(\) \{\s*\n\s*if \(GT\.health\.degraded\) return this\.visible\(\);/.test(fs.readFileSync('src/content/shell/skin.js', 'utf8')));
t('왜 앞에 두는지 적어 뒀다', /실측\(비로그인 ChatGPT, 2026-09-28\)/.test(idx));

// --- 켜 두었으면 점검을 기다리지 않고 켠다 (0.11.2) ---
// 예전에는 점검(최대 35초) 뒤에 켜서 새로고침·업데이트 뒤 그만큼 원본이 보였다.
const iEarly = at('if (showEarly) GT.skin.show();');
const iLate = at('if (autoShow && !showEarly) GT.skin.show();');
t('자동 켜짐이 두 갈래다 (먼저 · 나중)', iEarly > 0 && iLate > 0);
t('기본값이면 점검 대기보다 먼저 켠다', iEarly < iWaitTap && iEarly < iComposer && iEarly < iThread);
t('단축키를 연결한 뒤에 켠다 (켜자마자 키가 먹게)', iKeys < iEarly);
t('onBreak = revert 면 먼저 켜지 않는다 (켜졌다 꺼지는 깜빡임)', /const showEarly = autoShow && cfg\.onBreak !== 'revert';/.test(code));
t('revert 는 원본 복귀 판정 뒤에 켠다', iDegraded < iLate);
t('켜는 조건은 설정 또는 이어받음', /const autoShow = !!\(cfg\.enabled \|\| inherited\);/.test(code));
t('show 를 부르는 곳은 그 둘뿐', (code.match(/GT\.skin\.show\(\);/g) || []).length === 2);

// --- 입력창을 찾는 목록은 compose 한 곳에만 있다 ---
t('점검은 compose 의 목록으로 기다린다', /await waitFor\(GT\.compose\.SELECTOR, 15000\)/.test(code));
t('index 에 입력창 선택자를 박아 두지 않았다', !/prompt-textarea|mobile-composer/.test(code));

let bad = 0;
results.forEach(([n, ok]) => { if (!ok) bad++; console.log(`  ${ok ? 'PASS' : 'FAIL'}  ${n}`); });
console.log(bad ? `\n${bad}건 실패` : '\n전부 통과');
process.exit(bad ? 1 : 0);
