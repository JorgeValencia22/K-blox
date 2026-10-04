// Configuración del jugador (gráficos, controles, audio) guardada en el navegador.
import { Emitter } from './events.js';

const KEY = 'kest.settings';

export const PRESETS = {
  low: { resolution: 0.6, shadows: 'off', drawDistance: 160, effects: false, terrainDetail: 4, pointLights: 0 },
  medium: { resolution: 0.8, shadows: 'low', drawDistance: 240, effects: true, terrainDetail: 2, pointLights: 2 },
  high: { resolution: 1, shadows: 'high', drawDistance: 420, effects: true, terrainDetail: 1, pointLights: 4 },
};

const DEFAULTS = {
  quality: 'medium',
  ...PRESETS.medium,
  sensitivity: 1,
  invertY: false,
  music: 0.4,
  sfx: 0.8,
  ambient: 0.6,
  uiSounds: true,
  dayNight: true,
  fog: true,
  showChat: true,
  showFps: false,
  autoRes: true,
};

function load() {
  try {
    return { ...DEFAULTS, ...JSON.parse(localStorage.getItem(KEY) || '{}') };
  } catch {
    return { ...DEFAULTS };
  }
}

class Settings extends Emitter {
  constructor() {
    super();
    this.values = load();
    // En equipos táctiles/modestos se parte de la calidad baja.
    let stored = null;
    try {
      stored = localStorage.getItem(KEY);
    } catch {
      /* sin almacenamiento */
    }
    if (!stored && (navigator.hardwareConcurrency <= 4 || matchMedia('(pointer: coarse)').matches)) {
      this.applyPreset('low', false);
    }
  }

  get(k) {
    return this.values[k];
  }

  set(k, v) {
    this.values[k] = v;
    if (['resolution', 'shadows', 'drawDistance', 'effects'].includes(k)) this.values.quality = 'custom';
    this.save();
    this.emit('change', { key: k, value: v });
  }

  applyPreset(name, save = true) {
    Object.assign(this.values, PRESETS[name], { quality: name });
    if (save) this.save();
    this.emit('change', { key: 'quality', value: name });
  }

  save() {
    try {
      localStorage.setItem(KEY, JSON.stringify(this.values));
    } catch {
      /* sin almacenamiento */
    }
  }
}

export const settings = new Settings();
