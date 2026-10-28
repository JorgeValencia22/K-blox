// Skate Pro: los mapas se dibujan en una escena propia del cliente; este mundo solo es la
// plataforma donde espera el personaje mientras tanto.
import { WorldGen } from './builder.js';

export function buildSkate() {
  const g = new WorldGen('sk');
  g.block([0, 0.1, 0], [30, 0.2, 30], '#9e9e9e', 'stone');
  g.add('sign', [0, 3, -10], [10, 2, 0.3], '#0d1b2a', 'metal', { text: 'SKATE PRO' });
  return {
    version: 1,
    terrain: { type: 'flat', size: 120, height: 0, color: '#b0b0a8' },
    sky: { time: 0.4, dayNight: false, fog: true },
    bounds: { min: [-60, -20, -60], max: [60, 80, 60] },
    spawns: [[0, 0.4, 0]],
    objects: g.objects,
    vehicles: [],
    meta: { mode: 'skate' },
  };
}
