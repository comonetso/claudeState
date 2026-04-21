const { spawn } = require('child_process');
const path = require('path');
const electron = require('electron');

delete process.env.ELECTRON_RUN_AS_NODE;

const entry = path.join(__dirname, 'make-icon.entry.js');
const child = spawn(electron, [entry], {
  stdio: 'inherit',
  env: process.env
});

child.on('exit', (code) => process.exit(code ?? 0));
child.on('error', (err) => {
  console.error('아이콘 생성 실패:', err);
  process.exit(1);
});
