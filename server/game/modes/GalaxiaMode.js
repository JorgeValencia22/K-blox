// Guerra Galáctica: campaña para 1 a 4 jugadores. Cada partida es una sala privada con vestíbulo
// (elegir personaje, invitar amigos, empezar). El combate se juega en el cliente de cada jugador;
// el servidor solo lleva el vestíbulo, hace esperar a todos en los capítulos clave, reenvía las
// posiciones de los aliados y los golpes a los enemigos (así la vida de los enemigos es compartida)
// y, al terminar, comprueba el tiempo mínimo para dar los premios.
import { BaseMode } from './BaseMode.js';
import * as users from '../../services/users.js';

/** Tiempo mínimo (ms) que dura la campaña completa; la real ronda los 8–12 minutos. */
export const MIN_CAMPAIGN_MS = 150000;
export const REWARD_ITEMS = ['skin_starknight', 'skin_darklord', 'skin_droid', 'skin_trooper'];
export const HEROES = ['knight', 'smuggler', 'guardian', 'shadow'];
/** Capítulos donde todos deben llegar a la vez, porque comparten enemigos. */
export const SYNC_CHAPTERS = ['hangar', 'core', 'boss'];
const BARRIER_TIMEOUT_MS = 150000;
const REWARD_ONCE_COINS = 40;

export class GalaxiaMode extends BaseMode {
  constructor(room) {
    super(room);
    this.starts = new Map();
    this.roster = new Map(); // id -> { id, name, hero, avatar }
    this.phase = 'lobby'; // lobby | run
    this.arrivals = new Map(); // capítulo -> { ids:Set, since }
    this.released = new Set();
  }

  host() {
    return [...this.roster.keys()][0] || null;
  }

  lobbyState() {
    return {
      phase: this.phase,
      host: this.host(),
      players: [...this.roster.values()].map((r) => ({ id: r.id, name: r.name, hero: r.hero, avatar: r.avatar })),
    };
  }

  sync() {
    this.broadcast('gx:lobby', this.lobbyState());
  }

  onJoin(p) {
    this.starts.delete(p.id);
    if (this.phase === 'run' && !this.roster.has(p.id)) return { campaign: true, busy: true, lobby: this.lobbyState(), you: p.id };
    this.roster.set(p.id, { id: p.id, name: p.name, hero: HEROES[this.roster.size % HEROES.length], avatar: p.avatar });
    this.sync();
    return { campaign: true, lobby: this.lobbyState(), you: p.id };
  }

  onLeave(p) {
    this.starts.delete(p.id);
    this.roster.delete(p.id);
    if (this.roster.size === 0) { this.phase = 'lobby'; this.arrivals.clear(); this.released.clear(); }
    this.sync();
    this.checkBarriers();
  }

  /** Reenvía un mensaje de combate a los demás jugadores de la partida. */
  relay(p, event, data) {
    for (const other of this.room.players.values()) if (other.id !== p.id) other.socket.emit(event, data);
  }

  checkBarriers(now = Date.now()) {
    for (const [ch, a] of this.arrivals) {
      if (this.released.has(ch)) continue;
      const everyone = [...this.roster.keys()].every((id) => a.ids.has(id));
      if (everyone || now - a.since > BARRIER_TIMEOUT_MS) {
        this.released.add(ch);
        this.broadcast('gx:go', { ch });
      }
    }
  }

  tick() {
    if (this.phase === 'run' && this.arrivals.size) this.checkBarriers();
  }

  onEvent(p, name, data = {}) {
    if (name === 'pick') {
      const r = this.roster.get(p.id);
      if (!r || this.phase !== 'lobby' || !HEROES.includes(data.hero)) return { error: 'Personaje no válido' };
      r.hero = data.hero;
      this.sync();
      return { ok: true };
    }
    if (name === 'begin') {
      if (this.phase !== 'lobby') return { error: 'La partida ya ha empezado' };
      if (p.id !== this.host()) return { error: 'Solo el anfitrión puede empezar' };
      this.phase = 'run';
      this.sync();
      return { ok: true };
    }
    if (name === 'start') {
      this.starts.set(p.id, Date.now());
      return { ok: true };
    }
    // Llegada a un capítulo compartido: se espera a que lleguen todos
    if (name === 'arrive') {
      const ch = String(data.ch || '');
      if (!SYNC_CHAPTERS.includes(ch) || this.phase !== 'run') return { error: 'Capítulo no válido' };
      if (this.released.has(ch)) return { ok: true, go: true };
      const a = this.arrivals.get(ch) || { ids: new Set(), since: Date.now() };
      a.ids.add(p.id);
      this.arrivals.set(ch, a);
      this.checkBarriers();
      return { ok: true, go: this.released.has(ch), waiting: a.ids.size, total: this.roster.size };
    }
    // Posición del jugador (se reenvía a los aliados) y golpe a un enemigo compartido
    if (name === 'st') {
      this.relay(p, 'gx:ally', { id: p.id, s: data });
      return null;
    }
    if (name === 'hit') {
      const d = Number(data.d);
      if (!(d > 0) || d > 400) return null;
      this.relay(p, 'gx:hit', { from: p.id, i: data.i, d });
      return null;
    }
    if (name === 'done') {
      const t0 = this.starts.get(p.id);
      if (!t0 || Date.now() - t0 < MIN_CAMPAIGN_MS) return { error: 'Misión no válida' };
      this.starts.delete(p.id);
      const team = this.roster.size > 1;
      users.award(p.id, { xp: team ? 600 : 450, coins: team ? REWARD_ONCE_COINS : 0, reason: '¡Misión completada: Guerra Galáctica!' });
      users.updateStats(p.id, (s) => { s.gxCampaign = (s.gxCampaign || 0) + 1; s.wins = (s.wins || 0) + 1; if (team) s.gxTeam = (s.gxTeam || 0) + 1; });
      users.unlockAchievement(p.id, 'gx_story');
      users.unlockAchievement(p.id, 'gx_star');
      for (const id of REWARD_ITEMS) users.unlockItem(p.id, id, 'Guerra Galáctica');
      users.setHistoryResult(p.historyId, '🏆 Estación Oscura destruida y Lord Vex derrotado');
      this.room.systemMessage(`💥 ¡${p.name} ha destruido la Estación Oscura!`);
      return { ok: true };
    }
    return { error: 'Evento no soportado' };
  }
}
