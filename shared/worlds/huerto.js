// Kest Huerto: cada jugador recibe una parcela, compra semillas, planta, espera a que
// crezcan (también mientras está desconectado) y vende la cosecha en el puesto.
// Las mutaciones (dorada, arcoíris) multiplican el precio. Tu huerto se guarda.
import { WorldGen } from './builder.js';

export const SEEDS = {
  carrot: { name: 'Zanahoria', icon: '🥕', price: 10, grow: 30, sell: 16, regrow: false, color: '#ff9800' },
  strawberry: { name: 'Fresa', icon: '🍓', price: 30, grow: 45, sell: 12, regrow: true, color: '#e53935' },
  tomato: { name: 'Tomate', icon: '🍅', price: 60, grow: 80, sell: 22, regrow: true, color: '#f44336' },
  corn: { name: 'Maíz', icon: '🌽', price: 90, grow: 120, sell: 70, regrow: false, color: '#fdd835' },
  watermelon: { name: 'Sandía', icon: '🍉', price: 160, grow: 210, sell: 190, regrow: false, color: '#43a047' },
  pumpkin: { name: 'Calabaza', icon: '🎃', price: 320, grow: 300, sell: 360, regrow: false, color: '#fb8c00' },
  mango: { name: 'Mango', icon: '🥭', price: 800, grow: 420, sell: 180, regrow: true, color: '#ffb300' },
  starfruit: { name: 'Fruta estrella', icon: '⭐', price: 2500, grow: 900, sell: 2400, regrow: false, color: '#ffee58' },
};
export const SEED_IDS = Object.keys(SEEDS);
export const MUTATIONS = {
  gold: { name: 'Dorada', mult: 5, chance: 0.05 },
  rainbow: { name: 'Arcoíris', mult: 15, chance: 0.012 },
};
export const HUERTO = { plots: 8, cols: 6, rows: 4, spacing: 2.8, startCash: 30, rainBoost: 2 };

/** Centro de la parcela k y posición de cada casilla. */
export function plotCenter(k) {
  return [-45 + (k % 4) * 30, k < 4 ? -24 : 24];
}
export function tilePos(k, t) {
  const [x, z] = plotCenter(k);
  const c = t % HUERTO.cols, r = Math.floor(t / HUERTO.cols);
  return [x + (c - (HUERTO.cols - 1) / 2) * HUERTO.spacing, z + (r - (HUERTO.rows - 1) / 2) * HUERTO.spacing];
}
export const SHOP_POS = [0, 0];

export function buildHuerto() {
  const g = new WorldGen('hu');
  // Camino central y puesto de semillas
  g.block([0, 0.03, 0], [130, 0.06, 10], '#bcaaa4', 'sand', { nc: true });
  g.block([0, 0.03, 0], [10, 0.06, 80], '#bcaaa4', 'sand', { nc: true });
  g.block([0, 1, -1.5], [7, 2, 2], '#8d6e63', 'wood');
  g.block([0, 3.6, -1.5], [8, 0.3, 3.4], '#e53935', 'plastic');
  for (const x of [-3.6, 3.6]) g.block([x, 1.8, -2.8], [0.25, 3.6, 0.25], '#5d4037', 'wood');
  g.add('sign', [0, 4.4, -1.5], [7, 1.4, 0.2], '#fff8e1', 'wood', { text: 'SEMILLAS Y VENTA' });
  for (const [x, c] of [[-2.2, '#ff9800'], [0, '#e53935'], [2.2, '#43a047']]) g.add('sphere', [x, 2.3, -1.5], [0.8, 0.6, 0.8], c, 'plastic');

  // Parcelas valladas con tierra
  for (let k = 0; k < HUERTO.plots; k++) {
    const [x, z] = plotCenter(k);
    const w = HUERTO.cols * HUERTO.spacing + 2, d = HUERTO.rows * HUERTO.spacing + 2;
    g.block([x, 0.08, z], [w, 0.16, d], '#5d4037', 'grass', { nc: true });
    const fz = z + (k < 4 ? -1 : 1) * (d / 2 + 0.6);
    g.block([x, 0.5, fz], [w + 1.2, 1, 0.2], '#efebe9', 'wood');
    for (const s of [-1, 1]) g.block([x + s * (w / 2 + 0.6), 0.5, z], [0.2, 1, d + 1.2], '#efebe9', 'wood');
    g.add('sign', [x + w / 2 - 1, 1.2, z + (k < 4 ? 1 : -1) * (d / 2 + 0.9)], [2.4, 0.9, 0.15], '#a5d6a7', 'wood', { text: `Parcela ${k + 1}` });
  }
  // Árboles, flores y un molino decorativo
  for (let i = 0; i < 14; i++) {
    const x = -70 + i * 11, z = i % 2 ? 44 : -44;
    g.add('tree', [x, 3, z], [3, 6, 3], '#43a047', 'grass');
  }
  for (let i = 0; i < 20; i++) g.add('deco', [-60 + i * 6.3, 0.3, i % 2 ? 6.5 : -6.5], [0.6, 0.6, 0.6], ['#ff80ab', '#ffeb3b', '#b388ff'][i % 3], 'plastic', { kind: 'flower' });
  g.block([62, 6, 0], [5, 12, 5], '#d7ccc8', 'brick');
  g.add('cylinder', [62, 13, 0], [5.4, 2, 5.4], '#8d6e63', 'wood');

  return {
    version: 1,
    terrain: { type: 'flat', size: 260, height: 0, color: '#7cb342' },
    water: null,
    sky: { time: 0.33, dayNight: false, fog: true },
    bounds: { min: [-130, -20, -130], max: [130, 80, 130] },
    spawns: [[-3, 0.2, 5], [3, 0.2, 5], [0, 0.2, 6]],
    objects: g.objects,
    vehicles: [],
    meta: { mode: 'huerto' },
  };
}
