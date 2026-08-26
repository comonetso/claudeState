// Codex 계정 사용량 조회.
//
// Claude 쪽(api.js)은 claude.ai 에 HTTP 를 쏘지만, Codex 는 공개 HTTP 엔드포인트가 없다.
// 대신 로컬에 설치된 codex CLI 를 `app-server` 모드로 띄우고 JSON-RPC 로 물어본다.
// 즉 이 모듈은 네트워크가 아니라 자식 프로세스를 다룬다.
//
// 정책:
//   - 어떤 실패도 null 로 끝낸다. Codex 조회가 안 되더라도 Claude 표시는 그대로여야 한다.
//   - 커맨드라인에 자격증명을 싣지 않는다. 인증은 codex CLI 가 ~/.codex/auth.json 으로 알아서 한다.
//   - 반드시 타임아웃을 걸고 자식 프로세스를 회수한다.

const { spawn } = require('child_process');

const IS_WIN = process.platform === 'win32';

// codex 는 npm 전역 설치 시 codex.cmd 셤으로 깔린다(실측: %APPDATA%\npm\codex.cmd).
// .cmd 는 셸을 거쳐야만 실행되므로 Windows 에서는 shell 이 필수다.
const SPAWN_OPTS = { shell: IS_WIN, windowsHide: true };

// app-server 왕복 상한. 이 PC 실측 왕복은 1초 미만이라 넉넉한 방어값이다.
const PROBE_TIMEOUT_MS = 15000;
// where/which 는 즉시 끝난다. 걸리는 경우는 비정상이므로 짧게 끊는다.
const DETECT_TIMEOUT_MS = 5000;

/**
 * 이 PC 에 codex CLI 가 설치되어 있는가.
 * 설치 경로를 반환하고, 없으면 null. 설정 토글 없이 이 결과만으로 Codex 표시를 켜고 끈다.
 */
function detect() {
  return new Promise((resolve) => {
    let child;
    try {
      child = spawn(IS_WIN ? 'where' : 'which', ['codex'], {
        ...SPAWN_OPTS,
        stdio: ['ignore', 'pipe', 'ignore']
      });
    } catch {
      resolve(null);
      return;
    }

    let out = '';
    let settled = false;
    const finish = (v) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      try { child.kill(); } catch {}
      resolve(v);
    };
    const timer = setTimeout(() => finish(null), DETECT_TIMEOUT_MS);

    child.stdout.on('data', (d) => (out += d.toString('utf8')));
    child.on('error', () => finish(null));
    child.on('exit', (code) => {
      if (code !== 0) return finish(null);
      // where 는 여러 줄을 뱉을 수 있다(codex, codex.cmd). 첫 줄이면 충분하다.
      const first = out.split(/\r?\n/).map((s) => s.trim()).filter(Boolean)[0];
      finish(first || null);
    });
  });
}

function clampPct(n) {
  return Math.max(0, Math.min(100, Math.round(n)));
}

/**
 * app-server 가 주는 창 하나를 위젯이 쓰는 형태로 바꾼다.
 *
 * resetsAt 은 epoch "초"다 (실측 확인: 1787744074 → 2026-08-26 20:34).
 * Claude 쪽 normalized 는 ISO 문자열을 쓰므로 여기서 맞춰 둔다. 그래야 위젯 렌더러가
 * 두 공급자에 같은 시간 포맷 함수를 쓸 수 있다.
 */
function readWindow(raw) {
  if (!raw || typeof raw !== 'object') return null;
  if (typeof raw.usedPercent !== 'number') return null;
  const sec = raw.resetsAt;
  return {
    percent: clampPct(raw.usedPercent),
    windowMinutes: typeof raw.windowDurationMins === 'number' ? raw.windowDurationMins : 0,
    resetAt: typeof sec === 'number' && Number.isFinite(sec)
      ? new Date(sec * 1000).toISOString()
      : null
  };
}

