const F = window.csFormat;

const sessionBar = document.getElementById('session-bar');
const weeklyBar = document.getElementById('weekly-bar');
const sessionText = document.getElementById('session-text');
const weeklyText = document.getElementById('weekly-text');
const sessionWhen = document.getElementById('session-when');
const weeklyWhen = document.getElementById('weekly-when');
const cxSessionText = document.getElementById('cx-session-text');
const cxWeeklyText = document.getElementById('cx-weekly-text');
const cxSessionWhen = document.getElementById('cx-session-when');
const cxWeeklyWhen = document.getElementById('cx-weekly-when');
const statusEl = document.getElementById('status');
const widget = document.getElementById('widget');

let lastPayload = null;

// Codex 열이 붙어 있는가. 붙어 있으면 폭이 빠듯하므로 리셋 "시각"을 빼고
// 잔여시간만 남긴다. 정확한 시각은 상세 패널이 갖는다.
let codexMode = false;

// 퍼센트 텍스트만 갱신하고 정규화된 값을 돌려준다(값이 없으면 null).
// Codex 열에는 바가 없어서 위험도를 글자색으로만 알린다.
function setPct(textEl, percent) {
  textEl.classList.remove('warn', 'danger');
  const p = F.pct(percent);
  if (p == null) {
    textEl.textContent = '--';
    return null;
  }
  textEl.textContent = `${p}%`;
  const lv = F.levelOf(p);
  if (lv) textEl.classList.add(lv);
  return p;
}

function setBar(barEl, textEl, percent) {
  const p = setPct(textEl, percent);
  barEl.classList.remove('warn', 'danger');
  if (p == null) {
    barEl.style.width = '0%';
    return;
  }
  barEl.style.width = `${p}%`;
  const lv = F.levelOf(p);
  if (lv) barEl.classList.add(lv);
}

function whenLabel(iso) {
  const base = F.resetAtLabel(iso);
  if (base === '--') return '--';
  const until = F.untilHuman(iso);
  if (until === '--') return base;
  return `${base} (${until})`;
}

// 두 열 모드에서는 폭이 없어 잔여시간만 쓴다. 한 열이면 지금까지처럼 시각도 함께 보인다.
function whenText(iso) {
  return codexMode ? F.untilHuman(iso) : whenLabel(iso);
}

// Codex 열. Claude 쪽 status 와 독립적으로 그린다 — claude.ai 쿠키가 만료돼도
// Codex 사용량은 멀쩡하므로 같이 죽이면 안 된다.
function renderCodex(payload) {
  const enabled = payload?.codexEnabled === true;
  codexMode = enabled;
  widget.classList.toggle('has-codex', enabled);
  if (!enabled) return;

  const cx = payload.codex;
  if (!cx) {
    // 감지는 됐는데 이번 조회가 실패한 상태. 열을 접었다 폈다 하면 위젯 폭이
    // 요동치므로 자리는 지키고 값만 비운다.
    setPct(cxSessionText, null);
    setPct(cxWeeklyText, null);
    cxSessionWhen.textContent = '--';
    cxWeeklyWhen.textContent = '--';
    return;
  }

  // 5시간 한도가 없는 계정(주간 전용)은 S행에 넣을 값 자체가 없다.
  setPct(cxSessionText, cx.hasFiveHour ? cx.sessionPercent : null);
  cxSessionWhen.textContent = cx.hasFiveHour ? whenText(cx.sessionResetAt) : '--';
  setPct(cxWeeklyText, cx.weeklyPercent);
  cxWeeklyWhen.textContent = whenText(cx.weeklyResetAt);
}

