// Modos de juego del cliente (tercera tanda): Pesadilla, Desastres, Huerto y Bloques Locos.
import * as THREE from 'three';
import { net } from '../core/net.js';
import { input } from '../engine/input.js';
import { audio } from '../audio/audio.js';
import { MicMeter } from '../audio/mic.js';
import { store } from '../core/store.js';
import { h, toast, clear, modal, button } from '../ui/dom.js';
import { setGroupState } from '../world/worldBuilder.js';
import { DISASTERS, riseLevel, impacts, tornadoAt } from '../../../shared/worlds/desastres.js';
import { SEEDS, SEED_IDS, MUTATIONS, HUERTO, tilePos, plotCenter, SHOP_POS } from '../../../shared/worlds/huerto.js';
import { TILE_COLORS, BLOQUES, tileCenter } from '../../../shared/worlds/bloques.js';

class Base {
  constructor(game, state) {
    this.game = game;
    this.hud = game.hud;
    this.state = state || {};
    this.netEvents = {};
    this.hint = [];
  }

  update() {}
  dispose() {}

  async send(name, data = {}) {
    const r = await net.request('mode', { name, data });
    if (r.error && r.error !== 'Demasiado rápido') {
      toast(r.error, 'warn');
      audio.ui('error');
    }
    return r;
  }
}

const secs = (ms) => Math.max(0, Math.ceil(ms / 1000));
const bar = (color) => {
  const fill = h('div', { style: { width: '100%', height: '100%', background: color, borderRadius: '6px', transition: 'width .15s' } });
  return { el: h('div.bar', { style: { width: '170px', height: '8px', marginTop: '6px' } }, fill), fill };
};

// =====================================================================================
// Kest Pesadilla (primera persona + micrófono)
// =====================================================================================
export class PesadillaClient extends Base {
  constructor(game, state) {
    super(game, state);
    this.firstPerson = true;
    this.customAudio = true;
    this.blockEmotes = true;
    this.meta = game.world.meta;
    this.ps = state.pesadilla || { fuses: [], total: 3, power: false, keyTaken: false, doorOpen: false };
    this.stamina = 100;
    this.exhausted = false;
    this.crouch = false;
    this.hidden = null;
    this.flashOn = true;
    this.mic = new MicMeter();
    this.micLevel = 0;
    this.noiseAcc = 0;
    this.beatAcc = 0;
    this.creakAcc = 0;
    this.scareUntil = 0;
    this.hint = ['[F] linterna  [C] agacharse (silencioso)  [Shift] correr (¡hace ruido!)', '[E] coger / usar / esconderse en armarios'];

    // Linterna pegada a la cámara
    this.flash = new THREE.SpotLight('#fff1d6', 520, 30, 0.52, 0.5, 1.6);
    this.flashTarget = new THREE.Object3D();
    this.glow = new THREE.PointLight('#7f8fbf', 3, 6, 1.6);
    game.scene.add(this.flash, this.flashTarget, this.glow);
    this.flash.target = this.flashTarget;

    // Objetos de las tareas
    this.items = new Map();
    const fuseMat = new THREE.MeshStandardMaterial({ color: '#ffd54f', emissive: '#ff8f00', emissiveIntensity: 0.8 });
    for (const f of this.meta.fuses) {
      const g = new THREE.Group();
      g.add(new THREE.Mesh(new THREE.CylinderGeometry(0.12, 0.12, 0.45, 10), fuseMat));
      g.add(new THREE.Mesh(new THREE.CylinderGeometry(0.14, 0.14, 0.08, 10).translate(0, 0.25, 0), new THREE.MeshStandardMaterial({ color: '#9e9e9e', metalness: 0.8 })));
      g.position.set(f.p[0], 0.45, f.p[2]);
      game.scene.add(g);
      this.items.set(f.id, g);
    }
    const key = new THREE.Group();
    const gold = new THREE.MeshStandardMaterial({ color: '#ffca28', metalness: 0.9, roughness: 0.25, emissive: '#5d4000' });
    key.add(new THREE.Mesh(new THREE.TorusGeometry(0.14, 0.04, 6, 14), gold));
    key.add(new THREE.Mesh(new THREE.BoxGeometry(0.06, 0.4, 0.04).translate(0, -0.32, 0), gold));
    key.add(new THREE.Mesh(new THREE.BoxGeometry(0.14, 0.05, 0.04).translate(0.05, -0.45, 0), gold));
    key.position.set(this.meta.key.p[0], 0.7, this.meta.key.p[2]);
    game.scene.add(key);
    this.items.set('key', key);

    this.mon = this.buildMonster();
    game.scene.add(this.mon.root);
    this.monPos = new THREE.Vector3(999, 0, 999);
    this.monTarget = null;
    this.monState = 0;

    // HUD
    this.stam = bar('linear-gradient(90deg,#90caf9,#e1f5fe)');
    this.micBar = bar('linear-gradient(90deg,#66bb6a,#ffee58,#ef5350)');
    this.micLabel = h('div.small.muted', '🎤 Micrófono apagado');
    this.hud.setMode(h('div.hud-card', h('div.small', '🏃 Aguante'), this.stam.el, h('div', { style: { height: '6px' } }), this.micLabel, this.micBar.el));
    this.hud.crosshair.classList.remove('hidden');
    this.closetEl = h('div', { style: { position: 'absolute', inset: 0, pointerEvents: 'none', display: 'none', background: 'repeating-linear-gradient(0deg, #000 0 26px, rgba(0,0,0,0.55) 26px 34px)', zIndex: 2 } });
    this.hud.el.appendChild(this.closetEl);
    this.applyState(true);

    this.netEvents.pesadilla = (s) => {
      const prev = this.ps;
      if (s.round !== prev.round) this.resetItems();
      this.ps = s;
      this.applyState(false, prev);
    };
    this.netEvents['pesadilla:caught'] = ({ id, name }) => {
      if (id === store.user.id) this.jumpscare();
      else toast(`😱 El Oyente ha atrapado a ${name}`, 'warn');
    };
    this.netEvents['pesadilla:heard'] = () => {
      audio.play('whisper');
      this.hud.showCenter('👂', 'El Oyente te ha oído…', 1600);
    };
    if (!game.spectator) setTimeout(() => this.askMic(), 900);
  }

