// 대화를 옮겼을 때 이전 대화의 흔적이 남지 않아야 한다. esc 는 생성을 멈춘다.
import fs from 'node:fs'; import vm from 'node:vm';

function loadStore() {
  const sandbox = { console, Object, Array, Set, Map, String, Number, Boolean, JSON, Math, Date, Error };
  sandbox.window = sandbox; sandbox.globalThis = sandbox;
  sandbox.GT = {};
  vm.createContext(sandbox);
  vm.runInContext(fs.readFileSync('src/content/store.js', 'utf8'), sandbox, { filename: 'store.js' });
  return sandbox.GT.store;
}

const results = []; const t = (n, ok) => results.push([n, ok]);
const msg = (id, role, text) => ({ id, role, text });

// --- 새 대화로 나가면 제목이 지워진다 ---
{
  const S = loadStore();
  S.applyHarvest([msg('a', 'user', '안녕'), msg('b', 'assistant', '반가워')],
    { title: '크라운 후 통증 상담', path: '/c/abc' });
  t('대화를 열면 제목이 잡힌다', S.state.conversationTitle === '크라운 후 통증 상담');
  t('본문도 들어온다', S.state.messages.length === 2);

  S.replaceAll([], { path: '/', title: '' });
  t('새 대화로 나가면 본문이 비워진다', S.state.messages.length === 0);
  t('제목도 같이 지워진다', S.state.conversationTitle === '');
  t('경로가 갱신된다', S.state.path === '/');
}

// --- 빈 제목이 와도 '모른다' 로 넘기지 않는다 (같은 자리에서의 교체) ---
{
  const S = loadStore();
  S.applyHarvest([msg('a', 'user', 'x')], { title: '이전 대화', path: '/c/one' });
  S.applyHarvest([msg('z', 'user', 'y')], { title: '', path: '/c/two' });
  t('다른 대화로 옮기면 이전 제목이 남지 않는다', S.state.conversationTitle === '');
  t('본문도 갈아엎는다', S.state.messages.length === 1 && S.state.messages[0].id === 'z');
}

// --- 같은 대화 안에서는 제목을 지우지 않는다 ---
{
  const S = loadStore();
  S.applyHarvest([msg('a', 'user', 'x')], { title: '제목', path: '/c/one' });
  S.applyHarvest([msg('a', 'user', 'x'), msg('b', 'assistant', 'y')], { title: '', path: '/c/one' });
  t('같은 대화면 제목을 지키다', S.state.conversationTitle === '제목');
  t('메시지는 합쳐진다', S.state.messages.length === 2);
}

// --- setTitle 은 그대로 동작한다 (:rename) ---
{
  const S = loadStore();
  S.applyHarvest([msg('a', 'user', 'x')], { title: '옛 이름', path: '/c/one' });
  S.setTitle('새 이름');
  t(':rename 은 즉시 반영된다', S.state.conversationTitle === '새 이름');
}

