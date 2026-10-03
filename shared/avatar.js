// Descripción del avatar y validación contra el inventario del usuario.
import { SHOP_BY_ID } from './catalog.js';

export const SKIN_TONES = ['#ffdbac', '#f1c27d', '#e0ac69', '#c68642', '#8d5524', '#5c3a1e', '#ffe0bd', '#f5d0c5'];

export const DEFAULT_AVATAR = {
  skin: '#f1c27d',
  hair: 'hair_short',
  hairColor: '#4e342e',
  shirt: 'shirt_tee',
  shirtColor: '#2196f3',
  pants: 'pants_jeans',
  pantsColor: '#37474f',
  shoesColor: '#212121',
  face: 'face_smile',
  accessories: [],
  effect: null,
};

const HEX = /^#[0-9a-fA-F]{6}$/;
const color = (v, def) => (HEX.test(v) ? v.toLowerCase() : def);

/**
 * Normaliza un avatar. Los objetos que no pertenecen a `owned` (Set de ids)
 * se sustituyen por los valores por defecto.
 */
export function sanitizeAvatar(a, owned) {
  a = a && typeof a === 'object' ? a : {};
  const d = DEFAULT_AVATAR;
  const has = (id, type) => {
    const item = SHOP_BY_ID[id];
    return item && item.type === type && (item.price === 0 || (owned && owned.has(id)));
  };
  const out = {
    skin: color(a.skin, d.skin),
    hair: a.hair === 'none' ? 'none' : has(a.hair, 'hair') ? a.hair : d.hair,
    hairColor: color(a.hairColor, d.hairColor),
    shirt: has(a.shirt, 'shirt') ? a.shirt : d.shirt,
    shirtColor: color(a.shirtColor, d.shirtColor),
    pants: has(a.pants, 'pants') ? a.pants : d.pants,
    pantsColor: color(a.pantsColor, d.pantsColor),
    shoesColor: color(a.shoesColor, d.shoesColor),
    face: has(a.face, 'face') ? a.face : d.face,
    accessories: [],
    effect: a.effect && has(a.effect, 'effect') ? a.effect : null,
  };
  if (Array.isArray(a.accessories)) {
    for (const id of a.accessories) {
      if (out.accessories.length >= 4) break;
      if (has(id, 'accessory') && !out.accessories.includes(id)) out.accessories.push(id);
    }
  }
  return out;
}

const pick = (rng, list) => list[Math.floor(rng() * list.length)];
const NPC_COLORS = ['#e53935', '#1e88e5', '#43a047', '#fdd835', '#8e24aa', '#fb8c00', '#00acc1', '#f06292', '#6d4c41', '#546e7a'];

/** Avatar aleatorio (determinista con `rng`) para los personajes no jugadores. */
export function randomAvatar(rng) {
  const acc = [];
  if (rng() < 0.5) acc.push(pick(rng, ['acc_cap', 'acc_glasses', 'acc_headphones', 'acc_backpack', 'acc_tophat', 'acc_sunglasses']));
  return {
    skin: pick(rng, SKIN_TONES),
    hair: pick(rng, ['hair_short', 'hair_long', 'hair_spiky', 'hair_bun', 'hair_mohawk', 'none']),
    hairColor: pick(rng, ['#212121', '#4e342e', '#8d6e63', '#d84315', '#fdd835', '#f5f5f5']),
    shirt: pick(rng, ['shirt_tee', 'shirt_stripes', 'shirt_hoodie', 'shirt_star', 'shirt_suit']),
    shirtColor: pick(rng, NPC_COLORS),
    pants: pick(rng, ['pants_jeans', 'pants_shorts', 'pants_cargo']),
    pantsColor: pick(rng, ['#37474f', '#1a237e', '#4e342e', '#212121', '#795548']),
    shoesColor: pick(rng, ['#212121', '#fafafa', '#6d4c41']),
    face: pick(rng, ['face_smile', 'face_happy', 'face_wink', 'face_cool', 'face_surprised']),
    accessories: acc,
    effect: null,
  };
}
