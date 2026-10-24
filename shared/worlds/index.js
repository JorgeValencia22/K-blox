// Registro de mundos oficiales. Se generan una vez y se cachean.
import { buildCity } from './city.js';
import { buildObby } from './obby.js';
import { buildRacing, buildRacingTrack } from './racing.js';
import { buildSurvival } from './survival.js';
import { buildHangout } from './hangout.js';
import { buildOnlyUp } from './onlyup.js';
import { buildKeys } from './keys.js';
import { buildHorror } from './horror.js';
import { buildRoyale } from './royale.js';
import { buildRocket } from './rocket.js';
import { buildCastores } from './castores.js';
import { buildPesadilla } from './pesadilla.js';
import { buildDesastres } from './desastres.js';
import { buildHuerto } from './huerto.js';
import { buildBloques } from './bloques.js';
import { buildAsalto } from './asalto.js';
import { buildCamaleon } from './camaleon.js';
import { buildFnaf } from './fnaf.js';
import { buildPoppy } from './poppy.js';
import { buildGalaxia } from './galaxia.js';

const builders = {
  city: buildCity, obby: buildObby, racing: buildRacing, racing_monza: () => buildRacingTrack('monza'), racing_monaco: () => buildRacingTrack('monaco'), racing_silverstone: () => buildRacingTrack('silverstone'), survival: buildSurvival, hangout: buildHangout,
  onlyup: buildOnlyUp, keys: buildKeys, horror: buildHorror, royale: buildRoyale, rocket: buildRocket, castores: buildCastores,
  camaleon: buildCamaleon, asalto: buildAsalto, pesadilla: buildPesadilla, desastres: buildDesastres, huerto: buildHuerto, bloques: buildBloques, fnaf: buildFnaf, poppy: buildPoppy, galaxia: buildGalaxia,
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
