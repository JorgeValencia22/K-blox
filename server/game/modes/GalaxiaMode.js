// Guerra Galáctica: sables de plasma y blásters. Tres actividades en el mismo mapa:
//  - Duelo 1v1 en la arena (contra otro jugador o contra Lord Vex). Caerse de la arena = perder.
//  - Historia cooperativa: oleadas de droides que asaltan la base y, al final, Lord Vex.
//  - Misión «Destruye la Estación Oscura»: se vuela en el cliente; aquí se valida y se premia.
// Todo el combate se resuelve en el servidor (golpes de sable, disparos, bloqueos y desvíos).
import { BaseMode } from './BaseMode.js';
import { rayCylinder, rayBox } from './RoyaleMode.js';
import * as users from '../../services/users.js';
import { mulberry32 } from '../../../shared/terrain.js';
import { DEFAULT_AVATAR } from '../../../shared/avatar.js';
import { GX } from '../../../shared/worlds/galaxia.js';

export const GX_RULES = {
  hp: 100,
  saber: { dmg: 20, cd: 420, reach: 3.4 },
  blaster: { dmg: 12, cd: 260, range: 90 },
  push: { dmg: 8, cd: 6000, reach: 7.5 },
  duelTime: 120000,
  downTime: 6000,
  starMinMs: 40000,
};
const SABER_COLORS = ['#29b6f6', '#00e676', '#d500f9', '#ffea00'];
const WAVES = [{ droid: 4, heavy: 0 }, { droid: 6, heavy: 1 }, { droid: 6, heavy: 2 }];
const BOT = {
  droid: { name: 'Droide B-1', hp: 30, speed: 4.6, weapon: 'blaster', costume: 'skin_droid', cd: [1300, 2200], acc: 0.45, dmg: 9 },
  heavy: { name: 'Droide Pesado', hp: 90, speed: 3.4, weapon: 'blaster', costume: 'skin_robot', cd: [650, 900], acc: 0.35, dmg: 8 },
  vex: { name: 'Lord Vex', hp: 180, speed: 6.2, weapon: 'saber', costume: 'skin_darklord', dmg: 14 },
};
const r2 = (v) => Math.round(v * 100) / 100;

export class GalaxiaMode extends BaseMode {
  constructor(room) {
    super(room);
    this.rng = mulberry32(Date.now() % 100000);
    this.solids = (this.world.objects || []).filter((o) => ['block', 'cylinder', 'wedge', 'deco'].includes(o.t) && !o.nc);
    this.fighters = new Map(); // jugadores y bots
    this.bots = new Map();
    this.botSeq = 1;
    this.duel = { phase: 'idle', a: null, b: null, startAt: 0, endAt: 0, queue: [] };
    this.story = { phase: 'idle', wave: 0, nextAt: 0, members: new Set() };
    this.starts = new Map(); // inicio de la misión de la estación por jugador
  }

  // --- Estado público ------------------------------------------------------------------------
  publicState() {
    const d = this.duel, s = this.story;
    const name = (id) => this.fighters.get(id)?.name || null;
    return {
      duel: { phase: d.phase, a: d.a, b: d.b, an: name(d.a), bn: name(d.b), startAt: d.startAt, endAt: d.endAt, queue: d.queue.length },
      story: { phase: s.phase, wave: s.wave, waves: WAVES.length, nextAt: s.nextAt, members: [...s.members], left: this.enemiesLeft() },
    };
  }

  sync() { this.broadcast('gx', this.publicState()); }

  weapons() {
    const out = {};
    for (const f of this.fighters.values()) out[f.id] = { w: f.weapon, c: f.color };
    return out;
  }

  me(f) { return { hp: Math.max(0, Math.round(f.hp)), max: f.max, weapon: f.weapon, color: f.color, ctx: f.ctx, alive: f.alive }; }
  sendMe(p) { const f = this.fighters.get(p.id); if (f) this.emit(p, 'gx:me', this.me(f)); }

  onJoin(p) {
    const f = { id: p.id, name: p.name, bot: false, team: 'hero', hp: GX_RULES.hp, max: GX_RULES.hp, weapon: 'saber', color: SABER_COLORS[this.fighters.size % SABER_COLORS.length], ctx: null, alive: true, block: false, nextAtk: 0, nextShot: 0, nextPush: 0, kills: 0 };
    this.fighters.set(p.id, f);
    this.broadcast('gx:weapon', { id: p.id, w: f.weapon, c: f.color });
    return { gx: this.publicState(), weapons: this.weapons(), me: this.me(f), rules: GX_RULES };
  }