  askMic() {
    if (this.game.disposed) return;
    if (input.locked) { this.game.ignoreUnlock = true; input.unlockPointer(); }
    modal('🎤 ¿Activar el micrófono?', h('div',
      h('p', 'En Kest Pesadilla, El Oyente puede oír tu voz real. Si hablas o gritas cerca de él, ¡irá a por ti!'),
      h('p.muted.small', '🔒 Tu voz no se graba ni se envía a nadie: el juego solo mide lo fuerte que suena, en tu dispositivo. Puedes jugar igual sin micrófono.'),
    ), {
      actions: [
        { label: 'Jugar sin micrófono', onClick: (close) => { close(); toast('Sin micrófono: El Oyente solo oirá tus pasos', 'info'); } },
        { label: '🎤 Activar', cls: 'primary', onClick: async (close) => {
          close();
          try {
            await this.mic.start();
            if (this.game.disposed) { this.mic.stop(); return; }
            toast('Micrófono activado. ¡Silencio…!', 'ok');
          } catch (e) {
            toast(e.message, 'err', 5000);
          }
        } },
      ],
    });
  }

  buildMonster() {
    const root = new THREE.Group();
    const skin = new THREE.MeshStandardMaterial({ color: '#cfc6bd', roughness: 0.95 });
    const dark = new THREE.MeshStandardMaterial({ color: '#2a0d0d', roughness: 1 });
    const body = new THREE.Mesh(new THREE.CapsuleGeometry(0.42, 1.5, 4, 10), skin);
    body.position.y = 2.0;
    body.rotation.x = 0.25;
    const head = new THREE.Mesh(new THREE.SphereGeometry(0.42, 14, 10), skin);
    head.position.set(0, 3.25, 0.35);
    head.scale.set(1, 1.15, 1);
    const mouth = new THREE.Mesh(new THREE.SphereGeometry(0.26, 12, 8), dark);
    mouth.position.set(0, 3.1, 0.7);
    mouth.scale.set(1.2, 0.8, 0.5);
    const teeth = new THREE.Mesh(new THREE.TorusGeometry(0.22, 0.03, 4, 16), new THREE.MeshStandardMaterial({ color: '#fff8e1' }));
    teeth.position.set(0, 3.1, 0.78);
    teeth.scale.set(1.2, 0.7, 1);
    const ears = [-1, 1].map((s) => {
      const e = new THREE.Mesh(new THREE.ConeGeometry(0.16, 0.7, 6), skin);
      e.position.set(s * 0.45, 3.35, 0.25);
      e.rotation.z = -s * 1.1;
      return e;
    });
    const arms = [-1, 1].map((s) => {
      const piv = new THREE.Group();
      piv.position.set(s * 0.55, 2.7, 0.2);
      const a = new THREE.Mesh(new THREE.CapsuleGeometry(0.11, 1.9, 3, 8), skin);
      a.position.y = -1.0;
      piv.add(a);
      return piv;
    });
    const legs = [-1, 1].map((s) => {
      const l = new THREE.Mesh(new THREE.CapsuleGeometry(0.15, 1.0, 3, 8), skin);
      l.position.set(s * 0.25, 0.65, 0);
      return l;
    });
    root.add(body, head, mouth, teeth, ...ears, ...arms, ...legs);
    root.traverse((c) => { c.castShadow = true; });
    return { root, arms, head };
  }

  resetItems() {
    for (const g of this.items.values()) g.visible = true;
    this.hidden = null;
  }

  applyState(first, prev = {}) {
    const s = this.ps;
    for (const id of s.fuses) { const g = this.items.get(id); if (g) g.visible = false; }
    this.items.get('key').visible = s.power && !s.keyTaken;
    this.game.groupState.power = s.power;
    setGroupState(this.game.built, 'power', s.power);
    const door = this.game.built.objects.get('frontdoor');
    if (door) {
      door.colliders.forEach((c) => (c.enabled = !s.doorOpen));
      if (door.mesh) door.mesh.visible = !s.doorOpen;
    }
    if (!first) {
      if (s.power && !prev.power) { audio.play('switch'); this.hud.showCenter('💡', 'Ha vuelto la luz… y El Oyente lo ha oído', 3000); }
      if (s.keyTaken && !prev.keyTaken) audio.play('gem');
      if (s.doorOpen && !prev.doorOpen) { audio.play('door'); this.hud.showCenter('🚪', '¡La puerta está abierta! ¡Huid!', 3000); }
      if (s.fuses.length > (prev.fuses?.length || 0)) audio.play('coin');
    }
    this.hud.setObjectives([
      { text: 'Encuentra los fusibles', progress: s.fuses.length, total: s.total },
      { text: 'Devuelve la luz en el cuadro eléctrico', done: s.power },
      { text: 'Encuentra la llave', done: s.keyTaken },
      { text: 'Abre la puerta principal y escapa', done: s.doorOpen },
    ], `Noche ${s.round || 1}`);
  }

  interactions(b) {
    if (this.game.spectator) return [];
    const out = [];
    const d = (p) => Math.hypot(b.x - p[0], b.z - p[2]);
    if (this.hidden) return [{ d: 0, label: 'Salir del armario', act: () => this.unhide() }];
    const s = this.ps;
    for (const f of this.meta.fuses) {
      if (!s.fuses.includes(f.id) && d(f.p) < 2.4) out.push({ d: d(f.p), label: 'Coger fusible', act: () => this.send('pick', { id: f.id }) });
    }
    if (s.power && !s.keyTaken && d(this.meta.key.p) < 2.4) out.push({ d: d(this.meta.key.p), label: 'Coger la llave', act: () => this.send('pick', { id: 'key' }) });
    const fb = this.meta.fuseBox.p;
    if (!s.power && d(fb) < 2.6) out.push({ d: d(fb), label: s.fuses.length >= s.total ? 'Colocar los fusibles' : `Cuadro eléctrico (faltan ${s.total - s.fuses.length} fusibles)`, act: () => this.send('fusebox') });
    const dp = this.meta.door.p;
    if (!s.doorOpen && d(dp) < 3) out.push({ d: d(dp), label: s.keyTaken ? 'Abrir la puerta principal' : 'Puerta cerrada con llave', act: () => this.send('door') });
    for (const c of this.meta.closets) if (d(c.p) < 2.3) out.push({ d: d(c.p) + 0.3, label: 'Esconderse en el armario', act: () => this.hide(c) });
    return out;
  }

