// Menú principal: barra lateral de navegación, portada con experiencias destacadas,
// recompensa diaria y filas de experiencias (novedades, populares, seguir jugando).
import { h, logo, button, modal, clear, toast, coverStyle } from '../dom.js';
import { store } from '../../core/store.js';
import { get, post } from '../../core/api.js';
import { audio } from '../../audio/audio.js';
import { openSettings } from '../settingsPanel.js';
import { EXPERIENCES } from '../../../../shared/catalog.js';
import { worldCard } from './discover.js';

const NAV = [
  ['menu', '🏠', 'Inicio'], ['discover', '🧭', 'Descubrir'], ['avatar', '🧍', 'Avatar'], ['coins', '🪙', 'Kesty Coins'],
  ['create', '🛠️', 'Crear'], ['friends', '👥', 'Amigos'], ['profile', '⭐', 'Perfil'],
];

export function sidebar(app, active) {
  const items = NAV.map(([id, ic, label]) => h(`button.nav-item${active === id ? '.on' : ''}`, {
    on: { click: () => { audio.ui('open'); app.go(id); }, mouseenter: () => audio.ui('hover') },
  }, h('span.nav-ic', ic), h('span.nav-label', label)));
  if (store.user?.role === 'admin') {
    items.push(h(`button.nav-item.dev${active === 'admin' ? '.on' : ''}`, { on: { click: () => app.go('admin') } }, h('span.nav-ic', '🛡️'), h('span.nav-label', 'Desarrollador')));
  }
  items.push(h('button.nav-item', { on: { click: () => openSettings() } }, h('span.nav-ic', '⚙️'), h('span.nav-label', 'Ajustes')));
  if (/^Invitado_/.test(store.user?.username || '')) {
    items.push(h('button.nav-item', { title: 'Entra con tu cuenta (o la del modo desarrollador)', on: { click: () => app.logout() } }, h('span.nav-ic', '🔑'), h('span.nav-label', 'Iniciar sesión')));
  }
  return h('nav.sidebar', h('div.side-logo', { on: { click: () => app.go('menu') } }, logo()), h('div.nav-list', items));
}

