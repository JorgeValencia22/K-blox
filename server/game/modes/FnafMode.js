// Turno de Noche (Pizzería Kesty): survival horror de guardias de seguridad.
// El servidor es la autoridad de todo: energía, puertas, luces, cámaras que se miran,
// IA de los animatrónicos, forcejeos, tareas, eventos, victorias y recompensas.
//
// Fases: lobby (elegir modalidad, noche y especialidad) → night → result → lobby.
// Modalidades: classic (guardia cooperativo), team (supervivencia por equipos con tareas
// y eventos), versus (animatrónicos jugadores contra guardias) y last (último superviviente).
import { BaseMode } from './BaseMode.js';
import * as users from '../../services/users.js';
import { getDb } from '../../db/database.js';
import {
  FNAF, ANIMATRONICS, ANIM_IDS, NODES, CAM_OF_NODE, CAM_BY_ID, ROUTES, HOME, NIGHTS, MAX_NIGHT, FNAF_MODES, ROLES,
  NAV, NAV_ADJ, NAV_DOOR, FOX_RUN, nodePos, stepsToDoor, inOffice, roomAt, nearestNav, navPath,
} from '../../../shared/worlds/fnaf.js';

const STEPS = Object.fromEntries(ANIM_IDS.map((a) => [a, stepsToDoor(a)]));
const xz = (a, b) => Math.hypot(a[0] - b[0], a[2] - b[2]);
const clampAi = (v) => Math.max(0, Math.min(20, Math.round(v)));
const pick = (list) => list[Math.floor(Math.random() * list.length)];
const round1 = (v) => Math.round(v * 10) / 10;

// Tareas arriesgadas del modo Supervivencia por equipos (fuera de la oficina)
export const TASKS = {
  gen: { name: 'Recarga el generador de Bastidores', pos: [-15, 0, -23.3], power: 12 },
  music: { name: 'Da cuerda a la caja de música de la Cala Pirata', pos: [-15.5, 0, -7], fox: true },
  fuse: { name: 'Cambia el fusible del Almacén', pos: [-13.5, 0, 9], power: 7 },
  oven: { name: 'Apaga el horno de la Cocina', pos: [19.6, 0, -8], power: 5, penalty: 6 },
  prize: { name: 'Recoge la caja de premios del escenario', pos: [0, 0.8, -17.4], coins: 15 },
  tap: { name: 'Cierra el grifo de los Baños', pos: [15, 0, -23], power: 5, penalty: 4 },
};
const EVENTS = {
  surge: '⚡ ¡Subida de tensión! Se ha perdido energía',
  jam: '🚪 ¡Una puerta se ha atascado abierta!',
  camfail: '📹 Las cámaras se han caído un momento',
  frenzy: '😈 Los animatrónicos se han puesto nerviosos…',
  flicker: '💡 Las luces de la oficina parpadean…',
  batteries: '🔋 Han aparecido pilas nuevas por la pizzería',
};

export class FnafMode extends BaseMode {
  constructor(room) {
    super(room);
    this.phase = 'lobby';
    this.host = null;
    this.cfg = { mode: 'classic', night: 1, custom: null };
    this.n = null; // estado de la noche
    this.results = null;
    this.syncAt = 0;
    this.dirty = true;
    this.room.state.groups.fnafLights = true;
    this.room.state.groups.office = true;
  }

  // --- Jugadores -------------------------------------------------------------------------
  f(p) {
    if (!p.data.fnaf) p.data.fnaf = { role: 'free', wantAnim: null, alive: false, guard: false, anim: null, cam: null, spectator: false, bat: 100, flashAt: 0, task: null };
    return p.data.fnaf;
  }

  onJoin(p) {
    const f = this.f(p);
    if (!this.host || !this.room.players.has(this.host)) this.host = p.id;
    if (this.phase !== 'lobby') {
      // Llega a mitad de noche: mira las cámaras desde la cabina hasta la próxima
      f.spectator = true;
      f.alive = false;
      this.room.teleport(p, FNAF.booth);
      p.pos = [...FNAF.booth];
    }
    this.dirty = true;
    return { fnaf: this.publicState() };
  }

  onLeave(p) {
    const f = this.f(p);
    if (this.host === p.id) {
      const next = [...this.room.players.values()].find((o) => o.id !== p.id);
      this.host = next ? next.id : null;
    }
    if (this.n && f.anim) {
      const a = this.n.anims[f.anim];
      if (a) a.controller = null; // la IA toma el control
      this.room.systemMessage(`🤖 ${ANIMATRONICS[f.anim].name} vuelve a moverse solo`);
    }
    if (this.n) {
      f.alive = false;
      this.n.guards.delete(p.id);
      if (this.room.players.size <= 1) this.endNight('abandon');
      else this.checkEnd();
    }
    this.dirty = true;
  }

  hidden(p) {
    const f = p.data.fnaf;
    return !!f && this.phase !== 'lobby' && (f.spectator || !!f.anim || !f.alive);
  }

  getRespawn(p) {
    const f = this.f(p);
    if (this.phase === 'lobby' || this.phase === 'result') return pick(FNAF.lobbySpawns);
    if (f.alive && f.guard) return pick(FNAF.officeSpawns);
    return FNAF.booth;
  }

  adminLose(p) {
    if (!this.n || !this.f(p).alive) return false;
    this.killGuard(p, 'bear');
    return true;
  }

  // --- Estado público ------------------------------------------------------------------------
  publicState() {
    const n = this.n;
    return {
      phase: this.phase, host: this.host, cfg: this.cfg,
      players: [...this.room.players.values()].map((p) => {
        const f = this.f(p);
        return { id: p.id, name: p.name, role: f.role, wantAnim: f.wantAnim, anim: f.anim, alive: f.alive, guard: f.guard, spectator: f.spectator };
      }),
      night: n && {
        num: n.num, mode: n.mode, start: n.start, end: n.end, doors: n.doors, lights: n.lights, jam: n.jam, broken: n.broken,
        eco: n.eco, boostUsed: n.boostUsed, camsOff: n.camsOff, staticUntil: n.staticUntil, blackout: n.blackout ? n.blackout.stage : 0,
        tasks: n.tasks.map((t) => ({ id: t.id, name: TASKS[t.id].name, pos: TASKS[t.id].pos, until: t.until })),
        done: n.tasksDone, batteries: n.batteries, levels: Object.fromEntries(ANIM_IDS.map((a) => [a, n.anims[a].level])),
        controllers: Object.fromEntries(ANIM_IDS.map((a) => [a, n.anims[a].controller])),
        startCount: n.startCount,
      },
      results: this.results,
      records: this.records(),
    };
  }

  sync() {
    this.dirty = false;
    this.syncAt = Date.now();
    this.broadcast('fnaf', this.publicState());
  }

  spectatorState() {
    return { fnaf: this.publicState() };
  }

