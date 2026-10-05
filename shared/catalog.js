// Catálogo estático: experiencias oficiales, tienda, logros y niveles.
// El servidor es la fuente de verdad de precios y recompensas.

export const EXPERIENCES = [
  {
    id: 'asalto', name: 'Asalto a la Casa', category: 'adventure', maxPlayers: 8, creator: 'KestWorlds Studio', isNew: true, featured: true,
    description: 'Historia por noches: de día busca tablas, comida y armas de broma y tapia ventanas y puertas. De noche llegan Los Encapuchados a por el tesoro familiar… y la última noche, su jefe.',
    cover: { a: '#1a237e', b: '#ff8f00', icon: '🏠' },
  },
  {
    id: 'pesadilla', name: 'Silencio Mortal', category: 'horror', maxPlayers: 6, creator: 'KestWorlds Studio', isNew: true, featured: true,
    description: 'Terror en primera persona. El Oyente es ciego pero lo oye TODO: pasos, carreras… y tu voz si activas el micrófono. Devuelve la luz, encuentra la llave y escapa.',
    cover: { a: '#000000', b: '#7f0000', icon: '👂' },
  },
  {
    id: 'desastres', name: 'Desastres Naturales', category: 'survival', maxPlayers: 16, creator: 'KestWorlds Studio', isNew: true, featured: true,
    description: 'Inundaciones, lava, meteoritos, tornados, terremotos y lluvia ácida. Cada ronda llega un desastre distinto: ¡sobrevive hasta el final!',
    cover: { a: '#ff7043', b: '#1e88e5', icon: '🌪️' },
  },
  {
    id: 'huerto', name: 'Mi Huerto', category: 'simulator', maxPlayers: 8, creator: 'KestWorlds Studio', isNew: true, featured: true,
    description: 'Compra semillas, planta, cosecha y vende. Tus plantas siguen creciendo aunque no estés. ¡Busca frutas doradas y arcoíris!',
    cover: { a: '#7cb342', b: '#ffca28', icon: '🌱' },
  },
  {
    id: 'bloques', name: 'Bloques Locos', category: 'party', maxPlayers: 12, creator: 'KestWorlds Studio', isNew: true, featured: true,
    description: 'Ponte sobre el color que se anuncia antes de que desaparezcan las demás baldosas. Cada ronda va más rápido. ¡El último en pie gana! (con bots)',
    cover: { a: '#e91e63', b: '#00bcd4', icon: '🟥' },
  },
  {
    id: 'city', name: 'Isla Metrópolis', category: 'adventure', maxPlayers: 24, creator: 'KestWorlds Studio',
    description: 'Una isla enorme con ciudad, montañas, río y lago. Conduce, vuela, abre cofres y busca las 12 gemas ocultas.',
    cover: { a: '#4fc3f7', b: '#81c784', icon: '🏙️' },
  },
  {
    id: 'obby', name: 'Obby del Cielo', category: 'obby', maxPlayers: 16, creator: 'KestWorlds Studio',
    description: 'Circuito de obstáculos en el cielo: saltos, lava, plataformas móviles y puntos de control. ¡Bate tu récord!',
    cover: { a: '#ff8a65', b: '#ba68c8', icon: '🧗' },
  },
  {
    id: 'racing', name: 'Turbo Karts', category: 'racing', maxPlayers: 8, creator: 'KestWorlds Studio',
    description: 'Carreras de karts a 3 vueltas. Pasa por todos los puntos de control y llega el primero.',
    cover: { a: '#ffd54f', b: '#e57373', icon: '🏎️' },
  },
  {
    id: 'survival', name: 'Noche Salvaje', category: 'survival', maxPlayers: 12, creator: 'KestWorlds Studio',
    description: 'Recoge madera, piedra y bayas, construye refugios y sobrevive a las criaturas de la noche.',
    cover: { a: '#455a64', b: '#8d6e63', icon: '🪓' },
  },
  {
    id: 'hangout', name: 'La Plaza', category: 'roleplay', maxPlayers: 30, creator: 'KestWorlds Studio',
    description: 'Espacio social con pista de baile, hoguera, trampolines y emotes. Queda con tus amigos.',
    cover: { a: '#7986cb', b: '#f06292', icon: '🎉' },
  },
  {
    id: 'onlyup', name: 'Solo Arriba', category: 'obby', maxPlayers: 16, creator: 'KestWorlds Studio',
    description: 'Escala más de 200 metros: del barrio a la obra, las nubes y el espacio. Sin puntos de control: si caes, empiezas desde donde aterrices.',
    cover: { a: '#4dd0e1', b: '#311b92', icon: '🧗‍♂️' },
  },
  {
    id: 'keys', name: 'Teclas ASMR', category: 'obby', maxPlayers: 16, creator: 'KestWorlds Studio',
    description: 'Obby relajante sobre teclados mecánicos gigantes. Cada tecla se hunde y suena al pisarla: caminar es tocar música. ASMR.',
    cover: { a: '#7c4dff', b: '#00e5ff', icon: '⌨️' },
  },
  {
    id: 'horror', name: 'Laberinto Sombrío', category: 'horror', maxPlayers: 8, creator: 'KestWorlds Studio',
    description: 'Un laberinto de noche, una linterna y La Sombra detrás de ti. Encontrad las almas perdidas y escapad juntos.',
    cover: { a: '#000000', b: '#4a148c', icon: '👁️' },
  },
  {
    id: 'royale', name: 'Isla Royale', category: 'battle', maxPlayers: 12, creator: 'KestWorlds Studio',
    description: 'Batalla en una isla: abre cofres, construye muros y rampas y sobrevive a la tormenta. ¡Solo puede quedar uno! (con bots)',
    cover: { a: '#7b1fa2', b: '#29b6f6', icon: '🎯' },
  },
  {
    id: 'rocket', name: 'Turbo Gol', category: 'sports', maxPlayers: 6, creator: 'KestWorlds Studio',
    description: 'Fútbol con coches: turbo, saltos y un balón gigante. Azul contra Naranja, partidos de 3 minutos (con bots).',
    cover: { a: '#1e88e5', b: '#fb8c00', icon: '⚽' },
  },
  {
    id: 'castores', name: 'Castores al Ataque', category: 'adventure', maxPlayers: 8, creator: 'KestWorlds Studio',
    description: 'Atraco cooperativo: roe tablones, roba troncos del aserradero y llévalos a la presa esquivando sierras y fuego. ¡Con música!',
    cover: { a: '#8d6e63', b: '#ffca28', icon: '🦫' },
  },
];