export function topbar(app) {
  const coins = h('span');
  const name = h('span.lbl');
  const lvl = h('span.tag');
  const badge = h('span.badge.hidden');
  const xp = h('div');
  const render = () => {
    const u = store.user;
    if (!u) return;
    coins.textContent = u.coins.toLocaleString('es');
    name.textContent = u.username;
    lvl.textContent = `Nv ${u.level}`;
    xp.style.width = `${Math.min(100, ((u.xp - u.xpLevelStart) / Math.max(1, u.xpNextLevel - u.xpLevelStart)) * 100)}%`;
    const n = store.unread;
    badge.textContent = n;
    badge.classList.toggle('hidden', n === 0);
  };
  const u1 = store.on('user', render);
  const u2 = store.on('notifications', render);
  render();
  const bar = h('div.topbar',
    h('div.spacer'),
    h('div.chip.coins-chip', { title: 'Tienda de Kesty Coins', on: { click: () => app.go('coins') } }, h('span.coin', 'K'), coins, h('span.plus', '+')),
    h('div.chip.bell', { title: 'Notificaciones', on: { click: () => openNotifications(app) } }, '🔔', badge),
    h('div.chip.me', { title: 'Perfil', on: { click: () => app.go('profile') } },
      h('span.avatar-mini', store.user.username[0].toUpperCase()),
      h('span.me-txt', h('span.row', { style: { gap: '6px' } }, name, lvl), h('div.xpbar.mini', xp))),
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

/** Casillas de la racha de 7 días. */
export function dailyDays(d) {
  const done = d.claimedToday ? ((d.streak - 1) % 7) + 1 : d.streak % 7;
  return h('div.daily-days', d.table.map((c, i) => h(`div.dday${i < done ? '.done' : ''}${!d.claimedToday && i === done ? '.next' : ''}`, h('small', `Día ${i + 1}`), h('b', `🪙${c}`))));
}

/** Envoltorio común de las páginas del menú: barra lateral + barra superior + contenido. */
export function shell(app, active, ...content) {
  const bar = topbar(app);
  const el = h('div.screen.shell', sidebar(app, active), h('div.shell-main', bar, ...content));
  el.cleanup = () => bar.cleanup();
  return el;
}

export function menuScreen(app) {
  const featured = EXPERIENCES.filter((e) => e.featured);
  let idx = 0;
  const hero = h('div.hero');
  const dots = h('div.hero-dots');
  const renderHero = () => {
    const e = featured[idx];
    clear(hero).append(
      h('div.hero-bg', { style: { backgroundImage: `linear-gradient(120deg, ${e.cover.a}, ${e.cover.b})` } }, h('span.hero-icon', e.cover.icon)),
      h('div.hero-shade'),
      h('div.hero-content',
        h('span.badge-new', e.isNew ? '¡NUEVO!' : 'DESTACADO'),
        h('h1', e.name),
        h('p', e.description),
        h('div.row.wrap',
          button('▶  JUGAR AHORA', () => app.play({ key: e.id }), 'primary big'),
          button('Ver todas', () => app.go('discover'), ''),
        ),
      ),
    );
    clear(dots).append(...featured.map((_, i) => h(`button.hdot${i === idx ? '.on' : ''}`, { on: { click: () => { idx = i; renderHero(); restart(); } } })));
  };
  let timer;
  const restart = () => { clearInterval(timer); timer = setInterval(() => { idx = (idx + 1) % featured.length; renderHero(); }, 7000); };
  renderHero();
  restart();

  // Recompensa diaria
  const daily = h('div.daily-card.panel');
  const renderDaily = () => {
    const rw = store.user.rewards;
    if (!rw) return;
    const d = rw.daily;
    clear(daily).append(
      h('div.daily-head', h('b', '🎁 Recompensa diaria'), h('span.muted.small', `Racha: ${d.streak} día${d.streak === 1 ? '' : 's'}`)),
      dailyDays(d),
      h('div.row.wrap', { style: { marginTop: '10px' } },
        d.claimedToday ? h('span.muted.small.grow', '✔ Ya la has recogido hoy. ¡Vuelve mañana!') : button(`Recoger 🪙 ${d.next}`, claim, 'primary'),
        button(rw.spin.available ? '🎡 Girar ruleta' : '🎡 Ruleta (mañana)', () => app.go('coins'), 'small'),
      ),
    );
  };
  async function claim() {
    try {
      await post('/rewards/daily');
      audio.play('coin');
      await store.refreshUser();
      renderDaily();
    } catch (e) {
      toast(e.message, 'err');
    }
  }
  renderDaily();
  const unsubUser = store.on('user', renderDaily);

  const rows = h('div.rows');
  const row = (title, list) => (list.length ? h('section.row-sec', h('h3', title), h('div.hscroll', list.map((w) => worldCard(app, w)))) : null);
  get('/discover').then(({ worlds }) => {
    const byId = new Map(worlds.map((w) => [w.id, w]));
    const recent = [...new Set((store.user.history || []).map((x) => x.world_id))].map((id) => byId.get(id)).filter(Boolean).slice(0, 8);
    clear(rows).append(...[
      row('🆕 Novedades', worlds.filter((w) => w.isNew)),
      row('▶ Seguir jugando', recent),
      row('🔥 Populares ahora', [...worlds].filter((w) => w.official).sort((a, b) => b.players - a.players).slice(0, 10)),
      row('🌍 De la comunidad', worlds.filter((w) => !w.official).slice(0, 12)),
    ].filter(Boolean));
  }).catch(() => {});

  const el = shell(app, 'menu',
    h('div.home',
      h('div.home-top', h('div.hero-wrap', hero, dots), daily),
      rows,
      h('div.footer-note', 'Kest Worlds v0.3 · Las Kesty Coins son una moneda del juego sin valor real'),
    ),
  );
  const base = el.cleanup;
  el.cleanup = () => { base(); clearInterval(timer); unsubUser(); };
  return el;
}

/** Cabecera estándar de las páginas secundarias. */
export function pageHead(app, title, ...extra) {
  return h('div.page-head', button('← Inicio', () => app.go('menu'), 'small'), h('h2', title), h('div.spacer', { style: { flex: 1 } }), ...extra);
}

export { clear, coverStyle };
