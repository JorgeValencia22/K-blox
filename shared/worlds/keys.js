// Teclas ASMR: obby relajante (ASMR) sobre teclados mecánicos gigantes. Cada tecla
// se hunde y suena al pisarla. Los puntos de control son barras espaciadoras.
import { WorldGen } from './builder.js';
import { mulberry32 } from '../terrain.js';

const ROWS = [
  [['Esc', 1], ['1', 1], ['2', 1], ['3', 1], ['4', 1], ['5', 1], ['6', 1], ['7', 1], ['8', 1], ['9', 1], ['0', 1], ['-', 1], ['=', 1], ['⌫', 2]],
  [['Tab', 1.5], ['Q', 1], ['W', 1], ['E', 1], ['R', 1], ['T', 1], ['Y', 1], ['U', 1], ['I', 1], ['O', 1], ['P', 1], ['[', 1], [']', 1], ['\\', 1.5]],
  [['Bloq', 1.75], ['A', 1], ['S', 1], ['D', 1], ['F', 1], ['G', 1], ['H', 1], ['J', 1], ['K', 1], ['L', 1], ['Ñ', 1], ['´', 1], ['Enter', 2.25]],
  [['Shift', 2.25], ['Z', 1], ['X', 1], ['C', 1], ['V', 1], ['B', 1], ['N', 1], ['M', 1], [',', 1], ['.', 1], ['-', 1], ['Shift', 2.75]],
  [['Ctrl', 1.25], ['Win', 1.25], ['Alt', 1.25], ['', 6.25], ['AltGr', 1.25], ['Fn', 1.25], ['Menú', 1.25], ['Ctrl', 1.25]],
];
const CAP_COLORS = { normal: '#eceff1', mod: '#90a4ae', accent: '#ff7043', enter: '#42a5f5' };

function capColor(label, theme) {
  if (label === 'Esc') return theme.accent;
  if (label === 'Enter') return theme.enter;
  if (label.length > 1 || label === '') return theme.mod;
  return theme.normal;
}

