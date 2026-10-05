// Isla Royale: batalla de "último en pie" con tormenta, botín, construcción y bots.
// Todos los disparos se resuelven en el servidor (rayo contra cilindros de los
// jugadores, con línea de visión contra terreno, objetos del mundo y construcciones).
import { BaseMode } from './BaseMode.js';
import * as users from '../../services/users.js';
import { getHeightmap, mulberry32 } from '../../../shared/terrain.js';
import { randomAvatar } from '../../../shared/avatar.js';

export const WEAPONS = {
  pistola: { name: 'Pistola', dmg: 18, cd: 300, range: 70, pellets: 1, spread: 0.012 },
  rifle: { name: 'Rifle', dmg: 22, cd: 150, range: 90, pellets: 1, spread: 0.02 },
  escopeta: { name: 'Escopeta', dmg: 11, cd: 850, range: 20, pellets: 7, spread: 0.07 },
};
const PHASES = [
  { wait: 35, shrink: 25, r: 85, dps: 1 },
  { wait: 25, shrink: 20, r: 48, dps: 2 },
  { wait: 20, shrink: 20, r: 22, dps: 4 },
  { wait: 15, shrink: 20, r: 4, dps: 8 },
];
const BOT_NAMES = ['Ana', 'Leo', 'Iris', 'Max', 'Nico', 'Vega', 'Rui', 'Lola', 'Tom', 'Uma'];
const MIN_PARTICIPANTS = 6;
const PIECE = 4; // tamaño de la cuadrícula de construcción
const MAT_COST = 10;

export class RoyaleMode extends BaseMode {
  constructor(room) {
    super(room);
    this.hm = getHeightmap(this.world.terrain);
    this.solids = (this.world.objects || []).filter((o) => ['block', 'tree', 'deco', 'cylinder'].includes(o.t) && !o.nc);
    this.chests = new Map(this.objectsOfType('chest').map((c) => [c.id, c]));
    this.rng = mulberry32(Date.now() % 100000);
    this.toLobby();
  }

  // --- Estado de la partida -------------------------------------------------------
  toLobby() {
    this.phase = 'lobby';
    this.fighters = new Map(); // id -> combatiente (jugador o bot)
    this.bots = new Map();
    this.pieces = new Map();
    this.pieceSeq = 1;
    this.looted = new Set();
    this.storm = { x: 0, z: 0, r: 200, from: 200, to: 200, phase: -1, t0: 0, t1: 0, dps: 0 };
    this.startAt = 0;
    this.resultsAt = 0;
    this.lobbySince = Date.now();
    this.winner = null;
  }

  publicState() {
    return {
      phase: this.phase, startAt: this.startAt, alive: this.aliveCount(), total: this.fighters.size,
      winner: this.winner, looted: [...this.looted], pieces: [...this.pieces.values()],
    };
  }

  sync() {
    this.broadcast('royale', this.publicState());
  }

  aliveCount() {
    let n = 0;
    for (const f of this.fighters.values()) if (f.alive) n++;
    return n;
  }

  ground(x, z) {
    return Math.max(this.hm.heightAt(x, z), 0);
  }

  newFighter(id, name, isBot) {
    return { id, name, bot: isBot, hp: 100, shield: 0, weapon: 'pistola', weapons: ['pistola'], ammo: { pistola: 40, rifle: 0, escopeta: 0 }, mats: 60, alive: true, kills: 0, nextShot: 0 };
  }

  me(f) {
    return { hp: Math.round(f.hp), shield: Math.round(f.shield), weapon: f.weapon, weapons: f.weapons, ammo: f.ammo, mats: f.mats, alive: f.alive, kills: f.kills };
  }

  sendMe(p) {
    const f = this.fighters.get(p.id);
    if (f) this.emit(p, 'royale:me', this.me(f));
  }

  spectatorState() {
    return { royale: this.publicState(), weapons: WEAPONS };
  }

  adminLose(p) {
    const f = this.fighters.get(p.id);
    if (!f || !f.alive) return false;
    this.eliminate(f, null, 'un administrador eliminó a');
    return true;
  }

  onJoin(p) {
    p.data = {};
    return { royale: this.publicState(), weapons: WEAPONS };
  }

  onLeave(p) {
    const f = this.fighters.get(p.id);
    if (f && f.alive) this.eliminate(f, null, 'abandonó');
  }

