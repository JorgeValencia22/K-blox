// Guerra Galáctica: planeta desértico con la base rebelde, la arena de duelos (sables de plasma),
// el campo de batalla de la Historia (oleadas de droides y Lord Vex) y el hangar desde el que se
// despega para destruir la Estación Oscura.
import { WorldGen } from './builder.js';
import { mulberry32 } from '../terrain.js';

/** Lugares clave (los usan el servidor y el cliente). */
export const GX = {
  base: [0, 0, 0],
  arena: { c: [70, 0, 0], r: 13, y: 1.2, a: [62, 1.2, 0], b: [78, 1.2, 0] },
  field: { c: [-75, 0, 0], r: 48, gate: [-34, 0, 0], drops: [[-125, 0, -30], [-128, 0, 0], [-125, 0, 30], [-110, 0, -45], [-110, 0, 45]] },
  hangar: { ship: [0, 0, -52] },
  terminals: { duel: [50, 0, 6], story: [-16, 0, 8], ship: [0, 0, -40] },
};

export function buildGalaxia() {
  const g = new WorldGen('gx');
  const rnd = mulberry32(1977);
  const neonBlue = '#4fc3f7', neonRed = '#ff1744';

  // --- Base rebelde (centro) -----------------------------------------------------------
  g.block([0, 0.1, 0], [44, 0.2, 44], '#8a8f98', 'metal');
  for (const [x, z, sx, sz] of [[-13.5, -22, 17, 1], [13.5, -22, 17, 1], [0, 22, 44, 1], [22, 12, 1, 20], [22, -12, 1, 20], [-22, 14, 1, 16], [-22, -14, 1, 16]]) {
    g.block([x, 2, z], [sx, 4, sz], '#b0a58f', 'stone');
  }
  // Puerta oeste (hacia el campo de batalla) y puerta este (hacia la arena)
  g.block([-22, 4.6, 0], [1.4, 1.2, 12], '#7d7464', 'stone');
  g.block([22, 4.6, 0], [1.4, 1.2, 4], '#7d7464', 'stone');
  g.block([0, 4.6, -22], [10, 1.2, 1.4], '#7d7464', 'stone');
  // Mesa holográfica y antenas
  g.add('cylinder', [-16, 0.7, 8], [2.4, 1.2, 2.4], '#455a64', 'metal');
  g.add('cylinder', [-16, 1.5, 8], [2.2, 0.15, 2.2], neonBlue, 'neon', { nc: true });
  g.add('sign', [-16, 3.6, 11], [6, 1.6, 0.3], '#0d1b2a', 'metal', { text: '📖 HISTORIA' });
  g.add('sign', [16, 3.2, 0], [6, 1.6, 0.3], '#0d1b2a', 'metal', { text: '⚔️ DUELOS →' });
  g.add('sign', [0, 5.8, -21], [10, 1.8, 0.3], '#0d1b2a', 'metal', { text: '🚀 HANGAR' });
  g.add('sign', [0, 6, 21.4], [14, 2.2, 0.3], '#0d1b2a', 'metal', { text: 'GUERRA GALÁCTICA' });
  for (const [x, z] of [[-14, 14], [14, 14], [-14, -14], [14, -14]]) {
    g.add('cylinder', [x, 3, z], [0.6, 6, 0.6], '#cfd8dc', 'metal');
    g.add('sphere', [x, 6.4, z], [1.2, 1.2, 1.2], neonBlue, 'neon', { nc: true });
    g.add('light', [x, 6.4, z], [0.6, 0.6, 0.6], '#81d4fa', 'neon', { intensity: 1.6, range: 16 });
  }
  for (let i = 0; i < 8; i++) g.add('deco', [-16 + i * 4.5, 0.7, 18], [1.2, 1.2, 1.2], '#8d6e63', 'wood', { kind: i % 2 ? 'crate' : 'barrel' });

  // --- Hangar (norte) con la nave -------------------------------------------------------
  g.block([0, 0.1, -50], [30, 0.2, 24], '#5f6670', 'metal');
  g.block([-15, 5, -50], [1, 10, 24], '#9e9e9e', 'metal');
  g.block([15, 5, -50], [1, 10, 24], '#9e9e9e', 'metal');
  g.block([0, 5, -62], [31, 10, 1], '#9e9e9e', 'metal');
  g.block([0, 10.4, -50], [31, 0.8, 25], '#757575', 'metal');
  for (const x of [-10, -5, 0, 5, 10]) g.add('block', [x, 9.9, -50], [0.4, 0.2, 22], '#e1f5fe', 'neon', { nc: true });
  g.add('light', [0, 8, -50], [0.6, 0.6, 0.6], '#e1f5fe', 'neon', { intensity: 2, range: 26 });
  // Caza estelar (alas en X)
  const sx = 0, sy = 1.6, sz = -52;
  g.block([sx, sy, sz], [1.4, 1.2, 8], '#eceff1', 'metal');
  g.add('wedge', [sx, sy, sz - 5], [1.4, 1.2, 2], '#eceff1', 'metal').ry = 180;
  g.add('sphere', [sx, sy + 0.7, sz + 0.5], [1.1, 0.8, 1.8], '#263238', 'glass', { nc: true });
  for (const [a, b] of [[-1, 1], [1, 1], [-1, -1], [1, -1]]) {
    g.block([sx + a * 2.8, sy + b * 0.6, sz + 2], [4.2, 0.15, 2.2], '#eceff1', 'metal').ry = 0;
    g.add('cylinder', [sx + a * 1.4, sy + b * 0.5, sz + 2.2], [0.7, 0.7, 2.6], '#b0bec5', 'metal', { nc: true });
    g.add('cylinder', [sx + a * 5, sy + b * 0.6, sz + 1], [0.2, 0.2, 4.5], '#cfd8dc', 'metal', { nc: true });
    g.block([sx + a * 2.6, sy + b * 0.62, sz + 2], [1, 0.05, 1.6], '#e53935', 'plastic', { nc: true });
  }
  g.block([sx, 0.5, sz], [0.4, 1, 0.4], '#424242', 'metal');

  // --- Arena de duelos (este) -----------------------------------------------------------
  const A = GX.arena;
  g.add('cylinder', [A.c[0], 0.6, A.c[2]], [A.r * 2 + 2, 1.2, A.r * 2 + 2], '#263238', 'metal');
  g.add('cylinder', [A.c[0], 1.22, A.c[2]], [A.r * 2, 0.04, A.r * 2], '#37474f', 'metal', { nc: true });
  for (let i = 0; i < 16; i++) {
    const a = (i / 16) * Math.PI * 2;
    const x = A.c[0] + Math.cos(a) * (A.r + 1.6), z = A.c[2] + Math.sin(a) * (A.r + 1.6);
    g.add('cylinder', [x, 3.2, z], [0.7, 4, 0.7], '#455a64', 'metal');
    g.add('sphere', [x, 5.5, z], [0.9, 0.9, 0.9], i % 2 ? neonRed : neonBlue, 'neon', { nc: true });
  }
  g.add('light', [A.a[0], 4, A.a[2]], [0.6, 0.6, 0.6], neonBlue, 'neon', { intensity: 2.5, range: 18 });
  g.add('light', [A.b[0], 4, A.b[2]], [0.6, 0.6, 0.6], neonRed, 'neon', { intensity: 2.5, range: 18 });
  g.add('stairs', [A.c[0] - A.r - 3, 0.6, A.c[2]], [3, 1.2, 4], '#455a64', 'metal').ry = 90;
  g.add('sign', [A.c[0], 7.5, A.c[2] - A.r - 2], [12, 2.2, 0.3], '#120000', 'metal', { text: '⚔️ ARENA DE DUELOS' });
  g.add('cylinder', [GX.terminals.duel[0], 0.8, GX.terminals.duel[2]], [1.2, 1.6, 1.2], '#37474f', 'metal');
  g.add('sphere', [GX.terminals.duel[0], 1.9, GX.terminals.duel[2]], [0.7, 0.7, 0.7], neonRed, 'neon', { nc: true });

  // --- Campo de batalla (oeste): ruinas, barricadas y la nave de desembarco droide -------------
  const F = GX.field;
  for (let i = 0; i < 22; i++) {
    const x = F.c[0] + (rnd() - 0.5) * 80, z = F.c[2] + (rnd() - 0.5) * 80;
    if (Math.abs(z) < 4 && x > -60) continue;
    const big = rnd() < 0.35;
    g.block([x, big ? 1.5 : 0.7, z], big ? [2 + rnd() * 3, 3, 1] : [3, 1.4, 1], big ? '#a1887f' : '#78909c', big ? 'stone' : 'metal').ry = Math.round(rnd() * 3) * 45;
  }
  g.block([-140, 6, 0], [18, 12, 30], '#546e7a', 'metal');
  g.add('wedge', [-128, 6, 0], [6, 12, 30], '#546e7a', 'metal').ry = 90;
  g.add('sphere', [-140, 13, 0], [12, 4, 12], '#37474f', 'metal', { nc: true });
  g.add('light', [-128, 3, 0], [0.6, 0.6, 0.6], neonRed, 'neon', { intensity: 2, range: 24 });

  // --- Paisaje: dunas, rocas, vaporizadores y un crucero estrellado a lo lejos -------------
  for (let i = 0; i < 70; i++) {
    const x = (rnd() - 0.5) * 300, z = (rnd() - 0.5) * 300;
    if (Math.hypot(x, z) < 40 || Math.hypot(x - A.c[0], z) < 22 || (x < -20 && x > -135 && Math.abs(z) < 55)) continue;
    const s = 8 + rnd() * 18;
    g.add('sphere', [x, -s * 0.15, z], [s, s * 0.45, s * (0.7 + rnd() * 0.6)], '#d9b98a', 'sand');
  }
  for (let i = 0; i < 26; i++) {
    const x = (rnd() - 0.5) * 280, z = (rnd() - 0.5) * 280;
    if (Math.hypot(x, z) < 30) continue;
    const s = 1.5 + rnd() * 3;
    g.add('deco', [x, s * 0.3, z], [s, s * 0.8, s], '#a1887f', 'stone', { kind: 'rock' });
  }
  for (const [x, z] of [[30, 30], [36, 34], [-30, 34], [30, -32]]) {
    g.add('cylinder', [x, 2.5, z], [0.8, 5, 0.8], '#cfd8dc', 'metal');
    g.add('cylinder', [x, 3.5, z], [2, 0.2, 2], '#b0bec5', 'metal', { nc: true });
  }
  // Crucero estrellado (cuña gigante medio enterrada)
  g.add('wedge', [40, 6, 125], [70, 16, 34], '#9e9e9e', 'metal').ry = 200;
  g.block([22, 15, 130], [12, 8, 10], '#8d8d8d', 'metal').ry = 20;

  return {
    version: 1,
    terrain: { type: 'flat', size: 320, height: 0, color: '#d6b27c' },
    sky: { time: 0.7, dayNight: false, fog: true },
    bounds: { min: [-155, -20, -150], max: [150, 80, 150] },
    spawns: [[0, 0.4, 6], [3, 0.4, 6], [-3, 0.4, 6], [0, 0.4, 10]],
    objects: g.objects,
    vehicles: [],
    meta: { mode: 'galaxia' },
  };
}
