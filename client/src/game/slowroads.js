// Slow Roads (cliente): conducción infinita y relajada. La carretera se genera sola por delante y se
// borra por detrás (shared/slowroads/road.js), el coche usa la física compartida (shared/slowroads/car.js)
// y el paisaje, el ciclo de día y noche, el clima y el sonido están en esta carpeta. El servidor
// reparte la misma semilla a toda la sala, reenvía los coches de los demás y valida los kilómetros.
import * as THREE from 'three';
import { engine } from '../engine/renderer.js';
import { input } from '../engine/input.js';
import { audio } from '../audio/audio.js';
import { net } from '../core/net.js';
import { settings } from '../core/settings.js';
import { h, button } from '../ui/dom.js';
import { Road } from '../../../shared/slowroads/road.js';
import { Car, autopilot } from '../../../shared/slowroads/car.js';
import { SlowWorld } from './slowroads/world.js';
import { buildCar, PAINTS } from './slowroads/carModel.js';

const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
const load = (k, d) => { try { return localStorage.getItem('kest.sr.' + k) ?? d; } catch { return d; } };
const save = (k, v) => { try { localStorage.setItem('kest.sr.' + k, String(v)); } catch { /* sin almacenamiento */ } };
const TIMES = [['cycle', '🌗 Ciclo día y noche'], ['dawn', '🌅 Amanecer'], ['day', '☀️ Mediodía'], ['sunset', '🌇 Atardecer'], ['night', '🌙 Noche']];
const TIME_AT = { dawn: 0.27, day: 0.5, sunset: 0.72, night: 0.99 };
const WEATHERS = [['clear', '☀️ Despejado'], ['fog', '🌫️ Niebla'], ['rain', '🌧️ Lluvia']];
const CAMS = [['chase', 'Detrás'], ['far', 'Lejana'], ['hood', 'Capó'], ['cockpit', 'Interior']];
const CAMERAS = CAMS.map((c) => c[0]);

export class SlowRoadsClient {
  constructor(game, state) {
    this.game = game;
    this.frozen = true;
    this.blockEmotes = true;
    this.customAudio = true;
    this.hint = [];
    this.state = state || {};
    this.me = this.state.you;
    this.best = this.state.best || {};
    this.seed = Number.isFinite(this.state.seed) ? this.state.seed : (Math.random() * 2 ** 31) | 0;
    this.opt = {
      paint: Number(load('paint', 0)) % PAINTS.length, time: load('time', 'cycle'), weather: load('weather', 'clear'),
      cam: load('cam', 'chase'), units: load('units', 'kmh'), music: load('music', '1') === '1', lights: load('lights', 'auto'),
    };
    if (!CAMERAS.includes(this.opt.cam)) this.opt.cam = 'chase';
    this.cam = new THREE.PerspectiveCamera(66, innerWidth / innerHeight, 0.15, 1800);
    this.view = { scene: null, camera: this.cam, update: (dt) => this.game.update(dt), onResize: (w, hh) => { this.cam.aspect = w / hh; this.cam.updateProjectionMatrix(); } };
    this.prevView = null;
    this.over = false;
    this.phase = 'start';
    this.t = 0; this.sendT = 0; this.saveT = 0;
    this.allies = new Map();
    this.camYaw = 0; this.camOff = 0; this.camPitch = 0.1; this.lastLook = 0; this.orbit = 0; this.zoom = 0;
    this.camPos = new THREE.Vector3(); this.carPos = new THREE.Vector3(); this.camReady = false; this.shake = 0;
    this.auto = false; this.paused = false; this.musicT = 0; this.mi = 0; this.timeOfDay = 0.42;
    this.root = h('div.sr');
    document.body.appendChild(this.root);
    this.game.hud.el.style.visibility = 'hidden';
    this.netEvents = { 'sr:ally': (m) => this.onAlly(m), 'sr:gone': (m) => this.dropAlly(m.id) };
    this.build();
    this.showStart();
  }

