// Asalto a la Casa: historia cooperativa por noches. De día se buscan tablas, comida
// y "armas" de broma y se tapian ventanas y puertas; de noche llegan Los Encapuchados
// a por el tesoro familiar. La tercera noche viene su jefe, El Gran Bigotón.
// El servidor usa las rutas de esta descripción para mover a los ladrones.
import { WorldGen } from './builder.js';
import { mulberry32 } from '../terrain.js';

export const ASALTO = {
  house: { hx: 14, hz: 10, h: 4.2, t: 0.5 },
  boardsMax: 3,
  boardHp: 40,
  nights: 3,
  dayFirst: 75,
  dayNext: 45,
  nightMax: 150,
  treasure: [-8, 0.6, -5],
};

export const ITEMS = {
  plank: { name: 'Tabla', icon: '🪵' },
  apple: { name: 'Manzana', icon: '🍎', heal: 20 },
  pizza: { name: 'Pizza', icon: '🍕', heal: 40 },
  cookie: { name: 'Galleta', icon: '🍪', heal: 15 },
  medkit: { name: 'Botiquín', icon: '🩹', heal: 100 },
  pan: { name: 'Sartén', icon: '🍳', weapon: true, dmg: 22, cd: 650 },
  bat: { name: 'Bate de espuma', icon: '🏏', weapon: true, dmg: 28, cd: 750 },
  hammer: { name: 'Martillo de goma', icon: '🔨', weapon: true, dmg: 36, cd: 1000 },
};
export const FOODS = ['apple', 'pizza', 'cookie'];

export const ROLES = {
  manitas: { name: 'Manitas', icon: '🛠️', desc: 'Cada tabla que pones aguanta el doble' },
  cocinero: { name: 'Cocinero/a', icon: '👩‍🍳', desc: 'La comida te cura el doble' },
  deportista: { name: 'Deportista', icon: '⚽', desc: 'Golpeas un 50 % más fuerte' },
  enfermero: { name: 'Enfermero/a', icon: '💉', desc: 'Al comer, también curas a quien esté cerca' },
};

