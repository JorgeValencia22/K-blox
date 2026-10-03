// Audio sintetizado con Web Audio (sin archivos externos: todos los sonidos son
// originales y se generan en tiempo real). Buses independientes para música,
// efectos y ambiente; sonidos posicionales atenuados por distancia.
import { settings } from '../core/settings.js';

const PENTA = [0, 2, 4, 7, 9];
const CHORDS = [[0, 4, 7], [5, 9, 12], [7, 11, 14], [9, 12, 16], [2, 5, 9], [4, 7, 11]];

class AudioEngine {
  constructor() {
    this.ctx = null;
    this.listener = { x: 0, y: 0, z: 0, yaw: 0 };
    this.engines = new Map();
    this.musicOn = false;
    this.ambientMode = null;
  }

  /** Debe llamarse tras un gesto del usuario (política de autoplay). */
  unlock() {
    if (this.ctx) {
      if (this.ctx.state === 'suspended') this.ctx.resume();
      return;
    }
    const AC = window.AudioContext || window.webkitAudioContext;
    if (!AC) return;
    this.ctx = new AC();
    const c = this.ctx;
    this.master = c.createGain();
    this.master.connect(c.destination);
    this.buses = {};
    for (const k of ['music', 'sfx', 'ambient']) {
      const g = c.createGain();
      g.gain.value = settings.get(k);
      g.connect(this.master);
      this.buses[k] = g;
    }
    // Ruido blanco reutilizable
    const len = c.sampleRate * 2;
    this.noise = c.createBuffer(1, len, c.sampleRate);
    const d = this.noise.getChannelData(0);
    for (let i = 0; i < len; i++) d[i] = Math.random() * 2 - 1;
    settings.on('change', ({ key, value }) => {
      if (this.buses[key]) this.buses[key].gain.setTargetAtTime(value, c.currentTime, 0.05);
    });
    if (this.wantMusic) this.startMusic();
    if (this.wantAmbient) this.setAmbient(this.wantAmbient);
  }

  get ready() {
    return !!this.ctx && this.ctx.state === 'running';
  }

  // --- Primitivas ------------------------------------------------------------
  tone({ freq = 440, type = 'sine', dur = 0.15, vol = 0.3, attack = 0.005, slide = 0, bus = 'sfx', when = 0, pan = 0, filter = 0 }) {
    if (!this.ready) return;
    const c = this.ctx;
    const t = c.currentTime + when;
    const o = c.createOscillator();
    const g = c.createGain();
    o.type = type;
    o.frequency.setValueAtTime(freq, t);
    if (slide) o.frequency.exponentialRampToValueAtTime(Math.max(20, freq + slide), t + dur);
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(vol, t + attack);
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    let node = o;
    if (filter) {
      const f = c.createBiquadFilter();
      f.type = 'lowpass';
      f.frequency.value = filter;
      o.connect(f);
      node = f;
    }
    node.connect(g);
    const out = this.panner(pan, bus);
    g.connect(out);
    o.start(t);
    o.stop(t + dur + 0.05);
  }

  noiseBurst({ dur = 0.08, vol = 0.2, freq = 1200, q = 1, type = 'bandpass', bus = 'sfx', pan = 0, when = 0 }) {
    if (!this.ready) return;
    const c = this.ctx;
    const t = c.currentTime + when;
    const s = c.createBufferSource();
    s.buffer = this.noise;
    const f = c.createBiquadFilter();
    f.type = type;
    f.frequency.value = freq;
    f.Q.value = q;
    const g = c.createGain();
    g.gain.setValueAtTime(vol, t);
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    s.connect(f).connect(g).connect(this.panner(pan, bus));
    s.start(t, Math.random() * 1.5, dur + 0.05);
  }

  panner(pan, bus) {
    if (!pan || !this.ctx.createStereoPanner) return this.buses[bus];
    const p = this.ctx.createStereoPanner();
    p.pan.value = Math.max(-1, Math.min(1, pan));
    p.connect(this.buses[bus]);
    return p;
  }

