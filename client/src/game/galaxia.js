// Guerra Galáctica (cliente), en cooperativo: el servidor lleva los capítulos y los combates; aquí
// se dibuja la campaña (galaxia/campaign.js) y se reciben sus mensajes.
import { Campaign } from './galaxia/campaign.js';

export class GalaxiaClient {
  constructor(game, state) {
    this.game = game;
    this.blockEmotes = true;
    this.customAudio = true;
    this.hint = [];
    this.campaign = new Campaign(this);
    // Mensajes del servidor (nombres tal y como los envía GalaxiaMode)
    this.netEvents = {
      'gx:chapter': (m) => this.campaign.follow(m.name),
      enc: (snap) => this.campaign.onSnap(snap),
      'enc:ev': (ev) => this.campaign.onEnc(ev),
    };
    this.campaign.start(state);
  }

  /** La partida local no mueve al personaje: la campaña dibuja su propia escena. */
  get frozen() { return true; }

  update(dt) { this.campaign.update(dt); }

  dispose() { this.campaign.dispose(); }
}
