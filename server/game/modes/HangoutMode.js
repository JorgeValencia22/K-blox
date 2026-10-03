// Hangout: recompensas sociales moderadas (bailar en la pista, hoguera, plataforma del cielo).
import { BaseMode } from './BaseMode.js';
import * as users from '../../services/users.js';

const DANCE_ANIMS = new Set(['dance', 'robot', 'spin', 'flip']);

export class HangoutMode extends BaseMode {
  constructor(room) {
    super(room);
    const zones = Object.fromEntries(this.objectsOfType('zone').map((z) => [z.id, z]));
    this.dance = zones.dancefloor;
    this.fire = zones.campfire;
    this.sky = zones.skyplatform;
  }

  objectives(p) {
    const d = p.data;
    return [
      { id: 'dance', text: 'Baila en la pista (tecla 2)', done: d.danced >= 10 },
      { id: 'fire', text: 'Siéntate junto a la hoguera', done: d.sat },
      { id: 'sky', text: 'Llega a la plataforma del cielo', done: d.sky },
      { id: 'social', text: 'Pasa tiempo con otros jugadores', done: d.socialRewards > 0 },
    ];
  }

  onJoin(p) {
    p.data = { danced: 0, danceAcc: 0, sat: false, sky: false, socialAcc: 0, socialRewards: 0, lastT: Date.now() };
    return { objectives: this.objectives(p) };
  }

  onState(p) {
    const d = p.data;
    const now = Date.now();
    const dt = Math.min(1, (now - d.lastT) / 1000);
    d.lastT = now;
    if (this.dance && DANCE_ANIMS.has(p.anim) && this.inside(p, this.dance, 0, 2)) {
      d.danced += dt;
      d.danceAcc += dt;
      if (d.danced >= 10 && d.danced - dt < 10) {
        users.unlockAchievement(p.id, 'dancer');
        this.emit(p, 'objectives', this.objectives(p));
      }
      if (d.danceAcc >= 60) {
        d.danceAcc = 0;
        const coins = users.dailyCapped(p.id, 'hangout_dance', 5, 50);
        users.award(p.id, { xp: 15, coins, reason: '¡Qué ritmo!' });
      }
    }
    if (!d.sat && this.fire && p.anim === 'sit' && this.inside(p, this.fire, 0, 2)) {
      d.sat = true;
      users.award(p.id, { xp: 15, reason: 'Un rato junto al fuego' });
      this.emit(p, 'objectives', this.objectives(p));
    }
    if (!d.sky && this.sky && this.inside(p, this.sky, 0.5, 2)) {
      d.sky = true;
      users.award(p.id, { xp: 25, coins: 5, reason: '¡Plataforma del cielo!' });
      this.emit(p, 'objectives', this.objectives(p));
    }
  }

  tick(dt) {
    if (this.room.players.size < 2) return;
    for (const p of this.room.players.values()) {
      p.data.socialAcc += dt;
      if (p.data.socialAcc >= 180) {
        p.data.socialAcc = 0;
        p.data.socialRewards++;
        const coins = users.dailyCapped(p.id, 'hangout_social', 5, 40);
        users.award(p.id, { xp: 20, coins, reason: 'Tiempo con amigos' });
        if (p.data.socialRewards === 1) this.emit(p, 'objectives', this.objectives(p));
      }
    }
  }
}
