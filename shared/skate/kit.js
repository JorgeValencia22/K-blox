// Skate Pro: piezas para construir mapas (cajas, rampas, cuartos de tubo, piscinas, escaleras, raíles…).
// Unidades en metros; el «adelante» local de una pieza con ángulo `yaw` es (sin yaw, cos yaw) en (x, z).

export const P = (list) => list.flat();
export const box = (x, z, w, d, h, yaw = 0, o = {}) => ({ t: 'box', x, z, w, d, h, yaw, ...o });
export const ramp = (x, z, w, d, h0, h1, yaw = 0, o = {}) => ({ t: 'ramp', x, z, w, d, h0, h1, yaw, ...o });
/** Cuarto de tubo: la base está en (x,z) y sube hacia (sin yaw, cos yaw). `r` es el radio y `h` la altura (h ≤ r). */
export const quarter = (x, z, w, r, h, yaw = 0, deck = 1.4, o = {}) => ({ t: 'quarter', x, z, w, r, h, yaw, deck, ...o });
export const pyramid = (x, z, w, d, h, fl = 3, yaw = 0, o = {}) => ({ t: 'pyr', x, z, w, d, h, fl, yaw, ...o });
export const stairs = (x, z, w, n, run, rise, yaw = 0, o = {}) => ({ t: 'stairs', x, z, w, n, run, rise, yaw, ...o });
export const rail = (x1, z1, x2, z2, h1, h2 = h1, o = {}) => ({ t: 'rail', x1, z1, x2, z2, h1, h2, ...o });
export const bowl = (x, z, rx, rz, depth, a = 0.42, sq = false, yaw = 0, o = {}) => ({ t: 'bowl', x, z, rx, rz, depth, a, sq, yaw, ...o });
export const zone = (x, z, w, d, drag, o = {}) => ({ t: 'zone', x, z, w, d, drag, ...o });
export const wall = (x, z, w, d, h, yaw = 0, o = {}) => box(x, z, w, d, h, yaw, { solid: true, ...o });

/** Medio tubo: eje de marcha `yaw`, tramo plano `flat` entre dos cuartos de tubo. */
export function halfpipe(x, z, w, flat, r, h, yaw = 0, deck = 1.4, o = {}) {
  const dx = Math.sin(yaw), dz = Math.cos(yaw);
  return [
    quarter(x - dx * flat / 2, z - dz * flat / 2, w, r, h, yaw + Math.PI, deck, o),
    quarter(x + dx * flat / 2, z + dz * flat / 2, w, r, h, yaw, deck, o),
  ];
}
/** Caja de salto con rampas a los dos lados. */
export function funbox(x, z, w, d, h, kick = 3.2, yaw = 0, o = {}) {
  const dx = Math.sin(yaw), dz = Math.cos(yaw), L = d / 2 + kick / 2;
  return [
    box(x, z, w, d, h, yaw, o),
    ramp(x - dx * L, z - dz * L, w, kick, 0, h, yaw, o),
    ramp(x + dx * L, z + dz * L, w, kick, h, 0, yaw, o),
  ];
}
/** Escalera con pasamanos a un lado y plataforma de llegada. */
export function stairSet(x, z, w, n, run, rise, yaw = 0, o = {}) {
  const dx = Math.sin(yaw), dz = Math.cos(yaw), ox = Math.cos(yaw), oz = -Math.sin(yaw);
  const len = n * run, top = n * rise, side = w / 2 + 0.35, y0 = o.y0 || 0;
  const out = [stairs(x, z, w, n, run, rise, yaw, o), box(x + dx * (len + 2.5), z + dz * (len + 2.5), w, 5, top, yaw, o)];
  if (o.rail !== false) {
    for (const s of o.both ? [-1, 1] : [1]) {
      out.push(rail(x + ox * side * s, z + oz * side * s, x + ox * side * s + dx * len, z + oz * side * s + dz * len, y0 + 0.95, y0 + top + 0.95));
    }
  }
  return out;
}

