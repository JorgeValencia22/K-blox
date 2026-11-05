// Carretera infinita de Slow Roads: se genera por delante del coche a partir de una semilla y se
// descarta lo que queda atrás. Todo es determinista (la misma semilla da la misma carretera), así que
// todos los jugadores de una sala ven el mismo camino. Código compartido por cliente, servidor y tests.

export const STEP = 3; // metros entre puntos del eje
export const ROAD_HALF = 4.6; // media anchura del asfalto
export const SHOULDER = 3.2; // arcén de tierra a cada lado
export const MAX_LAT = 96; // hasta dónde se dibuja el terreno a cada lado
const MAX_CURV = 1 / 135;

const smooth = (a, b, v) => { const t = Math.max(0, Math.min(1, (v - a) / (b - a))); return t * t * (3 - 2 * t); };

function hash(i, seed) {
  let h = (Math.imul(i | 0, 0x27d4eb2d) ^ Math.imul(seed | 0, 0x165667b1)) >>> 0;
  h = Math.imul(h ^ (h >>> 15), 0x2c1b3c6d) >>> 0;
  h = Math.imul(h ^ (h >>> 12), 0x297a2d39) >>> 0;
  return ((h ^ (h >>> 15)) >>> 0) / 4294967296;
}
const fade = (t) => t * t * t * (t * (t * 6 - 15) + 10);

/** Ruido de valor 1D continuo en [0,1]. */
export function noise1(x, seed) {
  const i = Math.floor(x);
  const f = fade(x - i);
  return hash(i, seed) * (1 - f) + hash(i + 1, seed) * f;
}

/** Ruido de valor 2D continuo en [0,1]. */
export function noise2(x, z, seed) {
  const ix = Math.floor(x), iz = Math.floor(z);
  const fx = fade(x - ix), fz = fade(z - iz);
  const h = (a, b) => hash(a * 73856093 + b * 19349663, seed);
  const a = h(ix, iz) * (1 - fx) + h(ix + 1, iz) * fx;
  const b = h(ix, iz + 1) * (1 - fx) + h(ix + 1, iz + 1) * fx;
  return a * (1 - fz) + b * fz;
}

export class Road {
  constructor(seed = 1) {
    this.seed = seed | 0;
    this.first = 0; // índice absoluto del primer punto que se conserva
    this.xs = []; this.zs = []; this.ys = []; this.hd = [];
    this.last = -1; // índice absoluto del último punto generado
    this._x = 0; this._z = 0; this._psi = 0;
    this.ensure(400);
  }

  /** Curvatura del eje en la distancia s (positiva = gira a la izquierda). */
  curvature(s) {
    const a = noise1(s / 260 + 11, this.seed) * 2 - 1;
    const b = noise1(s / 85 + 3, this.seed + 7) * 2 - 1;
    const gate = smooth(0.32, 0.62, noise1(s / 520 + 99, this.seed + 3));
    const k = (a * 0.0046 + b * 0.0028) * (0.3 + 0.7 * gate) * smooth(0, 160, s);
    return Math.max(-MAX_CURV, Math.min(MAX_CURV, k));
  }

  /** Altura del eje en la distancia s. */
  elevation(s) {
    const big = (noise1(s / 340 + 5, this.seed + 21) * 2 - 1) * 10;
    const mid = (noise1(s / 115 + 17, this.seed + 33) * 2 - 1) * 2.2;
    return (big + mid) * smooth(0, 120, s);
  }

  /** Relieve del paisaje (lejos de la carretera) en [-26, 44]. */
  hills(x, z) {
    const f = noise2(x / 150, z / 150, this.seed + 41) * 0.62 + noise2(x / 62, z / 62, this.seed + 43) * 0.28 + noise2(x / 24, z / 24, this.seed + 47) * 0.1;
    return (f - 0.4) * 72;
  }

  /** Genera puntos hasta cubrir la distancia s. */
  ensure(s) {
    const need = Math.ceil(s / STEP);
    while (this.last < need) {
      const i = this.last + 1;
      if (i === 0) { this._x = 0; this._z = 0; this._psi = 0; } else {
        const sm = (i - 0.5) * STEP;
        this._psi += this.curvature(sm) * STEP;
        this._x += Math.sin(this._psi) * STEP;
        this._z += Math.cos(this._psi) * STEP;
      }
      this.xs.push(this._x); this.zs.push(this._z); this.ys.push(this.elevation(i * STEP)); this.hd.push(this._psi);
      this.last = i;
    }
  }

