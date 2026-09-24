// 한 턴에 assistant 메시지가 여러 개 와도 스크롤백에는 하나만 남아야 한다.
// docs/issue/2026-08-31-assistant-message-duplication.md 의 수정 B 회귀 방지.
import fs from 'node:fs'; import vm from 'node:vm';

function fresh() {
  const sandbox = { console, Object, Map, Array, Date, Number, String, Boolean };
  sandbox.globalThis = sandbox;
  sandbox.GT = {};
  vm.createContext(sandbox);
  vm.runInContext(fs.readFileSync('src/content/store.js', 'utf8'), sandbox, { filename: 'store.js' });
  return sandbox.GT.store;
}

const results = [];
const t = (name, ok) => results.push([name, ok]);
const shape = (st) => st.state.messages.map((m) => `${m.role}:${m.text}`);

// 1. 추론 조각 두 개 뒤에 최종 응답 — assistant 는 하나만, 마지막 내용으로
{
  const s = fresh();
  s.userSent('질문', 'u1');
  s.begin({ id: 'a1', role: 'assistant', model: 'gpt-5-thinking', text: '' });
  s.delta('a1', '생각 중...');
  s.begin({ id: 'a2', role: 'assistant', model: 'gpt-5-thinking', text: '' });
  s.delta('a2', '더 생각 중...');
  s.begin({ id: 'a3', role: 'assistant', model: 'gpt-5-thinking', text: '' });
  s.delta('a3', '최종 답변');
  s.end('a3', '최종 답변');
  t('중간 메시지 2개 → assistant 레코드 1개', s.state.messages.filter((m) => m.role === 'assistant').length === 1);
  t('마지막 내용만 남음', shape(s).join('|') === 'user:질문|assistant:최종 답변');
  t('대체 횟수 기록', s.state.superseded === 2);
  t('byId 에 옛 id 안 남음', !s.state.byId.has('a1') && !s.state.byId.has('a2') && s.state.byId.has('a3'));
}

// 2. end 뒤에 begin 이 또 와도 새 줄이 생기면 안 된다 (자리를 사용자 메시지만 비운다)
{
  const s = fresh();
  s.userSent('질문', 'u1');
  s.begin({ id: 'a1', role: 'assistant', text: '' });
  s.delta('a1', '중간');
  s.end('a1', '중간');
  s.begin({ id: 'a2', role: 'assistant', text: '' });
  s.delta('a2', '진짜 답');
  s.end('a2', '진짜 답');
  t('end→begin 후속도 대체됨', s.state.messages.filter((m) => m.role === 'assistant').length === 1);
  t('end→begin 내용은 마지막 것', s.state.messages[1].text === '진짜 답');
}

// 3. 사용자 메시지가 오면 자리가 비워져 다음 턴은 새 줄이 된다
{
  const s = fresh();
  s.userSent('첫 질문', 'u1');
  s.begin({ id: 'a1', role: 'assistant', text: '' }); s.delta('a1', '답1'); s.end('a1', '답1');
  s.userSent('둘째 질문', 'u2');
  s.begin({ id: 'a2', role: 'assistant', text: '' }); s.delta('a2', '답2'); s.end('a2', '답2');
  t('턴이 바뀌면 새 줄', shape(s).join('|') === 'user:첫 질문|assistant:답1|user:둘째 질문|assistant:답2');
  t('정상 대화에서는 대체 없음', s.state.superseded === 0);
}

// 4. 대체해도 순서가 유지된다
{
  const s = fresh();
  s.userSent('q1', 'u1');
  s.begin({ id: 'a1', role: 'assistant', text: '' }); s.end('a1', 'A');
  s.userSent('q2', 'u2');
  s.begin({ id: 'b1', role: 'assistant', text: '' }); s.delta('b1', '생각');
  s.begin({ id: 'b2', role: 'assistant', text: '' }); s.delta('b2', 'B'); s.end('b2', 'B');
  t('순서 유지', shape(s).join('|') === 'user:q1|assistant:A|user:q2|assistant:B');
}

// 5. 대체 후 delta 는 새 레코드에 붙는다 (옛 id 로 오는 delta 가 유령 줄을 만들면 안 된다)
{
  const s = fresh();
  s.userSent('q', 'u1');
  s.begin({ id: 'a1', role: 'assistant', text: '' });
  s.begin({ id: 'a2', role: 'assistant', text: '' });
  s.delta('a2', '본문');
  t('새 id delta 반영', s.state.byId.get('a2').text === '본문');
  t('레코드 수 그대로', s.state.messages.length === 2);
}

// 6. harvest 는 자리와 카운터를 초기화한다
{
  const s = fresh();
  s.userSent('q', 'u1');
  s.begin({ id: 'a1', role: 'assistant', text: '' });
  s.begin({ id: 'a2', role: 'assistant', text: '' });
  s.replaceAll([{ id: 'x', role: 'user', text: 'from dom' }], { path: '/c/1' });
  t('harvest 후 자리 초기화', s.state.slotId === null && s.state.superseded === 0);
  s.begin({ id: 'a3', role: 'assistant', text: '새 응답' });
  t('harvest 직후 begin 은 새 줄', s.state.messages.length === 2);
}

