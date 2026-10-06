// Pinta y Escóndete: el servidor lleva las rondas, los papeles (escondido/buscador),
// la pintura de cada jugador, el camuflaje (comparando la pintura con los colores
// del escenario que lo rodea), los "¡te pillé!" de los buscadores y a los bots.
import { BaseMode } from './BaseMode.js';
import * as users from '../../services/users.js';
import { CAMALEON, PARTS } from '../../../shared/worlds/camaleon.js';
import { randomAvatar } from '../../../shared/avatar.js';
import { mulberry32 } from '../../../shared/terrain.js';

const HEX = /^#[0-9a-fA-F]{6}$/;
const POSES = ['normal', 'agachado', 'tumbado'];
const WHITE = { head: '#ffffff', body: '#ffffff', arms: '#ffffff', legs: '#ffffff', pose: 'normal' };
const FOUND = { head: '#ff1744', body: '#ff1744', arms: '#ff1744', legs: '#ff1744', pose: 'normal' };
const BOT_NAMES = ['Pinchito', 'Lagarto', 'Pincel', 'Gotita', 'Brochas', 'Acuarela', 'Ceras', 'Tizas'];
const r2 = (v) => Math.round(v * 100) / 100;

const rgb = (hex) => [parseInt(hex.slice(1, 3), 16), parseInt(hex.slice(3, 5), 16), parseInt(hex.slice(5, 7), 16)];
const colorDist = (a, b) => {
  const [r1, g1, b1] = rgb(a), [r2_, g2, b2] = rgb(b);
  return Math.hypot(r1 - r2_, g1 - g2, b1 - b2) / 441.7; // 0..1
};

/** Partes del cuerpo como esferas (centro relativo a los pies y radio) según la pose. */
function bodySpheres(pos, pose) {
  const [x, y, z] = pos;
  if (pose === 'tumbado') return [[x, y + 0.35, z, 0.75], [x, y + 0.35, z + 0.7, 0.6], [x, y + 0.35, z - 0.7, 0.6]];
  if (pose === 'agachado') return [[x, y + 0.5, z, 0.7], [x, y + 1.1, z, 0.55]];
  return [[x, y + 0.5, z, 0.5], [x, y + 1.15, z, 0.55], [x, y + 1.75, z, 0.45]];
}

export class CamaleonMode extends BaseMode {
  constructor(room) {
    super(room);
    this.meta = this.world.meta;
    this.maps = this.meta.maps;
    this.rng = mulberry32(Date.now() % 1e6);
    this.bots = new Map();
    this.roles = new Map();
    this.paints = new Map();
    this.seq = 0;
    this.round = 0;
    this.mapIdx = Math.floor(this.rng() * this.maps.length);
    this.phase = 'lobby';
    this.until = Date.now() + CAMALEON.lobbySeconds * 1000;
    this.lastSeeker = new Map(); // userId -> ronda en la que buscó
    // Superficies (cajas) del escenario para calcular el camuflaje y bloquear la vista
    this.surfaces = (this.world.objects || []).filter((o) => o.c && o.s && ['block', 'cylinder', 'sphere'].includes(o.t))
      .map((o) => ({ min: [o.p[0] - o.s[0] / 2, o.p[1] - o.s[1] / 2, o.p[2] - o.s[2] / 2], max: [o.p[0] + o.s[0] / 2, o.p[1] + o.s[1] / 2, o.p[2] + o.s[2] / 2], c: o.c, solid: !o.nc && o.s[1] > 0.3 }));
  }

  get map() {
    return this.maps[this.mapIdx];
  }

  // --- Estado público -----------------------------------------------------------
  publicState() {
    return {
      phase: this.phase, until: this.until, round: this.round, map: this.mapIdx, mapName: this.map.name,
      roles: Object.fromEntries(this.roles), paints: Object.fromEntries(this.paints),
    };
  }

  sync() {
    this.broadcast('cam', this.publicState());
  }

  onJoin(p) {
    p.data = { tagAt: 0, missUntil: 0, last: [...p.pos], moved: 0, paintAt: 0 };
    // Quien entra a mitad de ronda espera como buscador
    if (this.phase === 'hide' || this.phase === 'seek') {
      this.roles.set(p.id, 'seeker');
      this.paints.set(p.id, { ...FOUND });
      const pos = this.phase === 'hide' ? this.map.cage : this.map.release;
      this.room.teleport(p, pos);
      p.pos = [...pos];
    }
    return { cam: this.publicState() };
  }

