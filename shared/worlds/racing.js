// Fórmula Turbo: 4 circuitos para monoplazas (F1) con parrilla, puntos de control y turbos.
// El circuito se traza con una curva suave que pasa por puntos de control; cada circuito tiene
// su propia forma (clásico, tipo Monza con rectas largas, tipo Mónaco con curvas cerradas y
// tipo Silverstone con curvas rápidas).
import { WorldGen } from './builder.js';
import { mulberry32 } from '../terrain.js';

const N = 180;
const CP = 8;
const W = 18;

export function trackPoint(t) {
  const a = t * Math.PI * 2;
  return [130 * Math.cos(a) + 28 * Math.sin(2 * a), 78 * Math.sin(a) + 12 * Math.cos(3 * a)];
}

/** Curva cerrada suave (Catmull-Rom) que pasa por los puntos de control. */
function smoothLoop(ctrl, n) {
  const out = [];
  const m = ctrl.length;
  const cr = (a, b, c, d, u) => 0.5 * (2 * b + (-a + c) * u + (2 * a - 5 * b + 4 * c - d) * u * u + (-a + 3 * b - 3 * c + d) * u * u * u);
  for (let i = 0; i < n; i++) {
    const t = (i / n) * m;
    const k = Math.floor(t), u = t - k;
    const p0 = ctrl[(k - 1 + m) % m], p1 = ctrl[k % m], p2 = ctrl[(k + 1) % m], p3 = ctrl[(k + 2) % m];
    out.push([cr(p0[0], p1[0], p2[0], p3[0], u), cr(p0[1], p1[1], p2[1], p3[1], u)]);
  }
  return out;
}

const TRACKS = {
  classic: { name: 'Circuito Turbo', pts: () => Array.from({ length: N }, (_, i) => trackPoint(i / N)), turbos: [0.15, 0.4, 0.6, 0.85], scenery: 'lake' },
  monza: {
    name: 'Autódromo Turbo (rectas largas)',
    ctrl: [[0, -185], [120, -185], [175, -125], [175, -45], [125, -15], [60, 15], [120, 60], [175, 115], [120, 175], [0, 185], [-120, 175], [-175, 115], [-120, 60], [-60, 15], [-125, -15], [-175, -45], [-175, -125], [-120, -185]],
    turbos: [0.05, 0.3, 0.55, 0.8], scenery: 'park',
  },
  monaco: {
    name: 'Gran Premio Turbo (curvas cerradas)',
    ctrl: [[-40, -150], [40, -150], [70, -115], [40, -85], [80, -45], [45, -5], [100, 35], [65, 85], [5, 65], [-40, 115], [-95, 75], [-75, 20], [-135, 10], [-120, -60], [-70, -80], [-105, -140]],
    turbos: [0.1, 0.45, 0.7], scenery: 'city',
  },
  silverstone: {
    name: 'Circuito Turbo (curvas rápidas)',
    ctrl: [[-160, -40], [-80, -120], [40, -130], [150, -80], [175, 20], [120, 110], [40, 150], [-40, 100], [-60, 40], [-150, 80]],
    turbos: [0.12, 0.5, 0.78], scenery: 'park',
  },
};

export const RACING_TRACKS = Object.keys(TRACKS);

