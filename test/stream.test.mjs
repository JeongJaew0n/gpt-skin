// SSE 스트림을 실제로 흘려보내 tap.js 의 판별을 검증한다.
// 이 파일이 존재하는 이유: 건너뛴 메시지의 본문 델타가 그대로 새어나와
// '중간 답변'으로 보이던 회귀를 다시 만들지 않기 위해서다.
import fs from 'node:fs'; import vm from 'node:vm';

function runStream(lines) {
  const posted = [];
  const sandbox = {
    console: { debug(){}, warn(){}, error(){}, log(){} },
    location: { origin: 'https://chatgpt.com', href: 'https://chatgpt.com/', pathname: '/' },
    document: { querySelectorAll: () => [], querySelector: () => null, getElementById: () => null, title: '' },
    TextDecoder, Response, ReadableStream, CSS: { escape: (x) => x },
    Object, Array, Set, Map, JSON, Math, Number, String, Boolean, Promise, Error, RegExp, Date,
    setTimeout, queueMicrotask
  };
  sandbox.window = sandbox; sandbox.globalThis = sandbox;
  sandbox.addEventListener = () => {};
  sandbox.window.addEventListener = () => {};
  sandbox.postMessage = (msg) => { if (msg && msg.__gpt_skin__) posted.push(msg); };
  // 원본 fetch: SSE 본문을 돌려준다
  sandbox.fetch = async () => new Response(
    new ReadableStream({ start(c) { c.enqueue(new TextEncoder().encode(lines.join('\n') + '\n')); c.close(); } }),
    { status: 200, headers: { 'content-type': 'text/event-stream' } }
  );
  vm.createContext(sandbox);
  vm.runInContext(fs.readFileSync('src/main/tap.js', 'utf8'), sandbox, { filename: 'tap.js' });
  return { posted, call: () => sandbox.window.fetch('https://chatgpt.com/backend-api/f/conversation', { method: 'POST' }) };
}

async function collect(lines) {
  const { posted, call } = runStream(lines);
  const res = await call();
  await res.text();                       // 페이지 쪽 소비
  await new Promise((r) => setTimeout(r, 30));
  return posted.filter((m) => m.dir === 'm2i');
}

const D = (o) => 'data: ' + JSON.stringify(o);
const ENC = ['event: delta_encoding', 'data: "v1"'];
const addMsg = (id, role, ctype, extra) => D({ p: '', o: 'add', v: { message: {
  id, author: { role, name: null, metadata: {} },
  content: { content_type: ctype, parts: [''] },
  status: 'in_progress', end_turn: null, recipient: 'all',
  metadata: { model_slug: 'gpt-5-thinking', ...((extra && extra.metadata) || {}) },
  ...(extra || {}) } } });
const append = (t) => D({ p: '/message/content/parts/0', o: 'append', v: t });
const cont = (t) => D({ v: t });
const marker = (id, mk) => D({ type: 'message_marker', message_id: id, marker: mk, event: 'first' });
const COMPLETE = D({ type: 'message_stream_complete', conversation_id: 'c1' });

const results = []; const t = (n, ok) => results.push([n, ok]);
const kinds = (evs) => evs.map((e) => e.kind);
const lastEnd = (evs) => (evs.filter((e) => e.kind === 'end').pop() || {}).payload || {};
const finalText = (evs) => { const d = evs.filter((e) => e.kind === 'delta').pop(); return d ? d.payload.text : null; };

// 1. 평범한 응답
{
  const ev = await collect([...ENC, addMsg('a1','assistant','text'), append('최종 '), append('답변'), COMPLETE]);
  t('begin 1회', kinds(ev).filter((k) => k === 'begin').length === 1);
  t('본문 누적', finalText(ev) === '최종 답변');
  t('end.began true', lastEnd(ev).began === true);
}

// 2. 추론 조각이 앞에 오고 그 본문 델타가 흐른다 — 새어나오면 안 된다 (이번 회귀)
{
  const ev = await collect([...ENC,
    addMsg('r1','assistant','reasoning_recap'),
    append('사용자가 원하는 것은'), append(' 아마도…'),   // ← 추론 본문
    addMsg('a1','assistant','text'),
    append('최종 답변입니다'),
    COMPLETE]);
  t('추론 알림 발생', kinds(ev).includes('thinking'));
  t('begin 은 최종 것 1회만', kinds(ev).filter((k) => k === 'begin').length === 1);
  t('추론 본문이 새지 않는다', !ev.some((e) => e.kind === 'delta' && /아마도/.test(e.payload.text)));
  t('최종 본문만 보인다', finalText(ev) === '최종 답변입니다');
}