  hidden(p) {
    const f = this.fighters.get(p.id);
    return !!f && !f.alive && this.phase === 'match';
  }

  startMatch() {
    this.phase = 'countdown';
    this.startAt = Date.now() + 5000;
    const drops = [...this.world.meta.dropSpawns].sort(() => this.rng() - 0.5);
    let k = 0;
    for (const p of this.room.players.values()) {
      const f = this.newFighter(p.id, p.name, false);
      this.fighters.set(p.id, f);
      const pos = drops[k++ % drops.length];
      this.room.teleport(p, pos);
      this.emit(p, 'respawn', { p: pos });
      this.sendMe(p);
    }
    // Bots hasta completar la partida
    const need = Math.max(0, MIN_PARTICIPANTS - this.fighters.size);
    for (let i = 0; i < need; i++) {
      const id = `bot-${Date.now().toString(36)}-${i}`;
      const name = `${BOT_NAMES[(i + Math.floor(this.rng() * 10)) % BOT_NAMES.length]}`;
      const f = this.newFighter(id, name, true);
      const d = drops[k++ % drops.length];
      f.pos = [d[0], this.ground(d[0], d[2]), d[2]];
      f.ry = 0;
      f.anim = 'idle';
      f.avatar = randomAvatar(mulberry32(i * 77 + 5));
      f.weapon = this.rng() < 0.5 ? 'rifle' : 'pistola';
      f.weapons = [f.weapon];
      f.goal = null;
      f.nextShot = Date.now() + 6000;
      f.accuracy = 0.35 + this.rng() * 0.2;
      this.fighters.set(id, f);
      this.bots.set(id, f);
      this.broadcast('player:join', this.botPublic(f));
    }
    // La tormenta se centra en un punto aleatorio cerca del centro
    const a = this.rng() * Math.PI * 2, d = this.rng() * 35;
    this.storm = { x: Math.cos(a) * d, z: Math.sin(a) * d, r: 180, from: 180, to: 180, phase: -1, t0: this.startAt, t1: this.startAt, dps: 0 };
    this.room.systemMessage(`🎯 ¡La batalla empieza en 5 segundos! ${this.fighters.size} combatientes`);
    this.sync();
  }

  botPublic(f) {
    return { id: f.id, name: f.name, title: 'Bot', level: 'Bot', bot: true, avatar: f.avatar, p: f.pos, ry: f.ry, a: f.anim };
  }

  publicPlayers() {
    return [...this.bots.values()].filter((b) => b.alive).map((b) => this.botPublic(b));
  }

  snapPlayers() {
    const out = [];
    for (const b of this.bots.values()) if (b.alive) out.push({ id: b.id, p: b.pos.map((v) => Math.round(v * 100) / 100), ry: Math.round(b.ry * 100) / 100, a: b.anim });
    return out;
  }

  snapExtra() {
    const s = this.storm;
    return { st: [Math.round(s.x), Math.round(s.z), Math.round(s.r * 10) / 10, s.phase, Math.round(s.t1 / 1000)], al: this.aliveCount() };
  }

  // --- Eventos de los jugadores -----------------------------------------------------
  onEvent(p, name, data = {}) {
    if (name === 'start') {
      if (this.phase !== 'lobby') return { error: 'Ya hay una partida en curso' };
      this.startMatch();
      return { ok: true };
    }
    const f = this.fighters.get(p.id);
    if (!f || !f.alive) return { error: 'No estás en la batalla' };
    if (name === 'equip') {
      if (!f.weapons.includes(data.w)) return { error: 'No tienes ese arma' };
      f.weapon = data.w;
      this.sendMe(p);
      return { ok: true };
    }
    if (this.phase !== 'match') return { error: 'Espera a que empiece la batalla' };
    if (name === 'shoot') return this.shoot(f, [p.pos[0], p.pos[1] + 1.6, p.pos[2]], data.d, p);
    if (name === 'build') return this.build(f, p, data);
    return { error: 'Evento no soportado' };
  }

