# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Rename note

The project was renamed from `cloudState` → `claudeState` on 2026-04-21 (the app displays **Claude** usage; `cloud` was a typo). The `productName` change moves Electron's `userData` folder to `%APPDATA%\claudeState`, so `creds.enc` and `state.json` must be re-entered via the settings window after upgrading from a pre-rename build. See [SESSION_LOG.md](SESSION_LOG.md) for the full history.

## Commands

```bash
npm start          # Run the app (uses scripts/run.js launcher)
npm run dev        # Run with DevTools attached to the widget
npm run make-icon  # Generate build/icon.png (256×256) from icon.jpg
npm run pack       # Unpacked build → dist/win-unpacked/
npm run dist       # NSIS installer + portable exe → dist/
```

There is no test suite and no linter configured.

To kill a running Electron instance on Windows, use PowerShell — `taskkill /IM` fails under Git Bash because `/IM` is interpreted as a path:
```bash
powershell -Command "Get-Process electron -ErrorAction SilentlyContinue | Stop-Process -Force"
```

## Why `scripts/run.js` exists (do not bypass)

VSCode's integrated terminal sets `ELECTRON_RUN_AS_NODE=1` in its environment. Running `electron .` directly in that terminal makes `app` undefined and the main process throws on startup. `scripts/run.js` deletes that env var before spawning Electron. Always run via `npm start` / `npm run dev` — never invoke Electron directly.

The same pattern is used by `scripts/make-icon.js` → `scripts/make-icon.entry.js`: a Node launcher that deletes the env var and then spawns Electron with an entry script that uses `nativeImage` to produce `build/icon.png` for electron-builder.

## Architecture

### Process layout

- **Main** (`src/main.js`) — single file that orchestrates everything: log tee, widget window, settings window, tray, IPC handlers, and the fetch timer.
- **Preload** (`src/preload.js`) — exposes a `window.claudeState` API via `contextBridge`: `getSettings`, `saveSettings`, `refreshUsage`, `openSettings`, `quit`, `onUsageUpdate`. Both renderer windows share the same preload.
- **Renderers** — two HTML pages under `src/widget/` and `src/settings/`. Context isolation is on, node integration is off.

### Data flow (one refresh cycle)

1. `startFetchLoop()` in `main.js` calls `refreshUsage()` immediately and then on `setInterval` (default 300 s, configurable 10–3600 s via settings).
2. `refreshUsage()` reads creds from `storage.getCredentials()`. If missing, it broadcasts `status: 'unconfigured'` and returns.
3. `api.fetchUsage(cookie, orgId)` in `src/api.js` tries multiple candidate endpoints in order and returns the first that parses as JSON. The primary one that works is `https://claude.ai/api/organizations/{orgId}/usage`.
4. `normalizeUsage()` extracts buckets from the response and flattens them. **Field names in the upstream API are not intuitive:**
   - `five_hour` → session (5-hour rolling window)
   - `seven_day` → weekly overall
   - `seven_day_sonnet` / `seven_day_opus` → per-model
   - The percentage field is `utilization` (not `percent_used`) and the reset field is `resets_at`.
5. `main.js` broadcasts `{status: 'ok', data}` to all windows. The widget renderer updates bars and "reset-at" labels; the settings window updates its status line if open.
6. HTTP 401/403 from `api.js` throws an `Error` with `code: 'AUTH_EXPIRED'`. `main.js` catches this specifically and broadcasts `status: 'auth_expired'`, which triggers a red pulsing theme in the widget (`.widget.auth-expired` in `widget.css`).

### Storage split

`src/storage.js` uses two different mechanisms based on sensitivity:
- **Credentials** (`sessionCookie`, `orgId`) → `safeStorage.encryptString` (DPAPI on Windows) → `%APPDATA%\claudeState\creds.enc`. Falls back to plain JSON if `safeStorage.isEncryptionAvailable()` is false.
- **Non-sensitive state** (`windowPosition`, `refreshIntervalSec`) → plain JSON in `state.json`.

### Widget window position (multi-monitor aware)

`createWidgetWindow()` and the `persistPosition` callback both validate that the position fits inside **some** display's `workArea` using `screen.getAllDisplays()`. This is intentional — users may drag the widget to a secondary monitor with negative X coordinates, and a naive `primaryDisplay.workArea` check would falsely reject valid positions and keep resetting the widget. If the check rejects (saved position no longer fits any current display), `createWidgetWindow` logs a warning and falls back to the bottom-right of the primary display. The tray "위치 초기화" menu forces that default explicitly.

### Widget draggability

`-webkit-app-region: drag` on `.widget` in `widget.css` makes the entire frameless window draggable. Elements that need clicks (e.g., the status badge) must use `-webkit-app-region: no-drag`.

## Logging

Console output is tee'd to `%APPDATA%\claudeState\claudestate.log` (UTF-8) by `installLogTee()` in `main.js`. The log is deliberately terse: successful refreshes produce one summary line (`갱신: 세션 X% / 주간 Y%`), and only errors/warnings emit additional output. Do not add verbose debug logs back in without a reason — previous versions dumped raw JSON on every refresh and the user asked for it removed.

The tray "로그 보기" menu writes a one-shot batch file (`view-log.cmd`) to `userData` and launches it. The batch file uses `chcp 65001` and PowerShell `Get-Content -Wait -Encoding UTF8` to correctly render Korean. Inlining the PowerShell command into `cmd /c` does not work — Windows re-encodes the arguments and the Korean corrupts before reaching PowerShell.

## User conventions (from memory)

- Respond in Korean. Brief before making code changes; ask for explicit confirmation before edits. Read/search tools can be used freely.
- When the user says "무중단" (nonstop), skip per-step confirmations and drive the task to completion.
- The user is an experienced Electron developer — skip framework basics in explanations.
