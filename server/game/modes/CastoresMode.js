// Kest Castores: atraco cooperativo. El servidor lleva los troncos (quién los
// carga, dónde están), los tablones roídos, el tiempo y las entregas en la presa.
import { BaseMode } from './BaseMode.js';
import * as users from '../../services/users.js';

const GNAWS_PER_PLANK = 4;
const COUNTDOWN_MS = 5000;
const RESULT_MS = 10000;

export class CastoresMode extends BaseMode {
  constructor(room) {
    super(room);
    this.rules = this.world.meta.rules;
    this.dropZone = this.objectsOfType('zone').find((z) => z.id === 'dropzone');
    this.plankObjs = new Map(this.objectsOfType('block').filter((o) => o.plank).map((o) => [o.id, o]));
    this.state = 'waiting';
    this.reset();
  }

  reset() {
    this.logs = this.world.meta.logs.map((l, i) => ({ id: `log${i}`, big: l.big, home: l.p, p: [l.p[0], 0.4, l.p[1]], carrier: null, helper: null, delivered: false }));
    this.planks = new Map([...this.plankObjs.keys()].map((id) => [id, GNAWS_PER_PLANK]));
    this.delivered = 0;
    this.startAt = 0;
    this.endsAt = 0;
    this.resultAt = 0;
  }

  get target() {
    return Math.min(this.logs.length, 5 + 2 * Math.max(1, this.room.players.size));
  }

  publicState() {
    return {
      state: this.state, startAt: this.startAt, endsAt: this.endsAt, target: this.target, delivered: this.delivered,
      removed: [...this.planks.entries()].filter(([, hp]) => hp <= 0).map(([id]) => id),
      logs: this.logs.map((l) => ({ id: l.id, big: l.big })),
    };
  }

  sync() {
    this.broadcast('castores', this.publicState());
  }

  onJoin(p) {
    p.data = {};
    if (this.state === 'waiting') this.begin();
    return { castores: this.publicState() };
  }

  onLeave(p) {
    this.release(p, true);
  }

  begin() {
    this.reset();
    this.state = 'countdown';
    this.startAt = Date.now() + COUNTDOWN_MS;
    this.endsAt = this.startAt + this.rules.roundSeconds * 1000;
    this.room.systemMessage(`🦫 ¡Nuevo atraco! Llevad ${this.target} troncos a la presa.`);
    this.sync();
  }

  logOf(p) {
    return this.logs.find((l) => l.carrier === p.id || l.helper === p.id) || null;
  }

  /** Suelta el tronco que lleva p (si era el portador y hay ayudante, este pasa a llevarlo). */
  release(p, silent = false) {
    const l = this.logOf(p);
    if (!l) return null;
    if (l.helper === p.id) l.helper = null;
    else if (l.carrier === p.id) {
      l.carrier = l.helper;
      l.helper = null;
    }
    if (!l.carrier) l.p[1] = 0.4;
    if (!silent) this.broadcast('castores:log', { id: l.id, by: p.name, act: 'drop' });
    return l;
  }

  onEvent(p, name, data = {}) {
    if (this.state !== 'heist') return { error: this.state === 'countdown' ? 'Espera a la cuenta atrás' : 'El atraco ha terminado' };
    if (name === 'gnaw') {
      const o = this.plankObjs.get(String(data.id));
      const hp = this.planks.get(String(data.id));
      if (!o || hp <= 0) return { error: 'No hay tablón' };
      if (Math.hypot(p.pos[0] - o.p[0], p.pos[2] - o.p[2]) > 4) return { error: 'Acércate al tablón' };
      const now = Date.now();
      if (now - (p.data.gnawAt || 0) < 280) return { error: 'cadencia' };
      p.data.gnawAt = now;
      this.planks.set(o.id, hp - 1);
      this.broadcast('castores:gnaw', { id: o.id, hp: hp - 1 });
      if (hp - 1 <= 0) {
        this.room.systemMessage(`🪵 ${p.name} ha roído un tablón`);
        this.sync();
      }
      return { ok: true, hp: hp - 1 };
    }
    if (name === 'grab') {
      if (this.logOf(p)) return { error: 'Ya llevas un tronco' };
      const l = this.logs.find((x) => x.id === data.id);
      if (!l || l.delivered) return { error: 'Tronco no disponible' };
      if (Math.hypot(p.pos[0] - l.p[0], p.pos[2] - l.p[2]) > 3.5) return { error: 'Acércate al tronco' };
      if (!l.carrier) l.carrier = p.id;
      else if (l.big && !l.helper) l.helper = p.id;
      else return { error: 'Ya lo llevan otros castores' };
      this.broadcast('castores:log', { id: l.id, by: p.name, act: 'grab' });
      return { ok: true, id: l.id, big: l.big, helping: l.helper === p.id };
    }
    if (name === 'drop') {
      const l = this.release(p);
      return l ? { ok: true } : { error: 'No llevas nada' };
    }
    return { error: 'Evento no soportado' };
  }

