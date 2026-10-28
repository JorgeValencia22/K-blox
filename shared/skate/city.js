// Skate Pro: la ciudad de mundo abierto. Junta, en un solo mapa enorme y sin tiempo, la plaza central y
// los demás mapas como barrios (skatepark, calle, piscinas, azoteas, puerto y playa), con calles entre
// ellos, una torre de 16 m para tirarse en picado y colinas largas para coger velocidad.
import { P, box, ramp, quarter, pyramid, stairs, rail, bowl, wall, funbox, stairSet, halfpipe } from './kit.js';

/** Copia las piezas de un mapa desplazadas (dx, dz), sin sus muros invisibles del borde. */
export function shift(prims, dx, dz) {
  const out = [];
  for (const p of prims) {
    if (p.v === 0 && p.solid) continue;
    const q = { ...p };
    if (p.t === 'rail') { q.x1 += dx; q.x2 += dx; q.z1 += dz; q.z2 += dz; } else { q.x += dx; q.z += dz; }
    out.push(q);
  }
  return out;
}

export function buildCity(maps) {
  const D = [
    { id: 'park', name: 'Rolling Waves Skatepark', x: 135, z: 0 },
    { id: 'bowl', name: 'Bowl Dorado', x: -125, z: 0 },
    { id: 'street', name: 'Calle Mayor', x: 0, z: 88 },
    { id: 'roof', name: 'Distrito Neón', x: 0, z: -72 },
    { id: 'port', name: 'Puerto Industrial', x: 140, z: -122 },
    { id: 'beach', name: 'Playa Venice', x: -130, z: -98 },
  ];
  const prims = [];
  const gaps = [];
  const letters = [];
  const districts = [{ id: 'plaza', name: 'Plaza Central', x0: -45, x1: 45, z0: -45, z1: 45 }];
  const order = ['park', 'street', 'bowl', 'roof', 'port'];
  for (const d of D) {
    const m = maps[d.id];
    prims.push(...shift(m.prims, d.x, d.z));
    for (const g of m.gaps) gaps.push({ ...g, id: `${d.id}_${g.id}`, x: g.x + d.x, z: g.z + d.z, district: d.name });
    const li = order.indexOf(d.id);
    if (li >= 0 && m.letters[li]) letters.push({ ...m.letters[li], x: m.letters[li].x + d.x, z: m.letters[li].z + d.z });
    districts.push({ id: d.id, name: d.name, x0: d.x + m.bounds.x0, x1: d.x + m.bounds.x1, z0: d.z + m.bounds.z0, z1: d.z + m.bounds.z1 });
  }
  // Calles entre barrios: mismas losas lisas que en una ciudad real
  const plaza = P([
    ramp(0, 0, 90, 90, 0.04, 0.04, 0, { color: 'side' }),
    stairSet(-22, 6, 8, 8, 0.4, 0.17, 0, { both: true }),
    stairSet(20, 26, 7, 12, 0.4, 0.17, Math.PI, {}),
    funbox(22, -10, 9, 6, 0.8, 3.6, Math.PI / 2),
    box(-12, -28, 14, 0.6, 0.5, 0, { grind: true, color: 'paint' }),
    box(8, -30, 16, 0.6, 0.42, 0, { grind: true, color: 'paint' }),
    box(-30, -22, 0.6, 14, 0.46, 0, { grind: true, color: 'paint' }),
    rail(28, 14, 41, 14, 0.9),
    rail(-40, 20, -40, 36, 1.0, 0.45),
    pyramid(0, 22, 10, 10, 0.9, 3),
    box(33, 33, 10, 2.5, 0.16, 0, { color: 'paint' }),
    ramp(-34, -8, 6, 7, 0, 1.1, Math.PI),
    box(-34, -14, 6, 6, 1.1, Math.PI, { color: 'paint' }),
    halfpipe(-8, -6, 11, 6, 2.6, 2.6, Math.PI / 2, 1.6),
  ]);
  prims.push(...plaza);
  // Colinas largas: bajar rápido y hacer «pump» en el valle
  prims.push(ramp(-70, 40, 14, 50, 4.5, 0, 0));
  prims.push(ramp(60, -50, 12, 36, 0, 3.2, 0), ramp(60, -14, 12, 36, 3.2, 0, 0));
  // Torre de 16 m: se sube por la rampa larga y se salta al vacío (Dive / Spread Eagle)
  prims.push(ramp(-4, 143, 12, 52, 0, 16, 0, { color: 'roof' }), box(-4, 182, 34, 26, 16, 0, { color: 'roof' }));
  prims.push(box(-24, 172, 4, 4, 16, 0, { color: 'vent' }));
  // Edificios entre barrios (se pueden saltar encima desde las rampas) y farolas
  const towers = [[-100, 62, 18, 16, 11], [72, 40, 16, 14, 14], [-72, -46, 14, 12, 9], [76, -48, 12, 12, 12]];
  for (const [x, z, w, d, h] of towers) prims.push(wall(x, z, w, d, h, 0, { color: 'side' }));
  gaps.push(
    { id: 'plaza_stairs', name: 'Salto de la escalera de 8', x: -22, z: 9.4, r: 2.6, pts: 600 },
    { id: 'plaza_fun', name: 'Salto de la caja de la plaza', x: 22, z: -10, r: 3.4, pts: 450 },
    { id: 'plaza_12', name: 'Salto de la escalera de 12', x: 20, z: 31, r: 2.6, pts: 900 },
    { id: 'tower', name: 'Salto de la torre', x: -4, z: 168, r: 12, pts: 1500 },
  );
  letters.sort((a, b) => 'SKATE'.indexOf(a.ch) - 'SKATE'.indexOf(b.ch));
  return {
    id: 'city', name: 'Kest City', tag: 'Mundo abierto', icon: '🌆',
    desc: 'Una ciudad entera sin tiempo ni límites: la plaza, un skatepark, una calle mayor, piscinas, azoteas, un puerto, una playa y una torre de 16 m. Encadena líneas por todo el mapa.',
    theme: { sky: '#9cc8ee', fog: '#c8dcec', ground: '#62656b', accent: '#00e5ff', night: false, light: 1.05, city: true },
    bounds: { x0: -192, x1: 200, z0: -168, z1: 196 },
    spawn: { x: 0, z: -22, yaw: 0 },
    time: 0,
    medals: [25000, 80000, 200000],
    prims, gaps, letters, districts,
    goals: [
      { id: 'g1', text: 'Consigue 40.000 puntos', type: 'score', v: 40000 },
      { id: 'g2', text: 'Haz una línea de 10.000', type: 'combo', v: 10000 },
      { id: 'g3', text: 'Aterriza un Kickflip', type: 'trick', id2: 'kickflip' },
      { id: 'g4', text: 'Grinda 12 m seguidos', type: 'grind', v: 12 },
      { id: 'g5', text: 'Salta la escalera de 8', type: 'gap', id2: 'plaza_stairs' },
      { id: 'g6', text: 'Giro de 720°', type: 'spin', v: 720 },
      { id: 'g7', text: 'Recoge S-K-A-T-E', type: 'letters' },
    ],
  };
}
void stairs; void quarter; void bowl;
