// Genera los iconos de Android, la pantalla de arranque y las imágenes de la ficha de
// Play Store a partir del logo y de las portadas de los mapas. Deja un JSON en #out
// ({ nombre: dataURL PNG }) que guarda scripts/brand.js.
const LOGO = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 64 64"><defs><linearGradient id="g" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="#00d1b2"/><stop offset="1" stop-color="#7c5cff"/></linearGradient></defs><path d="M32 4 58 18v28L32 60 6 46V18z" fill="url(#g)"/><path d="M32 4 58 18 32 32 6 18z" fill="#ffffff" opacity=".35"/><path d="M32 32v28L6 46V18z" fill="#000" opacity=".18"/><path d="M24 22v20M24 32l10-10M27 30l9 12" stroke="#fff" stroke-width="4.5" stroke-linecap="round" fill="none"/></svg>`;

const img = (src) => new Promise((res, rej) => { const i = new Image(); i.onload = () => res(i); i.onerror = rej; i.src = src; });
const canvas = (w, h) => { const c = document.createElement('canvas'); c.width = w; c.height = h; return c; };

function bg(g, w, h) {
  const r = g.createRadialGradient(w * 0.5, h * 0.42, 0, w * 0.5, h * 0.5, Math.max(w, h) * 0.75);
  r.addColorStop(0, '#22324a');
  r.addColorStop(1, '#0b0c0e');
  g.fillStyle = r;
  g.fillRect(0, 0, w, h);
}

async function main() {
  const logo = await img('data:image/svg+xml;charset=utf-8,' + encodeURIComponent(LOGO));
  const out = {};
  // Icono clásico (cuadrado con esquinas redondeadas) y redondo
  const icon = (size, round) => {
    const c = canvas(size, size), g = c.getContext('2d');
    g.save();
    g.beginPath();
    if (round) g.arc(size / 2, size / 2, size / 2, 0, Math.PI * 2);
    else g.roundRect(0, 0, size, size, size * 0.2);
    g.clip();
    bg(g, size, size);
    g.restore();
    const s = size * 0.66;
    g.drawImage(logo, (size - s) / 2, (size - s) / 2, s, s);
    return c.toDataURL('image/png');
  };
  // Primer plano del icono adaptativo (zona segura: 66 % del centro)
  const fg = (size) => {
    const c = canvas(size, size), g = c.getContext('2d');
    const s = size * 0.5;
    g.drawImage(logo, (size - s) / 2, (size - s) / 2, s, s);
    return c.toDataURL('image/png');
  };
  const dens = { mdpi: 1, hdpi: 1.5, xhdpi: 2, xxhdpi: 3, xxxhdpi: 4 };
  for (const [d, k] of Object.entries(dens)) {
    out[`mipmap-${d}/ic_launcher.png`] = icon(48 * k, false);
    out[`mipmap-${d}/ic_launcher_round.png`] = icon(48 * k, true);
    out[`mipmap-${d}/ic_launcher_foreground.png`] = fg(108 * k);
  }
  // Pantallas de arranque (fondo oscuro, logo y nombre)
  const splash = (w, h) => {
    const c = canvas(w, h), g = c.getContext('2d');
    bg(g, w, h);
    const s = Math.min(w, h) * 0.28;
    g.drawImage(logo, (w - s) / 2, h / 2 - s * 0.75, s, s);
    g.fillStyle = '#ffffff';
    g.font = `900 ${Math.round(s * 0.32)}px Montserrat, Arial, sans-serif`;
    g.textAlign = 'center';
    g.fillText('KestWorlds', w / 2, h / 2 + s * 0.55);
    return c.toDataURL('image/png');
  };
  const SPL = { 'drawable/splash.png': [480, 320], 'drawable-land-hdpi/splash.png': [800, 480], 'drawable-land-mdpi/splash.png': [480, 320], 'drawable-land-xhdpi/splash.png': [1280, 720], 'drawable-land-xxhdpi/splash.png': [1600, 960], 'drawable-land-xxxhdpi/splash.png': [1920, 1280], 'drawable-port-hdpi/splash.png': [480, 800], 'drawable-port-mdpi/splash.png': [320, 480], 'drawable-port-xhdpi/splash.png': [720, 1280], 'drawable-port-xxhdpi/splash.png': [960, 1600], 'drawable-port-xxxhdpi/splash.png': [1280, 1920] };
  for (const [k, [w, h]] of Object.entries(SPL)) out[k] = splash(w, h);

  // Ficha de Play Store: icono 512 y gráfico destacado 1024×500 con portadas de los mapas
  out['store/icon-512.png'] = icon(512, false);
  const fgc = canvas(1024, 500), g = fgc.getContext('2d');
  bg(g, 1024, 500);
  const ids = ['fnaf', 'poppy', 'city', 'rocket', 'royale', 'racing'];
  const covers = await Promise.all(ids.map((id) => img(`/covers/${id}.jpg`)));
  covers.forEach((c, i) => {
    const x = 470 + (i % 3) * 186, y = 40 + Math.floor(i / 3) * 214;
    g.save();
    g.beginPath(); g.roundRect(x, y, 176, 200, 14); g.clip();
    g.drawImage(c, c.width / 2 - 180, 0, 360, c.height, x - 50, y, 276, 200);
    g.restore();
  });
  const grad = g.createLinearGradient(0, 0, 640, 0);
  grad.addColorStop(0, 'rgba(11,12,14,1)'); grad.addColorStop(0.75, 'rgba(11,12,14,.85)'); grad.addColorStop(1, 'rgba(11,12,14,0)');
  g.fillStyle = grad; g.fillRect(0, 0, 640, 500);
  g.drawImage(logo, 50, 120, 120, 120);
  g.fillStyle = '#fff'; g.font = '900 64px Montserrat, Arial, sans-serif'; g.textAlign = 'left';
  g.fillText('KestWorlds', 50, 320);
  g.fillStyle = '#c9cbcf'; g.font = '700 26px Montserrat, Arial, sans-serif';
  g.fillText('Juega, crea y comparte mundos 3D', 52, 365);
  g.fillText('con tus amigos', 52, 400);
  out['store/feature-1024x500.png'] = fgc.toDataURL('image/png');
  document.getElementById('out').textContent = JSON.stringify(out);
  document.title = 'listo';
}
main().catch((e) => { document.getElementById('out').textContent = 'ERROR ' + e.message; });