// 7. add 를 놓쳐도 응답은 한 줄이어야 한다
//    회귀: id 없는 델타가 매번 새 레코드를 만들어 '점점 길어지는 접두사'가 수십 줄 쌓였다.
{
  const s = fresh();
  s.userSent('q', 'u1');
  s.delta(null, '3의');
  s.delta(null, '3의 제곱근은');
  s.delta(null, '3의 제곱근은 1.7321입니다');
  t('id 없는 델타 3번 → 레코드 1개', s.state.messages.filter((m) => m.role === 'assistant').length === 1);
  t('마지막 내용만', s.state.messages[1].text === '3의 제곱근은 1.7321입니다');
  t('orphan 카운트', s.state.orphanDeltas === 1);
  t('익명 레코드 없음', s.state.messages.every((m) => !!m.id));
}

// 8. add 를 놓친 뒤 뒤늦게 add 가 와도 두 줄이 되지 않는다
{
  const s = fresh();
  s.userSent('q', 'u1');
  s.delta(null, '앞부분');
  s.begin({ id: 'real', role: 'assistant', text: '' });
  s.delta('real', '진짜 응답');
  s.end('real', '진짜 응답');
  t('뒤늦은 add 도 한 줄', s.state.messages.filter((m) => m.role === 'assistant').length === 1);
  t('내용은 진짜 응답', s.state.messages[1].text === '진짜 응답');
}

// 9. 모르는 id 로 온 델타는 진행 중인 레코드에 붙는다
{
  const s = fresh();
  s.userSent('q', 'u1');
  s.begin({ id: 'a1', role: 'assistant', text: '' });
  s.delta('없는id', '이어붙임');
  t('진행 중 레코드에 붙음', s.state.messages.length === 2 && s.state.byId.get('a1').text === '이어붙임');
}

// --- 보낸 즉시 올리고, 진짜 id 가 오면 그 줄에 달아 준다 ---
// docs/issue/2026-09-07-user-message-appears-late.md
{
  const S = fresh();

  S.userSent('안녕');                              // 보낼 때 — id 가 없다
  t('보낸 즉시 화면에 올라간다', S.state.messages.length === 1);
  const rec = S.state.messages[0];
  const tempId = rec.id;
  t('사용자 메시지다', rec.role === 'user' && rec.text === '안녕');
  t('임시 id 를 단다', /^local-/.test(tempId));

  S.userSent('안녕', 'real-1');                    // SSE 가 진짜 id 로 다시 알려준다
  t('줄이 늘지 않는다', S.state.messages.length === 1);
  t('같은 레코드다', S.state.messages[0] === rec);
  t('진짜 id 로 갈아탄다', rec.id === 'real-1');
  t('byId 로 찾을 수 있다', S.state.byId.get('real-1') === rec);
  t('임시 id 는 지워진다', S.state.byId.get(tempId) === undefined);
}

// --- 수확이 진짜 id 로 같은 질문을 물어와도 두 줄이 되지 않는다 ---
{
  const S = fresh();
  S.userSent('질문 하나');
  S.applyHarvest([{ id: 'srv-9', role: 'user', text: '질문 하나' }], { path: '/c/x' });
  const users = S.state.messages.filter((m) => m.role === 'user');
  t('수확 경로에서도 합쳐진다', users.length === 1);
  t('수확이 준 id 를 쓴다', users[0].id === 'srv-9');
}

// --- 본문이 다르면 별개의 질문이다 ---
{
  const S = fresh();
  S.userSent('첫 질문');
  S.userSent('둘째 질문', 'real-2');
  t('다른 본문은 합치지 않는다', S.state.messages.length === 2);
}

// --- 같은 질문을 연달아 두 번 보내도 두 줄로 남는다 ---
{
  const S = fresh();
  S.userSent('같은 말');
  S.userSent('같은 말', 'real-a');
  S.begin({ id: 'ans', role: 'assistant', text: '답' });
  S.end('ans', '답');
  S.userSent('같은 말');
  t('턴이 다르면 합치지 않는다',
    S.state.messages.filter((m) => m.role === 'user').length === 2);
}

// --- 전송이 실패하면 올리지 않는다 (호출 자체를 안 한다) ---
{
  const idx = fs.readFileSync('src/content/shell/prompt.js', 'utf8');   // 전송 경로는 2026-09-24 에 shell/prompt.js 로 옮겼다
  t('성공했을 때만 올린다',
    /if \(!r\.ok\) \{[\s\S]{0,200}?\} else \{[\s\S]{0,400}?GT\.store\.userSent\(text\);/.test(idx));
  t('왜 올리는지 문서를 가리킨다', /user-message-appears-late\.md/.test(idx));
}

let bad = 0;
results.forEach(([n, ok]) => { if (!ok) bad++; console.log(`  ${ok ? 'PASS' : 'FAIL'}  ${n}`); });
console.log(bad ? `\n${bad}건 실패` : '\n전부 통과');
process.exit(bad ? 1 : 0);
