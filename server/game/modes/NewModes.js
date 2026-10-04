// Modos de la tercera tanda: Kest Pesadilla, Kest Desastres, Kest Huerto y Kest Bloques Locos.
import { BaseMode } from './BaseMode.js';
import * as users from '../../services/users.js';
import { WALL, mazeDistances } from '../../../shared/worlds/horror.js';
import { DISASTER_IDS, DISASTERS, DESASTRES } from '../../../shared/worlds/desastres.js';
import { SEEDS, MUTATIONS, HUERTO, tilePos, SHOP_POS } from '../../../shared/worlds/huerto.js';
import { TILE_COLORS, BLOQUES, tileCenter, tileAt } from '../../../shared/worlds/bloques.js';
import { randomAvatar } from '../../../shared/avatar.js';
import { mulberry32 } from '../../../shared/terrain.js';

const dist2 = (a, x, z) => Math.hypot(a[0] - x, a[2] - z);
const BOT_NAMES = ['Pixel', 'Nube', 'Turbo', 'Chispa', 'Bollo', 'Rayo', 'Coco', 'Menta', 'Bambú', 'Kiwi', 'Lupa', 'Trueno'];

// =====================================================================================
// Kest Pesadilla
// =====================================================================================
const MON_SPEED = { wander: 2.6, investigate: 5.6, chase: 8.8 };
const CATCH = 1.45;

export class PesadillaMode extends BaseMode {
  constructor(room) {
    super(room);
    this.meta = this.world.meta;
    this.grid = this.meta.grid;
    this.exitZone = this.objectsOfType('zone').find((z) => z.id === 'exitzone');
    this.round = 1;
    this.resetRound();
  }

  resetRound() {
    this.fuses = new Set();
    this.power = false;
    this.keyTaken = false;
    this.doorOpen = false;
    this.ending = 0;
    this.room.state.groups.power = false;
    const [x, z] = this.center(this.grid.n - 1, 0);
    this.mon = { x, z, ry: 0, state: 'wander', goal: null, noise: null, retreatUntil: 0 };
  }

  center(i, j) {
    const { x0, z0, cell } = this.grid;
    return [x0 + (i + 0.5) * cell, z0 + (j + 0.5) * cell];
  }

  cellOf(x, z) {
    const { x0, z0, cell, n } = this.grid;
    return [Math.max(0, Math.min(n - 1, Math.floor((x - x0) / cell))), Math.max(0, Math.min(n - 1, Math.floor((z - z0) / cell)))];
  }

  inHouse(x, z) {
    const { x0, z0, cell, n } = this.grid;
    return x > x0 && z > z0 && x < x0 + n * cell && z < z0 + n * cell;
  }

  nextCell(from, goal) {
    const { n, cells } = this.grid;
    const dist = mazeDistances(cells, n, goal[0], goal[1]);
    const d0 = dist[from[1] * n + from[0]];
    if (d0 <= 0) return goal;
    for (const [di, dj, w] of [[0, -1, WALL.N], [1, 0, WALL.E], [0, 1, WALL.S], [-1, 0, WALL.W]]) {
      if (cells[from[1] * n + from[0]] & w) continue;
      const a = from[0] + di, b = from[1] + dj;
      if (a < 0 || b < 0 || a >= n || b >= n) continue;
      if (dist[b * n + a] === d0 - 1) return [a, b];
    }
    return goal;
  }

  state() {
    return { fuses: [...this.fuses], total: this.meta.fuses.length, power: this.power, keyTaken: this.keyTaken, doorOpen: this.doorOpen, round: this.round };
  }

  sync() {
    this.broadcast('pesadilla', this.state());
  }

  spectatorState() {
    return { pesadilla: this.state() };
  }

  onJoin(p) {
    p.data = { hidden: null, caughtAt: 0, escaped: false, noiseAt: 0, loudAt: 0, stepAcc: 0 };
    return { pesadilla: this.state() };
  }

  /** Un sonido en (x,z): si el monstruo lo oye, va a investigarlo (o persigue si está cerca). */
  noise(x, z, level, p = null) {
    const m = this.mon;
    if (Date.now() < m.retreatUntil || !this.inHouse(x, z)) return false;
    const radius = 3 + level * 36;
    const d = Math.hypot(m.x - x, m.z - z);
    if (d > radius) return false;
    const wasIdle = m.state === 'wander';
    m.noise = { x, z, until: Date.now() + 7000 };
    m.state = d < 11 && level > 0.3 ? 'chase' : 'investigate';
    if (p && wasIdle) this.emit(p, 'pesadilla:heard', { level: Math.round(level * 100) / 100 });
    return true;
  }

