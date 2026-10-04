// Kest Rocket: fútbol con coches. El servidor simula el balón (con subpasos) y
// sus choques con los coches de jugadores y bots. Equipos: 0 Azul (defiende +z),
// 1 Naranja (defiende -z).
import { BaseMode } from './BaseMode.js';
import * as users from '../../services/users.js';
import { randomAvatar } from '../../../shared/avatar.js';
import { mulberry32 } from '../../../shared/terrain.js';

const R = 2.2; // radio del balón
const GRAV = -22;
const MATCH_MS = 180_000;
const SLOTS = 4; // 2 contra 2 (se completa con bots)
const CAR_R = 1.9;
const BOT_NAMES = ['Turbo', 'Chispa', 'Rayo', 'Nitro', 'Bólido', 'Drift'];

export class RocketMode extends BaseMode {
  constructor(room) {
    super(room);
    this.arena = this.world.meta.arena;
    this.colors = this.world.meta.teamColors;
    this.kickoffSpots = this.world.meta.kickoff;
    this.teams = new Map(); // id -> 0|1
    this.bots = new Map();
    this.samples = new Map(); // id vehículo -> {prev, cur, tPrev, tCur}
    this.score = [0, 0];
    this.ball = { p: [0, R, 0], v: [0, 0, 0] };
    this.lastTouch = null;
    this.touchAt = new Map();
    this.state = 'waiting';
    this.endsAt = 0;
    this.stateUntil = 0;
    this.remaining = MATCH_MS;
    this.rng = mulberry32(99);
  }

  publicState() {
    return {
      state: this.state, score: this.score, teams: Object.fromEntries(this.teams), stateUntil: this.stateUntil,
      remaining: Math.max(0, Math.round(this.remaining)), colors: this.colors,
    };
  }

  sync() {
    this.broadcast('rocket', this.publicState());
  }

  teamSize(t) {
    let n = 0;
    for (const v of this.teams.values()) if (v === t) n++;
    return n;
  }

  // --- Jugadores y bots --------------------------------------------------------------
  spectatorState() {
    return { rocket: this.publicState(), arena: this.arena };
  }

  onJoin(p) {
    // Si hay bots, un jugador ocupa la plaza de uno de ellos
    const humans = [...this.teams.keys()].filter((id) => !this.bots.has(id)).length;
    if (humans + 1 <= SLOTS && this.bots.size && this.teams.size >= SLOTS) this.removeBot();
    const team = this.teamSize(0) <= this.teamSize(1) ? 0 : 1;
    this.teams.set(p.id, team);
    const vid = `car-${p.id}`;
    const spot = this.spotFor(p.id);
    const v = this.room.addVehicle(vid, 'car', spot.p, spot.ry, this.colors[team]);
    v.spawn = null;
    v.driver = p.id;
    p.vehicleId = vid;
    this.room.teleport(p, spot.p);
    this.broadcast('vehicle', this.room.vehiclePublic(v));
    this.fillBots();
    if (this.state === 'waiting') this.kickoff(true);
    this.sync();
    return { rocket: this.publicState(), arena: this.arena };
  }

  onLeave(p) {
    this.teams.delete(p.id);
    const vid = `car-${p.id}`;
    this.room.vehicles.delete(vid);
    p.vehicleId = null;
    this.broadcast('vehicle:remove', { id: vid });
    const humans = [...this.room.players.values()].filter((o) => o.id !== p.id).length;
    if (humans === 0) {
      for (const id of [...this.bots.keys()]) this.removeBot(id);
      this.state = 'waiting';
      this.score = [0, 0];
    } else this.fillBots();
    this.sync();
  }

  onVehicle(p, v, entered) {
    // No se puede salir del coche en el estadio
    if (!entered && v.id === `car-${p.id}`) {
      v.driver = p.id;
      p.vehicleId = v.id;
    }
  }

  fillBots() {
    while (this.teams.size < SLOTS) this.addBot();
  }

