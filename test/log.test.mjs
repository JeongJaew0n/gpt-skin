// 콘솔 진단 로그 on/off. 껐다고 하고 계속 찍으면 껐다고 할 수 없다.
import fs from 'node:fs'; import vm from 'node:vm';

const results = []; const t = (n, ok) => results.push([n, ok]);

// ---- protocol 의 GT.log 를 실제로 돌린다 ----
function loadProtocol(cfg) {
  const debug = []; const error = [];
  const sb = {
    // console.log 으로 찍는다. debug 는 크롬 콘솔에서 Verbose 라 기본 필터에 숨는다.
    console: { log: (...a) => debug.push(a.join(' ')), error: (...a) => error.push(a.join(' ')),
      warn() {}, debug: (...a) => debug.push('DEBUG:' + a.join(' ')) },
    Object, Array, JSON, String, Number, Boolean, Promise, Error, Date, Map, Set,
    location: { origin: 'https://chatgpt.com' }, setTimeout
  };
  sb.window = sb; sb.globalThis = sb;
  sb.addEventListener = () => {}; sb.window.addEventListener = () => {};
  vm.createContext(sb);
  vm.runInContext(fs.readFileSync('src/content/protocol.js', 'utf8'), sb, { filename: 'protocol.js' });
  if (cfg !== undefined) sb.GT.config = cfg;
  return { GT: sb.GT, debug, error };
}

// --- 설정이 아직 없을 때는 찍는다 (부팅 진단을 잃지 않는다) ---
{
  const p = loadProtocol(undefined);
  p.GT.log('부팅 중');
  t('config 가 없으면 찍는다', p.debug.length === 1);
  t('접두사를 붙인다', /^\[gpt-skin\]/.test(p.debug[0]));
}

// --- 켜짐 ---
{
  const p = loadProtocol({ get: (k) => (k === 'log' ? true : undefined) });
  p.GT.log('한 줄');
  t('켜져 있으면 찍는다', p.debug.length === 1);
}

// --- 꺼짐 ---
{
  const p = loadProtocol({ get: (k) => (k === 'log' ? false : undefined) });
  p.GT.log('한 줄'); p.GT.log('두 줄'); p.GT.log('세 줄');
  t('꺼져 있으면 한 줄도 안 찍는다', p.debug.length === 0);
}

// --- 설정이 undefined 를 돌려주면(키가 없으면) 찍는다 ---
{
  const p = loadProtocol({ get: () => undefined });
  p.GT.log('한 줄');
  t('값을 모르면 찍는다 — 조용히 잃지 않는다', p.debug.length === 1);
}

// --- 켰다 껐다 ---
{
  let on = true;
  const p = loadProtocol({ get: (k) => (k === 'log' ? on : undefined) });
  p.GT.log('a');
  on = false; p.GT.log('b');
  on = true; p.GT.log('c');
  t('매번 설정을 다시 본다', p.debug.length === 2);
  t('꺼진 사이의 줄만 빠진다', p.debug.every((x) => !/ b$/.test(x)));
}

// --- console.debug 가 아니라 console.log 로 찍는다 ---
{
  const p = loadProtocol({ get: () => true });
  p.GT.log('한 줄');
  t('Verbose 가 아니라 기본 레벨로 찍는다', p.debug.length === 1 && !/^DEBUG:/.test(p.debug[0]));
  const src = fs.readFileSync('src/content/protocol.js', 'utf8');
  // 주석에도 'console.debug' 라는 낱말이 있다. 코드만 본다.
  t('소스에 console.debug 호출이 없다',
    !/console\.debug/.test(src.replace(/\/\/[^\n]*/g, '')));
  t('왜 바꿨는지 적어뒀다', /Verbose 레벨이라 기본 필터에 숨는다/.test(src));
}

// --- 꺼져 있어도 버퍼에는 쌓인다 ---
{
  const p = loadProtocol({ get: (k) => (k === 'log' ? false : undefined) });
  p.GT.log('첫 줄'); p.GT.log('둘째 줄');
  t('콘솔에는 안 찍는다', p.debug.length === 0);
  t('버퍼에는 쌓는다', p.GT.logCount() === 2);
  const got = p.GT.logs();
  t('내용이 남는다', got[0].line === '첫 줄' && got[1].line === '둘째 줄');
  t('시각도 남는다', typeof got[0].at === 'number' && got[0].at > 0);
  t('최근 것이 뒤에 온다', got[got.length - 1].line === '둘째 줄');
}

