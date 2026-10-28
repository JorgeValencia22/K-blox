// Skate Pro: el patinador. Física (rueda, pendientes, rampas, aire, impactos), trucos (ollie, flips,
// shove-its, giros, agarres), grinds con equilibrio, manuales, combos con multiplicador, huecos, letras
// S-K-A-T-E y objetivos. Es código puro (sin DOM ni THREE): el cliente lo dibuja y los tests lo ejecutan.
import { SkateWorld } from './world.js';

export const G = 9.8;
const SUB = 1 / 120; // paso fijo de la física
const V_PUSH = 9.5; // velocidad máxima empujando
const STEP = 0.5; // escalón que se sube rodando
const COMBO_IDLE = 1.4; // segundos en el suelo antes de cerrar el combo

export const TRICKS = {
  ollie: { name: 'Ollie', pts: 60 },
  kickflip: { name: 'Kickflip', pts: 250 },
  heelflip: { name: 'Heelflip', pts: 280 },
  shuvit: { name: 'Shove-it', pts: 200 },
  tre: { name: '360 Flip', pts: 650 },
  varial: { name: 'Varial Heelflip', pts: 600 },
  grab: { name: 'Agarre', pts: 140 },
  spin: { name: 'Giro', pts: 120 },
  g5050: { name: '50-50', pts: 160 },
  gboard: { name: 'Boardslide', pts: 230 },
  gnose: { name: 'Nosegrind', pts: 210 },
  manual: { name: 'Manual', pts: 120 },
  switch: { name: 'Switch', pts: 150 },
};
const GRABS = { left: 'Indy', right: 'Melon', up: 'Nose Grab', down: 'Tail Grab', none: 'Mute' };

const wrap = (a) => Math.atan2(Math.sin(a), Math.cos(a));
const clamp = (v, a, b) => (v < a ? a : v > b ? b : v);

function newStats() {
  return {
    score: 0, bestCombo: 0, landed: new Set(), gaps: new Set(), letters: new Set(), goals: new Set(),
    maxAir: 0, maxHeight: 0, longestGrind: 0, longestManual: 0, maxSpin: 0, maxSpeed: 0, bails: 0, tricks: 0, combos: 0,
  };
}

export class SkaterSim {
  constructor(map) {
    this.map = map;
    this.world = new SkateWorld(map);
    this.stats = newStats();
    this.time = 0;
    this.respawn();
  }

  /** Vuelve a la salida (también al caerse del mapa). */
  respawn() {
    const s = this.map.spawn;
    this.x = s.x; this.z = s.z; this.yaw = s.yaw;
    this.y = this.world.heightAt(s.x, s.z).h;
    this.vx = this.vy = this.vz = 0;
    this.state = 'ground';
    this.steer = 0;
    this.charge = 0;
    this.jumpHeld = false;
    this.air = null;
    this.grind = null;
    this.bal = 0;
    this.balDrift = 0;
    this.manualT = 0;
    this.bailT = 0;
    this.bailWhy = '';
    this.spinVel = 0;
    this.nx = 0; this.ny = 1; this.nz = 0;
    this.slide = 0;
    this.endCombo(false);
  }

  /** Coloca al patinador en el suelo, con una velocidad inicial (para pruebas y repeticiones). */
  place(x, z, yaw, speed = 0) {
    this.respawn();
    this.x = x; this.z = z; this.yaw = yaw;
    this.y = this.world.heightAt(x, z).h;
    this.vx = Math.sin(yaw) * speed; this.vz = Math.cos(yaw) * speed;
  }

  get speed() { return Math.hypot(this.vx, this.vz); }
  get dirX() { return Math.sin(this.yaw); }
  get dirZ() { return Math.cos(this.yaw); }
  get comboPts() { return Math.round(this.combo.base * Math.max(1, this.combo.uniq.size)); }

  // ------------------------------------------------------------------------------ combos y puntos
  endCombo(bank, ev) {
    const c = this.combo;
    if (bank && c && c.base > 0) {
      const pts = this.comboPts;
      this.stats.score += pts;
      this.stats.bestCombo = Math.max(this.stats.bestCombo, pts);
      this.stats.combos++;
      ev?.push({ k: 'bank', pts, base: c.base, mult: Math.max(1, c.uniq.size), names: c.names.slice() });
    } else if (c && c.base > 0) ev?.push({ k: 'lost', pts: this.comboPts });
    this.combo = { base: 0, uniq: new Set(), names: [], reps: {}, idle: 0 };
  }