  async hide(c) {
    const r = await this.send('hide', { id: c.id, on: true });
    if (!r.ok) return;
    this.hidden = c.id;
    this.closetEl.style.display = 'block';
    audio.play('door');
  }

  async unhide() {
    this.hidden = null;
    this.closetEl.style.display = 'none';
    audio.play('door');
    await this.send('hide', { on: false });
  }

  get frozen() {
    return !!this.hidden || performance.now() < this.scareUntil;
  }

  eyeHeight() {
    return this.hidden ? 1.45 : this.crouch ? 1.05 : 1.62;
  }

  filterCtl(ctl, dt) {
    this.crouch = (input.down('KeyC') || input.down('ControlLeft')) && !this.hidden;
    ctl.crouch = this.crouch;
    const moving = Math.abs(ctl.move.x) + Math.abs(ctl.move.y) > 0.1;
    if (this.crouch) {
      ctl.move = { x: ctl.move.x * 0.42, y: ctl.move.y * 0.42 };
      ctl.run = false;
      ctl.jump = false;
    }
    if (ctl.run && moving && !this.exhausted) {
      this.stamina -= 24 * dt;
      if (this.stamina <= 0) { this.stamina = 0; this.exhausted = true; }
    } else {
      this.stamina = Math.min(100, this.stamina + 12 * dt);
      if (this.exhausted && this.stamina > 35) this.exhausted = false;
    }
    if (this.exhausted) ctl.run = false;
  }

  jumpscare() {
    audio.play('scream');
    this.scareUntil = performance.now() + 1300;
    this.hidden = null;
    this.closetEl.style.display = 'none';
    const flash = h('div', { style: { position: 'absolute', inset: 0, background: 'radial-gradient(circle, rgba(120,0,0,0.15), rgba(0,0,0,0.85) 75%)', zIndex: 5, pointerEvents: 'none', animation: 'hurt 1.4s forwards' } });
    this.hud.el.appendChild(flash);
    setTimeout(() => flash.remove(), 1400);
    this.hud.showCenter('😱', 'El Oyente te ha atrapado…', 1800);
    this.game.player.dead = true;
  }

  onSnap(m) {
    if (!m.mon) return;
    const [x, z, ry, st] = m.mon;
    if (!this.monTarget) this.monPos.set(x, 0, z);
    this.monTarget = { x, z, ry };
    this.monState = st;
  }

  startAudio() {
    audio.stopMusic();
    audio.setAmbient(null);
    audio.loop('drone', { freq: 38, type: 'sawtooth', filter: 160, vol: 0.05 });
    audio.loop('drone2', { freq: 57, type: 'triangle', filter: 240, vol: 0.03 });
    audio.loop('wind-h', { noise: true, filter: 300, vol: 0.03 });
  }

  skyTime() {
    return 0.02;
  }

  afterSky() {
    const g = this.game;
    const lit = this.ps.power;
    g.sky.hemi.intensity = lit ? 0.35 : 0.05;
    g.sky.sun.intensity = 0.02;
    g.sky.stars.material.opacity = 0.2;
    g.scene.fog.color.set('#030304');
    g.scene.fog.near = lit ? 6 : 2;
    g.scene.fog.far = lit ? 46 : 24;
    g.sky.uniforms.top.value.set('#020205');
    g.sky.uniforms.bottom.value.set('#050508');
    // Susto: El Oyente aparece justo delante de la cámara
    if (performance.now() < this.scareUntil) {
      const cam = g.camera;
      const fwd = new THREE.Vector3();
      cam.getWorldDirection(fwd);
      this.mon.root.position.set(cam.position.x + fwd.x * 1.5, cam.position.y - 3.25, cam.position.z + fwd.z * 1.5);
      this.mon.root.rotation.y = Math.atan2(-fwd.x, -fwd.z);
      g.cam.shake = 0.12;
    } else g.cam.shake = 0;
  }

  update(dt) {
    const g = this.game;
    const b = g.player.body;
    const now = performance.now();
    if (input.pressed('KeyF')) { this.flashOn = !this.flashOn; audio.play('switch'); }
    const cam = g.camera;
    const fwd = new THREE.Vector3();
    cam.getWorldDirection(fwd);
    this.flash.position.copy(cam.position).addScaledVector(fwd, 0.3);
    this.flashTarget.position.copy(cam.position).addScaledVector(fwd, 8);
    this.flash.intensity = this.flashOn && !this.hidden ? 520 : 0;
    this.glow.position.set(b.x, b.y + 2, b.z);

    // Micrófono: se envía solo el nivel (0..1) unas 5 veces por segundo si hay ruido
    if (this.mic.active) {
      this.micLevel = this.mic.level(dt);
      this.noiseAcc += dt;
      if (this.noiseAcc > 0.2 && this.micLevel > 0.1 && !g.player.dead) {
        this.noiseAcc = 0;
        net.send('mode', { name: 'noise', data: { l: Math.round(this.micLevel * 100) / 100 } });
      }
      this.micBar.fill.style.width = `${Math.round(this.micLevel * 100)}%`;
      this.micLabel.textContent = this.micLevel > 0.55 ? '🎤 ¡¡Demasiado alto!!' : this.micLevel > 0.25 ? '🎤 Te puede oír…' : '🎤 Silencio';
    }
    this.stam.fill.style.width = `${this.stamina}%`;
    this.stam.fill.style.opacity = this.exhausted ? 0.4 : 1;

    for (const [id, it] of this.items) if (it.visible) { it.rotation.y += dt * 1.5; it.position.y = (id === 'key' ? 0.7 : 0.45) + Math.sin(now / 400) * 0.06; }

    // El Oyente
    if (this.monTarget && now >= this.scareUntil) {
      const t = this.monTarget;
      this.monPos.x += (t.x - this.monPos.x) * Math.min(1, dt * 10);
      this.monPos.z += (t.z - this.monPos.z) * Math.min(1, dt * 10);
      this.mon.root.position.set(this.monPos.x, 0, this.monPos.z);
      this.mon.root.rotation.y = t.ry;
      const sway = Math.sin(now / (this.monState === 2 ? 90 : this.monState === 1 ? 160 : 320));
      this.mon.arms[0].rotation.x = sway * 0.7;
      this.mon.arms[1].rotation.x = -sway * 0.7;
      this.mon.head.rotation.z = Math.sin(now / 700) * 0.25; // ladea la cabeza, escuchando
    }
    const d = Math.hypot(this.monPos.x - b.x, this.monPos.z - b.z);
    if (d < 26) {
      this.beatAcc += dt;
      const interval = 0.32 + (d / 26) * 1.0;
      if (this.beatAcc > interval) { this.beatAcc = 0; audio.play('heartbeat', null, { vol: 1 - d / 30 }); }
    }
    this.creakAcc += dt;
    if (this.creakAcc > 7 + Math.random() * 9) {
      this.creakAcc = 0;
      audio.play(Math.random() < 0.5 ? 'whisper' : 'door', { x: this.monPos.x, y: 1, z: this.monPos.z });
    }
  }

