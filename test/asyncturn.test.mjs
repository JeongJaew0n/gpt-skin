// 스트림이 끝난 뒤에도 원본에서 이어지는 턴 (리뷰 2026-11-03, 크롬 · gpt-6-thinking 실측).
// 그림은 비동기로 그려진다 — 스트림은 생각 조각만 싣고 [DONE] 으로 끝나고, 원본은 약 80초 뒤 그림과 끝 메시지를 붙인다.
//   1. 예전에는 600ms 뒤 한 번만 대화 원본을 읽어 그림이 새로고침 전까지 안 보였다 → 끝날 때까지 다시 읽는다(chase)
//   2. 늦게 들어온 그림이 다음 질문 아래에 붙었다 — 수확용 합치기가 처음 보는 기록을 끝에 덧붙였다 → 원본 순서(applyApi)
//   3. 턴이 끝났는지는 분기 끝 메시지의 end_turn 으로 안다 (conversation.load 의 done)
import fs from 'node:fs'; import vm from 'node:vm';

const results = []; const t = (n, ok) => results.push([n, ok]);

function store() {
  const sb = { console, Object, Map, Set, Array, Date, Number, String, Boolean };
  sb.globalThis = sb; sb.GT = {};
  vm.createContext(sb);
  vm.runInContext(fs.readFileSync('src/content/store.js', 'utf8'), sb, { filename: 'store.js' });
  return sb.GT.store;
}
const shape = (s) => s.state.messages.map((m) => `${m.role}:${m.text || (m.images ? '[img]' : '')}`).join(' | ');
const img = (id) => ({ id, role: 'assistant', text: '', images: [{ pointer: 'sediment://file_' + id, mime: 'image/png', w: 8, h: 8 }] });

// ---------------------------------------------------------------- 원본 순서로 반영
{
  const s = store();
  s.replaceAll([{ id: 'u1', role: 'user', text: '고양이' }], { path: '/c/x', title: 't' });
  s.userSent('강아지');                                  // 방금 보낸 내 메시지 — 임시 id (스트림이 input_message 를 안 줬다)
  t('보낸 메시지는 임시 id', /^local-/.test(s.state.messages[1].id));
  // 다시 읽기: 고양이 그림이 이제 붙었고, 내 메시지는 진짜 id 로 왔다
  const api = (typeof s.applyApi === 'function' ? s.applyApi.bind(s) : s.applyHarvest.bind(s));
  api([{ id: 'u1', role: 'user', text: '고양이' }, img('i1'), { id: 'u2', role: 'user', text: '강아지' }], { path: '/c/x' });
  t('늦게 온 그림이 제 차례(고양이 질문 뒤)에 선다', shape(s) === 'user:고양이 | assistant:[img] | user:강아지');
  t('내 메시지는 진짜 id 를 단다 (두 줄이 되지 않는다)', s.state.messages[2].id === 'u2' && s.state.messages.length === 3);
}
{
  const s = store();
  s.replaceAll([{ id: 'u1', role: 'user', text: '하나' }, { id: 'a1', role: 'assistant', text: '답' }], { path: '/c/x' });
  s.userSent('둘');                                      // 원본에 아직 없다
  s.applyApi && s.applyApi([{ id: 'u1', role: 'user', text: '하나' }, { id: 'a1', role: 'assistant', text: '답' }], { path: '/c/x' });
  t('원본에 아직 없는 내 메시지는 끝에 남는다', shape(s) === 'user:하나 | assistant:답 | user:둘');
}
{
  const s = store();
  s.replaceAll([{ id: 'u1', role: 'user', text: '질문' }, { id: 'old', role: 'assistant', text: '예전 답' }], { path: '/c/x' });
  s.applyApi && s.applyApi([{ id: 'u1', role: 'user', text: '질문' }, { id: 'new', role: 'assistant', text: '다시 만든 답' }], { path: '/c/x' });
  t('원본에 없는 진짜 id(다른 분기)는 버린다', shape(s) === 'user:질문 | assistant:다시 만든 답');
}
{
  const s = store();
  s.replaceAll([{ id: 'u1', role: 'user', text: '질문' }], { path: '/c/x' });
  s.begin({ id: 'a9', role: 'assistant', text: '받는' });
  s.delta('a9', '받는 중인 답');
  s.applyApi && s.applyApi([{ id: 'u1', role: 'user', text: '질문' }], { path: '/c/x' });
  t('받는 중인 답은 원본에 아직 없어도 지킨다', shape(s) === 'user:질문 | assistant:받는 중인 답' && s.state.messages[1].streaming === true);
}
{
  const s = store();
  s.replaceAll([{ id: 'u1', role: 'user', text: '질문' }, { id: 'a1', role: 'assistant', text: '답', refs: [{ type: 'webpage' }] }], { path: '/c/x' });
  s.applyApi && s.applyApi([{ id: 'u1', role: 'user', text: '질문' }, { id: 'a1', role: 'assistant', text: '답' }], { path: '/c/x' });
  t('원본 쪽에 없는 출처(refs)는 지킨다', (s.state.messages[1].refs || []).length === 1);
}
{
  const s = store();
  s.replaceAll([{ id: 'u1', role: 'user', text: '가' }], { path: '/c/x' });
  s.applyApi && s.applyApi([{ id: 'v1', role: 'user', text: '다른 대화' }], { path: '/c/y', title: '딴' });
  t('다른 대화면 갈아엎는다', shape(s) === 'user:다른 대화' && s.state.path === '/c/y');
}

