// gpt-skin — 모델 · 추론 수준 선택.
//
// 우리가 직접 고를 방법은 없다. 전송은 원본이 하고(sentinel proof-of-work),
// 모델·추론 수준은 원본이 자기 상태에서 읽어 요청 본문에 넣는다.
// 그래서 원본의 선택 메뉴를 대신 조작한다.
//
// 확인된 구조(2026-09-01):
//   컴포저의 `.__composer-pill`(aria-haspopup=menu) 하나가 모델과 추론 수준을 겸한다.
//     [role=menuitemradio]  → 모델 후보. aria-checked 가 현재 모델
//     [role=menuitem]       → 추론 수준. 라벨이 현재값이고 누르면 하위 메뉴가 열린다
//   Radix 메뉴라 pointerdown/pointerup 을 봐야 열린다. click 만으로는 안 열린다.
//
// 라벨은 로케일을 탄다("중간"). 그래서 문자열을 로직에 쓰지 않는다 —
// '라디오가 아니면서 글자가 있는 항목'이 추론 수준 트리거다.
GT.picker = (function () {
  'use strict';

  const PILL = '.__composer-pill';
  const ITEM = '[role="menuitem"],[role="menuitemradio"]';
  const wait = (ms) => new Promise((r) => setTimeout(r, ms));

  const pointer = (el, type) => el.dispatchEvent(new PointerEvent(type, {
    bubbles: true, cancelable: true, pointerId: 1, button: 0, isPrimary: true
  }));

  function pill() {
    return [...document.querySelectorAll('button')]
      .find((b) => String(b.className).includes('__composer-pill') && b.getAttribute('aria-haspopup') === 'menu')
      || document.querySelector(PILL);
  }

  function items() { return [...document.querySelectorAll(ITEM)]; }

  async function open() {
    const p = pill();
    if (!p) return false;
    if (items().length) return true;          // 이미 열려 있다
    pointer(p, 'pointerdown'); pointer(p, 'pointerup'); p.click();
    for (let i = 0; i < 12; i += 1) { await wait(80); if (items().length) return true; }
    return false;
  }

  // 합성 Escape 로는 이 메뉴가 닫히지 않는다 (2026-09-02 실측 — 슬라이더를 건드리지 않아도 마찬가지).
  // 다만 우리 오버레이 안에서 일어나는 사용자의 다음 '진짜' 클릭이 페이지까지 전파되어 그때 닫힌다.
  // 그래서 시도는 하되 닫혔다고 단정하지 않는다.
  async function close() {
    for (let i = 0; i < 2 && items().length; i += 1) {
      document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }));
      await wait(120);
    }
    return !items().length;
  }

  const label = (el) => (el.textContent || '').trim();

  // 현재 상태는 메뉴를 열지 않고도 읽을 수 있다
  function current() {
    const p = pill();
    return { effort: p ? label(p) : null };
  }

  async function models() {
    if (!(await open())) return null;
    const out = items()
      .filter((e) => e.getAttribute('role') === 'menuitemradio')
      .map((e, i) => ({ index: i, label: label(e), current: e.getAttribute('aria-checked') === 'true' }));
    await close();
    return out;
  }

  async function chooseModel(want) {
    if (!(await open())) return { ok: false, reason: 'menu-not-found' };
    const radios = items().filter((e) => e.getAttribute('role') === 'menuitemradio');
    const n = Number(want);
    const el = Number.isInteger(n) && radios[n]
      ? radios[n]
      : radios.find((e) => label(e).toLowerCase().includes(String(want).toLowerCase()));
    if (!el) { const had = radios.map(label); await close(); return { ok: false, reason: 'no-match', had }; }
    const picked = label(el);
    pointer(el, 'pointerdown'); pointer(el, 'pointerup'); el.click();
    await wait(400);
    await close();
    return { ok: true, picked };
  }

  // ------------------------------------------------------------- 추론 수준
  //
  // 하위 메뉴가 아니라 **슬라이더**다. 그래서 아무리 열려고 해도 안 열렸다(2026-09-01 실측).
  //
  //   [role=menuitem][aria-label="성능"]
  //     └ [role=slider] aria-valuemin=0 aria-valuemax=2      ← 3단계
  //        aria-keyshortcuts="ArrowLeft ArrowRight"
  //        aria-describedby → "중간, 3개 중 2번째."
  //
  // 화살표 키를 네이티브로 쏘면 움직인다 — React 프롭을 만질 필요가 없다.
  // 라벨("성능"·"중간")은 로케일을 타므로 **슬라이더를 품은 항목**으로 구조 식별한다.

  function effortItem() {
    return items().find((e) => e.querySelector && e.querySelector('[role="slider"]'));
  }

  function readEffort(item) {
    if (!item) return null;
    const slider = item.querySelector('[role="slider"]');
    const max = Number(slider && slider.getAttribute('aria-valuemax'));
    const nowAttr = slider && slider.getAttribute('aria-valuenow');
    // 설명문에서 현재 라벨과 위치를 읽는다. 숫자만 뽑으므로 언어와 무관하다.
    const ids = String(item.getAttribute('aria-describedby') || '').split(/\s+/).filter(Boolean);
    const desc = ids.map((id) => {
      const n = document.getElementById(id);
      return n ? (n.textContent || '').trim() : '';
    }).join(' ');
    const nums = desc.match(/(\d+)\D+(\d+)/);       // "3개 중 2번째" / "2 of 3"
    const steps = Number.isFinite(max) && max >= 0 ? max + 1 : (nums ? Number(nums[1]) : null);
    let index = nowAttr != null && nowAttr !== '' ? Number(nowAttr) : null;
    if (index == null && nums) index = Number(nums[2]) - 1;
    const label = (desc.split(',')[0] || '').trim();
    return { index, steps, label, desc };
  }

  async function effort() {
    if (!(await open())) return null;
    const state = readEffort(effortItem());
    await close();
    if (state) { if (state.steps) steps = state.steps; learn(state.index, state.label); }
    return state;
  }

  // target: 숫자(절대 위치) 또는 '+' / '-' (상대). 상대까지 여기서 풀어야
  // 메뉴를 한 번만 열고 끝낼 수 있다 — 열 때마다 1초 가까이 걸린다.
  async function setEffort(target) {
    if (!(await open())) return { ok: false, reason: 'menu-not-found' };
    const item = effortItem();
    if (!item) { await close(); return { ok: false, reason: 'no-slider' }; }
    const cur = readEffort(item);
    if (!cur || cur.index == null || !cur.steps) { await close(); return { ok: false, reason: 'unreadable' }; }

    const rel = target === '+' ? cur.index + 1 : target === '-' ? cur.index - 1 : Number(target);
    if (!Number.isFinite(rel)) { await close(); return { ok: false, reason: 'bad-target' }; }
    const want = Math.max(0, Math.min(cur.steps - 1, rel));
    if (want === cur.index) { await close(); return { ok: true, index: cur.index, label: cur.label, steps: cur.steps, noop: true }; }

    const key = want > cur.index ? 'ArrowRight' : 'ArrowLeft';
    const n = Math.abs(want - cur.index);
    for (let i = 0; i < n; i += 1) {
      item.dispatchEvent(new KeyboardEvent('keydown', {
        key, bubbles: true, cancelable: true, composed: true
      }));
      await wait(140);
    }
    const after = readEffort(item);
    if (after) { if (after.steps) steps = after.steps; learn(after.index, after.label); }
    learn(cur.index, cur.label);
    await close();
    if (!after || after.index !== want) {
      return { ok: false, reason: 'no-move', from: cur.index, to: after ? after.index : null };
    }
    return { ok: true, index: after.index, label: after.label, steps: after.steps };
  }

  // 옛 이름 — 하위 메뉴 모델이었던 시절의 잔재. 라벨이 곧 현재값이다.
  function effortTrigger() {
    return items().find((e) => e.getAttribute('role') === 'menuitem' && label(e));
  }

  // 상단바 표시용 상태.
  //
  // 메뉴가 닫혀 있을 때 pill 의 라벨이 곧 현재 추론 수준이다 — 메뉴를 열 필요가 없다.
  // 메뉴가 열려 있는 동안에는 라벨이 '추론 수준' 으로 바뀌므로 그때는 마지막 값을 쓴다.
  let lastEffort = null;
  let pending = null;              // 바꾸는 중일 때 {from}
  // 슬라이더 단계 수와, 지금까지 본 위치별 라벨.
  // 라벨은 그 위치가 '현재'가 되어야 알 수 있다 — 알아내려고 값을 옮길 수는 없으니
  // 본 것만 기억하고 나머지는 자리 이름으로 대신한다.
  let steps = 3;
  const seenLabels = {};
  const listeners = [];
  const notify = () => listeners.forEach((f) => { try { f(); } catch (_) {} });
  const remember = (st) => { if (st && st.label) lastEffort = st.label; return st; };

  // 메뉴를 열지 않고 읽는다. 매 초 렌더에서 불려도 될 만큼 싸다.
  function effortLabel() {
    const p = pill();
    if (!p) return null;
    if (items().length) return lastEffort;         // 메뉴가 열려 있으면 라벨을 못 믿는다
    const t = (p.textContent || '').trim();
    if (t) lastEffort = t;
    return lastEffort;
  }

  // 상단바 팝업이 쓸 목록. 메뉴를 열지 않고 만든다.
  // 3단계면 자리 이름(낮음·중간·높음)을 기본으로 쓰고, 실제로 본 라벨이 있으면 그걸 보여준다.
  const POSITIONS = { 3: ['낮음', '중간', '높음'] };
  function effortChoices() {
    const cur = effortLabel();
    const curIdx = Object.keys(seenLabels).find((k) => seenLabels[k] === cur);
    const names = POSITIONS[steps];
    return Array.from({ length: steps }, (_, i) => ({
      index: i,
      label: seenLabels[i] || (names ? names[i] : String(i)),
      current: curIdx != null ? Number(curIdx) === i : false
    }));
  }

  const learn = (i, label) => { if (label && i != null) { seenLabels[i] = label; } };

  return {
    current, models, chooseModel, available: () => !!pill(),
    effort: async () => remember(await effort()),
    async setEffort(t) {
      pending = { from: effortLabel() };
      notify();
      try {
        const r = await setEffort(t);
        if (r && r.ok) lastEffort = r.label;
        return r;
      } finally {
        pending = null;
        notify();
      }
    },
    effortLabel, effortChoices,
    get steps() { return steps; },
    get pending() { return pending; },
    onChange(fn) { listeners.push(fn); },
    get lastEffort() { return lastEffort; }
  };
})();
