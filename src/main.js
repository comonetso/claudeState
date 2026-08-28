const { app, BrowserWindow, Notification, ipcMain, Menu, Tray, screen, nativeImage, shell } = require('electron');
const path = require('path');
const fs = require('fs');
const { exec } = require('child_process');
const storage = require('./storage');
const api = require('./api');
const codex = require('./codex');
const i18n = require('./i18n');
const { t } = i18n;
const updater = require('./updater');
const telegram = require('./telegram');
const taskbarGuard = require('./taskbarGuard');

app.setAppUserModelId('com.comonetso.claudestate');

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
    syncWidgetVisibility('second-instance');
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
    // KST(UTC+9) 기준으로 로컬 타임 형식 출력
    const d = new Date();
    const pad = (n) => String(n).padStart(2, '0');
    const ts = `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())} ${pad(d.getHours())}:${pad(d.getMinutes())}:${pad(d.getSeconds())}`;
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

// ---------------------------------------------------------------------------
// 위젯 크기 — 반드시 이 한 곳에서만 정한다.
//
// 예전에는 창 생성·위치 저장·표시 복원·위치 초기화·IPC 이동에 280/40 이 각각 박혀 있어
// 크기를 바꾸려면 일곱 군데를 따라다녀야 했다. Codex 열이 붙으면 폭이 달라지므로
// 그 구조로는 어긋나는 곳이 반드시 생긴다. CSS 도 숫자를 버리고 100%/100vh 로 따라온다.
// ---------------------------------------------------------------------------
const WIDGET_H = 40;
const WIDGET_W_BASE = 280;   // Claude 만 표시
// 두 열 모드. 한 칸이 137px 이 되어 아이콘11 + 퍼센트30 + 잔여시간이 들어간다.
// 실측으로 최장 문구("2일 18시간 후")까지 잘리지 않는 하한이다.
const WIDGET_W_CODEX = 310;

// 상세 패널 — 위젯에 마우스를 올리면 뜨는 별도 창.
// 네이티브 title 툴팁은 글꼴·색·여백을 하나도 손댈 수 없어 창으로 옮겼다.
const PANEL_W = 300;
const PANEL_GAP = 6;
// 렌더러가 내용 높이를 재서 알려주기 전까지 쓰는 임시값.
let panelHeight = 210;

// 이 PC 에 codex CLI 가 있는가. 설정 토글이 아니라 자동 감지 결과다.
let codexEnabled = false;

function widgetW() {
  return codexEnabled ? WIDGET_W_CODEX : WIDGET_W_BASE;
}

// 이 좌표가 어느 한 모니터 안에 들어가는가.
// 작업표시줄 위에 겹쳐 둔 위치도 유효로 인정해야 하므로 workArea 가 아닌 bounds 기준이다.
// workArea 로 되돌리면 작업표시줄 겹침 위치가 "화면 밖"으로 판정돼 위치 기억이 깨진다(v0.3.6).
function fitsAnyDisplay(px, py, w = widgetW(), h = WIDGET_H) {
  return screen.getAllDisplays().some((d) => {
    const a = d.bounds;
    return px >= a.x && px + w <= a.x + a.width && py >= a.y && py + h <= a.y + a.height;
  });
}

function findTrayIcon() {
  for (const p of TRAY_ICON_CANDIDATES) {
    if (fs.existsSync(p)) return p;
  }
  return null;
}

let widgetWindow = null;
let settingsWindow = null;
let panelWindow = null;
let panelVisible = false;
// 마지막으로 브로드캐스트한 usage payload. 늦게 로드된 창에 다시 보내준다.
let lastUsagePayload = null;
let tray = null;
let fetchTimer = null;
let reaffirmTimer = null;

