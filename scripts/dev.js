// Modo desarrollo: arranca el servidor de juego (con recarga) y Vite a la vez.
import { spawn } from 'node:child_process';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const vite = path.join(root, 'node_modules', 'vite', 'bin', 'vite.js');

const procs = [
  spawn(process.execPath, ['--watch', 'server/index.js'], { cwd: root, stdio: 'inherit' }),
  spawn(process.execPath, [vite], { cwd: root, stdio: 'inherit' }),
];

const stop = () => {
  for (const p of procs) if (!p.killed) p.kill();
  process.exit(0);
};
process.on('SIGINT', stop);
process.on('SIGTERM', stop);
for (const p of procs) p.on('exit', (code) => { if (code) { console.error(`Un proceso terminó con código ${code}`); stop(); } });
