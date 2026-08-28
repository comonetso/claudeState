// 작업표시줄 z-order 근본 대응 (이벤트 훅 방식).
//
// 배경: Windows에서는 alwaysOnTop 레벨이 무의미하고(모두 동일 HWND_TOPMOST 밴드),
// 작업표시줄(Shell_TrayWnd)을 클릭하면 그것이 밴드 최상단으로 올라오며 위젯이 뒤로 밀린다.
// 이때 위젯에는 어떤 Electron 이벤트도 오지 않는다.
//
// 폴링(주기적 moveTop)은 아무 일 없어도 화면을 계속 건드려 깜빡임을 유발한다.
// 대신 SetWinEventHook(EVENT_SYSTEM_FOREGROUND)으로 "다른 창이 포그라운드가 되는
// 그 순간"만 감지해 위젯을 1회 복원한다 → 평소엔 완전히 조용, 깜빡임/지연/유휴부하 0.
//
// WINEVENT_SKIPOWNPROCESS 로 우리 프로세스(위젯/설정창) 자신의 포그라운드 전환은
// 걸러지므로, moveTop() 재호출이 다시 콜백을 부르는 재귀 루프도 원천 차단된다.

// ---------------------------------------------------------------------------
// 전체화면 복귀 대응 (v0.4.1)
//
// 위 훅만으로는 부족한 경로가 있다. 브라우저 F11 이나 동영상 플레이어 내부 전체화면은
// **같은 HWND 가 계속 포그라운드**이므로 EVENT_SYSTEM_FOREGROUND 가 발생하지 않는다.
// 그런데 전체화면 전환 과정에서 작업표시줄이 위젯보다 위로 재배치되므로, 복귀 후
// 위젯이 작업표시줄 뒤에 깔린 채 **복원 계기가 영영 없는** 상태가 된다.
//
// alwaysOnTop 은 "모든 topmost 창보다 위"가 아니라 밴드 소속일 뿐이고, 밴드 안에서도
// 상대 순서가 따로 있다. 그래서 topmost 인 채로 작업표시줄에 가릴 수 있다 —
// v0.3.3 에서 레벨 상향이 무의미했던 것도 같은 이유다.
//
// 아래 조회 함수들은 main.js 의 조건부 감시가 "지금 실제로 가려져 있는가"를 묻기 위한 것이다.
// 조회만 하므로 정상 상태에서는 z-order 를 건드리지 않는다.
// ---------------------------------------------------------------------------

const koffi = require('koffi');

const EVENT_SYSTEM_FOREGROUND = 0x0003;
const WINEVENT_OUTOFCONTEXT = 0x0000;
const WINEVENT_SKIPOWNPROCESS = 0x0002;
const OBJID_WINDOW = 0;

const GW_HWNDPREV = 3;
// (HWND)-1 — x64 에서 핸들은 8바이트라 전부 1인 값이 된다.
const HWND_TOPMOST = 0xFFFFFFFFFFFFFFFFn;
const SWP_NOSIZE = 0x0001;
const SWP_NOMOVE = 0x0002;
const SWP_NOACTIVATE = 0x0010;
const SWP_NOOWNERZORDER = 0x0200;

const MONITOR_DEFAULTTONULL = 0x0000;
const GWL_STYLE = -16;
const GWL_EXSTYLE = -20;
const DWMWA_CLOAKED = 14;

let user32 = null;
let shell32 = null;
let dwmapi = null;
let SetWinEventHook = null;
let UnhookWinEvent = null;
let FindWindowExW = null;
let GetWindow = null;
let GetWindowRect = null;
let IsWindowVisible = null;
let SetWindowPos = null;
let SHQueryUserNotificationState = null;
let GetForegroundWindow = null;
let IsWindow = null;
let IsIconic = null;
let GetWindowThreadProcessId = null;
let DwmGetWindowAttribute = null;
let GetClassNameW = null;
let MonitorFromRect = null;
let GetMonitorInfoW = null;
let GetWindowLongW = null;
let hook = null;
let registeredCb = null;
let started = false;
let nativeReady = false;
let WinEventProc = null;

