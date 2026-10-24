// Guerra Galáctica: campaña de un jugador que se juega entera en el cliente (combate espacial,
// estación, núcleo, duelo con Lord Vex…). El servidor solo apunta cuándo empieza y, al terminar,
// comprueba que ha pasado el tiempo mínimo para dar los premios.
import { BaseMode } from './BaseMode.js';
import * as users from '../../services/users.js';

/** Tiempo mínimo (ms) que dura la campaña completa; la real ronda los 8–12 minutos. */
export const MIN_CAMPAIGN_MS = 150000;
export const REWARD_ITEMS = ['skin_starknight', 'skin_darklord', 'skin_droid', 'skin_trooper'];

export class GalaxiaMode extends BaseMode {
  constructor(room) {
    super(room);
    this.starts = new Map();
  }

  onJoin(p) {
    this.starts.delete(p.id);
    return { campaign: true };
  }

  onLeave(p) { this.starts.delete(p.id); }

  onEvent(p, name) {
    if (name === 'start') {
      this.starts.set(p.id, Date.now());
      return { ok: true };
    }
    if (name === 'done') {
      const t0 = this.starts.get(p.id);
      if (!t0 || Date.now() - t0 < MIN_CAMPAIGN_MS) return { error: 'Misión no válida' };
      this.starts.delete(p.id);
      users.award(p.id, { xp: 450, coins: 0, reason: '¡Misión completada: Guerra Galáctica!' });
      users.updateStats(p.id, (s) => { s.gxCampaign = (s.gxCampaign || 0) + 1; s.wins = (s.wins || 0) + 1; });
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
