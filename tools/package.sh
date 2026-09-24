#!/usr/bin/env bash
# 웹스토어 업로드용 zip 을 만든다.
#
#     tools/package.sh
#
# 화이트리스트 방식이다 — 넣을 것을 여기 적고, 나머지는 전부 뺀다.
# 블랙리스트로 하면 새 파일이 생길 때마다 조용히 따라 들어간다.
#
# 확장 동작에 필요한 것만 담는다. 목업(*.dc.html)·문서·테스트·스토어용 512px
# 아이콘은 넣지 않는다. 목업은 원본 UI 를 베낀 디자인 사본이라 심사에서
# 괜한 설명거리가 되고, 나머지는 실행에 쓰이지 않는다.
set -uo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
cd "$ROOT"

OUT_DIR="dist"
FAILED=0
note() { printf '  %s\n' "$*"; }
bad()  { printf '  ✗ %s\n' "$*"; FAILED=1; }

# ---------------------------------------------------------------- 넣을 것
INCLUDE=(
  manifest.json
  icons/icon16.png
  icons/icon32.png
  icons/icon48.png
  icons/icon128.png
  _locales
  src
)

# ---------------------------------------------------------------- 사전 점검
echo "▮ 점검"

command -v zip >/dev/null 2>&1 || { bad "zip 이 없다"; exit 1; }
command -v python3 >/dev/null 2>&1 || { bad "python3 이 없다"; exit 1; }

python3 -c "import json,sys;json.load(open('manifest.json'))" 2>/dev/null \
  && note "manifest.json 파싱 OK" || bad "manifest.json 이 올바른 JSON 이 아니다"

VERSION=$(python3 -c "import json;print(json.load(open('manifest.json'))['version'])" 2>/dev/null || echo "")
NAME_OK=$(python3 - <<'PY' 2>/dev/null
import json
m = json.load(open('manifest.json'))
d = m.get('description', '')
print('개인용' in d or '언팩' in d or 'unpacked' in d.lower())
PY
)
[ "$NAME_OK" = "False" ] && note "description 이 스토어용 문구다" \
  || bad "description 에 '개인용 언팩' 류 문구가 남아 있다 — 스토어 리스팅에 부적절"

# 매니페스트가 가리키는 파일이 실제로 있는지
python3 - <<'PY'
import json, pathlib, sys
m = json.load(open('manifest.json'))
missing = []
def check(p):
    if p and not pathlib.Path(p).is_file():
        missing.append(p)
for p in (m.get('icons') or {}).values(): check(p)
for p in ((m.get('action') or {}).get('default_icon') or {}).values(): check(p)
check((m.get('action') or {}).get('default_popup'))
check((m.get('background') or {}).get('service_worker'))
check((m.get('options_ui') or {}).get('page'))
for cs in m.get('content_scripts') or []:
    for p in cs.get('js') or []: check(p)
    for p in cs.get('css') or []: check(p)
if missing:
    print('MISSING ' + ' '.join(missing), file=sys.stderr); sys.exit(1)
PY
if [ $? -eq 0 ]; then note "매니페스트가 가리키는 파일 전부 존재"; else bad "매니페스트가 없는 파일을 가리킨다"; fi

# default_locale 을 선언하고 _locales 가 없으면 크롬이 확장을 아예 로드하지 않는다
DL=$(python3 -c "import json;print(json.load(open('manifest.json')).get('default_locale',''))" 2>/dev/null || echo "")
if [ -n "$DL" ]; then
  if [ -f "_locales/$DL/messages.json" ]; then
    note "default_locale=$DL · _locales/$DL/messages.json 존재"
  else
    bad "default_locale=$DL 인데 _locales/$DL/messages.json 이 없다 — 확장이 로드되지 않는다"
  fi
fi

# 문법 검사 — 깨진 스크립트를 올리지 않는다
if command -v node >/dev/null 2>&1; then
  SYNTAX_BAD=0
  while IFS= read -r f; do
    node --check "$f" >/dev/null 2>&1 || { bad "문법 오류: $f"; SYNTAX_BAD=1; }
  done < <(find src -name '*.js' | sort)
  [ $SYNTAX_BAD -eq 0 ] && note "src 의 모든 .js 문법 검사 통과"
else
  note "node 가 없어 문법 검사는 건너뛴다"
fi

# 원격 코드·외부 주소가 들어오지 않았는지 (정책 위반 사전 차단)
if grep -rn "eval(\|new Function(" src/ >/dev/null 2>&1; then
  bad "src 에 eval / new Function 이 있다 — 웹스토어 정책 위반"
else
  note "동적 코드 실행 없음"
fi
if grep -rEn "https?://" src/ | grep -v "w3\.org" | grep -v "chatgpt\.com" >/dev/null 2>&1; then
  bad "src 에 외부 주소가 있다 — 확인 필요"
  grep -rEn "https?://" src/ | grep -v "w3\.org" | grep -v "chatgpt\.com" | sed 's/^/      /'
else
  note "외부 주소 없음"
fi

echo
echo "▮ 담기"

# ---------------------------------------------------------------- 만들기
STAGE="$(mktemp -d)"
trap 'rm -rf "$STAGE"' EXIT

for item in "${INCLUDE[@]}"; do
  if [ ! -e "$item" ]; then bad "넣을 파일이 없다: $item"; continue; fi
  mkdir -p "$STAGE/$(dirname "$item")"
  cp -R "$item" "$STAGE/$(dirname "$item")/"
  note "+ $item"
done

# 따라 들어온 부스러기 제거
find "$STAGE" \( -name '.DS_Store' -o -name '*.map' -o -name '__pycache__' \) -exec rm -rf {} + 2>/dev/null

# 들어가서는 안 되는 것이 섞였는지 최종 확인
LEAK=$(cd "$STAGE" && find . \( -name '*.dc.html' -o -name 'canvas.json' -o -name 'icon512.png' \
  -o -path './docs*' -o -path './test*' -o -path './tools*' -o -name '*.md' \) | sed 's|^\./||')
if [ -n "$LEAK" ]; then
  bad "패키지에 불필요한 것이 섞였다:"; echo "$LEAK" | sed 's/^/      /'
else
  note "불필요한 파일 없음 (문서·테스트·목업·도구 전부 제외)"
fi

mkdir -p "$OUT_DIR"
ZIP="$ROOT/$OUT_DIR/gpt-skin-${VERSION:-0.0.0}.zip"
rm -f "$ZIP"
(cd "$STAGE" && zip -q -r -X "$ZIP" .) || bad "zip 생성 실패"

echo
echo "▮ 결과"
if [ -f "$ZIP" ]; then
  note "$OUT_DIR/$(basename "$ZIP")"
  note "크기  $(du -h "$ZIP" | cut -f1)"
  note "파일  $(unzip -l "$ZIP" | tail -1 | awk '{print $2}')개"
fi

echo
if [ $FAILED -eq 0 ]; then
  echo "  통과. 이 zip 을 업로드하면 된다."
  echo "  스토어 아이콘은 icons/icon512.png 를 따로 올린다 (패키지에는 넣지 않는다)."
else
  echo "  ✗ 위 문제를 먼저 고쳐라. zip 은 만들어졌지만 올리지 마라."
fi
exit $FAILED
