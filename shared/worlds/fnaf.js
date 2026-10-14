// Turno de Noche: la Pizzería Kesty de noche. Inspirado en los survival horror de
// guardias de seguridad: oficina con dos puertas, luces de pasillo, cámaras y energía
// limitada. Los animatrónicos (personajes originales) recorren las salas.
// Este módulo lo comparten el servidor (IA, reglas) y el cliente (dibujo, cámaras).
import { WorldGen } from './builder.js';

export const FNAF = {
  hourMs: 45_000, // 1 hora del juego = 45 s (la noche entera son 4,5 min)
  hours: 6,
  office: { x0: -5, x1: 5, z0: 16, z1: 26 },
  doors: {
    L: { id: 'fdoorL', p: [-5, 1.6, 20.5], panel: [-4.4, 1.4, 18.3], node: 'doorL', lamp: [-7, 3.9, 18.5] },
    R: { id: 'fdoorR', p: [5, 1.6, 20.5], panel: [4.4, 1.4, 18.3], node: 'doorR', lamp: [7, 3.9, 18.5] },
  },
  monitor: [0, 1.2, 17.4],
  generator: [0, 1.3, 25.6],
  // Sala de control invisible del jugador animatrónico y de los espectadores
  booth: [0, 0.2, 62],
  lobbySpawns: [[-4, 0.2, -4], [4, 0.2, -4], [-4, 0.2, -10], [4, 0.2, -10], [0, 0.2, -2], [-8, 0.2, -8], [8, 0.2, -8], [0, 0.2, -12]],
  officeSpawns: [[-2, 0.2, 22.5], [2, 0.2, 22.5], [-2, 0.2, 24.5], [2, 0.2, 24.5], [0, 0.2, 23.5], [-3.5, 0.2, 24], [3.5, 0.2, 24], [0, 0.2, 21]],
  maxGuards: 8,
};

export const inOffice = (p) => p[0] > FNAF.office.x0 + 0.2 && p[0] < FNAF.office.x1 - 0.2 && p[2] > FNAF.office.z0 && p[2] < FNAF.office.z1;

// --- Animatrónicos -----------------------------------------------------------------------
export const ANIMATRONICS = {
  bear: { name: 'Bruno', species: 'el oso', door: 'R', interval: 3.0, color: '#7b4a2a', ability: 'Risa engañosa', abilityDesc: 'Suena tu risa en otra sala para despistar', cooldown: 6000, abilityCd: 20000 },
  bunny: { name: 'Rita', species: 'la coneja', door: 'L', interval: 4.97, color: '#5c6bc0', ability: 'Interferencia', abilityDesc: 'Llena de estática todas las cámaras 6 s', cooldown: 4500, abilityCd: 30000 },
  chicken: { name: 'Pía', species: 'la pollita', door: 'R', interval: 4.98, color: '#fbc02d', ability: 'Fundir bombilla', abilityDesc: 'Rompe la luz de la puerta más cercana 10 s', cooldown: 5000, abilityCd: 30000 },
  fox: { name: 'Fito', species: 'el zorro pirata', door: 'L', interval: 5.01, color: '#c62828', ability: 'Carrera', abilityDesc: 'Cuando la carga está llena, corre por el pasillo oeste hasta la oficina', cooldown: 0, abilityCd: 0 },
};
export const ANIM_IDS = Object.keys(ANIMATRONICS);

