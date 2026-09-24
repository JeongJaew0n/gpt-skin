// 스킨 레지스트리와 계약 — core 와 shell 은 GT.skin.current 만 부른다.
// docs/plan/2026-09-24-skin-architecture.md §2.2 · §2.3 · §5 (3단계)
import fs from 'node:fs'; import vm from 'node:vm'; import path from 'node:path';

const results = []; const t = (n, ok) => results.push([n, ok]);
const walk = (d) => fs.readdirSync(d, { withFileTypes: true })
  .flatMap((e) => e.isDirectory() ? walk(`${d}/${e.name}`) : e.name.endsWith('.js') ? [`${d}/${e.name}`] : []);
const SRC = walk('src');
const read = (f) => fs.readFileSync(f, 'utf8');
const mf = JSON.parse(read('manifest.json'));
const order = mf.content_scripts.find((c) => c.world === 'ISOLATED').js;
const SKIN_FILES = walk('src/content/skins');

// ---------------------------------------------------------------- 우회 금지 (정적)
{
  const tty = SRC.filter((f) => /GT\.tty\b/.test(read(f)));
  t('GT.tty 를 부르는 곳이 없다', tty.length === 0);
  if (tty.length) console.log('    ', tty.join(', '));

  // ui 는 계약이 아니다. 스킨의 DOM 을 밖에서 만지면 다른 스킨에서 죽는다.
  const ui = SRC.filter((f) => /\.current\.ui\b/.test(read(f)));
  t('밖에서 스킨의 ui 를 만지지 않는다', ui.length === 0);
  if (ui.length) console.log('    ', ui.join(', '));

  // IME 가드는 prompt.js 한 곳에 있다
  const ime = SKIN_FILES.filter((f) => /isComposing/.test(read(f)));
  t('스킨 파일에 IME 가드가 없다', ime.length === 0);
}

// ---------------------------------------------------------------- 매니페스트 배치
{
  const iSkin = order.indexOf('src/content/shell/skin.js');
  const iIdx = order.indexOf('src/content/index.js');
  t('skin.js 가 매니페스트에 있다', iSkin >= 0);
  t('모든 스킨 파일이 매니페스트에 있다', SKIN_FILES.every((f) => order.includes(f)));
  t('스킨은 skin.js 뒤, index.js 앞', SKIN_FILES.every((f) => { const i = order.indexOf(f); return i > iSkin && i < iIdx; }));
  const idx = read('src/content/index.js');
  t('preflight 가 스킨 레지스트리를 확인한다', /'skins', 'skin'/.test(idx));
}

// ---------------------------------------------------------------- 실제로 등록해 본다
function loadRegistry(extra = {}) {
  const calls = { coverRemoved: 0, sw: [], coverOn: false };
  const sb = {
    console, Object, Array, Map, String, Error, setTimeout,
    document: { createElement: () => ({ style: {}, dataset: {}, appendChild() {}, addEventListener() {} }) },
    GT: {
      cover: { apply() {}, remove: () => { calls.coverRemoved++; }, on: () => { calls.coverOn = true; },
               off: () => { calls.coverOn = false; }, isOn: () => calls.coverOn },
      health: { degraded: false },
      sendToSW: (m) => calls.sw.push(m),
      theme: { THEMES: { 'modern-dark': {} } },
      ...extra
    }
  };
  vm.createContext(sb);
  vm.runInContext(read('src/content/shell/skin.js'), sb, { filename: 'skin.js' });
  return { sb, GT: sb.GT, calls };
}

{
  const { sb, GT } = loadRegistry();
  const registered = [];
  for (const f of SKIN_FILES) {
    const before = GT.skins.names().length;
    let err = null;
    try { vm.runInContext(read(f), sb, { filename: f }); } catch (e) { err = e; }
    t(`${path.basename(f)} 가 오류 없이 로드된다`, !err);
    if (err) console.log('    ', err.message);
    const names = GT.skins.names();
    // 파일 하나에 스킨 하나, 이름은 파일명과 같다 — 스킨 추가 = 파일 하나
    t(`${path.basename(f)} 가 스킨 하나를 등록한다`, names.length === before + 1);
    t(`${path.basename(f)} 의 id 가 파일명과 같다`, names[names.length - 1] === path.basename(f, '.js'));
    if (names.length === before + 1) registered.push(names[names.length - 1]);
  }
  t('terminal 이 등록돼 있다', GT.skins.names().includes('terminal'));
  for (const id of registered) {
    const def = GT.skins.get(id);
    t(`${id}: 계약을 전부 채운다`, GT.skins.missing(def).length === 0);
    t(`${id}: 원본을 안 가리면 타이핑도 안 뺏는다`, def.covers || def.capturesTyping === false);
    t(`${id}: 이름이 ko·en 둘 다 있다`, !!(def.label && def.label.ko && def.label.en));
    t(`${id}: 기본 테마가 테마 목록에 있다`, def.defaultTheme in def.themes);
    t(`${id}: prompt 가 el·autosize 를 준다`, 'el' in def.prompt && typeof def.prompt.autosize === 'function');
  }
}

{
  // 계약이 모자라면 등록을 거부한다
  const { GT } = loadRegistry();
  let err = null;
  try { GT.skins.register({ id: 'half', label: {}, covers: true }); } catch (e) { err = e; }
  t('계약이 모자라면 거부한다', !!err && /half/.test(err.message) && /render\(\)/.test(err.message));
  t('거부된 스킨은 목록에 없다', !GT.skins.names().includes('half'));

  const full = {};
  GT.skins.FIELDS.forEach((k) => { full[k] = k === 'covers' || k === 'capturesTyping' ? true : k === 'id' ? 'x' : {}; });
  GT.skins.METHODS.forEach((k) => { full[k] = () => {}; });
  full.prompt = { el: null, autosize() {} };
  GT.skins.register(full);
  let dup = null;
  try { GT.skins.register({ ...full }); } catch (e) { dup = e; }
  t('같은 id 를 두 번 등록하지 못한다', !!dup);
}

{
  // 선택 · 해체 · 토글
  const { sb, GT, calls } = loadRegistry();
  try { vm.runInContext(read('src/content/skins/terminal.js'), sb, { filename: 'terminal.js' }); } catch (_) { /* 위에서 이미 FAIL 로 셌다 */ }
  if (!GT.skins.get('terminal')) { t('terminal 없이는 선택·해체·토글을 볼 수 없다', false); }
  else {
  t('모르는 스킨 이름이면 terminal', GT.skin.use('없는스킨').id === 'terminal');
  t('use 전에도 current 가 비지 않는다', !!GT.skin.current);

  const bad = GT.skin.current;
  const orig = bad.destroy;
  bad.destroy = () => { throw new Error('boom'); };
  try { GT.skin.destroy(); } catch (_) {}
  bad.destroy = orig;
  t('스킨 destroy 가 죽어도 cover 는 걷는다', calls.coverRemoved === 1);

  bad.focus = () => {};
  GT.skin.toggle();
  t('toggle 이 켠다', GT.skin.visible() === true);
  t('toggle 이 서비스 워커에 알린다', calls.sw.length === 1 && calls.sw[0].visible === true);
  GT.health.degraded = true;
  GT.skin.toggle();
  t('원본으로 복귀한 상태에서는 토글하지 않는다', GT.skin.visible() === true && calls.sw.length === 1);
  }
}

let bad = 0;
results.forEach(([n, ok]) => { if (!ok) bad++; console.log(`  ${ok ? 'PASS' : 'FAIL'}  ${n}`); });
console.log(bad ? `\n${bad}건 실패` : '\n전부 통과');
process.exit(bad ? 1 : 0);