  addBot() {
    this.botSeq = (this.botSeq || 0) + 1;
    const i = this.botSeq;
    const id = `rbot-${Date.now().toString(36)}${i}`;
    const team = this.teamSize(0) <= this.teamSize(1) ? 0 : 1;
    this.teams.set(id, team);
    const spot = this.spotFor(id);
    const vid = `car-${id}`;
    const v = this.room.addVehicle(vid, 'car', spot.p, spot.ry, this.colors[team]);
    v.spawn = null;
    v.driver = id;
    const bot = { id, name: BOT_NAMES[i % BOT_NAMES.length], team, avatar: randomAvatar(mulberry32(i * 31)), vid, x: spot.p[0], y: 0, z: spot.p[2], yaw: (spot.ry * Math.PI) / 180, speed: 0, vy: 0 };
    this.bots.set(id, bot);
    this.syncBotVehicle(bot);
    this.broadcast('player:join', this.botPublic(bot));
    this.broadcast('vehicle', this.room.vehiclePublic(v));
  }

  removeBot(id = [...this.bots.keys()].at(-1)) {
    const b = this.bots.get(id);
    if (!b) return;
    this.bots.delete(id);
    this.teams.delete(id);
    this.room.vehicles.delete(b.vid);
    this.broadcast('player:leave', { id });
    this.broadcast('vehicle:remove', { id: b.vid });
  }

  botPublic(b) {
    return { id: b.id, name: b.name, title: b.team === 0 ? 'Bot Azul' : 'Bot Naranja', level: 'Bot', bot: true, avatar: b.avatar, p: [b.x, b.y, b.z], ry: b.yaw, a: 'drive', v: b.vid };
  }

  publicPlayers() {
    return [...this.bots.values()].map((b) => this.botPublic(b));
  }

  snapPlayers() {
    return [...this.bots.values()].map((b) => {
      const v = this.room.vehicles.get(b.vid);
      return { id: b.id, p: [b.x, b.y, b.z], ry: b.yaw, a: 'drive', v: { id: b.vid, p: v.p, r: v.r, s: v.s } };
    });
  }

  snapExtra() {
    const b = this.ball;
    const rnd = (x) => Math.round(x * 100) / 100;
    return { b: [...b.p.map(rnd), ...b.v.map(rnd)], sc: this.score, rm: Math.round(this.remaining / 1000), s: this.state };
  }

  spotFor(id) {
    const team = this.teams.get(id) ?? 0;
    const mates = [...this.teams.entries()].filter(([, t]) => t === team).map(([k]) => k);
    const idx = Math.max(0, mates.indexOf(id));
    const p = this.kickoffSpots[team][idx % this.kickoffSpots[team].length];
    return { p, ry: team === 0 ? 180 : 0 };
  }

  syncBotVehicle(b) {
    const v = this.room.vehicles.get(b.vid);
    if (!v) return;
    v.p = [b.x, b.y, b.z];
    v.r = [0, b.yaw, 0];
    v.s = b.speed;
  }

  // --- Saques y goles -----------------------------------------------------------------
  kickoff(newMatch = false) {
    if (newMatch) {
      this.score = [0, 0];
      this.remaining = MATCH_MS;
    }
    this.ball = { p: [0, R + 6, 0], v: [0, 0, 0] };
    this.lastTouch = null;
    this.state = 'kickoff';
    this.stateUntil = Date.now() + 3000;
    for (const p of this.room.players.values()) {
      const spot = this.spotFor(p.id);
      this.room.teleport(p, spot.p);
      this.emit(p, 'rocket:spot', spot);
    }
    for (const b of this.bots.values()) {
      const spot = this.spotFor(b.id);
      Object.assign(b, { x: spot.p[0], y: 0, z: spot.p[2], yaw: (spot.ry * Math.PI) / 180, speed: 0, vy: 0 });
      this.syncBotVehicle(b);
    }
    this.sync();
  }

  goal(team) {
    // `team` es el equipo que marca
    this.score[team]++;
    this.state = 'goal';
    this.stateUntil = Date.now() + 3500;
    const scorer = this.lastTouch && this.teams.get(this.lastTouch) === team ? this.lastTouch : null;
    const p = scorer ? this.room.players.get(scorer) : null;
    const name = p ? p.name : scorer ? this.bots.get(scorer)?.name : null;
    if (p) {
      users.unlockAchievement(p.id, 'goal');
      users.award(p.id, { xp: 30, coins: users.dailyCapped(p.id, 'rocket_goal', 5, 40), reason: '¡Gol!' });
      users.updateStats(p.id, (s) => { s.goals = (s.goals || 0) + 1; });
    }
    this.broadcast('rocket:goal', { team, scorer: name, score: this.score });
    this.room.systemMessage(`⚽ ¡GOL de ${team === 0 ? 'Azul' : 'Naranja'}${name ? ` (${name})` : ''}! ${this.score[0]} - ${this.score[1]}`);
    this.sync();
  }

