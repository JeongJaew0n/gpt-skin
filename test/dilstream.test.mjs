// 생성형 UI(DIL) 답을 받는 동안에도 태그 없는 글을 그리는가 (리뷰 2026-11-03, 크롬 · gpt-6-thinking 실측).
// 예전에는 스트림 경로에 대체 마크다운이 없어, 받는 동안부터 끝난 뒤 끊김 검사(8초)까지
// '<icon name="download" inline /> HTML 파일 다운로드' 처럼 태그가 글자로 보였다.
// 실측: 스트림은 본문 조각과 같은 patch 안에 /message/metadata/model_dil_v2/fallbackMarkdown 를 나란히 append 한다.
import fs from 'node:fs'; import vm from 'node:vm';

const results = []; const t = (n, ok) => results.push([n, ok]);

function runStream(lines) {
  const posted = [];
  const sb = {
    console: { debug() {}, warn() {}, error() {}, log() {} },
    location: { origin: 'https://chatgpt.com', href: 'https://chatgpt.com/', pathname: '/' },
    document: { querySelectorAll: () => [], querySelector: () => null, getElementById: () => null, title: '' },
    TextDecoder, Response, ReadableStream, CSS: { escape: (x) => x },
    Object, Array, Set, Map, JSON, Math, Number, String, Boolean, Promise, Error, RegExp, Date, setTimeout, queueMicrotask
  };
  sb.window = sb; sb.globalThis = sb; sb.addEventListener = () => {};
  sb.postMessage = (msg) => { if (msg && msg.__gpt_skin__) posted.push(msg); };
  sb.fetch = async () => new Response(new ReadableStream({ start(c) { c.enqueue(new TextEncoder().encode(lines.join('\n') + '\n')); c.close(); } }), { status: 200 });
  vm.createContext(sb);
  vm.runInContext(fs.readFileSync('src/main/tap.js', 'utf8'), sb, { filename: 'tap.js' });
  return { posted, call: () => sb.window.fetch('https://chatgpt.com/backend-api/f/conversation', { method: 'POST' }) };
}
async function collect(lines) {
  const { posted, call } = runStream(lines);
  const res = await call(); await res.text();
  await new Promise((r) => setTimeout(r, 30));
  return posted.filter((m) => m.dir === 'm2i');
}
const D = (o) => 'data: ' + JSON.stringify(o);
const ENC = ['event: delta_encoding', 'data: "v1"'];
const COMPLETE = D({ type: 'message_stream_complete', conversation_id: 'c1' });
const FB = '/message/metadata/model_dil_v2/fallbackMarkdown';

// 실측 모양: 메시지 생성(o · p 없이 v.message) 에 첫 조각과 model_dil_v2 가 실리고, 이어서 patch 가 둘을 나란히 늘린다
const dilAdd = D({ v: { message: { id: 'a1', author: { role: 'assistant', name: null, metadata: {} },
  content: { content_type: 'text', parts: ['[<icon name="download" inline /> HTML'] }, status: 'in_progress', end_turn: null, recipient: 'all',
  metadata: { model_slug: 'gpt-6-thinking', citations: [], content_references: [], model_dil_v2: { fallbackMarkdown: '[HTML', fallbackMarkdownVersion: 1 } } } } });
const pair = (body, fb) => D({ o: 'patch', v: [{ p: '/message/content/parts/0', o: 'append', v: body }, { p: FB, o: 'append', v: fb }] });