  // ----------------------------------------------------------------------------------- escena
  build() {
    this.road = new Road(this.seed);
    this.car = new Car(this.road);
    this.world = new SlowWorld(this.road, { shadows: settings.get('shadows') !== 'off' });
    this.view.scene = this.world.scene;
    this.model = buildCar(PAINTS[this.opt.paint][1]);
    this.world.scene.add(this.model.root);
    this.applyOptions();
    this.world.streamChunks(this.car.s, 99);
    this.syncModel(0);
    this.startCamera(0);
    this.startS = this.car.s; this.dist = 0; this.maxKmh = 0; this.runMs = 0; this.driveMs0 = 0; this.sentDist = 0;
  }

  applyOptions() {
    const o = this.opt;
    this.world.setWeather(o.weather);
    if (o.time !== 'cycle') this.timeOfDay = TIME_AT[o.time];
    this.world.setTime(this.timeOfDay);
    this.model.setPaint(PAINTS[o.paint][1]);
  }

  setOpt(k, v) {
    this.opt[k] = v; save(k, k === 'music' ? (v ? '1' : '0') : v);
    if (k === 'cam') { this.camReady = false; this.camOff = 0; this.orbit = 0; }
    this.applyOptions();
  }

  // -------------------------------------------------------------------------------------- menú
  optionsEl() {
    const chips = (key, list) => h('div.sr-chips', ...list.map(([id, label]) => h('button.sr-chip' + (this.opt[key] === id ? '.on' : ''), { on: { click: (e) => { this.setOpt(key, id); [...e.currentTarget.parentNode.children].forEach((c) => c.classList.toggle('on', c === e.currentTarget)); } } }, label)));
    const paints = h('div.sr-paints', ...PAINTS.map(([n, hex], i) => {
      const b = h('button.sr-paint' + (this.opt.paint === i ? '.on' : ''), { title: n, on: { click: (e) => { this.setOpt('paint', i); [...e.currentTarget.parentNode.children].forEach((c) => c.classList.toggle('on', c === e.currentTarget)); } } });
      b.style.background = hex;
      return b;
    }));
    return h('div.sr-opts',
      h('label', 'Color del coche'), paints,
      h('label', 'Hora del día'), chips('time', TIMES),
      h('label', 'Clima'), chips('weather', WEATHERS),
      h('label', 'Cámara'), chips('cam', CAMS.map(([id, n]) => [id, n])),
      h('label', 'Faros'), chips('lights', [['auto', 'Automáticos'], ['on', 'Siempre'], ['off', 'Apagados']]),
      h('label', 'Velocidad en'), chips('units', [['kmh', 'km/h'], ['mph', 'mph']]),
      h('label', 'Música'), chips('music', [[true, '🎵 Sí'], [false, 'No']]),
      h('div.sr-sp'));
  }

  controlsEl() {
    return h('div.sr-controls', ...[['W / ↑', 'Acelerar'], ['S / ↓', 'Frenar y marcha atrás'], ['A D / ← →', 'Girar'], ['Espacio', 'Freno de mano'], ['C', 'Cambiar cámara'], ['L', 'Faros'], ['P', 'Piloto automático'], ['R', 'Volver a la carretera'], ['H', 'Claxon'], ['Ratón', 'Mover la cámara'], ['Esc', 'Pausa']]
      .map(([k, v]) => h('div.sr-ctl', h('kbd', k), h('span', v))));
  }

  showStart() {
    this.phase = 'start';
    if (input.locked) { this.game.ignoreUnlock = true; input.unlockPointer(); }
    const bestKm = (this.best.dist || 0) / 1000;
    this.root.replaceChildren(h('div.sr-start',
      h('div.sr-card',
        h('div.sr-logo', h('small', 'KESTWORLDS'), h('b', 'SLOW ROADS'), h('span', 'Conducción infinita')),
        h('p', 'Una carretera que nunca se acaba. Sin prisa, sin meta: solo tú, el coche y el paisaje. El camino se crea por delante mientras conduces y se borra por detrás.'),
        this.optionsEl(),
        this.controlsEl(),
        h('div.sr-row', button('▶ ¡A CONDUCIR!', () => this.begin(), 'primary sr-go'), button('← Salir', () => this.exit(), 'small')),
        bestKm ? h('div.sr-best', `Tu récord: ${bestKm.toFixed(1)} km en un viaje · ${((this.best.total || 0) / 1000).toFixed(1)} km en total`) : null)));
  }

