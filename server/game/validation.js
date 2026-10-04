// Validación de movimiento (antitrampas básico): velocidad máxima y límites.
import { PHYSICS, VEHICLES } from '../../shared/constants.js';
export { insideObject } from '../../shared/geometry.js';

export const ANIMS = new Set(['idle', 'walk', 'run', 'jump', 'fall', 'land', 'dance', 'robot', 'wave', 'cheer', 'spin', 'flip', 'sit', 'dead', 'swim', 'drive', 'fly', 'attack', 'crouch']);

export const isVec3 = (v) => Array.isArray(v) && v.length === 3 && v.every((n) => typeof n === 'number' && Number.isFinite(n));

/** Velocidad horizontal máxima permitida según el estado del jugador. */
export function maxHorizontalSpeed(vehicleType) {
  if (vehicleType && VEHICLES[vehicleType]) return VEHICLES[vehicleType].maxSpeed * 1.3;
  return PHYSICS.runSpeed * 1.45;
}

/**
 * Comprueba si el paso de `from` a `to` en `dtMs` es físicamente posible.
 * Usa una tolerancia fija para absorber la latencia y las plataformas móviles.
 */
export function plausibleMove(from, to, dtMs, vehicleType) {
  const dt = Math.min(Math.max(dtMs, 50), 1500) / 1000;
  const dist = Math.hypot(to[0] - from[0], to[2] - from[2]);
  const allowed = maxHorizontalSpeed(vehicleType) * dt + 2.5;
  return dist <= allowed;
}

export function inBounds(p, bounds) {
  if (!bounds) return true;
  return p[0] >= bounds.min[0] - 50 && p[0] <= bounds.max[0] + 50 && p[2] >= bounds.min[2] - 50 && p[2] <= bounds.max[2] + 50 && p[1] <= bounds.max[1] && p[1] >= bounds.min[1] - 60;
}


export const dist3 = (a, b) => Math.hypot(a[0] - b[0], a[1] - b[1], a[2] - b[2]);
