// gpt-skin — 화면 문구 사전.
//
// 왜 chrome.i18n 을 안 쓰나 (docs/plan/2026-09-08-i18n.md)
//   · chrome.i18n 은 브라우저 UI 언어를 따른다. 앱 안에서 못 바꾼다.
//     이 확장은 :set 과 옵션 화면으로 전부 바꾸는 물건이라 어긋난다.
//   · MAIN world(tap.js)에서는 chrome.* 를 아예 못 쓴다.
// 매니페스트의 name·description 만 _locales 로 두어 스토어 리스팅을 지역화하고,
// 화면 문구는 여기서 해결한다. 겹치는 건 그 두 줄뿐이다.
//
// 키 이름은 화면 위치를 따른다 — opt.* 설정, cmd.* 명령, sidebar.*, popup.*, health.*
// 보간은 $1 $2 … 로 쓴다.
var GT_I18N = {
  ko: {
    // ---------------------------------------------------------------- 설정
    'opt.section.skin': '스킨',
    'opt.section.behavior': '동작',
    'opt.section.sidebar': '사이드바',
    'opt.section.display': '표시',
    'opt.section.cursor': '커서와 알림',

    'opt.locale.label': '언어',
    'opt.locale.help': '자동은 브라우저 언어를 따릅니다. 바꾸면 바로 적용됩니다.',
    'opt.locale.choice.auto': '자동',
    'opt.locale.choice.ko': '한국어',
    'opt.locale.choice.en': 'English',

    'opt.skin.label': '스킨',
    'opt.skin.help': 'ChatGPT 위에 씌울 화면의 종류입니다. 바꾸면 열려 있는 ChatGPT 탭에 바로 적용됩니다. 시트는 대화를 스프레드시트처럼 보여 줍니다. 노 스킨은 원본 화면을 그대로 두고 Ctrl+; 로 명령줄만 엽니다.',
    'opt.skin.choice.none': '노 스킨 (명령만)',
    'popup.skin.label': '스킨',
    'popup.tab.label': '이 탭에 스킨 켜기',
    'popup.default.label': 'ChatGPT 를 열면 바로 스킨으로',
    'popup.default.help': '꺼 두면 원본 UI 로 시작합니다.',
    'opt.skin.choice.sheet': '시트 (스프레드시트)',
    'opt.sheet.theme.label': '시트 색',
    'opt.sheet.theme.choice.green': '초록',
    'opt.sheet.theme.choice.blue': '파랑',
    'opt.sheet.ribbon.label': '리본 표시',
    'opt.sheet.ribbon.help': '위쪽의 장식용 리본입니다. 누르면 아무 일도 일어나지 않습니다. 리본 탭을 두 번 눌러도 접힙니다.',
    'sheet.who.user': '나',
    'sheet.who.assistant': 'GPT',
    'sheet.newChat': '새 대화',
    'sheet.newTab': '새 대화',
    'sheet.tabs.prev': '앞 탭',
    'sheet.tabs.next': '뒤 탭',
    'sheet.fx.placeholder': '메시지를 입력하거나 : 로 명령을 시작하세요',
    'sheet.ribbon.tabs': '파일|홈|삽입|페이지 레이아웃|수식|데이터|검토|보기|도움말',
    'sheet.ribbon.groups': '붙여넣기|글꼴|맞춤|표시 형식|스타일|편집',
    'sheet.ribbon.toggle': '두 번 누르면 리본을 접거나 폅니다',
    'sheet.status.ready': '준비',
    'sheet.status.input': '입력',
    'sheet.status.stream': '응답 중',
    'sheet.status.command': '명령',
    'sheet.status.broken': '원본으로 복귀함',
    'sheet.status.thinking': '생각 중',
    'sheet.status.drawing': '그리는 중',
    'sheet.status.cell': '셀 $1',
    'sheet.status.messages': '메시지 $1',
    'sheet.status.chars': '문자 $1',
    'sheet.zoom.in': '확대',
    'sheet.zoom.out': '축소',
    'sheet.thinking': '생각 중',
    'sheet.image': '[이미지 $1] — Ctrl+` 로 원본에서 봅니다',
    'sheet.nonText': '$1 — Ctrl+` 로 원본에서 봅니다',
    'opt.skin.choice.terminal': '터미널',
    'opt.enabled.label': 'ChatGPT 를 열면 바로 터미널로',
    'opt.enabled.help': '기본은 꺼짐 — 원본 UI 로 시작합니다. 툴바 아이콘이나 Ctrl+` 로 그때그때 켭니다.',

    'opt.onBreak.label': '전제가 깨졌을 때',
    'opt.onBreak.help': 'ChatGPT 내부 구조가 바뀌어 확장이 따라가지 못할 때의 처리.',
    'opt.onBreak.choice.warn': '터미널 유지 + 배지로 알림',
    'opt.onBreak.choice.revert': '원본 UI 로 자동 복귀',
    'opt.onBreak.choice.ignore': '무시 (콘솔에만 기록)',

    'opt.drift.threshold.label': '본문 대조 경고 임계값 (%)',
    'opt.drift.threshold.help': '스트림으로 받은 본문과 원본이 이만큼 넘게 어긋나면 경고합니다. 화면은 항상 원본 쪽으로 교정되므로 경고일 뿐입니다.',

    'opt.log.label': '콘솔 진단 로그',
    'opt.log.help': '개발자 콘솔에 [gpt-skin] 진단 줄을 남깁니다. :log off 로도 끕니다.',

    'cmd.reload.desc': '확장을 다시 읽고 이 탭을 새로고침합니다 (코드를 고친 뒤)',
    'cmd.reload.going': '확장을 다시 읽습니다. 탭이 곧 새로고침됩니다',
    'cmd.skin.desc': '스킨 — 인자 없으면 목록, :skin <이름> 으로 바꿉니다',
    'cmd.skin.state': '지금 스킨: $1 · 가능: $2',
    'cmd.skin.unknown': '알 수 없는 스킨입니다: $1 (가능: $2)',
    'cmd.skin.already': '이미 쓰고 있는 스킨입니다: $1',
    'cmd.skin.switched': '스킨을 바꿨습니다: $1',
    'none.placeholder': ':help 로 명령 목록 · esc 로 닫기',
    'cmd.skin.failed': '스킨을 바꾸지 못했습니다 ($1): $2',
    'cmd.hidden': '$1 은 지금 스킨($2)에서는 쓸 수 없는 명령입니다',
    'cmd.theme.desc': '테마 — 지금 스킨의 테마 목록에서 고릅니다',
    'cmd.theme.state': '지금 테마: $1 · 가능: $2',
    'cmd.theme.unknown': '알 수 없는 테마입니다: $1',
    'cmd.theme.none': '지금 스킨($1)에는 고를 테마가 없습니다',
    'cmd.log.desc': '콘솔 진단 로그 — :log [on|off]',
    'cmd.log.state.on': '콘솔 진단 로그: 켜짐 — :log off 로 끕니다',
    'cmd.log.state.off': '콘솔 진단 로그: 꺼짐 — :log on 으로 켭니다',
    'cmd.log.turnedOn': '콘솔 진단 로그를 켰습니다',
    'cmd.log.turnedOff': '콘솔 진단 로그를 껐습니다',
    'cmd.log.usage': ':log <on|off|toggle|dump [n]|clear>',
    'cmd.log.empty': '쌓인 진단 줄이 없습니다',
    'cmd.log.dumped': '진단 줄 $1개 (버퍼에 $2개)',
    'cmd.log.cleared': '진단 줄 $1개를 비웠습니다 (화면에서 $2줄을 걷어냈습니다)',

    'opt.sidebar.visible.label': '대화 목록 표시',
    'opt.sidebar.visible.help': 'Ctrl+B 로도 토글합니다.',
    'opt.sidebar.width.label': '폭 (ch)',
    'opt.sidebar.closeOnOpen.label': '대화를 열면 목록 닫기',
    'opt.sidebar.closeOnOpen.help': '원본과 같은 동작입니다. 목록이 본문 위에 떠 있으므로 고르고 나면 비켜 줍니다. ≡ 로 다시 엽니다.',
    'opt.sidebar.groups.label': '고정·프로젝트 그룹 표시',
    'opt.sidebar.minColumns.label': '이보다 좁으면 처음에 접어둠 (칸)',
    'opt.sidebar.minColumns.help': '0 이면 항상 표시합니다. 목록은 본문 위에 덮이므로 좁은 창에서는 기본값을 접어 둡니다. 손잡이로 열면 폭과 무관하게 열립니다.',

    'opt.terminal.theme.label': '테마',
    'opt.font.family.label': '폰트',
    'opt.font.family.help': '설치돼 있지 않으면 뒤쪽 스택으로 폴백합니다.',
    'opt.font.size.label': '글자 크기 (px)',
    'opt.line.height.label': '줄 간격',
    'opt.wrap.columns.label': '본문 최대 너비 (ch)',
    'opt.wrap.columns.help': '0 이면 창 전체 너비.',
    'opt.citations.label': '검색 인용 표시',
    'opt.citations.help': '누르면 출처로 갑니다. 도메인을 같이 보여주면 어디로 가는지 눌러 보기 전에 알 수 있습니다.',
    'opt.citations.choice.domain': '번호 + 도메인 — [1 zdnet.co.kr]',
    'opt.citations.choice.number': '번호만 — [1]',
    'opt.citations.choice.off': '표시하지 않음',

    'opt.image.label': '생성된 이미지',
    'opt.image.help': '문자 블록은 터미널답지만 좁게 그리면 알아보기 어렵습니다.',
    'opt.image.choice.inline': '그림으로 — 문자 격자에 맞춰 띄웁니다',
    'opt.image.choice.blocks': '문자 블록으로 — ▀ 로 그립니다',
    'opt.image.choice.off': '한 줄 안내만',
    'opt.image.columns.label': '이미지 폭 (ch)',
    'opt.image.columns.help': '문자 몇 칸 너비로 그릴지 정합니다.',
    'img.placeholder': '$1 · $2 — ^` 로 원본에서 봅니다',
    'img.loading': '이미지를 불러옵니다…',
    'img.failed': '이미지 주소를 받지 못했습니다 — ^` 로 원본에서 봅니다',
    'img.alt': '생성된 이미지',
    'img.drawing': '그림을 만드는 중',

    'opt.gutter.markers.label': '응답 왼쪽 세로 바',
    'opt.scanlines.label': '스캔라인',
    'opt.scanlines.help': 'crt-green 테마에서만 권장.',

    'opt.cursor.style.label': '커서 모양',
    'opt.cursor.blink.label': '커서 깜빡임',
    'opt.timestamps.label': '타임스탬프',
    'opt.timestamps.choice.relative': '상대 (3분 전)',
    'opt.timestamps.choice.absolute': '절대 (14:22:01)',
    'opt.timestamps.choice.off': '끄기',
    'opt.bell.label': '응답 완료 알림',
    'opt.bell.choice.visual': '상태줄 플래시',
    'opt.bell.choice.off': '끄기',

    // 설정 화면 자체의 문구
    'opt.ui.saved': '저장됨 $1',
    'opt.ui.dirty': '기본값과 다른 항목 $1개',
    'opt.ui.allDefault': '전부 기본값',
    'opt.ui.default': '기본값: $1',
    'opt.ui.empty': '(빈 값)',
    'opt.ui.resetAll': '전체 기본값으로',
    'opt.ui.syncNote': '모든 기기에 동기화됩니다',
    'opt.ui.sections': 'SECTIONS'
  },

  en: {
    'opt.section.skin': 'Skin',
    'opt.section.behavior': 'Behavior',
    'opt.section.sidebar': 'Sidebar',
    'opt.section.display': 'Display',
    'opt.section.cursor': 'Cursor & alerts',

    'opt.locale.label': 'Language',
    'opt.locale.help': 'Auto follows your browser language. Changes apply immediately.',
    'opt.locale.choice.auto': 'Auto',
    'opt.locale.choice.ko': '한국어',
    'opt.locale.choice.en': 'English',

    'opt.skin.label': 'Skin',
    'opt.skin.help': 'Which interface to lay over ChatGPT. Changes apply to open ChatGPT tabs right away. Sheet shows the chat as a spreadsheet. No skin keeps the original screen and opens only a command line with Ctrl+;.',
    'opt.skin.choice.none': 'No skin (commands only)',
    'popup.skin.label': 'Skin',
    'popup.tab.label': 'Turn the skin on in this tab',
    'popup.default.label': 'Start ChatGPT in the skin',
    'popup.default.help': 'Off starts with the original UI.',
    'opt.skin.choice.sheet': 'Sheet (spreadsheet)',
    'opt.sheet.theme.label': 'Sheet color',
    'opt.sheet.theme.choice.green': 'Green',
    'opt.sheet.theme.choice.blue': 'Blue',
    'opt.sheet.ribbon.label': 'Show ribbon',
    'opt.sheet.ribbon.help': 'The decorative ribbon at the top. Clicking it does nothing. Double-click the ribbon tabs to fold it too.',
    'sheet.who.user': 'You',
    'sheet.who.assistant': 'GPT',
    'sheet.newChat': 'New chat',
    'sheet.newTab': 'New chat',
    'sheet.tabs.prev': 'Previous tabs',
    'sheet.tabs.next': 'Next tabs',
    'sheet.fx.placeholder': 'Type a message, or start a command with :',
    'sheet.ribbon.tabs': 'File|Home|Insert|Page Layout|Formulas|Data|Review|View|Help',
    'sheet.ribbon.groups': 'Paste|Font|Alignment|Number|Styles|Editing',
    'sheet.ribbon.toggle': 'Double-click to fold or unfold the ribbon',
    'sheet.status.ready': 'Ready',
    'sheet.status.input': 'Enter',
    'sheet.status.stream': 'Answering',
    'sheet.status.command': 'Command',
    'sheet.status.broken': 'Back to original',
    'sheet.status.thinking': 'Thinking',
    'sheet.status.drawing': 'Drawing',
    'sheet.status.cell': 'Cell $1',
    'sheet.status.messages': 'Messages $1',
    'sheet.status.chars': 'Characters $1',
    'sheet.zoom.in': 'Zoom in',
    'sheet.zoom.out': 'Zoom out',
    'sheet.thinking': 'Thinking',
    'sheet.image': '[Image $1] — press Ctrl+` to view it in the original',
    'sheet.nonText': '$1 — press Ctrl+` to view it in the original',
    'opt.skin.choice.terminal': 'Terminal',
    'opt.enabled.label': 'Start in the terminal on ChatGPT',
    'opt.enabled.help': 'Off by default — starts with the original UI. Turn it on per tab from the toolbar icon or Ctrl+`.',

    'opt.onBreak.label': 'When an assumption breaks',
    'opt.onBreak.help': "What to do when ChatGPT's internals change and the extension can no longer follow.",
    'opt.onBreak.choice.warn': 'Stay in the terminal, warn on the badge',
    'opt.onBreak.choice.revert': 'Fall back to the original UI',
    'opt.onBreak.choice.ignore': 'Ignore (console only)',

    'opt.drift.threshold.label': 'Drift warning threshold (%)',
    'opt.drift.threshold.help': 'Warn when the streamed text differs from the original by more than this. The display is always corrected to the original, so this is only a warning.',

    'opt.log.label': 'Console diagnostics',
    'opt.log.help': 'Writes [gpt-skin] diagnostic lines to the developer console. :log off turns it off too.',

    'cmd.reload.desc': 'Reload the extension and this tab (after editing code)',
    'cmd.reload.going': 'Reloading the extension. This tab will refresh shortly',
    'cmd.skin.desc': 'Skin — lists skins, or :skin <name> to change',
    'cmd.skin.state': 'Current skin: $1 · available: $2',
    'cmd.skin.unknown': 'Unknown skin: $1 (available: $2)',
    'cmd.skin.already': 'Already using this skin: $1',
    'cmd.skin.switched': 'Switched skin: $1',
    'none.placeholder': ':help for commands · esc to close',
    'cmd.skin.failed': 'Could not switch skin ($1): $2',
    'cmd.hidden': '$1 is not available in the current skin ($2)',
    'cmd.theme.desc': 'Theme — pick from the current skin\'s themes',
    'cmd.theme.state': 'Current theme: $1 · available: $2',
    'cmd.theme.unknown': 'Unknown theme: $1',
    'cmd.theme.none': 'The current skin ($1) has no themes to pick',
    'cmd.log.desc': 'Console diagnostics — :log [on|off]',
    'cmd.log.state.on': 'Console diagnostics: on — :log off to turn off',
    'cmd.log.state.off': 'Console diagnostics: off — :log on to turn on',
    'cmd.log.turnedOn': 'Console diagnostics turned on',
    'cmd.log.turnedOff': 'Console diagnostics turned off',
    'cmd.log.usage': ':log <on|off|toggle|dump [n]|clear>',
    'cmd.log.empty': 'No diagnostic lines buffered',
    'cmd.log.dumped': '$1 lines ($2 in buffer)',
    'cmd.log.cleared': 'Cleared $1 buffered lines ($2 removed from the screen)',

    'opt.sidebar.visible.label': 'Show chat list',
    'opt.sidebar.visible.help': 'Ctrl+B toggles it too.',
    'opt.sidebar.width.label': 'Width (ch)',
    'opt.sidebar.closeOnOpen.label': 'Close the list after opening a chat',
    'opt.sidebar.closeOnOpen.help': 'Same as the original. The list floats over the thread, so it steps aside once you pick. Reopen with ≡.',
    'opt.sidebar.groups.label': 'Show pinned and project groups',
    'opt.sidebar.minColumns.label': 'Collapse initially below this width (columns)',
    'opt.sidebar.minColumns.help': '0 always shows it. The list overlays the thread, so it starts collapsed in narrow windows. The handle opens it regardless of width.',

    'opt.terminal.theme.label': 'Theme',
    'opt.font.family.label': 'Font',
    'opt.font.family.help': 'Falls back through the stack if not installed.',
    'opt.font.size.label': 'Font size (px)',
    'opt.line.height.label': 'Line height',
    'opt.wrap.columns.label': 'Max text width (ch)',
    'opt.wrap.columns.help': '0 uses the full window width.',
    'opt.citations.label': 'Search citations',
    'opt.citations.help': 'Citations link to the source. Showing the domain tells you where it goes before you click.',
    'opt.citations.choice.domain': 'Number + domain — [1 zdnet.co.kr]',
    'opt.citations.choice.number': 'Number only — [1]',
    'opt.citations.choice.off': 'Hide',

    'opt.image.label': 'Generated images',
    'opt.image.help': 'Character blocks fit the terminal but get hard to read when narrow.',
    'opt.image.choice.inline': 'As pictures — fitted to the character grid',
    'opt.image.choice.blocks': 'As character blocks — drawn with ▀',
    'opt.image.choice.off': 'A single note only',
    'opt.image.columns.label': 'Image width (ch)',
    'opt.image.columns.help': 'How many character cells wide to draw.',
    'img.placeholder': '$1 · $2 — ^` to view in the original UI',
    'img.loading': 'Loading image…',
    'img.failed': 'Could not get the image address — ^` to view in the original UI',
    'img.alt': 'Generated image',
    'img.drawing': 'Drawing',

    'opt.gutter.markers.label': 'Vertical bar beside replies',
    'opt.scanlines.label': 'Scanlines',
    'opt.scanlines.help': 'Recommended only with the crt-green theme.',

    'opt.cursor.style.label': 'Cursor shape',
    'opt.cursor.blink.label': 'Cursor blink',
    'opt.timestamps.label': 'Timestamps',
    'opt.timestamps.choice.relative': 'Relative (3 min ago)',
    'opt.timestamps.choice.absolute': 'Absolute (14:22:01)',
    'opt.timestamps.choice.off': 'Off',
    'opt.bell.label': 'Reply-complete alert',
    'opt.bell.choice.visual': 'Flash the status line',
    'opt.bell.choice.off': 'Off',

    'opt.ui.saved': 'Saved $1',
    'opt.ui.dirty': '$1 changed from default',
    'opt.ui.allDefault': 'All at defaults',
    'opt.ui.default': 'Default: $1',
    'opt.ui.empty': '(empty)',
    'opt.ui.resetAll': 'Reset all to defaults',
    'opt.ui.syncNote': 'Synced across your devices',
    'opt.ui.sections': 'SECTIONS'
  }
};

