const { app, BrowserWindow, Notification, ipcMain, Menu, Tray, screen, nativeImage, shell } = require('electron');
const path = require('path');
const fs = require('fs');
const { exec } = require('child_process');
const storage = require('./storage');
const api = require('./api');
const i18n = require('./i18n');
const { t } = i18n;
const updater = require('./updater');
const telegram = require('./telegram');

app.setAppUserModelId('com.comonetso.claudestate');

app.commandLine.appendSwitch('disable-features', 'CalculateNativeWinOcclusion');

if (!app.requestSingleInstanceLock()) {
  app.quit();
  return;
}

app.on('second-instance', () => {
  try {
    new Notification({
      title: t('app.name'),
      body: t('toast.alreadyRunning'),
      silent: false
    }).show();
  } catch (e) {
    console.warn(`[claudeState] 토스트 실패: ${e.message}`);
  }
  if (widgetWindow && !widgetWindow.isDestroyed()) {
    if (widgetWindow.isMinimized()) widgetWindow.restore();
    widgetWindow.show();
    widgetWindow.focus();
  }
});

function syncAutoLaunch() {
  const enabled = storage.getAutoLaunch();
  try {
    app.setLoginItemSettings({
      openAtLogin: enabled,
      path: process.execPath,
      args: []
    });
  } catch (e) {
    console.warn(`[claudeState] 자동 실행 설정 실패: ${e.message}`);
  }
}

let logStream = null;
let logFilePath = null;

function installLogTee() {
  logFilePath = path.join(app.getPath('userData'), 'claudestate.log');
  fs.mkdirSync(path.dirname(logFilePath), { recursive: true });
  logStream = fs.createWriteStream(logFilePath, { flags: 'a' });

  const wrap = (orig, tag) => (...args) => {
    const line = args
      .map((a) => (typeof a === 'string' ? a : (() => { try { return JSON.stringify(a); } catch { return String(a); } })()))
      .join(' ');
    const ts = new Date().toISOString();
    try { logStream.write(`[${ts}] [${tag}] ${line}\n`); } catch {}
    orig(...args);
  };
  const origLog = console.log.bind(console);
  const origWarn = console.warn.bind(console);
  const origErr = console.error.bind(console);
  console.log = wrap(origLog, 'INFO');
  console.warn = wrap(origWarn, 'WARN');
  console.error = wrap(origErr, 'ERR ');

  console.log(`[claudeState] 로그 파일: ${logFilePath}`);
}

function openLogViewer() {
  if (!logFilePath) return;
  const batPath = path.join(app.getPath('userData'), 'view-log.cmd');
  const escapedPath = logFilePath.replace(/'/g, "''");
  const batContent = [
    '@echo off',
    'chcp 65001 >nul',
    'title claudeState log',
    `powershell -NoLogo -NoProfile -Command "[Console]::OutputEncoding = [System.Text.Encoding]::UTF8; Get-Content -LiteralPath '${escapedPath}' -Wait -Tail 200 -Encoding UTF8"`
  ].join('\r\n') + '\r\n';
  try {
    fs.writeFileSync(batPath, batContent, { encoding: 'utf8' });
  } catch (e) {
    console.error('[claudeState] 로그 뷰어 스크립트 생성 실패:', e.message);
    return;
  }
  exec(`start "" "${batPath}"`, { windowsHide: false }, (err) => {
    if (err) console.error('[claudeState] 로그 뷰어 실행 실패:', err.message);
  });
}

const TRAY_ICON_CANDIDATES = [
  path.join(__dirname, '..', 'assets', 'tray.png'),
  path.join(__dirname, '..', 'icon.jpg'),
  path.join(__dirname, '..', 'icon.png')
];

const MIN_INTERVAL_SEC = 10;
const MAX_INTERVAL_SEC = 3600;

function findTrayIcon() {
  for (const p of TRAY_ICON_CANDIDATES) {
    if (fs.existsSync(p)) return p;
  }
  return null;
}

let widgetWindow = null;
let settingsWindow = null;
let tray = null;
let fetchTimer = null;
let lastSessionResetAt = null;

function createWidgetWindow() {
  const display = screen.getPrimaryDisplay();
  const workArea = display.workArea;

  const saved = storage.getWindowPosition();
  const W = 250, H = 40;
  const defaultX = workArea.x + workArea.width - W - 8;
  const defaultY = workArea.y + workArea.height - H - 8;

  const allDisplays = screen.getAllDisplays();
  const inAnyDisplay = (px, py) =>
    allDisplays.some((d) => {
      const a = d.workArea;
      return px >= a.x && px + W <= a.x + a.width && py >= a.y && py + H <= a.y + a.height;
    });

  let x = defaultX;
  let y = defaultY;
  if (saved && inAnyDisplay(saved.x, saved.y)) {
    x = saved.x;
    y = saved.y;
  } else if (saved) {
    console.warn(`[claudeState] 저장된 위치 (${saved.x}, ${saved.y})가 화면 밖 — 기본 위치로 복원`);
  }

  const startHidden = storage.getWidgetVisible() === false;

  widgetWindow = new BrowserWindow({
    width: 250,
    height: 40,
    x,
    y,
    frame: false,
    transparent: true,
    alwaysOnTop: true,
    skipTaskbar: true,
    resizable: false,
    hasShadow: false,
    show: !startHidden,
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false
    }
  });

  widgetWindow.setAlwaysOnTop(true, 'floating');
  widgetWindow.setOpacity(storage.getWidgetOpacity());
  widgetWindow.loadFile(path.join(__dirname, 'widget', 'index.html'));

  widgetWindow.webContents.on('context-menu', (e) => {
    e.preventDefault();
    showWidgetContextMenu();
  });

  let savePosTimer = null;
  const persistPosition = () => {
    if (!widgetWindow || widgetWindow.isDestroyed()) return;
    const [wx, wy] = widgetWindow.getPosition();
    const W = 250, H = 40;
    const all = screen.getAllDisplays();
    const inAny = all.some((d) => {
      const a = d.workArea;
      return wx >= a.x && wx + W <= a.x + a.width && wy >= a.y && wy + H <= a.y + a.height;
    });
    if (!inAny) return;
    storage.setWindowPosition({ x: wx, y: wy });
  };

  widgetWindow.on('move', () => {
    if (savePosTimer) clearTimeout(savePosTimer);
    savePosTimer = setTimeout(persistPosition, 300);
  });
  widgetWindow.on('moved', persistPosition);

  widgetWindow.on('close', persistPosition);

  widgetWindow.on('closed', () => {
    widgetWindow = null;
  });

  if (process.argv.includes('--dev')) {
    widgetWindow.webContents.openDevTools({ mode: 'detach' });
  }
}