  /** Suma un truco al combo (los repetidos valen cada vez menos). */
  addTrick(id, name, pts, ev, key = id) {
    const c = this.combo;
    const rep = c.reps[key] || 0;
    c.reps[key] = rep + 1;
    const gain = Math.round(pts * Math.max(0.25, 1 - 0.4 * rep));
    c.base += gain;
    c.uniq.add(key);
    c.names.push(name);
    c.idle = 0;
    this.stats.tricks++;
    ev.push({ k: 'trick', id, name, pts: gain, base: c.base, mult: c.uniq.size });
  }

  // ------------------------------------------------------------------------------------ paso
  /**
   * Avanza `dt` segundos. `inp`: { sx: -1..1 (derecha +), py: -1..1 (adelante +), jump (mantenido),
   * jumpP, kickP, heelP, shuvP (pulsaciones), grab (mantenido), manual (mantenido), respawnP }.
   * Devuelve la lista de sucesos de este paso.
   */
  step(dt, inp) {
    const ev = [];
    let left = dt;
    const edge = { jumpP: inp.jumpP, kickP: inp.kickP, heelP: inp.heelP, shuvP: inp.shuvP };
    while (left > 1e-6) {
      const h = Math.min(SUB, left);
      left -= h;
      this.sub(h, { ...inp, ...edge }, ev);
      edge.jumpP = edge.kickP = edge.heelP = edge.shuvP = false;
    }
    this.time += dt;
    this.stats.maxSpeed = Math.max(this.stats.maxSpeed, this.speed);
    this.checkGoals(ev);
    return ev;
  }

  sub(dt, inp, ev) {
    if (inp.respawnP) { this.respawn(); ev.push({ k: 'respawn' }); return; }
    switch (this.state) {
      case 'ground': this.onGround(dt, inp, ev); break;
      case 'manual': this.onGround(dt, inp, ev); break;
      case 'air': this.inAir(dt, inp, ev); break;
      case 'grind': this.onGrind(dt, inp, ev); break;
      case 'bail': this.onBail(dt, ev); break;
      default:
    }
    this.limits(ev);
    this.collect(ev);
    if (this.combo.base > 0 && this.state === 'ground') {
      this.combo.idle += dt;
      if (this.combo.idle > COMBO_IDLE) this.endCombo(true, ev);
    }
    const r = this.map.respawnBelow;
    if (r !== undefined && this.y < r && this.state !== 'bail') {
      this.endCombo(false, ev);
      this.respawn();
      ev.push({ k: 'fall' });
    }
  }

