const orgIdInput = document.getElementById('orgId');
const cookieInput = document.getElementById('sessionCookie');
const intervalInput = document.getElementById('refreshInterval');
const statusEl = document.getElementById('status');
const saveBtn = document.getElementById('save-btn');
const testBtn = document.getElementById('test-btn');

async function load() {
  const s = await window.cloudState.getSettings();
  orgIdInput.value = s.orgId ?? '';
  intervalInput.value = s.refreshIntervalSec ?? 300;
  if (s.hasCookie) {
    cookieInput.placeholder = '(저장된 쿠키 있음 — 비우면 유지, 덮어쓰려면 새 값 입력)';
  }
}

function setStatus(msg, type) {
  statusEl.textContent = msg;
  statusEl.className = `status ${type ?? ''}`;
}

saveBtn.addEventListener('click', async () => {
  const orgId = orgIdInput.value.trim();
  const cookie = cookieInput.value.trim();
  const intervalSec = parseInt(intervalInput.value, 10);

  if (!orgId) {
    setStatus('Organization ID가 필요합니다', 'err');
    return;
  }

  const existing = await window.cloudState.getSettings();
  if (!cookie && !existing.hasCookie) {
    setStatus('Session Cookie가 필요합니다', 'err');
    return;
  }

  if (!Number.isFinite(intervalSec) || intervalSec < 10 || intervalSec > 3600) {
    setStatus('새로고침 간격은 10~3600초 사이여야 합니다', 'err');
    return;
  }

  try {
    await window.cloudState.saveSettings({
      sessionCookie: cookie || undefined,
      orgId,
      refreshIntervalSec: intervalSec
    });
    setStatus('저장 완료. 새로고침 중...', 'ok');
  } catch (e) {
    setStatus(`저장 실패: ${e.message}`, 'err');
  }
});

testBtn.addEventListener('click', () => {
  window.cloudState.refreshUsage();
  setStatus('새로고침 요청됨', 'ok');
});

window.cloudState.onUsageUpdate((payload) => {
  if (payload.status === 'ok') {
    setStatus(`✓ 성공 (출처: ${payload.data.source})`, 'ok');
  } else if (payload.status === 'auth_expired') {
    setStatus(`⚠ 쿠키 만료 — 새 Session Cookie를 입력하세요`, 'err');
  } else if (payload.status === 'error') {
    setStatus(`✗ ${payload.message}`, 'err');
  } else if (payload.status === 'unconfigured') {
    setStatus('설정 필요', 'err');
  }
});

load();