  onLeave(p) {
    this.roles.delete(p.id);
    this.paints.delete(p.id);
    this.sync();
  }

  publicPlayers() {
    return [...this.bots.values()].map((b) => this.botPublic(b));
  }

  botPublic(b) {
    return { id: b.id, name: b.name, title: 'Bot', level: 'Bot', bot: true, avatar: b.avatar, p: b.pos, ry: b.ry, a: b.anim };
  }

  snapPlayers() {
    return [...this.bots.values()].map((b) => ({ id: b.id, p: b.pos.map(r2), ry: r2(b.ry), a: b.anim }));
  }

  // --- Rondas ---------------------------------------------------------------------
  ensureBots() {
    const humans = this.room.players.size;
    const want = Math.max(0, 4 - humans);
    while (this.bots.size > want) {
      const b = [...this.bots.values()].pop();
      this.bots.delete(b.id);
      this.broadcast('player:leave', { id: b.id });
    }
    while (this.bots.size < want) {
      const id = `cmbot${++this.seq}`;
      const b = { id, name: `${BOT_NAMES[this.seq % BOT_NAMES.length]}`, avatar: randomAvatar(mulberry32(this.seq * 7 + 1)), pos: [...this.meta.lobby], ry: 0, anim: 'idle', wp: 0, target: null, lookAt: 0 };
      this.bots.set(id, b);
      this.broadcast('player:join', this.botPublic(b));
    }
  }

  startRound() {
    this.round++;
    this.mapIdx = (this.mapIdx + 1) % this.maps.length;
    this.ensureBots();
    const humans = [...this.room.players.values()];
    const all = [...humans.map((p) => p.id), ...this.bots.keys()];
    const seekers = new Set();
    const nSeek = all.length >= 7 ? 2 : 1;
    if (humans.length === 1) {
      // Jugando solo: una ronda te escondes y la siguiente buscas
      if (this.round % 2 === 0) seekers.add(humans[0].id);
    } else {
      const order = [...humans].sort((a, b) => (this.lastSeeker.get(a.id) || 0) - (this.lastSeeker.get(b.id) || 0) || this.rng() - 0.5);
      for (const p of order.slice(0, nSeek)) seekers.add(p.id);
    }
    const botIds = [...this.bots.keys()];
    while (seekers.size < nSeek && botIds.length) seekers.add(botIds.splice(Math.floor(this.rng() * botIds.length), 1)[0]);
    this.roles.clear();
    this.paints.clear();
    const m = this.map;
    const spots = [...m.spots].sort(() => this.rng() - 0.5);
    for (const id of all) {
      const seeker = seekers.has(id);
      this.roles.set(id, seeker ? 'seeker' : 'hider');
      this.paints.set(id, seeker ? { ...FOUND } : { ...WHITE });
      if (seeker && this.room.players.has(id)) this.lastSeeker.set(id, this.round);
      const p = this.room.players.get(id);
      if (p) {
        const pos = seeker ? m.cage : [m.center[0] + (this.rng() - 0.5) * 10, 0.2, m.center[2] + (this.rng() - 0.5) * 10];
        this.room.teleport(p, pos);
        this.emit(p, 'respawn', { p: pos });
        p.data.moved = 0;
      } else {
        const b = this.bots.get(id);
        b.target = null;
        if (seeker) {
          b.pos = [...m.cage];
        } else {
          // El bot escondido va a un sitio y se pinta de su color (con un pequeño fallo)
          const s = spots.pop() || { p: m.center, c: m.floorColor, pose: 'tumbado' };
          b.pos = [...s.p];
          b.ry = this.rng() * Math.PI * 2;
          const tint = (hex) => {
            const [r, gg, bb] = rgb(hex).map((v) => Math.max(0, Math.min(255, v + Math.round((this.rng() - 0.5) * 40))));
            return `#${[r, gg, bb].map((v) => v.toString(16).padStart(2, '0')).join('')}`;
          };
          this.paints.set(id, { head: tint(s.c), body: tint(s.c), arms: tint(s.c), legs: tint(s.c), pose: s.pose });
        }
        b.anim = 'idle';
      }
    }
    this.phase = 'hide';
    this.until = Date.now() + CAMALEON.hideSeconds * 1000;
    this.room.systemMessage(`🎨 Ronda ${this.round} en ${m.name}: ¡los camaleones tienen ${CAMALEON.hideSeconds} s para pintarse y esconderse!`);
    this.sync();
  }

