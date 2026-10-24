// Guerra Galáctica en cooperativo (hasta 4 jugadores). Todos avanzan a la vez por los capítulos:
// un capítulo pasa al siguiente cuando TODOS los jugadores lo piden (o pasan 20 s). Los combates
// del hangar, el núcleo y Lord Vex los simula el servidor (ver galaxia/encounter.js).
import { BaseMode } from './BaseMode.js';
import * as users from '../../services/users.js';
import { Encounter } from '../galaxia/encounter.js';

/** Orden de la historia. */
export const SEQ = ['intro', 'dogfight', 'dock', 'hangar', 'core', 'escape', 'drift', 'crash', 'boss', 'finale', 'finaleSpace', 'home'];
/** Tiempo mínimo por capítulo: evita saltarse la historia pulsando botones. */
const MIN_DWELL_MS = 3000;
const VOTE_TIMEOUT_MS = 20000;
const SNAP_MS = 100;
export const REWARD_ITEMS = ['skin_starknight', 'skin_darklord', 'skin_droid', 'skin_trooper'];

const HANGAR_COLLIDERS = [
  ...[20, 0, -20, -40, -60].flatMap((z) => [{ x: -30, z, r: 2.4 }, { x: 30, z, r: 2.4 }]),
  ...[[-14, -4], [12, -10], [-4, -30], [18, -34], [-20, -46], [6, -52], [26, -20], [-26, -26]].map(([x, z]) => ({ x, z, r: 3.1 })),
];
const CORE_COLLIDERS = [
  ...[[-24, -14], [24, -14], [-24, -40], [24, -40]].map(([x, z]) => ({ x, z, r: 2.6 })),
  ...[[-10, 10], [10, 6], [0, -2], [-16, -2], [16, -4], [-6, 22]].map(([x, z]) => ({ x, z, r: 2.9 })),
];
const ENCOUNTERS = {
  hangar: { heroSpawns: [[-17.5, 0, 12], [-12, 0, 14], [-22, 0, 15], [-14, 0, 18]], foeSpawns: [[0, -64], [-22, -56], [22, -56], [-30, -40], [30, -40], [-34, -10], [34, -10], [0, -50]], colliders: HANGAR_COLLIDERS },
  core: { heroSpawns: [[0, 0, 36], [-4, 0, 36], [4, 0, 36], [-8, 0, 38]], foeSpawns: [[-40, -10], [40, -14], [-30, -36], [30, -36], [0, -44]], colliders: CORE_COLLIDERS, center: { x: 0, y: 20, z: -26 } },
  boss: { heroSpawns: [[-6, 0, 8], [-3, 0, 9], [-9, 0, 9], [-6, 0, 11]], foeSpawns: [[15, -5]], colliders: [] },
};

/** ¿Está resuelto el combate de este capítulo? */
function encounterDone(name, enc) {
  if (!enc) return true;
  if (name === 'hangar') return enc.wave >= 3;
  if (name === 'core') return enc.overloaded;
  if (name === 'boss') return enc.vex?.dead === true;
  return true;
}

export class GalaxiaMode extends BaseMode {
  constructor(room) {
    super(room);
    this.chapter = null;
    this.enc = null;
    this.chapterAt = 0;
    this.startedAt = 0;
    this.votes = { target: null, ids: new Set(), at: 0 };
    this.snapAcc = 0;
    this.rewarded = new Set();
  }

  sessionIds() {
    return [...this.room.players.keys()];
  }

  onJoin(p) {
    if (this.enc && this.enc.over === false && this.chapter && ENCOUNTERS[this.chapter]) this.enc.addHero(p.id, p.name);
    return { chapter: this.chapter, started: !!this.chapter };
  }

  onLeave(p) {
    this.votes.ids.delete(p.id);
    this.enc?.removeHero(p.id);
    this.checkQuorum();
  }

  onEvent(p, name, data = {}) {
    if (name === 'start') {
      if (this.chapter) return { error: 'La misión ya ha empezado' };
      this.startedAt = Date.now();
      this.advance('intro');
      return { ok: true };
    }
    if (name === 'goto') return this.goto(p.id, String(data.chapter || ''));
    // Acciones de combate (solo si hay un combate en curso)
    const enc = this.enc;
    if (!enc || enc.over) return { error: 'No hay combate ahora' };
    if (name === 'state') enc.setState(p.id, { p: data.p, yaw: data.yaw, block: data.block });
    else if (name === 'swing') enc.swing(p.id, data.d || [0, 0, 1]);
    else if (name === 'shoot') enc.shoot(p.id, data.d || [0, 0, 1]);
    else if (name === 'push') enc.push(p.id, data.d || [0, 0, 1]);
    else return { error: 'Evento no soportado' };
    return { ok: true };
  }