  // ------------------------------------------------------------------------------ en el suelo
  onGround(dt, inp, ev) {
    const w = this.world;
    const sf = w.heightAt(this.x, this.z);
    const drag = sf.drag;
    // Normal de la superficie y tangente de la velocidad
    const { gx, gz } = w.slopeAt(this.x, this.z);
    const nl = Math.hypot(gx, 1, gz);
    this.nx = -gx / nl; this.ny = 1 / nl; this.nz = -gz / nl;

    // Dirección: el giro se suaviza y pierde efecto a mucha velocidad
    const sp = this.speed;
    this.steer += (inp.sx - this.steer) * Math.min(1, dt * 12);
    const turn = (2.7 / (1 + sp * 0.13)) * (this.state === 'manual' ? 0.7 : 1);
    this.yaw -= this.steer * turn * dt * (0.35 + Math.min(1, sp / 2.5) * 0.65);

    // Gravedad tangencial, empuje, freno y fricción: todo en 3D sobre el plano de la superficie
    this.vy -= G * dt;
    const vn = this.vx * this.nx + this.vy * this.ny + this.vz * this.nz;
    this.vx -= this.nx * vn; this.vy -= this.ny * vn; this.vz -= this.nz * vn;
    const dx = this.dirX, dz = this.dirZ;
    const dn = dx * this.nx + dz * this.nz;
    let tx = dx - this.nx * dn, ty = -this.ny * dn, tz = dz - this.nz * dn;
    const tl = Math.hypot(tx, ty, tz) || 1;
    tx /= tl; ty /= tl; tz /= tl;
    let f = this.vx * tx + this.vy * ty + this.vz * tz; // velocidad hacia delante
    let lx = this.vx - f * tx, ly = this.vy - f * ty, lz = this.vz - f * tz; // lateral
    const k = Math.exp(-7 * dt);
    lx *= k; ly *= k; lz *= k;
    if (inp.py > 0.1 && this.state !== 'manual') f += (f < V_PUSH ? 4.2 : 0) * inp.py * dt / drag * (drag > 1 ? 0.6 : 1);
    if (inp.py < -0.1 && this.state !== 'manual') f -= Math.sign(f) * Math.min(Math.abs(f), 9 * -inp.py * dt);
    f -= Math.sign(f) * Math.min(Math.abs(f), (0.28 + f * f * 0.0035) * dt * drag * (drag > 1 ? 2.5 : 1));
    this.vx = f * tx + lx; this.vy = f * ty + ly; this.vz = f * tz + lz;
    this.slide = Math.hypot(lx, ly, lz);

    // Salto (ollie): se carga mientras se mantiene y se suelta al levantar el dedo
    if (inp.jump && this.state === 'ground') {
      this.charge = Math.min(0.35, this.charge + dt);
      this.jumpHeld = true;
    }
    if ((this.jumpHeld && !inp.jump) || this.charge >= 0.35) {
      if (this.jumpHeld) { this.pop(3.6 + 2.4 * Math.min(1, this.charge / 0.35), ev); return; }
    }
    if (!inp.jump) { this.jumpHeld = false; this.charge = 0; }

    // Manual (equilibrio con adelante/atrás)
    if (this.state === 'ground' && inp.manual && sp > 1.6 && this.ny > 0.96 && !this.jumpHeld) this.startManual(ev);
    if (this.state === 'manual' && inp.jumpP) { this.pop(4.4, ev); return; }
    if (this.state === 'manual') {
      if (!inp.manual || sp < 0.9 || this.ny < 0.94) this.endManual(ev);
      else {
        this.manualT += dt;
        this.balDrift += dt * 0.22;
        this.bal += (Math.sign(this.bal || this.balDir) * (0.55 + this.balDrift) + inp.py * 1.9) * dt;
        this.combo.base += 70 * dt;
        this.combo.idle = 0;
        this.stats.longestManual = Math.max(this.stats.longestManual, this.manualT);
        if (Math.abs(this.bal) >= 1) { this.bail('Perdiste el manual', ev); return; }
        const ff = this.vx * dx + this.vz * dz;
        const keep = 0.9 * dt;
        this.vx -= dx * Math.sign(ff) * Math.min(Math.abs(ff), keep); this.vz -= dz * Math.sign(ff) * Math.min(Math.abs(ff), keep);
      }
    }

    // Movimiento y seguimiento del suelo
    const ox = this.x, oz = this.z, oy = this.y;
    const nx = this.x + this.vx * dt, nz = this.z + this.vz * dt;
    const hs = w.heightAt(nx, nz);
    const ny = { h: hs.h, hard: hs.hard, step: hs.step };
    const gs = w.slopeAt(nx, nz);
    const steepNew = Math.hypot(gs.gx, gs.gz);
    const rise = ny.h - oy;
    if (rise > (ny.hard ? ny.step : STEP) && (ny.hard || steepNew < 2.2)) {
      // Obstáculo: se rebota
      const impact = this.speed;
      this.vx *= -0.2; this.vz *= -0.2;
      ev.push({ k: 'hit', speed: impact });
      if (impact > 5.2) this.bail('Chocaste de frente', ev);
      return;
    }
    // ¿Se despega (borde de rampa, cima de un cuarto de tubo)?
    const yb = oy + this.vy * dt - 0.5 * G * dt * dt;
    this.x = nx; this.z = nz;
    if (yb > ny.h + 0.035 && (this.vy > 0.8 || oy - ny.h > 0.22)) {
      this.y = yb; this.vy -= G * dt;
      this.takeoff(false, ev);
      return;
    }
    this.y = ny.h;
    if (Math.abs(ny.h - oy) > 0.2) this.vy = clamp((ny.h - oy) / dt, -12, 12);
  }

  pop(power, ev) {
    const first = this.state === 'manual';
    if (first) this.endManual(ev);
    // Se suma al impulso vertical a lo largo de la normal para despegar de rampas
    this.vx += this.nx * power * 0.5; this.vz += this.nz * power * 0.5;
    this.vy = Math.max(this.vy, 0) + power * this.ny;
    this.y += 0.02;
    this.charge = 0; this.jumpHeld = false;
    this.takeoff(true, ev);
  }

