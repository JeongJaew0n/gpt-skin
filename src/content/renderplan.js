// gpt-skin — 스크롤백 재구성 계획. 순수 함수만 둔다.
//
// 스크롤백을 매번 통째로 다시 그리면 선택 앵커가 사라진다
// (docs/issue/2026-09-02-selection-lost-on-rerender.md).
// 그래서 '무엇이 바뀌었는지'를 먼저 계산하고 바뀐 것만 갈아끼운다.
//
// 여기가 순수 함수인 이유: 서명에 필드를 빠뜨리면 낡은 내용이 화면에 남는데,
// 그 증상은 조용해서 알아채기 어렵다. DOM 없이 직접 검사할 수 있어야 한다.
GT.renderplan = (function () {
  'use strict';

  // 렌더가 읽는 값을 전부 넣는다.
  // 길이만으로는 부족하다 — fiber 교정처럼 길이가 같고 내용만 바뀌는 경우가 실제로 있었다.
  // 전체 해시는 긴 대화에서 매 틱 비용이 되므로 길이 + 앞뒤 8자로 대신한다.
  // 시각(at)은 넣지 않는다. 넣으면 상대 시각이 바뀔 때마다 블록이 교체되어
  // 선택을 다시 깨뜨린다 — 시각은 노드를 유지한 채 자리에서 갱신한다.
  //
  // 구분자 대신 JSON 으로 묶는다. 본문에 어떤 문자가 들어와도 경계가 흐려지지 않는다.
  function signature(m, ctx) {
    const c = ctx || {};
    const t = typeof m.text === 'string' ? m.text : '';
    return JSON.stringify([
      m.role,
      t.length,
      t.slice(0, 8),
      t.length > 8 ? t.slice(-8) : '',
      m.streaming ? 1 : 0,
      m.model || '',
      m.thinking || 0,
      m.parts ? m.parts.length : -1,
      m.refs ? m.refs.length : -1,   // 인용 출처는 본문보다 늦게 붙는다. 빠뜨리면 각주가 안 살아난다
      // 이미지도 API 를 다시 읽은 뒤에 붙는다. 개수만으로는 같은 자리에 다른 그림이
      // 온 경우를 못 잡으므로 첫 포인터까지 넣는다.
      m.images ? m.images.length + ':' + (m.images[0] ? m.images[0].pointer : '') : '',
      c.epoch || 0,          // 설정 변경. 개별 추적 대신 하나로 묶는다
      c.path || ''           // 메타 줄에 경로가 찍힌다
    ]);
  }

  // ':messup' 처럼 화면에만 있는 블록을 스크롤백의 제자리에 끼운다.
  //
  // 시스템 줄처럼 맨 아래에 두면 새 대화가 올 때마다 그 아래로 밀려나
  // 순서가 뒤집힌다. 만들 때의 '마지막 메시지' 를 앵커로 잡아 그 뒤에 둔다.
  // 앵커가 사라졌으면(대화를 갈아엎었다) 끝에 붙인다 — 조용히 지우지 않는다.
  //
  // keys   : 메시지 키 (그리는 순서대로)
  // locals : [{id, anchorKey}]  anchorKey 가 비면 '메시지보다 앞'
  function interleave(keys, locals) {
    const out = [];
    const byAnchor = new Map();
    (locals || []).forEach((r) => {
      const k = r.anchorKey || '';
      if (!byAnchor.has(k)) byAnchor.set(k, []);
      byAnchor.get(k).push(r);
    });
    const placed = new Set();
    const drain = (k) => (byAnchor.get(k) || []).forEach((r) => { placed.add(r.id); out.push({ local: r }); });

    drain('');
    (keys || []).forEach((k) => { out.push({ key: k }); drain(k); });
    (locals || []).forEach((r) => { if (!placed.has(r.id)) out.push({ local: r }); });
    return out;
  }

  // prev: [{key, sig}]  지금 붙어 있는 것
  // next: [{key, sig}]  붙어 있어야 하는 것 (순서 포함)
  //
  // keep   = 노드를 그대로 쓴다 (선택이 살아남는 지점)
  // create = 새로 만든다
  // remove = 더 이상 필요 없다
  function reconcile(prev, next) {
    const prevSig = new Map((prev || []).map((p) => [p.key, p.sig]));
    const ops = (next || []).map((n, index) => ({
      key: n.key,
      index,
      op: prevSig.has(n.key) && prevSig.get(n.key) === n.sig ? 'keep' : 'create'
    }));
    const wanted = new Set((next || []).map((n) => n.key));
    const remove = (prev || []).filter((p) => !wanted.has(p.key)).map((p) => p.key);
    return { ops, remove };
  }

  // 아무것도 손댈 필요가 없는가. 순서까지 같아야 한다.
  function unchanged(plan, prev) {
    if (plan.remove.length) return false;
    if (plan.ops.some((o) => o.op !== 'keep')) return false;
    const prevKeys = (prev || []).map((p) => p.key);
    if (prevKeys.length !== plan.ops.length) return false;
    return plan.ops.every((o, i) => prevKeys[i] === o.key);
  }

  // 행 단위 계획. 시트처럼 '한 행에 한 줄' 로 그리는 스킨이 쓴다.
  //
  // 메시지 단위로 서명하면 스트리밍 중 한 글자마다 그 메시지의 모든 행을 다시 만든다.
  // 행마다 키와 서명을 주면 reconcile 이 바뀐 행만 고른다 — 글이 흘러오는 동안
  // 앞 행은 그대로 남고 마지막 행(과 새로 생긴 행)만 바뀐다.
  // docs/plan/2026-09-21-sheet-skin.md §4 (2)
  //
  // msgKey : 메시지 키   rows : GT.markdown.lines() 의 결과   ctx.epoch : 설정 변경
  // 키는 '메시지:행번호' 다. 앞에 행이 끼어들면 뒤가 전부 밀려 다시 만들어진다 —
  // 스트리밍은 뒤에만 붙으므로 이 단순한 키로 충분하다.
  function rows(msgKey, list, ctx) {
    const epoch = (ctx && ctx.epoch) || 0;
    return (list || []).map((r, i) => ({ key: msgKey + ':' + i, sig: JSON.stringify([r, epoch]) }));
  }

  return { signature, interleave, reconcile, unchanged, rows };
})();
