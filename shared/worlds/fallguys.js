// Fall Guys (modo Pro): un solo mundo con 10 recorridos de obstáculos colocados en fila. Cada ronda
// usa uno distinto: saltos, plataformas que se mueven, trampolines, puentes estrechos, muros, lava…
// Cada recorrido va hacia -z desde su plataforma de salida hasta la meta, con puntos de control.
import { WorldGen } from './builder.js';
import { mulberry32 } from '../terrain.js';

const L = 150;        // largo de cada recorrido
const SPACING = 90;   // separación lateral entre recorridos
const LANE = 14;      // ancho de la pista

/** Diez recorridos: cada uno con su dificultad (0.6 fácil … 1.5 difícil) y su manera de saltar. */
export const COURSES = [
  { key: 'fg1', name: 'Pasarelas', diff: 0.6, mix: ['pad', 'pad', 'gap', 'pad', 'pad', 'gap'] },
  { key: 'fg2', name: 'Saltos largos', diff: 0.8, mix: ['gap', 'pad', 'gap', 'pad', 'gap'] },
  { key: 'fg3', name: 'Trampolines', diff: 0.8, mix: ['pad', 'jump', 'pad', 'jump', 'pad'] },
  { key: 'fg4', name: 'Plataformas móviles', diff: 0.9, mix: ['pad', 'move', 'move', 'pad', 'move'] },
  { key: 'fg5', name: 'Muros de viento', diff: 1.0, mix: ['pad', 'wall', 'pad', 'wall', 'pad'] },
  { key: 'fg6', name: 'Puente estrecho', diff: 1.0, mix: ['narrow', 'gap', 'narrow', 'pad', 'narrow'] },
  { key: 'fg7', name: 'Torre de escalones', diff: 1.1, mix: ['steps', 'pad', 'steps', 'gap', 'steps'] },
  { key: 'fg8', name: 'Lava traicionera', diff: 1.2, mix: ['narrow', 'move', 'gap', 'narrow', 'move', 'jump'] },
  { key: 'fg9', name: 'Caída libre', diff: 1.3, mix: ['gap', 'move', 'jump', 'gap', 'narrow', 'move'] },
  { key: 'fg10', name: 'Gran final', diff: 1.5, mix: ['jump', 'move', 'narrow', 'steps', 'gap', 'move', 'jump'] },
];

/** Un recorrido: desde z=-10 hacia la meta. Cada tramo lo elige la lista `mix` y el azar de la semilla. */
function buildCourse(g, c, index) {
  const ox = (index - 4.5) * SPACING;
  const rnd = mulberry32(index * 97 + 11);
  const col = ['#90a4ae', '#b0bec5', '#78909c', '#cfd8dc'][index % 4];
  // Salida
  g.block([ox, 0.4, 6], [LANE + 4, 1, 12], '#eceff1', 'plastic');
  g.add('spawn', [ox, 0.9, 6], [LANE + 4, 0.4, 12], '#26c6da', 'neon', { nc: true });
  let z = -12, y = 0.4, cpAt = [35, 70, 105, 135], cpIdx = 0;
  const cps = [];
  const pad = (len, w = LANE, yy = 0.4, color = col) => {
    g.block([ox, yy, z - len / 2], [w, 1, len], color, 'plastic');
    z -= len;
  };
  for (let i = 0; z > -L + 14; i++) {
    const kind = c.mix[i % c.mix.length];
    const d = c.diff;
    if (kind === 'pad') pad(10 + rnd() * 6);
    else if (kind === 'gap') {
      const len = 6 + rnd() * 4 * d;
      pad(len / 2 + 2, LANE, y);
      z -= 2 + d * 2.5; // hueco
      pad(len / 2 + 2, LANE, y);
    } else if (kind === 'narrow') {
      g.block([ox, y, z - 10], [3.6, 1, 20], '#ffd54f', 'stone');
      z -= 20;
    } else if (kind === 'jump') {
      // Trampolín: lanza al jugador a la siguiente plataforma
      g.add('jumppad', [ox, y + 0.6, z - 2], [2.4, 0.6, 2.4], '#ab47bc', 'neon', { power: [24 + d * 4, 8, 60] });
      z -= 8;
      pad(10, LANE, y + 1.5 + d);
    } else if (kind === 'move') {
      // Plataforma que se mueve de lado a lado (no se puede esperar quieto)
      g.add('platform', [ox, y + 0.4, z - 4], [6, 0.8, 6], '#ffca28', 'metal', { axis: 'x', dist: 6, speed: 0.6 + d * 0.5 });
      z -= 10;
      pad(4);
    } else if (kind === 'wall') {
      // Muro con hueco: hay que ir por el hueco que toque
      const gapAt = (rnd() - 0.5) * 6;
      g.block([ox - 7 + (gapAt < 0 ? 0 : 0), 2, z - 2], [LANE - 4 - Math.abs(gapAt), 4, 2], '#ff7043', 'brick');
      g.block([ox + 7 - (gapAt > 0 ? 0 : 0), 2, z - 2], [LANE - 4 - Math.abs(gapAt), 4, 2], '#ff7043', 'brick');
      pad(10);
    } else if (kind === 'steps') {
      for (let s = 0; s < 3; s++) {
        y += 1.1 + d * 0.2;
        g.block([ox, y, z - 4], [LANE - 2, 1, 6], '#ba68c8', 'plastic');
        z -= 6;
      }
      pad(6, LANE, y);
    }
    if (z < -cpAt[cpIdx] && cpIdx < cpAt.length) {
      const cp = g.add('checkpoint', [ox, y + 1.2, z], [LANE, 0.4, 4], '#66bb6a', 'neon', { id: `${c.key}_cp${cpIdx}`, n: cpIdx });
      cps.push({ x: ox, y: y + 1.2, z });
      cpIdx++;
      void cp;
    }
  }
  // Lava bajo todo el recorrido (cae = vuelta al último punto de control)
  g.add('kill', [ox, -4, -L / 2], [LANE + 20, 1, L + 20], '#ff3d00', 'neon', { nc: true });
  // Meta
  g.add('finish', [ox, y + 0.2, -L + 6], [LANE, 0.4, 8], '#fdd835', 'neon', { id: `${c.key}_fin` });
  return { key: c.key, name: c.name, diff: c.diff, start: [ox, 1.2, 6], finishZ: -L + 6, checkpoints: cps, ox };
}

export function buildFallGuys() {
  const g = new WorldGen('fg');
  const courses = COURSES.map((c, i) => buildCourse(g, c, i));
  const xs = courses.map((c) => c.ox);
  const bounds = { min: [Math.min(...xs) - 60, -30, -L - 40], max: [Math.max(...xs) + 60, 120, 40] };
  return {
    version: 1,
    terrain: { type: 'flat', size: 1200, height: -1, color: '#1e88e5' },
    water: null,
    sky: { time: 0.35, dayNight: false, fog: true },
    bounds,
    spawns: courses.map((c) => c.start),
    objects: g.objects,
    vehicles: [],
    meta: { mode: 'fallguys', courses, laps: 1, minLapTime: 0 },
  };
}
