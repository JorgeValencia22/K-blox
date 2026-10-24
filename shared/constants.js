// Constantes compartidas entre cliente y servidor.
// El servidor usa estos valores para validar lo que envía el cliente,
// por lo que cualquier cambio afecta a ambos lados.

/** Poderes que un administrador puede dar a un jugador (duran hasta que sale de la partida). */
export const ADMIN_POWERS = {
  fly: { name: 'Volar', icon: '🕊️', hint: 'Espacio sube y C baja' },
  speed: { name: 'Supervelocidad', icon: '⚡', hint: 'Corres muchísimo más' },
  jump: { name: 'Supersalto', icon: '🦘', hint: 'Saltas altísimo' },
  ghost: { name: 'Atravesar paredes', icon: '👻', hint: 'Atraviesas todo. Espacio sube y C baja' },
  invisible: { name: 'Invisible', icon: '🫥', hint: 'Nadie te ve' },
  giant: { name: 'Gigante', icon: '🦖', hint: 'Eres enorme' },
  mini: { name: 'Mini', icon: '🐜', hint: 'Eres diminuto' },
};

export const PHYSICS = {
  gravity: -30,
  walkSpeed: 8,
  runSpeed: 14,
  accel: 60,
  airAccel: 18,
  decel: 50,
  jumpVelocity: 11.5,
  stepHeight: 0.55,
  radius: 0.4,
  height: 2.0,
  maxSlopeClimb: 1.2, // diferencia de altura por unidad que se puede subir caminando
  swimSpeed: 5,
};

export const VEHICLES = {
  car: { maxSpeed: 36, accel: 18, brake: 40, reverse: 10, steer: 1.6, radius: 1.3, seatHeight: 1.0 },
  kart: { maxSpeed: 30, accel: 22, brake: 45, reverse: 8, steer: 2.2, radius: 1.0, seatHeight: 0.6 },
  plane: { maxSpeed: 70, minFlySpeed: 22, accel: 14, radius: 2.2, seatHeight: 1.4 },
  f1: { maxSpeed: 50, accel: 30, brake: 60, reverse: 6, steer: 2.4, radius: 1.1, seatHeight: 0.5 },
};

export const NET = {
  clientSendRate: 15, // paquetes por segundo
  snapshotRate: 15,
  interpDelayMs: 120,
  maxRoomPlayersDefault: 20,
};

export const LIMITS = {
  usernameMin: 3,
  usernameMax: 20,
  passwordMin: 6,
  passwordMax: 72,
  chatMax: 200,
  worldMaxObjects: 2500,
  worldMaxBytes: 600_000,
  coverMaxBytes: 120_000,
  worldNameMax: 40,
  worldDescMax: 300,
};

export const CATEGORIES = [
  { id: 'adventure', name: 'Aventuras' },
  { id: 'racing', name: 'Carreras' },
  { id: 'simulator', name: 'Simuladores' },
  { id: 'obby', name: 'Obby' },
  { id: 'survival', name: 'Supervivencia' },
  { id: 'horror', name: 'Terror' },
  { id: 'roleplay', name: 'Roleplay' },
  { id: 'building', name: 'Construcción' },
  { id: 'battle', name: 'Batalla' },
  { id: 'sports', name: 'Deportes' },
  { id: 'party', name: 'Fiesta' },
];

export const MATERIALS = ['plastic', 'wood', 'metal', 'stone', 'grass', 'sand', 'glass', 'neon', 'ice', 'brick'];

export function clamp(v, a, b) {
  return v < a ? a : v > b ? b : v;
}