  near(p, pos, r) {
    return dist2(p.pos, pos[0], pos[2]) < r && Math.abs(p.pos[1] - (pos[1] || 0)) < 3;
  }

  onEvent(p, name, data = {}) {
    const now = Date.now();
    if (name === 'noise') {
      if (now - p.data.noiseAt < 180) return { ok: true };
      p.data.noiseAt = now;
      const l = Math.max(0, Math.min(1, Number(data.l) || 0));
      if (l < 0.08) return { ok: true };
      if (l > 0.5) p.data.loudAt = now;
      this.noise(p.pos[0], p.pos[2], l * (p.data.hidden ? 0.6 : 1), p);
      return { ok: true };
    }
    if (name === 'pick') {
      const id = String(data.id || '');
      if (id === 'key') {
        if (!this.power) return { error: 'Está demasiado oscuro… primero devuelve la luz' };
        if (this.keyTaken) return { error: 'Alguien ya tiene la llave' };
        if (!this.near(p, this.meta.key.p, 2.8)) return { error: 'Acércate más' };
        this.keyTaken = true;
        this.room.systemMessage(`🔑 ${p.name} ha encontrado la llave de la puerta principal`);
        this.sync();
        return { ok: true };
      }
      const f = this.meta.fuses.find((x) => x.id === id);
      if (!f || this.fuses.has(id)) return { error: 'Ya lo ha cogido alguien' };
      if (!this.near(p, f.p, 2.8)) return { error: 'Acércate más' };
      this.fuses.add(id);
      users.award(p.id, { xp: 20, reason: 'Fusible encontrado' });
      this.room.systemMessage(`🔌 ${p.name} ha encontrado un fusible (${this.fuses.size}/${this.meta.fuses.length})`);
      this.sync();
      return { ok: true };
    }
    if (name === 'fusebox') {
      if (this.power) return { error: 'La luz ya funciona' };
      if (this.fuses.size < this.meta.fuses.length) return { error: `Faltan fusibles (${this.fuses.size}/${this.meta.fuses.length})` };
      if (!this.near(p, this.meta.fuseBox.p, 3)) return { error: 'Acércate más' };
      this.power = true;
      this.room.state.groups.power = true;
      this.room.systemMessage(`💡 ${p.name} ha devuelto la luz… El Oyente lo ha oído.`);
      this.noise(this.meta.fuseBox.p[0], this.meta.fuseBox.p[2], 1);
      this.sync();
      return { ok: true };
    }
    if (name === 'door') {
      if (this.doorOpen) return { ok: true };
      if (!this.keyTaken) return { error: 'Está cerrada con llave' };
      if (!this.near(p, this.meta.door.p, 3.5)) return { error: 'Acércate más' };
      this.doorOpen = true;
      this.room.systemMessage('🚪 ¡La puerta principal está abierta! ¡Salid todos!');
      this.noise(this.meta.door.p[0], this.meta.door.p[2] - 1, 0.8);
      this.sync();
      return { ok: true };
    }
    if (name === 'hide') {
      if (!data.on) {
        p.data.hidden = null;
        return { ok: true };
      }
      const c = this.meta.closets.find((x) => x.id === data.id);
      if (!c || !this.near(p, c.p, 3)) return { error: 'Acércate al armario' };
      if ([...this.room.players.values()].some((o) => o !== p && o.data.hidden === c.id)) return { error: 'Ya hay alguien dentro' };
      p.data.hidden = c.id;
      return { ok: true };
    }
    return { error: 'Evento no soportado' };
  }

  onState(p) {
    if (!this.doorOpen || p.data.escaped || !this.exitZone || !this.inside(p, this.exitZone, 0.5, 3)) return;
    p.data.escaped = true;
    users.updateStats(p.id, (s) => { s.nightmares = (s.nightmares || 0) + 1; s.wins = (s.wins || 0) + 1; });
    const coins = users.dailyCapped(p.id, 'pesadilla', 80, 160);
    users.award(p.id, { xp: 200, coins, reason: '¡Has escapado de la casa!' });
    users.unlockAchievement(p.id, 'nightmare');
    users.setHistoryResult(p.historyId, 'Escapó de la casa');
    this.room.systemMessage(`🏃 ${p.name} ha escapado`);
    const allOut = [...this.room.players.values()].every((o) => o.data.escaped);
    const end = Date.now() + (allOut ? 5000 : 20000);
    if (!this.ending || end < this.ending) this.ending = end;
  }

