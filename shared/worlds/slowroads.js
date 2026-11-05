// Slow Roads: la carretera infinita se dibuja en una escena propia del cliente; este mundo solo es la
// plataforma donde espera el personaje mientras tanto.
import { WorldGen } from './builder.js';

export function buildSlowRoads() {
  const g = new WorldGen('sr');
  g.block([0, 0.1, 0], [30, 0.2, 30], '#6f6f6a', 'stone');
  g.add('sign', [0, 3, -10], [10, 2, 0.3], '#0d1b2a', 'metal', { text: 'SLOW ROADS' });
  return {
    version: 1,
    terrain: { type: 'flat', size: 120, height: 0, color: '#7d9a6a' },
    sky: { time: 0.45, dayNight: false, fog: true },
    bounds: { min: [-60, -20, -60], max: [60, 80, 60] },
    spawns: [[0, 0.4, 0]],
    objects: g.objects,
    vehicles: [],
    meta: { mode: 'slowroads' },
  };
}
