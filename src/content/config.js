// gpt-skin — 설정. 스키마는 src/shared/defaults.js 가 유일한 출처다.
GT.config = (function () {
  'use strict';

  const DEFAULTS = GT_DEFAULTS;
  let current = { ...DEFAULTS };
  const listeners = [];

  // 옵션 화면에서 바꾸면 열려 있는 탭에도 즉시 반영된다
  try {
    chrome.storage.onChanged.addListener((changes, area) => {
      if (area !== 'sync') return;
      let touched = false;
      Object.entries(changes).forEach(([k, v]) => {
        if (Object.prototype.hasOwnProperty.call(DEFAULTS, k)) { current[k] = v.newValue; touched = true; }
      });
      if (touched) listeners.forEach((fn) => fn(current));
    });
  } catch (_) { /* 컨텍스트가 없으면 무시 */ }

  return {
    DEFAULTS,
    get all() { return { ...current }; },
    get(k) { return current[k]; },
    keys() { return Object.keys(DEFAULTS); },
    has(k) { return Object.prototype.hasOwnProperty.call(DEFAULTS, k); },
    async load() {
      try {
        const got = await chrome.storage.sync.get(DEFAULTS);
        current = { ...DEFAULTS, ...got };
        await this.migrate();
      } catch (_) { current = { ...DEFAULTS }; }
      return current;
    },
    // 키 이름이 바뀐 설정을 옮긴다 (GT_MIGRATIONS). 새 키가 저장소에 있으면 건드리지 않는다 —
    // get(DEFAULTS) 는 기본값을 채워 돌려주므로 '있는가' 는 키 목록으로 따로 묻는다.
    async migrate() {
      const list = typeof GT_MIGRATIONS === 'undefined' ? [] : GT_MIGRATIONS;
      if (!list.length) return [];
      const keys = list.flatMap((m) => [m.from, m.to]);
      const raw = await chrome.storage.sync.get(keys);
      const moved = [];
      for (const m of list) {
        if (m.to in raw || !(m.from in raw)) continue;
        const v = GT_COERCE(m.to, raw[m.from]);
        current[m.to] = v;
        await chrome.storage.sync.set({ [m.to]: v });
        moved.push(m);
      }
      return moved;
    },
    async set(k, raw) {
      if (!this.has(k)) throw new Error(`알 수 없는 설정 키: ${k}`);
      const v = GT_COERCE(k, raw);
      current[k] = v;
      try { await chrome.storage.sync.set({ [k]: v }); } catch (_) {}
      listeners.forEach((fn) => fn(current));
      return v;
    },
    async reset(k) { return this.set(k, DEFAULTS[k]); },
    onChange(fn) { listeners.push(fn); }
  };
})();
