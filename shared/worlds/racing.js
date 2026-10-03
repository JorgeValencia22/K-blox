// Kest Racing: circuito cerrado con 8 puntos de control y parrilla de salida.
import { WorldGen } from './builder.js';

export function trackPoint(t) {
  const a = t * Math.PI * 2;
  return [130 * Math.cos(a) + 28 * Math.sin(2 * a), 78 * Math.sin(a) + 12 * Math.cos(3 * a)];
}

export function buildRacing() {
  const g = new WorldGen('r');
  const N = 96;
  const pts = [];
  for (let i = 0; i < N; i++) pts.push(trackPoint(i / N));
  const W = 15;

  for (let i = 0; i < N; i++) {
    const [ax, az] = pts[i];
    const [bx, bz] = pts[(i + 1) % N];
    const dx = bx - ax, dz = bz - az;
    const len = Math.hypot(dx, dz) + 1.2;
    const ry = (Math.atan2(dx, dz) * 180) / Math.PI;
    const o = g.block([(ax + bx) / 2, 0.1, (az + bz) / 2], [W, 0.2, len], i % 2 ? '#424242' : '#4a4a4a', 'stone');
    o.ry = ry;
    // Pianos (bordillos) alternos a ambos lados
    const nx = dz / Math.hypot(dx, dz), nz = -dx / Math.hypot(dx, dz);
    for (const side of [-1, 1]) {
      const k = g.block([(ax + bx) / 2 + nx * side * (W / 2 + 0.6), 0.15, (az + bz) / 2 + nz * side * (W / 2 + 0.6)], [1.2, 0.3, len], i % 2 ? '#e53935' : '#fafafa', 'plastic', { nc: true });
      k.ry = ry;
    }
    // Barreras de neumáticos en el exterior de las curvas
    if (i % 4 === 0) {
      for (const side of [-1, 1]) {
        g.add('cylinder', [ax + nx * side * (W / 2 + 4), 0.6, az + nz * side * (W / 2 + 4)], [1.4, 1.2, 1.4], '#212121', 'plastic');
      }
    }
  }

  // Puntos de control (zonas invisibles) en orden
  const CP = 8;
  for (let k = 0; k < CP; k++) {
    const [x, z] = pts[Math.floor((k * N) / CP)];
    g.add('zone', [x, 2, z], [26, 8, 26], '#ffffff', 'plastic', { id: `rcp${k}`, n: k });
  }

  // Línea de salida, arco y parrilla
  const [sx, sz] = pts[0];
  const [nx2, nz2] = pts[1];
  const dir = Math.atan2(nx2 - sx, nz2 - sz);
  const ryDeg = (dir * 180) / Math.PI;
  const line = g.block([sx, 0.22, sz], [W, 0.04, 1.2], '#ffffff', 'neon', { nc: true });
  line.ry = ryDeg;
  const px = Math.cos(dir), pz = -Math.sin(dir); // perpendicular
  for (const side of [-1, 1]) g.block([sx + px * side * (W / 2 + 1), 4, sz + pz * side * (W / 2 + 1)], [1, 8, 1], '#fdd835', 'metal');
  const arch = g.block([sx, 8.4, sz], [W + 3, 1.2, 1], '#fdd835', 'metal');
  arch.ry = ryDeg;
  g.add('sign', [sx, 8.4, sz], [8, 1, 1.1], '#212121', 'plastic', { text: 'KEST RACING' }).ry = ryDeg;

  const grid = [];
  const fx = Math.sin(dir), fz = Math.cos(dir);
  for (let i = 0; i < 8; i++) {
    const row = Math.floor(i / 2), col = i % 2 ? 1 : -1;
    const back = 6 + row * 6;
    grid.push({ p: [sx - fx * back + px * col * 3.5, 0.6, sz - fz * back + pz * col * 3.5], ry: ryDeg });
  }

  // Grada, árboles y decoración
  const gx = sx + px * -(W / 2 + 12), gz = sz + pz * -(W / 2 + 12);
  for (let r = 0; r < 4; r++) {
    const b = g.block([gx + px * -r * 1.6, 0.5 + r * 0.8, gz + pz * -r * 1.6], [3, 1 + r * 1.6, 30], ['#1e88e5', '#e53935', '#fdd835', '#43a047'][r], 'plastic');
    b.ry = ryDeg;
  }
  for (let i = 0; i < 70; i++) {
    const a = (i / 70) * Math.PI * 2;
    const rr = i % 2 ? 185 : 40 + (i % 7) * 4;
    const x = Math.cos(a) * rr * (i % 2 ? 1 : 1.6), z = Math.sin(a) * rr * (i % 2 ? 0.7 : 0.5);
    g.add('tree', [x, 3, z], [3, 6, 3], '#388e3c', 'grass');
  }

  return {
    version: 1,
    terrain: { type: 'flat', size: 420, height: 0, color: '#66bb6a' },
    water: null,
    sky: { time: 0.38, dayNight: false, fog: true },
    bounds: { min: [-210, -20, -210], max: [210, 120, 210] },
    spawns: grid.map((s) => [s.p[0], 0.4, s.p[2]]),
    objects: g.objects,
    vehicles: [],
    meta: { mode: 'racing', grid, checkpoints: CP, laps: 3, minLapTime: 12 },
  };
}
