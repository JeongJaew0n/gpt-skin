// 대화 목록 그룹핑과 사이드바 표시 규칙.
// docs/plan/2026-09-01-sidebar.md 의 1·9 단계.
import fs from 'node:fs'; import vm from 'node:vm';

function load(extra) {
  const sandbox = {
    console, Object, Map, Set, Array, Date, Number, String, Boolean, JSON, Math, Promise, Error,
    document: { querySelectorAll: () => [] },
    location: { pathname: '/' },
    chrome: { storage: { local: { get: async () => ({}), set: async () => {}, remove: async () => {} } } },
    fetch: async () => { throw new Error('no network in test'); },
    ...extra
  };
  sandbox.window = sandbox; sandbox.globalThis = sandbox;
  sandbox.GT = { log() {}, config: { get: (k) => (extra && extra.cfg ? extra.cfg[k] : undefined) } };
  vm.createContext(sandbox);
  vm.runInContext(fs.readFileSync('src/content/chats.js', 'utf8'), sandbox, { filename: 'chats.js' });
  return sandbox.GT;
}

const results = []; const t = (n, ok) => results.push([n, ok]);
const C = (id, o) => ({ id, title: 't-' + id, update_time: '2026-09-01', ...o });

// 1. 고정 / 프로젝트 / 일반 분리
{
  const GT = load();
  const g = GT.chats.group(
    [C('a'), C('b', { pinned_time: '2026-09-01' }), C('c', { gizmo_id: 'g-p-1' }), C('d', { gizmo_id: 'g-p-1' })],
    [{ id: 'g-p-1', name: '세무사' }]
  );
  t('고정 분리', g.pinned.length === 1 && g.pinned[0].id === 'b');
  t('프로젝트 묶임', g.projects.length === 1 && g.projects[0].items.length === 2);
  t('프로젝트 이름 사용', g.projects[0].name === '세무사');
  t('나머지는 chats', g.chats.length === 1 && g.chats[0].id === 'a');
}

// 2. 보관된 대화는 뺀다
{
  const GT = load();
  const g = GT.chats.group([C('a'), C('z', { is_archived: true })], []);
  t('보관 제외', g.chats.length === 1);
}

// 3. 고정이 프로젝트보다 우선한다 (원본 사이드바와 같은 순서)
{
  const GT = load();
  const g = GT.chats.group([C('x', { pinned_time: '2026-09-01', gizmo_id: 'g-p-1' })], [{ id: 'g-p-1', name: 'P' }]);
  t('고정 우선', g.pinned.length === 1 && g.projects.length === 0);
}

// 4. 이름을 모르는 프로젝트도 버리지 않는다
{
  const GT = load();
  const g = GT.chats.group([C('a', { gizmo_id: 'g-p-unknown-1234567890' })], []);
  t('이름 없는 프로젝트 유지', g.projects.length === 1 && g.projects[0].items.length === 1);
  t('id 앞부분을 이름 대용으로', g.projects[0].name.length <= 12);
}

// 5. flatten 은 헤더와 항목을 섞어 순서대로 낸다
{
  const GT = load();
  const rows = GT.chats.flatten(GT.chats.group(
    [C('a'), C('b', { pinned_time: 'x' }), C('c', { gizmo_id: 'g1' })], [{ id: 'g1', name: 'P' }]));
  const kinds = rows.map((r) => r.kind + (r.kind === 'header' ? ':' + r.label : ''));
  t('순서: pinned → projects → chats',
    kinds.join('|') === 'header:~/pinned|chat|header:~/projects/P|chat|header:~/chats|chat');
}

// 6. 빈 그룹은 헤더도 안 낸다
{
  const GT = load();
  const rows = GT.chats.flatten(GT.chats.group([C('a')], []));
  t('빈 그룹 헤더 없음', rows.filter((r) => r.kind === 'header').length === 1);
}

// 7. 제목 없는 대화도 자리를 지킨다
{
  const GT = load();
  const g = GT.chats.group([{ id: 'a', title: '' }], []);
  t('제목 없으면 대체 문구', g.chats[0].title === '(제목 없음)');
}

// 8. href 는 항상 /c/<id>
{
  const GT = load();
  const g = GT.chats.group([C('abc')], []);
  t('href 형식', g.chats[0].href === '/c/abc');
}

// 9. 접힌 그룹은 항목을 내지 않는다
{
  const GT = load();
  const g = GT.chats.group([C('a'), C('b', { pinned_time: 'x' })], []);
  const open = GT.chats.flatten(g, new Set());
  const shut = GT.chats.flatten(g, new Set(['pinned']));
  t('펼침: 헤더 2 + 항목 2', open.length === 4);
  t('접음: 헤더는 남고 항목만 빠짐', shut.length === 3 && shut.filter((r) => r.kind === 'header').length === 2);
  t('접힘 표시가 헤더에 실림', shut.find((r) => r.key === 'pinned').collapsed === true);
  t('헤더가 개수를 들고 있다', open.find((r) => r.key === 'pinned').count === 1);
}

