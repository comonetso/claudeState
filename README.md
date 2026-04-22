# claudeState

A tiny Windows widget that pins your Claude usage (session + weekly) to your screen.

Right-click the widget to open settings or hide it. Sits above your normal windows, stays out of your taskbar.

> Korean README: [README.ko.md](README.ko.md)

---

## Features

- **Two bars, one glance** — 5-hour session + 7-day weekly utilization, with reset times
- **Per-model breakdown** — Sonnet / Opus percentages in the tooltip (when available)
- **Cookie-expired alert** — the widget pulses red when your session cookie is dead
- **Tray + context menu** — show/hide widget, refresh, reset position, view log
- **Auto-launch at Windows startup** — optional
- **Multi-language** — Korean / English, switchable live from settings
- **Adjustable opacity** — 30% – 100% slider
- **Encrypted credentials** — cookie stored via OS credential store (Windows DPAPI via `safeStorage`)
- **Multi-monitor aware** — remembers position across displays, including negative X
- **Auto-update** — checks GitHub Releases on launch and hourly; notifies when an update is ready, applies on next restart
- **Telegram notifications** — get a message the moment your 5-hour session resets, so you can start fresh immediately

---

## Screenshot / Widget layout

```
┌────────────────────────────────────────────────┐
│ S  ▓▓▓▓░░░░░░  19%   PM 4:00 (in 2h 14m)      │
│ W  ▓▓▓░░░░░░░  26%   PM 8:00 (Sat)            │
└────────────────────────────────────────────────┘
```

- `S` = 5-hour session window
- `W` = 7-day weekly total

---

## Install

### Option A — Prebuilt installer (recommended)

Download the latest `claudeState-<version>-x64-exe.exe` from [Releases](https://github.com/comonetso/claudeState/releases), run it, and follow the installer.

The installer is NSIS, per-user, with optional desktop + start-menu shortcuts.

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

- Refresh interval — 10 to 3600 seconds (default 300)
- Language — Korean (default) / English, switches live
- Widget opacity — 30% to 100%
- Launch at Windows startup — default ON

The cookie is encrypted via `safeStorage` (DPAPI on Windows) and stored in `%APPDATA%\claudeState\creds.enc`.

---

## Usage

| Action | How |
|---|---|
| Move widget | Left-click drag |
| Open context menu | Right-click widget |
| Refresh now | Double-click widget, or tray → Refresh now |
| Hide / show | Tray → "Show widget" checkbox, or widget right-click → Hide |
| Reset position | Tray → "Reset position" |
| View log | Tray → "View log" (live-tails the log file) |
| Check for updates | Tray → "Check for updates" |
| Quit | Tray → Quit |

---

## Troubleshooting

### Widget shows "Cookie expired" (pulsing red)
Your session cookie on claude.ai rotated. Log into claude.ai again, grab the new `sessionKey`, paste it into Settings.

### Widget doesn't appear
- Check the tray icon (a small claudeState icon). Right-click → "Show widget".
- Try tray → "Reset position" in case it drifted off-screen.

### Taskbar becomes unresponsive after launch
Fixed in recent builds by dropping `alwaysOnTop` from `screen-saver` to `floating` and disabling the `CalculateNativeWinOcclusion` feature. If it still happens, please open an issue with your Windows build + display setup.

### Second instance
A second launch just pops a toast ("Already running. Check the tray icon.") and focuses the existing widget. There is always exactly one process.

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

No polling, no extra services — it detects the reset during the normal refresh cycle (every 3 minutes by default).

---

## Auto-update

Auto-update uses `electron-updater` reading from GitHub Releases.

- **On launch** (10s after startup) and **every hour** the app fetches `latest.yml` from the latest GitHub Release.
- If a newer version exists, it downloads in the background and shows a Windows toast.
- The new version is installed on next app quit (automatically) or immediately via tray → **"Restart to install v…"**.
- Development runs (`npm start`) skip the update check — only packaged builds call the updater.

### Publishing a new release (maintainer workflow)

1. Bump `version` in [package.json](package.json).
2. Set a GitHub Personal Access Token with `repo` scope:
   ```powershell
   $env:GH_TOKEN = "ghp_yourToken"
   ```
3. Build and publish in one shot:
   ```powershell
   npm run release
   ```
4. `electron-builder` will build the NSIS installer, upload it to a new GitHub Release draft along with `latest.yml` and `*.blockmap`, and the app's updater will pick it up automatically on all users' next launch.

To build a local installer **without publishing**, use `npm run dist` instead.

---

## Architecture (short)

- **Main** (`src/main.js`) — single file that orchestrates widget window, settings window, tray, IPC handlers, log tee, refresh loop.
- **Preload** (`src/preload.js`) — `contextBridge` API exposed as `window.claudeState`.
- **Renderers** — `src/widget/*` and `src/settings/*`. Context isolation on, node integration off.
- **API** (`src/api.js`) — calls `https://claude.ai/api/organizations/{orgId}/usage` and normalizes the response into `{sessionPercent, weeklyPercent, sonnetPercent, opusPercent, …}`.
- **Storage** (`src/storage.js`)
  - Credentials → `safeStorage.encryptString` → `creds.enc`
  - Non-sensitive state (position, interval, opacity, language, auto-launch) → `state.json`
- **i18n** (`src/i18n/`) — JSON dictionaries for `ko` / `en` + a tiny `t(key, ...args)` helper. Changing language broadcasts `i18n:changed` to all renderers for live reapply.

### Refresh cycle

```
timer → refreshUsage() → storage.getCredentials()
  → api.fetchUsage(cookie, orgId)
  → normalizeUsage()
  → broadcast('usage:update', {status, data})
  → widget/settings renderers update
```

401/403 from the Claude API throws an `AUTH_EXPIRED` code, which main.js maps to `status: 'auth_expired'` so the widget can pulse red.

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

---

## Privacy

- All network traffic goes only to `https://claude.ai/api/…`.
- Your session cookie never leaves your machine except as the `Cookie` header on those requests.
- Cookie is encrypted at rest via `safeStorage` (DPAPI on Windows). Falls back to plaintext JSON only if `safeStorage.isEncryptionAvailable()` returns false.

---

## License

MIT — see [LICENSE](LICENSE) if present.

---

## Credits

Built with [Electron](https://www.electronjs.org/) + [electron-builder](https://www.electron.build/).