  startSeek() {
    this.phase = 'seek';
    this.until = Date.now() + CAMALEON.seekSeconds * 1000;
    for (const [id, role] of this.roles) {
      if (role !== 'seeker') continue;
      const pos = [this.map.release[0] + (this.rng() - 0.5) * 4, 0.2, this.map.release[2]];
      const p = this.room.players.get(id);
      if (p) { this.room.teleport(p, pos); this.emit(p, 'respawn', { p: pos }); }
      else if (this.bots.has(id)) this.bots.get(id).pos = pos;
    }
    this.room.systemMessage('👀 ¡Los buscadores salen! Quedaos quietos…');
    this.sync();
  }

  hidersLeft() {
    return [...this.roles.values()].filter((r) => r === 'hider').length;
  }

  finish() {
    const left = this.hidersLeft();
    for (const [id, role] of this.roles) {
      const p = this.room.players.get(id);
      if (!p) continue;
      if (role === 'hider') {
        const coins = users.dailyCapped(p.id, 'camaleon', 25, 100);
        users.award(p.id, { xp: 70, coins, reason: '¡Nadie te ha encontrado!' });
        users.unlockAchievement(p.id, 'camaleon_win');
        users.updateStats(p.id, (s) => { s.wins = (s.wins || 0) + 1; });
      } else if (left === 0 && this.lastSeeker.get(p.id) === this.round) {
        users.award(p.id, { xp: 50, coins: users.dailyCapped(p.id, 'camaleon', 15, 100), reason: '¡Habéis encontrado a todos!' });
      }
    }
    this.room.systemMessage(left ? `🦎 ¡Ganan los camaleones! Quedaban ${left} sin encontrar.` : '🔎 ¡Los buscadores han encontrado a todos!');
    this.phase = 'results';
    this.until = Date.now() + CAMALEON.resultSeconds * 1000;
    this.sync();
  }

  found(id, byName) {
    if (this.roles.get(id) !== 'hider') return false;
    this.roles.set(id, 'seeker');
    this.paints.set(id, { ...FOUND });
    const p = this.room.players.get(id);
    const name = p?.name || this.bots.get(id)?.name;
    this.broadcast('cam:found', { id, name, by: byName });
    this.sync();
    if (this.hidersLeft() === 0) this.finish();
    return true;
  }

  // --- Camuflaje ------------------------------------------------------------------
  /** 0 = se ve muchísimo, 1 = invisible. Compara cada parte con los colores cercanos. */
  camo(pos, paint) {
    const near = [];
    for (const s of this.surfaces) {
      const dx = Math.max(s.min[0] - pos[0], 0, pos[0] - s.max[0]);
      const dy = Math.max(s.min[1] - (pos[1] + 0.8), 0, pos[1] + 0.8 - s.max[1]);
      const dz = Math.max(s.min[2] - pos[2], 0, pos[2] - s.max[2]);
      const d = Math.hypot(dx, dy, dz);
      if (d < 2.2) near.push(s.c);
    }
    if (!near.length) return 0.1;
    const w = { head: 0.2, body: 0.4, arms: 0.2, legs: 0.2 };
    let score = 0;
    for (const part of PARTS) score += w[part] * Math.min(...near.map((c) => colorDist(paint[part], c)));
    return Math.max(0, Math.min(1, 1 - score * 4));
  }

