// Combates cooperativos de Guerra Galáctica (hangar, núcleo y Lord Vex). El servidor simula a los
// enemigos y al jefe; cada jugador manda su posición y sus golpes. Así todos ven lo mismo, los
// golpes cuentan para todos y nadie puede inventarse un daño. Matemáticas simples, sin THREE.
export const DIFF = 2; // el doble de vida y de daño que en la campaña individual
const HERO_MAX = 150;
const HEAT_MAX = 6;
const OVER_MS = 4800;
const REINF_S = 11;
const BREAK_S = 6;
const SAVE = { swing: 0.42, shoot: 0.26, push: 6 };

const KINDS = {
  droid: { hp: 45, speed: 4.3, dmg: 6, rate: [1.8, 2.8], acc: 0.45, range: [10, 17], radius: 0.6, scale: 1 },
  staff: { hp: 60, speed: 6.4, dmg: 12, reach: 2.4, windup: 0.5, radius: 0.6, scale: 1 },
  trooper: { hp: 35, speed: 4.8, dmg: 7, rate: [2.8, 4.0], acc: 0.5, range: [13, 21], radius: 0.6, scale: 1 },
  vex: { hp: 360, speed: 5.6, dmg: 15, reach: 2.9, radius: 0.9, scale: 1.22 },
  kray: { hp: 150, speed: 4.6, dmg: 14, reach: 2.6, windup: 0.55, radius: 0.7, scale: 1.15 },
};

const dist2 = (a, b) => Math.hypot(a.x - b.x, a.z - b.z);
const norm = (x, z) => { const l = Math.hypot(x, z) || 1; return { x: x / l, z: z / l }; };
const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
const rnd = (a, b) => a + Math.random() * (b - a);

/** Rayo contra un cilindro vertical; devuelve t o null. */
function rayCyl(o, d, cx, cz, r, y0, y1) {
  const ox = o.x - cx, oz = o.z - cz;
  const a = d.x * d.x + d.z * d.z;
  if (a < 1e-8) return null;
  const b = 2 * (ox * d.x + oz * d.z), c = ox * ox + oz * oz - r * r;
  const disc = b * b - 4 * a * c;
  if (disc < 0) return null;
  const sq = Math.sqrt(disc);
  for (const t of [(-b - sq) / (2 * a), (-b + sq) / (2 * a)]) {
    if (t < 0) continue;
    const y = o.y + d.y * t;
    if (y >= y0 && y <= y1) return t;
  }
  return null;
}

function raySphere(o, d, c, r) {
  const ox = o.x - c.x, oy = o.y - c.y, oz = o.z - c.z;
  const b = ox * d.x + oy * d.y + oz * d.z, cc = ox * ox + oy * oy + oz * oz - r * r;
  const disc = b * b - cc;
  if (disc < 0) return null;
  const t = -b - Math.sqrt(disc);
  return t >= 0 ? t : null;
}

export class Encounter {
  /** kind: 'hangar' | 'core' | 'boss'. Las posiciones son las mismas que en el mapa del cliente. */
  constructor(kind, playerIds, { heroSpawns, foeSpawns, colliders = [], center = null, emit }) {
    this.kind = kind;
    this.emit = emit;
    this.heroSpawns = heroSpawns; // [x, y, z] para los jugadores
    this.foeSpawns = foeSpawns;   // [x, z] para los enemigos
    this.colliders = colliders;
    this.center = center;
    this.foes = [];
    this.heroes = new Map();
    this.seq = 1;
    this.wave = 0;
    this.waveS = 0.6;
    this.reinf = 0;
    this.breakS = 0;
    this.phase = 'run';
    this.gen = 100;
    this.overloaded = false;
    this.bossSleep = 9;
    this.over = false;
    this.lastCoreSpawn = 0;
    for (const id of playerIds) this.addHero(id, 'Piloto');
    if (kind === 'boss') this.spawnVex();
  }

