// Creador de skins del desarrollador: diseña trajes completos (cabeza, cara, colores y piezas) o
// pone a la venta el avatar actual como conjunto, con nombre y precio en Kesty Coins.
// La vista previa 3D es la misma del editor de avatar.
import { h, button, toast, clear, confirmDialog } from '../dom.js';
import { post } from '../../core/api.js';
import { audio } from '../../audio/audio.js';
import { SHOP_ITEMS, SHOP_BY_ID, registerCustomItems, outfitPrice } from '../../../../shared/catalog.js';
import { COSTUME_HEADS, COSTUME_FACES, COSTUME_PARTS, COSTUME_LIMITS, STUDIO_COSTUMES, cleanCostume, cleanOutfit } from '../../../../shared/skins.js';

const COLOR_KEYS = [['head', 'Cabeza'], ['body', 'Cuerpo'], ['arms', 'Brazos'], ['hands', 'Manos'], ['legs', 'Piernas'], ['feet', 'Pies'], ['detail', 'Detalles']];
const PREVIEW_ID = '__skin_preview';
const blank = () => ({ id: null, name: '', price: 500, rare: false, costume: cleanCostume({ head: 'round', face: 'face_smile', colors: { head: '#ffb74d', body: '#42a5f5', arms: '#42a5f5', hands: '#ffb74d', legs: '#1e88e5', feet: '#263238', detail: '#ffffff' }, parts: [] }) });

