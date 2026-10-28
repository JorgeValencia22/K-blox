// Skate Pro: cada patinador lleva su física en su pantalla (shared/skate/sim.js) y elige su propio
// mapa. El servidor reenvía las posiciones a los demás patinadores (se ven en el mismo mapa y el ranking
// en vivo), y al terminar una sesión de Puntuación o Misiones comprueba que la puntuación sea posible
// para el tiempo jugado antes de dar la experiencia, guardar el récord, la medalla y los logros.
import { BaseMode } from './BaseMode.js';
import * as users from '../../services/users.js';
import { SKATE_MAP_BY_ID, SKATE_MAP_IDS, medalFor } from '../../../shared/skate/maps.js';

export const MIN_RUN_MS = 20000;
/** Máximo realista de puntos por segundo (un combo enorme en un mapa grande queda muy por debajo). */
export const MAX_SCORE_PER_SEC = 2500;
const RECORDED = ['attack', 'missions'];

/** Normaliza el resultado enviado por el cliente; devuelve null si no es posible. */
export function validateRun(d, elapsedMs) {
  if (!d || typeof d !== 'object') return null;
  if (!SKATE_MAP_IDS.includes(d.map) || !RECORDED.includes(d.mode)) return null;
  const ms = Math.floor(Number(d.ms));
  const score = Math.floor(Number(d.score));
  const goals = Math.floor(Number(d.goals) || 0);
  const bestCombo = Math.floor(Number(d.bestCombo) || 0);
  const tricks = Math.floor(Number(d.tricks) || 0);
  if (![ms, score, goals, bestCombo, tricks].every(Number.isFinite)) return null;
  const played = Math.min(ms, elapsedMs + 2000);
  if (played < MIN_RUN_MS || elapsedMs < MIN_RUN_MS) return null;
  if (score < 0 || score > (played / 1000) * MAX_SCORE_PER_SEC) return null;
  if (bestCombo < 0 || bestCombo > score) return null;
  if (goals < 0 || goals > SKATE_MAP_BY_ID[d.map].goals.length) return null;
  if (tricks < 0 || tricks > played / 40) return null;
  return { map: d.map, mode: d.mode, score, ms: played, goals, bestCombo, tricks };
}

export class SkateMode extends BaseMode {
  constructor(room) {
    super(room);
    this.runs = new Map(); // id -> { map, mode, t0 }
  }

  best(id) {
    return users.getUser(id)?.stats?.skate?.best || {};
  }

  onJoin(p) {
    this.runs.delete(p.id);
    return { best: this.best(p.id), you: p.id };
  }

  onLeave(p) {
    this.runs.delete(p.id);
    this.broadcast('sk:gone', { id: p.id });
  }

  onEvent(p, name, data = {}) {
    if (name === 'start') {
      if (!SKATE_MAP_IDS.includes(data.map)) return { error: 'Mapa no válido' };
      this.runs.set(p.id, { map: data.map, mode: String(data.mode || ''), t0: Date.now() });
      return { ok: true };
    }
    // Estado del patinador (10 veces por segundo): se reenvía a los demás
    if (name === 'st') {
      if (!SKATE_MAP_IDS.includes(data.m)) return null;
      const n = (v) => (Number.isFinite(+v) ? +v : 0);
      const msg = { id: p.id, name: p.name, m: data.m, x: n(data.x), y: n(data.y), z: n(data.z), yaw: n(data.yaw), sc: Math.max(0, Math.floor(n(data.sc))), st: Math.floor(n(data.st)) };
      for (const other of this.room.players.values()) if (other.id !== p.id) other.socket.emit('sk:ally', msg);
      return null;
    }
    if (name === 'done') {
      const run = this.runs.get(p.id);
      if (!run) return { error: 'Partida no válida' };
      this.runs.delete(p.id);
      const v = validateRun({ ...data, map: run.map, mode: run.mode }, Date.now() - run.t0);
      if (!v) return { error: 'Partida no válida' };
      return this.record(p, v);
    }
    return { error: 'Evento no soportado' };
  }

  record(p, v) {
    const medal = v.mode === 'attack' ? medalFor(v.map, v.score) : 0;
    const stars = v.mode === 'missions' ? (v.goals >= 7 ? 3 : v.goals >= 5 ? 2 : v.goals >= 3 ? 1 : 0) : 0;
    let newBest = false;
    let gold = [];
    const stats = users.updateStats(p.id, (s) => {
      const sk = s.skate || (s.skate = { best: {}, gold: {}, stars: {}, runs: 0 });
      sk.best = sk.best || {}; sk.gold = sk.gold || {}; sk.stars = sk.stars || {};
      sk.runs = (sk.runs || 0) + 1;
      if (v.mode === 'attack') {
        if (v.score > (sk.best[v.map] || 0)) { sk.best[v.map] = v.score; newBest = true; }
        if (medal >= 3) sk.gold[v.map] = true;
      } else if (stars > (sk.stars[v.map] || 0)) sk.stars[v.map] = stars;
      gold = Object.keys(sk.gold);
    });
    const xp = Math.min(420, 20 + Math.floor(v.score / 500) + v.goals * 25 + medal * 40 + stars * 30);
    users.award(p.id, { xp, coins: 0, reason: `Skate Pro: ${SKATE_MAP_BY_ID[v.map].name}` });
    users.unlockAchievement(p.id, 'sk_first');
    if (medal >= 3) users.unlockAchievement(p.id, 'sk_gold');
    if (v.bestCombo >= 10000) users.unlockAchievement(p.id, 'sk_combo');
    if (gold.length >= SKATE_MAP_IDS.length) users.unlockAchievement(p.id, 'sk_all');
    if (medal >= 3) this.room.systemMessage(`🥇 ¡${p.name} ha conseguido el oro en ${SKATE_MAP_BY_ID[v.map].name} con ${v.score} puntos!`);
    return { ok: true, medal, stars, newBest, xp, best: stats?.skate?.best || {} };
  }
}