  /** Volumen y paneo para un sonido en una posición del mundo. */
  spatial(pos, maxDist = 40) {
    const l = this.listener;
    const dx = pos.x - l.x, dz = pos.z - l.z, dy = pos.y - l.y;
    const d = Math.hypot(dx, dy, dz);
    if (d > maxDist) return null;
    const vol = Math.pow(1 - d / maxDist, 1.6);
    const ang = Math.atan2(dx, dz) - l.yaw;
    return { vol, pan: -Math.sin(ang) * 0.8 };
  }

  setListener(x, y, z, yaw) {
    Object.assign(this.listener, { x, y, z, yaw });
  }

  // --- Efectos de juego ------------------------------------------------------
  ui(kind) {
    if (!settings.get('uiSounds')) return;
    if (kind === 'hover') this.tone({ freq: 880, dur: 0.04, vol: 0.03, type: 'triangle' });
    else if (kind === 'click') this.tone({ freq: 520, dur: 0.07, vol: 0.12, type: 'triangle', slide: 200 });
    else if (kind === 'open') this.tone({ freq: 400, dur: 0.15, vol: 0.1, type: 'sine', slide: 300 });
    else if (kind === 'error') { this.tone({ freq: 220, dur: 0.12, vol: 0.15, type: 'square', filter: 900 }); this.tone({ freq: 180, dur: 0.15, vol: 0.15, type: 'square', filter: 900, when: 0.1 }); }
    else if (kind === 'notify') { this.tone({ freq: 784, dur: 0.12, vol: 0.12 }); this.tone({ freq: 1046, dur: 0.18, vol: 0.12, when: 0.1 }); }
  }

  play(name, pos = null, opts = {}) {
    if (!this.ready) return;
    let vol = 1, pan = 0;
    if (pos) {
      const s = this.spatial(pos, opts.maxDist || 40);
      if (!s) return;
      vol = s.vol;
      pan = s.pan;
    }
    const r = () => 0.9 + Math.random() * 0.2; // variación para evitar repetición
    switch (name) {
      case 'step': {
        const surf = opts.surface || 'grass';
        const f = { grass: 700, stone: 1600, wood: 1000, sand: 500, metal: 2600, water: 900 }[surf] || 900;
        this.noiseBurst({ dur: 0.06, vol: 0.12 * vol * r(), freq: f * r(), q: surf === 'metal' ? 6 : 1.4, pan });
        break;
      }
      case 'jump': this.tone({ freq: 300 * r(), slide: 260, dur: 0.14, vol: 0.12 * vol, type: 'triangle', pan }); break;
      case 'land': this.noiseBurst({ dur: 0.12, vol: 0.25 * vol, freq: 300, q: 0.8, type: 'lowpass', pan }); break;
      case 'coin': this.tone({ freq: 988, dur: 0.08, vol: 0.15 * vol, type: 'square', filter: 3000, pan }); this.tone({ freq: 1319, dur: 0.22, vol: 0.15 * vol, type: 'square', filter: 3000, when: 0.07, pan }); break;
      case 'gem': [0, 4, 7, 12].forEach((n, i) => this.tone({ freq: 660 * 2 ** (n / 12), dur: 0.25, vol: 0.12 * vol, type: 'sine', when: i * 0.06, pan })); break;
      case 'chest': this.noiseBurst({ dur: 0.25, vol: 0.2 * vol, freq: 400, q: 2, pan }); [0, 4, 7].forEach((n, i) => this.tone({ freq: 523 * 2 ** (n / 12), dur: 0.3, vol: 0.12 * vol, type: 'triangle', when: 0.15 + i * 0.08, pan })); break;
      case 'door': this.noiseBurst({ dur: 0.35, vol: 0.18 * vol, freq: 250 * r(), q: 3, pan }); this.tone({ freq: 140, slide: -40, dur: 0.3, vol: 0.06 * vol, type: 'sawtooth', filter: 600, pan }); break;
      case 'switch': this.tone({ freq: 1200, dur: 0.03, vol: 0.2 * vol, type: 'square', filter: 2500, pan }); this.tone({ freq: 800, dur: 0.04, vol: 0.15 * vol, type: 'square', filter: 2500, when: 0.05, pan }); break;
      case 'checkpoint': [0, 7, 12].forEach((n, i) => this.tone({ freq: 523 * 2 ** (n / 12), dur: 0.22, vol: 0.14, type: 'triangle', when: i * 0.08 })); break;
      case 'win': [0, 4, 7, 12, 16].forEach((n, i) => this.tone({ freq: 523 * 2 ** (n / 12), dur: 0.35, vol: 0.14, type: 'triangle', when: i * 0.1 })); break;
      case 'levelup': [0, 4, 7, 12, 7, 12, 16, 19].forEach((n, i) => this.tone({ freq: 440 * 2 ** (n / 12), dur: 0.2, vol: 0.12, type: 'square', filter: 2500, when: i * 0.07 })); break;
      case 'death': this.tone({ freq: 400, slide: -320, dur: 0.6, vol: 0.18, type: 'sawtooth', filter: 1200 }); break;
      case 'bounce': this.tone({ freq: 200, slide: 600, dur: 0.25, vol: 0.18 * vol, type: 'sine', pan }); break;
      case 'hit': this.noiseBurst({ dur: 0.1, vol: 0.3 * vol, freq: 900, q: 2, pan }); this.tone({ freq: 160, slide: -60, dur: 0.12, vol: 0.2 * vol, type: 'square', filter: 800, pan }); break;
      case 'chop': this.noiseBurst({ dur: 0.09, vol: 0.3 * vol, freq: 700 * r(), q: 4, pan }); break;
      case 'build': this.noiseBurst({ dur: 0.12, vol: 0.25 * vol, freq: 500, q: 1.5, pan }); this.tone({ freq: 220, dur: 0.1, vol: 0.1 * vol, type: 'triangle', pan }); break;
      case 'splash': this.noiseBurst({ dur: 0.4, vol: 0.25 * vol, freq: 1500, q: 0.6, type: 'lowpass', pan }); break;
      case 'countdown': this.tone({ freq: opts.go ? 1046 : 523, dur: opts.go ? 0.5 : 0.18, vol: 0.18, type: 'square', filter: 2500 }); break;
      case 'chat': this.tone({ freq: 1400, dur: 0.05, vol: 0.05, type: 'sine' }); break;
      case 'hurt': this.tone({ freq: 200, slide: -100, dur: 0.15, vol: 0.2, type: 'sawtooth', filter: 900 }); break;
      default: break;
    }
  }

