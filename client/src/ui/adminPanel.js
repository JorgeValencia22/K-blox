// Panel de desarrollador dentro de la partida (solo administradores).
// Permite espectear, controlar, congelar, lanzar, matar, hacer perder, traer o
// expulsar jugadores, y cerrar el servidor. Todas las acciones las valida el servidor.
import { h, button, clear, toast, modal } from './dom.js';
import { audio } from '../audio/audio.js';
import { SHOP_ITEMS } from '../../../shared/catalog.js';
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
        g.spectator ? null : button('🧭', () => this.goto(p.id), 'small'),
        button('🏠', () => this.act('spawn', p.id), 'small'),
        button('😱', () => this.act('jumpscare', p.id), 'small'),
        button('🎁', () => giftModal({ userId: p.id, name: p.name }), 'small'),
        button('💀', () => this.act('kill', p.id), 'small danger'),
        button('❌ Perder', () => this.act('lose', p.id), 'small danger'),
        button('🚪', () => this.act('kick', p.id), 'small danger'),
        button('⛔', () => banModal({ userId: p.id, name: p.name }), 'small danger'),
      ),
    ));
    clear(this.el).append(
      h('div.row', h('h3', { style: { margin: 0, flex: 1 } }, '🛡️ Modo desarrollador'), button('✕', () => this.toggle(false), 'small')),
      h('div.small.muted', '👁️ espectear · 🎮 controlar · 🧊 congelar · 🚀 lanzar · 🧲 traer · 🧭 ir hacia él · 🏠 al inicio · 😱 susto · 🎁 regalar · 💀 matar · 🚪 expulsar · ⛔ banear'),
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

  /** Teletransporta al admin junto al jugador (si está en otro servidor, entra en él). */
  async goto(id) {
    const r = await adminRequest('goto', { userId: id });
    if (r.needJoin) {
      await window.kest.app.play({ roomId: r.roomId });
      setTimeout(() => adminRequest('goto', { userId: id }), 1500);
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

/** Ventana para regalar Kesty Coins u objetos de la tienda a un jugador. */
export function giftModal(target) {
  const amount = h('input.input', { type: 'number', value: 100, min: -100000, max: 100000 });
  const sel = h('select.input', h('option', { value: 'all' }, '🎁 TODOS los objetos de la tienda'),
    ...SHOP_ITEMS.filter((i) => i.price > 0).map((i) => h('option', { value: i.id }, `${i.name} (${i.price} KC)`)));
  const who = target.userId ? { userId: target.userId } : { username: target.name };
  modal(`🎁 Regalar a ${target.name}`, h('div',
    h('div.field', h('label', 'Kesty Coins (negativo para quitar)'), h('div.row', amount, button('Dar monedas', async () => {
      const r = await adminRequest('coins', { ...who, username: target.name, amount: Number(amount.value) });
      if (r.ok) toast(`Monedas enviadas a ${target.name}`, 'ok');
    }, 'primary'))),
    h('div.field', h('label', 'Objeto de la tienda'), h('div.row', sel, button('Regalar', async () => {
      const r = await adminRequest('giveItem', { ...who, itemId: sel.value });
      if (r.ok) toast(r.added ? `Regalado (${r.added} objeto${r.added === 1 ? '' : 's'} nuevo${r.added === 1 ? '' : 's'})` : 'Ya lo tenía', 'ok');
    }, 'primary'))),
  ), { actions: [{ label: 'Cerrar' }] });
}

/** Ventana para banear (temporal o para siempre). */
export function banModal(target, onDone) {
  const who = target.userId ? { userId: target.userId } : { username: target.name };
  const ban = async (data, label) => {
    const r = await adminRequest('ban', { ...who, ...data });
    if (r.ok) { toast(`${target.name} baneado ${label}`, 'ok'); onDone?.(); }
  };
  const close = modal(`⛔ Banear a ${target.name}`, h('div',
    h('p.muted.small', 'Se le expulsa al momento y no podrá entrar hasta que termine el baneo.'),
    h('div.row.wrap',
      button('1 hora', () => { close(); ban({ hours: 1 }, '1 hora'); }),
      button('1 día', () => { close(); ban({ hours: 24 }, '1 día'); }),
      button('7 días', () => { close(); ban({ hours: 168 }, '7 días'); }),
      button('30 días', () => { close(); ban({ hours: 720 }, '30 días'); }),
      button('⛔ PARA SIEMPRE', () => { close(); ban({ perma: true }, 'para siempre'); }, 'danger'),
    ),
  ), { actions: [{ label: 'Cancelar' }] });
}

/** Susto a pantalla completa (lo manda un administrador). */
export function showJumpscare() {
  audio.play('scream');
  const face = h('div.jumpscare', { html: `<svg viewBox="0 0 200 200"><defs><radialGradient id="js1"><stop offset="0" stop-color="#3a0000"/><stop offset="1" stop-color="#000"/></radialGradient></defs>
    <rect width="200" height="200" fill="url(#js1)"/><ellipse cx="100" cy="105" rx="78" ry="88" fill="#d8d0c4"/>
    <ellipse cx="68" cy="82" rx="20" ry="26" fill="#000"/><ellipse cx="132" cy="82" rx="20" ry="26" fill="#000"/>
    <circle cx="70" cy="86" r="5" fill="#ff1744"/><circle cx="130" cy="86" r="5" fill="#ff1744"/>
    <path d="M45 140 Q100 205 155 140 Q100 168 45 140Z" fill="#200"/>
    <path d="M55 146 l8 14 l8 -12 l8 14 l8 -13 l8 14 l8 -13 l8 14 l8 -13 l8 12" stroke="#fff8e1" stroke-width="4" fill="none"/></svg>` });
  document.body.appendChild(face);
  setTimeout(() => face.classList.add('out'), 1300);
  setTimeout(() => face.remove(), 1800);
}