var GT_LOCALES = Object.keys(GT_I18N);
var GT_LOCALE_FALLBACK = 'ko';

// 브라우저 언어에서 우리가 가진 로케일을 고른다. 없으면 폴백.
var GT_PICK_LOCALE = function (want) {
  if (want && want !== 'auto' && GT_I18N[want]) return want;
  var nav = (typeof navigator !== 'undefined' && navigator.language) || '';
  var base = String(nav).toLowerCase().split('-')[0];
  return GT_I18N[base] ? base : GT_LOCALE_FALLBACK;
};

// 지금 로케일. 설정을 읽을 수 없는 문맥(MAIN world 등)에서도 동작해야 하므로
// 여기서는 값을 들고만 있고, 갱신은 config 를 아는 쪽이 한다.
var GT_LOCALE = GT_PICK_LOCALE(null);
var GT_SET_LOCALE = function (want) { GT_LOCALE = GT_PICK_LOCALE(want); return GT_LOCALE; };

// 사전에서 꺼내 $1 $2 … 를 채운다.
//
// 키가 없으면 키를 그대로 돌려준다. 빈 문자열을 돌려주면 화면에서 조용히 사라져
// 무엇이 빠졌는지 알 수 없다 — 키가 보이면 바로 눈에 띈다.
var GT_T = function (key) {
  var args = Array.prototype.slice.call(arguments, 1);
  var dict = GT_I18N[GT_LOCALE] || GT_I18N[GT_LOCALE_FALLBACK] || {};
  var s = dict[key];
  if (typeof s !== 'string') s = (GT_I18N[GT_LOCALE_FALLBACK] || {})[key];
  if (typeof s !== 'string') return key;
  return s.replace(/\$(\d+)/g, function (m, n) {
    var v = args[Number(n) - 1];
    return v === undefined || v === null ? m : String(v);
  });
};
