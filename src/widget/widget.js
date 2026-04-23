const sessionBar = document.getElementById('session-bar');
const weeklyBar = document.getElementById('weekly-bar');
const sessionText = document.getElementById('session-text');
const weeklyText = document.getElementById('weekly-text');
const sessionWhen = document.getElementById('session-when');
const weeklyWhen = document.getElementById('weekly-when');
const statusEl = document.getElementById('status');
const widget = document.getElementById('widget');

let lastPayload = null;
let dict = {};

function t(key, ...args) {
  let v = dict[key];
  if (v == null) return key;
  if (typeof v === 'string' && args.length) {
    v = v.replace(/\{(\d+)\}/g, (_, i) => {
      const val = args[Number(i)];
      return val == null ? '' : String(val);
    });
  }
  return v;
}

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
  const ap = h < 12 ? t('widget.am') : t('widget.pm');
  const h12 = h % 12 === 0 ? 12 : h % 12;
  const mm = String(d.getMinutes()).padStart(2, '0');
  const timePart = `${ap} ${h12}:${mm}`;
  if (sameDay) return timePart;
  const days = dict['widget.weekdays'] || ['일', '월', '화', '수', '목', '금', '토'];
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
  if (!Number.isFinite(diff) || diff <= 0) return t('widget.resetsSoon');
  const mins = Math.floor(diff / 60000);
  const days = Math.floor(mins / 1440);
  const hours = Math.floor((mins % 1440) / 60);
  const m = mins % 60;
  if (days >= 1) return t('widget.daysLater', days, hours);
  if (hours >= 1) return t('widget.hoursLater', hours, m);
  return t('widget.minsLater', m);
}

function render(payload) {
  lastPayload = payload;
  widget.classList.remove('auth-expired');

  if (payload.status === 'unconfigured') {
    statusEl.textContent = t('widget.status.unconfigured');
    statusEl.className = 'status error';
    setBar(sessionBar, sessionText, null);
    setBar(weeklyBar, weeklyText, null);
    sessionWhen.textContent = t('widget.status.needCookie');
    weeklyWhen.textContent = t('widget.status.rightClickSettings');
    widget.title = t('widget.tooltip.needSettings');
    return;
  }

  if (payload.status === 'auth_expired') {
    widget.classList.add('auth-expired');
    statusEl.textContent = '!';
    statusEl.className = 'status error';
    sessionText.textContent = '!!';
    weeklyText.textContent = '!!';
    sessionWhen.textContent = t('widget.status.cookieExpired');
    weeklyWhen.textContent = t('widget.status.rightClickRefresh');
    widget.title = t('widget.tooltip.authExpired', payload.message);
    return;
  }

  if (payload.status === 'loading') {
    statusEl.textContent = '···';
    statusEl.className = 'status';
    return;
  }

  if (payload.status === 'error') {
    statusEl.textContent = t('widget.status.error');
    statusEl.className = 'status error';
    sessionWhen.textContent = '-';
    weeklyWhen.textContent = '-';
    widget.title = t('widget.tooltip.error', payload.message);
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
      `${t('widget.session')}: ${n.sessionPercent ?? '?'}% — ${resetAtLabel(n.sessionResetAt)} ${t('widget.reset')} (${untilHuman(n.sessionResetAt)})`,
      `${t('widget.weeklyAll')}: ${n.weeklyPercent ?? '?'}% — ${resetAtLabel(n.weeklyResetAt)} ${t('widget.reset')} (${untilHuman(n.weeklyResetAt)})`,
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

(async () => {
  try {
    const i = await window.claudeState.getI18n();
    dict = i.dict || {};
    document.documentElement.lang = i.language;
  } catch {}
})();

window.claudeState.onI18nChanged((payload) => {
  dict = payload.dict || {};
  document.documentElement.lang = payload.language;
  if (lastPayload) render(lastPayload);
});

window.claudeState.onUsageUpdate(render);

widget.addEventListener('contextmenu', (e) => {
  e.preventDefault();
});

widget.addEventListener('dblclick', () => {
  window.claudeState.refreshUsage();
});

function applyOpacity(v) {
  const n = Math.max(0.3, Math.min(1, Number(v) || 1));
  document.documentElement.style.setProperty('--widget-alpha', n);
}

window.claudeState.onWidgetOpacity(applyOpacity);

let dragging = false;
let dragOffset = null;
let pendingPos = null;
let rafHandle = 0;

function flushMove() {
  rafHandle = 0;
  if (!dragging || !pendingPos) return;
  const { x, y } = pendingPos;
  pendingPos = null;
  window.claudeState.setWidgetPosition(x, y);
}

widget.addEventListener('pointerdown', async (e) => {
  if (e.button !== 0) return;
  const origin = await window.claudeState.widgetDragStart();
  if (!origin) return;
  dragging = true;
  dragOffset = {
    x: e.screenX - origin.x,
    y: e.screenY - origin.y
  };
  try { widget.setPointerCapture(e.pointerId); } catch {}
});

widget.addEventListener('pointermove', (e) => {
  if (!dragging || !dragOffset) return;
  pendingPos = {
    x: e.screenX - dragOffset.x,
    y: e.screenY - dragOffset.y
  };
  if (!rafHandle) rafHandle = requestAnimationFrame(flushMove);
});

const endDrag = (e) => {
  if (!dragging) return;
  if (rafHandle) {
    cancelAnimationFrame(rafHandle);
    rafHandle = 0;
  }
  if (pendingPos) {
    const { x, y } = pendingPos;
    pendingPos = null;
    window.claudeState.setWidgetPosition(x, y);
  }
  dragging = false;
  dragOffset = null;
  try { widget.releasePointerCapture(e.pointerId); } catch {}
};
widget.addEventListener('pointerup', endDrag);
widget.addEventListener('pointercancel', endDrag);