  onInteract(p, o) {
    if (o.t !== 'chest' || !this.chests.has(o.id)) return null;
    const f = this.fighters.get(p.id);
    if (!f || !f.alive || this.phase !== 'match') return { error: 'Los cofres se abren durante la batalla' };
    if (this.looted.has(o.id)) return { error: 'Cofre vacío' };
    this.looted.add(o.id);
    const roll = this.rng();
    let text;
    if (roll < 0.3) { this.give(f, 'rifle', 60); text = 'Rifle +60 balas'; }
    else if (roll < 0.5) { this.give(f, 'escopeta', 16); text = 'Escopeta +16 cartuchos'; }
    else if (roll < 0.7) { f.shield = Math.min(100, f.shield + 50); text = 'Escudo +50'; }
    else if (roll < 0.85) { f.hp = Math.min(100, f.hp + 40); text = 'Botiquín +40'; }
    else { f.mats += 40; f.ammo.pistola += 20; text = 'Materiales +40 y balas'; }
    this.sendMe(p);
    this.broadcast('royale:chest', { id: o.id });
    return { ok: true, opened: o.id, loot: text };
  }

  give(f, w, ammo) {
    if (!f.weapons.includes(w)) f.weapons.push(w);
    f.ammo[w] += ammo;
    f.weapon = w;
  }

  // --- Disparos --------------------------------------------------------------------
  shoot(f, origin, dir, p) {
    const w = WEAPONS[f.weapon];
    const now = Date.now();
    if (now < f.nextShot) return { error: 'cadencia' };
    if (!f.bot && f.ammo[f.weapon] <= 0) return { error: 'Sin munición' };
    if (!Array.isArray(dir) || dir.length !== 3 || !dir.every(Number.isFinite)) return { error: 'Dirección inválida' };
    const l = Math.hypot(...dir) || 1;
    const d = dir.map((v) => v / l);
    f.nextShot = now + w.cd;
    if (!f.bot) f.ammo[f.weapon]--;
    const hits = [];
    let end = null;
    for (let k = 0; k < w.pellets; k++) {
      const pd = [d[0] + (this.rng() - 0.5) * w.spread * 2, d[1] + (this.rng() - 0.5) * w.spread * 2, d[2] + (this.rng() - 0.5) * w.spread * 2];
      const pl = Math.hypot(...pd);
      const r = this.trace(f.id, origin, pd.map((v) => v / pl), w.range);
      if (!end) end = r.point;
      if (r.target) {
        const falloff = f.weapon === 'escopeta' ? Math.max(0.35, 1 - r.dist / w.range) : 1;
        const dmg = w.dmg * falloff;
        hits.push({ id: r.target.id, dmg: Math.round(dmg) });
        this.damage(r.target, dmg, f);
      } else if (r.piece) {
        r.piece.hp -= w.dmg;
        if (r.piece.hp <= 0) {
          this.pieces.delete(r.piece.id);
          this.broadcast('royale:build', { remove: r.piece.id });
        }
      }
    }
    this.broadcast('royale:shot', { from: f.id, o: origin.map((v) => Math.round(v * 10) / 10), e: end.map((v) => Math.round(v * 10) / 10), w: f.weapon });
    if (p) this.sendMe(p);
    return { ok: true, hits };
  }

  /** Lanza un rayo: devuelve el primer combatiente, construcción o pared alcanzada. */
  trace(fromId, o, d, range) {
    let best = range, target = null, piece = null;
    // Combatientes (cilindros verticales de radio 0.55 y 2 m de alto)
    for (const f of this.fighters.values()) {
      if (!f.alive || f.id === fromId) continue;
      const pos = this.posOf(f);
      if (!pos) continue;
      const t = rayCylinder(o, d, pos, 0.55, 2.0);
      if (t != null && t < best) { best = t; target = f; }
    }
    // Construcciones y objetos sólidos del mundo (cajas giradas en Y)
    for (const pc of this.pieces.values()) {
      const t = rayBox(o, d, pc.box, best);
      if (t != null && t < best) { best = t; target = null; piece = pc; }
    }
    for (const ob of this.solids) {
      if (Math.hypot(ob.p[0] - o[0], ob.p[2] - o[2]) > best + 12) continue;
      const box = ob.t === 'tree' ? { p: [ob.p[0], ob.p[1] - ob.s[1] * 0.25, ob.p[2]], s: [ob.s[0] * 0.3, ob.s[1] * 0.5, ob.s[2] * 0.3], ry: 0 } : ob;
      const t = rayBox(o, d, box, best);
      if (t != null && t < best) { best = t; target = null; piece = null; }
    }
    // Terreno
    for (let t = 1; t < best; t += 1.5) {
      const x = o[0] + d[0] * t, y = o[1] + d[1] * t, z = o[2] + d[2] * t;
      if (y < this.hm.heightAt(x, z)) { best = t; target = null; piece = null; break; }
    }
    return { target, piece, dist: best, point: [o[0] + d[0] * best, o[1] + d[1] * best, o[2] + d[2] * best] };
  }