// start() 와 조회 함수가 모두 부르므로 두 번 실행돼도 안전해야 한다
// (koffi.struct/proto 를 두 번 정의하면 예외가 난다).
function loadNative() {
  if (nativeReady) return;

  user32 = koffi.load('user32.dll');
  shell32 = koffi.load('shell32.dll');
  dwmapi = koffi.load('dwmapi.dll');

  koffi.struct('RECT', { left: 'int32', top: 'int32', right: 'int32', bottom: 'int32' });
  koffi.struct('MONITORINFO', {
    cbSize: 'uint32',
    rcMonitor: 'RECT',
    rcWork: 'RECT',
    dwFlags: 'uint32'
  });

  // WINEVENTPROC 콜백 시그니처
  WinEventProc = koffi.proto(
    'void WinEventProc(void* hook, uint32 event, void* hwnd, int32 idObject, int32 idChild, uint32 idEventThread, uint32 dwmsEventTime)'
  );

  SetWinEventHook = user32.func(
    'void* SetWinEventHook(uint32 eventMin, uint32 eventMax, void* hmod, void* proc, uint32 idProcess, uint32 idThread, uint32 dwFlags)'
  );
  UnhookWinEvent = user32.func('bool UnhookWinEvent(void* hook)');

  // HWND 는 x64 에서 8바이트 핸들이다. 정수로 주고받으면 포인터 변환이 필요 없고,
  // Electron 의 getNativeWindowHandle() 이 주는 Buffer 와도 값으로 대조된다.
  FindWindowExW = user32.func('uint64 FindWindowExW(uint64 parent, uint64 after, str16 cls, str16 title)');
  GetWindow = user32.func('uint64 GetWindow(uint64 hwnd, uint32 cmd)');
  GetWindowRect = user32.func('bool GetWindowRect(uint64 hwnd, _Out_ RECT* rect)');
  IsWindowVisible = user32.func('bool IsWindowVisible(uint64 hwnd)');
  SetWindowPos = user32.func('bool SetWindowPos(uint64 hwnd, uint64 insertAfter, int32 x, int32 y, int32 cx, int32 cy, uint32 flags)');
  SHQueryUserNotificationState = shell32.func('int32 SHQueryUserNotificationState(_Out_ int32* state)');
  GetForegroundWindow = user32.func('uint64 GetForegroundWindow()');
  IsWindow = user32.func('bool IsWindow(uint64 hwnd)');
  IsIconic = user32.func('bool IsIconic(uint64 hwnd)');
  GetWindowThreadProcessId = user32.func('uint32 GetWindowThreadProcessId(uint64 hwnd, _Out_ uint32* pid)');
  DwmGetWindowAttribute = dwmapi.func('int32 DwmGetWindowAttribute(uint64 hwnd, uint32 attr, _Out_ uint32* value, uint32 size)');
  GetClassNameW = user32.func('int32 GetClassNameW(uint64 hwnd, _Out_ uint16* className, int32 maxCount)');
  MonitorFromRect = user32.func('uint64 MonitorFromRect(const RECT* lprc, uint32 dwFlags)');
  GetMonitorInfoW = user32.func('bool GetMonitorInfoW(uint64 hMonitor, _Inout_ MONITORINFO* lpmi)');
  GetWindowLongW = user32.func('int32 GetWindowLongW(uint64 hwnd, int32 nIndex)');

  nativeReady = true;
}

function hwndFromBuffer(buf) {
  if (!Buffer.isBuffer(buf)) return 0n;
  if (buf.length === 8) return buf.readBigUInt64LE(0);
  if (buf.length === 4) return BigInt(buf.readUInt32LE(0));
  return 0n;
}

function rectOf(hwnd) {
  const out = [null];
  return GetWindowRect(hwnd, out) ? out[0] : null;
}

function processIdOf(hwnd) {
  const out = [0];
  return GetWindowThreadProcessId(hwnd, out) ? out[0] : 0;
}

// IsWindowVisible 은 WS_VISIBLE 스타일만 보고 실제 픽셀 가시성은 보지 않는다 — Windows 11
// 위젯 패널·알림 센터 같은 슬라이드 패널은 화면 밖으로 안 빠져 있어도 DWM 이 안 그리는
// "cloaked" 상태로 존재할 수 있다(2026-08-28 실측: 항상 같은 좌표의 Windows.UI.Core.CoreWindow
// 가 매번 obstruction 후보로 잡혔다). cloaked 면 실제로는 안 보이는 것이니 후보에서 뺀다.
function isCloaked(hwnd) {
  const out = [0];
  const hr = DwmGetWindowAttribute(hwnd, DWMWA_CLOAKED, out, 4);
  return hr === 0 && out[0] !== 0;
}

