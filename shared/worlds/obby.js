// Kest Obby: recorrido de obstáculos en el cielo con 4 puntos de control y meta.
import { WorldGen } from './builder.js';

export function buildObby() {
  const g = new WorldGen('ob');
  const Y = 20;
  const C = ['#ef5350', '#ffa726', '#ffee58', '#66bb6a', '#42a5f5', '#ab47bc'];
  let z = 0;

  // Plataforma de inicio
  g.block([0, Y - 0.5, 0], [16, 1, 16], '#eceff1', 'stone');
  g.add('spawn', [0, Y + 0.2, 2], [4, 0.4, 4], '#26c6da', 'neon');
  g.add('sign', [0, Y + 2, -7.5], [8, 2, 0.2], '#ffffff', 'wood', { text: 'KEST OBBY  →' });
  z = -10;

  // Etapa 1: saltos simples
  for (let i = 0; i < 6; i++) {
    z -= 6;
    g.block([(i % 2 ? 2 : -2), Y - 0.5 + i * 0.4, z], [3.5, 1, 3.5], C[i % 6], 'plastic');
  }
  z -= 8;
  g.block([0, Y + 1.5, z], [10, 1, 8], '#eceff1', 'stone');
  g.add('checkpoint', [0, Y + 2.2, z], [4, 0.4, 4], '#66bb6a', 'neon', { n: 1 });
  const y1 = Y + 2;

  // Etapa 2: suelo de lava con franjas seguras
  z -= 8;
  g.block([0, y1 - 0.5, z - 12], [10, 1, 28], '#eceff1', 'stone');
  for (let i = 0; i < 5; i++) g.add('kill', [0, y1 + 0.15, z - 2 - i * 5.2], [10, 0.3, 2.4], '#ff3d00', 'neon');
  z -= 30;
  // Vigas estrechas
  g.block([0, y1 - 0.5, z - 7], [1.2, 1, 14], '#8d6e63', 'wood');
  z -= 18;
  g.block([0, y1 - 0.5, z], [10, 1, 8], '#eceff1', 'stone');
  g.add('checkpoint', [0, y1 + 0.2, z], [4, 0.4, 4], '#66bb6a', 'neon', { n: 2 });

  // Etapa 3: plataformas móviles
  z -= 10;
  g.add('platform', [0, y1 - 0.5, z], [4, 0.6, 4], '#ffca28', 'metal', { axis: 'x', dist: 10, speed: 0.25 });
  z -= 7;
  g.add('platform', [0, y1 - 0.5, z], [4, 0.6, 4], '#ffca28', 'metal', { axis: 'x', dist: 12, speed: 0.33 });
  z -= 7;
  g.add('platform', [0, y1 + 1.5, z], [4, 0.6, 4], '#ffca28', 'metal', { axis: 'y', dist: 4, speed: 0.3 });
  z -= 7;
  g.add('platform', [0, y1 + 2.5, z - 4], [4, 0.6, 4], '#ffca28', 'metal', { axis: 'z', dist: 8, speed: 0.25 });
  z -= 16;
  const y3 = y1 + 3;
  g.block([0, y3 - 0.5, z], [10, 1, 8], '#eceff1', 'stone');
  g.add('checkpoint', [0, y3 + 0.2, z], [4, 0.4, 4], '#66bb6a', 'neon', { n: 3 });

  // Etapa 4: trampolines y torre
  z -= 9;
  g.add('jumppad', [0, y3 + 0.2, z + 3], [2.4, 0.4, 2.4], '#ab47bc', 'neon', { power: 24 });
  g.block([0, y3 - 0.5, z + 3], [4, 1, 4], '#eceff1', 'stone');
  g.block([0, y3 + 7.5, z - 4], [6, 1, 6], C[4], 'plastic');
  for (let i = 0; i < 4; i++) {
    g.block([(i % 2 ? 3 : -3), y3 + 9 + i * 1.8, z - 10 - i * 4], [3, 1, 3], C[i], 'plastic');
  }
  const y4 = y3 + 15.5;
  z -= 30;
  g.block([0, y4 - 0.5, z], [10, 1, 8], '#eceff1', 'stone');
  g.add('checkpoint', [0, y4 + 0.2, z], [4, 0.4, 4], '#66bb6a', 'neon', { n: 4 });

  // Etapa 5: zigzag de lava y meta
  z -= 2;
  for (let i = 0; i < 6; i++) {
    z -= 5;
    g.block([(i % 2 ? 3 : -3), y4 - 0.5, z], [3, 1, 3], '#eceff1', 'stone');
    g.add('kill', [(i % 2 ? -2 : 2), y4 + 0.3, z], [2, 2, 0.6], '#ff3d00', 'neon');
  }
  z -= 12;
  g.block([0, y4 - 0.5, z], [14, 1, 14], '#fff59d', 'stone');
  g.add('finish', [0, y4 + 0.2, z], [6, 0.4, 6], '#fdd835', 'neon');
  g.add('sign', [0, y4 + 3, z - 6.5], [6, 2, 0.2], '#ffffff', 'wood', { text: '¡META!' });

  // Nubes decorativas
  for (let i = 0; i < 18; i++) {
    const x = (i % 2 ? 1 : -1) * (25 + (i * 7) % 30);
    g.add('sphere', [x, 8 + (i * 13) % 30, -i * 12], [10, 4, 7], '#ffffff', 'plastic', { nc: true });
  }

  return {
    version: 1,
    terrain: null,
    water: null,
    sky: { time: 0.32, dayNight: false, fog: true },
    bounds: { min: [-200, -10, -400], max: [200, 200, 100] },
    spawns: [[0, Y + 0.2, 2]],
    objects: g.objects,
    vehicles: [],
    meta: { mode: 'obby', checkpoints: 4, minTime: 25 },
  };
}