function createSettingsWindow() {
  if (settingsWindow) {
    settingsWindow.focus();
    return;
  }

  settingsWindow = new BrowserWindow({
    width: 480,
    height: 660,
    title: t('settings.title'),
    resizable: false,
    minimizable: false,
    maximizable: false,
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false
    }
  });

  settingsWindow.setMenu(null);
  settingsWindow.loadFile(path.join(__dirname, 'settings', 'index.html'));

  settingsWindow.on('closed', () => {
    settingsWindow = null;
  });
}

function createTray() {
  const iconPath = findTrayIcon();
  let icon;
  if (iconPath) {
    icon = nativeImage.createFromPath(iconPath);
    if (!icon.isEmpty()) {
      const size = icon.getSize();
      if (size.width > 32 || size.height > 32) {
        icon = icon.resize({ width: 16, height: 16, quality: 'best' });
      }
    }
  } else {
    console.warn('[claudeState] 트레이 아이콘 파일 없음 — 빈 아이콘 사용');
    icon = nativeImage.createEmpty();
  }
  tray = new Tray(icon);
  tray.setToolTip(t('app.name'));
  rebuildTrayMenu();
}

function rebuildTrayMenu() {
  if (!tray) return;
  const visible = storage.getWidgetVisible();
  const updateState = updater.getState();
  const items = [
    {
      label: t('tray.showWidget'),
      type: 'checkbox',
      checked: visible,
      click: () => (visible ? hideWidget() : showWidget())
    },
    { label: t('tray.settings'), click: () => createSettingsWindow() },
    { label: t('tray.refreshNow'), click: () => refreshUsage() },
    { type: 'separator' },
    { label: t('tray.resetPosition'), enabled: visible, click: () => resetWidgetPosition() },
    { label: t('tray.viewLog'), click: () => openLogViewer() },
    { label: t('tray.openLogFolder'), click: () => { if (logFilePath) shell.showItemInFolder(logFilePath); } },
    { type: 'separator' }
  ];

  if (updateState.status === 'downloaded') {
    items.push({
      label: t('tray.installUpdate', updateState.latestVersion ?? ''),
      click: () => updater.quitAndInstall()
    });
  } else if (updateState.status === 'downloading') {
    items.push({
      label: t('tray.downloadingUpdate', updateState.progress ?? 0),
      enabled: false
    });
  } else if (app.isPackaged) {
    items.push({
      label: t('tray.checkForUpdates'),
      click: () => triggerManualUpdateCheck()
    });
  }

  items.push({
    label: `${t('app.name')} v${app.getVersion()}`,
    enabled: false
  });
  items.push({ label: t('tray.quit'), click: () => app.quit() });

  tray.setContextMenu(Menu.buildFromTemplate(items));
}