// --- 버퍼 꺼내기·비우기 ---
{
  const p = loadProtocol({ get: () => true });
  for (let i = 1; i <= 10; i += 1) p.GT.log('줄 ' + i);
  t('개수를 센다', p.GT.logCount() === 10);
  t('마지막 n 개만 꺼낸다', p.GT.logs(3).map((x) => x.line).join(',') === '줄 8,줄 9,줄 10');
  t('인자 없으면 전부', p.GT.logs().length === 10);
  t('범위를 넘겨도 있는 만큼', p.GT.logs(999).length === 10);
  t('0 이나 음수는 최소 1개', p.GT.logs(0).length >= 1 && p.GT.logs(-5).length >= 1);
  t('비우면 0', p.GT.logClear() === 10 && p.GT.logCount() === 0);
}

// --- 버퍼가 무한히 자라지 않는다 ---
{
  const p = loadProtocol({ get: () => false });
  for (let i = 0; i < 500; i += 1) p.GT.log('x' + i);
  t('상한을 지킨다', p.GT.logCount() === 200);
  const got = p.GT.logs();
  t('오래된 것부터 버린다', got[got.length - 1].line === 'x499');
  t('앞쪽은 밀려났다', got[0].line === 'x300');
}

// --- 문자열이 아닌 인자도 안전하게 담는다 ---
{
  const p = loadProtocol({ get: () => false });
  p.GT.log('오류:', new Error('터졌다'));
  p.GT.log('객체:', { a: 1 });
  const got = p.GT.logs();
  t('Error 는 이름과 메시지로', /Error: 터졌다/.test(got[0].line));
  t('객체는 JSON 으로', /\{"a":1\}/.test(got[1].line));
  t('버퍼에는 문자열만 들어간다', got.every((x) => typeof x.line === 'string'));
}

// ---- :log 명령 ----
function loadCommands(initial) {
  const store = { log: initial };
  const said = [];
  const sb = { console, Object, Array, Set, Map, String, Number, Boolean, JSON, Math, Promise, Error, RegExp, Date,
    location: { pathname: '/' },
    document: { createElement: () => ({ style: {}, appendChild() {}, addEventListener() {} }) } };
  sb.window = sb; sb.globalThis = sb;
  vm.createContext(sb);
  vm.runInContext(fs.readFileSync('src/shared/i18n.js', 'utf8'), sb, { filename: 'i18n.js' });
  vm.runInContext(fs.readFileSync('src/shared/defaults.js', 'utf8'), sb, { filename: 'defaults.js' });
  const ring = [{ at: 1_700_000_000_000, line: '첫 진단' }, { at: 1_700_000_001_000, line: '둘째 진단' }];
  const nodes = [];
  sb.GT = {
    logs: (n) => (n ? ring.slice(-Number(n)) : ring.slice()),
    logCount: () => ring.length,
    logClear: () => { const k = ring.length; ring.length = 0; return k; },
    theme: { names: () => ['modern-dark'] },
    config: {
      keys: () => Object.keys(sb.GT_DEFAULTS), DEFAULTS: sb.GT_DEFAULTS,
      get: (k) => (k in store ? store[k] : sb.GT_DEFAULTS[k]),
      set: async (k, v) => { store[k] = v; return v; }
    },
    chats: { projects: () => [] },
    store: { state: { messages: [], superseded: 0, orphanDeltas: 0, conversationTitle: '' } },
    tty: { system: (lvl, x, node) => { said.push(lvl + ':' + x); if (node) nodes.push(node); },
      // 화면에 쌓인 진단 줄. :log clear 가 이것도 걷어내야 한다.
      screen: 3,
      clearSystem() { const n = this.screen; this.screen = 0; return n; },
      applyConfig() {}, render() {}, ui: { input: {} } },
    sidebar: { chats: () => [], isOpen: () => false }, convops: {},
    conversation: { idFromPath: () => null }, picker: {}, navigate: {},
    health: { CHECKS: {}, reasons: [] }, palette: {}, oai: {}, compose: {}
  };
  vm.runInContext(fs.readFileSync('src/content/commands.js', 'utf8'), sb, { filename: 'commands.js' });
  return { C: sb.GT.commands, store, said, nodes, T: sb.GT_T, ring, GT: sb.GT };
}