  onLeave(p) {
    const d = this.duel;
    d.queue = d.queue.filter((id) => id !== p.id);
    if ((d.a === p.id || d.b === p.id) && d.phase !== 'idle' && d.phase !== 'end') this.endDuel(d.a === p.id ? d.b : d.a, 'abandonó');
    this.story.members.delete(p.id);
    this.fighters.delete(p.id);
    this.starts.delete(p.id);
    if (this.story.phase !== 'idle' && this.story.phase !== 'done' && !this.story.members.size) this.endStory(false, 'No queda nadie defendiendo la base');
    this.sync();
  }

  spectatorState() { return { gx: this.publicState(), weapons: this.weapons(), rules: GX_RULES }; }

  adminLose(p) {
    const f = this.fighters.get(p.id);
    if (!f || !f.ctx) return false;
    this.damage(f, 9999, null);
    return true;
  }

  // --- Bots (lista para el cliente) --------------------------------------------------------------
  botPublic(b) { return { id: b.id, name: b.name, title: 'Imperio', level: 'Bot', bot: true, avatar: b.avatar, p: b.pos, ry: b.ry, a: b.anim }; }
  publicPlayers() { return [...this.bots.values()].filter((b) => b.alive).map((b) => this.botPublic(b)); }
  snapPlayers() {
    const out = [];
    for (const b of this.bots.values()) if (b.alive) out.push({ id: b.id, p: b.pos.map(r2), ry: r2(b.ry), a: b.anim });
    return out;
  }

  spawnBot(kind, pos, ctx, hpScale = 1) {
    const k = BOT[kind];
    const id = `gxb-${Date.now().toString(36)}-${this.botSeq++}`;
    const b = {
      id, kind, name: k.name, bot: true, team: 'empire', hp: k.hp * hpScale, max: k.hp * hpScale, weapon: k.weapon, color: '#ff1744', ctx, alive: true,
      block: false, pos: [...pos], ry: 0, anim: 'idle', avatar: { ...DEFAULT_AVATAR, costume: k.costume }, nextAtk: Date.now() + 1500, nextShot: Date.now() + 1800 + this.rng() * 1500,
      offset: this.rng() * 10, nextPush: Date.now() + 7000, nextDash: Date.now() + 4000, dashUntil: 0, attackUntil: 0, blockUntil: 0, nextBlock: 0, kills: 0,
    };
    this.fighters.set(id, b);
    this.bots.set(id, b);
    this.broadcast('gx:weapon', { id, w: b.weapon, c: b.color });
    this.broadcast('player:join', this.botPublic(b));
    return b;
  }

  removeBot(b) {
    if (!this.bots.has(b.id)) return;
    this.bots.delete(b.id);
    this.fighters.delete(b.id);
    this.broadcast('player:leave', { id: b.id });
  }

  // --- Eventos de los jugadores -------------------------------------------------------------------
  onEvent(p, name, data = {}) {
    const f = this.fighters.get(p.id);
    if (!f) return { error: 'No estás en la partida' };
    switch (name) {
      case 'weapon': {
        if (!['saber', 'blaster'].includes(data.w)) return { error: 'Arma desconocida' };
        f.weapon = data.w;
        if (Number.isInteger(data.c) && SABER_COLORS[data.c]) f.color = SABER_COLORS[data.c];
        f.block = false;
        this.broadcast('gx:weapon', { id: f.id, w: f.weapon, c: f.color });
        this.sendMe(p);
        return { ok: true };
      }
      case 'block':
        f.block = !!data.on && f.weapon === 'saber';
        this.broadcast('gx:block', { id: f.id, on: f.block });
        return { ok: true };
      case 'swing': return this.swing(f, p.pos, data.d);
      case 'shoot': return this.shoot(f, [p.pos[0], p.pos[1] + 1.5, p.pos[2]], data.d);
      case 'push': return this.push(f, p.pos, data.d);
      case 'duel': return this.joinDuel(p, f, data.vs === 'player' ? 'player' : 'bot');
      case 'duelCancel':
        this.duel.queue = this.duel.queue.filter((id) => id !== p.id);
        this.sync();
        return { ok: true };
      case 'story': return this.startStory(p);
      case 'starStart':
        this.starts.set(p.id, Date.now());
        return { ok: true };
      case 'starDone': return this.starDone(p);
      default: return { error: 'Evento no soportado' };
    }
  }

