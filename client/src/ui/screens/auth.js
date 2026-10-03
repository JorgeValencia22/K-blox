// Pantalla de registro e inicio de sesión.
import { h, logo, button } from '../dom.js';
import { post, auth } from '../../core/api.js';
import { loginAsGuest } from '../../core/guest.js';
import { LIMITS } from '../../../../shared/constants.js';

export function authScreen(app) {
  let mode = 'login';
  const user = h('input.input', { placeholder: 'Nombre de usuario', autocomplete: 'username', maxLength: LIMITS.usernameMax });
  const pass = h('input.input', { type: 'password', placeholder: 'Contraseña', autocomplete: 'current-password', maxLength: LIMITS.passwordMax });
  const pass2 = h('input.input', { type: 'password', placeholder: 'Repite la contraseña', autocomplete: 'new-password', maxLength: LIMITS.passwordMax });
  const err = h('div.err');
  const submit = button('Entrar', () => send(), 'primary');
  const guestBtn = button('🎮 Jugar como invitado', async () => {
    guestBtn.disabled = true;
    err.textContent = '';
    try {
      app.onLogin(await loginAsGuest());
    } catch (e) {
      err.textContent = e.message;
    } finally {
      guestBtn.disabled = false;
    }
  });
  guestBtn.style.width = '100%';
  guestBtn.style.marginTop = '10px';
  submit.style.width = '100%';
  const confirmField = h('div.field.hidden', h('label', 'Confirmar contraseña'), pass2);
  const note = h('p.muted.small.hidden', `Nombre: ${LIMITS.usernameMin}-${LIMITS.usernameMax} caracteres (letras, números y _). No uses tu nombre real. Contraseña: mínimo ${LIMITS.passwordMin} caracteres.`);
  const tabs = h('div.tabs');
  const setMode = (m) => {
    mode = m;
    tabs.replaceChildren(
      h(`button${m === 'login' ? '.on' : ''}`, { on: { click: () => setMode('login') } }, 'Iniciar sesión'),
      h(`button${m === 'register' ? '.on' : ''}`, { on: { click: () => setMode('register') } }, 'Crear cuenta'),
    );
    confirmField.classList.toggle('hidden', m === 'login');
    note.classList.toggle('hidden', m === 'login');
    submit.textContent = m === 'login' ? 'Entrar' : 'Crear cuenta';
    pass.autocomplete = m === 'login' ? 'current-password' : 'new-password';
    err.textContent = '';
  };
  setMode('login');

  async function send() {
    err.textContent = '';
    const u = user.value.trim();
    if (mode === 'register') {
      if (!/^[A-Za-z0-9_]{3,20}$/.test(u)) return (err.textContent = 'Nombre no válido: 3-20 letras, números o _');
      if (pass.value.length < LIMITS.passwordMin) return (err.textContent = `La contraseña necesita al menos ${LIMITS.passwordMin} caracteres`);
      if (pass.value !== pass2.value) return (err.textContent = 'Las contraseñas no coinciden');
    }
    submit.disabled = true;
    try {
      const r = await post(mode === 'login' ? '/auth/login' : '/auth/register', { username: u, password: pass.value });
      auth.token = r.token;
      app.onLogin(r.user);
    } catch (e) {
      err.textContent = e.message;
    } finally {
      submit.disabled = false;
    }
  }
  for (const i of [user, pass, pass2]) i.addEventListener('keydown', (e) => e.key === 'Enter' && send());

  return h('div.screen.auth',
    h('div.auth-card.panel',
      logo(true),
      h('p.muted', { style: { textAlign: 'center', margin: '4px 0 0' } }, 'Explora, crea y juega con tus amigos en mundos de bloques.'),
      tabs,
      h('div.field', h('label', 'Usuario'), user),
      h('div.field', h('label', 'Contraseña'), pass),
      confirmField,
      note,
      err,
      submit,
      guestBtn,
      h('p.muted.small', { style: { textAlign: 'center', marginBottom: 0 } }, 'Como invitado entras al momento, sin contraseña. Crea una cuenta si quieres usarla en otros dispositivos.'),
    ),
  );
}
