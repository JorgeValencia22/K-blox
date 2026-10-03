// Registro de mundos oficiales. Se generan una vez y se cachean.
import { buildCity } from './city.js';
import { buildObby } from './obby.js';
import { buildRacing } from './racing.js';
import { buildSurvival } from './survival.js';
import { buildHangout } from './hangout.js';

const builders = { city: buildCity, obby: buildObby, racing: buildRacing, survival: buildSurvival, hangout: buildHangout };
const cache = new Map();

export function getBuiltinWorld(id) {
  if (!builders[id]) return null;
  if (!cache.has(id)) cache.set(id, builders[id]());
  return cache.get(id);
}

export function isBuiltin(id) {
  return !!builders[id];
}