{
  const ev = await collect([...ENC, dilAdd, pair(' 파일', ' 파일'), pair(' 다운로드](sandbox:/mnt/data/counter.html)', ' 다운로드](sandbox:/mnt/data/counter.html)'), COMPLETE]);
  const deltas = ev.filter((e) => e.kind === 'delta').map((e) => e.payload);
  const last = deltas[deltas.length - 1] || {};
  const begin = (ev.find((e) => e.kind === 'begin') || {}).payload || {};
  const end = (ev.filter((e) => e.kind === 'end').pop() || {}).payload || {};
  t('메시지 생성에 실린 대체 마크다운으로 시작한다', begin.fallback === '[HTML');
  t('본문은 원문 그대로 쌓는다 (태그 포함)', last.text === '[<icon name="download" inline /> HTML 파일 다운로드](sandbox:/mnt/data/counter.html)');
  t('대체 마크다운도 나란히 쌓는다', last.fallback === '[HTML 파일 다운로드](sandbox:/mnt/data/counter.html)');
  t('끝(end)에도 실어 보낸다', end.fallback === '[HTML 파일 다운로드](sandbox:/mnt/data/counter.html)');
}
{
  // 대체 마크다운이 없는 답은 null — 화면은 본문 그대로
  const add = D({ v: { message: { id: 'a2', author: { role: 'assistant' }, content: { content_type: 'text', parts: ['평범한'] }, recipient: 'all', metadata: {} } } });
  const ev = await collect([...ENC, add, D({ p: '/message/content/parts/0', o: 'append', v: ' 답' }), COMPLETE]);
  const end = (ev.filter((e) => e.kind === 'end').pop() || {}).payload || {};
  t('대체 마크다운이 없으면 null', end.fallback === null && end.text === '평범한 답');
}
{
  // 건너뛰는 메시지(추론)의 대체 마크다운 조각은 쌓지 않는다
  const cot = D({ type: 'message_marker', message_id: 'r1', marker: 'cot_token', event: 'first' });
  const ev = await collect([...ENC, cot, D({ p: FB, o: 'append', v: '새면 안 되는 글' }), dilAdd, pair(' 끝', ' 끝'), COMPLETE]);
  const end = (ev.filter((e) => e.kind === 'end').pop() || {}).payload || {};
  t('건너뛰는 메시지의 조각은 섞이지 않는다', end.fallback === '[HTML 끝' && !/새면/.test(end.fallback));
}

// ---------------------------------------------------------------- 받는 쪽 (index.js · store.js)
{
  const idx = fs.readFileSync('src/content/index.js', 'utf8');
  t('마크업이 섞이면 화면 글은 대체 마크다운 (대화 원본 경로와 같은 규칙)',
    /const shownText = \(p\) => \(typeof p\.fallback === 'string' && p\.fallback && GT\.conversation\.hasMarkup\(p\.text\) \? p\.fallback : p\.text\);/.test(idx));
  t('begin · delta · end 가 화면 글과 원문을 함께 넘긴다',
    /text: shownText\(p\), body: p\.text/.test(idx) && /GT\.store\.delta\(p\.id, shownText\(p\), p\.text\)/.test(idx) && /GT\.store\.end\(p\.id, shownText\(p\), p\.text\)/.test(idx));
  t('끊김 검사는 원문끼리 잰다', /GT\.health\.truncation\(typeof shown\.body === 'string' \? shown\.body : shown\.text,/.test(idx));

  const sb = { console, Object, Map, Set, Array, Date, Number, String, Boolean };
  sb.globalThis = sb; sb.GT = {};
  vm.createContext(sb);
  vm.runInContext(fs.readFileSync('src/content/store.js', 'utf8'), sb, { filename: 'store.js' });
  const S = sb.GT.store;
  S.begin({ id: 'a1', role: 'assistant', text: '[HTML', body: '[<icon /> HTML' });
  S.delta('a1', '[HTML 파일', '[<icon /> HTML 파일');
  t('받는 동안 화면 글과 원문이 따로 있다', S.state.byId.get('a1').text === '[HTML 파일' && S.state.byId.get('a1').body === '[<icon /> HTML 파일');
  S.end('a1', '[HTML 파일 끝', '[<icon /> HTML 파일 끝');
  t('끝나도 둘 다 남는다', S.state.byId.get('a1').text === '[HTML 파일 끝' && S.state.byId.get('a1').body === '[<icon /> HTML 파일 끝');
}

let bad = 0;
results.forEach(([n, ok]) => { if (!ok) bad++; console.log(`  ${ok ? 'PASS' : 'FAIL'}  ${n}`); });
console.log(bad ? `\n${bad}건 실패` : '\n전부 통과');
process.exit(bad ? 1 : 0);
