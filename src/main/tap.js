// gpt-skin — MAIN world tap.
// 페이지와 같은 JS 컨텍스트에서만 할 수 있는 세 가지를 담당한다.
//   1. fetch 를 감싸 /backend-api/f/conversation 의 SSE 를 갈라 읽는다
//   2. React fiber 에서 메시지의 마크다운 원문을 수확한다
//   3. 위 둘의 전제가 깨지면 즉시 알린다 (isolated world 가 원본 UI 로 되돌린다)
// chrome.* API 는 이 월드에서 쓸 수 없다. 통신은 window.postMessage 뿐이다.
(() => {
  'use strict';

  const CH = '__gpt_skin__';
  const STREAM_PATH = '/backend-api/f/conversation';
  const SUPPORTED_ENCODING = 'v1';

  const post = (kind, payload) => {
    try {
      window.postMessage({ [CH]: true, dir: 'm2i', kind, payload }, location.origin);
    } catch (_) { /* 직렬화 불가 payload 는 버린다 */ }
  };

  const fail = (reason, detail) => post('broken', { reason, detail: String(detail || '') });

  // ---------------------------------------------------------------- SSE 파서

  // 관측된 v1 인코딩:
  //   event: delta_encoding / data: "v1"
  //   data: {"type":"input_message","input_message":{...}}
  //   event: delta / data: {"p":"","o":"add","v":{"message":{...}}}
  //   data: {"v":"이어지는 텍스트"}                 ← 경로 생략 = 직전 경로 계속
  //   data: {"p":"/message/content/parts/0","o":"append","v":"..."}
  //   data: {"o":"patch","v":[{...},{...}]}
  //   data: {"type":"message_stream_complete",...}
  //   data: [DONE]
  class DeltaDecoder {
    constructor() {
      this.lastPath = '';
      this.messageId = null;
      this.role = null;
      this.model = null;
      this.text = '';
      this.unknownOps = 0;
      this.totalOps = 0;
      this.encodingChecked = false;
      this.skipped = [];       // 본문이 아니라고 판단해 건너뛴 content_type
      this.began = false;
      this.orphan = false;     // add 없이 본문이 먼저 온 스트림
      this.finished = false;
      // 지금 스트림이 다루고 있는 메시지. v1 인코딩에서 /message/… 경로는
      // '가장 최근에 add 된 메시지'를 가리킨다. 그래서 수용 여부를 여기 붙여둔다.
      // 이게 없으면 건너뛴 메시지의 본문 델타가 그대로 새어나온다.
      this.current = null;     // { id, accepted }
      this.sawAdd = false;
      // 스트림이 중간에 멈출 때 어디서 멈췄는지 알기 위한 기록.
      // 마커 전환과 '버리기로 해서 흘린 본문' 을 센다 — 둘 다 본문이 끊기는 경로다.
      this.markers = [];       // ['user_visible_token:5032df', 'cot_token:b5841c', …]
      this.droppedOps = 0;
      this.droppedChars = 0;
    }

    line(raw) {
      if (raw.startsWith('event: ')) return;
      if (!raw.startsWith('data: ')) return;
      const body = raw.slice(6);
      if (body === '[DONE]') return this.complete('done');

      let json;
      try { json = JSON.parse(body); } catch (_) { return; }

      if (!this.encodingChecked && typeof json === 'string') {
        this.encodingChecked = true;
        if (json !== SUPPORTED_ENCODING) {
          fail('delta-encoding', `기대 ${SUPPORTED_ENCODING}, 실제 ${json}`);
        }
        return;
      }
      if (Array.isArray(json)) { json.forEach((x) => this.op(x)); return; }
      if (json && typeof json === 'object') this.op(json);
    }

    drop(v) {
      this.droppedOps += 1;
      this.droppedChars += String(v || '').length;
    }

    op(o) {
      if (!o || typeof o !== 'object') return;

      if (typeof o.type === 'string') return this.typed(o);

      this.totalOps += 1;
      const path = typeof o.p === 'string' && o.p !== '' ? o.p : this.lastPath;
      // 경로를 생략한 델타는 직전 경로를 잇는다. 그런데 본문 사이사이에
      // /message/metadata/… 델타가 끼어들므로, 그걸 기억해 두면 뒤따르는
      // 본문 델타가 메타데이터 경로를 상속해 버려진다.
      // 이어받을 경로는 본문 경로일 때만 갱신한다.
      // docs/issue/2026-09-08-drift-warning-false-positive.md
      if (typeof o.p === 'string' && o.p !== '' && /^\/message\/content\//.test(o.p)) {
        this.lastPath = o.p;
      }
      const op = o.o || (o.p === undefined ? 'append' : 'add');

      if (op === 'patch' && Array.isArray(o.v)) { o.v.forEach((x) => this.op(x)); return; }

      // 새 어시스턴트 메시지 골격
      if (op === 'add' && o.v && o.v.message) {
        const m = o.v.message;
        const role = m.author && m.author.role;

        // 그림을 만들기 시작했다. 실측(2026-09-09) — 생성 중에는 파트가 비어 있는
        // multimodal_text 메시지가 먼저 만들어지고, 다 그려지면 그 안에
        // image_asset_pointer 가 채워진다.
        //
        //   t:mult[]              ← 만드는 중 (여기)
        //   t:mult[IMG]           ← 다 됐다 (대화 원본에서 읽는다)
        //
        // 원본은 이 메시지를 [data-message-id] 로 그리지 않아 DOM 수확으로는 못 본다.
        // 스트림에서만 알 수 있으므로 여기서 알린다.
        // docs/plan/2026-09-09-image-generation.md
        if ((m.content && m.content.content_type) === 'multimodal_text') {
          post('image', { id: m.id || null, phase: 'start' });
          // 상태는 건드리지 않는다. 본문 메시지가 아니다.
          return;
        }

        // assistant 가 아닌 add(user·system·tool)는 스트림 상태를 건드리지 않는다.
        // 건드리면 이어지는 본문 델타가 엉뚱한 messageId 에 붙는다.
        if (role !== 'assistant') return;

        // 추론 모델은 한 턴에 assistant 메시지를 여러 개 흘린다. 최종 응답만 본문이다.
        // 판별자는 실측으로 확정했다(2026-09-01):
        //   최종 응답  content_type 'text',            recipient 'all', end_turn true
        //   추론 조각  content_type 'reasoning_recap',                  end_turn false
        const ctype = (m.content && m.content.content_type) || null;
        const rcp = m.recipient == null ? 'all' : m.recipient;
        const meta = m.metadata || {};

        // 판별은 fail-open 이다. '본문인 것'을 맞히려 하면 모르는 종류가 나올 때 화면이 빈다.
        // 대신 '본문이 아닌 것'만 확실히 걸러내고 나머지는 받는다.
        // 한 턴에 본문이 두 번 오면 store 의 턴 자리(supersede)가 마지막 것만 남긴다.
        const reasoning = ctype === 'reasoning_recap' || ctype === 'thoughts'
          || !!meta.reasoning_status;
        const toolCall = rcp !== 'all';
        const hidden = !!meta.is_visually_hidden_from_conversation;

        this.sawAdd = true;
        const parts0 = m.content && Array.isArray(m.content.parts) && typeof m.content.parts[0] === 'string'
          ? m.content.parts[0] : '';

        if (reasoning || toolCall || hidden) {
          // 건너뛴다는 사실을 기억한다. 기억하지 않으면 이 메시지의 본문 델타가
          // 앵커를 새로 만들거나 직전 응답 뒤에 붙어 '중간 답변'으로 보인다.
          this.current = { id: m.id || null, accepted: false, initial: parts0 };
          this.skipped.push(ctype || '(unknown)');
          if (reasoning) post('thinking', { id: m.id || null, ctype });
          return;
        }

        this.current = { id: m.id || null, accepted: true, initial: parts0 };
        this.messageId = m.id || null;
        this.role = role;
        this.model = (m.metadata && m.metadata.model_slug) || null;
        const parts = m.content && Array.isArray(m.content.parts) ? m.content.parts : [];
        this.text = typeof parts[0] === 'string' ? parts[0] : '';
        this.began = true;
        post('begin', { id: this.messageId, role, model: this.model, text: this.text });
        return;
      }

      // 본문 델타 — 경로가 content/parts 를 가리키고 값이 문자열일 때만 받는다
      if (typeof o.v === 'string' && /content\/parts\/\d+$/.test(path)) {
        // 지금 다루는 메시지를 건너뛰기로 했다면 그 본문도 버린다.
        if (this.current && !this.current.accepted) { this.drop(o.v); return; }

        // add 를 아예 못 본 스트림에서만 자리를 만든다.
        // (add 를 보고 건너뛴 경우까지 만들면 건너뛴 이유가 무의미해진다)
        if (!this.messageId && !this.sawAdd) {
          this.messageId = `stream-${Date.now()}`;
          this.orphan = true;
          this.began = true;
          post('begin', { id: this.messageId, role: 'assistant', model: this.model, text: this.text, orphan: true });
        }
        if (op === 'append' || op === 'add') this.text += o.v;
        else if (op === 'replace') this.text = o.v;
        else { this.unknownOps += 1; return; }
        post('delta', { id: this.messageId, text: this.text });
        return;
      }

      // 경로 생략 + 문자열 = 직전 경로 이어쓰기
      if (typeof o.v === 'string' && o.p === undefined && /content\/parts\/\d+$/.test(this.lastPath)) {
        if (this.current && !this.current.accepted) { this.drop(o.v); return; }
        if (!this.messageId) return;
        this.text += o.v;
        post('delta', { id: this.messageId, text: this.text });
        return;
      }

      if (op !== 'add' && op !== 'append' && op !== 'replace' && op !== 'patch') this.unknownOps += 1;
    }

    typed(o) {
      switch (o.type) {
        case 'input_message': {
          const m = o.input_message || {};
          const parts = m.content && Array.isArray(m.content.parts) ? m.content.parts : [];
          post('user', {
            id: m.id || null,
            text: parts.filter((p) => typeof p === 'string').join('\n')
          });
          break;
        }
        case 'message_stream_complete':
          this.complete('stream_complete');
          break;
        // marker 가 '지금부터 어느 메시지의 본문인지'를 알려준다.
        //
        // 실측(2026-09-01): 추론 모델의 스트림에는 assistant `add` 가 아예 없는 경우가 흔하다.
        // 한 요청 안에 메시지 id 가 셋인데 add 는 숨김 시스템 메시지 하나뿐이고,
        // 나머지 둘은 marker 로만 등장한다.
        //
        //   marker b5841c cot_token             ← 추론. 그리지 않는다
        //   marker 5032df user_visible_token    ← 사용자에게 보이는 최종 답변
        //   marker 5032df final_channel_token
        //   marker 5032df last_token            ← 그 메시지의 끝
        //
        // 그래서 marker 를 '현재 메시지 전환' 신호로 다룬다. content_type 추측보다 확실하다.
        case 'message_marker': {
          const mk = o.marker;
          const mid = o.message_id;
          if (!mid) break;

          this.markers.push(`${mk}:${String(mid).slice(0, 6)}`);

          const VISIBLE = mk === 'user_visible_token' || mk === 'final_channel_token';
          const HIDDEN = mk === 'cot_token';
          if (!VISIBLE && !HIDDEN) break;   // last_token 등은 전환 신호가 아니다

          if (HIDDEN) {
            // 추론 메시지로 전환. 이후 본문 델타는 버린다.
            if (!this.current || this.current.id !== mid) {
              this.current = { id: mid, accepted: false, initial: '' };
              post('thinking', { id: mid, ctype: 'cot' });
            }
            break;
          }

          // 사용자에게 보이는 메시지로 전환
          if (this.current && this.current.id === mid && this.current.accepted) break;  // 이미 이걸 받고 있다

          // 마커가 본문보다 늦게 오는 스트림이 있다. 그때 무조건 text 를 비우면
          // 이미 받은 본문이 통째로 날아간다(= 원본과 100% 어긋남).
          // 직전 대상이 '버리기로 한 것'(cot·숨김·툴)일 때만 버리고, 그 외에는 이어받는다.
          const drop = !!(this.current && this.current.accepted === false);
          const carry = drop ? '' : this.text;

          this.current = { id: mid, accepted: true, initial: carry };
          this.messageId = mid;
          this.text = carry;
          this.began = true;
          this.markerAnchored = true;
          post('begin', { id: mid, role: 'assistant', model: this.model, text: carry, markerAnchored: true });
          break;
        }
        case 'conversation_detail_metadata':
        case 'resume_conversation_token':
        case 'server_ste_metadata':
        case 'title_generation':
          break;
        default:
          break;
      }
    }

    complete(why) {
      // message_stream_complete 와 [DONE] 이 둘 다 온다. 한 번만 끝낸다 —
      // 두 번 끝내면 verify 도 두 번 돌고 빈 스트림 복구도 두 번 걸린다.
      if (this.finished) return;
      this.finished = true;
      post('end', {
        id: this.messageId,
        text: this.text,
        why,
        unknownOps: this.unknownOps,
        totalOps: this.totalOps,
        // 끝났는데 본문을 한 번도 못 잡았다면 판별자가 낡았다는 뜻이다.
        // 조용히 빈 응답을 보여주는 대신 무엇을 건너뛰었는지 알린다.
        began: this.began,
        orphan: this.orphan,
        promoted: !!this.promoted,
        markerAnchored: !!this.markerAnchored,
        skipped: [...new Set(this.skipped)],
        // 스트림이 짧게 끝났을 때 이 둘이 이유를 말해 준다.
        markers: this.markers,
        droppedOps: this.droppedOps,
        droppedChars: this.droppedChars
      });
    }
  }

  // ------------------------------------------------------------ fetch 래핑

  const nativeFetch = window.fetch;
  if (typeof nativeFetch !== 'function') {
    fail('no-fetch', 'window.fetch 가 함수가 아닙니다');
    return;
  }

  window.fetch = function gptSkinFetch(...args) {
    let url = '';
    try { url = String(typeof args[0] === 'string' ? args[0] : (args[0] && args[0].url) || ''); } catch (_) {}
    const isStream = url.split('?')[0].endsWith(STREAM_PATH);

    const p = nativeFetch.apply(this, args);
    if (!isStream) return p;

    return p.then((res) => {
      if (!res.body || !res.ok) return res;
      let mine, theirs;
      try { [theirs, mine] = res.body.tee(); } catch (e) { fail('tee', e && e.message); return res; }

      (async () => {
        const reader = mine.getReader();
        const decoder = new TextDecoder();
        const dec = new DeltaDecoder();
        let buf = '';
        try {
          for (;;) {
            const { done, value } = await reader.read();
            if (done) break;
            buf += decoder.decode(value, { stream: true });
            let i;
            while ((i = buf.indexOf('\n')) >= 0) {
              const line = buf.slice(0, i).replace(/\r$/, '');
              buf = buf.slice(i + 1);
              if (line) dec.line(line);
            }
          }
          if (buf.trim()) dec.line(buf.trim());
        } catch (e) {
          // 사용자가 중단하면(esc · ^C) 리더가 끊기며 던진다. 그건 정상이다 —
          // 이걸 깨짐으로 보고하면 중단할 때마다 빨간 줄이 남는다.
          const msg = String((e && e.message) || e);
          const aborted = (e && e.name === 'AbortError') || /abort/i.test(msg);
          if (!aborted) fail('stream-read', msg);
        }
      })();

      // 페이지에는 원본과 동일한 응답을 돌려준다
      return new Response(theirs, { status: res.status, statusText: res.statusText, headers: res.headers });
    });
  };

  // ------------------------------------------------------- React fiber 수확

  const fiberOf = (el) => {
    if (!el) return null;
    const k = Object.keys(el).find((x) => x.startsWith('__reactFiber$'));
    return k ? el[k] : null;
  };

  const climb = (el, pick, depth = 14) => {
    let f = fiberOf(el);
    for (let i = 0; f && i < depth; i += 1) {
      const got = pick(f.memoizedProps || {}, f);
      if (got !== undefined && got !== null) return got;
      f = f.return;
    }
    return null;
  };

  // react-markdown 노드의 children 이 마크다운 원문이다
  const sourceOf = (mdEl) => climb(mdEl, (p) => {
    if (typeof p.children === 'string' && (p.remarkPlugins || p.rehypePlugins)) return p.children;
    return null;
  });

  // 턴 단위 컴포넌트가 비텍스트 파트를 들고 있다
  const partsOf = (msgEl) => climb(msgEl, (p) => {
    if (Array.isArray(p.displayParts)) return p.displayParts.map((d) => (d && d.type) || 'unknown');
    return null;
  });

  const harvest = () => {
    const out = [];
    // fiberEligible = .markdown 을 가진 메시지 수.
    // 사용자 메시지는 react-markdown 을 거치지 않아 .markdown 이 없다 — 추출 대상이 아니다.
    // 전체 메시지 수와 비교하면 assistant 응답이 아직 없는 순간마다 오탐이 난다.
    let fiberEligible = 0;
    let fiberHits = 0;
    const nodes = document.querySelectorAll('[data-message-id]');
    nodes.forEach((el) => {
      const role = el.getAttribute('data-message-author-role');
      if (!role) return;
      const md = el.querySelector('.markdown');
      const fromFiber = md ? sourceOf(md) : null;
      if (md) fiberEligible += 1;
      if (fromFiber !== null) fiberHits += 1;
      // assistant 인데 .markdown 이 없으면 아직 답이 없는 것이다.
      // 그 자리에 원본은 "생각 중..." 같은 자리표시자를 그리는데, innerText 로 퍼오면
      // 그게 응답 본문이 되어 스크롤백에 남는다. 실제로 그렇게 보였다.
      // .markdown 이 assistant 본문의 안정 앵커라는 전제를 여기서도 지킨다.
      const pending = role === 'assistant' && !md;
      out.push({
        id: el.getAttribute('data-message-id'),
        role,
        model: el.getAttribute('data-message-model-slug') || null,
        text: pending ? '' : (fromFiber !== null ? fromFiber : ((md || el).innerText || '')),
        parts: partsOf(el) || null,
        fromFiber: fromFiber !== null,
        pending
      });
    });
    post('harvest', {
      messages: out,
      total: nodes.length,
      fiberEligible,
      fiberHits,
      title: document.title,
      path: location.pathname
    });
  };

  // 마지막 응답의 원문을 fiber 에서 다시 읽어 스트림 결과와 대조한다
  const verify = (id) => {
    const el = id
      ? document.querySelector(`[data-message-id="${CSS.escape(id)}"]`)
      : [...document.querySelectorAll('[data-message-author-role="assistant"]')].pop();
    const md = el && el.querySelector('.markdown');
    post('verify', { id, text: md ? sourceOf(md) : null });
  };

  window.addEventListener('message', (e) => {
    if (e.source !== window) return;
    const d = e.data;
    if (!d || d[CH] !== true || d.dir !== 'i2m') return;
    if (d.kind === 'harvest') harvest();
    else if (d.kind === 'verify') verify(d.payload && d.payload.id);
    else if (d.kind === 'ping') post('pong', { ready: true });
  });

  post('ready', { url: location.href });
})();