// 3. 숨김 시스템 메시지만 있고 그 본문이 흐른다 — 렌더되면 안 된다
{
  const ev = await collect([...ENC,
    addMsg('s1','assistant','text',{ metadata: { is_visually_hidden_from_conversation: true } }),
    append('내부 컨텍스트 문자열'),
    COMPLETE]);
  t('숨김 메시지는 begin 없음', !kinds(ev).includes('begin'));
  t('숨김 본문이 새지 않는다', !ev.some((e) => e.kind === 'delta'));
  t('빈 스트림으로 보고', lastEnd(ev).began === false);
}

// 4. 서버가 user_visible_token 을 주면 건너뛴 것도 받아들인다
{
  const ev = await collect([...ENC,
    addMsg('x1','assistant','reasoning_recap'),
    marker('x1','user_visible_token'),
    append('사실은 최종 답변'),
    COMPLETE]);
  t('marker 로 승격', kinds(ev).filter((k) => k === 'begin').length === 1);
  t('승격 후 본문 수신', finalText(ev) === '사실은 최종 답변');
  t('marker 로 받아들였음을 보고', lastEnd(ev).markerAnchored === true);
}

// 5. add 가 아예 없는 스트림 — 자리를 만들어 한 줄로 받는다
{
  const ev = await collect([...ENC, append('앵커 없는 '), cont('본문'), COMPLETE]);
  t('앵커 합성', kinds(ev).filter((k) => k === 'begin').length === 1);
  t('한 줄로 누적', finalText(ev) === '앵커 없는 본문');
  t('orphan 보고', lastEnd(ev).orphan === true);
}

// 6. 툴 호출(recipient != all)은 본문이 아니다
{
  const ev = await collect([...ENC,
    addMsg('t1','assistant','text',{ recipient: 'python' }),
    append('print(1)'),
    addMsg('a1','assistant','text'),
    append('결과는 1입니다'),
    COMPLETE]);
  t('툴 본문이 새지 않는다', !ev.some((e) => e.kind === 'delta' && /print/.test(e.payload.text)));
  t('최종만 남음', finalText(ev) === '결과는 1입니다');
}

// 7. 모르는 content_type 은 버리지 않는다 (fail-open)
{
  const ev = await collect([...ENC, addMsg('u1','assistant','brand_new_type'), append('새 종류 본문'), COMPLETE]);
  t('모르는 종류도 받는다', finalText(ev) === '새 종류 본문');
}

// 8. add 는 숨김 시스템 메시지뿐인데 서버가 marker 로 진짜 메시지를 알려주는 경우
//    실측에서 반복해 나온 모양이다. 서버 표시를 앵커로 삼아 한 줄로 받아야 한다.
{
  const ev = await collect([...ENC,
    addMsg('sys1','system','text',{ metadata: { is_visually_hidden_from_conversation: true } }),
    marker('real1','user_visible_token'),
    marker('real1','final_channel_token'),
    append('진짜 응답입니다'),
    COMPLETE]);
  t('marker 앵커로 begin 1회', kinds(ev).filter((k) => k === 'begin').length === 1);
  t('marker 앵커 본문 수신', finalText(ev) === '진짜 응답입니다');
  t('markerAnchored 보고', lastEnd(ev).markerAnchored === true);
  t('begin 의 id 가 서버가 준 id', ev.find((e) => e.kind === 'begin').payload.id === 'real1');
}

// 9. 이미 본문을 받고 있으면 marker 가 새 줄을 만들지 않는다
{
  const ev = await collect([...ENC,
    addMsg('a1','assistant','text'), marker('a1','final_channel_token'),
    append('본문'), COMPLETE]);
  t('marker 가 중복 begin 을 만들지 않는다', kinds(ev).filter((k) => k === 'begin').length === 1);
}

// 10. 실측한 모양 그대로 — add 는 숨김 시스템 하나, 나머지는 marker 로만 등장
//     cot 본문이 답변에 섞이면 안 된다.
{
  const ev = await collect([...ENC,
    addMsg('sys1','system','text',{ metadata: { is_visually_hidden_from_conversation: true } }),
    marker('cot1','cot_token'),
    append('사용자가 묻는 것은 산의 높이'),          // ← 추론 본문
    marker('ans1','user_visible_token'),
    marker('ans1','final_channel_token'),
    append('에베레스트산이다.'),
    marker('ans1','last_token'),
    COMPLETE]);
  t('실측형: begin 1회', kinds(ev).filter((k) => k === 'begin').length === 1);
  t('실측형: 추론 알림', kinds(ev).includes('thinking'));
  t('실측형: cot 본문이 섞이지 않는다', !ev.some((e) => e.kind === 'delta' && /사용자가 묻는/.test(e.payload.text)));
  t('실측형: 최종 본문만', finalText(ev) === '에베레스트산이다.');
  t('실측형: begin id 가 서버 id', ev.find((e) => e.kind === 'begin').payload.id === 'ans1');
}

// 11. last_token 은 전환 신호가 아니다 (새 줄을 만들면 안 된다)
{
  const ev = await collect([...ENC,
    marker('a1','user_visible_token'), append('본문'), marker('a1','last_token'), COMPLETE]);
  t('last_token 은 begin 을 늘리지 않는다', kinds(ev).filter((k) => k === 'begin').length === 1);
  t('last_token 뒤에도 본문 유지', finalText(ev) === '본문');
}

