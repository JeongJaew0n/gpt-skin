// 실제 ChatGPT 스트림을 녹화해 디스크의 tap.js 에 그대로 재생한다.
// 정답은 같은 응답을 원본이 렌더한 마크다운 원문(fiber)이다.
// 녹화 방법은 docs/issue/2026-09-01-delta-without-add.md 참조.
import fs from 'node:fs'; import path from 'node:path'; import vm from 'node:vm';

const DIR = 'test/fixtures';

function replay(sse) {
  const posted = [];
  const sandbox = {
    console: { debug(){}, warn(){}, error(){}, log(){} },
    location: { origin: 'https://chatgpt.com', href: 'https://chatgpt.com/', pathname: '/' },
    document: { querySelectorAll: () => [], querySelector: () => null, getElementById: () => null, title: '' },
    TextDecoder, TextEncoder, Response, ReadableStream, CSS: { escape: (x) => x },
    Object, Array, Set, Map, JSON, Math, Number, String, Boolean, Promise, Error, RegExp, Date,
    setTimeout, queueMicrotask
  };
  sandbox.window = sandbox; sandbox.globalThis = sandbox;
  sandbox.addEventListener = () => {}; sandbox.window.addEventListener = () => {};
  sandbox.postMessage = (m) => { if (m && m.__gpt_skin__ && m.dir === 'm2i') posted.push(m); };
  sandbox.fetch = async () => new Response(
    new ReadableStream({ start(c) { c.enqueue(new TextEncoder().encode(sse)); c.close(); } }),
    { status: 200, headers: { 'content-type': 'text/event-stream' } });
  vm.createContext(sandbox);
  vm.runInContext(fs.readFileSync('src/main/tap.js', 'utf8'), sandbox, { filename: 'tap.js' });
  return { posted, run: () => sandbox.window.fetch('https://chatgpt.com/backend-api/f/conversation', { method: 'POST' }) };
}

const results = []; const t = (n, ok, extra) => results.push([n, ok, extra]);
const files = fs.existsSync(DIR) ? fs.readdirSync(DIR).filter((f) => f.endsWith('.sse')).sort() : [];

if (!files.length) { console.log('  (녹화된 스트림 없음)'); process.exit(0); }

for (const f of files) {
  const name = f.replace(/\.sse$/, '');
  const sse = fs.readFileSync(path.join(DIR, f), 'utf8');
  const metaPath = path.join(DIR, name + '.json');
  const meta = fs.existsSync(metaPath) ? JSON.parse(fs.readFileSync(metaPath, 'utf8')) : {};

  const { posted, run } = replay(sse);
  const res = await run();
  await res.text();
  await new Promise((r) => setTimeout(r, 40));

  const begins = posted.filter((m) => m.kind === 'begin');
  const deltas = posted.filter((m) => m.kind === 'delta');
  const end = (posted.filter((m) => m.kind === 'end').pop() || {}).payload || {};
  const got = deltas.length ? deltas[deltas.length - 1].payload.text : (end.text || '');
  const want = meta.expected == null ? null : meta.expected;

  t(`${name} · begin 은 정확히 1회`, begins.length === 1, `실제 ${begins.length}`);
  if (want != null) {
    t(`${name} · 최종 본문이 원본과 일치`, got.trim() === want.trim(),
      got.trim() === want.trim() ? '' : `길이 ${got.length} vs ${want.length}`);
  }
  if (meta.thinking) t(`${name} · 추론 알림 있음`, posted.some((m) => m.kind === 'thinking'));
  t(`${name} · 본문을 받았다고 보고`, end.began === true);
}

let bad = 0;
results.forEach(([n, ok, x]) => { if (!ok) bad++; console.log(`  ${ok ? 'PASS' : 'FAIL'}  ${n}${x ? '  (' + x + ')' : ''}`); });
console.log(bad ? `\n${bad}건 실패` : `\n전부 통과 (${files.length}개 녹화)`);
process.exit(bad ? 1 : 0);
