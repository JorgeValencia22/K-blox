// Carreras: cada jugador tiene su kart. Estados: waiting -> countdown -> racing -> results.
import { BaseMode } from './BaseMode.js';
import * as users from '../../services/users.js';

const COUNTDOWN_MS = 5000;
const FINISH_GRACE_MS = 60_000;
const RESULTS_MS = 8000;

export class RacingMode extends BaseMode {
  constructor(room) {
    super(room);
    this.meta = this.world.meta;
    this.cps = this.objectsOfType('zone').filter((z) => z.id.startsWith('rcp')).sort((a, b) => a.n - b.n);
    this.state = 'waiting';
    this.racers = new Map(); // userId -> { cp, lap, lapStart, finishedAt, name }
    this.startAt = 0;
    this.firstFinish = 0;
    this.resultsAt = 0;
    this.results = [];
  }

  publicState() {
    return {
      state: this.state, startAt: this.startAt, laps: this.meta.laps, checkpoints: this.cps.length,
      standings: this.standings(), results: this.results,
    };
  }

  standings() {
    return [...this.racers.entries()]
      .map(([id, r]) => ({ id, name: r.name, lap: r.lap, cp: r.cp, finishedAt: r.finishedAt, time: r.finishedAt ? r.finishedAt - this.startAt : null }))
      .sort((a, b) => {
        if (a.finishedAt && b.finishedAt) return a.finishedAt - b.finishedAt;
        if (a.finishedAt) return -1;
        if (b.finishedAt) return 1;
        return b.lap - a.lap || b.cp - a.cp;
      });
  }

  sync() {
    this.broadcast('race', this.publicState());
  }

  gridSlot(index) {
    return this.meta.grid[index % this.meta.grid.length];
  }

  onJoin(p) {
    const slot = this.gridSlot(this.room.players.size - 1);
    const vid = `kart-${p.id}`;
    const v = this.room.addVehicle(vid, 'kart', slot.p, slot.ry);
    v.spawn = null; // los karts personales no vuelven a la parrilla solos
    v.driver = p.id;
    p.vehicleId = vid;
    this.room.teleport(p, slot.p);
    this.broadcast('vehicle', this.room.vehiclePublic(v));
    return { race: this.publicState(), ownVehicle: vid };
  }

  onLeave(p) {
    this.racers.delete(p.id);
    const vid = `kart-${p.id}`;
    this.room.vehicles.delete(vid);
    p.vehicleId = null;
    this.broadcast('vehicle:remove', { id: vid });
    if (this.state !== 'waiting' && this.racers.size === 0) this.state = 'waiting';
    this.sync();
  }

  onVehicle(p, v, entered) {
    // En carreras no se puede salir del kart: se vuelve a subir automáticamente.
    if (!entered && v.id === `kart-${p.id}`) {
      v.driver = p.id;
      p.vehicleId = v.id;
    }
  }

  onEvent(p, name) {
    if (name === 'start') {
      if (this.state !== 'waiting') return { error: 'Ya hay una carrera en curso' };
      this.state = 'countdown';
      this.startAt = Date.now() + COUNTDOWN_MS;
      this.results = [];
      this.firstFinish = 0;
      this.racers.clear();
      let i = 0;
      for (const pl of this.room.players.values()) {
        const slot = this.gridSlot(i++);
        this.racers.set(pl.id, { cp: 0, lap: 0, lapStart: this.startAt, finishedAt: 0, name: pl.name });
        this.room.teleport(pl, slot.p);
        this.emit(pl, 'race:grid', { p: slot.p, ry: slot.ry });
      }
      this.room.systemMessage(`🏎️ ${p.name} ha iniciado una carrera. ¡Preparados!`);
      this.sync();
      return { ok: true };
    }
    if (name === 'reset') {
      // Recolocar el kart en el último punto de control superado
      const r = this.racers.get(p.id);
      const cp = this.cps[r ? (r.cp + this.cps.length - 1) % this.cps.length : 0];
      const pos = [cp.p[0], 0.6, cp.p[2]];
      this.room.teleport(p, pos);
      const next = this.cps[r ? r.cp % this.cps.length : 1];
      const ry = (Math.atan2(next.p[0] - cp.p[0], next.p[2] - cp.p[2]) * 180) / Math.PI;
      return { ok: true, pos, ry };
    }
    return { error: 'Evento no soportado' };
  }

  onState(p) {
    if (this.state !== 'racing') return;
    const r = this.racers.get(p.id);
    if (!r || r.finishedAt) return;
    const target = this.cps[r.cp % this.cps.length];
    if (!this.inside(p, target, 0, 6)) return;
    if (r.cp % this.cps.length === 0 && r.cp > 0) {
      // Línea de meta: vuelta completada
      const now = Date.now();
      if (now - r.lapStart < this.meta.minLapTime * 1000) {
        this.room.flag(p, 'lap-time');
        return;
      }
      r.lap++;
      r.lapStart = now;
      if (r.lap >= this.meta.laps) {
        r.finishedAt = now;
        this.onFinish(p, r);
      }
    }
    r.cp++;
    this.sync();
  }

  onFinish(p, r) {
    const place = this.standings().filter((s) => s.finishedAt).length;
    const time = r.finishedAt - this.startAt;
    const multi = this.racers.size >= 2;
    if (!this.firstFinish) this.firstFinish = r.finishedAt;
    this.room.systemMessage(`🏁 ${p.name} termina en posición ${place} (${(time / 1000).toFixed(1)} s)`);
    users.updateStats(p.id, (s) => {
      s.races = (s.races || 0) + 1;
      if (place === 1 && multi) { s.wins = (s.wins || 0) + 1; s.raceWins = (s.raceWins || 0) + 1; }
      if (!s.bestRace || time < s.bestRace) s.bestRace = time;
    });
    const coins = users.dailyCapped(p.id, 'racing', place === 1 && multi ? 60 : 25, 200);
    users.award(p.id, { xp: place === 1 && multi ? 120 : 60, coins, reason: `Carrera: posición ${place}` });
    users.setHistoryResult(p.historyId, `Posición ${place} de ${this.racers.size}`);
    users.unlockAchievement(p.id, 'racer');
    if (place === 1 && multi) users.unlockAchievement(p.id, 'champion');
  }

  tick() {
    const now = Date.now();
    if (this.state === 'countdown' && now >= this.startAt) {
      this.state = 'racing';
      this.sync();
    } else if (this.state === 'racing') {
      const all = [...this.racers.values()];
      const done = all.length > 0 && all.every((r) => r.finishedAt);
      if (done || (this.firstFinish && now - this.firstFinish > FINISH_GRACE_MS) || all.length === 0) {
        this.state = 'results';
        this.results = this.standings();
        this.resultsAt = now;
        this.sync();
      }
    } else if (this.state === 'results' && now - this.resultsAt > RESULTS_MS) {
      this.state = 'waiting';
      this.racers.clear();
      this.sync();
    }
  }

  getRespawn(p) {
    const r = this.racers.get(p.id);
    const cp = this.cps[r ? (r.cp + this.cps.length - 1) % this.cps.length : 0];
    return [cp.p[0], 0.6, cp.p[2]];
  }
}