  addHero(id, name) {
    const s = this.heroSpawns[this.heroes.size % this.heroSpawns.length];
    this.heroes.set(id, {
      id, name, x: s[0], y: s[1] || 0, z: s[2], yaw: 0, hp: HERO_MAX, max: HERO_MAX, alive: true,
      block: false, heat: 0, overUntil: 0, lastHit: 0, invuln: 0, cdSwing: 0, cdShot: 0, cdPush: 0, combo: 0,
      comboT: 0, t: 0,
    });
  }

  removeHero(id) {
    this.heroes.delete(id);
    if (!this.over && this.aliveHeroes() === 0 && this.heroes.size) this.fail();
  }

  aliveHeroes() {
    let n = 0;
    for (const h of this.heroes.values()) if (h.alive) n++;
    return n;
  }

  fail() {
    if (this.over) return;
    this.over = true;
    this.failed = true;
    this.emit('enc:ev', { t: 'fail' });
  }

  // --- Enemigos -------------------------------------------------------------------------------------
  spawnFoe(kind, x, z) {
    const K = KINDS[kind];
    const f = { id: this.seq++, kind, x, y: 0, z, yaw: 0, hp: K.hp * DIFF, max: K.hp * DIFF, dead: false, stun: 0, cool: rnd(0.8, 2.2), strafe: Math.random() < 0.5 ? 1 : -1, strafeT: rnd(1, 3), burst: 0, atk: null, guard: 0, recent: [], mode: 'idle', modeT: 1, comboN: 0, pushCd: 6, leapCd: 10, dashCd: 3, leapY: 0, leapTo: null, anim: 'idle', deathT: 0 };
    this.foes.push(f);
    return f;
  }

  spawnVex() {
    this.vex = this.spawnFoe('vex', 46, -22);
    this.vex.x = 15; this.vex.z = -5;
    this.vex.frozenUntil = this.bossSleep;
  }

  alive(kind) {
    return this.foes.filter((f) => !f.dead && (!kind || f.kind === kind));
  }

  nearestHero(p, maxD = 999) {
    let best = null, bd = maxD;
    for (const h of this.heroes.values()) {
      if (!h.alive) continue;
      const d = dist2(p, h);
      if (d < bd) { bd = d; best = h; }
    }
    return best;
  }

  /** Daño a un enemigo; el jefe bloquea los golpes en plena embestida o con la guardia activa. */
  hitFoe(f, dmg, how, from) {
    if (f.dead) return false;
    if (f.kind === 'vex') {
      const guarding = f.guard > 0 || f.mode === 'push' || f.mode === 'leapUp';
      if (guarding || (how === 'blaster' && Math.random() < 0.55)) {
        this.emit('enc:ev', { t: 'clash', x: f.x, y: 1.4, z: f.z });
        return false;
      }
      const now = Date.now();
      f.recent = f.recent.filter((t) => now - t < 1700);
      f.recent.push(now);
      if (f.recent.length >= 3 && how === 'saber') { f.guard = 1.3; f.recent = []; }
      if (f.mode === 'recover') dmg *= 1.4;
    }
    f.hp -= dmg;
    this.emit('enc:ev', { t: 'hit', id: f.id, dmg: Math.round(dmg) });
    if (f.kind !== 'vex') { f.stun = 0.28; f.atk = null; if (from) { const d = norm(f.x - from.x, f.z - from.z); f.x += d.x * 0.5; f.z += d.z * 0.5; } }
    if (f.hp <= 0) this.killFoe(f);
    return true;
  }

  killFoe(f) {
    if (f.dead) return;
    f.dead = true;
    f.hp = 0;
    f.anim = 'dead';
    this.emit('enc:ev', { t: 'death', id: f.id, kind: f.kind, x: f.x, y: 1, z: f.z });
    if (f.kind === 'vex') {
      this.emit('enc:ev', { t: 'bossDead' });
      this.over = true;
      this.foes.forEach((o) => { if (!o.dead && o !== f) o.dead = true; });
    }
  }

