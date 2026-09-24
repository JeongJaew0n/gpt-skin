// gpt-skin — 명령 레지스트리. 입력이 ':' 나 알려진 동사로 시작하면 명령, 아니면 메시지다.
GT.commands = (function () {
  'use strict';

  const el = (t, c, x) => { const n = document.createElement(t); if (c) n.className = c; if (x !== undefined) n.textContent = x; return n; };
  const info = (t) => GT.skin.current.system('info', t);
  const warn = (t) => GT.skin.current.system('warn', t);
  const err = (t) => GT.skin.current.system('error', t);

  const table = (rows) => {
    const box = el('div');
    box.style.display = 'flex'; box.style.flexDirection = 'column'; box.style.gap = '2px';
    rows.forEach(([a, b, c]) => {
      const r = el('div'); r.style.display = 'flex'; r.style.gap = '14px';
      const k = el('span', null, a); k.style.width = '190px'; k.style.flex = '0 0 auto'; k.style.color = 'var(--gt-cyan)';
      r.appendChild(k);
      if (c !== undefined) {
        const v = el('span', null, String(b)); v.style.width = '150px'; v.style.flex = '0 0 auto';
        r.appendChild(v);
        r.appendChild(el('span', 'gt-dim', String(c)));
      } else {
        r.appendChild(el('span', 'gt-dim', String(b)));
      }
      box.appendChild(r);
    });
    return box;
  };

  const REG = [];
  // args: 인자 후보를 돌려주는 함수(선택). 이미 입력된 앞 인자들을 받는다.
  const def = (name, desc, run, hint, args) => { REG.push({ name, desc, run, hint, args }); };

  // 지금 스킨에서 쓸 수 있는 명령. 스킨이 hiddenCommands 로 뺀 것은 목록·팔레트·완성에서 숨긴다.
  const hidden = () => {
    try { return GT.skin.current.hiddenCommands || []; } catch (_) { return []; }
  };
  const usable = () => REG.filter((c) => !hidden().includes(c.name));

  def(':help', '명령 목록', () => {
    GT.skin.current.system('info', null, table(usable().map((c) => [c.name, c.desc])));
  });

  def(':new', '새 대화', () => { GT.navigate.newChat(); });

  // :ls 와 사이드바는 같은 제공자를 쓴다. 출처가 갈리면 둘이 다른 걸 보여준다.
  let lastList = [];

  def(':ls', '대화 목록', async () => {
    const g = await GT.chats.load();
    // flatten 은 한 번만 부른다. 두 번 부르면 객체가 달라져 indexOf 가 -1 을 낸다.
    const flat = GT.chats.flatten(g);
    lastList = flat.filter((r) => r.kind === 'chat');
    if (!lastList.length) {
      return err('목록을 가져오지 못했습니다 — :health 로 출처를 확인하세요');
    }
    let i = -1;
    const rows = flat.map((r) => r.kind === 'header'
      ? ['', r.label, '']
      : [String(++i), r.title, r.pinned ? '★' : '']);
    GT.skin.current.system('info', null, table(rows));
    info(`${lastList.length} / ${g.total}개 (출처: ${g.source}) — :open <n>`);
    if (g.hasMore) info(`${g.total - g.loaded}개가 더 있습니다 — :sidebar more`);
  });

  def(':open', '대화 열기 — :open <n>', (args) => {
    const n = Number(args[0]);
    if (!lastList.length) return err('먼저 :ls 로 목록을 불러오세요');
    if (!Number.isInteger(n) || !lastList[n]) return err(`:open <0-${lastList.length - 1}>`);
    if (GT.config.get('sidebar.closeOnOpen')) GT.sidebar.dismiss();
    GT.navigate.to(lastList[n].href);
  });

  // 대화 조작 — 원본 "..." 메뉴에 해당한다.
  // 대상은 :ls 번호 또는 대화 id 앞자리로 지정한다.
  function findChat(raw) {
    // '@3' · '@6a97' 처럼 앞에 @ 를 붙여도 된다.
    // 이름과 섞일 수 있는 명령(:rename)에서 대상임을 분명히 하려고 쓴다.
    const key = String(raw == null ? '' : raw).replace(/^@/, '');
    if (key === '') return null;
    const n = Number(key);
    if (Number.isInteger(n) && lastList[n]) return lastList[n];
    const pool = lastList.concat(GT.sidebar.chats ? GT.sidebar.chats() : []);
    return pool.find((c) => c.id && c.id.startsWith(String(key)))
      || pool.find((c) => (c.title || '').toLowerCase().includes(String(key).toLowerCase()))
      || null;
  }

  const needTarget = (key) => {
    const c = findChat(key);
    if (!c) err(`대상을 찾지 못했습니다: ${key} — :ls 번호나 id 앞자리로 지정하세요`);
    return c;
  };

  def(':rename', '이름 바꾸기 — :rename <새 이름> (지금 대화) · :rename @<n|id> <새 이름>', async (args) => {
    if (!args.length) return err(':rename <새 이름>  ·  다른 대화면 :rename @<n|id> <새 이름>');

    // 기본은 지금 보고 있는 대화다.
    // 대상을 다른 대화로 지정하려면 @ 를 붙인다 — 안 그러면 이름의 첫 낱말과 구분할 수 없다
    // (':rename 3 단계 계획' 이 3번 대화인지 '3 단계 계획' 이라는 이름인지 알 수 없다).
    let target = null;
    let words = args;
    if (/^@/.test(args[0])) {
      target = needTarget(args[0]);
      if (!target) return;
      words = args.slice(1);
    }

    const name = words.join(' ').trim();
    if (!name) return err('새 이름이 필요합니다');

    const id = target ? target.id : GT.conversation.idFromPath();
    if (!id) return err('대화를 연 다음에 쓰시거나, :rename @<n|id> <새 이름> 으로 지정하세요');

    await GT.convops.rename(id, name);
    info(`이름 변경: ${name}`);
    // 지금 대화면 상단바 제목도 바로 바꾼다
    if (id === GT.conversation.idFromPath()) {
      GT.store.setTitle(name);
      // 브라우저 탭 제목은 원본이 자기 상태에서 그린다. API 로 바꾼 건 원본이 모르니
      // 새로고침 전까지 옛 이름이 남는다. 우리가 직접 맞춰준다.
      document.title = name;
    }
    if (GT.sidebar.isOpen()) await GT.sidebar.refresh();
  });

  def(':pin', '고정 — :pin <n|id> [off]', async (args) => {
    const c = needTarget(args[0]); if (!c) return;
    const on = String(args[1] || '').toLowerCase() !== 'off';
    await GT.convops.pin(c.id, on);
    info(on ? `고정: ${c.title}` : `고정 해제: ${c.title}`);
    if (GT.sidebar.isOpen()) await GT.sidebar.refresh();
  });

  def(':archive', '보관 — :archive <n|id> [off]', async (args) => {
    const c = needTarget(args[0]); if (!c) return;
    const on = String(args[1] || '').toLowerCase() !== 'off';
    await GT.convops.archive(c.id, on);
    info(on ? `보관: ${c.title}` : `보관 해제: ${c.title}`);
    if (on && location.pathname === '/c/' + c.id) GT.navigate.newChat();
    if (GT.sidebar.isOpen()) await GT.sidebar.refresh();
  });

  // 삭제는 되돌릴 수 없다. 확인 없이는 실행하지 않는다.
  def(':rm', '삭제 — :rm <n|id> yes', async (args) => {
    const c = needTarget(args[0]); if (!c) return;
    if (String(args[1] || '').toLowerCase() !== 'yes') {
      warn(`되돌릴 수 없습니다. 지우려면: :rm ${c.id.slice(0, 8)} yes`);
      return info(`대상: ${c.title}`);
    }
    await GT.convops.remove(c.id);
    warn(`삭제 요청: ${c.title}`);
    if (location.pathname === '/c/' + c.id) GT.navigate.newChat();
    if (GT.sidebar.isOpen()) await GT.sidebar.refresh();
  });

  def(':select', '대화 다중 선택 모드 (원본에 없는 기능)', () => {
    if (!GT.sidebar.isOpen()) return err('사이드바를 먼저 여세요 (^B)');
    if (GT.sidebar.selecting) { GT.sidebar.exitSelect(); return info('선택 모드 종료'); }
    GT.sidebar.enterSelect();
    info('행을 클릭해 고르고, 아래 버튼으로 삭제·보관합니다. esc 로 나갑니다');
  });

  def(':mv', '프로젝트로 이동 — :mv <n|id> <프로젝트|none>', async (args) => {
    const c = needTarget(args[0]); if (!c) return;
    const projects = GT.chats.projects ? GT.chats.projects() : [];
    const want = args.slice(1).join(' ').trim();

    if (!want) {
      if (!projects.length) return err('프로젝트 목록이 비어 있습니다 — :ls 로 목록을 먼저 불러오세요');
      GT.skin.current.system('info', null, table(projects.map((p, i) => [String(i), p.name, ''])));
      return info(`:mv ${args[0]} <번호|이름>  ·  빼려면 :mv ${args[0]} none`);
    }

    let gid = '';
    if (!/^(none|없음|-)$/i.test(want)) {
      const n = Number(want);
      const p = (Number.isInteger(n) && projects[n])
        || projects.find((x) => x.name.toLowerCase().includes(want.toLowerCase()));
      if (!p) return err(`일치하는 프로젝트가 없습니다. 가능: ${projects.map((x) => x.name).join(', ')}`);
      gid = p.id;
    }

    const r = await GT.convops.moveToProject(c.id, gid);
    if (!r.ok) {
      return err(r.reason === 'not-applied'
        ? '요청은 받아들여졌는데 실제로 바뀌지 않았습니다 — 원본이 바뀌었을 수 있습니다'
        : `이동 실패 (${r.reason})`);
    }
    const name = gid ? (projects.find((x) => x.id === gid) || {}).name : null;
    info(name ? `${c.title} → ${name}` : `${c.title} → 프로젝트에서 뺐습니다`);
    if (GT.sidebar.isOpen()) await GT.sidebar.refresh();
  }, null, (prev) => (prev.length === 1
    ? (GT.chats.projects ? GT.chats.projects().map((p) => p.name).concat('none') : ['none'])
    : []));

  // 공유는 공개 링크를 만든다. API 로 곧장 만들지 않고 원본 대화상자를 띄운다 —
  // 무엇이 공개되는지 ChatGPT 자신의 확인 절차를 거치게 한다.
  def(':share', '공유 — 원본 공유 대화상자를 엽니다', async (args) => {
    const c = args.length ? needTarget(args[0]) : null;
    if (args.length && !c) return;
    const id = c ? c.id : GT.conversation.idFromPath();
    if (!id) return err('공유할 대화를 찾지 못했습니다 — :share <n|id>');

    if (location.pathname !== '/c/' + id) {
      GT.navigate.to('/c/' + id);
      await new Promise((r) => setTimeout(r, 1200));
    }
    const btn = document.querySelector(GT.convops.SHARE_BUTTON);
    if (!btn) return err('원본의 공유 버튼을 찾지 못했습니다 — 창이 좁으면 숨겨집니다');

    // 대화상자는 원본 UI 위에 뜬다. 터미널을 덮어둔 채로는 보이지 않는다.
    GT.skin.hide();
    btn.click();
    warn('원본 공유 대화상자를 열었습니다 — 링크를 만들면 대화가 공개됩니다. 끝나면 ^` 로 돌아오세요');
  });

  def(':sidebar', '사이드바 — on | off | toggle | more | width <n> | clear-cache', async (args) => {
    const a = (args[0] || 'toggle').toLowerCase();
    if (a === 'more') {
      if (!GT.sidebar.hasMore) return info('더 읽을 대화가 없습니다');
      const g = await GT.sidebar.loadMore();
      return info(`${g.loaded} / ${g.total}개 읽음`);
    }
    if (a === 'width') {
      const n = Number(args[1]);
      if (!Number.isInteger(n)) return err(':sidebar width <16-80>');
      await GT.config.set('sidebar.width', n);
      GT.skin.current.applyConfig(GT.config.all);
      return info(`sidebar.width = ${n}`);
    }
    if (a === 'clear-cache') {
      const ok = await GT.chats.clearCache();
      return ok ? info('목록 캐시를 지웠다') : err('캐시를 지우지 못했습니다');
    }
    const next = await GT.sidebar.toggle(a === 'on' ? true : a === 'off' ? false : undefined);
    info(`사이드바 ${next ? '켬' : '끔'}`);
  }, null, (prev) => (prev.length ? [] : ['on', 'off', 'toggle', 'more', 'width', 'clear-cache']));

  // 글씨 크기. 브라우저 확대(⌘ +/-)는 페이지 전체를 키우고, 이건 터미널만 키운다.
  def(':font', '글씨 크기 — :font <10-24 | + | - | reset>', async (args) => {
    const MIN = 10, MAX = 24;
    const cur = Number(GT.config.get('font.size')) || 13;
    const a = String(args[0] || '').toLowerCase();
    let next;
    if (!a) {
      info(`글씨 크기 ${cur}px (${MIN}–${MAX})`);
      return info(':font +  ·  :font -  ·  :font 15  ·  :font reset   (⌥= / ⌥- / ⌥0)');
    }
    if (a === '+') next = cur + 1;
    else if (a === '-') next = cur - 1;
    else if (a === 'reset') next = GT.config.DEFAULTS['font.size'];
    else if (/^\d+$/.test(a)) next = Number(a);
    else return err(':font <10-24 | + | - | reset>');

    next = Math.max(MIN, Math.min(MAX, next));
    if (next === cur) return info(`이미 ${cur}px`);
    await GT.config.set('font.size', next);
    GT.skin.current.applyConfig(GT.config.all);
    GT.skin.current.render();
    info(`글씨 크기 ${cur} → ${next}px`);
  }, null, () => ['+', '-', 'reset', '12', '13', '15', '17']);

  // 테마는 지금 스킨의 목록에서 고르고 '<스킨>.theme' 에 쓴다.
  const themeNames = () => Object.keys(GT.skin.current.themes || {});
  def(':theme', GT_T('cmd.theme.desc'), async (args) => {
    const key = GT.skin.current.id + '.theme';
    const name = args[0];
    if (!themeNames().length) return err(GT_T('cmd.theme.none', GT.skins.label(GT.skin.current.id)));
    if (!name) return info(GT_T('cmd.theme.state', GT.config.get(key), themeNames().join(', ')));
    if (!themeNames().includes(name)) return err(GT_T('cmd.theme.unknown', name));
    await GT.config.set(key, name);
    GT.skin.current.applyConfig(GT.config.all);
    info(`${key} = ${name}`);
  }, 'modern-dark', () => themeNames());

  // 스킨 고르기. 바로 바꾸고 저장한다 (GT.skin.switch).
  // 결과 줄은 새 스킨에 찍는다 — 이전 스킨은 이미 해체됐다.
  def(':skin', GT_T('cmd.skin.desc'), async (args) => {
    const names = GT.skins.names();
    const cur = GT.skin.current.id;
    const id = args[0];
    if (!id) {
      return info(GT_T('cmd.skin.state', GT.skins.label(cur),
        names.map((n) => `${n} (${GT.skins.label(n)})`).join(', ')));
    }
    if (!names.includes(id)) return err(GT_T('cmd.skin.unknown', id, names.join(', ')));
    if (id === cur) return info(GT_T('cmd.skin.already', GT.skins.label(id)));
    const r = await GT.skin.switch(id);
    if (!r.ok) return err(GT_T('cmd.skin.failed', GT.skins.label(id), r.reason));
    GT.skin.current.system('info', GT_T('cmd.skin.switched', GT.skins.label(id)));
  }, null, () => GT.skins.names());

  // 지금 스킨에서 뜻이 있는 항목만 보여 준다. 다른 스킨의 항목도 :set 으로는 바꿀 수 있다.
  def(':config', '설정 전체 보기', () => {
    const cfg = GT.config.all;
    const keys = GT_FIELDS_FOR(GT.skin.current.id).map((f) => f.key);
    GT.skin.current.system('info', null, table(keys.map((k) => [k, cfg[k], ''])));
    info(':set <key> <value> 로 바꿉니다');
  });

  def(':set', '설정 변경 — :set <key> <value>', async (args) => {
    const [k, ...rest] = args;
    if (!k) return err(':set <key> <value>');
    if (!GT.config.has(k)) return err(`알 수 없는 키: ${k}`);
    try {
      const v = await GT.config.set(k, rest.join(' '));
      GT.skin.current.applyConfig(GT.config.all);
      GT.skin.current.render();
      info(`${k} = ${v}`);
    } catch (e) { err(String(e.message || e)); }
  }, null, (prev) => (prev.length ? [] : GT.config.keys()));

  def(':model', '모델 — 인자 없으면 목록, :model <n|이름> 으로 전환합니다', async (args) => {
    const last = [...GT.store.state.messages].reverse().find((m) => m.model);
    if (!GT.picker.available()) {
      return err('원본의 모델 선택기를 찾지 못했습니다. 창이 좁으면 숨겨집니다 — 창을 넓히거나 :q 로 원본에서 바꾸세요');
    }
    if (!args.length) {
      const list = await GT.picker.models();
      if (!list || !list.length) return err('모델 목록을 읽지 못했습니다');
      GT.skin.current.system('info', null, table(list.map((m) => [String(m.index), m.label, m.current ? '● 현재' : ''])));
      if (last) info(`직전 응답 모델 슬러그: ${last.model}`);
      return info(':model <번호|이름> 으로 전환합니다');
    }
    const r = await GT.picker.chooseModel(args.join(' '));
    if (r.ok) return info(`모델 → ${r.picked}`);
    if (r.reason === 'no-match') return err(`일치하는 모델이 없습니다. 가능: ${(r.had || []).join(', ')}`);
    err(`전환 실패 (${r.reason})`);
  });

  def(':effort', '추론 수준 — :effort <0-2 | 낮음|중간|높음 | + | ->', async (args) => {
    if (!GT.picker.available()) {
      return err('원본의 선택기를 찾지 못했습니다. 창이 좁으면 숨겨집니다 — 창을 넓히거나 :q 로 원본에서 바꾸세요');
    }

    if (!args.length) {
      const cur = await GT.picker.effort();
      if (!cur) return err('추론 수준을 읽지 못했습니다 — :health 로 확인하세요');
      info(`추론 수준: ${cur.label} (${cur.index + 1}/${cur.steps})`);
      return info(':effort 0 · 1 · 2 또는 낮음/중간/높음, +/- 로 한 칸씩');
    }

    // 라벨은 로케일을 타므로 이름은 별칭으로만 받고 실제 이동은 인덱스로 한다.
    const ALIAS = { '낮음': 0, low: 0, instant: 0, '중간': 1, mid: 1, medium: 1,
                    '높음': 2, high: 2, thinking: 2 };
    const a = String(args[0]).toLowerCase();
    let want;
    if (a === '+' || a === '-') want = a;
    else if (Object.prototype.hasOwnProperty.call(ALIAS, a)) want = ALIAS[a];
    else if (/^\d+$/.test(a)) want = Number(a);
    else return err(':effort <0-2 | 낮음|중간|높음 | + | ->');

    // 진행 상태는 상단바가 보여준다(⠴ 중간 →). 스크롤백에 남기지 않는다.
    const r = await GT.picker.setEffort(want);
    if (r.ok) {
      return info(r.noop ? `이미 ${r.label}` : `추론 수준 → ${r.label} (${r.index + 1}/${r.steps})`);
    }
    if (r.reason === 'no-move') return err(`움직이지 않았습니다 (${r.from} → ${r.to}). 원본이 바뀌었을 수 있습니다`);
    err(`전환 실패 (${r.reason})`);
  }, null, () => ['0', '1', '2', '낮음', '중간', '높음', '+', '-']);

  def(':version', '지금 실행 중인 코드의 빌드 시각', () => {
    info(`gpt-skin ${GT_VERSION} · build ${GT_BUILD}`);
    info('이 값이 소스를 고친 뒤에도 그대로면 확장이 다시 로드되지 않은 것입니다 (chrome://extensions 의 ↻)');
  });

  // 새로 넣는 명령의 문구는 사전에서 꺼낸다. 이 파일의 나머지 문구는
  // 아직 옮기지 않았다 — docs/plan/2026-09-08-i18n.md 의 순서를 따른다.
  def(':log', GT_T('cmd.log.desc'), async (args) => {
    const a = (args[0] || '').toLowerCase();
    const cur = GT.config.get('log') !== false;
    if (!a) return info(GT_T(cur ? 'cmd.log.state.on' : 'cmd.log.state.off'));
    // 콘솔 필터와 무관하게 '우리 로그만' 확인하는 길. 껐을 때도 쌓인다.
    if (a === 'dump' || a === 'show') {
      const rows = GT.logs(args[1]);
      if (!rows.length) return info(GT_T('cmd.log.empty'));
      GT.skin.current.system('info', null, table(rows.map((r) => [
        new Date(r.at).toLocaleTimeString(undefined, { hour12: false }), r.line
      ])));
      return info(GT_T('cmd.log.dumped', rows.length, GT.logCount()));
    }
    // 버퍼만 비우면 화면에 남은 [info]·[warn] 줄이 그대로라 '지워졌다' 는 느낌이 없다.
    // 스크롤백의 진단 줄까지 같이 걷어낸다. 대화는 건드리지 않는다.
    if (a === 'clear') {
      const buffered = GT.logClear();
      const onScreen = GT.skin.current.clearSystem();
      return info(GT_T('cmd.log.cleared', buffered, onScreen));
    }

    let next;
    if (a === 'on' || a === 'true' || a === '1') next = true;
    else if (a === 'off' || a === 'false' || a === '0') next = false;
    else if (a === 'toggle') next = !cur;
    else return err(GT_T('cmd.log.usage'));
    await GT.config.set('log', next);
    info(GT_T(next ? 'cmd.log.turnedOn' : 'cmd.log.turnedOff'));
  }, null, (prev) => (prev.length ? [] : ['on', 'off', 'toggle', 'dump', 'clear']));

  def(':options', '확장 설정 화면 열기', () => {
    GT.sendToSW({ kind: 'openOptions' });
    info('설정 탭을 엽니다');
  });

  def(':health', '점검 상태와 경고 목록', () => {
    const rows = Object.entries(GT.health.CHECKS).map(([k, v]) => [k, v.ok ? 'ok' : 'FAIL', v.label]);
    GT.skin.current.system('info', null, table(rows));
    const rs = GT.health.reasons;
    if (rs.length) rs.forEach((r) => warn(r)); else info('경고 없음');
    const sup = GT.store.state.superseded;
    info(`대화 목록 출처: ${GT.sidebar.source || GT.chats.source || '미조회'}`);
    const sb = GT.sidebar.state ? GT.sidebar.state() : null;
    if (sb) {
      info(`사이드바: 표시=${sb.visible} 붙음=${sb.attached} 비켜남=${sb.dismissed} `
        + `직접켬=${sb.forcedOpen} 열면닫기=${sb.closeOnOpen} 선택모드=${sb.selecting} 행=${sb.rows}`);
    }
    info(`onBreak = ${GT.config.get('onBreak')} · 드리프트 임계 ${GT.config.get('drift.threshold')}%`);
    const orph = GT.store.state.orphanDeltas;
    if (orph) info(`add 없이 도착한 본문 델타 ${orph}건`);
    info(`턴 안에서 대체한 중간 메시지 ${sup}개` + (sup ? ' — 추론 조각으로 보입니다' : ''));
  });

  // ------------------------------------------------------------------ messup
  //
  // 화면에만 끼워 넣는 가짜 출력. 서버로 가지 않고 대화 기록에도 안 남는다.
  // 바쁜 척하는 용도다 — 그래서 '있어 보이는' 모양(빌드 로그·해시·코드블록)을 쓴다.
  // 지우려면 :messup clear.
  const pick = (a) => a[Math.floor(Math.random() * a.length)];
  const hex = (n) => Array.from({ length: n }, () => '0123456789abcdef'[Math.floor(Math.random() * 16)]).join('');
  const num = (a, b) => a + Math.floor(Math.random() * (b - a + 1));
  const ms = () => (Math.random() * 900 + 12).toFixed(1);

  const NOUNS = ['kernel', 'shard', 'pipeline', 'lattice', 'vector', 'planner', 'reducer',
    'quorum', 'ledger', 'tensor', 'segment', 'manifold', 'router', 'cache'];
  const VERBS = ['reticulating', 'transposing', 'annealing', 'quantizing', 'rebalancing',
    'compacting', 'gossiping', 'coalescing', 'vectorizing', 'defragmenting'];
  const UNITS = ['MiB', 'ops/s', 'μs', 'shards', 'blocks', 'frames'];

  const LOG = () => `\`\`\`log
[${hex(8)}] ${pick(VERBS)} ${pick(NOUNS)}… ${num(3, 99)}% (${ms()}ms)
[${hex(8)}] ${pick(NOUNS)} ${num(2, 64)} → ${num(65, 512)} ${pick(UNITS)}
[${hex(8)}] warn  ${pick(NOUNS)} drift ${(Math.random() * 2).toFixed(3)}σ — within tolerance
[${hex(8)}] ok    ${num(120, 9800)} ${pick(UNITS)} in ${ms()}ms
\`\`\``;

  const CODE = () => {
    const n = pick(NOUNS);
    return `\`\`\`ts
export async function ${pick(VERBS).replace(/ing$/, '')}${n[0].toUpperCase() + n.slice(1)}(
  input: ReadonlyArray<Uint8Array>,
  opts: { window: number; epsilon?: number } = { window: ${num(8, 256)} }
): Promise<${n[0].toUpperCase() + n.slice(1)}Result> {
  const ε = opts.epsilon ?? ${(Math.random() * 0.1).toFixed(4)};
  const acc = new Float64Array(opts.window);
  for (const chunk of input) {
    if (chunk.byteLength % ${num(2, 16)} !== 0) continue;   // ${hex(4)}
    acc[chunk[0] % acc.length] += chunk.byteLength * (1 - ε);
  }
  return { checksum: 0x${hex(8)}, spread: acc.reduce((a, b) => a + b, 0) };
}
\`\`\``;
  };

  const TABLE = () => `| ${pick(NOUNS)} | ${pick(UNITS)} | drift |
|---|--:|--:|
| ${hex(6)} | ${num(10, 999)} | ${(Math.random()).toFixed(3)} |
| ${hex(6)} | ${num(10, 999)} | ${(Math.random()).toFixed(3)} |
| ${hex(6)} | ${num(10, 999)} | ${(Math.random()).toFixed(3)} |`;

  const PROSE = () => [
    `**${pick(NOUNS)}** ${num(2, 9)}단계까지 ${pick(VERBS)} 완료. 잔여 편차는 무시 가능한 수준이다.`,
    `- ${pick(NOUNS)} 재정렬 → ${num(3, 40)}개 세그먼트 병합`,
    `- ${pick(NOUNS)} 체크섬 \`${hex(12)}\` 검증됨`,
    `- 다음 단계: ${pick(VERBS)} ${pick(NOUNS)} (예상 ${ms()}ms)`
  ].join('\n');

  function messup() {
    const head = `### ${pick(VERBS)} ${pick(NOUNS)} · ${hex(6)}`;
    const blocks = [head, PROSE(), LOG(), CODE()];
    if (Math.random() < 0.5) blocks.push(TABLE());
    return blocks.join('\n\n');
  }

  def(':messup', '화면에만 가짜 출력을 끼워 넣습니다 — :messup [횟수|clear]', (args) => {
    const a = (args[0] || '').toLowerCase();
    if (a === 'clear' || a === 'off') {
      const n = GT.skin.current.clearLocal();
      info(n ? `끼워 넣은 블록 ${n}개를 걷어냈습니다` : '걷어낼 것이 없습니다');
      return;
    }
    let n = parseInt(a, 10);
    if (!Number.isFinite(n) || n < 1) n = 1;
    n = Math.min(n, 10);
    for (let i = 0; i < n; i += 1) GT.skin.current.local(messup());
    info(`${n}개 끼워 넣었습니다 — 서버로 가지 않습니다. :messup clear 로 걷어냅니다`);
  }, null, (prev) => (prev.length ? [] : ['clear']));

  function parse(line) {
    const t = line.trim();
    if (!t) return null;
    // ':' 없이 명령으로 받는 건 여기 목록뿐이고, '그 낱말 하나' 일 때만이다.
    //
    // 전에는 /^(ls|help)\b/ 로 앞머리만 봤다. 그래서
    // 'ls 명령어가 뭔지 설명해줘' · 'help me write a function' 같은 평범한 질문이
    // 명령으로 잡혀 GPT 로 가지 못했다. clear 를 뺄 때 같은 문제를 고쳤는데
    // 이 둘이 남아 있었다. 레지스트리에 없는 이름을 넣어도 같은 일이 벌어진다.
    const ALIAS = { ls: ':ls', help: ':help' };
    if (Object.prototype.hasOwnProperty.call(ALIAS, t)) return { name: ALIAS[t], args: [] };
    if (!t.startsWith(':')) return null;
    const parts = t.split(/\s+/);
    return { name: parts[0], args: parts.slice(1) };
  }

  async function run(line) {
    const p = parse(line);
    if (!p) return false;
    const cmd = REG.find((c) => c.name === p.name);
    if (!cmd) { err(`알 수 없는 명령입니다: ${p.name} — :help`); return true; }
    if (hidden().includes(cmd.name)) { err(GT_T('cmd.hidden', cmd.name, GT.skins.label(GT.skin.current.id))); return true; }
    try { await cmd.run(p.args); } catch (e) { err(String((e && e.message) || e)); }
    return true;
  }

  // ---------------------------------------------------------------- 자동완성
  //
  // 순수 함수로 둔다. DOM 없이 검사할 수 있어야 규칙이 흔들리지 않는다.
  const lower = (x) => String(x).toLowerCase();

  function commonPrefix(list) {
    if (!list.length) return '';
    let p = String(list[0]);
    list.forEach((v) => {
      const s2 = String(v);
      let i = 0;
      while (i < p.length && i < s2.length && p[i].toLowerCase() === s2[i].toLowerCase()) i += 1;
      p = p.slice(0, i);
    });
    return p;
  }

  // line 의 마지막 토큰을 무엇으로 채울 수 있는지 계산한다.
  function complete(line) {
    const raw = String(line == null ? '' : line);
    const endsWithSpace = /\s$/.test(raw);
    const parts = raw.trim() === '' ? [] : raw.trim().split(/\s+/);

    // 아직 명령 이름을 치는 중
    if (parts.length === 0 || (parts.length === 1 && !endsWithSpace)) {
      const token = parts[0] || '';
      const candidates = usable().map((c) => c.name).filter((n) => lower(n).startsWith(lower(token)));
      return { kind: 'command', token, candidates };
    }

    const cmd = REG.find((c) => c.name === parts[0]);
    if (!cmd || typeof cmd.args !== 'function') return { kind: 'none', token: '', candidates: [] };

    const token = endsWithSpace ? '' : parts[parts.length - 1];
    const before = parts.slice(1, endsWithSpace ? parts.length : parts.length - 1);
    let list = [];
    try { list = cmd.args(before) || []; } catch (_) { list = []; }
    const candidates = list.map(String).filter((v) => lower(v).startsWith(lower(token)));
    return { kind: 'argument', token, candidates };
  }

  // Tab 을 눌렀을 때 줄이 어떻게 바뀌는지. 바뀌지 않으면 null.
  function applyCompletion(line, res) {
    const r = res || complete(line);
    if (!r.candidates.length) return null;
    const raw = String(line == null ? '' : line);
    const fill = r.candidates.length === 1 ? r.candidates[0] + ' ' : commonPrefix(r.candidates);
    if (fill.length <= r.token.length && r.candidates.length > 1) return null;   // 더 채울 게 없다
    const cut = raw.length - r.token.length;
    const next = raw.slice(0, cut) + fill;
    return next === raw ? null : next;
  }

  return {
    registry: REG,
    run,
    parse,
    complete,
    applyCompletion,
    commonPrefix,
    openPalette() {
      GT.palette.open(usable().map((c) => ({ name: c.name, desc: c.desc, hint: c.hint })), (item) => {
        GT.prompt.fill(item.name + ' ');
      });
    }
  };
})();