  // --- Motores de vehículos (sonido continuo) ---------------------------------
  engine(id, type, pos, speed, active) {
    if (!this.ready) return;
    let e = this.engines.get(id);
    if (!active) {
      if (e) {
        e.g.gain.setTargetAtTime(0, this.ctx.currentTime, 0.1);
        setTimeout(() => { try { e.o.stop(); e.o2.stop(); } catch { /* ya parado */ } }, 400);
        this.engines.delete(id);
      }
      return;
    }
    const c = this.ctx;
    if (!e) {
      const o = c.createOscillator(), o2 = c.createOscillator();
      o.type = type === 'plane' ? 'sawtooth' : 'square';
      o2.type = 'sawtooth';
      const f = c.createBiquadFilter();
      f.type = 'lowpass';
      f.frequency.value = type === 'plane' ? 900 : 600;
      const g = c.createGain();
      g.gain.value = 0;
      const p = c.createStereoPanner ? c.createStereoPanner() : null;
      o.connect(f); o2.connect(f); f.connect(g);
      if (p) { g.connect(p); p.connect(this.buses.sfx); } else g.connect(this.buses.sfx);
      o.start(); o2.start();
      e = { o, o2, g, p, f };
      this.engines.set(id, e);
    }
    const s = pos ? this.spatial(pos, 60) : { vol: 1, pan: 0 };
    const base = type === 'plane' ? 70 : type === 'kart' ? 90 : 55;
    const freq = base + Math.abs(speed) * (type === 'plane' ? 2.2 : 3.2);
    e.o.frequency.setTargetAtTime(freq, c.currentTime, 0.05);
    e.o2.frequency.setTargetAtTime(freq * 1.51, c.currentTime, 0.05);
    e.g.gain.setTargetAtTime(s ? 0.05 * s.vol + Math.min(0.03, Math.abs(speed) / 1000) * (s ? s.vol : 0) : 0, c.currentTime, 0.08);
    if (e.p && s) e.p.pan.setTargetAtTime(s.pan, c.currentTime, 0.05);
  }

