// Modos sencillos: Kest Teclas (obby con estadísticas propias) y Kest Only Up.
import { BaseMode } from './BaseMode.js';
import { ObbyMode } from './ObbyMode.js';
import * as users from '../../services/users.js';

export class KeysMode extends ObbyMode {
  constructor(room) {
    super(room, { stats: { best: 'keysBest', clears: 'keysClears', daily: 'keys', label: 'Kest Teclas completado', achievements: ['keys_clear'], fast: null } });
  }
}

/**
 * Only Up: sin puntos de control. El servidor guarda la altura máxima alcanzada
 * (las posiciones ya están validadas por velocidad) y premia llegar a la cima.
 */
export class OnlyUpMode extends BaseMode {
  constructor(room) {
    super(room);
    this.finish = this.objectsOfType('finish')[0];
    this.summit = this.world.meta.summit;
    this.acc = 0;
  }

  onJoin(p) {
    const s = users.getUser(p.id).stats;
    p.data = { max: 0, record: s.upBest || 0, reached: false, start: Date.now(), milestone: 0 };
    return { up: { record: p.data.record, summit: this.summit } };
  }

  onState(p) {
    const d = p.data;
    const h = p.pos[1];
    if (h > d.max) d.max = h;
    // Hitos cada 50 m (pequeña recompensa diaria, para que el progreso se note)
    const m = Math.floor(h / 50);
    if (m > d.milestone && m >= 1) {
      d.milestone = m;
      const coins = users.dailyCapped(p.id, 'onlyup_milestone', 5, 40);
      users.award(p.id, { xp: 15, coins, reason: `¡${m * 50} metros!` });
    }
    if (h > d.record + 0.5) {
      d.record = h;
      d.recordDirty = true;
    }
    if (!d.reached && this.finish && this.inside(p, this.finish)) {
      d.reached = true;
      const time = Date.now() - d.start;
      users.updateStats(p.id, (s) => { s.upClears = (s.upClears || 0) + 1; });
      const coins = users.dailyCapped(p.id, 'onlyup', 150, 150);
      users.award(p.id, { xp: 300, coins, reason: '¡Has llegado a la cima!' });
      users.unlockAchievement(p.id, 'summit_up');
      users.setHistoryResult(p.historyId, `Cima en ${Math.round(time / 1000)} s`);
      this.room.systemMessage(`🏔️ ${p.name} ha llegado a la cima de Kest Only Up`);
      this.emit(p, 'up:summit', { time });
    }
  }

  onLeave(p) {
    this.saveRecord(p);
  }

  saveRecord(p) {
    if (!p.data.recordDirty) return;
    p.data.recordDirty = false;
    const rec = Math.round(p.data.record);
    users.updateStats(p.id, (s) => { if (!s.upBest || rec > s.upBest) s.upBest = rec; });
  }

  tick(dt) {
    this.acc += dt;
    if (this.acc < 1) return;
    this.acc = 0;
    // Clasificación de alturas de la sala (para el panel del HUD)
    const board = [...this.room.players.values()]
      .map((p) => ({ name: p.name, h: Math.round(p.pos[1]) }))
      .sort((a, b) => b.h - a.h)
      .slice(0, 5);
    this.broadcast('up:board', board);
    for (const p of this.room.players.values()) this.saveRecord(p);
  }
}