  catchPlayer(p) {
    const now = Date.now();
    p.data.caughtAt = now;
    p.data.hidden = null;
    this.mon.retreatUntil = now + 4500;
    this.mon.noise = null;
    this.mon.state = 'wander';
    this.mon.goal = null;
    this.broadcast('pesadilla:caught', { id: p.id, name: p.name });
    this.room.systemMessage(`😱 El Oyente ha atrapado a ${p.name}`);
    setTimeout(() => {
      if (!this.room.players.has(p.id)) return;
      const pos = this.room.respawn(p);
      this.emit(p, 'respawn', { p: pos });
    }, 1800);
  }

  adminLose(p) {
    this.catchPlayer(p);
    return true;
  }

  tick(dt) {
    const now = Date.now();
    if (this.ending && now > this.ending) {
      this.round++;
      this.resetRound();
      for (const p of this.room.players.values()) {
        p.data.escaped = false;
        p.data.hidden = null;
        const pos = this.room.respawn(p);
        this.emit(p, 'respawn', { p: pos });
      }
      this.room.systemMessage(`🌑 Noche ${this.round}: la casa vuelve a quedarse a oscuras…`);
      this.sync();
      return;
    }
    if (this.room.players.size === 0) return;
    // Pasos: correr se oye lejos; andar, solo de cerca
    for (const p of this.room.players.values()) {
      if (p.data.hidden || p.data.escaped) continue;
      p.data.stepAcc += dt;
      const lvl = p.anim === 'run' ? 0.55 : p.anim === 'walk' ? 0.12 : p.anim === 'land' ? 0.35 : 0;
      const every = p.anim === 'run' ? 0.4 : 0.8;
      if (lvl && p.data.stepAcc > every) {
        p.data.stepAcc = 0;
        this.noise(p.pos[0], p.pos[2], lvl, p);
      }
    }
    const m = this.mon;
    if (m.noise && now > m.noise.until) { m.noise = null; m.state = 'wander'; }
    const here = this.cellOf(m.x, m.z);
    let gx, gz, speed = MON_SPEED[m.state];
    if (m.noise) {
      const tc = this.cellOf(m.noise.x, m.noise.z);
      if (tc[0] === here[0] && tc[1] === here[1]) {
        gx = m.noise.x;
        gz = m.noise.z;
        if (Math.hypot(gx - m.x, gz - m.z) < 0.8) { m.noise = null; m.state = 'wander'; }
      } else [gx, gz] = this.center(...this.nextCell(here, tc));
    } else {
      speed = MON_SPEED.wander;
      const [cx, cz] = m.goal ? this.center(...m.goal) : [0, 0];
      if (!m.goal || (here[0] === m.goal[0] && here[1] === m.goal[1] && Math.hypot(cx - m.x, cz - m.z) < 0.6)) {
        m.goal = [Math.floor(Math.random() * this.grid.n), Math.floor(Math.random() * this.grid.n)];
      }
      [gx, gz] = this.center(...this.nextCell(here, m.goal));
    }
    const dx = gx - m.x, dz = gz - m.z, d = Math.hypot(dx, dz);
    if (d > 0.05) {
      const s = Math.min(d, speed * dt);
      m.x += (dx / d) * s;
      m.z += (dz / d) * s;
      m.ry = Math.atan2(dx, dz);
    }
    for (const p of this.room.players.values()) {
      if (p.data.escaped || now - p.data.caughtAt < 4000 || now < m.retreatUntil) continue;
      const exposed = !p.data.hidden || now - p.data.loudAt < 1500;
      if (exposed && Math.hypot(p.pos[0] - m.x, p.pos[2] - m.z) < CATCH && p.pos[1] < 3) this.catchPlayer(p);
    }
  }

  snapExtra() {
    const m = this.mon;
    const r = (v) => Math.round(v * 100) / 100;
    return { mon: [r(m.x), r(m.z), r(m.ry), m.state === 'chase' ? 2 : m.state === 'investigate' ? 1 : 0] };
  }
}

