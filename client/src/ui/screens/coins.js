// Kesty Coins: compra con dinero real (app de Microsoft Store), recompensa diaria, ruleta diaria
// y códigos regalo. Las monedas son escasas: jugando solo se gana experiencia.
import { h, button, toast, clear } from '../dom.js';
import { post } from '../../core/api.js';
import { store } from '../../core/store.js';
import { audio } from '../../audio/audio.js';
import { shell, dailyDays } from './menu.js';
import { loadPacks, buyPack, claimPurchases, desktop, isGuestUser, STORE_URL } from '../../core/purchases.js';

const WAYS = [
  ['🛒', 'Comprarlas', 'En la app de KestWorlds de Microsoft Store, con el pago seguro de Microsoft.'],
  ['🎁', 'Recompensa diaria', 'Entra cada día: la racha de 7 días da hasta 10 KC.'],
  ['🎡', 'Ruleta diaria', 'Un giro gratis al día. ¡Premio gordo de 50 KC!'],
  ['🏆', 'Logros', 'Algunos logros dan unas pocas monedas.'],
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
  const prizes = store.user.rewards?.spin.prizes || [1, 2, 3, 5, 8, 12, 25, 50];
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
        audio.play(r.coins >= 25 ? 'levelup' : 'win');
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

  // --- Comprar Kesty Coins con dinero real ------------------------------------
  const shop = h('div.packs', h('p.muted.small', 'Cargando…'));
  let busy = false;
  async function renderShop() {
    let info;
    try {
      info = await loadPacks();
    } catch (e) {
      clear(shop).append(h('p.muted.small', e.message));
      return;
    }
    const inApp = !!desktop();
    const tiles = info.packs.map((p) => h(`div.pack${p.best ? '.best' : ''}`,
      p.best ? h('span.pack-tag', 'MEJOR VALOR') : p.bonus ? h('span.pack-tag', p.bonus) : null,
      h('span.coin.lg', 'K'), h('b.pack-n', p.coins.toLocaleString('es')), h('span.small.muted', 'Kesty Coins'),
      inApp && info.enabled
        ? button(p.price || `US$ ${p.usd}`, () => buy(p), 'primary')
        : h('span.pack-price', `US$ ${p.usd}`)));
    clear(shop).append(h('div.pack-grid', tiles));
    if (!info.enabled) shop.append(h('p.small.muted', '⏳ Las compras se están activando. ¡Muy pronto podrás comprar Kesty Coins!'));
    else if (!inApp) shop.append(h('p.small', '💻 Las Kesty Coins se compran desde la app de KestWorlds para Windows, con el pago seguro de Microsoft Store. ', h('a', { href: STORE_URL, target: '_blank', rel: 'noopener' }, 'Descargar la app gratis')));
    else if (isGuestUser()) shop.append(h('p.small', '👤 Para comprar necesitas una cuenta (así no pierdes tus monedas). Créala desde tu perfil.'));
    shop.append(h('p.small.muted', 'Precios orientativos en dólares: Microsoft Store muestra el precio final en tu moneda. Pide permiso a tus padres antes de comprar. Las Kesty Coins no se pueden cambiar por dinero.'));
  }
  async function buy(p) {
    if (busy) return;
    busy = true;
    try {
      const r = await buyPack(p);
      if (r.coins) {
        audio.play('levelup');
        toast(`🎉 ¡+${r.coins} Kesty Coins! Gracias por apoyar KestWorlds`, 'reward', 5000);
        render();
      }
    } catch (e) {
      toast(e.message, 'err', 5000);
    } finally {
      busy = false;
    }
  }
  renderShop();
  // Por si una compra se pagó pero no llegó a entregarse (se cerró la app, sin conexión…)
  if (desktop()) claimPurchases().then((r) => { if (r?.coins) toast(`🎉 Compra entregada: +${r.coins} Kesty Coins`, 'reward', 5000); }).catch(() => {});

  const unsub = store.on('user', render);
  const el = shell(app, 'coins',
    h('div.page-body.coins-page',
      h('div.coins-hero.panel', h('span.coin.xl', 'K'), h('div', h('div.muted.small', 'Tu saldo'), balance, h('div.muted.small', 'Kesty Coins')),
        h('div.grow'), button('🛒 Gastar en la tienda', () => app.go('avatar', { tab: 'shop' }), 'violet')),
      h('div.panel.box', h('h3', '🛒 Comprar Kesty Coins'), shop),
      h('div.coins-grid',
        h('div.panel.box', h('h3', '🎡 Ruleta diaria'), wheelWrap, h('div', { style: { textAlign: 'center', marginTop: '14px' } }, spinBtn)),
        h('div.panel.box', h('h3', '🎁 Recompensa diaria'), daily,
          h('h3', { style: { marginTop: '22px' } }, '🎟️ Canjear código regalo'), h('div.row', code, button('Canjear', redeem, 'primary'))),
      ),
      h('div.panel.box', h('h3', '💡 Cómo conseguir más Kesty Coins'),
        h('div.ways', WAYS.map(([ic, t, d]) => h('div.way', h('span.way-ic', ic), h('div', h('b', t), h('div.small.muted', d))))),
        h('p.small.muted', { style: { marginTop: '12px' } }, '🔒 Jugando ganas experiencia y niveles; las Kesty Coins son escasas y sirven para trajes, conjuntos, ropa y efectos.'),
      ),
    ),
  );
  render();
  const base = el.cleanup;
  el.cleanup = () => { base(); unsub(); };
  return el;
}
