// Tienda de KestWorlds (como el catálogo de avatares de Roblox): trajes, conjuntos, ropa, pelo,
// caras, accesorios, emotes y efectos con su imagen. Al elegir uno te lo pruebas en la vista 3D
// y puedes comprarlo con Kesty Coins y ponértelo.
import { h, button, toast, clear, confirmDialog } from '../dom.js';
import { post, put } from '../../core/api.js';
import { store } from '../../core/store.js';
import { engine } from '../../engine/renderer.js';
import { audio } from '../../audio/audio.js';
import { AvatarPreview } from '../menuScene.js';
import { pageHead } from './menu.js';
import { SHOP_ITEMS } from '../../../../shared/catalog.js';
import { EMOTES } from '../../avatar/avatarAnimator.js';
import { itemThumb, withItem } from '../itemThumbs.js';

const CATS = [
  ['top', '⭐ Destacado'], ['costume', '🦖 Trajes'], ['outfit', '👕 Conjuntos'], ['hair', '💇 Pelo'], ['shirt', '👚 Ropa superior'],
  ['pants', '👖 Ropa inferior'], ['face', '🙂 Caras'], ['accessory', '🎩 Accesorios'], ['emote', '💃 Emotes'], ['effect', '✨ Efectos'],
];
const TYPE_LABEL = { costume: 'Traje completo', outfit: 'Conjunto (trae todas las prendas)', hair: 'Pelo', shirt: 'Ropa superior', pants: 'Ropa inferior', face: 'Cara', accessory: 'Accesorio', emote: 'Emote', effect: 'Efecto', decoration: 'Decoración del editor' };
const SORTS = { pop: 'Recomendado', low: 'Precio: de menor a mayor', high: 'Precio: de mayor a menor' };

