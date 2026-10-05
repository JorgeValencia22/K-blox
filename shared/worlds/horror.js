// Laberinto Sombrío: laberinto de setos de noche. Hay que encontrar las almas perdidas
// para abrir la verja de salida mientras "La Sombra" persigue a los jugadores.
// El laberinto se genera de forma determinista: el servidor usa la misma rejilla
// para mover al monstruo (búsqueda en anchura por los pasillos).
import { WorldGen } from './builder.js';
import { mulberry32 } from '../terrain.js';

export const WALL = { N: 1, E: 2, S: 4, W: 8 };

/** Laberinto perfecto (backtracking) con algunos atajos para que no sea lineal. */
export function generateMaze(n, seed) {
  const rnd = mulberry32(seed);
  const cells = new Array(n * n).fill(15);
  const seen = new Array(n * n).fill(false);
  const idx = (i, j) => j * n + i;
  const stack = [[0, n - 1]];
  seen[idx(0, n - 1)] = true;
  const dirs = [[0, -1, WALL.N, WALL.S], [1, 0, WALL.E, WALL.W], [0, 1, WALL.S, WALL.N], [-1, 0, WALL.W, WALL.E]];
  while (stack.length) {
    const [i, j] = stack[stack.length - 1];
    const options = dirs.filter(([di, dj]) => {
      const a = i + di, b = j + dj;
      return a >= 0 && b >= 0 && a < n && b < n && !seen[idx(a, b)];
    });
    if (!options.length) { stack.pop(); continue; }
    const [di, dj, w, back] = options[Math.floor(rnd() * options.length)];
    cells[idx(i, j)] &= ~w;
    cells[idx(i + di, j + dj)] &= ~back;
    seen[idx(i + di, j + dj)] = true;
    stack.push([i + di, j + dj]);
  }
  // Atajos: quita algunas paredes interiores
  for (let k = 0; k < n * 1.2; k++) {
    const i = 1 + Math.floor(rnd() * (n - 2)), j = 1 + Math.floor(rnd() * (n - 2));
    const [di, dj, w, back] = dirs[Math.floor(rnd() * 4)];
    cells[idx(i, j)] &= ~w;
    cells[idx(i + di, j + dj)] &= ~back;
  }
  return cells;
}

/** Distancias (en celdas) desde (si,sj) recorriendo pasillos. */
export function mazeDistances(cells, n, si, sj) {
  const dist = new Array(n * n).fill(-1);
  const q = [[si, sj]];
  dist[sj * n + si] = 0;
  const steps = [[0, -1, WALL.N], [1, 0, WALL.E], [0, 1, WALL.S], [-1, 0, WALL.W]];
  while (q.length) {
    const [i, j] = q.shift();
    for (const [di, dj, w] of steps) {
      if (cells[j * n + i] & w) continue;
      const a = i + di, b = j + dj;
      if (a < 0 || b < 0 || a >= n || b >= n || dist[b * n + a] >= 0) continue;
      dist[b * n + a] = dist[j * n + i] + 1;
      q.push([a, b]);
    }
  }
  return dist;
}