// --- Salas (nodos) ----------------------------------------------------------------------
// pos: dónde se coloca cada animatrónico en esa sala (x, y, z, ry en grados).
export const NODES = {
  stage: { name: 'Escenario', cam: '1A', pos: { bear: [0, 0.8, -20, 0], bunny: [-3.4, 0.8, -20, 15], chicken: [3.4, 0.8, -20, -15] } },
  dining: { name: 'Comedor', cam: '1B', pos: { bear: [1.5, 0, -6, 160], bunny: [-4, 0, -0.5, 200], chicken: [7, 0, -9, 140], fox: [-10, 0, -7, 90] } },
  pirate: { name: 'Cala Pirata', cam: '1C', pos: { fox: [-18.6, 0.5, -7, 90] } },
  backstage: { name: 'Bastidores', cam: '5', pos: { bunny: [-14, 0, -21, 120], bear: [-17, 0, -19, 90] } },
  supply: { name: 'Almacén', cam: '3', pos: { bunny: [-12.5, 0, 10.6, 120] } },
  westHall: { name: 'Pasillo oeste', cam: '2A', pos: { bunny: [-7, 0, 6.5, 180], fox: [-7, 0, 8, 180], chicken: [-7.4, 0, 5, 180] } },
  westCorner: { name: 'Esquina oeste', cam: '2B', pos: { bunny: [-6.6, 0, 13.6, 160], chicken: [-7.4, 0, 12.6, 180] } },
  doorL: { name: 'Puerta izquierda', cam: null, pos: { bunny: [-6.5, 0, 20.5, 90], fox: [-6.5, 0, 20.5, 90], chicken: [-6.5, 0, 20.5, 90], bear: [-6.6, 0, 20.5, 90] } },
  restrooms: { name: 'Baños', cam: '7', pos: { chicken: [17.5, 0, -21.5, 220], bear: [15, 0, -19, 200] } },
  kitchen: { name: 'Cocina', cam: '6', pos: { chicken: [18, 0, -4, 250], bear: [17, 0, -8, 270] } },
  eastHall: { name: 'Pasillo este', cam: '4A', pos: { chicken: [7, 0, 6.5, 180], bear: [7.4, 0, 8.5, 180], bunny: [6.6, 0, 5, 180] } },
  eastCorner: { name: 'Esquina este', cam: '4B', pos: { chicken: [6.6, 0, 13.6, 200], bear: [7.4, 0, 14.4, 180], bunny: [7.4, 0, 12.6, 180] } },
  doorR: { name: 'Puerta derecha', cam: null, pos: { chicken: [6.5, 0, 20.5, 270], bear: [6.6, 0, 20.5, 270], bunny: [6.5, 0, 20.5, 270] } },
  office: { name: 'Oficina', cam: null, pos: { bunny: [-3.2, 0, 20.5, 90], fox: [-3.2, 0, 20.5, 90], chicken: [3.2, 0, 20.5, 270], bear: [3.2, 0, 20.5, 270] } },
};

export function nodePos(node, anim) {
  const n = NODES[node];
  const p = n.pos[anim] || Object.values(n.pos)[0];
  return p;
}

// --- Cámaras de seguridad ------------------------------------------------------------------
// map: posición (0..100) en el plano del monitor.
export const CAMS = [
  { id: '1A', node: 'stage', name: 'Escenario', pos: [0, 4.1, -11.5], look: [0, 1.6, -20], map: [50, 12] },
  { id: '1B', node: 'dining', name: 'Comedor', pos: [12.5, 4.2, 1], look: [-2, 0.6, -8], map: [50, 32] },
  { id: '1C', node: 'pirate', name: 'Cala Pirata', pos: [-11.5, 3.9, -1], look: [-19, 1.2, -7], map: [18, 32] },
  { id: '5', node: 'backstage', name: 'Bastidores', pos: [-11, 4.2, -25.5], look: [-17, 1, -19], map: [16, 10] },
  { id: '7', node: 'restrooms', name: 'Baños', pos: [21.3, 4.2, -16.6], look: [14, 0.6, -22], map: [84, 10] },
  { id: '6', node: 'kitchen', name: 'Cocina', audioOnly: true, pos: [21, 4, -0.5], look: [16, 0.6, -8], map: [84, 34] },
  { id: '3', node: 'supply', name: 'Almacén', pos: [-10, 4.1, 12.2], look: [-14, 0.4, 8], map: [18, 62] },
  { id: '2A', node: 'westHall', name: 'Pasillo oeste', pos: [-7, 4.2, 1.5], look: [-7, 0.5, 14], map: [34, 58] },
  { id: '2B', node: 'westCorner', name: 'Esquina oeste', pos: [-8.6, 4.2, 25.4], look: [-6.4, 0.6, 14], map: [34, 80] },
  { id: '4A', node: 'eastHall', name: 'Pasillo este', pos: [7, 4.2, 1.5], look: [7, 0.5, 14], map: [66, 58] },
  { id: '4B', node: 'eastCorner', name: 'Esquina este', pos: [8.6, 4.2, 25.4], look: [6.4, 0.6, 14], map: [66, 80] },
];
export const CAM_BY_ID = Object.fromEntries(CAMS.map((c) => [c.id, c]));
export const CAM_OF_NODE = Object.fromEntries(CAMS.map((c) => [c.node, c.id]));

