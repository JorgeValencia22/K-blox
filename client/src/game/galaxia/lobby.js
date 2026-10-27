// Menú de Guerra Galáctica: jugar solo o con amigos (hasta 4), elegir héroe e invitar. Se muestra
// antes de la campaña y se cierra cuando el anfitrión empieza la partida.
import { net } from '../../core/net.js';
import { get } from '../../core/api.js';
import { h, toast, modal, button } from '../../ui/dom.js';
import { HEROES, HERO_IDS } from './heroes.js';

/** Pone el color del héroe como variable CSS (h() no admite variables en style). */
const tint = (el, c) => { el.style.setProperty('--c', c); return el; };
const pips = (n) => h('span.gxl-pips', [1, 2, 3, 4, 5].map((i) => h('i' + (i <= n ? '.on' : ''))));

export class Lobby {
  constructor(client) {
    this.client = client;
    this.game = client.game;
    this.screen = 'home'; // home | pick
    this.team = false;
    this.root = h('div.gxl');
    document.body.appendChild(this.root);
    this.render();
  }

  get state() { return this.client.lobbyState; }
  get me() { return this.state.players.find((p) => p.id === this.client.me); }
  get isHost() { return this.state.host === this.client.me; }

  send(name, data) { return net.request('mode', { name, data }).catch(() => ({})); }

  render() {
    if (this.client.busy) {
      this.root.replaceChildren(this.frame(h('div.gxl-center',
        h('h2', 'Partida en curso'),
        h('p', 'Esta partida ya ha empezado. Espera a que termine o crea la tuya.'),
        button('Salir', () => this.game.exit('leave'), 'primary'))));
      return;
    }
    this.root.replaceChildren(this.frame(this.screen === 'home' ? this.home() : this.pick()));
  }

  frame(inner) {
    return h('div.gxl-wrap',
      h('div.gxl-stars'),
      h('div.gxl-logo', h('small', 'UN EVENTO DE KESTWORLDS'), h('b', 'GUERRA'), h('b.g2', 'GALÁCTICA')),
      inner);
  }

  home() {
    return h('div.gxl-menu',
      h('button.gxl-big', { on: { click: () => { this.team = false; this.screen = 'pick'; this.render(); } } }, h('span', '🚀'), h('div', h('b', 'JUGAR SOLO'), h('small', 'Tu propia aventura, sin esperas'))),
      h('button.gxl-big.alt', { on: { click: () => { this.team = true; this.screen = 'pick'; this.render(); } } }, h('span', '👥'), h('div', h('b', 'JUGAR CON AMIGOS'), h('small', 'Hasta 4 jugadores · comparten enemigos y se levantan entre sí'))),
      h('button.gxl-link', { on: { click: () => this.game.exit('leave') } }, '← Volver al menú'));
  }

  pick() {
    const mine = this.me?.hero || 'knight';
    const cards = HERO_IDS.map((id) => {
      const H = HEROES[id];
      return tint(h('button.gxl-card' + (id === mine ? '.sel' : ''), { on: { click: () => this.choose(id) } },
        h('div.gxl-ic', H.icon),
        h('b', H.name),
        h('div.gxl-role', H.role),
        h('div.gxl-stats', Object.entries(H.stats).map(([k, v]) => h('div.gxl-st', h('span', k), pips(v)))),
        h('div.gxl-sp', h('b', `[Q] ${H.special.name}`), h('span', H.special.desc)),
        h('div.gxl-brief', H.brief)), H.color);
    });
    return h('div.gxl-pick',
      h('div.gxl-title', this.team ? 'ELIGE TU HÉROE · EQUIPO' : 'ELIGE TU HÉROE'),
      h('div.gxl-cards', cards),
      this.team ? this.teamPanel() : null,
      h('div.gxl-actions',
        h('button.gxl-link', { on: { click: () => { this.screen = 'home'; this.render(); } } }, '← Atrás'),
        this.startButton()));
  }

  startButton() {
    if (this.team && !this.isHost) return h('div.gxl-wait', '⏳ Esperando a que el anfitrión empiece…');
    const n = this.state.players.length;
    return h('button.gxl-go', { on: { click: () => this.begin() } }, this.team && n > 1 ? `▶ EMPEZAR CON ${n} JUGADORES` : '▶ COMENZAR MISIÓN');
  }

  teamPanel() {
    const code = this.game.room?.inviteCode;
    return h('div.gxl-team',
      h('div.gxl-team-h', h('b', `Equipo (${this.state.players.length}/4)`), code ? h('span.tag', `Código: ${code}`) : null,
        button('✉ Invitar amigos', () => this.invite(), 'small primary')),
      h('div.gxl-players', this.state.players.map((p) => {
        const H = HEROES[p.hero] || HEROES.knight;
        return tint(h('div.gxl-pl', h('span', H.icon), h('b', p.name + (p.id === this.state.host ? ' 👑' : '')), h('small', H.name)), H.color);
      })));
  }

  async choose(id) {
    const r = await this.send('pick', { hero: id });
    if (r.error) toast(r.error, 'err');
  }

  async begin() {
    const r = await this.send('begin');
    if (r.error) toast(r.error, 'err');
  }

  async invite() {
    let data;
    try { data = await get('/friends'); } catch (e) { return toast(e.message, 'err'); }
    const online = data.friends.filter((f) => f.online);
    modal('Invitar amigos', h('div.list',
      online.length ? online.map((f) => h('div.list-item', h('span.dot.on'), h('span.name.grow', f.username),
        button('Invitar', async (ev) => {
          const r = await net.request('invite', { userId: f.id });
          toast(r.error || `Invitación enviada a ${f.username}`, r.error ? 'err' : 'ok');
          ev.target.disabled = true;
        }, 'small primary'))) : h('p.muted', 'Ninguno de tus amigos está conectado ahora mismo.')), { actions: [{ label: 'Cerrar' }] });
  }

  close() {
    this.root.remove();
  }
}