  posOf(f) {
    if (f.bot) return f.pos;
    return this.room.players.get(f.id)?.pos || null;
  }

  damage(f, dmg, by) {
    if (!f.alive) return;
    const s = Math.min(f.shield, dmg);
    f.shield -= s;
    f.hp -= dmg - s;
    if (!f.bot) {
      const p = this.room.players.get(f.id);
      if (p) { this.emit(p, 'royale:hurt', { by: by?.name || 'la tormenta' }); this.sendMe(p); }
    }
    if (f.hp <= 0) this.eliminate(f, by);
  }

  eliminate(f, by, how = null) {
    if (!f.alive) return;
    f.alive = false;
    f.hp = 0;
    if (by && by !== f) by.kills++;
    const place = this.aliveCount() + 1;
    this.broadcast('royale:feed', { victim: f.id, victimName: f.name, killer: by?.name || null, how: how || (by ? 'eliminó a' : 'la tormenta eliminó a') });
    if (f.bot) {
      this.broadcast('player:leave', { id: f.id });
    } else {
      const p = this.room.players.get(f.id);
      if (p) {
        this.emit(p, 'royale:dead', { place, kills: f.kills, by: by?.name || null });
        this.reward(p, f, place);
      }
    }
    this.sync();
  }

  reward(p, f, place) {
    const win = place === 1;
    const coins = users.dailyCapped(p.id, 'royale', (win ? 70 : 10) + f.kills * 6, 220);
    users.award(p.id, { xp: 40 + f.kills * 25 + (win ? 200 : 0), coins, reason: win ? '¡Victoria magistral!' : `Puesto ${place}` });
    users.updateStats(p.id, (s) => {
      s.royaleGames = (s.royaleGames || 0) + 1;
      s.royaleKills = (s.royaleKills || 0) + f.kills;
      if (win) { s.wins = (s.wins || 0) + 1; s.royaleWins = (s.royaleWins || 0) + 1; }
    });
    users.setHistoryResult(p.historyId, `Puesto ${place} · ${f.kills} eliminaciones`);
    if (win) users.unlockAchievement(p.id, 'royale_win');
  }

  // --- Construcción ------------------------------------------------------------------
  build(f, p, data) {
    const kind = data.kind === 'ramp' ? 'ramp' : 'wall';
    if (f.mats < MAT_COST) return { error: 'Sin materiales' };
    if (this.pieces.size >= 300) return { error: 'Límite de construcciones' };
    const x = Math.round(Number(data.x) / PIECE) * PIECE, z = Math.round(Number(data.z) / PIECE) * PIECE;
    const y = Number(data.y);
    const ry = ((Math.round(Number(data.ry) / 90) * 90) % 360 + 360) % 360;
    if (![x, y, z].every(Number.isFinite)) return { error: 'Posición inválida' };
    if (Math.hypot(x - p.pos[0], z - p.pos[2]) > 9 || Math.abs(y - p.pos[1]) > 8) return { error: 'Demasiado lejos' };
    const id = `pc${this.pieceSeq++}`;
    const piece = kind === 'wall'
      ? { id, kind, x, y: y + 2, z, ry, hp: 150, box: { p: [x + (ry % 180 === 0 ? 0 : (ry === 90 ? 2 : -2)), y + 2, z + (ry % 180 === 0 ? (ry === 0 ? 2 : -2) : 0)], s: [4, 4, 0.4], ry } }
      : { id, kind, x, y: y + 2, z, ry, hp: 150, box: { p: [x, y + 2, z], s: [4, 4, 4], ry } };
    if ([...this.pieces.values()].some((pc) => pc.kind === kind && Math.abs(pc.box.p[0] - piece.box.p[0]) < 0.5 && Math.abs(pc.box.p[1] - piece.box.p[1]) < 0.5 && Math.abs(pc.box.p[2] - piece.box.p[2]) < 0.5 && pc.ry === ry)) {
      return { error: 'Ya hay una pieza ahí' };
    }
    f.mats -= MAT_COST;
    this.pieces.set(id, piece);
    this.broadcast('royale:build', { add: piece });
    this.sendMe(p);
    return { ok: true };
  }

