// Supervivencia: recursos, hambre, construcción por cuadrícula y criaturas nocturnas
// simuladas en el servidor.
import { BaseMode } from './BaseMode.js';
import * as users from '../../services/users.js';
import { getHeightmap } from '../../../shared/terrain.js';
import { dist3 } from '../validation.js';

const NODE_HP = { tree: 5, rock: 6, bush: 3 };
const NODE_YIELD = { tree: 'wood', rock: 'stone', bush: 'berry' };
const NODE_RESPAWN_MS = 60_000;
const MAX_BLOCKS = 400;
const BLOCK = 2; // tamaño de la cuadrícula de construcción
const ENEMY_SPEED = 4.2;

export class SurvivalMode extends BaseMode {
  constructor(room) {
    super(room);
    this.hm = getHeightmap(this.world.terrain);
    this.dayLength = (this.world.meta?.dayLength || 240) * 1000;
    this.nightStart = this.world.meta?.nightStart ?? 0.55;
    this.start = Date.now() - this.dayLength * 0.2; // empieza por la mañana
    this.nodes = new Map();
    for (const o of this.objectsOfType('resource')) this.nodes.set(o.id, { o, hp: NODE_HP[o.kind], alive: true, respawnAt: 0 });
    this.blocks = new Map(); // "x,y,z" -> {id,x,y,z,mat,owner}
    this.blockSeq = 1;
    this.enemies = new Map();
    this.enemySeq = 1;
    this.wasNight = false;
    this.nightCount = 0;
    this.acc = 0;
  }

  dayTime(now = Date.now()) {
    return ((now - this.start) % this.dayLength) / this.dayLength;
  }

  isNight() {
    return this.dayTime() >= this.nightStart;
  }

  me(p) {
    const d = p.data;
    return { hp: Math.round(d.hp), hunger: Math.round(d.hunger), inv: d.inv, nights: d.nights };
  }

  sendMe(p) {
    this.emit(p, 'surv:me', this.me(p));
  }

  onJoin(p) {
    p.data = { hp: 100, hunger: 100, inv: { wood: 0, stone: 0, berry: 2 }, nights: 0, nightEligible: !this.isNight(), lastAction: 0, hurtAt: 0 };
    return {
      survival: {
        me: this.me(p),
        start: this.start, dayLength: this.dayLength, nightStart: this.nightStart,
        depleted: [...this.nodes.entries()].filter(([, n]) => !n.alive).map(([id]) => id),
        blocks: [...this.blocks.values()],
        enemies: this.enemyList(),
      },
    };
  }

  enemyList() {
    return [...this.enemies.values()].map((e) => ({ id: e.id, p: e.p, hp: e.hp }));
  }

  throttle(p, ms = 350) {
    const now = Date.now();
    if (now - p.data.lastAction < ms) return false;
    p.data.lastAction = now;
    return true;
  }