// =====================================================================================
// Kest Desastres
// =====================================================================================
export class DesastresMode extends BaseMode {
  constructor(room) {
    super(room);
    this.phase = 'lobby';
    this.until = Date.now() + DESASTRES.lobbySeconds * 1000;
    this.alive = new Set();
    this.disaster = null;
    this.last = null;
    this.seed = 1;
    this.startAt = 0;
    this.round = 0;
  }

  publicState() {
    return { phase: this.phase, until: this.until, disaster: this.disaster, seed: this.seed, startAt: this.startAt, alive: [...this.alive], round: this.round };
  }

  sync() {
    this.broadcast('desastres', this.publicState());
  }

  spectatorState() {
    return { desastres: this.publicState() };
  }

  onJoin(p) {
    p.data = {};
    return { desastres: this.publicState() };
  }

  onLeave(p) {
    if (this.alive.delete(p.id)) this.sync();
  }

  lobbySpot() {
    return this.room.spawns[Math.floor(Math.random() * this.room.spawns.length)];
  }

  start() {
    const options = DISASTER_IDS.filter((d) => d !== this.last);
    this.disaster = options[Math.floor(Math.random() * options.length)];
    this.last = this.disaster;
    this.seed = 1 + Math.floor(Math.random() * 1e6);
    this.round++;
    this.phase = 'disaster';
    this.startAt = Date.now() + 2000;
    this.until = this.startAt + DESASTRES.roundSeconds * 1000;
    this.alive = new Set(this.room.players.keys());
    const S = DESASTRES.island * 0.8;
    for (const p of this.room.players.values()) {
      let x, z;
      do {
        x = (Math.random() * 2 - 1) * S;
        z = (Math.random() * 2 - 1) * S;
      } while (Math.abs(x) < 7 && Math.abs(z) < 7);
      const pos = [x, 8, z];
      this.room.teleport(p, pos);
      this.emit(p, 'respawn', { p: pos });
    }
    const d = DISASTERS[this.disaster];
    this.room.systemMessage(`${d.icon} ¡Se acerca: ${d.name}! ${d.tip}`);
    this.sync();
  }

  eliminate(p, cause = 'no ha sobrevivido') {
    if (this.phase !== 'disaster' || !this.alive.delete(p.id)) return false;
    this.broadcast('desastres:dead', { id: p.id, name: p.name, cause });
    users.setHistoryResult(p.historyId, `Eliminado en: ${DISASTERS[this.disaster].name}`);
    this.sync();
    return true;
  }

  finish() {
    const winners = [...this.alive].map((id) => this.room.players.get(id)).filter(Boolean);
    for (const p of winners) {
      const coins = users.dailyCapped(p.id, 'desastres', 20, 100);
      users.award(p.id, { xp: 70, coins, reason: `¡Has sobrevivido a: ${DISASTERS[this.disaster].name}!` });
      users.unlockAchievement(p.id, 'disaster');
      users.updateStats(p.id, (s) => { s.disasters = (s.disasters || 0) + 1; s.wins = (s.wins || 0) + 1; });
      users.setHistoryResult(p.historyId, `Sobrevivió a: ${DISASTERS[this.disaster].name}`);
    }
    this.room.systemMessage(winners.length ? `🏆 Supervivientes: ${winners.map((p) => p.name).join(', ')}` : '💀 Nadie ha sobrevivido…');
    this.phase = 'result';
    this.until = Date.now() + 6000;
    for (const p of this.room.players.values()) {
      const pos = this.lobbySpot();
      this.room.teleport(p, pos);
      this.emit(p, 'respawn', { p: pos });
    }
    this.sync();
  }

  onEvent(p, name, data = {}) {
    if (name === 'died') {
      const cause = ['agua', 'lava', 'meteorito', 'tornado', 'roca', 'ácido', 'caída'].includes(data.cause) ? data.cause : 'desastre';
      if (!this.eliminate(p, cause)) return { ok: true };
      const pos = this.lobbySpot();
      this.room.teleport(p, pos);
      return { ok: true, p: pos };
    }
    return { error: 'Evento no soportado' };
  }

  getRespawn(p) {
    this.eliminate(p, 'caída');
    return this.lobbySpot();
  }