  hostile(a, b) {
    if (a === b || !a.alive || !b.alive || !a.ctx || a.ctx !== b.ctx) return false;
    if (a.ctx === 'duel') return true;
    return a.team !== b.team;
  }

  posOf(f) { return f.bot ? f.pos : this.room.players.get(f.id)?.pos || null; }

  /** Hacia dónde mira un combatiente (vector XZ). */
  facing(f) {
    const ry = f.bot ? f.ry : this.room.players.get(f.id)?.ry || 0;
    return [Math.sin(ry), Math.cos(ry)];
  }

  /** ¿Para el golpe/disparo que viene de `from`? (bloqueando con el sable y mirando hacia él) */
  guards(t, from) {
    if (!t.block || t.weapon !== 'saber') return false;
    const tp = this.posOf(t);
    if (!tp || !from) return true;
    const dx = from[0] - tp[0], dz = from[2] - tp[2], l = Math.hypot(dx, dz) || 1;
    const [fx, fz] = this.facing(t);
    return (dx * fx + dz * fz) / l > -0.2;
  }

  swing(f, pos, dir) {
    const now = Date.now();
    if (f.weapon !== 'saber' || !f.alive) return { error: 'Necesitas el sable' };
    if (now < f.nextAtk) return { error: 'cadencia' };
    f.nextAtk = now + GX_RULES.saber.cd;
    const d = normXZ(dir) || this.facing(f);
    const hits = [];
    for (const t of this.fighters.values()) {
      if (!this.hostile(f, t)) continue;
      const tp = this.posOf(t);
      if (!tp) continue;
      const dx = tp[0] - pos[0], dz = tp[2] - pos[2], dist = Math.hypot(dx, dz);
      if (dist > GX_RULES.saber.reach || Math.abs(tp[1] - pos[1]) > 2.2) continue;
      if (dist > 0.6 && (dx * d[0] + dz * d[1]) / dist < 0.3) continue;
      if (this.guards(t, pos)) {
        this.broadcast('gx:clash', { p: [r2((pos[0] + tp[0]) / 2), r2(pos[1] + 1.4), r2((pos[2] + tp[2]) / 2)] });
        hits.push({ id: t.id, blocked: true });
        continue;
      }
      hits.push({ id: t.id, dmg: GX_RULES.saber.dmg });
      this.damage(t, GX_RULES.saber.dmg, f);
    }
    this.broadcast('gx:swing', { id: f.id });
    return { ok: true, hits };
  }

  shoot(f, origin, dir, dmg = GX_RULES.blaster.dmg) {
    const now = Date.now();
    if (!f.alive) return { error: 'Estás fuera de combate' };
    if (!f.bot) {
      if (f.weapon !== 'blaster') return { error: 'Necesitas el bláster' };
      if (now < f.nextShot) return { error: 'cadencia' };
      f.nextShot = now + GX_RULES.blaster.cd;
    }
    if (!Array.isArray(dir) || dir.length !== 3 || !dir.every(Number.isFinite)) return { error: 'Dirección inválida' };
    const l = Math.hypot(...dir) || 1;
    const d = dir.map((v) => v / l);
    const r = this.trace(f, origin, d, GX_RULES.blaster.range);
    const color = f.team === 'empire' ? '#ff1744' : '#40c4ff';
    const shot = { from: f.id, o: origin.map(r2), e: r.point.map(r2), c: color };
    if (r.target && this.guards(r.target, origin)) {
      // ¡Desviado con el sable! El disparo rebota hacia quien lo lanzó
      shot.deflect = true;
      this.broadcast('gx:shot', shot);
      const back = [origin[0] - r.point[0], origin[1] - r.point[1], origin[2] - r.point[2]];
      if (this.rng() < 0.55) {
        this.broadcast('gx:shot', { from: r.target.id, o: r.point.map(r2), e: [origin[0], origin[1] - 0.3, origin[2]].map(r2), c: '#ffffff' });
        this.damage(f, dmg, r.target);
      } else {
        const miss = back.map((v, i) => origin[i] + (this.rng() - 0.5) * 6 + (i === 1 ? 2 : 0));
        this.broadcast('gx:shot', { from: r.target.id, o: r.point.map(r2), e: miss.map(r2), c: '#ffffff' });
      }
      return { ok: true, hits: [{ id: r.target.id, blocked: true }] };
    }
    this.broadcast('gx:shot', shot);
    if (r.target) {
      this.damage(r.target, dmg, f);
      return { ok: true, hits: [{ id: r.target.id, dmg }] };
    }
    return { ok: true, hits: [] };
  }