  // --- Acciones de los jugadores ----------------------------------------------------------------------
  /** Posición y orientación; se acepta un máximo de movimiento por mensaje (contra la trampa de volar). */
  setState(id, s) {
    const h = this.heroes.get(id);
    if (!h || !h.alive) return;
    const p = s.p;
    if (!Array.isArray(p) || p.length !== 3 || !p.every(Number.isFinite)) return;
    const dx = p[0] - h.x, dz = p[2] - h.z;
    if (Math.hypot(dx, dz) < 14) { h.x = clamp(p[0], -150, 150); h.z = clamp(p[2], -150, 150); }
    if (Number.isFinite(s.yaw)) h.yaw = s.yaw;
    h.block = !!s.block && h.heat < HEAT_MAX && Date.now() >= h.overUntil;
  }

  swing(id, d) {
    const h = this.heroes.get(id);
    if (!h || !h.alive || h.cdSwing > 0 || h.block) return;
    h.cdSwing = SAVE.swing;
    h.combo = h.comboT > 0 ? (h.combo + 1) % 3 : 0;
    h.comboT = 0.8;
    const dir = norm(d[0], d[2]);
    const dmg = h.combo === 2 ? 34 : 22;
    this.emit('enc:ev', { t: 'swing', id });
    for (const f of this.foes) {
      if (f.dead) continue;
      const dx = f.x - h.x, dz = f.z - h.z, dd = Math.hypot(dx, dz);
      if (dd > 3.5 + KINDS[f.kind].radius * KINDS[f.kind].scale || (dd > 0.6 && (dx * dir.x + dz * dir.z) / dd < 0.15)) continue;
      // Si el enemigo te mira y tiene el sable levantado, lo bloquea (lo gestiona el golpe de vuelta)
      this.hitFoe(f, dmg, 'saber', h);
    }
  }

  shoot(id, d) {
    const h = this.heroes.get(id);
    if (!h || !h.alive || h.cdShot > 0 || h.block) return;
    h.cdShot = SAVE.shoot;
    const dir = norm3(d);
    const o = { x: h.x, y: 1.5, z: h.z };
    const r = this.trace(o, dir, 90);
    this.emit('enc:ev', { t: 'shot', from: id, o: [o.x, o.y, o.z], e: [r.p.x, r.p.y, r.p.z] });
    if (r.foe) this.hitFoe(r.foe, r.foe.kind === 'vex' ? 3 : 12, 'blaster');
    if (this.kind === 'core' && r.core) this.hitGenerator(12);
  }

  push(id, d) {
    const h = this.heroes.get(id);
    if (!h || !h.alive || h.cdPush > 0) return;
    h.cdPush = SAVE.push;
    const dir = norm(d[0], d[2]);
    this.emit('enc:ev', { t: 'push', id, x: h.x, y: 1, z: h.z, dx: dir.x, dz: dir.z });
    for (const f of this.foes) {
      if (f.dead) continue;
      const dx = f.x - h.x, dz = f.z - h.z, dd = Math.hypot(dx, dz);
      if (dd > 7.5 || (dd > 0.5 && (dx * dir.x + dz * dir.z) / dd < 0.2)) continue;
      const n = dd ? { x: dx / dd, z: dz / dd } : dir;
      f.x += n.x * 6; f.z += n.z * 6; f.stun = 0.7;
      this.hitFoe(f, 8, 'push');
    }
  }

  /** Rayo del jugador contra enemigos, columnas y el generador del núcleo. */
  trace(o, d, max) {
    let t = max, foe = null, core = false;
    for (const f of this.foes) {
      if (f.dead) continue;
      const tt = raySphere(o, d, { x: f.x, y: 1.05 * KINDS[f.kind].scale, z: f.z }, 0.85 * KINDS[f.kind].scale);
      if (tt != null && tt < t) { t = tt; foe = f; core = false; }
    }
    if (this.kind === 'core' && this.center && !this.overloaded && Math.abs(d.z) > 1e-6) {
      const tg = (this.center.z - o.z) / d.z;
      if (tg > 0 && tg < t) {
        const p = { x: o.x + d.x * tg, y: o.y + d.y * tg };
        if (Math.hypot(p.x - this.center.x, p.y - this.center.y) < 17.5) { t = tg; foe = null; core = true; }
      }
    }
    for (const c of this.colliders) {
      const tt = rayCyl(o, d, c.x, c.z, c.r, 0, 3.2);
      if (tt != null && tt < t) { t = tt; foe = null; core = false; }
    }
    return { foe, core, p: { x: o.x + d.x * t, y: o.y + d.y * t, z: o.z + d.z * t } };
  }