{
  const a = loadCommands(true);
  await a.C.run(':log');
  t('인자 없으면 현재 상태를 알려준다', a.said.some((x) => /켜짐/.test(x)));
  t('상태만 묻는 것은 바꾸지 않는다', a.store.log === true);

  await a.C.run(':log off');
  t('off 로 끈다', a.store.log === false);
  t('껐다고 알려준다', a.said.some((x) => /껐습니다/.test(x)));

  await a.C.run(':log');
  t('꺼진 상태를 알려준다', a.said.some((x) => /꺼짐/.test(x)));

  await a.C.run(':log on');
  t('on 으로 켠다', a.store.log === true);

  await a.C.run(':log toggle');
  t('toggle 로 뒤집는다', a.store.log === false);
  await a.C.run(':log toggle');
  t('다시 뒤집는다', a.store.log === true);

  await a.C.run(':log 1');
  t('1 도 켜기', a.store.log === true);
  await a.C.run(':log 0');
  t('0 도 끄기', a.store.log === false);

  const before = a.store.log;
  await a.C.run(':log 뭐라고');
  t('모르는 인자는 바꾸지 않는다', a.store.log === before);
  t('사용법을 알려준다', a.said.some((x) => /error:/.test(x) && /:log/.test(x)));

  t('자동완성이 on·off·toggle 을 준다', (() => {
    const c = a.C.complete(':log ').candidates;
    return ['on', 'off', 'toggle'].every((v) => c.includes(v));
  })());
}

