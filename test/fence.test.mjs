// 코드 펜스 — 정보 문자열(info string)과 닫는 펜스 길이 (CommonMark, 리뷰 2026-11-03).
// 예전에는 '```c#' · '```python title="x"' 를 펜스로 못 알아봐 닫는 ``` 가 새 펜스를 열고 답의 나머지가 코드가 됐다.
// '````' 로 연 블록(마크다운 안에 코드를 넣은 README 예시)은 안쪽 ``` 에서 닫혀 중간부터 깨졌다.
import fs from 'node:fs'; import vm from 'node:vm';

const results = []; const t = (n, ok) => results.push([n, ok]);
const sb = { console, Object, Array, String, Number, JSON, RegExp, Math, document: {}, GT: { config: { get: () => 'domain' } } };
sb.window = sb; vm.createContext(sb);
vm.runInContext(fs.readFileSync('src/content/markdown.js', 'utf8'), sb, { filename: 'markdown.js' });
const M = sb.GT.markdown;
const B = (src) => JSON.parse(JSON.stringify(M.blocks(src)));
const shape = (src) => B(src).map((b) => (b.type === 'code' ? `code[${b.lang}:${b.lines.length}]` : b.type)).join(',');

// ---------------------------------------------------------------- 정보 문자열
{
  t('평범한 언어', shape('```python\nprint(1)\n```\n뒤') === 'code[python:1],para');
  t("'c#' 도 펜스다", shape('```c#\nvar x = 1;\n```\n뒤 문단') === 'code[c#:1],para');
  t('언어 뒤 낱말은 언어가 아니다', shape('```python title="demo.py"\nprint(1)\n```\n뒤') === 'code[python:1],para');
  t('언어 없는 펜스', shape('```\nx\n```') === 'code[:1]');
  t('물결 펜스', shape('~~~bash\nls\n~~~\n뒤') === 'code[bash:1],para');
  t('백틱 펜스의 정보 문자열에 백틱이 있으면 펜스가 아니다', shape('``` `a` ```') === 'para');
}

// ---------------------------------------------------------------- 닫는 펜스
{
  const readme = '````markdown\n# 제목\n\n```bash\nnpm i\n```\n\n끝\n````\n뒤 문단';
  t('네 개로 연 블록은 안쪽 ``` 에서 닫히지 않는다', shape(readme) === 'code[markdown:7],para');
  t('안쪽 펜스는 본문 그대로', B(readme)[0].lines.join('|') === '# 제목||```bash|npm i|```||끝');
  t('물결 블록은 백틱에 닫히지 않는다', shape('~~~\n```\nx\n~~~\n뒤') === 'code[:2],para');
  t('더 긴 닫는 펜스는 닫는다', shape('```\nx\n`````\n뒤') === 'code[:1],para');
  t('닫히지 않으면 끝까지 코드 (스트리밍 중)', shape('```js\nconst a = 1;\n') === 'code[js:2]');
}

// ---------------------------------------------------------------- 목록 안 들여쓴 펜스
{
  const code = B('1. 설치합니다\n   ```python\n   def f():\n       return 1\n   ```\n2. 끝').find((b) => b.type === 'code');
  t('펜스가 들여쓴 만큼 본문에서 덜어 낸다', code && code.lines.join('|') === 'def f():|    return 1');
  const shallow = B('  ```\n x\n    y\n  ```').find((b) => b.type === 'code');
  t('덜 들여쓴 줄은 있는 만큼만 덜어 낸다', shallow && shallow.lines.join('|') === 'x|  y');
}

let bad = 0;
results.forEach(([n, ok]) => { if (!ok) bad++; console.log(`  ${ok ? 'PASS' : 'FAIL'}  ${n}`); });
console.log(bad ? `\n${bad}건 실패` : '\n전부 통과');
process.exit(bad ? 1 : 0);