  records() {
    if (this._rec && Date.now() - this._rec.at < 5000) return this._rec.list;
    let list = [];
    try {
      list = getDb().prepare(`SELECT mode, night, team, players, created_at FROM fnaf_records ORDER BY night DESC, players DESC, created_at ASC LIMIT 40`).all();
    } catch { /* tabla aún no creada */ }
    const byMode = {};
    for (const r of list) {
      byMode[r.mode] = byMode[r.mode] || [];
      if (byMode[r.mode].length < 5) byMode[r.mode].push({ night: r.night, team: r.team, players: r.players, at: r.created_at });
    }
    this._rec = { at: Date.now(), list: byMode };
    return byMode;
  }

  // --- Eventos de los clientes -------------------------------------------------------------
  onEvent(p, name, data = {}) {
    const f = this.f(p);
    if (this.phase === 'lobby') return this.lobbyEvent(p, f, name, data);
    if (this.phase !== 'night' || !this.n) return { error: 'La noche ha terminado' };
    const n = this.n;
    const now = Date.now();
    if (now < n.start && !['cam'].includes(name)) return { error: 'La noche aún no ha empezado' };
    if (f.anim) return this.animEvent(p, f, n.anims[f.anim], name, data);
    switch (name) {
      case 'cam': return this.setCam(p, f, data.id ?? null);
      case 'door': return this.toggleDoor(p, f, data.side);
      case 'light': return this.setLight(p, f, data.side, !!data.on);
      case 'flash': return this.flash(p, f, String(data.a || ''));
      case 'gen': return this.generator(p, f, data.action);
      case 'task': return this.task(p, f, data);
      case 'stun': return this.stun(p, f, String(data.a || ''));
      case 'battery': return this.takeBattery(p, f, data.id);
      case 'give': return this.giveBattery(p, f);
      default: return { error: 'Evento no soportado' };
    }
  }

  lobbyEvent(p, f, name, data) {
    if (name === 'role') {
      if (!ROLES[data.role]) return { error: 'Especialidad desconocida' };
      f.role = data.role;
    } else if (name === 'wantAnim') {
      const a = data.anim == null ? null : String(data.anim);
      if (a && !ANIMATRONICS[a]) return { error: 'Animatrónico desconocido' };
      if (a && [...this.room.players.values()].some((o) => o !== p && this.f(o).wantAnim === a)) return { error: 'Otro jugador ya ha elegido a ese animatrónico' };
      f.wantAnim = a;
    } else if (name === 'cfg') {
      if (p.id !== this.host) return { error: 'Solo el anfitrión elige la partida' };
      if (data.mode && FNAF_MODES[data.mode]) this.cfg.mode = data.mode;
      if (data.night != null) {
        const nt = Number(data.night);
        if (nt === 7 || (nt >= 1 && nt <= MAX_NIGHT)) this.cfg.night = nt;
      }
      if (data.custom && typeof data.custom === 'object') {
        this.cfg.custom = Object.fromEntries(ANIM_IDS.map((a) => [a, clampAi(data.custom[a] ?? 5)]));
      }
    } else if (name === 'start') {
      if (p.id !== this.host) return { error: 'Solo el anfitrión puede empezar la noche' };
      const mode = this.cfg.mode;
      const count = this.room.players.size;
      if (count < FNAF_MODES[mode].min) return { error: `Esta modalidad necesita al menos ${FNAF_MODES[mode].min} jugadores` };
      this.startNight();
      return { ok: true };
    } else return { error: 'Evento no soportado' };
    this.dirty = true;
    return { ok: true };
  }

  // --- Noche ---------------------------------------------------------------------------
  startNight() {
    const now = Date.now();
    const mode = this.cfg.mode;
    const num = this.cfg.night;
    const players = [...this.room.players.values()];
    // Animatrónicos jugadores (modalidad versus): los que lo pidieron, hasta 2 y dejando al menos un guardia
    const animPlayers = new Map();
    if (mode === 'versus') {
      for (const p of players) {
        const w = this.f(p).wantAnim;
        if (w && animPlayers.size < Math.min(2, players.length - 1) && ![...animPlayers.values()].includes(w)) animPlayers.set(p.id, w);
      }
      if (!animPlayers.size) {
        const p = pick(players);
        const free = ANIM_IDS.filter((a) => a !== 'fox');
        animPlayers.set(p.id, pick(free));
      }
    }
    const base = num === 7 ? (this.cfg.custom || NIGHTS[3]) : NIGHTS[num];
    const guards = players.filter((p) => !animPlayers.has(p.id));
    const extra = Math.max(0, guards.length - 1); // más guardias = más presión
    const anims = {};
    for (const a of ANIM_IDS) {
      const home = HOME[a];
      const [x, y, z, ry] = nodePos(home, a);
      let level = clampAi(base[a] + (mode === 'last' ? 0 : extra));
      if (mode === 'versus') level = clampAi(base[a] - 3);
      anims[a] = {
        id: a, node: home, x, y, z, ry: (ry * Math.PI) / 180, state: 'idle', level, nextOpp: now + 4000 + ANIMATRONICS[a].interval * 1000 * (1 + Math.random()),
        controller: null, cdUntil: 0, abilityUntil: 0, doorSince: 0, insideUntil: 0, repel: 0, stunUntil: 0, path: null, goal: null,
        foxStage: 0, charge: 0, bangs: 0, target: null, lastMove: 0,
      };
    }
    for (const [pid, a] of animPlayers) anims[a].controller = pid;
    this.n = {
      num, mode, start: now + 4000, end: now + 4000 + FNAF.hours * FNAF.hourMs, power: 100, usage: 1,
      doors: { L: false, R: false }, doorBy: { L: null, R: null }, lights: { L: false, R: false }, lightBy: { L: null, R: null },
      jam: { L: 0, R: 0 }, broken: { L: 0, R: 0 }, eco: false, boostUsed: false, camsOff: 0, staticUntil: 0, flickerUntil: 0, frenzyUntil: 0,
      blackout: null, anims, guards: new Set(), tasks: [], tasksDone: 0, nextTask: now + 4000 + 40_000, nextEvent: now + 4000 + 50_000 + Math.random() * 20_000,
      batteries: [], nextBattery: now + 4000 + 20_000, startCount: 0, lastHour: 0, coinsBonus: 0, catches: [], deaths: [],
    };
    const spawns = [...FNAF.officeSpawns];
    let k = 0;
    for (const p of players) {
      const f = this.f(p);
      Object.assign(f, { alive: false, guard: false, anim: null, cam: null, spectator: false, bat: 100, task: null, flashAt: 0, survived: 0 });
      let pos;
      if (animPlayers.has(p.id)) {
        f.anim = animPlayers.get(p.id);
        pos = FNAF.booth;
      } else {
        f.guard = true;
        f.alive = true;
        this.n.guards.add(p.id);
        if (mode === 'last') {
          const [x, z] = pick(Object.values(NAV).filter(([nx, nz]) => nz < 2 && nz > -12 && Math.abs(nx) < 13));
          pos = [x + (Math.random() - 0.5) * 2, 0.2, z + (Math.random() - 0.5) * 2];
        } else pos = spawns[k++ % spawns.length];
      }
      this.room.teleport(p, pos);
      this.emit(p, 'respawn', { p: pos });
    }
    this.n.startCount = this.n.guards.size;
    this.phase = 'night';
    this.results = null;
    this.room.state.groups.fnafLights = false;
    this.room.state.groups.office = true;
    const label = num === 7 ? 'Noche personalizada' : `Noche ${num}`;
    this.room.systemMessage(`🌙 ${label} · ${FNAF_MODES[mode].name}. Sobrevivid hasta las 6:00.`);
    if (mode === 'versus') for (const [pid, a] of animPlayers) this.room.systemMessage(`🎭 ${this.room.players.get(pid)?.name} es ${ANIMATRONICS[a].name}`);
    this.sync();
  }