// ---------------------------------------------------------------- 턴이 끝났는가 (conversation.load)
{
  const sb = { console, Object, Set, Map, Array, Number, String, Boolean, JSON, Math, Promise, Error, encodeURIComponent, location: { pathname: '/c/x' } };
  sb.window = sb; sb.globalThis = sb;
  let reply = null;
  sb.GT = { oai: { get: async () => reply } };
  vm.createContext(sb);
  vm.runInContext(fs.readFileSync('src/content/conversation.js', 'utf8'), sb, { filename: 'conversation.js' });
  const C = sb.GT.conversation;
  const conv = (tail) => {
    const msgs = [{ id: 'u', author: { role: 'user' }, recipient: 'all', content: { content_type: 'text', parts: ['그려 줘'] } }, ...tail];
    const mapping = { root: { id: 'root', parent: null, message: null } };
    let prev = 'root';
    msgs.forEach((m) => { mapping[m.id] = { id: m.id, parent: prev, message: m }; prev = m.id; });
    return { mapping, current_node: prev, title: 'T' };
  };
  // 실측 모양: 그리는 동안 분기 끝은 그림 도구 호출(end_turn false), 끝나면 assistant · text · end_turn true
  reply = conv([{ id: 'c', author: { role: 'assistant' }, recipient: 'img.tool', end_turn: false, content: { content_type: 'code', text: '{}' } }]);
  const busy = await C.load('x');
  t('그리는 동안은 끝나지 않았다', busy.done === false);
  reply = conv([
    { id: 'c', author: { role: 'assistant' }, recipient: 'img.tool', end_turn: false, content: { content_type: 'code', text: '{}' } },
    { id: 'i', author: { role: 'tool' }, recipient: 'all', content: { content_type: 'multimodal_text', parts: [{ content_type: 'image_asset_pointer', asset_pointer: 'sediment://file_1', width: 8, height: 8 }] } },
    { id: 'e', author: { role: 'assistant' }, recipient: 'all', end_turn: true, metadata: { is_visually_hidden_from_conversation: true }, content: { content_type: 'text', parts: [''] } }
  ]);
  const done = await C.load('x');
  t('끝 메시지가 end_turn 이면 끝났다', done.done === true && done.pending === false);
  t('그림 기록이 실려 온다', done.messages.some((m) => m.images && m.images.length === 1));
  t('그리는 동안은 이어지는 중(pending) — 도구 호출에서 멈춰 있다', busy.pending === true);

  // 실측(판다 턴): 끝이 reasoning_recap · end_turn false 였다 — 끝났다고도 이어진다고도 못 한다. 다시 읽는 쪽이 '두 번 그대로' 로 정한다
  reply = conv([
    { id: 'c', author: { role: 'assistant' }, recipient: 'img.tool', end_turn: false, content: { content_type: 'code', text: '{}' } },
    { id: 'i', author: { role: 'tool' }, recipient: 'all', status: 'finished_successfully', content: { content_type: 'multimodal_text', parts: [{ content_type: 'image_asset_pointer', asset_pointer: 'sediment://file_1', width: 8, height: 8 }] } },
    { id: 'r', author: { role: 'assistant' }, recipient: 'all', end_turn: false, status: 'finished_successfully', content: { content_type: 'reasoning_recap', content: '' } }
  ]);
  const recap = await C.load('x');
  t('끝이 reasoning_recap 이면 done 은 아니지만 이어지는 중도 아니다', recap.done === false && recap.pending === false);
  // 답 글이 자라는 중 (실측: status in_progress) · 비동기 작업이 걸려 있다
  reply = conv([{ id: 't', author: { role: 'assistant' }, recipient: 'all', status: 'in_progress', content: { content_type: 'text', parts: ['쓰는'] } }]);
  t('답 글이 자라는 중이면 이어지는 중', (await C.load('x')).pending === true);
  reply = { ...conv([{ id: 'e', author: { role: 'assistant' }, recipient: 'all', end_turn: true, content: { content_type: 'text', parts: ['끝'] } }]), async_status: 'running' };
  const asy = await C.load('x');
  t('async_status 가 있으면 이어지는 중 (끝 메시지가 있어도)', asy.pending === true && asy.done === false);
  t('분기 모양(sig)이 메시지가 늘면 바뀐다', busy.sig !== done.sig && recap.sig !== done.sig);
}

