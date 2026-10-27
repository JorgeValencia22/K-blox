// Guerra Galáctica (cliente): primero el menú (solo o con amigos y elección de héroe) y, cuando el
// anfitrión empieza, la campaña (ver galaxia/campaign.js) y el cooperativo (galaxia/party.js).
import { Campaign } from './galaxia/campaign.js';
import { Lobby } from './galaxia/lobby.js';
import { Party } from './galaxia/party.js';

export class GalaxiaClient {
  constructor(game, state) {
    this.game = game;
    this.blockEmotes = true;
    this.customAudio = true;
    this.hint = [];
    this.state = state || {};
    this.me = this.state.you;
    this.busy = !!this.state.busy;
    this.lobbyState = this.state.lobby || { phase: 'lobby', host: this.me, players: [] };
    this.campaign = null;
    this.party = null;
    this.netEvents = {
      'gx:lobby': (l) => this.onLobby(l),
      'gx:ally': (m) => this.party?.netEvents['gx:ally'](m),
      'gx:hit': (m) => this.party?.netEvents['gx:hit'](m),
      'gx:go': (m) => this.party?.netEvents['gx:go'](m),
    };
    this.lobby = new Lobby(this);
  }

  /** El personaje de la partida se queda quieto: la campaña dibuja su propia escena. */
  get frozen() { return true; }

  get heroId() { return this.lobbyState.players.find((p) => p.id === this.me)?.hero || 'knight'; }

  onLobby(l) {
    this.lobbyState = l;
    if (this.party) { this.party.onLobby(l); return; }
    if (l.phase === 'run' && !this.campaign && !this.busy) this.begin();
    else this.lobby?.render();
  }

  begin() {
    this.party = new Party(this.lobbyState.players, this.me);
    this.lobby?.close();
    this.lobby = null;
    this.campaign = new Campaign(this);
    this.party.attach(this.campaign);
  }

  update(dt) {
    this.campaign?.update(dt);
    this.party?.update(dt);
  }

  dispose() {
    this.lobby?.close();
    this.party?.dispose();
    this.campaign?.dispose();
  }
}
