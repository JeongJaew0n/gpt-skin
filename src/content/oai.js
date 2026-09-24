// gpt-skin — 원본 백엔드 읽기 클라이언트.
//
// 쿠키만으로는 안 된다. /api/auth/session 의 accessToken 을 Bearer 로 붙여야 한다.
// 이걸 몰라서 한동안 "/backend-api/conversation/<id> 는 404" 라고 잘못 적어뒀었다 —
// 인증 없이 부르면 404, 붙이면 200 이다.
// 읽기 GET 에는 sentinel proof-of-work 가 필요 없다 (그건 전송 경로에만 붙는다).
//
// 토큰 취급: 메모리에만 둔다. chrome.storage 에 쓰지 않고, 로그로 찍지 않고,
// chatgpt.com 이외로 보내지 않는다.
GT.oai = (function () {
  'use strict';

  const SESSION = '/api/auth/session';
  const TTL = 5 * 60 * 1000;

  let token = null;
  let at = 0;

  async function getToken(force) {
    if (!force && token && Date.now() - at < TTL) return token;
    const r = await fetch(SESSION, { headers: { accept: 'application/json' }, credentials: 'include' });
    if (!r.ok) throw new Error(`session ${r.status}`);
    const j = await r.json();
    if (typeof j.accessToken !== 'string') throw new Error('accessToken 없음');
    token = j.accessToken;
    at = Date.now();
    return token;
  }

  async function get(path, opts) {
    const retry = !(opts && opts.noRetry);
    const t = await getToken();
    const r = await fetch(path, {
      headers: { accept: 'application/json', Authorization: 'Bearer ' + t },
      credentials: 'include'
    });
    if (r.status === 401 && retry) {
      token = null;
      return get(path, { noRetry: true });
    }
    if (!r.ok) throw new Error(String(r.status));
    return r.json();
  }

  async function patch(path, body, opts) {
    const retry = !(opts && opts.noRetry);
    const t = await getToken();
    const r = await fetch(path, {
      method: 'PATCH',
      headers: { accept: 'application/json', 'content-type': 'application/json', Authorization: 'Bearer ' + t },
      credentials: 'include',
      body: JSON.stringify(body || {})
    });
    if (r.status === 401 && retry) { token = null; return patch(path, body, { noRetry: true }); }
    if (!r.ok) throw new Error(String(r.status));
    return r.json();
  }

  return { get, patch, forget() { token = null; at = 0; } };
})();