  dispose() {
    this.mic.stop();
    this.hud.crosshair.classList.add('hidden');
    this.game.scene.remove(this.flash, this.flashTarget, this.glow, this.mon.root, ...this.items.values());
  }
}

// =====================================================================================
// Kest Desastres
// =====================================================================================
export class DesastresClient extends Base {
  constructor(game, state) {
    super(game, state);
    this.blockEmotes = false;
    this.ds = state.desastres || { phase: 'lobby', until: 0, alive: [] };
    this.hp = 100;
    this.air = 6;
    this.handled = new Set();
    this.lastPhase = this.ds.phase;
    this.dying = false;

    const sc = game.scene;
    this.water = new THREE.Mesh(new THREE.PlaneGeometry(400, 400).rotateX(-Math.PI / 2), new THREE.MeshStandardMaterial({ color: '#1e88e5', transparent: true, opacity: 0.72, roughness: 0.15, metalness: 0.1 }));
    this.water.position.y = -0.6;
    this.lava = new THREE.Mesh(new THREE.PlaneGeometry(200, 200).rotateX(-Math.PI / 2), new THREE.MeshStandardMaterial({ color: '#ff3d00', emissive: '#ff6d00', emissiveIntensity: 1.2, roughness: 0.6 }));
    this.lava.visible = false;
    this.tornado = new THREE.Group();
    const tm = new THREE.MeshStandardMaterial({ color: '#90a4ae', transparent: true, opacity: 0.55, depthWrite: false });
    for (let i = 0; i < 7; i++) {
      const c = new THREE.Mesh(new THREE.CylinderGeometry(2 + i * 1.6, 1.4 + i * 1.6, 5, 16, 1, true), tm);
      c.position.y = 2.5 + i * 5;
      this.tornado.add(c);
    }
    this.tornado.visible = false;
    this.rocks = [];
    const rockMat = new THREE.MeshStandardMaterial({ color: '#5d4037', emissive: '#ff6d00', emissiveIntensity: 0.6 });
    const ringMat = new THREE.MeshBasicMaterial({ color: '#ff1744', transparent: true, opacity: 0.45, depthWrite: false });
    for (let i = 0; i < 14; i++) {
      const rock = new THREE.Mesh(new THREE.DodecahedronGeometry(1.2, 0), rockMat);
      const ring = new THREE.Mesh(new THREE.RingGeometry(0.6, 1, 24).rotateX(-Math.PI / 2), ringMat);
      rock.visible = ring.visible = false;
      sc.add(rock, ring);
      this.rocks.push({ rock, ring });
    }
    // Lluvia ácida
    const n = 900;
    const pos = new Float32Array(n * 3);
    for (let i = 0; i < n; i++) pos.set([(Math.random() - 0.5) * 50, Math.random() * 30, (Math.random() - 0.5) * 50], i * 3);
    const rg = new THREE.BufferGeometry();
    rg.setAttribute('position', new THREE.BufferAttribute(pos, 3));
    this.rain = new THREE.Points(rg, new THREE.PointsMaterial({ color: '#b2ff59', size: 0.18, transparent: true, opacity: 0.8 }));
    this.rain.frustumCulled = false;
    this.rain.visible = false;
    sc.add(this.water, this.lava, this.tornado, this.rain);

    this.titleEl = h('div.big', '');
    this.subEl = h('div.small.muted', '');
    this.hpBar = bar('linear-gradient(90deg,#ef5350,#66bb6a)');
    this.hud.setMode(h('div.hud-card', this.titleEl, this.subEl, this.hpBar.el));
    this.netEvents.desastres = (s) => this.apply(s);
    this.netEvents['desastres:dead'] = ({ id, name, cause }) => {
      if (id !== store.user.id) toast(`💀 ${name} (${cause})`, 'warn');
    };
    this.apply(this.ds);
  }

  get alive() {
    return this.ds.phase === 'disaster' && this.ds.alive.includes(store.user.id);
  }

  apply(s) {
    const prev = this.ds;
    this.ds = s;
    if (s.phase === 'disaster' && prev.phase !== 'disaster') {
      this.hp = 100;
      this.air = 6;
      this.dying = false;
      this.handled.clear();
      this.list = impacts(s.disaster, s.seed);
      const d = DISASTERS[s.disaster];
      audio.play('countdown', null, { go: true });
      this.hud.showCenter(`${d.icon} ${d.name}`, d.tip, 4000);
    }
    if (s.phase !== 'disaster') {
      this.lava.visible = false;
      this.tornado.visible = false;
      this.rain.visible = false;
      for (const r of this.rocks) r.rock.visible = r.ring.visible = false;
      this.water.position.y = -0.6;
      this.water.visible = true;
      this.game.physics.waterLevel = -0.6;
      this.game.cam.shake = 0;
    }
    if (s.phase === 'result' && prev.phase === 'disaster') {
      const won = prev.alive.includes(store.user.id) && s.alive.includes(store.user.id);
      if (won) { audio.play('win'); this.hud.showCenter('🏆 ¡HAS SOBREVIVIDO!', '', 3500); }
    }
  }

  async kill(cause) {
    if (!this.alive || this.dying) return;
    this.dying = true;
    audio.play('death');
    this.hud.showCenter('💀', `Has caído: ${cause}`, 2200);
    const r = await this.send('died', { cause });
    if (r.p) this.game.player.teleport(r.p);
  }

  onDie() {
    // Caer al vacío durante el desastre también elimina (lo decide el servidor al reaparecer)
    return false;
  }