function createWidgetWindow() {
  const display = screen.getPrimaryDisplay();
  const workArea = display.workArea;

  const saved = storage.getWindowPosition();
  const W = widgetW();
  const defaultX = workArea.x + workArea.width - W - 8;
  const defaultY = workArea.y + workArea.height - WIDGET_H - 8;

  let x = defaultX;
  let y = defaultY;
  if (saved && fitsAnyDisplay(saved.x, saved.y)) {
    x = saved.x;
    y = saved.y;
  } else if (saved) {
    console.warn(`[claudeState] 저장된 위치 (${saved.x}, ${saved.y})가 화면 밖 — 기본 위치로 복원`);
  }

  const startHidden = storage.getWidgetVisible() === false;

  widgetWindow = new BrowserWindow({
    width: W,
    height: WIDGET_H,
    minWidth: W,
    maxWidth: W,
    minHeight: WIDGET_H,
    maxHeight: WIDGET_H,
    useContentSize: true,
    x,
    y,
    frame: false,
    transparent: false,
    backgroundColor: '#141418',
    alwaysOnTop: true,
    skipTaskbar: true,
    resizable: false,
    hasShadow: false,
    show: false, // 흰 화면 방지: 컨텐츠 로드(did-finish-load) 완료 후 표시
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false
    }
  });

  // transparent:false 상태에서는 setOpacity가 DWM 이중 투명도 문제 없음
  widgetWindow.setOpacity(storage.getWidgetOpacity());
  // alwaysOnTop을 명시적으로 보강 — 작업표시줄 뒤로 숨는 현상 방지
  widgetWindow.setAlwaysOnTop(true, 'normal');
  widgetWindow.loadFile(path.join(__dirname, 'widget', 'index.html'));

  widgetWindow.webContents.on('context-menu', (e) => {
    e.preventDefault();
    showWidgetContextMenu();
  });

  // 로드 완료 후 투명도/최상위 재보증 (일부 환경에서 초기 적용이 씹히는 경우 대응)
  widgetWindow.webContents.on('did-finish-load', () => {
    try {
      widgetWindow.setOpacity(storage.getWidgetOpacity());
      widgetWindow.setAlwaysOnTop(true, 'normal');
      // 컨텐츠가 준비된 뒤 표시 → 최초 실행 흰 화면 방지
      if (!startHidden) {
        widgetWindow.showInactive();
        widgetWindow.moveTop();
      }
    } catch {}
    // 로드 전에 지나간 갱신이 있으면 다시 보낸다.
    if (lastUsagePayload && widgetWindow && !widgetWindow.isDestroyed()) {
      widgetWindow.webContents.send('usage:update', lastUsagePayload);
    }
  });

  let savePosTimer = null;
  const persistPosition = () => {
    if (!widgetWindow || widgetWindow.isDestroyed()) return;
    const [wx, wy] = widgetWindow.getPosition();
    if (!fitsAnyDisplay(wx, wy)) return;
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

// ---------------------------------------------------------------------------
// 상세 패널
//
// 앱 시작 시 미리 만들어 두고 숨겨만 둔다. 그래야 usage:update 브로드캐스트를 처음부터
// 받아 두어서, 마우스를 올린 순간 이미 그려진 내용이 나온다.
// ---------------------------------------------------------------------------
function createPanelWindow() {
  panelWindow = new BrowserWindow({
    width: PANEL_W,
    height: panelHeight,
    useContentSize: true,
    frame: false,
    // transparent 는 쓰지 않는다 — v0.3.2 에서 DWM 이중 투명도로 위젯이 불안정했다.
    transparent: false,
    backgroundColor: '#16161b',
    alwaysOnTop: true,
    skipTaskbar: true,
    resizable: false,
    hasShadow: true,
    // 마우스를 올렸을 뿐인데 작업 중이던 창의 포커스를 뺏으면 안 된다.
    focusable: false,
    show: false,
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
      // 숨어 있는 동안에도 갱신을 받아 둬야 마우스를 올린 순간 이미 그려져 있다.
      backgroundThrottling: false
    }
  });

  panelWindow.setAlwaysOnTop(true, 'normal');
  panelWindow.loadFile(path.join(__dirname, 'panel', 'index.html'));

  // 로드가 끝나기 전에 지나간 브로드캐스트를 놓치지 않도록 마지막 값을 다시 보낸다.
  panelWindow.webContents.on('did-finish-load', () => {
    if (lastUsagePayload && panelWindow && !panelWindow.isDestroyed()) {
      panelWindow.webContents.send('usage:update', lastUsagePayload);
    }
  });

  panelWindow.on('closed', () => {
    panelWindow = null;
    panelVisible = false;
  });
}

// 위젯을 기준으로 패널을 놓는다. 기본은 위쪽 — 위젯이 보통 화면 아래에 붙어 있기 때문이다.
function positionPanel() {
  if (!panelWindow || panelWindow.isDestroyed()) return;
  if (!widgetWindow || widgetWindow.isDestroyed()) return;

  const wb = widgetWindow.getBounds();
  const area = screen.getDisplayNearestPoint({
    x: wb.x + Math.floor(wb.width / 2),
    y: wb.y
  }).workArea;

  // 위 공간이 모자라면 아래로 뒤집고, 그래도 안 되면 화면 안으로 밀어 넣는다.
  let y = wb.y - panelHeight - PANEL_GAP;
  if (y < area.y) y = wb.y + wb.height + PANEL_GAP;
  if (y + panelHeight > area.y + area.height) {
    y = Math.max(area.y, area.y + area.height - panelHeight);
  }

  // 위젯 오른쪽 끝에 맞춘다. 위젯이 대개 우하단에 있어 이쪽이 자연스럽다.
  let x = wb.x + wb.width - PANEL_W;
  x = Math.max(area.x, Math.min(x, area.x + area.width - PANEL_W));

  panelWindow.setBounds({ x, y, width: PANEL_W, height: panelHeight }, false);
}

