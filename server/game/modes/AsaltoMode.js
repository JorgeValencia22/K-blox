// Asalto a la Casa: el servidor lleva el día/noche, los objetos, las tablas de cada
// ventana, la vida de los jugadores y a Los Encapuchados (que siguen rutas fijas
// hasta un hueco, rompen las tablas, entran y van a por el tesoro o los jugadores).
import { BaseMode } from './BaseMode.js';
import * as users from '../../services/users.js';
import { ASALTO, ITEMS, FOODS, ROLES } from '../../../shared/worlds/asalto.js';
import { randomAvatar } from '../../../shared/avatar.js';
import { mulberry32 } from '../../../shared/terrain.js';

const FISTS = { dmg: 10, cd: 450 };
const NIGHT_BASE = [5, 8, 8];
const STEAL_SECONDS = 15;
const KO_MS = 8000;
const NAMES = ['Ratón', 'Sombra', 'Calcetín', 'Pelusa', 'Chicle', 'Tornillo', 'Pepinillo', 'Zapato', 'Bigotito', 'Linterna'];
const r2 = (v) => Math.round(v * 100) / 100;
const dist = (a, b) => Math.hypot(a[0] - b[0], a[2] - b[2]);

export class AsaltoMode extends BaseMode {
  constructor(room) {
    super(room);
    this.meta = this.world.meta;
    this.rng = mulberry32(Date.now() % 1e6);
    this.seq = 0;
    this.reset();
  }

  reset() {
    this.night = 1;
    this.boards = Object.fromEntries(this.meta.openings.map((o) => [o.id, 0]));
    this.bandits = new Map();
    this.queue = [];
    this.steal = 0;
    this.startDay(ASALTO.dayFirst);
  }

  // --- Estado público --------------------------------------------------------------
  publicState() {
    return {
      phase: this.phase, night: this.night, until: this.until, boards: this.boards,
      items: [...this.items.values()], left: this.bandits.size + this.queue.length,
    };
  }

  sync() {
    this.broadcast('asalto', this.publicState());
  }

  me(p) {
    const d = p.data;
    return { hp: Math.round(d.hp), role: d.role, weapon: d.weapon, inv: d.inv, ko: d.koUntil > Date.now() };
  }

  sendMe(p) {
    this.emit(p, 'asalto:me', this.me(p));
  }

  spectatorState() {
    return { asalto: this.publicState() };
  }

  onJoin(p) {
    const roles = Object.keys(ROLES);
    p.data = { hp: 100, role: roles[Math.floor(Math.random() * roles.length)], weapon: null, inv: { plank: 1, apple: 1 }, koUntil: 0, hitAt: 0, act: 0 };
    return { asalto: this.publicState(), me: this.me(p) };
  }

  publicPlayers() {
    return [...this.bandits.values()].map((b) => this.banditPublic(b));
  }

  banditPublic(b) {
    return { id: b.id, name: b.name, title: b.boss ? 'JEFE' : 'Encapuchado', level: b.boss ? 'JEFE' : '', bot: true, avatar: b.avatar, p: b.pos, ry: b.ry, a: b.anim };
  }

  snapPlayers() {
    return [...this.bandits.values()].map((b) => ({ id: b.id, p: b.pos.map(r2), ry: r2(b.ry), a: b.anim }));
  }

  snapExtra() {
    const boss = [...this.bandits.values()].find((b) => b.boss);
    return { tr: r2(this.steal / STEAL_SECONDS), bh: boss ? [Math.round(boss.hp), boss.maxHp] : null };
  }

  // --- Fases ------------------------------------------------------------------------
  startDay(seconds) {
    this.phase = 'day';
    this.until = Date.now() + seconds * 1000;
    this.steal = 0;
    // Objetos nuevos por el jardín y la casa
    this.items = new Map();
    const spots = [...this.meta.itemSpots].sort(() => this.rng() - 0.5).slice(0, 15);
    spots.forEach((p, i) => {
      const r = this.rng();
      const type = r < 0.38 ? 'plank' : r < 0.68 ? FOODS[Math.floor(this.rng() * FOODS.length)] : r < 0.76 ? 'medkit' : ['pan', 'bat', 'hammer'][Math.floor(this.rng() * 3)];
      const id = `it${++this.seq}`;
      this.items.set(id, { id, type, p });
    });
  }

