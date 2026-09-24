// gpt-skin — 마크다운 원문을 tty 노드로 그린다.
// HTML 문자열을 만들지 않는다. 전부 createElement 로 조립해 주입 위험을 없앤다.
// 지원 범위는 07 아트보드(출력 렌더링 규격)에 맞춘 부분집합이다.
GT.markdown = (function () {
  'use strict';

  const el = (tag, cls, text) => {
    const n = document.createElement(tag);
    if (cls) n.className = cls;
    if (text !== undefined) n.textContent = text;
    return n;
  };

  // ------------------------------------------------------------------ inline

  // ------------------------------------------------------------- 인용 마커
  //
  // 같은 인용이 경로마다 다른 표기로 온다. 실측 결과(2026-09-04):
  //   백엔드 API·SSE : \uE200cite\uE202turn937490search17\uE201   (PUA 로 감싼 봉투)
  //   React fiber    : :contentReference[oaicite:0]{index=0}
  // 원본은 react-markdown 에 넘기기 전에 앞의 것을 뒤의 것으로 치환하고,
  // 렌더 플러그인이 그걸 먹어 칩을 그린다. 우리는 둘 다 받으므로 둘 다 처리한다.
  // docs/issue/2026-09-04-citation-markers-shown-raw.md
  //
  // 봉투는 범용이다 — \uE200<종류>\uE202<내용>\uE201. cite 말고 genui 도 관측됐다.
  // 인용이 아닌 종류는 각주를 매기지 않고 지운다. 본문에 보일 것이 아니다.
  const PUA_MARK = /\uE200([a-z_]+)(?:\uE202([\s\S]*?))?\uE201/;
  // 앞의 :? 는 오타가 아니다. 원본이 image_group 같은 봉투를 치환할 때
  // '::contentReference…' 로 콜론을 하나 더 남긴다(실측 2026-09-15).
  // 안 먹으면 화면에 콜론이 하나 떠 있고, 드리프트 대조에서도 1~2자가 어긋난다.
  // 연속된 '::' 일 때만 먹으므로 '설명: :contentReference' 같은 경우는 건드리지 않는다.
  // docs/issue/2026-09-15-drift-warning-on-most-chats.md
  const OAI_MARK = /:?:contentReference\[oaicite:(\d+)\]\{index=(\d+)\}/;

  // 봉투 안을 나누는 구분자. url 봉투는 이걸 두 번 쓴다.
  const SEP = '\uE202';

  // 인용으로 볼 ref 타입. 모르는 타입은 각주를 매기지 않고 지운다 —
  // 무엇인지 모르는 것을 출처인 양 번호 매기면 안 된다.
  const CITE_TYPES = /^(grouped_webpages|webpage|webpage_extended|sources_footnote)$/;

  // url 봉투는 인용이 아니라 '본문에 박힌 링크' 다. 실측(2026-09-09):
  //
  //   \uE200url\uE202docker.com\uE202<주소>\uE201
  //           ^종류    ^보여줄 글자    ^여는 http 부터 봉투 끝까지
  //
  // cite 봉투와 달리 \uE202 가 두 번 들어간다. 번호를 매기지 않는다 —
  // 원본도 [docker.com](주소) 로 문장 안에 그냥 깐다.
  // docs/issue/2026-09-09-url-marker-dropped.md
  const alt = /^\[([\s\S]*?)\]\((https?:\/\/[^\s)]+)\)\s*$/;

  function urlLink(ref, payload) {
    let label = '';
    let href = '';
    // 봉투가 직접 준 값이 먼저다. 스트리밍 중에는 refs 가 아직 없다.
    const cut = typeof payload === 'string' ? payload.indexOf(SEP) : -1;
    if (cut >= 0) {
      label = payload.slice(0, cut);
      href = payload.slice(cut + SEP.length);
    } else if (ref && typeof ref.alt === 'string') {
      // fiber 경로(:contentReference)에는 봉투가 없다. alt 에 완성된 링크가 들어 있다.
      const m = alt.exec(ref.alt);
      if (m) { label = m[1]; href = m[2]; }
    }
    if (!/^https?:\/\//i.test(href)) return null;
    const a = el('a', 'gt-link', label || hostOf(href) || href);
    a.href = href;
    a.target = '_blank';
    a.rel = 'noreferrer noopener';
    a.title = href;
    return a;
  }

  // 주소에서 사람이 알아볼 만한 부분만 뽑는다. www 는 정보가 아니다.
  // 주소가 이상하면 new URL 이 던진다 — 그때는 도메인 없이 번호만 남긴다.
  function hostOf(url) {
    try { return new URL(url).hostname.replace(/^www\./i, ''); } catch (_) { return ''; }
  }

  // 인용을 어떻게 보일지. domain [1 zdnet.co.kr] · number [1] · off 안 보인다.
  const citeMode = () => {
    try {
      const v = GT.config && GT.config.get && GT.config.get('citations');
      return v === 'number' || v === 'off' || v === 'domain' ? v : 'domain';
    } catch (_) { return 'domain'; }
  };

  const newCtx = (opts) => ({
    refs: (opts && opts.refs) || [],
    seen: 0,        // 마커를 몇 개 지났나 (content_references 의 인덱스와 같다)
    n: 0,           // 인용 번호
    // 렌더 한 번 동안 고정한다. 중간에 설정이 바뀌어도 한 응답 안에서
    // 표기가 섞이면 안 된다. opts.mode 는 테스트가 직접 넣을 때 쓴다.
    mode: (opts && opts.mode) || citeMode()
  });

  // 마커 하나를 인용이나 링크로 바꾸거나 지운다. 지울 때는 빈 조각을 돌려준다.
  function mark(ctx, idx, kind, payload) {
    const ref = ctx.refs[idx] || null;
    const type = ref ? ref.type : kind;

    if (type === 'url') {
      const a = urlLink(ref, payload);
      // 주소를 못 읽으면 지운다. 글자만 남기면 눌리지 않는 가짜 링크가 된다.
      if (a) return a;
      return document.createDocumentFragment();
    }

    const isCite = ref ? CITE_TYPES.test(ref.type) : kind === 'cite';
    if (!isCite) return document.createDocumentFragment();

    const mode = ctx.mode;
    // 'off' 면 번호도 매기지 않는다. 매기면 [1] 다음이 [3] 이 되어 더 헷갈린다.
    if (mode === 'off') return document.createDocumentFragment();

    ctx.n += 1;
    const n = ctx.n;
    const label = el('sup', 'gt-cite');
    const name = ref ? (ref.attribution || ref.title || '') : '';
    const url = ref && /^https?:\/\//i.test(String(ref.url || '')) ? ref.url : '';
    const host = mode === 'domain' ? hostOf(url) : '';
    const face = host ? `[${n} ${host}]` : `[${n}]`;
    // 도메인이 붙으면 위첨자를 푼다. 열두 자를 0.78em 위첨자로 얹으면 읽을 수 없다.
    if (host) label.dataset.wide = '1';

    // 번호 자체가 링크다. 아래에 출처 목록을 따로 두지 않는다 —
    // 논문 각주처럼 두 번 읽게 만들 이유가 없다. 이름은 호버로 보여준다.
    //
    // 주소를 모르면 번호만 남긴다. 스트리밍 중에는 refs 가 아직 없어서
    // 늘 그 상태다 — 스트림이 끝나고 refs 가 붙으면 링크가 된다.
    if (url) {
      const a = el('a', 'gt-cite-link', face);
      a.href = url;
      a.target = '_blank';
      a.rel = 'noreferrer noopener';
      a.title = name ? `${name} — ${url}` : url;
      label.appendChild(a);
    } else {
      label.textContent = face;
      if (name) label.title = name;
    }
    return label;
  }

  const INLINE = [
    // 마커를 먼저 잡는다. 뒤의 규칙이 봉투 안의 JSON 을 물어뜯으면 안 된다.
    { re: PUA_MARK, make: (m, ctx) => mark(ctx, ctx.seen++, m[1], m[2]) },
    // fiber 표기에는 봉투 속 값이 없다. 종류도 refs 를 봐야 안다.
    { re: OAI_MARK, make: (m, ctx) => { ctx.seen = Math.max(ctx.seen, +m[2] + 1); return mark(ctx, +m[2], 'cite', null); } },
    { re: /`([^`\n]+)`/, make: (m) => el('span', 'gt-code-inline', m[1]) },
    { re: /\*\*([^*\n]+)\*\*/, make: (m) => el('strong', 'gt-strong', m[1]) },
    { re: /(?<![*\w])\*([^*\n]+)\*(?!\w)/, make: (m) => el('em', 'gt-em', m[1]) },
    {
      re: /\[([^\]\n]+)\]\(([^)\s]+)\)/,
      make: (m) => {
        const a = el('a', 'gt-link', m[1]);
        a.href = /^https?:\/\//i.test(m[2]) ? m[2] : '#';
        a.target = '_blank';
        a.rel = 'noreferrer noopener';
        return a;
      }
    },
    {
      re: /(https?:\/\/[^\s<>()]+)/,
      make: (m) => {
        const a = el('a', 'gt-link', m[1]);
        a.href = m[1];
        a.target = '_blank';
        a.rel = 'noreferrer noopener';
        return a;
      }
    }
  ];

  function inline(text, frag, ctx) {
    frag = frag || document.createDocumentFragment();
    ctx = ctx || newCtx(null);
    let rest = String(text);
    for (;;) {
      let best = null;
      for (const rule of INLINE) {
        const m = rule.re.exec(rest);
        if (m && (best === null || m.index < best.m.index)) best = { m, rule };
      }
      if (!best) break;
      if (best.m.index > 0) frag.appendChild(document.createTextNode(rest.slice(0, best.m.index)));
      frag.appendChild(best.rule.make(best.m, ctx));
      rest = rest.slice(best.m.index + best.m[0].length);
    }
    if (rest) frag.appendChild(document.createTextNode(rest));
    return frag;
  }

  // ------------------------------------------------------------------- block

  // 아이콘은 글리프 대신 그린다. 폰트에 없는 문자에 기대지 않는다 (tty 의 손잡이와 같은 규칙).
  const SVG_NS = 'http://www.w3.org/2000/svg';
  const ICON = {
    copy: [
      'M5 4H2.8a1.3 1.3 0 0 0-1.3 1.3v6.4A1.3 1.3 0 0 0 2.8 13h4.9A1.3 1.3 0 0 0 9 11.7V9',
      'M6.3 1.5h4.9a1.3 1.3 0 0 1 1.3 1.3v4.9A1.3 1.3 0 0 1 11.2 9H6.3A1.3 1.3 0 0 1 5 7.7V2.8a1.3 1.3 0 0 1 1.3-1.3z'
    ],
    ok: ['M2.6 7.4 5.7 10.5 11.4 3.9'],
    fail: ['M3.6 3.6 10.4 10.4', 'M10.4 3.6 3.6 10.4']
  };

  function icon(kind) {
    const s = document.createElementNS(SVG_NS, 'svg');
    s.setAttribute('viewBox', '0 0 14 14');
    s.setAttribute('width', '13');
    s.setAttribute('height', '13');
    s.setAttribute('fill', 'none');
    s.setAttribute('aria-hidden', 'true');
    ICON[kind].forEach((d) => {
      const path = document.createElementNS(SVG_NS, 'path');
      path.setAttribute('d', d);
      path.setAttribute('stroke', 'currentColor');
      path.setAttribute('stroke-width', '1.2');
      path.setAttribute('stroke-linecap', 'round');
      path.setAttribute('stroke-linejoin', 'round');
      s.appendChild(path);
    });
    return s;
  }

  // 복사 버튼. 누른 순간의 원문을 가져오도록 함수를 받는다 —
  // 스트리밍 중 노드를 재사용해도 옛 본문을 붙여넣지 않는다.
  // 글자가 없으므로 상태는 아이콘과 aria-label 로 알린다.
  function copyBtn(getText, label) {
    const name = label || '복사';
    const b = el('button', 'gt-copy');
    b.type = 'button';
    let cur = icon('copy');
    b.appendChild(cur);

    const show = (kind, text) => {
      const next = icon(kind);
      b.replaceChild(next, cur);
      cur = next;
      b.title = text;
      b.setAttribute('aria-label', text);
    };
    show('copy', name);

    b.addEventListener('click', (e) => {
      e.preventDefault();
      e.stopPropagation();
      const done = (ok) => {
        b.dataset.state = ok ? 'ok' : 'fail';
        show(ok ? 'ok' : 'fail', ok ? '복사됨' : '복사 실패');
        setTimeout(() => {
          if (!b.isConnected) return;
          delete b.dataset.state;
          show('copy', name);
        }, 1200);
      };
      let p;
      try { p = GT.clipboard && GT.clipboard.copy ? GT.clipboard.copy(getText()) : false; } catch (_) { p = false; }
      Promise.resolve(p).then(done, () => done(false));
    });
    return b;
  }

  function codeBlock(lang, lines) {
    const box = el('div', 'gt-code');
    const head = el('div', 'gt-code-head');
    head.appendChild(el('span', 'gt-code-lang', lang || 'text'));
    head.appendChild(el('span', 'gt-spacer'));
    head.appendChild(el('span', 'gt-dim', `${lines.length} lines`));
    head.appendChild(copyBtn(() => box.dataset.code));
    box.appendChild(head);

    const body = el('div', 'gt-code-body');
    const gutter = el('div', 'gt-code-gutter');
    const code = el('pre', 'gt-code-text');
    lines.forEach((l, i) => {
      gutter.appendChild(el('span', null, String(i + 1)));
      code.appendChild(document.createTextNode(l + '\n'));
    });
    body.appendChild(gutter);
    body.appendChild(code);
    box.appendChild(body);

    box.dataset.code = lines.join('\n');
    return box;
  }

  function table(rows, ctx) {
    const t = el('table', 'gt-table');
    rows.forEach((cells, i) => {
      const tr = el('tr');
      cells.forEach((c) => {
        const td = el(i === 0 ? 'th' : 'td');
        td.appendChild(inline(c.trim(), null, ctx));
        tr.appendChild(td);
      });
      t.appendChild(tr);
    });
    return t;
  }

  function renderInto(src, ctx) {
    const out = document.createDocumentFragment();
    const lines = String(src == null ? '' : src).split('\n');
    let i = 0;
    let para = [];

    const flushPara = () => {
      if (!para.length) return;
      const p = el('div', 'gt-p');
      p.appendChild(inline(para.join(' '), null, ctx));
      out.appendChild(p);
      para = [];
    };

    while (i < lines.length) {
      const line = lines[i];

      const fence = /^\s*```+\s*([\w+-]*)\s*$/.exec(line);
      if (fence) {
        flushPara();
        const lang = fence[1];
        const body = [];
        i += 1;
        while (i < lines.length && !/^\s*```+\s*$/.test(lines[i])) { body.push(lines[i]); i += 1; }
        i += 1;
        out.appendChild(codeBlock(lang, body));
        continue;
      }

      if (/^\s*$/.test(line)) { flushPara(); i += 1; continue; }

      if (/^\s*(-{3,}|\*{3,}|_{3,})\s*$/.test(line)) {
        flushPara(); out.appendChild(el('div', 'gt-hr')); i += 1; continue;
      }

      const h = /^(#{1,6})\s+(.*)$/.exec(line);
      if (h) {
        flushPara();
        const n = el('div', `gt-h gt-h${h[1].length}`);
        n.appendChild(inline(h[2], null, ctx));
        out.appendChild(n);
        i += 1; continue;
      }

      if (/^\s*>\s?/.test(line)) {
        flushPara();
        const buf = [];
        while (i < lines.length && /^\s*>\s?/.test(lines[i])) { buf.push(lines[i].replace(/^\s*>\s?/, '')); i += 1; }
        const q = el('div', 'gt-quote');
        q.appendChild(el('span', 'gt-quote-bar'));
        const inner = el('div', 'gt-quote-body');
        inner.appendChild(renderInto(buf.join('\n'), ctx));
        q.appendChild(inner);
        out.appendChild(q);
        continue;
      }

      if (/^\s*\|.*\|\s*$/.test(line)) {
        flushPara();
        const rows = [];
        while (i < lines.length && /^\s*\|.*\|\s*$/.test(lines[i])) {
          const cells = lines[i].trim().replace(/^\||\|$/g, '').split('|');
          if (!/^[\s:|-]+$/.test(lines[i])) rows.push(cells);
          i += 1;
        }
        if (rows.length) out.appendChild(table(rows, ctx));
        continue;
      }

      const li = /^(\s*)([-*+]|\d+[.)])\s+(.*)$/.exec(line);
      if (li) {
        flushPara();
        const depth = Math.floor(li[1].replace(/\t/g, '  ').length / 2);
        const row = el('div', `gt-li gt-li-d${Math.min(depth, 3)}`);
        row.appendChild(el('span', 'gt-bullet', depth === 0 ? '·' : '▸'));
        const body = el('span', 'gt-li-body');
        body.appendChild(inline(li[3], null, ctx));
        row.appendChild(body);
        out.appendChild(row);
        i += 1; continue;
      }

      para.push(line.trim());
      i += 1;
    }
    flushPara();
    return out;
  }

  // opts.refs — conversation.js 가 실어준 content_references.
  // 없으면 마커는 번호만 남는다(스트리밍 중이 그렇다).
  function render(src, opts) {
    const ctx = newCtx(opts);
    return renderInto(src, ctx);
  }

  // 인용 마커를 걷어낸 텍스트. 두 표기를 같은 기준으로 비교할 때 쓴다.
  //
  // 같은 인용을 스트림은 PUA 봉투로, fiber 는 :contentReference 로 준다.
  // 길이가 다르므로 그대로 비교하면 인용이 있는 대화마다 드리프트가 뜬다.
  // docs/issue/2026-09-08-drift-warning-false-positive.md
  function stripMarks(text) {
    return String(text == null ? '' : text)
      .replace(new RegExp(PUA_MARK.source, 'g'), '')
      .replace(new RegExp(OAI_MARK.source, 'g'), '');
  }

  return { render, renderInto, inline, copyBtn, newCtx, stripMarks };
})();
