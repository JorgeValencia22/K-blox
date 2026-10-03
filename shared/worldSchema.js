// Formato de mundos (JSON) y su validación.
// Los mundos de usuarios NO pueden contener código: solo objetos de una lista
// cerrada con propiedades numéricas/enumeradas que el motor interpreta.

import { LIMITS, MATERIALS } from './constants.js';

export const OBJECT_TYPES = {
  block: { label: 'Bloque', size: [4, 1, 4], color: '#8bc34a', material: 'plastic' },
  sphere: { label: 'Esfera', size: [2, 2, 2], color: '#ff7043', material: 'plastic' },
  cylinder: { label: 'Cilindro', size: [2, 2, 2], color: '#42a5f5', material: 'plastic' },
  wedge: { label: 'Rampa', size: [4, 2, 4], color: '#b0bec5', material: 'stone' },
  stairs: { label: 'Escalera', size: [4, 3, 6], color: '#a1887f', material: 'wood' },
  tree: { label: 'Árbol', size: [3, 6, 3], color: '#43a047', material: 'grass' },
  door: { label: 'Puerta', size: [2, 3.2, 0.3], color: '#8d6e63', material: 'wood' },
  window: { label: 'Ventana', size: [3, 2, 0.2], color: '#b3e5fc', material: 'glass' },
  light: { label: 'Luz', size: [0.6, 0.6, 0.6], color: '#fff3c4', material: 'neon', props: { intensity: [1.5, 0, 5], range: [14, 2, 40] } },
  deco: { label: 'Decoración', size: [1, 1, 1], color: '#ec407a', material: 'plastic', props: { kind: ['flower', 'bush', 'rock', 'lamp', 'bench', 'fence', 'barrel', 'crate', 'statue', 'fountain'] } },
  platform: { label: 'Plataforma móvil', size: [4, 0.6, 4], color: '#ffca28', material: 'metal', props: { axis: ['x', 'y', 'z'], dist: [6, 0, 60], speed: [0.4, 0.05, 3] } },
  spawn: { label: 'Punto de aparición', size: [4, 0.4, 4], color: '#26c6da', material: 'neon' },
  checkpoint: { label: 'Punto de control', size: [4, 0.4, 4], color: '#66bb6a', material: 'neon', props: { n: [1, 1, 99] } },
  finish: { label: 'Meta', size: [6, 0.4, 6], color: '#fdd835', material: 'neon' },
  kill: { label: 'Lava', size: [4, 0.6, 4], color: '#ff3d00', material: 'neon' },
  coin: { label: 'Moneda', size: [1, 1, 1], color: '#ffd54f', material: 'metal' },
  jumppad: { label: 'Trampolín', size: [2, 0.4, 2], color: '#ab47bc', material: 'neon', props: { power: [24, 8, 60] } },
  seat: { label: 'Asiento', size: [1.6, 1, 1.6], color: '#5c6bc0', material: 'plastic' },
  sign: { label: 'Cartel', size: [3, 2, 0.2], color: '#f5f5f5', material: 'wood', props: { text: 'text' } },
};

// Tipos que solo pueden aparecer en los mundos oficiales (generados por el código).
// Decoraciones que requieren haber comprado el objeto en la tienda.
export const PREMIUM_DECO = { statue: 'deco_statue', fountain: 'deco_fountain' };

export const BUILTIN_ONLY_TYPES = ['chest', 'switch', 'resource', 'gem', 'zone', 'road', 'water'];

export function makeObject(type, id, p = [0, 0, 0]) {
  const def = OBJECT_TYPES[type];
  const o = { id, t: type, p: [...p], ry: 0, s: [...def.size], c: def.color, m: def.material };
  if (def.props) {
    for (const [k, spec] of Object.entries(def.props)) {
      if (Array.isArray(spec) && typeof spec[0] === 'number') o[k] = spec[0];
      else if (Array.isArray(spec)) o[k] = spec[0];
      else if (spec === 'text') o[k] = 'Hola';
    }
  }
  return o;
}

const num = (v, min, max, def) => {
  const n = Number(v);
  if (!Number.isFinite(n)) return def;
  return Math.min(max, Math.max(min, n));
};
const round = (v) => Math.round(v * 1000) / 1000;
const HEX = /^#[0-9a-fA-F]{6}$/;

