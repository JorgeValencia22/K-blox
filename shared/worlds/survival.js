// Noche Salvaje: colinas con recursos (árboles, rocas, arbustos de bayas) y campamento.
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

  // Colina más alta (lejos del campamento) para el castillo en ruinas
  let castle = { x: 0, z: 0, h: -1 };
  for (let x = -110; x <= 110; x += 10) for (let z = -110; z <= 110; z += 10) {
    if (Math.hypot(x, z) < 50) continue;
    const hh = ground(x, z);
    if (hh > castle.h) castle = { x, z, h: hh };
  }
  // Zonas reservadas para construcciones (no se colocan recursos encima)
  const reserved = [[12, -10, 8], [-34, 22, 10], [30, 46, 11], [castle.x, castle.z, 15], [40, 30, 7], [-50, -40, 7], [60, -60, 7], [0, 0, 14]];

  const rnd = mulberry32(77);
  const kinds = [
    { kind: 'tree', n: 85, s: [3, 6, 3], c: '#2e7d32' },
    { kind: 'rock', n: 48, s: [2.2, 1.6, 2.2], c: '#9e9e9e' },
    { kind: 'bush', n: 42, s: [1.6, 1.2, 1.6], c: '#388e3c' },
  ];
  const nodes = [];
  for (const k of kinds) {
    let placed = 0;
    for (let i = 0; i < 2000 && placed < k.n; i++) {
      const x = (rnd() - 0.5) * 250, z = (rnd() - 0.5) * 250;
      const h = ground(x, z);
      if (h < 1 || Math.hypot(x, z) < 12) continue;
      if (nodes.some((n) => Math.hypot(n[0] - x, n[1] - z) < 5)) continue;
      if (reserved.some(([rx, rz, rr]) => Math.hypot(rx - x, rz - z) < rr)) continue;
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

  // Tiendas de campaña alrededor del campamento
  for (const [x, z, ry] of [[-6, 6, 30], [6, 6, -30], [-6, -6, 150]]) {
    g.add('wedge', [x, cy + 0.9, z - 0.9], [2.6, 1.8, 1.8], '#ff8a65', 'plastic').ry = ry;
    g.add('wedge', [x, cy + 0.9, z + 0.9], [2.6, 1.8, 1.8], '#ff7043', 'plastic').ry = ry + 180;
  }
  // Torre de vigilancia con escaleras (para ver venir a las criaturas)
  {
    const tx = 12, tz = -10, th = ground(tx, tz);
    for (const [a, b] of [[-1.6, -1.6], [1.6, -1.6], [-1.6, 1.6], [1.6, 1.6]]) g.block([tx + a, th + 3, tz + b], [0.5, 6.5, 0.5], '#6d4c41', 'wood');
    g.block([tx, th + 6.3, tz], [4.4, 0.4, 4.4], '#8d6e63', 'wood');
    g.block([tx, th + 8.2, tz], [4.8, 0.3, 4.8], '#4e342e', 'wood');
    g.add('stairs', [tx, th + 3, tz + 5.2], [2, 6.3, 6], '#a1887f', 'wood').ry = 180;
    g.add('sign', [tx + 2.4, th + 1, tz - 2.3], [2.6, 0.9, 0.15], '#fff8e1', 'wood', { text: 'VIGÍA' });
  }
  // Cabaña abandonada (refugio con puerta) y círculo de piedras
  {
    const bx = -34, bz = 22, bh = ground(bx, bz);
    g.block([bx, bh - 1.2, bz], [11, 2.6, 10], '#795548', 'sand');
    g.building(bx, bh + 0.1, bz, 9, 8, 4.5, 'e', { wall: '#8d6e63', roof: '#4e342e', material: 'wood', noWindows: true });
    g.add('deco', [bx - 2.5, bh + 0.6, bz - 2], [1, 1, 1], '#8d6e63', 'wood', { kind: 'barrel' });
    const sx = 30, sz = 46, sh = ground(sx, sz);
    for (let i = 0; i < 9; i++) {
      const a = (i / 9) * Math.PI * 2;
      g.block([sx + Math.cos(a) * 7, sh + 1.4, sz + Math.sin(a) * 7], [1.4, 3.2, 1], '#9e9e9e', 'stone').ry = (-a * 180) / Math.PI;
    }
    g.block([sx, sh + 0.3, sz], [2.4, 0.8, 1.4], '#757575', 'stone');
  }
  // Castillo en ruinas en lo alto de una colina
  {
    const { x, z, h } = castle;
    g.block([x, h - 1, z], [18, 3, 18], '#8d8d8d', 'stone');
    for (const [a, b, sx, sz] of [[0, -8.5, 18, 1], [-8.5, 0, 1, 18], [8.5, 3, 1, 12]]) g.block([x + a, h + 2.5, z + b], [sx, 5, sz], '#9e9e9e', 'stone');
    for (const [a, b] of [[-8.5, -8.5], [8.5, -8.5]]) g.add('cylinder', [x + a, h + 4, z + b], [3, 8, 3], '#8d8d8d', 'stone');
    g.add('stairs', [x + 4, h + 2.5, z - 5.5], [3, 5, 5], '#757575', 'stone').ry = 270;
    g.block([x + 6.6, h + 5.2, z - 5.5], [3, 0.4, 5], '#757575', 'stone');
    g.add('sign', [x, h + 1.4, z + 8.6], [5, 1.2, 0.2], '#fff8e1', 'wood', { text: 'RUINAS DEL REY' });
  }
  // Muelle sobre el agua
  for (let x = -120; x < 120; x += 6) {
    const z = 60;
    if (ground(x, z) < -0.5 && ground(x - 6, z) >= 0.2) {
      g.block([x + 3, 0.5, z], [12, 0.4, 3], '#a1887f', 'wood');
      for (const k of [0, 4, 8]) g.block([x - 2 + k, -0.5, z + 1.2], [0.4, 2, 0.4], '#6d4c41', 'wood');
      break;
    }
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
