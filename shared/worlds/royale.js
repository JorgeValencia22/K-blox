// Isla Royale: isla de batalla. Botín en cofres, tormenta que se cierra,
// construcción de muros y rampas y el último en pie gana.
import { WorldGen } from './builder.js';
import { getHeightmap, mulberry32 } from '../terrain.js';

export function buildRoyale() {
  const terrain = { type: 'hills', size: 280, seed: 21, amp: 6 };
  const hm = getHeightmap(terrain);
  const g = new WorldGen('b');
  const rnd = mulberry32(404);
  const ground = (x, z) => hm.heightAt(x, z);
  const land = (x, z) => ground(x, z) > 1.2;

  // Pueblos: casas huecas con puertas y un cofre dentro
  const towns = [[-60, -50], [55, -40], [-30, 60], [60, 55], [10, -85]];
  const chests = [];
  towns.forEach(([tx, tz], ti) => {
    for (let k = 0; k < 3; k++) {
      const x = tx + (k - 1) * 14, z = tz + (k % 2 ? 8 : -6);
      if (!land(x, z)) continue;
      const y = ground(x, z);
      g.block([x, y - 1.4, z], [10, 3, 9], '#8d6e63', 'stone'); // cimientos
      g.building(x, y + 0.1, z, 9, 8, 4.5, ['n', 's', 'e', 'w'][(ti + k) % 4], {
        wall: ['#ffe0b2', '#c5e1a5', '#b3e5fc', '#f8bbd0'][(ti + k) % 4], roof: ['#6d4c41', '#37474f', '#c62828'][k % 3],
      });
      chests.push([x + 2, y + 0.6, z + 1.5]);
    }
  });
  // Lugares nuevos: castillo, granja, torre del mago y cabañas de playa
  const poi = (x, z, r = 0) => {
    towns.push([x, z]);
    let m = ground(x, z);
    for (let a = -r; a <= r; a += 3) for (let b = -r; b <= r; b += 3) m = Math.max(m, ground(x + a, z + b));
    return m;
  };
  {
    // Castillo con muralla, torres y patio (cofre en lo alto de la torre del homenaje)
    const x = 90, z = -5, y = poi(x, z, 15);
    g.block([x, y - 4, z], [30, 8.2, 30], '#9e9e9e', 'stone');
    for (const [a, b, sx, sz] of [[0, -14.5, 30, 1], [0, 14.5, 30, 1], [14.5, 0, 1, 30], [-14.5, -9, 1, 12], [-14.5, 9, 1, 12]]) g.block([x + a, y + 2.5, z + b], [sx, 5, sz], '#bdbdbd', 'stone');
    for (const [a, b] of [[-14.5, -14.5], [14.5, -14.5], [-14.5, 14.5], [14.5, 14.5]]) g.add('cylinder', [x + a, y + 4, z + b], [4, 8, 4], '#9e9e9e', 'stone');
    g.block([x + 4, y + 5, z], [8, 10, 8], '#bdbdbd', 'stone');
    g.add('stairs', [x - 3, y + 5, z], [3, 10, 6], '#757575', 'stone').ry = 90;
    g.block([x + 4, y + 10.2, z], [8.4, 0.4, 8.4], '#757575', 'stone');
    chests.push([x + 5, y + 10.9, z]);
    chests.push([x - 8, y + 0.6, z + 8]);
  }
  {
    // Granja con granero, silo y vallas
    const x = -95, z = 15, y = poi(x, z, 7);
    g.block([x, y - 2.9, z], [14, 6, 12], '#8d6e63', 'stone');
    g.building(x, y + 0.1, z, 12, 10, 6, 'e', { wall: '#c62828', roof: '#5d4037', material: 'wood', noWindows: true });
    g.add('cylinder', [x + 2, y + 5, z - 11], [5, 10, 5], '#cfd8dc', 'metal');
    g.add('sphere', [x + 2, y + 10, z - 11], [5, 3, 5], '#90a4ae', 'metal', { nc: true });
    for (let i = 0; i < 6; i++) g.block([x + 9, y + 0.6, z - 10 + i * 4], [0.2, 1.2, 4], '#efebe9', 'wood');
    g.add('deco', [x + 4, y + 0.6, z + 3], [1.4, 1.2, 1.4], '#fdd835', 'grass', { kind: 'crate' });
    chests.push([x - 2, y + 0.6, z]);
  }
  {
    // Torre del mago: muy alta, con escaleras exteriores y cofre arriba
    const x = -10, z = -40, y = poi(x, z, 4);
    g.block([x, y - 2.9, z], [8, 6, 8], '#5e35b1', 'stone');
    g.add('cylinder', [x, y + 9, z], [5, 18, 5], '#7e57c2', 'stone');
    for (let k = 0; k < 3; k++) {
      g.add('stairs', [x + 4, y + 3 + k * 6, z + (k % 2 ? 1.5 : -1.5)], [2, 6, 5], '#9575cd', 'stone').ry = k % 2 ? 180 : 0;
      g.block([x + 4, y + 6 + k * 6, z + (k % 2 ? -2.5 : 2.5)], [2.4, 0.3, 2.4], '#9575cd', 'stone');
    }
    g.block([x, y + 18.2, z], [7, 0.4, 7], '#4527a0', 'stone');
    g.add('cylinder', [x, y + 20.5, z], [5, 0.4, 5], '#311b92', 'stone', { nc: true });
    chests.push([x, y + 18.9, z]);
  }
  {
    // Cabañas de playa con muelle
    const x = 5, z = 95;
    poi(x, z);
    for (let k = 0; k < 3; k++) {
      const hx = x + (k - 1) * 9, hy = ground(hx, z);
      g.block([hx, hy + 1, z], [5, 0.4, 5], '#a1887f', 'wood');
      for (const [a, b] of [[-2.2, -2.2], [2.2, -2.2], [-2.2, 2.2], [2.2, 2.2]]) g.block([hx + a, hy, z + b], [0.4, 2.2, 0.4], '#6d4c41', 'wood');
      g.add('wedge', [hx, hy + 2.5, z - 1.3], [5.4, 1.6, 2.6], '#ffcc80', 'grass').ry = 180;
      g.add('wedge', [hx, hy + 2.5, z + 1.3], [5.4, 1.6, 2.6], '#ffcc80', 'grass');
    }
    chests.push([x, ground(x, z) + 1.7, z]);
  }

  // Cofres sueltos por el mapa
  for (let i = 0; i < 400 && chests.length < 32; i++) {
    const x = (rnd() - 0.5) * 220, z = (rnd() - 0.5) * 220;
    if (!land(x, z) || chests.some((c) => Math.hypot(c[0] - x, c[2] - z) < 25)) continue;
    chests.push([x, ground(x, z) + 0.5, z]);
  }
  chests.forEach((c, i) => g.add('chest', c, [1.4, 1, 1], '#ffb300', 'wood', { id: `loot${i}` }));

  // Vegetación y rocas como coberturas
  let trees = 0;
  for (let i = 0; i < 1500 && trees < 130; i++) {
    const x = (rnd() - 0.5) * 240, z = (rnd() - 0.5) * 240;
    if (!land(x, z) || towns.some(([tx, tz]) => Math.hypot(tx - x, tz - z) < 26)) continue;
    const s = 0.8 + rnd() * 0.7;
    g.add('tree', [x, ground(x, z) + 3 * s - 0.2, z], [3 * s, 6 * s, 3 * s], '#2e7d32', 'grass', rnd() < 0.5 ? { kind: 'pine' } : {});
    trees++;
  }
  for (let i = 0; i < 50; i++) {
    const x = (rnd() - 0.5) * 230, z = (rnd() - 0.5) * 230;
    if (!land(x, z)) continue;
    const s = 1.5 + rnd() * 2.5;
    g.add('deco', [x, ground(x, z) + s * 0.3, z], [s, s * 0.8, s], '#8d8d8d', 'stone', { kind: 'rock' });
  }

  // Zona de espera (sala previa a la partida) en el centro
  const y0 = ground(0, 0);
  g.add('sign', [0, y0 + 2.5, -8], [9, 2, 0.3], '#212121', 'metal', { text: 'ISLA ROYALE' });

  const spawns = [];
  for (let i = 0; i < 400 && spawns.length < 30; i++) {
    const x = (rnd() - 0.5) * 200, z = (rnd() - 0.5) * 200;
    if (!land(x, z) || spawns.some((s) => Math.hypot(s[0] - x, s[2] - z) < 20)) continue;
    spawns.push([x, ground(x, z) + 0.3, z]);
  }

  return {
    version: 1,
    terrain,
    water: { level: 0 },
    sky: { time: 0.42, dayNight: false, fog: true },
    bounds: { min: [-140, -30, -140], max: [140, 150, 140] },
    spawns: [[0, y0 + 0.3, 4], [3, y0 + 0.3, 4], [-3, y0 + 0.3, 4]],
    objects: g.objects,
    vehicles: [],
    meta: { mode: 'royale', dropSpawns: spawns },
  };
}