export function buildHorror() {
  const N = 15, CELL = 8, H = 5, T = 0.8;
  const g = new WorldGen('t');
  const rnd = mulberry32(666);
  const cells = generateMaze(N, 1313);
  const x0 = (-N * CELL) / 2, z0 = (-N * CELL) / 2;
  const cx = (i) => x0 + (i + 0.5) * CELL;
  const cz = (j) => z0 + (j + 0.5) * CELL;
  const start = [0, N - 1];
  const exit = [N - 1, 0];
  // Entrada (sur de la celda inicial) y salida (este de la celda final)
  cells[start[1] * N + start[0]] &= ~WALL.S;

  const HEDGE = ['#1b3a1f', '#183520', '#213f22'];
  const wall = (x, z, sx, sz) => g.block([x, H / 2, z], [sx, H, sz], HEDGE[Math.floor(rnd() * 3)], 'grass');
  for (let j = 0; j < N; j++) {
    for (let i = 0; i < N; i++) {
      const c = cells[j * N + i];
      if (c & WALL.N) wall(cx(i), z0 + j * CELL, CELL + T, T);
      if (c & WALL.W) wall(x0 + i * CELL, cz(j), T, CELL + T);
      if (j === N - 1 && c & WALL.S) wall(cx(i), z0 + N * CELL, CELL + T, T);
      if (i === N - 1 && c & WALL.E && !(i === exit[0] && j === exit[1])) wall(x0 + N * CELL, cz(j), T, CELL + T);
    }
  }
  // Verja de salida (se abre cuando se reúnen todas las almas)
  g.block([x0 + N * CELL, H / 2, cz(exit[1])], [T, H, CELL - 0.2], '#4e342e', 'metal', { id: 'exitgate', sep: true });
  g.add('zone', [x0 + N * CELL + 6, 2, cz(exit[1])], [8, 6, CELL + 4], '#ffffff', 'plastic', { id: 'exitzone' });
  g.block([x0 + N * CELL + 8, -0.05, cz(exit[1])], [14, 0.1, CELL + 6], '#3e2723', 'stone');
  g.add('sign', [x0 + N * CELL + 12, 2.5, cz(exit[1])], [0.2, 1.6, 4], '#bdbdbd', 'wood', { text: 'SALIDA' });

  // Patio de entrada
  const sx = cx(start[0]), sz = z0 + N * CELL + 8;
  g.block([sx, -0.05, sz], [14, 0.1, 12], '#3e2723', 'stone');
  g.add('sign', [sx + 5, 2, sz - 2], [4, 1.6, 0.2], '#9e9e9e', 'wood', { text: 'NO ENTRES' });
  g.add('light', [sx - 5, 3, sz], [0.5, 0.5, 0.5], '#ffab40', 'neon', { intensity: 1.6, range: 14 });

  // Almas: en los callejones sin salida más alejados de la entrada
  const dist = mazeDistances(cells, N, start[0], start[1]);
  const deadEnds = [];
  for (let j = 0; j < N; j++) for (let i = 0; i < N; i++) {
    const c = cells[j * N + i];
    const walls = [WALL.N, WALL.E, WALL.S, WALL.W].filter((w) => c & w).length;
    if (walls === 3 && !(i === start[0] && j === start[1])) deadEnds.push({ i, j, d: dist[j * N + i] });
  }
  deadEnds.sort((a, b) => b.d - a.d);
  const souls = [];
  for (const de of deadEnds) {
    if (souls.length >= 6) break;
    if (souls.some((s) => Math.abs(s.i - de.i) + Math.abs(s.j - de.j) < 4)) continue;
    souls.push(de);
  }
  souls.forEach((s, k) => {
    g.add('gem', [cx(s.i), 1.4, cz(s.j)], [0.9, 0.9, 0.9], '#b388ff', 'neon', { id: `soul${k}` });
    g.add('light', [cx(s.i), 2.6, cz(s.j)], [0.25, 0.25, 0.25], '#b388ff', 'neon', { intensity: 1.2, range: 9 });
  });

  // Farolillos dispersos
  for (let k = 0; k < 10; k++) {
    const i = Math.floor(rnd() * N), j = Math.floor(rnd() * N);
    g.add('deco', [cx(i) + CELL / 2 - 1, 1.4, cz(j) + CELL / 2 - 1], [0.4, 2.8, 0.4], '#3e2723', 'wood', { kind: 'lamp' });
  }
  // Árboles muertos y lápidas fuera del laberinto
  const half = (N * CELL) / 2;
  const exitX = x0 + N * CELL, exitZ = cz(exit[1]);
  for (let k = 0; k < 60; k++) {
    const a = rnd() * Math.PI * 2, d = 66 + rnd() * 50;
    const x = Math.cos(a) * d, z = Math.sin(a) * d;
    if (Math.abs(x) < half + 5 && Math.abs(z) < half + 5) continue;
    if (Math.hypot(x - exitX, z - exitZ) < 18 || Math.hypot(x - sx, z - sz) < 26) continue;
    if (k % 3 === 0) g.block([x, 0.7, z], [1.2, 1.4, 0.3], '#757575', 'stone');
    else g.add('tree', [x, 3.5, z], [2.2, 7, 2.2], '#3e2723', 'wood', { kind: 'pine' });
  }
  // Cementerio junto a la entrada: lápidas en filas, verja y una cripta
  for (let r = 0; r < 3; r++) for (let c = 0; c < 5; c++) {
    const tx = sx + 12 + c * 3, tz = sz - 2 + r * 3.2;
    g.block([tx, 0.6, tz], [1.1, 1.2 + ((r + c) % 3) * 0.3, 0.3], ['#757575', '#616161', '#9e9e9e'][(r * 5 + c) % 3], 'stone');
    if ((r + c) % 4 === 0) g.block([tx, 1.6, tz], [0.9, 0.2, 0.25], '#757575', 'stone', { nc: true });
  }
  for (let i = 0; i < 9; i++) g.block([sx + 10 + i * 2.2, 0.9, sz + 8], [0.15, 1.8, 0.15], '#212121', 'metal');
  g.block([sx + 19, 1.7, sz + 8], [19, 0.15, 0.15], '#212121', 'metal');
  // Cripta
  g.block([sx - 13, 2, sz + 2], [7, 4, 6], '#616161', 'stone');
  g.add('wedge', [sx - 13, 4.8, sz + 0.5], [7, 1.6, 3], '#424242', 'stone').ry = 0;
  g.add('wedge', [sx - 13, 4.8, sz + 3.5], [7, 1.6, 3], '#424242', 'stone').ry = 180;
  g.block([sx - 13, 1.4, sz - 1.05], [2, 2.8, 0.1], '#1b1b1b', 'stone', { nc: true });
  g.add('light', [sx - 13, 1.2, sz - 1.6], [0.3, 0.3, 0.3], '#b388ff', 'neon', { intensity: 0.9, range: 7 });
  // Calabazas iluminadas por el laberinto (decoración)
  for (let k = 0; k < 14; k++) {
    const i = Math.floor(rnd() * N), j = Math.floor(rnd() * N);
    g.add('sphere', [cx(i) - CELL / 2 + 1.2, 0.45, cz(j) - CELL / 2 + 1.2], [0.9, 0.7, 0.9], '#ef6c00', 'neon', { nc: true });
  }
  // Luna enorme sobre el laberinto
  g.add('sphere', [-120, 70, -160], [26, 26, 26], '#fff9c4', 'neon', { nc: true });

  return {
    version: 1,
    terrain: { type: 'flat', size: 300, height: 0, color: '#1e2a1e' },
    water: null,
    sky: { time: 0.02, dayNight: false, fog: true },
    bounds: { min: [-150, -20, -150], max: [150, 60, 150] },
    spawns: [[sx - 2, 0.2, sz], [sx + 2, 0.2, sz], [sx, 0.2, sz + 2]],
    objects: g.objects,
    vehicles: [],
    meta: {
      mode: 'horror',
      maze: { n: N, cell: CELL, x0, z0, cells, start, exit },
      souls: souls.length,
    },
  };
}
