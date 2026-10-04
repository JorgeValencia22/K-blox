// Modo desarrollador / moderación (solo administradores): servidores en directo,
// acciones sobre jugadores, cierre de servidores, anuncios, monedas, códigos regalo y reportes.
import { h, button, toast, clear, confirmDialog } from '../dom.js';
import { get, post } from '../../core/api.js';
import { pageHead } from './menu.js';
import { adminRequest } from '../adminPanel.js';

const KEYS = { ago: (t) => `${Math.max(1, Math.round((Date.now() - t) / 60000))} min` };

export function adminScreen(app) {
  let tab = 'live';
  const tabs = h('div.pills');
  const body = h('div');
  let timer = null;

  const renderTabs = () => clear(tabs).append(...[['live', '🖥️ Servidores'], ['global', '⛔ Control global'], ['coins', '🪙 Monedas y códigos'], ['reports', '🚩 Reportes']].map(([id, label]) =>
    h(`button.pill${tab === id ? '.on' : ''}`, { on: { click: () => { tab = id; renderTabs(); load(); } } }, label)));

  async function live() {
    const r = await adminRequest('overview');
    if (!r.ok) return;
    clear(body).append(
      h('div.row.wrap', { style: { marginBottom: '10px', gap: '10px' } },
        h('div.stat-tile', h('b', r.online), h('span', 'conectados')),
        h('div.stat-tile', h('b', r.rooms.length), h('span', 'servidores abiertos')),
        h('div.stat-tile', h('b', r.rooms.reduce((a, x) => a + x.players.length, 0)), h('span', 'jugando ahora')),
        h('div.stat-tile', h('b', r.maintenance ? 'SÍ' : 'NO'), h('span', 'mantenimiento')),
      ),
      ...(r.rooms.length ? [] : [h('p.muted', 'No hay ningún servidor abierto ahora mismo.')]),
      ...r.rooms.map((room) => h('div.admin-room.panel',
        h('div.row',
          h('div.grow', h('b', room.name), h('span.muted.small', ` · ${room.visibility === 'private' ? '🔒 privada' : 'pública'} · ${room.players.length}/${room.maxPlayers} · abierto hace ${KEYS.ago(room.createdAt)}`)),
          button('👁️ Espectear', async () => {
            const res = await adminRequest('spectate', { roomId: room.id, userId: room.players[0]?.id });
            if (res.ok) app.startSpectating(res);
          }, 'small'),
          button('⛔ Cerrar', async () => {
            if (!(await confirmDialog('Cerrar servidor', `Se cerrará "${room.name}" y ${room.players.length} jugador(es) volverán al menú.`, 'Cerrar', 'danger'))) return;
            const res = await adminRequest('closeRoom', { roomId: room.id });
            if (res.ok) toast(`Servidor cerrado (${res.players} jugadores)`, 'ok');
            live();
          }, 'small danger'),
        ),
        h('div.list', room.players.map((p) => h('div.list-item',
          h('span.grow', p.name, h('span.muted.small', ` · Nv ${p.level}`), p.frozen ? ' 🧊' : '', p.controlled ? ' 🎮' : ''),
          h('div.row.wrap', { style: { gap: '4px', justifyContent: 'flex-end' } },
            button('👁️', async () => { const res = await adminRequest('spectate', { roomId: room.id, userId: p.id }); if (res.ok) app.startSpectating(res); }, 'small'),
            button(p.frozen ? '🔥' : '🧊', async () => { await adminRequest('freeze', { userId: p.id, on: !p.frozen }); live(); }, 'small'),
            button('🚀', () => adminRequest('launch', { userId: p.id }), 'small'),
            button('💀', () => adminRequest('kill', { userId: p.id }).then((x) => x.ok && toast(`${p.name} eliminado`, 'ok')), 'small danger'),
            button('❌ Perder', () => adminRequest('lose', { userId: p.id }).then((x) => x.ok && toast(`${p.name} ha perdido`, 'ok')), 'small danger'),
            button('🚪', async () => { await adminRequest('kick', { userId: p.id }); live(); }, 'small danger'),
          ),
        ))),
      )),
    );
  }

  function global() {
    const msg = h('input.input', { placeholder: 'Mensaje para todos los jugadores…', maxLength: 140 });
    clear(body).append(
      h('div.panel.admin-room',
        h('h3', '⛔ Cerrar TODOS los servidores'),
        h('p.muted', 'Todos los que estén jugando ahora mismo volverán al menú al instante.'),
        h('div.row.wrap',
          button('Cerrar todos ahora', async () => {
            if (!(await confirmDialog('¿Cerrar todo?', 'Se cerrarán todas las partidas abiertas.', 'Cerrar todo', 'danger'))) return;
            const r = await adminRequest('closeAll');
            if (r.ok) toast(`Cerrado. ${r.players} jugadores enviados al menú.`, 'ok');
          }, 'danger'),
          button('Cerrar todo + mantenimiento', async () => {
            if (!(await confirmDialog('Mantenimiento', 'Se cerrará todo y nadie (salvo admins) podrá entrar hasta que lo desactives.', 'Activar', 'danger'))) return;
            const r = await adminRequest('closeAll', { maintenance: true });
            if (r.ok) toast('Servidores cerrados y en mantenimiento', 'ok');
          }, 'danger'),
          button('Quitar mantenimiento', async () => {
            const r = await adminRequest('maintenance', { on: false });
            if (r.ok) toast('Los jugadores ya pueden volver a entrar', 'ok');
          }),
        ),
      ),
      h('div.panel.admin-room',
        h('h3', '📢 Anuncio global'),
        h('div.row', msg, button('Enviar', async () => {
          const r = await adminRequest('announce', { text: msg.value });
          if (r.ok) { toast('Anuncio enviado', 'ok'); msg.value = ''; }
        }, 'primary')),
      ),
    );
  }

  async function coins() {
    const user = h('input.input', { placeholder: 'Nombre de usuario' });
    const amount = h('input.input', { type: 'number', placeholder: 'Monedas (negativo para quitar)', value: 100 });
    const code = h('input.input', { placeholder: 'Código (vacío = aleatorio)', maxLength: 24 });
    const cc = h('input.input', { type: 'number', value: 200, placeholder: 'Monedas' });
    const uses = h('input.input', { type: 'number', value: 10, placeholder: 'Usos' });
    const list = h('div.list');
    const refresh = async () => {
      const r = await adminRequest('codes');
      clear(list).append(...(r.codes || []).map((c) => h('div.list-item', h('b.grow', c.code), h('span', `🪙 ${c.coins}`), h('span.muted.small', `${c.uses_left} usos`))));
    };
    clear(body).append(
      h('div.panel.admin-room', h('h3', '🎁 Dar Kesty Coins'), h('div.row.wrap', user, amount, button('Dar', async () => {
        const r = await adminRequest('coins', { username: user.value.trim(), amount: Number(amount.value) });
        if (r.ok) toast('Monedas enviadas', 'ok');
      }, 'primary'))),
      h('div.panel.admin-room', h('h3', '🎟️ Crear código regalo'), h('p.muted.small', 'Los jugadores lo canjean en la tienda de Kesty Coins.'),
        h('div.row.wrap', code, cc, uses, button('Crear', async () => {
          const r = await adminRequest('createCode', { code: code.value, coins: Number(cc.value), uses: Number(uses.value) });
          if (r.ok) { toast(`Código ${r.code} creado`, 'ok'); code.value = ''; refresh(); }
        }, 'primary')), list),
    );
    refresh();
  }

  async function reports() {
    clear(body).append(h('p.muted', 'Cargando…'));
    const act = (path, b, msg) => async () => {
      try { await post(path, b); toast(msg, 'ok'); reports(); } catch (e) { toast(e.message, 'err'); }
    };
    try {
      const { reports: list } = await get('/admin/reports');
      clear(body);
      if (!list.length) body.append(h('p.muted', 'No hay reportes abiertos. 🎉'));
      for (const r of list) {
        body.append(h('div.list-item', { style: { alignItems: 'flex-start' } },
          h('div.grow',
            h('b', r.reason.replace('_', ' ')), ' · ', h('span.muted.small', new Date(r.created_at).toLocaleString()),
            h('div.small', `Reporta: ${r.reporter || '?'}`, r.target ? ` · Usuario: ${r.target}` : '', r.world_name ? ` · Mundo: ${r.world_name}` : ''),
            r.message ? h('div.small.muted', `"${r.message}"`) : null,
          ),
          h('div.row.wrap', { style: { justifyContent: 'flex-end', maxWidth: '360px' } },
            r.target_user_id ? button('Silenciar 1 h', act(`/admin/users/${r.target_user_id}/mute`, { minutes: 60 }, 'Usuario silenciado'), 'small') : null,
            r.target_user_id ? button('Suspender 24 h', act(`/admin/users/${r.target_user_id}/ban`, { hours: 24 }, 'Usuario suspendido'), 'small danger') : null,
            r.world_id ? button('Ocultar mundo', act(`/admin/worlds/${r.world_id}/hide`, { hidden: true }, 'Mundo ocultado'), 'small danger') : null,
            button('Resolver', act(`/admin/reports/${r.id}/resolve`, {}, 'Reporte resuelto'), 'small primary'),
          ),
        ));
      }
    } catch (e) {
      clear(body).append(h('p.err', e.message));
    }
  }

  function load() {
    clearInterval(timer);
    if (tab === 'live') { live(); timer = setInterval(live, 4000); }
    else if (tab === 'global') global();
    else if (tab === 'coins') coins();
    else reports();
  }

  renderTabs();
  load();
  const el = h('div.screen.page', pageHead(app, '🛡️ Modo desarrollador', button('↻', load, 'small')), h('div.page-body', tabs, h('div', { style: { height: '12px' } }), body));
  el.cleanup = () => clearInterval(timer);
  return el;
}