  onEvent(p, name, data = {}) {
    const d = p.data;
    if (d.hp <= 0) return { error: 'Estás fuera de combate' };
    if (!this.throttle(p)) return { error: 'Demasiado rápido' };

    if (name === 'gather') {
      const n = this.nodes.get(String(data.id));
      if (!n || !n.alive) return { error: 'Recurso agotado' };
      if (Math.hypot(p.pos[0] - n.o.p[0], p.pos[2] - n.o.p[2]) > 4.5) return { error: 'Demasiado lejos' };
      n.hp--;
      const res = NODE_YIELD[n.o.kind];
      d.inv[res] = Math.min(999, d.inv[res] + (res === 'berry' ? 1 : 1));
      if (n.hp <= 0) {
        n.alive = false;
        n.respawnAt = Date.now() + NODE_RESPAWN_MS;
        this.broadcast('surv:node', { id: n.o.id, alive: false });
      }
      this.sendMe(p);
      return { ok: true, res };
    }

    if (name === 'eat') {
      if (d.inv.berry <= 0) return { error: 'No tienes bayas' };
      d.inv.berry--;
      d.hunger = Math.min(100, d.hunger + 25);
      d.hp = Math.min(100, d.hp + 6);
      this.sendMe(p);
      return { ok: true };
    }

    if (name === 'build') {
      const mat = data.mat === 'stone' ? 'stone' : 'wood';
      if (d.inv[mat] < 2) return { error: `Necesitas 2 de ${mat === 'stone' ? 'piedra' : 'madera'}` };
      if (this.blocks.size >= MAX_BLOCKS) return { error: 'Límite de bloques alcanzado' };
      const x = Math.round(Number(data.x) / BLOCK) * BLOCK, z = Math.round(Number(data.z) / BLOCK) * BLOCK;
      const y = Math.round(Number(data.y) / BLOCK) * BLOCK;
      if (![x, y, z].every(Number.isFinite)) return { error: 'Posición inválida' };
      if (dist3([x, y, z], p.pos) > 9) return { error: 'Demasiado lejos' };
      const ground = this.hm.heightAt(x, z);
      if (y < ground - BLOCK || y > ground + 30) return { error: 'Posición inválida' };
      // No construir encima de un jugador
      for (const o of this.room.players.values()) {
        if (Math.abs(o.pos[0] - x) < 1.4 && Math.abs(o.pos[2] - z) < 1.4 && o.pos[1] < y + 1 && o.pos[1] + 2 > y - 1) return { error: 'Hay alguien ahí' };
      }
      const key = `${x},${y},${z}`;
      if (this.blocks.has(key)) return { error: 'Ya hay un bloque' };
      d.inv[mat] -= 2;
      const b = { id: `sb${this.blockSeq++}`, x, y, z, mat, owner: p.id };
      this.blocks.set(key, b);
      this.broadcast('surv:block', { add: b });
      this.sendMe(p);
      return { ok: true };
    }

    if (name === 'break') {
      const b = [...this.blocks.values()].find((bb) => bb.id === data.id);
      if (!b) return { error: 'Bloque no encontrado' };
      if (dist3([b.x, b.y, b.z], p.pos) > 7) return { error: 'Demasiado lejos' };
      this.blocks.delete(`${b.x},${b.y},${b.z}`);
      d.inv[b.mat] += 1;
      this.broadcast('surv:block', { remove: b.id });
      this.sendMe(p);
      return { ok: true };
    }

    if (name === 'attack') {
      const e = this.enemies.get(String(data.id));
      if (!e) return { error: 'Objetivo no encontrado' };
      if (dist3(e.p, p.pos) > 4) return { error: 'Demasiado lejos' };
      e.hp--;
      // Empujón
      const dx = e.p[0] - p.pos[0], dz = e.p[2] - p.pos[2], l = Math.hypot(dx, dz) || 1;
      e.p[0] += (dx / l) * 2.5;
      e.p[2] += (dz / l) * 2.5;
      if (e.hp <= 0) {
        this.enemies.delete(e.id);
        this.broadcast('surv:enemy', { remove: e.id });
        const coins = users.dailyCapped(p.id, 'survival_kill', 4, 120);
        users.award(p.id, { xp: 15, coins, reason: 'Criatura derrotada' });
        users.updateStats(p.id, (s) => { s.kills = (s.kills || 0) + 1; });
      }
      return { ok: true };
    }
    return { error: 'Evento no soportado' };
  }

  damage(p, amount) {
    const d = p.data;
    if (d.hp <= 0) return;
    d.hp = Math.max(0, d.hp - amount);
    if (d.hp <= 0) {
      d.inv.wood = Math.floor(d.inv.wood / 2);
      d.inv.stone = Math.floor(d.inv.stone / 2);
      d.nightEligible = false;
      this.emit(p, 'surv:dead', {});
      this.room.systemMessage(`💀 ${p.name} ha caído`);
      setTimeout(() => {
        if (!this.room.players.has(p.id)) return;
        d.hp = 100;
        d.hunger = Math.max(d.hunger, 60);
        const pos = this.room.respawn(p);
        this.emit(p, 'respawn', { p: pos });
        this.sendMe(p);
      }, 3000);
    }
  }

  spawnEnemy() {
    const players = [...this.room.players.values()].filter((p) => p.data.hp > 0);
    if (!players.length) return;
    const t = players[Math.floor(Math.random() * players.length)];
    const a = Math.random() * Math.PI * 2, r = 25 + Math.random() * 15;
    const x = t.pos[0] + Math.cos(a) * r, z = t.pos[2] + Math.sin(a) * r;
    const h = this.hm.heightAt(x, z);
    if (h < 0.5 || Math.abs(x) > 140 || Math.abs(z) > 140) return;
    const e = { id: `e${this.enemySeq++}`, p: [x, h, z], hp: 3 };
    this.enemies.set(e.id, e);
  }

