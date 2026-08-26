const F = window.csFormat;

const el = (id) => document.getElementById(id);

const secClaude = el('sec-claude');
const secCodex = el('sec-codex');
const sep = el('sep');

let lastPayload = null;

// 창 높이는 내용이 정한다. Codex 유무·모델별 수치 유무로 높이가 달라지므로
// 렌더가 끝날 때마다 실제 높이를 재서 메인에 알린다.
let lastReported = 0;
function reportSize() {
  const h = Math.ceil(el('panel').getBoundingClientRect().height);
  if (h > 0 && h !== lastReported) {
    lastReported = h;
    window.claudeState.resizePanel(h);
  }
}

/** 한 지표(라벨/퍼센트/막대/남은시간/리셋시각)를 채운다. */
function fillMetric(prefix, percent, iso, kind) {
  const p = F.pct(percent);
  const pctEl = el(`${prefix}-pct`);
  const fillEl = el(`${prefix}-fill`);
  const whenEl = el(`${prefix}-when`);
  const atEl = el(`${prefix}-at`);

  pctEl.classList.remove('warn', 'danger');
  fillEl.classList.remove('warn', 'danger', 'weekly');
  if (kind === 'weekly') fillEl.classList.add('weekly');

  if (p == null) {
    pctEl.textContent = '--';
    fillEl.style.width = '0%';
    whenEl.textContent = '--';
    atEl.textContent = '';
    return;
  }

  pctEl.textContent = `${p}%`;
  fillEl.style.width = `${p}%`;
  const lv = F.levelOf(p);
  if (lv) {
    pctEl.classList.add(lv);
    fillEl.classList.add(lv);
  }
  whenEl.textContent = F.untilHuman(iso);
  atEl.textContent = iso ? F.t('widget.panel.resetAt', F.resetAtFull(iso)) : '';
}

function clearMetric(prefix) {
  fillMetric(prefix, null, null);
}

function setMsg(id, text, isError) {
  const m = el(id);
  m.textContent = text || '';
  m.classList.toggle('error', !!isError);
}

function renderClaude(payload) {
  el('claude-name').textContent = F.t('widget.panel.claude');
  el('cl-s-label').textContent = F.t('widget.panel.fiveHour');
  el('cl-w-label').textContent = F.t('widget.panel.weekly');
  el('cl-models').innerHTML = '';

  if (payload.status === 'ok' && payload.data) {
    const n = payload.data.normalized;
    setMsg('cl-msg', '');
    fillMetric('cl-s', n.sessionPercent, n.sessionResetAt, 'session');
    fillMetric('cl-w', n.weeklyPercent, n.weeklyResetAt, 'weekly');

    // 모델별 수치는 계정에 따라 없다. 있을 때만 줄을 만든다.
    const models = [
      ['Sonnet', n.sonnetPercent, n.sonnetResetAt],
      ['Opus', n.opusPercent, n.opusResetAt]
    ].filter(([, v]) => v != null);
    for (const [name, v] of models) {
      const row = document.createElement('div');
      row.className = 'model-row';
      const a = document.createElement('span');
      a.textContent = name;
      const b = document.createElement('span');
      b.textContent = `${F.pct(v)}%`;
      row.append(a, b);
      el('cl-models').appendChild(row);
    }
    return;
  }

  clearMetric('cl-s');
  clearMetric('cl-w');

  if (payload.status === 'unconfigured') {
    setMsg('cl-msg', F.t('widget.panel.unconfigured'), true);
  } else if (payload.status === 'auth_expired') {
    setMsg('cl-msg', F.t('widget.panel.authExpired'), true);
  } else if (payload.status === 'error') {
    setMsg('cl-msg', F.t('widget.panel.error', payload.message || ''), true);
  } else {
    setMsg('cl-msg', '');
  }
}

function renderCodex(payload) {
  // 설치돼 있지 않으면 섹션도 구분선도 만들지 않는다 — 없는 것을 설명하지 않는다.
  const enabled = payload?.codexEnabled === true;
  secCodex.classList.toggle('hidden', !enabled);
  sep.classList.toggle('hidden', !enabled);
  if (!enabled) return;

  const cx = payload.codex;
  el('codex-name').textContent = F.t('widget.panel.codex');
  el('cx-s-label').textContent = F.t('widget.panel.fiveHour');
  el('cx-w-label').textContent = F.t('widget.panel.weekly');
  el('codex-note').textContent = cx?.planType || '';

  if (!cx) {
    el('cx-s-metric').classList.add('hidden');
    el('cx-w-metric').classList.add('hidden');
    setMsg('cx-msg', F.t('widget.panel.unavailable'), true);
    return;
  }

  // 5시간 한도가 없는 계정에 0% 막대를 보여주면 "안 쓴 것"으로 오해된다. 아예 숨기고 이유를 적는다.
  el('cx-s-metric').classList.toggle('hidden', !cx.hasFiveHour);
  if (cx.hasFiveHour) {
    fillMetric('cx-s', cx.sessionPercent, cx.sessionResetAt, 'session');
  }

  el('cx-w-metric').classList.toggle('hidden', cx.weeklyPercent == null);
  if (cx.weeklyPercent != null) {
    fillMetric('cx-w', cx.weeklyPercent, cx.weeklyResetAt, 'weekly');
  }

  setMsg('cx-msg', cx.hasFiveHour ? '' : F.t('widget.panel.noFiveHour'));
}

function render(payload) {
  lastPayload = payload;
  // loading 은 잠깐 스쳐가는 상태다. 값을 지우면 패널이 깜빡이므로 직전 화면을 유지한다.
  if (payload.status === 'loading') return;
  renderClaude(payload);
  renderCodex(payload);
  reportSize();
}

// 재조회 없이 남은 시간만 다시 센다.
setInterval(() => {
  if (lastPayload) render(lastPayload);
}, 60 * 1000);

(async () => {
  try {
    const i = await window.claudeState.getI18n();
    F.setDict(i.dict || {});
    document.documentElement.lang = i.language;
  } catch {}
  if (lastPayload) render(lastPayload);
  reportSize();
})();

window.claudeState.onI18nChanged((payload) => {
  F.setDict(payload.dict || {});
  document.documentElement.lang = payload.language;
  if (lastPayload) render(lastPayload);
});

window.claudeState.onUsageUpdate(render);