  hour(now = Date.now()) {
    const n = this.n;
    return Math.max(0, Math.min(FNAF.hours, Math.floor((now - n.start) / FNAF.hourMs)));
  }

  guardsInOffice() {
    return [...this.room.players.values()].filter((p) => this.f(p).alive && this.f(p).guard && inOffice(p.pos));
  }

  aliveGuards() {
    return [...this.room.players.values()].filter((p) => this.f(p).alive && this.f(p).guard);
  }

  camsWorking() {
    const n = this.n;
    return n.power > 0 && Date.now() > n.camsOff && !n.blackout;
  }

  /** ¿Algún guardia vivo está mirando la cámara de este nodo? */
  watched(node) {
    const cam = CAM_OF_NODE[node];
    if (!cam || !this.camsWorking() || CAM_BY_ID[cam].audioOnly) return false;
    if (Date.now() < this.n.staticUntil) return false;
    for (const p of this.room.players.values()) {
      const f = this.f(p);
      if (f.alive && f.guard && f.cam === cam) return true;
    }
    return false;
  }

  // --- Acciones de los guardias -----------------------------------------------------------
  needGuard(f) {
    if (!f.alive || !f.guard) return { error: 'Ahora mismo no eres guardia' };
    return null;
  }

  setCam(p, f, id) {
    if (id != null && !CAM_BY_ID[id]) return { error: 'Cámara desconocida' };
    // Espectadores y eliminados miran gratis (no cuenta para la energía ni congela a nadie)
    if (!f.alive || !f.guard) { f.cam = id; return { ok: true, free: true }; }
    if (id != null) {
      if (this.n.power <= 0) return { error: 'No hay energía' };
      if (xz(p.pos, FNAF.monitor) > 3.2) return { error: 'Acércate al monitor de la mesa' };
    }
    f.cam = id;
    return { ok: true };
  }

  toggleDoor(p, f, side) {
    const err = this.needGuard(f);
    if (err) return err;
    const n = this.n;
    const d = FNAF.doors[side];
    if (!d) return { error: 'Puerta desconocida' };
    if (xz(p.pos, d.panel) > 2.8) return { error: 'Acércate al panel de la puerta' };
    if (n.power <= 0) return { error: 'No hay energía' };
    if (Date.now() < n.jam[side]) return { error: '¡La puerta está atascada!' };
    // No se puede cerrar con un animatrónico justo debajo
    if (!n.doors[side] && Object.values(n.anims).some((a) => a.state === 'inside' && ANIMATRONICS[a.id].door === side && Math.abs(a.x - d.p[0]) < 1)) return { error: '¡Algo bloquea la puerta!' };
    n.doors[side] = !n.doors[side];
    n.doorBy[side] = n.doors[side] ? p.id : null;
    this.broadcast('fn:sfx', { k: 'door', side, on: n.doors[side] });
    this.dirty = true;
    return { ok: true, closed: n.doors[side] };
  }

  setLight(p, f, side, on) {
    const err = this.needGuard(f);
    if (err) return err;
    const n = this.n;
    const d = FNAF.doors[side];
    if (!d) return { error: 'Luz desconocida' };
    if (on && xz(p.pos, d.panel) > 2.8) return { error: 'Acércate al panel de la puerta' };
    if (on && (n.power <= 0 || Date.now() < n.broken[side] || Date.now() < n.flickerUntil)) return { error: 'La luz no funciona' };
    if (n.lights[side] === on) return { ok: true };
    n.lights[side] = on;
    n.lightBy[side] = on ? p.id : null;
    this.dirty = true;
    return { ok: true };
  }

  generator(p, f, action) {
    const err = this.needGuard(f);
    if (err) return err;
    const n = this.n;
    if (xz(p.pos, FNAF.generator) > 2.8) return { error: 'Acércate al generador' };
    const hasPowerRole = this.aliveGuards().some((o) => this.f(o).role === 'power');
    if (hasPowerRole && f.role !== 'power') return { error: 'El generador lo maneja el guardia de Energía' };
    if (action === 'eco') {
      n.eco = !n.eco;
      this.room.systemMessage(n.eco ? '🔋 Modo ahorro activado: todo gasta menos, pero las cámaras se ven peor' : '🔋 Modo ahorro desactivado');
    } else if (action === 'boost') {
      if (n.boostUsed) return { error: 'El reinicio de emergencia ya se ha usado esta noche' };
      if (n.power <= 0) return { error: 'Sin energía no arranca' };
      n.boostUsed = true;
      n.power = Math.min(100, n.power + (f.role === 'power' ? 10 : 6));
      this.room.systemMessage(`🔋 ${p.name} ha hecho un reinicio de emergencia del generador`);
    } else return { error: 'Acción desconocida' };
    this.dirty = true;
    return { ok: true };
  }

  /** Linterna contra un animatrónico que ha entrado en la oficina (forcejeo). */
  flash(p, f, id) {
    const err = this.needGuard(f);
    if (err) return err;
    const n = this.n;
    const a = n.anims[id];
    const now = Date.now();
    if (!a || a.state !== 'inside') return { ok: true };
    if (now - f.flashAt < 120) return { ok: true };
    if (n.power <= 0) return { error: 'La linterna no tiene energía' };
    if (!inOffice(p.pos) || !this.facing(p, [a.x, 0, a.z], 0.75, 9)) return { ok: true };
    f.flashAt = now;
    a.repel += f.role === 'lights' ? 0.3 : 0.15;
    n.power = Math.max(0, n.power - 0.2);
    if (a.repel >= 1) this.repelAnim(a, p);
    return { ok: true };
  }

  facing(p, target, maxAngle, maxDist) {
    const dx = target[0] - p.pos[0], dz = target[2] - p.pos[2];
    const d = Math.hypot(dx, dz);
    if (d > maxDist) return false;
    if (d < 0.8) return true;
    const fx = Math.sin(p.ry), fz = Math.cos(p.ry);
    return (dx * fx + dz * fz) / d > Math.cos(maxAngle);
  }