export function skinCreator(preview, draft) {
  const prevCostume = draft.costume;
  let mode = 'costume';
  let s = blank();
  const root = h('div.skin-creator');

  const showPreview = () => {
    if (mode !== 'costume') { draft.costume = null; preview.set(draft); return; }
    SHOP_BY_ID[PREVIEW_ID] = { id: PREVIEW_ID, type: 'costume', name: s.name, costume: cleanCostume(s.costume) };
    draft.costume = PREVIEW_ID;
    preview.set(draft);
  };

  const field = (label, el) => h('label.field', h('span.small.muted', label), el);
  const colorIn = (value, onInput) => {
    const i = h('input', { type: 'color', value });
    i.addEventListener('input', () => onInput(i.value));
    return i;
  };
  const select = (opts, value, onPick) => {
    const el = h('select.input', Object.entries(opts).map(([v, l]) => h('option', { value: v, selected: v === value }, l)));
    el.addEventListener('change', () => onPick(el.value));
    return el;
  };
  const mine = () => SHOP_ITEMS.filter((i) => i.custom);

  async function save() {
    const name = s.name.trim();
    if (!name) return toast('Ponle un nombre', 'warn');
    const item = mode === 'costume'
      ? { id: s.id, type: 'costume', name, price: s.price, rare: s.rare, costume: s.costume }
      : { id: null, type: 'outfit', name, price: s.price, rare: s.rare, outfit: cleanOutfit(draft, (id) => SHOP_BY_ID[id]) };
    if (item.outfit?.error) return toast(item.outfit.error, 'warn');
    if (!(await confirmDialog('Poner a la venta', `¿Publicar "${name}" en la tienda por ${s.price} Kesty Coins?`, 'Publicar'))) return;
    try {
      const r = await post('/admin/items', { item });
      registerCustomItems(r.items);
      audio.play('levelup');
      toast(`"${name}" ya está a la venta en la tienda`, 'ok');
      s.id = mode === 'costume' ? r.item.id : null;
      render();
    } catch (e) {
      toast(e.message, 'err');
    }
  }

  async function retire(item) {
    try {
      const r = await post(`/admin/items/${item.id}/retire`, { retired: !item.retired });
      registerCustomItems(r.items);
      toast(item.retired ? `"${item.name}" vuelve a estar a la venta` : `"${item.name}" retirada de la tienda (quien la tiene la conserva)`, 'ok');
      render();
    } catch (e) {
      toast(e.message, 'err');
    }
  }

  function render() {
    const sec = (t) => h('div.section-title', t);
    clear(root).append(h('div.pills',
      h(`button.pill${mode === 'costume' ? '.on' : ''}`, { on: { click: () => { mode = 'costume'; s = blank(); render(); } } }, '🦖 Traje completo'),
      h(`button.pill${mode === 'outfit' ? '.on' : ''}`, { on: { click: () => { mode = 'outfit'; s = { ...blank(), price: outfitPrice(draft) }; render(); } } }, '👕 Conjunto (tu avatar actual)')));

    const nameIn = h('input.input', { maxLength: COSTUME_LIMITS.nameMax, value: s.name, placeholder: 'Nombre de la skin' });
    nameIn.addEventListener('input', () => { s.name = nameIn.value; });
    const priceIn = h('input.input', { type: 'number', min: COSTUME_LIMITS.priceMin, max: COSTUME_LIMITS.priceMax, step: 10, value: s.price, style: { width: '120px' } });
    priceIn.addEventListener('input', () => { s.price = Math.floor(Number(priceIn.value) || 0); });
    const rareIn = h('input', { type: 'checkbox', checked: s.rare });
    rareIn.addEventListener('change', () => { s.rare = rareIn.checked; });
    root.append(h('div.row.wrap', { style: { gap: '8px' } }, field('Nombre', nameIn), field('Precio (Kesty Coins)', priceIn), h('label.row.small', { style: { gap: '6px' } }, rareIn, '✨ Rara')));

    if (mode === 'costume') {
      const c = s.costume;
      const set = (fn) => { fn(); s.costume = cleanCostume(s.costume); showPreview(); };
      const templates = { '': 'Empezar desde…', ...Object.fromEntries(STUDIO_COSTUMES.map((t) => [t.id, `Plantilla: ${t.name}`])), ...Object.fromEntries(mine().filter((i) => i.type === 'costume').map((i) => [i.id, `Editar: ${i.name}`])) };
      root.append(field('Plantilla o skin tuya para editar', select(templates, '', (v) => {
        const it = SHOP_BY_ID[v];
        if (!it) return;
        s = it.custom ? { id: it.id, name: it.name, price: it.price, rare: !!it.rare, costume: JSON.parse(JSON.stringify(it.costume)) } : { ...blank(), costume: JSON.parse(JSON.stringify(it.costume)) };
        render();
      })));
      const faces = { ...COSTUME_FACES, ...Object.fromEntries(SHOP_ITEMS.filter((i) => i.type === 'face').map((i) => [i.id, `Cara: ${i.name}`])) };
      root.append(h('div.row.wrap', { style: { gap: '8px' } },
        field('Cabeza', select(COSTUME_HEADS, c.head, (v) => set(() => { s.costume.head = v; }))),
        field('Cara', select(faces, c.face, (v) => set(() => { s.costume.face = v; }))),
        h('label.row.small', { style: { gap: '6px' } }, (() => { const m = h('input', { type: 'checkbox', checked: c.metal }); m.addEventListener('change', () => set(() => { s.costume.metal = m.checked; })); return m; })(), '🔩 Metálico')));
      root.append(sec('Colores'), h('div.row.wrap', { style: { gap: '10px' } },
        ...COLOR_KEYS.map(([k, label]) => h('label.row.small', { style: { gap: '4px' } }, colorIn(c.colors[k], (v) => set(() => { s.costume.colors[k] = v; })), label)),
        h('label.row.small', { style: { gap: '4px' } }, colorIn(c.glow, (v) => set(() => { s.costume.glow = v; })), 'Luces')));
      root.append(sec(`Piezas (máx. ${COSTUME_LIMITS.maxParts})`), h('div.items', Object.entries(COSTUME_PARTS).map(([k, label]) => {
        const part = c.parts.find((p) => p.k === k);
        const tile = h(`div.item${part ? '.on' : ''}`, { on: { click: (e) => {
          if (e.target.tagName === 'INPUT') return;
          set(() => {
            if (part) s.costume.parts = s.costume.parts.filter((p) => p.k !== k);
            else if (s.costume.parts.length < COSTUME_LIMITS.maxParts) s.costume.parts.push({ k, c: s.costume.colors.detail });
            else toast(`Máximo ${COSTUME_LIMITS.maxParts} piezas`, 'warn');
          });
          render();
        } } }, label);
        if (part) tile.append(colorIn(part.c, (v) => set(() => { s.costume.parts.find((p) => p.k === k).c = v; })));
        return tile;
      })));
    } else {
      root.append(h('p.muted.small', 'Se vende tal cual llevas el avatar ahora (pelo, ropa, colores, accesorios y efecto). Quien lo compre recibe todas las prendas. Cambia el avatar en las otras pestañas y vuelve aquí.'));
    }
    root.append(h('div.row', { style: { gap: '8px', marginTop: '10px' } }, button(s.id ? '💾 Guardar cambios de la skin' : '🛒 Poner a la venta', save, 'primary')));

    const list = mine();
    root.append(sec('Tus skins en la tienda'));
    if (!list.length) root.append(h('p.muted.small', 'Todavía no has creado ninguna.'));
    else root.append(h('div.preset-list', list.map((i) => h('div.preset',
      h('b.grow', `${i.type === 'costume' ? '🦖' : '👕'} ${i.name}`),
      h('span.small.muted', `🪙 ${i.price}${i.retired ? ' · retirada' : ''}`),
      button(i.retired ? 'Volver a vender' : 'Retirar', () => retire(i), 'small'),
    ))));
    showPreview();
  }

  render();
  root.cleanup = () => {
    delete SHOP_BY_ID[PREVIEW_ID];
    draft.costume = prevCostume;
    preview.set(draft);
  };
  return root;
}