  getRespawn(p) {
    // Si cae (sierra, fuego...) suelta el tronco donde estaba
    this.release(p);
    return null;
  }

  onState(p) {
    const l = this.logs.find((x) => x.carrier === p.id);
    if (!l || l.delivered || !this.dropZone) return;
    if (this.inside(p, this.dropZone, 0, 3)) this.deliver(l, p);
  }

  deliver(l, p) {
    l.delivered = true;
    const helper = l.helper ? this.room.players.get(l.helper) : null;
    l.carrier = null;
    l.helper = null;
    this.delivered++;
    l.p = [this.rules.drop.x + (this.delivered % 4) * 1.8 - 2.7, 1.8 + Math.floor(this.delivered / 4) * 1.1, this.rules.drop.z + 11.5];
    for (const who of [p, helper].filter(Boolean)) {
      users.award(who.id, { xp: l.big ? 35 : 20, coins: users.dailyCapped(who.id, 'castores_log', l.big ? 6 : 3, 60), reason: l.big ? '¡Tronco grande entregado!' : 'Tronco entregado' });
    }
    this.room.systemMessage(`🦫 ${p.name}${helper ? ` y ${helper.name}` : ''} entregan un tronco (${this.delivered}/${this.target})`);
    if (this.delivered >= this.target) this.finish(true);
    this.sync();
  }

  finish(won) {
    this.state = won ? 'won' : 'lost';
    this.resultAt = Date.now();
    for (const p of this.room.players.values()) {
      this.release(p, true);
      if (won) {
        const coins = users.dailyCapped(p.id, 'castores', 60, 120);
        users.award(p.id, { xp: 150, coins, reason: '¡Atraco completado!' });
        users.unlockAchievement(p.id, 'heist');
        users.updateStats(p.id, (s) => { s.heists = (s.heists || 0) + 1; s.wins = (s.wins || 0) + 1; });
      }
      users.setHistoryResult(p.historyId, won ? `Atraco completado (${this.delivered} troncos)` : `Tiempo agotado (${this.delivered}/${this.target})`);
    }
    this.room.systemMessage(won ? '🎉 ¡Atraco completado! La presa está lista.' : '⏰ ¡Se acabó el tiempo! Los guardas del aserradero os han visto.');
    this.sync();
  }

  tick() {
    const now = Date.now();
    if (this.room.players.size === 0) {
      if (this.state !== 'waiting') { this.state = 'waiting'; this.reset(); }
      return;
    }
    if (this.state === 'countdown' && now >= this.startAt) { this.state = 'heist'; this.sync(); }
    if (this.state === 'heist' && now >= this.endsAt) this.finish(false);
    if ((this.state === 'won' || this.state === 'lost') && now - this.resultAt > RESULT_MS) {
      for (const p of this.room.players.values()) {
        const pos = this.room.respawn(p);
        this.emit(p, 'respawn', { p: pos });
      }
      this.begin();
    }
    // Los troncos cargados siguen a quien los lleva (entre los dos si es grande)
    for (const l of this.logs) {
      if (!l.carrier) continue;
      const a = this.room.players.get(l.carrier);
      if (!a) { l.carrier = null; continue; }
      const b = l.helper ? this.room.players.get(l.helper) : null;
      const pts = [a.pos, b?.pos].filter(Boolean);
      const cx = pts.reduce((s, q) => s + q[0], 0) / pts.length, cz = pts.reduce((s, q) => s + q[2], 0) / pts.length;
      const cy = pts.reduce((s, q) => s + q[1], 0) / pts.length;
      l.p = [cx + Math.sin(a.ry) * (b ? 0 : 1.1), cy + 1.25, cz + Math.cos(a.ry) * (b ? 0 : 1.1)];
      l.ry = b ? Math.atan2(b.pos[0] - a.pos[0], b.pos[2] - a.pos[2]) + Math.PI / 2 : a.ry;
    }
  }

  snapExtra() {
    const r = (x) => Math.round(x * 100) / 100;
    return { lg: this.logs.map((l) => [r(l.p[0]), r(l.p[1]), r(l.p[2]), r(l.ry || 0), l.delivered ? 2 : l.carrier ? (l.helper ? 3 : 1) : 0]) };
  }
}