  skyTime() {
    const k = this.ds.disaster;
    return this.ds.phase === 'disaster' && (k === 'acid' || k === 'tornado' || k === 'meteor') ? 0.8 : 0.4;
  }

  update(dt) {
    const g = this.game;
    const b = g.player.body;
    const now = g.now();
    const s = this.ds;
    if (s.phase === 'lobby') {
      this.titleEl.textContent = '⏳ Sala de espera';
      this.subEl.textContent = `Siguiente desastre en ${secs(s.until - now)} s`;
    } else if (s.phase === 'result') {
      this.titleEl.textContent = '🏁 Fin de la ronda';
      this.subEl.textContent = `${s.alive.length} superviviente(s)`;
    } else {
      const d = DISASTERS[s.disaster];
      this.titleEl.textContent = `${d.icon} ${d.name}`;
      this.subEl.textContent = `${this.alive ? '❤️ Vivo' : '👻 Eliminado'} · ${s.alive.length} en pie · ${secs(s.until - now)} s`;
    }
    this.hpBar.fill.style.width = `${Math.max(0, this.hp)}%`;
    if (s.phase !== 'disaster') return;

    const t = (now - s.startAt) / 1000;
    const kind = s.disaster;
    // Agua y lava que suben
    const level = riseLevel(kind, t);
    if (kind === 'lava') {
      this.water.visible = false;
      g.physics.waterLevel = null;
      this.lava.visible = true;
      this.lava.position.y = level;
      this.lava.material.emissiveIntensity = 1 + Math.sin(now / 200) * 0.2;
      if (this.alive && b.y < level - 0.05) this.kill('lava');
    } else {
      this.water.position.y = level;
      g.physics.waterLevel = level;
      if (this.alive && kind === 'flood') {
        if (b.y + 1.6 < level) {
          this.air -= dt;
          if (this.air < 0) this.kill('agua');
        } else this.air = Math.min(6, this.air + dt * 2);
        if (this.air < 6 && this.air > 0) this.subEl.textContent += ` · 🫧 ${this.air.toFixed(1)} s`;
      }
    }
    // Meteoritos y rocas
    if (kind === 'meteor' || kind === 'quake') {
      let k = 0;
      for (const im of this.list) {
        const dtImpact = im.t - t;
        if (dtImpact < -0.4 || dtImpact > 2.6) continue;
        const slot = this.rocks[k++];
        if (!slot) break;
        if (dtImpact > 0) {
          slot.rock.visible = slot.ring.visible = true;
          slot.rock.position.set(im.x + dtImpact * 6, dtImpact * 30, im.z);
          slot.rock.scale.setScalar(kind === 'meteor' ? 1.4 : 0.9);
          slot.rock.rotation.x += dt * 4;
          slot.ring.position.set(im.x, 0.08, im.z);
          slot.ring.scale.setScalar(im.r * (1.2 - dtImpact * 0.15));
        } else {
          slot.rock.visible = false;
          slot.ring.visible = false;
        }
        if (dtImpact <= 0 && !this.handled.has(im)) {
          this.handled.add(im);
          const dist = Math.hypot(b.x - im.x, b.z - im.z);
          audio.play('hit', { x: im.x, y: 0, z: im.z });
          if (dist < 18) g.cam.shake = Math.max(g.cam.shake, 0.4 * (1 - dist / 18));
          if (this.alive && dist < im.r && b.y < 12) this.kill(kind === 'meteor' ? 'meteorito' : 'roca');
        }
      }
      for (; k < this.rocks.length; k++) this.rocks[k].rock.visible = this.rocks[k].ring.visible = false;
    }
    if (kind === 'quake') {
      g.cam.shake = Math.max(g.cam.shake * 0.92, t > 4 ? 0.12 : 0);
      if (b.onGround && Math.random() < dt * 3) { b.vx += (Math.random() - 0.5) * 6; b.vz += (Math.random() - 0.5) * 6; }
    } else g.cam.shake *= 0.9;
    // Tornado
    if (kind === 'tornado') {
      const c = tornadoAt(s.seed, t);
      this.tornado.visible = true;
      this.tornado.position.set(c.x, 0, c.z);
      this.tornado.rotation.y += dt * 4;
      const dx = c.x - b.x, dz = c.z - b.z, d = Math.hypot(dx, dz);
      if (this.alive && d < 11 && b.y < 30) {
        const pull = (1 - d / 11) * 34 * dt;
        b.vx += (dx / d) * pull - (dz / d) * pull * 0.8;
        b.vz += (dz / d) * pull + (dx / d) * pull * 0.8;
        const hs = Math.hypot(b.vx, b.vz);
        if (hs > 17) { b.vx *= 17 / hs; b.vz *= 17 / hs; }
        if (d < 3.5) { b.vy = Math.max(b.vy, 20); b.onGround = false; b.ground = null; }
      }
    }
    // Lluvia ácida: hace daño si no hay techo encima
    if (kind === 'acid') {
      this.rain.visible = true;
      this.rain.position.set(b.x, b.y - 4, b.z);
      const p = this.rain.geometry.attributes.position;
      for (let i = 0; i < p.count; i++) { let y = p.getY(i) - dt * 22; if (y < 0) y += 30; p.setY(i, y); }
      p.needsUpdate = true;
      const roof = g.physics.raycast(b.x, b.y + 2.1, b.z, 0, 1, 0, 40, 0.5).collider;
      if (this.alive && !roof) {
        this.hp -= dt * 9;
        if (this.hp <= 0) this.kill('ácido');
      }
    }
    // Caídas muy fuertes (tornado) también eliminan
    if (this.alive && b.landSpeed > 34) this.kill('caída');
  }

  dispose() {
    this.game.scene.remove(this.water, this.lava, this.tornado, this.rain, ...this.rocks.flatMap((r) => [r.rock, r.ring]));
    this.game.cam.shake = 0;
  }
}

// =====================================================================================
// Kest Huerto
// =====================================================================================
const MUT_COLORS = { gold: '#ffd700', rainbow: null };