  // --- Bucle ---------------------------------------------------------------------------
  tick(dt) {
    const now = Date.now();
    if (this.phase === 'lobby') {
      // Arranque automático si hay al menos dos jugadores esperando
      if (this.room.players.size >= 2 && now - this.lobbySince > 25000) this.startMatch();
      return;
    }
    if (this.phase === 'countdown') {
      if (now >= this.startAt) {
        this.phase = 'match';
        this.nextStormPhase(now);
        this.room.systemMessage('🌀 ¡Que empiece la batalla!');
        this.sync();
      }
      return;
    }
    if (this.phase === 'results') {
      if (now - this.resultsAt > 9000) {
        for (const b of this.bots.values()) if (b.alive) this.broadcast('player:leave', { id: b.id });
        this.toLobby();
        for (const p of this.room.players.values()) {
          const pos = this.room.respawn(p);
          this.emit(p, 'respawn', { p: pos });
        }
        this.broadcast('royale:build', { clear: true });
        this.sync();
      }
      return;
    }
    // Partida en curso: tormenta
    const s = this.storm;
    if (now >= s.t1 && s.phase < PHASES.length - 1 && s.shrinking) this.nextStormPhase(now);
    else if (now >= s.t1 && !s.shrinking && s.phase >= 0) {
      s.shrinking = true;
      s.t0 = now;
      s.t1 = now + PHASES[s.phase].shrink * 1000;
    }
    if (s.shrinking) {
      const k = Math.min(1, (now - s.t0) / (s.t1 - s.t0));
      s.r = s.from + (s.to - s.from) * k;
    }
    for (const f of this.fighters.values()) {
      if (!f.alive) continue;
      const pos = this.posOf(f);
      if (pos && Math.hypot(pos[0] - s.x, pos[2] - s.z) > s.r) this.damage(f, s.dps * dt, null);
    }
    for (const b of this.bots.values()) if (b.alive) this.botTick(b, dt, now);
    if (this.aliveCount() <= 1) this.finish();
  }

  nextStormPhase(now) {
    const s = this.storm;
    s.phase++;
    const ph = PHASES[s.phase];
    s.from = s.r;
    s.to = ph.r;
    s.dps = ph.dps;
    s.shrinking = false;
    s.t0 = now;
    s.t1 = now + ph.wait * 1000;
    if (s.phase > 0) this.room.systemMessage(`🌀 La tormenta se cerrará en ${ph.wait} s`);
  }

  finish() {
    if (this.phase !== 'match') return;
    const w = [...this.fighters.values()].find((f) => f.alive);
    this.phase = 'results';
    this.resultsAt = Date.now();
    this.winner = w ? w.name : null;
    if (w && !w.bot) {
      const p = this.room.players.get(w.id);
      if (p) {
        this.reward(p, w, 1);
        this.emit(p, 'royale:dead', { place: 1, kills: w.kills, win: true });
      }
    }
    this.room.systemMessage(w ? `👑 ¡${w.name} gana la batalla!` : 'La batalla terminó sin ganador');
    this.sync();
  }

