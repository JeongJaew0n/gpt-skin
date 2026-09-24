// gpt-skin — 대화 모델. 원본 DOM 을 미러링하지 않고 자체 상태를 유지한다.
GT.store = (function () {
  'use strict';

  const state = {
    messages: [],           // {id, role, model, text, streaming, parts, images, at}
    byId: new Map(),
    streamingId: null,      // 지금 토큰을 받고 있는 메시지
    slotId: null,           // 현재 턴이 차지한 assistant 레코드 (아래 설명)
    superseded: 0,          // 대체해서 버린 중간 메시지 수 (진단용)
    pendingThinking: 0,     // 다음 응답 앞에 쌓인 추론 조각 수
    thinkingSince: 0,       // 지금 추론이 진행 중이면 그 시작 시각 (0 이면 진행 중 아님)
    orphanDeltas: 0,        // add 없이 도착한 본문 델타 (스트림 해석이 어긋났다는 신호)
    drawingSince: 0,        // 그림을 만들고 있으면 그 시작 시각 (0 이면 아님)
    startedAt: 0,
    conversationTitle: '',
    path: '/'
  };

  // 한 번 켜지면 이만큼은 유지한다. 그보다 짧게 스치면 깜빡임으로 보인다.
  const MIN_THINKING_MS = 600;

  // 그림 표시의 상한. 스트림이 끝을 알리지 않고 끊기면 회전자가 영영 돈다 —
  // 실측에서 한 장에 40초쯤 걸렸다. 넉넉히 두되 무한은 아니게 한다.
  const MAX_DRAWING_MS = 5 * 60 * 1000;

  const listeners = [];
  const emit = (why) => listeners.forEach((fn) => fn(state, why));

  // 낙관적 렌더용 임시 id 를 세는 카운터.
  // Date.now() 만 쓰면 같은 밀리초에 두 번 보낼 때 id 가 겹쳐 앞의 줄을 덮어쓴다.
  let localSeq = 0;

  // 보낼 때 우리가 먼저 올린 줄의 id. 진짜 id 는 나중에 온다.
  const isLocalId = (x) => typeof x === 'string' && x.indexOf('local-') === 0;

  const upsert = (m) => {
    const existing = m.id && state.byId.get(m.id);
    if (existing) { Object.assign(existing, m); return existing; }

    // 우리가 먼저 올려 둔 사용자 메시지에 진짜 id 를 달아 준다.
    //
    // 안 하면 같은 질문이 두 줄이 된다. 진짜 id 는 두 경로로 들어오는데
    // (SSE 의 input_message, DOM 수확) 둘 다 여기를 지나므로 한 곳에서 막는다.
    // docs/issue/2026-09-07-user-message-appears-late.md
    if (m.id && !isLocalId(m.id) && m.role === 'user') {
      const local = state.messages.find(
        (x) => x.role === 'user' && isLocalId(x.id) && x.text === m.text);
      if (local) {
        state.byId.delete(local.id);
        Object.assign(local, m);
        state.byId.set(m.id, local);
        return local;
      }
    }

    const rec = { at: Date.now(), streaming: false, parts: null, images: null, ...m };
    state.messages.push(rec);
    if (rec.id) state.byId.set(rec.id, rec);
    return rec;
  };

  // 한 턴에 assistant 메시지가 여러 개 온다.
  // 추론 모델은 사고 조각·중간 산출물을 각각 별개 메시지로 흘리고, 원본 UI 는 마지막 것만 그린다.
  // 우리는 턴마다 자리(slot)를 하나만 두고, 새 메시지가 오면 그 자리를 대체한다.
  // 자리는 사용자 메시지가 올 때만 비워진다 — 스트림이 끝났다고 비우면
  // end → begin 순서로 오는 후속 메시지가 다시 새 줄로 쌓인다.
  const supersede = (oldId, m) => {
    const old = state.byId.get(oldId);
    const idx = state.messages.indexOf(old);
    const rec = { at: old ? old.at : Date.now(), parts: null, images: null, ...m, streaming: true };
    state.byId.delete(oldId);
    if (idx >= 0) state.messages[idx] = rec; else state.messages.push(rec);
    if (rec.id) state.byId.set(rec.id, rec);
    state.superseded += 1;
    return rec;
  };

  return {
    state,
    onChange(fn) { listeners.push(fn); },

    replaceAll(messages, meta) {
      state.messages = [];
      state.byId.clear();
      state.slotId = null;
      state.streamingId = null;
      state.superseded = 0;
      state.orphanDeltas = 0;
      state.thinkingSince = 0;
      // 대화를 옮기면 그리던 것도 우리 일이 아니다.
      state.drawingSince = 0;
      messages.forEach((m) => upsert({ at: null, ...m }));
      if (meta) {
        // 대화가 통째로 바뀌는 자리다. 제목이 비어 있으면 '모르는 것'이 아니라
        // '없는 것'으로 본다 — 안 지우면 새 대화 화면에 이전 제목이 남는다.
        state.conversationTitle = meta.title || '';
        if (meta.path) state.path = meta.path;
      }
      emit('harvest');
    },

    // DOM 수확 결과를 반영한다.
    //
    // 원본은 진입 경로에 따라 턴을 다 그리지 않는다 — 콜드 로드에서 앞쪽 턴이 통째로 빠지는 걸 확인했다.
    // 그래서 수확 결과를 정답으로 믿고 갈아엎으면 안 된다. 두 가지를 지킨다.
    //   1. 대화가 바뀌었으면 갈아엎는다.
    //   2. 같은 대화면 합친다. 수확에 없는 메시지는 '삭제된 것'이 아니라 '아직 안 그려진 것'이므로 지키고,
    //      수확이 우리보다 많이 알고 있으면 그 순서를 채택한다.
    //      스트림으로 받은 메시지도 이 규칙 덕에 살아남는다(DOM 에 뜨기 전에 수확이 돌 수 있다).
    applyHarvest(messages, meta) {
      const path = meta && meta.path;

      if (path && path !== state.path) {
        state.path = path;
        this.replaceAll(messages, meta);      // 대화가 바뀌는 자리. 제목도 여기서 세운다
        return { mode: 'replace', kept: 0, gained: messages.length };
      }

      // 같은 대화 안에서는 제목을 덮지 않는다.
      //
      // 수확의 제목 출처는 document.title 이고, 그건 원본 UI 가 자기 상태에서 그린 값이다.
      // :rename 은 백엔드 API 로 바꾸므로 원본은 그 사실을 모른다 — 덮게 두면
      // 이름을 바꾼 뒤 메시지를 한 번 주고받는 순간 옛 이름으로 되돌아간다.
      // 우리가 아직 아무것도 모를 때만 채운다(새 대화의 자동 제목 생성이 이 경우다).
      if (meta && meta.title && !state.conversationTitle) state.conversationTitle = meta.title;
      if (path) state.path = path;

      const incoming = new Set(messages.map((m) => m.id).filter(Boolean));
      const missing = state.messages.filter((m) => m.id && !incoming.has(m.id));

      if (missing.length === 0) {
        // 수확이 우리가 아는 것을 전부 포함한다 — DOM 순서를 그대로 채택한다.
        const gained = messages.length - state.messages.length;
        const prev = new Map(state.byId);
        state.messages = [];
        state.byId.clear();
        messages.forEach((m) => {
          const old = m.id && prev.get(m.id);
          // 수확(DOM·fiber)에는 인용 출처도 이미지도 없다. API 로 받아둔 것을 지키고
          // 넘어간다 — 안 지키면 fiber 교정이 도는 순간 각주가 번호만 남고 그림이 사라진다.
          const keep = {};
          if (old && old.refs && !m.refs) keep.refs = old.refs;
          if (old && old.images && !m.images) keep.images = old.images;
          upsert({ at: old ? old.at : null, ...m, ...keep });
        });
        emit('harvest');
        return { mode: 'adopt', kept: 0, gained };
      }

      // 수확이 우리보다 적게 안다. 가진 것을 버리지 않고 갱신·추가만 한다.
      let gained = 0;
      messages.forEach((m) => {
        if (m.id && state.byId.has(m.id)) {
          const rec = state.byId.get(m.id);
          if (typeof m.text === 'string' && m.text) rec.text = m.text;
          if (m.model) rec.model = m.model;
          if (m.parts) rec.parts = m.parts;
          if (m.refs) rec.refs = m.refs;
          if (m.images) rec.images = m.images;
        } else {
          upsert({ at: null, ...m });
          gained += 1;
        }
      });
      emit('harvest');
      return { mode: 'merge', kept: missing.length, gained };
    },

    // 이름을 바꾸면 다음 수확을 기다리지 않고 상단바를 바로 고친다.
    setTitle(t) {
      state.conversationTitle = String(t || '');
      emit('title');
    },

    // 보낼 때(id 없음)와 SSE 가 알려줄 때(진짜 id) 둘 다 이걸 부른다.
    // 두 번째 호출은 upsert 가 첫 줄에 id 만 달아 주므로 줄이 늘지 않는다.
    userSent(text, id) {
      state.slotId = null;        // 새 턴이 열린다
      state.pendingThinking = 0;
      state.thinkingSince = 0;
      const rec = upsert({ id: id || `local-${Date.now()}-${++localSeq}`, role: 'user', text: String(text == null ? '' : text), model: null });
      emit('user');
      return rec;
    },

    // 이 대화에서 내가 보낸 것만, 보낸 순서대로. ↑↓ 로 되짚을 때 쓴다.
    //
    // 새 상태를 만들지 않고 messages 에서 뽑는다. 그래서
    //   - 새로고침해도 남는다 (대화를 다시 읽으면 그대로 복원된다)
    //   - 원본 UI 에서 보낸 것도 들어온다
    //   - 대화를 옮기면 그 대화의 기록으로 바뀐다
    // 별도 배열을 두면 앞의 둘을 잃는다.
    // docs/plan/2026-09-09-cite-label-and-history.md
    userHistory() {
      const out = [];
      state.messages.forEach((m) => {
        if (!m || m.role !== 'user') return;
        const t = String(m.text == null ? '' : m.text);
        if (!t.trim()) return;
        // 같은 것을 연달아 보냈으면 한 번만 둔다. 되짚을 때 같은 줄이 반복되면 성가시다.
        if (out.length && out[out.length - 1] === t) return;
        out.push(t);
      });
      return out;
    },

    // 추론 조각이 흘러왔다.
    //
    // pendingThinking 은 '몇 조각 지났나'(응답에 사후로 붙는 기록)이고,
    // thinkingSince 는 '지금 생각하고 있나'(화면에 띄우는 상태)다. 둘은 다른 것이다.
    // 원본은 이 구간에 "생각 중…" 을 보여주는데 우리는 아무것도 안 보여줬다.
    thinking() {
      state.pendingThinking += 1;
      if (!state.thinkingSince) state.thinkingSince = Date.now();
      emit('thinking');
    },

    // 화면 표시만 켜고 끈다. pendingThinking(조각 수)은 건드리지 않는다 —
    // 부르는 쪽이 같은 상태를 반복해서 알려주므로 여기서 세면 숫자가 부풀어 오른다.
    //
    // 끌 때는 최소 표시 시간을 지킨다. 조건이 200ms 만에 뒤집혀도 눈에는
    // 깜빡임으로 보인다 — 실측에서 표시가 235ms 만 살아 있었다.
    // docs/issue/2026-09-07-thinking-indicator-flicker.md
    //
    // 화면이 바뀌어야 하면 true 를 돌려준다. 부르는 쪽이 그때만 다시 그리게 한다.
    setThinking(on) {
      if (on) {
        if (state.thinkingSince) return false;
        state.thinkingSince = Date.now();
        return true;
      }
      if (!state.thinkingSince) return false;
      if (Date.now() - state.thinkingSince < MIN_THINKING_MS) return false;
      state.thinkingSince = 0;
      return true;
    },

    // 추론 표시를 끈다. 본문이 시작되거나 턴이 끝나면 더 보여줄 이유가 없다.
    thinkingDone() {
      if (!state.thinkingSince) return false;
      state.thinkingSince = 0;
      return true;
    },

    // 그림을 만드는 중. 스트림에서만 알 수 있고(원본이 DOM 에 안 그린다),
    // 다 되면 대화 원본을 다시 읽어 그림을 채운다.
    // docs/plan/2026-09-09-image-generation.md
    drawing(on) {
      if (on) {
        if (state.drawingSince) return false;
        state.drawingSince = Date.now();
        // 그림을 만드는 동안 '생각 중' 과 겹쳐 두 줄이 되면 산만하다.
        // 더 구체적인 쪽(그림)만 남긴다.
        state.thinkingSince = 0;
        emit('drawing');
        return true;
      }
      if (!state.drawingSince) return false;
      state.drawingSince = 0;
      emit('drawing');
      return true;
    },
    isDrawing() {
      if (!state.drawingSince) return false;
      // 끝났다는 신호를 못 받은 채 너무 오래 돌면 스스로 접는다.
      if (Date.now() - state.drawingSince > MAX_DRAWING_MS) { state.drawingSince = 0; return false; }
      return true;
    },
    drawingElapsed() { return state.drawingSince ? (Date.now() - state.drawingSince) / 1000 : 0; },

    // 화면에 '생각 중' 줄을 띄울 조건.
    // 본문이 이미 흐르고 있으면 그 블록의 회전자가 같은 일을 한다 — 둘 다 띄우지 않는다.
    // 그림을 만드는 중이면 그쪽 줄이 대신 뜬다.
    isThinking() { return !!state.thinkingSince && !state.streamingId && !state.drawingSince; },
    thinkingElapsed() { return state.thinkingSince ? (Date.now() - state.thinkingSince) / 1000 : 0; },

    begin(m) {
      if (state.slotId && state.slotId !== m.id && state.byId.has(state.slotId)) {
        supersede(state.slotId, m);
      } else {
        if (!state.slotId) state.startedAt = Date.now();
        upsert({ ...m, streaming: true });
      }
      state.slotId = m.id;
      state.streamingId = m.id;
      if (state.pendingThinking) {
        const rec = state.byId.get(m.id);
        if (rec) rec.thinking = state.pendingThinking;
        state.pendingThinking = 0;
      }
      state.thinkingSince = 0;      // 본문이 시작됐다. '생각 중' 은 끝났다
      emit('begin');
    },

    // 델타는 반드시 기존 레코드에 붙는다.
    //
    // 예전에는 id 가 없으면 새 레코드를 만들었다. 그런데 id 가 없는 레코드는 byId 에 등록되지
    // 않으므로 다음 델타도 또 새 레코드를 만든다 — 응답 하나가 '점점 길어지는 접두사' 수십 줄로
    // 쌓였다. 스트림이 add 없이 본문부터 보내는 경우가 실재한다(재개 연결 등).
    // 그래서 붙일 곳을 순서대로 찾고, 정말 없을 때만 한 번 만든다.
    delta(id, text) {
      let rec = (id && state.byId.get(id))
        || (state.streamingId && state.byId.get(state.streamingId))
        || (state.slotId && state.byId.get(state.slotId))
        || null;

      if (!rec) {
        const synth = id || `orphan-${Date.now()}`;
        rec = upsert({ id: synth, role: 'assistant', text: '', streaming: true });
        state.streamingId = synth;
        if (!state.slotId) state.slotId = synth;
        state.orphanDeltas += 1;   // add 를 놓쳤다는 신호. :health 에 뜬다.
      }

      rec.text = text;
      rec.streaming = true;
      emit('delta');
    },

    end(id, text) {
      const rec = (id && state.byId.get(id)) || state.messages[state.messages.length - 1];
      if (rec) { if (typeof text === 'string' && text) rec.text = text; rec.streaming = false; }
      state.streamingId = null;
      state.thinkingSince = 0;
      // slotId 는 그대로 둔다. 같은 턴에서 또 begin 이 오면 이 자리를 대체해야 한다.
      emit('end');
    },

    isStreaming() { return state.streamingId !== null; },
    elapsed() { return state.startedAt ? (Date.now() - state.startedAt) / 1000 : 0; },
    // 컨텍스트 사용량은 페이지가 노출하지 않는다. 근사치임을 UI 에서 명시한다.
    approxChars() { return state.messages.reduce((n, m) => n + (m.text ? m.text.length : 0), 0); }
  };
})();