  trace(f, o, d, range) {
    let best = range, target = null;
    for (const t of this.fighters.values()) {
      if (!this.hostile(f, t)) continue;
      const pos = this.posOf(t);
      if (!pos) continue;
      const tt = rayCylinder(o, d, pos, 0.55, 2.0);
      if (tt != null && tt < best) { best = tt; target = t; }
    }
    for (const ob of this.solids) {
      if (Math.hypot(ob.p[0] - o[0], ob.p[2] - o[2]) > best + 20) continue;
      const tt = rayBox(o, d, ob, best);
      if (tt != null && tt < best) { best = tt; target = null; }
    }
    if (d[1] < 0) { const tg = -o[1] / d[1]; if (tg < best) { best = tg; target = null; } }
    return { target, point: [o[0] + d[0] * best, o[1] + d[1] * best, o[2] + d[2] * best] };
  }

  push(f, pos, dir) {
    const now = Date.now();
    if (!f.alive) return { error: 'Estás fuera de combate' };
    if (now < f.nextPush) return { error: `Onda lista en ${Math.ceil((f.nextPush - now) / 1000)} s` };
    f.nextPush = now + GX_RULES.push.cd;
    const d = normXZ(dir) || this.facing(f);
    let n = 0;
    for (const t of this.fighters.values()) {
      if (!this.hostile(f, t)) continue;
      const tp = this.posOf(t);
      if (!tp) continue;
      const dx = tp[0] - pos[0], dz = tp[2] - pos[2], dist = Math.hypot(dx, dz);
      if (dist > GX_RULES.push.reach || (dist > 0.5 && (dx * d[0] + dz * d[1]) / dist < 0.2)) continue;
      const nx = dist ? dx / dist : d[0], nz = dist ? dz / dist : d[1];
      this.knock(t, nx, nz, 1);
      this.damage(t, GX_RULES.push.dmg, f);
      n++;
    }
    this.broadcast('gx:push', { id: f.id, p: [r2(pos[0]), r2(pos[1] + 1), r2(pos[2])], d: [r2(d[0]), r2(d[1])] });
    return { ok: true, n };
  }

  knock(t, nx, nz, power) {
    if (t.bot) {
      t.pos[0] += nx * 6 * power;
      t.pos[2] += nz * 6 * power;
      t.stunUntil = Date.now() + 700;
    } else {
      const p = this.room.players.get(t.id);
      if (p) this.emit(p, 'gx:knock', { v: [r2(nx * 9 * power), 7 * power, r2(nz * 9 * power)] });
    }
  }

  damage(t, dmg, by) {
    if (!t.alive) return;
    t.hp -= dmg;
    if (!t.bot) {
      const p = this.room.players.get(t.id);
      if (p) { this.emit(p, 'gx:hurt', { by: by?.name || null }); this.sendMe(p); }
    } else this.broadcast('gx:hit', { id: t.id, hp: Math.max(0, Math.round(t.hp)), max: t.max });
    if (t.hp <= 0) this.defeat(t, by);
  }

  defeat(t, by) {
    t.alive = false;
    t.hp = 0;
    if (by && by !== t) by.kills++;
    this.broadcast('gx:feed', { vid: t.id, victim: t.name, killer: by?.name || null });
    if (t.ctx === 'duel') return this.endDuel(by?.id || (this.duel.a === t.id ? this.duel.b : this.duel.a), 'derrotó a');
    if (t.bot) {
      this.removeBot(t);
      if (by && !by.bot) users.updateStats(by.id, (s) => { s.gxKills = (s.gxKills || 0) + 1; });
      this.sync();
      return;
    }
    // Jugador derribado en la Historia: vuelve a la base en unos segundos
    const p = this.room.players.get(t.id);
    t.downUntil = Date.now() + GX_RULES.downTime;
    if (p) {
      this.emit(p, 'gx:down', { ms: GX_RULES.downTime });
      this.sendMe(p);
    }
    const anyUp = [...this.story.members].some((id) => this.fighters.get(id)?.alive);
    if (!anyUp) this.endStory(false, 'Los droides han tomado la base');
  }

