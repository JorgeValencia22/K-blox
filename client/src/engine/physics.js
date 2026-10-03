// Física simplificada del personaje y vehículos.
// Colisionadores: cajas y rampas con rotación en Y, terreno por mapa de alturas
// y plataformas móviles. Rejilla espacial para consultas rápidas.
// Este módulo no depende de Three.js (se prueba en Node).

import { PHYSICS } from '../../../shared/constants.js';

const CELL = 8;

export class PhysicsWorld {
  constructor({ heightmap = null, flatHeight = null, waterLevel = null } = {}) {
    this.hm = heightmap;
    this.flatHeight = flatHeight;
    this.waterLevel = waterLevel;
    this.grid = new Map();
    this.dynamic = [];
    this.stamp = 0;
  }

  terrainHeight(x, z) {
    if (this.hm) {
      const half = this.hm.half;
      if (x < -half || x > half || z < -half || z > half) return -1000;
      return this.hm.heightAt(x, z);
    }
    return this.flatHeight ?? -1000;
  }

  /**
   * Añade un colisionador. kind: 'box' | 'ramp'. (x,y,z) es el centro,
   * (hx,hy,hz) las semidimensiones y ry la rotación en Y en radianes.
   */
  add({ kind = 'box', x, y, z, hx, hy, hz, ry = 0, surface = 'stone', dynamic = false, data = null }) {
    const c = { kind, x, y, z, hx, hy, hz, ry, cos: Math.cos(ry), sin: Math.sin(ry), surface, dynamic, data, enabled: true, dx: 0, dy: 0, dz: 0, mark: 0 };
    if (dynamic) this.dynamic.push(c);
    else this.insert(c);
    return c;
  }

  insert(c) {
    const r = Math.hypot(c.hx, c.hz);
    const i0 = Math.floor((c.x - r) / CELL), i1 = Math.floor((c.x + r) / CELL);
    const j0 = Math.floor((c.z - r) / CELL), j1 = Math.floor((c.z + r) / CELL);
    c.cells = [];
    for (let i = i0; i <= i1; i++) for (let j = j0; j <= j1; j++) {
      const k = i * 100003 + j;
      let arr = this.grid.get(k);
      if (!arr) this.grid.set(k, (arr = []));
      arr.push(c);
      c.cells.push(k);
    }
  }

  remove(c) {
    if (c.dynamic) {
      this.dynamic = this.dynamic.filter((d) => d !== c);
      return;
    }
    for (const k of c.cells || []) {
      const arr = this.grid.get(k);
      if (arr) this.grid.set(k, arr.filter((d) => d !== c));
    }
  }

  /** Mueve un colisionador dinámico y guarda su desplazamiento (para arrastrar jugadores). */
  moveDynamic(c, x, y, z) {
    c.dx = x - c.x;
    c.dy = y - c.y;
    c.dz = z - c.z;
    c.x = x;
    c.y = y;
    c.z = z;
  }

  near(x, z, pad, out = []) {
    out.length = 0;
    const s = ++this.stamp;
    const i0 = Math.floor((x - pad) / CELL), i1 = Math.floor((x + pad) / CELL);
    const j0 = Math.floor((z - pad) / CELL), j1 = Math.floor((z + pad) / CELL);
    for (let i = i0; i <= i1; i++) for (let j = j0; j <= j1; j++) {
      const arr = this.grid.get(i * 100003 + j);
      if (!arr) continue;
      for (const c of arr) {
        if (c.mark === s || !c.enabled) continue;
        c.mark = s;
        out.push(c);
      }
    }
    for (const c of this.dynamic) if (c.enabled) out.push(c);
    return out;
  }

  static local(c, x, z) {
    const dx = x - c.x, dz = z - c.z;
    return [dx * c.cos - dz * c.sin, dx * c.sin + dz * c.cos];
  }

  static world(c, lx, lz) {
    return [c.x + lx * c.cos + lz * c.sin, c.z - lx * c.sin + lz * c.cos];
  }

  /** Altura de la superficie superior en coordenadas locales. */
  static top(c, lx, lz) {
    if (c.kind === 'ramp') {
      const t = Math.min(1, Math.max(0, (lz + c.hz) / (2 * c.hz)));
      return c.y - c.hy + 2 * c.hy * t;
    }
    return c.y + c.hy;
  }

  /** Suelo más alto bajo (x,z) que no supere maxY. */
  groundAt(x, z, r, maxY, buf = []) {
    let best = this.terrainHeight(x, z);
    let col = null; // el terreno siempre cuenta como suelo (evita atravesarlo)
    for (const c of this.near(x, z, r + 1, buf)) {
      const [lx, lz] = PhysicsWorld.local(c, x, z);
      const m = c.kind === 'ramp' ? 0.05 : r * 0.6;
      if (Math.abs(lx) > c.hx + m || Math.abs(lz) > c.hz + m) continue;
      const top = PhysicsWorld.top(c, lx, lz);
      if (top <= maxY && top > best) {
        best = top;
        col = c;
      }
    }
    return { y: best, c: col };
  }