  begin() {
    this.phase = 'drive';
    this.root.replaceChildren(this.hudEl());
    this.driveMs0 = performance.now();
    this.car.place(8, -1.8);
    this.startS = this.car.s; this.dist = 0; this.maxKmh = 0; this.sentDist = 0; this.runMs = 0;
    this.camReady = false;
    this.auto = false;
    input.lockPointer();
    net.request('mode', { name: 'start', data: {} }).catch(() => {});
    this.musicT = 0;
  }

  hudEl() {
    this.el = {
      speed: h('div.sr-speed', '0'), unit: h('small', ''), gear: h('div.sr-gear', 'N'), rpm: h('div.sr-rpmfill'),
      dist: h('div.sr-dist', '0,0 km'), clock: h('div.sr-clock', ''), info: h('div.sr-info'), lock: h('div.sr-lock.hidden', '🖱️ Haz clic para girar la cámara con el ratón'),
      pause: h('div.sr-pause.hidden'), flash: h('div.sr-flash'), tags: h('div.sr-tags'), toast: h('div.sr-toast'),
    };
    this.unitEl = this.el.unit;
    const touch = input.isTouch ? this.touchPad() : null;
    return h('div.sr-hud',
      h('div.sr-top', h('div.sr-topl', h('b', 'SLOW ROADS'), this.el.dist, this.el.clock), h('div.sr-topr', this.el.tags, button('☰', () => this.togglePause(), 'small'))),
      this.el.info, this.el.toast,
      h('div.sr-dash', h('div.sr-gauge', h('div.sr-speedwrap', this.el.speed, this.el.unit), h('div.sr-rpm', this.el.rpm), this.el.gear)),
      this.el.flash, this.el.pause, this.el.lock, touch);
  }

  touchPad() {
    const btn = (label, code, cls = '') => {
      const b = h('button.sr-tb' + cls, label);
      b.addEventListener('pointerdown', (e) => { e.preventDefault(); input.pressVirtual(code); });
      for (const ev of ['pointerup', 'pointercancel', 'pointerleave']) b.addEventListener(ev, () => input.releaseVirtual(code));
      return b;
    };
    return h('div.sr-touch', h('div.sr-tl', btn('◀', 'KeyA'), btn('▶', 'KeyD')), h('div.sr-tr', btn('FRENO', 'KeyS', '.brake'), btn('GAS', 'KeyW', '.gas'), btn('MANO', 'Space')), h('div.sr-tm', btn('📷', 'KeyC'), btn('💡', 'KeyL'), btn('🤖', 'KeyP')));
  }

  togglePause(force) {
    this.paused = force ?? !this.paused;
    const p = this.el.pause;
    p.classList.toggle('hidden', !this.paused);
    if (this.paused) {
      if (input.locked) { this.game.ignoreUnlock = true; input.unlockPointer(); }
      p.replaceChildren(h('div.sr-card', h('h3', 'Pausa'), this.optionsEl(), this.controlsEl(),
        h('div.sr-row', button('▶ Seguir conduciendo', () => { this.togglePause(false); input.lockPointer(); }, 'primary'),
          button('💾 Guardar y salir', () => this.exit()))));
    }
  }

  async exit() {
    await this.saveRun(true);
    this.game.exit('leave');
  }

  say(text, ms = 2200) {
    if (!this.el) return;
    const t = h('div.sr-msg', text);
    this.el.toast.replaceChildren(t);
    clearTimeout(this.sayT);
    this.sayT = setTimeout(() => t.remove(), ms);
  }

