// Catálogo estático: experiencias oficiales, tienda, logros y niveles.
// El servidor es la fuente de verdad de precios y recompensas.

export const EXPERIENCES = [
  {
    id: 'city', name: 'Kest City', category: 'adventure', maxPlayers: 24, creator: 'Kest Studio',
    description: 'Una isla enorme con ciudad, montañas, río y lago. Conduce, vuela, abre cofres y busca las 12 gemas ocultas.',
    cover: { a: '#4fc3f7', b: '#81c784', icon: '🏙️' },
  },
  {
    id: 'obby', name: 'Kest Obby', category: 'obby', maxPlayers: 16, creator: 'Kest Studio',
    description: 'Circuito de obstáculos en el cielo: saltos, lava, plataformas móviles y puntos de control. ¡Bate tu récord!',
    cover: { a: '#ff8a65', b: '#ba68c8', icon: '🧗' },
  },
  {
    id: 'racing', name: 'Kest Racing', category: 'racing', maxPlayers: 8, creator: 'Kest Studio',
    description: 'Carreras de karts a 3 vueltas. Pasa por todos los puntos de control y llega el primero.',
    cover: { a: '#ffd54f', b: '#e57373', icon: '🏎️' },
  },
  {
    id: 'survival', name: 'Kest Survival', category: 'survival', maxPlayers: 12, creator: 'Kest Studio',
    description: 'Recoge madera, piedra y bayas, construye refugios y sobrevive a las criaturas de la noche.',
    cover: { a: '#455a64', b: '#8d6e63', icon: '🪓' },
  },
  {
    id: 'hangout', name: 'Kest Hangout', category: 'roleplay', maxPlayers: 30, creator: 'Kest Studio',
    description: 'Espacio social con pista de baile, hoguera, trampolines y emotes. Queda con tus amigos.',
    cover: { a: '#7986cb', b: '#f06292', icon: '🎉' },
  },
];

export const BUILTIN_IDS = EXPERIENCES.map((e) => e.id);

// type: hair | shirt | pants | face | accessory | emote | effect | decoration
export const SHOP_ITEMS = [
  { id: 'hair_short', type: 'hair', name: 'Pelo corto', price: 0 },
  { id: 'hair_long', type: 'hair', name: 'Pelo largo', price: 0 },
  { id: 'hair_spiky', type: 'hair', name: 'Pelo de punta', price: 60 },
  { id: 'hair_bun', type: 'hair', name: 'Moño', price: 60 },
  { id: 'hair_mohawk', type: 'hair', name: 'Cresta', price: 120 },
  { id: 'shirt_tee', type: 'shirt', name: 'Camiseta', price: 0 },
  { id: 'shirt_stripes', type: 'shirt', name: 'Camiseta a rayas', price: 50 },
  { id: 'shirt_hoodie', type: 'shirt', name: 'Sudadera', price: 90 },
  { id: 'shirt_suit', type: 'shirt', name: 'Traje', price: 200 },
  { id: 'shirt_star', type: 'shirt', name: 'Camiseta estrella', price: 140 },
  { id: 'pants_jeans', type: 'pants', name: 'Pantalón', price: 0 },
  { id: 'pants_shorts', type: 'pants', name: 'Pantalón corto', price: 40 },
  { id: 'pants_cargo', type: 'pants', name: 'Pantalón cargo', price: 80 },
  { id: 'face_smile', type: 'face', name: 'Sonrisa', price: 0 },
  { id: 'face_happy', type: 'face', name: 'Feliz', price: 0 },
  { id: 'face_cool', type: 'face', name: 'Guay', price: 70 },
  { id: 'face_wink', type: 'face', name: 'Guiño', price: 70 },
  { id: 'face_surprised', type: 'face', name: 'Sorpresa', price: 50 },
  { id: 'acc_cap', type: 'accessory', name: 'Gorra', price: 0 },
  { id: 'acc_glasses', type: 'accessory', name: 'Gafas', price: 0 },
  { id: 'acc_tophat', type: 'accessory', name: 'Sombrero de copa', price: 150 },
  { id: 'acc_crown', type: 'accessory', name: 'Corona', price: 400 },
  { id: 'acc_sunglasses', type: 'accessory', name: 'Gafas de sol', price: 90 },
  { id: 'acc_headphones', type: 'accessory', name: 'Auriculares', price: 120 },
  { id: 'acc_backpack', type: 'accessory', name: 'Mochila', price: 100 },
  { id: 'acc_cape', type: 'accessory', name: 'Capa', price: 250 },
  { id: 'acc_halo', type: 'accessory', name: 'Halo', price: 350 },
  { id: 'emote_wave', type: 'emote', name: 'Saludar', price: 0 },
  { id: 'emote_dance', type: 'emote', name: 'Bailar', price: 0 },
  { id: 'emote_cheer', type: 'emote', name: 'Celebrar', price: 0 },
  { id: 'emote_spin', type: 'emote', name: 'Giro', price: 80 },
  { id: 'emote_robot', type: 'emote', name: 'Baile robot', price: 150 },
  { id: 'emote_flip', type: 'emote', name: 'Voltereta', price: 220 },
  { id: 'fx_sparkles', type: 'effect', name: 'Destellos', price: 180 },
  { id: 'fx_fire', type: 'effect', name: 'Aura de fuego', price: 300 },
  { id: 'fx_rainbow', type: 'effect', name: 'Estela arcoíris', price: 450 },
  { id: 'deco_statue', type: 'decoration', name: 'Estatua (editor)', price: 120 },
  { id: 'deco_fountain', type: 'decoration', name: 'Fuente (editor)', price: 160 },
];