  hitGenerator(dmg) {
    if (this.overloaded) return;
    this.gen = Math.max(0, this.gen - dmg);
    this.emit('enc:ev', { t: 'gen', hp: this.gen });
    if (this.gen <= 0) {
      this.overloaded = true;
      this.foes.forEach((f) => { if (!f.dead) this.killFoe(f); });
      this.emit('enc:ev', { t: 'overload' });
    }
  }

  // --- Daño a los jugadores ------------------------------------------------------------------------------
  hurt(h, dmg, from) {
    if (!h.alive || h.invuln > 0) return;
    h.hp -= dmg;
    h.lastHit = Date.now();
    this.emit('enc:ev', { t: 'hurt', id: h.id, dmg: Math.round(dmg) });
    if (h.hp <= 0) {
      h.hp = 0;
      h.alive = false;
      this.emit('enc:ev', { t: 'heroDown', id: h.id });
      if (this.aliveHeroes() === 0) this.fail();
    }
  }

  /** ¿El jugador está de frente al golpe y con el sable levantado? */
  guards(h, from) {
    if (!h.block || Date.now() < h.overUntil) return false;
    const dx = from.x - h.x, dz = from.z - h.z, dd = Math.hypot(dx, dz) || 1;
    return (dx * Math.sin(h.yaw) + dz * Math.cos(h.yaw)) / dd > -0.2;
  }

  deflect(h, b) {
    h.heat++;
    this.emit('enc:ev', { t: 'deflect', x: b.x, y: 1.4, z: b.z });
    const target = this.nearestFoe({ x: h.x, z: h.z }, 60) || null;
    if (target) {
      // El disparo vuelve al enemigo más cercano
      this.hitFoe(target, target.kind === 'vex' ? 16 : 38, 'deflect');
    }
    if (h.heat >= HEAT_MAX) {
      h.overUntil = Date.now() + OVER_MS;
      h.heat = 0;
      h.block = false;
      this.emit('enc:ev', { t: 'overheat', id: h.id });
    }
  }

  nearestFoe(p, maxD) {
    let best = null, bd = maxD;
    for (const f of this.foes) {
      if (f.dead) continue;
      const d = dist2(p, f);
      if (d < bd) { bd = d; best = f; }
    }
    return best;
  }

  // --- Bucle --------------------------------------------------------------------------------------------
  update(dt) {
    if (this.over) return;
    const now = Date.now();
    for (const h of this.heroes.values()) {
      h.cdSwing = Math.max(0, h.cdSwing - dt);
      h.cdShot = Math.max(0, h.cdShot - dt);
      h.cdPush = Math.max(0, h.cdPush - dt);
      h.comboT = Math.max(0, h.comboT - dt);
      h.invuln = Math.max(0, h.invuln - dt);
      if (h.heat > 0 && now - h.lastHit > 2600 && now >= h.overUntil) h.heat = Math.max(0, h.heat - dt * 0.9);
    }
    if (this.kind === 'hangar') this.hangar(dt);
    if (this.kind === 'core') this.core(dt);
    if (this.kind === 'boss') this.boss(dt);
    for (const f of this.foes) {
      if (f.dead) continue;
      f.stun = Math.max(0, f.stun - dt);
      f.cool -= dt;
      if (this.kind === 'boss' && f === this.vex) this.vexAI(dt);
      else if (f.stun <= 0) this.foeAI(f, dt);
    }
    this.bolts(dt);
  }

