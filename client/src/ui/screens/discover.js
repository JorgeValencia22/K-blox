// Catálogo de experiencias: oficiales y publicadas por la comunidad.
import { h, button, toast, modal, clear, coverStyle } from '../dom.js';
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

/** Tarjeta de experiencia (se usa en Descubrir y en el menú principal). */
export function worldCard(app, w, { reportWorld } = {}) {
  const icon = w.official ? EXPERIENCES.find((e) => e.id === w.id)?.cover.icon : null;
  const fav = button(w.favorite ? '★' : '☆', async () => {
    try {
      const r = await post(`/favorites/${w.id}`);
      w.favorite = r.favorite;
      fav.textContent = r.favorite ? '★' : '☆';
      toast(r.favorite ? 'Añadido a favoritos' : 'Quitado de favoritos', 'ok', 1500);
    } catch (e) { toast(e.message, 'err'); }
  }, 'small fav');
  fav.title = 'Favorito';
  const cat = CATEGORIES.find((c) => c.id === w.category)?.name || w.category;
  return h('div.card.panel',
    h('div.cover', { style: coverStyle(w), on: { click: () => app.play({ key: w.id }) } },
      icon ? h('div.cover-icon', icon) : null,
      w.isNew ? h('span.badge-new', 'NUEVO') : null,
      h('span.players', `👥 ${w.players}/${w.maxPlayers}`), fav),
    h('div.body',
      h('div.title', w.name),
      h('div.row.small', h('span.muted', `por ${w.creator}`), h('span.tag', cat)),
      h('div.desc', w.description || 'Sin descripción'),
    ),
    h('div.actions',
      button('▶ JUGAR', () => app.play({ key: w.id }), 'primary grow'),
      button('🔒', () => privateRoomModal(app, w), 'small'),
      !w.official && reportWorld ? button('⚠️', () => reportWorld(w), 'small') : null,
    ),
  );
}

export function privateRoomModal(app, w) {
  modal('Partida privada', h('p.muted', `Crea una sala privada de ${w.name}. Recibirás un código para compartir con tus amigos (también puedes invitarlos desde el menú de pausa).`), {
    actions: [{ label: 'Cancelar' }, { label: 'Crear sala privada', cls: 'primary', onClick: (close) => { close(); app.play({ key: w.id, private: true }); } }],
  });
}
