// Skins: TRAJES completos (cambian todo el cuerpo del avatar) y CONJUNTOS (packs de ropa ya
// combinada). Los de KestWorlds Studio están aquí; los que crea el desarrollador desde el juego
// se guardan en la base de datos con el mismo formato y se registran al arrancar (catalog.js).

const HEX = /^#[0-9a-fA-F]{6}$/;

/** Formas de cabeza de los trajes. */
export const COSTUME_HEADS = { round: 'Redonda', box: 'Cuadrada', tall: 'Alargada', dome: 'Casco de cristal' };
/** Caras propias de los trajes (además de las caras normales face_*). */
export const COSTUME_FACES = { robot: 'Robot', visor: 'Visera', mask: 'Máscara ninja', alien: 'Ojos de alien', none: 'Sin cara', skull: 'Calavera' };
/** Piezas que se pueden añadir a un traje (máx. 8). */
export const COSTUME_PARTS = {
  ears_cat: 'Orejas de gato', ears_bunny: 'Orejas de conejo', ears_bear: 'Orejas de oso', horns: 'Cuernos',
  antenna: 'Antenas', crest: 'Cresta de pinchos', spikes: 'Pinchos en la espalda', tail_dino: 'Cola de dinosaurio',
  tail_cat: 'Cola de gato', snout: 'Hocico', beak: 'Pico', fin: 'Aleta', wings_bat: 'Alas de dragón',
  wings_angel: 'Alas de ángel', cape: 'Capa', halo: 'Halo', crown: 'Corona', pads: 'Hombreras',
  belt: 'Cinturón', chest_light: 'Luz en el pecho', jetpack: 'Mochila cohete', mane: 'Melena', belly: 'Barriga',
};
export const COSTUME_LIMITS = { maxParts: 8, nameMax: 28, priceMin: 0, priceMax: 100000 };

const col = (v, d) => (HEX.test(v) ? v.toLowerCase() : d);

/** Valida y normaliza los datos de un traje. Devuelve { error } o el traje limpio. */
export function cleanCostume(c) {
  if (!c || typeof c !== 'object') return { error: 'Traje vacío' };
  const k = c.colors || {};
  const colors = {
    head: col(k.head, '#9e9e9e'), body: col(k.body, '#9e9e9e'), arms: col(k.arms, col(k.body, '#9e9e9e')),
    hands: col(k.hands, '#757575'), legs: col(k.legs, '#757575'), feet: col(k.feet, '#424242'), detail: col(k.detail, '#ffffff'),
  };
  const head = COSTUME_HEADS[c.head] ? c.head : 'round';
  const face = COSTUME_FACES[c.face] || /^face_[a-z]+$/.test(c.face || '') ? c.face : 'robot';
  const parts = [];
  for (const p of Array.isArray(c.parts) ? c.parts : []) {
    if (parts.length >= COSTUME_LIMITS.maxParts) break;
    if (!p || !COSTUME_PARTS[p.k]) continue;
    parts.push({ k: p.k, c: col(p.c, colors.detail) });
  }
  return { head, face, colors, parts, metal: !!c.metal, glow: col(c.glow, '#00e5ff') };
}

/** Valida un conjunto: lista de campos del avatar que aplica al ponérselo. */
export function cleanOutfit(o, itemById) {
  if (!o || typeof o !== 'object') return { error: 'Conjunto vacío' };
  const out = {};
  for (const [key, type] of [['hair', 'hair'], ['shirt', 'shirt'], ['pants', 'pants'], ['face', 'face'], ['effect', 'effect']]) {
    if (o[key] && itemById(o[key])?.type === type) out[key] = o[key];
  }
  for (const key of ['hairColor', 'shirtColor', 'pantsColor', 'shoesColor']) if (HEX.test(o[key])) out[key] = o[key].toLowerCase();
  out.accessories = (Array.isArray(o.accessories) ? o.accessories : []).filter((id) => itemById(id)?.type === 'accessory').slice(0, 4);
  if (o.accColors && typeof o.accColors === 'object') {
    out.accColors = {};
    for (const id of out.accessories) if (HEX.test(o.accColors[id])) out.accColors[id] = o.accColors[id].toLowerCase();
  }
  if (!out.shirt && !out.pants && !out.hair && !out.accessories.length) return { error: 'El conjunto necesita al menos una prenda' };
  return out;
}

/** Piezas (ids de la tienda) que incluye un conjunto: al comprarlo se reciben todas. */
export const outfitPieces = (o) => [o.hair, o.shirt, o.pants, o.face, o.effect, ...(o.accessories || [])].filter(Boolean);

