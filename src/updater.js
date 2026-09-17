const { app, Notification, dialog } = require('electron');

let autoUpdater = null;
// "나중에"를 고르면 같은 버전은 다시 묻지 않는다. 1시간 주기 확인이 이미 받아 둔 파일로
// update-downloaded 를 또 내보내므로 버전으로 막는다. 설치는 위젯 ⬆·트레이·앱 종료 시 된다.
let promptedVersion = null;
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
    promptInstall(t, info?.version ?? '');
  });

  autoUpdater.on('error', (err) => {
    state = { ...state, status: 'error', error: err?.message || String(err) };
    log.error(`[updater] error: ${err?.message || err}`);
    emit();
  });

  return autoUpdater;
}

// 토스트 알림은 놓치기 쉽고 눌러도 아무 일이 없어서, 다운로드가 끝나면 확인 창으로 묻는다.
async function promptInstall(t, version) {
  if (promptedVersion === version) return;
  promptedVersion = version;
  try {
    const { response } = await dialog.showMessageBox({
      type: 'info',
      title: t('update.notifyTitle'),
      message: t('update.dialogMessage', version),
      detail: t('update.dialogDetail'),
      buttons: [t('update.restartNow'), t('update.later')],
      defaultId: 0,
      cancelId: 1,
      noLink: true
    });
    if (response === 0) quitAndInstall();
  } catch (err) {
    if (log) log.error(`[updater] prompt failed: ${err?.message || err}`);
  }
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
    // 조용히 설치하고 곧바로 다시 실행한다(2026-09-17 결정). 마법사를 띄우면 "다음"을 눌러야 끝난다.
    autoUpdater.quitAndInstall(true, true);
  } catch (err) {
    if (log) log.error(`[updater] quitAndInstall failed: ${err?.message || err}`);
  }
}

module.exports = { setup, checkNow, quitAndInstall, getState, onChange };
