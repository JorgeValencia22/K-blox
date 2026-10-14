// Genera las portadas de los mapas oficiales (client/public/covers/<id>.jpg).
// Requiere el servidor de desarrollo de Vite en marcha (npm run dev:client) y Chrome o Edge.
// Uso: node scripts/covers.js [id ...]
import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { EXPERIENCES } from '../shared/catalog.js';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const outDir = path.join(root, 'client', 'public', 'covers');
fs.mkdirSync(outDir, { recursive: true });
const browsers = [
  'C:/Program Files/Google/Chrome/Application/chrome.exe',
  'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe',
  '/usr/bin/google-chrome', '/usr/bin/chromium',
];
const browser = browsers.find((b) => fs.existsSync(b));
if (!browser) throw new Error('No se encontró Chrome ni Edge');
const base = process.env.COVER_URL || 'http://localhost:5173/cover.html';
const ids = process.argv.slice(2).length ? process.argv.slice(2) : EXPERIENCES.map((e) => e.id);

for (const id of ids) {
  const t0 = Date.now();
  const html = execFileSync(browser, [
    '--headless=new', '--disable-gpu-sandbox', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist',
    '--window-size=960,540', '--virtual-time-budget=60000', '--run-all-compositor-stages-before-draw', '--dump-dom', `${base}?w=${id}`,
  ], { encoding: 'utf8', maxBuffer: 64 * 1024 * 1024, timeout: 180_000 });
  const m = html.match(/data:image\/jpeg;base64,([A-Za-z0-9+/=]+)/);
  if (!m) {
    console.log(`✖ ${id}: ${html.match(/ERROR[^<]*/)?.[0] || 'sin imagen'}`);
    continue;
  }
  const buf = Buffer.from(m[1], 'base64');
  fs.writeFileSync(path.join(outDir, `${id}.jpg`), buf);
  console.log(`✔ ${id}.jpg (${Math.round(buf.length / 1024)} KB, ${((Date.now() - t0) / 1000).toFixed(1)} s)`);
}
