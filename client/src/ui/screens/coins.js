// Tienda de Kesty Coins: recompensa diaria, ruleta diaria, códigos regalo y formas de ganar monedas.
// No hay pagos con dinero real.
import { h, button, toast, clear } from '../dom.js';
import { post } from '../../core/api.js';
import { store } from '../../core/store.js';
import { audio } from '../../audio/audio.js';
import { shell, dailyDays } from './menu.js';

const WAYS = [
  ['🎁', 'Recompensa diaria', 'Entra cada día: la racha de 7 días da hasta 75 KC.'],
  ['🎡', 'Ruleta diaria', 'Un giro gratis al día. ¡Premio gordo de 300 KC!'],
  ['⭐', 'Subir de nivel', 'Cada nivel nuevo da monedas extra.'],
  ['🏆', 'Logros', 'Cada logro desbloqueado tiene su premio.'],
  ['🎮', 'Ganar partidas', 'Escapar, sobrevivir, ganar carreras, vender cosechas…'],
  ['🎟️', 'Códigos regalo', 'Los organizadores de KestWorlds regalan códigos en eventos.'],
];

export function coinsScreen(app) {
  const balance = h('b.balance', '');
  const wheelWrap = h('div.wheel-wrap');
  const daily = h('div');
  let spinning = false;

  const render = () => {
    const u = store.user;
    balance.textContent = u.coins.toLocaleString('es');
    const rw = u.rewards;
    clear(daily).append(
      dailyDays(rw.daily),
      rw.daily.claimedToday ? h('p.muted.small', '✔ Recogida hoy. ¡Vuelve mañana para seguir la racha!') : button(`🎁 Recoger ${rw.daily.next} KC`, claim, 'primary'),
    );
    spinBtn.disabled = !rw.spin.available || spinning;
    spinBtn.textContent = rw.spin.available ? '🎡 ¡GIRAR!' : 'Vuelve mañana';
  };

  // Ruleta dibujada con CSS (segmentos con conic-gradient)
  const prizes = store.user.rewards?.spin.prizes || [5, 10, 15, 25, 40, 75, 150, 300];
  const colors = ['#00d1b2', '#7c5cff', '#ffcc33', '#ff5470', '#29b6f6', '#66bb6a', '#ff9800', '#e040fb'];
  const seg = 360 / prizes.length;
  const wheel = h('div.wheel', { style: { background: `conic-gradient(${prizes.map((_, i) => `${colors[i % colors.length]} ${i * seg}deg ${(i + 1) * seg}deg`).join(',')})` } },
    ...prizes.map((p, i) => h('span.wheel-lbl', { style: { transform: `rotate(${i * seg + seg / 2}deg) translateY(-92px) rotate(90deg)` } }, `${p}`)));
  let angle = 0;
  wheelWrap.append(h('div.wheel-pointer', '▼'), wheel, h('div.wheel-center', 'KC'));
  const spinBtn = button('🎡 ¡GIRAR!', spin, 'primary big');

  async function spin() {
    if (spinning) return;
    spinning = true;
    spinBtn.disabled = true;
    try {
      const r = await post('/rewards/spin');
      // El segmento ganador queda bajo el puntero (arriba)
      const target = 360 - (r.index * seg + seg / 2);
      angle += 360 * 5 + ((target - (angle % 360)) + 360) % 360;
      wheel.style.transform = `rotate(${angle}deg)`;
      audio.play('countdown');
      setTimeout(async () => {
        audio.play(r.coins >= 75 ? 'levelup' : 'win');
        toast(`🎡 ¡Has ganado ${r.coins} Kesty Coins!`, 'reward', 4000);
        spinning = false;
        await store.refreshUser();
        render();
      }, 4200);
    } catch (e) {
      toast(e.message, 'err');
      spinning = false;
      render();
    }
  }

  async function claim() {
    try {
      const r = await post('/rewards/daily');
      audio.play('coin');
      toast(`🎁 +${r.coins} Kesty Coins (racha de ${r.streak} días)`, 'reward');
      await store.refreshUser();
      render();
    } catch (e) {
      toast(e.message, 'err');
    }
  }

  const code = h('input.input', { placeholder: 'Escribe tu código (ej. KEST-ABC123)', maxLength: 24, style: { textTransform: 'uppercase' } });
  const redeem = async () => {
    try {
      const r = await post('/codes/redeem', { code: code.value });
      audio.play('levelup');
      toast(`🎟️ ¡Código canjeado! +${r.coins} Kesty Coins`, 'reward', 4000);
      code.value = '';
      await store.refreshUser();
      render();
    } catch (e) {
      toast(e.message, 'err');
      audio.ui('error');
    }
  };
  code.addEventListener('keydown', (e) => e.key === 'Enter' && redeem());

  const unsub = store.on('user', render);
  const el = shell(app, 'coins',
    h('div.page-body.coins-page',
      h('div.coins-hero.panel', h('span.coin.xl', 'K'), h('div', h('div.muted.small', 'Tu saldo'), balance, h('div.muted.small', 'Kesty Coins')),
        h('div.grow'), button('🛒 Gastar en la tienda', () => app.go('avatar', { tab: 'shop' }), 'violet')),
      h('div.coins-grid',
        h('div.panel.box', h('h3', '🎡 Ruleta diaria'), wheelWrap, h('div', { style: { textAlign: 'center', marginTop: '14px' } }, spinBtn)),
        h('div.panel.box', h('h3', '🎁 Recompensa diaria'), daily,
          h('h3', { style: { marginTop: '22px' } }, '🎟️ Canjear código regalo'), h('div.row', code, button('Canjear', redeem, 'primary'))),
      ),
      h('div.panel.box', h('h3', '💡 Cómo conseguir más Kesty Coins'),
        h('div.ways', WAYS.map(([ic, t, d]) => h('div.way', h('span.way-ic', ic), h('div', h('b', t), h('div.small.muted', d))))),
        h('p.small.muted', { style: { marginTop: '12px' } }, '🔒 En KestWorlds no se puede pagar con dinero real: todas las monedas se ganan jugando. Así es más justo para todos.'),
      ),
    ),
  );
  render();
  const base = el.cleanup;
  el.cleanup = () => { base(); unsub(); };
  return el;
}
