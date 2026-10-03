// Lista de proyectos del editor (CREAR).
import { h, button, toast, clear, confirmDialog, modal, coverStyle } from '../dom.js';
import { get, post, del } from '../../core/api.js';
import { pageHead } from './menu.js';

export function createScreen(app) {
  const grid = h('div.cards');

  async function load() {
    clear(grid).append(h('p.muted', 'Cargando…'));
    try {
      const { worlds } = await get('/worlds/mine');
      clear(grid);
      if (!worlds.length) grid.append(h('div.box.panel', h('h3', '¡Crea tu primer mundo!'), h('p.muted', 'Construye con bloques, rampas, plataformas móviles, puntos de control y más. Pruébalo y publícalo para que otros lo jueguen.')));
      for (const w of worlds) grid.append(card(w));
    } catch (e) {
      clear(grid).append(h('p.err', e.message));
    }
  }

  function card(w) {
    return h('div.card.panel',
      h('div.cover', { style: coverStyle(w) }, h('span.players', w.published ? `Publicado · v${w.version} · ${w.visibility === 'public' ? 'Público' : 'Privado'}` : 'Borrador')),
      h('div.body', h('div.title', w.name), h('div.muted.small', `Editado ${new Date(w.updatedAt).toLocaleString()}`), w.hidden ? h('span.tag', { style: { color: '#ff9aac' } }, 'Oculto por moderación') : null),
      h('div.actions',
        button('✎ Editar', () => app.go('editor', { id: w.id }), 'primary grow'),
        w.published ? button('▶', () => app.play({ key: w.id }), 'small') : null,
        button('🗑', async () => {
          if (!(await confirmDialog('Eliminar mundo', `¿Eliminar "${w.name}" para siempre? Esta acción no se puede deshacer.`, 'Eliminar', 'danger'))) return;
          try { await del(`/worlds/${w.id}`); toast('Mundo eliminado', 'ok'); load(); } catch (e) { toast(e.message, 'err'); }
        }, 'small'),
      ),
    );
  }

  function create() {
    const name = h('input.input', { placeholder: 'Nombre del mundo', maxLength: 40, value: 'Mi mundo' });
    modal('Nuevo mundo', h('div.field', h('label', 'Nombre'), name), {
      actions: [{ label: 'Cancelar' }, { label: 'Crear', cls: 'primary', onClick: async (close) => {
        try {
          const r = await post('/worlds', { name: name.value });
          close();
          app.go('editor', { id: r.id });
        } catch (e) { toast(e.message, 'err'); }
      } }],
    });
  }

  load();
  return h('div.screen.page', pageHead(app, 'Crear', button('＋ Nuevo mundo', create, 'primary small')), h('div.page-body', grid));
}
