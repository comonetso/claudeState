const sessionBar = document.getElementById('session-bar');
const weeklyBar = document.getElementById('weekly-bar');
const sessionText = document.getElementById('session-text');
const weeklyText = document.getElementById('weekly-text');
const sessionWhen = document.getElementById('session-when');
const weeklyWhen = document.getElementById('weekly-when');
const statusEl = document.getElementById('status');
const widget = document.getElementById('widget');

let lastPayload = null;

function setBar(barEl, textEl, percent) {
  if (percent == null || Number.isNaN(percent)) {
    barEl.style.width = '0%';
    textEl.textContent = '--';
    barEl.classList.remove('warn', 'danger');
    return;
  }
  const p = Math.max(0, Math.min(100, Math.round(percent)));
  barEl.style.width = `${p}%`;
  textEl.textContent = `${p}%`;
  barEl.classList.remove('warn', 'danger');
  if (p >= 90) barEl.classList.add('danger');
  else if (p >= 70) barEl.classList.add('warn');
}

function resetAtLabel(iso) {
  if (!iso) return '--';
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '--';
  const now = new Date();
  const sameDay =
    d.getFullYear() === now.getFullYear() &&
    d.getMonth() === now.getMonth() &&
    d.getDate() === now.getDate();
  const h = d.getHours();
  const ap = h < 12 ? '오전' : '오후';
  const h12 = h % 12 === 0 ? 12 : h % 12;
  const mm = String(d.getMinutes()).padStart(2, '0');
  const timePart = `${ap} ${h12}:${mm}`;
  if (sameDay) return timePart;
  const days = ['일', '월', '화', '수', '목', '금', '토'];
  return `${timePart} (${days[d.getDay()]})`;
}

function sessionWhenLabel(iso) {
  const base = resetAtLabel(iso);
  if (base === '--') return '--';
  const until = untilHuman(iso);
  if (until === '--') return base;
  return `${base} (${until})`;
}

function untilHuman(iso) {
  if (!iso) return '--';
  const diff = new Date(iso).getTime() - Date.now();
  if (!Number.isFinite(diff) || diff <= 0) return '곧 재설정';
  const mins = Math.floor(diff / 60000);
  const days = Math.floor(mins / 1440);
  const hours = Math.floor((mins % 1440) / 60);
  const m = mins % 60;
  if (days >= 1) return `${days}일 ${hours}시간 후`;
  if (hours >= 1) return `${hours}시간 ${m}분 후`;
  return `${m}분 후`;
}

function render(payload) {
  lastPayload = payload;
  widget.classList.remove('auth-expired');

  if (payload.status === 'unconfigured') {
    statusEl.textContent = '설정 필요';
    statusEl.className = 'status error';
    setBar(sessionBar, sessionText, null);
    setBar(weeklyBar, weeklyText, null);
    sessionWhen.textContent = '쿠키 입력';
    weeklyWhen.textContent = '우클릭 → 설정';
    widget.title = '우클릭 → 설정 (쿠키/orgId 입력 필요)';
    return;
  }

  if (payload.status === 'auth_expired') {
    widget.classList.add('auth-expired');
    statusEl.textContent = '!';
    statusEl.className = 'status error';
    sessionText.textContent = '!!';
    weeklyText.textContent = '!!';
    sessionWhen.textContent = '쿠키 만료';
    weeklyWhen.textContent = '우클릭→설정 갱신';
    widget.title = `⚠ 쿠키 만료/인증 실패\n${payload.message}\n\n트레이 우클릭 → 설정 → Session Cookie 재입력`;
    return;
  }

  if (payload.status === 'loading') {
    statusEl.textContent = '···';
    statusEl.className = 'status';
    return;
  }

  if (payload.status === 'error') {
    statusEl.textContent = '오류';
    statusEl.className = 'status error';
    sessionWhen.textContent = '-';
    weeklyWhen.textContent = '-';
    widget.title = `오류: ${payload.message}`;
    return;
  }

  if (payload.status === 'ok' && payload.data) {
    statusEl.textContent = '';
    statusEl.className = 'status ok';
    const n = payload.data.normalized;
    setBar(sessionBar, sessionText, n.sessionPercent);
    setBar(weeklyBar, weeklyText, n.weeklyPercent);
    sessionWhen.textContent = sessionWhenLabel(n.sessionResetAt);
    weeklyWhen.textContent = resetAtLabel(n.weeklyResetAt);

    const tooltip = [
      `세션: ${n.sessionPercent ?? '?'}% — ${resetAtLabel(n.sessionResetAt)} 재설정 (${untilHuman(n.sessionResetAt)})`,
      `주간 전체: ${n.weeklyPercent ?? '?'}% — ${resetAtLabel(n.weeklyResetAt)} 재설정 (${untilHuman(n.weeklyResetAt)})`,
      n.sonnetPercent != null ? `Sonnet: ${n.sonnetPercent}% — ${resetAtLabel(n.sonnetResetAt)}` : null,
      n.opusPercent != null ? `Opus: ${n.opusPercent}% — ${resetAtLabel(n.opusResetAt)}` : null
    ].filter(Boolean).join('\n');
    widget.title = tooltip;
  }
}

function tickRecompute() {
  if (lastPayload?.status === 'ok' && lastPayload.data) {
    const n = lastPayload.data.normalized;
    sessionWhen.textContent = sessionWhenLabel(n.sessionResetAt);
    weeklyWhen.textContent = resetAtLabel(n.weeklyResetAt);
  }
}

setInterval(tickRecompute, 60 * 1000);

window.claudeState.onUsageUpdate(render);

widget.addEventListener('contextmenu', (e) => {
  e.preventDefault();
  window.claudeState.showWidgetContextMenu();
});

widget.addEventListener('dblclick', () => {
  window.claudeState.refreshUsage();
});

let dragging = false;
let dragOrigin = null;

widget.addEventListener('pointerdown', (e) => {
  if (e.button !== 0) return;
  dragging = true;
  dragOrigin = { x: e.screenX, y: e.screenY };
  try { widget.setPointerCapture(e.pointerId); } catch {}
});

widget.addEventListener('pointermove', (e) => {
  if (!dragging) return;
  const dx = e.screenX - dragOrigin.x;
  const dy = e.screenY - dragOrigin.y;
  if (dx === 0 && dy === 0) return;
  dragOrigin = { x: e.screenX, y: e.screenY };
  window.claudeState.moveWidget(dx, dy);
});

const endDrag = (e) => {
  if (!dragging) return;
  dragging = false;
  dragOrigin = null;
  try { widget.releasePointerCapture(e.pointerId); } catch {}
};
widget.addEventListener('pointerup', endDrag);
widget.addEventListener('pointercancel', endDrag);
