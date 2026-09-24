// gpt-skin — 대화 조작. 원본 사이드바의 "..." 메뉴에 해당한다.
//
// 원본 메뉴를 클릭하는 대신 백엔드를 직접 부른다. 우리 목록도 API 에서 오고,
// 원본 사이드바는 창이 좁으면 DOM 에 아예 없기 때문이다.
//
// 실측으로 확인한 것 (2026-09-01, 내가 만든 테스트 대화에서 왕복 확인):
//   이름 바꾸기  PATCH /backend-api/conversation/<id>  {title}         → {success:true}
//   보관         PATCH …                               {is_archived}   → 목록에서 사라짐/복귀
//   고정         PATCH …                               {is_starred}    → pinned_time 설정/해제
//   삭제         PATCH …                               {is_visible:false}
//
// 삭제는 버릴 대화를 만들어 실제로 확인했다. **되돌릴 수 없다.**
//   삭제 후 목록에서 사라지고, GET 은 404 를 준다.
//   {is_visible:true} 로 복구를 시도하면 역시 404 다 — 그 id 로는 더 이상 닿을 수 없다.
// 그래서 호출부는 반드시 확인 절차를 거친다.
GT.convops = (function () {
  'use strict';

  const url = (id) => `/backend-api/conversation/${encodeURIComponent(id)}`;

  async function patch(id, body) {
    const j = await GT.oai.patch(url(id), body);
    return !!(j && j.success);
  }

  return {
    rename: (id, title) => patch(id, { title: String(title) }),
    pin: (id, on) => patch(id, { is_starred: !!on }),
    archive: (id, on) => patch(id, { is_archived: !!on }),

    // 되돌릴 수 없다. 복구 경로가 없음을 실측으로 확인했다.
    remove: (id) => patch(id, { is_visible: false }),

    // 여러 개를 지운다. 하나가 실패해도 멈추지 않고 끝까지 간 뒤 요약을 돌려준다.
    // 순차로 부른다 — 병렬로 쏘면 어디까지 지워졌는지 말할 수 없게 된다.
    async removeMany(ids, onStep) {
      const done = [];
      const failed = [];
      for (let i = 0; i < ids.length; i += 1) {
        const id = ids[i];
        try {
          const ok = await patch(id, { is_visible: false });
          (ok ? done : failed).push(ok ? id : { id, error: 'success=false' });
        } catch (e) {
          failed.push({ id, error: (e && e.message) || String(e) });
        }
        if (onStep) onStep(i + 1, ids.length);
      }
      return { done, failed };
    },

    // 프로젝트로 이동 / 빼기.
    //
    // 실측(2026-09-02): 넣기는 `{gizmo_id: '<id>'}` 로 되는데
    // **빼기는 `null` 이 아니라 빈 문자열이다.** null 은 200 success 를 주고도 실제로는 안 지워진다.
    // 조용히 실패하는 종류라 반드시 결과를 다시 읽어 확인한다.
    async moveToProject(id, gizmoId) {
      const ok = await patch(id, { gizmo_id: gizmoId ? String(gizmoId) : '' });
      if (!ok) return { ok: false, reason: 'rejected' };
      const conv = await GT.oai.get(`${url(id)}`).catch(() => null);
      const now = conv ? conv.gizmo_id || null : undefined;
      const want = gizmoId || null;
      if (now !== undefined && now !== want) {
        return { ok: false, reason: 'not-applied', now };
      }
      return { ok: true, gizmoId: want };
    },

    // 공유하기는 API 로 하지 않는다.
    // 대화를 **공개 링크**로 만드는 동작이라, 우리 UI 의 한 번 클릭으로 공개되면 안 된다.
    // 원본 헤더의 공유 버튼을 눌러 ChatGPT 자신의 확인 대화상자를 띄운다.
    SHARE_BUTTON: '[data-testid="share-chat-button"]'
  };
})();