/** Limpia un texto corto (sin etiquetas ni caracteres de control). */
export function cleanText(s, max) {
  return String(s ?? '')
    .replace(/[\u0000-\u001f\u007f<>]/g, '')
    .trim()
    .slice(0, max);
}

/**
 * Valida y normaliza un mundo creado por un usuario.
 * Devuelve { ok, world } o { ok:false, error }.
 */
export function validateUserWorld(input, { owned = null } = {}) {
  if (!input || typeof input !== 'object') return { ok: false, error: 'Mundo inválido' };
  const raw = JSON.stringify(input);
  if (raw.length > LIMITS.worldMaxBytes) return { ok: false, error: 'El mundo supera el tamaño máximo' };
  const objs = Array.isArray(input.objects) ? input.objects : [];
  if (objs.length > LIMITS.worldMaxObjects) return { ok: false, error: `Máximo ${LIMITS.worldMaxObjects} objetos` };

  const t = input.terrain || {};
  const terrainType = ['flat', 'hills', 'none'].includes(t.type) ? t.type : 'flat';
  const world = {
    version: 1,
    terrain: terrainType === 'none' ? null : {
      type: terrainType,
      size: num(t.size, 50, 400, 200),
      seed: Math.floor(num(t.seed, 1, 99999, 3)),
      amp: num(t.amp, 0, 15, 5),
      height: 0,
      color: HEX.test(t.color) ? t.color : '#7cb342',
    },
    water: input.water && input.water.enabled ? { level: num(input.water.level, -20, 20, 0) } : null,
    sky: {
      time: num(input.sky?.time, 0, 1, 0.35),
      dayNight: !!input.sky?.dayNight,
      fog: input.sky?.fog !== false,
    },
    objects: [],
  };

  const ids = new Set();
  for (const o of objs) {
    if (!o || typeof o !== 'object') continue;
    const def = OBJECT_TYPES[o.t];
    if (!def) continue;
    let id = cleanText(o.id, 24) || `o${world.objects.length}`;
    while (ids.has(id)) id += '_';
    ids.add(id);
    const p = Array.isArray(o.p) ? o.p : [];
    const s = Array.isArray(o.s) ? o.s : [];
    const clean = {
      id,
      t: o.t,
      p: [round(num(p[0], -1000, 1000, 0)), round(num(p[1], -200, 500, 0)), round(num(p[2], -1000, 1000, 0))],
      ry: round(num(o.ry, -360, 360, 0)),
      s: [round(num(s[0], 0.1, 200, def.size[0])), round(num(s[1], 0.1, 200, def.size[1])), round(num(s[2], 0.1, 200, def.size[2]))],
      c: HEX.test(o.c) ? o.c.toLowerCase() : def.color,
      m: MATERIALS.includes(o.m) ? o.m : def.material,
    };
    if (def.props) {
      for (const [k, spec] of Object.entries(def.props)) {
        if (spec === 'text') clean[k] = cleanText(o[k], 60);
        else if (typeof spec[0] === 'number') clean[k] = round(num(o[k], spec[1], spec[2], spec[0]));
        else clean[k] = spec.includes(o[k]) ? o[k] : spec[0];
      }
    }
    if (clean.t === 'deco' && PREMIUM_DECO[clean.kind] && owned && !owned.has(PREMIUM_DECO[clean.kind])) clean.kind = 'rock';
    world.objects.push(clean);
  }
  return { ok: true, world };
}

export function newEmptyWorld() {
  return {
    version: 1,
    terrain: { type: 'flat', size: 200, seed: 3, amp: 5, height: 0, color: '#7cb342' },
    water: null,
    sky: { time: 0.35, dayNight: false, fog: true },
    objects: [
      { ...makeObject('spawn', 'spawn1', [0, 0.2, 0]) },
      { ...makeObject('block', 'b1', [0, 0.5, -10]), s: [8, 1, 8] },
    ],
  };
}

/** Puntos de aparición de un mundo (objetos spawn o lista explícita). */
export function worldSpawns(world) {
  const list = (world.objects || []).filter((o) => o.t === 'spawn').map((o) => [o.p[0], o.p[1] + o.s[1] / 2 + 0.1, o.p[2]]);
  if (world.spawns && world.spawns.length) return world.spawns;
  return list.length ? list : [[0, 5, 0]];
}