  // --- Duelo 1v1 ---------------------------------------------------------------------------------
  joinDuel(p, f, vs) {
    const d = this.duel;
    if (f.ctx === 'story') return { error: 'Estás en la Historia' };
    if (d.a === p.id || d.b === p.id) return { error: 'Ya estás en el duelo' };
    if (d.phase !== 'idle') return { error: 'La arena está ocupada: ¡mira el duelo y espera tu turno!' };
    if (vs === 'bot') {
      const vex = this.spawnBot('vex', GX.arena.b, 'duel');
      this.startDuel(f, vex);
      return { ok: true };
    }
    d.queue = d.queue.filter((id) => id !== p.id && this.fighters.has(id));
    const other = d.queue.shift();
    if (other) {
      this.startDuel(this.fighters.get(other), f);
      return { ok: true };
    }
    d.queue.push(p.id);
    this.sync();
    return { ok: true, waiting: true };
  }

  startDuel(a, b) {
    const d = this.duel;
    d.phase = 'countdown';
    d.a = a.id;
    d.b = b.id;
    d.startAt = Date.now() + 4000;
    d.endAt = d.startAt + GX_RULES.duelTime;
    for (const [f, spot] of [[a, GX.arena.a], [b, GX.arena.b]]) {
      f.ctx = 'duel';
      f.hp = f.max;
      f.alive = true;
      f.block = false;
      if (f.bot) { f.pos = [...spot]; f.ry = -Math.PI / 2; }
      else {
        if (f.weapon !== 'saber') { f.weapon = 'saber'; this.broadcast('gx:weapon', { id: f.id, w: 'saber', c: f.color }); }
        const p = this.room.players.get(f.id);
        if (p) { this.room.teleport(p, spot); this.emit(p, 'respawn', { p: spot }); this.sendMe(p); }
      }
    }
    this.room.systemMessage(`⚔️ ¡DUELO! ${a.name} contra ${b.name}`);
    this.sync();
  }

  endDuel(winnerId, how) {
    const d = this.duel;
    if (d.phase === 'idle' || d.phase === 'end') return;
    const w = this.fighters.get(winnerId);
    const loserId = winnerId === d.a ? d.b : d.a;
    const l = this.fighters.get(loserId);
    d.phase = 'end';
    d.winner = w?.name || null;
    d.resetAt = Date.now() + 5000;
    this.room.systemMessage(w ? `🏆 ${w.name} ${how} ${l?.name || 'su rival'} en la arena` : 'El duelo terminó sin ganador');
    this.broadcast('gx:duelEnd', { winner: w?.name || null, winnerId, loser: l?.name || null });
    if (w && !w.bot) {
      users.award(w.id, { xp: l?.bot ? 180 : 140, coins: 0, reason: '¡Duelo ganado!' });
      users.updateStats(w.id, (s) => { s.gxDuels = (s.gxDuels || 0) + 1; s.wins = (s.wins || 0) + 1; });
      users.unlockAchievement(w.id, 'gx_duel');
      users.unlockItem(w.id, 'skin_droid', 'Guerra Galáctica');
      const p = this.room.players.get(w.id);
      if (p) users.setHistoryResult(p.historyId, 'Duelo ganado');
    }
    if (l && !l.bot) {
      users.award(l.id, { xp: 40, coins: 0, reason: 'Duelo' });
      const p = this.room.players.get(l.id);
      if (p) users.setHistoryResult(p.historyId, 'Duelo perdido');
    }
    this.sync();
  }

  resetDuel() {
    const d = this.duel;
    for (const id of [d.a, d.b]) {
      const f = this.fighters.get(id);
      if (!f) continue;
      if (f.bot) { this.removeBot(f); continue; }
      f.ctx = null;
      f.hp = f.max;
      f.alive = true;
      const p = this.room.players.get(id);
      if (p) {
        const pos = [GX.terminals.duel[0] - 4, 0.4, GX.terminals.duel[2]];
        this.room.teleport(p, pos);
        this.emit(p, 'respawn', { p: pos });
        this.sendMe(p);
      }
    }
    Object.assign(d, { phase: 'idle', a: null, b: null, startAt: 0, endAt: 0, winner: null });
    // Siguiente pareja de la cola
    d.queue = d.queue.filter((id) => this.fighters.has(id));
    if (d.queue.length >= 2) this.startDuel(this.fighters.get(d.queue.shift()), this.fighters.get(d.queue.shift()));
    this.sync();
  }

