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
  setRefreshIntervalSec
};