  hangar(dt) {
    if (this.breakS > 0) {
      this.breakS -= dt;
      if (this.breakS <= 0) this.startWave();
      return;
    }
    if (this.wave >= 3) return;
    if (this.wave === 0 && this.waveS > 0) { this.waveS -= dt; if (this.waveS <= 0) this.startWave(); return; }
    if (this.wave === 1 && this.reinf > 0) {
      this.reinf -= dt;
      if (this.reinf <= 0 || this.alive().length === 0) {
        this.reinf = -1;
        for (let k = 0; k < 3; k++) this.spawnNear(k, 'trooper');
        this.emit('enc:ev', { t: 'caption', text: '¡Llegan refuerzos!' });
      }
    }
    if (this.alive().length === 0 && this.reinf <= 0 && this.wave >= 0 && this.breakS <= 0) {
      this.wave++;
      if (this.wave >= 3) {
        this.emit('enc:ev', { t: 'cleared' });
        return;
      }
      this.breakS = BREAK_S;
      for (const h of this.heroes.values()) if (h.alive) h.hp = Math.min(h.max, h.hp + 45);
      this.emit('enc:ev', { t: 'waveDone', wave: this.wave });
    }
  }

  startWave() {
    this.reinf = this.wave === 1 ? REINF_S : 0;
    if (this.wave === 0) { for (let k = 0; k < 3; k++) this.spawnNear(k, 'droid'); for (let k = 0; k < 2; k++) this.spawnNear(k + 3, 'staff'); }
    else if (this.wave === 1) { for (let k = 0; k < 5; k++) this.spawnNear(k, 'trooper'); }
    else {
      for (let k = 0; k < 4; k++) this.spawnNear(k, 'droid');
      for (let k = 0; k < 3; k++) this.spawnNear(k + 4, 'staff');
      for (let k = 0; k < 4; k++) this.spawnNear(k + 7, 'trooper');
      // El Capitán Kray llega al final, con su propio sable
      this.spawnNear(0, 'kray');
      this.emit('enc:ev', { t: 'caption', text: '¡El Capitán Kray ha llegado con su escolta!' });
    }
    this.emit('enc:ev', { t: 'wave', wave: this.wave + 1 });
  }

  spawnNear(i, kind) {
    const s = this.foeSpawns[i % this.foeSpawns.length];
    this.spawnFoe(kind, s[0] + rnd(-3, 3), s[1] + rnd(-3, 3));
  }

  core(dt) {
    if (this.overloaded) return;
    this.lastCoreSpawn -= dt;
    if (this.lastCoreSpawn <= 0 && this.alive().length < 3) {
      this.lastCoreSpawn = REINF_S;
      this.spawnNear(Math.floor(rnd(0, this.foeSpawns.length)), 'trooper');
    }
  }

  boss(dt) {
    if (this.bossSleep > 0) this.bossSleep -= dt;
  }

  // --- IA de los enemigos -----------------------------------------------------------------------------------
  foeAI(f, dt) {
    const K = KINDS[f.kind];
    if (f.dead) return;
    const h = this.nearestHero(f, 999);
    if (!h) { f.anim = 'idle'; return; }
    const dd = dist2(f, h);
    const dir = norm(h.x - f.x, h.z - f.z);
    f.yaw = Math.atan2(dir.x, dir.z);
    let mx = 0, mz = 0;
    if (f.kind === 'droid' || f.kind === 'trooper') {
      f.strafeT -= dt;
      if (f.strafeT <= 0) { f.strafe = -f.strafe; f.strafeT = rnd(1.2, 3); }
      if (dd > K.range[1]) { mx += dir.x; mz += dir.z; }
      else if (dd < K.range[0]) { mx -= dir.x * 0.8; mz -= dir.z * 0.8; }
      mx += -dir.z * f.strafe * 0.55; mz += dir.x * f.strafe * 0.55;
      if (f.kind === 'trooper') {
        if (f.burst > 0) { if (f.cool <= 0) { this.shootAt(f, h, 0.8); f.burst--; f.cool = f.burst > 0 ? 0.16 : rnd(K.rate[0], K.rate[1]); } }
        else if (f.cool <= 0 && dd < 50) { f.burst = 3; f.cool = 0.05; }
      } else if (f.cool <= 0 && dd < 50) { this.shootAt(f, h, 1); f.cool = rnd(K.rate[0], K.rate[1]); }
      f.anim = mx || mz ? 'run' : 'idle';
    } else if (f.kind === 'staff' || f.kind === 'kray') {
      if (f.atk) {
        f.atk.t += dt;
        if (!f.atk.done && f.atk.t >= K.windup) {
          f.atk.done = true;
          this.emit('enc:ev', { t: 'strike', id: f.id });
          this.melee(f, h, K.dmg * DIFF, K.reach + 0.5);
        }
        if (f.atk.t >= K.windup + 0.55) f.atk = null;
        f.anim = 'attack';
      } else {
        if (dd > K.reach) { mx += dir.x; mz += dir.z; f.anim = 'run'; }
        else if (f.cool <= 0) { f.atk = { t: 0, done: false }; f.cool = rnd(1, 1.8); }
        else f.anim = 'idle';
      }
    }
    if (mx || mz) {
      const n = norm(mx, mz);
      const sp = K.speed;
      f.x += n.x * sp * dt; f.z += n.z * sp * dt;
    }
  }