  /** Olvida los puntos anteriores a la distancia s (el coche ya no puede volver). */
  prune(s) {
    const keep = Math.max(this.first, Math.floor(s / STEP) - 2);
    const n = keep - this.first;
    if (n < 16) return false;
    this.xs.splice(0, n); this.zs.splice(0, n); this.ys.splice(0, n); this.hd.splice(0, n);
    this.first = keep;
    return true;
  }

  get sMin() { return this.first * STEP; }
  get sMax() { return this.last * STEP; }

  /** Posición, altura y tangente del eje en s. */
  at(s, out = {}) {
    this.ensure(s + STEP * 3);
    const f = Math.max(this.first, Math.min(this.last - 1, Math.floor(s / STEP)));
    const t = Math.max(0, Math.min(1, s / STEP - f));
    const i = f - this.first;
    out.x = this.xs[i] + (this.xs[i + 1] - this.xs[i]) * t;
    out.z = this.zs[i] + (this.zs[i + 1] - this.zs[i]) * t;
    out.y = this.ys[i] + (this.ys[i + 1] - this.ys[i]) * t;
    let dpsi = this.hd[i + 1] - this.hd[i];
    out.psi = this.hd[i] + dpsi * t;
    out.tx = Math.sin(out.psi); out.tz = Math.cos(out.psi); // hacia delante
    out.lx = out.tz; out.lz = -out.tx; // hacia la izquierda
    return out;
  }

  /** Altura del terreno en el punto a distancia lateral `lat` del eje (con altura de eje `roadY`). */
  heightAt(x, z, lat, roadY) {
    const d = Math.abs(lat);
    if (d <= ROAD_HALF) return roadY;
    const verge = -0.2 * smooth(ROAD_HALF, ROAD_HALF + SHOULDER, d);
    const w = smooth(ROAD_HALF + SHOULDER, ROAD_HALF + SHOULDER + 46, d);
    return roadY + verge + w * this.hills(x, z);
  }

  /**
   * Proyecta (x, z) sobre la carretera: busca el punto del eje más cercano cerca de `hintS`.
   * Rellena out = { s, lat, roadY, h, grip, on }.
   */
  sample(x, z, hintS = 0, out = {}) {
    this.ensure(hintS + 80);
    const c = Math.max(this.first + 1, Math.min(this.last - 2, Math.round(hintS / STEP)));
    let bestD = Infinity, bestI = c, bestT = 0;
    const lo = Math.max(this.first, c - 9), hi = Math.min(this.last - 1, c + 9);
    for (let i = lo; i <= hi; i++) {
      const a = i - this.first;
      const ax = this.xs[a], az = this.zs[a];
      const bx = this.xs[a + 1] - ax, bz = this.zs[a + 1] - az;
      let t = ((x - ax) * bx + (z - az) * bz) / (bx * bx + bz * bz);
      t = Math.max(0, Math.min(1, t));
      const dx = x - (ax + bx * t), dz = z - (az + bz * t);
      const d = dx * dx + dz * dz;
      if (d < bestD) { bestD = d; bestI = i; bestT = t; }
    }
    const a = bestI - this.first;
    const px = this.xs[a] + (this.xs[a + 1] - this.xs[a]) * bestT;
    const pz = this.zs[a] + (this.zs[a + 1] - this.zs[a]) * bestT;
    const psi = this.hd[a] + (this.hd[a + 1] - this.hd[a]) * bestT;
    const lat = (x - px) * Math.cos(psi) - (z - pz) * Math.sin(psi);
    out.s = (bestI + bestT) * STEP;
    out.lat = lat;
    out.roadY = this.ys[a] + (this.ys[a + 1] - this.ys[a]) * bestT;
    out.h = this.heightAt(x, z, lat, out.roadY);
    const d = Math.abs(lat);
    out.on = d <= ROAD_HALF;
    out.grip = d <= ROAD_HALF + 0.15 ? 1 : d <= ROAD_HALF + SHOULDER ? 0.72 : 0.58;
    return out;
  }
}
