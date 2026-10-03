// Obby: puntos de control en orden, meta y cronómetro validados en el servidor.
// También lo usan los mundos de usuarios que tengan checkpoints/meta.
import { BaseMode } from './BaseMode.js';
import * as users from '../../services/users.js';

export class ObbyMode extends BaseMode {
  /**
   * opts.stats: claves de estadísticas/recompensas para recorridos oficiales distintos
   * (Kest Obby y Kest Teclas comparten esta lógica).
   */
  constructor(room, { official = true, stats = null } = {}) {
    super(room);
    this.official = official;
    this.stats = stats || { best: 'obbyBest', clears: 'obbyClears', daily: 'obby', label: 'Obby completado', achievements: ['obby_clear'], fast: ['obby_fast', 180_000] };
    this.checkpoints = this.objectsOfType('checkpoint').sort((a, b) => a.n - b.n);
    this.finish = this.objectsOfType('finish')[0] || null;
    this.minTime = (this.world.meta?.minTime ?? Math.max(3, this.checkpoints.length * 2)) * 1000;
  }

  reset(p) {
    p.data.cp = 0;
    p.data.start = Date.now();
    p.data.finished = false;
  }

  status(p) {
    return { cp: p.data.cp, total: this.checkpoints.length, start: p.data.start, best: p.data.best ?? null, finished: p.data.finished };
  }

  onJoin(p) {
    const s = users.getUser(p.id).stats;
    p.data = { best: this.official ? s[this.stats.best] ?? null : null };
    this.reset(p);
    return { obby: this.status(p) };
  }

  onState(p) {
    if (p.data.finished) return;
    const next = this.checkpoints[p.data.cp];
    if (next && this.inside(p, next)) {
      p.data.cp++;
      this.emit(p, 'obby', { ...this.status(p), reached: p.data.cp });
      return;
    }
    if (this.finish && p.data.cp >= this.checkpoints.length && this.inside(p, this.finish)) {
      const time = Date.now() - p.data.start;
      if (time < this.minTime) {
        this.room.flag(p, 'obby-time');
        return;
      }
      p.data.finished = true;
      const isBest = p.data.best == null || time < p.data.best;
      if (isBest) p.data.best = time;
      this.onFinish(p, time, isBest);
      this.emit(p, 'obby', { ...this.status(p), finishTime: time, isBest });
      this.room.systemMessage(`🏁 ${p.name} completó el recorrido en ${(time / 1000).toFixed(1)} s`);
    }
  }

  onFinish(p, time, isBest) {
    if (!this.official) {
      const coins = users.dailyCapped(p.id, `world:${this.room.key}`, 10, 10);
      users.award(p.id, { xp: 30, coins, reason: 'Mundo completado' });
      return;
    }
    const k = this.stats;
    const s = users.updateStats(p.id, (st) => {
      st[k.clears] = (st[k.clears] || 0) + 1;
      if (isBest) st[k.best] = time;
    });
    const first = s[k.clears] === 1;
    const coins = users.dailyCapped(p.id, k.daily, first ? 80 : 25, 120);
    users.award(p.id, { xp: first ? 150 : 60, coins, reason: k.label });
    users.setHistoryResult(p.historyId, `Completado en ${(time / 1000).toFixed(1)} s`);
    for (const a of k.achievements) users.unlockAchievement(p.id, a);
    if (k.fast && time < k.fast[1]) users.unlockAchievement(p.id, k.fast[0]);
  }

  onEvent(p, name) {
    if (name === 'restart') {
      this.reset(p);
      const pos = this.room.spawns[0];
      this.room.teleport(p, pos);
      return { ok: true, pos, obby: this.status(p) };
    }
    return { error: 'Evento no soportado' };
  }

  getRespawn(p) {
    const cp = this.checkpoints[p.data.cp - 1];
    if (cp) return [cp.p[0], cp.p[1] + cp.s[1] / 2 + 0.2, cp.p[2]];
    return null;
  }
}