  takeoff(ollie, ev) {
    this.state = 'air';
    this.air = { t: 0, y0: this.y, peak: this.y, spin: 0, flip: null, pending: [], grab: 0, grabDir: 'none', ollie, lastFlipEnd: 0, count: 0 };
    this.spinVel = 0;
    if (ollie) ev.push({ k: 'pop', power: this.vy });
    else ev.push({ k: 'launch', vy: this.vy });
  }

  // --------------------------------------------------------------------------------- en el aire
  inAir(dt, inp, ev) {
    const a = this.air;
    a.t += dt;
    // Giro del cuerpo
    const target = inp.sx * -9.5;
    this.spinVel += (target - this.spinVel) * Math.min(1, dt * (inp.sx ? 9 : 15));
    this.yaw += this.spinVel * dt;
    a.spin += this.spinVel * dt;
    // Trucos de tabla
    const f = a.flip;
    if (f) {
      f.t += dt;
      if (f.t >= f.dur) { a.pending.push({ id: f.id, name: TRICKS[f.id].name, pts: TRICKS[f.id].pts }); a.flip = null; }
    }
    const start = (id, dur) => { if (!a.flip) { a.flip = { id, t: 0, dur }; ev.push({ k: 'flip', id }); } };
    if (inp.kickP) { if (a.flip && a.flip.id === 'shuvit' && a.flip.t < 0.25) { a.flip.id = 'tre'; a.flip.dur = 0.55; } else start('kickflip', 0.45); }
    if (inp.heelP) { if (a.flip && a.flip.id === 'shuvit' && a.flip.t < 0.25) { a.flip.id = 'varial'; a.flip.dur = 0.55; } else start('heelflip', 0.45); }
    if (inp.shuvP) {
      if (a.flip && a.flip.id === 'kickflip' && a.flip.t < 0.25) { a.flip.id = 'tre'; a.flip.dur = 0.55; }
      else if (a.flip && a.flip.id === 'heelflip' && a.flip.t < 0.25) { a.flip.id = 'varial'; a.flip.dur = 0.55; }
      else start('shuvit', 0.42);
    }
    // Agarre
    if (inp.grab) {
      a.grab += dt;
      a.grabDir = inp.sx < -0.4 ? 'left' : inp.sx > 0.4 ? 'right' : inp.py > 0.4 ? 'up' : inp.py < -0.4 ? 'down' : a.grabDir;
    }
    // Física balística
    this.vy -= G * dt;
    const ox = this.x, oz = this.z, oy = this.y;
    this.x += this.vx * dt; this.z += this.vz * dt; this.y += this.vy * dt;
    a.peak = Math.max(a.peak, this.y);
    const w = this.world;
    const s = w.heightAt(this.x, this.z);
    // Chocar de lado con una caja o pared
    if (s.h > this.y + 0.35 && this.blocks(s)) {
      this.x = ox; this.z = oz;
      const impact = this.speed;
      this.vx *= -0.15; this.vz *= -0.15;
      ev.push({ k: 'hit', speed: impact });
      if (impact > 4.5) { this.bail('Chocaste en el aire', ev); return; }
    }
    // Raíles y bordes
    if (this.vy < 2.5) this.tryGrind(ev);
    if (this.state !== 'air') return;
    // Aterrizaje
    const hh = w.heightAt(this.x, this.z);
    if (this.y <= hh.h + 0.01 && (this.vy <= 0.5 || hh.h > oy)) { this.y = hh.h; this.land(hh, ev); }
  }

  /** ¿La superficie `s` (en la posición actual) es una pared y no una pendiente que se pueda subir? */
  blocks(s) {
    if (s.hard) return true;
    const g = this.world.slopeAt(this.x, this.z);
    return Math.hypot(g.gx, g.gz) < 2.2;
  }

