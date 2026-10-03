// Kest Castores: atraco cooperativo a un aserradero. Roe los tablones, coge los
// troncos (los grandes pesan: mejor entre dos) y llévalos a la presa antes de que
// acabe el tiempo, esquivando sierras y lanzallamas.
import { WorldGen } from './builder.js';

export const CASTORES = {
  roundSeconds: 210,
  drop: { x: 0, z: 26, r: 7 },
  flamePeriod: 4, // segundos por ciclo; encendido durante flameOn
  flameOn: 1.6,
};

/** ¿Está encendido el lanzallamas `o` en el instante t (s, reloj del servidor)? */
export function flameActive(o, t) {
  const phase = ((t + (o.phase || 0)) % CASTORES.flamePeriod + CASTORES.flamePeriod) % CASTORES.flamePeriod;
  return phase < CASTORES.flameOn;
}

export function buildCastores() {
  const g = new WorldGen('cs');
  const WOOD = '#8d6e63', PLANK = '#bcaaa4', H = 7;
  const wall = (x, z, sx, sz, color = WOOD) => g.block([x, H / 2, z], [sx, H, sz], color, 'wood');
  const plank = (id, x, z, sx, sz) => g.block([x, 2.6, z], [sx, 5.2, sz], PLANK, 'wood', { id, sep: true, plank: true });

  // Patio exterior, río y presa
  g.block([0, -0.05, 22], [80, 0.1, 30], '#7cb342', 'grass', { nc: true });
  g.block([0, -0.2, 46], [160, 0.3, 14], '#29b6f6', 'glass', { nc: true });
  g.block([0, -0.4, 46], [160, 0.1, 14], '#1565c0', 'stone', { nc: true });
  for (let i = -3; i <= 3; i++) g.block([i * 2.2, 0.8, 37.5], [2, 1.6, 2], '#6d4c41', 'wood'); // base de la presa
  g.add('zone', [CASTORES.drop.x, 1.5, CASTORES.drop.z + 6], [14, 4, 12], '#ffffff', 'plastic', { id: 'dropzone' });
  g.block([0, 0.02, CASTORES.drop.z + 6], [14, 0.04, 12], '#a5d6a7', 'neon', { nc: true, dance: true });
  g.add('sign', [9, 2.4, 30], [5, 1.6, 0.2], '#fff8e1', 'wood', { text: 'PRESA ← troncos' });

  // Aserradero: muros exteriores (x -30..30, z -50..10)
  wall(-30.5, -20, 1, 61);
  wall(30.5, -20, 1, 61);
  wall(0, -50.5, 62, 1);
  wall(-16.5, 10.5, 27, 1);
  wall(16.5, 10.5, 27, 1);
  g.block([0, 6.1, 10.5], [6, 1.8, 1], WOOD, 'wood'); // dintel sobre la entrada
  plank('plank0', 0, 10.5, 6, 0.7);
  g.add('sign', [0, 8, 11.2], [10, 2, 0.2], '#4e342e', 'wood', { text: 'ASERRADERO' });

  // Muro interior A (z = -15): puerta central con tablones y paso lateral vigilado por fuego
  wall(-16.5, -15, 27, 1);
  wall(10.5, -15, 15, 1);
  wall(27, -15, 6, 1);
  plank('plank1', 0, -15, 6, 0.7);
  // Muro interior B (x = 0) entre las dos salas traseras, con puerta de tablones
  wall(0, -22, 1, 13);
  wall(0, -43, 1, 15);
  plank('plank2', 0, -32, 0.7, 6);

  // Lanzallamas (se encienden por ciclos)
  const flames = [[21, -15, 0], [-15, -32, 1.3], [15, -40, 2.6], [-22, 2, 0.7]];
  flames.forEach(([x, z, phase], i) => g.add('flame', [x, 1.6, z], [1.4, 3.2, 1.4], '#ff6d00', 'metal', { id: `flame${i}`, phase }));

  // Sierras que se desplazan por raíles
  const saws = [
    [0, 1.7, -3, 'x', 46, 0.16], [0, 1.7, -9, 'x', 46, 0.21],
    [15, 1.7, -30, 'z', 26, 0.2], [-15, 1.7, -24, 'x', 22, 0.24],
  ];
  saws.forEach(([x, y, z, axis, dist, speed], i) => {
    g.add('saw', [x, y, z], [0.3, 3.2, 3.2], '#cfd8dc', 'metal', { id: `saw${i}`, axis, dist, speed });
    const rail = axis === 'x' ? [dist + 3, 0.2, 0.6] : [0.6, 0.2, dist + 3];
    g.block([x, 0.1, z], rail, '#455a64', 'metal', { nc: true });
  });

  // Decoración: pilas de tablones, mesa de corte, cinta
  g.block([-24, 0.6, -5], [5, 1.2, 3], '#a1887f', 'wood');
  g.block([24, 0.6, 4], [4, 1.2, 4], '#a1887f', 'wood');
  g.block([-20, 0.5, -45], [8, 1, 3], '#795548', 'wood');
  g.block([22, 0.5, -46], [3, 1, 6], '#795548', 'wood');
  for (const [x, z] of [[-25, 18], [25, 16], [-35, 30], [35, 28]]) g.add('tree', [x, 3, z], [3, 6, 3], '#43a047', 'grass');

  // Troncos (los gestiona el servidor): pequeños y grandes
  const logs = [
    { p: [-12, -6], big: false }, { p: [12, -6], big: false }, { p: [-20, 4], big: false },
    { p: [-20, -25], big: false }, { p: [-8, -40], big: false }, { p: [-24, -38], big: true }, { p: [-12, -30], big: true }, { p: [-24, -20], big: false },
    { p: [10, -22], big: false }, { p: [20, -28], big: false }, { p: [8, -44], big: true }, { p: [24, -44], big: false }, { p: [16, -36], big: true },
    { p: [6, 4], big: false },
  ];

  return {
    version: 1,
    terrain: { type: 'flat', size: 220, height: 0, color: '#689f38' },
    water: null,
    sky: { time: 0.62, dayNight: false, fog: true },
    bounds: { min: [-110, -20, -110], max: [110, 60, 110] },
    spawns: [[-4, 0.2, 20], [0, 0.2, 21], [4, 0.2, 20], [0, 0.2, 18]],
    objects: g.objects,
    vehicles: [],
    meta: { mode: 'castores', logs, rules: CASTORES },
  };
}