  // --------------------------------------------------------------------------------- bucle
  update(dt) {
    if (this.over) return;
    if (engine.view !== this.view) { this.prevView = this.prevView || engine.view; engine.view = this.view; engine.resize(); }
    this.t += dt;
    dt = Math.min(dt, 0.05);
    const driving = this.phase === 'drive' && !this.paused;
    if (this.phase === 'start') this.startCamera(dt);
    else {
      this.el.lock.classList.toggle('hidden', input.locked || input.isTouch || this.paused);
      if (driving) this.drive(dt);
      this.updateCamera(dt);
    }
    if (this.opt.time === 'cycle' && (driving || this.phase === 'start')) { this.timeOfDay = (this.timeOfDay + dt / 540) % 1; }
    this.timeT = (this.timeT || 0) + dt;
    if (this.timeT > 0.25) { this.timeT = 0; this.world.setTime(this.timeOfDay); }
    this.world.streamChunks(this.car.s, 2);
    this.syncModel(dt);
    this.carPos.set(this.car.x, this.car.y, this.car.z);
    this.world.update(dt, this.carPos);
    if (this.phase === 'drive') { this.updateHud(dt); this.updateAudio(dt); this.updateAllies(dt); }
    else if (this.phase === 'start') this.updateAllies(dt);
    // Guardado periódico
    this.saveT += dt;
    if (this.saveT > 25 && this.phase === 'drive') { this.saveT = 0; this.saveRun(false); }
  }

  readInput() {
    const down = (c) => input.down(c);
    const pr = (c) => input.pressed(c);
    let steer = (down('KeyD') || down('ArrowRight') ? 1 : 0) - (down('KeyA') || down('ArrowLeft') ? 1 : 0);
    steer += (input.joy?.x || 0) + (input.padMove?.x || 0);
    const fy = (input.joy?.y || 0) + (input.padMove?.y || 0);
    let thr = (down('KeyW') || down('ArrowUp') ? 1 : 0) + Math.max(0, fy);
    let brk = (down('KeyS') || down('ArrowDown') ? 1 : 0) + Math.max(0, -fy);
    return {
      steer: clamp(steer, -1, 1), throttle: clamp(thr, 0, 1), brake: clamp(brk, 0, 1), hand: down('Space'),
      camP: pr('KeyC'), lightP: pr('KeyL'), autoP: pr('KeyP'), resetP: pr('KeyR'), hornP: pr('KeyH'), pauseP: pr('Escape'),
    };
  }

  drive(dt) {
    const car = this.car;
    const ip = this.readInput();
    if (ip.pauseP) { this.togglePause(true); return; }
    if (ip.camP) { const i = (CAMERAS.indexOf(this.opt.cam) + 1) % CAMERAS.length; this.setOpt('cam', CAMERAS[i]); this.say(`Cámara: ${CAMS[i][1]}`, 1200); }
    if (ip.lightP) { const L = ['auto', 'on', 'off']; const n = L[(L.indexOf(this.opt.lights) + 1) % 3]; this.setOpt('lights', n); this.say(`Faros: ${{ auto: 'automáticos', on: 'encendidos', off: 'apagados' }[n]}`, 1400); }
    if (ip.autoP) { this.auto = !this.auto; this.say(this.auto ? '🤖 Piloto automático' : 'Control manual', 1600); }
    if (ip.hornP) this.horn();
    if (ip.resetP) { car.place(clamp(car.s, this.road.sMin + 40, car.s), -1.8); this.camReady = false; this.say('De vuelta a la carretera', 1400); }
    let inp = ip;
    if (this.auto) {
      if (Math.abs(ip.steer) > 0.3 || ip.brake > 0.2) { this.auto = false; this.say('Control manual', 1400); } else inp = { ...autopilot(car, this.road, 33), hand: false };
    }
    const ev = car.step(dt, inp);
    for (const e of ev) {
      if (e.k === 'land') { this.thump(clamp(e.impact / 7, 0.2, 1)); this.shake = Math.max(this.shake, clamp(e.impact / 12, 0, 0.8)); }
      if (e.k === 'reset') { this.camReady = false; this.say('De vuelta a la carretera', 1400); }
    }
    this.dist = Math.max(this.dist, car.s - this.startS);
    this.maxKmh = Math.max(this.maxKmh, car.kmh);
    this.runMs = performance.now() - this.driveMs0;
    this.sendT += dt;
    if (this.sendT >= 0.1) {
      this.sendT = 0;
      net.send('mode:fast', { name: 'st', data: { x: car.x, y: car.y, z: car.z, yaw: car.yaw, s: car.s, pitch: car.pitch, roll: car.roll } });
    }
  }