  land(sf, ev) {
    const a = this.air;
    const w = this.world;
    const { gx, gz } = w.slopeAt(this.x, this.z);
    const nl = Math.hypot(gx, 1, gz);
    const nx = -gx / nl, ny = 1 / nl, nz = -gz / nl;
    const impact = -(this.vx * nx + this.vy * ny + this.vz * nz);
    this.air = null;
    const long = a.t > 0.28;
    // Rotación respecto a la dirección de marcha
    const travel = this.speed > 0.8 ? Math.atan2(this.vx, this.vz) : this.yaw;
    const rel = wrap(this.yaw - travel);
    const fwd = Math.abs(rel) < 0.9, fakie = Math.abs(rel) > Math.PI - 0.9;
    if (long) {
      if (a.flip && a.flip.t / a.flip.dur > 0.12) return this.bail('Aterrizaste a medio truco', ev);
      if (!fwd && !fakie) return this.bail('Aterrizaste de lado', ev);
    }
    if (impact > 11.5) return this.bail('Caída demasiado fuerte', ev);
    // Aterrizaje limpio
    if (fakie) { this.yaw = wrap(this.yaw + Math.PI); ev.push({ k: 'switch' }); }
    this.state = 'ground';
    const vn = this.vx * nx + this.vy * ny + this.vz * nz;
    if (vn < 0) { this.vx -= nx * vn; this.vz -= nz * vn; }
    this.vy = (-nx * this.vx - nz * this.vz) / Math.max(0.08, ny);
    ev.push({ k: 'land', impact, perfect: Math.abs(rel) < 0.2 || Math.abs(Math.abs(rel) - Math.PI) < 0.2, air: a.t });
    if (!long) { this.combo.idle = 0; return; }
    const c = this.combo;
    c.idle = 0;
    if (a.ollie && !a.pending.length && a.spin === 0) this.addTrick('ollie', 'Ollie', TRICKS.ollie.pts, ev);
    for (const t of a.pending) {
      this.addTrick(t.id, t.name, t.pts, ev);
      this.stats.landed.add(t.id);
    }
    if (a.pending.some((t) => t.id === 'tre' || t.id === 'varial')) { this.stats.landed.add('kickflip'); this.stats.landed.add('shuvit'); }
    const spins = Math.round(Math.abs(a.spin) / Math.PI);
    if (spins >= 1) {
      const deg = spins * 180;
      this.addTrick('spin', `Giro ${deg}`, 100 * spins * spins + 20, ev, `spin${deg}`);
      this.stats.maxSpin = Math.max(this.stats.maxSpin, deg);
    }
    if (a.grab > 0.25) this.addTrick('grab', GRABS[a.grabDir] || 'Agarre', TRICKS.grab.pts + Math.round(a.grab * 160), ev, `grab${a.grabDir}`);
    if (fakie) this.addTrick('switch', 'Switch', TRICKS.switch.pts, ev);
    const gain = a.peak - a.y0;
    if (a.t > 1.0) { const pts = Math.round((a.t - 0.8) * 320); c.base += pts; ev.push({ k: 'bonus', name: 'Tiempo en el aire', pts }); }
    if (gain > 2.0) { const pts = Math.round((gain - 2) * 420); c.base += pts; ev.push({ k: 'bonus', name: 'Gran altura', pts }); }
    if (ev[ev.length - 1]?.k !== 'bonus' && Math.abs(rel) < 0.2 && a.pending.length) { c.base += 80; ev.push({ k: 'bonus', name: 'Aterrizaje perfecto', pts: 80 }); }
    this.stats.maxAir = Math.max(this.stats.maxAir, a.t);
    this.stats.maxHeight = Math.max(this.stats.maxHeight, gain);
  }

  // -------------------------------------------------------------------------------------- grind
  tryGrind(ev) {
    if (this.speed < 1.5) return;
    const lines = this.world.grinds;
    for (const g of lines) {
      const rx = this.x - g.ax, rz = this.z - g.az;
      const t = rx * g.dx + rz * g.dz;
      if (t < -0.2 || t > g.len + 0.2) continue;
      const off = Math.abs(rx * -g.dz + rz * g.dx);
      if (off > 0.6) continue;
      const hl = g.ah + (g.bh - g.ah) * clamp(t / (g.len || 1), 0, 1);
      if (Math.abs(this.y - hl) > 0.42) continue;
      // Alineación entre la marcha y la línea
      const hd = this.dirX * g.dx + this.dirZ * g.dz;
      const ang = Math.acos(clamp(Math.abs(hd), 0, 1));
      let id;
      if (ang < 0.7) id = 'g5050'; else if (ang > 0.95) id = 'gboard'; else id = 'gnose';
      const sgn = this.vx * g.dx + this.vz * g.dz >= 0 ? 1 : -1;
      const air = this.air;
      if (air && air.flip && air.flip.t / air.flip.dur > 0.5) {
        // El truco en curso se cierra al entrar en el grind
        air.pending.push({ id: air.flip.id, name: TRICKS[air.flip.id].name, pts: TRICKS[air.flip.id].pts });
        this.stats.landed.add(air.flip.id);
      }
      for (const t of air?.pending || []) { this.addTrick(t.id, t.name, t.pts, ev); this.stats.landed.add(t.id); }
      this.state = 'grind';
      this.grind = { g, t: clamp(t, 0, g.len), sgn, v: Math.max(3, this.speed), id, len: 0, time: 0 };
      this.bal = (Math.random() < 0.5 ? -1 : 1) * 0.12;
      this.balDrift = 0;
      this.air = null;
      this.vy = 0;
      this.addTrick(id, TRICKS[id].name, TRICKS[id].pts, ev);
      ev.push({ k: 'grind', id, kind: g.kind });
      return;
    }
  }