  adminLose(p) {
    if (!this.eliminate(p, 'admin')) return false;
    const pos = this.lobbySpot();
    this.room.teleport(p, pos);
    this.emit(p, 'respawn', { p: pos });
    return true;
  }

  onState(p) {
    if (this.phase === 'disaster' && this.alive.has(p.id) && p.pos[1] < -15) {
      this.eliminate(p, 'caída');
      const pos = this.lobbySpot();
      this.room.teleport(p, pos);
      this.emit(p, 'respawn', { p: pos });
    }
  }

  tick() {
    const now = Date.now();
    if (this.room.players.size === 0) {
      this.phase = 'lobby';
      this.until = now + DESASTRES.lobbySeconds * 1000;
      this.alive.clear();
      return;
    }
    if (this.phase === 'lobby' && now >= this.until) this.start();
    else if (this.phase === 'disaster' && (now >= this.until || this.alive.size === 0)) this.finish();
    else if (this.phase === 'result' && now >= this.until) {
      this.phase = 'lobby';
      this.until = now + DESASTRES.lobbySeconds * 1000;
      this.disaster = null;
      this.sync();
    }
  }
}

// =====================================================================================
// Kest Huerto
// =====================================================================================
const TILES = HUERTO.cols * HUERTO.rows;

function rollMutation(rnd = Math.random) {
  const r = rnd();
  if (r < MUTATIONS.rainbow.chance) return 'rainbow';
  if (r < MUTATIONS.rainbow.chance + MUTATIONS.gold.chance) return 'gold';
  return null;
}

export function normalizeGarden(g) {
  const out = { cash: HUERTO.startCash, seeds: { carrot: 3 }, tiles: Array(TILES).fill(null), inv: {}, sold: 0 };
  if (!g || typeof g !== 'object') return out;
  if (Number.isFinite(g.cash)) out.cash = Math.max(0, Math.floor(g.cash));
  if (Number.isFinite(g.sold)) out.sold = g.sold;
  if (g.seeds && typeof g.seeds === 'object') out.seeds = Object.fromEntries(Object.entries(g.seeds).filter(([k, v]) => SEEDS[k] && v > 0));
  if (g.inv && typeof g.inv === 'object') out.inv = Object.fromEntries(Object.entries(g.inv).filter(([k, v]) => SEEDS[k.split('|')[0]] && v > 0));
  if (Array.isArray(g.tiles)) out.tiles = Array.from({ length: TILES }, (_, i) => (g.tiles[i] && SEEDS[g.tiles[i].s] ? g.tiles[i] : null));
  return out;
}

export class HuertoMode extends BaseMode {
  constructor(room) {
    super(room);
    this.owners = Array(HUERTO.plots).fill(null);
    this.rainUntil = 0;
    this.nextRain = Date.now() + 150_000;
  }

  plotPublic(k) {
    const p = this.owners[k] ? this.room.players.get(this.owners[k]) : null;
    return p ? { k, owner: { id: p.id, name: p.name }, tiles: p.data.g.tiles } : { k, owner: null, tiles: [] };
  }

  mine(p) {
    const g = p.data.g;
    return { k: p.data.plot, cash: g.cash, seeds: g.seeds, inv: g.inv };
  }

  spectatorState() {
    return { huerto: { plots: this.owners.map((_, k) => this.plotPublic(k)), me: null, rain: this.rainUntil } };
  }

  onJoin(p) {
    const k = this.owners.indexOf(null);
    p.data = { plot: k >= 0 ? k : null, g: normalizeGarden(users.getUser(p.id).stats.garden), at: 0 };
    if (k >= 0) {
      this.owners[k] = p.id;
      this.broadcast('huerto:plot', this.plotPublic(k));
    }
    return { huerto: { plots: this.owners.map((_, i) => this.plotPublic(i)), me: this.mine(p), rain: this.rainUntil } };
  }

  onLeave(p) {
    this.save(p);
    const k = p.data.plot;
    if (k != null && this.owners[k] === p.id) {
      this.owners[k] = null;
      this.broadcast('huerto:plot', { k, owner: null, tiles: [] });
    }
  }

  save(p) {
    const g = p.data.g;
    users.updateStats(p.id, (s) => { s.garden = g; });
  }

  grown(t, now = Date.now()) {
    return t && now - t.at + (t.b || 0) >= SEEDS[t.s].grow * 1000;
  }