export const BUILTIN_IDS = EXPERIENCES.map((e) => e.id);

// type: hair | shirt | pants | face | accessory | emote | effect | decoration
// Precios en Kesty Coins (KC). Las monedas son escasas: lo bueno cuesta conseguirlo.
const I = (type, list) => list.map(([id, name, price, extra]) => ({ id, type, name, price, ...(extra || {}) }));
export const SHOP_ITEMS = [
  ...I('hair', [
    ['hair_short', 'Pelo corto', 0], ['hair_long', 'Pelo largo', 0], ['hair_buzz', 'Rapado', 60],
    ['hair_bowl', 'Tazón', 120], ['hair_spiky', 'Pelo de punta', 150], ['hair_bun', 'Moño', 150],
    ['hair_sidepart', 'Raya al lado', 180], ['hair_curly', 'Rizado', 200], ['hair_ponytail', 'Coleta', 200],
    ['hair_mohawk', 'Cresta', 250], ['hair_pigtails', 'Dos coletas', 250], ['hair_emo', 'Flequillo largo', 280],
    ['hair_afro', 'Afro', 300], ['hair_wavy', 'Melena ondulada', 300], ['hair_spacebuns', 'Moños espaciales', 350],
    ['hair_braids', 'Trenzas', 350], ['hair_swoop', 'Tupé', 400], ['hair_anime', 'Puntas de anime', 450, { rare: true }],
  ]),
  ...I('shirt', [
    ['shirt_tee', 'Camiseta', 0], ['shirt_tank', 'Camiseta de tirantes', 90], ['shirt_stripes', 'Camiseta a rayas', 100],
    ['shirt_heart', 'Camiseta corazón', 150], ['shirt_hoodie', 'Sudadera', 180], ['shirt_flannel', 'Camisa de cuadros', 200],
    ['shirt_sweater', 'Jersey de invierno', 210], ['shirt_jersey', 'Camiseta de fútbol', 220], ['shirt_camo', 'Camuflaje', 240],
    ['shirt_overalls', 'Peto vaquero', 260], ['shirt_lightning', 'Rayo', 260], ['shirt_star', 'Camiseta estrella', 280],
    ['shirt_panda', 'Sudadera panda', 300], ['shirt_jacket', 'Chaqueta de cuero', 320], ['shirt_rainbow', 'Arcoíris', 380],
    ['shirt_suit', 'Traje', 400], ['shirt_flames', 'Llamas', 450], ['shirt_galaxy', 'Galaxia', 500, { rare: true }],
    ['shirt_ninja', 'Traje ninja', 520, { rare: true }], ['shirt_astronaut', 'Traje de astronauta', 600, { rare: true }],
  ]),
  ...I('pants', [
    ['pants_jeans', 'Pantalón', 0], ['pants_shorts', 'Pantalón corto', 80], ['pants_sweat', 'Chándal', 120],
    ['pants_skirt', 'Falda', 140], ['pants_cargo', 'Pantalón cargo', 160], ['pants_ripped', 'Vaqueros rotos', 180],
    ['pants_camo', 'Pantalón camuflaje', 200], ['pants_plaid', 'Falda escocesa', 220], ['pants_galaxy', 'Pantalón galaxia', 400, { rare: true }],
    ['pants_armor', 'Grebas de caballero', 500, { rare: true }],
  ]),
  ...I('face', [
    ['face_smile', 'Sonrisa', 0], ['face_happy', 'Feliz', 0], ['face_surprised', 'Sorpresa', 100],
    ['face_cool', 'Guay', 120], ['face_wink', 'Guiño', 120], ['face_freckles', 'Pecas', 120],
    ['face_angry', 'Enfadado', 150], ['face_sleepy', 'Dormilón', 150], ['face_shy', 'Tímido', 160],
    ['face_tongue', 'Lengua fuera', 180], ['face_nerd', 'Empollón', 200], ['face_determined', 'Decidido', 200],
    ['face_cat', 'Gatito', 250], ['face_lol', 'Llorar de risa', 250], ['face_evil', 'Sonrisa malvada', 280],
    ['face_stars', 'Ojos de estrella', 300], ['face_hearts', 'Enamorado', 300], ['face_robot', 'Robot', 350, { rare: true }],
  ]),
  ...I('accessory', [
    ['acc_cap', 'Gorra', 0], ['acc_glasses', 'Gafas', 0], ['acc_bow', 'Lazo', 120], ['acc_scarf', 'Bufanda', 140],
    ['acc_beanie', 'Gorro de lana', 150], ['acc_partyhat', 'Gorro de fiesta', 160], ['acc_sunglasses', 'Gafas de sol', 180],
    ['acc_backpack', 'Mochila', 200], ['acc_antenna', 'Antenas', 200], ['acc_cateears', 'Orejas de gato', 220],
    ['acc_bunnyears', 'Orejas de conejo', 220], ['acc_chef', 'Gorro de chef', 220], ['acc_headphones', 'Auriculares', 240],
    ['acc_cowboy', 'Sombrero vaquero', 260], ['acc_flowercrown', 'Corona de flores', 260], ['acc_tophat', 'Sombrero de copa', 300],
    ['acc_ninjamask', 'Máscara ninja', 300], ['acc_witch', 'Sombrero de bruja', 340], ['acc_horns', 'Cuernos', 380],
    ['acc_viking', 'Casco vikingo', 420], ['acc_cape', 'Capa', 500], ['acc_guitar', 'Guitarra a la espalda', 550],
    ['acc_sword', 'Espada a la espalda', 600], ['acc_halo', 'Halo', 700, { rare: true }], ['acc_pet', 'Mascota flotante', 800, { rare: true }],
    ['acc_crown', 'Corona', 900, { rare: true }], ['acc_batwings', 'Alas de murciélago', 1000, { rare: true }],
    ['acc_wings', 'Alas de ángel', 1200, { rare: true }], ['acc_jetpack', 'Mochila cohete', 1500, { rare: true }],
  ]),
  ...I('emote', [
    ['emote_wave', 'Saludar', 0], ['emote_dance', 'Bailar', 0], ['emote_cheer', 'Celebrar', 0],
    ['emote_spin', 'Giro', 160], ['emote_robot', 'Baile robot', 300], ['emote_flip', 'Voltereta', 450],
  ]),
  ...I('effect', [
    ['fx_sparkles', 'Destellos', 360], ['fx_hearts', 'Corazones', 450], ['fx_snow', 'Copos de nieve', 500],
    ['fx_fire', 'Aura de fuego', 600], ['fx_lightning', 'Chispas eléctricas', 750, { rare: true }], ['fx_rainbow', 'Estela arcoíris', 900, { rare: true }],
  ]),
  ...I('decoration', [
    ['deco_statue', 'Estatua (editor)', 240], ['deco_fountain', 'Fuente (editor)', 320],
  ]),
];