  repelAnim(a, p) {
    const n = this.n;
    n.power = Math.max(0, n.power - 2);
    this.broadcast('fn:repel', { a: a.id, by: p.name });
    this.room.systemMessage(`🔦 ${p.name} ha ahuyentado a ${ANIMATRONICS[a.id].name}`);
    users.award(p.id, { xp: 25, reason: `Has ahuyentado a ${ANIMATRONICS[a.id].name}` });
    this.sendHome(a, a.controller ? 10_000 : 6000);
  }

  sendHome(a, stun = 0) {
    const home = a.id === 'fox' ? 'pirate' : this.n.mode === 'last' ? 'stage' : 'dining';
    this.placeAt(a, home);
    a.state = 'idle';
    a.repel = 0;
    a.doorSince = 0;
    a.path = null;
    a.foxStage = 0;
    a.charge = 0;
    a.cdUntil = Date.now() + stun;
    a.nextOpp = Date.now() + stun + ANIMATRONICS[a.id].interval * 1000;
  }

  placeAt(a, node) {
    const [x, y, z, ry] = nodePos(node, a.id);
    Object.assign(a, { node, x, y, z, ry: (ry * Math.PI) / 180 });
    a.lastMove = Date.now();
  }

  // --- Tareas (modo equipos) ------------------------------------------------------------
  task(p, f, data) {
    const err = this.needGuard(f);
    if (err) return err;
    const n = this.n;
    const t = n.tasks.find((x) => x.id === data.id);
    if (!t) return { error: 'Esa tarea ya no está' };
    const def = TASKS[t.id];
    if (xz(p.pos, def.pos) > 2.6) return { error: 'Acércate más' };
    const now = Date.now();
    if (data.phase === 'start') {
      f.task = { id: t.id, at: now };
      return { ok: true };
    }
    if (!f.task || f.task.id !== t.id || now - f.task.at < 2700) return { error: 'Mantén pulsado hasta terminar' };
    f.task = null;
    n.tasks = n.tasks.filter((x) => x !== t);
    n.tasksDone++;
    if (def.power) n.power = Math.min(100, n.power + def.power);
    if (def.fox) { n.anims.fox.foxStage = 0; n.anims.fox.charge = 0; }
    if (def.coins) n.coinsBonus += def.coins;
    users.award(p.id, { xp: 30, reason: 'Tarea completada' });
    this.room.systemMessage(`✅ ${p.name}: ${def.name}${def.power ? ` (+${def.power}% energía)` : def.fox ? ' (Fito se calma)' : ' (premio extra para el equipo)'}`);
    this.dirty = true;
    return { ok: true };
  }

  // --- Último superviviente: linterna, pilas ----------------------------------------------
  stun(p, f, id) {
    const err = this.needGuard(f);
    if (err) return err;
    const n = this.n;
    const a = n.anims[id];
    if (!a || n.mode !== 'last') return { error: 'No se puede' };
    if (f.bat < 15) return { error: 'Tu linterna no tiene pila suficiente' };
    if (Date.now() < a.stunUntil) return { ok: true };
    if (!this.facing(p, [a.x, 0, a.z], 0.55, 11)) return { error: 'Apunta bien al animatrónico' };
    f.bat -= 15;
    a.stunUntil = Date.now() + 4000;
    a.target = null;
    a.path = null;
    this.broadcast('fn:stun', { a: a.id, by: p.name });
    this.emit(p, 'fn:me', { bat: f.bat });
    return { ok: true, bat: f.bat };
  }

  takeBattery(p, f, id) {
    const err = this.needGuard(f);
    if (err) return err;
    const n = this.n;
    const b = n.batteries.find((x) => x.id === id);
    if (!b) return { error: 'Alguien se la ha llevado' };
    if (xz(p.pos, b.p) > 2.4) return { error: 'Acércate más' };
    n.batteries = n.batteries.filter((x) => x !== b);
    f.bat = Math.min(100, f.bat + 40);
    this.emit(p, 'fn:me', { bat: f.bat });
    this.dirty = true;
    return { ok: true, bat: f.bat };
  }

  giveBattery(p, f) {
    const err = this.needGuard(f);
    if (err) return err;
    if (f.bat < 25) return { error: 'Necesitas al menos 25 de pila para compartir' };
    const other = this.aliveGuards().filter((o) => o !== p && xz(o.pos, p.pos) < 2.8).sort((a, b) => xz(a.pos, p.pos) - xz(b.pos, p.pos))[0];
    if (!other) return { error: 'No hay nadie a tu lado' };
    const of = this.f(other);
    f.bat -= 25;
    of.bat = Math.min(100, of.bat + 25);
    this.emit(p, 'fn:me', { bat: f.bat });
    this.emit(other, 'fn:me', { bat: of.bat });
    this.toast(other, `🔋 ${p.name} te ha dado pila`, 'ok');
    return { ok: true, bat: f.bat };
  }

  // --- Animatrónicos controlados por jugadores (versus) ---------------------------------
  animEvent(p, f, a, name, data) {
    const n = this.n;
    const now = Date.now();
    if (!a || a.controller !== p.id) return { error: 'No controlas a ningún animatrónico' };
    const def = ANIMATRONICS[a.id];
    if (name === 'cam') { f.cam = data.id ?? null; return { ok: true }; }
    if (a.state === 'inside') return { error: 'Estás dentro de la oficina' };
    if (name === 'move') {
      if (a.id === 'fox') return { error: 'Fito solo puede hacer la Carrera desde la Cala Pirata' };
      const to = String(data.node || '');
      if (now < a.cdUntil) return { error: `Espera ${Math.ceil((a.cdUntil - now) / 1000)} s` };
      if (!ROUTES[a.id][a.node]?.includes(to) || to === 'office') return { error: 'No puedes ir ahí desde aquí' };
      if (this.watched(a.node)) return { error: '👁 ¡Te están mirando por la cámara! No puedes moverte' };
      this.moveAnim(a, to);
      a.cdUntil = now + def.cooldown;
      return { ok: true };
    }
    if (name === 'enter') {
      const side = a.node === 'doorL' ? 'L' : a.node === 'doorR' ? 'R' : null;
      if (!side) return { error: 'Tienes que estar en una puerta de la oficina' };
      if (n.doors[side]) return { error: 'La puerta está cerrada' };
      this.enterOffice(a);
      return { ok: true };
    }
    if (name === 'bang') {
      const side = a.node === 'doorL' ? 'L' : a.node === 'doorR' ? 'R' : null;
      if (!side || !n.doors[side]) return { error: 'Solo puedes aporrear una puerta cerrada' };
      if (a.lastBang && now - a.lastBang < 6000) return { error: `Espera ${Math.ceil((6000 - (now - a.lastBang)) / 1000)} s` };
      a.lastBang = now;
      n.power = Math.max(0, n.power - 2);
      this.broadcast('fn:sfx', { k: 'bang', side });
      return { ok: true };
    }
    if (name === 'ability') {
      if (now < a.abilityUntil) return { error: `Habilidad lista en ${Math.ceil((a.abilityUntil - now) / 1000)} s` };
      if (a.id === 'bear') {
        const node = String(data.node || '');
        if (!NODES[node] || node === 'office') return { error: 'Elige una sala' };
        const [x, y, z] = nodePos(node, 'bear');
        this.broadcast('fn:sfx', { k: 'laugh', p: [x, y + 1.5, z] });
      } else if (a.id === 'bunny') {
        n.staticUntil = now + 6000;
        this.broadcast('fn:sfx', { k: 'static' });
      } else if (a.id === 'chicken') {
        const side = a.node === 'doorL' || ['westHall', 'westCorner'].includes(a.node) ? 'L' : 'R';
        n.broken[side] = now + 10_000;
        n.lights[side] = false;
        this.broadcast('fn:sfx', { k: 'pop', side });
      } else if (a.id === 'fox') {
        if (a.node !== 'pirate' || a.charge < 100) return { error: 'La carga aún no está llena' };
        this.startFoxRun(a);
        return { ok: true };
      }
      a.abilityUntil = now + def.abilityCd;
      this.dirty = true;
      return { ok: true };
    }
    return { error: 'Evento no soportado' };
  }

