const { net } = require('electron');

const BASE = 'https://claude.ai';

const USER_AGENT =
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 ' +
  '(KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36';

function request(url, sessionCookie) {
  return new Promise((resolve, reject) => {
    const req = net.request({
      method: 'GET',
      url,
      redirect: 'follow'
    });

    req.setHeader('Cookie', `sessionKey=${sessionCookie}`);
    req.setHeader('User-Agent', USER_AGENT);
    req.setHeader('Accept', 'application/json, text/plain, */*');
    req.setHeader('Accept-Language', 'ko-KR,ko;q=0.9,en;q=0.8');
    req.setHeader('Referer', `${BASE}/`);

    let body = '';
    req.on('response', (res) => {
      res.on('data', (chunk) => (body += chunk.toString('utf8')));
      res.on('end', () => {
        if (res.statusCode >= 200 && res.statusCode < 300) {
          try {
            resolve({ status: res.statusCode, json: JSON.parse(body), raw: body });
          } catch {
            resolve({ status: res.statusCode, json: null, raw: body });
          }
        } else if (res.statusCode === 401 || res.statusCode === 403) {
          const err = new Error(`쿠키 만료 또는 인증 실패 (HTTP ${res.statusCode})`);
          err.code = 'AUTH_EXPIRED';
          reject(err);
        } else {
          reject(new Error(`HTTP ${res.statusCode}: ${body.slice(0, 200)}`));
        }
      });
      res.on('error', reject);
    });
    req.on('error', reject);
    req.end();
  });
}

/**
 * claude.ai 사용량 조회.
 * 비공식 엔드포인트라 실제 구조가 확인되면 normalizeUsage()를 맞춰 수정해야 함.
 * 여러 후보 경로를 시도한다.
 */
async function fetchUsage(sessionCookie, orgId) {
  const candidates = [
    `${BASE}/api/organizations/${orgId}/usage`,
    `${BASE}/api/organizations/${orgId}/usage_limits`,
    `${BASE}/api/bootstrap/${orgId}/statsig`,
    `${BASE}/api/organizations/${orgId}`
  ];

  const errors = [];
  for (const url of candidates) {
    try {
      const res = await request(url, sessionCookie);
      if (res.json) {
        return {
          source: url,
          rawJson: res.json,
          normalized: normalizeUsage(res.json)
        };
      }
    } catch (err) {
      if (err.code === 'AUTH_EXPIRED') throw err;
      errors.push(`${url} → ${err.message}`);
    }
  }
  throw new Error(`모든 엔드포인트 실패:\n${errors.join('\n')}`);
}

/**
 * claude.ai /api/organizations/{orgId}/usage 응답 구조 (2026-04-21 확인):
 *   {
 *     five_hour:        { utilization: 9,  resets_at: "..." },  // 현재 세션
 *     seven_day:        { utilization: 25, resets_at: "..." },  // 주간 전체
 *     seven_day_sonnet: { utilization: 23, resets_at: "..." },
 *     seven_day_opus:   null | { utilization, resets_at },
 *     extra_usage:      { is_enabled, monthly_limit, used_credits, ... }
 *   }
 */
function normalizeUsage(json) {
  const read = (bucket) => ({
    percent: bucket && typeof bucket.utilization === 'number' ? bucket.utilization : null,
    resetAt: bucket?.resets_at ?? null
  });

  const session = read(json.five_hour);
  const weekly = read(json.seven_day);
  const sonnet = read(json.seven_day_sonnet);
  const opus = read(json.seven_day_opus);

  return {
    sessionPercent: session.percent,
    sessionResetAt: session.resetAt,
    weeklyPercent: weekly.percent,
    weeklyResetAt: weekly.resetAt,
    sonnetPercent: sonnet.percent,
    sonnetResetAt: sonnet.resetAt,
    opusPercent: opus.percent,
    opusResetAt: opus.resetAt
  };
}

module.exports = { fetchUsage };