  // --- Acciones de los jugadores --------------------------------------------------
  onEvent(p, name, data = {}) {
    const now = Date.now();
    const role = this.roles.get(p.id);
    if (name === 'paint') {
      if (role !== 'hider') return { error: 'Solo los camaleones pueden pintarse' };
      if (now - p.data.paintAt < 60) return { ok: true };
      p.data.paintAt = now;
      const paint = { ...(this.paints.get(p.id) || WHITE) };
      if (data.pose !== undefined) {
        if (!POSES.includes(data.pose)) return { error: 'Pose no válida' };
        paint.pose = data.pose;
      }
      if (data.color !== undefined) {
        if (!HEX.test(data.color)) return { error: 'Color no válido' };
        const parts = data.part === 'all' ? PARTS : [data.part];
        if (!parts.every((x) => PARTS.includes(x))) return { error: 'Parte no válida' };
        for (const x of parts) paint[x] = data.color.toLowerCase();
      }
      this.paints.set(p.id, paint);
      this.broadcast('cam:paint', { id: p.id, paint });
      return { ok: true };
    }
    if (name === 'tag') {
      if (role !== 'seeker' || this.phase !== 'seek') return { error: 'Ahora no puedes buscar' };
      if (now < p.data.missUntil || now - p.data.tagAt < 500) return { error: 'cadencia' };
      p.data.tagAt = now;
      const d = Array.isArray(data.d) && data.d.length === 3 && data.d.every(Number.isFinite) ? data.d : null;
      if (!d) return { error: 'Dirección no válida' };
      const len = Math.hypot(...d) || 1;
      const dir = d.map((v) => v / len);
      const eye = [p.pos[0], p.pos[1] + 1.6, p.pos[2]];
      const hit = this.trace(eye, dir, 40);
      if (hit && this.found(hit.id, p.name)) {
        users.award(p.id, { xp: 15, reason: `¡Has encontrado a ${hit.name}!` });
        return { ok: true, hit: hit.id };
      }
      p.data.missUntil = now + 1500; // fallar tiene castigo: 1,5 s sin poder buscar
      return { ok: true, hit: null };
    }
    return { error: 'Evento no soportado' };
  }

  /** Primer camaleón que toca el rayo (las paredes y muebles tapan). */
  trace(o, d, maxT) {
    let best = null;
    const consider = (id, pos, name) => {
      const paint = this.paints.get(id) || WHITE;
      for (const [cx, cy, cz, r] of bodySpheres(pos, paint.pose)) {
        const lx = cx - o[0], ly = cy - o[1], lz = cz - o[2];
        const t = lx * d[0] + ly * d[1] + lz * d[2];
        if (t < 0 || t > maxT) continue;
        const px = o[0] + d[0] * t - cx, py = o[1] + d[1] * t - cy, pz = o[2] + d[2] * t - cz;
        if (Math.hypot(px, py, pz) <= r && (!best || t < best.t)) best = { id, t, name };
      }
    };
    for (const [id, role] of this.roles) {
      if (role !== 'hider') continue;
      const p = this.room.players.get(id);
      if (p) consider(id, p.pos, p.name);
      else if (this.bots.has(id)) consider(id, this.bots.get(id).pos, this.bots.get(id).name);
    }
    if (!best) return null;
    return this.blocked(o, d, best.t) ? null : best;
  }

  /** ¿Hay algún objeto sólido entre el origen y la distancia t? (rayo contra cajas) */
  blocked(o, d, t) {
    for (const s of this.surfaces) {
      if (!s.solid) continue;
      let t0 = 0.05, t1 = t - 0.4;
      let ok = true;
      for (let k = 0; k < 3 && ok; k++) {
        if (Math.abs(d[k]) < 1e-6) {
          if (o[k] < s.min[k] || o[k] > s.max[k]) ok = false;
        } else {
          let a = (s.min[k] - o[k]) / d[k], b = (s.max[k] - o[k]) / d[k];
          if (a > b) [a, b] = [b, a];
          t0 = Math.max(t0, a);
          t1 = Math.min(t1, b);
          if (t0 > t1) ok = false;
        }
      }
      if (ok) return true;
    }
    return false;
  }

