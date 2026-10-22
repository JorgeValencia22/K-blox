// Skins creadas por el desarrollador (trajes y conjuntos): se piden al servidor al entrar y se
// añaden al catálogo, para poder dibujarlas en cualquier avatar y venderlas en la tienda.
import { get } from './api.js';
import { registerCustomItems } from '../../../shared/catalog.js';

export async function loadCustomItems() {
  try {
    const { items } = await get('/shop/custom');
    registerCustomItems(items);
  } catch {
    /* sin conexión: se usan las que ya hubiera */
  }
}
