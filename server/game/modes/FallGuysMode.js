// Fall Guys (modo Pro): torneo de 10 rondas, una por recorrido. En cada ronda hay que llegar a la
// meta; se clasifica el 60 % de los que siguen en pie (los que caen o llegan los últimos quedan
// eliminados). Gana el último en pie, o el que más puntos tenga al acabar las 10 rondas.
// Se juega contra bots o se rellena con jugadores reales (lo elige quien empieza la partida).
import { BaseMode } from './BaseMode.js';
import * as users from '../../services/users.js';
import { mulberry32 } from '../../../shared/terrain.js';
import { randomAvatar } from '../../../shared/avatar.js';

const ROUNDS = 10;
const MIN_PLAYERS = 4;
const MAX_PLAYERS = 12;
const GATHER_MS = 60000;
const COUNTDOWN_MS = 5000;
const ROUND_LIMIT_MS = 110000;
const RESULTS_MS = 6000;
const POINTS = [12, 10, 8, 6, 5, 4, 3, 2, 1, 0, 0, 0];
const BOT_NAMES = ['Ana', 'Leo', 'Iris', 'Max', 'Nico', 'Vega', 'Rui', 'Lola', 'Tom', 'Uma', 'Kai', 'Bea'];
const LANE = 3.2;
const BOT_SPEED = [6.2, 7.6];
const L = 150;

export class FallGuysMode extends BaseMode {
  constructor(room) {
    super(room);
    this.courses = this.world.meta.courses;
    this.cps = {};
    this.finish = {};
    for (const o of this.world.objects) {
      const key = String(o.id || '').split('_')[0];
      if (o.t === 'checkpoint') (this.cps[key] ||= []).push(o);
      if (o.t === 'finish') this.finish[key] = o;
    }
    for (const list of Object.values(this.cps)) list.sort((a, b) => a.n - b.n);
    this.rng = mulberry32(Date.now() % 100000);
    this.phase = 'lobby';
    this.fill = 'bots';
    this.gatherAt = 0;
    this.startAt = 0;
    this.roundAt = 0;
    this.resultsAt = 0;
    this.round = -1;
    this.order = [];
    this.racers = new Map(); // id -> { id, name, bot, alive, points, cp, s, finishAt, fell, pos, ry, anim, lane, avatar }
    this.winner = null;
    this.lastSync = 0;
    this.seq = 0;
  }

  // --- Estado público -------------------------------------------------------------------------------
  course() {
    return this.round >= 0 && this.round < this.order.length ? this.courses[this.order[this.round]] : null;
  }

  alive() {
    return [...this.racers.values()].filter((r) => r.alive);
  }

  publicState() {
    const c = this.course();
    return {
      phase: this.phase, round: this.round + 1, rounds: ROUNDS, course: c ? c.name : null, fill: this.fill,
      startAt: this.startAt, roundAt: this.roundAt, limitMs: ROUND_LIMIT_MS, gatherAt: this.gatherAt, gatherMs: GATHER_MS,
      total: this.racers.size, alive: this.alive().length, winner: this.winner,
      standings: [...this.racers.values()].map((r) => ({ id: r.id, name: r.name, bot: r.bot, alive: r.alive, points: r.points, fell: r.fell })).sort((a, b) => b.points - a.points || Number(b.alive) - Number(a.alive)),
    };
  }

  sync() {
    this.lastSync = Date.now();
    this.broadcast('fg', this.publicState());
  }

  spectatorState() {
    return { fg: this.publicState() };
  }

  // --- Jugadores -----------------------------------------------------------------------------------
  onJoin(p) {
    const late = this.phase === 'round' || this.phase === 'results' || this.phase === 'final';
    const r = { id: p.id, name: p.name, bot: false, alive: !late, points: 0, cp: 0, s: 0, finishAt: 0, fell: false, pos: null, ry: 0, anim: 'idle', lane: 0 };
    this.racers.set(p.id, r);
    if (this.phase === 'round') this.placeRacer(r, this.alive().length);
    this.sync();
    return { fg: this.publicState() };
  }

  onLeave(p) {
    this.racers.delete(p.id);
    this.checkRoundEnd();
    this.sync();
  }

  onEvent(p, name, data = {}) {
    if (name === 'start') {
      if (this.phase !== 'lobby') return { error: 'Ya hay una partida en curso' };
      this.fill = data.fill === 'real' ? 'real' : 'bots';
      this.phase = 'gather';
      this.gatherAt = Date.now();
      this.room.systemMessage(this.fill === 'real' ? '🪂 Esperando jugadores reales (hasta 60 s); luego se rellena con bots' : '🪂 Fall Guys empieza: se juega contra bots');
      this.sync();
      return { ok: true };
    }
    return { error: 'Evento no soportado' };
  }