function intersects(a, b) {
  return a.left < b.right && a.right > b.left && a.top < b.bottom && a.bottom > b.top;
}

/**
 * 지금 이 사용자에게 알림을 띄워도 되는 상태인가.
 * 1~4 는 잠금·전체화면·프레젠테이션 계열이라, 그 동안 위젯을 끌어올리면
 * 영상 위에 위젯이 떠 버린다. 반환 null 은 조회 실패.
 */
function queryNotificationState() {
  loadNative();
  const out = [0];
  return SHQueryUserNotificationState(out) === 0 ? out[0] : null;
}

/**
 * 위젯과 겹치는 작업표시줄이 z-order 상 위젯보다 **위에** 있는가.
 * 이것이 "지금 실제로 가려져 있다"의 정의다. 겹치지 않는 작업표시줄은 비교하지 않는다
 * (다중 모니터에서 반대편 화면의 작업표시줄이 위에 있어도 가려질 픽셀이 없다).
 */
function isOverlappedByTaskbarAbove(handleBuf) {
  loadNative();
  const widget = hwndFromBuffer(handleBuf);
  if (!widget) return false;
  const wr = rectOf(widget);
  if (!wr) return false;

  const targets = new Set();
  for (const cls of ['Shell_TrayWnd', 'Shell_SecondaryTrayWnd']) {
    let after = 0n;
    // 보조 모니터가 여럿일 수 있어 순회하되, 무한 루프는 막는다.
    for (let i = 0; i < 32; i++) {
      const h = FindWindowExW(0n, after, cls, null);
      if (!h) break;
      after = h;
      if (!IsWindowVisible(h)) continue;
      const r = rectOf(h);
      if (r && intersects(wr, r)) targets.add(String(h));
    }
  }
  if (!targets.size) return false;

  // 위젯보다 위에 있는 창만 거슬러 올라간다. 파괴된 핸들·순환에 대비해 상한과 seen 을 둔다.
  let cursor = widget;
  const seen = new Set([String(widget)]);
  for (let i = 0; i < 4096; i++) {
    cursor = GetWindow(cursor, GW_HWNDPREV);
    if (!cursor) return false;
    const key = String(cursor);
    if (targets.has(key)) return true;
    if (seen.has(key)) return false;
    seen.add(key);
  }
  return false;
}

/**
 * 지금 활성 창(포그라운드 창)의 화면 좌표 사각형.
 * 호출부가 모니터 전체 크기와 비교해 "화면을 통째로 덮는 전체화면 창인가"를 판정한다.
 * SHQueryUserNotificationState 는 D3D 배타 전체화면만 잡고, 브라우저의 웹 전체화면
 * (유튜브·넷플릭스 등 Fullscreen API)이나 일부 플레이어의 창 전체화면은 못 잡기 때문에 필요하다.
 *
 * z-order 최상단부터 순회하는 방식은 2026-08-28에 시도했다가 회귀로 되돌렸다 — 위젯 바로
 * 다음으로 만나는 창이 트레이 팝업 등 화면을 안 덮는 작은 topmost 시스템 창인 경우가 잦아,
 * 그 창에서 판정이 멈춰버려 그 아래 실제 전체화면 창까지 순회가 도달하지 못했다(전체화면 진입
 * 자체를 못 잡는 회귀). "포커스가 다른 창으로 가도 직전 전체화면 창이 안 가려져 있으면 유지"는
 * 아래 isStillCoveringUnobstructed()로 그 특정 창 하나만 좁게 재확인하는 방식으로 처리한다.
 */
function classNameOf(hwnd) {
  const buf = Buffer.alloc(512);
  const len = GetClassNameW(hwnd, buf, 256);
  return len > 0 ? buf.toString('utf16le', 0, len * 2) : '';
}

