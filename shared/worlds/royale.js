// Kest Royale: isla de batalla. Botín en cofres, tormenta que se cierra,
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
  // Cofres sueltos por el mapa
  for (let i = 0; i < 400 && chests.length < 22; i++) {
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
  g.add('sign', [0, y0 + 2.5, -8], [9, 2, 0.3], '#212121', 'metal', { text: 'KEST ROYALE' });

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
