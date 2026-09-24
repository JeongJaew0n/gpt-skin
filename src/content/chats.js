// gpt-skin — 대화 목록 제공자.
//
// DOM 스크래핑은 못 쓴다. 원본은 창이 좁으면 사이드바를 DOM 에서 통째로 내린다
// (2026-09-01 측정: 1038px 에서 nav 0개, 대화 링크 0개, 펼치기 버튼도 없음).
// 그래서 백엔드를 직접 읽고, 실패하면 DOM 으로 내려가고, 그것도 비면 캐시를 쓴다.
//
// 인증은 GT.oai 가 담당한다 (Bearer 토큰, 메모리에만 보관).
GT.chats = (function () {
  'use strict';

  const LIST = '/backend-api/conversations';
  const PROJECTS = '/backend-api/gizmos/snorlax/sidebar';
  const CACHE_KEY = 'chats.cache';
  const PAGE = 40;

  let lastSource = null;   // 'api' | 'dom' | 'cache' | null

  // 누적 상태. 페이지를 더 읽으면 여기 쌓인다.
  // group() 은 순수 함수라 매번 전체 목록으로 다시 계산한다 — 부분 갱신 버그가 생길 여지를 없앤다.
  let acc = { items: [], projects: [], total: 0, offset: 0 };

  // ------------------------------------------------------------------ 그룹핑
  // 순수 함수 — 테스트 대상. 원본 사이드바의 고정됨 / 프로젝트 / 채팅 구분을 경로 은유로 옮긴다.
  function group(items, projects) {
    const names = new Map((projects || []).map((p) => [p.id, p.name]));
    const out = { pinned: [], projects: [], chats: [] };
    const byProject = new Map();

    (items || []).forEach((c) => {
      if (!c || !c.id) return;
      if (c.is_archived) return;
      const rec = {
        id: c.id,
        href: '/c/' + c.id,
        title: (c.title || '(제목 없음)').trim(),
        updated: c.update_time || null,
        pinned: !!c.pinned_time,
        projectId: c.gizmo_id || null
      };
      if (rec.pinned) { out.pinned.push(rec); return; }
      if (rec.projectId) {
        if (!byProject.has(rec.projectId)) byProject.set(rec.projectId, []);
        byProject.get(rec.projectId).push(rec);
        return;
      }
      out.chats.push(rec);
    });

    byProject.forEach((list, id) => {
      out.projects.push({ id, name: names.get(id) || id.slice(0, 12), items: list });
    });
    out.projects.sort((a, b) => a.name.localeCompare(b.name, 'ko'));
    return out;
  }

  // collapsed 는 접힌 그룹 키의 집합. 인자로 받아 순수 함수로 유지한다.
  function flatten(g, collapsed) {
    const shut = collapsed instanceof Set ? collapsed : new Set(collapsed || []);
    const rows = [];
    const section = (key, label, items) => {
      if (!items.length) return;
      const isShut = shut.has(key);
      rows.push({ kind: 'header', key, label, collapsed: isShut, count: items.length });
      if (!isShut) items.forEach((c) => rows.push({ kind: 'chat', group: key, ...c }));
    };
    section('pinned', '~/pinned', g.pinned);
    g.projects.forEach((p) => section('p:' + p.id, '~/projects/' + p.name, p.items));
    section('chats', '~/chats', g.chats);
    return rows;
  }

  // -------------------------------------------------------------------- 출처
  async function fromApi(limit, offset) {
    const [list, proj] = await Promise.all([
      GT.oai.get(`${LIST}?offset=${offset || 0}&limit=${limit}&order=updated`),
      // 프로젝트 이름은 첫 페이지에서만 필요하다
      offset ? Promise.resolve({ items: [] }) : GT.oai.get(PROJECTS).catch(() => ({ items: [] }))
    ]);
    const projects = (proj.items || [])
      .map((it) => it && it.gizmo)
      .filter(Boolean)
      .map((g) => ({ id: g.id, name: (g.display && g.display.name) || g.id }));
    return { items: list.items || [], total: list.total || 0, projects: offset ? acc.projects : projects };
  }

  // 폴백. 원본 사이드바가 떠 있을 때만 쓸 만하다.
  function fromDom() {
    const seen = new Set();
    const items = [];
    document.querySelectorAll('a[href^="/c/"]').forEach((a) => {
      const href = a.getAttribute('href');
      const id = href.slice(3);
      if (seen.has(id)) return;
      seen.add(id);
      const title = (a.textContent || '').trim();
      if (!title) return;
      items.push({ id, title, update_time: null, pinned_time: null, gizmo_id: null, is_archived: false });
    });
    return { items, total: items.length, projects: [] };
  }

  async function readCache() {
    try {
      const got = await chrome.storage.local.get(CACHE_KEY);
      return got[CACHE_KEY] || null;
    } catch (_) { return null; }
  }

  async function writeCache(payload) {
    // 대화 제목이 남는다. sync 가 아니라 local 이고, :sidebar clear-cache 로 지운다.
    try { await chrome.storage.local.set({ [CACHE_KEY]: { at: Date.now(), ...payload } }); } catch (_) {}
  }

  // 프로젝트별로 따로 읽어온 적이 있는지. 첫 페이지에 안 걸린 프로젝트는 비어 보인다.
  const loaded = new Set();

  // 대화가 하나도 안 걸린 프로젝트도 목록에 보여야 한다.
  // group() 은 acc.items 만 보므로, 아는 프로젝트를 빈 그룹으로 채워 넣는다.
  const withEmptyProjects = (g) => {
    const have = new Set(g.projects.map((p) => p.id));
    acc.projects.forEach((p) => {
      if (have.has(p.id)) return;
      g.projects.push({ id: p.id, name: p.name, items: [] });
    });
    g.projects.sort((a, b) => a.name.localeCompare(b.name, 'ko'));
    return g;
  };

  const shaped = () => ({
    ...withEmptyProjects(group(acc.items, acc.projects)),
    total: acc.total,
    loaded: acc.items.length,
    hasMore: acc.items.length < acc.total,
    source: lastSource || 'none'
  });

  async function load() {
    acc = { items: [], projects: [], total: 0, offset: 0 };
    loaded.clear();
    try {
      const got = await fromApi(PAGE, 0);
      // 인증이 없으면 200 이면서 items 만 빈다. 빈 목록을 성공으로 오해하지 않도록
      // total 이 0 일 때만 '진짜 비었다'로 본다.
      if (got.items.length || got.total === 0) {
        lastSource = 'api';
        acc = { items: got.items, projects: got.projects, total: got.total, offset: got.items.length };
        await writeCache(acc);
        return shaped();
      }
      GT.log(`대화 목록 API 가 빈 items 를 줬다 (total ${got.total}) — 폴백`);
    } catch (e) {
      GT.log('대화 목록 API 실패 — DOM 으로 내려간다:', e.message);
    }

    const dom = fromDom();
    if (dom.items.length) {
      lastSource = 'dom';
      acc = { items: dom.items, projects: [], total: dom.total, offset: dom.items.length };
      return shaped();
    }

    const cached = await readCache();
    if (cached && cached.items && cached.items.length) {
      lastSource = 'cache';
      acc = { items: cached.items, projects: cached.projects || [], total: cached.total, offset: cached.items.length };
      return { ...shaped(), at: cached.at };
    }

    lastSource = null;
    acc = { items: [], projects: [], total: 0, offset: 0 };
    return shaped();
  }

  // 다음 페이지를 이어 읽는다. API 출처일 때만 의미가 있다.
  async function more() {
    if (lastSource !== 'api' || acc.items.length >= acc.total) return shaped();
    const got = await fromApi(PAGE, acc.offset);
    const seen = new Set(acc.items.map((c) => c.id));
    const fresh = (got.items || []).filter((c) => c && !seen.has(c.id));
    acc.items = acc.items.concat(fresh);
    acc.offset += got.items.length;
    acc.total = got.total || acc.total;
    if (!got.items.length) acc.total = acc.items.length;   // 서버가 더 안 주면 거기까지가 전부다
    await writeCache(acc);
    return shaped();
  }

  async function clearCache() {
    try { await chrome.storage.local.remove(CACHE_KEY); return true; } catch (_) { return false; }
  }

  // 한 프로젝트의 대화를 이어 읽는다. 항목이 gizmo_id 를 들고 오므로 group() 이 알아서 묶는다.
  async function loadProject(gizmoId) {
    if (!gizmoId) return shaped();
    const j = await GT.oai.get(`/backend-api/gizmos/${encodeURIComponent(gizmoId)}/conversations?limit=${PAGE}`);
    const seen = new Set(acc.items.map((c) => c.id));
    const fresh = (j.items || []).filter((c) => c && !seen.has(c.id))
      .map((c) => ({ ...c, gizmo_id: c.gizmo_id || gizmoId }));
    acc.items = acc.items.concat(fresh);
    loaded.add(gizmoId);
    return shaped();
  }

  return {
    load, more, group, flatten, clearCache, loadProject,
    isProjectLoaded: (id) => loaded.has(id),
    projects: () => acc.projects.slice(),
    get source() { return lastSource; },
    get state() { return shaped(); }
  };
})();
