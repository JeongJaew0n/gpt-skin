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
      } catch (_) { current = { ...DEFAULTS }; }
      return current;
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
