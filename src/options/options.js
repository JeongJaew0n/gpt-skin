// gpt-skin 설정 화면. 항목은 src/shared/defaults.js 의 GT_SCHEMA 에서 생성한다.
// 저장 버튼은 없다 — 바꾸는 즉시 저장하고 열려 있는 탭에 반영한다.
(async function () {
  'use strict';

  const $ = (s) => document.querySelector(s);
  const el = (t, c, x) => { const n = document.createElement(t); if (c) n.className = c; if (x !== undefined) n.textContent = x; return n; };

  const stored = await chrome.storage.sync.get(GT_DEFAULTS);
  const current = { ...GT_DEFAULTS, ...stored };
  GT_SET_LOCALE(current.locale);
  // HTML 에 박아 둔 문구도 사전에서 채운다. 두 벌로 관리하지 않는다.
  $('#reset').textContent = GT_T('opt.ui.resetAll');
  $('#syncNote').textContent = GT_T('opt.ui.syncNote');
  const rows = new Map();

  function markSaved() {
    const t = new Date().toLocaleTimeString('ko-KR', { hour12: false });
    $('#saved').textContent = GT_T('opt.ui.saved', t);
    clearTimeout(markSaved._t);
    markSaved._t = setTimeout(() => { $('#saved').textContent = ''; }, 2400);
  }

  function refreshCount() {
    const n = Object.keys(GT_DEFAULTS).filter((k) => current[k] !== GT_DEFAULTS[k]).length;
    $('#count').textContent = n ? GT_T('opt.ui.dirty', n) : GT_T('opt.ui.allDefault');
    rows.forEach((row, k) => { row.dataset.dirty = current[k] !== GT_DEFAULTS[k] ? '1' : '0'; });
  }

  async function save(key, raw) {
    const v = GT_COERCE(key, raw);
    current[key] = v;
    await chrome.storage.sync.set({ [key]: v });
    markSaved();
    refreshCount();
    // 언어를 바꾸면 이 화면의 모든 문구가 바뀐다. 다시 그리는 게 가장 간단하다.
    if (key === 'locale') location.reload();
    return v;
  }

  function control(f) {
    if (f.type === 'bool') {
      const label = el('label', 'check');
      const cb = el('input'); cb.type = 'checkbox'; cb.checked = !!current[f.key];
      const box = el('span', 'box', cb.checked ? '[×]' : '[ ]');
      const txt = el('span', 'txt', cb.checked ? 'on' : 'off');
      cb.addEventListener('change', async () => {
        await save(f.key, cb.checked);
        box.textContent = cb.checked ? '[×]' : '[ ]';
        txt.textContent = cb.checked ? 'on' : 'off';
      });
      label.appendChild(cb); label.appendChild(box); label.appendChild(txt);
      return { node: label, set: (v) => { cb.checked = !!v; box.textContent = v ? '[×]' : '[ ]'; txt.textContent = v ? 'on' : 'off'; } };
    }

    if (f.type === 'enum') {
      const sel = el('select');
      f.choices.forEach((v) => {
        const label = GT_CHOICE(f, v);
        const o = el('option', null, label); o.value = v;
        if (current[f.key] === v) o.selected = true;
        sel.appendChild(o);
      });
      sel.addEventListener('change', () => save(f.key, sel.value));
      return { node: sel, set: (v) => { sel.value = v; } };
    }

    const inp = el('input');
    inp.type = f.type === 'text' ? 'text' : 'number';
    if (f.min !== undefined) inp.min = f.min;
    if (f.max !== undefined) inp.max = f.max;
    if (f.step !== undefined) inp.step = f.step;
    else if (f.type === 'float') inp.step = '0.01';
    inp.value = current[f.key];
    const commit = () => save(f.key, inp.value).then((v) => { inp.value = v; });
    inp.addEventListener('change', commit);
    inp.addEventListener('keydown', (e) => { if (e.key === 'Enter') { e.preventDefault(); inp.blur(); } });
    return { node: inp, set: (v) => { inp.value = v; } };
  }

  // ------------------------------------------------------------------ 렌더
  const sections = [];
  GT_SCHEMA.forEach((f) => {
    const title = GT_SECTION(f);
    let s = sections.find((x) => x.name === title);
    if (!s) { s = { name: title, fields: [] }; sections.push(s); }
    s.fields.push(f);
  });

  const nav = $('#nav');
  nav.appendChild(el('div', 'navhead', GT_T('opt.ui.sections')));
  const main = $('#fields');

  sections.forEach((s, i) => {
    const id = 'sec-' + i;
    const a = el('a', i === 0 ? 'on' : null, s.name);
    a.href = '#' + id;
    a.addEventListener('click', () => {
      nav.querySelectorAll('a').forEach((x) => x.classList.remove('on'));
      a.classList.add('on');
    });
    nav.appendChild(a);

    const h = el('h2', null, s.name); h.id = id;
    main.appendChild(h);

    s.fields.forEach((f) => {
      const row = el('div', 'row');
      const k = el('div', 'k');
      k.appendChild(el('span', 'label', GT_LABEL(f)));
      k.appendChild(el('span', 'keyname', f.key));
      const v = el('div', 'v');
      const c = control(f);
      v.appendChild(c.node);
      const help = el('div', 'help');
      const hint = GT_HELP(f);
      if (hint) help.appendChild(el('div', null, hint));
      const d = el('button', 'dflt', GT_T('opt.ui.default', String(f.def) === '' ? GT_T('opt.ui.empty') : f.def));
      d.addEventListener('click', async () => { await save(f.key, f.def); c.set(f.def); });
      help.appendChild(d);
      row.appendChild(k); row.appendChild(v); row.appendChild(help);
      main.appendChild(row);
      rows.set(f.key, row);
      row._set = c.set;
    });
  });

  $('#reset').addEventListener('click', async () => {
    await chrome.storage.sync.set({ ...GT_DEFAULTS });
    Object.assign(current, GT_DEFAULTS);
    rows.forEach((row, k) => row._set(GT_DEFAULTS[k]));
    markSaved(); refreshCount();
  });

  // 다른 창에서 바꾼 값도 따라간다
  chrome.storage.onChanged.addListener((changes, area) => {
    if (area !== 'sync') return;
    Object.entries(changes).forEach(([k, v]) => {
      if (!(k in GT_DEFAULTS)) return;
      current[k] = v.newValue;
      const row = rows.get(k);
      if (row) row._set(v.newValue);
    });
    refreshCount();
  });

  refreshCount();
})();
