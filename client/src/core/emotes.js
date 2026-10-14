// Emotes personalizados del servidor y lista de emotes que puede usar el jugador.
// El hosting gratuito borra la base de datos al dormirse: el navegador del admin guarda
// una copia de los emotes y los vuelve a subir si el servidor los ha perdido.
import { get, post } from './api.js';
import { store } from './store.js';
import { setCustomEmotes, CUSTOM_EMOTES, EMOTES } from '../avatar/avatarAnimator.js';
import { SHOP_ITEMS } from '../../../shared/catalog.js';

const BACKUP = 'kest.emoteBackup';
const isAdminUser = () => store.user?.role === 'admin';

function readBackup() {
  try {
    const v = JSON.parse(localStorage.getItem(BACKUP) || '[]');
    return Array.isArray(v) ? v : [];
  } catch {
    return [];
  }
}

/** Aplica la lista del servidor y, si es el admin, actualiza su copia local. */
export function applyEmotes(list) {
  setCustomEmotes(list);
  if (!isAdminUser()) return;
  try {
    localStorage.setItem(BACKUP, JSON.stringify(list));
  } catch {
    /* sin almacenamiento */
  }
}

export async function loadCustomEmotes() {
  try {
    let { emotes } = await get('/emotes');
    if (isAdminUser()) {
      const missing = readBackup().filter((e) => !emotes.some((s) => s.id === e.id));
      for (const e of missing) {
        const r = await post('/admin/emotes', { emote: e }).catch(() => null);
        if (r?.emotes) emotes = r.emotes;
      }
    }
    applyEmotes(emotes);
  } catch {
    /* sin conexión: se usan los que ya hubiera */
  }
}

/** Emotes disponibles: los gratuitos, los comprados y los personalizados. */
export function availableEmotes() {
  const list = SHOP_ITEMS.filter((i) => i.type === 'emote' && (i.price === 0 || store.owns(i.id)))
    .map((i) => ({ id: i.id, name: i.name, state: EMOTES[i.id] }));
  for (const e of CUSTOM_EMOTES.values()) list.push({ id: `c:${e.id}`, name: e.name, state: `c:${e.id}`, custom: true });
  return list;
}