/**
 * rateLimits 응답을 위젯이 쓰는 형태로 정규화.
 *
 * 필드 이름이 직관적이지 않다:
 *   primary   → 5시간 창 (windowDurationMins 300)
 *   secondary → 주간 창  (windowDurationMins 10080)
 *   usedPercent 는 "소진율"이다. ChatGPT 사용량 화면은 잔여를 보여주므로 서로 여집합이다.
 *
 * hasFiveHour 를 planType 으로 판정하지 않는 이유:
 * 지금은 Plus 에만 5시간 한도가 있고 Pro 는 주간 전용이지만 OpenAI 가 Pro 에도 도입을
 * 예고했다. 게다가 Pro 계정이 planType 에 정확히 어떤 문자열을 보내는지 Plus 계정에서는
 * 확인할 방법이 없다. "5시간 창이 실제로 오는가"를 묻으면 그날이 와도 코드가 저절로 따라간다.
 * 규칙이 바뀌면 이 한 줄만 고치면 된다.
 */
function normalize(rl) {
  if (!rl || typeof rl !== 'object') return null;
  const primary = readWindow(rl.primary);
  const secondary = readWindow(rl.secondary);
  if (!primary && !secondary) return null;

  return {
    hasFiveHour: !!primary,
    sessionPercent: primary ? primary.percent : null,
    sessionResetAt: primary ? primary.resetAt : null,
    weeklyPercent: secondary ? secondary.percent : null,
    weeklyResetAt: secondary ? secondary.resetAt : null,
    planType: typeof rl.planType === 'string' ? rl.planType : null,
    hasCredits: !!(rl.credits && rl.credits.hasCredits),
    observedAt: new Date().toISOString()
  };
}

/**
 * codex app-server 에 현재 계정 한도를 묻는다.
 *
 * 프로토콜은 개행으로 구분된 JSON 이다. 파싱 안 되는 줄은 던지지 않고 흘려보내서,
 * 나중에 프로토콜이 바뀌더라도 "조회 불가"로 degrade 되게 한다.
 * 실패 사유(바이너리 없음 / 미로그인 / 타임아웃)를 가리지 않고 전부 null 이다.
 */
function fetchRateLimits(execPath = 'codex') {
  return new Promise((resolve) => {
    let child;
    try {
      child = spawn(execPath, ['app-server'], {
        ...SPAWN_OPTS,
        stdio: ['pipe', 'pipe', 'pipe']
      });
    } catch (e) {
      console.warn(`[claudeState] codex spawn 실패: ${e.message}`);
      resolve(null);
      return;
    }

    let buf = '';
    let settled = false;

    const finish = (result, why) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      try { child.kill(); } catch {}
      if (!result && why) console.warn(`[claudeState] codex 사용량 조회 실패: ${why}`);
      resolve(result);
    };

    const timer = setTimeout(
      () => finish(null, `${PROBE_TIMEOUT_MS}ms 타임아웃`),
      PROBE_TIMEOUT_MS
    );

    const send = (obj) => {
      try { child.stdin.write(JSON.stringify(obj) + '\n'); } catch { /* 파이프 닫힘 */ }
    };

    child.stdout.on('data', (d) => {
      buf += d.toString('utf8');
      let i;
      while ((i = buf.indexOf('\n')) >= 0) {
        const line = buf.slice(0, i).trim();
        buf = buf.slice(i + 1);
        if (!line) continue;
        let msg;
        try { msg = JSON.parse(line); } catch { continue; }

        if (msg.id === 0 && msg.result !== undefined) {
          send({ method: 'initialized', params: {} });
          send({ id: 1, method: 'account/rateLimits/read', params: {} });
          continue;
        }
        if (msg.id === 1) {
          if (msg.error) {
            return finish(null, `RPC 오류: ${JSON.stringify(msg.error).slice(0, 200)}`);
          }
          const n = normalize(msg.result?.rateLimits);
          return finish(n, n ? '' : '응답에 rateLimits 없음');
        }
      }
    });

    // stderr 는 계정 정보를 실어 나를 수 있으므로 로그에 그대로 옮기지 않는다.
    child.stderr.on('data', () => {});
    child.on('error', (e) => finish(null, `spawn 오류: ${e.message}`));
    child.on('exit', (code) => finish(null, `app-server 조기 종료 (code ${code})`));

    send({
      id: 0,
      method: 'initialize',
      params: { clientInfo: { name: 'claude-state', version: '0.4.0' } }
    });
  });
}

module.exports = { detect, fetchRateLimits };
