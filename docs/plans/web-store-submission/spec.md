# spec — web-store-submission

## 목표

gpt-skin 을 Chrome 웹스토어에 **게시 신청할 수 있는 상태**로 만든다.
코드 로직이 아니라 브랜딩·공시·패키징이 대상이다.

## 배경 — 왜 지금 상태로는 안 되는가

2026-09-04 전체 코드 점검 결과, **로직·보안 측면에는 심사에 걸릴 것이 없다.**

| 점검 | 결과 |
|---|---|
| 원격 코드 실행 (`eval`·`new Function`·원격 스크립트) | 0건 |
| `innerHTML` 계열 | 0건 (전부 `createElement`) |
| 외부 엔드포인트 | 0건 (chatgpt.com 상대 경로뿐) |
| 텔레메트리·애널리틱스 | 없음 |
| 권한 | `storage` 1개 + 호스트 `https://chatgpt.com/*` 1개 |
| `postMessage` 대상 | `location.origin` (와일드카드 아님) |
| accessToken 취급 | 메모리 전용·5분 TTL·저장/로그 안 함 |
| 콘솔 로그 | 건수만, 대화 본문 없음 |
| `web_accessible_resources` / `externally_connectable` | 둘 다 없음 |

막는 것은 아래 세 가지다.

1. **아이콘이 OpenAI 마크 파생물** — Impersonation and Intellectual Property 위반 소지
2. **개인정보처리방침 없음** — 대화 내용(personal communications)을 다루므로 필수
3. **설명문이 스토어용이 아님** — "개인용 언팩 확장" 문구

## 범위

- 포함
  1. 아이콘 재작업 — `>_` 프롬프트 모티프. OpenAI 육각 매듭 형태 완전 제거
  2. 스토어용 이름·설명문 (짧은 설명 132자 제한 / 상세 설명)
  3. 개인정보처리방침 초안 (마크다운. 게시용 URL 은 사용자가 정한다)
  4. 권한 사유서 + 심사 노트 초안 (대시보드 입력용)
  5. 배포 패키지 스크립트 — 확장 동작에 필요한 파일만 zip

- 제외
  - 실제 스토어 제출·결제·계정 등록 (사용자가 직접)
  - 개인정보처리방침 호스팅 (URL 확보는 사용자 몫)
  - 스토어 스크린샷·프로모 타일 제작
  - 코드 로직 변경 (점검 결과 불필요)

## 완료 조건 (Definition of Done)

- [ ] `icons/icon{16,32,48,128}.png` 가 `>_` 모티프로 교체되고, OpenAI 육각 매듭 형태가 남아 있지 않다
- [ ] 16px 에서 형태가 읽힌다 (실제 렌더로 확인)
- [ ] `manifest.json` 의 `name`·`description` 이 스토어 리스팅에 그대로 쓸 수 있는 문구다
- [ ] `docs/store/privacy-policy.md` 가 실제 코드 동작과 일치한다 (수집 항목·저장 위치·전송 여부)
- [ ] `docs/store/review-notes.md` 에 권한별 사유와 심사관용 설명이 있다
- [ ] `tools/package.sh` 가 만든 zip 이 언팩 로드로 정상 동작한다
- [ ] zip 에 `docs/`·`test/`·`*.dc.html`·`icons/source.png` 가 없다

## 인터페이스 / 산출물 경로

```
icons/icon{16,32,48,128}.png     교체
icons/source.png                 새 마스터 (또는 SVG 소스)
tools/make-icons.py              새 모티프에 맞게 수정
tools/package.sh                 신규 — 배포 zip 생성
docs/store/listing.md            신규 — 이름·짧은 설명·상세 설명
docs/store/privacy-policy.md     신규
docs/store/review-notes.md       신규 — 권한 사유서 + 심사 노트
manifest.json                    name·description 수정
```

## 의존성

- Python 3 + Pillow (`tools/make-icons.py` 가 이미 쓰고 있음)
- `zip` (macOS 기본)
- 아이콘 시안 확정 — 사용자 선택 필요

## 비고

- 이름에 "gpt" 가 들어가는 것은 OpenAI 상표 위험이 있다. 스토어 이름은 중립어로 두고
  ChatGPT 언급은 설명문으로 내리는 방향을 기본안으로 한다. 최종 결정은 사용자가 한다.
- 비공개 내부 API(`/backend-api/*`)에 PATCH 로 쓰는 기능(이름변경·고정·보관·삭제)은
  CWS 가 직접 금지하지 않지만 호스트 사업자 신고 시 내려갈 수 있다. 심사 노트에 명시한다.
- `:messup` 이 가짜 응답을 화면에 삽입하는 것은 "deceptive" 로 오독될 여지가 있다.
  라벨이 붙어 있고 사용자가 직접 실행하는 기능임을 심사 노트에 적는다.
