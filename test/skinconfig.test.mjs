// 스킨 설정 — skin 키 · 스킨 전용 항목 · 테마 이관 · :skin · :theme
// docs/plan/2026-09-24-skin-architecture.md §2.7 · §2.8 (4단계)
import fs from 'node:fs'; import vm from 'node:vm'; import path from 'node:path';

const results = []; const t = (n, ok) => results.push([n, ok]);
const read = (f) => fs.readFileSync(f, 'utf8');
const SKIN_IDS = fs.readdirSync('src/content/skins').filter((f) => f.endsWith('.js')).map((f) => path.basename(f, '.js')).sort();

function shared(extra = {}) {
  const sb = { console, Object, Array, Map, Set, String, Number, Boolean, JSON, Math, Promise, Error, RegExp, Date,
    navigator: { language: 'ko' }, chrome: { runtime: { getManifest: () => ({ version: '0.0.0' }) } }, ...extra };
  sb.window = sb; sb.globalThis = sb;
  vm.createContext(sb);
  vm.runInContext(read('src/shared/i18n.js'), sb, { filename: 'i18n.js' });
  vm.runInContext(read('src/shared/defaults.js'), sb, { filename: 'defaults.js' });
  return sb;
}

// ---------------------------------------------------------------- 스키마
{
  const sb = shared();
  const f = sb.GT_SCHEMA.find((x) => x.key === 'skin');
  t('skin 설정이 있다', !!f && f.type === 'enum');
  t('기본 스킨은 terminal', f && f.def === 'terminal');
  t('선택지가 스킨 파일 목록과 같다', f && [...f.choices].sort().join() === SKIN_IDS.join());
  t('맨 앞 섹션이다', sb.GT_SCHEMA[0].key === 'skin');

  const tagged = sb.GT_SCHEMA.filter((x) => x.skin);
  t('스킨 전용 항목이 있다', tagged.length > 0);
  t('스킨 전용 표시는 있는 스킨만 가리킨다', tagged.every((x) => SKIN_IDS.includes(x.skin)));
  t('옛 theme 키는 스키마에 없다', !sb.GT_SCHEMA.some((x) => x.key === 'theme'));
  t('테마는 스킨 이름을 앞에 단다', sb.GT_SCHEMA.some((x) => x.key === 'terminal.theme' && x.skin === 'terminal'));

  const term = sb.GT_FIELDS_FOR('terminal').map((x) => x.key);
  const other = sb.GT_FIELDS_FOR('다른스킨').map((x) => x.key);
  t('terminal 에는 커서 항목이 보인다', term.includes('cursor.style') && term.includes('terminal.theme'));
  t('다른 스킨에는 terminal 전용이 안 보인다', !other.includes('cursor.style') && !other.includes('terminal.theme'));
  t('공용 항목은 어디서나 보인다', other.includes('font.size') && other.includes('skin') && other.includes('sidebar.visible'));
  t('이관 목록에 theme → terminal.theme', sb.GT_MIGRATIONS.some((m) => m.from === 'theme' && m.to === 'terminal.theme'));
  t('이관 대상 키는 스키마에 있다', sb.GT_MIGRATIONS.every((m) => sb.GT_SCHEMA.some((x) => x.key === m.to)));
}

// ---------------------------------------------------------------- 이관 (실제로 돌린다)
function configWith(stored) {
  const store = { ...stored };
  const writes = [];
  const chrome = {
    runtime: { getManifest: () => ({ version: '0.0.0' }) },
    storage: {
      onChanged: { addListener() {} },
      sync: {
        async get(q) {
          if (Array.isArray(q)) { const o = {}; q.forEach((k) => { if (k in store) o[k] = store[k]; }); return o; }
          return { ...q, ...store };          // get(DEFAULTS): 기본값 위에 저장값
        },
        async set(o) { writes.push(o); Object.assign(store, o); }
      }
    }
  };
  const sb = shared({ chrome });
  sb.GT = {};
  vm.runInContext(read('src/content/config.js'), sb, { filename: 'config.js' });
  return { C: sb.GT.config, store, writes };
}

{
  const { C, writes } = configWith({ theme: 'amber' });
  await C.load();
  t('옛 theme 값을 terminal.theme 으로 옮긴다', C.get('terminal.theme') === 'amber');
  t('저장소에도 쓴다', writes.some((w) => w['terminal.theme'] === 'amber'));
  const again = await C.migrate();
  t('두 번째에는 옮기지 않는다', again.length === 0 && writes.length === 1);
}
{
  const { C, writes } = configWith({ theme: 'amber', 'terminal.theme': 'crt-green' });
  await C.load();
  t('새 키가 있으면 옛 값으로 덮지 않는다', C.get('terminal.theme') === 'crt-green' && writes.length === 0);
}
{
  const { C, writes } = configWith({ 'terminal.theme': 'modern-dark', theme: 'amber' });
  await C.load();
  t('새 키가 기본값과 같아도 사용자가 고른 것이다', C.get('terminal.theme') === 'modern-dark' && writes.length === 0);
}
{
  const { C, writes } = configWith({});
  await C.load();
  t('옮길 게 없으면 쓰지 않는다', writes.length === 0 && C.get('terminal.theme') === 'modern-dark');
}
{
  const { C, store } = configWith({ theme: 'amber' });
  await C.load();
  t('옛 키는 지우지 않는다', store.theme === 'amber');
}
{
  const { C } = configWith({ theme: '없는테마' });
  await C.load();
  t('이상한 옛 값은 기본값으로', C.get('terminal.theme') === 'modern-dark');
}