async function triggerManualUpdateCheck() {
  try {
    new Notification({
      title: t('app.name'),
      body: t('update.checkingBody'),
      silent: true
    }).show();
  } catch {}
  const info = await updater.checkNow({ silent: false });
  if (!info || info.version === app.getVersion()) {
    try {
      new Notification({
        title: t('app.name'),
        body: t('update.notAvailableBody', app.getVersion()),
        silent: true
      }).show();
    } catch {}
  }
}

function showWidget() {
  storage.setWidgetVisible(true);
  if (!widgetWindow || widgetWindow.isDestroyed()) {
    createWidgetWindow();
  } else {
    widgetWindow.show();
  }
  rebuildTrayMenu();
}

function hideWidget() {
  storage.setWidgetVisible(false);
  if (widgetWindow && !widgetWindow.isDestroyed()) {
    widgetWindow.hide();
  }
  rebuildTrayMenu();
}

function showWidgetContextMenu() {
  if (!widgetWindow || widgetWindow.isDestroyed()) return;
  const menu = Menu.buildFromTemplate([
    { label: t('context.refreshNow'), click: () => refreshUsage() },
    { label: t('context.settings'), click: () => createSettingsWindow() },
    { type: 'separator' },
    { label: t('context.hide'), click: () => hideWidget() }
  ]);
  menu.popup({ window: widgetWindow });
}

function resetWidgetPosition() {
  if (!widgetWindow || widgetWindow.isDestroyed()) return;
  const display = screen.getPrimaryDisplay();
  const a = display.workArea;
  const x = a.x + a.width - 258;
  const y = a.y + a.height - 48;
  widgetWindow.setPosition(x, y, false);
  storage.setWindowPosition({ x, y });
}

async function refreshUsage() {
  const creds = storage.getCredentials();
  if (!creds?.sessionCookie || !creds?.orgId) {
    broadcast('usage:update', { status: 'unconfigured' });
    return;
  }

  broadcast('usage:update', { status: 'loading' });

  try {
    const data = await api.fetchUsage(creds.sessionCookie, creds.orgId);
    const n = data.normalized;
    console.log(`[claudeState] 갱신: 세션 ${n.sessionPercent ?? '?'}% / 주간 ${n.weeklyPercent ?? '?'}%`);

    if (lastSessionResetAt && n.sessionResetAt && n.sessionResetAt !== lastSessionResetAt) {
      const prevExpired = new Date(lastSessionResetAt).getTime() < Date.now();
      if (prevExpired) {
        onSessionReset(n.weeklyPercent ?? 0);
      }
    }
    lastSessionResetAt = n.sessionResetAt ?? lastSessionResetAt;

    broadcast('usage:update', { status: 'ok', data });
  } catch (err) {
    if (err.code === 'AUTH_EXPIRED') {
      console.error(`[claudeState] 쿠키 만료 감지: ${err.message}`);
      broadcast('usage:update', { status: 'auth_expired', message: err.message });
    } else {
      console.error(`[claudeState] API 실패: ${err.message}`);
      broadcast('usage:update', { status: 'error', message: err.message });
    }
  }
}

function broadcast(channel, payload) {
  BrowserWindow.getAllWindows().forEach((win) => {
    if (!win.isDestroyed()) {
      win.webContents.send(channel, payload);
    }
  });
}

function onSessionReset(weeklyPercent) {
  const token = storage.getTelegramBotToken();
  const chatId = storage.getTelegramChatId();
  if (!token || !chatId) return;
  const msg = t('telegram.resetMsg', weeklyPercent ?? 0);
  telegram.sendMessage(token, chatId, msg).catch(() => {});
}

function startFetchLoop() {
  if (fetchTimer) clearInterval(fetchTimer);
  const sec = storage.getRefreshIntervalSec();
  console.log(`[claudeState] 새로고침 간격: ${sec}초`);
  refreshUsage();
  fetchTimer = setInterval(refreshUsage, sec * 1000);
}

app.whenReady().then(() => {
  installLogTee();
  i18n.setLanguage(storage.getLanguage());
  syncAutoLaunch();
  createWidgetWindow();
  createTray();
  startFetchLoop();

  if (app.isPackaged) {
    updater.setup({
      t,
      onStateChange: () => rebuildTrayMenu()
    });
    setTimeout(() => {
      updater.checkNow({ silent: true }).catch(() => {});
    }, 10 * 1000);
    setInterval(() => {
      updater.checkNow({ silent: true }).catch(() => {});
    }, 60 * 60 * 1000);
  }
});

app.on('window-all-closed', (e) => {
  e.preventDefault();
});

