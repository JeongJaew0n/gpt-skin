// gpt-skin 빌드 스탬프.
// 크롬은 언팩 확장 파일을 캐시한다. "고쳤는데 왜 그대로지?" 를 추측으로 풀지 않으려고 둔다.
// 터미널 부팅 줄과 :version 에 찍힌다. 이 값이 안 바뀌면 확장이 다시 로드되지 않은 것이다.
var GT_BUILD = '2026-09-24 21:32';

// 버전은 manifest.json 이 정본이다. 소스에 또 적으면 반드시 갈린다 —
// 실제로 manifest 가 0.1.0 인 동안 :version 이 0.1.0 을 따로 들고 있었다.
// 확장 컨텍스트(content script·popup·options)에서는 늘 읽을 수 있다.
var GT_VERSION = (function () {
  try { return chrome.runtime.getManifest().version; } catch (_) { return '0.0.0'; }
})();

// gpt-skin — 설정 스키마. 콘텐츠 스크립트와 옵션 화면이 같은 정의를 쓴다.
// 여기가 유일한 출처다. 옵션 화면에 항목을 늘리려면 이 배열만 고치면 된다.
//
// 문구는 여기 없다. src/shared/i18n.js 의 사전에 있고, 키는 규칙으로 만든다.
//   섹션      opt.section.<section>
//   라벨      opt.<key>.label
//   도움말    opt.<key>.help        (없어도 된다)
//   선택지    opt.<key>.choice.<value>
// 그래야 언어를 바꿀 때 배열이 아니라 사전만 갈아끼운다.
//
// skin: '<id>' 가 붙은 항목은 그 스킨에서만 뜻이 있다. 설정 화면과 :config 는 지금 스킨의
// 항목과 공용 항목만 보여 준다. 저장은 다 한다 — 스킨을 바꿨다가 돌아오면 그대로다.
// docs/plan/2026-09-24-skin-architecture.md §2.7
var GT_SCHEMA = [
  // 선택지는 src/content/skins/ 의 파일 목록과 같아야 한다 (test/skin.test.mjs 가 본다).
  // 옵션 화면은 콘텐츠 스크립트를 싣지 않으므로 레지스트리를 읽을 수 없다 — 그래서 여기 적는다.
  {
    section: 'skin',
    key: 'skin', type: 'enum', def: 'terminal',
    choices: ['terminal']
  },
  {
    section: 'behavior',
    key: 'locale', type: 'enum', def: 'auto',
    choices: ['auto', 'ko', 'en']
  },
  {
    section: 'behavior',
    key: 'enabled', type: 'bool', def: false
  },
  {
    section: 'behavior',
    key: 'onBreak', type: 'enum', def: 'warn',
    choices: ['warn', 'revert', 'ignore']
  },
  {
    section: 'behavior',
    key: 'drift.threshold', type: 'int', def: 8, min: 1, max: 100
  },
  {
    section: 'behavior',
    key: 'log', type: 'bool', def: true
  },

  { section: 'sidebar', key: 'sidebar.visible', type: 'bool', def: true },
  { section: 'sidebar', key: 'sidebar.width', type: 'int', def: 30, min: 16, max: 80 },
  { section: 'sidebar', key: 'sidebar.closeOnOpen', type: 'bool', def: true },
  { section: 'sidebar', key: 'sidebar.groups', type: 'bool', def: true },
  { section: 'sidebar', key: 'sidebar.minColumns', type: 'int', def: 100, min: 0, max: 400 },

  // 테마는 스킨마다 따로 고른다. 예전 'theme' 키는 부팅 때 한 번 여기로 옮긴다 (GT_MIGRATIONS).
  { section: 'display', key: 'terminal.theme', type: 'enum', def: 'modern-dark', skin: 'terminal',
    choices: ['modern-dark', 'crt-green', 'amber'], rawChoices: true },
  { section: 'display', key: 'font.family', type: 'text',
    def: "'JetBrains Mono', ui-monospace, 'SF Mono', Menlo, monospace" },
  { section: 'display', key: 'font.size', type: 'int', def: 13, min: 10, max: 24 },
  { section: 'display', key: 'line.height', type: 'float', def: 1.62, min: 1, max: 3, step: 0.01 },
  { section: 'display', key: 'wrap.columns', type: 'int', def: 96, min: 0, max: 400, skin: 'terminal' },
  { section: 'display', key: 'citations', type: 'enum', def: 'domain',
    choices: ['domain', 'number', 'off'] },
  { section: 'display', key: 'image', type: 'enum', def: 'inline',
    choices: ['inline', 'blocks', 'off'] },
  { section: 'display', key: 'image.columns', type: 'int', def: 48, min: 16, max: 160 },
  { section: 'display', key: 'gutter.markers', type: 'bool', def: true, skin: 'terminal' },
  { section: 'display', key: 'scanlines', type: 'bool', def: false, skin: 'terminal' },

  { section: 'cursor', key: 'cursor.style', type: 'enum', def: 'block', skin: 'terminal',
    choices: ['block', 'bar', 'underline'], rawChoices: true },
  { section: 'cursor', key: 'cursor.blink', type: 'bool', def: true, skin: 'terminal' },
  { section: 'cursor', key: 'timestamps', type: 'enum', def: 'relative', skin: 'terminal',
    choices: ['relative', 'absolute', 'off'] },
  { section: 'cursor', key: 'bell', type: 'enum', def: 'visual',
    choices: ['visual', 'off'] }
];

// 화면에 쓸 문구를 스키마에서 끌어낸다. 규칙이 한 곳에만 있어야 어긋나지 않는다.
// rawChoices 인 항목(테마 이름, 커서 모양)은 값 자체가 이름이라 번역하지 않는다.
var GT_LABEL = function (f) { return GT_T('opt.' + f.key + '.label'); };
var GT_HELP = function (f) {
  var k = 'opt.' + f.key + '.help';
  var v = GT_T(k);
  return v === k ? '' : v;          // 사전에 없으면 도움말이 없는 항목이다
};
var GT_SECTION = function (f) { return GT_T('opt.section.' + f.section); };
var GT_CHOICE = function (f, value) {
  return f.rawChoices ? value : GT_T('opt.' + f.key + '.choice.' + value);
};

var GT_DEFAULTS = GT_SCHEMA.reduce(function (o, f) { o[f.key] = f.def; return o; }, {});

// 이 스킨에서 보여 줄 항목 — 공용 + 그 스킨 전용.
var GT_FIELDS_FOR = function (skin) {
  return GT_SCHEMA.filter(function (f) { return !f.skin || f.skin === skin; });
};

// 키 이름이 바뀐 설정. 새 키가 저장소에 한 번도 쓰인 적 없을 때만 옛 값을 복사한다.
// 옛 키는 지우지 않는다 — 버전을 되돌려도 설정이 살아 있게.
var GT_MIGRATIONS = [
  { from: 'theme', to: 'terminal.theme' }
];

var GT_COERCE = function (key, raw) {
  var f = GT_SCHEMA.find(function (x) { return x.key === key; });
  if (!f) return raw;
  if (f.type === 'int') { var n = parseInt(raw, 10); return Number.isFinite(n) ? n : f.def; }
  if (f.type === 'float') { var g = parseFloat(raw); return Number.isFinite(g) ? g : f.def; }
  if (f.type === 'bool') return raw === true || raw === 'on' || raw === 'true' || raw === '1';
  if (f.type === 'enum') return f.choices.indexOf(raw) >= 0 ? raw : f.def;
  return String(raw);
};
