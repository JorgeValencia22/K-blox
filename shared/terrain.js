// Generación determinista de terreno (isla). El cliente lo usa para dibujar y
// para la física; el servidor lo usa para validar posiciones y mover enemigos.

export function mulberry32(seed) {
  let a = seed >>> 0;
  return function () {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function hash2(ix, iz, seed) {
  let h = (ix * 374761393 + iz * 668265263 + seed * 2246822519) | 0;
  h = Math.imul(h ^ (h >>> 13), 1274126177);
  h ^= h >>> 16;
  return (h >>> 0) / 4294967296;
}

const smooth = (t) => t * t * (3 - 2 * t);
export const smoothstep = (a, b, x) => {
  const t = Math.min(1, Math.max(0, (x - a) / (b - a)));
  return t * t * (3 - 2 * t);
};
const lerp = (a, b, t) => a + (b - a) * t;

export function valueNoise(x, z, seed) {
  const ix = Math.floor(x), iz = Math.floor(z);
  const fx = smooth(x - ix), fz = smooth(z - iz);
  const a = hash2(ix, iz, seed), b = hash2(ix + 1, iz, seed);
  const c = hash2(ix, iz + 1, seed), d = hash2(ix + 1, iz + 1, seed);
  return lerp(lerp(a, b, fx), lerp(c, d, fx), fz) * 2 - 1;
}

export function fbm(x, z, seed, octaves = 4) {
  let sum = 0, amp = 1, freq = 1, norm = 0;
  for (let i = 0; i < octaves; i++) {
    sum += valueNoise(x * freq, z * freq, seed + i * 17) * amp;
    norm += amp;
    amp *= 0.5;
    freq *= 2;
  }
  return sum / norm;
}

function distToSegment(px, pz, ax, az, bx, bz) {
  const dx = bx - ax, dz = bz - az;
  const t = Math.max(0, Math.min(1, ((px - ax) * dx + (pz - az) * dz) / (dx * dx + dz * dz)));
  const cx = ax + dx * t, cz = az + dz * t;
  return Math.hypot(px - cx, pz - cz);
}

export function distToPolyline(px, pz, pts) {
  let best = Infinity;
  for (let i = 0; i < pts.length - 1; i++) {
    const d = distToSegment(px, pz, pts[i][0], pts[i][1], pts[i + 1][0], pts[i + 1][1]);
    if (d < best) best = d;
  }
  return best;
}

// Rasgos fijos de la isla principal (Kest City).
export const ISLAND = {
  size: 512,
  res: 256,
  seaLevel: 0,
  cityCenter: [0, 0],
  cityRadius: 92,
  cityHeight: 3,
  mountains: [
    { x: -150, z: -140, h: 78, r: 55 },
    { x: -78, z: -190, h: 46, r: 38 },
    { x: -190, z: -55, h: 40, r: 40 },
  ],
  river: [[-118, -112], [-60, -128], [0, -124], [60, -116], [112, -104]],
  lake: { x: 140, z: -95, r: 34 },
  outlet: [[160, -80], [205, -55], [270, -40]],
  northRoad: { x: 0, z0: -90, z1: -175, width: 7 },
  airstrip: { x0: 88, x1: 196, z0: 26, z1: 54 },
};

function islandHeightRaw(x, z, seed) {
  const I = ISLAND;
  const half = I.size / 2;
  let h = 4.5 + fbm(x / 70, z / 70, seed, 4) * 7 + fbm(x / 18, z / 18, seed + 99, 2) * 1.2;

  for (const m of I.mountains) {
    const d2 = (x - m.x) ** 2 + (z - m.z) ** 2;
    h += m.h * Math.exp(-d2 / (2 * m.r * m.r)) * (0.85 + 0.15 * fbm(x / 12, z / 12, seed + 5, 2));
  }

  // Forma de la isla: cae hacia el mar en los bordes.
  const rn = Math.hypot(x, z) / half + fbm(x / 60, z / 60, seed + 31, 2) * 0.06;
  h = lerp(h, -14, smoothstep(0.7, 0.96, rn));

  // Explanada de la ciudad.
  const dc = Math.hypot(x - I.cityCenter[0], z - I.cityCenter[1]);
  h = lerp(h, I.cityHeight, 1 - smoothstep(I.cityRadius - 6, I.cityRadius + 22, dc));

  // Carretera norte hacia la montaña.
  const r = I.northRoad;
  if (z < r.z0 + 10 && z > r.z1 - 10) {
    const dx = Math.abs(x - r.x);
    h = lerp(h, I.cityHeight, 1 - smoothstep(r.width, r.width + 10, dx));
  }

  // Pista de aterrizaje de la avioneta.
  const a = I.airstrip;
  const ax = Math.max(a.x0 - x, 0, x - a.x1), az = Math.max(a.z0 - z, 0, z - a.z1);
  h = lerp(h, I.cityHeight, 1 - smoothstep(0, 16, Math.hypot(ax, az)));

  // Río, lago y desembocadura.
  const dr = Math.min(distToPolyline(x, z, I.river), distToPolyline(x, z, [I.river[I.river.length - 1], [I.lake.x, I.lake.z]]), distToPolyline(x, z, I.outlet));
  h = lerp(h, -2.6, 1 - smoothstep(5, 15, dr));
  const dl = Math.hypot(x - I.lake.x, z - I.lake.z);
  h = lerp(h, -3.8, 1 - smoothstep(I.lake.r - 10, I.lake.r + 6, dl));
  return h;
}

/**
 * Mapa de alturas muestreado en una rejilla. heightAt() interpola igual que la
 * malla triangulada para que lo que se ve coincida con lo que se pisa.
 */
export class Heightmap {
  constructor(size, res, fn) {
    this.size = size;
    this.res = res;
    this.half = size / 2;
    this.cell = size / res;
    this.data = new Float32Array((res + 1) * (res + 1));
    for (let j = 0; j <= res; j++) {
      for (let i = 0; i <= res; i++) {
        this.data[j * (res + 1) + i] = fn(-this.half + i * this.cell, -this.half + j * this.cell);
      }
    }
  }

  get(i, j) {
    const r = this.res;
    i = i < 0 ? 0 : i > r ? r : i;
    j = j < 0 ? 0 : j > r ? r : j;
    return this.data[j * (r + 1) + i];
  }

  heightAt(x, z) {
    const gx = (x + this.half) / this.cell, gz = (z + this.half) / this.cell;
    const i = Math.floor(gx), j = Math.floor(gz);
    const fx = gx - i, fz = gz - j;
    const h00 = this.get(i, j), h10 = this.get(i + 1, j), h01 = this.get(i, j + 1), h11 = this.get(i + 1, j + 1);
    // Mismo patrón de triangulación que PlaneGeometry (diagonal a-d).
    if (fx + fz <= 1) return h00 + (h10 - h00) * fx + (h01 - h00) * fz;
    return h11 + (h01 - h11) * (1 - fx) + (h10 - h11) * (1 - fz);
  }
}

const cache = new Map();

/** Devuelve (y cachea) el heightmap descrito por terrain {type, seed, size, ...}. */
export function getHeightmap(terrain) {
  if (!terrain) return null;
  const key = JSON.stringify(terrain);
  if (cache.has(key)) return cache.get(key);
  let hm;
  if (terrain.type === 'island') {
    hm = new Heightmap(ISLAND.size, ISLAND.res, (x, z) => islandHeightRaw(x, z, terrain.seed || 7));
  } else if (terrain.type === 'hills') {
    const size = terrain.size || 300, amp = terrain.amp ?? 6, seed = terrain.seed || 3;
    hm = new Heightmap(size, Math.min(200, Math.round(size / 2)), (x, z) => {
      const rn = Math.max(Math.abs(x), Math.abs(z)) / (size / 2);
      let h = 3 + fbm(x / 45, z / 45, seed, 4) * amp;
      return lerp(h, -10, smoothstep(0.86, 0.99, rn));
    });
  } else {
    const size = terrain.size || 200;
    hm = new Heightmap(size, 4, () => terrain.height ?? 0);
  }
  cache.set(key, hm);
  return hm;
}
