// Panel rápido de amigos: añadir a alguien, aceptar solicitudes, unirte a su partida o invitarle,
// elegir con quién hablas por voz y activar los subtítulos, todo en una sola ventana. También
// genera enlaces para compartir (añadirte como amigo y entrar en tu partida).
import { h, button, toast, modal, clear } from './dom.js';
import { get, post } from '../core/api.js';
import { net } from '../core/net.js';
import { store } from '../core/store.js';
import { settings } from '../core/settings.js';

let appRef = null;
export const setAppRef = (app) => { appRef = app; };

const origin = () => location.origin;
export const friendLink = (username) => `${origin()}/?amigo=${encodeURIComponent(username)}`;
/** Enlace para entrar en una partida: por código si es privada, por identificador si es pública. */
export const roomLink = (room) => (room?.inviteCode && room.visibility === 'private' ? `${origin()}/?sala=${room.inviteCode}` : room?.id ? `${origin()}/?partida=${room.id}` : null);

async function copy(text, okMsg) {
  try {
    await navigator.clipboard.writeText(text);
    toast(okMsg, 'ok');
  } catch {
    window.prompt('Copia este enlace:', text);
  }
}

/** Gestiona los enlaces ?amigo= ?sala= ?partida= al abrir la página (ya con la sesión iniciada). */
export async function handleLinks(app) {
  const q = new URLSearchParams(location.search);
  const pending = {};
  try { Object.assign(pending, JSON.parse(sessionStorage.getItem('kest.link') || '{}')); } catch { /* sin datos */ }
  for (const k of ['amigo', 'sala', 'partida']) if (q.get(k)) pending[k] = q.get(k);
  if (!pending.amigo && !pending.sala && !pending.partida) return;
  history.replaceState(null, '', location.pathname);
  try { sessionStorage.removeItem('kest.link'); } catch { /* sin almacenamiento */ }
  if (pending.amigo && pending.amigo !== store.user?.username) {
    try {
      await post('/friends/request', { username: pending.amigo });
      toast(`Solicitud de amistad enviada a ${pending.amigo}`, 'ok', 5000);
    } catch (e) { toast(e.message, 'err'); }
  }
  if (pending.sala) app.play({ code: String(pending.sala).toUpperCase() });
  else if (pending.partida) app.play({ roomId: String(pending.partida) });
}

export function openQuickFriends(game = null) {
  const g = game || appRef?.game || null;
  const room = g?.room && !g.offline ? g.room : null;
  const body = h('div.qf-panel');
  const add = h('input.input', { placeholder: 'Nombre de usuario de tu amigo', maxLength: 24 });
  let close;

  const voiceSet = () => new Set(settings.get('voiceFriends') || []);
  const toggleVoice = (id, on) => {
    const cur = voiceSet();
    if (on) cur.add(id); else cur.delete(id);
    settings.set('voiceFriends', [...cur]);
    if (on && !settings.get('voice')) settings.set('voice', true);
    render();
  };

  async function sendAdd() {
    const name = add.value.trim();
    if (!name) return;
    try {
      await post('/friends/request', { username: name });
      toast(`Solicitud enviada a ${name}`, 'ok');
      add.value = '';
      render();
    } catch (e) { toast(e.message, 'err'); }
  }

  let data = null;
  async function render() {
    try { data = await get('/friends'); } catch (e) { clear(list).append(h('p.err', e.message)); return; }
    const voice = voiceSet();
    clear(list).append(
      data.incoming.length ? h('div.qf-box', h('h4', `Solicitudes (${data.incoming.length})`), data.incoming.map((f) => h('div.qf-row',
        h('b.grow', f.username),
        button('✔ Aceptar', async () => { try { await post('/friends/accept', { userId: f.id }); toast(`Ahora eres amigo de ${f.username}`, 'ok'); render(); } catch (e) { toast(e.message, 'err'); } }, 'small primary'),
        button('✖', async () => { try { await post('/friends/decline', { userId: f.id }); render(); } catch (e) { toast(e.message, 'err'); } }, 'small')))) : null,
      h('div.qf-box', h('h4', `Amigos (${data.friends.length})`),
        data.friends.length ? data.friends.map((f) => h('div.qf-row',
          h(`span.dot${f.online ? '.on' : ''}`),
          h('div.grow', h('b', f.username), h('div.muted.small', f.online ? (f.room ? `Jugando: ${f.room.name}` : 'En el menú') : 'Desconectado')),
          f.room?.joinable ? button('▶ Unirme', () => { close?.(); appRef?.play({ roomId: f.room.id }); }, 'small primary') : null,
          room && f.online ? button('✉ Invitar', async (e) => { const r = await net.request('invite', { userId: f.id }); toast(r.error || `Invitación enviada a ${f.username}`, r.error ? 'err' : 'ok'); if (!r.error) e.target.disabled = true; }, 'small') : null,
          button(voice.has(f.id) ? '🎤 Voz: sí' : '🎤 Voz', () => toggleVoice(f.id, !voice.has(f.id)), voice.has(f.id) ? 'small primary' : 'small'),
        )) : h('p.muted.small', 'Aún no tienes amigos. Escribe su nombre arriba o comparte tu enlace.')),
      data.outgoing.length ? h('p.muted.small', `Pendientes de aceptar: ${data.outgoing.map((f) => f.username).join(', ')}`) : null,
    );
  }

  const flag = (label, key) => {
    const cb = h('input', { type: 'checkbox', checked: !!settings.get(key) });
    cb.addEventListener('change', () => settings.set(key, cb.checked));
    return h('label.qf-flag', cb, h('span', label));
  };

  const list = h('div.qf-list');
  body.append(
    h('div.qf-box',
      h('h4', 'Añadir amigo'),
      h('div.qf-row', add, button('➕ Añadir', sendAdd, 'primary')),
      h('div.qf-row', button('🔗 Copiar mi enlace de amigo', () => copy(friendLink(store.user.username), 'Enlace copiado: quien lo abra te enviará una solicitud'), 'small'),
        room ? button('🔗 Copiar enlace de esta partida', () => copy(roomLink(room), 'Enlace de la partida copiado'), 'small') : null)),
    h('div.qf-box', h('h4', 'Chat de voz y subtítulos'),
      h('div.qf-row.wrap', flag('Chat de voz', 'voice'), flag('Subtítulos', 'voiceCaptions')),
      h('p.muted.small', 'Pulsa «🎤 Voz» junto a cada amigo con quien quieras hablar. Solo ellos te oyen.')),
    list,
  );
  add.addEventListener('keydown', (e) => { if (e.key === 'Enter') sendAdd(); });
  const unsub = [net.on('presence', render), net.on('friends:changed', render), net.on('notify', render)];
  close = modal('👥 Amigos', body, { wide: true, actions: [{ label: 'Cerrar' }], onClose: () => unsub.forEach((u) => u()) });
  render();
}