  shootAt(f, h, spread) {
    const o = { x: f.x, y: 1.45, z: f.z };
    const K = KINDS[f.kind];
    const aim = { x: h.x - o.x, y: 1.1 - o.y, z: h.z - o.z };
    const err = (1 - K.acc) * 2.4 * spread * clamp(dist2(f, h) / 15, 0.4, 2);
    aim.x += rnd(-err, err); aim.z += rnd(-err, err); aim.y += rnd(-err * 0.5, err * 0.5);
    const d = norm3(aim);
    this.bullets = this.bullets || [];
    this.bullets.push({ id: this.seq++, x: o.x, y: o.y, z: o.z, vx: d.x * 34, vy: d.y * 34, vz: d.z * 34, dmg: K.dmg * DIFF, life: 3.5, owner: f.id });
    this.emit('enc:ev', { t: 'foeShot', id: f.id, o: [o.x, o.y, o.z] });
  }

  melee(f, h, dmg, reach) {
    if (dist2(f, h) > reach || !h.alive) return;
    if (this.guards(h, f)) { this.emit('enc:ev', { t: 'clash', x: h.x, y: 1.4, z: h.z }); return; }
    this.hurt(h, dmg, f);
  }

  bolts(dt) {
    if (!this.bullets) return;
    for (let i = this.bullets.length - 1; i >= 0; i--) {
      const b = this.bullets[i];
      b.x += b.vx * dt; b.y += b.vy * dt; b.z += b.vz * dt; b.life -= dt;
      let gone = b.life <= 0 || b.y < 0;
      for (const h of this.heroes.values()) {
        if (!h.alive || gone) continue;
        const dx = b.x - h.x, dz = b.z - h.z;
        if (Math.hypot(dx, dz) < 0.9 && b.y > 0.2 && b.y < 2.2) {
          if (this.guards(h, b) && h.heat < HEAT_MAX) {
            this.deflect(h, b);
            gone = true;
          } else {
            this.hurt(h, b.dmg, b);
            this.emit('enc:ev', { t: 'boltHit', x: b.x, y: b.y, z: b.z });
            gone = true;
          }
        }
      }
      for (const c of this.colliders) if (!gone && Math.hypot(b.x - c.x, b.z - c.z) < c.r && b.y < 3.2) gone = true;
      if (gone) this.bullets.splice(i, 1);
    }
  }