// --- 정적: 라우팅과 esc 처리 ---
{
  const idx = fs.readFileSync('src/content/index.js', 'utf8');
  const prm = fs.readFileSync('src/content/shell/prompt.js', 'utf8');   // esc 처리는 전역 키와 함께 옮겨 갔다
  const tty = fs.readFileSync('src/content/tty.js', 'utf8');

  t('대화 id 가 없으면 수확하지 않는다', /if \(GT\.conversation\.idFromPath\(\)\) \{/.test(idx));
  t('새 대화 화면에서는 store 를 바로 비운다',
    /GT\.store\.replaceAll\(\[\], \{ path: location\.pathname, title: '' \}\)/.test(idx));

  t('esc 가 생성을 멈춘다', /Escape' && GT\.compose\.stopButton\(\)/.test(prm));
  t('멈췄다고 알려준다', /중단 요청 \(esc\)/.test(prm));
  t('상태줄에 esc 를 적어둔다', /esc·\^C 중단/.test(tty));

  // 우선순위: 선택 모드 → 사이드바 → 중단
  const iSel = prm.indexOf("GT.sidebar.selecting");
  const iBar = prm.indexOf("GT.sidebar.isOpen() && !GT.palette.isOpen()");
  const iStop = prm.indexOf("GT.compose.stopButton()");
  t('선택 모드가 중단보다 먼저', iSel > 0 && iSel < iStop);
  t('사이드바 닫기가 중단보다 먼저', iBar > 0 && iBar < iStop);

  t('입력줄에서 처리한 esc 를 두 번 쓰지 않는다', /if \(e\.defaultPrevented\) return;/.test(prm));
}

// --- 이름을 바꾼 뒤 수확이 옛 이름으로 되돌리지 않는다 ---
{
  const S = loadStore();
  S.applyHarvest([msg('a', 'user', 'x')], { title: '옛 이름', path: '/c/one' });
  S.setTitle('새 이름');
  t('rename 이 제목을 바꾼다', S.state.conversationTitle === '새 이름');

  // 메시지를 주고받으면 수확이 돈다. document.title 은 아직 옛 이름이다 —
  // 원본은 우리가 API 로 바꾼 걸 모른다.
  S.applyHarvest([msg('a', 'user', 'x'), msg('b', 'assistant', 'y')], { title: '옛 이름', path: '/c/one' });
  t('수확이 옛 이름으로 되돌리지 않는다', S.state.conversationTitle === '새 이름');
  t('본문은 정상으로 합쳐진다', S.state.messages.length === 2);

  // 여러 번 돌아도 마찬가지
  S.applyHarvest([msg('a', 'user', 'x')], { title: '옛 이름', path: '/c/one' });
  t('반복 수확에도 버틴다', S.state.conversationTitle === '새 이름');
}

// --- 제목을 모르는 동안에는 수확이 채운다 (새 대화의 자동 제목) ---
{
  const S = loadStore();
  S.replaceAll([], { path: '/', title: '' });
  t('새 대화는 제목이 없다', S.state.conversationTitle === '');

  // 첫 메시지를 보내면 원본이 대화 제목을 지어 document.title 에 넣는다
  S.applyHarvest([msg('a', 'user', '안녕')], { title: '', path: '/c/new' });
  S.applyHarvest([msg('a', 'user', '안녕')], { title: '원본이 지은 제목', path: '/c/new' });
  t('모르는 동안에는 수확이 채운다', S.state.conversationTitle === '원본이 지은 제목');
}

// --- 대화를 옮기면 수확 제목을 다시 받는다 ---
{
  const S = loadStore();
  S.applyHarvest([msg('a', 'user', 'x')], { title: 'A', path: '/c/a' });
  S.setTitle('A 를 고친 이름');
  S.applyHarvest([msg('z', 'user', 'y')], { title: 'B', path: '/c/b' });
  t('다른 대화로 가면 그 대화 제목을 쓴다', S.state.conversationTitle === 'B');
}

// --- 정적: rename 이 브라우저 탭 제목도 맞춘다 ---
{
  const cmds = fs.readFileSync('src/content/commands.js', 'utf8');
  t('rename 이 document.title 도 쓴다', /document\.title = name;/.test(cmds));
  t('지금 보고 있는 대화일 때만 쓴다',
    /id === GT\.conversation\.idFromPath\(\)\) \{[\s\S]{0,300}document\.title = name;/.test(cmds));
  const st = fs.readFileSync('src/content/store.js', 'utf8');
  t('같은 대화면 제목을 안 덮는다', /meta\.title && !state\.conversationTitle/.test(st));
  t('왜 안 덮는지 적어뒀다', /원본은 그 사실을 모른다/.test(st));
}

let bad = 0;
results.forEach(([n, ok]) => { if (!ok) bad++; console.log(`  ${ok ? 'PASS' : 'FAIL'}  ${n}`); });
console.log(bad ? `\n${bad}건 실패` : '\n전부 통과');
process.exit(bad ? 1 : 0);
