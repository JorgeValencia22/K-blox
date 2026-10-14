// Genera los iconos de Android y las imágenes de Play Store (ver client/src/cover/brand.js).
// Requiere el servidor de Vite (npm run dev:client) y Chrome o Edge.
import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const browser = ['C:/Program Files/Google/Chrome/Application/chrome.exe', 'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe', '/usr/bin/google-chrome'].find((b) => fs.existsSync(b));
const html = execFileSync(browser, ['--headless=new', '--virtual-time-budget=20000', '--dump-dom', process.env.BRAND_URL || 'http://localhost:5173/brand.html'], { encoding: 'utf8', maxBuffer: 128 * 1024 * 1024, timeout: 120_000 });
const json = html.match(/<pre id="out">([^<]*)<\/pre>/)?.[1];
if (!json || json.startsWith('ERROR')) throw new Error(json || 'sin datos');
const files = JSON.parse(json.replace(/&amp;/g, '&').replace(/&quot;/g, '"'));
for (const [name, url] of Object.entries(files)) {
  const dest = name.startsWith('store/') ? path.join(root, 'PlayStore', name.slice(6)) : path.join(root, 'android/app/src/main/res', name);
  fs.mkdirSync(path.dirname(dest), { recursive: true });
  fs.writeFileSync(dest, Buffer.from(url.split(',')[1], 'base64'));
  console.log('✔', path.relative(root, dest));
}