  // --- Lord Vex ------------------------------------------------------------------------------------------------
  vexAI(dt) {
    const v = this.vex;
    if (v.dead || this.bossSleep > 0) return;
    const K = KINDS.vex;
    const h = this.nearestHero(v, 999);
    if (!h) return;
    const dd = dist2(v, h);
    const dir = norm(h.x - v.x, h.z - v.z);
    v.yaw = Math.atan2(dir.x, dir.z);
    v.guard = Math.max(0, v.guard - dt);
    v.modeT -= dt; v.pushCd -= dt; v.leapCd -= dt; v.dashCd -= dt;
    const enraged = v.hp < v.max * 0.5;
    let mx = 0, mz = 0, sp = K.speed;
    switch (v.mode) {
      case 'idle':
        if (dd > 3.2) { mx += dir.x; mz += dir.z; }
        if (v.modeT <= 0) {
          if (v.pushCd <= 0 && dd < 9) this.vexMode(v, 'push', 0.9);
          else if (enraged && v.leapCd <= 0 && dd > 5) this.vexMode(v, 'leapUp', 0.55);
          else if (dd > 9 && v.dashCd <= 0) this.vexMode(v, 'dash', 0.35);
          else if (dd < 3.6) { v.comboN = 3; this.vexCombo(v); }
          else v.modeT = 0.2;
        }
        v.anim = mx || mz ? 'run' : 'idle';
        break;
      case 'dash':
        mx += dir.x; mz += dir.z; sp = 20;
        if (v.modeT <= 0 || dd < 3) { v.dashCd = 5; v.mode = 'idle'; v.modeT = 0.1; }
        v.anim = 'run';
        break;
      case 'combo':
        if (v.atk) {
          v.atk.t += dt;
          if (v.atk.t < v.atk.w && dd > 2.6) { mx += dir.x * 0.6; mz += dir.z * 0.6; }
          if (!v.atk.done && v.atk.t >= v.atk.w) {
            v.atk.done = true;
            this.emit('enc:ev', { t: 'strike', id: v.id });
            this.melee(v, h, K.dmg * DIFF, K.reach + 0.6);
          }
          if (v.atk.t >= v.atk.w + 0.26) {
            v.comboN--;
            if (v.comboN > 0) this.vexCombo(v);
            else { v.atk = null; this.vexMode(v, 'recover', enraged ? 0.9 : 1.4); }
          }
        }
        v.anim = 'attack';
        break;
      case 'recover':
        if (v.modeT <= 0) { v.mode = 'idle'; v.modeT = enraged ? 0.2 : 0.5; }
        v.anim = 'idle';
        break;
      case 'push':
        if (v.modeT <= 0) {
          v.pushCd = enraged ? 7 : 11;
          this.emit('enc:ev', { t: 'vexPush', x: v.x, y: 1, z: v.z });
          for (const hh of this.heroes.values()) {
            if (hh.alive && dist2(v, hh) < 11 && hh.invuln <= 0) {
              const n = norm(hh.x - v.x, hh.z - v.z);
              hh.x += n.x * 1.5; hh.z += n.z * 1.5;
              this.hurt(hh, 9 * DIFF, v);
            }
          }
          v.mode = 'idle'; v.modeT = 0.6;
        }
        v.anim = 'idle';
        break;
      case 'leapUp':
        v.leapY = Math.sin((1 - clamp(v.modeT / 0.55, 0, 1)) * Math.PI * 0.5) * 7;
        if (v.modeT <= 0) { v.leapTo = { x: h.x, z: h.z }; this.vexMode(v, 'leap', 0.5); this.emit('enc:ev', { t: 'marker', x: h.x, z: h.z, r: 4.2 }); }
        break;
      case 'leap': {
        if (v.leapTo) { v.x += (v.leapTo.x - v.x) * Math.min(1, dt * 7); v.z += (v.leapTo.z - v.z) * Math.min(1, dt * 7); }
        v.leapY = (1 - (1 - clamp(v.modeT / 0.5, 0, 1)) ** 2) * 7;
        if (v.modeT <= 0) {
          v.leapY = 0; v.leapCd = 12;
          this.emit('enc:ev', { t: 'leapImpact', x: v.x, y: 0.4, z: v.z });
          for (const hh of this.heroes.values()) if (hh.alive && dist2(v, hh) < 4.4 && hh.invuln <= 0) this.hurt(hh, 18 * DIFF, v);
          this.vexMode(v, 'recover', 1.6);
        }
        break;
      }
      default: break;
    }
    if (mx || mz) { const n = norm(mx, mz); v.x += n.x * sp * dt; v.z += n.z * sp * dt; }
  }

  vexMode(v, mode, t) { v.mode = mode; v.modeT = t; }

  vexCombo(v) {
    const enraged = v.hp < v.max * 0.5;
    v.mode = 'combo';
    v.atk = { t: 0, w: ((v.comboN === 3 ? 0.6 : 0.42) * (enraged ? 0.82 : 1)), done: false };
  }
}

function norm3(d) {
  const l = Math.hypot(d.x, d.y, d.z) || 1;
  return { x: d.x / l, y: d.y / l, z: d.z / l };
}