  // --- Bots ------------------------------------------------------------------------------------------
  addBots(count) {
    for (let i = 0; i < count; i++) {
      const id = `fgb-${Date.now().toString(36)}-${this.seq++}`;
      const name = BOT_NAMES[(this.seq + i) % BOT_NAMES.length];
      this.racers.set(id, { id, name, bot: true, alive: true, points: 0, cp: 0, s: 0, finishAt: 0, fell: false, pos: [...this.courses[0].start], ry: 0, anim: 'idle', lane: 0, avatar: randomAvatar(mulberry32(this.seq * 53 + i)), speed: BOT_SPEED[0] + this.rng() * (BOT_SPEED[1] - BOT_SPEED[0]), fallAt: 0 });
      this.broadcast('player:join', this.botPublic(this.racers.get(id)));
    }
  }

  botPublic(b) {
    return { id: b.id, name: b.name, title: 'Bot', level: 'Bot', bot: true, avatar: b.avatar, p: b.pos, ry: b.ry, a: b.anim };
  }

  publicPlayers() {
    return [...this.racers.values()].filter((r) => r.bot && r.alive).map((b) => this.botPublic(b));
  }

  snapPlayers() {
    return [...this.racers.values()].filter((r) => r.bot && r.alive && r.pos).map((b) => ({ id: b.id, p: b.pos.map((v) => Math.round(v * 100) / 100), ry: Math.round(b.ry * 100) / 100, a: b.anim }));
  }

  removeBots() {
    for (const r of [...this.racers.values()]) {
      if (!r.bot) continue;
      this.racers.delete(r.id);
      this.broadcast('player:leave', { id: r.id });
    }
  }

  // --- Ciclo de la partida ----------------------------------------------------------------------------
  tick(dt) {
    const now = Date.now();
    if (this.phase === 'gather') {
      const real = [...this.racers.values()].filter((r) => !r.bot).length;
      const full = real >= MAX_PLAYERS;
      if (this.fill === 'bots' || full || now - this.gatherAt > GATHER_MS) {
        const need = Math.max(0, Math.max(MIN_PLAYERS, Math.min(MAX_PLAYERS, real + (this.fill === 'bots' ? 8 : 0))) - real);
        this.addBots(need);
        this.beginCountdown();
      }
    } else if (this.phase === 'countdown' && now >= this.startAt) {
      this.beginRound(now);
    } else if (this.phase === 'round') {
      this.moveBots(dt, now);
      this.checkRoundEnd(now);
    } else if (this.phase === 'results' && now - this.resultsAt > RESULTS_MS) {
      this.round++;
      if (this.round >= ROUNDS || this.alive().length <= 1) this.finishTournament();
      else this.beginCountdown();
    } else if (this.phase === 'final' && now - this.resultsAt > RESULTS_MS * 2) {
      this.resetLobby();
    }
    if (now - this.lastSync > 1000) this.sync();
  }

  beginCountdown() {
    if (this.round < 0) {
      this.order = COURSE_ORDER(this.courses.length, this.rng);
      this.round = 0;
    }
    this.phase = 'countdown';
    this.startAt = Date.now() + COUNTDOWN_MS;
    this.sync();
  }

  beginRound(now) {
    const c = this.course();
    this.phase = 'round';
    this.roundAt = now;
    let i = 0;
    for (const r of this.alive()) {
      r.cp = 0; r.s = 0; r.finishAt = 0; r.fell = false;
      r.anim = 'idle';
      this.placeRacer(r, i++);
      if (r.bot) r.fallAt = this.rng() < 0.05 * c.diff ? L * (0.25 + this.rng() * 0.6) : 0;
    }
    this.room.systemMessage(`🏁 Ronda ${this.round + 1}/${ROUNDS}: ${c.name}`);
    this.sync();
  }

  placeRacer(r, lane) {
    const c = this.course();
    if (!c) return;
    const x = c.ox + ((lane % 4) - 1.5) * LANE;
    const z = 6 - Math.floor(lane / 4) * 3;
    const pos = [x, 1.2, z];
    r.lane = lane;
    if (r.bot) { r.pos = pos; r.ry = Math.PI; }
    else {
      const p = this.room.players.get(r.id);
      if (p) {
        this.room.teleport(p, pos);
        this.emit(p, 'respawn', { p: pos });
      }
    }
  }

