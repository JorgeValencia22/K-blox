// Compra de Kesty Coins con dinero real. Solo funciona en la app de Microsoft Store (Windows):
// su ventana expone window.kestDesktop (electron-preload.cjs), que abre la compra de Microsoft.
// El servidor comprueba cada compra con Microsoft antes de dar las monedas.
import { get, post } from './api.js';
import { store } from './store.js';

export const STORE_URL = 'https://apps.microsoft.com/detail/9P8WT4BHHTSG';
export const desktop = () => (typeof window !== 'undefined' && window.kestDesktop?.store ? window.kestDesktop : null);
export const isGuestUser = () => /^Invitado_/.test(store.user?.username || '');

/** Paquetes con el precio real de Microsoft Store (en la app) o el orientativo en dólares. */
export async function loadPacks() {
  const { packs, enabled } = await get('/store/packs');
  const d = desktop();
  if (d) {
    const r = await d.products().catch(() => null);
    for (const p of packs) {
      const sp = r?.products?.find((x) => x.inAppId === p.id || x.storeId === p.storeId);
      if (sp) Object.assign(p, { storeId: sp.storeId, price: sp.price });
    }
  }
  return { packs, enabled };
}

/** Pide a Microsoft las compras pagadas y aún sin entregar y las convierte en monedas. */
export async function claimPurchases() {
  const d = desktop();
  if (!d || isGuestUser()) return { coins: 0 };
  const t = await post('/store/ms/ticket');
  const k = await d.collectionsKey(t.ticket, t.userId);
  if (!k?.key) throw new Error('Windows no ha dado los datos de la compra. Comprueba que has iniciado sesión en Microsoft Store.');
  const r = await post('/store/ms/redeem', { key: k.key });
  if (r.coins) await store.refreshUser();
  return r;
}

/** Abre la ventana de pago de Microsoft y, si se paga, entrega las monedas. */
export async function buyPack(pack) {
  const d = desktop();
  if (!d) throw new Error('Las Kesty Coins se compran desde la app de KestWorlds de Microsoft Store');
  if (isGuestUser()) throw new Error('Crea tu cuenta (o inicia sesión) antes de comprar, para no perder las monedas');
  if (!pack.storeId) throw new Error('Este paquete todavía no está disponible en Microsoft Store');
  const r = await d.purchase(pack.storeId);
  if (r.status === 'NotPurchased') return { cancelled: true };
  if (r.status !== 'Succeeded' && r.status !== 'AlreadyPurchased') throw new Error(`Microsoft Store: ${r.error || r.status || 'no se ha podido completar la compra'}`);
  return claimPurchases();
}
