// Panel de desarrollador dentro de la partida (solo administradores).
// Permite espectear, controlar, congelar, lanzar, matar, hacer perder, traer o
// expulsar jugadores, y cerrar el servidor. Todas las acciones las valida el servidor.
import { h, button, clear, toast } from './dom.js';
import { net } from '../core/net.js';
import { store } from '../core/store.js';
import { input } from '../engine/input.js';

export async function adminRequest(action, data = {}) {
  const r = await net.request('admin', { action, ...data });
  if (r.error) toast(r.error, 'err');
  return r;
}

export class AdminPanel {
  constructor(game) {
    this.game = game;
    this.open = false;
    this.el = h('div.admin-panel.panel.hidden');
    game.hud.el.appendChild(this.el);
    this.btn = button('🛡️', () => this.toggle(), 'small');
    this.btn.title = 'Modo desarrollador (F2)';
    game.hud.el.querySelector('.tr')?.prepend(this.btn);
    this.ctlAcc = 0;
  }

  toggle(force) {
    this.open = force ?? !this.open;
    this.el.classList.toggle('hidden', !this.open);
    if (this.open) {
      if (input.locked) { this.game.ignoreUnlock = true; input.unlockPointer(); }
      this.render();
    }
  }

  players() {
    const list = [];
    for (const r of this.game.remotes.values()) if (!r.npc && !r.bot) list.push({ id: r.id, name: r.name });
    return list;
  }

  async act(action, userId, extra = {}) {
    const r = await adminRequest(action, { userId, ...extra });
    if (r.ok) toast('Hecho ✔', 'ok', 1500);
    return r;
  }

  render() {
    const g = this.game;
    const target = g.specTarget;
    const rows = this.players().map((p) => h(`div.list-item${p.id === target ? '.on' : ''}`,
      h('span.grow', h('b', p.name), p.id === target ? h('span.tag', { style: { marginLeft: '6px' } }, g.controlling ? '🎮 controlando' : '👁️ mirando') : null),
      h('div.row.wrap', { style: { gap: '4px', justifyContent: 'flex-end' } },
        button('👁️', () => this.spectate(p.id), 'small'),
        button(g.controlling === p.id ? '⏹ Soltar' : '🎮', () => this.control(p.id), 'small'),
        button('🧊', () => this.act('freeze', p.id, { on: !this.frozen?.has(p.id) }).then((r) => { if (r.ok) { this.frozen ??= new Set(); r.frozen ? this.frozen.add(p.id) : this.frozen.delete(p.id); this.render(); } }), 'small'),
        button('🚀', () => this.act('launch', p.id), 'small'),
        g.spectator ? null : button('🧲', () => this.act('bring', p.id, { pos: [g.player.body.x, g.player.body.y, g.player.body.z] }), 'small'),
        button('💀', () => this.act('kill', p.id), 'small danger'),
        button('❌ Perder', () => this.act('lose', p.id), 'small danger'),
        button('🚪', () => this.act('kick', p.id), 'small danger'),
      ),
    ));
    clear(this.el).append(
      h('div.row', h('h3', { style: { margin: 0, flex: 1 } }, '🛡️ Modo desarrollador'), button('✕', () => this.toggle(false), 'small')),
      h('div.small.muted', '👁️ espectear · 🎮 controlar · 🧊 congelar · 🚀 lanzar · 🧲 traer · 💀 matar · 🚪 expulsar'),
      h('div.list', { style: { maxHeight: '46vh', overflow: 'auto', margin: '8px 0' } }, rows.length ? rows : h('p.muted', 'No hay más jugadores en este servidor.')),
      h('div.row.wrap',
        g.spectator ? button('⬅️ Anterior', () => g.cycleSpectate(-1), 'small') : null,
        g.spectator ? button('Siguiente ➡️', () => g.cycleSpectate(1), 'small') : null,
        button('📢 Anuncio', () => this.announce(), 'small'),
        button('⛔ Cerrar este servidor', () => this.closeRoom(), 'small danger'),
      ),
    );
  }

  async spectate(id) {
    const g = this.game;
    if (g.spectator) {
      g.setSpecTarget(id);
      this.render();
      return;
    }
    const r = await adminRequest('spectate', { userId: id });
    if (r.ok) window.kest.app.startSpectating(r);
  }

  async control(id) {
    const g = this.game;
    if (g.controlling === id) {
      await adminRequest('control', { userId: id, on: false });
      g.controlling = null;
      this.render();
      return;
    }
    if (!g.spectator || g.specTarget !== id) {
      toast('Primero espectea a ese jugador (👁️) y luego pulsa 🎮', 'warn');
      return;
    }
    const r = await adminRequest('control', { userId: id, on: true });
    if (r.ok) {
      g.controlling = id;
      toast('Controlando: usa WASD, Shift y Espacio. Pulsa 🎮 de nuevo para soltar.', 'ok', 4000);
      this.toggle(false);
      g.requestLock();
    }
  }

  announce() {
    const text = prompt('Mensaje para TODOS los jugadores conectados:');
    if (text) adminRequest('announce', { text }).then((r) => r.ok && toast('Anuncio enviado', 'ok'));
  }

  async closeRoom() {
    if (!confirm('¿Cerrar este servidor? Todos los jugadores volverán al menú.')) return;
    await adminRequest('closeRoom', { roomId: this.game.room.id });
  }

  /** Mientras controla a alguien, envía los controles del admin unas 15 veces por segundo. */
  update(dt) {
    const g = this.game;
    if (!g.controlling) return;
    this.ctlAcc += dt;
    if (this.ctlAcc < 1 / 15) return;
    this.ctlAcc = 0;
    const m = input.moveVector();
    net.send('admin:ctl', { target: g.controlling, x: m.x, y: m.y, yaw: g.cam.yaw, run: input.down('ShiftLeft'), jump: input.down('Space') });
  }

  destroy() {
    this.el.remove();
    this.btn.remove();
  }
}

export const isAdmin = () => store.user?.role === 'admin';
