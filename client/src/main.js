// Punto de entrada del cliente: sesión, navegación entre pantallas, eventos
// globales en tiempo real y entrada/salida de partidas y del editor.
import { engine } from './engine/renderer.js';
import { input } from './engine/input.js';
import { audio } from './audio/audio.js';
import { auth, get, post } from './core/api.js';
import { store } from './core/store.js';
import { net } from './core/net.js';
import { h, toast, modal, button } from './ui/dom.js';
import { MenuScene } from './ui/menuScene.js';
import { authScreen } from './ui/screens/auth.js';
import { menuScreen, shell } from './ui/screens/menu.js';
import { discoverScreen } from './ui/screens/discover.js';
import { avatarScreen } from './ui/screens/avatar.js';
import { friendsScreen } from './ui/screens/friends.js';
import { createScreen } from './ui/screens/create.js';
import { profileScreen } from './ui/screens/profile.js';
import { adminScreen } from './ui/screens/admin.js';
import { coinsScreen } from './ui/screens/coins.js';
import { Game } from './game/game.js';
import { loginAsGuest } from './core/guest.js';

const SCREENS = { menu: menuScreen, discover: discoverScreen, avatar: avatarScreen, friends: friendsScreen, create: createScreen, profile: profileScreen, admin: adminScreen, coins: coinsScreen };

class App {
  constructor() {
    this.ui = document.getElementById('ui');
    this.current = null;
    this.game = null;
    this.editor = null;
    this.menuScene = null;
    this.netBound = false;
  }

  async boot() {
    engine.init(document.getElementById('stage'));
    input.attach(engine.canvas);
    const unlock = () => audio.unlock();
    addEventListener('pointerdown', unlock);
    addEventListener('keydown', unlock);
    addEventListener('kest:unauthorized', () => {
      if (store.user) {
        toast('Tu sesión ha caducado. Vuelve a iniciar sesión.', 'warn');
        this.logout(true);
      }
    });
    addEventListener('beforeunload', (e) => {
      if (this.editor?.dirty) { e.preventDefault(); e.returnValue = ''; }
    });
    this.menuScene = new MenuScene();
    engine.setView(this.menuScene);
    let user = null;
    // Recuperación de sesión: el token solo se descarta si el servidor lo rechaza (401);
    // si el servidor no responde se reintenta.
    for (let attempt = 0; auth.token && attempt < 20; attempt++) {
      try {
        user = (await get('/auth/me')).user;
        break;
      } catch (e) {
        if (e.status === 401 || e.status === 403) {
          auth.token = null;
          break;
        }
        this.loading('No se puede conectar con el servidor. Reintentando…');
        await new Promise((r) => setTimeout(r, 2000));
      }
    }
    // Invitado cuya sesión ya no existe (p. ej. el servidor gratuito se reinició): se recrea solo.
    // Sin contraseña: la primera vez se entra directamente como invitado.
    let loggedOut = false;
    try { loggedOut = !!localStorage.getItem('kest.loggedOut'); } catch { /* sin almacenamiento */ }
    if (!user && !auth.token && !loggedOut) {
      try {
        user = await loginAsGuest();
      } catch {
        /* se mostrará la pantalla de acceso */
      }
    }
    document.getElementById('boot').classList.add('hide');
    if (user) this.onLogin(user);
    else this.showScreen(authScreen(this));
  }

  loading(text) {
    const b = document.getElementById('boot');
    if (text) {
      b.querySelector('.boot-text').textContent = text;
      b.classList.remove('hide');
    } else b.classList.add('hide');
  }

  showScreen(el) {
    this.current?.cleanup?.();
    this.ui.replaceChildren();
    this.current = el;
    if (el) this.ui.appendChild(el);
  }

  async go(name, params = {}) {
    if (this.current?.beforeLeave && !(await this.current.beforeLeave())) return;
    if (name === 'editor') return this.openEditor(params.id);
    if (engine.view !== this.menuScene && !this.game && !this.editor) engine.setView(this.menuScene);
    const el = SCREENS[name](this, params);
    // Las páginas secundarias se muestran dentro del marco con barra lateral
    if (el.classList.contains('page')) {
      el.classList.remove('screen');
      const framed = shell(this, name, el);
      const base = framed.cleanup;
      framed.cleanup = () => { base(); el.cleanup?.(); };
      framed.beforeLeave = el.beforeLeave;
      this.showScreen(framed);
    } else this.showScreen(el);
  }

  onLogin(user) {
    try { localStorage.removeItem('kest.loggedOut'); } catch { /* sin almacenamiento */ }
    store.setUser(user);
    net.connect();
    this.bindNet();
    engine.setView(this.menuScene);
    audio.startMusic();
    this.go('menu');
    if (user.newAccount) toast('¡Bienvenido/a a Kest Worlds! Por seguridad, las cuentas nuevas tienen el chat limitado unos minutos.', 'info', 6000);
  }

