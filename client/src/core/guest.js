// Modo invitado: crea una cuenta con nombre y contraseña aleatorios guardados en
// este navegador. Si el servidor perdió los datos (hosting gratuito que se
// reinicia), se crea un invitado nuevo automáticamente.
import { post, auth } from './api.js';

const KEY = 'kest.guest';

function load() {
  try {
    return JSON.parse(localStorage.getItem(KEY) || 'null');
  } catch {
    return null;
  }
}

function save(g) {
  try {
    localStorage.setItem(KEY, JSON.stringify(g));
  } catch {
    /* sin almacenamiento: el invitado dura lo que la pestaña */
  }
}

export const hasGuest = () => !!load();

const randomPassword = () => Array.from(crypto.getRandomValues(new Uint8Array(18)), (b) => b.toString(16).padStart(2, '0')).join('');

/** Inicia sesión como invitado (reutiliza el de este navegador si sigue existiendo). */
export async function loginAsGuest() {
  const g = load();
  if (g) {
    try {
      const r = await post('/auth/login', g);
      auth.token = r.token;
      return r.user;
    } catch (e) {
      if (e.status !== 401) throw e;
    }
  }
  for (let i = 0; i < 5; i++) {
    const creds = { username: `Invitado_${Math.floor(1000 + Math.random() * 9000)}`, password: randomPassword() };
    try {
      const r = await post('/auth/register', creds);
      save(creds);
      auth.token = r.token;
      return r.user;
    } catch (e) {
      if (!/existe/.test(e.message)) throw e;
    }
  }
  throw new Error('No se pudo crear el invitado, inténtalo de nuevo');
}
