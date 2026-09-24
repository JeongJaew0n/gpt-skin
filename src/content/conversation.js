// gpt-skin — 대화 원본을 백엔드에서 읽는다.
//
// DOM 수확은 원본이 그려준 만큼만 볼 수 있다. 진입 경로에 따라 앞쪽 턴이 통째로 빠진다
// (docs/issue/2026-08-31-partial-thread-harvest.md).
// 여기가 그 문제의 근본 해결이다 — 렌더 여부와 무관하게 전체를 받는다.
GT.conversation = (function () {
  'use strict';

  const idFromPath = (p) => {
    const m = /^\/c\/([0-9a-zA-Z:-]+)/.exec(p || location.pathname);
    return m ? m[1] : null;
  };

  // 이미지 파트. 실측(2026-09-09) — 생성한 그림은 role 'tool' 메시지로 온다.
  //
  //   tool → all · multimodal_text · parts=[image_asset_pointer]
  //
  // docs/plan/2026-09-09-image-generation.md
  //
  // author.name 이 't2uay3k.sj1i4kz' 였지만 판별자로 쓰지 않는다 — 바뀔 값이다.
  // content_type 과 파트 모양만 본다.
  const IMAGE_PART = 'image_asset_pointer';

  function toImages(m) {
    const parts = (m.content && m.content.parts) || [];
    const out = [];
    parts.forEach((p) => {
      if (!p || typeof p !== 'object' || p.content_type !== IMAGE_PART) return;
      const ptr = String(p.asset_pointer || '');
      if (!ptr) return;
      out.push({
        pointer: ptr,
        mime: String(p.mime_type || ''),
        w: Number(p.width) || 0,
        h: Number(p.height) || 0,
        bytes: Number(p.size_bytes) || 0
      });
    });
    return out;
  }

  // 최종 응답만 고른다. 추론 조각(reasoning_recap)과 툴 호출은 화면에 그리지 않는다.
  // 판별자는 실측으로 확정했다 — content_type 이 'text' 이고 recipient 가 'all' 인 것만 본문이다.
  //
  // 이미지는 예외다. role 이 'tool' 이고 content_type 이 'multimodal_text' 인데,
  // 그리지 않으면 그림을 만든 턴이 화면에서 통째로 사라진다.
  //
  // 한 장에 메시지가 둘 온다. 뒤엣것은 is_visually_hidden_from_conversation 사본으로
  // 모델이 다음 턴에 참고하는 컨텍스트다 — 그리면 같은 그림이 두 번 나온다.
  function isVisible(m) {
    if (!m || !m.author) return false;
    if (m.metadata && m.metadata.is_visually_hidden_from_conversation) return false;
    if (m.recipient && m.recipient !== 'all') return false;

    const role = m.author.role;
    const ct = m.content && m.content.content_type;

    // 이미지를 실제로 들고 있을 때만 통과시킨다. multimodal_text 라는 이유만으로
    // 열어 주면 web.run 결과 같은 다른 tool 메시지가 빈 줄로 쌓인다.
    if (ct === 'multimodal_text') return toImages(m).length > 0;

    if (role !== 'user' && role !== 'assistant') return false;
    return ct === 'text';
  }

  function isReasoning(m) {
    const ct = m && m.content && m.content.content_type;
    if (ct === 'reasoning_recap' || ct === 'thoughts') return true;
    return !!(m && m.metadata && m.metadata.reasoning_status);
  }

  // current_node 에서 부모를 따라 올라가면 지금 보이는 분기가 나온다.
  // 트리 전체를 순회하면 버려진 분기(재생성 이전 응답)까지 섞인다.
  function activeBranch(conv) {
    const line = [];
    const seen = new Set();
    let id = conv.current_node;
    while (id && conv.mapping[id] && !seen.has(id)) {
      seen.add(id);
      const n = conv.mapping[id];
      if (n.message) line.push(n.message);
      id = n.parent;
    }
    return line.reverse();
  }

  // 인용 마커가 무엇을 가리키는지는 메시지 메타데이터가 알려준다.
  // 본문에는 마커만 있고(원본은 그 자리에 칩을 그린다) 제목·주소는 여기에만 있다.
  // docs/issue/2026-09-04-citation-markers-shown-raw.md
  function toRefs(meta) {
    const list = (meta && meta.content_references) || [];
    return list.map((r) => {
      const it = (r.items && r.items[0]) || null;
      return {
        type: String((r && r.type) || ''),
        matched: String((r && r.matched_text) || ''),
        title: String((it && it.title) || ''),
        url: String((it && it.url) || ''),
        attribution: String((it && it.attribution) || '')
      };
    });
  }

  function toRecords(conv) {
    const branch = activeBranch(conv);
    const out = [];
    let pendingThinking = 0;

    branch.forEach((m) => {
      if (isReasoning(m)) { pendingThinking += 1; return; }
      if (!isVisible(m)) return;
      const parts = (m.content && m.content.parts) || [];
      const images = toImages(m);
      // 그림을 그린 tool 메시지는 화면에서 assistant 의 응답이다.
      // role 을 그대로 쓰면 메타줄에 'tool' 이 찍히고 gutter 색도 갈린다.
      const role = m.author.role === 'tool' ? 'assistant' : m.author.role;
      out.push({
        id: m.id,
        role,
        model: (m.metadata && m.metadata.model_slug) || null,
        text: parts.filter((p) => typeof p === 'string').join('\n'),
        at: m.create_time ? Math.round(m.create_time * 1000) : null,
        thinking: role === 'assistant' && pendingThinking ? pendingThinking : 0,
        refs: toRefs(m.metadata),
        images: images.length ? images : null
      });
      if (role === 'assistant') pendingThinking = 0;
    });
    return out;
  }

  async function load(id) {
    const cid = id || idFromPath();
    if (!cid) return null;
    const conv = await GT.oai.get(`/backend-api/conversation/${encodeURIComponent(cid)}`);
    if (!conv || !conv.mapping) throw new Error('mapping 없음');
    return {
      id: cid,
      title: conv.title || '',
      messages: toRecords(conv),
      model: conv.default_model_slug || null
    };
  }

  return { load, toRecords, toRefs, activeBranch, isVisible, isReasoning, idFromPath };
})();