// --- :log dump · clear ---
{
  const a = loadCommands(false);            // 꺼진 상태에서도 꺼내 볼 수 있어야 한다
  await a.C.run(':log dump');
  t('꺼져 있어도 꺼내 볼 수 있다', a.said.some((x) => /진단 줄 2개/.test(x)));
  t('표로 그린다', a.nodes.length === 1);
  t('버퍼 개수도 알려준다', a.said.some((x) => /버퍼에 2개/.test(x)));

  await a.C.run(':log dump 1');
  t('개수를 지정할 수 있다', a.said.some((x) => /진단 줄 1개/.test(x)));

  t('상태를 바꾸지 않는다', a.store.log === false);

  await a.C.run(':log clear');
  t('버퍼를 비운다', a.said.some((x) => /2개를 비웠습니다/.test(x)) && a.ring.length === 0);
  // 버퍼만 비우면 화면에 [info]·[warn] 이 그대로 남아 지워진 느낌이 없다
  t('화면의 진단 줄도 걷어낸다', a.GT.tty.screen === 0);
  t('걷어낸 줄 수를 알려준다', a.said.some((x) => /화면에서 3줄/.test(x)));

  await a.C.run(':log dump');
  t('비운 뒤에는 없다고 한다', a.said.some((x) => /쌓인 진단 줄이 없습니다/.test(x)));

  const tty = fs.readFileSync('src/content/tty.js', 'utf8');
  t('tty 가 화면 진단 줄을 비우는 길을 준다', /clearSystem\(\) \{ const n = systemLog\.length/.test(tty));
  t('명령이 그걸 부른다', /GT\.tty\.clearSystem\(\)/.test(fs.readFileSync('src/content/commands.js', 'utf8')));

  t('자동완성이 dump·clear 도 준다', (() => {
    const c = a.C.complete(':log ').candidates;
    return ['on', 'off', 'toggle', 'dump', 'clear'].every((v) => c.includes(v));
  })());
}

// --- 상태줄에 켜짐/꺼짐을 보여준다 ---
{
  const tty = fs.readFileSync('src/content/tty.js', 'utf8');
  const css = fs.readFileSync('src/content/theme.js', 'utf8');
  t('상태줄에 칸이 있다', /ui\.stat3 = el\('span', 'gt-status-seg gt-log-state'/.test(tty));
  t('chars 뒤에 온다', tty.indexOf('k chars') < tty.indexOf("log ${logOn ? 'on' : 'off'}"));
  t('켜짐·꺼짐을 글자로 쓴다', /log \$\{logOn \? 'on' : 'off'\}/.test(tty));
  t('쌓인 개수도 보여준다', /buffered \? ' \(' \+ buffered \+ '\)' : ''/.test(tty));
  t('상태를 dataset 으로 표시', /ui\.stat3\.dataset\.on = logOn \? '1' : '0'/.test(tty));
  t('꺼졌을 때 색이 다르다', /\.gt-log-state\[data-on="0"\]/.test(css) && /\.gt-log-state\[data-on="1"\]/.test(css));
}

// --- 설정 항목으로도 있다 ---
{
  const { T } = loadCommands(true);
  const sb = { Object, Array, String, Number, Boolean, JSON, Math };
  sb.window = sb; sb.globalThis = sb;
  vm.createContext(sb);
  vm.runInContext(fs.readFileSync('src/shared/i18n.js', 'utf8'), sb, { filename: 'i18n.js' });
  vm.runInContext(fs.readFileSync('src/shared/defaults.js', 'utf8'), sb, { filename: 'defaults.js' });
  const f = sb.GT_SCHEMA.find((x) => x.key === 'log');
  t('스키마에 log 항목이 있다', !!f && f.type === 'bool');
  t('기본은 켜짐 — 조용해지는 쪽으로 몰래 바꾸지 않는다', f.def === true);
  t('라벨이 사전에 있다', sb.GT_LABEL(f) !== 'opt.log.label');
  t('도움말이 사전에 있다', sb.GT_HELP(f).length > 0);
  t('명령 문구도 사전에서 온다', T('cmd.log.desc') !== 'cmd.log.desc');
}

// --- 정본이 한 곳인가 ---
{
  const files = ['src/content/health.js', 'src/content/index.js', 'src/content/chats.js'];
  const leaked = files.filter((f) => /console\.debug/.test(fs.readFileSync(f, 'utf8')));
  t('진단 출력이 GT.log 한 곳을 지난다', leaked.length === 0);
  if (leaked.length) console.log('        직접 찍는 곳:', leaked.join(', '));

  // 하드 실패는 계속 보여야 한다 — 끌 수 있게 만들면 안 된다
  const idx = fs.readFileSync('src/content/index.js', 'utf8');
  t('preflight 오류는 console.error 로 남는다', /console\.error\(/.test(idx));
  const proto = fs.readFileSync('src/content/protocol.js', 'utf8');
  t('핸들러 예외도 console.error 로 남는다', /console\.error\('\[gpt-skin\]', err\)/.test(proto));
}

// --- :log off 는 '알아서 남기는 줄' 만 지운다 ---
//
// 사용자가 본 것은 콘솔이 아니라 터미널 스크롤백의 [info]/[error] 줄이었다.
// 명령의 결과까지 지우면 터미널이 고장 난 것처럼 보인다 — 그 경계를 고정한다.
{
  const tty = fs.readFileSync('src/content/tty.js', 'utf8');
  const idx = fs.readFileSync('src/content/index.js', 'utf8');
  const health = fs.readFileSync('src/content/health.js', 'utf8');

  t('system 이 quiet 을 받는다', /function system\(level, text, node, opts\)/.test(tty));
  t('log 가 꺼져 있을 때만 감춘다', /opts\.quiet && GT\.config\.get\('log'\) === false/.test(tty));
  t('감춘 줄도 버퍼에는 남긴다', /GT\.log\(`\[\$\{level\}\] \$\{text\}`\)/.test(tty));
  t('왜 명령 결과는 빼는지 적어뒀다', /명령의 결과.*quiet 이 아니다/s.test(tty));

  // 사용자가 스크린샷으로 지적한 세 줄이 전부 quiet 인가
  t('부팅 배너가 quiet', /build \$\{GT_BUILD\}[\s\S]{0,120}?quiet: true/.test(idx));
  t('중단 알림이 quiet', /'중단 요청 \(esc\)', null, \{ quiet: true \}/.test(idx));
  t('health 경고가 quiet', /system\('warn', reason, null, \{ quiet: true \}\)/.test(health));
  t('health 오류도 quiet', /system\('error', text, null, \{ quiet: true \}\)/.test(health));

  // 명령 결과는 quiet 이 아니어야 한다
  const cmds = fs.readFileSync('src/content/commands.js', 'utf8');
  t('명령 결과에는 quiet 을 안 붙였다', !/quiet: true/.test(cmds));
}

// --- 중단은 깨짐이 아니다 ---
{
  // esc·^C 로 멈추면 리더가 끊기며 던진다. 그걸 깨짐으로 보고하면
  // 중단할 때마다 [error] 줄이 남는다 — 스크린샷의 그 줄이다.
  const tap = fs.readFileSync('src/main/tap.js', 'utf8');
  t('중단을 알아본다', /e\.name === 'AbortError'/.test(tap) && /\/abort\/i\.test\(msg\)/.test(tap));
  t('중단이면 fail 하지 않는다', /if \(!aborted\) fail\('stream-read', msg\)/.test(tap));
  t('왜 그런지 적어뒀다', /사용자가 중단하면/.test(tap));
}

let bad = 0;
results.forEach(([n, ok]) => { if (!ok) bad++; console.log(`  ${ok ? 'PASS' : 'FAIL'}  ${n}`); });
console.log(bad ? `\n${bad}건 실패` : '\n전부 통과');
process.exit(bad ? 1 : 0);