  endMatch() {
    this.state = 'end';
    this.stateUntil = Date.now() + 9000;
    const winner = this.score[0] === this.score[1] ? -1 : this.score[0] > this.score[1] ? 0 : 1;
    for (const p of this.room.players.values()) {
      const t = this.teams.get(p.id);
      const won = t === winner;
      const coins = users.dailyCapped(p.id, 'rocket', won ? 50 : 15, 150);
      users.award(p.id, { xp: won ? 120 : 50, coins, reason: won ? '¡Victoria!' : winner === -1 ? 'Empate' : 'Partido terminado' });
      users.updateStats(p.id, (s) => { s.rocketGames = (s.rocketGames || 0) + 1; if (won) s.wins = (s.wins || 0) + 1; });
      users.setHistoryResult(p.historyId, `${this.score[0]} - ${this.score[1]} ${won ? '(victoria)' : ''}`);
    }
    this.broadcast('rocket:end', { score: this.score, winner });
    this.sync();
  }

  // --- Simulación -----------------------------------------------------------------------
  sampleCars(now) {
    for (const v of this.room.vehicles.values()) {
      const s = this.samples.get(v.id);
      if (!s) { this.samples.set(v.id, { prev: [...v.p], cur: [...v.p], tPrev: now - 66, tCur: now }); continue; }
      if (v.p[0] !== s.cur[0] || v.p[1] !== s.cur[1] || v.p[2] !== s.cur[2]) {
        s.prev = s.cur;
        s.tPrev = s.tCur;
        s.cur = [...v.p];
        s.tCur = now;
      }
    }
  }

  carVelocity(id) {
    const s = this.samples.get(id);
    if (!s) return [0, 0, 0];
    const dt = Math.max(0.03, (s.tCur - s.tPrev) / 1000);
    return [(s.cur[0] - s.prev[0]) / dt, (s.cur[1] - s.prev[1]) / dt, (s.cur[2] - s.prev[2]) / dt].map((x) => Math.max(-60, Math.min(60, x)));
  }

  tick(dt) {
    const now = Date.now();
    if (this.room.players.size === 0) return;
    if (this.state === 'kickoff' && now >= this.stateUntil) { this.state = 'play'; this.sync(); }
    if (this.state === 'goal' && now >= this.stateUntil) {
      if (this.remaining <= 0) this.endMatch();
      else this.kickoff();
    }
    if (this.state === 'end' && now >= this.stateUntil) this.kickoff(true);
    if (this.state === 'play') {
      this.remaining -= dt * 1000;
      if (this.remaining <= 0 && this.score[0] !== this.score[1]) { this.remaining = 0; this.endMatch(); }
    }
    for (const b of this.bots.values()) this.botTick(b, dt);
    this.sampleCars(now);
    if (this.state === 'play' || this.state === 'kickoff') {
      const steps = 4;
      for (let i = 0; i < steps; i++) this.ballStep(dt / steps, now, this.state === 'play');
    }
  }