function cropMesh(seed, mut) {
  const s = SEEDS[seed];
  const g = new THREE.Group();
  const leaf = new THREE.MeshStandardMaterial({ color: '#43a047', roughness: 0.8 });
  const color = mut === 'gold' ? MUT_COLORS.gold : s.color;
  const fruit = new THREE.MeshStandardMaterial({ color, roughness: 0.4, metalness: mut === 'gold' ? 0.8 : 0, emissive: mut ? color : '#000000', emissiveIntensity: mut ? 0.35 : 0 });
  if (mut === 'rainbow') fruit.userData.rainbow = true;
  g.add(new THREE.Mesh(new THREE.CylinderGeometry(0.05, 0.07, 0.8, 6).translate(0, 0.4, 0), leaf));
  for (let i = 0; i < 3; i++) {
    const l = new THREE.Mesh(new THREE.SphereGeometry(0.22, 8, 6), leaf);
    l.scale.set(1.3, 0.35, 0.7);
    l.position.set(Math.cos(i * 2.1) * 0.22, 0.45 + i * 0.12, Math.sin(i * 2.1) * 0.22);
    g.add(l);
  }
  const big = seed === 'watermelon' || seed === 'pumpkin';
  const geoF = seed === 'carrot' ? new THREE.ConeGeometry(0.16, 0.6, 8).rotateX(Math.PI) : seed === 'corn' ? new THREE.CapsuleGeometry(0.14, 0.4, 3, 8) : seed === 'starfruit' ? new THREE.OctahedronGeometry(0.32) : new THREE.SphereGeometry(big ? 0.55 : 0.2, 12, 8);
  const count = seed === 'strawberry' || seed === 'tomato' || seed === 'mango' ? 3 : 1;
  const fruits = [];
  for (let i = 0; i < count; i++) {
    const f = new THREE.Mesh(geoF, fruit);
    if (count > 1) f.position.set(Math.cos(i * 2.1) * 0.28, 0.75, Math.sin(i * 2.1) * 0.28);
    else f.position.set(0, big ? 0.5 : seed === 'carrot' ? 0.25 : 0.9, 0);
    if (seed === 'pumpkin') f.scale.set(1.2, 0.85, 1.2);
    fruits.push(f);
    g.add(f);
  }
  g.traverse((c) => { c.castShadow = true; });
  g.userData = { fruits, fruit };
  return g;
}

export class HuertoClient extends Base {
  constructor(game, state) {
    super(game, state);
    const hs = state.huerto || { plots: [], me: null, rain: 0 };
    this.me = hs.me;
    this.rainUntil = hs.rain || 0;
    this.plots = new Map();
    this.tiles = new Map(); // "k:t" -> { tile, mesh }
    this.signs = new Map();
    this.selected = null;
    this.hint = ['[E] plantar / cosechar / tienda  [Q] cambiar semilla', 'Tus plantas siguen creciendo aunque te desconectes'];
    for (const p of hs.plots) this.setPlot(p);
    this.pickDefaultSeed();

    const n = 700;
    const pos = new Float32Array(n * 3);
    for (let i = 0; i < n; i++) pos.set([(Math.random() - 0.5) * 60, Math.random() * 25, (Math.random() - 0.5) * 60], i * 3);
    const rg = new THREE.BufferGeometry();
    rg.setAttribute('position', new THREE.BufferAttribute(pos, 3));
    this.rain = new THREE.Points(rg, new THREE.PointsMaterial({ color: '#90caf9', size: 0.14, transparent: true, opacity: 0.75 }));
    this.rain.frustumCulled = false;
    this.rain.visible = false;
    game.scene.add(this.rain);

    this.cashEl = h('div.big', '');
    this.seedEl = h('div.small', '');
    this.invEl = h('div.small.muted', '');
    this.hud.setMode(h('div.hud-card', this.cashEl, this.seedEl, this.invEl));
    this.renderHud();

    this.netEvents['huerto:plot'] = (p) => this.setPlot(p);
    this.netEvents['huerto:tile'] = ({ k, t, tile }) => {
      const pl = this.plots.get(k);
      if (pl) { pl.tiles[t] = tile; this.setTile(k, t, tile); }
    };
    this.netEvents['huerto:rain'] = ({ until }) => {
      this.rainUntil = until;
      this.rainStart = this.game.now();
    };
  }

  setPlot(p) {
    const old = this.plots.get(p.k);
    if (old) for (let t = 0; t < HUERTO.cols * HUERTO.rows; t++) this.setTile(p.k, t, null);
    this.plots.set(p.k, { owner: p.owner, tiles: [...(p.tiles || [])] });
    (p.tiles || []).forEach((tile, t) => this.setTile(p.k, t, tile));
    const s = this.signs.get(p.k);
    if (s) { this.game.scene.remove(s); s.material.map.dispose(); s.material.dispose(); this.signs.delete(p.k); }
    if (p.owner) {
      const c = document.createElement('canvas');
      c.width = 256; c.height = 64;
      const g = c.getContext('2d');
      g.fillStyle = p.owner.id === store.user.id ? 'rgba(0,150,110,0.85)' : 'rgba(30,30,60,0.75)';
      g.beginPath(); g.roundRect(8, 8, 240, 48, 16); g.fill();
      g.fillStyle = '#fff'; g.font = '800 26px Nunito, sans-serif'; g.textAlign = 'center'; g.textBaseline = 'middle';
      g.fillText(`🌱 Huerto de ${p.owner.name}`.slice(0, 22), 128, 33);
      const tex = new THREE.CanvasTexture(c);
      tex.colorSpace = THREE.SRGBColorSpace;
      const sp = new THREE.Sprite(new THREE.SpriteMaterial({ map: tex, transparent: true }));
      const [x, z] = plotCenter(p.k);
      sp.position.set(x, 4, z + (p.k < 4 ? -7.5 : 7.5));
      sp.scale.set(6, 1.5, 1);
      this.game.scene.add(sp);
      this.signs.set(p.k, sp);
    }
  }

  setTile(k, t, tile) {
    const key = `${k}:${t}`;
    const cur = this.tiles.get(key);
    if (cur) { this.game.scene.remove(cur.mesh); this.tiles.delete(key); }
    if (!tile) return;
    const mesh = cropMesh(tile.s, tile.m);
    const [x, z] = tilePos(k, t);
    mesh.position.set(x, 0.16, z);
    this.game.scene.add(mesh);
    this.tiles.set(key, { tile, mesh });
  }

