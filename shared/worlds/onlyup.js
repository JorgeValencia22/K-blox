// Kest Only Up: escalada vertical sin puntos de control. Si caes, vuelves a empezar
// desde donde aterrices. Cada pieza se coloca a una distancia y altura alcanzables
// (salto corriendo: ~8 m de distancia con hasta 1,6 m de subida).
import { WorldGen } from './builder.js';
import { mulberry32 } from '../terrain.js';

// Zonas por altura: paleta y tipos de pieza
const ZONES = [
  { until: 60, name: 'Barrio', colors: ['#90a4ae', '#a1887f', '#ef9a9a', '#b0bec5', '#ffcc80'], mats: ['brick', 'stone', 'wood'] },
  { until: 130, name: 'Obra', colors: ['#fdd835', '#ffb300', '#8d6e63', '#607d8b'], mats: ['metal', 'wood'] },
  { until: 200, name: 'Nubes', colors: ['#ffffff', '#e3f2fd', '#f8bbd0', '#e1f5fe'], mats: ['plastic', 'ice'] },
  { until: 9999, name: 'Espacio', colors: ['#7c4dff', '#00e5ff', '#e040fb', '#76ff03'], mats: ['neon', 'metal'] },
];
const zoneFor = (y) => ZONES.find((z) => y < z.until);