export function shopScreen(app, { cat = 'top' } = {}) {
  const preview = new AvatarPreview(store.user.avatar);
  preview.onResize = (w) => { preview.offsetX = w > 860 ? 1.6 : 0; };
  preview.onResize(innerWidth);
  const prevView = engine.view;
  engine.setView(preview);
  let current = cat, sort = 'pop', query = '', selected = null;

  const balance = h('b');
  const pills = h('div.pills.shop-cats');
  const grid = h('div.shop-grid');
  const info = h('div.shop-info.panel.hidden');
  const search = h('input.input', { placeholder: '🔍 Buscar en la tienda', style: { maxWidth: '240px' } });
  search.addEventListener('input', () => { query = search.value.trim().toLowerCase(); renderGrid(); });
  const sortSel = h('select.input', { style: { maxWidth: '220px' } }, Object.entries(SORTS).map(([v, l]) => h('option', { value: v }, l)));
  sortSel.addEventListener('change', () => { sort = sortSel.value; renderGrid(); });

  const owned = (i) => (i.price === 0 && !i.unlock) || store.owns(i.id);
  const forSale = (i) => !i.retired && (i.price > 0 || i.unlock);
  const wearing = (i) => {
    const a = store.user.avatar;
    if (i.type === 'costume') return a.costume === i.id;
    if (i.type === 'accessory') return (a.accessories || []).includes(i.id);
    return a[i.type] === i.id;
  };

  function list() {
    let l = SHOP_ITEMS.filter(forSale);
    if (current === 'top') l = l.filter((i) => i.type === 'costume' || i.type === 'outfit' || i.rare || i.custom);
    else l = l.filter((i) => i.type === current);
    if (query) l = l.filter((i) => i.name.toLowerCase().includes(query) || (i.by || '').toLowerCase().includes(query));
    if (sort === 'low') l = [...l].sort((a, b) => a.price - b.price);
    if (sort === 'high') l = [...l].sort((a, b) => b.price - a.price);
    if (current === 'top' && sort === 'pop') l = [...l].sort((a, b) => (b.custom ? 1 : 0) - (a.custom ? 1 : 0) || (b.type === 'costume') - (a.type === 'costume'));
    return l;
  }

  function card(i) {
    const own = owned(i);
    return h(`div.shop-card${selected?.id === i.id ? '.on' : ''}${i.rare ? '.rare' : ''}`, { on: { click: () => select(i) } },
      h('div.shop-thumb', itemThumb(i), i.custom ? h('span.shop-new', 'NUEVO') : null),
      h('div.shop-name', i.name),
      h('div.shop-price', own ? h('span.owned', '✓ Lo tienes') : i.unlock ? h('span.muted', '🔒 Se gana jugando') : h('span', h('span.coin.sm', 'K'), ` ${i.price.toLocaleString('es')}`)),
      i.by && i.by !== 'KestWorlds Studio' ? h('div.small.muted', `por ${i.by}`) : null);
  }

  function renderGrid() {
    clear(pills).append(...CATS.map(([id, label]) => h(`button.pill${current === id ? '.on' : ''}`, { on: { click: () => { current = id; renderGrid(); } } }, label)));
    const l = list();
    clear(grid).append(...(l.length ? l.map(card) : [h('p.muted', 'No hay nada con ese nombre.')]));
  }

  function select(i) {
    selected = i;
    audio.ui('click');
    if (i.type === 'emote') { preview.set(store.user.avatar); preview.play(EMOTES[i.id]); }
    else preview.set(withItem(store.user.avatar, i));
    renderGrid();
    renderInfo();
  }

  function renderInfo() {
    const i = selected;
    if (!i) { info.classList.add('hidden'); return; }
    info.classList.remove('hidden');
    const own = owned(i);
    const actions = [];
    if (!own && i.unlock) actions.push(h('p.small.muted', `🔒 No se compra: se gana en ${i.unlock}`));
    else if (!own) actions.push(button(`Comprar por 🪙 ${i.price.toLocaleString('es')}`, () => buy(i), 'primary big'));
    if (own && i.type !== 'emote' && i.type !== 'decoration') actions.push(wearing(i) ? h('span.owned', '✓ Lo llevas puesto') : button('Ponérmelo', () => wear(i), 'primary'));
    if (i.type === 'emote') actions.push(button('▶ Ver el baile', () => preview.play(EMOTES[i.id]), ''));
    clear(info).append(...[
      h('div.small.muted', TYPE_LABEL[i.type] || ''),
      h('h3', i.name, i.rare ? h('span.rare-tag', '★ RARO') : null),
      h('div.small.muted', `Creado por ${i.by || 'KestWorlds Studio'}`),
      i.type === 'outfit' ? h('div.small', `Incluye: ${listPieces(i)}`) : null,
      h('div.row.wrap', { style: { gap: '8px', marginTop: '10px', alignItems: 'center' } }, ...actions),
    ].filter(Boolean));
  }

  function listPieces(i) {
    const o = i.outfit;
    return [o.hair, o.shirt, o.pants, o.face, ...(o.accessories || []), o.effect].filter(Boolean)
      .map((id) => SHOP_ITEMS.find((x) => x.id === id)?.name).filter(Boolean).join(', ');
  }

  async function buy(i) {
    if (store.user.coins < i.price) {
      audio.ui('error');
      if (await confirmDialog('Te faltan Kesty Coins', `"${i.name}" cuesta ${i.price} y tienes ${store.user.coins}. ¿Quieres conseguir más Kesty Coins?`, 'Conseguir Kesty Coins')) app.go('coins');
      return;
    }
    if (!(await confirmDialog('Comprar', `¿Comprar "${i.name}" por ${i.price} Kesty Coins?`, 'Comprar'))) return;
    try {
      await post('/shop/buy', { itemId: i.id });
      await store.refreshUser();
      audio.play('coin');
      toast(`¡Has conseguido ${i.name}!`, 'ok');
      renderGrid();
      renderInfo();
      if (i.type !== 'emote' && i.type !== 'decoration' && (await confirmDialog('¡Es tuyo!', `¿Quieres ponerte "${i.name}" ahora?`, 'Ponérmelo'))) wear(i);
    } catch (e) {
      toast(e.message, 'err');
    }
  }

  async function wear(i) {
    try {
      const { avatar } = await put('/avatar', { avatar: withItem(store.user.avatar, i) });
      store.patchUser({ avatar });
      preview.set(avatar);
      toast(`Te has puesto "${i.name}"`, 'ok');
      renderInfo();
    } catch (e) {
      toast(e.message, 'err');
    }
  }

  const renderBalance = () => { balance.textContent = store.user.coins.toLocaleString('es'); };
  const unsub = store.on('user', renderBalance);
  renderBalance();
  renderGrid();

  // Arrastrar para girar
  const area = h('div.avatar-preview', h('div.hint', 'Arrastra para girar · elige un objeto para probártelo'));
  let lastX = null;
  area.addEventListener('pointerdown', (e) => { lastX = e.clientX; preview.dragging = true; area.setPointerCapture(e.pointerId); });
  area.addEventListener('pointermove', (e) => { if (lastX != null) { preview.rot += (e.clientX - lastX) * 0.01; lastX = e.clientX; } });
  area.addEventListener('pointerup', () => { lastX = null; preview.dragging = false; });
  area.append(info);

  const el = h('div.screen.page', { style: { background: 'transparent' } },
    pageHead(app, '🛒 Tienda',
      h('div.chip.coins-chip', { title: 'Conseguir Kesty Coins', on: { click: () => app.go('coins') } }, h('span.coin', 'K'), balance, h('span.plus', '+'))),
    h('div.shop-layout', { style: { flex: 1, minHeight: 0 } }, area,
      h('div.shop-side', pills, h('div.row.wrap', { style: { gap: '8px', margin: '8px 0' } }, search, sortSel), grid)),
  );
  el.cleanup = () => {
    unsub();
    preview.dispose();
    engine.setView(prevView);
  };
  return el;
}
