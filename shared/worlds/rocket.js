// Turbo Gol: fútbol con coches. Estadio cerrado con dos porterías; el balón lo
// simula el servidor. Azul defiende la portería +z y Naranja la -z.
import { WorldGen } from './builder.js';

export const ARENA = { hx: 50, hz: 70, goalW: 10, goalH: 8, goalDepth: 10, wallH: 14 };
export const TEAM_COLORS = ['#1e88e5', '#fb8c00'];

export function buildRocket() {
  const g = new WorldGen('rk');
  const { hx, hz, goalW, goalH, goalDepth, wallH } = ARENA;
  const T = 1;
  // Suelo del campo y líneas
  g.block([0, -0.5, 0], [hx * 2 + 2, 1, hz * 2 + 2], '#2e7d32', 'grass');
  for (let i = -6; i <= 6; i++) g.block([0, 0.01, i * 10], [hx * 2, 0.02, 5], i % 2 ? '#338a37' : '#2e7d32', 'grass', { nc: true });
  g.block([0, 0.03, 0], [hx * 2, 0.02, 0.5], '#ffffff', 'neon', { nc: true });
  g.add('cylinder', [0, 0.03, 0], [18, 0.02, 18], '#ffffff', 'neon', { nc: true });
  g.add('cylinder', [0, 0.04, 0], [17, 0.02, 17], '#2e7d32', 'grass', { nc: true });

  // Paredes laterales
  for (const s of [-1, 1]) g.block([s * (hx + T / 2), wallH / 2, 0], [T, wallH, hz * 2 + 2], '#cfd8dc', 'glass');
  // Paredes de fondo con hueco de portería, y cajas de portería
  for (const s of [-1, 1]) {
    const team = s > 0 ? 0 : 1;
    const color = TEAM_COLORS[team];
    const z = s * (hz + T / 2);
    const sideW = hx - goalW;
    g.block([-(goalW + sideW / 2), wallH / 2, z], [sideW, wallH, T], '#cfd8dc', 'glass');
    g.block([goalW + sideW / 2, wallH / 2, z], [sideW, wallH, T], '#cfd8dc', 'glass');
    g.block([0, goalH + (wallH - goalH) / 2, z], [goalW * 2, wallH - goalH, T], '#cfd8dc', 'glass');
    // Caja de la portería
    const bz = s * (hz + goalDepth + T / 2);
    g.block([0, goalH / 2, bz], [goalW * 2 + 2, goalH, T], color, 'neon');
    for (const sx of [-1, 1]) g.block([sx * (goalW + T / 2), goalH / 2, s * (hz + goalDepth / 2)], [T, goalH, goalDepth], color, 'metal');
    g.block([0, goalH + 0.25, s * (hz + goalDepth / 2)], [goalW * 2 + 2, 0.5, goalDepth + 1], color, 'metal');
    g.block([0, -0.45, s * (hz + goalDepth / 2)], [goalW * 2, 1, goalDepth], '#1b5e20', 'grass');
    // Postes llamativos
    for (const sx of [-1, 1]) g.add('cylinder', [sx * goalW, goalH / 2, s * hz], [0.8, goalH, 0.8], '#ffffff', 'neon', { nc: true });
    g.block([0, goalH + 0.4, s * hz], [goalW * 2 + 0.8, 0.8, 0.8], '#ffffff', 'neon', { nc: true });
    // Gradas (decoración)
    for (let r = 0; r < 5; r++) {
      g.block([0, 2 + r * 2.2, s * (hz + goalDepth + 6 + r * 3)], [hx * 2 + 20, 1.2 + r * 2.2, 3], r % 2 ? color : '#37474f', 'plastic', { nc: true });
    }
  }
  for (const s of [-1, 1]) {
    for (let r = 0; r < 5; r++) g.block([s * (hx + 6 + r * 3), 2 + r * 2.2, 0], [3, 1.2 + r * 2.2, hz * 2], r % 2 ? '#546e7a' : '#37474f', 'plastic', { nc: true });
  }
  g.add('sign', [0, wallH + 4, -(hz + goalDepth + 3)], [30, 5, 0.4], '#0d1b2a', 'neon', { text: 'TURBO GOL' });
  g.add('sign', [0, wallH + 4, hz + goalDepth + 3], [30, 5, 0.4], '#0d1b2a', 'neon', { text: '¡GOOOL!' });
  // Público en las gradas laterales (bloques de colores, sin colisión)
  const crowd = ['#1e88e5', '#fb8c00', '#ffffff', '#fdd835', '#e53935', '#43a047'];
  for (const s of [-1, 1]) for (let r = 0; r < 5; r++) for (let k = -12; k <= 12; k++) {
    if ((k + r) % 3 === 0) continue;
    g.block([s * (hx + 6 + r * 3), 2 + r * 3.3 + 1.1, k * 5.4], [0.8, 1, 0.8], crowd[(k * 7 + r * 3 + (s > 0 ? 1 : 0) + 36) % 6], 'plastic', { nc: true });
  }
  // Torres de focos en las esquinas y pantallas gigantes
  for (const sx of [-1, 1]) for (const sz of [-1, 1]) {
    const x = sx * (hx + 22), z = sz * (hz + 6);
    g.block([x, 16, z], [1.6, 32, 1.6], '#455a64', 'metal', { nc: true });
    g.block([x, 32.5, z], [6, 3, 1], '#eceff1', 'neon', { nc: true }).ry = sx * sz * 45;
    g.add('light', [x * 0.85, 30, z * 0.85], [0.5, 0.5, 0.5], '#ffffff', 'neon', { intensity: 2.2, range: 60 });
  }
  for (const s of [-1, 1]) {
    g.block([s * (hx + 24), 26, 0], [1, 12, 22], '#111111', 'metal', { nc: true });
    g.add('sign', [s * (hx + 23.4), 26, 0], [0.2, 10, 20], s > 0 ? '#0d47a1' : '#e65100', 'neon', { text: s > 0 ? 'AZUL 💙' : 'NARANJA 🧡' });
  }
  // Banderas de los equipos sobre las porterías
  for (const s of [-1, 1]) for (const k of [-1, 1]) {
    g.block([k * 16, wallH + 3, s * (hz + 1)], [0.3, 6, 0.3], '#eceff1', 'metal', { nc: true });
    g.block([k * 16 + 1.6, wallH + 5, s * (hz + 1)], [3, 2, 0.1], TEAM_COLORS[s > 0 ? 0 : 1], 'plastic', { nc: true });
  }

  // Posiciones de saque por equipo (Azul en +z, mirando a -z)
  const kickoff = [
    [[0, 0.6, 40], [-14, 0.6, 46], [14, 0.6, 46]],
    [[0, 0.6, -40], [-14, 0.6, -46], [14, 0.6, -46]],
  ];

  return {
    version: 1,
    terrain: { type: 'flat', size: 300, height: -1, color: '#263238' },
    water: null,
    sky: { time: 0.45, dayNight: false, fog: false },
    bounds: { min: [-120, -20, -130], max: [120, 80, 130] },
    spawns: [[-6, 0.6, 0], [6, 0.6, 0], [0, 0.6, 6], [0, 0.6, -6]],
    objects: g.objects,
    vehicles: [],
    meta: { mode: 'rocket', arena: ARENA, kickoff, teamColors: TEAM_COLORS },
  };
}
