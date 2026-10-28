// Skate Pro: el suelo de un mapa. Se consulta con `heightAt(x, z)` (altura de la superficie y si es
// un obstáculo duro, como una caja o un escalón, o una superficie continua, como una rampa) y con las
// líneas de grind (raíles, bordes de cajas y bordes de piscina).

const sq = (v) => v * v;

export function prepare(p) {
  const c = Math.cos(p.yaw || 0), s = Math.sin(p.yaw || 0);
  const q = { ...p, c, s, y0: p.y0 || 0 };
  if (p.t === 'box') { q.hw = p.w / 2; q.hd = p.d / 2; q.rad = Math.hypot(q.hw, q.hd); q.hard = true; }
  else if (p.t === 'ramp') { q.hw = p.w / 2; q.hd = p.d / 2; q.rad = Math.hypot(q.hw, q.hd); }
  else if (p.t === 'quarter') {
    q.hw = p.w / 2;
    q.umax = Math.sqrt(Math.max(0.01, sq(p.r) - sq(p.r - p.h)));
    q.len = q.umax + (p.deck || 0);
    q.rad = Math.hypot(q.hw, q.len);
    q.cx = p.x + s * q.len / 2; q.cz = p.z + c * q.len / 2;
  } else if (p.t === 'pyr') { q.hw = p.w / 2; q.hd = p.d / 2; q.rad = Math.hypot(q.hw, q.hd); }
  else if (p.t === 'stairs') {
    q.hw = p.w / 2; q.len = p.n * p.run; q.rad = Math.hypot(q.hw, q.len);
    q.cx = p.x + s * q.len / 2; q.cz = p.z + c * q.len / 2; q.hard = true;
  } else if (p.t === 'bowl') { q.rad = Math.max(p.rx, p.rz) * 1.05; }
  else if (p.t === 'zone') { q.hw = p.w / 2; q.hd = p.d / 2; q.rad = Math.hypot(q.hw, q.hd); }
  if (q.cx === undefined) { q.cx = p.x; q.cz = p.z; }
  return q;
}

/** Altura de una piscina en un punto local (lx, lz), o null si queda fuera. */
export function bowlHeight(b, lx, lz) {
  const nx = lx / b.rx, nz = lz / b.rz;
  const d = b.sq ? (nx ** 4 + nz ** 4) ** 0.25 : Math.hypot(nx, nz);
  if (d >= 1) return null;
  if (d <= b.a) return b.y0 - b.depth;
  const t = Math.min(0.996, (d - b.a) / (1 - b.a));
  return b.y0 - b.depth + b.depth * (1 - Math.sqrt(1 - t * t));
}

export class SkateWorld {
  constructor(map) {
    this.map = map;
    this.bounds = map.bounds;
    this.prims = map.prims.filter((p) => p.t !== 'rail').map(prepare);
    this.bowls = this.prims.filter((p) => p.t === 'bowl');
    this.solids = this.prims.filter((p) => p.t !== 'bowl' && p.t !== 'zone');
    this.zones = this.prims.filter((p) => p.t === 'zone');
    this.grinds = this.buildGrinds();
    this.out = { h: 0, hard: false, drag: 1, step: 0.5 };
  }

  buildGrinds() {
    const lines = [];
    const add = (ax, az, ah, bx, bz, bh, kind) => lines.push({ ax, az, ah, bx, bz, bh, kind, len: Math.hypot(bx - ax, bz - az), dx: (bx - ax) / (Math.hypot(bx - ax, bz - az) || 1), dz: (bz - az) / (Math.hypot(bx - ax, bz - az) || 1) });
    for (const p of this.map.prims) {
      if (p.t === 'rail') add(p.x1, p.z1, p.h1, p.x2, p.z2, p.h2, 'rail');
      else if (p.t === 'box' && p.grind) {
        const long = p.w >= p.d;
        const c = Math.cos(p.yaw || 0), s = Math.sin(p.yaw || 0);
        const half = (long ? p.w : p.d) / 2 - 0.15;
        const ux = long ? c : s, uz = long ? -s : c; // eje largo en el mundo
        const top = (p.y0 || 0) + p.h;
        add(p.x - ux * half, p.z - uz * half, top, p.x + ux * half, p.z + uz * half, top, 'ledge');
      } else if (p.t === 'bowl' && p.coping) {
        const b = prepare(p), N = 30;
        const pts = [];
        for (let i = 0; i < N; i++) {
          const a = (i / N) * Math.PI * 2;
          const dx = Math.cos(a), dz = Math.sin(a);
          let k = 1; // punto del borde (d = 1) en esa dirección
          const base = b.sq ? (sq(sq(dx / b.rx)) + sq(sq(dz / b.rz))) ** 0.25 : Math.hypot(dx / b.rx, dz / b.rz);
          k = 1 / base;
          const lx = dx * k, lz = dz * k;
          pts.push([b.x + lx * b.c + lz * b.s, b.z - lx * b.s + lz * b.c]);
        }
        for (let i = 0; i < N; i++) { const a = pts[i], z = pts[(i + 1) % N]; add(a[0], a[1], b.y0, z[0], z[1], b.y0, 'coping'); }
      }
    }
    return lines;
  }

