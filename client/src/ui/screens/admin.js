// Panel de moderación (solo administradores): reportes, silenciar, suspender y ocultar mundos.
import { h, button, toast, clear } from '../dom.js';
import { get, post } from '../../core/api.js';
import { pageHead } from './menu.js';

export function adminScreen(app) {
  const list = h('div.list');
  const act = (path, body, msg) => async () => {
    try { await post(path, body); toast(msg, 'ok'); load(); } catch (e) { toast(e.message, 'err'); }
  };
  async function load() {
    clear(list).append(h('p.muted', 'Cargando…'));
    try {
      const { reports } = await get('/admin/reports');
      clear(list);
      if (!reports.length) list.append(h('p.muted', 'No hay reportes abiertos. 🎉'));
      for (const r of reports) {
        list.append(h('div.list-item', { style: { alignItems: 'flex-start' } },
          h('div.grow',
            h('b', r.reason.replace('_', ' ')), ' · ', h('span.muted.small', new Date(r.created_at).toLocaleString()),
            h('div.small', `Reporta: ${r.reporter || '?'}`, r.target ? ` · Usuario: ${r.target}` : '', r.world_name ? ` · Mundo: ${r.world_name}` : ''),
            r.message ? h('div.small.muted', `"${r.message}"`) : null,
          ),
          h('div.row.wrap', { style: { justifyContent: 'flex-end', maxWidth: '360px' } },
            r.target_user_id ? button('Silenciar 1 h', act(`/admin/users/${r.target_user_id}/mute`, { minutes: 60 }, 'Usuario silenciado'), 'small') : null,
            r.target_user_id ? button('Suspender 24 h', act(`/admin/users/${r.target_user_id}/ban`, { hours: 24 }, 'Usuario suspendido'), 'small danger') : null,
            r.world_id ? button('Ocultar mundo', act(`/admin/worlds/${r.world_id}/hide`, { hidden: true }, 'Mundo ocultado'), 'small danger') : null,
            r.world_id ? button('Restaurar mundo', act(`/admin/worlds/${r.world_id}/hide`, { hidden: false }, 'Mundo visible'), 'small') : null,
            button('Resolver', act(`/admin/reports/${r.id}/resolve`, {}, 'Reporte resuelto'), 'small primary'),
          ),
        ));
      }
    } catch (e) {
      clear(list).append(h('p.err', e.message));
    }
  }
  load();
  return h('div.screen.page', pageHead(app, 'Moderación', button('↻ Actualizar', load, 'small')), h('div.page-body', list));
}