// --- Rutas de cada animatrónico (zonas permitidas) ---------------------------------------
export const ROUTES = {
  bunny: { stage: ['dining'], dining: ['backstage', 'westHall'], backstage: ['dining', 'westHall'], westHall: ['supply', 'westCorner', 'dining'], supply: ['westHall', 'westCorner'], westCorner: ['doorL', 'supply', 'westHall'], doorL: ['westCorner', 'office'], office: [] },
  chicken: { stage: ['dining'], dining: ['restrooms', 'kitchen', 'eastHall'], restrooms: ['kitchen', 'eastHall', 'dining'], kitchen: ['eastHall', 'restrooms'], eastHall: ['eastCorner', 'kitchen', 'dining'], eastCorner: ['doorR', 'eastHall'], doorR: ['eastCorner', 'office'], office: [] },
  bear: { stage: ['dining'], dining: ['restrooms', 'backstage'], backstage: ['dining'], restrooms: ['kitchen', 'dining'], kitchen: ['eastHall', 'restrooms'], eastHall: ['eastCorner', 'kitchen'], eastCorner: ['doorR', 'eastHall'], doorR: ['eastCorner', 'office'], office: [] },
  fox: { pirate: ['dining'], dining: ['westHall', 'pirate'], westHall: ['doorL', 'dining'], doorL: ['pirate', 'office'], office: [] },
};
export const HOME = { bear: 'stage', bunny: 'stage', chicken: 'stage', fox: 'pirate' };

/** Pasos desde cada sala hasta la puerta del animatrónico (para que la IA avance). */
export function stepsToDoor(anim) {
  const route = ROUTES[anim], goal = ANIMATRONICS[anim].door === 'L' ? 'doorL' : 'doorR';
  const dist = { [goal]: 0 };
  const q = [goal];
  while (q.length) {
    const n = q.shift();
    for (const [from, tos] of Object.entries(route)) if (tos.includes(n) && dist[from] == null) { dist[from] = dist[n] + 1; q.push(from); }
  }
  return dist;
}

// --- Navegación continua (modo Último superviviente y carreras de Fito) --------------------
export const NAV = {
  stageFront: [0, -14], dining: [0, -7], diningSW: [-7, 0], diningSE: [7, 0], diningW: [-12, -9.5], diningE: [12, -9.5], backDoor: [-12, -14.6], backstage: [-16, -21],
  pirateMouth: [-11.5, -7], pirate: [-17, -7], restDoor: [12, -14.6], restrooms: [16, -21], kitchenDoor: [12, -6], kitchen: [18, -5],
  westHall: [-7, 9], supply: [-12.5, 9], westCorner: [-7, 15], doorL: [-7, 20.5], officeL: [-3, 20.5], office: [0, 21.5],
  officeR: [3, 20.5], doorR: [7, 20.5], eastCorner: [7, 15], eastHall: [7, 9],
};
export const NAV_EDGES = [
  ['stageFront', 'dining'], ['dining', 'diningSW'], ['diningSW', 'westHall'], ['dining', 'diningSE'], ['diningSE', 'eastHall'],
  ['dining', 'diningW'], ['diningW', 'backDoor'], ['backDoor', 'backstage'], ['dining', 'pirateMouth'], ['diningW', 'pirateMouth'], ['pirateMouth', 'pirate'],
  ['dining', 'diningE'], ['diningE', 'restDoor'], ['restDoor', 'restrooms'], ['diningE', 'kitchenDoor'], ['kitchenDoor', 'kitchen'], ['westHall', 'supply'], ['westHall', 'westCorner'],
  ['westCorner', 'doorL'], ['doorL', 'officeL'], ['officeL', 'office'], ['office', 'officeR'], ['officeR', 'doorR'], ['doorR', 'eastCorner'],
  ['eastCorner', 'eastHall'],
];
// Aristas que cruzan una puerta de la oficina (bloqueadas si está cerrada)
export const NAV_DOOR = { 'doorL|officeL': 'L', 'officeL|doorL': 'L', 'doorR|officeR': 'R', 'officeR|doorR': 'R' };
export const NAV_ADJ = (() => {
  const a = Object.fromEntries(Object.keys(NAV).map((k) => [k, []]));
  for (const [x, y] of NAV_EDGES) { a[x].push(y); a[y].push(x); }
  return a;
})();
export const FOX_RUN = ['pirate', 'pirateMouth', 'dining', 'diningSW', 'westHall', 'westCorner', 'doorL'];

