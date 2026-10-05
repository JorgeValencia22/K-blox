// Isla Metrópolis: gemas persistentes, cofres por sesión, cumbre y vuelo.
import { BaseMode } from './BaseMode.js';
import * as users from '../../services/users.js';
import { getHeightmap } from '../../../shared/terrain.js';

export class CityMode extends BaseMode {
  constructor(room) {
    super(room);
    this.gems = this.objectsOfType('gem');
    this.chests = this.objectsOfType('chest');
    this.summit = this.objectsOfType('zone').find((z) => z.id === 'summit');
    this.hm = getHeightmap(this.world.terrain);
  }

  objectives(p) {
    const d = p.data;
    return [
      { id: 'gems', text: 'Encuentra las gemas', progress: d.gems.size, total: this.gems.length },
      { id: 'chests', text: 'Abre los cofres', progress: d.chests.size, total: this.chests.length },
      { id: 'summit', text: 'Llega a la cumbre de la montaña', done: d.summit },
      { id: 'fly', text: 'Vuela con la avioneta del aeródromo', done: d.flew },
    ];
  }

  onJoin(p) {
    const stats = users.getUser(p.id).stats;
    p.data = { gems: new Set(stats.cityGems || []), chests: new Set(), summit: false, flew: false };
    return { objectives: this.objectives(p), gems: [...p.data.gems] };
  }

  sendObjectives(p) {
    this.emit(p, 'objectives', this.objectives(p));
  }

  onInteract(p, o) {
    if (o.t === 'gem') {
      if (p.data.gems.has(o.id)) return { error: 'Ya tienes esta gema' };
      p.data.gems.add(o.id);
      const list = [...p.data.gems];
      users.updateStats(p.id, (s) => { s.cityGems = list; });
      users.award(p.id, { xp: 30, coins: 10, reason: 'Gema encontrada' });
      if (p.data.gems.size >= this.gems.length) users.unlockAchievement(p.id, 'gem_hunter');
      this.sendObjectives(p);
      return { ok: true, collected: o.id };
    }
    if (o.t === 'chest') {
      if (p.data.chests.has(o.id)) return { error: 'Ya has abierto este cofre en esta partida' };
      p.data.chests.add(o.id);
      const stats = users.updateStats(p.id, (s) => { s.chests = (s.chests || 0) + 1; });
      const coins = users.dailyCapped(p.id, 'city_chest', 15, 150);
      users.award(p.id, { xp: 20, coins, reason: coins ? 'Cofre abierto' : 'Cofre abierto (límite diario de monedas)' });
      if (stats.chests >= 5) users.unlockAchievement(p.id, 'treasure');
      this.sendObjectives(p);
      return { ok: true, opened: o.id };
    }
    return null;
  }

  onState(p) {
    if (!p.data.summit && this.summit && this.inside(p, this.summit, 0, 4)) {
      p.data.summit = true;
      users.award(p.id, { xp: 40, coins: 15, reason: '¡Cumbre alcanzada!' });
      users.unlockAchievement(p.id, 'summit');
      this.sendObjectives(p);
    }
    if (!p.data.flew && p.vehicleId) {
      const v = this.room.vehicles.get(p.vehicleId);
      if (v && v.type === 'plane' && v.p[1] - this.hm.heightAt(v.p[0], v.p[2]) > 15) {
        p.data.flew = true;
        users.award(p.id, { xp: 40, coins: 10, reason: '¡Has despegado!' });
        users.unlockAchievement(p.id, 'pilot');
        this.sendObjectives(p);
      }
    }
  }
}
