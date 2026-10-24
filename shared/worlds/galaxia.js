// Guerra Galáctica: la campaña se dibuja en escenas propias del cliente; este mundo solo es la
// plataforma donde espera el personaje mientras tanto.
import { WorldGen } from './builder.js';

export function buildGalaxia() {
  const g = new WorldGen('gx');
  g.block([0, 0.1, 0], [30, 0.2, 30], '#8a8f98', 'metal');
  g.add('sign', [0, 3, -10], [10, 2, 0.3], '#0d1b2a', 'metal', { text: 'GUERRA GALÁCTICA' });
  return {
    version: 1,
    terrain: { type: 'flat', size: 120, height: 0, color: '#d6b27c' },
    sky: { time: 0.7, dayNight: false, fog: true },
    bounds: { min: [-60, -20, -60], max: [60, 80, 60] },
    spawns: [[0, 0.4, 0]],
    objects: g.objects,
    vehicles: [],
    meta: { mode: 'galaxia' },
  };
}
