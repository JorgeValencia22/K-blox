// Pinta y Escóndete: escondite en el que los que se esconden pintan su cuerpo para
// camuflarse con el escenario. Hay varios mapas en el mismo mundo, separados entre sí;
// cada ronda el servidor elige uno y lleva a todos allí.
// Cada mapa guarda: centro, jaula de los buscadores, sitios para esconderse (con el
// color de la superficie, para los bots) y rutas de patrulla.
import { WorldGen } from './builder.js';
import { mulberry32 } from '../terrain.js';

export const CAMALEON = { hideSeconds: 45, seekSeconds: 120, resultSeconds: 8, lobbySeconds: 8 };
export const PARTS = ['head', 'body', 'arms', 'legs'];
export const PALETTE = [
  '#ffffff', '#e0e0e0', '#9e9e9e', '#616161', '#212121', '#000000',
  '#ffcdd2', '#ef5350', '#c62828', '#ffe0b2', '#ff9800', '#e65100',
  '#fff9c4', '#ffeb3b', '#f9a825', '#c8e6c9', '#66bb6a', '#2e7d32',
  '#b3e5fc', '#29b6f6', '#1565c0', '#e1bee7', '#ab47bc', '#6a1b9a',
  '#d7ccc8', '#a1887f', '#5d4037', '#f8bbd0', '#ec407a', '#00bfa5',
];

