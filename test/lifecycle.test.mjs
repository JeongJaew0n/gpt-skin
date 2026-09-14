// 확장이 다시 로드되면 고아가 된 콘텐츠 스크립트는 스스로 물러나야 한다.
// docs/issue/2026-09-01-orphaned-content-script.md 회귀 방지.
import fs from 'node:fs';

const src = fs.readFileSync('src/content/index.js', 'utf8');
const results = []; const t = (n, ok) => results.push([n, ok]);

// 1. 추적되지 않는 등록이 남아 있으면 안 된다
{
  const rawInterval = [...src.matchAll(/setInterval\(/g)].length;
  t('setInterval 은 every() 안에서만 쓴다', rawInterval === 1);   // every() 정의 그 자체
  t('window.addEventListener 직접 호출 없음', !/window\.addEventListener/.test(src));
  t('every/listen/observe 헬퍼 존재', /const every =/.test(src) && /const listen =/.test(src) && /const observe =/.test(src));
}

// 2. 무효화 감지와 해체가 있어야 한다
{
  t('컨텍스트 생존 확인', /chrome\.runtime && chrome\.runtime\.id/.test(src));
  t('주기적 감시', /every\(4000/.test(src));
  t('shutdown 이 disposer 를 모두 실행', /disposers\.forEach/.test(src));
  t('shutdown 이 tty 를 해체', /GT\.tty\.destroy\(\)/.test(src));
  t('pagehide 로는 해체하지 않는다', !/listen\(window, 'pagehide'/.test(src));
  t('pagehide 를 쓰지 않는 이유가 적혀 있다', /bfcache/.test(src));
  t('중복 shutdown 방지', /if \(gone\) return;/.test(src));
}

// 3. tty.destroy 는 흔적을 남기지 않아야 한다
{
  const tty = fs.readFileSync('src/content/tty.js', 'utf8');
  t('destroy 가 클래스를 뗀다', /destroy\(\)[\s\S]{0,200}classList\.remove\(HIDE_CLASS\)/.test(tty));
  t('destroy 가 페이지 스타일을 지운다', /destroy\(\)[\s\S]{0,300}gpt-term-page-style/.test(tty));
  t('destroy 가 호스트를 제거', /destroy\(\)[\s\S]{0,400}host\.remove\(\)/.test(tty));
}

// 4. 일상 경고를 확장 오류 목록에 쌓지 않는다
{
  const health = fs.readFileSync('src/content/health.js', 'utf8');
  // 주석 속 단어가 아니라 실제 호출만 본다
  t('health 는 console.warn 을 호출하지 않는다', !/console\.warn\s*\(/.test(health));
  // 흩어진 console.debug 를 GT.log 로 모았다 — :log off 로 끌 수 있어야 한다
  t('health 는 GT.log 로 남긴다', /GT\.log\(/.test(health) && !/console\.debug/.test(health));
}

// 5. 빌드 스탬프로 staleness 를 눈으로 확인할 수 있어야 한다
{
  const d = fs.readFileSync('src/shared/defaults.js', 'utf8');
  const cmds = fs.readFileSync('src/content/commands.js', 'utf8');
  t('GT_BUILD 정의', /var GT_BUILD = '/.test(d));
  t('부팅 줄에 빌드 표시', /build \$\{GT_BUILD\}/.test(src));
  t(':version 명령 존재', /def\(':version'/.test(cmds));

  // --- 버전은 manifest 하나에만 적는다 (CLAUDE.md §2) ---
  // 소스에 또 적으면 갈린다. 실제로 manifest 가 0.1.0 인 동안 화면은 따로 0.1.0 을
  // 들고 있었고, 한쪽만 올리면 조용히 어긋났을 자리다.
  const mani = JSON.parse(fs.readFileSync('manifest.json', 'utf8'));
  t('manifest 버전이 0.x.x 다', /^0\.\d+\.\d+$/.test(mani.version));
  t('GT_VERSION 을 manifest 에서 읽는다',
    /chrome\.runtime\.getManifest\(\)\.version/.test(d));
  t('읽을 수 없는 곳에서도 죽지 않는다', /catch \(_\) \{ return '0\.0\.0'; \}/.test(d));
  t('부팅 줄이 GT_VERSION 을 쓴다', /gpt-term \$\{GT_VERSION\}/.test(src));
  t(':version 도 GT_VERSION 을 쓴다', /gpt-term \$\{GT_VERSION\}/.test(cmds));

  // 소스 어디에도 버전 문자열을 박아 두지 않는다
  const srcFiles = ['src/content/index.js', 'src/content/commands.js',
    'src/shared/defaults.js', 'src/popup/popup.js', 'src/options/options.js'];
  const hardcoded = srcFiles.filter((f) => {
    const body = fs.readFileSync(f, 'utf8')
      .replace(/\/\*[\s\S]*?\*\//g, '').replace(/\/\/.*$/gm, '');   // 주석은 봐준다
    return /(?:^|[^.\d])0\.\d+\.\d+/.test(body.replace(/'0\.0\.0'/g, ''));  // 폴백은 예외
  });
  t('소스에 버전을 박아 두지 않았다', hardcoded.length === 0);
}

// 6. 물러날 때 조용히 사라지지 않는다
{
  t('물러남을 알린다', /notifyGone/.test(src));
  t('무슨 일이 있었는지 밝힌다', /확장이 다시 로드 됐습니다/.test(src));
  t('무엇을 해야 하는지 안내', /새로고침해주세요/.test(src));
  t('알림은 한 번만', /getElementById\('gpt-term-gone'\)\) return/.test(src));
  // 사유는 화면 문구에서 뺐지만 진단용으로는 남겨 둔다
  t('사유는 콘솔에 남긴다', /GT\.log\('물러남:', why/.test(src));
}

let bad = 0;
results.forEach(([n, ok]) => { if (!ok) bad++; console.log(`  ${ok ? 'PASS' : 'FAIL'}  ${n}`); });
console.log(bad ? `\n${bad}건 실패` : '\n전부 통과');
process.exit(bad ? 1 : 0);
