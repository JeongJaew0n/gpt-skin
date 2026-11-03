// 설정 화면의 '모두 기본값' — 언어 · 스킨 · 탭별 분할까지 돌아가면 화면을 다시 그리는가 (리뷰 2026-11-03).
// 예전에는 저장만 하고 그대로 둬서, 시트 · en 에서 누르면 저장소는 terminal · auto 인데 화면에는 시트 항목과
// 영어가 남았다(헤드리스 크롬 실측). 한 항목씩 바꿀 때(save)는 다시 그렸다.
import fs from 'node:fs'; import vm from 'node:vm';

const results = []; const t = (n, ok) => results.push([n, ok]);
const read = (f) => fs.readFileSync(f, 'utf8');
const tick = () => new Promise((r) => setTimeout(r, 0));

class N {
  constructor(tag) { this.tagName = tag.toUpperCase(); this.children = []; this.listeners = {}; this.dataset = {}; this.style = {}; this.textContent = ''; this.hidden = false; }
  appendChild(c) { this.children.push(c); return c; }
  addEventListener(type, fn) { (this.listeners[type] = this.listeners[type] || []).push(fn); }
  get classList() { return { add() {}, remove() {} }; }
  querySelectorAll() { return []; }
  async click() { for (const fn of this.listeners.click || []) await fn({ preventDefault() {} }); }
}

async function page(stored) {
  const ids = {};
  const sync = { ...stored };
  let reloads = 0;
  const sb = { console, Object, Array, Map, Set, String, Number, Boolean, JSON, Math, Promise, Date, RegExp, Error, setTimeout, clearTimeout,
    navigator: { language: 'ko-KR', platform: 'MacIntel' },
    location: { reload: () => { reloads += 1; } },
    document: {
      documentElement: {},
      createElement: (tag) => new N(tag),
      querySelector: (sel) => (ids[sel] = ids[sel] || new N('div'))
    },
    chrome: {
      runtime: { getManifest: () => ({ version: 'test' }) },
      storage: {
        sync: { get: async (q) => ({ ...q, ...sync }), set: async (o) => { Object.assign(sync, o); } },
        onChanged: { addListener() {} }
      }
    }
  };
  sb.window = sb; sb.globalThis = sb;
  vm.createContext(sb);
  vm.runInContext(read('src/shared/i18n.js'), sb, { filename: 'i18n.js' });
  vm.runInContext(read('src/shared/defaults.js'), sb, { filename: 'defaults.js' });
  vm.runInContext(read('src/options/options.js'), sb, { filename: 'options.js' });
  for (let i = 0; i < 5; i += 1) await tick();
  return { reset: () => ids['#reset'].click(), sync, reloads: () => reloads };
}

{
  const p = await page({ skin: 'sheet', locale: 'en' });
  await p.reset();
  t('스킨 · 언어가 기본값으로 돌아가면 다시 그린다', p.reloads() === 1);
  t('저장은 기본값으로 된다', p.sync.skin === 'terminal' && p.sync.locale === 'auto');
}
{
  const p = await page({ 'skin.perTab': true });
  await p.reset();
  t('탭별 분할만 바뀌어도 다시 그린다 (스킨 항목 이름이 바뀐다)', p.reloads() === 1);
}
{
  const p = await page({ 'font.size': 15 });
  await p.reset();
  t('화면 모양이 그대로인 항목만 돌아가면 다시 그리지 않는다', p.reloads() === 0 && p.sync['font.size'] === 13);
}

let bad = 0;
results.forEach(([n, ok]) => { if (!ok) bad++; console.log(`  ${ok ? 'PASS' : 'FAIL'}  ${n}`); });
console.log(bad ? `\n${bad}건 실패` : '\n전부 통과');
process.exit(bad ? 1 : 0);
