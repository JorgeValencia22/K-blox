// Una sala = una instancia de una experiencia con su lista de jugadores,
// vehículos y estado compartido. El servidor es la autoridad del estado.
import { NET, VEHICLES } from '../../shared/constants.js';
import { worldSpawns } from '../../shared/worldSchema.js';
import { ANIMS, isVec3, plausibleMove, inBounds, dist3 } from './validation.js';
import { inviteCode } from '../security/passwords.js';
import { createMode } from './modes/index.js';
import { NpcManager } from './npcs.js';
import * as users from '../services/users.js';

let roomSeq = 1;

export class Room {
  /**
   * @param {object} opts { key, experienceId, worldId, name, world, visibility, maxPlayers, ownerId, mode }
   */
  constructor(opts) {
    this.id = `${opts.key}-${(roomSeq++).toString(36)}${Math.random().toString(36).slice(2, 6)}`;
    this.key = opts.key; // id de experiencia o de mundo
    this.name = opts.name;
    this.world = opts.world;
    this.worldIsBuiltin = !!opts.builtin;
    this.visibility = opts.visibility || 'public';
    this.inviteCode = this.visibility === 'private' ? inviteCode() : null;
    this.maxPlayers = opts.maxPlayers;
    this.ownerId = opts.ownerId || null;
    this.players = new Map();
    this.spectators = new Map(); // administradores invisibles: userId -> { socket, name }
    this.invited = new Set();
    this.recent = new Map(); // userId -> expiración (permite reconectar a salas privadas)
    this.createdAt = Date.now();
    this.emptySince = Date.now();
    this.messages = []; // últimos mensajes (para reportes verificables)
    this.spawns = worldSpawns(this.world);
    this.objects = new Map((this.world.objects || []).map((o) => [o.id, o]));
    this.state = { doors: {}, groups: {} };
    for (const o of this.world.objects || []) {
      if (o.t === 'water' && o.group) this.state.groups[o.group] = o.on !== false;
    }
    this.vehicles = new Map();
    for (const v of this.world.vehicles || []) this.addVehicle(v.id, v.type, v.p, v.ry);
    this.io = null;
    this.mode = createMode(opts.mode || 'custom', this);
    this.npcs = opts.builtin && NpcManager.supports(opts.key) ? new NpcManager(this, opts.key) : null;
  }

  get channel() {
    return `room:${this.id}`;
  }

  addVehicle(id, type, p, ry = 0, color = null) {
    const v = { id, type, color, p: [...p], r: [0, (ry * Math.PI) / 180, 0], s: 0, driver: null, spawn: { p: [...p], ry }, idleSince: Date.now() };
    this.vehicles.set(id, v);
    return v;
  }

  vehiclePublic(v) {
    return { id: v.id, type: v.type, p: v.p, r: v.r, driver: v.driver, color: v.color || undefined };
  }

  canJoin(user, { code } = {}) {
    if (this.players.has(user.id)) return { ok: true };
    if (this.players.size >= this.maxPlayers) return { error: 'La sala está llena' };
    if (this.visibility === 'private') {
      const recent = this.recent.get(user.id);
      const allowed = (code && code.toUpperCase() === this.inviteCode) || this.invited.has(user.id) || this.ownerId === user.id || (recent && recent > Date.now());
      if (!allowed) return { error: 'Esta sala es privada: necesitas una invitación o el código' };
    }
    return { ok: true };
  }

  info(forUserId) {
    const member = forUserId && (this.players.has(forUserId) || this.ownerId === forUserId);
    return {
      id: this.id, key: this.key, name: this.name, visibility: this.visibility, maxPlayers: this.maxPlayers,
      players: this.players.size, inviteCode: member ? this.inviteCode : undefined, builtin: this.worldIsBuiltin,
    };
  }

  playerPublic(p) {
    return { id: p.id, name: p.name, level: p.level, avatar: p.avatar, p: p.pos, ry: p.ry, a: p.anim, v: p.vehicleId };
  }

