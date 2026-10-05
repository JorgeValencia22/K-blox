import { CityMode } from './CityMode.js';
import { ObbyMode } from './ObbyMode.js';
import { RacingMode } from './RacingMode.js';
import { SurvivalMode } from './SurvivalMode.js';
import { HangoutMode } from './HangoutMode.js';
import { CustomMode } from './CustomMode.js';
import { KeysMode, OnlyUpMode } from './SimpleModes.js';
import { HorrorMode } from './HorrorMode.js';
import { RoyaleMode } from './RoyaleMode.js';
import { RocketMode } from './RocketMode.js';
import { CastoresMode } from './CastoresMode.js';
import { PesadillaMode, DesastresMode, HuertoMode, BloquesMode } from './NewModes.js';
import { AsaltoMode } from './AsaltoMode.js';

const MODES = {
  city: CityMode, obby: ObbyMode, racing: RacingMode, survival: SurvivalMode, hangout: HangoutMode, custom: CustomMode,
  keys: KeysMode, onlyup: OnlyUpMode, horror: HorrorMode, royale: RoyaleMode, rocket: RocketMode, castores: CastoresMode,
  asalto: AsaltoMode, pesadilla: PesadillaMode, desastres: DesastresMode, huerto: HuertoMode, bloques: BloquesMode,
};

export function createMode(name, room) {
  const M = MODES[name] || CustomMode;
  return new M(room);
}