export function buildAsalto() {
  const g = new WorldGen('as');
  const rnd = mulberry32(1515);
  const { hx, hz, h, t } = ASALTO.house;
  const WALL = '#ffe0b2', TRIM = '#8d6e63';

  // Jardín, calle y acera
  g.block([0, -0.05, 0], [80, 0.1, 64], '#7cb342', 'grass', { nc: true });
  g.block([0, 0.02, 38], [120, 0.04, 10], '#455a64', 'stone', { nc: true });
  g.block([0, 0.05, 31.5], [120, 0.1, 3], '#cfd8dc', 'stone', { nc: true });
  g.block([0, 0.03, 20], [3, 0.06, 20], '#d7ccc8', 'stone', { nc: true }); // camino a la puerta

  // Huecos (ventanas y puertas) que se pueden tapiar. side: s, n, e, w; c = posición a lo largo de la pared
  const openings = [
    { side: 's', c: 0, w: 2.4, y0: 0, y1: 3.2, door: true },
    { side: 'n', c: -6, w: 2.4, y0: 0, y1: 3.2, door: true },
    { side: 's', c: -9, w: 2.4, y0: 1, y1: 2.8 },
    { side: 's', c: 9, w: 2.4, y0: 1, y1: 2.8 },
    { side: 'n', c: 6, w: 2.4, y0: 1, y1: 2.8 },
    { side: 'w', c: -4, w: 2.4, y0: 1, y1: 2.8 },
    { side: 'w', c: 5, w: 2.4, y0: 1, y1: 2.8 },
    { side: 'e', c: 0, w: 2.4, y0: 1, y1: 2.8 },
  ];
  // Paredes con huecos
  const sides = {
    s: { axis: 'x', fixed: hz, len: hx * 2 }, n: { axis: 'x', fixed: -hz, len: hx * 2 },
    e: { axis: 'z', fixed: hx, len: hz * 2 }, w: { axis: 'z', fixed: -hx, len: hz * 2 },
  };
  const at = (side, along, y, sizeAlong, sizeY) => {
    const sd = sides[side];
    return sd.axis === 'x'
      ? { p: [along, y, sd.fixed], s: [sizeAlong, sizeY, t] }
      : { p: [sd.fixed, y, along], s: [t, sizeY, sizeAlong] };
  };
  for (const [side, sd] of Object.entries(sides)) {
    const ops = openings.filter((o) => o.side === side).sort((a, b) => a.c - b.c);
    let cur = -sd.len / 2 - t / 2;
    for (const o of ops) {
      const a = o.c - o.w / 2;
      if (a > cur) { const b = at(side, (cur + a) / 2, h / 2, a - cur, h); g.block(b.p, b.s, WALL, 'brick'); }
      if (o.y0 > 0) { const b = at(side, o.c, o.y0 / 2, o.w, o.y0); g.block(b.p, b.s, WALL, 'brick'); }
      const top = at(side, o.c, (o.y1 + h) / 2, o.w, h - o.y1);
      g.block(top.p, top.s, WALL, 'brick');
      cur = o.c + o.w / 2;
    }
    const end = sd.len / 2 + t / 2;
    const b = at(side, (cur + end) / 2, h / 2, end - cur, h);
    g.block(b.p, b.s, WALL, 'brick');
  }
  // Suelo, techo y tejado
  g.block([0, 0.08, 0], [hx * 2, 0.16, hz * 2], '#bcaaa4', 'wood');
  g.block([0, h + 0.15, 0], [hx * 2 + 1, 0.3, hz * 2 + 1], '#6d4c41', 'wood'); // techo sólido: la cámara no lo atraviesa
  g.add('wedge', [0, h + 1.6, -hz / 2 - 0.25], [hx * 2 + 1.6, 2.6, hz + 0.6], '#c62828', 'plastic', { nc: true });
  g.add('wedge', [0, h + 1.6, hz / 2 + 0.25], [hx * 2 + 1.6, 2.6, hz + 0.6], '#c62828', 'plastic', { nc: true }).ry = 180;

  // Tablas de cada hueco (las muestra/oculta el cliente según el estado)
  const meta = [];
  openings.forEach((o, k) => {
    const sd = sides[o.side];
    const out = o.side === 's' || o.side === 'e' ? 1 : -1;
    const boards = [];
    for (let b = 0; b < ASALTO.boardsMax; b++) {
      const yy = o.door ? 0.6 + b * 1.05 : o.y0 + 0.3 + b * 0.6;
      const bb = at(o.side, o.c, yy, o.w + 0.5, o.door ? 0.5 : 0.35);
      bb.p[sd.axis === 'x' ? 2 : 0] += out * 0.35;
      bb.s[sd.axis === 'x' ? 2 : 0] = 0.12;
      const id = `bar${k}_${b}`;
      g.block(bb.p, bb.s, '#a1887f', 'wood', { id, sep: true });
      boards.push(id);
    }
    const ext = sd.axis === 'x' ? [o.c, 0, sd.fixed + out * 1.6] : [sd.fixed + out * 1.6, 0, o.c];
    const int = sd.axis === 'x' ? [o.c, 0, sd.fixed - out * 1.6] : [sd.fixed - out * 1.6, 0, o.c];
    // Ruta exterior desde la calle (rodeando la casa por las esquinas)
    const route = [];
    const sideX = o.side === 'e' ? 1 : o.side === 'w' ? -1 : o.c >= 0 ? 1 : -1;
    if (o.side !== 's') route.push([sideX * (hx + 4), 0, hz + 4]);
    if (o.side === 'n') route.push([sideX * (hx + 4), 0, -hz - 4]);
    route.push(ext);
    meta.push({ id: `win${k}`, side: o.side, door: !!o.door, boards, ext, int, route, label: o.door ? 'puerta' : 'ventana' });
  });

  // Muebles (pegados a las paredes para dejar el centro libre)
  g.block([-11, 0.55, -8], [5, 0.9, 2], '#5c6bc0', 'plastic'); // sofá
  g.block([-11, 1.2, -9.2], [5, 1.4, 0.6], '#3949ab', 'plastic');
  g.block([-11, 1.1, -2.5], [3, 1.8, 0.4], '#212121', 'metal'); // tele
  g.block([10, 0.5, -8.6], [7, 1, 2], '#eceff1', 'stone'); // encimera
  g.block([13, 1.2, -5], [1.4, 2.4, 1.6], '#cfd8dc', 'metal'); // nevera
  g.block([9, 0.45, 4], [3.6, 0.15, 2.4], '#795548', 'wood'); // mesa
  for (const [a, b] of [[7.6, 3], [10.4, 3], [7.6, 5], [10.4, 5]]) g.block([a, 0.3, b], [0.6, 0.6, 0.6], '#6d4c41', 'wood');
  g.block([-11.5, 0.5, 7], [4, 0.6, 3], '#ef9a9a', 'plastic'); // cama
  g.block([-11.5, 0.9, 8.4], [4, 0.6, 0.3], '#e57373', 'plastic');
  g.block([0, 0.18, 0], [6, 0.04, 4], '#7e57c2', 'plastic', { nc: true }); // alfombra
  g.add('sign', [0, 3.3, -hz + 0.35], [5, 1, 0.1], '#fff8e1', 'wood', { text: 'HOGAR, DULCE HOGAR' });

  // Tesoro familiar
  const [tx, ty, tz] = ASALTO.treasure;
  g.block([tx, ty, tz], [1.6, 1.1, 1.1], '#ffc107', 'metal', { id: 'treasure', sep: true });
  g.block([tx, ty + 0.62, tz], [1.7, 0.14, 1.2], '#ff8f00', 'metal', { nc: true });
  g.add('light', [tx, 2.6, tz], [0.3, 0.3, 0.3], '#ffe082', 'neon', { intensity: 1.2, range: 8 });
  g.add('zone', [tx, 1.5, tz], [4, 3, 4], '#ffffff', 'plastic', { id: 'treasurezone' });

  // Cobertizo, huerto, árbol y valla baja del jardín
  g.block([24, 1.5, -20], [8, 3, 0.4], '#8d6e63', 'wood');
  g.block([20.2, 1.5, -17], [0.4, 3, 6], '#8d6e63', 'wood');
  g.block([27.8, 1.5, -17], [0.4, 3, 6], '#8d6e63', 'wood');
  g.block([24, 3.2, -17], [8.8, 0.4, 6.8], '#4e342e', 'wood');
  g.block([24, 0.6, -19.2], [6, 0.2, 1], '#a1887f', 'wood'); // estantería
  g.add('sign', [24, 3.8, -13.6], [4, 0.8, 0.15], '#ffffff', 'wood', { text: 'COBERTIZO' });
  g.block([-26, 0.1, -18], [10, 0.2, 8], '#5d4037', 'grass', { nc: true });
  for (let i = 0; i < 6; i++) g.add('deco', [-29 + i * 1.3, 0.4, -18 + (i % 2 ? 1.5 : -1.5)], [0.7, 0.7, 0.7], '#e53935', 'plastic', { kind: 'flower' });
  g.add('tree', [-28, 3.5, 8], [4, 7, 4], '#43a047', 'grass');
  for (const [x, z, sx, sz] of [[0, -31, 80, 0.2], [-40, 0, 0.2, 62], [40, 0, 0.2, 62], [-22, 30.5, 36, 0.2], [22, 30.5, 36, 0.2]]) {
    g.block([x, 0.6, z], [sx, 1.2, sz], '#fafafa', 'wood', { nc: true });
  }
  // Furgoneta de Los Encapuchados en la calle
  g.block([14, 1.6, 38], [8, 2.6, 3.6], '#37474f', 'metal');
  g.block([18.5, 1.3, 38], [1.4, 2, 3.4], '#263238', 'metal');
  for (const a of [-2.5, 2.5]) for (const b of [-1.8, 1.8]) g.add('cylinder', [14 + a, 0.5, 38 + b], [1, 1, 0.5], '#111111', 'plastic');
  g.add('sign', [14, 2.2, 36.15], [5, 0.8, 0.1], '#37474f', 'metal', { text: 'REPARTOS RÁPIDOS' });
  // Farolas y árboles en la calle
  for (let i = 0; i < 6; i++) g.add('deco', [-45 + i * 18, 2.5, 33], [0.6, 5, 0.6], '#37474f', 'metal', { kind: 'lamp' });
  for (let i = 0; i < 14; i++) {
    const a = rnd() * Math.PI * 2, d = 50 + rnd() * 25;
    g.add('tree', [Math.cos(a) * d, 3, Math.sin(a) * d - 8], [3, 6, 3], '#388e3c', 'grass');
  }

  // Sitios donde aparecen objetos cada día (casa, cobertizo, jardín y huerto)
  const itemSpots = [
    [-12, 0.3, -5], [-6, 0.3, 8], [3, 0.3, -7], [12, 0.3, 7], [6, 0.3, 0], [-3, 0.3, 4],
    [22, 0.3, -18], [26, 0.3, -18], [24, 0.3, -16],
    [-24, 0.3, -18], [-28, 0.3, -17], [-28, 0.3, 11], [-22, 0.3, 4],
    [20, 0.3, 4], [24, 0.3, 14], [8, 0.3, 18], [-10, 0.3, 20], [-20, 0.3, -6],
    [30, 0.3, -2], [0, 0.3, -24], [-12, 0.3, -24], [14, 0.3, -26],
  ];

  return {
    version: 1,
    terrain: { type: 'flat', size: 240, height: -0.1, color: '#689f38' },
    water: null,
    sky: { time: 0.4, dayNight: false, fog: true },
    bounds: { min: [-120, -20, -120], max: [120, 60, 120] },
    spawns: [[-2, 0.3, 3], [2, 0.3, 3], [0, 0.3, 6], [-4, 0.3, 0]],
    objects: g.objects,
    vehicles: [],
    meta: { mode: 'asalto', openings: meta, itemSpots, street: [[-6, 0, 38], [0, 0, 36], [8, 0, 36], [-14, 0, 37]], rules: ASALTO },
  };
}