  syncModel(dt) {
    const c = this.car, mdl = this.model;
    const r = mdl.root;
    r.position.set(c.x, c.y, c.z);
    r.rotation.order = 'YXZ';
    r.rotation.set(-c.pitch, c.yaw, c.roll);
    mdl.car.position.y = c.sus;
    for (const w of mdl.wheels) {
      w.spin.rotation.x = c.wheelRot;
      if (w.front) w.steer.rotation.y = c.steer;
    }
    const night = this.world.night;
    const l = this.opt.lights;
    const on = l === 'on' || (l === 'auto' && (night > 0.35 || this.world.weather !== 'clear'));
    mdl.setLights(on, (c.brakeOn && c.u > 0.2) || c.brk > 0.4, c.reversing && c.u < -0.1, night);
    this.lightsOn = on;
  }

  // ------------------------------------------------------------------------------- cámara
  startCamera(dt) {
    // Cámara orbitando despacio alrededor del coche en la pantalla de inicio
    const c = this.car, a = this.t * 0.22 + 2.2;
    this.camPos.set(c.x + Math.sin(a) * 6.2, c.y + 1.8, c.z + Math.cos(a) * 6.2);
    this.cam.position.copy(this.camPos);
    this.cam.lookAt(c.x, c.y + 0.7, c.z);
    this.cam.fov = 48; this.cam.updateProjectionMatrix();
  }

