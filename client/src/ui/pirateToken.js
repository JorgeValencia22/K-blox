// Anuncio a pantalla completa cuando alguien encuentra el Token Pirata (el servidor lo manda solo
// al elegido por el desarrollador). Toda la tienda pasa a ser suya.
import { h, button } from './dom.js';
import { audio } from '../audio/audio.js';
import { store } from '../core/store.js';

export function showPirateToken() {
  if (document.querySelector('.pirate-ad')) return;
  audio.play('levelup');
  const confetti = Array.from({ length: 36 }, (_, i) => {
    const c = h('i.pirate-coin', '🪙');
    c.style.left = `${Math.random() * 100}%`;
    c.style.animationDelay = `${Math.random() * 2.5}s`;
    c.style.animationDuration = `${2.6 + Math.random() * 2}s`;
    c.style.fontSize = `${18 + (i % 4) * 8}px`;
    return c;
  });
  const el = h('div.pirate-ad',
    ...confetti,
    h('div.pirate-card',
      h('small', '🏴‍☠️ ANUNCIO'),
      h('h2', '¡TOKEN PIRATA!'),
      h('img.pirate-img', { src: '/token-pirata.jpg', alt: 'Token Pirata' }),
      h('p', `¡Enhorabuena${store.user?.username ? `, ${store.user.username}` : ''}! Has encontrado el Token Pirata.`),
      h('p.pirate-gift', '🎁 Toda la tienda de KestWorlds ya es tuya.'),
      button('¡Genial!', () => { el.classList.add('out'); setTimeout(() => el.remove(), 500); }, 'primary')));
  document.body.appendChild(el);
  store.refreshUser?.().catch(() => {});
}
