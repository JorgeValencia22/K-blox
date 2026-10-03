import { CityMode } from './CityMode.js';
import { ObbyMode } from './ObbyMode.js';
import { RacingMode } from './RacingMode.js';
import { SurvivalMode } from './SurvivalMode.js';
import { HangoutMode } from './HangoutMode.js';
import { CustomMode } from './CustomMode.js';

const MODES = { city: CityMode, obby: ObbyMode, racing: RacingMode, survival: SurvivalMode, hangout: HangoutMode, custom: CustomMode };

export function createMode(name, room) {
  const M = MODES[name] || CustomMode;
  return new M(room);
}
