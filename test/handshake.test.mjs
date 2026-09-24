// 고친 두 가지를 실제로 검증한다.
//  A. 핸들러가 붙기 전에 도착한 메시지가 나중에 전달되는가 (버퍼링)
//  B. tap 의 pong 이 markTap 을 깨우는가 (누락됐던 핸들러)
import fs from 'node:fs'; import vm from 'node:vm';

let listener = null;
const sandbox = {
  console,
  location: { origin: 'https://chatgpt.com' },
  chrome: { runtime: { id: 'x', sendMessage(){}, lastError: null } }
};
sandbox.window = sandbox;
sandbox.globalThis = sandbox;
sandbox.addEventListener = (t, fn) => { if (t === 'message') listener = fn; };
sandbox.window.addEventListener = sandbox.addEventListener;
sandbox.postMessage = () => {};
vm.createContext(sandbox);
vm.runInContext(fs.readFileSync('src/content/protocol.js','utf8'), sandbox, {filename:'protocol.js'});

// vm 안의 window 는 바깥 sandbox 와 다른 프록시다. 실제 브라우저에서는 동일 객체이므로
// 테스트에서도 vm 이 보는 window 를 그대로 source 로 쓴다.
vm.runInContext('globalThis.__win = window;', sandbox);
const WIN = sandbox.__win;

const send = (kind, payload) =>
  listener({ source: WIN, data: { __gpt_skin__: true, dir: 'm2i', kind, payload } });

const results = [];

// A. 핸들러보다 먼저 도착한 ready
send('ready', { url: 'https://chatgpt.com/' });
let gotReady = null;
vm.runInContext("GT.on('ready', (p) => { globalThis.__ready = p; })", sandbox);
gotReady = sandbox.__ready;
results.push(['A 버퍼링 — 핸들러 이전 ready 가 전달됨', !!gotReady]);

// A2. 버퍼는 한 번만 흘려야 한다
vm.runInContext("globalThis.__count = 0; GT.on('ready', () => { globalThis.__count++; })", sandbox);
results.push(['A2 버퍼 재소비 없음', sandbox.__count === 0]);

// A3. 핸들러가 붙은 뒤 도착한 메시지는 즉시 전달
vm.runInContext("globalThis.__live = 0; GT.on('delta', () => { globalThis.__live++; })", sandbox);
send('delta', { text: 'x' });
results.push(['A3 실시간 전달', sandbox.__live === 1]);

// B. pong 핸들러 (index.js 의 markTap 과 같은 형태)
vm.runInContext("globalThis.__tap = false; const mark = () => { globalThis.__tap = true; }; GT.on('ready', mark); GT.on('pong', mark);", sandbox);
send('pong', { ready: true });
results.push(['B pong 이 tap 을 깨움', sandbox.__tap === true]);

// C. 다른 출처/형식 메시지는 무시
vm.runInContext("globalThis.__noise = 0; GT.on('user', () => { globalThis.__noise++; })", sandbox);
listener({ source: {}, data: { __gpt_skin__: true, dir: 'm2i', kind: 'user', payload: {} } });
listener({ source: sandbox.window, data: { dir: 'm2i', kind: 'user' } });
results.push(['C 잡음 무시', sandbox.__noise === 0]);

let bad = 0;
results.forEach(([name, ok]) => { if (!ok) bad++; console.log(`  ${ok ? 'PASS' : 'FAIL'}  ${name}`); });
console.log(bad ? `\n${bad}건 실패` : '\n전부 통과');
process.exit(bad ? 1 : 0);