  updateCamera(dt) {
    const car = this.car;
    const look = input.takeLook();
    const sens = 0.004 * (settings.get('sensitivity') || 1);
    if (look.dx || look.dy) this.lastLook = this.t;
    const mode = this.opt.cam;
    const inside = mode === 'hood' || mode === 'cockpit';
    if (look.dx) this.camOff = clamp(this.camOff - look.dx * sens, inside ? -1.9 : -3.1, inside ? 1.9 : 3.1);
    this.camPitch = clamp(this.camPitch + look.dy * sens * 0.8 * (settings.get('invertY') ? -1 : 1), -0.35, 1.2);
    if (look.wheel) this.zoom = clamp(this.zoom + look.wheel * 0.002, -3, 8);
    // El visor se recoloca detrás tras unos segundos sin tocar el ratón
    if (!look.dx && this.t - this.lastLook > 2.5) { this.camOff *= Math.exp(-dt * 1.4); this.camPitch += (0.1 - this.camPitch) * (1 - Math.exp(-dt * 1.2)); }
    let target = car.yaw;
    if (car.speed > 3 && !inside) target = Math.atan2(car.vx, car.vz);
    if (!this.camReady) { this.camYaw = target; }
    const dY = Math.atan2(Math.sin(target - this.camYaw), Math.cos(target - this.camYaw));
    this.camYaw += dY * (this.camReady ? 1 - Math.exp(-dt * (inside ? 12 : 3.2)) : 1);
    const yaw = this.camYaw + this.camOff;
    const kph = car.kmh;
    let pos, look3;
    if (inside) {
      const base = mode === 'cockpit' ? [-0.38, 1.0, 0.18] : [0, 1.18, 0.95];
      const sy = Math.sin(car.yaw), cy = Math.cos(car.yaw);
      const bx = car.x + sy * base[2] + cy * base[0], bz = car.z + cy * base[2] - sy * base[0];
      pos = new THREE.Vector3(bx, car.y + base[1] + car.sus, bz);
      const ly = car.yaw + this.camOff;
      look3 = new THREE.Vector3(pos.x + Math.sin(ly) * 10, pos.y - Math.sin(this.camPitch - 0.1) * 6 + Math.sin(car.pitch) * 6, pos.z + Math.cos(ly) * 10);
      this.camPos.copy(pos);
    } else {
      const far = mode === 'far';
      const dist = (far ? 11 : 6.2) + this.zoom + clamp(kph, 0, 200) * 0.012;
      const cp = Math.cos(this.camPitch);
      const hgt = (far ? 3.6 : 1.9) + dist * Math.sin(this.camPitch) * 0.9;
      const px = car.x - Math.sin(yaw) * dist * cp, pz = car.z - Math.cos(yaw) * dist * cp;
      let py = car.y + hgt;
      const gy = this.road.sample(px, pz, car.s, this.tmp || (this.tmp = {})).h;
      py = Math.max(py, gy + 0.8);
      if (!this.camReady) this.camPos.set(px, py, pz);
      const k = 1 - Math.exp(-dt * 9);
      this.camPos.x += (px - this.camPos.x) * k; this.camPos.z += (pz - this.camPos.z) * k;
      this.camPos.y += (py - this.camPos.y) * (1 - Math.exp(-dt * 5));
      pos = this.camPos.clone();
      look3 = new THREE.Vector3(car.x + Math.sin(yaw) * (far ? 6 : 4), car.y + (far ? 0.8 : 1.15), car.z + Math.cos(yaw) * (far ? 6 : 4));
    }
    this.shake = Math.max(0, this.shake - dt * 1.8);
    const jit = this.shake * 0.25 + clamp(kph - 120, 0, 150) * 0.0007 + (car.grip < 0.8 && car.speed > 6 ? 0.012 : 0);
    this.cam.position.set(pos.x + (Math.random() - 0.5) * jit, pos.y + (Math.random() - 0.5) * jit, pos.z + (Math.random() - 0.5) * jit);
    this.cam.lookAt(look3);
    if (inside) this.cam.rotateZ(car.roll * 0.4);
    const fov = (inside ? 76 : 62) + clamp(kph, 0, 220) * 0.075;
    if (Math.abs(this.cam.fov - fov) > 0.05) { this.cam.fov += (fov - this.cam.fov) * Math.min(1, dt * 3); this.cam.updateProjectionMatrix(); }
    this.camReady = true;
  }

  // ----------------------------------------------------------------------------------- HUD
  updateHud(dt) {
    const car = this.car, e = this.el;
    const mph = this.opt.units === 'mph';
    const v = Math.round(Math.abs(car.u) * 3.6 * (mph ? 0.621371 : 1));
    if (e.speed.textContent !== String(v)) e.speed.textContent = String(v);
    e.unit.textContent = mph ? 'mph' : 'km/h';
    e.gear.textContent = car.gear < 0 ? 'R' : Math.abs(car.u) < 0.4 && car.thr < 0.05 ? 'N' : String(car.gear);
    const rp = clamp((car.rpm - 900) / 6300, 0, 1);
    e.rpm.style.width = `${rp * 100}%`;
    e.rpm.style.background = rp > 0.9 ? '#ff5252' : rp > 0.75 ? '#ffb300' : '#ffffff';
    e.dist.textContent = `${(this.dist / 1000).toFixed(2).replace('.', ',')} km`;
    const hr = Math.floor(this.timeOfDay * 24), mn = Math.floor((this.timeOfDay * 24 - hr) * 60);
    e.clock.textContent = `${String(hr).padStart(2, '0')}:${String(mn).padStart(2, '0')} · ${{ clear: 'despejado', fog: 'niebla', rain: 'lluvia' }[this.opt.weather]}`;
    const tags = [];
    if (this.auto) tags.push('🤖 AUTO');
    if (this.lightsOn) tags.push('💡');
    if (!car.grounded && car.airT > 0.25) tags.push('✈ EN EL AIRE');
    if (car.grip < 0.8 && car.speed > 6) tags.push('🌿 FUERA DE LA CARRETERA');
    const key = tags.join('|');
    if (key !== this.tagKey) { this.tagKey = key; e.tags.replaceChildren(...tags.map((t) => h('span', t))); }
  }