// ---------------------------------------------------------------- 테마가 새 키를 읽는다
{
  const sb = shared();
  sb.GT = {};
  vm.runInContext(read('src/content/theme.js'), sb, { filename: 'theme.js' });
  const amber = sb.GT.theme.vars({ 'terminal.theme': 'amber', 'font.size': 13 });
  const def = sb.GT.theme.vars({ 'terminal.theme': 'modern-dark', 'font.size': 13 });
  const legacy = sb.GT.theme.vars({ theme: 'amber', 'font.size': 13 });
  t('terminal.theme 을 읽는다', amber !== def);
  t('옛 theme 키는 더 이상 읽지 않는다', legacy === def);
}

// ---------------------------------------------------------------- 명령
function commands() {
  const out = [];
  const saved = {};
  const sb = shared({ location: { pathname: '/' },
    document: { createElement: () => ({ style: {}, appendChild() {}, addEventListener() {} }) } });
  sb.GT = {
    theme: { names: () => [] },
    config: { keys: () => Object.keys(sb.GT_DEFAULTS), get: (k) => (k in saved ? saved[k] : sb.GT_DEFAULTS[k]),
              set: async (k, v) => { saved[k] = v; return v; }, has: () => true, all: {} },
    chats: { projects: () => [] },
    store: { state: { messages: [], superseded: 0, orphanDeltas: 0 } },
    skin: { current: { id: 'terminal', themes: { 'modern-dark': {}, amber: {} },
                       system: (l, x, node) => out.push(l + ':' + (x || '') + (node ? '[table]' : '')), applyConfig() {}, render() {} },
            hide() {} },
    skins: { names: () => ['terminal'], label: (id) => sb.GT_T('opt.skin.choice.' + id) },
    sidebar: { chats: () => [], isOpen: () => false }, picker: {}, navigate: {}, convops: {},
    health: { CHECKS: {}, reasons: [] }, conversation: {}, palette: {}, oai: {}, compose: {}
  };
  vm.runInContext(read('src/content/commands.js'), sb, { filename: 'commands.js' });
  return { C: sb.GT.commands, out, saved, GT: sb.GT };
}

{
  const { C, out, saved } = commands();
  await C.run(':skin');
  t(':skin 이 지금 스킨과 목록을 보여 준다', /지금 스킨: 터미널/.test(out.at(-1)) && /terminal \(터미널\)/.test(out.at(-1)));
  await C.run(':skin 엑셀');
  t('없는 스킨은 거절한다', /^error:알 수 없는 스킨입니다: 엑셀/.test(out.at(-1)) && !('skin' in saved));
  await C.run(':skin terminal');
  t('지금 스킨이면 저장하지 않는다', /이미 터미널/.test(out.at(-1)) && !('skin' in saved));
  t(':skin 인자 후보가 스킨 목록', C.complete(':skin ').candidates.join() === 'terminal');

  await C.run(':theme amber');
  t(':theme 이 <스킨>.theme 에 쓴다', saved['terminal.theme'] === 'amber' && !('theme' in saved));
  await C.run(':theme 없는것');
  t('없는 테마는 거절한다', /^error:알 수 없는 테마입니다/.test(out.at(-1)));
  t(':theme 인자 후보가 지금 스킨의 테마', C.complete(':theme ').candidates.join() === 'modern-dark,amber');
}
{
  const { C, out, GT } = commands();
  GT.skin.current.themes = {};
  GT.skin.current.id = 'plain';
  await C.run(':theme');
  t('테마가 없는 스킨이면 그렇게 말한다', /^error:.*고를 테마가 없습니다/.test(out.at(-1)));
}

// ---------------------------------------------------------------- 옵션 화면 (정적)
{
  const opt = read('src/options/options.js');
  t('옵션 화면은 지금 스킨의 항목만 그린다', /GT_FIELDS_FOR\(current\.skin\)\.forEach/.test(opt));
  t('옵션 화면이 스키마 전체를 그리지 않는다', !/GT_SCHEMA\.forEach/.test(opt));
  t('스킨을 바꾸면 다시 그린다', /key === 'locale' \|\| key === 'skin'\) location\.reload\(\)/.test(opt));
  const cmds = read('src/content/commands.js');
  t(':config 는 지금 스킨의 항목만', /GT_FIELDS_FOR\(GT\.skin\.current\.id\)/.test(cmds));
}

let bad = 0;
results.forEach(([n, ok]) => { if (!ok) bad++; console.log(`  ${ok ? 'PASS' : 'FAIL'}  ${n}`); });
console.log(bad ? `\n${bad}건 실패` : '\n전부 통과');
process.exit(bad ? 1 : 0);