/** Punto de navegación más cercano a (x, z). */
export function nearestNav(x, z) {
  let best = null, bd = Infinity;
  for (const [k, [nx, nz]] of Object.entries(NAV)) {
    const d = Math.hypot(nx - x, nz - z);
    if (d < bd) { bd = d; best = k; }
  }
  return best;
}

/** Camino más corto (BFS) entre dos puntos de navegación. blocked(a, b) excluye aristas. */
export function navPath(from, to, blocked = () => false) {
  if (from === to) return [to];
  const prev = { [from]: null };
  const q = [from];
  while (q.length) {
    const n = q.shift();
    for (const m of NAV_ADJ[n]) {
      if (prev[m] !== undefined || blocked(n, m)) continue;
      prev[m] = n;
      if (m === to) {
        const path = [m];
        let k = n;
        while (k !== from) { path.unshift(k); k = prev[k]; }
        return path;
      }
      q.push(m);
    }
  }
  return null;
}

/** Sala (nodo de cámara) en la que está un punto, para saber qué cámara lo ve. */
export function roomAt(x, z) {
  if (inOffice([x, 0, z])) return 'office';
  if (x < -5 && x > -9.2 && z > 2) return z > 12.5 ? 'westCorner' : 'westHall';
  if (x > 5 && x < 9.2 && z > 2) return z > 12.5 ? 'eastCorner' : 'eastHall';
  if (x <= -9 && z > 5 && z < 13) return 'supply';
  if (x < -14 && z > -12 && z < -2) return 'pirate';
  if (z < -16 && x < -10) return 'backstage';
  if (z < -16 && x > 10) return 'restrooms';
  if (z < -15.5) return 'stage';
  if (x > 14) return 'kitchen';
  return 'dining';
}

// --- Noches --------------------------------------------------------------------------------
// Nivel de IA (0-20) de cada animatrónico por noche.
export const NIGHTS = [
  null,
  { bear: 1, bunny: 3, chicken: 2, fox: 1 },
  { bear: 2, bunny: 5, chicken: 4, fox: 3 },
  { bear: 3, bunny: 8, chicken: 7, fox: 6 },
  { bear: 5, bunny: 11, chicken: 10, fox: 9 },
  { bear: 8, bunny: 14, chicken: 13, fox: 12 },
  { bear: 12, bunny: 17, chicken: 16, fox: 16 },
];
export const MAX_NIGHT = 6;

export const FNAF_MODES = {
  classic: { name: 'Guardia cooperativo', icon: '🛡️', min: 1, desc: 'El clásico: 1 a 4 guardias en la oficina. Vigilad las cámaras, cerrad puertas, encended luces y que no se acabe la energía hasta las 6:00.' },
  team: { name: 'Supervivencia por equipos', icon: '🧰', min: 1, desc: 'Como el clásico, pero con eventos inesperados y tareas arriesgadas fuera de la oficina que dan energía y recompensas.' },
  versus: { name: 'Animatrónico contra guardias', icon: '🐻', min: 2, desc: 'Uno o dos jugadores son animatrónicos y el resto guardias. Los animatrónicos se mueven por las salas, se congelan si los miran y atacan si una puerta queda abierta.' },
  last: { name: 'Último superviviente', icon: '🔦', min: 1, desc: 'Todos sueltos por la pizzería con una linterna. Los animatrónicos cazan: deslúmbralos, comparte pilas… o no. Gana quien quede en pie.' },
};