export function buildCamaleon() {
  const g = new WorldGen('cm');
  const maps = [];

  /** Crea un mapa centrado en (ox, 0, oz). Devuelve helpers para añadir objetos. */
  const makeMap = (id, name, ox, floor, wall, size = 46) => {
    const m = { id, name, center: [ox, 0, 0], spots: [], patrol: [], cage: null, size };
    const H = 9;
    g.block([ox, -0.25, 0], [size, 0.5, size], floor, 'plastic', { cm: id });
    for (const [x, z, sx, sz] of [[0, -size / 2, size, 0.6], [0, size / 2, size, 0.6], [-size / 2, 0, 0.6, size], [size / 2, 0, 0.6, size]]) {
      g.block([ox + x, H / 2, z], [sx, H, sz], wall, 'plastic', { cm: id });
    }
    // Jaula de los buscadores (habitación cerrada fuera del mapa)
    const cx = ox, cz = size / 2 + 10;
    g.block([cx, -0.25, cz], [8, 0.5, 8], '#212121', 'metal');
    for (const [x, z, sx, sz] of [[0, -4, 8, 0.4], [0, 4, 8, 0.4], [-4, 0, 0.4, 8], [4, 0, 0.4, 8]]) g.block([cx + x, 2, cz + z], [sx, 4, sz], '#37474f', 'metal');
    g.block([cx, 4.2, cz], [8.4, 0.4, 8.4], '#263238', 'metal');
    g.add('light', [cx, 3.6, cz], [0.4, 0.4, 0.4], '#ff5252', 'neon', { intensity: 1.2, range: 8 });
    m.cage = [cx, 0.2, cz];
    m.release = [ox, 0.2, size / 2 - 4];
    m.wallColor = wall;
    m.floorColor = floor;
    // Sitios en el suelo (tumbado) repartidos por el mapa, y junto a las paredes
    const rnd = mulberry32(id.length * 991);
    for (let i = 0; i < 6; i++) m.spots.push({ p: [ox + (rnd() - 0.5) * (size - 10), 0.2, (rnd() - 0.5) * (size - 10)], c: floor, pose: 'tumbado' });
    for (let i = 0; i < 4; i++) {
      const a = (i / 4) * Math.PI * 2;
      m.spots.push({ p: [ox + Math.cos(a) * (size / 2 - 1), 0.2, Math.sin(a) * (size / 2 - 1)], c: wall, pose: 'normal' });
    }
    for (let i = 0; i < 8; i++) {
      const a = (i / 8) * Math.PI * 2;
      m.patrol.push([ox + Math.cos(a) * size * 0.3, 0, Math.sin(a) * size * 0.3]);
    }
    maps.push(m);
    return {
      m,
      /** Bloque decorativo con sitio para esconderse pegado a él (del color del bloque). */
      prop(x, y, z, sx, sy, sz, c, mat = 'plastic', extra = {}) {
        g.block([ox + x, y, z], [sx, sy, sz], c, mat, { cm: id, ...extra });
        if (sy >= 1.2) m.spots.push({ p: [ox + x + (sx / 2 + 0.6) * (x > 0 ? -1 : 1), 0.2, z], c, pose: sy > 2.2 ? 'normal' : 'agachado' });
        else if (sx > 2.5 && sz > 2.5) m.spots.push({ p: [ox + x, y + sy / 2 + 0.2, z], c, pose: 'tumbado' });
      },
      raw: (t, p, s, c, mat = 'plastic', extra = {}) => g.add(t, [ox + p[0], p[1], p[2]], s, c, mat, { cm: id, ...extra }),
    };
  };

  // 1) Juguetería: bloques de construcción gigantes, alfombra de colores y pelotas
  {
    const { prop, raw, m } = makeMap('jugueteria', 'Juguetería', 0, '#ffe0b2', '#b3e5fc');
    const C = ['#ef5350', '#29b6f6', '#ffeb3b', '#66bb6a', '#ab47bc', '#ff9800'];
    for (let i = 0; i < 6; i++) for (let j = 0; j < 6; j++) raw('block', [-9 + i * 3.6, 0.02, -9 + j * 3.6], [3.6, 0.04, 3.6], C[(i + j) % 6], 'plastic', { nc: true });
    m.spots.push({ p: [-6, 0.2, -6], c: C[0], pose: 'tumbado' }, { p: [6, 0.2, 6], c: C[4], pose: 'tumbado' });
    prop(-15, 1.5, -14, 4, 3, 4, '#ef5350'); prop(-15, 4.5, -14, 3, 3, 3, '#ffeb3b');
    prop(15, 1, -15, 6, 2, 3, '#29b6f6'); prop(15, 3, -15, 3, 2, 3, '#66bb6a');
    prop(-16, 2.5, 12, 3, 5, 3, '#ab47bc'); prop(14, 1.5, 14, 5, 3, 5, '#ff9800');
    prop(0, 1, -19, 10, 2, 3, '#66bb6a');
    raw('sphere', [-6, 1.5, 15], [3, 3, 3], '#ef5350'); m.spots.push({ p: [-4, 0.2, 15], c: '#ef5350', pose: 'agachado' });
    raw('sphere', [8, 1.2, 4], [2.4, 2.4, 2.4], '#29b6f6'); m.spots.push({ p: [9.6, 0.2, 4], c: '#29b6f6', pose: 'agachado' });
    raw('cylinder', [20, 3, 0], [3, 6, 3], '#ffeb3b'); m.spots.push({ p: [18.4, 0.2, 0], c: '#ffeb3b', pose: 'normal' });
    raw('sign', [0, 6, -22.6], [10, 2, 0.2], '#ffffff', 'wood', { text: 'JUGUETERÍA' });
  }
  // 2) Jardín: setos, flores, valla blanca, estanque y cobertizo
  {
    const { prop, raw, m } = makeMap('jardin', 'Jardín', 120, '#7cb342', '#a5d6a7');
    for (let i = 0; i < 5; i++) prop(-16 + i * 8, 1.2, -16, 6, 2.4, 2, '#2e7d32', 'grass');
    for (let i = 0; i < 4; i++) prop(-18, 1.2, -6 + i * 7, 2, 2.4, 5, '#388e3c', 'grass');
    raw('cylinder', [6, 0.05, 6], [12, 0.1, 9], '#4fc3f7', 'glass', { nc: true }); m.spots.push({ p: [126, 0.2, 6], c: '#4fc3f7', pose: 'tumbado' });
    for (let i = 0; i < 12; i++) raw('deco', [12 + (i % 4) * 2, 0.4, -6 + Math.floor(i / 4) * 2], [0.8, 0.8, 0.8], ['#ec407a', '#ffeb3b', '#ab47bc'][i % 3], 'plastic', { kind: 'flower' });
    m.spots.push({ p: [135, 0.2, -4], c: '#ec407a', pose: 'tumbado' });
    for (let i = 0; i < 8; i++) prop(22, 0.7, -18 + i * 5, 0.4, 1.4, 4, '#fafafa', 'wood');
    prop(14, 2, 16, 6, 4, 5, '#8d6e63', 'wood'); prop(14, 4.3, 16, 6.6, 0.6, 5.6, '#5d4037', 'wood');
    raw('tree', [-8, 3.5, 14], [4, 7, 4], '#43a047', 'grass'); m.spots.push({ p: [112, 0.2, 14], c: '#5d4037', pose: 'normal' });
    raw('sign', [0, 6, -22.6], [10, 2, 0.2], '#fff8e1', 'wood', { text: 'JARDÍN' });
  }
  // 3) Cocina gigante: suelo de cuadros, encimeras, nevera, frutas enormes
  {
    const { prop, raw, m } = makeMap('cocina', 'Cocina', 240, '#eceff1', '#fff3e0');
    for (let i = 0; i < 9; i++) for (let j = 0; j < 9; j++) if ((i + j) % 2) raw('block', [-20 + i * 5, 0.02, -20 + j * 5], [5, 0.04, 5], '#263238', 'plastic', { nc: true });
    m.spots.push({ p: [235, 0.2, -5], c: '#263238', pose: 'tumbado' }, { p: [245, 0.2, 5], c: '#263238', pose: 'tumbado' });
    prop(-12, 1.5, -19, 20, 3, 4, '#8d6e63', 'wood'); prop(-12, 3.15, -19, 20.4, 0.3, 4.4, '#bdbdbd', 'stone');
    prop(17, 3.5, -18, 5, 7, 4, '#eceff1', 'metal');
    prop(-19, 1.5, 6, 4, 3, 14, '#a1887f', 'wood');
    prop(4, 1.4, 4, 9, 0.4, 6, '#795548', 'wood');
    for (const [x, z] of [[0.5, 1.5], [7.5, 1.5], [0.5, 6.5], [7.5, 6.5]]) raw('block', [x, 0.6, z], [0.5, 1.2, 0.5], '#5d4037', 'wood');
    raw('sphere', [16, 1.6, 10], [3.2, 3.2, 3.2], '#e53935'); m.spots.push({ p: [17.8 + 240, 0.2, 10], c: '#e53935', pose: 'agachado' });
    raw('sphere', [10, 1.4, 16], [2.8, 2.8, 2.8], '#ff9800'); m.spots.push({ p: [251.6, 0.2, 16], c: '#ff9800', pose: 'agachado' });
    raw('cylinder', [-6, 2, 16], [4, 4, 4], '#ffeb3b'); m.spots.push({ p: [231.8, 0.2, 16], c: '#ffeb3b', pose: 'normal' });
    raw('sign', [0, 6.5, -22.6], [10, 2, 0.2], '#ffffff', 'wood', { text: 'COCINA' });
  }
  // 4) Museo de arte: paredes blancas, cuadros de colores, pedestales y franjas
  {
    const { prop, raw, m } = makeMap('museo', 'Museo', 360, '#d7ccc8', '#fafafa', 50);
    const art = ['#ef5350', '#1e88e5', '#fdd835', '#43a047', '#8e24aa', '#ff7043', '#00acc1', '#212121'];
    art.forEach((c, i) => {
      const side = i < 4 ? -1 : 1;
      const z = -15 + (i % 4) * 10;
      raw('block', [side * 24.6, 3.5, z], [0.2, 4, 6], c, 'plastic');
      m.spots.push({ p: [360 + side * 23.6, 0.2, z], c, pose: 'normal' });
    });
    for (let i = 0; i < 3; i++) prop(-8 + i * 8, 1, 0, 2.5, 2, 2.5, '#eceff1', 'stone');
    raw('sphere', [-8, 2.8, 0], [1.6, 1.6, 1.6], '#ffd54f', 'metal');
    raw('block', [0, 0.02, 14], [40, 0.04, 4], '#e53935', 'plastic', { nc: true }); m.spots.push({ p: [355, 0.2, 14], c: '#e53935', pose: 'tumbado' });
    raw('block', [0, 0.02, -14], [40, 0.04, 4], '#1e88e5', 'plastic', { nc: true }); m.spots.push({ p: [365, 0.2, -14], c: '#1e88e5', pose: 'tumbado' });
    prop(0, 2, -22, 14, 4, 2, '#212121', 'stone');
    for (const x of [-16, 16]) { raw('cylinder', [x, 4.5, -20], [2, 9, 2], '#eceff1', 'stone'); m.spots.push({ p: [360 + x + 1.4, 0.2, -20], c: '#eceff1', pose: 'normal' }); }
    raw('sign', [0, 7, -24.6], [12, 2, 0.2], '#fafafa', 'wood', { text: 'MUSEO' });
  }

  // Sala de espera común (entre rondas)
  g.block([0, -0.25, -80], [20, 0.5, 20], '#cfd8dc', 'stone');
  for (const [x, z, sx, sz] of [[0, -90, 20, 0.4], [0, -70, 20, 0.4], [-10, -80, 0.4, 20], [10, -80, 0.4, 20]]) g.block([x, 1, z], [sx, 2, sz], '#90a4ae', 'glass');
  g.add('sign', [0, 3.5, -89.6], [10, 2.2, 0.2], '#7c4dff', 'neon', { text: 'PINTA Y ESCÓNDETE' });
  for (let i = 0; i < 6; i++) g.block([-8 + i * 3.2, 0.02, -74], [3, 0.04, 3], PALETTE[i * 5 + 1], 'neon', { nc: true, dance: true });

  return {
    version: 1,
    terrain: { type: 'flat', size: 900, height: -0.6, color: '#37474f' },
    water: null,
    sky: { time: 0.38, dayNight: false, fog: true },
    bounds: { min: [-120, -20, -160], max: [500, 60, 120] },
    spawns: [[-3, 0.2, -80], [3, 0.2, -80], [0, 0.2, -77], [0, 0.2, -83]],
    objects: g.objects,
    vehicles: [],
    meta: { mode: 'camaleon', maps, lobby: [0, 0.2, -80] },
  };
}