  onEvent(p, name, data = {}) {
    const g = p.data.g;
    const now = Date.now();
    if (now - p.data.at < 120) return { error: 'Demasiado rápido' };
    p.data.at = now;
    const atShop = Math.hypot(p.pos[0] - SHOP_POS[0], p.pos[2] - SHOP_POS[1]) < 7;
    if (name === 'buy') {
      const s = SEEDS[data.seed];
      const n = Math.max(1, Math.min(10, Math.floor(Number(data.n) || 1)));
      if (!s) return { error: 'Semilla desconocida' };
      if (!atShop) return { error: 'Ve al puesto de semillas' };
      if (g.cash < s.price * n) return { error: 'No tienes suficientes monedas de huerto' };
      g.cash -= s.price * n;
      g.seeds[data.seed] = (g.seeds[data.seed] || 0) + n;
      this.save(p);
      return { ok: true, me: this.mine(p) };
    }
    if (name === 'sell') {
      if (!atShop) return { error: 'Ve al puesto de venta' };
      let total = 0;
      for (const [key, count] of Object.entries(g.inv)) {
        const [s, m] = key.split('|');
        total += SEEDS[s].sell * (MUTATIONS[m]?.mult || 1) * count;
      }
      if (!total) return { error: 'No tienes cosecha que vender' };
      g.inv = {};
      g.cash += total;
      g.sold += total;
      const kc = users.dailyCapped(p.id, 'huerto', Math.floor(total / 20), 80);
      users.award(p.id, { xp: Math.min(120, 5 + Math.floor(total / 15)), coins: kc, reason: `Cosecha vendida por ${total} 🌾` });
      users.unlockAchievement(p.id, 'farmer');
      this.save(p);
      return { ok: true, total, me: this.mine(p) };
    }
    const k = p.data.plot;
    if (k == null) return { error: 'No tienes parcela (el huerto está lleno)' };
    const t = Math.floor(Number(data.tile));
    if (!(t >= 0 && t < TILES)) return { error: 'Casilla no válida' };
    const [tx, tz] = tilePos(k, t);
    if (Math.hypot(p.pos[0] - tx, p.pos[2] - tz) > 3.6) return { error: 'Acércate más' };
    if (name === 'plant') {
      if (g.tiles[t]) return { error: 'Ya hay algo plantado' };
      if (!SEEDS[data.seed] || !(g.seeds[data.seed] > 0)) return { error: 'No tienes esa semilla' };
      g.seeds[data.seed]--;
      if (!g.seeds[data.seed]) delete g.seeds[data.seed];
      g.tiles[t] = { s: data.seed, at: now, b: 0, m: rollMutation() };
      this.broadcast('huerto:tile', { k, t, tile: g.tiles[t] });
      this.save(p);
      return { ok: true, me: this.mine(p) };
    }
    if (name === 'harvest') {
      const tile = g.tiles[t];
      if (!tile) return { error: 'Aquí no hay nada' };
      if (!this.grown(tile, now)) return { error: 'Todavía no está madura' };
      const key = `${tile.s}|${tile.m || ''}`;
      g.inv[key] = (g.inv[key] || 0) + 1;
      if (tile.m) users.unlockAchievement(p.id, 'golden');
      const got = { s: tile.s, m: tile.m };
      g.tiles[t] = SEEDS[tile.s].regrow ? { s: tile.s, at: now, b: 0, m: rollMutation() } : null;
      this.broadcast('huerto:tile', { k, t, tile: g.tiles[t] });
      this.save(p);
      return { ok: true, got, me: this.mine(p) };
    }
    return { error: 'Evento no soportado' };
  }

  tick(dt) {
    const now = Date.now();
    if (this.room.players.size === 0) return;
    if (now > this.nextRain) {
      this.rainUntil = now + 60_000;
      this.nextRain = now + 240_000 + Math.random() * 180_000;
      this.broadcast('huerto:rain', { until: this.rainUntil });
      this.room.systemMessage('🌧️ ¡Está lloviendo! Las plantas crecen el doble de rápido.');
    }
    if (now < this.rainUntil) {
      const extra = dt * 1000 * (HUERTO.rainBoost - 1);
      for (const id of this.owners) {
        const p = id && this.room.players.get(id);
        if (p) for (const t of p.data.g.tiles) if (t) t.b = (t.b || 0) + extra;
      }
    }
  }
}

