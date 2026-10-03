// Editor de avatar con vista previa 3D giratoria, y tienda de K-Coins.
import { h, button, toast, clear, confirmDialog } from '../dom.js';
import { put, post } from '../../core/api.js';
import { store } from '../../core/store.js';
import { engine } from '../../engine/renderer.js';
import { audio } from '../../audio/audio.js';
import { AvatarPreview } from '../menuScene.js';
import { pageHead } from './menu.js';
import { SHOP_ITEMS, SHOP_BY_ID } from '../../../../shared/catalog.js';
import { SKIN_TONES } from '../../../../shared/avatar.js';
import { EMOTES } from '../../avatar/avatarAnimator.js';

const COLORS = ['#f44336', '#e91e63', '#9c27b0', '#673ab7', '#3f51b5', '#2196f3', '#03a9f4', '#00bcd4', '#009688', '#4caf50', '#8bc34a', '#cddc39', '#ffeb3b', '#ffc107', '#ff9800', '#ff5722', '#795548', '#9e9e9e', '#607d8b', '#212121', '#fafafa'];
const HAIR_COLORS = ['#212121', '#4e342e', '#8d6e63', '#d84315', '#fdd835', '#f5f5f5', '#7e57c2', '#26c6da', '#ec407a'];
const TYPE_NAMES = { hair: 'Pelo', shirt: 'Ropa superior', pants: 'Ropa inferior', face: 'Caras', accessory: 'Accesorios', emote: 'Animaciones', effect: 'Efectos', decoration: 'Decoración (editor)' };