export const SHOP_BY_ID = Object.fromEntries(SHOP_ITEMS.map((i) => [i.id, i]));
export const FREE_ITEMS = SHOP_ITEMS.filter((i) => i.price === 0).map((i) => i.id);

export const ACHIEVEMENTS = [
  { id: 'first_steps', name: 'Primeros pasos', desc: 'Entra en tu primera experiencia', reward: 20 },
  { id: 'explorer', name: 'Explorador', desc: 'Visita las 5 experiencias oficiales', reward: 100 },
  { id: 'gem_hunter', name: 'Cazagemas', desc: 'Encuentra las 12 gemas de Isla Metrópolis', reward: 150 },
  { id: 'treasure', name: 'Buscatesoros', desc: 'Abre 5 cofres', reward: 50 },
  { id: 'summit', name: 'Cumbre', desc: 'Llega a la cima de la montaña', reward: 60 },
  { id: 'pilot', name: 'Piloto', desc: 'Vuela la avioneta', reward: 40 },
  { id: 'obby_clear', name: 'Sin miedo a la lava', desc: 'Completa Obby del Cielo', reward: 80 },
  { id: 'obby_fast', name: 'Velocista', desc: 'Completa Obby del Cielo en menos de 3 minutos', reward: 150 },
  { id: 'racer', name: 'Corredor', desc: 'Termina una carrera', reward: 40 },
  { id: 'champion', name: 'Campeón', desc: 'Gana una carrera contra otros jugadores', reward: 120 },
  { id: 'survivor', name: 'Superviviente', desc: 'Sobrevive a una noche', reward: 80 },
  { id: 'builder', name: 'Constructor', desc: 'Publica tu primer mundo', reward: 100 },
  { id: 'social', name: 'Sociable', desc: 'Ten tu primer amigo', reward: 40 },
  { id: 'dancer', name: 'Bailarín', desc: 'Baila en la pista de La Plaza', reward: 30 },
  { id: 'shopper', name: 'De compras', desc: 'Compra un objeto en la tienda', reward: 20 },
  { id: 'level5', name: 'Nivel 5', desc: 'Alcanza el nivel 5', reward: 100 },
  { id: 'friendly', name: 'Amigable', desc: 'Habla con 5 personajes distintos', reward: 40 },
  { id: 'summit_up', name: 'Sin mirar abajo', desc: 'Llega a la cima de Solo Arriba', reward: 200 },
  { id: 'keys_clear', name: 'Mecanógrafo', desc: 'Completa Teclas ASMR', reward: 80 },
  { id: 'escape', name: 'Escapista', desc: 'Escapa del laberinto de Laberinto Sombrío', reward: 120 },
  { id: 'royale_win', name: 'Última persona en pie', desc: 'Gana una partida de Isla Royale', reward: 150 },
  { id: 'goal', name: '¡Golazo!', desc: 'Marca un gol en Turbo Gol', reward: 40 },
  { id: 'nightmare', name: 'Silencio absoluto', desc: 'Escapa de la casa de Silencio Mortal', reward: 150 },
  { id: 'disaster', name: 'Superviviente nato', desc: 'Sobrevive a un desastre en Desastres Naturales', reward: 40 },
  { id: 'farmer', name: 'Granjero', desc: 'Vende tu primera cosecha en Mi Huerto', reward: 30 },
  { id: 'golden', name: 'Toque de oro', desc: 'Cosecha una fruta dorada o arcoíris', reward: 80 },
  { id: 'blocks_win', name: 'Pies rápidos', desc: 'Gana una partida de Bloques Locos', reward: 80 },
  { id: 'asalto_win', name: 'Hogar, dulce hogar', desc: 'Sobrevive a las 3 noches de Asalto a la Casa', reward: 150 },
  { id: 'heist', name: 'Golpe maestro', desc: 'Completa un atraco en Castores al Ataque', reward: 100 },
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

export const LEVEL_REWARD_COINS = (level) => 10 + level * 5;