// 10. 그룹 키는 안정적이어야 한다 (접힘 상태를 저장하므로)
{
  const GT = load();
  const rows = GT.chats.flatten(GT.chats.group([C('a', { gizmo_id: 'g-p-9' })], [{ id: 'g-p-9', name: '세무사' }]));
  t('프로젝트 키는 id 기반', rows[0].key === 'p:g-p-9');
}

// 11. collapsed 를 배열로 줘도 동작한다 (storage 에서 배열로 돌아온다)
{
  const GT = load();
  const g = GT.chats.group([C('a')], []);
  t('배열 허용', GT.chats.flatten(g, ['chats']).length === 1);
}

// 프로젝트는 비어 있어도 보인다 (0.21.0)
// 프로젝트의 대화는 기본 목록 API 에 없어 처음엔 늘 비어 있다. 예전엔 빈 묶음을 건너뛰어 이름이 한 번도 안 보였다
// (실측 2026-10-02 로그인 계정: 프로젝트 API 5개 · 우리 목록엔 ~/chats 만).
{
  const GT = load();
  const g = GT.chats.group([C('a')], [{ id: 'g-p-1', name: '세무사' }]);
  g.projects.push({ id: 'g-p-1', name: '세무사', items: [] });
  const rows = GT.chats.flatten(g, new Set());
  const h = rows.find((r) => r.key === 'p:g-p-1');
  t('빈 프로젝트도 머리줄을 낸다', !!h && h.label === '~/projects/세무사');
  t('아직 안 읽었으면 접힌 채 · 개수 없음', h && h.collapsed === true && h.count === null);
  g.projects[0].loaded = true;
  const h2 = GT.chats.flatten(g, new Set()).find((r) => r.key === 'p:g-p-1');
  t('읽었는데 비었으면 개수 0 · 펼침', h2 && h2.count === 0 && h2.collapsed === false);
  t('고정 · 일반 묶음은 여전히 비면 안 낸다', !rows.some((r) => r.key === 'pinned'));
}
{
  // 실제 응답 모양(2026-10-02): items[].gizmo.{id, display.name}. 목록에는 프로젝트 대화가 없다.
  const GT = load();
  const calls = [];
  GT.oai = { get: async (u) => {
    calls.push(u);
    if (u.startsWith('/backend-api/gizmos/snorlax/sidebar')) return { items: [{ gizmo: { id: 'g-p-1', display: { name: '세무사' } } }, { gizmo: { id: 'g-p-2', display: { name: '이사' } } }] };
    if (u.startsWith('/backend-api/gizmos/g-p-1/conversations')) return { items: [C('p1'), C('p2')] };
    if (u.startsWith('/backend-api/gizmos/g-p-2/conversations')) return { items: [] };
    return { items: [C('a'), C('b')], total: 2 };
  } };
  const g = await GT.chats.load();
  const heads = GT.chats.flatten(g, new Set()).filter((r) => r.kind === 'header').map((r) => r.label);
  t('목록에 프로젝트 이름이 보인다', heads.includes('~/projects/세무사') && heads.includes('~/projects/이사'));
  t('읽기 전 프로젝트 대화는 부르지 않는다', !calls.some((u) => /g-p-1\/conversations/.test(u)));
  const g2 = await GT.chats.loadProject('g-p-1');
  const rows2 = GT.chats.flatten(g2, new Set());
  const h = rows2.find((r) => r.key === 'p:g-p-1');
  t('펼쳐 읽으면 대화가 들어온다', h.count === 2 && rows2.filter((r) => r.group === 'p:g-p-1').length === 2);
  t('읽은 프로젝트로 표시된다', GT.chats.isProjectLoaded('g-p-1') && !GT.chats.isProjectLoaded('g-p-2'));
  const g3 = await GT.chats.loadProject('g-p-2');
  const h3 = GT.chats.flatten(g3, new Set()).find((r) => r.key === 'p:g-p-2');
  t('읽었는데 빈 프로젝트는 개수 0 으로 펼친다 (다시 읽으러 가지 않게)', h3 && h3.count === 0 && h3.collapsed === false);
}
{
  const sb = fs.readFileSync('src/content/sidebar.js', 'utf8');
  t('안 읽은 프로젝트를 누르면 펼치기로 본다 (collapsed 에 없어도)',
    /const opening = collapsed\.has\(key\) \|\| !!\(gid && !GT\.chats\.isProjectLoaded\(gid\)\);/.test(sb));
  t('개수가 없으면 비워 둔다', /r\.count == null \? '' : String\(r\.count\)/.test(sb));
}

let bad = 0;
results.forEach(([n, ok]) => { if (!ok) bad++; console.log(`  ${ok ? 'PASS' : 'FAIL'}  ${n}`); });
console.log(bad ? `\n${bad}건 실패` : '\n전부 통과');
process.exit(bad ? 1 : 0);