  goto(id, target) {
    const cur = this.chapter;
    if (!cur) return { error: 'La misión no ha empezado' };
    const next = SEQ[SEQ.indexOf(cur) + 1];
    const enc = this.enc;
    if (target === cur) {
      // Reintentar: solo si el combate se ha perdido
      if (!(enc && enc.over && enc.failed)) return { error: 'Aún no toca repetir este capítulo' };
    } else if (target === next) {
      if (Date.now() - this.chapterAt < MIN_DWELL_MS) return { error: 'Espera un momento' };
      if (!encounterDone(cur, enc)) return { error: 'Termina el combate primero' };
      if (target === 'home' && Date.now() - this.startedAt < 150000) return { error: 'Misión no válida' };
    } else {
      return { error: 'Ese capítulo no toca ahora' };
    }
    if (this.votes.target !== target) this.votes = { target, ids: new Set(), at: Date.now() };
    this.votes.ids.add(id);
    this.checkQuorum();
    return { ok: true, waiting: !!this.votes.target };
  }

  checkQuorum() {
    const v = this.votes;
    if (!v.target) return;
    const all = this.sessionIds();
    const everyone = all.length > 0 && all.every((i) => v.ids.has(i));
    const timedOut = Date.now() - v.at > VOTE_TIMEOUT_MS && v.ids.size > 0;
    if (everyone || timedOut) this.advance(v.target);
  }

  advance(target) {
    this.votes = { target: null, ids: new Set(), at: 0 };
    this.chapter = target;
    this.chapterAt = Date.now();
    this.enc = null;
    if (ENCOUNTERS[target]) {
      this.enc = new Encounter(target, this.sessionIds(), { ...ENCOUNTERS[target], emit: (ev, data) => this.broadcast(ev, data) });
      this.snapAcc = 0;
    }
    if (target === 'home') this.rewardAll();
    this.broadcast('gx:chapter', { name: target });
  }

  /** Premios de la misión completa (una vez por jugador). */
  rewardAll() {
    for (const p of this.room.players.values()) {
      if (this.rewarded.has(p.id)) continue;
      this.rewarded.add(p.id);
      users.award(p.id, { xp: 450, coins: 0, reason: '¡Misión completada: Guerra Galáctica!' });
      users.updateStats(p.id, (s) => { s.gxCampaign = (s.gxCampaign || 0) + 1; s.wins = (s.wins || 0) + 1; });
      users.unlockAchievement(p.id, 'gx_story');
      users.unlockAchievement(p.id, 'gx_star');
      for (const id of REWARD_ITEMS) users.unlockItem(p.id, id, 'Guerra Galáctica');
      users.setHistoryResult(p.historyId, '🏆 Estación Oscura destruida y Lord Vex derrotado');
    }
    this.room.systemMessage('💥 ¡Misión completada! La Estación Oscura ha sido destruida.');
  }

  snapshot() {
    const enc = this.enc;
    if (!enc) return { c: this.chapter, foes: [], heroes: [], bolts: [] };
    return {
      c: this.chapter,
      over: enc.over,
      failed: enc.failed,
      gen: enc.gen,
      wave: enc.wave,
      foes: enc.foes.filter((f) => !f.dead).map((f) => ({ id: f.id, k: f.kind, x: r2(f.x), y: r2(f.leapY || 0), z: r2(f.z), yaw: r2(f.yaw), hp: Math.round(f.hp), max: f.max, a: f.anim, m: f.mode || '' })),
      heroes: [...enc.heroes.values()].map((h) => ({ id: h.id, n: h.name, x: r2(h.x), z: r2(h.z), yaw: r2(h.yaw), hp: Math.round(h.hp), max: h.max, alive: h.alive, block: h.block, over: Date.now() < h.overUntil })),
      bolts: (enc.bullets || []).map((b) => ({ id: b.id, x: r2(b.x), y: r2(b.y), z: r2(b.z) })),
    };
  }

  tick(dt) {
    if (this.chapter) this.checkQuorum();
    if (!this.enc) return;
    this.enc.update(dt);
    this.snapAcc += dt;
    if (this.snapAcc >= SNAP_MS / 1000) {
      this.snapAcc = 0;
      this.broadcast('enc', this.snapshot());
    }
  }

  spectatorState() {
    return { chapter: this.chapter };
  }
}

const r2 = (v) => Math.round(v * 100) / 100;