// 12. 같은 메시지에 visible marker 가 두 번 와도 한 줄
{
  const ev = await collect([...ENC,
    marker('a1','user_visible_token'), marker('a1','final_channel_token'),
    append('본문'), COMPLETE]);
  t('중복 marker 무해', kinds(ev).filter((k) => k === 'begin').length === 1 && finalText(ev) === '본문');
}

// 13. 마커가 본문보다 늦게 온다 — 이미 받은 본문을 버리면 안 된다 (100% 어긋남 회귀)
{
  const ev = await collect([...ENC,
    append('일본의 수도는 '),
    append('도쿄입니다.'),
    marker('a1','user_visible_token'),
    marker('a1','final_channel_token'),
    COMPLETE]);
  t('늦은 마커: 본문 보존', finalText(ev) === '일본의 수도는 도쿄입니다.');
  t('늦은 마커: end 본문도 보존', lastEnd(ev).text === '일본의 수도는 도쿄입니다.');
  t('늦은 마커: 빈 스트림으로 보고하지 않는다', lastEnd(ev).began === true);
}

// 14. 다만 버리기로 한 메시지의 본문은 여전히 버린다
{
  const ev = await collect([...ENC,
    marker('c1','cot_token'),
    append('추론 중이다'),
    marker('a1','user_visible_token'),
    append('진짜 답'),
    COMPLETE]);
  t('cot 본문은 이어받지 않는다', finalText(ev) === '진짜 답');
}

// 15. complete 는 한 번만 (stream_complete 와 [DONE] 이 둘 다 와도)
{
  const ev = await collect([...ENC,
    addMsg('a1','assistant','text'), append('본문'),
    COMPLETE, 'data: [DONE]']);
  t('end 는 한 번만', ev.filter((e) => e.kind === 'end').length === 1);
}

// --- 메타데이터 델타가 이어받을 경로를 오염시키지 않는다 ---
//
// 본문 사이사이에 /message/metadata/… 델타가 끼어든다(인용·safe_urls).
// 경로를 생략한 델타는 직전 경로를 잇는데, 메타데이터 경로를 이어받으면
// 그 본문이 조용히 버려진다.
// docs/issue/2026-09-08-drift-warning-false-positive.md
{
  const meta = (path, v) => D({ p: path, o: 'append', v });
  const out = await collect([
    ...ENC,
    addMsg('a1', 'assistant', 'text'),
    append('첫 조각'),
    cont(' 이어받은 조각'),                                    // parts/0 을 상속 — 정상
    meta('/message/metadata/content_references', [{ type: 'grouped_webpages' }]),
    cont(' 메타 뒤의 조각'),                                    // 여기가 문제였던 자리
    meta('/message/metadata/safe_urls', ['x']),
    cont(' 두 번째 메타 뒤의 조각'),
    D({ type: 'message_stream_complete' })
  ]);

  const text = out.filter((m) => m.kind === 'delta' || m.kind === 'begin' || m.kind === 'end')
    .reduce((acc, m) => (typeof m.payload.text === 'string' ? m.payload.text : acc), '');

  t('메타 앞 본문이 들어간다', text.includes('첫 조각'));
  t('경로 생략 조각이 들어간다', text.includes('이어받은 조각'));
  t('메타데이터 뒤의 본문도 들어간다', text.includes('메타 뒤의 조각'));
  t('두 번째 메타 뒤의 본문도 들어간다', text.includes('두 번째 메타 뒤의 조각'));
  t('메타데이터 값이 본문에 새지 않는다', !/grouped_webpages/.test(text));
  t('네 조각이 순서대로 이어진다',
    text === '첫 조각 이어받은 조각 메타 뒤의 조각 두 번째 메타 뒤의 조각');
}

// --- 본문 경로가 여럿이면 마지막 본문 경로를 잇는다 ---
{
  const out = await collect([
    ...ENC,
    addMsg('b1', 'assistant', 'text'),
    D({ p: '/message/content/parts/0', o: 'append', v: 'A' }),
    D({ p: '/message/metadata/foo', o: 'append', v: 'M' }),
    cont('B'),                                                  // parts/0 을 이어야 한다
    D({ type: 'message_stream_complete' })
  ]);
  const text = out.reduce((acc, m) => (typeof m.payload.text === 'string' ? m.payload.text : acc), '');
  t('메타 경로를 건너뛰고 본문 경로를 잇는다', text === 'AB');
}

let bad = 0;
results.forEach(([n, ok]) => { if (!ok) bad++; console.log(`  ${ok ? 'PASS' : 'FAIL'}  ${n}`); });
console.log(bad ? `\n${bad}건 실패` : '\n전부 통과');
process.exit(bad ? 1 : 0);
