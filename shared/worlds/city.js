// Kest City: isla principal con ciudad, montañas, río, lago, puentes y aeródromo.
import { WorldGen } from './builder.js';
import { getHeightmap, ISLAND, mulberry32, distToPolyline } from '../terrain.js';

export function buildCity() {
  const terrain = { type: 'island', seed: 7 };
  const hm = getHeightmap(terrain);
  const H = ISLAND.cityHeight; // 3
  const g = new WorldGen('c');
  const ground = (x, z) => hm.heightAt(x, z);

  const ROAD = '#455a64', WALK = '#cfd8dc', LINE = '#fff59d';

  // --- Plaza central y fuente --------------------------------------------
  g.block([0, H + 0.05, 0], [36, 0.1, 36], '#d7ccc8', 'stone');
  g.add('cylinder', [0, H + 0.5, 0], [9, 1, 9], '#90a4ae', 'stone');
  g.add('water', [0, H + 0.95, 0], [8, 0.1, 8], '#4fc3f7', 'glass', { group: 'fountain' });
  g.add('cylinder', [0, H + 2, 0], [1.2, 2, 1.2], '#b0bec5', 'stone');
  g.add('sphere', [0, H + 3.8, 0], [1.6, 1.6, 1.6], '#ffd54f', 'metal');
  for (const [x, z, ry] of [[-12, -12, 45], [12, -12, -45], [-12, 12, 135], [12, 12, -135]]) {
    const b = g.add('deco', [x, H + 0.5, z], [2.4, 1, 1], '#6d4c41', 'wood', { kind: 'bench' });
    b.ry = ry;
    g.add('seat', [x, H + 0.5, z], [2, 0.9, 0.9], '#6d4c41', 'wood', { hidden: true }).ry = ry;
  }
  g.add('switch', [16.5, H + 0.6, 0], [0.5, 1.2, 0.5], '#26c6da', 'neon', { group: 'fountain', label: 'Fuente' });
  g.add('switch', [-16.5, H + 0.6, 0], [0.5, 1.2, 0.5], '#ffca28', 'neon', { group: 'street', label: 'Farolas' });
  g.add('sign', [0, H + 1.5, 17], [6, 2, 0.2], '#fff8e1', 'wood', { text: 'KEST CITY' });

  // --- Avenidas y anillo --------------------------------------------------
  const road = (cx, cz, sx, sz) => {
    g.block([cx, H + 0.06, cz], [sx, 0.12, sz], ROAD, 'stone');
    if (sx > sz) g.block([cx, H + 0.13, cz], [sx, 0.02, 0.3], LINE, 'plastic');
    else g.block([cx, H + 0.13, cz], [0.3, 0.02, sz], LINE, 'plastic');
  };
  road(55, 0, 74, 8); road(-55, 0, 74, 8); road(0, 55, 8, 74); road(0, -55, 8, 74);
  road(0, 50, 108, 8); road(0, -50, 108, 8); road(50, 0, 8, 92); road(-50, 0, 8, 92);
  // Carretera norte hasta la montaña
  g.block([0, H + 0.06, -98], [8, 0.12, 16], ROAD, 'stone');
  g.block([0, H + 0.06, -160], [8, 0.12, 36], ROAD, 'stone');

  // Farolas a lo largo de las avenidas
  for (let d = 24; d <= 84; d += 20) {
    for (const [x, z] of [[d, 5], [-d, -5], [5, -d], [-5, d]]) {
      g.add('deco', [x, H + 2.5, z], [0.6, 5, 0.6], '#37474f', 'metal', { kind: 'lamp', group: 'street' });
    }
  }

  // --- Puente principal sobre el río (x = 0) -----------------------------
  g.block([0, H - 0.1, -124], [9, 0.6, 38], '#8d6e63', 'wood');
  g.block([-4.3, H + 0.7, -124], [0.4, 1, 38], '#5d4037', 'wood');
  g.block([4.3, H + 0.7, -124], [0.4, 1, 38], '#5d4037', 'wood');
  for (const z of [-134, -124, -114]) {
    g.block([-3, -1, z], [1.2, 7.4, 1.2], '#78909c', 'stone');
    g.block([3, -1, z], [1.2, 7.4, 1.2], '#78909c', 'stone');
  }
  // Pasarela de madera (x = -60)
  {
    const za = -147, zb = -108;
    const top = Math.max(ground(-60, za), ground(-60, zb)) + 0.15;
    g.block([-60, top - 0.2, (za + zb) / 2], [4, 0.4, zb - za], '#a1887f', 'wood');
    g.block([-61.9, top + 0.5, (za + zb) / 2], [0.25, 1, zb - za], '#6d4c41', 'wood');
    g.block([-58.1, top + 0.5, (za + zb) / 2], [0.25, 1, zb - za], '#6d4c41', 'wood');
    for (const [z, dir] of [[za, -1], [zb, 1]]) {
      const gh = ground(-60, z);
      const rise = top - gh;
      if (rise > 0.5) {
        const len = Math.min(10, rise * 3);
        const w = g.add('wedge', [-60, gh + rise / 2, z + dir * len / 2], [4, rise, len], '#a1887f', 'wood');
        w.ry = dir < 0 ? 0 : 180;
      }
    }
  }

  // --- Barrios ------------------------------------------------------------
  const doors = [];
  const towerH = [22, 30, 18, 26];
  const palette = ['#ffccbc', '#c5e1a5', '#b3e5fc', '#f8bbd0', '#fff9c4', '#d1c4e9'];
  let qi = 0;
  for (const sx of [1, -1]) {
    for (const sz of [1, -1]) {
      // Tienda (hueca) frente a la avenida principal
      doors.push(g.building(sx * 34, H, sz * 17, 12, 10, 6, sz > 0 ? 'n' : 's', { wall: palette[qi], roof: '#5d4037' }));
      g.block([sx * 34, H + 0.6, sz * 19.5], [8, 1.1, 1], '#8d6e63', 'wood'); // mostrador
      g.add('sign', [sx * 34, H + 7.2, sz * 11.6], [6, 1.4, 0.2], '#ffffff', 'wood', { text: ['TIENDA', 'CAFÉ', 'MERCADO', 'JUGUETES'][qi] });
      // Torre
      const th = towerH[qi];
      g.block([sx * 34, H + th / 2, sz * 37], [10, th, 10], ['#90a4ae', '#b0bec5', '#78909c', '#a7c0cd'][qi], 'metal');
      for (let y = 3; y < th - 1; y += 3.2) {
        g.block([sx * 34, H + y, sz * 37 - sz * 5.05], [8.6, 1.4, 0.1], '#4fc3f7', 'glass');
      }
      g.block([sx * 34, H + th + 0.3, sz * 37], [10.6, 0.6, 10.6], '#37474f', 'metal');
      // Casa pequeña junto a la plaza
      doors.push(g.building(sx * 11, H, sz * 35, 8, 8, 5, sx > 0 ? 'w' : 'e', { wall: palette[(qi + 2) % 6], roof: '#c62828' }));
      // Casas residenciales del anillo exterior
      doors.push(g.building(sx * 68, H, sz * 22, 10, 9, 5, sx > 0 ? 'w' : 'e', { wall: palette[(qi + 3) % 6], roof: '#1565c0' }));
      doors.push(g.building(sx * 22, H, sz * 68, 9, 10, 5, sz > 0 ? 'n' : 's', { wall: palette[(qi + 4) % 6], roof: '#2e7d32' }));
      qi++;
    }
  }

  // Parque (cuadrante -,+)
  g.block([-68, H + 0.03, 66], [26, 0.06, 26], '#7cb342', 'grass');
  for (const [x, z] of [[-76, 58], [-62, 60], [-74, 74], [-60, 72], [-68, 66]]) {
    g.add('tree', [x, H + 3, z], [3, 6, 3], '#43a047', 'grass');
  }
  for (const [x, z] of [[-66, 56], [-58, 66]]) g.add('deco', [x, H + 0.4, z], [1, 0.8, 1], '#e91e63', 'plastic', { kind: 'flower' });

  // Parque infantil (cuadrante +,+)
  g.block([66, H + 0.03, 66], [26, 0.06, 26], '#ffcc80', 'sand');
  g.add('jumppad', [60, H + 0.2, 60], [2.4, 0.4, 2.4], '#ab47bc', 'neon', { power: 26 });
  g.add('jumppad', [72, H + 0.2, 60], [2.4, 0.4, 2.4], '#ab47bc', 'neon', { power: 34 });
  g.block([66, H + 3, 72], [6, 6, 4], '#ef5350', 'plastic');
  g.add('wedge', [66, H + 3, 77], [4, 6, 6], '#ffee58', 'plastic').ry = 180;
  g.add('stairs', [61, H + 3, 72], [2, 6, 4], '#42a5f5', 'plastic').ry = 90;
  // Plataformas para saltar
  for (let i = 0; i < 5; i++) g.block([56 + i * 3.5, H + 1 + i * 0.8, 74], [2, 0.4, 2], '#66bb6a', 'plastic');

  // Observatorio con ascensor (cuadrante -,-)
  g.block([-66, H + 12, -66], [10, 24, 10], '#eceff1', 'stone');
  g.add('sphere', [-66, H + 26, -66], [8, 6, 8], '#90caf9', 'glass');
  g.block([-66, H + 24.2, -66], [12, 0.4, 12], '#546e7a', 'metal');
  g.add('platform', [-58.2, H + 12.2, -66], [4, 0.6, 4], '#ffca28', 'metal', { axis: 'y', dist: 23.6, speed: 0.08 });

  // Aparcamiento (cuadrante +,-)
  g.block([66, H + 0.04, -66], [24, 0.08, 20], '#546e7a', 'stone');
  for (let i = 0; i < 4; i++) g.block([58 + i * 5.5, H + 0.09, -66], [0.25, 0.02, 10], '#ffffff', 'plastic');

  // --- Aeródromo ----------------------------------------------------------
  const A = ISLAND.airstrip;
  g.block([(A.x0 + A.x1) / 2, H + 0.06, 40], [A.x1 - A.x0 - 4, 0.12, 14], '#37474f', 'stone');
  for (let x = A.x0 + 8; x < A.x1 - 6; x += 10) g.block([x, H + 0.13, 40], [5, 0.02, 0.5], '#ffffff', 'plastic');
  g.block([110, H + 4, 56], [16, 8, 0.5], '#b0bec5', 'metal');
  g.block([102.2, H + 4, 62], [0.5, 8, 12], '#b0bec5', 'metal');
  g.block([117.8, H + 4, 62], [0.5, 8, 12], '#b0bec5', 'metal');
  g.block([110, H + 8.2, 62], [16.6, 0.4, 12.6], '#78909c', 'metal');

  // --- Muelle del lago, playa y montaña ------------------------------------
  const L = ISLAND.lake;
  const dockY = Math.max(0.6, ground(L.x - L.r - 4, L.z) + 0.2);
  g.block([L.x - L.r + 6, dockY, L.z], [24, 0.4, 4], '#a1887f', 'wood');
  g.add('chest', [L.x - L.r + 16, dockY + 0.7, L.z], [1.4, 1, 1], '#8d6e63', 'wood');

  const beachZ = 200;
  g.add('chest', [20, ground(20, beachZ) + 0.5, beachZ], [1.4, 1, 1], '#8d6e63', 'wood');
  for (const x of [-20, -8, 8]) {
    const y = ground(x, beachZ - 6);
    g.add('cylinder', [x, y + 1.5, beachZ - 6], [0.2, 3, 0.2], '#eeeeee', 'plastic');
    g.add('cylinder', [x, y + 3.1, beachZ - 6], [4, 0.3, 4], ['#ef5350', '#29b6f6', '#ffee58'][(x + 20) / 12 | 0], 'plastic');
  }

  // Cabaña al pie de la montaña
  const cabX = -112, cabZ = -170, cabY = ground(cabX, cabZ);
  doors.push(g.building(cabX, cabY - 0.3, cabZ, 8, 7, 4.5, 'e', { wall: '#8d6e63', roof: '#4e342e', material: 'wood', noWindows: true }));
  g.add('chest', [cabX - 2, cabY + 0.3, cabZ], [1.4, 1, 1], '#8d6e63', 'wood');

  const peak = ISLAND.mountains[0];
  let best = { x: peak.x, z: peak.z, h: -1 };
  for (let dx = -12; dx <= 12; dx += 2) for (let dz = -12; dz <= 12; dz += 2) {
    const h = ground(peak.x + dx, peak.z + dz);
    if (h > best.h) best = { x: peak.x + dx, z: peak.z + dz, h };
  }
  g.add('zone', [best.x, best.h + 2, best.z], [16, 8, 16], '#ffffff', 'plastic', { id: 'summit', name: 'Cumbre' });
  g.add('sign', [best.x + 3, best.h + 1.2, best.z], [3, 1.6, 0.2], '#fff8e1', 'wood', { text: 'CUMBRE' });

  // Cofres restantes
  g.add('chest', [-66, H + 25, -63], [1.4, 1, 1], '#ffb300', 'wood'); // azotea observatorio
  g.add('chest', [66, H + 6.5, 72], [1.4, 1, 1], '#8d6e63', 'wood'); // parque infantil

  // --- Gemas --------------------------------------------------------------
  const gemSpots = [
    [0, H + 5.2, 0], [-66, H + 25.2, -69], [34, H + 30 + 1.5, 37 * -1], [best.x, best.h + 1.5, best.z],
    [L.x - L.r + 17, dockY + 1.4, L.z + 1.5], [0, H + 1.5, -124], [-60, 0, -128], [150, H + 1.5, 40],
    [66, H + 7.5, 72], [-68, H + 1.5, 66], [-8, 0, beachZ], [cabX, cabY + 1.5, cabZ],
  ];
  gemSpots.forEach(([x, y, z], i) => {
    if (y === 0) y = ground(x, z) + 1.4;
    g.add('gem', [x, y, z], [0.8, 0.8, 0.8], ['#e040fb', '#00e5ff', '#76ff03', '#ff4081'][i % 4], 'neon', { id: `gem${i}` });
  });

  // --- Vegetación procedural ----------------------------------------------
  const rnd = mulberry32(1234);
  let trees = 0;
  for (let i = 0; i < 4000 && trees < 340; i++) {
    const x = (rnd() - 0.5) * 470, z = (rnd() - 0.5) * 470;
    const h = ground(x, z);
    if (h < 1.6 || h > 42) continue;
    if (Math.hypot(x, z) < 104) continue;
    if (distToPolyline(x, z, ISLAND.river) < 17 || Math.hypot(x - L.x, z - L.z) < L.r + 8) continue;
    if (x > A.x0 - 12 && x < A.x1 + 12 && z > A.z0 - 14 && z < A.z1 + 22) continue;
    if (Math.abs(x) < 14 && z < -80 && z > -185) continue;
    if (Math.hypot(x - cabX, z - cabZ) < 12) continue;
    const sc = 0.8 + rnd() * 0.7;
    const pine = h > 14;
    g.add('tree', [x, h + 3 * sc - 0.2, z], [3 * sc, 6 * sc, 3 * sc], pine ? '#2e7d32' : '#43a047', 'grass', pine ? { kind: 'pine' } : {});
    trees++;
  }
  for (let i = 0; i < 60; i++) {
    const x = (rnd() - 0.5) * 420, z = (rnd() - 0.5) * 420;
    const h = ground(x, z);
    if (h < 2 || Math.hypot(x, z) < 100) continue;
    const s = 1 + rnd() * 2.5;
    g.add('deco', [x, h + s * 0.3, z], [s, s * 0.8, s], '#9e9e9e', 'stone', { kind: 'rock' });
  }

  const vehicles = [
    { id: 'car1', type: 'car', p: [58, H + 0.6, -62], ry: 0 },
    { id: 'car2', type: 'car', p: [69, H + 0.6, -62], ry: 0 },
    { id: 'car3', type: 'car', p: [-20, H + 0.6, -45], ry: 90 },
    { id: 'kart1', type: 'kart', p: [56, H + 0.4, 48], ry: 90 },
    { id: 'kart2', type: 'kart', p: [62, H + 0.4, 48], ry: 90 },
    { id: 'plane1', type: 'plane', p: [100, H + 1.3, 40], ry: 90 },
  ];

  return {
    version: 1,
    terrain,
    water: { level: ISLAND.seaLevel },
    sky: { time: 0.3, dayNight: true, fog: true },
    bounds: { min: [-300, -30, -300], max: [300, 400, 300] },
    spawns: [[0, H + 0.2, 10], [6, H + 0.2, 10], [-6, H + 0.2, 10], [10, H + 0.2, -10], [-10, H + 0.2, -10]],
    objects: g.objects,
    vehicles,
    meta: { mode: 'city', doors },
  };
}