  join(socket, user) {
    const old = this.players.get(user.id);
    if (old) this.leave(user.id, { silent: true, keepVehicle: false });
    const spawn = this.spawns[Math.floor(Math.random() * this.spawns.length)];
    const p = {
      id: user.id, name: user.username, level: user.level, avatar: user.avatar, socket,
      pos: [spawn[0], spawn[1], spawn[2]], ry: 0, anim: 'idle', vehicleId: null,
      lastAccept: Date.now(), lastPos: [spawn[0], spawn[1], spawn[2]], violations: 0, violationWindow: Date.now(),
      joinedAt: Date.now(), interactAt: 0, data: {}, role: user.role,
      historyId: users.startHistory(user.id, this.key, this.name),
    };
    this.players.set(user.id, p);
    this.recent.delete(user.id);
    this.emptySince = 0;
    socket.join(this.channel);
    socket.to(this.channel).emit('player:join', this.playerPublic(p));

    users.updateStats(user.id, (s) => {
      s.gamesPlayed = (s.gamesPlayed || 0) + 1;
      s.visited = Array.isArray(s.visited) ? s.visited : [];
      if (!s.visited.includes(this.key)) s.visited.push(this.key);
    });
    users.unlockAchievement(user.id, 'first_steps');
    const visited = users.getUser(user.id).stats.visited || [];
    if (['city', 'obby', 'racing', 'survival', 'hangout'].every((k) => visited.includes(k))) users.unlockAchievement(user.id, 'explorer');

    const modeState = this.mode.onJoin(p) || {};
    this.systemMessage(`${p.name} se ha unido`);
    return {
      room: this.info(user.id),
      you: { id: user.id, spawn: p.pos },
      players: [...this.players.values()].filter((o) => o.id !== user.id).map((o) => this.playerPublic(o)).concat(this.npcs ? this.npcs.publicList() : [], this.mode.publicPlayers?.() || []),
      vehicles: [...this.vehicles.values()].map((v) => this.vehiclePublic(v)),
      state: this.state,
      mode: modeState,
      serverTime: Date.now(),
    };
  }

  addSpectator(socket, user) {
    this.spectators.set(user.id, { socket, name: user.username });
    socket.join(this.channel);
    return {
      room: this.info(user.id),
      you: { id: user.id, spawn: this.spawns[0], spectator: true },
      players: [...this.players.values()].map((o) => this.playerPublic(o)).concat(this.npcs ? this.npcs.publicList() : [], this.mode.publicPlayers?.() || []),
      vehicles: [...this.vehicles.values()].map((v) => this.vehiclePublic(v)),
      state: this.state,
      mode: this.mode.spectatorState?.() || {},
      serverTime: Date.now(),
    };
  }

  removeSpectator(userId) {
    const s = this.spectators.get(userId);
    if (!s) return;
    this.spectators.delete(userId);
    s.socket.leave(this.channel);
    for (const p of this.players.values()) if (p.controlledBy === userId) this.releaseControl(p);
  }

  releaseControl(p) {
    if (!p.controlledBy) return;
    p.controlledBy = null;
    p.socket.emit('admin:control', { on: false });
  }

  leave(userId, { silent = false } = {}) {
    const p = this.players.get(userId);
    if (!p) return;
    this.mode.onLeave(p);
    if (p.vehicleId) this.exitVehicle(p);
    this.players.delete(userId);
    p.socket.leave(this.channel);
    this.recent.set(userId, Date.now() + 60_000);
    const minutes = Math.round((Date.now() - p.joinedAt) / 60000);
    users.updateStats(userId, (s) => { s.playMinutes = (s.playMinutes || 0) + minutes; });
    users.endHistory(p.historyId);
    if (!silent) {
      this.io?.to(this.channel).emit('player:leave', { id: userId });
      this.systemMessage(`${p.name} ha salido`);
    }
    if (this.players.size === 0) this.emptySince = Date.now();
    for (const [uid, sp] of this.spectators) if (sp.target === userId) sp.socket.emit('admin:target-left', { id: userId });
  }

  systemMessage(text) {
    this.io?.to(this.channel).emit('chat', { id: `s${Date.now()}${Math.random()}`, kind: 'system', text, ts: Date.now() });
  }

  /** Recibe el estado de un jugador y lo valida antes de aceptarlo. */
  handleState(p, msg) {
    if (!msg || !isVec3(msg.p)) return;
    const now = Date.now();
    const veh = p.vehicleId ? this.vehicles.get(p.vehicleId) : null;
    if (!inBounds(msg.p, this.world.bounds) || !plausibleMove(p.lastPos, msg.p, now - p.lastAccept, veh?.type)) {
      this.flag(p, 'movement');
      p.socket.emit('correction', { p: p.lastPos });
      return;
    }
    p.pos = msg.p;
    p.lastPos = msg.p;
    p.lastAccept = now;
    p.ry = typeof msg.ry === 'number' && Number.isFinite(msg.ry) ? msg.ry : p.ry;
    p.anim = ANIMS.has(msg.a) ? msg.a : 'idle';
    if (veh && msg.v && isVec3(msg.v.p) && isVec3(msg.v.r)) {
      veh.p = msg.v.p;
      veh.r = msg.v.r;
      veh.s = Number.isFinite(msg.v.s) ? msg.v.s : 0;
    }
    this.mode.onState(p);
  }

  flag(p, kind) {
    const now = Date.now();
    if (now - p.violationWindow > 60_000) {
      p.violationWindow = now;
      p.violations = 0;
    }
    p.violations++;
    if (p.violations > 40) {
      console.warn(`[antitrampas] ${p.name} expulsado de ${this.id} (${kind})`);
      p.socket.emit('kicked', { reason: 'Movimiento no válido detectado' });
      this.leave(p.id);
    }
  }

  /** Teletransporte autorizado por el servidor (reaparición, salida de carrera...). */
  teleport(p, pos) {
    p.pos = [...pos];
    p.lastPos = [...pos];
    p.lastAccept = Date.now();
  }