  startNight() {
    this.phase = 'night';
    this.until = Date.now() + ASALTO.nightMax * 1000;
    const humans = Math.max(1, this.room.players.size);
    const n = Math.round(NIGHT_BASE[this.night - 1] * (0.7 + 0.3 * humans));
    this.queue = Array.from({ length: n }, (_, i) => ({ at: Date.now() + 5000 + i * 4200, boss: false }));
    if (this.night === ASALTO.nights) this.queue.splice(Math.floor(n / 2), 0, { at: 0, boss: true });
    this.room.systemMessage(this.night === ASALTO.nights
      ? '🌙 ¡Última noche! El Gran Bigotón viene en persona…'
      : `🌙 Noche ${this.night}: ¡Los Encapuchados se acercan! Defended el tesoro.`);
    this.sync();
  }

  endNight(survived) {
    for (const b of this.bandits.values()) this.broadcast('player:leave', { id: b.id });
    this.bandits.clear();
    this.queue = [];
    if (!survived) {
      this.phase = 'lost';
      this.until = Date.now() + 10000;
      this.room.systemMessage('💰 ¡Se han llevado el tesoro familiar! Volved a intentarlo.');
      for (const p of this.room.players.values()) users.setHistoryResult(p.historyId, `Perdió en la noche ${this.night}`);
      this.sync();
      return;
    }
    for (const p of this.room.players.values()) {
      const last = this.night === ASALTO.nights;
      const coins = users.dailyCapped(p.id, 'asalto', last ? 70 : 15, 120);
      users.award(p.id, { xp: last ? 220 : 60, coins, reason: last ? '¡Habéis salvado la casa!' : `Noche ${this.night} superada` });
      if (last) {
        users.unlockAchievement(p.id, 'asalto_win');
        users.updateStats(p.id, (s) => { s.wins = (s.wins || 0) + 1; });
        users.setHistoryResult(p.historyId, '¡Salvó la casa!');
      }
    }
    if (this.night === ASALTO.nights) {
      this.phase = 'won';
      this.until = Date.now() + 12000;
      this.room.systemMessage('🏆 ¡El Gran Bigotón huye! La casa está a salvo.');
    } else {
      this.night++;
      this.room.systemMessage('☀️ ¡Ha amanecido! Buscad más tablas y comida antes de la próxima noche.');
      this.startDay(ASALTO.dayNext);
    }
    this.sync();
  }

  // --- Ladrones -------------------------------------------------------------------
  spawnBandit(boss) {
    const id = `${boss ? 'asboss' : 'asb'}${++this.seq}`;
    const avatar = randomAvatar(mulberry32(this.seq * 13 + 3));
    Object.assign(avatar, boss
      ? { shirt: 'shirt_suit', shirtColor: '#212121', pants: 'pants_jeans', pantsColor: '#212121', hair: 'hair_short', hairColor: '#212121', face: 'face_evil', accessories: ['acc_tophat', 'acc_sunglasses'] }
      : { shirt: 'shirt_hoodie', shirtColor: ['#263238', '#37474f', '#4a148c', '#1b5e20'][this.seq % 4], pants: 'pants_jeans', pantsColor: '#212121', face: 'face_evil', accessories: ['acc_ninjamask', 'acc_beanie'] });
    const open = this.meta.openings[Math.floor(this.rng() * this.meta.openings.length)];
    const start = this.meta.street[Math.floor(this.rng() * this.meta.street.length)];
    const maxHp = boss ? 450 + 150 * Math.max(1, this.room.players.size) : 60;
    const b = {
      id, boss, name: boss ? 'El Gran Bigotón' : `${NAMES[this.seq % NAMES.length]}`, avatar,
      pos: [...start], ry: Math.PI, anim: 'walk', hp: maxHp, maxHp, open, step: 0, state: 'route', hitAt: 0,
    };
    this.bandits.set(id, b);
    this.broadcast('player:join', this.banditPublic(b));
    if (boss) this.broadcast('asalto:boss', { id });
  }

  moveTo(b, target, speed, dt) {
    const dx = target[0] - b.pos[0], dz = target[2] - b.pos[2], d = Math.hypot(dx, dz);
    if (d < 0.05) return true;
    const s = Math.min(d, speed * dt);
    b.pos[0] += (dx / d) * s;
    b.pos[2] += (dz / d) * s;
    b.ry = Math.atan2(dx, dz);
    b.anim = speed > 4.5 ? 'run' : 'walk';
    return d - s < 0.1;
  }