// ---------------------------------------------------------------- 배선 (index.js — 정적)
{
  const idx = fs.readFileSync('src/content/index.js', 'utf8');
  t('본문 없이 끝난 스트림은 끝날 때까지 다시 읽는다', /if \(p\.began === false\) \{[\s\S]{0,120}chase\('stream-empty', \(\) => \{/.test(idx));
  // 생각 조각만 싣고 끝나는 비동기 그림 턴마다 배지에 '판별자가 낡았다' 헛경보가 떴다 — 턴이 끝나고도 보일 것이 없을 때만
  t('빈 스트림 경고는 턴이 끝난 뒤, 보일 답이 없을 때만', /if \(!skipped\.length \|\| turnHasOutput\(\)\) return;\s*\n\s*GT\.health\.soft\(`최종 응답을 찾지 못했습니다/.test(idx)
    && (idx.match(/최종 응답을 찾지 못했습니다/g) || []).length === 1);
  t('답 글 뒤에도 턴이 이어지면 다시 읽는다', /if \(conv && conv\.done === false\) chase\('turn-pending'\);/.test(idx));
  t('끝 판단: end_turn 이거나, 이어지는 중이 아닌 채 분기가 두 번 연달아 그대로', /if \(conv && conv\.sig === run\.sig && !conv\.pending\) run\.same \+= 1; else run\.same = 0;/.test(idx)
    && /if \(conv && \(conv\.done \|\| run\.same >= 2\)\) \{/.test(idx));
  t('대화 원본은 원본 순서로 반영한다', /GT\.store\.applyApi\(conv\.messages,/.test(idx) && !/GT\.store\.applyHarvest\(conv\.messages/.test(idx));
  t('다시 읽기는 끝나면 멈추고 알린다', /if \(conv && \(conv\.done \|\| run\.same >= 2\)\) \{\s*\n\s*chasing = null;[\s\S]{0,120}if \(onDone\) onDone\(\);/.test(idx));
  t('다른 대화 · 새 스트림 · 상한에서 멈춘다', /idFromPath\(\) !== cid \|\| GT\.store\.state\.streamingId \|\| Date\.now\(\) - run\.t0 > CHASE_MAX_MS/.test(idx));
  t('다시 읽는 동안 생각 중을 띄운다', /const want = \(generating \|\| !!chasing\) && !GT\.store\.state\.streamingId;/.test(idx));
  // 부팅은 컴포저 · 스레드를 기다리며 멈춘다(await). 그 사이 'end' 가 오면 늦게 선언한 let 을 건드려 TDZ 오류가 난다
  t('다시 읽기 상태는 이벤트 처리기보다 먼저 선언한다', idx.indexOf('let chasing = null;') > 0
    && idx.indexOf('let chasing = null;') < idx.indexOf("GT.on('end'") && idx.indexOf('let chasing = null;') < idx.indexOf('await GT.config.load()'));
}

let bad = 0;
results.forEach(([n, ok]) => { if (!ok) bad++; console.log(`  ${ok ? 'PASS' : 'FAIL'}  ${n}`); });
console.log(bad ? `\n${bad}건 실패` : '\n전부 통과');
process.exit(bad ? 1 : 0);
