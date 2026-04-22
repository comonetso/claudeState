const orgIdInput = document.getElementById('orgId');
const cookieInput = document.getElementById('sessionCookie');
const intervalInput = document.getElementById('refreshInterval');
const autoLaunchInput = document.getElementById('autoLaunch');
const languageInput = document.getElementById('language');
const opacityInput = document.getElementById('opacity');
const opacityValueEl = document.getElementById('opacity-value');
const statusEl = document.getElementById('status');
const saveBtn = document.getElementById('save-btn');
const testBtn = document.getElementById('test-btn');

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

function applyI18n() {
  document.querySelectorAll('[data-i18n]').forEach((el) => {
    const key = el.getAttribute('data-i18n');
    const v = dict[key];
    if (typeof v === 'string') el.textContent = v;
  });
  document.querySelectorAll('[data-i18n-html]').forEach((el) => {
    const key = el.getAttribute('data-i18n-html');
    const v = dict[key];
    if (typeof v === 'string') el.innerHTML = v;
  });
  document.querySelectorAll('[data-i18n-placeholder]').forEach((el) => {
    const key = el.getAttribute('data-i18n-placeholder');
    const v = dict[key];
    if (typeof v === 'string') el.setAttribute('placeholder', v);
  });
  const titleEl = document.querySelector('title');
  if (titleEl && dict['settings.title']) titleEl.textContent = dict['settings.title'];
}

async function load() {
  const i = await window.claudeState.getI18n();
  dict = i.dict || {};
  document.documentElement.lang = i.language;
  applyI18n();

  const s = await window.claudeState.getSettings();
  orgIdInput.value = s.orgId ?? '';
  intervalInput.value = s.refreshIntervalSec ?? 300;
  autoLaunchInput.checked = s.autoLaunch !== false;
  languageInput.value = s.language === 'en' ? 'en' : 'ko';
  const opacityPct = Math.round((typeof s.widgetOpacity === 'number' ? s.widgetOpacity : 1) * 100);
  opacityInput.value = String(opacityPct);
  opacityValueEl.textContent = `${opacityPct}%`;
  if (s.hasCookie) {
    cookieInput.placeholder = t('settings.cookieSaved');
  }
}

function setStatus(msg, type) {
  statusEl.textContent = msg;
  statusEl.className = `status ${type ?? ''}`;
}

opacityInput.addEventListener('input', () => {
  opacityValueEl.textContent = `${opacityInput.value}%`;
});

languageInput.addEventListener('change', async () => {
  const lang = languageInput.value === 'en' ? 'en' : 'ko';
  try {
    await window.claudeState.saveSettings({ language: lang });
  } catch (e) {
    setStatus(t('settings.msg.saveFailed', e.message), 'err');
  }
});

opacityInput.addEventListener('change', async () => {
  const pct = Math.max(30, Math.min(100, parseInt(opacityInput.value, 10) || 100));
  try {
    await window.claudeState.saveSettings({ widgetOpacity: pct / 100 });
  } catch (e) {
    setStatus(t('settings.msg.saveFailed', e.message), 'err');
  }
});

saveBtn.addEventListener('click', async () => {
  const orgId = orgIdInput.value.trim();
  const cookie = cookieInput.value.trim();
  const intervalSec = parseInt(intervalInput.value, 10);

  if (!orgId) {
    setStatus(t('settings.err.noOrgId'), 'err');
    return;
  }

  const existing = await window.claudeState.getSettings();
  if (!cookie && !existing.hasCookie) {
    setStatus(t('settings.err.noCookie'), 'err');
    return;
  }

  if (!Number.isFinite(intervalSec) || intervalSec < 10 || intervalSec > 3600) {
    setStatus(t('settings.err.badInterval'), 'err');
    return;
  }

  try {
    await window.claudeState.saveSettings({
      sessionCookie: cookie || undefined,
      orgId,
      refreshIntervalSec: intervalSec,
      autoLaunch: autoLaunchInput.checked,
      language: languageInput.value === 'en' ? 'en' : 'ko',
      widgetOpacity: Math.max(30, Math.min(100, parseInt(opacityInput.value, 10) || 100)) / 100
    });
    setStatus(t('settings.msg.saving'), 'ok');
  } catch (e) {
    setStatus(t('settings.msg.saveFailed', e.message), 'err');
  }
});

testBtn.addEventListener('click', () => {
  window.claudeState.refreshUsage();
  setStatus(t('settings.msg.refreshRequested'), 'ok');
});

window.claudeState.onI18nChanged((payload) => {
  dict = payload.dict || {};
  document.documentElement.lang = payload.language;
  applyI18n();
});

window.claudeState.onUsageUpdate((payload) => {
  if (payload.status === 'ok') {
    setStatus(t('settings.msg.ok', payload.data.source), 'ok');
  } else if (payload.status === 'auth_expired') {
    setStatus(t('settings.msg.authExpired'), 'err');
  } else if (payload.status === 'error') {
    setStatus(t('settings.msg.err', payload.message), 'err');
  } else if (payload.status === 'unconfigured') {
    setStatus(t('settings.msg.needSettings'), 'err');
  }
});

load();