function render(payload) {
  lastPayload = payload;
  renderCodex(payload);
  widget.classList.remove('auth-expired');

  if (payload.status === 'unconfigured') {
    statusEl.textContent = F.t('widget.status.unconfigured');
    statusEl.className = 'status error';
    setBar(sessionBar, sessionText, null);
    setBar(weeklyBar, weeklyText, null);
    sessionWhen.textContent = F.t('widget.status.needCookie');
    weeklyWhen.textContent = F.t('widget.status.rightClickSettings');
    return;
  }

  if (payload.status === 'auth_expired') {
    widget.classList.add('auth-expired');
    statusEl.textContent = '!';
    statusEl.className = 'status error';
    sessionText.textContent = '!!';
    weeklyText.textContent = '!!';
    sessionWhen.textContent = F.t('widget.status.cookieExpired');
    weeklyWhen.textContent = F.t('widget.status.rightClickRefresh');
    return;
  }

  if (payload.status === 'loading') {
    statusEl.textContent = '···';
    statusEl.className = 'status';
    return;
  }

  if (payload.status === 'error') {
    statusEl.textContent = F.t('widget.status.error');
    statusEl.className = 'status error';
    sessionWhen.textContent = '-';
    weeklyWhen.textContent = '-';
    return;
  }

  if (payload.status === 'ok' && payload.data) {
    statusEl.textContent = '';
    statusEl.className = 'status ok';
    const n = payload.data.normalized;
    setBar(sessionBar, sessionText, n.sessionPercent);
    setBar(weeklyBar, weeklyText, n.weeklyPercent);
    sessionWhen.textContent = whenText(n.sessionResetAt);
    weeklyWhen.textContent = whenText(n.weeklyResetAt);
  }
}

// 재조회 없이 "남은 시간"만 다시 계산한다. 두 공급자 모두 대상이다.
function tickRecompute() {
  if (lastPayload?.status === 'ok' && lastPayload.data) {
    const n = lastPayload.data.normalized;
    sessionWhen.textContent = whenText(n.sessionResetAt);
    weeklyWhen.textContent = whenText(n.weeklyResetAt);
  }
  const cx = lastPayload?.codex;
  if (lastPayload?.codexEnabled && cx) {
    if (cx.hasFiveHour) cxSessionWhen.textContent = whenText(cx.sessionResetAt);
    cxWeeklyWhen.textContent = whenText(cx.weeklyResetAt);
  }
}

setInterval(tickRecompute, 60 * 1000);

(async () => {
  try {
    const i = await window.claudeState.getI18n();
    F.setDict(i.dict || {});
    document.documentElement.lang = i.language;
  } catch {}
  if (lastPayload) render(lastPayload);
})();

window.claudeState.onI18nChanged((payload) => {
  F.setDict(payload.dict || {});
  document.documentElement.lang = payload.language;
  if (lastPayload) render(lastPayload);
});

window.claudeState.onUsageUpdate(render);

widget.addEventListener('contextmenu', (e) => {
  e.preventDefault();
  cancelPanelShow();
  window.claudeState.hidePanel();
  window.claudeState.showWidgetContextMenu();
});

widget.addEventListener('dblclick', () => {
  window.claudeState.refreshUsage();
});

let dragging = false;
let dragOffset = null;
let pendingPos = null;
let rafHandle = 0;

// --- 상세 패널 ---
// 네이티브 title 툴팁은 글꼴도 색도 못 바꾸므로 별도 창으로 띄운다.
// 드래그 중에는 따라다니면 거슬리므로 숨긴다.
// 위젯을 옮기려고 마우스를 잠깐 올리기만 해도 즉시 뜨면 거슬리므로(2026-08-28 사용자 지적),
// 1초 이상 머물러야 뜨게 딜레이를 둔다. 드래그가 시작되거나 마우스가 빠지면 예약을 취소한다.
const PANEL_SHOW_DELAY_MS = 500;
let panelShowTimer = null;

function cancelPanelShow() {
  if (panelShowTimer) {
    clearTimeout(panelShowTimer);
    panelShowTimer = null;
  }
}

widget.addEventListener('mouseenter', () => {
  if (dragging) return;
  cancelPanelShow();
  panelShowTimer = setTimeout(() => {
    panelShowTimer = null;
    window.claudeState.showPanel();
  }, PANEL_SHOW_DELAY_MS);
});

widget.addEventListener('mouseleave', () => {
  cancelPanelShow();
  window.claudeState.hidePanel();
});

function flushMove() {
  rafHandle = 0;
  if (!dragging || !pendingPos) return;
  const { x, y } = pendingPos;
  pendingPos = null;
  window.claudeState.setWidgetPosition(x, y);
}

widget.addEventListener('pointerdown', async (e) => {
  if (e.button !== 0) return;
  cancelPanelShow();
  window.claudeState.hidePanel();
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
