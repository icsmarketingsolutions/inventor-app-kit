import { spawn } from 'node:child_process';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const appRoot = join(dirname(fileURLToPath(import.meta.url)), '..');
const runtimeRoot = process.env.INVENTOR_OS_HOME || join(appRoot, '.runtime', 'dev');
const server = spawn(process.execPath, [join(appRoot, 'server', 'index.mjs'), '--port', '8322', '--dev'], {
  cwd: appRoot,
  env: { ...process.env, INVENTOR_OS_HOME: runtimeRoot, INVENTOR_OS_DEV: '1' },
  stdio: 'inherit',
  windowsHide: true,
});
const vite = spawn(process.execPath, [join(appRoot, 'node_modules', 'vite', 'bin', 'vite.js'), '--host', '127.0.0.1', '--port', '5173', '--strictPort'], {
  cwd: appRoot,
  env: process.env,
  stdio: 'inherit',
  windowsHide: true,
});

const children = [server, vite];
let closing = false;

function close(code = 0) {
  if (closing) return;
  closing = true;
  for (const child of children) {
    if (!child.killed) child.kill('SIGTERM');
  }
  setTimeout(() => process.exit(code), 1500).unref();
}

for (const signal of ['SIGINT', 'SIGTERM']) {
  process.on(signal, () => close(0));
}
for (const child of children) {
  child.once('error', (error) => {
    console.error(error.message);
    close(1);
  });
  child.once('exit', (code) => {
    if (!closing) close(code ?? 1);
  });
}