  insideHouse(pos) {
    const { hx, hz } = ASALTO.house;
    return Math.abs(pos[0]) < hx - 0.2 && Math.abs(pos[2]) < hz - 0.2;
  }

  tickBandit(b, dt, now) {
    const speed = b.boss ? 2.6 : 3.1;
    const o = b.open;
    if (b.state === 'route') {
      const wp = o.route[b.step];
      if (this.moveTo(b, wp, speed, dt)) {
        b.step++;
        if (b.step >= o.route.length) b.state = 'break';
      }
      return;
    }
    if (b.state === 'break') {
      b.ry = Math.atan2(o.int[0] - b.pos[0], o.int[2] - b.pos[2]);
      if (this.boards[o.id] > 0) {
        b.anim = 'attack';
        if (now - b.hitAt > 1100) {
          b.hitAt = now;
          this.boards[o.id] = Math.max(0, this.boards[o.id] - (b.boss ? 40 : 12));
          this.broadcast('asalto:boards', { id: o.id, hp: this.boards[o.id], hit: true });
        }
        return;
      }
      if (this.moveTo(b, o.int, speed, dt)) b.state = 'inside';
      return;
    }
    // Dentro de la casa: a por el jugador más cercano o a por el tesoro
    let target = null, td = 9;
    for (const p of this.room.players.values()) {
      if (p.data.koUntil > now || !this.insideHouse(p.pos)) continue;
      const d = dist(p.pos, b.pos);
      if (d < td) { td = d; target = p; }
    }
    if (target) {
      if (td > 1.4) this.moveTo(b, target.pos, speed * 1.15, dt);
      else {
        b.anim = 'attack';
        b.ry = Math.atan2(target.pos[0] - b.pos[0], target.pos[2] - b.pos[2]);
        if (now - b.hitAt > 1200) {
          b.hitAt = now;
          this.hurt(target, b.boss ? 20 : 8, b.name);
        }
      }
      return;
    }
    const t = ASALTO.treasure;
    if (dist(b.pos, t) > 1.7) this.moveTo(b, t, speed, dt);
    else {
      b.anim = 'attack';
      // Si alguien de la familia está junto al tesoro, no pueden llevárselo
      const guarded = [...this.room.players.values()].some((p) => p.data.koUntil < now && dist(p.pos, t) < 3.5);
      if (!guarded) this.steal += dt;
    }
  }

  hurt(p, amount, by) {
    const d = p.data;
    d.hp = Math.max(0, d.hp - amount);
    this.emit(p, 'asalto:hurt', { by, hp: d.hp });
    if (d.hp <= 0) {
      d.koUntil = Date.now() + KO_MS;
      this.room.systemMessage(`💫 ${p.name} se ha mareado… vuelve en unos segundos`);
    }
    this.sendMe(p);
  }