  growth(tile, now) {
    let extra = 0;
    if (this.rainStart && this.rainUntil) {
      const a = Math.max(this.rainStart, tile.at), b2 = Math.min(now, this.rainUntil);
      if (b2 > a) extra = (b2 - a) * (HUERTO.rainBoost - 1);
    }
    return Math.min(1, (now - tile.at + (tile.b || 0) + extra) / (SEEDS[tile.s].grow * 1000));
  }

  pickDefaultSeed() {
    const owned = SEED_IDS.filter((s) => this.me?.seeds?.[s] > 0);
    if (!owned.includes(this.selected)) this.selected = owned[0] || null;
  }

  renderHud() {
    const me = this.me;
    if (!me) {
      this.cashEl.textContent = '🌾 Huerto lleno';
      this.seedEl.textContent = 'Espera a que quede una parcela libre';
      return;
    }
    this.cashEl.textContent = `🌾 ${me.cash} monedas de huerto`;
    const s = this.selected && SEEDS[this.selected];
    this.seedEl.textContent = s ? `Semilla: ${s.icon} ${s.name} ×${me.seeds[this.selected]}  [Q]` : 'Sin semillas: cómpralas en el puesto';
    const inv = Object.values(me.inv || {}).reduce((a, b) => a + b, 0);
    this.invEl.textContent = inv ? `🧺 ${inv} frutas para vender` : `Parcela ${me.k + 1}`;
  }

  async act(name, data) {
    const r = await this.send(name, data);
    if (r.me) { this.me = r.me; this.pickDefaultSeed(); this.renderHud(); }
    return r;
  }

  interactions(b) {
    const out = [];
    if (!this.me || this.game.spectator) return out;
    const ds = Math.hypot(b.x - SHOP_POS[0], b.z - SHOP_POS[1]);
    if (ds < 5) out.push({ d: ds, label: 'Abrir el puesto de semillas', act: () => this.openShop() });
    const k = this.me.k;
    if (k == null) return out;
    const pl = this.plots.get(k);
    if (!pl) return out;
    const now = this.game.now();
    let best = null;
    for (let t = 0; t < HUERTO.cols * HUERTO.rows; t++) {
      const [x, z] = tilePos(k, t);
      const d = Math.hypot(b.x - x, b.z - z);
      if (d < 1.7 && (!best || d < best.d)) best = { t, d };
    }
    if (!best) return out;
    const tile = pl.tiles[best.t];
    if (!tile) {
      const s = this.selected && SEEDS[this.selected];
      out.push({ d: best.d, label: s ? `Plantar ${s.icon} ${s.name}` : 'Sin semillas (ve al puesto)', act: () => (s ? this.plant(best.t) : this.openShop()) });
    } else {
      const g = this.growth(tile, now);
      const s = SEEDS[tile.s];
      const mut = tile.m ? ` ${MUTATIONS[tile.m].name}` : '';
      out.push(g >= 1
        ? { d: best.d, label: `Cosechar ${s.icon} ${s.name}${mut}`, act: () => this.harvest(best.t) }
        : { d: best.d, label: `${s.icon} ${s.name}${mut}: ${Math.floor(g * 100)} %`, act: () => toast(`Faltan ${secs((1 - g) * s.grow * 1000)} s`, 'info') });
    }
    return out;
  }

  async plant(t) {
    const r = await this.act('plant', { tile: t, seed: this.selected });
    if (r.ok) audio.play('build');
  }

  async harvest(t) {
    const r = await this.act('harvest', { tile: t });
    if (!r.ok) return;
    const s = SEEDS[r.got.s];
    if (r.got.m) {
      audio.play('gem');
      this.hud.showCenter(r.got.m === 'rainbow' ? '🌈' : '✨', `¡${s.name} ${MUTATIONS[r.got.m].name}! (×${MUTATIONS[r.got.m].mult})`, 2500);
    } else audio.play('coin');
  }

  openShop() {
    if (input.locked) { this.game.ignoreUnlock = true; input.unlockPointer(); }
    const body = h('div');
    const render = () => {
      const me = this.me;
      const inv = Object.entries(me.inv || {});
      const value = inv.reduce((a, [key, n]) => { const [s, m] = key.split('|'); return a + SEEDS[s].sell * (MUTATIONS[m]?.mult || 1) * n; }, 0);
      clear(body).append(
        h('p.muted.small', `Tienes 🌾 ${me.cash}. Vender cosechas también da algunas Kesty Coins (con límite diario).`),
        h('div.list', SEED_IDS.map((id) => {
          const s = SEEDS[id];
          return h('div.list-item',
            h('span', { style: { fontSize: '22px' } }, s.icon),
            h('span.grow', h('b', s.name), h('div.small.muted', `${s.grow >= 60 ? `${Math.round(s.grow / 60)} min` : `${s.grow} s`} · vende a ${s.sell}${s.regrow ? ' · vuelve a dar fruto' : ''} · tienes ${me.seeds[id] || 0}`)),
            button(`🌾 ${s.price}`, async () => { await this.act('buy', { seed: id, n: 1 }); audio.play('coin'); render(); }, `small${me.cash >= s.price ? ' primary' : ''}`),
          );
        })),
        h('div.row', { style: { marginTop: '12px', justifyContent: 'space-between' } },
          h('span', inv.length ? `🧺 Cosecha: ${inv.reduce((a, [, n]) => a + n, 0)} frutas (${value} 🌾)` : '🧺 No tienes cosecha'),
          button('Vender todo', async () => {
            const r = await this.act('sell');
            if (r.ok) { audio.play('win'); toast(`Has vendido tu cosecha por ${r.total} 🌾`, 'reward'); }
            render();
          }, inv.length ? 'primary' : ''),
        ),
      );
    };
    render();
    modal('🌱 Puesto de semillas', body, { wide: true, actions: [{ label: 'Cerrar' }] });
  }