// --- Trajes de KestWorlds Studio ---------------------------------------------------------------
const C = (id, name, price, costume, extra = {}) => ({ id, name, price, costume: cleanCostume(costume), by: 'KestWorlds Studio', ...extra });
export const STUDIO_COSTUMES = [
  C('skin_robot', 'Robot K-9', 800, { head: 'box', face: 'robot', metal: true, glow: '#00e5ff',
    colors: { head: '#b0bec5', body: '#90a4ae', arms: '#78909c', hands: '#455a64', legs: '#607d8b', feet: '#37474f', detail: '#00e5ff' },
    parts: [{ k: 'antenna', c: '#ff5252' }, { k: 'chest_light', c: '#00e5ff' }, { k: 'pads', c: '#546e7a' }] }),
  C('skin_dino', 'Dino Rex', 900, { head: 'round', face: 'face_happy',
    colors: { head: '#43a047', body: '#43a047', arms: '#388e3c', hands: '#2e7d32', legs: '#388e3c', feet: '#1b5e20', detail: '#c5e1a5' },
    parts: [{ k: 'snout', c: '#43a047' }, { k: 'spikes', c: '#ff7043' }, { k: 'tail_dino', c: '#43a047' }, { k: 'belly', c: '#c5e1a5' }] }),
  C('skin_astro', 'Astronauta Nova', 1000, { head: 'dome', face: 'face_smile',
    colors: { head: '#ffe0bd', body: '#eceff1', arms: '#eceff1', hands: '#b0bec5', legs: '#eceff1', feet: '#90a4ae', detail: '#ff7043' },
    parts: [{ k: 'jetpack', c: '#cfd8dc' }, { k: 'chest_light', c: '#ff7043' }, { k: 'belt', c: '#ff7043' }] }),
  C('skin_ninja', 'Ninja Sombra', 700, { head: 'round', face: 'mask',
    colors: { head: '#212121', body: '#212121', arms: '#263238', hands: '#212121', legs: '#212121', feet: '#111111', detail: '#e53935' },
    parts: [{ k: 'belt', c: '#e53935' }, { k: 'cape', c: '#b71c1c' }] }),
  C('skin_bear', 'Osito Peluche', 600, { head: 'round', face: 'face_happy',
    colors: { head: '#8d6e63', body: '#8d6e63', arms: '#795548', hands: '#6d4c41', legs: '#795548', feet: '#5d4037', detail: '#d7ccc8' },
    parts: [{ k: 'ears_bear', c: '#6d4c41' }, { k: 'snout', c: '#d7ccc8' }, { k: 'belly', c: '#d7ccc8' }] }),
  C('skin_alien', 'Alien Zorg', 750, { head: 'tall', face: 'alien',
    colors: { head: '#76ff03', body: '#64dd17', arms: '#64dd17', hands: '#33691e', legs: '#558b2f', feet: '#33691e', detail: '#e040fb' },
    parts: [{ k: 'antenna', c: '#e040fb' }, { k: 'belt', c: '#7c4dff' }] }),
  C('skin_knight', 'Caballero de Hierro', 1200, { head: 'box', face: 'visor', metal: true,
    colors: { head: '#9e9e9e', body: '#bdbdbd', arms: '#9e9e9e', hands: '#757575', legs: '#9e9e9e', feet: '#616161', detail: '#ffd54f' },
    parts: [{ k: 'crest', c: '#e53935' }, { k: 'pads', c: '#ffd54f' }, { k: 'cape', c: '#c62828' }, { k: 'belt', c: '#5d4037' }] }),
  C('skin_cat', 'Gato Neón', 650, { head: 'round', face: 'face_cat',
    colors: { head: '#f48fb1', body: '#ce93d8', arms: '#f48fb1', hands: '#ffffff', legs: '#ce93d8', feet: '#ffffff', detail: '#18ffff' },
    parts: [{ k: 'ears_cat', c: '#f48fb1' }, { k: 'tail_cat', c: '#f48fb1' }, { k: 'chest_light', c: '#18ffff' }] }),
  C('skin_dragon', 'Dragón Carmesí', 1500, { head: 'round', face: 'face_evil',
    colors: { head: '#d32f2f', body: '#c62828', arms: '#d32f2f', hands: '#8e0000', legs: '#c62828', feet: '#8e0000', detail: '#ffca28' },
    parts: [{ k: 'horns', c: '#ffca28' }, { k: 'wings_bat', c: '#8e0000' }, { k: 'spikes', c: '#ffca28' }, { k: 'tail_dino', c: '#c62828' }, { k: 'snout', c: '#d32f2f' }, { k: 'belly', c: '#ffca28' }] }, { rare: true }),
  C('skin_shark', 'Tiburón', 700, { head: 'round', face: 'face_tongue',
    colors: { head: '#607d8b', body: '#607d8b', arms: '#546e7a', hands: '#455a64', legs: '#546e7a', feet: '#37474f', detail: '#eceff1' },
    parts: [{ k: 'fin', c: '#546e7a' }, { k: 'belly', c: '#eceff1' }, { k: 'tail_dino', c: '#607d8b' }] }),
  C('skin_penguin', 'Pingüino', 550, { head: 'round', face: 'face_smile',
    colors: { head: '#263238', body: '#263238', arms: '#263238', hands: '#263238', legs: '#263238', feet: '#ff9800', detail: '#fafafa' },
    parts: [{ k: 'beak', c: '#ff9800' }, { k: 'belly', c: '#fafafa' }] }),
  C('skin_skeleton', 'Esqueleto', 650, { head: 'round', face: 'skull',
    colors: { head: '#f5f5f5', body: '#212121', arms: '#e0e0e0', hands: '#f5f5f5', legs: '#212121', feet: '#e0e0e0', detail: '#f5f5f5' },
    parts: [{ k: 'belly', c: '#e0e0e0' }] }),
  C('skin_angel', 'Ángel', 1100, { head: 'round', face: 'face_happy',
    colors: { head: '#ffe0bd', body: '#fafafa', arms: '#fafafa', hands: '#ffe0bd', legs: '#fafafa', feet: '#fff8e1', detail: '#ffd54f' },
    parts: [{ k: 'halo', c: '#ffd54f' }, { k: 'wings_angel', c: '#ffffff' }, { k: 'belt', c: '#ffd54f' }] }, { rare: true }),
  C('skin_lion', 'Rey León', 950, { head: 'round', face: 'face_determined',
    colors: { head: '#ffb300', body: '#ffa000', arms: '#ffb300', hands: '#ff8f00', legs: '#ffa000', feet: '#e65100', detail: '#6d4c41' },
    parts: [{ k: 'mane', c: '#6d4c41' }, { k: 'ears_bear', c: '#ffa000' }, { k: 'crown', c: '#ffd54f' }, { k: 'tail_cat', c: '#ffa000' }] }),
];