  // ---------------------------------------------------------------------------------- sonido
  horn() {
    if (!audio.ready) return;
    audio.tone({ freq: 392, type: 'sawtooth', dur: 0.45, vol: 0.12, filter: 1400 });
    audio.tone({ freq: 494, type: 'sawtooth', dur: 0.45, vol: 0.1, filter: 1400 });
  }

  thump(v) {
    if (!audio.ready) return;
    audio.noiseBurst({ dur: 0.18, vol: 0.2 * v, freq: 500 });
    audio.tone({ freq: 70, type: 'sine', dur: 0.2, vol: 0.28 * v, slide: -30 });
  }

  updateAudio(dt) {
    if (!audio.ready) return;
    const c = this.car;
    const e1 = audio.loop('sr-eng', { type: 'sawtooth', freq: 50, vol: 0.0, filter: 700 });
    const e2 = audio.loop('sr-eng2', { type: 'square', freq: 100, vol: 0.0, filter: 600 });
    const tire = audio.loop('sr-tire', { noise: true, vol: 0, filter: 1800 });
    const wind = audio.loop('sr-wind', { noise: true, vol: 0, filter: 900 });
    const rain = audio.loop('sr-rain', { noise: true, vol: 0, filter: 6000 });
    const lowLoad = this.paused ? 0 : 1;
    const f = c.rpm / 30; // 4 cilindros: frecuencia de encendido
    const load = 0.45 + c.thr * 0.55;
    if (e1) { e1.src.frequency.setTargetAtTime(f * 0.5, audio.ctx.currentTime, 0.04); e1.f.frequency.value = 350 + c.rpm * 0.35; audio.setLoopVolume('sr-eng', 0.06 * load * lowLoad); }
    if (e2) { e2.src.frequency.setTargetAtTime(f, audio.ctx.currentTime, 0.04); e2.f.frequency.value = 500 + c.rpm * 0.5; audio.setLoopVolume('sr-eng2', 0.035 * load * lowLoad); }
    if (tire) { tire.f.frequency.value = 900 + c.speed * 30; audio.setLoopVolume('sr-tire', (c.grounded ? clamp(c.speed / 30, 0, 1) * (0.012 + c.slide * 0.1 + (c.grip < 0.8 ? 0.03 : 0)) : 0) * lowLoad); }
    if (wind) { wind.f.frequency.value = 400 + c.speed * 25; audio.setLoopVolume('sr-wind', clamp(c.speed / 60, 0, 1) * 0.08 * lowLoad); }
    if (rain) audio.setLoopVolume('sr-rain', this.world.rainAmt * 0.06 * lowLoad);
    // Música suave y generativa
    if (this.opt.music && !this.paused) {
      this.musicT -= dt;
      if (this.musicT <= 0) {
        const scale = [0, 2, 4, 7, 9, 12, 14, 16];
        const roots = [57, 53, 55, 52];
        const root = roots[Math.floor(this.mi / 6) % roots.length];
        const n = scale[(Math.random() * scale.length) | 0];
        audio.tone({ freq: 440 * 2 ** ((root + n - 69) / 12), type: 'sine', dur: 2.6, vol: 0.05, filter: 1800 });
        if (this.mi % 6 === 0) { audio.tone({ freq: 440 * 2 ** ((root - 12 - 69) / 12), type: 'triangle', dur: 5, vol: 0.06, filter: 500 }); audio.tone({ freq: 440 * 2 ** ((root + 7 - 69) / 12), type: 'sine', dur: 5, vol: 0.03, filter: 900 }); }
        this.mi++;
        this.musicT = 0.9 + Math.random() * 1.4;
      }
    }
  }