  respawn(p, { resetVehicle = false } = {}) {
    if (p.vehicleId) {
      const v = this.vehicles.get(p.vehicleId);
      this.exitVehicle(p);
      // Tras un choque el vehículo vuelve a su punto de origen
      if (resetVehicle && v && v.spawn) {
        v.p = [...v.spawn.p];
        v.r = [0, (v.spawn.ry * Math.PI) / 180, 0];
        this.io?.to(this.channel).emit('vehicle', this.vehiclePublic(v));
      }
    }
    const pos = this.mode.getRespawn(p) || this.spawns[Math.floor(Math.random() * this.spawns.length)];
    this.teleport(p, pos);
    return pos;
  }

  enterVehicle(p, id) {
    const v = this.vehicles.get(id);
    if (!v) return { error: 'Vehículo no encontrado' };
    if (p.vehicleId) return { error: 'Ya estás en un vehículo' };
    if (v.driver) return { error: 'El vehículo está ocupado' };
    if (dist3(p.pos, v.p) > 7) return { error: 'Estás demasiado lejos' };
    v.driver = p.id;
    p.vehicleId = id;
    this.io?.to(this.channel).emit('vehicle', this.vehiclePublic(v));
    this.mode.onVehicle?.(p, v, true);
    return { ok: true, vehicle: this.vehiclePublic(v) };
  }

  exitVehicle(p) {
    const v = this.vehicles.get(p.vehicleId);
    p.vehicleId = null;
    if (!v) return;
    v.driver = null;
    v.s = 0;
    v.idleSince = Date.now();
    this.io?.to(this.channel).emit('vehicle', this.vehiclePublic(v));
    this.mode.onVehicle?.(p, v, false);
    p.lastAccept = Date.now();
  }

  /** Interacción con un objeto del mundo. */
  interact(p, objId, data) {
    const now = Date.now();
    if (now - p.interactAt < 150) return { error: 'Demasiado rápido' };
    p.interactAt = now;
    const o = this.objects.get(String(objId));
    if (!o) return this.mode.onCustomInteract?.(p, objId, data) || { error: 'Objeto no encontrado' };
    const reach = Math.max(o.s[0], o.s[2]) / 2 + 3.5;
    if (Math.hypot(p.pos[0] - o.p[0], p.pos[2] - o.p[2]) > reach || Math.abs(p.pos[1] - o.p[1]) > o.s[1] / 2 + 4) {
      return { error: 'Estás demasiado lejos' };
    }
    if (o.t === 'door') {
      this.state.doors[o.id] = !this.state.doors[o.id];
      this.io?.to(this.channel).emit('world:door', { id: o.id, open: this.state.doors[o.id] });
      return { ok: true };
    }
    if (o.t === 'switch') {
      this.state.groups[o.group] = !this.state.groups[o.group];
      this.io?.to(this.channel).emit('world:group', { group: o.group, on: this.state.groups[o.group], by: p.name });
      return { ok: true };
    }
    return this.mode.onInteract(p, o, data) || { error: 'No se puede interactuar' };
  }

  /** Se llama a la frecuencia de snapshots. */
  tick(dt) {
    this.mode.tick(dt);
    if (this.players.size === 0) return;
    this.npcs?.tick(dt);
    const players = [];
    for (const p of this.players.values()) {
      if (this.mode.hidden?.(p)) continue; // p. ej. eliminados en Kest Royale
      const e = { id: p.id, p: p.pos, ry: p.ry, a: p.anim };
      if (p.vehicleId) {
        const v = this.vehicles.get(p.vehicleId);
        if (v) e.v = { id: v.id, p: v.p, r: v.r, s: v.s };
      }
      players.push(e);
    }
    if (this.npcs) players.push(...this.npcs.snapEntries());
    // Los modos pueden añadir bots y datos propios (pelota, monstruo, tormenta...)
    const extra = this.mode.snapPlayers?.();
    if (extra) players.push(...extra);
    const snap = { t: Date.now(), players };
    const m = this.mode.snapExtra?.();
    if (m) snap.m = m;
    this.io?.to(this.channel).volatile.emit('snap', snap);

    // Devuelve a su sitio los vehículos abandonados o caídos.
    const now = Date.now();
    for (const v of this.vehicles.values()) {
      if (v.driver || !v.spawn) continue;
      const fell = v.p[1] < (this.world.bounds?.min[1] ?? -50);
      if (fell || (now - v.idleSince > 180_000 && dist3(v.p, v.spawn.p) > 3)) {
        v.p = [...v.spawn.p];
        v.r = [0, (v.spawn.ry * Math.PI) / 180, 0];
        v.idleSince = now;
        this.io?.to(this.channel).emit('vehicle', this.vehiclePublic(v));
      }
    }
  }

  static get SNAPSHOT_MS() {
    return 1000 / NET.snapshotRate;
  }
}

export { VEHICLES };