  stopEngines() {
    for (const id of [...this.engines.keys()]) this.engine(id, null, null, 0, false);
  }

  // --- Música generativa ------------------------------------------------------
  startMusic() {
    this.wantMusic = true;
    if (!this.ready || this.musicOn) return;
    this.musicOn = true;
    let bar = 0;
    let chordIdx = 0;
    const root = 220 * 2 ** (Math.floor(Math.random() * 5) / 12);
    const step = () => {
      if (!this.musicOn) return;
      // Progresión que varía para no repetirse en exceso
      chordIdx = (chordIdx + 1 + Math.floor(Math.random() * 3)) % CHORDS.length;
      const chord = CHORDS[chordIdx];
      chord.forEach((n) => this.tone({ freq: root * 2 ** (n / 12), dur: 3.6, vol: 0.035, attack: 0.8, type: 'sine', bus: 'music' }));
      this.tone({ freq: (root / 2) * 2 ** (chord[0] / 12), dur: 3.4, vol: 0.05, attack: 0.3, type: 'triangle', bus: 'music' });
      const notes = 4 + Math.floor(Math.random() * 4);
      for (let i = 0; i < notes; i++) {
        if (Math.random() < 0.25) continue;
        const n = PENTA[Math.floor(Math.random() * PENTA.length)] + 12 * (1 + Math.floor(Math.random() * 2));
        this.tone({ freq: root * 2 ** (n / 12), dur: 0.5, vol: 0.03, type: 'triangle', bus: 'music', when: i * (3.6 / notes) });
      }
      bar++;
      this.musicTimer = setTimeout(step, 3600);
    };
    step();
  }

  stopMusic() {
    this.wantMusic = false;
    this.musicOn = false;
    clearTimeout(this.musicTimer);
  }

  // --- Ambiente: viento, pájaros, grillos -------------------------------------
  setAmbient(mode) {
    this.wantAmbient = mode;
    if (!this.ready) return;
    this.ambientMode = mode;
    clearTimeout(this.ambTimer);
    if (!this.wind) {
      const c = this.ctx;
      const s = c.createBufferSource();
      s.buffer = this.noise;
      s.loop = true;
      const f = c.createBiquadFilter();
      f.type = 'lowpass';
      f.frequency.value = 400;
      const g = c.createGain();
      g.gain.value = 0;
      s.connect(f).connect(g).connect(this.buses.ambient);
      s.start();
      this.wind = { s, f, g };
    }
    const target = mode ? 0.06 : 0;
    this.wind.g.gain.setTargetAtTime(target, this.ctx.currentTime, 1);
    const loop = () => {
      if (!this.ambientMode) return;
      const night = this.ambientMode === 'night';
      if (night) {
        for (let i = 0; i < 3; i++) this.tone({ freq: 4200 + Math.random() * 300, dur: 0.04, vol: 0.02, type: 'sine', bus: 'ambient', when: i * 0.08, pan: Math.random() * 2 - 1 });
      } else if (Math.random() < 0.7) {
        const base = 1800 + Math.random() * 1500;
        const n = 2 + Math.floor(Math.random() * 4);
        const pan = Math.random() * 2 - 1;
        for (let i = 0; i < n; i++) this.tone({ freq: base * (0.9 + Math.random() * 0.3), slide: 400, dur: 0.09, vol: 0.025, type: 'sine', bus: 'ambient', when: i * 0.12, pan });
      }
      this.wind.f.frequency.setTargetAtTime(300 + Math.random() * 400, this.ctx.currentTime, 2);
      this.ambTimer = setTimeout(loop, (night ? 900 : 2500) + Math.random() * 3000);
    };
    if (mode) loop();
  }
}

export const audio = new AudioEngine();