  // --- Bots ---------------------------------------------------------------------------
  botTick(b, dt, now) {
    const s = this.storm;
    // Enemigo más cercano
    let enemy = null, ed = 45;
    for (const f of this.fighters.values()) {
      if (!f.alive || f === b) continue;
      const pos = this.posOf(f);
      if (!pos) continue;
      const d = Math.hypot(pos[0] - b.pos[0], pos[2] - b.pos[2]);
      if (d < ed) { ed = d; enemy = f; }
    }
    const outside = Math.hypot(b.pos[0] - s.x, b.pos[2] - s.z) > s.r - 6;
    let gx, gz;
    if (outside) { gx = s.x; gz = s.z; }
    else if (enemy) {
      const ep = this.posOf(enemy);
      // Mantiene unos 14 m de distancia y se mueve lateralmente
      const dx = b.pos[0] - ep[0], dz = b.pos[2] - ep[2], d = Math.hypot(dx, dz) || 1;
      const side = Math.sin(now / 900 + b.id.length) > 0 ? 1 : -1;
      gx = ep[0] + (dx / d) * 14 + (-dz / d) * 6 * side;
      gz = ep[2] + (dz / d) * 14 + (dx / d) * 6 * side;
    } else {
      if (!b.goal || Math.hypot(b.goal[0] - b.pos[0], b.goal[1] - b.pos[2]) < 3) {
        const a = this.rng() * Math.PI * 2, r = this.rng() * Math.max(5, s.r * 0.7);
        b.goal = [s.x + Math.cos(a) * r, s.z + Math.sin(a) * r];
      }
      [gx, gz] = b.goal;
    }
    const dx = gx - b.pos[0], dz = gz - b.pos[2], d = Math.hypot(dx, dz);
    if (d > 1) {
      const sp = Math.min(d, 6.5 * dt);
      const nx = b.pos[0] + (dx / d) * sp, nz = b.pos[2] + (dz / d) * sp;
      if (this.hm.heightAt(nx, nz) > 0.3) { b.pos[0] = nx; b.pos[2] = nz; }
      b.pos[1] = this.ground(b.pos[0], b.pos[2]);
      b.anim = 'run';
    } else b.anim = 'idle';
    if (enemy) {
      const ep = this.posOf(enemy);
      b.ry = Math.atan2(ep[0] - b.pos[0], ep[2] - b.pos[2]);
      if (now >= b.nextShot && ed < 40) {
        const o = [b.pos[0], b.pos[1] + 1.6, b.pos[2]];
        const aim = [ep[0] - o[0], ep[1] + 1.1 - o[1], ep[2] - o[2]];
        // Puntería imperfecta: a más distancia, más error
        const miss = this.rng() > b.accuracy * (1 - ed / 60);
        if (miss) { aim[0] += (this.rng() - 0.5) * 6; aim[1] += (this.rng() - 0.3) * 3; aim[2] += (this.rng() - 0.5) * 6; }
        this.shoot(b, o, aim, null);
        b.nextShot = now + WEAPONS[b.weapon].cd + 500 + this.rng() * 700;
      }
    } else if (d > 1) b.ry = Math.atan2(dx, dz);
  }
}

// --- Geometría de rayos -------------------------------------------------------------
/** Rayo contra cilindro vertical (base en pos, radio r, altura h). Devuelve t o null. */
function rayCylinder(o, d, pos, r, h) {
  const ox = o[0] - pos[0], oz = o[2] - pos[2];
  const a = d[0] * d[0] + d[2] * d[2];
  if (a < 1e-8) return null;
  const b = 2 * (ox * d[0] + oz * d[2]);
  const c = ox * ox + oz * oz - r * r;
  const disc = b * b - 4 * a * c;
  if (disc < 0) return null;
  const sq = Math.sqrt(disc);
  for (const t of [(-b - sq) / (2 * a), (-b + sq) / (2 * a)]) {
    if (t < 0) continue;
    const y = o[1] + d[1] * t;
    if (y >= pos[1] && y <= pos[1] + h) return t;
  }
  return null;
}

/** Rayo contra caja girada en Y (método de las franjas). */
function rayBox(o, d, box, maxT) {
  const a = ((box.ry || 0) * Math.PI) / 180;
  const cos = Math.cos(a), sin = Math.sin(a);
  const rx = o[0] - box.p[0], rz = o[2] - box.p[2];
  const lo = [rx * cos - rz * sin, o[1] - box.p[1], rx * sin + rz * cos];
  const ld = [d[0] * cos - d[2] * sin, d[1], d[0] * sin + d[2] * cos];
  let t0 = 0, t1 = maxT;
  for (let i = 0; i < 3; i++) {
    const h = box.s[i] / 2;
    if (Math.abs(ld[i]) < 1e-9) {
      if (lo[i] < -h || lo[i] > h) return null;
      continue;
    }
    let ta = (-h - lo[i]) / ld[i], tb = (h - lo[i]) / ld[i];
    if (ta > tb) [ta, tb] = [tb, ta];
    t0 = Math.max(t0, ta);
    t1 = Math.min(t1, tb);
    if (t0 > t1) return null;
  }
  return t0;
}