  // ------------------------------------------------------------------------ otros conductores
  onAlly(m) {
    if (!m || m.id === this.me) return;
    let a = this.allies.get(m.id);
    if (!a) {
      const mdl = buildCar(PAINTS[parseInt(String(m.id).slice(-3), 16) % PAINTS.length]?.[1] || '#1f4fd8');
      mdl.beams.forEach((b) => { b.visible = false; });
      this.world.scene.add(mdl.root);
      a = { mdl, x: m.x, y: m.y, z: m.z, yaw: m.yaw, pitch: 0, roll: 0, name: m.name, at: 0, tag: nameTag(m.name || 'Conductor') };
      a.tag.position.set(0, 2.1, 0);
      mdl.root.add(a.tag);
      this.allies.set(m.id, a);
    }
    Object.assign(a, { tx: m.x, ty: m.y, tz: m.z, tyaw: m.yaw, tpitch: m.pitch || 0, troll: m.roll || 0, name: m.name, at: performance.now() });
  }

  dropAlly(id) {
    const a = this.allies.get(id);
    if (!a) return;
    this.world.scene.remove(a.mdl.root);
    a.mdl.dispose();
    this.allies.delete(id);
  }

  updateAllies(dt) {
    const now = performance.now();
    for (const [id, a] of this.allies) {
      if (now - a.at > 4000) { this.dropAlly(id); continue; }
      if (a.tx === undefined) continue;
      const k = 1 - Math.exp(-dt * 10);
      const px = a.x, pz = a.z;
      a.x += (a.tx - a.x) * k; a.y += (a.ty - a.y) * k; a.z += (a.tz - a.z) * k;
      a.yaw += Math.atan2(Math.sin(a.tyaw - a.yaw), Math.cos(a.tyaw - a.yaw)) * k;
      a.pitch += (a.tpitch - a.pitch) * k; a.roll += (a.troll - a.roll) * k;
      const r = a.mdl.root;
      r.position.set(a.x, a.y, a.z); r.rotation.order = 'YXZ'; r.rotation.set(-a.pitch, a.yaw, a.roll);
      const spin = Math.hypot(a.x - px, a.z - pz) / Math.max(dt, 1e-3) / 0.33 * dt;
      a.mdl.wheels.forEach((w) => { w.spin.rotation.x += spin; });
    }
  }

  // ---------------------------------------------------------------------------------- guardar
  async saveRun(final) {
    const dist = Math.floor(this.dist);
    if (this.phase !== 'drive' && !final) return;
    if (dist < 150 || dist <= this.sentDist) return;
    const r = await net.request('mode', { name: 'save', data: { dist, ms: Math.round(this.runMs), top: Math.round(this.maxKmh) } }).catch(() => null);
    if (r?.ok) {
      this.sentDist = dist;
      this.best = r.best || this.best;
      if (r.xp > 0) this.say(`+${r.xp} XP · ${(dist / 1000).toFixed(1)} km`, 2400);
    }
  }

  dispose() {
    this.over = true;
    clearTimeout(this.sayT);
    audio.stopLoops();
    for (const id of [...this.allies.keys()]) this.dropAlly(id);
    this.model?.dispose();
    this.world?.dispose();
    this.root.remove();
    this.game.hud.el.style.visibility = '';
    if (engine.view === this.view) { engine.view = this.prevView || this.game; engine.resize(); }
  }
}

function nameTag(text) {
  const c = document.createElement('canvas');
  c.width = 256; c.height = 64;
  const g = c.getContext('2d');
  g.font = '900 32px sans-serif'; g.textAlign = 'center'; g.lineWidth = 7; g.strokeStyle = '#000';
  g.strokeText(text, 128, 44); g.fillStyle = '#fff'; g.fillText(text, 128, 44);
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  const sp = new THREE.Sprite(new THREE.SpriteMaterial({ map: t, transparent: true, depthTest: false }));
  sp.scale.set(2.8, 0.7, 1);
  sp.renderOrder = 10;
  return sp;
}
