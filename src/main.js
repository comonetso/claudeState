const { app, BrowserWindow, ipcMain, Menu, Tray, screen, nativeImage, shell } = require('electron');
const path = require('path');
const fs = require('fs');
const { exec } = require('child_process');
const storage = require('./storage');
const api = require('./api');

let logStream = null;
let logFilePath = null;

function installLogTee() {
  logFilePath = path.join(app.getPath('userData'), 'cloudstate.log');
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

  console.log(`[cloudState] 로그 파일: ${logFilePath}`);
}

function openLogViewer() {
  if (!logFilePath) return;
  const batPath = path.join(app.getPath('userData'), 'view-log.cmd');
  const escapedPath = logFilePath.replace(/'/g, "''");
  const batContent = [
    '@echo off',
    'chcp 65001 >nul',
    'title cloudState log',
    `powershell -NoLogo -NoProfile -Command "[Console]::OutputEncoding = [System.Text.Encoding]::UTF8; Get-Content -LiteralPath '${escapedPath}' -Wait -Tail 200 -Encoding UTF8"`
  ].join('\r\n') + '\r\n';
  try {
    fs.writeFileSync(batPath, batContent, { encoding: 'utf8' });
  } catch (e) {
    console.error('[cloudState] 로그 뷰어 스크립트 생성 실패:', e.message);
    return;
  }
  exec(`start "" "${batPath}"`, { windowsHide: false }, (err) => {
    if (err) console.error('[cloudState] 로그 뷰어 실행 실패:', err.message);
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

function createWidgetWindow() {
  const display = screen.getPrimaryDisplay();
  const workArea = display.workArea;

  const saved = storage.getWindowPosition();
  const W = 200, H = 40;
  const defaultX = workArea.x + workArea.width - W - 5;
  const defaultY = workArea.y + workArea.height - H - 2;

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
    console.warn(`[cloudState] 저장된 위치 (${saved.x}, ${saved.y})가 화면 밖 — 기본 위치로 복원`);
  }

  widgetWindow = new BrowserWindow({
    width: 200,
    height: 40,
    x,
    y,
    frame: false,
    transparent: true,
    alwaysOnTop: true,
    skipTaskbar: true,
    resizable: false,
    hasShadow: false,
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false
    }
  });

  widgetWindow.setAlwaysOnTop(true, 'screen-saver');
  widgetWindow.loadFile(path.join(__dirname, 'widget', 'index.html'));

  let savePosTimer = null;
  const persistPosition = () => {
    if (!widgetWindow || widgetWindow.isDestroyed()) return;
    const [wx, wy] = widgetWindow.getPosition();
    const W = 200, H = 40;
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
    height: 380,
    title: 'cloudState 설정',
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
    console.warn('[cloudState] 트레이 아이콘 파일 없음 — 빈 아이콘 사용');
    icon = nativeImage.createEmpty();
  }
  tray = new Tray(icon);
  tray.setToolTip('cloudState');

  const menu = Menu.buildFromTemplate([
    { label: '설정', click: () => createSettingsWindow() },
    { label: '지금 새로고침', click: () => refreshUsage() },
    { type: 'separator' },
    { label: '위치 초기화 (우하단으로)', click: () => resetWidgetPosition() },
    { label: '로그 보기', click: () => openLogViewer() },
    { label: '로그 폴더 열기', click: () => { if (logFilePath) shell.showItemInFolder(logFilePath); } },
    { type: 'separator' },
    { label: '종료', click: () => app.quit() }
  ]);
  tray.setContextMenu(menu);
}

function resetWidgetPosition() {
  if (!widgetWindow || widgetWindow.isDestroyed()) return;
  const display = screen.getPrimaryDisplay();
  const a = display.workArea;
  const x = a.x + a.width - 205;
  const y = a.y + a.height - 42;
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
    console.log(`[cloudState] 갱신: 세션 ${n.sessionPercent ?? '?'}% / 주간 ${n.weeklyPercent ?? '?'}%`);
    broadcast('usage:update', { status: 'ok', data });
  } catch (err) {
    if (err.code === 'AUTH_EXPIRED') {
      console.error(`[cloudState] 쿠키 만료 감지: ${err.message}`);
      broadcast('usage:update', { status: 'auth_expired', message: err.message });
    } else {
      console.error(`[cloudState] API 실패: ${err.message}`);
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

function startFetchLoop() {
  if (fetchTimer) clearInterval(fetchTimer);
  const sec = storage.getRefreshIntervalSec();
  console.log(`[cloudState] 새로고침 간격: ${sec}초`);
  refreshUsage();
  fetchTimer = setInterval(refreshUsage, sec * 1000);
}

app.whenReady().then(() => {
  installLogTee();
  createWidgetWindow();
  createTray();
  startFetchLoop();
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
    refreshIntervalSec: storage.getRefreshIntervalSec()
  };
});

ipcMain.handle('settings:save', async (_event, payload) => {
  const existing = storage.getCredentials() ?? {};
  storage.setCredentials({
    sessionCookie: payload.sessionCookie ?? existing.sessionCookie,
    orgId: payload.orgId ?? existing.orgId
  });

  if (typeof payload.refreshIntervalSec === 'number') {
    const clamped = Math.max(MIN_INTERVAL_SEC, Math.min(MAX_INTERVAL_SEC, Math.round(payload.refreshIntervalSec)));
    storage.setRefreshIntervalSec(clamped);
    startFetchLoop();
  } else {
    refreshUsage();
  }
  return { ok: true };
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