  // --- Bots buscadores --------------------------------------------------------------
  tickSeekerBot(b, dt, now) {
    const m = this.map;
    const step = (target, speed) => {
      const dx = target[0] - b.pos[0], dz = target[2] - b.pos[2], dd = Math.hypot(dx, dz);
      if (dd < 0.2) return true;
      const s = Math.min(dd, speed * dt);
      b.pos[0] += (dx / dd) * s;
      b.pos[2] += (dz / dd) * s;
      b.ry = Math.atan2(dx, dz);
      b.anim = speed > 5 ? 'run' : 'walk';
      return false;
    };
    if (b.target) {
      const pos = this.room.players.get(b.target)?.pos || this.bots.get(b.target)?.pos;
      if (!pos || this.roles.get(b.target) !== 'hider') { b.target = null; return; }
      if (Math.hypot(pos[0] - b.pos[0], pos[2] - b.pos[2]) < 2.2) { this.found(b.target, b.name); b.target = null; return; }
      step(pos, 5.5);
      return;
    }
    if (step(m.patrol[b.wp % m.patrol.length], 3.4)) b.wp = Math.floor(this.rng() * m.patrol.length);
    if (now < b.lookAt) return;
    b.lookAt = now + 900;
    // Mira a su alrededor: cuanto peor camuflado (o si se mueve), más fácil es verlo
    for (const [id, role] of this.roles) {
      if (role !== 'hider') continue;
      const p = this.room.players.get(id);
      const pos = p?.pos || this.bots.get(id)?.pos;
      if (!pos) continue;
      const dx = pos[0] - b.pos[0], dz = pos[2] - b.pos[2], dist = Math.hypot(dx, dz);
      if (dist > 16) continue;
      const ang = Math.abs(Math.atan2(Math.sin(Math.atan2(dx, dz) - b.ry), Math.cos(Math.atan2(dx, dz) - b.ry)));
      if (ang > 1.3 && dist > 3) continue;
      if (this.blocked([b.pos[0], 1.6, b.pos[2]], [dx / dist, (pos[1] + 1 - 1.6) / dist, dz / dist], dist)) continue;
      const camo = this.camo(pos, this.paints.get(id) || WHITE);
      const moving = p && p.data.moved > 0.6;
      const chance = (1 - camo) * 0.32 + (moving ? 0.45 : 0) + (dist < 4 ? 0.12 : 0);
      if (this.rng() < chance) { b.target = id; return; }
    }
  }

  tick(dt) {
    const now = Date.now();
    if (this.room.players.size === 0) {
      if (this.phase !== 'lobby') {
        for (const b of this.bots.values()) this.broadcast('player:leave', { id: b.id });
        this.bots.clear();
        this.roles.clear();
        this.paints.clear();
        this.phase = 'lobby';
      }
      this.until = now + CAMALEON.lobbySeconds * 1000;
      return;
    }
    // Movimiento de los jugadores (para que los bots noten a quien se mueve)
    for (const p of this.room.players.values()) {
      const d = p.data;
      const v = Math.hypot(p.pos[0] - d.last[0], p.pos[2] - d.last[2]) / Math.max(dt, 0.01);
      d.moved = d.moved * 0.7 + v * 0.3;
      d.last = [...p.pos];
    }
    if (this.phase === 'lobby' && now >= this.until) this.startRound();
    else if (this.phase === 'hide' && now >= this.until) this.startSeek();
    else if (this.phase === 'seek') {
      for (const b of this.bots.values()) if (this.roles.get(b.id) === 'seeker') this.tickSeekerBot(b, dt, now);
      if (now >= this.until) this.finish();
      else if (![...this.roles.values()].includes('seeker')) this.finish();
      // Camuflaje de cada camaleón humano (se lo mostramos a él)
      if (!this.camoAt || now - this.camoAt > 1000) {
        this.camoAt = now;
        for (const p of this.room.players.values()) if (this.roles.get(p.id) === 'hider') this.emit(p, 'cam:me', { camo: r2(this.camo(p.pos, this.paints.get(p.id) || WHITE)) });
      }
    } else if (this.phase === 'hide' && (!this.camoAt || now - this.camoAt > 1000)) {
      this.camoAt = now;
      for (const p of this.room.players.values()) if (this.roles.get(p.id) === 'hider') this.emit(p, 'cam:me', { camo: r2(this.camo(p.pos, this.paints.get(p.id) || WHITE)) });
    } else if (this.phase === 'results' && now >= this.until) this.startRound();
  }

  adminLose(p) {
    return this.found(p.id, 'admin');
  }
}
