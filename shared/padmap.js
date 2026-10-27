// Mando (DualShock 4, Xbox y similares): acciones, asignación de botones por defecto, zona muerta,
// lectura de mandos que el navegador no reconoce como «estándar» y elección del botón vecino al
// navegar por los menús. Son funciones puras para poder probarlas sin navegador.

/** Acciones que se pueden asignar a un botón. `code` es la tecla/botón del juego que se simula. */
export const PAD_ACTIONS = [
  { id: 'jump', label: 'Saltar / esquivar', code: 'Space' },
  { id: 'interact', label: 'Interactuar / hablar', code: 'KeyE' },
  { id: 'action', label: 'Acción principal', code: 'KeyF' },
  { id: 'reset', label: 'Reiniciar / recargar', code: 'KeyR' },
  { id: 'special', label: 'Habilidad / bajar', code: 'KeyQ' },
  { id: 'swap', label: 'Cambiar arma', code: 'KeyX' },
  { id: 'aim', label: 'Apuntar / bloquear', code: 'Mouse2' },
  { id: 'fire', label: 'Disparar / golpear', code: 'Mouse0' },
  { id: 'sprint', label: 'Correr', code: 'ShiftLeft' },
  { id: 'crouch', label: 'Agacharse / descender', code: 'KeyC' },
  { id: 'players', label: 'Lista de jugadores', code: 'Tab' },
  { id: 'pause', label: 'Pausa / menú', code: 'Escape' },
  { id: 'opt1', label: 'Opción 1 / arma 1', code: 'Digit1' },
  { id: 'opt2', label: 'Opción 2 / arma 2', code: 'Digit2' },
  { id: 'emotes', label: 'Emotes', code: 'KeyG' },
  { id: 'chat', label: 'Abrir chat', code: 'Enter' },
  { id: 'extra1', label: 'Extra 1 (B)', code: 'KeyB' },
  { id: 'extra2', label: 'Extra 2 (V)', code: 'KeyV' },
  { id: 'none', label: 'Sin función', code: null },
];
export const ACTION_BY_ID = Object.fromEntries(PAD_ACTIONS.map((a) => [a.id, a]));

/** Nombres de los 18 botones del formato estándar (con los del DualShock 4). */
export const PAD_BUTTONS = ['✕', '○', '□', '△', 'L1', 'R1', 'L2', 'R2', 'Share', 'Options', 'L3', 'R3', '↑', '↓', '←', '→', 'PS', 'Panel táctil'];

/** Botón → acción. */
export const DEFAULT_PAD = {
  0: 'jump', 1: 'interact', 2: 'action', 3: 'reset', 4: 'special', 5: 'swap', 6: 'aim', 7: 'fire', 8: 'players', 9: 'pause',
  10: 'sprint', 11: 'crouch', 12: 'opt1', 13: 'opt2', 14: 'emotes', 15: 'chat', 16: 'none', 17: 'extra1',
};

export function padMap(overrides = {}) {
  const m = { ...DEFAULT_PAD };
  for (const [k, v] of Object.entries(overrides || {})) if (ACTION_BY_ID[v] && k in DEFAULT_PAD) m[k] = v;
  return m;
}

/** Zona muerta circular con reescalado: dentro de la zona no hay movimiento y fuera crece desde 0. */
export function deadzone(x, y, dz = 0.15) {
  const l = Math.hypot(x, y);
  if (l <= dz) return { x: 0, y: 0 };
  const k = (Math.min(1, l) - dz) / (1 - dz) / l;
  return { x: x * k, y: y * k };
}

/** Curva de la cámara: precisa con poco movimiento y rápida al final. */
export const curve = (v) => Math.sign(v) * Math.abs(v) ** 1.6;

/** Ejes del mando «hat» de algunos DualShock 4 (Firefox): -1 arriba, -0.71 arriba-derecha… 1.28 en reposo. */
export function hatToDpad(v) {
  const d = { up: false, down: false, left: false, right: false };
  if (typeof v !== 'number' || v > 1.1) return d;
  const steps = [-1, -0.714, -0.428, -0.143, 0.143, 0.428, 0.714, 1]; // arriba, arriba-der, der, abajo-der, abajo, abajo-izq, izq, arriba-izq
  let best = 0;
  steps.forEach((s, i) => { if (Math.abs(s - v) < Math.abs(steps[best] - v)) best = i; });
  d.up = best === 0 || best === 1 || best === 7;
  d.right = best === 1 || best === 2 || best === 3;
  d.down = best === 3 || best === 4 || best === 5;
  d.left = best === 5 || best === 6 || best === 7;
  return d;
}

export const isDualShock = (id = '') => /054c|dualshock|wireless controller|ps4|playstation/i.test(id);

/**
 * Convierte la lectura del navegador en un formato común: 18 botones (valor y pulsado) y 4 ejes.
 * `gp` = { id, mapping, buttons:[{pressed,value}], axes:[] }.
 */
export function normalizePad(gp) {
  const btn = (i) => gp.buttons[i] || { pressed: false, value: 0 };
  const out = { b: new Array(18).fill(false), v: new Array(18).fill(0), ax: [0, 0, 0, 0] };
  const set = (i, src) => { const s = btn(src); out.b[i] = !!s.pressed || s.value > 0.5; out.v[i] = s.value || (s.pressed ? 1 : 0); };
  if (gp.mapping === 'standard' || !isDualShock(gp.id)) {
    for (let i = 0; i < 18; i++) set(i, i);
    out.ax = [gp.axes[0] || 0, gp.axes[1] || 0, gp.axes[2] || 0, gp.axes[3] || 0];
    return out;
  }
  // DualShock 4 sin formato estándar (Firefox/Windows): orden propio y cruceta como eje
  const order = [1, 2, 0, 3, 4, 5, 6, 7, 8, 9, 10, 11];
  order.forEach((src, i) => set(i, src));
  set(16, 12);
  set(17, 13);
  const d = hatToDpad(gp.axes[9]);
  out.b[12] = d.up; out.b[13] = d.down; out.b[14] = d.left; out.b[15] = d.right;
  out.ax = [gp.axes[0] || 0, gp.axes[1] || 0, gp.axes[2] || 0, gp.axes[5] || 0];
  if (!out.b[6] && (gp.axes[3] || -1) > -0.5) { out.b[6] = true; out.v[6] = 1; }
  if (!out.b[7] && (gp.axes[4] || -1) > -0.5) { out.b[7] = true; out.v[7] = 1; }
  return out;
}

/**
 * Elige el elemento vecino al navegar con la cruceta: `from` y cada `rects[i]` son {x,y,w,h};
 * `dir` es 'up' | 'down' | 'left' | 'right'. Devuelve el índice o -1.
 */
export function pickDirection(from, rects, dir) {
  const c = (r) => ({ x: r.x + r.w / 2, y: r.y + r.h / 2 });
  const a = c(from);
  let best = -1, bs = Infinity;
  rects.forEach((r, i) => {
    const b = c(r);
    const dx = b.x - a.x, dy = b.y - a.y;
    const along = dir === 'right' ? dx : dir === 'left' ? -dx : dir === 'down' ? dy : -dy;
    const across = dir === 'left' || dir === 'right' ? Math.abs(dy) : Math.abs(dx);
    if (along < 4) return;
    const score = along + across * 2.2;
    if (score < bs) { bs = score; best = i; }
  });
  return best;
}
