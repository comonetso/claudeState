# claudeState

A tiny Windows widget that pins your Claude usage (5-hour session + weekly) and your Codex usage next to the taskbar.

Right-click the widget to open settings or hide it. Sits above your normal windows, stays out of your taskbar.

**[⬇ Download for Windows (x64)](https://github.com/comonetso/claudeState/releases/latest/download/claudeState-Setup-x64.exe)** · [Release notes](https://github.com/comonetso/claudeState/releases/latest)

> Korean README: [README.ko.md](README.ko.md)

---

## Features

- **Two rows, one glance** — 5-hour session + 7-day weekly utilization, with time until reset
- **Codex usage** — if the [Codex CLI](https://github.com/openai/codex) is installed, a second column shows Codex 5-hour & weekly usage (no setup needed)
- **Detail panel** — hover the widget for a panel with reset times, bars, and per-model (Sonnet / Opus) numbers
- **Auto-hide in fullscreen** — hides while a fullscreen window (video, game) covers it, comes back when you leave
- **Cookie-expired alert** — the widget pulses red when your session cookie is dead
- **Tray + context menu** — show/hide widget, refresh, reset position, view log
- **Auto-launch at Windows startup** — optional
- **Multi-language** — Korean / English, switchable live from settings
- **Adjustable opacity** — 30% – 100% slider
- **Encrypted credentials** — cookie stored via OS credential store (Windows DPAPI via `safeStorage`)
- **Multi-monitor aware** — remembers position across displays, including negative X
- **Auto-update** — once an update is downloaded, a prompt and a ⬆ mark on the widget tell you; restarting installs it silently
- **Telegram notifications** — get a message the moment your 5-hour session resets, so you can start fresh immediately

---

## Widget layout

Without the Codex CLI (with progress bars):

```
┌────────────────────────────────────────────────┐
│ S  ▓▓▓▓░░░░░░  19%   PM 4:00 (in 2h 14m)      │
│ W  ▓▓▓░░░░░░░  26%   PM 8:00 (Sat)            │
└────────────────────────────────────────────────┘
```

With the Codex CLI (Claude on the left, Codex on the right — time left instead of bars):

```
┌──────────────────────────────────────────────────┐
│ S ✳  3% in 3h 26m     │ ⬡ 12% in 1h 5m         │
│ W ✳ 70% in 1d 23h     │ ⬡ 40% in 6d 23h        │
└──────────────────────────────────────────────────┘
```

- `S` = 5-hour session window, `W` = 7-day weekly total
- Codex plans without a 5-hour limit (e.g. Pro Lite) show **"No 5-hour limit"** in the Codex `S` cell.

---

## Install

### Option A — Prebuilt installer (recommended)

Download **[claudeState-Setup-x64.exe](https://github.com/comonetso/claudeState/releases/latest/download/claudeState-Setup-x64.exe)** and run it. This link always gets the latest version.

The installer is NSIS, lets you choose the install folder, with optional desktop + start-menu shortcuts. Windows x64 only.

### Option B — Run from source

```bash
git clone https://github.com/comonetso/claudeState.git
cd claudeState
npm install
npm start
```

To build an installer locally:

```bash
npm run dist     # NSIS installer → dist/
npm run pack     # Unpacked build → dist/win-unpacked/
```

---

## First-time setup

On launch the widget says **"Setup needed"**. Right-click it → **Settings** and fill in the two fields below.

> ⚠️ Treat your session cookie like a password. Do NOT paste it into chat, screenshots, or anywhere public.

Codex needs no setup. If you are logged in to the Codex CLI (`codex login`), its authentication is used as-is.

### 1. Session Cookie (`sessionKey`)

1. Open [https://claude.ai](https://claude.ai) and log in.
2. Open DevTools — `F12`, or right-click → **Inspect**.
3. Go to the **Application** tab (Chrome / Edge) or **Storage** tab (Firefox).
4. In the left panel open **Cookies** → `https://claude.ai`.
5. Find the row named `sessionKey`.
6. Copy the **Value** — it starts with `sk-ant-sid0…`.

Paste that value into the **Session Cookie** field in the settings window.

**Note**: Session cookies rotate. When the widget starts pulsing red ("Cookie expired"), repeat steps 1–6 and paste the new value.

### 2. Organization ID (UUID)

Pick whichever method is easier for you.

#### Method A — from the account page (easiest)

1. Visit [https://claude.ai/settings/account](https://claude.ai/settings/account).
2. Find the **Organization ID** row and copy the UUID.

#### Method B — from the Network tab

1. With DevTools open on the **Network** tab, visit [https://claude.ai/settings/usage](https://claude.ai/settings/usage).
2. Find a request named `usage` in the list.
3. Click it and look at the **Request URL**.
4. Copy the UUID out of the URL — it's the segment between `/api/organizations/` and `/usage`.

Either method gives you a UUID in the form `xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx` (e.g. `9f3c2a6e-4b7d-4c5f-8f0a-2f5e6c1a9d42`).

Paste it into the **Organization ID** field in the settings window and hit **Save**.

### 3. (Optional) Refresh interval, language, opacity, auto-launch

- Refresh interval — 10 to 3600 seconds (default 300). Claude and Codex are queried on the same cycle, but Codex never more than once a minute.
- Language — Korean (default) / English, switches live
- Widget opacity — 30% to 100%
- Launch at Windows startup — default ON

The cookie is encrypted via `safeStorage` (DPAPI on Windows) and stored in `%APPDATA%\claudeState\creds.enc`.

---

## Usage

| Action | How |
|---|---|
| Move widget | Left-click drag |
| Detail panel | Hover the widget for a moment |
| Open context menu | Right-click widget |
| Refresh now | Double-click widget, or tray → Refresh now |
| Hide / show | Tray → "Show widget" checkbox, or widget right-click → Hide |
| Reset position | Tray → "Reset position" |
| View log | Tray → "View log" (live-tails the log file) |
| Check for updates | Tray → "Check for updates" |
| Install update | Click the green ⬆ on the widget, or tray → "Restart to install v…" |
| Quit | Tray → Quit |

---

## Troubleshooting

### Widget shows "Cookie expired" (pulsing red)
Your session cookie on claude.ai rotated. Log into claude.ai again, grab the new `sessionKey`, paste it into Settings.

### Widget doesn't appear
- Check the tray icon (a small claudeState icon). Right-click → "Show widget".
- Try tray → "Reset position" in case it drifted off-screen.
- It hides automatically while a fullscreen window is up, and returns 1–2 seconds after you leave fullscreen.

### No Codex column
The Codex CLI is not installed or not on your `PATH`. Check that `where codex` prints a path in a terminal. If you just installed it, the column appears on the next refresh.

### Taskbar becomes unresponsive after launch
Fixed in recent builds by dropping `alwaysOnTop` from `screen-saver` to `floating` and disabling the `CalculateNativeWinOcclusion` feature. If it still happens, please open an issue with your Windows build + display setup.

### Second instance
A second launch just pops a toast ("Already running. Check the tray icon.") and shows the existing widget again. There is always exactly one process.

### Running from VSCode integrated terminal
VSCode sets `ELECTRON_RUN_AS_NODE=1`, which breaks `electron .` directly. Always use `npm start` / `npm run dev` — `scripts/run.js` strips that env var before spawning Electron.

---

## Telegram notifications (session reset alert)

The 5-hour session window starts counting from your **first message** after a reset.
Knowing the exact moment it resets lets you jump in right away instead of finding out mid-conversation.

### Setup

**Step 1 — Create a Telegram bot (one time)**

1. Open Telegram and search for **@BotFather**.
2. Send `/newbot`, choose a name and username.
3. BotFather gives you a token like `1234567890:ABCdef...` — copy it.

**Step 2 — Link the bot to your account**

1. Open **Settings** in claudeState → scroll to **Telegram Notifications**.
2. Paste the token into the **Bot Token** field.
3. Go to Telegram, find your new bot, and send it **`/start`** (or any message).
4. Click **"Link my Telegram"** in the settings window — the app calls `getUpdates` to find your Chat ID automatically.
5. Status changes to **"Linked: [your name]"**.
6. Click **"Send test message"** to verify.

> You must send `/start` to the bot **before** clicking "Link my Telegram",
> otherwise the app has no message to read the Chat ID from.

### What you receive

When your 5-hour session resets, claudeState sends:

```
✅ Claude session reset

Your 5-hour window is fully available.
Weekly usage: 33%
```

No polling, no extra services — it detects the reset during the normal refresh cycle (every 5 minutes by default). Only Claude sessions trigger this alert.

---

## Auto-update

Auto-update uses `electron-updater` reading from GitHub Releases.

- **On launch** (10s after startup) and **every hour** the app fetches `latest.yml` from the latest GitHub Release.
- If a newer version exists, it downloads in the background.
- When the download finishes, a **"Restart now / Later"** prompt appears. **Restart now** installs silently (no installer wizard) and relaunches the app.
- **Later** means you won't be asked again for that version. Install it any time by clicking the green **⬆** at the widget's top-right (the detail panel shows a note too), via tray → **"Restart to install v…"**, or simply by quitting the app.
- If the app is installed under `C:\Program Files`, Windows may show one UAC prompt.
- Development runs (`npm start`) skip the update check — only packaged builds call the updater.

### Publishing a new release (maintainer workflow)

1. Bump `version` in [package.json](package.json).
2. Commit and push. `electron-builder` tags `v<version>` on the latest commit of the remote default branch, so releasing before you push leaves the tag pointing at the wrong code.
3. Build and publish in one shot, passing your logged-in GitHub CLI auth to that command only:
   ```powershell
   $env:GH_TOKEN = (gh auth token); npm run release
   ```
   ```bash
   GH_TOKEN="$(gh auth token)" npm run release
   ```
4. `electron-builder` builds the NSIS installer (`claudeState-Setup-x64.exe`) and uploads it with `latest.yml` and `*.blockmap` to a GitHub Release that is **published immediately** (not a draft). Users' apps pick it up on their next launch or hourly check.

To build a local installer **without publishing**, use `npm run dist` instead.

Because the installer file name has no version in it, the download link above never needs to change.

---

## Architecture (short)

- **Main** (`src/main.js`) — orchestrates the widget, detail panel and settings windows, tray, IPC handlers, log tee, refresh loop.
- **Preload** (`src/preload.js`) — `contextBridge` API exposed as `window.claudeState`.
- **Renderers** — `src/widget/*`, `src/panel/*` and `src/settings/*`. Context isolation on, node integration off.
- **Claude API** (`src/api.js`) — calls `https://claude.ai/api/organizations/{orgId}/usage` and normalizes the response into `{sessionPercent, weeklyPercent, sonnetPercent, opusPercent, …}`.
- **Codex** (`src/codex.js`) — starts the installed Codex CLI in `app-server` mode and asks for limits over JSON-RPC (`account/rateLimits/read`). A child process, not a network call.
- **Taskbar / fullscreen** (`src/taskbarGuard.js`) — Win32 event hooks that bring the widget back when the taskbar covers it, and detect fullscreen windows to hide it.
- **Updater** (`src/updater.js`) — `electron-updater` wrapper with the install prompt and state broadcast.
- **Telegram** (`src/telegram.js`) — bot linking and message sending.
- **Storage** (`src/storage.js`)
  - Credentials → `safeStorage.encryptString` → `creds.enc`
  - Non-sensitive state (position, interval, opacity, language, auto-launch) → `state.json`
- **i18n** (`src/i18n/`) — JSON dictionaries for `ko` / `en` + a tiny `t(key, ...args)` helper. Changing language broadcasts `i18n:changed` to all renderers for live reapply.

### Refresh cycle

```
timer → refreshUsage()
  ├─ storage.getCredentials() → api.fetchUsage(cookie, orgId) → normalizeUsage()
  └─ codex.fetchRateLimits()   (when the Codex CLI is detected)
  → broadcast('usage:update', {status, data, codex})
  → widget/panel/settings renderers update
```

401/403 from the Claude API throws an `AUTH_EXPIRED` code, which main.js maps to `status: 'auth_expired'` so the widget can pulse red. A failed Codex query never affects the Claude display.

---

## Notes on the Claude API shape

The upstream field names are not intuitive. This app normalizes them:

| Upstream | Meaning | Normalized |
|---|---|---|
| `five_hour` | 5-hour rolling session | `sessionPercent`, `sessionResetAt` |
| `seven_day` | 7-day weekly total | `weeklyPercent`, `weeklyResetAt` |
| `seven_day_sonnet` | Sonnet 7-day | `sonnetPercent`, `sonnetResetAt` |
| `seven_day_opus` | Opus 7-day (may be null) | `opusPercent`, `opusResetAt` |
| `utilization` | percentage (not `percent_used`) | — |
| `resets_at` | ISO timestamp (not `reset_at`) | — |

If Claude changes the response shape, `normalizeUsage()` in [src/api.js](src/api.js) is the one function to update.

## Notes on the Codex response shape

`account/rateLimits/read` returns limits in two slots, `primary` and `secondary`, but **which slot holds which window depends on the plan.**

| Plan | `primary` | `secondary` |
|---|---|---|
| Plus | 300 min (5-hour window) | 10080 min (weekly window) |
| Pro Lite | 10080 min (weekly window) | none |

So windows are picked by length (`windowDurationMins`), not by slot — 300 min = 5-hour, 10080 min = weekly. Without a 300-minute window, only weekly is shown. `usedPercent` is the consumed share and `resetsAt` is epoch **seconds**. The function to update is `normalize()` in [src/codex.js](src/codex.js).

---

## Privacy

The app itself talks only to:

- `https://claude.ai/api/…` — Claude usage. Your session cookie never leaves your machine except as the `Cookie` header on those requests.
- `https://api.telegram.org` — only if you turn on Telegram notifications.
- GitHub Releases — update checks and downloads.

Codex usage is not requested by the app directly; it asks the installed Codex CLI. The CLI handles Codex authentication with its own file (`~/.codex/auth.json`); the app never reads or stores Codex credentials.

Cookie is encrypted at rest via `safeStorage` (DPAPI on Windows). Falls back to plaintext JSON only if `safeStorage.isEncryptionAvailable()` returns false.

---

## License

MIT — see [LICENSE](LICENSE).

---

## Credits

Built with [Electron](https://www.electronjs.org/) + [electron-builder](https://www.electron.build/).
