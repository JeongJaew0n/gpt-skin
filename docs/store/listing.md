# 스토어 리스팅 문구

Chrome 웹스토어 개발자 대시보드에 그대로 붙여 넣을 문구다.
확정되지 않은 항목은 **TODO** 로 표시했다.

---

## 이름

**권장 — `gpt-skin — Terminal UI for ChatGPT`**

| 안 | 이름 | 상표 위험 | 비고 |
|---|---|---|---|
| **A (현재)** | `gpt-skin — Terminal UI for ChatGPT` | 중간~높음 | "for ChatGPT" 는 호환성을 밝히는 나열적(nominative) 사용이지만, 이름 본체에 "gpt" 가 들어간다 |
| B | `gpt-skin` | 중간~높음 | ChatGPT 언급을 설명문으로만 내린다. "gpt" 위험은 그대로다 |
| C (과거안) | `Scrollback — Terminal UI for ChatGPT` | 낮음~중간 | 2026-09 에 잠시 썼던 이름. "GPT" 가 이름에 없어 가장 안전했다 |

이름 이력: `gpt-term` → `Scrollback` → `gpt-skin` (2026-09-24 확정). "GPT" 를 이름에 넣는
상표 위험은 알고 선택했다. 심사에서 이름 변경을 요구받으면 C 안으로 되돌린다.

> **주의** — 이름·설명·아이콘 어디에도 OpenAI 나 ChatGPT 의 로고·마크를 쓰지 않는다.
> "ChatGPT" 라는 낱말을 **호환 대상을 밝히는 용도로만** 쓴다.

---

## 짧은 설명 (132자 제한)

**한국어 (75자)**

```
ChatGPT 웹을 터미널처럼 씁니다. 키보드로 대화를 넘기고 명령으로 이름·보관·삭제까지. 원본 UI 는 지우지 않고 덮어 그립니다.
```

**English (120자)**

```
Turns the ChatGPT web app into a keyboard-driven terminal UI. Commands, an overlay chat list, and a one-key switch back.
```

---

## 상세 설명 (한국어)

```
ChatGPT 웹을 터미널 화면으로 다시 그립니다.

원본 UI 를 지우지 않습니다. 그 위를 덮고, 확장이 따로 들고 있는 상태에서 다시 그립니다.
Ctrl+` 한 번이면 언제든 원본으로 돌아갑니다.

■ 무엇이 되나

· 키보드 중심 조작 — 화면 아무 데나 클릭하고 바로 타이핑하면 입력창으로 들어갑니다
· 명령 — :ls 로 대화 목록, :open 으로 열기, :rename · :pin · :archive · :rm 으로 정리
· Tab 자동완성 — 명령도, 인자도 완성됩니다 (:theme ⇥ 는 테마 이름을, :mv 3 ⇥ 는 프로젝트를)
· 대화 목록 오버레이 — Ctrl+B. 폭을 드래그로 조절하고, 프로젝트는 펼칠 때 읽어옵니다
· 모델과 추론 수준을 상단바에서 바로 바꿉니다
· 모델이 생각하는 동안 "생각 중" 표시와 경과 시간
· 코드블록과 응답 전체를 복사하는 버튼
· 검색 인용은 번호가 곧 링크입니다 — [1 zdnet.co.kr] 처럼 어디로 가는지 보입니다
· 테마 · 글자 크기 · 줄 간격 · 본문 폭을 설정에서 바꿉니다

■ 어떻게 동작하나

확장은 chatgpt.com 안에서만 동작합니다. 그 페이지가 이미 쓰고 있는 요청을 읽어
대화를 화면에 다시 그릴 뿐, 어떤 데이터도 외부로 보내지 않습니다.

원본 페이지 구조가 바뀌어 확장이 따라가지 못하면 배지로 알려 줍니다.
설정에서 '원본 UI 로 자동 복귀' 를 고르면 그때 알아서 물러납니다.

■ 데이터

· 대화 내용을 서버로 보내지 않습니다. 분석 도구도, 광고도 없습니다
· 기기에 남는 것은 설정값과 대화 목록 캐시(제목·id)뿐입니다
· 자세한 내용은 개인정보처리방침을 참고하세요

■ 알아 두실 것

· OpenAI 와 제휴하거나 후원받은 확장이 아닙니다. ChatGPT 는 OpenAI 의 상표입니다
· 첨부 · 이미지 업로드 · 메시지 편집 · 재생성은 아직 지원하지 않습니다.
  이미지와 툴 결과는 자리표시자로만 표시되며, Ctrl+` 로 원본에서 확인할 수 있습니다
· Chrome 111 이상이 필요합니다
```

---

## 상세 설명 (English)

```
A terminal-style reskin for the ChatGPT web app.

It does not remove the original interface. It covers it and redraws the conversation
from the extension's own state. Ctrl+` switches back at any time.

■ Features

· Keyboard-first — click anywhere and start typing; input goes to the prompt line
· Commands — :ls to list, :open to switch, :rename · :pin · :archive · :rm to organize
· Tab completion for commands and their arguments
· Overlay chat list (Ctrl+B) with drag-to-resize and lazy-loaded projects
· Switch model and reasoning effort from the top bar
· A "thinking" indicator with elapsed time while the model reasons
· Copy buttons for code blocks and for whole replies
· Search citations show the source domain — [1 zdnet.co.kr] — and link straight to it
· Theme, font size, line height and wrap width in settings

■ How it works

The extension runs only on chatgpt.com. It reads the requests that page already makes
and redraws the conversation. It sends no data anywhere else.

If the page's structure changes and the extension can no longer follow it, a badge says so.
You can set it to fall back to the original UI automatically.

■ Data

· Conversation content is never sent to any server. No analytics, no ads
· Only settings and a chat-list cache (titles and ids) are stored on your device
· See the privacy policy for details

■ Notes

· Not affiliated with or endorsed by OpenAI. ChatGPT is a trademark of OpenAI
· Attachments, image upload, message editing and regeneration are not supported yet.
  Images and tool results appear as placeholders — press Ctrl+` to view them in the original UI
· Requires Chrome 111 or newer
```

---

## 카테고리 · 기타

| 항목 | 값 |
|---|---|
| 카테고리 | Productivity (생산성) |
| 언어 | 한국어 (기본), English |
| 개인정보처리방침 URL | **TODO** — `docs/store/privacy-policy.md` 를 공개된 곳에 올리고 URL 확보 |
| 지원 사이트 / 홈페이지 | **TODO** — GitHub 저장소 URL |
| 스크린샷 (1280×800 또는 640×400, 1~5장) | **TODO** — 이번 범위 밖 |
| 프로모 타일 | 선택. **TODO** |
| 스토어 아이콘 | `icons/icon512.png` |

### 스크린샷으로 찍으면 좋을 화면

1. 대화가 떠 있는 기본 화면 (상단바 · 스크롤백 · 입력줄)
2. 사이드바 오버레이를 연 상태
3. `:` 를 쳐서 명령 후보가 뜬 상태 (Tab 자동완성)
4. 코드블록 + 복사 아이콘 + 인용 각주
5. 툴바 패널 (토글 둘)
