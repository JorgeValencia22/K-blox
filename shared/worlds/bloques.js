// Bloques Locos: suelo de baldosas de colores flotando en el cielo. Se anuncia
// un color y, al acabar la cuenta, desaparecen todas las demás baldosas. Cada ronda
// hay menos tiempo. Gana quien quede en pie (con bots si hay pocos jugadores).
import { WorldGen } from './builder.js';

export const TILE_COLORS = [
  { name: 'ROJO', hex: '#f44336' }, { name: 'AZUL', hex: '#2196f3' }, { name: 'VERDE', hex: '#4caf50' },
  { name: 'AMARILLO', hex: '#ffeb3b' }, { name: 'MORADO', hex: '#9c27b0' }, { name: 'NARANJA', hex: '#ff9800' },
];
export const BLOQUES = { n: 10, tile: 4, y: 30, lobby: [0, 30, -40] };

/** Centro de la baldosa i. */
export function tileCenter(i) {
  const { n, tile } = BLOQUES;
  return [((i % n) - (n - 1) / 2) * tile, Math.floor(i / n) * tile - ((n - 1) / 2) * tile];
}
export function tileAt(x, z) {
  const { n, tile } = BLOQUES;
  const i = Math.floor(x / tile + n / 2), j = Math.floor(z / tile + n / 2);
  return i < 0 || j < 0 || i >= n || j >= n ? -1 : j * n + i;
}

export function buildBloques() {
  const g = new WorldGen('bq');
  const { n, tile, y } = BLOQUES;
  for (let i = 0; i < n * n; i++) {
    const [x, z] = tileCenter(i);
    g.block([x, y - 0.4, z], [tile - 0.08, 0.8, tile - 0.08], '#ffffff', 'plastic', { id: `tile${i}`, sep: true, hide: true });
  }
  // Grada de espera conectada con la pista por un puente
  const [lx, ly, lz] = BLOQUES.lobby;
  g.block([lx, ly - 0.5, lz], [24, 1, 14], '#37474f', 'metal');
  for (const s of [-1, 1]) g.block([lx + s * 12, ly + 0.6, lz], [0.4, 1.2, 14], '#90caf9', 'glass');
  g.block([lx, ly + 0.6, lz - 7], [24, 1.2, 0.4], '#90caf9', 'glass');
  g.add('sign', [lx, ly + 3.2, lz - 6.8], [12, 2.2, 0.2], '#212121', 'metal', { text: 'BLOQUES LOCOS' });
  // Barandillas decorativas de neón alrededor de la pista (sin colisión)
  const half = (n * tile) / 2;
  for (const s of [-1, 1]) {
    g.block([0, y - 0.9, s * (half + 0.6)], [n * tile + 2, 0.2, 0.3], '#00e5ff', 'neon', { nc: true });
    g.block([s * (half + 0.6), y - 0.9, 0], [0.3, 0.2, n * tile + 2], '#00e5ff', 'neon', { nc: true });
  }
  // Gradas con público a los lados de la pista (decoración sin colisión)
  const crowd = ['#f44336', '#2196f3', '#4caf50', '#ffeb3b', '#9c27b0', '#ff9800', '#ffffff'];
  for (const s of [-1, 1]) {
    for (let r = 0; r < 4; r++) {
      g.block([s * (half + 6 + r * 2.5), y - 2 + r * 1.6, 0], [2.4, 1.2, n * tile], '#37474f', 'metal', { nc: true });
      for (let k = 0; k < 14; k++) {
        if ((k + r) % 4 === 0) continue;
        g.block([s * (half + 6 + r * 2.5), y - 0.9 + r * 1.6, -half + 1.5 + k * 2.8], [0.7, 1, 0.7], crowd[(k + r * 3) % crowd.length], 'plastic', { nc: true });
      }
    }
  }
  // Globos flotando y focos de colores
  for (let i = 0; i < 16; i++) {
    const a = (i / 16) * Math.PI * 2, d = 34 + (i % 3) * 6;
    const bx = Math.cos(a) * d, bz = Math.sin(a) * d, by = y + 8 + (i % 4) * 3;
    g.add('sphere', [bx, by, bz], [1.6, 2, 1.6], crowd[i % crowd.length], 'plastic', { nc: true });
    g.block([bx, by - 2.2, bz], [0.05, 2.4, 0.05], '#eeeeee', 'plastic', { nc: true });
  }
  for (const [x, z, c] of [[-half - 2, -half - 2, '#ff4081'], [half + 2, -half - 2, '#00e5ff'], [-half - 2, half + 2, '#76ff03'], [half + 2, half + 2, '#ffea00']]) {
    g.block([x, y + 4, z], [0.6, 10, 0.6], '#263238', 'metal', { nc: true });
    g.add('light', [x, y + 9.4, z], [0.8, 0.8, 0.8], c, 'neon', { intensity: 2, range: 26 });
  }
  // Marcador gigante sobre la grada de espera
  g.block([lx, ly + 7.5, lz - 7.4], [16, 5, 0.4], '#111111', 'metal', { nc: true });
  g.add('sign', [lx, ly + 7.5, lz - 7.1], [15, 4.2, 0.1], '#1a237e', 'neon', { text: '¡EL ÚLTIMO EN PIE GANA!' });

  for (let i = 0; i < 30; i++) {
    const a = (i / 30) * Math.PI * 2;
    g.add('sphere', [Math.cos(a) * 90, y - 30 + (i % 5) * 12, Math.sin(a) * 90], [10, 4, 8], '#ffffff', 'plastic', { nc: true });
  }
  return {
    version: 1,
    terrain: null,
    water: null,
    sky: { time: 0.38, dayNight: false, fog: true },
    bounds: { min: [-150, -10, -150], max: [150, 120, 150] },
    spawns: [[lx - 4, ly + 0.2, lz], [lx, ly + 0.2, lz], [lx + 4, ly + 0.2, lz]],
    objects: g.objects,
    vehicles: [],
    meta: { mode: 'bloques' },
  };
}
