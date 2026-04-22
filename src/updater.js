const { app, Notification } = require('electron');

let autoUpdater = null;
let log = null;
let state = {
  status: 'idle',
  latestVersion: null,
  progress: 0,
  error: null
};

const listeners = new Set();

function onChange(fn) {
  listeners.add(fn);
  return () => listeners.delete(fn);
}

function emit() {
  for (const fn of listeners) {
    try { fn({ ...state }); } catch {}
  }
}

function getState() {
  return { ...state };
}

function setup({ t, onStateChange }) {
  if (autoUpdater) return autoUpdater;

  log = require('electron-log');
  log.transports.file.level = 'info';
  log.transports.file.format = '[{y}-{m}-{d} {h}:{i}:{s}.{ms}] [{level}] {text}';

  const updaterModule = require('electron-updater');
  autoUpdater = updaterModule.autoUpdater;
  autoUpdater.logger = log;
  autoUpdater.autoDownload = true;
  autoUpdater.autoInstallOnAppQuit = true;

  if (typeof onStateChange === 'function') onChange(onStateChange);

  autoUpdater.on('checking-for-update', () => {
    state = { ...state, status: 'checking', error: null };
    log.info('[updater] checking for updates');
    emit();
  });

  autoUpdater.on('update-not-available', (info) => {
    state = { ...state, status: 'not-available', latestVersion: info?.version ?? null };
    log.info(`[updater] no update. current=${app.getVersion()} latest=${info?.version}`);
    emit();
  });

  autoUpdater.on('update-available', (info) => {
    state = { ...state, status: 'available', latestVersion: info?.version ?? null, progress: 0 };
    log.info(`[updater] update available: ${info?.version}`);
    emit();
    try {
      new Notification({
        title: t('update.notifyTitle'),
        body: t('update.downloading', info?.version ?? ''),
        silent: true
      }).show();
    } catch {}
  });

  autoUpdater.on('download-progress', (p) => {
    state = { ...state, status: 'downloading', progress: Math.round(p?.percent ?? 0) };
    emit();
  });

  autoUpdater.on('update-downloaded', (info) => {
    state = { ...state, status: 'downloaded', latestVersion: info?.version ?? null, progress: 100 };
    log.info(`[updater] downloaded: ${info?.version}`);
    emit();
    try {
      new Notification({
        title: t('update.notifyTitle'),
        body: t('update.downloadedBody', info?.version ?? ''),
        silent: false
      }).show();
    } catch {}
  });

  autoUpdater.on('error', (err) => {
    state = { ...state, status: 'error', error: err?.message || String(err) };
    log.error(`[updater] error: ${err?.message || err}`);
    emit();
  });

  return autoUpdater;
}

async function checkNow({ silent = false } = {}) {
  if (!autoUpdater) return null;
  try {
    const r = await autoUpdater.checkForUpdates();
    return r?.updateInfo ?? null;
  } catch (err) {
    if (!silent && log) log.error(`[updater] checkNow failed: ${err?.message || err}`);
    return null;
  }
}

function quitAndInstall() {
  if (!autoUpdater) return;
  try {
    autoUpdater.quitAndInstall(false, true);
  } catch (err) {
    if (log) log.error(`[updater] quitAndInstall failed: ${err?.message || err}`);
  }
}

module.exports = { setup, checkNow, quitAndInstall, getState, onChange };
