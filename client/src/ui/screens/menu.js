// Menú principal sobre el fondo 3D animado.
import { h, logo, button, modal, clear } from '../dom.js';
import { store } from '../../core/store.js';
import { audio } from '../../audio/audio.js';
import { openSettings } from '../settingsPanel.js';

function menuBtn(icon, label, sub, onClick, cls = '') {
  return h(`button.menu-btn${cls ? '.' + cls : ''}`, {
    on: { click: () => { audio.ui('open'); onClick(); }, mouseenter: () => audio.ui('hover') },
  }, h('span.ic', icon), h('span', label, sub ? h('small', sub) : null));
}

export function topbar(app) {
  const coins = h('span');
  const name = h('span.lbl');
  const lvl = h('span.tag');
  const badge = h('span.badge.hidden');
  const render = () => {
    const u = store.user;
    if (!u) return;
    coins.textContent = u.coins;
    name.textContent = u.username;
    lvl.textContent = `Nv ${u.level}`;
    const n = store.unread;
    badge.textContent = n;
    badge.classList.toggle('hidden', n === 0);
  };
  const u1 = store.on('user', render);
  const u2 = store.on('notifications', render);
  render();
  const bar = h('div.topbar',
    h('div', { style: { cursor: 'pointer' }, on: { click: () => app.go('menu') } }, logo()),
    h('div.spacer'),
    store.user.role === 'admin' ? h('div.chip', { on: { click: () => app.go('admin') } }, '🛡️', h('span.lbl', 'Moderación')) : null,
    h('div.chip', { title: 'Tienda', on: { click: () => app.go('avatar', { tab: 'shop' }) } }, h('span.coin', 'K'), coins, h('span.lbl.muted', 'K-Coins')),
    h('div.chip.bell', { title: 'Notificaciones', on: { click: () => openNotifications(app) } }, '🔔', badge),
    h('div.chip', { title: 'Perfil', on: { click: () => app.go('profile') } }, h('span.avatar-mini', store.user.username[0].toUpperCase()), name, lvl),
  );
  bar.cleanup = () => { u1(); u2(); };
  return bar;
}

export function openNotifications(app) {
  store.markRead();
  const list = store.notifications;
  modal('Notificaciones', h('div.notif-list',
    list.length ? list.map((n) => h('div.list-item',
      h('span', n.kind === 'invite' ? '✉️' : n.kind === 'achievement' ? '🏆' : n.kind.startsWith('friend') ? '👥' : n.kind === 'level' ? '⭐' : '🔔'),
      h('span.grow', n.text, h('div.muted.small', new Date(n.at).toLocaleTimeString())),
      n.kind === 'invite' ? button('Unirse', () => { document.querySelector('.modal-back')?.remove(); app.play({ roomId: n.roomId }); }, 'small primary') : null,
      n.kind === 'friend_request' ? button('Ver', () => { document.querySelector('.modal-back')?.remove(); app.go('friends'); }, 'small') : null,
    )) : h('p.muted', 'No tienes notificaciones.'),
  ), { actions: [{ label: 'Cerrar' }] });
}

export function menuScreen(app) {
  const bar = topbar(app);
  const col = h('div.menu-col',
    logo(true),
    menuBtn('▶', 'JUGAR', 'Entrar a Kest City', () => app.play({ key: 'city' }), 'play'),
    menuBtn('🧭', 'DESCUBRIR', 'Experiencias y mundos', () => app.go('discover')),
    menuBtn('🛠️', 'CREAR', 'Editor de mundos', () => app.go('create')),
    menuBtn('🧍', 'AVATAR', 'Personaliza y tienda', () => app.go('avatar')),
    menuBtn('👥', 'AMIGOS', 'Conectados e invitaciones', () => app.go('friends')),
    menuBtn('⚙️', 'CONFIGURACIÓN', 'Gráficos, controles y audio', () => openSettings()),
  );
  const el = h('div.screen.menu', bar, h('div.menu-main', col), h('div.footer-note', 'Kest Worlds v0.1 · K-Coins es una moneda ficticia sin valor real'));
  el.cleanup = () => bar.cleanup();
  return el;
}

/** Cabecera estándar de las páginas secundarias. */
export function pageHead(app, title, ...extra) {
  return h('div.page-head', button('← Volver', () => app.go('menu'), 'small'), h('h2', title), h('div.spacer', { style: { flex: 1 } }), ...extra);
}

export { clear };