  // --- Movimiento de animatrónicos ------------------------------------------------------
  moveAnim(a, to) {
    const from = a.node;
    this.placeAt(a, to);
    a.state = to === 'doorL' || to === 'doorR' ? 'door' : 'idle';
    a.doorSince = a.state === 'door' ? Date.now() : 0;
    // Señales: estática en las cámaras implicadas y ruidos según la sala
    this.broadcast('fn:move', { a: a.id, from, to });
    if (a.id === 'bear' && !a.controller) this.broadcast('fn:sfx', { k: 'laugh', p: [a.x, a.y + 1.5, a.z], quiet: true });
  }

  enterOffice(a) {
    const n = this.n;
    this.placeAt(a, 'office');
    a.state = 'inside';
    a.repel = 0;
    a.insideUntil = Date.now() + Math.max(2200, 4200 - (Math.min(n.num, 6) - 1) * 350);
    this.broadcast('fn:inside', { a: a.id, until: a.insideUntil });
  }

  startFoxRun(a) {
    a.state = 'run';
    a.path = [...FOX_RUN];
    a.charge = 0;
    this.broadcast('fn:sfx', { k: 'run' });
    this.room.systemMessage('🏃 ¡Se oyen pasos corriendo por el pasillo oeste!');
  }

  /** IA de una oportunidad de movimiento (modalidades con oficina). */
  aiOpportunity(a, now) {
    const n = this.n;
    let level = a.level;
    if (now < n.frenzyUntil) level += 4;
    if (n.mode === 'team') level += Math.floor(this.hour(now) / 2);
    if (n.mode === 'classic' && this.hour(now) >= 3) level += 1;
    if (Math.random() * 20 >= Math.min(20, level) || level <= 0) return;
    if (a.id === 'fox') {
      if (a.state === 'run') return;
      if (this.watched('pirate')) return;
      a.foxStage++;
      if (a.foxStage >= 4) this.startFoxRun(a);
      else this.broadcast('fn:move', { a: 'fox', from: 'pirate', to: 'pirate', stage: a.foxStage });
      return;
    }
    if (a.id === 'bear' && this.watched(a.node)) return; // Bruno no se mueve si lo miran
    if (a.state === 'door') {
      const side = a.node === 'doorL' ? 'L' : 'R';
      if (!n.doors[side] && !(a.id === 'bear' && n.lights[side])) this.enterOffice(a);
      else if (n.doors[side]) {
        // Puerta cerrada: se cansa y se va
        this.moveAnim(a, pick([a.node === 'doorL' ? 'westHall' : 'eastHall', 'dining']));
      }
      return;
    }
    const opts = (ROUTES[a.id][a.node] || []).filter((x) => x !== 'office' && NODES[x]);
    if (!opts.length) return;
    const steps = STEPS[a.id];
    const closer = opts.filter((x) => (steps[x] ?? 99) < (steps[a.node] ?? 99));
    const to = closer.length && Math.random() < 0.7 ? pick(closer) : pick(opts);
    this.moveAnim(a, to);
  }

  /** Movimiento continuo por la red de navegación (carrera de Fito y modo superviviente). */
  walk(a, dt, speed) {
    if (!a.path || !a.path.length) return true;
    const [tx, tz] = NAV[a.path[0]];
    const dx = tx - a.x, dz = tz - a.z, d = Math.hypot(dx, dz);
    const s = speed * dt;
    if (d <= s) {
      a.x = tx; a.z = tz;
      a.path.shift();
    } else {
      a.x += (dx / d) * s;
      a.z += (dz / d) * s;
    }
    a.y = 0;
    if (d > 0.05) a.ry = Math.atan2(dx, dz);
    a.node = roomAt(a.x, a.z);
    return !a.path.length;
  }

  // --- Bucle ---------------------------------------------------------------------------
  tick(dt) {
    if (this.phase === 'result') {
      if (Date.now() > this.resultUntil) this.toLobby();
      else if (this.dirty) this.sync();
      return;
    }
    if (this.phase !== 'night' || !this.n) {
      if (this.dirty || Date.now() - this.syncAt > 10_000) this.sync();
      return;
    }
    const n = this.n;
    const now = Date.now();
    if (now < n.start) { if (this.dirty) this.sync(); return; }
    // Guardias alejados del monitor dejan de mirar cámaras
    for (const p of this.room.players.values()) {
      const f = this.f(p);
      if (f.alive && f.guard && f.cam && xz(p.pos, FNAF.monitor) > 3.4) f.cam = null;
      if (f.alive && f.guard && n.lights.L && n.lightBy.L === p.id && xz(p.pos, FNAF.doors.L.panel) > 3.2) { n.lights.L = false; this.dirty = true; }
      if (f.alive && f.guard && n.lights.R && n.lightBy.R === p.id && xz(p.pos, FNAF.doors.R.panel) > 3.2) { n.lights.R = false; this.dirty = true; }
    }
    if (now >= n.end) { this.endNight('six'); return; }
    const h = this.hour(now);
    if (h !== n.lastHour) { n.lastHour = h; this.broadcast('fn:hour', { h }); }

    this.tickPower(dt, now);
    if (n.mode === 'last') this.tickHunt(dt, now);
    else this.tickOffice(dt, now);
    if (this.phase !== 'night') return; // la noche puede acabar en mitad del tick
    this.tickEvents(now);
    this.checkCatches(now);
    if (this.phase !== 'night') return;
    if (this.dirty || now - this.syncAt > 4000) this.sync();
  }