  // --- Historia ------------------------------------------------------------------------------------
  startStory(p) {
    const s = this.story;
    const f = this.fighters.get(p.id);
    if (f?.ctx === 'duel') return { error: 'Termina antes tu duelo' };
    if (s.phase !== 'idle') {
      if (s.phase === 'done' || s.phase === 'fail') return { error: 'Espera unos segundos' };
      // Unirse a la partida en curso
      this.enlist(p, s.members.size);
      this.sync();
      return { ok: true, joined: true };
    }
    s.phase = 'intro';
    s.wave = 0;
    s.members = new Set();
    s.nextAt = Date.now() + 7000;
    let i = 0;
    for (const q of this.room.players.values()) {
      const g = this.fighters.get(q.id);
      if (g && g.ctx !== 'duel') this.enlist(q, i++);
    }
    this.room.systemMessage('📖 Capítulo 1: ¡Los droides del Imperio atacan la base! Defended la puerta oeste.');
    this.broadcast('gx:story', { text: 'CAPÍTULO 1', sub: 'Defiende la base rebelde' });
    this.sync();
    return { ok: true };
  }

  enlist(p, i) {
    const f = this.fighters.get(p.id);
    if (!f) return;
    f.ctx = 'story';
    f.hp = f.max;
    f.alive = true;
    this.story.members.add(p.id);
    const pos = [GX.field.gate[0] + 4, 0.4, (i % 6) * 2.5 - 6];
    this.room.teleport(p, pos);
    this.emit(p, 'respawn', { p: pos });
    this.sendMe(p);
  }

  enemiesLeft() {
    let n = 0;
    for (const b of this.bots.values()) if (b.ctx === 'story' && b.alive) n++;
    return n;
  }

  spawnWave() {
    const s = this.story;
    const scale = 1 + Math.max(0, s.members.size - 1) * 0.35;
    const drops = GX.field.drops;
    let k = 0;
    if (s.wave < WAVES.length) {
      const w = WAVES[s.wave];
      const n = Math.round(w.droid * Math.min(2, scale));
      for (let i = 0; i < n; i++) this.spawnBot('droid', jitter(drops[k++ % drops.length], this.rng), 'story');
      for (let i = 0; i < w.heavy; i++) this.spawnBot('heavy', jitter(drops[k++ % drops.length], this.rng), 'story', scale);
      this.broadcast('gx:story', { text: `OLEADA ${s.wave + 1}`, sub: w.heavy ? `${n} droides y ${w.heavy} droide${w.heavy > 1 ? 's' : ''} pesado${w.heavy > 1 ? 's' : ''}` : `${n} droides de combate` });
    } else {
      this.spawnBot('vex', [-118, 0, 0], 'story', 1.4 * scale);
      for (let i = 0; i < 3; i++) this.spawnBot('droid', jitter(drops[i], this.rng), 'story');
      this.broadcast('gx:story', { text: 'LORD VEX', sub: 'Capítulo 2: el señor oscuro ha llegado', boss: true });
      this.room.systemMessage('🔴 ¡Lord Vex ha llegado al campo de batalla!');
    }
    s.phase = 'wave';
    this.sync();
  }

  endStory(win, why) {
    const s = this.story;
    if (s.phase === 'idle' || s.phase === 'done' || s.phase === 'fail') return;
    s.phase = win ? 'done' : 'fail';
    s.nextAt = Date.now() + 8000;
    for (const b of [...this.bots.values()]) if (b.ctx === 'story') this.removeBot(b);
    if (win) {
      this.room.systemMessage('🏆 ¡Lord Vex ha caído! La base rebelde está a salvo.');
      this.broadcast('gx:story', { text: '¡VICTORIA!', sub: 'Siguiente misión: destruye la Estación Oscura desde el hangar', win: true });
      for (const id of s.members) {
        const f = this.fighters.get(id);
        if (!f) continue;
        users.award(id, { xp: 320, coins: 0, reason: '¡Historia completada!' });
        users.updateStats(id, (st) => { st.gxStory = (st.gxStory || 0) + 1; st.wins = (st.wins || 0) + 1; });
        users.unlockAchievement(id, 'gx_story');
        users.unlockItem(id, 'skin_starknight', 'Guerra Galáctica');
        const p = this.room.players.get(id);
        if (p) users.setHistoryResult(p.historyId, `Historia completada · ${f.kills} droides`);
      }
    } else {
      this.room.systemMessage(`💀 ${why}. ¡Inténtalo otra vez desde la mesa de Historia!`);
      this.broadcast('gx:story', { text: 'DERROTA', sub: why, lose: true });
    }
    this.sync();
  }

  resetStory() {
    const s = this.story;
    for (const id of s.members) {
      const f = this.fighters.get(id);
      if (!f) continue;
      f.ctx = null;
      f.hp = f.max;
      f.alive = true;
      f.downUntil = 0;
      const p = this.room.players.get(id);
      if (p) this.sendMe(p);
    }
    Object.assign(s, { phase: 'idle', wave: 0, nextAt: 0, members: new Set() });
    this.sync();
  }