export function buildKeys() {
  const g = new WorldGen('k');
  const rnd = mulberry32(88);

  // Escritorio de salida
  g.block([0, -0.6, 22], [40, 1.2, 20], '#6d4c41', 'wood');
  g.add('spawn', [0, 0.2, 24], [4, 0.4, 4], '#26c6da', 'neon');
  g.add('sign', [0, 3, 30], [12, 2.4, 0.3], '#212121', 'metal', { text: 'TECLAS ASMR' });

  /**
   * Coloca un teclado completo. (cx, y, zFront): centro X, altura de la base y
   * borde delantero (z más positiva). U = tamaño de una tecla. holes = probabilidad de hueco.
   */
  const keyboard = (cx, y, zFront, U, theme, { holes = 0, glow = '#7c4dff', skipSpace = false } = {}) => {
    const rowsW = Math.max(...ROWS.map((r) => r.reduce((a, [, w]) => a + w, 0)));
    const width = rowsW * U + U * 0.6;
    const depth = ROWS.length * U + U * 0.6;
    const zc = zFront - depth / 2;
    // Carcasa y luz RGB inferior
    g.block([cx, y - 0.6, zc], [width, 1.2, depth], '#263238', 'metal');
    g.block([cx, y - 1.25, zc], [width - 0.4, 0.15, depth - 0.4], glow, 'neon', { nc: true, dance: true });
    // Filas de teclas (la fila de la barra espaciadora queda delante)
    ROWS.forEach((row, ri) => {
      const rowZ = zFront - U * 0.3 - (ROWS.length - 1 - ri) * U - U / 2;
      let xx = cx - width / 2 + U * 0.3;
      for (const [label, w] of row) {
        const kw = w * U;
        const space = label === '';
        const skip = (space && skipSpace) || (!space && holes && rnd() < holes);
        if (!skip) {
          g.add('keycap', [xx + kw / 2, y + 0.55, rowZ], [kw - U * 0.1, 1.1, U * 0.9], capColor(label, theme), 'plastic', { label: space ? '' : label });
        }
        xx += kw;
      }
    });
    return { depth, zBack: zFront - depth };
  };

  const U = 3.4;
  const theme1 = { ...CAP_COLORS };
  // 1) Primer teclado sobre el escritorio
  let kb = keyboard(0, 0, 12, U, theme1, { glow: '#7c4dff' });
  let z = kb.zBack;
  let y = 1.1;

  // 2) Escalera de teclas sueltas que escriben "KESTWORLDS"
  const word = 'KESTWORLDS';
  for (let i = 0; i < word.length; i++) {
    z -= 4.6;
    y += 1.1;
    g.add('keycap', [(i % 2 ? 2.2 : -2.2), y - 0.55, z], [3, 1.1, 3], i % 3 === 0 ? '#ffd54f' : '#f8bbd0', 'plastic', { label: word[i] });
  }
  // Barra espaciadora flotante = punto de control 1
  z -= 6;
  g.add('keycap', [0, y - 0.55, z], [16, 1.1, 3.4], '#90caf9', 'plastic', { label: '' });
  g.add('checkpoint', [0, y + 0.2, z], [3, 0.3, 2], '#66bb6a', 'neon', { n: 1 });

  // 3) Segundo teclado más alto y con huecos
  const y2 = y + 1.2;
  const theme2 = { normal: '#212121', mod: '#424242', accent: '#e040fb', enter: '#00e5ff' };
  kb = keyboard(0, y2 - 1.1, z - 3.2, U, theme2, { holes: 0.22, glow: '#00e5ff' });
  z = kb.zBack;
  y = y2;
  z -= 5;
  g.add('keycap', [0, y - 0.55, z], [16, 1.1, 3.4], '#ce93d8', 'plastic', { label: '' });
  g.add('checkpoint', [0, y + 0.2, z], [3, 0.3, 2], '#66bb6a', 'neon', { n: 2 });

  // 4) Torre de teclado numérico en espiral
  const nums = ['7', '8', '9', '4', '5', '6', '1', '2', '3', '0', '.', '+', '-', '*', '/', 'Bloq'];
  const cz = z - 12;
  for (let i = 0; i < nums.length; i++) {
    const a = ((90 + i * 38) * Math.PI) / 180;
    y += 1.15;
    g.add('keycap', [Math.cos(a) * 7, y - 0.55, cz + Math.sin(a) * 7], [3, 1.1, 3], i % 4 === 3 ? '#ffb74d' : '#b2dfdb', 'plastic', { label: nums[i] });
  }
  y += 1.1;
  g.add('cylinder', [0, y - 18, cz], [6.5, 36, 6.5], '#37474f', 'metal');
  g.add('keycap', [0, y - 0.55, cz], [6.6, 1.1, 6.6], '#26a69a', 'plastic', { label: 'NUM' });
  g.add('checkpoint', [0, y + 0.2, cz], [2.5, 0.3, 2.5], '#66bb6a', 'neon', { n: 3 });
  z = cz - 3.3;

  // 5) Teclas que se mueven como si alguien estuviera escribiendo
  const moving = ['A', 'S', 'M', 'R', '♪'];
  for (let i = 0; i < moving.length; i++) {
    z -= 6.2;
    g.add('keycap', [0, y - 0.55, z], [3.4, 1.1, 3.4], ['#ff8a80', '#ffd180', '#ccff90', '#80d8ff', '#ea80fc'][i], 'plastic', {
      label: moving[i], axis: i % 2 ? 'y' : 'x', dist: i % 2 ? 2.5 : 8, speed: 0.22 + i * 0.03,
    });
  }

  // Barra espaciadora = punto de control 4
  z -= 7;
  g.add('keycap', [0, y - 0.55, z], [16, 1.1, 3.4], '#ffcc80', 'plastic', { label: '' });
  g.add('checkpoint', [0, y + 0.2, z], [3, 0.3, 2], '#66bb6a', 'neon', { n: 4 });

  // 7) Piano gigante: teclas blancas largas y negras más altas (cada una es una nota)
  const notes = ['DO', 'RE', 'MI', 'FA', 'SOL', 'LA', 'SI', 'DO'];
  z -= 4;
  for (let i = 0; i < notes.length; i++) {
    z -= 3.3;
    g.add('keycap', [0, y - 0.55 + i * 0.35, z], [10, 1.1, 3], '#fafafa', 'plastic', { label: notes[i] });
    if (i % 7 !== 2 && i < notes.length - 1) g.add('keycap', [(i % 2 ? 3 : -3), y + 0.35 + i * 0.35, z - 1.65], [2.2, 1.1, 1.4], '#212121', 'plastic', { label: '♯' });
  }
  y += notes.length * 0.35;

  // 8) Ratón gigante y alfombrilla: hay que subir por el ratón para llegar al ENTER
  z -= 9;
  g.block([0, y - 1.15, z - 4], [22, 0.2, 18], '#3949ab', 'plastic');
  g.add('sphere', [0, y + 0.2, z - 4], [6, 3.2, 9], '#eceff1', 'plastic');
  g.block([0, y + 1.9, z - 6.5], [0.3, 0.3, 3], '#90a4ae', 'plastic', { nc: true });
  g.add('cylinder', [0, y + 1.8, z - 7.8], [0.8, 0.4, 0.8], '#ff7043', 'neon', { nc: true });
  g.add('keycap', [3, y - 0.55, z - 11], [3, 1.1, 3], '#ffd54f', 'plastic', { label: 'L' });
  g.add('keycap', [-1, y + 0.05, z - 14.5], [3, 1.1, 3], '#ffd54f', 'plastic', { label: 'R' });
  z -= 13;
  y += 1.2;

  // 6) Tecla ENTER gigante = meta
  z -= 9;
  g.add('keycap', [0, y - 0.55, z], [12, 1.1, 10], '#42a5f5', 'plastic', { label: 'ENTER' });
  g.add('finish', [0, y + 0.2, z], [5, 0.3, 5], '#fdd835', 'neon');

  // Objetos de escritorio gigantes alrededor del recorrido (decoración)
  g.add('cylinder', [-30, 8, -20], [12, 16, 12], '#ef9a9a', 'plastic', { nc: true }); // taza
  g.add('cylinder', [-30, 15.8, -20], [11, 0.4, 11], '#5d4037', 'plastic', { nc: true }); // café
  g.block([-37, 9, -20], [2, 7, 1.5], '#ef9a9a', 'plastic', { nc: true }); // asa
  g.block([34, 6, -60], [3, 3, 40], '#fdd835', 'wood', { nc: true }); // lápiz
  g.block([34, 6, -82], [2, 2, 4], '#ffccbc', 'wood', { nc: true });
  g.block([34, 6, -39], [3.2, 3.2, 2], '#f48fb1', 'plastic', { nc: true }); // goma
  ['#fff59d', '#80deea', '#f8bbd0'].forEach((c, i) => g.block([-26 + i * 9, -3 + i, -110 - i * 6], [8, 0.2, 8], c, 'plastic', { nc: true }));
  g.add('sphere', [36, 10, -140], [14, 14, 14], '#80cbc4', 'glass', { nc: true }); // auriculares (almohadilla)
  g.add('sphere', [-36, 10, -140], [14, 14, 14], '#80cbc4', 'glass', { nc: true });

  // Monitor gigante de fondo
  g.block([0, 40, z - 60], [90, 50, 3], '#111111', 'metal', { nc: true });
  g.add('sign', [0, 40, z - 58.3], [80, 42, 0.2], '#1a237e', 'neon', { text: 'Teclas ASMR', nc: true });

  return {
    version: 1,
    terrain: null,
    water: null,
    sky: { time: 0.8, dayNight: false, fog: true },
    bounds: { min: [-160, -30, z - 120], max: [160, y + 80, 80] },
    spawns: [[0, 0.3, 24], [3, 0.3, 24], [-3, 0.3, 24]],
    objects: g.objects,
    vehicles: [],
    meta: { mode: 'keys', minTime: 40 },
  };
}
