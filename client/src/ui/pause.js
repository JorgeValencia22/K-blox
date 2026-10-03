// Menú de pausa de la partida.
import { h, button, modal, toast, clear } from './dom.js';
import { openSettings } from './settingsPanel.js';
import { get } from '../core/api.js';
import { net } from '../core/net.js';

export class PauseMenu {
  constructor(game) {
    this.game = game;
    this.el = h('div.pause.hidden');
    document.getElementById('ui').appendChild(this.el);
  }

  open() {
    const g = this.game;
    const code = g.room?.inviteCode;
    clear(this.el).append(h('div.panel',
      h('h2', 'Pausa'),
      h('div.muted.small', g.title + (code ? ` · Sala privada (código ${code})` : '')),
      button('▶ Continuar', () => this.close(), 'primary'),
      button('↺ Reaparecer', () => { this.close(); g.respawn(); }),
      button('⚙ Configuración', () => openSettings()),
      g.offline ? null : button('✉ Invitar amigos', () => this.invite()),
      button(g.offline ? '✎ Volver al editor' : '⏏ Salir de la partida', () => g.exit('leave'), 'danger'),
    ));
    this.el.classList.remove('hidden');
  }

  close() {
    if (this.el.classList.contains('hidden')) return;
    this.el.classList.add('hidden');
    this.game.resume();
  }

  async invite() {
    let data;
    try {
      data = await get('/friends');
    } catch (e) {
      return toast(e.message, 'err');
    }
    const online = data.friends.filter((f) => f.online);
    modal('Invitar amigos', h('div.list',
      online.length ? online.map((f) => h('div.list-item', h('span.dot.on'), h('span.name.grow', f.username),
        button('Invitar', async (ev) => {
          const r = await net.request('invite', { userId: f.id });
          toast(r.error || `Invitación enviada a ${f.username}`, r.error ? 'err' : 'ok');
          ev.target.disabled = true;
        }, 'small primary'))) : h('p.muted', 'Ninguno de tus amigos está conectado ahora mismo.'),
    ), { actions: [{ label: 'Cerrar' }] });
  }

  destroy() {
    this.el.remove();
  }
}