  // --- Misión de la Estación Oscura --------------------------------------------------------------
  starDone(p) {
    const t0 = this.starts.get(p.id);
    if (!t0 || Date.now() - t0 < GX_RULES.starMinMs) return { error: 'Misión no válida' };
    this.starts.delete(p.id);
    users.award(p.id, { xp: 260, coins: 0, reason: '¡Estación Oscura destruida!' });
    users.updateStats(p.id, (s) => { s.gxStar = (s.gxStar || 0) + 1; });
    users.unlockAchievement(p.id, 'gx_star');
    users.unlockItem(p.id, 'skin_darklord', 'Guerra Galáctica');
    users.setHistoryResult(p.historyId, '💥 Estación Oscura destruida');
    this.room.systemMessage(`💥 ¡${p.name} ha destruido la Estación Oscura!`);
    return { ok: true };
  }

  // --- Bucle -------------------------------------------------------------------------------------
  onState(p) {
    // Fuera de la arena = derrota (solo durante el combate)
    const d = this.duel;
    if (d.phase !== 'fight' || (d.a !== p.id && d.b !== p.id)) return;
    const c = GX.arena.c;
    if (Math.hypot(p.pos[0] - c[0], p.pos[2] - c[2]) > GX.arena.r + 1.6 || p.pos[1] < 0.5) {
      const f = this.fighters.get(p.id);
      this.broadcast('gx:feed', { victim: f.name, killer: null, out: true });
      f.alive = false;
      this.endDuel(d.a === p.id ? d.b : d.a, 'sacó de la arena a');
    }
  }

  tick(dt) {
    const now = Date.now();
    const d = this.duel;
    if (d.phase === 'countdown' && now >= d.startAt) { d.phase = 'fight'; this.sync(); }
    else if (d.phase === 'fight' && now >= d.endAt) {
      const a = this.fighters.get(d.a), b = this.fighters.get(d.b);
      this.endDuel(!b || (a && a.hp >= b.hp) ? d.a : d.b, 'ganó a los puntos a');
    } else if (d.phase === 'end' && now >= d.resetAt) this.resetDuel();

    const s = this.story;
    if ((s.phase === 'intro' || s.phase === 'break') && now >= s.nextAt) this.spawnWave();
    else if (s.phase === 'wave' && this.enemiesLeft() === 0) {
      s.wave++;
      if (s.wave > WAVES.length) this.endStory(true);
      else {
        s.phase = 'break';
        s.nextAt = now + 6000;
        this.broadcast('gx:story', { text: '¡OLEADA SUPERADA!', sub: s.wave === WAVES.length ? 'Algo oscuro se acerca…' : 'Recupera el aliento' });
        for (const id of s.members) {
          const f = this.fighters.get(id);
          if (f?.alive) { f.hp = Math.min(f.max, f.hp + 40); const p = this.room.players.get(id); if (p) this.sendMe(p); }
        }
        this.sync();
      }
    } else if ((s.phase === 'done' || s.phase === 'fail') && now >= s.nextAt) this.resetStory();
    // Jugadores derribados que vuelven
    for (const id of s.members) {
      const f = this.fighters.get(id);
      if (f && !f.alive && f.downUntil && now >= f.downUntil && (s.phase === 'wave' || s.phase === 'break')) {
        f.alive = true;
        f.hp = f.max;
        f.downUntil = 0;
        const p = this.room.players.get(id);
        if (p) {
          const pos = [GX.field.gate[0] + 6, 0.4, 0];
          this.room.teleport(p, pos);
          this.emit(p, 'respawn', { p: pos });
          this.sendMe(p);
        }
      }
    }
    for (const b of [...this.bots.values()]) if (b.alive) this.botTick(b, dt, now);
  }