export function avatarScreen(app, { tab = 'body' } = {}) {
  const draft = JSON.parse(JSON.stringify(store.user.avatar));
  const preview = new AvatarPreview(draft);
  const prevView = engine.view;
  engine.setView(preview);
  let current = tab;
  let dirty = false;
  const side = h('div.avatar-side');
  const tabsEl = h('div.pills', { style: { marginBottom: '6px' } });
  const content = h('div');
  const saveBtn = button('💾 Guardar cambios', save, 'primary');

  const update = () => {
    dirty = true;
    preview.set(draft);
  };

  function swatches(list, key, extraColor = true) {
    const wrap = h('div.swatches', list.map((c) => h(`div.swatch${draft[key] === c ? '.on' : ''}`, {
      style: { background: c },
      on: { click: () => { draft[key] = c; audio.ui('click'); update(); render(); } },
    })));
    if (extraColor) {
      const picker = h('input', { type: 'color', value: draft[key], title: 'Color personalizado' });
      picker.addEventListener('input', () => { draft[key] = picker.value; update(); });
      picker.addEventListener('change', () => render());
      wrap.append(picker);
    }
    return wrap;
  }

  function itemTile(item, selected, onSelect) {
    const owned = item.price === 0 || store.owns(item.id);
    return h(`div.item${selected ? '.on' : ''}${owned ? '' : '.locked'}`, {
      on: {
        click: async () => {
          audio.ui('click');
          if (!owned) {
            if (await buy(item)) onSelect();
            return;
          }
          onSelect();
        },
      },
    }, item.name, owned ? null : h('span.price', `🪙 ${item.price}`));
  }

  async function buy(item) {
    if (store.user.coins < item.price) {
      toast(`Te faltan ${item.price - store.user.coins} K-Coins`, 'warn');
      audio.ui('error');
      return false;
    }
    if (!(await confirmDialog('Comprar objeto', `¿Comprar "${item.name}" por ${item.price} K-Coins?`, 'Comprar'))) return false;
    try {
      await post('/shop/buy', { itemId: item.id });
      await store.refreshUser();
      audio.play('coin');
      toast(`¡Has conseguido ${item.name}!`, 'ok');
      return true;
    } catch (e) {
      toast(e.message, 'err');
      return false;
    }
  }

  const items = (type) => SHOP_ITEMS.filter((i) => i.type === type);

  function render() {
    clear(tabsEl).append(...[['body', 'Cuerpo'], ['hair', 'Pelo'], ['clothes', 'Ropa'], ['face', 'Cara'], ['acc', 'Accesorios'], ['emotes', 'Emotes'], ['fx', 'Efectos'], ['shop', '🛒 Tienda']].map(([id, label]) =>
      h(`button.pill${current === id ? '.on' : ''}`, { on: { click: () => { current = id; render(); } } }, label)));
    clear(content);
    const sec = (t) => h('div.section-title', t);
    switch (current) {
      case 'body':
        content.append(sec('Color de piel'), swatches(SKIN_TONES, 'skin'), sec('Zapatos'), swatches(COLORS, 'shoesColor'));
        break;
      case 'hair':
        content.append(sec('Peinado'), h('div.items',
          h(`div.item${draft.hair === 'none' ? '.on' : ''}`, { on: { click: () => { draft.hair = 'none'; update(); render(); } } }, 'Sin pelo'),
          ...items('hair').map((i) => itemTile(i, draft.hair === i.id, () => { draft.hair = i.id; update(); render(); }))),
        sec('Color de pelo'), swatches(HAIR_COLORS, 'hairColor'));
        break;
      case 'clothes':
        content.append(
          sec('Ropa superior'), h('div.items', items('shirt').map((i) => itemTile(i, draft.shirt === i.id, () => { draft.shirt = i.id; update(); render(); }))),
          sec('Color'), swatches(COLORS, 'shirtColor'),
          sec('Ropa inferior'), h('div.items', items('pants').map((i) => itemTile(i, draft.pants === i.id, () => { draft.pants = i.id; update(); render(); }))),
          sec('Color'), swatches(COLORS, 'pantsColor'));
        break;
      case 'face':
        content.append(sec('Expresión'), h('div.items', items('face').map((i) => itemTile(i, draft.face === i.id, () => { draft.face = i.id; update(); render(); }))));
        break;
      case 'acc':
        content.append(sec('Accesorios (máx. 4)'), h('div.items', items('accessory').map((i) => itemTile(i, draft.accessories.includes(i.id), () => {
          const k = draft.accessories.indexOf(i.id);
          if (k >= 0) draft.accessories.splice(k, 1);
          else if (draft.accessories.length < 4) draft.accessories.push(i.id);
          else toast('Máximo 4 accesorios', 'warn');
          update();
          render();
        }))));
        break;
      case 'emotes':
        content.append(sec('Prueba tus emotes (teclas 1-7 en partida)'), h('div.items', items('emote').map((i) => itemTile(i, false, () => preview.play(EMOTES[i.id])))));
        break;
      case 'fx':
        content.append(sec('Efecto visual'), h('div.items',
          h(`div.item${!draft.effect ? '.on' : ''}`, { on: { click: () => { draft.effect = null; update(); render(); } } }, 'Ninguno'),
          ...items('effect').map((i) => itemTile(i, draft.effect === i.id, () => { draft.effect = i.id; update(); render(); }))));
        break;
      case 'shop': {
        content.append(h('p.muted.small', `Tienes 🪙 ${store.user.coins} K-Coins. Gana más completando experiencias, logros y subiendo de nivel. No existen compras con dinero real.`));
        for (const type of Object.keys(TYPE_NAMES)) {
          const list = items(type).filter((i) => i.price > 0);
          if (!list.length) continue;
          content.append(sec(TYPE_NAMES[type]), h('div.items', list.map((i) => {
            const owned = store.owns(i.id);
            return h(`div.item${owned ? '.on' : ''}`, { on: { click: async () => { if (!owned && (await buy(i))) render(); } } }, i.name, h('span.price', owned ? '✓ En tu inventario' : `🪙 ${i.price}`));
          })));
        }
        break;
      }
      default:
        break;
    }
  }

  async function save() {
    saveBtn.disabled = true;
    try {
      const { avatar } = await put('/avatar', { avatar: draft });
      store.patchUser({ avatar });
      Object.assign(draft, avatar);
      preview.set(draft);
      dirty = false;
      toast('Avatar guardado', 'ok');
    } catch (e) {
      toast(e.message, 'err');
    } finally {
      saveBtn.disabled = false;
    }
  }

  // Arrastrar para girar
  const area = h('div.avatar-preview', h('div.hint', 'Arrastra para girar'));
  let lastX = null;
  area.addEventListener('pointerdown', (e) => { lastX = e.clientX; preview.dragging = true; area.setPointerCapture(e.pointerId); });
  area.addEventListener('pointermove', (e) => { if (lastX != null) { preview.rot += (e.clientX - lastX) * 0.01; lastX = e.clientX; } });
  area.addEventListener('pointerup', () => { lastX = null; preview.dragging = false; });

  const unsub = store.on('user', () => current === 'shop' && render());
  render();
  side.append(tabsEl, content);
  const el = h('div.screen.page', { style: { background: 'transparent' } },
    pageHead(app, 'Avatar', saveBtn),
    h('div.avatar-layout', { style: { flex: 1, minHeight: 0 } }, area, side),
  );
  el.cleanup = () => {
    unsub();
    preview.dispose();
    engine.setView(prevView);
  };
  el.beforeLeave = async () => !dirty || confirmDialog('Cambios sin guardar', '¿Salir sin guardar los cambios del avatar?', 'Salir sin guardar', 'danger');
  return el;
}

export { SHOP_BY_ID };
