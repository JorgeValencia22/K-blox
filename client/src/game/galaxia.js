// Guerra Galáctica (cliente): al entrar empieza la campaña de un jugador (ver galaxia/campaign.js).
import { Campaign } from './galaxia/campaign.js';

export class GalaxiaClient {
  constructor(game, state) {
    this.game = game;
    this.netEvents = {};
    this.blockEmotes = true;
    this.customAudio = true;
    this.hint = [];
    this.state = state || {};
    this.campaign = new Campaign(this);
  }

  /** El personaje de la partida se queda quieto: la campaña dibuja su propia escena. */
  get frozen() { return true; }

  update(dt) { this.campaign.update(dt); }

  dispose() { this.campaign.dispose(); }
}