  update(dt) {
    const now = this.game.now();
    if (input.pressed('KeyQ') && this.me) {
      const owned = SEED_IDS.filter((s) => this.me.seeds[s] > 0);
      if (owned.length) {
        this.selected = owned[(owned.indexOf(this.selected) + 1) % owned.length];
        audio.ui('click');
        this.renderHud();
      }
    }
    const t = performance.now() / 1000;
    for (const { tile, mesh } of this.tiles.values()) {
      const gr = this.growth(tile, now);
      const sc = 0.25 + gr * 0.75;
      mesh.scale.setScalar(sc);
      for (const f of mesh.userData.fruits) f.visible = gr > 0.55;
      if (gr >= 1) mesh.rotation.y = Math.sin(t * 2 + mesh.position.x) * 0.15;
      if (mesh.userData.fruit.userData.rainbow) mesh.userData.fruit.color.setHSL((t * 0.3) % 1, 0.9, 0.55);
    }
    const raining = now < this.rainUntil;
    this.rain.visible = raining;
    if (raining) {
      const b = this.game.player.body;
      this.rain.position.set(b.x, b.y - 2, b.z);
      const p = this.rain.geometry.attributes.position;
      for (let i = 0; i < p.count; i++) { let y = p.getY(i) - dt * 18; if (y < 0) y += 25; p.setY(i, y); }
      p.needsUpdate = true;
    }
  }

  skyTime() {
    return this.game.now() < this.rainUntil ? 0.75 : undefined;
  }

  dispose() {
    for (const { mesh } of this.tiles.values()) this.game.scene.remove(mesh);
    for (const s of this.signs.values()) this.game.scene.remove(s);
    this.game.scene.remove(this.rain);
  }
}

// =====================================================================================
// Kest Bloques Locos
// =====================================================================================
export class BloquesClient extends Base {
  constructor(game, state) {
    super(game, state);
    this.blockEmotes = false;
    this.bs = state.bloques || { phase: 'waiting', colors: [], target: 0 };
    const n = BLOQUES.n * BLOQUES.n;
    this.tileEntries = [];
    for (let i = 0; i < n; i++) {
      const e = game.built.objects.get(`tile${i}`);
      if (e?.mesh) e.mesh.visible = false;
      this.tileEntries.push(e);
    }
    const geo = new THREE.BoxGeometry(BLOQUES.tile - 0.08, 0.8, BLOQUES.tile - 0.08);
    this.inst = new THREE.InstancedMesh(geo, new THREE.MeshStandardMaterial({ roughness: 0.4 }), n);
    this.inst.receiveShadow = true;
    this.inst.castShadow = true;
    game.scene.add(this.inst);
    this.m4 = new THREE.Matrix4();
    this.color = new THREE.Color();
    this.lastTick = 0;
    this.swatch = h('div', { style: { width: '54px', height: '54px', borderRadius: '12px', border: '3px solid #fff', flex: 'none' } });
    this.nameEl = h('div.big', '');
    this.subEl = h('div.small.muted', '');
    this.timer = bar('#ffffff');
    this.hud.setMode(h('div.hud-card', h('div.row', this.swatch, h('div', this.nameEl, this.subEl)), this.timer.el));
    this.netEvents.bloques = (s) => this.apply(s);
    this.netEvents['bloques:out'] = ({ id, name }) => {
      if (id === store.user.id) { audio.play('death'); this.hud.showCenter('💥', '¡Te has caído! Espera a la siguiente partida', 2500); }
      else toast(`💥 ${name} se ha caído`, 'info');
    };
    this.apply(this.bs);
  }

  apply(s) {
    const prev = this.bs;
    this.bs = s;
    this.phaseStart = this.game.now();
    this.phaseLen = Math.max(1, s.until - this.phaseStart);
    const dropping = s.phase === 'drop';
    for (let i = 0; i < this.tileEntries.length; i++) {
      const [x, z] = tileCenter(i);
      const keep = !dropping || s.colors[i] === s.target;
      this.m4.makeScale(keep ? 1 : 0.0001, 1, keep ? 1 : 0.0001).setPosition(x, BLOQUES.y - 0.4, z);
      this.inst.setMatrixAt(i, this.m4);
      this.color.set(TILE_COLORS[s.colors[i] ?? 0].hex);
      this.inst.setColorAt(i, this.color);
      this.tileEntries[i]?.colliders.forEach((c) => (c.enabled = keep));
    }
    this.inst.instanceMatrix.needsUpdate = true;
    if (this.inst.instanceColor) this.inst.instanceColor.needsUpdate = true;
    if (s.phase === 'show' && prev.phase !== 'show') audio.play('countdown');
    if (dropping && prev.phase !== 'drop') audio.play('hit');
    if (s.phase === 'results' && prev.phase !== 'results') {
      if (s.winner === store.user.username) { audio.play('win'); this.hud.showCenter('🏆 ¡HAS GANADO!', `Ronda ${s.round}`, 4000); }
      else this.hud.showCenter('🏁', s.winner ? `Gana ${s.winner}` : 'Nadie ha ganado', 3500);
    }
    if (s.phase === 'countdown' && prev.phase !== 'countdown') this.hud.showCenter('🟥🟦🟩', '¡Prepárate!', 2500);
  }

  update() {
    const s = this.bs;
    const now = this.game.now();
    const left = Math.max(0, s.until - now);
    const target = TILE_COLORS[s.target] || TILE_COLORS[0];
    if (s.phase === 'show' || s.phase === 'drop') {
      this.swatch.style.background = target.hex;
      this.nameEl.textContent = s.phase === 'show' ? `¡${target.name}!` : '¡AHORA!';
      this.subEl.textContent = `Ronda ${s.round} · ${s.alive} en pie`;
      this.timer.fill.style.width = s.phase === 'show' ? `${(left / this.phaseLen) * 100}%` : '0%';
      this.timer.fill.style.background = target.hex;
      if (s.phase === 'show') {
        const sec = Math.ceil(left / 1000);
        if (sec !== this.lastTick && sec > 0) { this.lastTick = sec; audio.play('switch'); }
      }
    } else {
      this.swatch.style.background = 'conic-gradient(#f44336,#ff9800,#ffeb3b,#4caf50,#2196f3,#9c27b0,#f44336)';
      this.nameEl.textContent = s.phase === 'results' ? '🏁 Fin' : s.phase === 'countdown' ? '¡Prepárate!' : 'Esperando…';
      this.subEl.textContent = s.phase === 'countdown' ? `Empieza en ${secs(left)} s` : 'Nueva partida en breve';
      this.timer.fill.style.width = '100%';
      this.timer.fill.style.background = '#ffffff';
    }
  }

  dispose() {
    this.game.scene.remove(this.inst);
    this.inst.geometry.dispose();
    this.inst.material.dispose();
  }
}