  tickPower(dt, now) {
    const n = this.n;
    if (n.power <= 0) {
      if (!n.blackout) this.startBlackout(now);
      return;
    }
    let usage = 1;
    for (const s of ['L', 'R']) {
      if (n.doors[s]) {
        const by = n.doorBy[s] && this.room.players.get(n.doorBy[s]);
        usage += by && this.f(by).role === 'doors' ? 0.5 : 1;
      }
      if (n.lights[s]) usage += 1;
      if (now < n.broken[s] && n.lights[s]) n.lights[s] = false;
      if (now < n.jam[s] && n.doors[s]) { n.doors[s] = false; this.dirty = true; }
    }
    for (const p of this.room.players.values()) {
      const f = this.f(p);
      if (f.alive && f.guard && f.cam && f.role !== 'cams') usage += 1;
    }
    n.usage = usage;
    const nightMult = 1 + (Math.min(n.num, 6) - 1) * 0.07;
    const drain = 0.105 * usage * nightMult * (n.eco ? 0.72 : 1) * (n.mode === 'last' ? 0.6 : 1);
    n.power = Math.max(0, n.power - drain * dt);
    if (n.power <= 0) this.startBlackout(now);
  }

  startBlackout(now) {
    const n = this.n;
    n.power = 0;
    n.doors = { L: false, R: false };
    n.lights = { L: false, R: false };
    for (const p of this.room.players.values()) this.f(p).cam = null;
    n.blackout = { stage: 1, next: now + 4000 + Math.random() * 8000 };
    this.room.state.groups.office = false;
    this.broadcast('fn:sfx', { k: 'powerdown' });
    this.room.systemMessage('🔌 ¡Se ha acabado la energía!');
    this.dirty = true;
  }

  tickOffice(dt, now) {
    const n = this.n;
    // Apagón: Bruno aparece en la puerta izquierda con su musiquita… y luego ataca
    if (n.blackout) {
      const b = n.blackout;
      const bear = n.anims.bear;
      if (now > b.next) {
        if (b.stage === 1) {
          this.placeAt(bear, 'doorL');
          bear.state = 'music';
          b.stage = 2;
          b.next = now + 5000 + Math.random() * 10_000;
          this.broadcast('fn:sfx', { k: 'musicbox' });
        } else if (b.stage === 2) {
          b.stage = 3;
          b.next = now + 2500;
          this.broadcast('fn:sfx', { k: 'dark' });
        } else if (b.stage === 3) {
          this.placeAt(bear, 'office');
          bear.state = 'inside';
          this.attackOffice(bear);
          b.stage = 4;
          b.next = Infinity;
        }
        this.dirty = true;
      }
      return;
    }
    for (const a of Object.values(n.anims)) {
      // Forcejeo dentro de la oficina
      if (a.state === 'inside') {
        if (!this.guardsInOffice().length) { a.insideUntil = Math.max(a.insideUntil, now + 1500); continue; }
        if (now > a.insideUntil) this.attackOffice(a);
        continue;
      }
      if (a.id === 'fox') this.tickFox(a, dt, now);
      if (a.controller) {
        // Jugador animatrónico: tiempo máximo en una puerta cerrada
        if (a.state === 'door') {
          const side = a.node === 'doorL' ? 'L' : 'R';
          if (n.doors[side] && now - a.doorSince > 15_000) {
            this.moveAnim(a, side === 'L' ? 'westCorner' : 'eastCorner');
            this.emit(this.room.players.get(a.controller), 'toast', { text: 'Te has cansado de esperar y te has retirado', kind: 'warn' });
          }
        }
        continue;
      }
      if (a.state === 'run') continue;
      if (now >= a.nextOpp && now >= a.cdUntil) {
        a.nextOpp = now + ANIMATRONICS[a.id].interval * 1000;
        this.aiOpportunity(a, now);
      }
    }
  }

  tickFox(a, dt, now) {
    const n = this.n;
    if (a.state === 'run') {
      if (this.walk(a, dt, 9 + Math.min(n.num, 6) * 0.4)) {
        // Ha llegado a la puerta izquierda
        if (n.doors.L) {
          a.bangs++;
          const lost = 1 + (a.bangs - 1) * 5;
          n.power = Math.max(0, n.power - lost);
          this.broadcast('fn:sfx', { k: 'bang', side: 'L', big: true });
          this.room.systemMessage(`💥 ¡Fito ha chocado contra la puerta! (−${lost}% energía)`);
          this.sendHome(a, 3000);
          a.foxStage = Math.random() < 0.5 ? 0 : 1;
        } else {
          this.enterOffice(a);
        }
        this.dirty = true;
      }
      return;
    }
    if (a.controller && a.node === 'pirate') {
      // Carga de Fito jugador: sube si nadie mira la Cala Pirata
      const prev = a.charge;
      a.charge = this.watched('pirate') ? Math.max(0, a.charge - 6 * dt) : Math.min(100, a.charge + 4.2 * dt);
      a.foxStage = Math.min(3, Math.floor(a.charge / 34));
      if (Math.floor(prev / 34) !== Math.floor(a.charge / 34)) this.broadcast('fn:move', { a: 'fox', from: 'pirate', to: 'pirate', stage: a.foxStage });
    }
  }

  /** Un animatrónico ataca a todos los guardias que estén en la oficina. */
  attackOffice(a) {
    const victims = this.guardsInOffice();
    for (const p of victims) this.killGuard(p, a.id, true);
    if (victims.length) this.room.systemMessage(`😱 ${ANIMATRONICS[a.id].name} ha atrapado a ${victims.map((p) => p.name).join(', ')}`);
    if (a.controller) {
      const ctl = this.room.players.get(a.controller);
      if (ctl && victims.length) users.award(ctl.id, { xp: 40 * victims.length, reason: '¡Has atrapado a los guardias!' });
    }
    if (this.n && this.phase === 'night') this.sendHome(a, 4000);
  }

  killGuard(p, animId, office = false) {
    const f = this.f(p);
    if (!f.alive) return;
    const n = this.n;
    f.alive = false;
    f.cam = null;
    f.survived = Date.now() - n.start;
    n.deaths.push({ id: p.id, name: p.name, by: animId, at: this.hour() });
    this.broadcast('fn:scare', { id: p.id, a: animId, name: p.name });
    if (!office) this.room.systemMessage(`😱 ${ANIMATRONICS[animId].name} ha atrapado a ${p.name}`);
    users.updateStats(p.id, (s) => { s.fnafDeaths = (s.fnafDeaths || 0) + 1; });
    setTimeout(() => {
      if (!this.room.players.has(p.id) || this.phase !== 'night') return;
      this.room.teleport(p, FNAF.booth);
      this.emit(p, 'respawn', { p: FNAF.booth });
    }, 2200);
    this.dirty = true;
    this.checkEnd();
  }

