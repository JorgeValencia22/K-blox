// Obby del Cielo: 14 etapas de obstáculos en el cielo con 13 puntos de control y meta.
import { WorldGen } from './builder.js';

export function buildObby() {
  const g = new WorldGen('ob');
  const Y = 20;
  const C = ['#ef5350', '#ffa726', '#ffee58', '#66bb6a', '#42a5f5', '#ab47bc'];
  let z = 0;

  // Plataforma de inicio
  g.block([0, Y - 0.5, 0], [16, 1, 16], '#eceff1', 'stone');
  g.add('spawn', [0, Y + 0.2, 2], [4, 0.4, 4], '#26c6da', 'neon');
  g.add('sign', [0, Y + 2, -7.5], [8, 2, 0.2], '#ffffff', 'wood', { text: 'OBBY DEL CIELO  →' });
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
  g.add('checkpoint', [0, y4 + 0.2, z], [4, 0.4, 4], '#66bb6a', 'neon', { n: 5 });
  g.add('sign', [0, y4 + 3, z - 6.5], [6, 2, 0.2], '#ffffff', 'wood', { text: '¡MITAD! Sigue →' });

  // A partir de aquí: etapas 6-10 (más largas y difíciles).
  // 'edge' es el borde delantero (z más negativa) del último elemento colocado.
  let edge = z - 7;
  let y = y4;
  const place = (depth, gap) => {
    const c = edge - gap - depth / 2;
    edge = c - depth / 2;
    return c;
  };
  const checkpointPad = (n, label) => {
    const c = place(8, 2.5);
    g.block([0, y - 0.5, c], [10, 1, 8], '#eceff1', 'stone');
    g.add('checkpoint', [0, y + 0.2, c], [4, 0.4, 4], '#66bb6a', 'neon', { n });
    if (label) g.add('sign', [4.4, y + 1.6, c + 3.6], [3.6, 1.4, 0.2], '#ffffff', 'wood', { text: label });
  };

  // Etapa 6: pilares que suben
  const px = [-2.5, 2, -1.5, 2.5, -2, 1.5, -2.5, 2];
  for (let i = 0; i < 8; i++) {
    y += 1.1;
    const c = place(2, 2.5);
    g.block([px[i], y - 6, c], [2, 12, 2], C[i % 6], 'plastic');
  }
  checkpointPad(6, 'ETAPA 7');

  // Etapa 7: plataformas móviles rápidas
  const axes = ['x', 'z', 'x', 'y', 'x'];
  for (let i = 0; i < 5; i++) {
    const c = place(3.5, 3.2);
    g.add('platform', [0, y - 0.3, c], [3.5, 0.6, 3.5], '#ffca28', 'metal', { axis: axes[i], dist: axes[i] === 'y' ? 3 : axes[i] === 'z' ? 2.5 : 9, speed: 0.3 + i * 0.04 });
  }
  checkpointPad(7, 'ETAPA 8');
  // Trampolín de salida: las barras de lava solo se superan con el arco del trampolín
  g.add('jumppad', [0, y + 0.2, edge + 1.6], [1.8, 0.4, 1.8], '#ab47bc', 'neon', { power: 15 });

  // Etapa 8: islas con trampolines y barras de lava (hay que usar el trampolín)
  for (let i = 0; i < 4; i++) {
    const gapStart = edge;
    const c = place(3.4, 6);
    g.block([0, y - 0.5, c], [3.4, 1, 3.4], '#eceff1', 'stone');
    g.add('jumppad', [0, y + 0.2, c], [1.8, 0.4, 1.8], '#ab47bc', 'neon', { power: 15 });
    g.add('kill', [0, y + 2.2, gapStart - 3], [6, 0.5, 0.5], '#ff3d00', 'neon');
  }
  checkpointPad(8, 'ETAPA 9');

  // Etapa 9: espiral alrededor de una columna
  const cz = edge - 2.5 - 7.3;
  const steps = 12;
  for (let i = 0; i < steps; i++) {
    const a = ((90 + i * 40) * Math.PI) / 180;
    y += 1.2;
    g.block([Math.cos(a) * 6, y - 0.3, cz + Math.sin(a) * 6], [2.6, 0.6, 2.6], C[i % 6], 'plastic');
  }
  y += 1.2;
  g.add('cylinder', [0, y - 15, cz], [6, 30, 6], '#90a4ae', 'stone');
  g.add('checkpoint', [0, y + 0.2, cz], [3, 0.4, 3], '#66bb6a', 'neon', { n: 9 });
  edge = cz - 3;

  // Etapa 10: vigas con vallas de lava que hay que saltar
  for (let i = 0; i < 3; i++) {
    const c = place(7, 2);
    g.block([0, y - 0.3, c], [1.1, 0.6, 7], '#8d6e63', 'wood');
    g.add('kill', [0, y + 0.25, c], [1.6, 0.5, 0.4], '#ff3d00', 'neon');
  }
  checkpointPad(10, 'ETAPA 11');

  // Etapa 11: saltos de fe sobre discos cada vez más pequeños
  const disc = [2.6, 2.3, 2.0, 1.8, 1.6, 1.5];
  for (let i = 0; i < disc.length; i++) {
    const c = place(disc[i], 2.6);
    g.add('cylinder', [(i % 2 ? 1.5 : -1.5), y - 0.4, c], [disc[i], 0.8, disc[i]], C[(i + 2) % 6], 'plastic');
  }
  checkpointPad(11, 'ETAPA 12');

  // Etapa 12: escalera flotante sobre un mar de lava
  const lavaStart = edge;
  for (let i = 0; i < 9; i++) {
    y += 0.9;
    const c = place(2.4, 2.4);
    g.block([Math.sin(i * 0.9) * 3, y - 0.4, c], [2.4, 0.8, 2.4], C[i % 6], 'plastic');
  }
  g.add('kill', [0, y - 7, (lavaStart + edge) / 2], [20, 0.4, lavaStart - edge + 6], '#ff3d00', 'neon');
  checkpointPad(12, 'ETAPA 13');

  // Etapa 13: ascensores (plataformas que suben y bajan) encadenados
  for (let i = 0; i < 4; i++) {
    const c = place(3.6, 3);
    g.add('platform', [0, y + 1.2 + i * 1.2, c], [3.6, 0.6, 3.6], '#4dd0e1', 'metal', { axis: 'y', dist: 3.4, speed: 0.22 + i * 0.03 });
  }
  y += 5.6;
  checkpointPad(13, 'ÚLTIMA ETAPA');

  // Etapa 14: torre de trampolines hasta la meta en lo más alto
  for (let i = 0; i < 3; i++) {
    const c = place(4, 3);
    g.block([0, y - 0.5, c], [4, 1, 4], '#eceff1', 'stone');
    g.add('jumppad', [0, y + 0.2, c], [2.2, 0.4, 2.2], '#ab47bc', 'neon', { power: 17 });
    y += 3.5;
  }
  const fz = place(14, 3);
  g.block([0, y - 0.5, fz], [14, 1, 14], '#fff59d', 'stone');
  g.add('finish', [0, y + 0.2, fz], [6, 0.4, 6], '#fdd835', 'neon');
  g.add('sign', [0, y + 3, fz - 6.5], [6, 2, 0.2], '#ffffff', 'wood', { text: '¡META! 🏆' });
  // Arco de colores sobre la meta
  for (let i = 0; i < 6; i++) g.block([0, y + 6.5 - i * 0.4, fz - 6], [14 - i * 0.8, 0.4, 0.4], C[i], 'neon', { nc: true });

  // Islas flotantes con árboles bajo el recorrido (decoración)
  for (let i = 0; i < 16; i++) {
    const ix = (i % 2 ? 1 : -1) * (16 + (i * 11) % 18), iz = -30 - i * 34, iy = 4 + (i * 7) % 18;
    g.add('cylinder', [ix, iy, iz], [9, 3, 9], '#8d6e63', 'stone', { nc: true });
    g.block([ix, iy + 1.6, iz], [8, 0.4, 8], '#7cb342', 'grass', { nc: true });
    g.add('tree', [ix + 1.5, iy + 4.5, iz - 1], [2.6, 5, 2.6], '#43a047', 'grass', { nc: true });
  }

  // Nubes decorativas
  for (let i = 0; i < 34; i++) {
    const x = (i % 2 ? 1 : -1) * (25 + (i * 7) % 30);
    g.add('sphere', [x, 8 + (i * 13) % 50, -i * 13], [10, 4, 7], '#ffffff', 'plastic', { nc: true });
  }

  return {
    version: 1,
    terrain: null,
    water: null,
    sky: { time: 0.32, dayNight: false, fog: true },
    bounds: { min: [-200, -10, -900], max: [200, 300, 100] },
    spawns: [[0, Y + 0.2, 2]],
    objects: g.objects,
    vehicles: [],
    meta: { mode: 'obby', checkpoints: 13, minTime: 80 },
  };
}