  bindNet() {
    if (this.netBound) return;
    this.netBound = true;
    net.on('progress', (p) => {
      store.patchUser({ xp: p.xp, level: p.level, coins: p.coins, xpLevelStart: p.xpLevelStart, xpNextLevel: p.xpNextLevel });
      const parts = [p.gainedXp ? `+${p.gainedXp} XP` : '', p.gainedCoins ? `+${p.gainedCoins} 🪙` : ''].filter(Boolean).join('  ');
      if (parts) toast(`${p.reason ? p.reason + ' · ' : ''}${parts}`, 'reward');
      if (p.leveledUp) {
        audio.play('levelup');
        toast(`⭐ ¡Has subido al nivel ${p.level}!`, 'reward', 4500);
        store.notify({ kind: 'level', text: `Has alcanzado el nivel ${p.level}` });
      }
    });
    net.on('achievement', (a) => {
      audio.play('win');
      toast(`🏆 Logro desbloqueado: ${a.name}`, 'reward', 4500);
      store.notify({ kind: 'achievement', text: `Logro: ${a.name} — ${a.desc}` });
      store.refreshUser().catch(() => {});
    });
    net.on('notify', (n) => {
      audio.ui('notify');
      toast(n.text, 'info');
      store.notify(n);
    });
    net.on('invite', (inv) => {
      audio.ui('notify');
      store.notify({ kind: 'invite', roomId: inv.roomId, text: `${inv.from.username} te invita a ${inv.name}` });
      modal('Invitación', h('p', `${inv.from.username} te invita a jugar a ${inv.name}.`), {
        actions: [{ label: 'Ignorar' }, { label: 'Unirse', cls: 'primary', onClick: (close) => { close(); this.play({ roomId: inv.roomId }); } }],
      });
    });
    net.on('toast', (t) => toast(t.text, t.kind || 'info'));
    net.on('announce', ({ text, from }) => {
      audio.play('checkpoint');
      const el = h('div.announce', h('small', `📢 Anuncio de ${from}`), text);
      document.body.appendChild(el);
      setTimeout(() => el.classList.add('out'), 7000);
      setTimeout(() => el.remove(), 7600);
    });
    net.on('kicked', ({ reason }) => {
      if (!this.game) toast(reason || 'Desconectado', 'err', 5000);
    });
    net.on('status', (s) => {
      if (s === 'offline' && store.user && !this.game) this.offlineToast = this.offlineToast || setTimeout(() => { toast('Sin conexión con el servidor. Reintentando…', 'warn'); this.offlineToast = null; }, 3000);
    });
  }

  /** Entra en una partida. req: { key } | { roomId } | { code } + private */
  async play(req) {
    if (this.joining) return;
    if (this.game) await this.game.exit('switch');
    this.joining = true;
    this.loading('Entrando en la partida…');
    try {
      if (!net.connected) {
        net.connect();
        net.ensure();
        await new Promise((r) => { const off = net.on('status', (s) => { if (s === 'online') { off(); r(); } }); setTimeout(r, 5000); });
      }
      const res = await net.request('room:join', req, 15000);
      if (res.error) {
        toast(res.error, 'err');
        audio.ui('error');
        return;
      }
      this.showScreen(null);
      this.game = new Game({
        join: res,
        onExit: (reason) => {
          this.game = null;
          engine.setView(this.menuScene);
          if (reason !== 'switch') this.go('menu');
        },
      });
      await new Promise((r) => setTimeout(r, 30)); // deja pintar la pantalla de carga
      this.game.start();
      if (res.room.inviteCode && res.room.visibility === 'private') toast(`Sala privada creada. Código: ${res.room.inviteCode}`, 'ok', 7000);
    } catch (e) {
      console.error(e);
      toast('No se pudo entrar en la partida', 'err');
      this.game?.dispose();
      this.game = null;
      engine.setView(this.menuScene);
      this.go('menu');
    } finally {
      this.joining = false;
      this.loading(null);
    }
  }

  /** Administrador: entra en una partida en modo espectador (respuesta de 'admin' spectate). */
  async startSpectating(res) {
    if (this.game) {
      this.game.dispose();
      this.game = null;
    }
    this.showScreen(null);
    this.game = new Game({
      join: res,
      onExit: (reason) => {
        this.game = null;
        engine.setView(this.menuScene);
        if (reason !== 'switch') this.go('admin');
      },
    });
    this.game.start();
  }

  async openEditor(id) {
    this.loading('Abriendo editor…');
    try {
      const r = await get(`/worlds/${id}`);
      // El editor se descarga solo cuando se usa (el juego carga más rápido)
      const { Editor } = await import('./editor/editor.js');
      this.showScreen(null);
      this.editor = new Editor(this, r.world, r.data);
      this.editor.start();
    } catch (e) {
      toast(e.message, 'err');
      this.editor = null;
      this.go('create');
    } finally {
      this.loading(null);
    }
  }

  closeEditor() {
    this.editor = null;
    engine.setView(this.menuScene);
    this.go('create');
  }

  /** Prueba local de un mundo del editor (sin servidor). */
  testWorld(world, name, onExit) {
    this.game = new Game({
      offline: { world, name },
      onExit: () => {
        this.game = null;
        onExit();
      },
    });
    this.game.start();
  }

  async logout(silent = false) {
    if (!silent) {
      try { await post('/auth/logout'); } catch { /* ya caducada */ }
    }
    this.game?.dispose();
    this.game = null;
    this.editor?.dispose();
    this.editor = null;
    auth.token = null;
    try { localStorage.setItem('kest.loggedOut', '1'); } catch { /* sin almacenamiento */ }
    net.disconnect();
    store.setUser(null);
    audio.stopMusic();
    engine.setView(this.menuScene);
    this.showScreen(authScreen(this));
  }
}

const app = new App();
app.boot().catch((e) => {
  console.error(e);
  document.querySelector('#boot .boot-text').textContent = 'Error al iniciar: ' + e.message;
});
window.kest = { app, store, net, engine };
export { button };
