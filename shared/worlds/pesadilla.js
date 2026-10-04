// Kest Pesadilla: terror en primera persona dentro de una casa abandonada.
// "El Oyente" es ciego: caza por el sonido (pasos, carreras y, si se activa, el
// micrófono del jugador). Tareas: encontrar 3 fusibles, devolver la luz, encontrar
// la llave y escapar por la puerta principal.
// La casa es una rejilla de habitaciones conectadas por huecos de puerta; el
// servidor usa la misma rejilla para mover al monstruo.
import { WorldGen } from './builder.js';
import { mulberry32 } from '../terrain.js';
import { WALL, generateMaze, mazeDistances } from './horror.js';

export const PESADILLA = { n: 5, cell: 10, h: 4.2, door: 2.6 };

export function buildPesadilla() {
  const { n: N, cell: CELL, h: H, door: DOOR } = PESADILLA;
  const T = 0.4;
  const g = new WorldGen('pz');
  const rnd = mulberry32(4040);
  const r = (a, b) => a + rnd() * (b - a);
  const cells = generateMaze(N, 2024);
  const x0 = (-N * CELL) / 2, z0 = (-N * CELL) / 2;
  const cx = (i) => x0 + (i + 0.5) * CELL;
  const cz = (j) => z0 + (j + 0.5) * CELL;
  const start = [2, N - 1];
  const WALLC = ['#5d4f45', '#4e4339', '#574a40'];
  const wallC = () => WALLC[Math.floor(rnd() * WALLC.length)];

  // Suelo y techo de la casa
  g.block([0, 0.05, 0], [N * CELL, 0.1, N * CELL], '#3b2a20', 'wood', { nc: true });
  g.block([0, H + 0.15, 0], [N * CELL + 1, 0.3, N * CELL + 1], '#1c1714', 'wood', { nc: true });

  /** Pared a lo largo de x (horizontal) o z (vertical), con o sin hueco de puerta en el centro. */
  const wall = (x, z, axis, open) => {
    const color = wallC();
    const size = (len) => (axis === 'x' ? [len, H, T] : [T, H, len]);
    if (!open) {
      g.block([x, H / 2, z], size(CELL + T), color, 'brick');
      return;
    }
    const side = (CELL + T - DOOR) / 2;
    const off = (DOOR + side) / 2;
    if (axis === 'x') {
      g.block([x - off, H / 2, z], size(side), color, 'brick');
      g.block([x + off, H / 2, z], size(side), color, 'brick');
      g.block([x, H - 0.5, z], [DOOR, 1, T], color, 'brick');
    } else {
      g.block([x, H / 2, z - off], size(side), color, 'brick');
      g.block([x, H / 2, z + off], size(side), color, 'brick');
      g.block([x, H - 0.5, z], [T, 1, DOOR], color, 'brick');
    }
  };
  for (let j = 0; j < N; j++) {
    for (let i = 0; i < N; i++) {
      const c = cells[j * N + i];
      wall(cx(i), z0 + j * CELL, 'x', j > 0 && !(c & WALL.N));
      wall(x0 + i * CELL, cz(j), 'z', i > 0 && !(c & WALL.W));
      if (i === N - 1) wall(x0 + N * CELL, cz(j), 'z', false);
    }
  }
  // Fachada sur con la puerta principal (cerrada con llave)
  for (let i = 0; i < N; i++) wall(cx(i), z0 + N * CELL, 'x', i === start[0]);
  g.block([cx(start[0]), 1.6, z0 + N * CELL], [DOOR - 0.1, 3.2, 0.3], '#3e2723', 'wood', { id: 'frontdoor', sep: true });
  g.add('zone', [cx(start[0]), 2, z0 + N * CELL + 7], [12, 5, 8], '#ffffff', 'plastic', { id: 'exitzone' });
  // Jardín delantero (fuera de la casa)
  g.block([cx(start[0]), 0.05, z0 + N * CELL + 9], [20, 0.1, 16], '#2e3b2a', 'grass', { nc: true });
  g.add('sign', [cx(start[0]) + 5, 1.6, z0 + N * CELL + 6], [3, 1.2, 0.2], '#8d6e63', 'wood', { text: 'SE VENDE' });
  for (let k = 0; k < 24; k++) {
    const a = rnd() * Math.PI * 2, d = 40 + rnd() * 30;
    g.add('tree', [Math.cos(a) * d, 3.5, Math.sin(a) * d], [2.4, 7, 2.4], '#263226', 'wood', { kind: 'pine' });
  }

  // Bombillas de cada habitación (se encienden al devolver la luz)
  for (let j = 0; j < N; j++) for (let i = 0; i < N; i++) {
    g.add('light', [cx(i), H - 0.35, cz(j)], [0.35, 0.35, 0.35], '#ffe9b0', 'neon', { group: 'power', intensity: 1.1, range: 10 });
  }

  // Muebles en las esquinas (los pasillos centro-puerta quedan libres para el monstruo)
  const corner = () => [[-1, -1], [1, -1], [-1, 1], [1, 1]][Math.floor(rnd() * 4)];
  const closets = [];
  const dist = mazeDistances(cells, N, start[0], start[1]);
  for (let j = 0; j < N; j++) for (let i = 0; i < N; i++) {
    const used = new Set();
    const pickCorner = () => {
      for (let t = 0; t < 6; t++) {
        const c = corner();
        if (!used.has(c.join())) { used.add(c.join()); return c; }
      }
      return null;
    };
    const kinds = ['bed', 'table', 'shelf', 'sofa'];
    for (let k = 0; k < 2; k++) {
      const c = pickCorner();
      if (!c) break;
      const px = cx(i) + c[0] * 3.3, pz = cz(j) + c[1] * 3.3;
      const kind = kinds[Math.floor(rnd() * kinds.length)];
      if (kind === 'bed') {
        g.block([px, 0.35, pz], [2.2, 0.7, 3], '#6d4c41', 'wood');
        g.block([px, 0.75, pz], [2, 0.12, 2.8], '#9e9e9e', 'plastic');
      } else if (kind === 'table') {
        g.block([px, 0.8, pz], [2.2, 0.12, 1.6], '#5d4037', 'wood');
        for (const [a, b] of [[-0.95, -0.65], [0.95, -0.65], [-0.95, 0.65], [0.95, 0.65]]) g.block([px + a, 0.4, pz + b], [0.12, 0.8, 0.12], '#4e342e', 'wood');
      } else if (kind === 'shelf') {
        g.block([px, 1.2, pz], [2.2, 2.4, 0.8], '#4e342e', 'wood');
      } else {
        g.block([px, 0.45, pz], [2.6, 0.9, 1.2], '#4a148c', 'plastic');
      }
    }
    // Armario para esconderse en algunas habitaciones
    if ((i + j) % 2 === 0 && !(i === start[0] && j === start[1])) {
      const c = pickCorner();
      if (c) {
        const px = cx(i) + c[0] * 3.6, pz = cz(j) + c[1] * 3.6;
        const id = `closet${closets.length}`;
        g.block([px, 1.3, pz], [1.6, 2.6, 1.6], '#3e2723', 'wood', { id });
        closets.push({ id, p: [px, 0, pz], room: [i, j] });
      }
    }
    // Cuadros torcidos y manchas
    if (rnd() < 0.5) g.block([cx(i) - CELL / 2 + 0.25, 2.3, cz(j) + r(-1.5, 1.5)], [0.06, 1, 1.4], ['#263238', '#4a148c', '#1b5e20'][Math.floor(rnd() * 3)], 'wood', { nc: true });
  }

  // Objetivos: fusibles en las habitaciones más alejadas, cuadro eléctrico y llave
  const rooms = [];
  for (let j = 0; j < N; j++) for (let i = 0; i < N; i++) rooms.push({ i, j, d: dist[j * N + i] });
  rooms.sort((a, b) => b.d - a.d);
  const fuses = [];
  for (const rm of rooms) {
    if (fuses.length >= 3) break;
    if (fuses.some((f) => Math.abs(f.room[0] - rm.i) + Math.abs(f.room[1] - rm.j) < 3)) continue;
    fuses.push({ id: `fuse${fuses.length}`, p: [cx(rm.i) + 1.4, 0.4, cz(rm.j) - 1.4], room: [rm.i, rm.j] });
  }
  const boxRoom = rooms[Math.floor(rooms.length / 2)];
  const fuseBox = { p: [cx(boxRoom.i), 1.5, cz(boxRoom.j) - CELL / 2 + 0.35], room: [boxRoom.i, boxRoom.j] };
  g.block(fuseBox.p, [1.2, 1.4, 0.3], '#607d8b', 'metal', { nc: true });
  const keyRoom = rooms.find((rm) => !fuses.some((f) => f.room[0] === rm.i && f.room[1] === rm.j) && rm.d >= 4) || rooms[0];
  const key = { p: [cx(keyRoom.i) - 1.4, 0.5, cz(keyRoom.j) + 1.4], room: [keyRoom.i, keyRoom.j] };

  // Recibidor
  g.add('sign', [cx(start[0]) - 3, 2.4, z0 + N * CELL - 0.3], [3, 1, 0.1], '#bcaaa4', 'wood', { text: 'NO HAGAS RUIDO' });

  return {
    version: 1,
    terrain: { type: 'flat', size: 200, height: 0, color: '#1b2418' },
    water: null,
    sky: { time: 0.02, dayNight: false, fog: true },
    bounds: { min: [-100, -20, -100], max: [100, 40, 100] },
    spawns: [[cx(start[0]) - 1.5, 0.2, cz(start[1]) + 2], [cx(start[0]) + 1.5, 0.2, cz(start[1]) + 2], [cx(start[0]), 0.2, cz(start[1])]],
    objects: g.objects,
    vehicles: [],
    meta: {
      mode: 'pesadilla',
      grid: { n: N, cell: CELL, x0, z0, cells, start },
      fuses, fuseBox, key, closets,
      door: { p: [cx(start[0]), 1.6, z0 + N * CELL] },
    },
  };
}
