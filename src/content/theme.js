// gpt-skin — 테마. CSS 변수 한 벌이 곧 테마다(08 아트보드).
// 문자열로 들고 있는 이유: 페이지 CSP 와 무관하게 shadow root 안에 직접 넣기 위해서다.
GT.theme = (function () {
  'use strict';

  const THEMES = {
    'modern-dark': {
      '--gt-bg-0': '#010409', '--gt-bg-1': '#0d1117', '--gt-bg-2': '#161b22', '--gt-bg-3': '#21262d',
      '--gt-border': '#30363d', '--gt-fg': '#c9d1d9', '--gt-fg-dim': '#8b949e', '--gt-fg-faint': '#484f58',
      '--gt-green': '#3fb950', '--gt-magenta': '#bc8cff', '--gt-cyan': '#39c5cf',
      '--gt-yellow': '#d29922', '--gt-red': '#f85149', '--gt-blue': '#58a6ff'
    },
    'crt-green': {
      '--gt-bg-0': '#000804', '--gt-bg-1': '#000f04', '--gt-bg-2': '#04220f', '--gt-bg-3': '#0d5525',
      '--gt-border': '#143d21', '--gt-fg': '#33ff66', '--gt-fg-dim': '#1f9e42', '--gt-fg-faint': '#0d5525',
      '--gt-green': '#33ff66', '--gt-magenta': '#33ff66', '--gt-cyan': '#7dffa8',
      '--gt-yellow': '#b6ff4d', '--gt-red': '#ff5f5f', '--gt-blue': '#7dffa8'
    },
    amber: {
      '--gt-bg-0': '#0d0900', '--gt-bg-1': '#150e00', '--gt-bg-2': '#241900', '--gt-bg-3': '#3d2b00',
      '--gt-border': '#3d2b00', '--gt-fg': '#ffb000', '--gt-fg-dim': '#c98700', '--gt-fg-faint': '#7a5200',
      '--gt-green': '#ffb000', '--gt-magenta': '#ffcf5c', '--gt-cyan': '#ffcf5c',
      '--gt-yellow': '#ffd88a', '--gt-red': '#ff6b3d', '--gt-blue': '#ffcf5c'
    }
  };

  const CSS = `
:host { all: initial; }
* { box-sizing: border-box; }
.gt-root {
  position: fixed; inset: 0; z-index: 2147483000;
  display: flex; flex-direction: column;
  background: var(--gt-bg-1); color: var(--gt-fg);
  font-family: var(--gt-font); font-size: var(--gt-size); line-height: var(--gt-lh);
  -webkit-font-smoothing: antialiased;
}
.gt-root[hidden] { display: none; }
.gt-scanlines::after {
  content: ''; position: absolute; inset: 0; pointer-events: none; z-index: 5;
  background: repeating-linear-gradient(to bottom, rgba(0,0,0,0.18) 0 1px, transparent 1px 3px);
}
.gt-spacer { flex: 1; }
.gt-dim { color: var(--gt-fg-dim); }
.gt-faint { color: var(--gt-fg-faint); }

/* ---- chrome ---- */
.gt-topbar {
  display: flex; align-items: center; gap: 16px; height: 34px; padding: 0 14px; flex: 0 0 auto;
  background: var(--gt-bg-2); border-bottom: 1px solid var(--gt-bg-3);
  font-size: 11.5px; color: var(--gt-fg-faint);
}
.gt-burger {
  display: flex; align-items: center; justify-content: center;
  width: 22px; height: 20px; padding: 0; margin-right: -4px;
  background: none; border: 1px solid transparent; color: var(--gt-fg-faint);
  cursor: pointer; flex: 0 0 auto; border-radius: 0;
}
.gt-burger:hover { color: var(--gt-fg); border-color: var(--gt-bg-3); }
.gt-burger:active { background: var(--gt-bg-3); }
.gt-burger[data-open="1"] { color: var(--gt-green); }
.gt-burger:focus-visible { outline: 1px solid var(--gt-green); outline-offset: 0; }
.gt-sb-close { color: var(--gt-fg-faint); cursor: pointer; padding: 0 2px; font-size: 13px; line-height: 1; }
.gt-sb-close:hover { color: var(--gt-fg); }

.gt-dot { width: 8px; height: 8px; display: block; background: var(--gt-green); }
.gt-dot[data-state="stream"] { background: var(--gt-cyan); }
.gt-dot[data-state="broken"] { background: var(--gt-red); }
.gt-effort[data-pending="1"] { color: var(--gt-cyan); }

.gt-title { flex: 1; text-align: center; color: var(--gt-fg-dim);
  overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.gt-tabbar {
  display: flex; align-items: stretch; height: 30px; flex: 0 0 auto;
  border-bottom: 1px solid var(--gt-bg-3); font-size: 12px;
}
.gt-tab { display: flex; align-items: center; gap: 8px; padding: 0 14px;
  border-right: 1px solid var(--gt-bg-3); color: var(--gt-fg-faint); }
.gt-tab[data-active="1"] { color: var(--gt-fg); box-shadow: inset 0 -2px 0 var(--gt-green); }

/* ---- 사이드바 ---- */
/* 본문을 밀어내지 않고 그 위에 덮는다(원본과 같은 동작).
   목록을 여닫을 때 본문이 리플로우되면 읽던 자리가 흔들린다. */
.gt-middle { flex: 1; display: flex; min-height: 0; position: relative; }
.gt-sidebar {
  position: absolute; left: 0; top: 0; bottom: 0; z-index: 4;
  width: var(--gt-sb-w); display: flex; flex-direction: column;
  min-height: 0; background: var(--gt-bg-0); border-right: 1px solid var(--gt-border);
  box-shadow: 6px 0 18px rgba(1, 4, 9, 0.55);
  font-size: 12.5px;
}
.gt-sb-topline {
  display: flex; align-items: center; gap: 8px; padding: 6px 12px; flex: 0 0 auto;
  color: var(--gt-fg-faint); font-size: 11px; letter-spacing: 0.08em;
  border-bottom: 1px solid var(--gt-bg-3);
}
.gt-sb-hint { letter-spacing: 0; }
.gt-sb-filter { display: flex; align-items: center; gap: 8px; padding: 5px 12px; flex: 0 0 auto;
  background: var(--gt-bg-2); border-bottom: 1px solid var(--gt-bg-3); color: var(--gt-magenta); }
.gt-sb-filter[hidden] { display: none; }
.gt-sb-filter input { flex: 1; background: transparent; border: 0; outline: 0;
  color: var(--gt-fg); font: inherit; }
.gt-sb-list { flex: 1; overflow-y: auto; overflow-x: hidden; padding: 6px 0; }
.gt-sb-head { display: flex; align-items: center; gap: 6px; padding: 8px 12px 3px;
  color: var(--gt-cyan); font-size: 11px; cursor: default; }
.gt-sb-head:hover { color: var(--gt-fg); }
.gt-sb-caret { flex: 0 0 auto; color: var(--gt-fg-faint); }
.gt-sb-headlabel { flex: 1; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.gt-sb-count { flex: 0 0 auto; color: var(--gt-fg-faint); }
.gt-sb-more { display: flex; align-items: center; gap: 8px; padding: 6px 12px; margin-top: 4px;
  color: var(--gt-fg-faint); font-size: 11.5px; border-top: 1px dashed var(--gt-bg-3); cursor: default; }
.gt-sb-more:hover { color: var(--gt-fg-dim); background: var(--gt-bg-2); }
.gt-sb-note { padding: 6px 12px; color: var(--gt-yellow); font-size: 11px; }
.gt-sb-row { display: flex; align-items: center; gap: 6px; padding: 2px 12px; cursor: default; }
.gt-sb-row:hover { background: var(--gt-bg-2); }
.gt-sb-row[data-sel="1"] { background: var(--gt-bg-3); }
.gt-sb-row[data-cur="1"] { box-shadow: inset 2px 0 0 var(--gt-green); }
.gt-sb-mark { color: var(--gt-green); flex: 0 0 auto; width: 8px; }
.gt-sb-title { flex: 1; color: var(--gt-fg-dim); overflow: hidden;
  text-overflow: ellipsis; white-space: nowrap; }
.gt-sb-row[data-cur="1"] .gt-sb-title { color: var(--gt-fg); }
.gt-sb-pin { color: var(--gt-yellow); flex: 0 0 auto; }
/* 보이지 않는 동안에는 클릭도 받지 않는다.
   opacity:0 만 주면 자리는 그대로 차지한 채 클릭을 가로챈다 —
   행 오른쪽을 눌렀는데 대화가 안 열리고 메뉴가 뜨는 원인이었다. */
.gt-sb-dots { color: var(--gt-fg-faint); flex: 0 0 auto; padding: 0 2px;
  opacity: 0; pointer-events: none; cursor: default; }
.gt-sb-row:hover .gt-sb-dots { opacity: 1; pointer-events: auto; }
.gt-sb-dots:hover { color: var(--gt-fg); }
.gt-ctx {
  position: absolute; z-index: 12; min-width: 176px;
  background: var(--gt-bg-1); border: 1px solid var(--gt-border);
  box-shadow: 0 12px 32px rgba(1,4,9,0.75); padding: 4px 0; font-size: 12.5px;
}
.gt-ctx-item { padding: 4px 12px; color: var(--gt-fg-dim); cursor: default; white-space: nowrap; }
.gt-ctx-item:hover { background: var(--gt-bg-3); color: var(--gt-fg); }
.gt-ctx-item[data-danger="1"] { color: var(--gt-red); }
.gt-ctx-item[data-current="1"] { color: var(--gt-fg); }
.gt-ctx-item { display: flex; gap: 14px; }
.gt-ctx-hint { margin-left: auto; color: var(--gt-green); }
.gt-effort { cursor: default; }
.gt-effort:hover { color: var(--gt-fg); }
.gt-ctx-item[data-armed="1"] { background: var(--gt-red); color: var(--gt-bg-1); }
.gt-ctx-note { padding: 6px 12px 2px; margin-top: 4px; border-top: 1px solid var(--gt-bg-3);
  color: var(--gt-fg-faint); font-size: 11px; }
.gt-sb-empty { padding: 10px 12px; color: var(--gt-fg-faint); font-size: 11.5px; }
.gt-sb-foot { display: flex; align-items: center; gap: 8px; padding: 5px 12px; flex: 0 0 auto;
  border-top: 1px solid var(--gt-bg-3); color: var(--gt-fg-faint); font-size: 11px; }
.gt-sb-check { flex: 0 0 auto; color: var(--gt-fg-faint); }
.gt-sb-row[data-checked="1"] { background: var(--gt-bg-2); }
.gt-sb-row[data-checked="1"] .gt-sb-check { color: var(--gt-green); }
.gt-sb-row[data-checked="1"] .gt-sb-title { color: var(--gt-fg); }
.gt-sb-act { cursor: default; padding: 1px 6px; border: 1px solid var(--gt-bg-3); color: var(--gt-fg-dim); }
.gt-sb-act:hover { color: var(--gt-fg); border-color: var(--gt-border); }
.gt-sb-act.danger { color: var(--gt-red); }
.gt-sb-act.danger:hover { background: var(--gt-red); color: var(--gt-bg-1); border-color: var(--gt-red); }
.gt-sb-warn { color: var(--gt-red); }
.gt-sb-busy { color: var(--gt-cyan); }
.gt-sb-resize {
  position: absolute; top: 0; right: -3px; bottom: 0; width: 6px;
  cursor: col-resize; z-index: 5;
}
.gt-sb-resize:hover { background: var(--gt-cyan); opacity: 0.35; }
.gt-sb-src[data-stale="1"] { color: var(--gt-yellow); }
.gt-sb-src[data-bad="1"] { color: var(--gt-red); }

/* ---- scrollback ---- */
.gt-scroll { flex: 1; min-width: 0; overflow-y: auto; overflow-x: hidden; padding: 22px 28px 8px; }
.gt-turn { display: flex; flex-direction: column; gap: 4px; margin-bottom: 20px; }
.gt-meta { display: flex; gap: 10px; font-size: 11.5px; color: var(--gt-fg-faint); align-items: center; }
.gt-user-line { display: flex; gap: 10px; }
.gt-prompt-mark { color: var(--gt-green); flex: 0 0 auto; }
.gt-assistant { display: flex; gap: 14px; }
.gt-gutter { width: 2px; flex: 0 0 auto; background: var(--gt-magenta); opacity: 0.55; }
.gt-gutter[data-streaming="1"] { background: var(--gt-cyan); opacity: 1; }
.gt-body { display: flex; flex-direction: column; gap: 10px; min-width: 0; max-width: var(--gt-wrap); }

.gt-thinking { display: flex; align-items: center; gap: 10px; font-size: 11.5px;
  color: var(--gt-fg-faint); padding: 2px 0 2px 16px; }

/* ---- markdown ---- */
.gt-p { white-space: pre-wrap; word-break: break-word; }
.gt-h { font-weight: 700; color: #fff; }
.gt-h1 { font-size: 1.18em; } .gt-h2 { font-size: 1.1em; } .gt-h3 { font-size: 1.04em; }
.gt-hr { border-top: 1px solid var(--gt-bg-3); }
.gt-li { display: flex; gap: 12px; }
.gt-li-d1 { padding-left: 18px; } .gt-li-d2 { padding-left: 36px; } .gt-li-d3 { padding-left: 54px; }
.gt-li-d1 .gt-li-body, .gt-li-d2 .gt-li-body, .gt-li-d3 .gt-li-body { color: var(--gt-fg-dim); }
.gt-bullet { color: var(--gt-yellow); flex: 0 0 auto; }
.gt-li-body { white-space: pre-wrap; word-break: break-word; }
.gt-quote { display: flex; gap: 12px; }
.gt-quote-bar { width: 2px; flex: 0 0 auto; background: var(--gt-border); }
.gt-quote-body { color: var(--gt-fg-dim); display: flex; flex-direction: column; gap: 8px; }
.gt-code-inline { color: var(--gt-cyan); background: var(--gt-bg-2); padding: 1px 5px; }
.gt-strong { font-weight: 700; color: #fff; }
.gt-em { font-style: italic; }
.gt-link { color: var(--gt-blue); text-decoration: none; }
.gt-link:hover { text-decoration: underline; }
.gt-table { border-collapse: collapse; font-size: 0.96em; }
.gt-table th, .gt-table td { border: 1px solid var(--gt-bg-3); padding: 3px 10px; text-align: left; }
.gt-table th { color: var(--gt-fg); font-weight: 500; }
.gt-table td { color: var(--gt-fg-dim); }

/* ---- code block ---- */
.gt-code { border: 1px solid var(--gt-border); background: var(--gt-bg-0); }
.gt-code-head, .gt-code-foot {
  display: flex; align-items: center; gap: 16px; padding: 5px 12px;
  font-size: 11px; color: var(--gt-fg-faint);
}
.gt-code-head { background: var(--gt-bg-2); border-bottom: 1px solid var(--gt-bg-3); }
.gt-code-foot { border-top: 1px solid var(--gt-bg-3); }
.gt-code-lang { color: var(--gt-cyan); }
.gt-code-body { display: flex; padding: 9px 0; font-size: 0.96em; overflow-x: auto; }
.gt-code-gutter { display: flex; flex-direction: column; align-items: flex-end;
  color: var(--gt-border); padding: 0 12px; flex: 0 0 auto; user-select: none; }
.gt-code-text { margin: 0; font: inherit; white-space: pre; color: var(--gt-fg); }
.gt-key { color: var(--gt-fg-dim); }
.gt-key-hint { color: var(--gt-fg-faint); }

/* ---- 상태줄의 로그 표시 ---- */
.gt-log-state[data-on="0"] { color: var(--gt-fg-faint); }
.gt-log-state[data-on="1"] { color: var(--gt-green); }

/* ---- 생각 중 ---- */
.gt-turn-thinking { padding: 2px 0; }
.gt-thinking-live {
  display: flex; align-items: center; gap: 8px;
  color: var(--gt-cyan); font-size: 0.96em;
}
.gt-thinking-label { color: var(--gt-fg-dim); }
/* 커서는 답할 때 본문 끝에 뜨는 것과 같은 요소다. 여기서는 라벨에 바짝 붙인다. */
.gt-thinking-live .gt-cursor { margin-left: 0; }

/* ---- 화면에만 있는 블록 (:messup) ---- */
.gt-turn-local { opacity: 0.92; }
.gt-turn-local .gt-assistant { border-left: 1px dashed var(--gt-yellow); padding-left: 10px; }

/* ---- 인용 ---- */
/* 번호 자체가 링크다. 하단 출처 목록은 두지 않는다. */
.gt-cite {
  color: var(--gt-cyan); font-size: 0.78em; vertical-align: super; line-height: 0;
  padding: 0 1px; user-select: none;
}
/* 도메인까지 보일 때는 위첨자로 얹지 않는다 — 작아서 못 읽는다. 본문 줄에 눕힌다. */
.gt-cite[data-wide] {
  font-size: 0.88em; vertical-align: baseline; line-height: inherit;
  padding: 0 2px; white-space: nowrap;
}
.gt-cite-link { color: inherit; text-decoration: none; }
.gt-cite-link:hover { text-decoration: underline; }
.gt-cite-link:focus-visible { outline: 1px solid var(--gt-cyan); outline-offset: 1px; }

/* ---- 복사 버튼 ---- */
.gt-copy {
  display: inline-flex; align-items: center; justify-content: center;
  width: 21px; height: 21px; padding: 0; flex: 0 0 auto;
  color: var(--gt-fg-faint); background: transparent;
  border: 1px solid var(--gt-border); border-radius: 3px; cursor: pointer;
  opacity: 0.55; transition: opacity 90ms linear, color 90ms linear, border-color 90ms linear;
}
.gt-copy svg { display: block; }
.gt-copy:hover { opacity: 1; color: var(--gt-fg); border-color: var(--gt-fg-faint); }
.gt-copy:focus-visible { opacity: 1; outline: 1px solid var(--gt-cyan); outline-offset: 1px; }
.gt-copy[data-state="ok"] { opacity: 1; color: var(--gt-green); border-color: var(--gt-green); }
.gt-copy[data-state="fail"] { opacity: 1; color: var(--gt-red); border-color: var(--gt-red); }
/* 메타줄의 버튼은 마우스를 올렸을 때만 눈에 띈다. 스크롤백이 시끄러워지면 안 된다.
   안 보일 때는 pointer-events 도 끊는다 — 투명한 채로 클릭을 먹으면 안 된다. */
.gt-meta .gt-copy { opacity: 0; pointer-events: none; }
.gt-turn:hover .gt-meta .gt-copy,
.gt-meta .gt-copy:focus-visible,
.gt-meta .gt-copy[data-state] { opacity: 0.55; pointer-events: auto; }
.gt-turn:hover .gt-meta .gt-copy:hover,
.gt-meta .gt-copy[data-state] { opacity: 1; }

/* ---- 시스템 출력 ---- */
.gt-sys { display: flex; gap: 12px; font-size: 0.96em; }
.gt-sys-tag { width: 62px; flex: 0 0 auto; }
.gt-sys[data-level="error"] .gt-sys-tag, .gt-sys[data-level="error"] .gt-sys-body { color: var(--gt-red); }
.gt-sys[data-level="warn"] .gt-sys-tag, .gt-sys[data-level="warn"] .gt-sys-body { color: var(--gt-yellow); }
.gt-sys[data-level="info"] .gt-sys-tag { color: var(--gt-fg-faint); }
.gt-sys[data-level="info"] .gt-sys-body { color: var(--gt-fg-dim); }
.gt-sys-body { white-space: pre-wrap; }
.gt-placeholder { border: 1px dashed var(--gt-border); padding: 9px 12px; display: flex;
  align-items: center; gap: 12px; color: var(--gt-fg-dim); }

.gt-suggest { display: flex; align-items: center; gap: 12px; padding: 0 0 6px;
  font-size: 11.5px; color: var(--gt-fg-faint); flex-wrap: wrap; }
.gt-suggest[hidden] { display: none; }
.gt-suggest-item { color: var(--gt-fg-dim); }
.gt-suggest-item[data-first="1"] { color: var(--gt-cyan); }
.gt-suggest-more, .gt-suggest-hint { color: var(--gt-fg-faint); }

/* ---- 이미지 ---- */
.gt-img { margin: 10px 0 4px; }
.gt-img-pic {
  display: block; max-width: 100%; border: 1px solid var(--gt-bg-3);
  image-rendering: auto;
}
/* 문자 블록. 셀은 폭 1ch · 높이 2ch — 그러면 픽셀 하나가 정사각형이 된다.
   inline-block 으로 폭을 못 박지 않으면 글리프 advance 만큼만 차지해 세로 틈이 생긴다. */
.gt-img-blocks { display: inline-block; border: 1px solid var(--gt-bg-3); font-size: 1em; }
.gt-img-row { height: 2ch; line-height: 2ch; white-space: nowrap; }
.gt-img-blocks i {
  display: inline-block; width: 1ch; height: 2ch; line-height: 2ch;
  font-style: normal; overflow: hidden; vertical-align: top;
}
.gt-img-foot {
  display: flex; gap: 8px; align-items: baseline;
  margin-top: 5px; font-size: 0.9em; color: var(--gt-fg-dim);
}

/* ---- 스크롤바 ---- */
/*
 * 기본 스크롤바는 둥글고 반투명한 알약이라 터미널 위에서 혼자 겉돈다.
 * 특히 입력줄에서 눈에 걸렸다. 스크롤이 있는 모든 곳을 각진 막대로 통일한다.
 *
 * track 은 투명하게 둔다. 홈이 파여 보이면 창이 세로로 갈린 것처럼 보인다.
 * 색은 테두리와 같은 --gt-bg-3 — 있다는 건 알겠고 읽는 데 방해가 안 되는 세기다.
 *
 * ::-webkit-scrollbar 만 쓴다. 표준 속성(scrollbar-width/color)을 같이 적으면
 * Chrome 121+ 는 그쪽을 먼저 보고 아래 규칙을 통째로 무시한다 — 모양을 우리가
 * 정하지 못하게 된다. 스크롤백에서 이미 동작을 확인한 방식이 이것이다.
 *
 * 규칙을 지정하는 것 자체가 macOS 의 오버레이(떠 있다 사라지는 알약) 대신
 * 자리를 차지하는 스크롤바를 쓰게 만든다. 입력줄이 튀어 보였던 이유가 이것이다 —
 * 스크롤백에는 규칙이 있었고 입력줄에는 없었다.
 */
.gt-scroll::-webkit-scrollbar,
.gt-sb-list::-webkit-scrollbar,
.gt-input::-webkit-scrollbar,
.gt-palette-list::-webkit-scrollbar,
.gt-code-body::-webkit-scrollbar { width: 6px; height: 6px; }
.gt-scroll::-webkit-scrollbar-track,
.gt-sb-list::-webkit-scrollbar-track,
.gt-input::-webkit-scrollbar-track,
.gt-palette-list::-webkit-scrollbar-track,
.gt-code-body::-webkit-scrollbar-track { background: transparent; }
.gt-scroll::-webkit-scrollbar-thumb,
.gt-sb-list::-webkit-scrollbar-thumb,
.gt-input::-webkit-scrollbar-thumb,
.gt-palette-list::-webkit-scrollbar-thumb,
.gt-code-body::-webkit-scrollbar-thumb { background: var(--gt-bg-3); border-radius: 0; }
.gt-scroll::-webkit-scrollbar-thumb:hover,
.gt-sb-list::-webkit-scrollbar-thumb:hover,
.gt-input::-webkit-scrollbar-thumb:hover,
.gt-palette-list::-webkit-scrollbar-thumb:hover,
.gt-code-body::-webkit-scrollbar-thumb:hover { background: var(--gt-fg-faint); }
/* 두 스크롤바가 만나는 모서리에 기본 회색 사각형이 남는다. 지운다. */
.gt-code-body::-webkit-scrollbar-corner { background: transparent; }

/* ---- composer ---- */
.gt-composer { border-top: 1px solid var(--gt-bg-3); padding: 10px 28px 12px; flex: 0 0 auto; }
.gt-composer-meta { display: flex; gap: 12px; font-size: 11.5px; }
.gt-composer-row { display: flex; gap: 10px; align-items: flex-start; margin-top: 5px; }
.gt-input {
  flex: 1; background: transparent; border: 0; outline: 0; resize: none;
  color: var(--gt-fg); font: inherit; font-size: calc(var(--gt-size) + 1px);
  line-height: var(--gt-lh); padding: 0; max-height: 30vh; overflow-y: auto;
}
.gt-input::placeholder { color: var(--gt-fg-faint); }
.gt-cursor { display: inline-block; width: 8px; height: 1em; background: var(--gt-green);
  vertical-align: -2px; margin-left: 2px; }
.gt-cursor[data-style="bar"] { width: 2px; }
.gt-cursor[data-style="underline"] { height: 2px; align-self: flex-end; }
.gt-cursor[data-blink="1"] { animation: gt-blink 1.06s step-end infinite; }
@keyframes gt-blink { 0%, 50% { opacity: 1; } 50.01%, 100% { opacity: 0; } }
@media (prefers-reduced-motion: reduce) {
  .gt-cursor[data-blink="1"] { animation: none; }
}
/* 입력줄 커서는 포커스가 있을 때만 깜빡인다. 없으면 멈추고 흐려진다 —
   '여기 치면 들어간다' 가 사실이 아닌데 깜빡이면 거짓말이다.
   data-focus 는 입력줄 커서에만 붙으므로 본문·생각 중 커서는 그대로다. */
.gt-cursor[data-focus="0"] { animation: none; opacity: 0.35; }

/* ---- statusline ---- */
.gt-status { display: flex; align-items: center; height: 26px; font-size: 11.5px; flex: 0 0 auto;
  background: var(--gt-bg-2); border-top: 1px solid var(--gt-bg-3); }
.gt-mode { padding: 0 12px; height: 100%; display: flex; align-items: center;
  font-weight: 700; letter-spacing: 0.1em; color: var(--gt-bg-1); background: var(--gt-fg-dim); }
.gt-mode[data-mode="INSERT"] { background: var(--gt-green); }
.gt-mode[data-mode="STREAM"] { background: var(--gt-cyan); }
.gt-mode[data-mode="COMMAND"] { background: var(--gt-magenta); }
.gt-mode[data-mode="CONFIG"] { background: var(--gt-yellow); }
.gt-mode[data-mode="BROKEN"] { background: var(--gt-red); }
.gt-status-seg { padding: 0 12px; color: var(--gt-fg-dim); }
.gt-status-hint { padding: 0 12px; color: var(--gt-fg-faint); }

/* ---- 팔레트 ---- */
.gt-scrim { position: absolute; inset: 34px 0 0 0; background: var(--gt-bg-0); opacity: 0.55; z-index: 10; }
.gt-palette {
  position: absolute; left: 50%; transform: translateX(-50%); top: 96px; width: min(744px, 92%);
  border: 1px solid var(--gt-border); background: var(--gt-bg-1); z-index: 11;
  box-shadow: 0 24px 64px rgba(1,4,9,0.8); display: flex; flex-direction: column; max-height: 60vh;
}
.gt-palette-input { display: flex; align-items: center; gap: 10px; padding: 11px 14px;
  background: var(--gt-bg-2); border-bottom: 1px solid var(--gt-bg-3); }
.gt-palette-input input { flex: 1; background: transparent; border: 0; outline: 0;
  color: var(--gt-fg); font: inherit; font-size: calc(var(--gt-size) + 1px); }
.gt-palette-list { overflow-y: auto; padding: 6px 0; }
.gt-palette-row { display: flex; align-items: center; gap: 10px; padding: 5px 14px; cursor: default; }
.gt-palette-row[data-sel="1"] { background: var(--gt-bg-3); box-shadow: inset 2px 0 0 var(--gt-magenta); }
.gt-palette-name { width: 200px; flex: 0 0 auto; }
.gt-palette-desc { flex: 1; color: var(--gt-fg-dim); overflow: hidden;
  text-overflow: ellipsis; white-space: nowrap; }
.gt-hit { color: var(--gt-cyan); }
.gt-palette-foot { display: flex; gap: 16px; padding: 7px 14px; font-size: 11px;
  color: var(--gt-fg-faint); background: var(--gt-bg-2); border-top: 1px solid var(--gt-bg-3); }
`;

  function vars(cfg) {
    const t = THEMES[cfg.theme] || THEMES['modern-dark'];
    const decls = Object.entries(t).map(([k, v]) => `${k}:${v}`).join(';');
    return `.gt-root{${decls};`
      + `--gt-font:${cfg['font.family']};`
      + `--gt-size:${cfg['font.size']}px;`
      + `--gt-lh:${cfg['line.height']};`
      + `--gt-wrap:${Number(cfg['wrap.columns']) > 0 ? cfg['wrap.columns'] + 'ch' : 'none'};`
      + `--gt-sb-w:${Number(cfg['sidebar.width']) || 30}ch;}`;
  }

  return { CSS, THEMES, vars, names: () => Object.keys(THEMES) };
})();