function showPanel() {
  if (!widgetWindow || widgetWindow.isDestroyed()) return;
  if (!storage.getWidgetVisible()) return;
  if (!panelWindow || panelWindow.isDestroyed()) createPanelWindow();
  panelVisible = true;
  positionPanel();
  try {
    panelWindow.showInactive();
    panelWindow.setAlwaysOnTop(true, 'normal');
    panelWindow.moveTop();
  } catch (e) {
    console.warn(`[claudeState] 패널 표시 실패: ${e.message}`);
  }
}

function hidePanel() {
  panelVisible = false;
  if (panelWindow && !panelWindow.isDestroyed()) panelWindow.hide();
}

function createSettingsWindow() {
  if (settingsWindow) {
    settingsWindow.focus();
    return;
  }

  settingsWindow = new BrowserWindow({
    width: 480,
    // 리셋 알림 토글이 스크롤 아래로 숨지 않도록 720 (v0.4.1)
    height: 720,
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

  // 좌클릭으로 위젯 숨김/표시 토글
  tray.on('click', () => {
    if (storage.getWidgetVisible()) {
      hideWidget();
    } else {
      showWidget();
    }
  });

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

// 현재 폭/높이를 창에 반영한다. Codex 감지 상태가 바뀌면 폭이 달라지므로
// 최소·최대 크기까지 함께 갱신해야 한다(고정해 두면 setBounds 가 먹지 않는다).
function applyWidgetSize() {
  if (!widgetWindow || widgetWindow.isDestroyed()) return;
  const w = widgetW();
  try {
    let [x, y] = widgetWindow.getPosition();

    // 위젯은 보통 화면 우하단에 붙어 있다. Codex 열이 붙어 폭이 늘면 그만큼
    // 오른쪽이 잘리므로, 화면 밖으로 나가는 경우에만 안쪽으로 당긴다.
    if (!fitsAnyDisplay(x, y, w, WIDGET_H)) {
      const a = screen.getDisplayNearestPoint({ x, y }).bounds;
      x = Math.max(a.x, Math.min(x, a.x + a.width - w));
      y = Math.max(a.y, Math.min(y, a.y + a.height - WIDGET_H));
    }

    widgetWindow.setMinimumSize(w, WIDGET_H);
    widgetWindow.setMaximumSize(w, WIDGET_H);
    widgetWindow.setBounds({ x, y, width: w, height: WIDGET_H }, false);
    storage.setWindowPosition({ x, y });
  } catch (e) {
    console.warn(`[claudeState] 위젯 크기 적용 실패: ${e.message}`);
  }
}

function showWidget() {
  storage.setWidgetVisible(true);
  if (!widgetWindow || widgetWindow.isDestroyed()) {
    createWidgetWindow();
  } else {
    syncWidgetVisibility('user-show');
    // show는 우리 프로세스 내부 동작이라(SKIPOWNPROCESS) 이벤트 훅이 발동하지 않는다.
    // 작업표시줄 영역 위에 있으면 뒤에 깔린 채 안 올라오므로 여기서 직접 최상위로 복원.
    // (전체화면 중이라 syncWidgetVisibility 가 실제로 보여주지 않았다면 아래는 무해하게 스킵된다)
    setImmediate(() => {
      if (!widgetWindow || widgetWindow.isDestroyed() || !widgetWindow.isVisible()) return;
      applyWidgetSize();
      widgetWindow.setAlwaysOnTop(true, 'normal');
      widgetWindow.setOpacity(storage.getWidgetOpacity());
      widgetWindow.moveTop();
    });
  }
  rebuildTrayMenu();
}

function hideWidget() {
  storage.setWidgetVisible(false);
  syncWidgetVisibility('user-hide');
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
  // 우하단에서 8px 띄운다.
  const x = a.x + a.width - widgetW() - 8;
  const y = a.y + a.height - WIDGET_H - 8;
  widgetWindow.setPosition(x, y, false);
  storage.setWindowPosition({ x, y });
}

// ---------------------------------------------------------------------------
// Codex 사용량
//
// Claude 자격증명과 무관하다. 쿠키가 없거나 만료돼도 Codex 표시는 살아 있어야 한다.
// ---------------------------------------------------------------------------
let lastCodexUsage = null;
let codexLastProbeAt = 0;

// app-server 는 조회할 때마다 자식 프로세스를 띄우므로 Claude 의 HTTP 조회보다 비싸다.
// 새로고침 간격을 10초로 낮춰 두더라도 Codex 만은 이 아래로 내려가지 않는다.
const CODEX_MIN_INTERVAL_MS = 60 * 1000;

// codex 설치 여부를 다시 확인한다. 매 갱신마다 보므로, 앱을 켜 둔 채 codex 를
// 새로 설치해도 재시작 없이 열이 붙는다.
async function refreshCodexDetection() {
  const found = await codex.detect();
  const next = Boolean(found);
  if (next === codexEnabled) return;
  codexEnabled = next;
  console.log(`[claudeState] Codex ${next ? `감지: ${found}` : '미감지 — 열 숨김'}`);
  applyWidgetSize();
}

// 절대 reject 하지 않는다. Codex 조회 실패가 Claude 표시를 막으면 안 된다.
async function refreshCodexUsage() {
  if (!codexEnabled) {
    lastCodexUsage = null;
    return;
  }
  if (Date.now() - codexLastProbeAt < CODEX_MIN_INTERVAL_MS) return;
  codexLastProbeAt = Date.now();
  try {
    const n = await codex.fetchRateLimits();
    // 실패하면 직전 값을 유지한다. 언제 관측한 값인지는 툴팁에 남는다.
    if (n) lastCodexUsage = n;
  } catch (e) {
    console.warn(`[claudeState] Codex 조회 예외: ${e.message}`);
  }
}

// 모든 usage 브로드캐스트는 이걸 거친다 — Codex 상태를 빠뜨리는 경로가 없도록.
// 마지막 값을 남겨 두는 것은, 창이 로드되기 전에 지나간 갱신을 뒤늦게 복원하기 위해서다.
function broadcastUsage(payload) {
  lastUsagePayload = { ...payload, codexEnabled, codex: lastCodexUsage };
  broadcast('usage:update', lastUsagePayload);
}

function codexLogSuffix() {
  if (!codexEnabled || !lastCodexUsage) return '';
  const u = lastCodexUsage;
  const s = u.hasFiveHour ? `${u.sessionPercent ?? '?'}%` : '없음';
  return ` | Codex 세션 ${s} / 주간 ${u.weeklyPercent ?? '?'}%`;
}

async function refreshUsage() {
  await refreshCodexDetection();

  const creds = storage.getCredentials();
  if (!creds?.sessionCookie || !creds?.orgId) {
    // 쿠키가 없어도 Codex 는 보여줄 수 있다.
    await refreshCodexUsage();
    broadcastUsage({ status: 'unconfigured' });
    return;
  }

  broadcastUsage({ status: 'loading' });

  // 서로 독립된 조회라 나란히 돌린다. codexTask 는 위 정의상 reject 하지 않는다.
  const codexTask = refreshCodexUsage();

  try {
    const data = await api.fetchUsage(creds.sessionCookie, creds.orgId);
    await codexTask;
    const n = data.normalized;
    console.log(`[claudeState] 갱신: 세션 ${n.sessionPercent ?? '?'}% / 주간 ${n.weeklyPercent ?? '?'}%${codexLogSuffix()}`);

    // 세션 리셋 감지 (영속 저장 기반)
    // 규칙:
    //   (a) 저장된 prev가 존재하고 이미 과거(만료) → 리셋된 시점 → 발사
    //   (b) 현재 sessionResetAt이 값이 있으면 저장 (재무장)
    //   (c) 현재 sessionResetAt이 null이면 저장값을 null로 — 발사 후 재무장 대비
    // 앱 최초 실행 + 현재 null → prev도 null → 감지 무시 (이미 리셋된 지 오래)
    const prev = storage.getLastSessionResetAt();
    const cur = n.sessionResetAt ?? null;
    if (prev) {
      const prevExpired = new Date(prev).getTime() < Date.now();
      const changed = cur !== prev;
      if (prevExpired && changed) {
        // prev가 만료된 상태에서 값이 변경됨 → 진짜 리셋 인지
        console.log(`[claudeState] 세션 리셋 감지: prev=${prev} → cur=${cur ?? 'null'}`);
        onSessionReset(n.weeklyPercent ?? 0);
        storage.setLastSessionResetAt(null); // 발사 후 해제 (cur로 덮어쓰기 방지)
      } else if (cur && cur !== prev) {
        // prev는 아직 미래 + cur 값이 바뀜 → 단순 상태 갱신
        storage.setLastSessionResetAt(cur);
      }
    } else if (cur) {
      // 첫 관측 또는 발사 후 새 세션 시작 → 재무장
      storage.setLastSessionResetAt(cur);
    }

    broadcastUsage({ status: 'ok', data });
  } catch (err) {
    // Claude 조회가 깨져도 Codex 값은 실어 보낸다.
    await codexTask;
    if (err.code === 'AUTH_EXPIRED') {
      console.error(`[claudeState] 쿠키 만료 감지: ${err.message}`);
      broadcastUsage({ status: 'auth_expired', message: err.message });
    } else {
      console.error(`[claudeState] API 실패: ${err.message}`);
      broadcastUsage({ status: 'error', message: err.message });
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
  // VS Code 확장(claudeStateBar)도 같은 리셋 알림을 보낸다. 둘 다 쓰면 두 번 오므로
  // 끌 수 있게 했다. 이 앱만 쓰는 사용자에게는 필요한 기능이라 기본은 켜 둔다.
  if (!storage.getTelegramNotifyOnReset()) return;
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

// 표시 중인 위젯을 z-order 최상단으로 1회 끌어올린다 (포커스 미탈취).
function bringWidgetToTop() {
  if (!widgetWindow || widgetWindow.isDestroyed()) return;
  if (!widgetWindow.isVisible()) return;
  try {
    widgetWindow.moveTop();
    // 패널도 같이 올린다. 위젯만 올리면 열려 있던 패널이 작업표시줄 뒤로 깔린다.
    if (panelVisible && panelWindow && !panelWindow.isDestroyed()) panelWindow.moveTop();
  } catch {}
}

// 정상 경로: 작업표시줄 z-order 이벤트 훅 (src/taskbarGuard.js).
// 다른 창이 포그라운드가 되는 순간만 감지해 위젯을 복원 → 깜빡임/지연/유휴부하 0.
// FFI 로드/훅 등록이 실패하는 환경에서만 폴링 폴백으로 내려간다.
// ---------------------------------------------------------------------------
// 전체화면 복귀 대응 — 조건부 z-order 감시 (v0.4.1)
//
// 이벤트 훅만으로는 못 잡는 경로가 있다. 브라우저 F11 이나 동영상 내부 전체화면은
// 같은 HWND 가 계속 포그라운드라 EVENT_SYSTEM_FOREGROUND 가 발생하지 않는다.
// 그래서 복귀 후 위젯이 작업표시줄 뒤에 깔리면 **복원을 부를 경로가 하나도 없다.**
//
// 🔴 v0.3.1 에서 실패한 워치독과는 다르다. 그것은 3초마다 조건 없이 moveTop +
// setAlwaysOnTop 을 실행해 깜빡임을 만들었다. 이쪽은 값 몇 개를 읽고, 아래 네 조건이
// 모두 맞을 때만 1회 올린다 — 정상 상태에서 z-order 변경은 0회다.
//
//   ① 위젯이 표시 중                ② 위젯이 작업표시줄 영역과 겹침
//   ③ 잠금·전체화면·프레젠테이션이 아님   ④ 실제 Win32 순서에서 작업표시줄이 위젯보다 위
// ---------------------------------------------------------------------------
const ZORDER_AUDIT_MS = 1000;      // 감시 주기 (2026-08-26 사용자 결정)
const ZORDER_DEBOUNCE_MS = 80;
const ZORDER_RECHECK_MS = 120;     // 복원 직후 성공 여부를 되재는 간격

// 전체화면 능동 숨김의 진입/이탈 확인 횟수 (1초 폴링 기준). 진입은 즉시, 이탈은 1회
// 더 확인해 짧은 흔들림에 반응하지 않는다 (2026-08-27, codex_rescue 조사 기반).
const FULLSCREEN_HIDE_ENTER_SAMPLES = 1;
const FULLSCREEN_HIDE_EXIT_SAMPLES = 2;

let zorderTimer = null;
let zorderDebounce = null;
let zorderAuditEnabled = false;
let fullscreenHideActive = false;
let fullscreenEnterRun = 0;
let fullscreenExitRun = 0;

// z-order 복원 억제(끌어올림 보류)용 — 보수적으로 넓게 잡는다. 잠금·BUSY·전체화면·
// 프레젠테이션 중에 위젯을 끌어올리면 화면 위로 튀어나온다.
function isFullscreenLikeState(st) {
  return st !== null && st >= 1 && st <= 4;
}

// 능동 숨김 트리거용 — 좁게 잡는다. SHQUNS 값 2(QUNS_BUSY)는 "알림을 띄워도 되는가"의
// 광범위한 휴리스틱일 뿐 안정적인 전체화면 신호가 아니다. codex_rescue 조사
// (docs/codex_rescue/260827_081321_response_fullscreen-hide-flicker.md)로 확인된
// 실제 원인 — 1~4 를 전부 능동 숨김에 연결해 이 값의 흔들림이 그대로 깜빡임이 됐다.
// Chromium 도 같은 API에서 3/4 만 fullscreen 으로 인정한다.
function isPlatformFullscreenState(st) {
  return st === 3 || st === 4;
}

// 활성 창이 모니터 화면(작업표시줄 포함 전체 해상도)을 통째로 덮고 있는가.
// 브라우저의 웹 전체화면(유튜브·넷플릭스 등 Fullscreen API)은 SHQueryUserNotificationState 로
// 못 잡으므로 native Win32 좌표계에서 직접 계산한다 — Electron 의 screen 모듈(DIP 좌표)과
// 섞으면 고배율 DPI 환경에서 판정이 어긋난다(이전 버전의 결함, 실전 0건 성공으로 확인됨).
let lastFullscreenGeometryActive = null; // 진단용 — 판정이 뒤집힐 때만 상세 로그
let lastFullscreenWindowHandle = null; // 포커스를 잃어도 "여전히 안 가려짐"을 재확인할 대상
let obstructedRun = 0; // 같은 창이 다른 창에 가려진 것으로 연속 확인된 횟수(1초 폴링 기준)

function isForegroundFullscreen() {
  if (!widgetWindow || widgetWindow.isDestroyed()) return false;

  let info = taskbarGuard.getForegroundFullscreenInfo();

  if (info.covers) {
    lastFullscreenWindowHandle = info.hwnd;
    obstructedRun = 0;
  } else if (lastFullscreenWindowHandle) {
    // 포커스는 다른 창으로 넘어갔지만, 직전 전체화면 창이 실제로는 안 가려진 채
    // 남아있을 수 있다 — 그 창 하나만 좁게 재확인한다(2026-08-28, z-order 전역 순회의
    // 회귀를 되돌리고 대신 도입).
    const still = taskbarGuard.isStillCoveringUnobstructed(
      lastFullscreenWindowHandle,
      widgetWindow.getNativeWindowHandle()
    );
    if (still.covers) {
      info = still;
      obstructedRun = 0;
    } else if (still.reason === 'obstructed') {
      // Alt+Tab 전환 UI 등 짧게 스쳐가는 창 하나만으로 추적을 버리면, 다음 폴링엔 재확인할
      // 대상 자체가 없어져 그대로 "가려짐 확정"이 돼 버린다(2026-08-28 실측 확인 — obstruction
      // 1회가 그대로 위젯 재등장으로 이어졌다). 같은 창을 대상으로 연속 확인될 때만 확정한다.
      obstructedRun += 1;
      if (obstructedRun < FULLSCREEN_HIDE_EXIT_SAMPLES) {
        info = { ...still, covers: true, reason: 'obstructed-pending' };
      } else {
        const or = still.obstructedRect;
        const orStr = or ? `(${or.left},${or.top})-(${or.right},${or.bottom})` : 'na';
        console.log(
          `[claudeState] 전체화면 유지 재확인 실패: "${still.obstructedBy || '(알수없음)'}" 창에 가려짐 ` +
          `obstructedRect=${orStr}`
        );
        lastFullscreenWindowHandle = null;
        obstructedRun = 0;
      }
    } else {
      // 창 자체가 사라짐·최소화·전체화면 geometry 이탈 — 노이즈가 아니라 실제 종료다.
      lastFullscreenWindowHandle = null;
      obstructedRun = 0;
    }
  }

  if (info.covers !== lastFullscreenGeometryActive) {
    const r = info.rect ? `(${info.rect.left},${info.rect.top})-(${info.rect.right},${info.rect.bottom})` : 'na';
    const mr = info.monitorRect
      ? `(${info.monitorRect.left},${info.monitorRect.top})-(${info.monitorRect.right},${info.monitorRect.bottom})`
      : 'na';
    console.log(
      `[claudeState] 전체화면 native 판정 전이: covers=${info.covers} reason=${info.reason} ` +
      `class="${info.className || ''}" style=0x${(info.style >>> 0 || 0).toString(16)} ` +
      `exStyle=0x${(info.exStyle >>> 0 || 0).toString(16)} rect=${r} monitor=${mr}`
    );
    lastFullscreenGeometryActive = info.covers;
  }
  return info.covers;
}

// 위젯을 보이고/숨기는 유일한 창구. 사용자 표시 의도(storage.getWidgetVisible)와
// 전체화면 정책(fullscreenHideActive)을 합쳐 실제 가시성과 맞춘다.
// second-instance·트레이 show/hide 가 각자 showInactive()/hide() 를 직접 부르면 이
// 정책을 우회해 "전체화면 중인데 다시 나타남" 같은 꼬임이 생긴다 — codex_rescue 조사에서
// 08:08:14→08:08:25 재현의 유력 원인으로 지목된 지점이다.
function syncWidgetVisibility(reason) {
  if (!widgetWindow || widgetWindow.isDestroyed()) return;
  const shouldShow = storage.getWidgetVisible() && !fullscreenHideActive;

  if (shouldShow && !widgetWindow.isVisible()) {
    widgetWindow.showInactive();
    console.log(`[claudeState] 위젯 표시 (${reason})`);
  } else if (!shouldShow && widgetWindow.isVisible()) {
    widgetWindow.hide();
    hidePanel();
    console.log(`[claudeState] 위젯 숨김 (${reason})`);
  }
}

// 전체화면(동영상 전체화면·게임 등) 감지 시 위젯을 완전히 숨긴다 (2026-08-27 사용자 결정).
function auditFullscreenHide() {
  if (!widgetWindow || widgetWindow.isDestroyed()) return;
  const st = taskbarGuard.queryNotificationState();
  const active = isPlatformFullscreenState(st) || isForegroundFullscreen();

  if (active) {
    fullscreenEnterRun += 1;
    fullscreenExitRun = 0;
  } else {
    fullscreenExitRun += 1;
    fullscreenEnterRun = 0;
  }

  if (!fullscreenHideActive && fullscreenEnterRun >= FULLSCREEN_HIDE_ENTER_SAMPLES) {
    fullscreenHideActive = true;
  } else if (fullscreenHideActive && fullscreenExitRun >= FULLSCREEN_HIDE_EXIT_SAMPLES) {
    fullscreenHideActive = false;
  }

  syncWidgetVisibility('fullscreen-audit');
}

// 위젯이 작업표시줄 영역을 침범하고 있는가.
// workArea 는 작업표시줄을 제외한 영역이므로, 그 밖으로 나가 있으면 겹친 것이다.
function widgetOverlapsTaskbarArea() {
  if (!widgetWindow || widgetWindow.isDestroyed()) return false;
  const b = widgetWindow.getBounds();
  const a = screen.getDisplayMatching(b).workArea;
  return b.x < a.x || b.y < a.y
    || b.x + b.width > a.x + a.width
    || b.y + b.height > a.y + a.height;
}

function auditTaskbarZOrder(reason) {
  if (!zorderAuditEnabled) return;
  if (!widgetWindow || widgetWindow.isDestroyed()) return;
  if (!widgetWindow.isVisible()) return;
  if (!widgetOverlapsTaskbarArea()) return;

  // 전체화면·프레젠테이션·잠금 중에 끌어올리면 영상 위로 위젯이 튀어나온다.
  const st = taskbarGuard.queryNotificationState();
  if (isFullscreenLikeState(st)) return;

  if (!taskbarGuard.isOverlappedByTaskbarAbove(widgetWindow.getNativeWindowHandle())) return;

  console.warn(`[claudeState] z-order 이상 감지 (${reason}) → 복원 시도`);
  bringWidgetToTop();

  // 복원됐는지 실제로 되재야 "훅 미수신"과 "moveTop 무효"를 구분할 수 있다.
  // 이 구분 로그가 없어서 원인 규명에 시간이 걸렸다.
  setTimeout(() => {
    if (!widgetWindow || widgetWindow.isDestroyed()) return;
    const h = widgetWindow.getNativeWindowHandle();
    if (!taskbarGuard.isOverlappedByTaskbarAbove(h)) {
      console.log('[claudeState] z-order 복원 성공 (moveTop)');
      return;
    }
    // moveTop 이 안 먹었다 = 밴드 내 순서가 아니라 topmost 소속 자체를 잃었을 수 있다.
    const called = taskbarGuard.forceTopmost(h);
    const fixed = !taskbarGuard.isOverlappedByTaskbarAbove(h);
    console.warn(
      `[claudeState] moveTop 무효 → SetWindowPos(HWND_TOPMOST) ${called ? '호출' : '실패'} / 결과 ${fixed ? '성공' : '실패'}`
    );
  }, ZORDER_RECHECK_MS);
}

// WinEvent 콜백 안에서 무거운 일을 하지 않도록 한 박자 빼서 실행한다.
function scheduleZOrderAudit(reason) {
  if (zorderDebounce) clearTimeout(zorderDebounce);
  zorderDebounce = setTimeout(() => {
    auditFullscreenHide();
    auditTaskbarZOrder(reason);
  }, ZORDER_DEBOUNCE_MS);
}

function startTaskbarGuard() {
  try {
    // 🔴 기존 콜백은 그대로 둔다. 작업표시줄 클릭 복원은 지금 잘 동작하는 경로라
    //    조건부로 바꾸면 회귀 위험만 생긴다. 새 감시는 타이머 쪽에만 붙인다.
    taskbarGuard.start(() => bringWidgetToTop());
    console.log('[claudeState] 작업표시줄 z-order 이벤트 훅 활성화');
  } catch (e) {
    console.error(`[claudeState] 이벤트 훅 실패 → 폴링 폴백: ${e.message}`);
    startPollingFallback();
    return;
  }

  // 조회 FFI 가 안 되는 환경이면 감시만 끈다 — 그 경우 동작은 v0.4.0 과 완전히 같다.
  try {
    taskbarGuard.queryNotificationState();
    if (widgetWindow && !widgetWindow.isDestroyed()) {
      taskbarGuard.isOverlappedByTaskbarAbove(widgetWindow.getNativeWindowHandle());
    }
    zorderAuditEnabled = true;
    zorderTimer = setInterval(() => {
      auditFullscreenHide();
      auditTaskbarZOrder('watchdog');
    }, ZORDER_AUDIT_MS);
    console.log(`[claudeState] z-order 조건부 감시 활성화 (${ZORDER_AUDIT_MS}ms · 정상 시 무동작)`);
  } catch (e) {
    zorderAuditEnabled = false;
    console.error(`[claudeState] z-order 조회 불가 → 조건부 감시 비활성화: ${e.message}`);
  }
}

// 폴백 전용: 이벤트 훅이 불가능한 환경을 위한 저빈도 재부상 타이머.
const REAFFIRM_INTERVAL_MS = 1500;

function startPollingFallback() {
  if (reaffirmTimer) clearInterval(reaffirmTimer);
  reaffirmTimer = setInterval(bringWidgetToTop, REAFFIRM_INTERVAL_MS);
}

app.whenReady().then(async () => {
  installLogTee();
  i18n.setLanguage(storage.getLanguage());
  syncAutoLaunch();
  // 창을 만들기 전에 감지한다. 만든 뒤에 넓히면 우하단에 붙은 위젯이 한 번 움찔한다.
  // 실측 82ms 라 시작이 느려지지 않는다.
  await refreshCodexDetection();
  createWidgetWindow();
  createPanelWindow();
  createTray();
  startFetchLoop();
  startTaskbarGuard();

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
  try { taskbarGuard.stop(); } catch {}
  if (reaffirmTimer) { clearInterval(reaffirmTimer); reaffirmTimer = null; }
  if (zorderTimer) { clearInterval(zorderTimer); zorderTimer = null; }
  if (zorderDebounce) { clearTimeout(zorderDebounce); zorderDebounce = null; }
  if (panelWindow && !panelWindow.isDestroyed()) {
    panelWindow.destroy();
    panelWindow = null;
  }
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
  chatId: storage.getTelegramChatId(),
  notifyOnReset: storage.getTelegramNotifyOnReset()
}));

ipcMain.handle('telegram:set-notify', (_e, enabled) => ({
  ok: true,
  notifyOnReset: storage.setTelegramNotifyOnReset(enabled)
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

ipcMain.handle('panel:show', () => {
  showPanel();
});

ipcMain.handle('panel:hide', () => {
  hidePanel();
});

// 패널 높이는 내용이 정한다. Codex 유무·모델별 수치 유무로 줄 수가 달라지기 때문에
// 렌더러가 잰 값을 그대로 쓴다. 범위를 잡아 두는 건 잘못된 값이 와도 창이 망가지지 않게 하려는 것.
ipcMain.handle('panel:resize', (_event, height) => {
  const h = Math.round(Number(height) || 0);
  if (!Number.isFinite(h) || h <= 0) return;
  const clamped = Math.max(80, Math.min(600, h));
  if (clamped === panelHeight) return;
  panelHeight = clamped;
  if (panelVisible) {
    positionPanel();
  } else if (panelWindow && !panelWindow.isDestroyed()) {
    const b = panelWindow.getBounds();
    panelWindow.setBounds({ x: b.x, y: b.y, width: PANEL_W, height: clamped }, false);
  }
});

// 위치 변경 시마다 크기를 현재 규격으로 강제 재설정 (Electron 창 크기 왜곡 방지)
function reaffirmWidgetState() {
  if (!widgetWindow || widgetWindow.isDestroyed()) return;
  try {
    widgetWindow.setOpacity(storage.getWidgetOpacity());
    widgetWindow.setAlwaysOnTop(true, 'normal');
  } catch {}
}

ipcMain.handle('widget:move', (_event, dx, dy) => {
  if (!widgetWindow || widgetWindow.isDestroyed()) return;
  const [x, y] = widgetWindow.getPosition();
  widgetWindow.setBounds({
    x: Math.round(x + dx),
    y: Math.round(y + dy),
    width: widgetW(),
    height: WIDGET_H
  }, false);
  reaffirmWidgetState();
});

ipcMain.handle('widget:drag-start', () => {
  if (!widgetWindow || widgetWindow.isDestroyed()) return null;
  const [x, y] = widgetWindow.getPosition();
  return { x, y };
});

ipcMain.handle('widget:set-position', (_event, x, y) => {
  if (!widgetWindow || widgetWindow.isDestroyed()) return;
  widgetWindow.setBounds({
    x: Math.round(x),
    y: Math.round(y),
    width: widgetW(),
    height: WIDGET_H
  }, false);
  reaffirmWidgetState();
});