  onGrind(dt, inp, ev) {
    const gr = this.grind, g = gr.g;
    gr.time += dt;
    this.balDrift += dt * 0.25;
    this.bal += (Math.sign(this.bal || 1) * (0.5 + this.balDrift) + inp.sx * 2.3) * dt;
    gr.v = Math.max(0, gr.v - 0.55 * dt);
    gr.t += gr.sgn * gr.v * dt;
    gr.len += gr.v * dt;
    this.combo.base += 95 * dt;
    this.combo.idle = 0;
    this.stats.longestGrind = Math.max(this.stats.longestGrind, gr.len);
    const t = clamp(gr.t, 0, g.len);
    this.x = g.ax + g.dx * t; this.z = g.az + g.dz * t;
    this.y = g.ah + (g.bh - g.ah) * (t / (g.len || 1));
    this.vx = g.dx * gr.sgn * gr.v; this.vz = g.dz * gr.sgn * gr.v; this.vy = 0;
    // La tabla se orienta a lo largo de la línea (o de lado en un boardslide)
    const along = Math.atan2(g.dx * gr.sgn, g.dz * gr.sgn);
    const want = gr.id === 'gboard' ? along + Math.PI / 2 : along;
    this.yaw += wrap(want - this.yaw) * Math.min(1, dt * 10);
    if (Math.abs(this.bal) >= 1) { this.bail('Te caíste del grind', ev); return; }
    if (inp.jumpP) { this.leaveGrind(4.2, ev); return; }
    if (gr.v < 0.4 || gr.t <= 0 || gr.t >= g.len) {
      const dirx = g.dx * gr.sgn, dirz = g.dz * gr.sgn;
      this.vx = dirx * Math.max(gr.v, 2.5); this.vz = dirz * Math.max(gr.v, 2.5);
      this.leaveGrind(1.6, ev, true);
    }
  }

  leaveGrind(up, ev, end = false) {
    const gr = this.grind;
    this.grind = null;
    this.vy = up;
    this.state = 'air';
    this.air = { t: 0, y0: this.y, peak: this.y, spin: 0, flip: null, pending: [], grab: 0, grabDir: 'none', ollie: false, lastFlipEnd: 0, count: 0, fromGrind: true };
    this.spinVel = 0;
    this.y += 0.05;
    this.combo.idle = 0;
    this.yaw = Math.atan2(this.vx, this.vz) || this.yaw;
    this.charge = 0; this.jumpHeld = false;
    this.lastGrind = gr;
  }

  // ------------------------------------------------------------------------------------- manual
  startManual(ev) {
    this.state = 'manual';
    this.manualT = 0;
    this.balDir = Math.random() < 0.5 ? -1 : 1;
    this.bal = this.balDir * 0.1;
    this.balDrift = 0;
    this.addTrick('manual', 'Manual', TRICKS.manual.pts, ev);
  }

  endManual() {
    if (this.state === 'manual') this.state = 'ground';
    this.bal = 0;
  }

  // --------------------------------------------------------------------------------------- caída
  bail(why, ev) {
    this.state = 'bail';
    this.bailT = 0;
    this.bailWhy = why;
    this.air = null; this.grind = null;
    this.stats.bails++;
    this.endCombo(false, ev);
    ev.push({ k: 'bail', why });
    this.vy = Math.max(this.vy, 1.5);
    this.spinVel = 0;
  }

