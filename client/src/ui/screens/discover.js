// Catálogo de experiencias: oficiales y publicadas por la comunidad.
import { h, button, toast, modal, clear, coverStyle } from '../dom.js';
import { store } from '../../core/store.js';
import { get, post } from '../../core/api.js';
import { pageHead } from './menu.js';
import { CATEGORIES } from '../../../../shared/constants.js';
import { EXPERIENCES } from '../../../../shared/catalog.js';

export function discoverScreen(app) {
  let category = '';
  let q = '';
  const grid = h('div.cards');
  const pills = h('div.pills');
  const search = h('input.input', { placeholder: 'Buscar mundos o creadores…', style: { maxWidth: '260px' } });
  let t;
  search.addEventListener('input', () => { clearTimeout(t); t = setTimeout(() => { q = search.value.trim(); load(); }, 250); });

  const renderPills = () => {
    clear(pills).append(
      h(`button.pill${!category ? '.on' : ''}`, { on: { click: () => { category = ''; renderPills(); load(); } } }, 'Todas'),
      ...CATEGORIES.map((c) => h(`button.pill${category === c.id ? '.on' : ''}`, { on: { click: () => { category = c.id; renderPills(); load(); } } }, c.name)),
    );
  };

  async function load() {
    clear(grid).append(h('p.muted', 'Cargando…'));
    try {
      const { worlds } = await get(`/discover?category=${encodeURIComponent(category)}&q=${encodeURIComponent(q)}`);
      clear(grid);
      if (!worlds.length) grid.append(h('p.muted', 'No hay mundos en esta categoría todavía. ¡Crea el primero desde CREAR!'));
      for (const w of worlds) grid.append(card(w));
    } catch (e) {
      clear(grid).append(h('p.err', e.message));
    }
  }

  const card = (w) => worldCard(app, w, { reportWorld });

  function reportWorld(w) {
    const sel = h('select.input', ['contenido_inapropiado', 'spam', 'otro'].map((r) => h('option', { value: r }, r.replace('_', ' '))));
    modal(`Reportar "${w.name}"`, h('div.field', h('label', 'Motivo'), sel), {
      actions: [{ label: 'Cancelar' }, { label: 'Reportar', cls: 'danger', onClick: async (close) => {
        try { await post('/report', { worldId: w.id, reason: sel.value }); toast('Reporte enviado', 'ok'); } catch (e) { toast(e.message, 'err'); }
        close();
      } }],
    });
  }

  function joinCode() {
    const inp = h('input.input', { placeholder: 'Código (6 caracteres)', maxLength: 8, style: { textTransform: 'uppercase' } });
    modal('Unirse con código', h('div.field', h('label', 'Código de invitación'), inp), {
      actions: [{ label: 'Cancelar' }, { label: 'Unirse', cls: 'primary', onClick: (close) => { close(); app.play({ code: inp.value.trim().toUpperCase() }); } }],
    });
  }

  renderPills();
  load();
  return h('div.screen.page',
    pageHead(app, 'Descubrir', search, button('🔑 Unirse con código', joinCode, 'small')),
    h('div.page-body', pills, h('div', { style: { height: '14px' } }), grid),
  );
}

const catName = (w) => CATEGORIES.find((c) => c.id === w.category)?.name || w.category;

/** Tarjeta de experiencia estilo Roblox: imagen del mapa, nombre y jugadores. Clic = página del juego. */
export function worldCard(app, w, { reportWorld } = {}) {
  const open = () => gameDetail(app, w, { reportWorld });
  return h('div.card.tile',
    h('div.cover', { style: coverStyle(w), on: { click: open } },
      w.isNew ? h('span.badge-new', 'NUEVO') : null,
      w.players > 0 ? h('span.live', h('i'), `${w.players} jugando`) : null,
      h('button.tile-play', { title: 'Jugar', on: { click: (e) => { e.stopPropagation(); app.play({ key: w.id }); } } }, '▶'),
    ),
    h('div.body', { on: { click: open } },
      h('div.title', w.name),
      h('div.tile-meta', h('span', `👥 ${w.players}/${w.maxPlayers}`), h('span', catName(w))),
    ),
  );
}

/** Página del juego (como la de una experiencia de Roblox). */
export function gameDetail(app, w, { reportWorld } = {}) {
  const fav = button(w.favorite ? '★ Favorito' : '☆ Favorito', async () => {
    try {
      const r = await post(`/favorites/${w.id}`);
      w.favorite = r.favorite;
      fav.textContent = r.favorite ? '★ Favorito' : '☆ Favorito';
      toast(r.favorite ? 'Añadido a favoritos' : 'Quitado de favoritos', 'ok', 1500);
    } catch (e) { toast(e.message, 'err'); }
  }, 'small');
  const visited = (store.user?.stats?.visited || []).includes(w.id);
  const close = modal('', h('div.gd',
    h('div.gd-media', { style: coverStyle(w) }, w.isNew ? h('span.badge-new', 'NUEVO') : null),
    h('div.gd-info',
      h('h2.gd-title', w.name),
      h('div.gd-by', 'por ', h('b', w.creator || 'KestWorlds Studio')),
      h('button.gd-play', { on: { click: () => { close(); app.play({ key: w.id }); } } }, h('span', '▶'), 'JUGAR'),
      h('div.gd-row', fav, button('🔒 Servidor privado', () => { close(); privateRoomModal(app, w); }, 'small'),
        !w.official && reportWorld ? button('⚠️ Reportar', () => { close(); reportWorld(w); }, 'small') : null),
      h('div.gd-stats',
        h('div', h('b', String(w.players)), h('small', 'Jugando')),
        h('div', h('b', String(w.maxPlayers)), h('small', 'Máx. por servidor')),
        h('div', h('b', catName(w)), h('small', 'Género')),
        h('div', h('b', visited ? 'Sí' : 'Aún no'), h('small', 'Lo has jugado')),
      ),
    ),
    h('div.gd-desc', h('h3', 'Descripción'), h('p', w.description || 'Sin descripción')),
  ), { wide: true, actions: [{ label: 'Cerrar' }] });
  document.querySelector('.modal-back:last-child .modal')?.classList.add('gd-modal');
}

export function privateRoomModal(app, w) {
  modal('Partida privada', h('p.muted', `Crea una sala privada de ${w.name}. Recibirás un código para compartir con tus amigos (también puedes invitarlos desde el menú de pausa).`), {
    actions: [{ label: 'Cancelar' }, { label: 'Crear sala privada', cls: 'primary', onClick: (close) => { close(); app.play({ key: w.id, private: true }); } }],
  });
}
