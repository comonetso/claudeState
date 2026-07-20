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

const koffi = require('koffi');

const EVENT_SYSTEM_FOREGROUND = 0x0003;
const WINEVENT_OUTOFCONTEXT = 0x0000;
const WINEVENT_SKIPOWNPROCESS = 0x0002;
const OBJID_WINDOW = 0;

let user32 = null;
let SetWinEventHook = null;
let UnhookWinEvent = null;
let hook = null;
let registeredCb = null;
let started = false;

// koffi.register로 만든 콜백은 GC되면 안 되므로 모듈 스코프에 보관한다.
function start(onForeground) {
  if (started) return true;

  user32 = koffi.load('user32.dll');

  // WINEVENTPROC 콜백 시그니처
  const WinEventProc = koffi.proto(
    'void WinEventProc(void* hook, uint32 event, void* hwnd, int32 idObject, int32 idChild, uint32 idEventThread, uint32 dwmsEventTime)'
  );

  SetWinEventHook = user32.func(
    'void* SetWinEventHook(uint32 eventMin, uint32 eventMax, void* hmod, void* proc, uint32 idProcess, uint32 idThread, uint32 dwFlags)'
  );
  UnhookWinEvent = user32.func('bool UnhookWinEvent(void* hook)');

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

module.exports = { start, stop };
