// Fábrica Feliz: terror de puzles en una fábrica de juguetes abandonada.
// Cada jugador lleva una mochila con dos manos extensibles (azul y roja) para
// agarrar cosas a distancia: escáneres, palancas, enchufes, engranajes…
// Al final despierta Tito Larguirucho y empieza la persecución hasta la salida.
// Lo comparten servidor (reglas) y cliente (dibujo).
import { WorldGen } from './builder.js';

export const POPPY = {
  handRange: 13, // alcance de las manos (m)
  chargeMs: 7000, // la mano roja conserva la electricidad 7 s
  dualMs: 3500, // margen para activar los dos mandos de la sala de juegos
  monsterSpeed: 9.6,
  catchDist: 1.7,
  chaseStartZ: 85,
  chaseRespawn: [0, 0.2, 100],
  monsterHome: [0, 0.5, 92],
  exitZ: 160,
};

/** Puertas en orden; cada una se abre con un puzle. */
export const DOORS = [
  { id: 'pdoorA', z: 16, name: 'Puerta de la entrada', hint: 'Usa la MANO AZUL en el escáner junto a la puerta' },
  { id: 'pdoorB', z: 36, name: 'Puerta del almacén', hint: 'Carga la MANO ROJA en el generador y dispárala al receptor de la puerta antes de 7 s' },
  { id: 'pdoorC', z: 60, name: 'Puerta de montaje', hint: 'Encuentra los 3 engranajes (uno está en lo alto y otro tras la valla: ¡agárralos con las manos!) y ponlos en la máquina' },
  { id: 'pdoorD', z: 80, name: 'Puerta de la sala de juegos', hint: 'Activa el escáner azul y la palanca roja casi a la vez' },
];

// Cosas que se pueden agarrar con las manos
export const GRABS = [
  { id: 'scanA', kind: 'scanner', hand: 'blue', p: [3.2, 2.2, 15.7], door: 0 },
  { id: 'plug', kind: 'plug', hand: 'red', p: [-11.7, 1.8, 26] },
  { id: 'recv', kind: 'receiver', hand: 'red', p: [9.6, 3.6, 35.7], door: 1 },
  { id: 'gear1', kind: 'gear', hand: 'any', p: [-10, 0.6, 44] },
  { id: 'gear2', kind: 'gear', hand: 'any', p: [12.3, 5.4, 49] },
  { id: 'gear3', kind: 'gear', hand: 'any', p: [-8, 0.6, 56] },
  { id: 'scanB', kind: 'scanner', hand: 'blue', p: [-8, 2.2, 79.7], door: 3, dual: true },
  { id: 'lever', kind: 'lever', hand: 'red', p: [8, 4.6, 79.7], door: 3, dual: true },
  { id: 'final', kind: 'switch', hand: 'red', p: [0, 4.4, 171.6] },
];
export const GRAB_BY_ID = Object.fromEntries(GRABS.map((g) => [g.id, g]));
export const MACHINE = [7, 1.2, 58.3];

// Cintas VHS escondidas (historia de la fábrica)
export const TAPES = [
  { id: 't1', p: [-7, 0.45, 3], title: 'Cinta 1 · Bienvenida', text: '«¡Bienvenidos a Fábrica Feliz, donde cada juguete tiene un corazón!» La voz del anuncio suena alegre… demasiado alegre.' },
  { id: 't2', p: [11, 2.65, 19], title: 'Cinta 2 · El proyecto T-1', text: '«Prueba 14: el sujeto T-1 ya no cabe en su vitrina. Sus brazos siguen creciendo. Se ríe cuando apagamos las luces.»' },
  { id: 't3', p: [12.5, 0.45, 38.5], title: 'Cinta 3 · La noche del cierre', text: '«Nadie volvió a ver al turno de noche. Las máquinas siguieron funcionando solas toda la semana.»' },
  { id: 't4', p: [-12.5, 0.45, 63], title: 'Cinta 4 · Tito', text: '«Si oyes una risa larga y hueca… no mires arriba. Corre hacia la salida y no te pares.»' },
];