// --- Conjuntos de KestWorlds Studio (precio de pack: más barato que comprar cada pieza) ----------
const O = (id, name, outfit, extra = {}) => ({ id, name, outfit, by: 'KestWorlds Studio', ...extra });
export const STUDIO_OUTFITS = [
  O('outfit_rock', 'Estrella del rock', { hair: 'hair_emo', hairColor: '#212121', shirt: 'shirt_jacket', shirtColor: '#212121', pants: 'pants_ripped', pantsColor: '#37474f', face: 'face_cool', accessories: ['acc_guitar', 'acc_sunglasses'] }),
  O('outfit_ninja', 'Ninja urbano', { hair: 'hair_spiky', hairColor: '#212121', shirt: 'shirt_ninja', shirtColor: '#212121', pants: 'pants_joggers', pantsColor: '#212121', face: 'face_determined', accessories: ['acc_ninjamask', 'acc_sword'] }),
  O('outfit_space', 'Explorador espacial', { hair: 'hair_buzz', hairColor: '#4e342e', shirt: 'shirt_astronaut', shirtColor: '#eceff1', pants: 'pants_cargo', pantsColor: '#90a4ae', face: 'face_stars', accessories: ['acc_jetpack', 'acc_antenna'] }),
  O('outfit_wizard', 'Mago de las estrellas', { hair: 'hair_long', hairColor: '#f5f5f5', shirt: 'shirt_galaxy', shirtColor: '#4527a0', pants: 'pants_galaxy', pantsColor: '#311b92', face: 'face_wink', accessories: ['acc_witch', 'acc_cape'], effect: 'fx_sparkles' }, { rare: true }),
  O('outfit_sport', 'Crack del fútbol', { hair: 'hair_buzz', hairColor: '#212121', shirt: 'shirt_jersey', shirtColor: '#e53935', pants: 'pants_shorts', pantsColor: '#fafafa', face: 'face_determined', accessories: ['acc_headphones'] }),
  O('outfit_party', 'Fiestero', { hair: 'hair_afro', hairColor: '#ec407a', shirt: 'shirt_rainbow', shirtColor: '#ffeb3b', pants: 'pants_stars', pantsColor: '#7e57c2', face: 'face_lol', accessories: ['acc_partyhat', 'acc_sunglasses'], effect: 'fx_hearts' }),
  O('outfit_cowboy', 'Vaquero', { hair: 'hair_sidepart', hairColor: '#8d6e63', shirt: 'shirt_flannel', shirtColor: '#c62828', pants: 'pants_jeans', pantsColor: '#1a237e', face: 'face_smile', accessories: ['acc_cowboy', 'acc_scarf'] }),
  O('outfit_vampire', 'Vampiro', { hair: 'hair_swoop', hairColor: '#212121', shirt: 'shirt_suit', shirtColor: '#212121', pants: 'pants_leather', pantsColor: '#212121', face: 'face_evil', accessories: ['acc_cape', 'acc_batwings'], accColors: { acc_cape: '#b71c1c' } }, { rare: true }),
];
