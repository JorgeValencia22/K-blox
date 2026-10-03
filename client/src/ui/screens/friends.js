// Amigos: búsqueda, solicitudes, conectados, unirse a su partida, eliminar y bloquear.
import { h, button, toast, clear, confirmDialog } from '../dom.js';
import { get, post } from '../../core/api.js';
import { net } from '../../core/net.js';
import { pageHead } from './menu.js';

export function friendsScreen(app) {
  const results = h('div.list');
  const lists = h('div.cols');
  const search = h('input.input', { placeholder: 'Buscar por nombre de usuario…' });
  let t;
  search.addEventListener('input', () => { clearTimeout(t); t = setTimeout(doSearch, 250); });

  async function doSearch() {
    const q = search.value.trim();
    clear(results);
    if (q.length < 2) return;
    try {
      const { users } = await get(`/users?q=${encodeURIComponent(q)}`);
      if (!users.length) results.append(h('p.muted.small', 'Sin resultados'));
      for (const u of users) {
        results.append(h('div.list-item', h(`span.dot${u.online ? '.on' : ''}`), h('span.name.grow', u.username), h('span.tag', `Nv ${u.level}`),
          button('➕ Añadir', async (e) => {
            try { await post('/friends/request', { username: u.username }); toast('Solicitud enviada', 'ok'); e.target.disabled = true; load(); } catch (err) { toast(err.message, 'err'); }
          }, 'small primary')));
      }
    } catch (e) { toast(e.message, 'err'); }
  }

  const act = (path, body, msg) => async () => {
    try { await post(path, body); if (msg) toast(msg, 'ok'); load(); } catch (e) { toast(e.message, 'err'); }
  };

  async function load() {
    let d;
    try { d = await get('/friends'); } catch (e) { clear(lists).append(h('p.err', e.message)); return; }
    const box = (title, ...children) => h('div.box.panel', h('h3', title), h('div.list', ...children));
    clear(lists).append(
      box(`Amigos (${d.friends.length})`, d.friends.length ? d.friends.map((f) => h('div.list-item',
        h(`span.dot${f.online ? '.on' : ''}`),
        h('div.grow', h('div.name', f.username), h('div.muted.small', f.online ? (f.room ? `Jugando: ${f.room.name}` : 'En el menú') : 'Desconectado')),
        f.room && f.room.joinable ? button('Unirse', () => app.play({ roomId: f.room.id }), 'small primary') : null,
        button('🗑', async () => { if (await confirmDialog('Eliminar amigo', `¿Eliminar a ${f.username} de tus amigos?`, 'Eliminar', 'danger')) act('/friends/remove', { userId: f.id }, 'Amigo eliminado')(); }, 'small'),
        button('🚫', async () => { if (await confirmDialog('Bloquear', `¿Bloquear a ${f.username}? No podrá escribirte ni enviarte solicitudes.`, 'Bloquear', 'danger')) act('/block', { userId: f.id }, 'Usuario bloqueado')(); }, 'small'),
      )) : h('p.muted.small', 'Aún no tienes amigos. ¡Busca a alguien arriba!')),
      box(`Solicitudes recibidas (${d.incoming.length})`, d.incoming.length ? d.incoming.map((f) => h('div.list-item',
        h('span.name.grow', f.username), h('span.tag', `Nv ${f.level}`),
        button('Aceptar', act('/friends/accept', { userId: f.id }, `Ahora eres amigo de ${f.username}`), 'small primary'),
        button('Rechazar', act('/friends/decline', { userId: f.id }), 'small'),
        button('🚫', act('/block', { userId: f.id }, 'Usuario bloqueado'), 'small'),
      )) : h('p.muted.small', 'No hay solicitudes pendientes.')),
      box('Enviadas y bloqueados',
        ...d.outgoing.map((f) => h('div.list-item', h('span.name.grow', f.username), h('span.muted.small', 'Pendiente'), button('Cancelar', act('/friends/remove', { userId: f.id }), 'small'))),
        ...d.blocked.map((b) => h('div.list-item', h('span.name.grow', b.username), h('span.muted.small', 'Bloqueado'), button('Desbloquear', act('/unblock', { userId: b.id }, 'Desbloqueado'), 'small'))),
        !d.outgoing.length && !d.blocked.length ? h('p.muted.small', 'Nada por aquí.') : null,
      ),
    );
  }

  const unsub = [net.on('presence', load), net.on('friends:changed', load), net.on('notify', load)];
  load();
  const el = h('div.screen.page',
    pageHead(app, 'Amigos'),
    h('div.page-body',
      h('div.box.panel', { style: { marginBottom: '18px' } }, h('h3', 'Buscar jugadores'), search, h('div', { style: { height: '10px' } }), results),
      lists,
    ),
  );
  el.cleanup = () => unsub.forEach((u) => u());
  return el;
}
