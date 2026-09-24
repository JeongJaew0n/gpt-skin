# checklist — web-store-submission

> 작업 진행하면서 AI 가 순차적으로 체크. `[x]` 로 표시한 항목은 완료된 것으로 간주.
> 새 항목이 발견되면 적절한 단계에 추가하고 체크리스트를 유지한다.

## 0. 준비
- [x] spec.md / context.md 다시 읽고 어긋난 곳 없는지 확인
- [x] `docs/store/` 폴더 생성

## 1. 아이콘 재작업 (`>_` 모티프)
- [x] 시안 4개(A~D)를 실제 PNG 로 렌더해 128/48/32/16 나란히 제시 — 사용자 선택 대기
- [x] 선택안(D — 초록 배경 + 어두운 `>_`)으로 `tools/make-icons.py` 재작성
- [x] `icons/icon{16,32,48,128}.png` 재생성 (+ 스토어용 `icon512.png`)
- [x] 16px 렌더를 밝은/어두운 툴바 배경에 얹어 눈으로 확인
- [x] `icons/source.png` 삭제 — 생성기가 원본 없이 직접 그리므로 마스터 자체가 불필요
- [x] OpenAI 육각 매듭 형태가 어디에도 남아 있지 않은지 확인

## 2. 스토어 이름·설명문
- [x] 이름 후보 제시 — "gpt" 상표 위험을 피하는 안 포함, 사용자 선택
- [x] 짧은 설명 작성 (132자 제한)
- [x] 상세 설명 작성 (기능·권한 이유·데이터 취급 요약 포함)
- [x] `docs/store/listing.md` 에 정리
- [x] `manifest.json` 의 `name`·`description` 반영
- [x] "개인용 언팩 확장" 문구가 남아 있지 않은지 확인 (README 는 그대로 둬도 됨)

## 3. 개인정보처리방침 초안
- [x] 코드에서 근거 재확인 — 무엇을 읽고, 무엇을 저장하고, 어디로 보내는가
      (`oai.js`, `chats.js`, `config.js`, `sidebar.js`)
- [x] `docs/store/privacy-policy.md` 작성
      (한국어 + 영어 병기. CWS 심사는 영어가 무난하다)
- [x] 문서 내용이 실제 코드와 일치하는지 항목별 대조
- [x] 호스팅 URL 은 사용자가 정한다는 점을 문서 상단에 TODO 로 표시

## 4. 권한 사유서 + 심사 노트
- [x] `docs/store/review-notes.md` 작성
- [x] `storage` 권한 사유
- [x] `https://chatgpt.com/*` 호스트 권한 사유
- [x] `world: "MAIN"` 콘텐츠 스크립트가 필요한 이유 (fiber·ProseMirror 접근)
- [x] `window.fetch` 래핑 사유 — SSE 를 갈라 읽을 뿐 외부로 보내지 않음
- [x] accessToken 취급 설명 — 메모리 전용·5분 TTL·저장/로그 없음
- [x] 비공개 API PATCH(이름변경·고정·보관·삭제) 에 대한 설명
- [x] `:messup` 이 왜 deceptive 가 아닌지 설명

## 5. 배포 패키지 스크립트
- [x] `tools/package.sh` 작성 — 화이트리스트 방식(포함할 것만 명시)
- [x] 제외 확인: `docs/`, `test/`, `*.dc.html`, `canvas.json`,
      `gpt-skin-tui.html`, `icons/source.png`, `.git`, `tools/`
- [x] zip 크기 출력
- [x] zip 내용을 매니페스트 요구 파일과 대조 (누락 0 · 금지 항목 유입 0)
- [ ] 만든 zip 을 풀어서 언팩 로드로 정상 동작 확인 — **↻ 가 필요해 사용자 확인 대기**

## 6. 검증
- [x] 전체 테스트 통과 (25파일)
- [x] `GT_BUILD` 갱신
- [ ] 아이콘 교체 후 브라우저에서 툴바 아이콘 확인 — **↻ 필요, 대기**
- [ ] 패키지 zip 으로 로드해 터미널 부팅 확인 — **↻ 필요, 대기**

## 7. 마무리
- [ ] 커밋 (전역 CLAUDE.md 규약: 원자적 단위, 한국어)
- [ ] 미체크 항목이 남았으면 사유 메모
- [ ] spec.md / context.md 의 변경분 반영
- [ ] 사용자에게 "제출 전에 사용자가 직접 해야 하는 것" 목록 전달
      (방침 URL 호스팅, 스크린샷, 개발자 계정 등록비, 데이터 사용 공시 체크)

## 남은 것 — 사용자가 직접 해야 하는 것

- [ ] 개인정보처리방침을 공개 URL 에 올리고 대시보드에 입력
      (`docs/store/privacy-policy.md` 상단 TODO)
- [ ] 연락처 확정 (`privacy-policy.md` 의 Contact TODO)
- [ ] 지원 사이트 / 홈페이지 URL 확정
- [ ] 스크린샷 1~5장 (1280×800 또는 640×400) — 찍을 화면 목록은 `docs/store/listing.md`
- [ ] 개발자 계정 등록 (일회성 등록비)
- [ ] 데이터 사용 공시 체크박스 입력 — 답은 `docs/store/review-notes.md` 3절에 정리돼 있다
- [x] 이름 최종 결정 — `gpt-skin — Terminal UI for ChatGPT` (2026-09-24).
      심사에서 "gpt" 가 걸리면 `Scrollback` 으로 되돌린다 (`listing.md` C안)