  blockedAt(x, y, z) {
    const gx = Math.round(x / BLOCK) * BLOCK, gz = Math.round(z / BLOCK) * BLOCK;
    for (let gy = Math.round(y / BLOCK) * BLOCK - BLOCK; gy <= y + 2; gy += BLOCK) {
      if (this.blocks.has(`${gx},${gy},${gz}`)) return true;
    }
    return false;
  }

  tick(dt) {
    const now = Date.now();
    const night = this.isNight();

    // Recursos que reaparecen
    for (const n of this.nodes.values()) {
      if (!n.alive && now >= n.respawnAt) {
        n.alive = true;
        n.hp = NODE_HP[n.o.kind];
        this.broadcast('surv:node', { id: n.o.id, alive: true });
      }
    }

    // Transiciones día/noche
    if (night && !this.wasNight) {
      for (const p of this.room.players.values()) p.data.nightEligible = p.data.hp > 0;
      this.room.systemMessage('🌙 Cae la noche... ¡cuidado con las criaturas!');
    } else if (!night && this.wasNight) {
      this.nightCount++;
      for (const p of this.room.players.values()) {
        if (p.data.nightEligible && p.data.hp > 0) {
          p.data.nights++;
          users.updateStats(p.id, (s) => { s.nightsSurvived = (s.nightsSurvived || 0) + 1; });
          const coins = users.dailyCapped(p.id, 'survival_night', 40, 160);
          users.award(p.id, { xp: 100, coins, reason: '¡Has sobrevivido a la noche!' });
          users.unlockAchievement(p.id, 'survivor');
          users.setHistoryResult(p.historyId, `${p.data.nights} noche(s) superada(s)`);
          this.sendMe(p);
        }
      }
      if (this.enemies.size) {
        for (const id of this.enemies.keys()) this.broadcast('surv:enemy', { remove: id });
        this.enemies.clear();
      }
      this.room.systemMessage('☀️ Amanece. Las criaturas se esconden.');
    }
    this.wasNight = night;

    const players = [...this.room.players.values()];
    // Hambre
    for (const p of players) {
      const d = p.data;
      if (d.hp <= 0) continue;
      d.hunger = Math.max(0, d.hunger - dt * 0.3);
      if (d.hunger <= 0) this.damage(p, dt * 1.5);
    }

    // Criaturas
    if (night && players.length) {
      const cap = 3 + players.length * 2;
      if (this.enemies.size < cap && Math.random() < dt * 0.5) this.spawnEnemy();
      for (const e of this.enemies.values()) {
        let target = null, best = 40;
        for (const p of players) {
          if (p.data.hp <= 0) continue;
          const dd = dist3(e.p, p.pos);
          if (dd < best) { best = dd; target = p; }
        }
        if (!target) continue;
        const dx = target.pos[0] - e.p[0], dz = target.pos[2] - e.p[2], l = Math.hypot(dx, dz);
        if (l > 1.2) {
          const step = Math.min(l - 1, ENEMY_SPEED * dt);
          const nx = e.p[0] + (dx / l) * step, nz = e.p[2] + (dz / l) * step;
          // Los bloques construidos frenan a las criaturas (se desliza por los ejes).
          if (!this.blockedAt(nx, e.p[1], nz)) { e.p[0] = nx; e.p[2] = nz; }
          else if (!this.blockedAt(nx, e.p[1], e.p[2])) e.p[0] = nx;
          else if (!this.blockedAt(e.p[0], e.p[1], nz)) e.p[2] = nz;
          e.p[1] = Math.max(this.hm.heightAt(e.p[0], e.p[2]), 0);
        }
        if (best < 1.8 && Math.abs(target.pos[1] - e.p[1]) < 2.2) {
          this.damage(target, dt * 14);
          if (now - target.data.hurtAt > 400) {
            target.data.hurtAt = now;
            this.sendMe(target);
            this.emit(target, 'surv:hurt', {});
          }
        }
      }
    }
    this.acc += dt;
    if (this.acc >= 0.1) {
      this.acc = 0;
      if (this.enemies.size) this.broadcast('surv:enemies', this.enemyList());
    }
    this.meAcc = (this.meAcc || 0) + dt;
    if (this.meAcc >= 2) {
      this.meAcc = 0;
      for (const p of players) this.sendMe(p);
    }
  }

  getRespawn() {
    return this.room.spawns[Math.floor(Math.random() * this.room.spawns.length)];
  }
}
