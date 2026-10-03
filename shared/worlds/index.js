// Registro de mundos oficiales. Se generan una vez y se cachean.
import { buildCity } from './city.js';
import { buildObby } from './obby.js';
import { buildRacing } from './racing.js';
import { buildSurvival } from './survival.js';
import { buildHangout } from './hangout.js';
import { buildOnlyUp } from './onlyup.js';
import { buildKeys } from './keys.js';
import { buildHorror } from './horror.js';
import { buildRoyale } from './royale.js';
import { buildRocket } from './rocket.js';
import { buildCastores } from './castores.js';

const builders = {
  city: buildCity, obby: buildObby, racing: buildRacing, survival: buildSurvival, hangout: buildHangout,
  onlyup: buildOnlyUp, keys: buildKeys, horror: buildHorror, royale: buildRoyale, rocket: buildRocket, castores: buildCastores,
};
const cache = new Map();

export function getBuiltinWorld(id) {
  if (!builders[id]) return null;
  if (!cache.has(id)) cache.set(id, builders[id]());
  return cache.get(id);
}

export function isBuiltin(id) {
  return !!builders[id];
}
