// La Plaza: plaza social con pista de baile, hoguera, escenario y trampolines.
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
  for (let i = 0; i < 16; i++) {
    const a = (i / 16) * Math.PI * 2;
    g.add('deco', [Math.cos(a) * 62, 2.5, Math.sin(a) * 62], [0.6, 5, 0.6], '#37474f', 'metal', { kind: 'lamp', group: 'street' });
  }
  g.add('sign', [0, 2, 12], [8, 2, 0.2], '#ffffff', 'wood', { text: 'LA PLAZA' });
  // La plaza se amplía: anillo exterior de 130×130 m con nuevas zonas
  for (const [x, z, sx, sz] of [[0, 55, 130, 20], [0, -55, 130, 20], [55, 0, 20, 90], [-55, 0, 20, 90]]) g.block([x, -0.25, z], [sx, 0.5, sz], '#eeeeee', 'stone');
  for (const [x, z, sx, sz] of [[0, 65, 130, 1], [0, -65, 130, 1], [65, 0, 1, 130], [-65, 0, 1, 130]]) g.block([x, 0.75, z], [sx, 1.5, sz], '#b0bec5', 'stone');
  // Muros interiores bajos con aberturas para pasar al anillo exterior
  for (const s of [-1, 1]) {
    for (const k of [-1, 1]) {
      g.block([k * 26, 0.5, s * 45], [38, 1, 0.8], '#cfd8dc', 'stone');
      g.block([s * 45, 0.5, k * 26], [0.8, 1, 38], '#cfd8dc', 'stone');
    }
  }

  // Norte: MINI OBBY en espiral hasta una plataforma con vistas
  {
    const C = ['#ef5350', '#ffa726', '#ffee58', '#66bb6a', '#42a5f5', '#ab47bc'];
    g.add('sign', [-38, 2, -50], [6, 1.6, 0.2], '#ffffff', 'wood', { text: 'MINI OBBY →' });
    for (let i = 0; i < 14; i++) {
      const x = -32 + i * 4.6, y = 0.6 + i * 0.75;
      g.block([x, y, -55 + (i % 2 ? 1.5 : -1.5)], [2.6, 0.5, 2.6], C[i % 6], 'plastic');
    }
    g.block([36, 11.5, -55], [8, 0.6, 8], '#fff59d', 'stone');
    g.add('sign', [36, 13.5, -58.8], [5, 1.4, 0.2], '#ffffff', 'wood', { text: '¡LO LOGRASTE!' });
    g.add('wedge', [44.5, 5.75, -55], [3, 11.5, 9], '#42a5f5', 'plastic').ry = -90;
  }
  // Sur: cancha de baloncesto, máquinas recreativas y food trucks
  {
    g.block([-30, 0.02, 55], [28, 0.04, 16], '#ff8a65', 'plastic');
    g.block([-30, 0.05, 55], [0.2, 0.02, 16], '#ffffff', 'plastic');
    for (const s of [-1, 1]) {
      g.block([-30 + s * 13.5, 1.8, 55], [0.3, 3.6, 0.3], '#90a4ae', 'metal');
      g.block([-30 + s * 13, 3.4, 55], [0.2, 1.4, 2], '#ffffff', 'glass');
      g.add('cylinder', [-30 + s * 12.4, 3.05, 55], [0.9, 0.08, 0.9], '#ff5722', 'metal');
    }
    g.add('sphere', [-28, 0.4, 56], [0.8, 0.8, 0.8], '#ff7043', 'plastic');
    ['#7c4dff', '#00e5ff', '#ff4081', '#76ff03'].forEach((c, i) => {
      g.block([0 + i * 3.2, 1.2, 60], [2.2, 2.4, 1.4], '#263238', 'metal');
      g.block([0 + i * 3.2, 1.7, 59.28], [1.6, 1, 0.05], c, 'neon');
    });
    g.add('sign', [4.8, 3.2, 60.8], [8, 1, 0.2], '#212121', 'metal', { text: 'RECREATIVAS' });
    [['PIZZA', '#ffcc80'], ['TACOS', '#fff176'], ['BATIDOS', '#f8bbd0']].forEach(([t, c], i) => {
      const x = 26 + i * 10;
      g.block([x, 1.5, 58], [6, 3, 3], c, 'metal');
      g.block([x, 3.2, 56.4], [6.4, 0.2, 1.4], '#e53935', 'plastic');
      g.add('sign', [x, 2.2, 56.45], [3.6, 0.9, 0.1], '#ffffff', 'wood', { text: t });
      for (const k of [-2, 2]) g.add('cylinder', [x + k, 0.4, 59.7], [0.8, 0.8, 0.8], '#212121', 'plastic');
    });
  }
  // Este: piscina con trampolín y tumbonas
  {
    g.block([55, 0.05, 0], [14, 0.1, 30], '#4fc3f7', 'glass', { nc: true });
    for (const [x, z, sx, sz] of [[55, 15.5, 16, 1], [55, -15.5, 16, 1], [47.5, 0, 1, 32], [62.5, 0, 1, 32]]) g.block([x, 0.25, z], [sx, 0.5, sz], '#eceff1', 'stone');
    g.block([55, 1.6, -13], [2, 0.2, 5], '#ffffff', 'plastic');
    g.add('jumppad', [55, 0.2, -8], [2.4, 0.4, 2.4], '#00b0ff', 'neon', { power: 20 });
    g.add('jumppad', [55, 0.2, 6], [2.4, 0.4, 2.4], '#00b0ff', 'neon', { power: 26 });
    for (let i = 0; i < 4; i++) {
      g.block([45.5 - 0.1, 0.35, -10 + i * 6], [1.6, 0.3, 3.2], ['#ffeb3b', '#ff80ab', '#80deea', '#c5e1a5'][i], 'plastic');
      g.add('seat', [45.4, 0.4, -10 + i * 6], [1.4, 0.5, 3], '#ffffff', 'plastic', { hidden: true }).ry = 90;
    }
    g.add('sign', [55, 2, 17], [6, 1.4, 0.2], '#0277bd', 'wood', { text: 'PISCINA' });
  }
  // Oeste: cine al aire libre
  {
    g.block([-61, 5, 0], [1, 10, 26], '#212121', 'metal');
    g.add('sign', [-60.4, 5.5, 0], [0.2, 7, 22], '#263238', 'neon', { text: '🎬 CINE · ESTRENO HOY' });
    for (let r = 0; r < 4; r++) for (let k = -3; k <= 3; k++) {
      const x = -50 + r * 3, z = k * 3.2;
      g.block([x, 0.3, z], [1.4, 0.6, 2.4], '#c62828', 'plastic');
      g.add('seat', [x, 0.35, z], [1.2, 0.6, 2], '#c62828', 'plastic', { hidden: true }).ry = 270;
    }
  }
  for (const [x, z] of [[-58, -58], [58, -58], [-58, 58], [58, 58]]) g.add('tree', [x, 3, z], [3.4, 6.5, 3.4], '#43a047', 'grass');

  return {
    version: 1,
    terrain: { type: 'flat', size: 300, height: -0.5, color: '#81c784' },
    water: null,
    sky: { time: 0.72, dayNight: false, fog: true },
    bounds: { min: [-130, -20, -130], max: [130, 150, 130] },
    spawns: [[0, 0.3, 14], [4, 0.3, 14], [-4, 0.3, 14], [0, 0.3, 18]],
    objects: g.objects,
    vehicles: [],
    meta: { mode: 'hangout', tiles },
  };
}