app.on('before-quit', () => {
  if (widgetWindow && !widgetWindow.isDestroyed()) {
    const [wx, wy] = widgetWindow.getPosition();
    storage.setWindowPosition({ x: wx, y: wy });
  }
});

ipcMain.handle('settings:get', () => {
  const creds = storage.getCredentials();
  return {
    hasCookie: Boolean(creds?.sessionCookie),
    orgId: creds?.orgId ?? '',
    refreshIntervalSec: storage.getRefreshIntervalSec(),
    autoLaunch: storage.getAutoLaunch(),
    language: storage.getLanguage(),
    widgetOpacity: storage.getWidgetOpacity()
  };
});

ipcMain.handle('settings:save', async (_event, payload) => {
  const existing = storage.getCredentials() ?? {};
  if (payload.sessionCookie || payload.orgId) {
    storage.setCredentials({
      sessionCookie: payload.sessionCookie ?? existing.sessionCookie,
      orgId: payload.orgId ?? existing.orgId
    });
  }

  let intervalChanged = false;
  if (typeof payload.refreshIntervalSec === 'number') {
    const clamped = Math.max(MIN_INTERVAL_SEC, Math.min(MAX_INTERVAL_SEC, Math.round(payload.refreshIntervalSec)));
    if (clamped !== storage.getRefreshIntervalSec()) {
      storage.setRefreshIntervalSec(clamped);
      intervalChanged = true;
    }
  }

  if (typeof payload.autoLaunch === 'boolean') {
    storage.setAutoLaunch(payload.autoLaunch);
    syncAutoLaunch();
  }

  if (typeof payload.widgetOpacity === 'number') {
    const v = storage.setWidgetOpacity(payload.widgetOpacity);
    if (widgetWindow && !widgetWindow.isDestroyed()) widgetWindow.setOpacity(v);
  }

  let languageChanged = false;
  if (payload.language === 'ko' || payload.language === 'en') {
    if (payload.language !== storage.getLanguage()) {
      storage.setLanguage(payload.language);
      i18n.setLanguage(payload.language);
      languageChanged = true;
    }
  }

  if (languageChanged) {
    rebuildTrayMenu();
    broadcast('i18n:changed', { language: i18n.getLanguage(), dict: i18n.getDict() });
  }

  if (intervalChanged) {
    startFetchLoop();
  } else {
    refreshUsage();
  }
  return { ok: true };
});

ipcMain.handle('i18n:get', () => ({
  language: i18n.getLanguage(),
  dict: i18n.getDict()
}));

ipcMain.handle('telegram:get', () => ({
  botToken: storage.getTelegramBotToken(),
  chatId: storage.getTelegramChatId()
}));

ipcMain.handle('telegram:save-token', (_e, token) => {
  storage.setTelegramBotToken(token);
  return { ok: true };
});

ipcMain.handle('telegram:link', async (_e, token) => {
  try {
    const bot = await telegram.testToken(token);
    if (!bot) return { ok: false, error: 'invalid_token' };
    storage.setTelegramBotToken(token);
    const r = await telegram.resolveFirstChatId(token);
    storage.setTelegramChatId(r.chatId);
    return { ok: true, name: r.name, chatId: r.chatId };
  } catch (err) {
    return { ok: false, error: err.message };
  }
});

ipcMain.handle('telegram:test', async () => {
  const token = storage.getTelegramBotToken();
  const chatId = storage.getTelegramChatId();
  if (!token || !chatId) return { ok: false, error: 'not_linked' };
  const ok = await telegram.sendMessage(token, chatId, '✅ claudeState 텔레그램 연결 테스트 성공!');
  return { ok };
});

ipcMain.handle('usage:refresh', () => {
  refreshUsage();
});

ipcMain.handle('window:open-settings', () => {
  createSettingsWindow();
});

ipcMain.handle('app:quit', () => {
  app.quit();
});

ipcMain.handle('widget:hide', () => {
  hideWidget();
});

ipcMain.handle('widget:context-menu', () => {
  showWidgetContextMenu();
});

ipcMain.handle('widget:move', (_event, dx, dy) => {
  if (!widgetWindow || widgetWindow.isDestroyed()) return;
  const [x, y] = widgetWindow.getPosition();
  widgetWindow.setPosition(Math.round(x + dx), Math.round(y + dy), false);
});

ipcMain.handle('widget:drag-start', () => {
  if (!widgetWindow || widgetWindow.isDestroyed()) return null;
  const [x, y] = widgetWindow.getPosition();
  return { x, y };
});

ipcMain.handle('widget:set-position', (_event, x, y) => {
  if (!widgetWindow || widgetWindow.isDestroyed()) return;
  widgetWindow.setPosition(Math.round(x), Math.round(y), false);
});