  /** Guardias fuera de la oficina que se cruzan con un animatrónico. */
  checkCatches(now) {
    const n = this.n;
    if (!n) return;
    for (const a of Object.values(n.anims)) {
      if (a.state === 'inside' || now < a.stunUntil || a.state === 'music') continue;
      const reach = n.mode === 'last' ? 1.4 : 2.6;
      for (const p of this.aliveGuards()) {
        if (inOffice(p.pos) && n.mode !== 'last') continue;
        if (Math.abs(p.pos[1] - a.y) > 2.5) continue;
        if (Math.hypot(p.pos[0] - a.x, p.pos[2] - a.z) < reach) this.killGuard(p, a.id);
      }
    }
  }

  // --- Último superviviente: caza ----------------------------------------------------------
  tickHunt(dt, now) {
    const n = this.n;
    const alive = this.aliveGuards();
    const blocked = (x, y) => { const s = NAV_DOOR[`${x}|${y}`]; return s ? n.doors[s] : false; };
    for (const a of Object.values(n.anims)) {
      if (a.state === 'inside') a.state = 'idle';
      if (now < a.stunUntil) { a.state = 'stun'; continue; }
      const lvl = a.level + (now < n.frenzyUntil ? 5 : 0) + this.hour(now);
      const sight = 9 + lvl * 0.5;
      // Busca al superviviente visible más cercano (misma sala o sala vecina y a la vista)
      const here = nearestNav(a.x, a.z);
      let best = null, bd = Infinity;
      for (const p of alive) {
        const d = Math.hypot(p.pos[0] - a.x, p.pos[2] - a.z);
        if (d > sight) continue;
        // Te ve si estás en su misma sala, o te oye si estás muy cerca
        if (roomAt(p.pos[0], p.pos[2]) !== roomAt(a.x, a.z) && d > 7) continue;
        if (inOffice(p.pos) && !inOffice([a.x, 0, a.z]) && n.doors.L && n.doors.R) continue;
        if (d < bd) { bd = d; best = p; }
      }
      if (best) {
        if (a.target !== best.id) this.broadcast('fn:sfx', { k: 'spot', a: a.id, p: [a.x, 1.5, a.z] });
        a.target = best.id;
        a.state = 'chase';
        const speed = 6.2 + lvl * 0.16;
        const pn = nearestNav(best.pos[0], best.pos[2]);
        if (bd < 5 || pn === here || roomAt(best.pos[0], best.pos[2]) === roomAt(a.x, a.z)) {
          const dx = best.pos[0] - a.x, dz = best.pos[2] - a.z, d = Math.hypot(dx, dz);
          // No atraviesa una puerta cerrada de la oficina
          const nx = a.x + (dx / d) * speed * dt, nz = a.z + (dz / d) * speed * dt;
          if (inOffice([nx, 0, nz]) !== inOffice([a.x, 0, a.z]) && ((nx < 0 && n.doors.L) || (nx > 0 && n.doors.R))) continue;
          a.x = nx; a.z = nz; a.ry = Math.atan2(dx, dz);
          a.node = roomAt(a.x, a.z);
        } else {
          const path = navPath(here, pn, blocked);
          if (path) { a.path = path; this.walk(a, dt, speed); }
        }
        continue;
      }
      a.target = null;
      if (a.state === 'chase') a.state = 'idle';
      // Paseo: va a un punto al azar
      if (!a.path || !a.path.length) {
        if (now < a.cdUntil) continue;
        const goal = pick(Object.keys(NAV));
        a.path = navPath(here, goal, blocked) || null;
        a.cdUntil = now + 800 + Math.random() * 2500;
        a.state = 'walk';
      } else this.walk(a, dt, 2.6 + lvl * 0.08);
      // Golpea una puerta cerrada si se le cruza
      for (const s of ['L', 'R']) {
        if (n.doors[s] && Math.hypot(a.x - NAV[`door${s}`][0], a.z - NAV[`door${s}`][1]) < 1.2 && now - (a.lastBang || 0) > 5000) {
          a.lastBang = now;
          n.power = Math.max(0, n.power - 2);
          this.broadcast('fn:sfx', { k: 'bang', side: s });
          a.path = null;
        }
      }
    }
    // Pilas repartidas por la pizzería
    if (now > n.nextBattery && n.batteries.length < 4) {
      n.nextBattery = now + 25_000 + Math.random() * 15_000;
      this.spawnBattery();
    }
  }

  spawnBattery() {
    const n = this.n;
    const k = pick(Object.keys(NAV).filter((x) => !x.startsWith('office') && !x.startsWith('door')));
    const [x, z] = NAV[k];
    n.batteries.push({ id: `b${Date.now().toString(36)}${Math.floor(Math.random() * 99)}`, p: [x + (Math.random() - 0.5) * 2, 0.4, z + (Math.random() - 0.5) * 2] });
    this.dirty = true;
  }

  // --- Eventos inesperados y tareas ---------------------------------------------------------
  tickEvents(now) {
    const n = this.n;
    if (n.blackout) return;
    if (n.mode === 'team') {
      // Tareas que caducan (algunas penalizan)
      for (const t of [...n.tasks]) {
        if (now > t.until) {
          n.tasks = n.tasks.filter((x) => x !== t);
          const def = TASKS[t.id];
          if (def.penalty) {
            n.power = Math.max(0, n.power - def.penalty);
            this.room.systemMessage(`⚠️ Nadie hizo «${def.name}» (−${def.penalty}% energía)`);
          }
          this.dirty = true;
        }
      }
      if (now > n.nextTask && n.tasks.length < 2) {
        n.nextTask = now + 45_000 + Math.random() * 25_000;
        const free = Object.keys(TASKS).filter((id) => !n.tasks.some((t) => t.id === id));
        const id = pick(free);
        n.tasks.push({ id, until: now + 55_000 });
        this.room.systemMessage(`📋 Nueva tarea: ${TASKS[id].name}`);
        this.dirty = true;
      }
    }
    if (now < n.nextEvent) return;
    const gap = n.mode === 'classic' ? 90_000 : 45_000;
    n.nextEvent = now + gap + Math.random() * 25_000;
    const pool = n.mode === 'last' ? ['frenzy', 'batteries', 'surge', 'flicker'] : n.mode === 'classic' ? ['flicker', 'camfail'] : ['surge', 'jam', 'camfail', 'frenzy', 'flicker'];
    const ev = pick(pool);
    if (ev === 'surge') n.power = Math.max(0, n.power - 6);
    else if (ev === 'jam') { const s = pick(['L', 'R']); n.jam[s] = now + 10_000; n.doors[s] = false; }
    else if (ev === 'camfail') n.camsOff = now + 9000;
    else if (ev === 'frenzy') n.frenzyUntil = now + 25_000;
    else if (ev === 'flicker') { n.flickerUntil = now + 6000; n.lights = { L: false, R: false }; }
    else if (ev === 'batteries') for (let i = 0; i < 3; i++) this.spawnBattery();
    this.broadcast('fn:event', { ev, text: EVENTS[ev] });
    this.dirty = true;
  }