// =====================================================================================
// Kest Bloques Locos
// =====================================================================================
const N_TILES = BLOQUES.n * BLOQUES.n;

export class BloquesMode extends BaseMode {
  constructor(room) {
    super(room);
    this.rng = mulberry32(Date.now() % 100000);
    this.bots = new Map();
    this.alive = new Set();
    this.phase = 'waiting';
    this.until = Date.now() + 3000;
    this.round = 0;
    this.colors = Array(N_TILES).fill(0).map((_, i) => i % TILE_COLORS.length);
    this.target = 0;
    this.botSeq = 0;
  }

  publicState() {
    return { phase: this.phase, until: this.until, round: this.round, colors: this.colors, target: this.target, alive: this.alive.size, winner: this.winner || null };
  }

  sync() {
    this.broadcast('bloques', this.publicState());
  }

  spectatorState() {
    return { bloques: this.publicState() };
  }

  onJoin(p) {
    p.data = {};
    return { bloques: this.publicState() };
  }

  onLeave(p) {
    this.alive.delete(p.id);
  }

  botPublic(b) {
    return { id: b.id, name: b.name, title: 'Bot', level: 'Bot', bot: true, avatar: b.avatar, p: b.pos, ry: b.ry, a: b.anim };
  }

  publicPlayers() {
    return [...this.bots.values()].map((b) => this.botPublic(b));
  }

  snapPlayers() {
    const r = (v) => Math.round(v * 100) / 100;
    return [...this.bots.values()].map((b) => ({ id: b.id, p: b.pos.map(r), ry: r(b.ry), a: b.anim }));
  }

  clearBots() {
    for (const b of this.bots.values()) this.broadcast('player:leave', { id: b.id });
    this.bots.clear();
  }

  randomTile() {
    return Math.floor(this.rng() * N_TILES);
  }

  begin() {
    this.clearBots();
    this.winner = null;
    const humans = [...this.room.players.values()];
    const nBots = Math.max(0, 5 - humans.length);
    for (let i = 0; i < nBots; i++) {
      const id = `bqbot${++this.botSeq}`;
      const [x, z] = tileCenter(this.randomTile());
      const b = { id, name: `${BOT_NAMES[(this.botSeq + i) % BOT_NAMES.length]}_bot`, avatar: randomAvatar(mulberry32(this.botSeq * 31 + 7)), pos: [x, BLOQUES.y, z], ry: 0, anim: 'idle', goal: null, falling: 0 };
      this.bots.set(id, b);
      this.broadcast('player:join', this.botPublic(b));
    }
    this.alive = new Set([...humans.map((p) => p.id), ...this.bots.keys()]);
    this.startedWith = this.alive.size;
    for (const p of humans) {
      const [x, z] = tileCenter(this.randomTile());
      const pos = [x, BLOQUES.y + 0.3, z];
      this.room.teleport(p, pos);
      this.emit(p, 'respawn', { p: pos });
    }
    this.colors = this.colors.map(() => Math.floor(this.rng() * TILE_COLORS.length));
    this.round = 0;
    this.phase = 'countdown';
    this.until = Date.now() + 4000;
    this.sync();
  }

  newRound() {
    this.round++;
    this.colors = this.colors.map(() => Math.floor(this.rng() * TILE_COLORS.length));
    this.target = Math.floor(this.rng() * TILE_COLORS.length);
    // Siempre hay unas cuantas baldosas del color correcto
    for (let k = 0; k < 6; k++) this.colors[this.randomTile()] = this.target;
    this.phase = 'show';
    this.until = Date.now() + Math.max(1500, 4400 - (this.round - 1) * 300);
    const accuracy = Math.max(0.55, 0.97 - this.round * 0.03);
    for (const b of this.bots.values()) {
      if (!this.alive.has(b.id)) continue;
      const good = [];
      for (let i = 0; i < N_TILES; i++) if (this.colors[i] === this.target) good.push(i);
      const near = (list) => list.sort((a, c) => {
        const [ax, az] = tileCenter(a), [cx, cz] = tileCenter(c);
        return Math.hypot(ax - b.pos[0], az - b.pos[2]) - Math.hypot(cx - b.pos[0], cz - b.pos[2]);
      })[0];
      b.goal = this.rng() < accuracy ? near(good) : this.randomTile();
    }
    this.sync();
  }

