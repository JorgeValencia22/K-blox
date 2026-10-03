// Kest Hangout: plaza social con pista de baile, hoguera, escenario y trampolines.
import { WorldGen } from './builder.js';

export function buildHangout() {
  const g = new WorldGen('h');
  // Suelo principal
  g.block([0, -0.25, 0], [90, 0.5, 90], '#e0e0e0', 'stone');
  for (let i = -2; i <= 2; i++) {
    g.block([i * 18, 0.01, 0], [0.4, 0.02, 90], '#bdbdbd', 'stone', { nc: true });
    g.block([0, 0.01, i * 18], [90, 0.02, 0.4], '#bdbdbd', 'stone', { nc: true });
  }

  // Pista de baile (baldosas de neón animadas en el cliente)
  const tiles = [];
  for (let x = 0; x < 6; x++) for (let z = 0; z < 6; z++) {
    tiles.push(g.block([-25 + x * 2 + 1, 0.05, -25 + z * 2 + 1], [1.9, 0.1, 1.9], '#7c4dff', 'neon', { dance: true }).id);
  }
  g.add('zone', [-20, 1.5, -20], [12, 3, 12], '#ffffff', 'plastic', { id: 'dancefloor', name: 'Pista de baile' });
  // Escenario
  g.block([-20, 0.75, -32], [16, 1.5, 6], '#37474f', 'metal');
  g.add('stairs', [-20, 0.75, -27.5], [4, 1.5, 3], '#546e7a', 'metal').ry = 180;
  for (const x of [-27, -13]) {
    g.add('deco', [x, 2.5, -33], [1.4, 2, 1.4], '#212121', 'metal', { kind: 'crate' });
    g.add('light', [x, 6, -30], [0.6, 0.6, 0.6], ['#e040fb', '#00e5ff'][x < -20 ? 0 : 1], 'neon', { intensity: 2, range: 20 });
  }

  // Hoguera con asientos
  g.add('deco', [20, 0.4, -20], [1.6, 0.8, 1.6], '#ff7043', 'neon', { kind: 'campfire' });
  g.add('zone', [20, 1.5, -20], [10, 3, 10], '#ffffff', 'plastic', { id: 'campfire', name: 'Hoguera' });
  for (let i = 0; i < 6; i++) {
    const a = (i / 6) * Math.PI * 2;
    const x = 20 + Math.cos(a) * 4, z = -20 + Math.sin(a) * 4;
    const ry = 90 - (a * 180) / Math.PI;
    g.add('deco', [x, 0.35, z], [2, 0.7, 0.7], '#6d4c41', 'wood', { kind: 'log' }).ry = ry;
    g.add('seat', [x, 0.35, z], [1.8, 0.7, 0.7], '#6d4c41', 'wood', { hidden: true }).ry = ry;
  }

  // Zona de trampolines
  g.block([20, 0.03, 22], [20, 0.06, 20], '#4dd0e1', 'plastic', { nc: true });
  const pads = [[14, 16, 26], [26, 16, 30], [14, 28, 34], [26, 28, 42]];
  for (const [x, z, power] of pads) g.add('jumppad', [x, 0.2, z], [3, 0.4, 3], '#ab47bc', 'neon', { power });
  g.block([20, 14, 22], [6, 0.6, 6], '#ffca28', 'plastic');
  g.add('zone', [20, 15.5, 22], [6, 3, 6], '#ffffff', 'plastic', { id: 'skyplatform', name: 'Plataforma del cielo' });

  // Fuente y bancos centrales
  g.add('cylinder', [0, 0.5, 0], [8, 1, 8], '#90a4ae', 'stone');
  g.add('water', [0, 0.95, 0], [7, 0.1, 7], '#4fc3f7', 'glass', { group: 'fountain', on: true });
  for (const [x, z, ry] of [[0, 8, 0], [0, -8, 180], [8, 0, 90], [-8, 0, 270]]) {
    g.add('deco', [x, 0.5, z], [2.4, 1, 1], '#5d4037', 'wood', { kind: 'bench' }).ry = ry;
    g.add('seat', [x, 0.5, z], [2, 0.9, 0.9], '#5d4037', 'wood', { hidden: true }).ry = ry;
  }

  // Tobogán y laberinto de setos
  g.block([-22, 4, 22], [6, 8, 6], '#ef5350', 'plastic');
  g.add('stairs', [-22, 4, 29], [3, 8, 8], '#ffee58', 'plastic').ry = 180;
  g.add('wedge', [-29.5, 4, 22], [3, 8, 9], '#42a5f5', 'plastic').ry = 90;
  for (let i = 0; i < 5; i++) {
    g.block([-40 + i * 4, 1.2, 38], [0.8, 2.4, 10], '#2e7d32', 'grass');
  }
  for (const [x, z] of [[-40, 40], [40, 40], [-40, -40], [40, -40], [0, 40], [0, -40]]) {
    g.add('tree', [x, 3, z], [3, 6, 3], '#43a047', 'grass');
  }
  for (let i = 0; i < 12; i++) {
    const a = (i / 12) * Math.PI * 2;
    g.add('deco', [Math.cos(a) * 43, 2.5, Math.sin(a) * 43], [0.6, 5, 0.6], '#37474f', 'metal', { kind: 'lamp', group: 'street' });
  }
  g.add('sign', [0, 2, 12], [8, 2, 0.2], '#ffffff', 'wood', { text: 'KEST HANGOUT' });
  // Muros perimetrales bajos
  for (const [x, z, sx, sz] of [[0, 45, 90, 1], [0, -45, 90, 1], [45, 0, 1, 90], [-45, 0, 1, 90]]) {
    g.block([x, 0.75, z], [sx, 1.5, sz], '#b0bec5', 'stone');
  }

  return {
    version: 1,
    terrain: { type: 'flat', size: 260, height: -0.5, color: '#81c784' },
    water: null,
    sky: { time: 0.72, dayNight: false, fog: true },
    bounds: { min: [-130, -20, -130], max: [130, 150, 130] },
    spawns: [[0, 0.3, 14], [4, 0.3, 14], [-4, 0.3, 14], [0, 0.3, 18]],
    objects: g.objects,
    vehicles: [],
    meta: { mode: 'hangout', tiles },
  };
}