  ballStep(dt, now, live) {
    const b = this.ball;
    const A = this.arena;
    if (live || b.p[1] > R) {
      b.v[1] += GRAV * dt;
      for (let k = 0; k < 3; k++) b.p[k] += b.v[k] * dt;
    }
    // Suelo y techo
    if (b.p[1] < R) {
      b.p[1] = R;
      if (b.v[1] < 0) b.v[1] = -b.v[1] * 0.62;
      if (Math.abs(b.v[1]) < 1.5) b.v[1] = 0;
      b.v[0] *= 1 - 0.6 * dt;
      b.v[2] *= 1 - 0.6 * dt;
    }
    if (b.p[1] > 30 - R) { b.p[1] = 30 - R; b.v[1] = -Math.abs(b.v[1]) * 0.6; }
    // Paredes laterales
    if (Math.abs(b.p[0]) > A.hx - R) {
      b.p[0] = Math.sign(b.p[0]) * (A.hx - R);
      b.v[0] = -b.v[0] * 0.75;
    }
    // Fondo: hueco de portería
    const inMouth = Math.abs(b.p[0]) < A.goalW - R * 0.4 && b.p[1] < A.goalH - R * 0.3;
    const limit = inMouth ? A.hz + A.goalDepth - R : A.hz - R;
    if (Math.abs(b.p[2]) > limit) {
      b.p[2] = Math.sign(b.p[2]) * limit;
      b.v[2] = -b.v[2] * 0.7;
    }
    if (inMouth && Math.abs(b.p[2]) > A.hz) {
      // Dentro de la portería: los lados y el larguero también rebotan
      if (Math.abs(b.p[0]) > A.goalW - R) { b.p[0] = Math.sign(b.p[0]) * (A.goalW - R); b.v[0] *= -0.6; }
    }
    if (live && Math.abs(b.p[2]) > A.hz + R) {
      this.goal(b.p[2] > 0 ? 1 : 0);
      return;
    }
    // Choques con los coches
    for (const v of this.room.vehicles.values()) {
      if (!v.driver) continue;
      const c = [v.p[0], v.p[1] + 1.0, v.p[2]];
      const dx = b.p[0] - c[0], dy = b.p[1] - c[1], dz = b.p[2] - c[2];
      const d = Math.hypot(dx, dy, dz);
      if (d >= R + CAR_R || d < 1e-4) continue;
      const n = [dx / d, dy / d, dz / d];
      // Saca el balón del coche
      for (let k = 0; k < 3; k++) b.p[k] = c[k] + n[k] * (R + CAR_R);
      const cv = this.carVelocity(v.id);
      const rel = (cv[0] - b.v[0]) * n[0] + (cv[1] - b.v[1]) * n[1] + (cv[2] - b.v[2]) * n[2];
      if (rel <= 0 && now - (this.touchAt.get(v.id) || 0) < 120) continue;
      const push = Math.max(6, rel * 1.35);
      for (let k = 0; k < 3; k++) b.v[k] = b.v[k] * 0.25 + cv[k] * 0.9 + n[k] * push;
      b.v[1] = Math.max(b.v[1], 4 + Math.abs(rel) * 0.15);
      const sp = Math.hypot(...b.v);
      if (sp > 65) for (let k = 0; k < 3; k++) b.v[k] *= 65 / sp;
      this.touchAt.set(v.id, now);
      this.lastTouch = v.driver;
      this.broadcast('rocket:touch', { p: b.p.map((x) => Math.round(x * 10) / 10), s: Math.round(sp) });
    }
  }

  botTick(b, dt) {
    const frozen = this.state === 'kickoff' || this.state === 'end';
    const ball = this.ball.p;
    const attackZ = b.team === 0 ? -(this.arena.hz + 5) : this.arena.hz + 5; // portería rival
    const ax = 0 - ball[0], az = attackZ - ball[2], al = Math.hypot(ax, az) || 1;
    // Se coloca detrás del balón respecto a la portería rival
    let tx = ball[0] - (ax / al) * 4, tz = ball[2] - (az / al) * 4;
    const dBall = Math.hypot(ball[0] - b.x, ball[2] - b.z);
    const behind = (b.z - ball[2]) * Math.sign(-az) > -1;
    if (dBall < 7 && behind) { tx = ball[0]; tz = ball[2]; }
    const want = Math.atan2(tx - b.x, tz - b.z);
    const diff = Math.atan2(Math.sin(want - b.yaw), Math.cos(want - b.yaw));
    if (!frozen) {
      b.yaw += Math.max(-2.6 * dt, Math.min(2.6 * dt, diff));
      const maxSp = dBall > 25 ? 38 : 30;
      const targetSpeed = Math.abs(diff) > 1.6 ? 12 : maxSp;
      b.speed += Math.sign(targetSpeed - b.speed) * Math.min(Math.abs(targetSpeed - b.speed), 26 * dt);
      if (b.y <= 0.01 && dBall < 6 && ball[1] > 4) b.vy = 11;
    } else b.speed = 0;
    b.vy += GRAV * dt;
    b.y = Math.max(0, b.y + b.vy * dt);
    if (b.y === 0) b.vy = 0;
    b.x += Math.sin(b.yaw) * b.speed * dt;
    b.z += Math.cos(b.yaw) * b.speed * dt;
    const A = this.arena;
    b.x = Math.max(-A.hx + 1.5, Math.min(A.hx - 1.5, b.x));
    b.z = Math.max(-A.hz + 1.5, Math.min(A.hz - 1.5, b.z));
    this.syncBotVehicle(b);
  }
}