// rect 가 속한 모니터의 전체 화면 영역(작업표시줄 포함, native 좌표계).
// MonitorFromRect/GetMonitorInfoW 는 GetWindowRect 와 같은 Win32 좌표계를 쓰므로,
// Electron 의 screen.getDisplayMatching()(DIP 좌표)과 섞이지 않는다 — 고배율 DPI 대응.
function monitorRectFor(rect) {
  const hMon = MonitorFromRect(rect, MONITOR_DEFAULTTONULL);
  if (!hMon) return null;
  const mi = { cbSize: koffi.sizeof('MONITORINFO'), rcMonitor: rect, rcWork: rect, dwFlags: 0 };
  const out = [mi];
  return GetMonitorInfoW(hMon, out) ? out[0].rcMonitor : null;
}

/**
 * 지금 활성 창이 자기 모니터 화면을 통째로 덮는 "진짜 전체화면" 인가.
 * - 좌표는 전부 native(Win32) 좌표계에서만 비교한다.
 * - 프레임(캡션·크기조절 테두리)이 있는 창은 최대화라도 제외한다 — 최대화는 보통
 *   작업표시줄 영역을 남기지만, DPI 가상 경계 때문에 드물게 rect 가 모니터 전체와
 *   같아지는 경우가 있어 스타일로 이중 확인한다.
 */
function evaluateWindowCoverage(hwnd) {
  const rect = rectOf(hwnd);
  if (!rect) return { covers: false, reason: 'no-rect' };

  let className = '';
  try { className = classNameOf(hwnd); } catch {}
  if (FULLSCREEN_EXCLUDE_CLASSES.has(className)) {
    return { covers: false, className, rect, reason: 'excluded-class' };
  }

  const monitorRect = monitorRectFor(rect);
  if (!monitorRect) return { covers: false, className, rect, reason: 'no-monitor' };

  const style = GetWindowLongW(hwnd, GWL_STYLE);
  const exStyle = GetWindowLongW(hwnd, GWL_EXSTYLE);
  // 스타일(캡션·크기조절 테두리) 기반 필터는 뺐다 — 실측(2026-08-27) 결과 Chrome/Edge 는
  // F11·웹 Fullscreen API 전체화면에서도 WS_DLGFRAME|WS_THICKFRAME 비트를 그대로 유지한 채
  // 크기만 화면 전체로 키운다. 이 필터가 있으면 브라우저 전체화면을 영원히 못 잡는다.
  // 크기 비교만으로 최대화(작업표시줄 영역을 남김)와 전체화면(작업표시줄까지 덮음)이 이미
  // 구별되므로, 여기서는 style/exStyle 을 진단 로그용으로만 남긴다.
  const TOLERANCE = 2;
  const covers = rect.left <= monitorRect.left + TOLERANCE
    && rect.top <= monitorRect.top + TOLERANCE
    && rect.right >= monitorRect.right - TOLERANCE
    && rect.bottom >= monitorRect.bottom - TOLERANCE;

  return {
    covers, className, rect, monitorRect, style, exStyle,
    reason: covers ? 'native-cover' : 'not-cover'
  };
}

function getForegroundFullscreenInfo() {
  loadNative();
  const hwnd = GetForegroundWindow();
  if (!hwnd) return { covers: false, reason: 'no-foreground' };
  return { ...evaluateWindowCoverage(hwnd), hwnd };
}

/**
 * 특정 창(직전에 전체화면으로 판정됐던 창)이 지금도 여전히 존재·표시 중이고, 여전히
 * 모니터를 덮으며, 위젯을 제외한 다른 "보이는" 창이 그 창 위(z-order)에서 겹쳐 있지
 * 않은지를 좁게 확인한다. 포커스가 다른 창으로 넘어간 순간에도 "실제로는 안 가려짐"을
 * 구분하기 위한 용도 — 대상 창 하나의 z-order 위쪽만 훑으므로 시스템 전역 순회보다 안전하다.
 */