export const POPPY_AREAS = [
  { name: 'Entrada', z0: 0, z1: 16 },
  { name: 'Almacén', z0: 16, z1: 36 },
  { name: 'Sala de montaje', z0: 36, z1: 60 },
  { name: 'Sala de juegos', z0: 60, z1: 80 },
  { name: 'Vitrina de Tito', z0: 80, z1: 96 },
  { name: 'Pasillo de huida', z0: 96, z1: 160 },
  { name: 'Salida', z0: 160, z1: 176 },
];

export function buildPoppy() {
  const g = new WorldGen('pp');
  const H = 6.5, T = 0.5;
  const W1 = '#3d4a5c', W2 = '#4a3d5c', TR = '#ffca28';
  const wallX = (x0, x1, z, c = W1, h = H) => g.block([(x0 + x1) / 2, h / 2, z], [x1 - x0 + T, h, T], c, 'brick');
  const wallZ = (z0, z1, x, c = W1, h = H) => g.block([x, h / 2, (z0 + z1) / 2], [T, h, z1 - z0 + T], c, 'brick');
  const deco = (p, s, c, m = 'plastic', extra = {}) => g.block(p, s, c, m, { nc: true, ...extra });
  /** Sala rectangular con huecos de puerta (ancho 4) en z0 y z1 centrados en x = 0. */
  const room = (x, z0, z1, c, doorIn = true, doorOut = true) => {
    wallZ(z0, z1, -x, c); wallZ(z0, z1, x, c);
    for (const [z, open] of [[z0, doorIn], [z1, doorOut]]) {
      if (!open) { wallX(-x, x, z, c); continue; }
      wallX(-x, -2, z, c); wallX(2, x, z, c);
      g.block([0, H - 1, z], [4, 2, T], c, 'brick');
    }
    g.block([0, H + 0.25, (z0 + z1) / 2], [2 * x + 1, 0.5, z1 - z0 + 1], '#22262e', 'metal'); // techo
    g.block([0, 0.05, (z0 + z1) / 2], [2 * x, 0.1, z1 - z0], '#5d5d66', 'stone', { nc: true });
  };

  // Suelo general
  g.block([0, -0.05, 88], [40, 0.1, 190], '#2a2a30', 'stone');

  // --- Entrada (z 0..16) ---------------------------------------------------------
  room(8, 0, 16, W1, false, true);
  g.add('sign', [0, 4.6, 0.3], [7, 1.4, 0.1], '#ff4081', 'wood', { text: '¡FÁBRICA FELIZ!' });
  deco([0, 0.12, 8], [6, 0.04, 10], '#7b1fa2'); // alfombra
  g.block([-5.5, 1, 6], [3, 2, 1.2], '#8d6e63', 'wood'); // mostrador
  for (let i = 0; i < 5; i++) g.add('deco', [-6.6 + (i % 2) * 1.1, 0.5 + Math.floor(i / 2) * 1, 2.5], [1, 1, 1], '#a1887f', 'wood', { kind: 'crate' });
  for (let i = 0; i < 4; i++) deco([7.7, 2.5, 3 + i * 3.2], [0.1, 1.8, 1.4], ['#ef5350', '#42a5f5', '#66bb6a', '#ffca28'][i]); // carteles
  g.add('sign', [7.7, 4.4, 8], [0.1, 0.9, 5], '#ffffff', 'wood', { text: 'EMPLEADO DEL MES: TITO' });
  for (const s of [-1, 1]) g.add('cylinder', [s * 5.5, 0.9, 13], [0.8, 1.8, 0.8], '#c62828', 'plastic');

  // --- Almacén (z 16..36) -------------------------------------------------------------
  room(12, 16, 36, W2);
  for (const [x, z, h] of [[-8, 19, 2], [-8, 21.5, 1], [9, 19, 2.2], [11, 23, 1.2], [-6, 31, 1.6], [6, 30, 2.4], [8, 27, 1]]) {
    g.add('deco', [x, h / 2, z], [2, h, 2], '#8d6e63', 'wood', { kind: 'crate' });
  }
  deco([11, 2.3, 19], [2, 0.1, 2], '#6d4c41', 'wood'); // repisa de la cinta 2
  g.block([11, 1.1, 19], [2, 2.2, 2], '#795548', 'wood');
  // Generador con enchufe (mano roja)
  g.block([-11.4, 1.3, 26], [0.8, 2.6, 2.4], '#455a64', 'metal');
  deco([-10.95, 1.8, 26], [0.1, 0.5, 0.5], '#ff1744', 'neon');
  g.add('sign', [-11.6, 3.4, 26], [0.1, 0.7, 2.4], '#ffeb3b', 'wood', { text: '⚡ PELIGRO' });
  // Cables por el suelo hasta la puerta
  deco([0, 0.12, 30], [22, 0.06, 0.2], '#212121');
  deco([10.5, 1.9, 35.5], [0.2, 3.6, 0.2], '#212121');
  g.add('sign', [0, 5.2, 35.6], [5, 0.8, 0.1], '#ffeb3b', 'wood', { text: 'SOLO PERSONAL' });

  // --- Sala de montaje (z 36..60) ------------------------------------------------------
  room(14, 36, 60, W1);
  for (const [z, c] of [[41, '#37474f'], [47, '#263238'], [53, '#37474f']]) {
    g.block([2, 0.6, z], [18, 1.2, 2.2], c, 'metal'); // cintas transportadoras
    for (let i = 0; i < 5; i++) g.add('deco', [-4 + i * 3.4, 1.55, z], [0.7, 0.7, 0.7], ['#e91e63', '#29b6f6', '#ffca28', '#66bb6a', '#ab47bc'][i], 'plastic', { kind: 'crate', nc: true });
  }
  // Estantería alta con el engranaje 2
  g.block([12.4, 2.5, 49], [2, 5, 4], '#5d4037', 'wood');
  // Zona vallada con el engranaje 3 (no se puede entrar: hay que agarrarlo)
  for (const [x, z, sx, sz] of [[-8, 54, 6, 0.2], [-8, 58, 6, 0.2], [-11, 56, 0.2, 4], [-5, 56, 0.2, 4]]) g.block([x, 1.6, z], [sx, 3.2, sz], '#9e9e9e', 'metal');
  g.add('sign', [-8, 3.6, 53.9], [3, 0.7, 0.1], '#ff7043', 'wood', { text: 'NO PASAR' });
  // Máquina de engranajes
  g.block([7, 1, 58.9], [4, 2, 1.6], '#607d8b', 'metal');
  for (let i = 0; i < 3; i++) deco([5.8 + i * 1.2, 1.6, 58.05], [0.7, 0.7, 0.1], '#263238', 'metal');
  g.add('sign', [7, 3, 59.6], [4, 0.8, 0.1], '#ffffff', 'wood', { text: 'MONTAJE 3/3' });

  // --- Sala de juegos (z 60..80) -------------------------------------------------------
  room(14, 60, 80, '#5c3d4a');
  for (let i = 0; i < 9; i++) g.add('sphere', [-10 + (i % 3) * 3, 0.6, 64 + Math.floor(i / 3) * 2.2], [1.2, 1.2, 1.2], ['#e53935', '#1e88e5', '#fdd835'][i % 3], 'plastic', { nc: true });
  g.block([9, 1, 66], [5, 2, 4], '#ffb300', 'plastic'); // bloques gigantes
  g.block([9.5, 3, 66.5], [2.5, 2, 2.5], '#43a047', 'plastic');
  g.block([-9, 0.75, 73], [4, 1.5, 4], '#8e24aa', 'plastic');
  g.add('wedge', [3, 0.9, 73], [3, 1.8, 4], '#26c6da', 'plastic');
  deco([-8, 3.3, 79.6], [1.4, 0.3, 0.1], '#2196f3', 'neon');
  deco([8, 5.6, 79.6], [1.4, 0.3, 0.1], '#f44336', 'neon');
  g.block([8, 4.6, 79.5], [0.4, 1.4, 0.4], '#b71c1c', 'metal'); // palanca alta
  g.add('sign', [0, 4.6, 79.6], [6, 1, 0.1], '#ffffff', 'wood', { text: '¡AZUL Y ROJO A LA VEZ!' });

  // --- Vitrina de Tito (z 80..96) ------------------------------------------------------
  room(10, 80, 96, '#2b2133');
  g.block([0, 0.25, 92], [6, 0.5, 4], '#4a148c', 'wood'); // pedestal
  deco([0, 3.5, 90], [6, 6, 0.1], '#b3e5fc', 'glass', { id: 'case', sep: true }); // cristal
  g.add('sign', [0, 5.6, 89.9], [5, 0.8, 0.1], '#ffeb3b', 'wood', { text: 'TITO LARGUIRUCHO' });

  // --- Pasillo de huida (z 96..160) -----------------------------------------------------
  wallZ(96, 160, -3.5, '#33282f'); wallZ(96, 160, 3.5, '#33282f');
  g.block([0, H + 0.25, 128], [8, 0.5, 65], '#1c1a1f', 'metal');
  g.block([0, 0.05, 128], [7, 0.1, 64], '#4a3b40', 'stone', { nc: true });
  for (const [x, z] of [[-1.5, 110], [1.5, 120], [-1.5, 130], [1.5, 140]]) g.block([x, 1.6, z], [4, 3.2, 0.6], '#6d4c41', 'wood'); // obstáculos en zigzag
  g.block([0, 0.35, 150], [7, 0.7, 0.6], '#795548', 'wood'); // para saltar
  for (let z = 100; z < 160; z += 6) deco([3.2, 2.4, z], [0.1, 0.8, 1.2], z % 12 ? '#ff4081' : '#ffeb3b');

  // --- Salida (z 160..176) -----------------------------------------------------------
  room(8, 160, 176, '#2e3b2e', true, false);
  g.block([0, 4.4, 171.8], [1.6, 1.2, 0.4], '#c62828', 'metal'); // interruptor rojo
  deco([0, 5.6, 171.6], [2, 0.3, 0.1], '#f44336', 'neon');
  g.add('sign', [0, 2.6, 175.6], [6, 1, 0.1], '#66bb6a', 'wood', { text: 'SALIDA' });
  g.add('deco', [0, 5.4, 165], [2.6, 2.6, 2.6], '#8d6e63', 'wood', { kind: 'crate', id: 'crate', nc: true, sep: true }); // caja colgada (cae sobre Tito)
  deco([0, 6.3, 165], [0.1, 0.6, 0.1], '#212121'); // cuerda

  // ======================= Detalle (decoración sin colisión) =======================
  const sph = (p, size, c, m = 'plastic') => g.add('sphere', p, size, c, m, { nc: true });
  const cyl = (p, size, c, m = 'plastic') => g.add('cylinder', p, size, c, m, { nc: true });
  /** Peluche gigante sentado (estatua). */
  const teddy = (x, z, c, scale = 1) => {
    sph([x, 1.1 * scale, z], [2 * scale, 2.1 * scale, 1.8 * scale], c);
    sph([x, 2.6 * scale, z], [1.5 * scale, 1.4 * scale, 1.4 * scale], c);
    for (const sx of [-1, 1]) {
      sph([x + sx * 0.6 * scale, 3.25 * scale, z], [0.55 * scale, 0.55 * scale, 0.35 * scale], c);
      sph([x + sx * 1.05 * scale, 1.2 * scale, z + 0.2], [0.6 * scale, 1.2 * scale, 0.6 * scale], c);
      sph([x + sx * 0.5 * scale, 0.35 * scale, z + 0.7 * scale], [0.7 * scale, 0.6 * scale, 1 * scale], c);
      sph([x + sx * 0.28 * scale, 2.75 * scale, z + 0.62 * scale], [0.16 * scale, 0.2 * scale, 0.1 * scale], '#111111');
    }
    sph([x, 2.45 * scale, z + 0.62 * scale], [0.5 * scale, 0.32 * scale, 0.25 * scale], '#f5e6d3');
    deco([x, 2.32 * scale, z + 0.74 * scale], [0.36 * scale, 0.05, 0.05], '#3e2723');
  };
  const pipe = (x, y, z0, z1, c = '#546e7a') => deco([x, y, (z0 + z1) / 2], [0.35, 0.35, z1 - z0], c, 'metal');
  const shelf = (x, z, len, hgt, c = '#5d4037') => {
    for (let k = 0; k < 3; k++) deco([x, 0.6 + k * 1.4, z], [1.4, 0.12, len], c, 'wood');
    for (const dz of [-len / 2, len / 2]) deco([x, hgt / 2, z + dz], [1.4, hgt, 0.15], c, 'wood');
    for (let k = 0; k < 3; k++) for (let i = 0; i < Math.floor(len / 1.1); i++) {
      deco([x, 0.95 + k * 1.4, z - len / 2 + 0.6 + i * 1.1], [0.9, 0.6, 0.8], ['#a1887f', '#8d6e63', '#bcaaa4'][(i + k) % 3], 'wood');
    }
  };
  // Tuberías y lámparas colgantes en todo el recorrido
  for (const [z0, z1, x] of [[0, 16, -7], [16, 36, -11], [16, 36, 11], [36, 60, 13], [60, 80, -13], [80, 96, 9]]) pipe(x, H - 0.5, z0 + 0.4, z1 - 0.4);
  for (const z of [6, 22, 30, 44, 54, 68, 74, 88]) { deco([0, H - 0.6, z], [0.06, 1, 0.06], '#212121'); cyl([0, H - 1.15, z], [0.9, 0.3, 0.9], '#37474f', 'metal'); }

  // Entrada: recepción, sala de espera y la mascota gigante
  deco([-5.5, 2.25, 6], [0.9, 0.6, 0.1], '#263238', 'metal'); // ordenador
  deco([-5.5, 2.25, 6.06], [0.75, 0.45, 0.02], '#0d47a1', 'neon');
  deco([-4.4, 2.1, 6.2], [0.3, 0.2, 0.3], '#ffeb3b'); // timbre
  for (let i = 0; i < 4; i++) { deco([6.2, 0.5, 2.2 + i * 1.1], [0.9, 0.1, 0.9], '#c62828'); deco([6.6, 0.9, 2.2 + i * 1.1], [0.1, 0.8, 0.9], '#c62828'); for (const dx of [-0.35, 0.35]) deco([6.2 + dx, 0.25, 2.2 + i * 1.1], [0.06, 0.5, 0.06], '#9e9e9e', 'metal'); }
  teddy(-5.6, 12.5, '#ec407a', 1);
  g.add('sign', [-5.6, 0.35, 14.1], [2.6, 0.5, 0.1], '#ffeb3b', 'wood', { text: 'PELUCHÍN' });
  for (let i = 0; i < 7; i++) deco([-6 + i * 2, H - 0.35, 1.5 + (i % 2) * 0.4], [1, 0.5, 0.05], ['#ef5350', '#ffca28', '#42a5f5', '#66bb6a', '#ab47bc'][i % 5]);
  for (let z = 1; z < 16; z += 2) deco([0, 0.13, z], [1.2, 0.03, 0.9], '#ffca28'); // camino de baldosas
  deco([-7.7, 2.6, 10], [0.1, 1.6, 2.2], '#1b1b1b'); // tablón de anuncios
  for (let i = 0; i < 4; i++) deco([-7.62, 2.6 + (i % 2) * 0.5 - 0.25, 9.3 + i * 0.45], [0.02, 0.4, 0.35], ['#fff9c4', '#ffffff', '#ffe0b2', '#e1f5fe'][i]);

  // Almacén: estanterías, palés, carretilla y cadenas
  shelf(-11, 31.5, 6, 4.4);
  shelf(11, 31, 6, 4.4);
  for (const [x, z] of [[-3, 20], [3.5, 25], [-4.5, 33]]) { deco([x, 0.1, z], [1.6, 0.2, 1.2], '#a1887f', 'wood'); deco([x, 0.55, z], [1.3, 0.7, 1], '#8d6e63', 'wood'); }
  // Carretilla elevadora abandonada
  deco([4, 0.8, 21.5], [1.6, 1.2, 2.4], '#fbc02d', 'metal');
  deco([4, 2, 22], [1.4, 0.15, 1.6], '#212121', 'metal');
  for (const dx of [-0.6, 0.6]) { deco([4 + dx, 1.6, 20.2], [0.12, 3.2, 0.12], '#424242', 'metal'); cyl([4 + dx, 0.4, 22.6], [0.6, 0.6, 0.6], '#212121'); cyl([4 + dx, 0.4, 20.6], [0.6, 0.6, 0.6], '#212121'); }
  for (const dx of [-0.35, 0.35]) deco([4 + dx, 0.15, 19.3], [0.15, 0.08, 1.4], '#9e9e9e', 'metal');
  for (const [x, z, l] of [[-5, 27, 2.5], [-2, 32, 3.2], [6, 33.5, 1.8], [8, 17.5, 2.8]]) deco([x, H - l / 2, z], [0.08, l, 0.08], '#616161', 'metal');
  deco([-12.25, 4.6, 30], [0.1, 1.2, 1.6], '#263238', 'metal'); // rejilla de ventilación (susto)
  for (let i = 0; i < 4; i++) deco([-12.2, 4.6, 29.4 + i * 0.4], [0.06, 1, 0.08], '#90a4ae', 'metal');

  // Sala de montaje: brazos robóticos, cubos de ojos y cabezas de muñeco
  for (const [x, z] of [[11.5, 41], [-8, 47], [11.5, 53]]) {
    cyl([x, 0.4, z + 1.8], [0.9, 0.8, 0.9], '#ff6f00', 'metal');
    deco([x, 1.6, z + 1.8], [0.35, 1.8, 0.35], '#ff8f00', 'metal');
    deco([x - 0.8, 2.5, z + 1.4], [1.8, 0.3, 0.3], '#ff8f00', 'metal');
    deco([x - 1.7, 2.1, z + 1.2], [0.3, 0.8, 0.3], '#424242', 'metal');
  }
  for (let i = 0; i < 3; i++) {
    deco([-12.4, 0.5, 39 + i * 1.5], [1.2, 1, 1.2], '#455a64', 'metal');
    for (let k = 0; k < 4; k++) sph([-12.6 + (k % 2) * 0.4, 1.1, 38.8 + i * 1.5 + Math.floor(k / 2) * 0.4], [0.3, 0.3, 0.3], '#fafafa');
  }
  g.add('sign', [-13.7, 3.4, 44], [0.1, 0.9, 4], '#ffffff', 'wood', { text: 'CONTROL DE CALIDAD' });
  g.add('sign', [13.7, 3.4, 46], [0.1, 0.9, 4.4], '#ff8a80', 'wood', { text: '¡SONRÍE SIEMPRE!' });
  for (let i = 0; i < 6; i++) sph([-3 + i * 2, 1.75, 47 + (i % 2) * 0.3], [0.5, 0.55, 0.5], '#ffe0b2'); // cabezas de muñeco

  // Sala de juegos: piscina de bolas, tobogán, ceras gigantes y dibujos
  for (const [x, z, sx, sz] of [[-7.5, 62.6, 9, 0.3], [-7.5, 69.6, 9, 0.3], [-12, 66, 0.3, 7], [-3, 66, 0.3, 7]]) deco([x, 0.5, z], [sx, 1, sz], '#ffffff');
  for (let i = 0; i < 26; i++) sph([-11.5 + (i % 9) * 1, 0.35 + Math.floor(i / 9) * 0.2, 63.4 + (i * 1.37) % 6], [0.45, 0.45, 0.45], ['#e53935', '#1e88e5', '#fdd835', '#43a047'][i % 4]);
  g.block([12, 1.5, 74], [3, 3, 3], '#43a047', 'plastic'); // torre del tobogán
  g.add('wedge', [12, 1.5, 70.5], [2, 3, 4], '#ffeb3b', 'plastic');
  for (const [x, c] of [[-13.3, '#e53935'], [-13.3, '#1e88e5'], [-13.3, '#fdd835']].map((v, i) => [v[0], v[1], i])) cyl([x, 1.5, 72 + c * 1.1], [0.6, 3, 0.6], ['#e53935', '#1e88e5', '#fdd835'][c]);
  for (let i = 0; i < 8; i++) deco([13.75, 1.6 + (i % 2) * 1.2, 62 + i * 2], [0.04, 0.9, 1.2], ['#fff59d', '#b3e5fc', '#f8bbd0', '#c8e6c9'][i % 4]); // dibujos
  teddy(-11, 77, '#7e57c2', 0.7);
  for (let z = 61; z < 79; z += 1.5) deco([5, 0.12, z], [0.15, 0.04, 1.2], '#6d4c41'); // vía de tren

  // Vitrina: catenarias, focos y otras vitrinas rotas
  for (const [x, z] of [[-4, 86], [4, 86], [-4, 88], [4, 88]]) { cyl([x, 0.5, z], [0.15, 1, 0.15], '#ffd54f', 'metal'); }
  deco([-4, 0.95, 87], [0.05, 0.05, 2], '#b71c1c'); deco([4, 0.95, 87], [0.05, 0.05, 2], '#b71c1c');
  for (const x of [-8, 8]) {
    g.block([x, 0.5, 92], [2.4, 1, 2.4], '#311b92', 'wood');
    deco([x, 2, 92], [2.2, 2, 0.05], '#b3e5fc', 'glass');
    sph([x, 1.5, 92], [0.8, 1, 0.8], x < 0 ? '#ef9a9a' : '#80cbc4');
    g.add('sign', [x, 0.5, 90.75], [2, 0.5, 0.1], '#bdbdbd', 'wood', { text: x < 0 ? 'PROYECTO T-2' : 'PROYECTO T-3' });
  }
  g.add('light', [0, H - 0.4, 90], [0.4, 0.2, 0.4], '#e1bee7', 'neon', { intensity: 1.3, range: 10 });

  // Pasillo de huida: luces de alarma, escombros y franjas de peligro
  for (let z = 98; z < 160; z += 4) deco([0, 0.12, z], [6.8, 0.02, 0.4], z % 8 ? '#212121' : '#fdd835');
  for (const z of [106, 126, 146]) g.add('light', [0, H - 0.4, z], [0.4, 0.3, 0.4], '#ff1744', 'neon', { group: 'alarm', intensity: 1.4, range: 12 });
  for (const [x, z] of [[2.6, 104], [-2.6, 116], [2.6, 134], [-2.6, 147]]) { deco([x, 0.3, z], [0.8, 0.6, 1.4], '#6d4c41', 'wood'); sph([x, 0.75, z + 0.3], [0.5, 0.5, 0.5], '#ffe0b2'); }
  pipe(-3.1, 4.8, 97, 159); pipe(3.1, 5.3, 97, 159, '#78909c');

  // Salida: rejas y luz del exterior
  for (let i = 0; i < 7; i++) deco([-3 + i, 3, 175.7], [0.12, 6, 0.12], '#9e9e9e', 'metal');
  g.add('light', [0, 3, 174], [0.6, 0.6, 0.2], '#fff8e1', 'neon', { intensity: 2, range: 16 });
  g.add('sign', [-6, 3, 168], [0.1, 1, 3], '#c8e6c9', 'wood', { text: 'POR AQUÍ' });

  // Puertas de cada sala
  for (const d of DOORS) g.block([0, 2, d.z], [4, 4, 0.4], '#78909c', 'metal', { id: d.id, sep: true });

  // Luces (parpadean en el cliente)
  for (const z of [6, 14, 22, 30, 42, 52, 66, 74, 88, 104, 120, 136, 152, 168]) {
    g.add('light', [0, H - 0.3, z], [0.5, 0.2, 0.5], '#fff3c4', 'neon', { group: 'pplights', intensity: 1.1, range: 14 });
  }

  return {
    version: 1,
    terrain: { type: 'flat', size: 260, height: -0.2, color: '#101014' },
    water: null,
    sky: { time: 0.02, dayNight: false, fog: true },
    bounds: { min: [-60, -20, -40], max: [60, 40, 220] },
    spawns: [[-2, 0.2, 4], [2, 0.2, 4], [0, 0.2, 6], [-3, 0.2, 7], [3, 0.2, 7], [0, 0.2, 9]],
    objects: g.objects,
    vehicles: [],
    meta: { mode: 'poppy' },
  };
}
