// Kest Survival: colinas con recursos (árboles, rocas, arbustos de bayas) y campamento.
import { WorldGen } from './builder.js';
import { getHeightmap, mulberry32 } from '../terrain.js';

export function buildSurvival() {
  const terrain = { type: 'hills', size: 300, seed: 11, amp: 7 };
  const hm = getHeightmap(terrain);
  const g = new WorldGen('s');
  const ground = (x, z) => hm.heightAt(x, z);

  // Campamento inicial
  const cy = ground(0, 0);
  g.block([0, cy - 1.4, 0], [14, 3, 14], '#a1887f', 'sand'); // base enterrada para no flotar en pendientes
  g.add('deco', [0, cy + 0.4, 0], [1.6, 0.8, 1.6], '#ff7043', 'neon', { kind: 'campfire' });
  for (const [x, z, ry] of [[3, 0, 90], [-3, 0, 90], [0, 3, 0], [0, -3, 0]]) {
    const b = g.add('deco', [x, cy + 0.35, z], [2, 0.7, 0.7], '#6d4c41', 'wood', { kind: 'log' });
    b.ry = ry;
  }
  g.add('sign', [5, cy + 1.2, -5], [3, 1.6, 0.2], '#fff8e1', 'wood', { text: 'CAMPAMENTO' });

  const rnd = mulberry32(77);
  const kinds = [
    { kind: 'tree', n: 70, s: [3, 6, 3], c: '#2e7d32' },
    { kind: 'rock', n: 40, s: [2.2, 1.6, 2.2], c: '#9e9e9e' },
    { kind: 'bush', n: 35, s: [1.6, 1.2, 1.6], c: '#388e3c' },
  ];
  const nodes = [];
  for (const k of kinds) {
    let placed = 0;
    for (let i = 0; i < 2000 && placed < k.n; i++) {
      const x = (rnd() - 0.5) * 250, z = (rnd() - 0.5) * 250;
      const h = ground(x, z);
      if (h < 1 || Math.hypot(x, z) < 12) continue;
      if (nodes.some((n) => Math.hypot(n[0] - x, n[1] - z) < 5)) continue;
      nodes.push([x, z]);
      g.add('resource', [x, h + k.s[1] / 2 - 0.1, z], k.s, k.c, k.kind === 'rock' ? 'stone' : 'grass', { id: `${k.kind}${placed}`, kind: k.kind });
      placed++;
    }
  }

  // Ruinas para dar refugio
  const ruins = [[40, 30], [-50, -40], [60, -60]];
  for (const [x, z] of ruins) {
    const h = ground(x, z);
    g.block([x - 4, h + 1.5, z], [0.8, 3, 8], '#78909c', 'stone');
    g.block([x, h + 1.5, z + 4], [8, 3, 0.8], '#78909c', 'stone');
    g.block([x, h + 1, z - 4], [5, 2, 0.8], '#78909c', 'stone');
  }

  return {
    version: 1,
    terrain,
    water: { level: 0 },
    sky: { time: 0.3, dayNight: true, fog: true },
    bounds: { min: [-150, -30, -150], max: [150, 200, 150] },
    spawns: [[2, cy + 0.3, 5], [-2, cy + 0.3, 5], [5, cy + 0.3, 2], [-5, cy + 0.3, -2]],
    objects: g.objects,
    vehicles: [],
    meta: { mode: 'survival', dayLength: 240, nightStart: 0.55 },
  };
}
