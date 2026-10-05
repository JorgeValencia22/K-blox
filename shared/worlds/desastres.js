// Desastres Naturales: una isla con casas, una torre y una colina. Cada ronda llega un
// desastre natural (inundación, lava, meteoritos, tornado, terremoto o lluvia ácida)
// y hay que sobrevivir hasta el final. Entre rondas se espera en la plataforma del cielo.
import { WorldGen } from './builder.js';
import { mulberry32 } from '../terrain.js';

export const DISASTERS = {
  flood: { name: 'Inundación', icon: '🌊', tip: '¡Sube a lo alto! El agua no deja de crecer' },
  lava: { name: 'Lava', icon: '🌋', tip: 'La lava sube: busca un tejado o la torre' },
  meteor: { name: 'Lluvia de meteoritos', icon: '☄️', tip: 'Mira al cielo y esquiva las sombras' },
  tornado: { name: 'Tornado', icon: '🌪️', tip: 'Aléjate del remolino o saldrás volando' },
  quake: { name: 'Terremoto', icon: '🫨', tip: 'Caen rocas: no te quedes quieto' },
  acid: { name: 'Lluvia ácida', icon: '☢️', tip: 'Ponte bajo techo para no perder vida' },
};
export const DISASTER_IDS = Object.keys(DISASTERS);
export const DESASTRES = { lobbyY: 70, island: 52, roundSeconds: 60, lobbySeconds: 18 };

/** Altura del agua o la lava (y) a los t segundos del desastre. */
export function riseLevel(kind, t) {
  if (kind === 'flood') return -0.6 + Math.min(1, Math.max(0, t - 6) / 38) * 9.6;
  if (kind === 'lava') return -0.6 + Math.min(1, Math.max(0, t - 6) / 40) * 6.4;
  return -0.6;
}

/** Lista determinista de impactos (meteoritos o rocas) a partir de la semilla de la ronda. */
export function impacts(kind, seed) {
  const rnd = mulberry32(seed);
  const list = [];
  const n = kind === 'meteor' ? 70 : kind === 'quake' ? 90 : 0;
  const S = DESASTRES.island;
  for (let i = 0; i < n; i++) {
    const t = 5 + rnd() * 52;
    list.push({ t, x: (rnd() * 2 - 1) * S * 0.9, z: (rnd() * 2 - 1) * S * 0.9, r: kind === 'meteor' ? 4.5 : 2.8 });
  }
  return list.sort((a, b) => a.t - b.t);
}

/** Centro del tornado a los t segundos. */
export function tornadoAt(seed, t) {
  const a = (seed % 100) / 15.9;
  return { x: Math.sin(t * 0.13 + a) * 34, z: Math.sin(t * 0.21 + a * 2) * 30 };
}

