// 대화 조작(원본 "..." 메뉴). 되돌릴 수 없는 것은 확인 없이 실행되면 안 된다.
import fs from 'node:fs'; import vm from 'node:vm';

const results = []; const t = (n, ok) => results.push([n, ok]);
const ops = fs.readFileSync('src/content/convops.js', 'utf8');
const cmds = fs.readFileSync('src/content/commands.js', 'utf8');
const sb = fs.readFileSync('src/content/sidebar.js', 'utf8');

// --- 정적 ---
t('모달을 띄우지 않는다', !/\bprompt\(|\bconfirm\(|\balert\(/.test(sb + cmds + ops));
t('삭제는 yes 없이는 실행 안 된다', /!== 'yes'\)/.test(cmds));
t('삭제 전에 대상을 보여준다', /대상: \$\{c\.title\}/.test(cmds));
t('메뉴의 삭제는 두 번 눌러야 한다', /armed/.test(sb));
t('삭제가 되돌릴 수 없음을 코드에 명시', /되돌릴 수 없다/.test(ops));
t('미검증 표시가 남아 있지 않다', !/\[미검증\]/.test(ops));
t('공유는 API 로 하지 않는다고 명시', /공개 링크/.test(ops) && /SHARE_BUTTON/.test(ops));
t('프로젝트 빼기는 빈 문자열임을 주석에 남겼다', /이 아니라 빈 문자열/.test(ops));
t('이름 바꾸기는 입력줄에 명령을 채운다', /:rename @\$\{rec\.id\.slice/.test(sb));

// --- 동작: 가짜 oai 로 ---
{
  const calls = [];
  const sandbox = { console, Object, Array, JSON, Promise, Error, String, Number, Boolean,
    encodeURIComponent };
  sandbox.window = sandbox; sandbox.globalThis = sandbox;
  sandbox.GT = { oai: { patch: async (url, body) => { calls.push({ url, body }); return { success: true }; } } };
  vm.createContext(sandbox);
  vm.runInContext(ops, sandbox, { filename: 'convops.js' });
  const C = sandbox.GT.convops;

  await C.rename('abc', '새 이름');
  t('rename 은 title 만 보낸다', calls[0].url.endsWith('/backend-api/conversation/abc')
    && JSON.stringify(calls[0].body) === '{"title":"새 이름"}');

  await C.pin('abc', true);
  t('pin 은 is_starred', JSON.stringify(calls[1].body) === '{"is_starred":true}');
  await C.pin('abc', false);
  t('pin 해제도 같은 필드', JSON.stringify(calls[2].body) === '{"is_starred":false}');

  await C.archive('abc', true);
  t('archive 는 is_archived', JSON.stringify(calls[3].body) === '{"is_archived":true}');

  await C.remove('abc');
  t('remove 는 is_visible:false', JSON.stringify(calls[4].body) === '{"is_visible":false}');

  t('id 를 URL 인코딩한다', (await C.rename('a/b', 'x'), calls[5].url.includes('a%2Fb')));
  t('불리언을 강제한다', (await C.pin('abc', 'truthy'), calls[6].body.is_starred === true));
}

// --- 다중 삭제: 하나가 실패해도 끝까지 간다 ---
{
  const seen = [];
  const sandbox = { console, Object, Array, JSON, Promise, Error, String, Number, Boolean, encodeURIComponent };
  sandbox.window = sandbox; sandbox.globalThis = sandbox;
  sandbox.GT = { oai: { patch: async (url) => {
    const id = url.split('/').pop();
    seen.push(id);
    if (id === 'bad') throw new Error('500');
    if (id === 'soft') return { success: false };
    return { success: true };
  } } };
  vm.createContext(sandbox);
  vm.runInContext(ops, sandbox, { filename: 'convops.js' });
  const C = sandbox.GT.convops;

  const steps = [];
  const res = await C.removeMany(['a', 'bad', 'b', 'soft', 'c'], (i, n) => steps.push(`${i}/${n}`));

  t('실패해도 멈추지 않는다', seen.length === 5);
  t('성공 3건', res.done.length === 3 && res.done.join(',') === 'a,b,c');
  t('실패 2건을 사유와 함께', res.failed.length === 2
    && res.failed[0].id === 'bad' && res.failed[0].error === '500'
    && res.failed[1].id === 'soft');
  t('진행 상황을 보고한다', steps.length === 5 && steps[4] === '5/5');
  t('순차로 부른다', seen.join(',') === 'a,bad,b,soft,c');
}

// --- 선택 UI ---
{
  const sbSrc = fs.readFileSync('src/content/sidebar.js', 'utf8');
  const idx = fs.readFileSync('src/content/index.js', 'utf8');
  const prm = fs.readFileSync('src/content/shell/prompt.js', 'utf8');
  t('선택 모드는 기본 꺼짐', /let selecting = false/.test(sbSrc));
  t('체크박스를 그린다', /\[×\]|\[ \]/.test(sbSrc));
  t('삭제는 두 단계(armed)', /if \(armed\)/.test(sbSrc) && /정말 삭제/.test(sbSrc));
  t('무엇을 지우는지 스크롤백에 남긴다', /삭제합니다 — 되돌릴 수 없습니다/.test(sbSrc));
  t('진행 상황 표시', /삭제 중 \$\{i\}\/\$\{n\}/.test(sbSrc));
  t('실패 건을 개별로 보고', /res\.failed\.forEach/.test(sbSrc));
  t('esc 로 빠져나온다', /GT\.sidebar\.selecting.*exitSelect|selecting\) \{ e\.preventDefault\(\); GT\.sidebar\.exitSelect/.test(prm));
  t('선택 중에는 행 클릭이 이동이 아니라 토글', /if \(selecting\) \{ togglePick/.test(sbSrc));
}

// --- 프로젝트 이동: null 이 아니라 빈 문자열 ---
{
  const calls = [];
  let gizmo = null;
  const sandbox = { console, Object, Array, JSON, Promise, Error, String, Number, Boolean, encodeURIComponent };
  sandbox.window = sandbox; sandbox.globalThis = sandbox;
  sandbox.GT = { oai: {
    patch: async (url, body) => { calls.push(body); if ('gizmo_id' in body) gizmo = body.gizmo_id || null; return { success: true }; },
    get: async () => ({ gizmo_id: gizmo })
  } };
  vm.createContext(sandbox);
  vm.runInContext(ops, sandbox, { filename: 'convops.js' });
  const C = sandbox.GT.convops;

  const into = await C.moveToProject('abc', 'g-p-1');
  t('넣기: gizmo_id 를 보낸다', calls[0].gizmo_id === 'g-p-1' && into.ok === true);

  const out = await C.moveToProject('abc', null);
  t('빼기: null 이 아니라 빈 문자열', calls[1].gizmo_id === '');
  t('빼기 성공', out.ok === true && out.gizmoId === null);

  // 서버가 200 을 주고도 실제로 안 바뀌는 경우 — null 로 빼려 할 때 실제로 그랬다
  gizmo = 'g-p-1';
  sandbox.GT.oai.patch = async () => ({ success: true });      // 값은 그대로 둔다
  const stuck = await C.moveToProject('abc', null);
  t('반영 안 되면 성공이라 하지 않는다', stuck.ok === false && stuck.reason === 'not-applied');
}

let bad = 0;
results.forEach(([n, ok]) => { if (!ok) bad++; console.log(`  ${ok ? 'PASS' : 'FAIL'}  ${n}`); });
console.log(bad ? `\n${bad}건 실패` : '\n전부 통과');
process.exit(bad ? 1 : 0);