export const ROLES = {
  free: { name: 'Libre', icon: '🙂', desc: 'Sin especialidad' },
  cams: { name: 'Cámaras', icon: '📹', desc: 'Tu monitor no gasta energía y te avisa de movimientos' },
  doors: { name: 'Puertas', icon: '🚪', desc: 'Las puertas que cierras gastan la mitad' },
  lights: { name: 'Luces', icon: '💡', desc: 'Tu linterna ahuyenta el doble de rápido' },
  power: { name: 'Energía', icon: '🔋', desc: 'Puedes usar el generador: modo ahorro y reinicio de emergencia' },
};

// --- Mapa --------------------------------------------------------------------------------
export function buildFnaf() {
  const g = new WorldGen('fn');
  const H = 4.6, T = 0.4;
  const WALL = '#3b3a45', WALL2 = '#2f2e3a', TRIM = '#7a1f2b';
  const wallX = (x0, x1, z, c = WALL) => g.block([(x0 + x1) / 2, H / 2, z], [x1 - x0 + T, H, T], c, 'brick');
  const wallZ = (z0, z1, x, c = WALL) => g.block([x, H / 2, (z0 + z1) / 2], [T, H, z1 - z0 + T], c, 'brick');
  /** Pared con hueco de puerta centrado en `at` (ancho w). */
  const wallXGap = (x0, x1, z, at, w = 2.8, c = WALL) => {
    if (at - w / 2 > x0) wallX(x0, at - w / 2, z, c);
    if (at + w / 2 < x1) wallX(at + w / 2, x1, z, c);
    g.block([at, H - 0.55, z], [w, 1.1, T], c, 'brick');
  };
  const wallZGap = (z0, z1, x, at, w = 2.8, c = WALL) => {
    if (at - w / 2 > z0) wallZ(z0, at - w / 2, x, c);
    if (at + w / 2 < z1) wallZ(at + w / 2, z1, x, c);
    g.block([x, H - 0.55, at], [T, 1.1, w], c, 'brick');
  };
  const floor = (x0, x1, z0, z1, c, m = 'plastic') => g.block([(x0 + x1) / 2, 0.05, (z0 + z1) / 2], [x1 - x0, 0.1, z1 - z0], c, m, { nc: true });
  const deco = (p, s, c, m = 'plastic', extra = {}) => g.block(p, s, c, m, { nc: true, ...extra });

  // Suelo general y techo
  g.block([0, -0.05, 0], [52, 0.1, 58], '#1d1b22', 'stone');
  g.block([0, H + 0.2, 0], [52, 0.4, 58], '#15141a', 'stone');

  // Comedor: suelo de cuadros
  for (let x = -14; x < 14; x += 2) for (let z = -16; z < 2; z += 2) {
    deco([x + 1, 0.06, z + 1], [2, 0.02, 2], ((x + z) / 2) % 2 === 0 ? '#e8e8e8' : '#1b1b1b');
  }
  floor(-10, 10, -24, -16, '#3b2a20', 'wood');
  floor(-22, -10, -26, -16, '#2c2a26', 'stone');
  floor(10, 22, -26, -16, '#cfd8dc', 'stone');
  floor(14, 22, -12, 2, '#9e9e9e', 'stone');
  floor(-22, -14, -12, -2, '#3e2723', 'wood');
  floor(-9, -5, 2, 26, '#2b2b33', 'stone');
  floor(5, 9, 2, 26, '#2b2b33', 'stone');
  floor(-15, -9, 6, 12, '#33302b', 'stone');
  floor(-5, 5, 16, 26, '#3a3d4a', 'stone');

  // --- Paredes exteriores e interiores
  wallX(-22, 22, -26); // fondo (bastidores / baños)
  wallX(-10, 10, -24, '#2a1840'); // fondo del escenario
  wallZ(-26, -16, -22); wallZ(-26, -16, 22);
  wallZ(-26, -16, -10); wallZ(-26, -16, 10);
  // Bastidores y baños: pared sur con puerta hacia el comedor
  wallXGap(-22, -10, -16, -12);
  wallXGap(10, 22, -16, 12);
  // Pared oeste del comedor con la entrada de la Cala Pirata
  wallZ(-16, -12, -14); wallZ(-2, 2, -14);
  g.block([-14, H - 0.6, -7], [T, 1.2, 10], WALL, 'brick');
  // Cala Pirata
  wallX(-22, -14, -12); wallX(-22, -14, -2); wallZ(-12, -2, -22);
  // Pared este del comedor con la puerta de la cocina
  wallZGap(-16, 2, 14, -6);
  wallX(14, 22, -12); wallZ(-12, 2, 22); wallX(14, 22, 2);
  // Pared sur del comedor con los dos pasillos
  wallX(-14, -9, 2); wallX(-5, 5, 2); wallX(9, 14, 2);
  // Pasillos
  wallZGap(2, 26, -9, 9, 2.6);
  wallZ(2, 16, -5); wallZ(2, 16, 5);
  wallZ(2, 26, 9);
  wallX(-9, -5, 26); wallX(5, 9, 26);
  // Almacén
  wallX(-15, -9, 6); wallX(-15, -9, 12); wallZ(6, 12, -15);
  // Bloque macizo entre pasillos (detrás de la oficina)
  g.block([0, H / 2, 9], [9.6, H, 13.6], WALL2, 'brick');
  // Oficina: paredes con los huecos de las puertas de seguridad
  wallX(-5, 5, 16, '#4a4f5c');
  wallX(-5, 5, 26, '#4a4f5c');
  wallZGap(16, 26, -5, 20.5, 3, '#4a4f5c');
  wallZGap(16, 26, 5, 20.5, 3, '#4a4f5c');
  // Puertas de acero (se mueven con el estado de la partida)
  g.block(FNAF.doors.L.p, [0.35, 3.2, 3], '#5f6670', 'metal', { id: 'fdoorL', sep: true });
  g.block(FNAF.doors.R.p, [0.35, 3.2, 3], '#5f6670', 'metal', { id: 'fdoorR', sep: true });
  // Franja de advertencia sobre las puertas
  for (const s of [-1, 1]) deco([s * 4.85, 3.35, 20.5], [0.1, 0.25, 3.2], '#fdd835', 'neon');

  // --- Oficina
  deco([0, 0.9, 17.4], [5.2, 0.12, 1.6], '#5d4037', 'wood'); // mesa
  g.block([0, 0.45, 17.4], [5, 0.9, 1.4], '#4e342e', 'wood');
  deco([-0.9, 1.35, 17.2], [1.1, 0.8, 0.5], '#263238', 'metal'); // monitores
  deco([0.6, 1.3, 17.2], [0.9, 0.7, 0.5], '#263238', 'metal');
  deco([-0.9, 1.35, 17.46], [0.95, 0.65, 0.02], '#0d2b1a', 'neon');
  deco([0.6, 1.3, 17.46], [0.75, 0.55, 0.02], '#0d2b1a', 'neon');
  deco([1.9, 1.25, 17.3], [0.5, 0.6, 0.5], '#9e9e9e', 'metal'); // ventilador
  deco([1.9, 1.6, 17.3], [0.7, 0.7, 0.08], '#bdbdbd', 'metal');
  deco([-2, 1.05, 17.6], [0.3, 0.3, 0.2], '#e53935'); // taza
  deco([0, 2.6, 16.25], [3, 1.4, 0.06], '#1b1b22', 'glass'); // pizarra con dibujos
  for (let i = 0; i < 6; i++) deco([-1.2 + i * 0.5, 2.6 + (i % 2) * 0.3, 16.3], [0.35, 0.45, 0.02], ['#ef5350', '#ffca28', '#42a5f5', '#66bb6a'][i % 4]);
  g.add('sign', [3, 2.8, 16.3], [2, 0.8, 0.1], '#fdd835', 'wood', { text: '¡CELEBRA!' });
  for (const s of [-1, 1]) deco([s * 4.75, 1.4, 18.3], [0.12, 0.9, 0.5], '#37474f', 'metal'); // paneles de puertas
  deco([0, 1.3, 25.75], [1.6, 1.6, 0.4], '#455a64', 'metal'); // generador
  deco([0, 1.3, 25.5], [0.6, 0.3, 0.06], '#ff6f00', 'neon');
  g.add('light', [0, 4, 21], [0.5, 0.2, 0.5], '#ffe9b0', 'neon', { group: 'office', intensity: 0.9, range: 12 });

  // --- Escenario
  g.block([0, 0.4, -20], [16, 0.8, 7], '#4a148c', 'wood');
  deco([0, 2.6, -23.6], [18, 4, 0.2], '#311b92', 'plastic'); // telón
  for (let i = 0; i < 7; i++) deco([-7.5 + i * 2.5, 3.6, -23.4], [0.5, 0.5, 0.05], '#fdd835', 'neon'); // estrellas
  g.add('sign', [0, 4, -23.3], [6, 1, 0.1], '#e91e63', 'wood', { text: 'PIZZERÍA KESTY' });
  for (const s of [-1, 1]) {
    g.add('cylinder', [s * 7.5, 1.5, -18], [0.6, 1.4, 0.6], '#212121', 'metal'); // altavoces
    deco([s * 7.5, 1.6, -17.7], [0.5, 0.5, 0.05], '#424242', 'metal');
  }
  // --- Comedor: mesas largas con gorros de fiesta
  for (const tz of [-12.5, -4]) for (const tx of [-8.5, 8.5]) {
    g.block([tx, 0.8, tz], [4, 0.12, 1.8], '#eceff1', 'plastic');
    for (const a of [-1.6, 1.6]) g.block([tx + a, 0.4, tz], [0.2, 0.8, 1.4], '#9e9e9e', 'metal');
    deco([tx, 0.87, tz], [4.1, 0.02, 1.9], '#e53935');
    for (let k = 0; k < 4; k++) g.add('cylinder', [tx - 1.5 + k * 1, 1.05, tz + (k % 2 ? 0.5 : -0.5)], [0.25, 0.35, 0.25], ['#ffeb3b', '#29b6f6', '#ab47bc', '#66bb6a'][k], 'plastic', { nc: true });
    for (const sz of [-1.3, 1.3]) for (let k = 0; k < 3; k++) g.add('cylinder', [tx - 1.3 + k * 1.3, 0.45, tz + sz], [0.5, 0.9, 0.5], '#b71c1c', 'plastic', { nc: true });
  }
  // Guirnaldas y carteles
  for (let i = 0; i < 14; i++) deco([-13 + i * 2, 4.1, -15.6], [0.8, 0.5, 0.05], ['#ef5350', '#ffca28', '#42a5f5', '#66bb6a', '#ab47bc'][i % 5]);
  g.add('sign', [-13.75, 2.6, -14], [0.1, 1, 2.6], '#fdd835', 'wood', { text: 'CALA PIRATA' });
  g.add('sign', [13.75, 2.6, 0], [0.1, 1, 3], '#fdd835', 'wood', { text: 'LAVA TUS MANOS' });
  for (const x of [-11.5, 11.5]) deco([x, 2.2, 1.75], [1.6, 2, 0.05], '#263238');
  // Cala Pirata: cortinas moradas y cartel
  deco([-14.2, 2.2, -9.5], [0.1, 3.4, 4.6], '#6a1b9a', 'plastic');
  deco([-14.2, 2.2, -4.5], [0.1, 3.4, 1.6], '#6a1b9a', 'plastic');
  g.add('sign', [-18, 3.4, -11.7], [3.4, 0.9, 0.1], '#3e2723', 'wood', { text: 'FUERA DE SERVICIO' });
  g.block([-18.5, 0.25, -7], [5, 0.5, 6], '#4e342e', 'wood'); // tarima
  for (let i = 0; i < 5; i++) deco([-21.6, 0.9 + i * 0.6, -7], [0.05, 0.3, 4], '#fdd835', 'neon');
  // Bastidores: cabezas de repuesto en estanterías
  g.block([-21.2, 1.2, -21], [1.2, 2.4, 8], '#4e342e', 'wood');
  for (let i = 0; i < 4; i++) g.add('sphere', [-21, 2.7, -24 + i * 2], [0.9, 0.9, 0.9], ['#7b4a2a', '#5c6bc0', '#fbc02d', '#c62828'][i], 'plastic', { nc: true });
  g.block([-15, 0.5, -24.5], [4, 1, 1.6], '#5d4037', 'wood');
  // Baños
  for (let i = 0; i < 3; i++) {
    g.block([12.5 + i * 3.2, 1.3, -24.6], [0.2, 2.6, 2.4], '#90a4ae', 'metal');
    deco([14 + i * 3.2, 0.4, -25.2], [0.8, 0.8, 0.8], '#fafafa');
  }
  g.add('sign', [16, 3.2, -16.3], [3, 0.8, 0.1], '#29b6f6', 'wood', { text: 'BAÑOS' });
  // Cocina
  g.block([21, 0.5, -5], [1.6, 1, 12], '#9e9e9e', 'metal');
  g.block([17, 0.5, -11], [6, 1, 1.4], '#9e9e9e', 'metal');
  for (let i = 0; i < 3; i++) g.add('cylinder', [21, 1.2, -9 + i * 3], [0.8, 0.5, 0.8], '#616161', 'metal', { nc: true });
  // Almacén
  for (let i = 0; i < 4; i++) g.add('deco', [-14 + (i % 2) * 1.4, 0.5 + Math.floor(i / 2) * 1, 6.9], [1, 1, 1], '#8d6e63', 'wood', { kind: 'crate', nc: true });
  g.block([-14.4, 1, 10.5], [1, 2, 3], '#5d4037', 'wood');
  // Pasillos: carteles infantiles y manchas
  for (let z = 4; z < 24; z += 4) {
    deco([-8.75, 2.2, z], [0.05, 1.2, 0.9], ['#ef5350', '#42a5f5', '#66bb6a', '#ffca28'][(z / 4) % 4]);
    deco([8.75, 2.2, z], [0.05, 1.2, 0.9], ['#ab47bc', '#ffca28', '#ef5350', '#42a5f5'][(z / 4) % 4]);
  }
  g.add('sign', [-8.7, 3, 18], [0.1, 0.7, 2.4], '#ffffff', 'wood', { text: 'SALIDA' });

  // Bombillas del local (se apagan de noche)
  for (const [x, z] of [[-7, -10], [7, -10], [0, -3], [-7, -1], [7, -1], [0, -19], [-16, -21], [16, -21], [18, -5], [-18, -7], [-7, 8], [7, 8], [-12, 9], [-7, 18], [7, 18]]) {
    g.add('light', [x, H - 0.3, z], [0.4, 0.2, 0.4], '#fff3c4', 'neon', { group: 'fnafLights', intensity: 1.2, range: 13 });
  }

  // Cabina de control (lejos del local, cerrada): jugadores animatrónicos y espectadores
  const [bx, , bz] = FNAF.booth;
  g.block([bx, 0, bz], [6, 0.4, 6], '#111111', 'stone');
  wallX(bx - 3, bx + 3, bz - 3, '#111111'); wallX(bx - 3, bx + 3, bz + 3, '#111111');
  wallZ(bz - 3, bz + 3, bx - 3, '#111111'); wallZ(bz - 3, bz + 3, bx + 3, '#111111');

  return {
    version: 1,
    terrain: { type: 'flat', size: 180, height: -0.2, color: '#0b0b0e' },
    water: null,
    sky: { time: 0.02, dayNight: false, fog: true },
    bounds: { min: [-90, -20, -90], max: [90, 40, 90] },
    spawns: FNAF.lobbySpawns,
    objects: g.objects,
    vehicles: [],
    meta: { mode: 'fnaf' },
  };
}
