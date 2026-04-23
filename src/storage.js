const { app, safeStorage } = require('electron');
const fs = require('fs');
const path = require('path');

const STATE_FILE = () => path.join(app.getPath('userData'), 'state.json');
const CREDS_FILE = () => path.join(app.getPath('userData'), 'creds.enc');

function readJSON(file) {
  try {
    if (!fs.existsSync(file)) return null;
    return JSON.parse(fs.readFileSync(file, 'utf8'));
  } catch {
    return null;
  }
}

function writeJSON(file, data) {
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(file, JSON.stringify(data, null, 2));
}

function getWindowPosition() {
  return readJSON(STATE_FILE())?.windowPosition ?? null;
}

function setWindowPosition(pos) {
  const state = readJSON(STATE_FILE()) ?? {};
  state.windowPosition = pos;
  writeJSON(STATE_FILE(), state);
}

function getRefreshIntervalSec() {
  const v = readJSON(STATE_FILE())?.refreshIntervalSec;
  if (typeof v === 'number' && v >= 10 && v <= 3600) return v;
  return 300;
}

function setRefreshIntervalSec(sec) {
  const state = readJSON(STATE_FILE()) ?? {};
  state.refreshIntervalSec = sec;
  writeJSON(STATE_FILE(), state);
}

function getAutoLaunch() {
  const v = readJSON(STATE_FILE())?.autoLaunch;
  return typeof v === 'boolean' ? v : true;
}

function setAutoLaunch(enabled) {
  const state = readJSON(STATE_FILE()) ?? {};
  state.autoLaunch = Boolean(enabled);
  writeJSON(STATE_FILE(), state);
}

function getWidgetVisible() {
  const v = readJSON(STATE_FILE())?.widgetVisible;
  return typeof v === 'boolean' ? v : true;
}

function setWidgetVisible(visible) {
  const state = readJSON(STATE_FILE()) ?? {};
  state.widgetVisible = Boolean(visible);
  writeJSON(STATE_FILE(), state);
}

function getWidgetOpacity() {
  const v = readJSON(STATE_FILE())?.widgetOpacity;
  if (typeof v === 'number' && v >= 0.3 && v <= 1.0) return v;
  return 1.0;
}

function setWidgetOpacity(opacity) {
  const n = Math.max(0.3, Math.min(1.0, Number(opacity)));
  const state = readJSON(STATE_FILE()) ?? {};
  state.widgetOpacity = n;
  writeJSON(STATE_FILE(), state);
  return n;
}

function getLanguage() {
  const v = readJSON(STATE_FILE())?.language;
  return v === 'en' || v === 'ko' ? v : 'ko';
}

function setLanguage(lang) {
  const v = lang === 'en' ? 'en' : 'ko';
  const state = readJSON(STATE_FILE()) ?? {};
  state.language = v;
  writeJSON(STATE_FILE(), state);
  return v;
}

function getTelegramBotToken() {
  return readJSON(STATE_FILE())?.telegramBotToken ?? '';
}

function setTelegramBotToken(token) {
  const state = readJSON(STATE_FILE()) ?? {};
  state.telegramBotToken = String(token ?? '').trim();
  writeJSON(STATE_FILE(), state);
}

function getTelegramChatId() {
  return readJSON(STATE_FILE())?.telegramChatId ?? '';
}

function setTelegramChatId(chatId) {
  const state = readJSON(STATE_FILE()) ?? {};
  state.telegramChatId = String(chatId ?? '').trim();
  writeJSON(STATE_FILE(), state);
}

function getLastSessionResetAt() {
  const v = readJSON(STATE_FILE())?.lastSessionResetAt;
  return typeof v === 'string' && v ? v : null;
}

function setLastSessionResetAt(iso) {
  const state = readJSON(STATE_FILE()) ?? {};
  state.lastSessionResetAt = iso ? String(iso) : null;
  writeJSON(STATE_FILE(), state);
}

function getCredentials() {
  try {
    const file = CREDS_FILE();
    if (!fs.existsSync(file)) return null;
    if (!safeStorage.isEncryptionAvailable()) return null;
    const buf = fs.readFileSync(file);
    const json = safeStorage.decryptString(buf);
    return JSON.parse(json);
  } catch {
    return null;
  }
}

function setCredentials(creds) {
  if (!safeStorage.isEncryptionAvailable()) {
    throw new Error('OS 자격증명 저장소 사용 불가');
  }
  const file = CREDS_FILE();
  fs.mkdirSync(path.dirname(file), { recursive: true });
  const encrypted = safeStorage.encryptString(JSON.stringify(creds));
  fs.writeFileSync(file, encrypted);
}

module.exports = {
  getWindowPosition,
  setWindowPosition,
  getCredentials,
  setCredentials,
  getRefreshIntervalSec,
  setRefreshIntervalSec,
  getAutoLaunch,
  setAutoLaunch,
  getWidgetVisible,
  setWidgetVisible,
  getWidgetOpacity,
  setWidgetOpacity,
  getLanguage,
  setLanguage,
  getTelegramBotToken,
  setTelegramBotToken,
  getTelegramChatId,
  setTelegramChatId,
  getLastSessionResetAt,
  setLastSessionResetAt
};