  // --- Acciones de los jugadores ---------------------------------------------------
  onEvent(p, name, data = {}) {
    const d = p.data;
    const now = Date.now();
    if (name === 'role') {
      if (!ROLES[data.id]) return { error: 'Rol desconocido' };
      if (this.phase === 'night') return { error: 'No puedes cambiar de rol durante la noche' };
      d.role = data.id;
      this.sendMe(p);
      return { ok: true };
    }
    if (d.koUntil > now) return { error: 'Estás mareado' };
    if (name === 'hit') {
      const w = d.weapon ? ITEMS[d.weapon] : FISTS;
      if (now - d.hitAt < w.cd) return { error: 'cadencia' };
      d.hitAt = now;
      let best = null, bd = Infinity;
      for (const b of this.bandits.values()) {
        const dd = dist(b.pos, p.pos);
        if (dd < (b.boss ? 3.8 : 3) && dd < bd) { bd = dd; best = b; }
      }
      if (!best) return { ok: true, hit: false };
      const dmg = Math.round(w.dmg * (d.role === 'deportista' ? 1.5 : 1));
      best.hp -= dmg;
      this.broadcast('asalto:hit', { id: best.id, by: p.name, dmg });
      if (best.hp <= 0) {
        this.bandits.delete(best.id);
        this.broadcast('player:leave', { id: best.id });
        this.broadcast('asalto:flee', { id: best.id, name: best.name, by: p.name, boss: best.boss });
        users.award(p.id, { xp: best.boss ? 120 : 15, reason: best.boss ? '¡Has echado al Gran Bigotón!' : '' });
      }
      return { ok: true, hit: true, dmg };
    }
    if (name === 'pick') {
      const it = this.items.get(String(data.id));
      if (!it) return { error: 'Ya lo ha cogido alguien' };
      if (dist(it.p, p.pos) > 2.6) return { error: 'Acércate más' };
      this.items.delete(it.id);
      if (ITEMS[it.type].weapon) d.weapon = it.type;
      else d.inv[it.type] = (d.inv[it.type] || 0) + 1;
      this.broadcast('asalto:item', { id: it.id, gone: true });
      this.sendMe(p);
      return { ok: true, type: it.type };
    }
    if (name === 'board') {
      const o = this.meta.openings.find((x) => x.id === data.id);
      if (!o) return { error: 'No hay nada que tapiar' };
      if (Math.min(dist(o.int, p.pos), dist(o.ext, p.pos)) > 3) return { error: 'Acércate más' };
      if (!(d.inv.plank > 0)) return { error: 'Necesitas tablas: búscalas por la casa y el jardín' };
      const max = ASALTO.boardsMax * ASALTO.boardHp;
      if (this.boards[o.id] >= max) return { error: 'Ya está bien tapiada' };
      if (now - d.act < 400) return { error: 'cadencia' };
      d.act = now;
      d.inv.plank--;
      this.boards[o.id] = Math.min(max, this.boards[o.id] + ASALTO.boardHp * (d.role === 'manitas' ? 2 : 1));
      this.broadcast('asalto:boards', { id: o.id, hp: this.boards[o.id] });
      this.sendMe(p);
      return { ok: true };
    }
    if (name === 'eat') {
      const type = String(data.type);
      if (!ITEMS[type]?.heal || !(d.inv[type] > 0)) return { error: 'No tienes eso' };
      if (d.hp >= 100) return { error: 'Ya tienes toda la vida' };
      d.inv[type]--;
      const heal = ITEMS[type].heal * (d.role === 'cocinero' && type !== 'medkit' ? 2 : 1);
      d.hp = Math.min(100, d.hp + heal);
      if (d.role === 'enfermero') {
        for (const o of this.room.players.values()) {
          if (o !== p && o.data.koUntil < now && dist(o.pos, p.pos) < 6) {
            o.data.hp = Math.min(100, o.data.hp + heal / 2);
            this.sendMe(o);
          }
        }
      }
      this.sendMe(p);
      return { ok: true, hp: d.hp };
    }
    return { error: 'Evento no soportado' };
  }

  getRespawn(p) {
    const s = this.room.spawns;
    return s[Math.floor(Math.random() * s.length)];
  }

  adminLose(p) {
    this.hurt(p, 999, 'admin');
    return true;
  }

  tick(dt) {
    const now = Date.now();
    if (this.room.players.size === 0) {
      if (this.phase !== 'day' || this.night !== 1) {
        for (const b of this.bandits.values()) this.broadcast('player:leave', { id: b.id });
        this.reset();
      }
      return;
    }
    // Jugadores mareados: vuelven a estar bien dentro de casa
    for (const p of this.room.players.values()) {
      const d = p.data;
      if (d.koUntil && d.koUntil <= now) {
        d.koUntil = 0;
        d.hp = 60;
        const pos = this.getRespawn(p);
        this.room.teleport(p, pos);
        this.emit(p, 'respawn', { p: pos });
        this.sendMe(p);
      }
    }
    if (this.phase === 'day' && now >= this.until) this.startNight();
    else if ((this.phase === 'won' || this.phase === 'lost') && now >= this.until) {
      this.reset();
      for (const p of this.room.players.values()) {
        p.data.hp = 100;
        p.data.inv = { plank: 1, apple: 1 };
        p.data.weapon = null;
        const pos = this.getRespawn(p);
        this.room.teleport(p, pos);
        this.emit(p, 'respawn', { p: pos });
        this.sendMe(p);
      }
      this.sync();
    } else if (this.phase === 'night') {
      while (this.queue.length && this.queue[0].at <= now) this.spawnBandit(this.queue.shift().boss);
      for (const b of this.bandits.values()) this.tickBandit(b, dt, now);
      const stealing = [...this.bandits.values()].some((b) => b.state === 'inside' && dist(b.pos, ASALTO.treasure) <= 1.8);
      if (!stealing) this.steal = Math.max(0, this.steal - dt * 0.5);
      if (this.steal >= STEAL_SECONDS) this.endNight(false);
      else if ((!this.queue.length && !this.bandits.size) || now >= this.until) this.endNight(true);
    }
  }
}