export const SHOP_BY_ID = Object.fromEntries(SHOP_ITEMS.map((i) => [i.id, i]));
export const FREE_ITEMS = SHOP_ITEMS.filter((i) => i.price === 0).map((i) => i.id);

export const ACHIEVEMENTS = [
  { id: 'first_steps', name: 'Primeros pasos', desc: 'Entra en tu primera experiencia', reward: 20 },
  { id: 'explorer', name: 'Explorador', desc: 'Visita las 5 experiencias oficiales', reward: 100 },
  { id: 'gem_hunter', name: 'Cazagemas', desc: 'Encuentra las 12 gemas de Kest City', reward: 150 },
  { id: 'treasure', name: 'Buscatesoros', desc: 'Abre 5 cofres', reward: 50 },
  { id: 'summit', name: 'Cumbre', desc: 'Llega a la cima de la montaña', reward: 60 },
  { id: 'pilot', name: 'Piloto', desc: 'Vuela la avioneta', reward: 40 },
  { id: 'obby_clear', name: 'Sin miedo a la lava', desc: 'Completa Kest Obby', reward: 80 },
  { id: 'obby_fast', name: 'Velocista', desc: 'Completa Kest Obby en menos de 90 s', reward: 150 },
  { id: 'racer', name: 'Corredor', desc: 'Termina una carrera', reward: 40 },
  { id: 'champion', name: 'Campeón', desc: 'Gana una carrera contra otros jugadores', reward: 120 },
  { id: 'survivor', name: 'Superviviente', desc: 'Sobrevive a una noche', reward: 80 },
  { id: 'builder', name: 'Constructor', desc: 'Publica tu primer mundo', reward: 100 },
  { id: 'social', name: 'Sociable', desc: 'Ten tu primer amigo', reward: 40 },
  { id: 'dancer', name: 'Bailarín', desc: 'Baila en la pista de Kest Hangout', reward: 30 },
  { id: 'shopper', name: 'De compras', desc: 'Compra un objeto en la tienda', reward: 20 },
  { id: 'level5', name: 'Nivel 5', desc: 'Alcanza el nivel 5', reward: 100 },
  { id: 'friendly', name: 'Amigable', desc: 'Habla con 5 personajes distintos', reward: 40 },
];
export const ACH_BY_ID = Object.fromEntries(ACHIEVEMENTS.map((a) => [a.id, a]));

/** Experiencia total necesaria para alcanzar `level`. */
export function xpForLevel(level) {
  return Math.round(100 * (level - 1) * (level - 1) + 50 * (level - 1));
}

export function levelFromXp(xp) {
  let lvl = 1;
  while (xpForLevel(lvl + 1) <= xp && lvl < 100) lvl++;
  return lvl;
}

export const LEVEL_REWARD_COINS = (level) => 25 + level * 10;
