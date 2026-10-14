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
