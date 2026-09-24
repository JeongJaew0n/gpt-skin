// gpt-skin — 명령 팔레트. fzf 식 퍼지 매칭 + 하이라이트(05 아트보드).
GT.palette = (function () {
  'use strict';

  const el = (t, c, x) => { const n = document.createElement(t); if (c) n.className = c; if (x !== undefined) n.textContent = x; return n; };

  let box = null, scrim = null, input = null, list = null, foot = null;
  let items = [], filtered = [], sel = 0, onPick = null;

  // 부분 문자열이 순서대로 등장하면 매치. 매치 위치를 함께 돌려준다.
  function fuzzy(needle, hay) {
    if (!needle) return { score: 0, hits: [] };
    const n = needle.toLowerCase(), h = hay.toLowerCase();
    const hits = [];
    let i = 0, score = 0, prev = -2;
    for (let k = 0; k < n.length; k += 1) {
      const idx = h.indexOf(n[k], i);
      if (idx < 0) return null;
      hits.push(idx);
      score += idx === prev + 1 ? 3 : 1;
      if (idx === 0) score += 2;
      prev = idx; i = idx + 1;
    }
    return { score: score - hay.length * 0.01, hits };
  }

  function highlight(text, hits) {
    const frag = document.createDocumentFragment();
    const set = new Set(hits);
    let run = '', runHit = false;
    const flush = () => {
      if (!run) return;
      frag.appendChild(runHit ? el('span', 'gt-hit', run) : document.createTextNode(run));
      run = '';
    };
    for (let i = 0; i < text.length; i += 1) {
      const hit = set.has(i);
      if (hit !== runHit) { flush(); runHit = hit; }
      run += text[i];
    }
    flush();
    return frag;
  }

  function draw() {
    list.textContent = '';
    filtered.forEach((f, i) => {
      const row = el('div', 'gt-palette-row');
      if (i === sel) row.dataset.sel = '1';
      row.appendChild(el('span', null, i === sel ? '❯' : ' ')).style.color = i === sel ? 'var(--gt-magenta)' : 'var(--gt-border)';
      const name = el('span', 'gt-palette-name');
      name.appendChild(highlight(f.item.name, f.hits));
      row.appendChild(name);
      row.appendChild(el('span', 'gt-palette-desc', f.item.desc || ''));
      if (f.item.hint) {
        const h = el('span', null, f.item.hint);
        h.style.color = 'var(--gt-fg-faint)'; h.style.fontSize = '11px';
        row.appendChild(h);
      }
      row.addEventListener('mousedown', (e) => { e.preventDefault(); sel = i; commit(); });
      list.appendChild(row);
    });
    foot.textContent = '';
    [['↑↓', '이동'], ['⏎', '실행'], ['esc', '닫기']].forEach(([k, v]) => {
      const s = el('span');
      s.appendChild(el('span', 'gt-key', k));
      s.appendChild(document.createTextNode(' ' + v));
      foot.appendChild(s);
    });
    foot.appendChild(el('span', 'gt-spacer'));
    foot.appendChild(el('span', null, `${filtered.length} / ${items.length}`));
  }

  function apply() {
    const q = input.value.trim();
    filtered = items
      .map((item) => {
        const whole = fuzzy(q, item.name + ' ' + (item.desc || ''));
        if (!whole) return null;
        const onName = fuzzy(q, item.name);
        return { item, hits: onName ? onName.hits : [], score: whole.score + (onName ? 4 : 0) };
      })
      .filter(Boolean)
      .sort((a, b) => b.score - a.score)
      .slice(0, 40);
    sel = 0;
    draw();
  }

  function commit() {
    const f = filtered[sel];
    close();
    if (f && onPick) onPick(f.item);
  }

  function close() {
    if (!box) return;
    box.remove(); scrim.remove();
    box = null; scrim = null;
    GT.skin.current.setMode('NORMAL');
    GT.skin.current.focus();
  }

  function open(list_, pick) {
    if (box) close();
    items = list_; onPick = pick;
    const root = GT.skin.current.overlayRoot();
    scrim = el('div', 'gt-scrim');
    scrim.addEventListener('mousedown', close);
    box = el('div', 'gt-palette');

    const head = el('div', 'gt-palette-input');
    const colon = el('span', null, ':'); colon.style.color = 'var(--gt-magenta)';
    input = el('input');
    input.spellcheck = false;
    input.placeholder = '명령 검색';
    head.appendChild(colon); head.appendChild(input);
    box.appendChild(head);

    list = el('div', 'gt-palette-list'); box.appendChild(list);
    foot = el('div', 'gt-palette-foot'); box.appendChild(foot);

    root.appendChild(scrim); root.appendChild(box);
    GT.skin.current.setMode('COMMAND');
    apply();
    input.focus();

    input.addEventListener('input', apply);
    input.addEventListener('keydown', (e) => {
      if (e.key === 'Escape') { e.preventDefault(); close(); }
      else if (e.key === 'ArrowDown' || (e.ctrlKey && e.key === 'n')) { e.preventDefault(); sel = Math.min(sel + 1, filtered.length - 1); draw(); }
      else if (e.key === 'ArrowUp' || (e.ctrlKey && e.key === 'p')) { e.preventDefault(); sel = Math.max(sel - 1, 0); draw(); }
      else if (e.key === 'Enter') { e.preventDefault(); commit(); }
      e.stopPropagation();
    });
  }

  // fuzzy/highlight 는 사이드바 필터도 쓴다 — 매칭 방식을 한 곳에 둔다.
  return { open, close, isOpen: () => !!box, fuzzy, highlight };
})();