  eliminate(id) {
    if (!this.alive.delete(id)) return;
    const p = this.room.players.get(id);
    const b = this.bots.get(id);
    this.broadcast('bloques:out', { id, name: p?.name || b?.name });
    if (p) {
      const pos = this.room.spawns[Math.floor(Math.random() * this.room.spawns.length)];
      this.room.teleport(p, pos);
      this.emit(p, 'respawn', { p: pos });
      users.setHistoryResult(p.historyId, `Eliminado en la ronda ${this.round}`);
    }
  }

  getRespawn(p) {
    this.eliminate(p.id);
    return null;
  }

  adminLose(p) {
    this.eliminate(p.id);
    return true;
  }

  onState(p) {
    if (this.alive.has(p.id) && p.pos[1] < BLOQUES.y - 6) this.eliminate(p.id);
  }

  finish() {
    const left = [...this.alive];
    const winnerId = left.length === 1 ? left[0] : null;
    const wp = winnerId && this.room.players.get(winnerId);
    this.winner = wp?.name || this.bots.get(winnerId)?.name || null;
    if (wp) {
      const coins = users.dailyCapped(wp.id, 'bloques', 40, 120);
      users.award(wp.id, { xp: 120, coins, reason: '¡Has ganado en Bloques Locos!' });
      users.unlockAchievement(wp.id, 'blocks_win');
      users.updateStats(wp.id, (s) => { s.wins = (s.wins || 0) + 1; });
      users.setHistoryResult(wp.historyId, `Ganó en la ronda ${this.round}`);
    }
    for (const p of this.room.players.values()) {
      if (p !== wp) users.award(p.id, { xp: 10 + this.round * 4, reason: `Has llegado a la ronda ${this.round}` });
    }
    this.room.systemMessage(this.winner ? `🏆 ¡${this.winner} gana Bloques Locos en la ronda ${this.round}!` : 'Nadie ha quedado en pie');
    this.phase = 'results';
    this.until = Date.now() + 7000;
    this.sync();
  }

  tick(dt) {
    const now = Date.now();
    if (this.room.players.size === 0) {
      if (this.phase !== 'waiting') { this.phase = 'waiting'; this.clearBots(); this.alive.clear(); }
      this.until = now + 3000;
      return;
    }
    // Bots: corren hacia su baldosa; si al caer el suelo no es la suya, se caen
    for (const b of this.bots.values()) {
      if (b.falling) {
        b.pos[1] -= (8 + b.falling * 20) * dt;
        b.falling += dt;
        b.anim = 'fall';
        if (b.falling > 1.4) { this.bots.delete(b.id); this.broadcast('player:leave', { id: b.id }); }
        continue;
      }
      if (this.phase === 'show' && b.goal != null) {
        const [gx, gz] = tileCenter(b.goal);
        const dx = gx - b.pos[0], dz = gz - b.pos[2], d = Math.hypot(dx, dz);
        if (d > 0.4) {
          const s = Math.min(d, 7.5 * dt);
          b.pos[0] += (dx / d) * s;
          b.pos[2] += (dz / d) * s;
          b.ry = Math.atan2(dx, dz);
          b.anim = 'run';
        } else b.anim = 'idle';
      } else if (b.anim === 'run') b.anim = 'idle';
    }
    if (this.phase === 'waiting' && now >= this.until) this.begin();
    else if (this.phase === 'countdown' && now >= this.until) this.newRound();
    else if (this.phase === 'show' && now >= this.until) {
      this.phase = 'drop';
      this.until = now + 2600;
      for (const b of this.bots.values()) {
        if (!this.alive.has(b.id)) continue;
        const t = tileAt(b.pos[0], b.pos[2]);
        if (t < 0 || this.colors[t] !== this.target) {
          b.falling = 0.01;
          this.eliminate(b.id);
        }
      }
      this.sync();
    } else if (this.phase === 'drop' && now >= this.until) {
      const humansAlive = [...this.alive].some((id) => this.room.players.has(id));
      if (this.alive.size <= 1 && this.startedWith > 1) this.finish();
      else if (this.alive.size === 0 || (!humansAlive && this.alive.size > 0)) this.finish();
      else this.newRound();
    } else if (this.phase === 'results' && now >= this.until) {
      this.phase = 'waiting';
      this.until = now + 1500;
      this.sync();
    }
  }
}
