const { spawn } = require('child_process');
const electron = require('electron');

delete process.env.ELECTRON_RUN_AS_NODE;

const args = ['.', ...process.argv.slice(2)];
const child = spawn(electron, args, {
  stdio: 'inherit',
  env: process.env
});

child.on('exit', (code) => process.exit(code ?? 0));
child.on('error', (err) => {
  console.error('Electron 실행 실패:', err);
  process.exit(1);
});