  /** ¿Está el punto dentro de algún sólido o bajo el terreno? */
  pointBlocked(x, y, z) {
    if (y < this.terrainHeight(x, z)) return true;
    for (const c of this.near(x, z, 0.5, this._buf || (this._buf = []))) {
      const [lx, lz] = PhysicsWorld.local(c, x, z);
      if (Math.abs(lx) > c.hx || Math.abs(lz) > c.hz) continue;
      if (y >= c.y - c.hy && y <= PhysicsWorld.top(c, lx, lz)) return c;
    }
    return false;
  }

  /** Lanza un rayo y devuelve la distancia al primer obstáculo (o maxDist). */
  raycast(ox, oy, oz, dx, dy, dz, maxDist, step = 0.25) {
    for (let d = step; d <= maxDist; d += step) {
      const hit = this.pointBlocked(ox + dx * d, oy + dy * d, oz + dz * d);
      if (hit) return { dist: d - step, collider: hit === true ? null : hit, terrain: hit === true };
    }
    return { dist: maxDist, collider: null };
  }

  /**
   * Resuelve el movimiento de un cuerpo cilíndrico.
   * body: { x,y,z, vx,vy,vz, r, h, step, onGround, ground, gravity }
   */
  move(body, dt) {
    const buf = this._mbuf || (this._mbuf = []);
    // Arrastre de plataformas móviles
    if (body.onGround && body.ground && body.ground.dynamic) {
      body.x += body.ground.dx;
      body.y += body.ground.dy;
      body.z += body.ground.dz;
    }
    body.hitWall = false;
    const step = body.step ?? PHYSICS.stepHeight;
    let nx = body.x + body.vx * dt;
    let nz = body.z + body.vz * dt;

    // Pendientes del terreno demasiado empinadas
    if (this.hm && body.onGround && !body.ground) {
      const tNow = this.terrainHeight(body.x, body.z);
      const steep = (ax, az) => {
        const d = Math.hypot(ax - body.x, az - body.z);
        return this.terrainHeight(ax, az) - tNow > (body.maxSlope ?? PHYSICS.maxSlopeClimb) * d + 0.03;
      };
      if (steep(nx, nz)) {
        if (!steep(nx, body.z)) nz = body.z;
        else if (!steep(body.x, nz)) nx = body.x;
        else { nx = body.x; nz = body.z; }
        body.hitWall = true;
      }
    }

    // Paredes
    const feet = body.y;
    const stepAllowed = body.onGround ? step : 0.12;
    for (let pass = 0; pass < 3; pass++) {
      let moved = false;
      for (const c of this.near(nx, nz, body.r + 1, buf)) {
        if (c.y - c.hy >= feet + body.h - 0.05) continue;
        let [lx, lz] = PhysicsWorld.local(c, nx, nz);
        const ex = c.hx + body.r, ez = c.hz + body.r;
        if (Math.abs(lx) >= ex || Math.abs(lz) >= ez) continue;
        const top = PhysicsWorld.top(c, Math.max(-c.hx, Math.min(c.hx, lx)), Math.max(-c.hz, Math.min(c.hz, lz)));
        if (top <= feet + stepAllowed) continue; // se puede subir: es suelo, no pared
        const px = ex - Math.abs(lx), pz = ez - Math.abs(lz);
        let nlx = 0, nlz = 0;
        if (px < pz) { nlx = Math.sign(lx) || 1; lx = nlx * ex; }
        else { nlz = Math.sign(lz) || 1; lz = nlz * ez; }
        [nx, nz] = PhysicsWorld.world(c, lx, lz);
        // Anula la velocidad contra la pared
        const wnx = nlx * c.cos + nlz * c.sin, wnz = -nlx * c.sin + nlz * c.cos;
        const vn = body.vx * wnx + body.vz * wnz;
        if (vn < 0) { body.vx -= wnx * vn; body.vz -= wnz * vn; }
        body.hitWall = true;
        body.wallCollider = c;
        moved = true;
      }
      if (!moved) break;
    }

    // Vertical
    if (!body.noGravity) body.vy += (body.gravity ?? PHYSICS.gravity) * dt;
    let ny = body.y + body.vy * dt;
    const wasGround = body.onGround;
    const g = this.groundAt(nx, nz, body.r, body.y + (wasGround ? step : 0.05), buf);
    body.landSpeed = 0;
    if (ny <= g.y) {
      if (!wasGround) body.landSpeed = -body.vy;
      ny = g.y;
      if (body.vy < 0) body.vy = 0;
      body.onGround = true;
      body.ground = g.c;
    } else if (wasGround && body.vy <= 0 && body.y - g.y <= step + 0.05) {
      ny = g.y;
      body.vy = 0;
      body.onGround = true;
      body.ground = g.c;
    } else {
      body.onGround = false;
      body.ground = null;
    }
    // Techo
    if (body.vy > 0) {
      for (const c of this.near(nx, nz, body.r + 1, buf)) {
        const bottom = c.y - c.hy;
        if (bottom < body.y + body.h - 0.01 || bottom > ny + body.h) continue;
        const [lx, lz] = PhysicsWorld.local(c, nx, nz);
        if (Math.abs(lx) > c.hx + body.r * 0.5 || Math.abs(lz) > c.hz + body.r * 0.5) continue;
        ny = bottom - body.h;
        body.vy = 0;
      }
    }
    body.x = nx;
    body.y = ny;
    body.z = nz;
    body.surface = body.ground ? body.ground.surface : 'grass';
    body.inWater = this.waterLevel != null && body.y < this.waterLevel - 0.9;
    return body;
  }
}