export function buildOnlyUp() {
  const g = new WorldGen('u');
  const rnd = mulberry32(2026);
  const r = (a, b) => a + rnd() * (b - a);

  // Suelo de salida
  g.block([0, -0.5, 0], [40, 1, 40], '#78909c', 'stone');
  g.add('sign', [0, 2.5, 8], [10, 2.4, 0.3], '#212121', 'metal', { text: 'SOLO HACIA ARRIBA ↑' });
  // Edificios decorativos alrededor (ambientación de barrio)
  for (let i = 0; i < 16; i++) {
    const a = (i / 16) * Math.PI * 2;
    const h = r(12, 45);
    g.block([Math.cos(a) * r(45, 70), h / 2, Math.sin(a) * r(45, 70)], [r(8, 14), h, r(8, 14)], ['#546e7a', '#6d4c41', '#455a64', '#5d4037'][i % 4], 'brick', { nc: true });
  }

  let x = 0, y = 0, z = -14, dir = Math.PI; // dirección horizontal de avance
  let prevHalf = 3;
  // La primera pieza: escalones para empezar
  g.add('stairs', [0, 1.5, -14], [4, 3, 6], '#8d6e63', 'wood').ry = 180;
  y = 3;
  z = -17;
  prevHalf = 0;

  // Huellas de las piezas ya colocadas: una pieza nueva no puede quedar justo encima
  // (o debajo) de otra anterior, porque haría de techo y volvería imposible un salto.
  const placed = [];
  const footprint = (cx, cz, sx, sz, ryRad, bottom, top) => ({ cx, cz, hx: sx / 2, hz: sz / 2, ry: ryRad, bottom, top });
  const overlaps = (a, b) => {
    if (a.bottom > b.top + 2.6 || b.bottom > a.top + 2.6) return false;
    for (let i = -2; i <= 2; i++) for (let j = -2; j <= 2; j++) {
      const lx = (i / 2) * a.hx, lz = (j / 2) * a.hz;
      const wx = a.cx + lx * Math.cos(a.ry) + lz * Math.sin(a.ry), wz = a.cz - lx * Math.sin(a.ry) + lz * Math.cos(a.ry);
      const dx = wx - b.cx, dz = wz - b.cz;
      const bx = dx * Math.cos(b.ry) - dz * Math.sin(b.ry), bz = dx * Math.sin(b.ry) + dz * Math.cos(b.ry);
      if (Math.abs(bx) < b.hx + 1 && Math.abs(bz) < b.hz + 1) return true;
    }
    return false;
  };
  const isFree = (fp, skip = 2) => placed.slice(0, Math.max(0, placed.length - skip)).every((p) => !overlaps(fp, p) && !overlaps(p, fp));
  /** Elige una dirección (cerca de la deseada) en la que la pieza no choque con las anteriores. */
  const chooseDir = (base, make) => {
    for (const k of [0, 1, -1, 2, -2, 3, -3, 4, -4, 5, -5]) {
      const d = base + k * 0.6;
      const fp = make(d);
      if (isFree(fp)) return { d, fp };
    }
    return { d: base, fp: make(base) };
  };

  const TOTAL = 150;
  for (let i = 0; i < TOTAL; i++) {
    const zone = zoneFor(y);
    const color = zone.colors[Math.floor(rnd() * zone.colors.length)];
    const mat = zone.mats[Math.floor(rnd() * zone.mats.length)];
    // Cambio de dirección suave, con giros bruscos ocasionales
    dir += r(-0.6, 0.6) + (rnd() < 0.12 ? (rnd() < 0.5 ? -1.4 : 1.4) : 0);
    // Mantiene la torre cerca del centro
    if (Math.hypot(x, z) > 45) dir = Math.atan2(-x, -z) + r(-0.5, 0.5);

    const kind = rnd();
    let size, type = 'block', extra = {}, half, rise, gap;
    if (kind < 0.18) {
      // Viga estrecha y larga, orientada en la dirección de avance
      const len = r(5, 8);
      size = [r(0.7, 1.1), 0.6, len];
      rise = r(0.2, 1.0);
      gap = r(1.5, 3);
    } else if (kind < 0.3) {
      // Barril grande
      type = 'cylinder';
      size = [2.4, 1.4, 2.4];
      rise = r(0.3, 1.2);
      gap = r(1.5, 3);
    } else if (kind < 0.38) {
      // Salto largo con trampolín
      type = 'jumppad';
      size = [3, 1, 3];
      rise = r(0, 0.6);
      gap = r(1.5, 2.5);
      extra = { power: 20 };
    } else if (kind < 0.46) {
      // Rampa que sube
      type = 'wedge';
      size = [3, r(2, 3.5), 6];
      rise = 0.1;
      gap = r(1.2, 2.2);
    } else {
      size = [r(2, 4.5), r(0.6, 2.5), r(2, 4.5)];
      rise = r(0.4, 1.5);
      gap = r(1.6, 3.4);
    }
    half = size[2] / 2;
    const top = y + rise;
    const pieceTop = type === 'wedge' ? top + size[1] : top;
    const pieceBottom = type === 'wedge' ? top - 0.05 : top - size[1];
    const { d, fp } = chooseDir(dir, (dd) => {
      const step = prevHalf + gap + half;
      return footprint(x + Math.sin(dd) * step, z + Math.cos(dd) * step, size[0], size[2], dd, pieceBottom, pieceTop);
    });
    dir = d;
    x = fp.cx;
    z = fp.cz;
    const ry = (dir * 180) / Math.PI;
    if (type === 'wedge') {
      g.add('wedge', [x, top + size[1] / 2 - 0.05, z], size, color, mat).ry = ry;
      y = top + size[1];
    } else if (type === 'cylinder') {
      g.add('cylinder', [x, top - 0.7, z], size, color, mat);
      y = top;
    } else if (type === 'jumppad') {
      g.block([x, top - 0.5, z], [3, 1, 3], '#37474f', 'metal').ry = ry;
      g.add('jumppad', [x, top + 0.2, z], [2.4, 0.4, 2.4], '#ab47bc', 'neon', extra);
      y = top;
      placed.push(fp);
      // Tras el trampolín, la siguiente plataforma está mucho más alta
      const next = zoneFor(y);
      const boostRise = r(5, 6.5);
      const boostGap = r(3, 5);
      const land = chooseDir(dir, (dd) => {
        const st = 1.5 + boostGap + 2;
        return footprint(x + Math.sin(dd) * st, z + Math.cos(dd) * st, 4, 4, dd, y + boostRise - 1, y + boostRise);
      });
      dir = land.d;
      x = land.fp.cx;
      z = land.fp.cz;
      y += boostRise;
      g.block([x, y - 0.5, z], [4, 1, 4], next.colors[0], next.mats[0]).ry = (dir * 180) / Math.PI;
      placed.push(land.fp);
      prevHalf = 2;
      continue;
    } else {
      g.add(type, [x, top - size[1] / 2, z], size, color, mat, extra).ry = ry;
      y = top;
    }
    prevHalf = half;
    placed.push(fp);

    // Descansillos cada cierto tramo (no son puntos de control: solo un respiro)
    if (i % 25 === 24) {
      const rest = chooseDir(dir, (dd) => {
        const st = prevHalf + 2 + 4;
        return footprint(x + Math.sin(dd) * st, z + Math.cos(dd) * st, 8, 8, dd, y - 1, y);
      });
      dir = rest.d;
      x = rest.fp.cx;
      z = rest.fp.cz;
      g.block([x, y - 0.5, z], [8, 1, 8], '#eceff1', 'stone');
      g.add('sign', [x, y + 2.2, z], [4, 1.4, 0.2], '#ffffff', 'wood', { text: `${Math.round(y)} m` }).ry = (dir * 180) / Math.PI + 180;
      placed.push(rest.fp);
      prevHalf = 4;
    }
  }

  // Cima
  x += Math.sin(dir) * (prevHalf + 2.5 + 6);
  z += Math.cos(dir) * (prevHalf + 2.5 + 6);
  y += 1;
  g.block([x, y - 0.5, z], [12, 1, 12], '#ffd54f', 'metal');
  g.add('finish', [x, y + 0.2, z], [6, 0.4, 6], '#fdd835', 'neon');
  g.add('sign', [x, y + 3, z - 5.5], [7, 2, 0.2], '#ffffff', 'wood', { text: '¡LA CIMA!' });
  const summit = y;

  // Decoración por zonas (sin colisión): nubes y estrellas lejanas
  for (let i = 0; i < 40; i++) {
    const a = rnd() * Math.PI * 2, d = r(60, 140), h = r(120, 230);
    g.add('sphere', [Math.cos(a) * d, h, Math.sin(a) * d], [r(12, 22), r(4, 7), r(10, 18)], '#ffffff', 'plastic', { nc: true });
  }
  for (let i = 0; i < 30; i++) {
    const a = rnd() * Math.PI * 2, d = r(80, 160);
    g.add('light', [Math.cos(a) * d, r(230, summit + 40), Math.sin(a) * d], [1.2, 1.2, 1.2], ['#ffffff', '#b388ff', '#80d8ff'][i % 3], 'neon', { intensity: 0, range: 2 });
  }

  return {
    version: 1,
    terrain: { type: 'flat', size: 400, height: -1, color: '#5d6d5e' },
    water: null,
    sky: { time: 0.36, dayNight: false, fog: true },
    bounds: { min: [-200, -20, -200], max: [200, summit + 60, 200] },
    spawns: [[0, 0.2, 2], [3, 0.2, 2], [-3, 0.2, 2]],
    objects: g.objects,
    vehicles: [],
    meta: { mode: 'onlyup', summit, zones: ZONES.map((zz) => ({ until: zz.until, name: zz.name })) },
  };
}