  botTick(b, dt, now) {
    const k = BOT[b.kind];
    const fightOn = b.ctx === 'story' ? this.story.phase === 'wave' : this.duel.phase === 'fight';
    // Objetivo: el enemigo vivo más cercano
    let target = null, td = Infinity, tp = null;
    for (const f of this.fighters.values()) {
      if (!this.hostile(b, f)) continue;
      const pos = this.posOf(f);
      if (!pos) continue;
      const dd = Math.hypot(pos[0] - b.pos[0], pos[2] - b.pos[2]);
      if (dd < td) { td = dd; target = f; tp = pos; }
    }
    if (!target || !fightOn || now < (b.stunUntil || 0)) {
      b.anim = 'idle';
      this.groundBot(b);
      return;
    }
    b.ry = Math.atan2(tp[0] - b.pos[0], tp[2] - b.pos[2]);
    const dx = tp[0] - b.pos[0], dz = tp[2] - b.pos[2];
    const nx = dx / (td || 1), nz = dz / (td || 1);
    let gx = 0, gz = 0, speed = k.speed;
    if (b.kind === 'vex') {
      // Bloquea a ratos, se lanza contra ti, golpea de cerca y usa la onda
      if (now >= b.nextBlock) { b.block = this.rng() < 0.45; b.nextBlock = now + 700 + this.rng() * 900; }
      if (td > 6 && td < 14 && now >= b.nextDash) { b.dashUntil = now + 380; b.nextDash = now + 4500 + this.rng() * 2000; this.broadcast('gx:dash', { id: b.id }); }
      if (now < b.dashUntil) speed = 17;
      if (td > 2.2) { gx = nx; gz = nz; }
      if (td < 3.2 && now >= b.nextAtk) {
        b.nextAtk = now + 900 + this.rng() * 500;
        b.attackUntil = now + 320;
        b.block = false;
        this.broadcast('gx:swing', { id: b.id });
        if (this.guards(target, b.pos)) this.broadcast('gx:clash', { p: [r2((b.pos[0] + tp[0]) / 2), r2(b.pos[1] + 1.4), r2((b.pos[2] + tp[2]) / 2)] });
        else this.damage(target, k.dmg, b);
      }
      if (td < 7 && now >= b.nextPush) {
        b.nextPush = now + 8000 + this.rng() * 3000;
        this.broadcast('gx:push', { id: b.id, p: [r2(b.pos[0]), r2(b.pos[1] + 1), r2(b.pos[2])], d: [r2(nx), r2(nz)] });
        this.knock(target, nx, nz, b.ctx === 'duel' ? 0.8 : 1.1);
        this.damage(target, 6, b);
      }
      b.anim = now < b.attackUntil ? 'attack' : td > 2.2 ? 'run' : 'idle';
    } else {
      // Droides: se acercan hasta media distancia, se mueven de lado y disparan
      const want = b.kind === 'heavy' ? 18 : 13;
      const side = Math.sin(now / 1100 + b.offset) > 0 ? 1 : -1;
      if (td > want) { gx = nx; gz = nz; } else { gx = -nz * side * 0.6; gz = nx * side * 0.6; }
      b.anim = 'run';
      if (now >= b.nextShot && td < 45) {
        b.nextShot = now + k.cd[0] + this.rng() * (k.cd[1] - k.cd[0]);
        const o = [b.pos[0], b.pos[1] + 1.5, b.pos[2]];
        const aim = [tp[0] - o[0], tp[1] + 1.1 - o[1], tp[2] - o[2]];
        if (this.rng() > k.acc * (1 - td / 70)) { aim[0] += (this.rng() - 0.5) * 5; aim[1] += (this.rng() - 0.3) * 2.5; aim[2] += (this.rng() - 0.5) * 5; }
        this.shoot(b, o, aim, k.dmg);
        b.attackUntil = now + 200;
      }
    }
    const l = Math.hypot(gx, gz);
    if (l > 0.01) {
      b.pos[0] += (gx / l) * speed * dt;
      b.pos[2] += (gz / l) * speed * dt;
    }
    this.groundBot(b);
  }

  groundBot(b) {
    if (b.ctx === 'duel') {
      // Lord Vex no se cae de la arena
      const c = GX.arena.c, dx = b.pos[0] - c[0], dz = b.pos[2] - c[2], dd = Math.hypot(dx, dz), max = GX.arena.r - 0.8;
      if (dd > max) { b.pos[0] = c[0] + (dx / dd) * max; b.pos[2] = c[2] + (dz / dd) * max; }
      b.pos[1] = GX.arena.y;
    } else {
      b.pos[0] = Math.max(-150, Math.min(150, b.pos[0]));
      b.pos[2] = Math.max(-145, Math.min(145, b.pos[2]));
      b.pos[1] = 0;
    }
  }
}

function normXZ(d) {
  if (!Array.isArray(d) || d.length < 2) return null;
  const x = Number(d[0]), z = Number(d.length === 3 ? d[2] : d[1]);
  const l = Math.hypot(x, z);
  return Number.isFinite(l) && l > 1e-6 ? [x / l, z / l] : null;
}

const jitter = (p, rng) => [p[0] + (rng() - 0.5) * 10, p[1], p[2] + (rng() - 0.5) * 10];