  moveBots(dt, now) {
    for (const r of this.alive()) {
      if (!r.bot || r.finishAt || r.fell) continue;
      r.s += r.speed * (1 / this.course().diff) * (0.9 + 0.2 * this.rng()) * dt;
      if (r.fallAt && r.s >= r.fallAt) { r.fell = true; r.alive = false; r.anim = 'dead'; this.broadcast('player:leave', { id: r.id }); this.room.systemMessage(`💀 ${r.name} ha caído`); continue; }
      if (r.s >= L - 6) { r.finishAt = now; r.s = L - 6; }
      const c = this.course();
      r.pos = [c.ox + Math.sin(r.s * 0.2 + r.lane) * 0.8, 1.2 + (r.s > 0 ? 0 : 0), -r.s - 6];
      r.anim = r.finishAt ? 'cheer' : 'run';
      r.ry = Math.PI;
    }
  }

  // --- Jugadores reales en la ronda ------------------------------------------------------------------
  onState(p) {
    if (this.phase !== 'round') return;
    const r = this.racers.get(p.id);
    if (!r || r.bot || !r.alive || r.finishAt) return;
    const key = this.course().key;
    const list = this.cps[key] || [];
    const next = list[r.cp];
    if (next && this.inside(p, next)) { r.cp++; return; }
    const fin = this.finish[key];
    if (fin && r.cp >= list.length && this.inside(p, fin)) {
      r.finishAt = Date.now();
      this.room.systemMessage(`🏁 ${p.name} llega a la meta`);
      this.checkRoundEnd();
      this.sync();
    }
  }

  getRespawn(p) {
    const r = this.racers.get(p.id);
    const c = this.course();
    if (!r || !c) return null;
    const list = this.cps[c.key] || [];
    const cp = list[r.cp - 1];
    if (cp) return [cp.p[0], cp.p[1] + cp.s[1] / 2 + 0.2, cp.p[2]];
    return [c.start[0], c.start[1], c.start[2]];
  }

  checkRoundEnd(now = Date.now()) {
    if (this.phase !== 'round') return;
    const live = this.alive();
    const unfinished = live.filter((r) => !r.finishAt);
    if (unfinished.length === 0 || now - this.roundAt > ROUND_LIMIT_MS) this.endRound();
  }

  endRound() {
    const live = this.alive();
    const ranked = live.slice().sort((a, b) => {
      if (a.finishAt && b.finishAt) return a.finishAt - b.finishAt;
      if (a.finishAt) return -1;
      if (b.finishAt) return 1;
      return b.s - a.s;
    });
    ranked.forEach((r, i) => { if (r.finishAt) r.points += POINTS[i] ?? 0; });
    const keep = Math.max(1, Math.ceil(ranked.length * 0.6));
    ranked.forEach((r, i) => {
      if (i >= keep) this.eliminate(r);
    });
    this.phase = 'results';
    this.resultsAt = Date.now();
    this.sync();
  }

  eliminate(r) {
    r.alive = false;
    r.anim = 'dead';
    if (r.bot) { this.broadcast('player:leave', { id: r.id }); return; }
    const p = this.room.players.get(r.id);
    if (p) {
      this.room.systemMessage(`💀 ${p.name} queda eliminado`);
      this.emit(p, 'fg:out', { round: this.round + 1 });
    }
  }

  finishTournament() {
    const live = this.alive();
    const top = [...this.racers.values()].sort((a, b) => b.points - a.points || (live.includes(b) - live.includes(a)))[0] || null;
    this.winner = top ? top.name : null;
    this.phase = 'final';
    this.resultsAt = Date.now();
    this.rewardAll(top);
    this.room.systemMessage(top ? `👑 ¡${top.name} gana Fall Guys!` : 'La partida ha terminado sin ganador');
    this.sync();
  }

  rewardAll(top) {
    for (const r of this.racers.values()) {
      if (r.bot) continue;
      const p = this.room.players.get(r.id);
      const win = top && top.id === r.id;
      const coins = users.dailyCapped(r.id, 'fallguys', win ? 60 : 12, 150);
      users.award(r.id, { xp: win ? 250 : 60, coins, reason: win ? '¡Campeón de Fall Guys!' : 'Fall Guys' });
      users.updateStats(r.id, (s) => { s.fallGames = (s.fallGames || 0) + 1; if (win) s.fallWins = (s.fallWins || 0) + 1; });
      if (win) users.unlockAchievement(r.id, 'fall_win');
      if (p) users.setHistoryResult(p.historyId, win ? '🏆 Campeón de Fall Guys' : `Ronda ${this.round + 1} de ${ROUNDS}`);
    }
  }

  resetLobby() {
    this.removeBots();
    this.phase = 'lobby';
    this.round = -1;
    this.order = [];
    this.winner = null;
    for (const r of this.racers.values()) { r.alive = true; r.points = 0; r.fell = false; r.finishAt = 0; }
    this.sync();
  }
}

/** Orden de los recorridos en la partida: aleatorio, pero los 10 se juegan siempre. */
function COURSE_ORDER(n, rng) {
  const a = Array.from({ length: n }, (_, i) => i);
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(rng() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a.slice(0, ROUNDS);
}