  onBail(dt, ev) {
    this.bailT += dt;
    const w = this.world;
    this.vy -= G * dt;
    const k = Math.exp(-1.6 * dt);
    this.vx *= k; this.vz *= k;
    const nx = this.x + this.vx * dt, nz = this.z + this.vz * dt;
    const s = w.heightAt(nx, nz);
    if (!(s.h > this.y + 0.3 && s.hard)) { this.x = nx; this.z = nz; }
    this.y += this.vy * dt;
    const h = w.heightAt(this.x, this.z).h;
    if (this.y < h) { this.y = h; this.vy = 0; this.vx *= 0.9; this.vz *= 0.9; }
    if (this.bailT > 1.5) {
      this.state = 'ground';
      this.vx = this.vy = this.vz = 0;
      this.y = h;
      this.steer = 0;
      ev.push({ k: 'getup' });
    }
  }

  // ------------------------------------------------------------------- límites, letras y huecos
  limits(ev) {
    const b = this.map.bounds;
    if (this.x < b.x0) { this.x = b.x0; this.vx = Math.abs(this.vx) * 0.3; }
    if (this.x > b.x1) { this.x = b.x1; this.vx = -Math.abs(this.vx) * 0.3; }
    if (this.z < b.z0) { this.z = b.z0; this.vz = Math.abs(this.vz) * 0.3; }
    if (this.z > b.z1) { this.z = b.z1; this.vz = -Math.abs(this.vz) * 0.3; }
  }

  collect(ev) {
    const st = this.stats;
    for (const l of this.map.letters) {
      if (st.letters.has(l.ch)) continue;
      const base = this.world.heightAt(l.x, l.z).h + (l.y0 || 0);
      if (Math.hypot(this.x - l.x, this.z - l.z) < 1.7 && Math.abs(this.y + 0.9 - (base + l.up)) < 1.3) {
        st.letters.add(l.ch);
        ev.push({ k: 'letter', ch: l.ch, n: st.letters.size });
        if (st.letters.size === this.map.letters.length) { st.score += 1000; ev.push({ k: 'bonus', name: '¡S-K-A-T-E completo!', pts: 1000, direct: true }); }
      }
    }
    if (this.state === 'air' || this.state === 'grind') {
      for (const g of this.map.gaps) {
        if (st.gaps.has(g.id)) continue;
        if (Math.hypot(this.x - g.x, this.z - g.z) < g.r && this.y > this.world.heightAt(this.x, this.z).h + 0.25) {
          st.gaps.add(g.id);
          this.addTrick(`gap_${g.id}`, g.name, g.pts, ev);
          ev.push({ k: 'gap', id: g.id, name: g.name, pts: g.pts });
        }
      }
    }
  }

  checkGoals(ev) {
    const st = this.stats;
    st.score = Math.round(st.score);
    for (const g of this.map.goals) {
      if (st.goals.has(g.id)) continue;
      let ok = false;
      switch (g.type) {
        case 'score': ok = st.score >= g.v; break;
        case 'combo': ok = st.bestCombo >= g.v; break;
        case 'trick': ok = st.landed.has(g.id2); break;
        case 'grind': ok = st.longestGrind >= g.v; break;
        case 'gap': ok = st.gaps.has(g.id2); break;
        case 'spin': ok = st.maxSpin >= g.v; break;
        case 'letters': ok = st.letters.size >= this.map.letters.length; break;
        case 'manual': ok = st.longestManual >= g.v; break;
        case 'height': ok = st.maxHeight >= g.v; break;
        case 'air': ok = st.maxAir >= g.v; break;
        default:
      }
      if (ok) { st.goals.add(g.id); ev.push({ k: 'goal', id: g.id, text: g.text, n: st.goals.size }); }
    }
  }

  /** Cierra el combo pendiente al terminar la sesión. */
  finish(ev = []) {
    if (this.state === 'air') this.endCombo(false, ev); else this.endCombo(true, ev);
    return ev;
  }

  /** Resumen para el servidor y la pantalla de resultados. */
  summary() {
    const st = this.stats;
    return {
      score: Math.round(st.score), bestCombo: Math.round(st.bestCombo), goals: st.goals.size, tricks: st.tricks,
      maxAir: +st.maxAir.toFixed(2), maxHeight: +st.maxHeight.toFixed(2), longestGrind: +st.longestGrind.toFixed(1),
      letters: st.letters.size, bails: st.bails,
    };
  }
}

export const BAIL_TEXT = { none: '' };
