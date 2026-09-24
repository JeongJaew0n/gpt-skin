// gpt-skin — 이미지 파트를 화면에 올린다.
//
// asset_pointer 는 주소가 아니다. 실측(2026-09-09):
//
//   sediment://file_00000000291081fdbac3898d5e140bb8
//   → GET /backend-api/files/<file_id>/download
//   → { download_url: <서명 URL>, file_name, mime_type, file_size_bytes }
//
// download_url 의 호스트는 chatgpt.com 이다(같은 오리진). 서명 쿼리가 붙고 만료가 있다.
// 그래서 캐시에 나이를 둔다 — 오래된 주소는 다시 받는다.
//
// docs/plan/2026-09-09-image-generation.md
GT.image = (function () {
  'use strict';

  // 서명 URL 의 실제 만료 시간은 확인하지 못했다. 30분은 보수적으로 잡은 값이다 —
  // 짧게 잡아도 손해는 요청 한 번이고, 길게 잡으면 깨진 이미지가 남는다.
  const TTL_MS = 30 * 60 * 1000;

  const cache = new Map();   // pointer → { url, name, mime, bytes, at }
  const inflight = new Map();

  // sediment://file_xxx · file-service://file_xxx · file_xxx 를 모두 받는다.
  // 스킴은 한 번 바뀐 적이 있다(문헌의 file-service 와 실측의 sediment).
  // 모르는 모양이면 null 을 돌려주고, 부르는 쪽이 자리표시자로 떨어진다.
  function fileId(pointer) {
    const s = String(pointer == null ? '' : pointer);
    const m = /(?:^|\/\/)(file[-_][A-Za-z0-9_-]+)$/.exec(s) || /^(file[-_][A-Za-z0-9_-]+)$/.exec(s);
    return m ? m[1] : null;
  }

  const fresh = (e) => e && e.url && Date.now() - e.at < TTL_MS;

  // 주소를 받아 둔 것이 있으면 바로 준다. 없으면 null — 화면을 막지 않는다.
  function peek(pointer) {
    const e = cache.get(pointer);
    return fresh(e) ? e : null;
  }

  async function resolve(pointer) {
    const hit = peek(pointer);
    if (hit) return hit;

    // 같은 그림을 여러 곳에서 동시에 물어도 요청은 한 번만 나간다.
    if (inflight.has(pointer)) return inflight.get(pointer);

    const id = fileId(pointer);
    if (!id) {
      GT.log('이미지 포인터를 읽지 못했다', pointer);
      return null;
    }

    const p = (async () => {
      try {
        const r = await GT.oai.get(`/backend-api/files/${encodeURIComponent(id)}/download`);
        const url = r && typeof r.download_url === 'string' ? r.download_url : '';
        if (!/^https?:\/\//i.test(url)) throw new Error('download_url 없음');
        const e = {
          url,
          name: String((r && r.file_name) || ''),
          mime: String((r && r.mime_type) || ''),
          bytes: Number(r && r.file_size_bytes) || 0,
          at: Date.now()
        };
        cache.set(pointer, e);
        return e;
      } catch (err) {
        GT.log('이미지 주소를 받지 못했다', err);
        return null;
      } finally {
        inflight.delete(pointer);
      }
    })();

    inflight.set(pointer, p);
    return p;
  }

  // 사람이 읽을 크기. 정확한 바이트는 알 필요가 없다.
  function size(bytes) {
    const n = Number(bytes) || 0;
    if (n <= 0) return '';
    if (n < 1024) return `${n} B`;
    if (n < 1024 * 1024) return `${Math.round(n / 1024)} KB`;
    return `${(n / (1024 * 1024)).toFixed(1)} MB`;
  }

  // ------------------------------------------------------------ 문자 블록

  // ▀ 는 셀의 위 절반을 채운다. 글자색을 위 픽셀, 배경색을 아래 픽셀로 주면
  // 한 글자에 픽셀 두 개가 들어간다.
  //
  // 셀은 폭 1ch · 높이 2ch 로 그린다. 그러면 픽셀 하나가 1ch × 1ch 정사각형이 되어
  // 종횡비가 맞는다. 픽셀 행 수 = cols × (h / w) 이고 문자 행은 그 절반이다.
  // 이 계산을 틀리면 그림이 세로로 늘어난다(설계 때 한 번 틀렸다).
  const BLOCK = '\u2580';

  function grid(img, cols) {
    const w = img.naturalWidth || img.width;
    const h = img.naturalHeight || img.height;
    if (!w || !h) return null;
    const c = Math.max(8, Math.round(cols) || 48);
    const rows = Math.max(2, Math.round((c * h) / w / 2) * 2);   // 짝수여야 짝이 맞는다
    const cv = document.createElement('canvas');
    cv.width = c; cv.height = rows;
    const cx = cv.getContext('2d');
    if (!cx) return null;
    cx.drawImage(img, 0, 0, c, rows);
    // 다른 오리진 이미지였다면 여기서 던진다. 실측에서 download_url 은 같은 오리진이라
    // 통했지만, 바뀔 수 있으므로 부르는 쪽이 받아 자리표시자로 떨어진다.
    const px = cx.getImageData(0, 0, c, rows).data;
    return { px, cols: c, rows };
  }

  const hex2 = (v) => (v < 16 ? '0' : '') + v.toString(16);

  // 문자 블록으로 그린 노드. HTML 문자열을 만들지 않는다 — markdown.js 와 같은 규칙이다.
  function blocks(img, cols) {
    const g = grid(img, cols);
    if (!g) return null;
    const { px, rows } = g;
    const c = g.cols;
    const box = document.createElement('div');
    box.className = 'gt-img-blocks';
    const color = (i) => '#' + hex2(px[i]) + hex2(px[i + 1]) + hex2(px[i + 2]);
    for (let y = 0; y < rows; y += 2) {
      const line = document.createElement('div');
      line.className = 'gt-img-row';
      for (let x = 0; x < c; x += 1) {
        const cell = document.createElement('i');
        const top = (y * c + x) * 4;
        const bot = ((y + 1) * c + x) * 4;
        cell.textContent = BLOCK;
        cell.style.color = color(top);
        cell.style.background = color(bot);
        line.appendChild(cell);
      }
      box.appendChild(line);
    }
    return box;
  }

  return { resolve, peek, fileId, size, blocks, grid, TTL_MS, BLOCK,
    forget() { cache.clear(); } };
})();