  /** Superficie en (x, z): { h, hard, drag }. El objeto devuelto se reutiliza. */
  heightAt(x, z) {
    const out = this.out;
    let h = 0, hard = false, step = 0.5;
    for (const b of this.bowls) {
      const dx = x - b.x, dz = z - b.z;
      if (dx * dx + dz * dz > b.rad * b.rad) continue;
      const v = bowlHeight(b, dx * b.c - dz * b.s, dx * b.s + dz * b.c);
      if (v !== null) { h = v; break; }
    }
    for (const p of this.solids) {
      const dx = x - p.cx, dz = z - p.cz;
      if (dx * dx + dz * dz > p.rad * p.rad) continue;
      const dxo = x - p.x, dzo = z - p.z;
      const lx = dxo * p.c - dzo * p.s, lz = dxo * p.s + dzo * p.c;
      let v = null;
      switch (p.t) {
        case 'box':
          if (Math.abs(lx) <= p.hw && Math.abs(lz) <= p.hd) v = p.y0 + p.h;
          break;
        case 'ramp':
          if (Math.abs(lx) <= p.hw && Math.abs(lz) <= p.hd) v = p.y0 + p.h0 + (p.h1 - p.h0) * ((lz + p.hd) / p.d);
          break;
        case 'quarter':
          if (Math.abs(lx) <= p.hw && lz >= 0 && lz <= p.len) {
            v = lz >= p.umax ? p.y0 + p.h : p.y0 + p.r - Math.sqrt(sq(p.r) - sq(lz));
          }
          break;
        case 'pyr':
          if (Math.abs(lx) <= p.hw && Math.abs(lz) <= p.hd) {
            const tx = Math.min(1, (p.hw - Math.abs(lx)) / Math.max(0.01, (p.w - p.fl) / 2));
            const tz = Math.min(1, (p.hd - Math.abs(lz)) / Math.max(0.01, (p.d - p.fl) / 2));
            v = p.y0 + p.h * Math.min(tx, tz);
          }
          break;
        case 'stairs':
          if (Math.abs(lx) <= p.hw && lz >= 0 && lz < p.len) v = p.y0 + (Math.floor(lz / p.run) + 1) * p.rise;
          break;
        default:
      }
      if (v !== null && v > h) { h = v; hard = !!p.hard; step = p.t === 'stairs' ? 0.1 : p.t === 'box' ? 0.22 : 0.5; }
    }
    let drag = 1;
    for (const zn of this.zones) {
      if (Math.abs(x - zn.x) <= zn.hw && Math.abs(z - zn.z) <= zn.hd) drag = Math.max(drag, zn.drag);
    }
    out.h = h; out.hard = hard; out.drag = drag; out.step = step;
    return out;
  }

  /** Pendiente (dh/dx, dh/dz) con diferencias centrales; los acantilados (cajas, escalones) no cuentan. */
  slopeAt(x, z, e = 0.14) {
    const c = this.heightAt(x, z), h0 = c.h, kc = c.hard;
    const side = (dx, dz) => {
      const s = this.heightAt(x + dx, z + dz);
      const d = s.h - h0;
      return { d, cliff: Math.abs(d) > 1.1 || ((s.hard || kc) && Math.abs(d) > 0.06) };
    };
    const axis = (dx, dz) => {
      const p = side(dx * e, dz * e), m = side(-dx * e, -dz * e);
      if (p.cliff && m.cliff) return 0;
      if (p.cliff) return -m.d / e;
      if (m.cliff) return p.d / e;
      return (p.d - m.d) / (2 * e);
    };
    return { gx: axis(1, 0), gz: axis(0, 1) };
  }

  inBounds(x, z) {
    const b = this.bounds;
    return x > b.x0 && x < b.x1 && z > b.z0 && z < b.z1;
  }
}