export function buildRacing(track = 'classic') {
  const T = TRACKS[track] || TRACKS.classic;
  const pts = T.ctrl ? smoothLoop(T.ctrl, N) : T.pts();
  const n = pts.length;
  const g = new WorldGen('r');

  // Asfalto por tramos, bordillos alternos y barreras de neumáticos en el exterior
  for (let i = 0; i < n; i++) {
    const [ax, az] = pts[i];
    const [bx, bz] = pts[(i + 1) % n];
    const dx = bx - ax, dz = bz - az;
    const dl = Math.hypot(dx, dz);
    const len = dl + 1.2;
    const ry = (Math.atan2(dx, dz) * 180) / Math.PI;
    g.block([(ax + bx) / 2, 0.1, (az + bz) / 2], [W, 0.2, len], i % 2 ? '#424242' : '#4a4a4a', 'stone').ry = ry;
    const nx = dz / dl, nz = -dx / dl;
    for (const side of [-1, 1]) {
      g.block([(ax + bx) / 2 + nx * side * (W / 2 + 0.6), 0.15, (az + bz) / 2 + nz * side * (W / 2 + 0.6)], [1.2, 0.3, len], i % 2 ? '#e53935' : '#fafafa', 'plastic', { nc: true }).ry = ry;
    }
    if (i % 4 === 0) {
      for (const side of [-1, 1]) g.add('cylinder', [ax + nx * side * (W / 2 + 4), 0.6, az + nz * side * (W / 2 + 4)], [1.4, 1.2, 1.4], '#212121', 'plastic');
    }
  }

  // Puntos de control (zonas invisibles) en orden
  for (let k = 0; k < CP; k++) {
    const [x, z] = pts[Math.floor((k * n) / CP)];
    g.add('zone', [x, 2, z], [W + 8, 8, W + 8], '#ffffff', 'plastic', { id: `rcp${k}`, n: k });
  }

  // Línea de salida, arco y parrilla
  const [sx, sz] = pts[0];
  const [nx2, nz2] = pts[1];
  const dir = Math.atan2(nx2 - sx, nz2 - sz);
  const ryDeg = (dir * 180) / Math.PI;
  g.block([sx, 0.22, sz], [W, 0.04, 1.2], '#ffffff', 'neon', { nc: true }).ry = ryDeg;
  const px = Math.cos(dir), pz = -Math.sin(dir); // perpendicular
  for (const side of [-1, 1]) g.block([sx + px * side * (W / 2 + 1), 4, sz + pz * side * (W / 2 + 1)], [1, 8, 1], '#fdd835', 'metal');
  g.block([sx, 8.4, sz], [W + 3, 1.2, 1], '#fdd835', 'metal').ry = ryDeg;
  g.add('sign', [sx, 8.4, sz], [8, 1, 1.1], '#212121', 'plastic', { text: T.name.toUpperCase() }).ry = ryDeg;

  const grid = [];
  const fx = Math.sin(dir), fz = Math.cos(dir);
  for (let i = 0; i < 8; i++) {
    const row = Math.floor(i / 2), col = i % 2 ? 1 : -1;
    const back = 6 + row * 7;
    grid.push({ p: [sx - fx * back + px * col * 3.8, 0.6, sz - fz * back + pz * col * 3.8], ry: ryDeg });
  }

  // Gradas con público y boxes junto a la recta de salida
  const gx = sx + px * -(W / 2 + 12), gz = sz + pz * -(W / 2 + 12);
  for (let r = 0; r < 4; r++) {
    g.block([gx + px * -r * 1.6, 0.5 + r * 0.8, gz + pz * -r * 1.6], [3, 1 + r * 1.6, 30], ['#1e88e5', '#e53935', '#fdd835', '#43a047'][r], 'plastic').ry = ryDeg;
  }
  for (let r = 0; r < 4; r++) for (let k = -6; k <= 6; k += 2) {
    const off = -r * 1.6;
    g.block([gx + px * off + fx * k * 2, 1.4 + r * 1.6 + 0.3, gz + pz * off + fz * k * 2], [0.6, 0.8, 0.6], ['#f44336', '#ffeb3b', '#2196f3', '#ffffff', '#4caf50'][(r + k + 12) % 5], 'plastic', { nc: true });
  }
  {
    const bx = sx + px * (W / 2 + 14), bz = sz + pz * (W / 2 + 14);
    g.block([bx, 2.5, bz], [6, 5, 36], '#eceff1', 'brick').ry = ryDeg;
    g.block([bx - px * 1, 5.3, bz - pz * 1], [9, 0.5, 38], '#e53935', 'plastic').ry = ryDeg;
    g.add('sign', [bx - px * 3.1, 6.4, bz - pz * 3.1], [12, 1.4, 0.2], '#212121', 'metal', { text: 'BOXES' }).ry = ryDeg + 90;
    for (let k = -2; k <= 2; k++) g.add('deco', [bx - px * 4 + fx * k * 6, 0.5, bz - pz * 4 + fz * k * 6], [1, 1, 1], '#ff7043', 'plastic', { kind: 'barrel' });
  }

  // Turbos sobre el asfalto (el monoplaza acelera un momento al pasar)
  const segRy = (i) => {
    const [ax, az] = pts[i], [bx, bz] = pts[(i + 1) % n];
    return (Math.atan2(bx - ax, bz - az) * 180) / Math.PI;
  };
  const boosts = [];
  for (const f of T.turbos) {
    const i = Math.floor(f * n);
    const [x, z] = pts[i];
    g.block([x, 0.22, z], [6, 0.06, 4], '#00e5ff', 'neon', { nc: true }).ry = segRy(i);
    const a = (segRy(i) * Math.PI) / 180;
    for (const k of [-1, 0, 1]) g.block([x + Math.sin(a) * k * 1.2, 0.26, z + Math.cos(a) * k * 1.2], [3.5, 0.04, 0.35], '#ffffff', 'neon', { nc: true }).ry = segRy(i);
    boosts.push([x, z]);
  }

  // Lo que rodea el circuito: lago (clásico), parques o ciudad (Mónaco)
  const dist = (x, z) => pts.reduce((m, [px2, pz2]) => Math.min(m, Math.hypot(x - px2, z - pz2)), 1e9);
  // Semilla fija: cliente y servidor deben construir exactamente el mismo mundo
  const rnd = mulberry32(track.length * 131 + 7);
  let placed = 0;
  for (let i = 0; i < 900 && placed < 110; i++) {
    const x = (rnd() - 0.5) * 460, z = (rnd() - 0.5) * 460;
    if (dist(x, z) < 30) continue;
    if (T.scenery === 'city' && i % 2) {
      g.block([x, 4, z], [6 + (i % 3) * 3, 8 + (i % 5) * 4, 6 + (i % 4) * 2], ['#90a4ae', '#b0bec5', '#78909c'][i % 3], 'brick');
    } else if (T.scenery === 'lake' && dist(x, z) < 60 && i % 3 === 0) {
      g.add('cylinder', [x, 0.1, z], [18, 0.2, 14], '#29b6f6', 'glass', { nc: true });
    } else {
      g.add('tree', [x, 3, z], [3, 6, 3], '#388e3c', 'grass');
    }
    placed++;
  }
  if (T.scenery === 'lake') {
    g.add('sphere', [0, 2.6, 0], [1.6, 1.6, 1.6], '#4fc3f7', 'glass', { nc: true });
  }
  // Carteles publicitarios a lo largo del circuito
  ['¡TURBO!', 'KESTWORLDS', 'NO FRENES', 'CURVA PELIGROSA'].forEach((t, k) => {
    const [x, z] = pts[Math.floor(((k + 0.5) * n) / 4)];
    const r = Math.hypot(x, z) || 1;
    g.add('sign', [x * (1 + 16 / r), 3, z * (1 + 16 / r)], [8, 3, 0.3], ['#ffeb3b', '#7c4dff', '#ff5722', '#00bcd4'][k], 'metal', { text: t }).ry = (Math.atan2(x, z) * 180) / Math.PI;
  });

  const xs = pts.map((p) => p[0]), zs = pts.map((p) => p[1]);
  const pad = 60;
  const bounds = { min: [Math.min(...xs) - pad, -20, Math.min(...zs) - pad], max: [Math.max(...xs) + pad, 120, Math.max(...zs) + pad] };
  const size = Math.max(bounds.max[0] - bounds.min[0], bounds.max[2] - bounds.min[2]) + 160;

  return {
    version: 1,
    terrain: { type: 'flat', size, height: 0, color: '#66bb6a' },
    water: null,
    sky: { time: 0.38, dayNight: false, fog: true },
    bounds,
    spawns: grid.map((s) => [s.p[0], 0.4, s.p[2]]),
    objects: g.objects,
    vehicles: [],
    meta: { mode: 'racing', vehicle: 'f1', grid, checkpoints: CP, laps: 3, minLapTime: 12, boosts },
  };
}

/** Monta uno de los circuitos por su clave (monza, monaco…). */
export function buildRacingTrack(track) {
  return buildRacing(track);
}