function isStillCoveringUnobstructed(hwnd, widgetHandleBuf) {
  loadNative();
  if (!hwnd || !IsWindow(hwnd) || !IsWindowVisible(hwnd) || IsIconic(hwnd)) {
    return { covers: false, reason: 'window-gone' };
  }

  const info = evaluateWindowCoverage(hwnd);
  if (!info.covers) return info;

  const widget = hwndFromBuffer(widgetHandleBuf);
  const targetPid = processIdOf(hwnd);
  let cursor = hwnd;
  const seen = new Set([String(hwnd)]);
  for (let i = 0; i < 4096; i++) {
    cursor = GetWindow(cursor, GW_HWNDPREV);
    if (!cursor) break;
    const key = String(cursor);
    if (seen.has(key)) break;
    seen.add(key);
    if (cursor === widget) continue;
    if (!IsWindowVisible(cursor) || IsIconic(cursor)) continue;
    if (isCloaked(cursor)) continue;
    let obstructedBy = '';
    try { obstructedBy = classNameOf(cursor); } catch {}
    // 작업표시줄은 전체화면 전환 중 z-order 가 흔들려 실제로는 안 가려도 위로 올라올 수 있다
    // (파일 상단 "작업표시줄 z-order 근본 대응" 참조). 이 자체를 "다른 창이 동영상을 가렸다"로
    // 보면 안 되므로 obstruction 판정에서 제외한다.
    if (TASKBAR_CLASSES.has(obstructedBy)) continue;
    // 같은 프로세스(같은 앱)가 자기 자신 위에 띄우는 배너·오버레이는 "다른 창이 가렸다"가
    // 아니다 — 실측(2026-08-28)으로 크롬이 전체화면 중 자기 프로세스의 얇은 창(안내 배너로
    // 추정)을 z-order 바로 위에 잠깐 띄우는 것을 확인했다. 그것 때문에 그 아래 실제로 있는
    // 다른 프로세스 창(예: 사용자가 진짜 전환한 앱)까지 순회가 도달하지 못했다.
    if (targetPid && processIdOf(cursor) === targetPid) continue;
    const r = rectOf(cursor);
    if (r && intersects(info.rect, r)) {
      return { ...info, covers: false, reason: 'obstructed', obstructedBy, obstructedRect: r };
    }
  }
  return info;
}

// 바탕화면(Progman/WorkerW) 자체는 항상 모니터 전체 크기라 오탐의 원인이 된다.
const FULLSCREEN_EXCLUDE_CLASSES = new Set(['Progman', 'WorkerW']);
const TASKBAR_CLASSES = new Set(['Shell_TrayWnd', 'Shell_SecondaryTrayWnd']);

/**
 * moveTop() 으로 복원되지 않을 때의 마지막 수단.
 * topmost 밴드 "소속" 자체를 잃은 경우를 되돌린다. 포커스는 건드리지 않는다.
 */
function forceTopmost(handleBuf) {
  loadNative();
  const h = hwndFromBuffer(handleBuf);
  if (!h) return false;
  return SetWindowPos(h, HWND_TOPMOST, 0, 0, 0, 0,
    SWP_NOMOVE | SWP_NOSIZE | SWP_NOACTIVATE | SWP_NOOWNERZORDER);
}

// koffi.register로 만든 콜백은 GC되면 안 되므로 모듈 스코프에 보관한다.
function start(onForeground) {
  if (started) return true;

  loadNative();

  const cb = (_hook, _event, _hwnd, idObject) => {
    // 창(OBJID_WINDOW) 단위 포그라운드 전환만 처리 (캐럿/메뉴 등 하위 객체 무시)
    if (idObject !== OBJID_WINDOW) return;
    try {
      onForeground();
    } catch {}
  };
  registeredCb = koffi.register(cb, koffi.pointer(WinEventProc));

  hook = SetWinEventHook(
    EVENT_SYSTEM_FOREGROUND,
    EVENT_SYSTEM_FOREGROUND,
    null,
    registeredCb,
    0,
    0,
    WINEVENT_OUTOFCONTEXT | WINEVENT_SKIPOWNPROCESS
  );

  if (!hook) {
    // 등록 실패 → 콜백 정리 후 예외로 알림 (main이 폴백 결정)
    try { koffi.unregister(registeredCb); } catch {}
    registeredCb = null;
    throw new Error('SetWinEventHook 반환값이 NULL');
  }

  started = true;
  return true;
}

function stop() {
  try {
    if (hook && UnhookWinEvent) UnhookWinEvent(hook);
  } catch {}
  try {
    if (registeredCb) koffi.unregister(registeredCb);
  } catch {}
  hook = null;
  registeredCb = null;
  started = false;
}

module.exports = {
  start,
  stop,
  queryNotificationState,
  isOverlappedByTaskbarAbove,
  forceTopmost,
  getForegroundFullscreenInfo,
  isStillCoveringUnobstructed
};