export function buildDesastres() {
  const g = new WorldGen('ds');
  const rnd = mulberry32(777);
  const S = DESASTRES.island;
  // Isla (la parte superior está en y = 0) y arena
  g.block([0, -1, 0], [S * 2, 2, S * 2], '#7cb342', 'grass');
  g.block([0, -1.2, 0], [S * 2 + 8, 2, S * 2 + 8], '#e6d29a', 'sand');

  // Casas con tejado (para ponerse a cubierto y subir)
  const houses = [[-28, -26, 's', '#ffccbc'], [26, -28, 'w', '#c5e1a5'], [-30, 24, 'e', '#b3e5fc'], [24, 26, 'n', '#fff59d']];
  for (const [x, z, f, c] of houses) {
    g.building(x, 0, z, 12, 10, 5, f, { wall: c, roof: '#8d6e63' });
    g.add('stairs', [x + (f === 'e' ? -9 : 9), 2.6, z], [3, 5.2, 6], '#a1887f', 'wood').ry = f === 'e' ? 90 : -90;
  }
  // Torre de tres pisos con escaleras exteriores
  for (let k = 0; k < 3; k++) {
    const y = 6 + k * 6;
    g.block([0, y, 0], [10, 0.6, 10], '#90a4ae', 'stone');
    for (const [a, b] of [[-4.5, -4.5], [4.5, -4.5], [-4.5, 4.5], [4.5, 4.5]]) g.block([a, y - 3, b], [0.8, 6, 0.8], '#78909c', 'stone');
    g.add('stairs', [k % 2 ? -6.5 : 6.5, y - 3 + 0.3, 0], [3, 6, 8], '#b0bec5', 'stone').ry = k % 2 ? 0 : 180;
  }
  g.block([0, 18.9, 0], [10.6, 0.4, 10.6], '#ef5350', 'plastic'); // tejado de la torre
  g.add('sign', [0, 2, 5.6], [4, 1.2, 0.2], '#ffffff', 'wood', { text: 'TORRE' });
  // Colina
  g.add('wedge', [36, 2, 0], [12, 4, 14], '#689f38', 'grass').ry = 90;
  g.block([46, 2, 0], [8, 4, 14], '#689f38', 'grass');
  // Gasolinera: marquesina (refugio contra la lluvia ácida y los meteoritos pequeños) y tienda
  {
    const x = 0, z = 38;
    for (const [a, b] of [[-6, -4], [6, -4], [-6, 4], [6, 4]]) g.block([x + a, 2.5, z + b], [0.6, 5, 0.6], '#eceff1', 'metal');
    g.block([x, 5.2, z], [15, 0.5, 11], '#e53935', 'metal');
    for (const a of [-3, 3]) g.block([x + a, 0.8, z], [1, 1.6, 0.8], '#fdd835', 'metal');
    g.block([x + 13, 1.75, z], [8, 3.5, 7], '#fff3e0', 'brick');
    g.block([x + 13, 3.7, z], [8.6, 0.4, 7.6], '#c62828', 'plastic');
    g.add('sign', [x, 6.4, z + 5.6], [6, 1.2, 0.2], '#ffffff', 'metal', { text: 'GASOLINERA' });
    houses.push([x, z], [x + 13, z]);
  }
  // Edificio de 4 plantas con escalera exterior (lo más alto de la isla tras la torre)
  {
    const x = -42, z = 0;
    for (let k = 0; k < 4; k++) {
      const y = k * 4;
      g.block([x, y + 0.2, z], [9, 0.4, 9], '#cfd8dc', 'stone');
      g.block([x - 4.3, y + 2.2, z], [0.4, 4, 9], '#90a4ae', 'brick');
      g.block([x, y + 2.2, z - 4.3], [9, 4, 0.4], '#90a4ae', 'brick');
      g.block([x, y + 2.2, z + 4.3], [9, 4, 0.4], '#90a4ae', 'brick');
      g.add('stairs', [x + 6, y + 2, z + (k % 2 ? 2 : -2)], [2.4, 4, 5], '#78909c', 'stone').ry = k % 2 ? 180 : 0;
    }
    g.block([x, 16.2, z], [9.6, 0.4, 9.6], '#546e7a', 'stone');
    g.add('sign', [x + 4.7, 1.5, z], [0.2, 1, 3], '#ffffff', 'wood', { text: 'PISOS' });
    houses.push([x, z]);
  }
  // Muelle con barcas (en la inundación flotan… o no)
  {
    g.block([0, 0.1, -58], [4, 0.4, 16], '#a1887f', 'wood');
    for (const k of [-6, 0, 6]) for (const s of [-1, 1]) g.block([s * 1.8, -1, -58 + k], [0.4, 2.4, 0.4], '#6d4c41', 'wood');
    for (const [x, z, c] of [[-5, -60, '#ef5350'], [5, -55, '#42a5f5']]) {
      g.block([x, -0.3, z], [2.6, 0.8, 6], c, 'wood');
      g.block([x, 0.15, z], [2, 0.1, 5], '#8d6e63', 'wood', { nc: true });
    }
  }
  // Parque infantil
  {
    const x = 40, z = 42;
    g.block([x, 0.03, z], [12, 0.06, 10], '#ffcc80', 'sand', { nc: true });
    g.block([x - 3, 1.5, z], [3, 3, 3], '#ab47bc', 'plastic');
    g.add('wedge', [x + 1, 1.5, z], [3, 3, 5], '#ffee58', 'plastic').ry = -90;
    g.add('stairs', [x - 3, 1.5, z - 3], [2, 3, 3], '#42a5f5', 'plastic');
    for (const a of [-1, 1]) g.block([x + a * 2, 1.6, z + 4], [0.2, 3.2, 0.2], '#e53935', 'metal');
    g.block([x, 3.2, z + 4], [4.2, 0.2, 0.2], '#e53935', 'metal');
    houses.push([x, z]);
  }

  // Árboles y rocas
  for (let i = 0; i < 26; i++) {
    const x = (rnd() * 2 - 1) * S * 0.85, z = (rnd() * 2 - 1) * S * 0.85;
    if (Math.abs(x) < 12 && Math.abs(z) < 12) continue;
    if (houses.some(([hx, hz]) => Math.abs(hx - x) < 10 && Math.abs(hz - z) < 9)) continue;
    if (i % 4 === 0) g.add('deco', [x, 0.5, z], [1.6, 1, 1.6], '#9e9e9e', 'stone', { kind: 'rock' });
    else g.add('tree', [x, 3, z], [3, 6, 3], '#43a047', 'grass');
  }

  // Plataforma de espera en el cielo
  const L = DESASTRES.lobbyY;
  g.block([0, L - 0.5, 0], [26, 1, 26], '#eceff1', 'stone');
  for (const [x, z, sx, sz] of [[0, -13, 26, 0.5], [0, 13, 26, 0.5], [-13, 0, 0.5, 26], [13, 0, 0.5, 26]]) g.block([x, L + 0.6, z], [sx, 1.2, sz], '#b0bec5', 'glass');
  g.add('sign', [0, L + 3, -12.5], [12, 2.4, 0.2], '#263238', 'metal', { text: 'DESASTRES NATURALES' });
  g.add('jumppad', [8, L + 0.2, 8], [2.4, 0.4, 2.4], '#ab47bc', 'neon', { power: 18 });

  return {
    version: 1,
    terrain: { type: 'flat', size: 400, height: -6, color: '#c2b280' },
    water: null,
    sky: { time: 0.4, dayNight: false, fog: true },
    bounds: { min: [-200, -30, -200], max: [200, 120, 200] },
    spawns: [[-4, L + 0.2, 4], [4, L + 0.2, 4], [0, L + 0.2, 0], [-4, L + 0.2, -4], [4, L + 0.2, -4]],
    objects: g.objects,
    vehicles: [],
    meta: { mode: 'desastres', island: S, lobbyY: L },
  };
}