  // --- Final de la noche ----------------------------------------------------------------
  checkEnd() {
    const n = this.n;
    if (!n || this.phase !== 'night') return;
    const alive = this.aliveGuards();
    if (!alive.length) { this.endNight('dead'); return; }
    if (n.mode === 'last' && n.startCount >= 2 && alive.length === 1) this.endNight('last', alive[0]);
  }

  endNight(reason, winner = null) {
    const n = this.n;
    if (!n || this.phase !== 'night') return;
    const players = [...this.room.players.values()];
    const guards = players.filter((p) => this.f(p).guard);
    const alive = guards.filter((p) => this.f(p).alive);
    const survived = reason === 'six' && alive.length > 0;
    const label = n.num === 7 ? 'Noche personalizada' : `Noche ${n.num}`;
    const res = { reason, mode: n.mode, night: n.num, survivors: alive.map((p) => p.name), deaths: n.deaths, tasks: n.tasksDone, winner: winner?.name || null, power: round1(n.power), lines: [] };
    if (reason === 'abandon') {
      res.title = 'Noche cancelada';
    } else if (n.mode === 'versus') {
      res.title = survived ? '🛡️ ¡Ganan los guardias!' : '🐻 ¡Ganan los animatrónicos!';
      for (const p of players) {
        const f = this.f(p);
        const won = f.anim ? !survived : survived;
        this.reward(p, won, n, f.anim ? 'anim' : 'guard');
      }
    } else if (n.mode === 'last') {
      res.title = winner ? `🔦 ¡${winner.name} es el último superviviente!` : survived ? '🌅 ¡Habéis llegado a las 6:00!' : '💀 Nadie ha sobrevivido';
      for (const p of guards) this.reward(p, winner ? p === winner : this.f(p).alive && survived, n, winner && p === winner ? 'last' : 'guard');
    } else {
      res.title = survived ? `🌅 ¡6:00 AM! ${label} superada` : '💀 Os han atrapado…';
      for (const p of guards) this.reward(p, survived, n, 'guard');
    }
    if ((survived || winner) && reason !== 'abandon') {
      const team = (winner ? [winner] : n.mode === 'versus' && !survived ? players.filter((p) => this.f(p).anim) : guards).map((p) => p.name).join(', ').slice(0, 200);
      try {
        getDb().prepare('INSERT INTO fnaf_records (mode, night, team, players, result, created_at) VALUES (?, ?, ?, ?, ?, ?)')
          .run(n.mode, n.num, team, guards.length, survived ? 'win' : 'anim', Date.now());
      } catch { /* sin tabla */ }
      this._rec = null;
    }
    this.results = res;
    this.phase = 'result';
    this.resultUntil = Date.now() + 9000;
    this.broadcast('fn:end', res);
    if (survived) this.broadcast('fn:sfx', { k: 'chime' });
    this.room.systemMessage(res.title);
    this.n = null;
    this.room.state.groups.fnafLights = true;
    this.room.state.groups.office = true;
    this.sync();
  }

  reward(p, won, n, kind) {
    const night = Math.min(n.num, 6);
    users.updateStats(p.id, (s) => {
      s.fnafNights = (s.fnafNights || 0) + 1;
      if (won) {
        s.fnafWins = (s.fnafWins || 0) + 1;
        s.wins = (s.wins || 0) + 1;
        if (kind === 'guard' && n.num <= 6) s.fnafBest = Math.max(s.fnafBest || 0, n.num);
        if (kind === 'anim') s.fnafAnimWins = (s.fnafAnimWins || 0) + 1;
        if (kind === 'last') s.fnafLastWins = (s.fnafLastWins || 0) + 1;
      }
    });
    if (!won) {
      users.award(p.id, { xp: 30, reason: 'Turno de noche' });
      users.setHistoryResult(p.historyId, 'Atrapado');
      return;
    }
    const coins = users.dailyCapped(p.id, 'fnaf', 20 + night * 10 + n.coinsBonus, 160);
    users.award(p.id, { xp: 120 + night * 30, coins, reason: kind === 'anim' ? '¡Los animatrónicos ganan!' : kind === 'last' ? '¡Último superviviente!' : '¡Has sobrevivido hasta las 6:00!' });
    users.setHistoryResult(p.historyId, kind === 'anim' ? 'Ganó como animatrónico' : `Sobrevivió a la noche ${n.num}`);
    if (kind === 'guard') {
      users.unlockAchievement(p.id, 'fnaf_n1');
      users.unlockItem(p.id, 'acc_guardcap', 'Turno de Noche');
      if (n.num >= 3) users.unlockItem(p.id, 'shirt_guard', 'Turno de Noche');
      if (n.num >= 5) { users.unlockAchievement(p.id, 'fnaf_n5'); users.unlockItem(p.id, 'acc_bearears', 'Turno de Noche'); }
      if (n.num >= 6) users.unlockAchievement(p.id, 'fnaf_n6');
      if (n.startCount >= 3) users.unlockAchievement(p.id, 'fnaf_team');
    } else if (kind === 'anim') {
      users.unlockAchievement(p.id, 'fnaf_anim');
      users.unlockItem(p.id, 'acc_bowtie', 'Turno de Noche');
    } else if (kind === 'last') {
      users.unlockAchievement(p.id, 'fnaf_last');
      users.unlockItem(p.id, 'acc_guardcap', 'Turno de Noche');
    }
  }

  toLobby() {
    this.phase = 'lobby';
    this.results = null;
    for (const p of this.room.players.values()) {
      const f = this.f(p);
      Object.assign(f, { alive: false, guard: false, anim: null, cam: null, spectator: false });
      const pos = pick(FNAF.lobbySpawns);
      this.room.teleport(p, pos);
      this.emit(p, 'respawn', { p: pos });
    }
    if (!this.host || !this.room.players.has(this.host)) this.host = this.room.players.keys().next().value || null;
    this.sync();
  }

  // --- Instantáneas ----------------------------------------------------------------------
  snapExtra() {
    const n = this.n;
    if (!n) return null;
    const viewed = [];
    for (const p of this.room.players.values()) {
      const f = this.f(p);
      if (f.alive && f.guard && f.cam && !viewed.includes(f.cam)) viewed.push(f.cam);
    }
    return {
      fn: {
        a: Object.values(n.anims).map((a) => [a.id, round1(a.x), round1(a.y), round1(a.z), Math.round(a.ry * 100) / 100, a.state, a.node]),
        pw: round1(n.power), u: n.usage, v: viewed, fs: n.anims.fox.foxStage, ch: Math.round(n.anims.fox.charge),
        d: [n.doors.L ? 1 : 0, n.doors.R ? 1 : 0, n.lights.L ? 1 : 0, n.lights.R ? 1 : 0],
      },
    };
  }
}
