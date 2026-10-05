// Lógica de cada experiencia en el cliente: paneles del HUD, objetivos,
// controles propios y respuesta a los eventos del servidor.
import * as THREE from 'three';
import { net } from '../core/net.js';
import { input } from '../engine/input.js';
import { audio } from '../audio/audio.js';
import { h, toast, formatTime } from '../ui/dom.js';
import { material } from '../engine/materials.js';
import { boxGeo } from '../world/objectParts.js';
import { store } from '../core/store.js';
import { OnlyUpClient, HorrorClient, RoyaleClient, RocketClient, CastoresClient } from './modes2.js';
import { PesadillaClient, DesastresClient, HuertoClient, BloquesClient } from './modes3.js';
import { AsaltoClient } from './asalto.js';

class BaseClient {
  constructor(game, state) {
    this.game = game;
    this.hud = game.hud;
    this.state = state || {};
    this.netEvents = {};
    this.hint = [];
  }

  update() {}
  dispose() {}
}

// --- Isla Metrópolis ----------------------------------------------------------------
class CityClient extends BaseClient {
  constructor(game, state) {
    super(game, state);
    this.hud.setObjectives(state.objectives);
    for (const id of state.gems || []) {
      const e = game.built.objects.get(id);
      if (e) game.hideObject(e);
    }
    this.hint = ['Busca gemas ✦, abre cofres y prueba los vehículos'];
  }

  promptFor(e) {
    if (e.o.t === 'chest' && e.opened) return null;
    return undefined;
  }
}

// --- Obby (y recorridos de mundos de usuarios) ----------------------------------
class ObbyClient extends BaseClient {
  constructor(game, state, { custom = false } = {}) {
    super(game, state);
    const ob = state.obby || {};
    this.custom = custom;
    this.cps = [...game.built.objects.values()].filter((e) => e.o.t === 'checkpoint').map((e) => e.o).sort((a, b) => a.n - b.n);
    this.hasFinish = [...game.built.objects.values()].some((e) => e.o.t === 'finish');
    this.cp = ob.cp || 0;
    this.start = ob.start || game.now();
    this.best = ob.best ?? null;
    this.finishTime = null;
    this.timerEl = h('div.big', '0:00.0');
    this.cpEl = h('div.small.muted');
    this.bestEl = h('div.small.muted');
    if (this.hasFinish) {
      this.hud.setMode(h('div.hud-card', this.timerEl, this.cpEl, this.bestEl));
      this.hint = ['[R] reiniciar recorrido'];
    }
    this.netEvents.obby = (d) => {
      if (d.reached) {
        audio.play('checkpoint');
        this.hud.showCenter('✔', `Punto de control ${d.reached}/${d.total}`, 1300);
      }
      this.cp = d.cp;
      this.start = d.start;
      if (d.best != null) this.best = d.best;
      if (d.finishTime != null) {
        this.finishTime = d.finishTime;
        audio.play('win');
        this.hud.showCenter('🏁 ¡META!', `${formatTime(d.finishTime)}${d.isBest ? ' · ¡Nuevo récord!' : ''}`, 4500);
      }
    };
  }

  onTrigger(e, entered) {
    const o = e.o;
    if (!entered) return false;
    if (o.t === 'checkpoint' && this.game.offline && o.n === this.cp + 1) {
      this.cp = o.n;
      audio.play('checkpoint');
      this.hud.showCenter('✔', `Punto de control ${o.n}/${this.cps.length}`, 1300);
    }
    if (o.t === 'finish' && this.game.offline && this.cp >= this.cps.length && this.finishTime == null) {
      this.finishTime = this.game.now() - this.start;
      audio.play('win');
      this.hud.showCenter('🏁 ¡META!', formatTime(this.finishTime), 4000);
    }
    return o.t === 'checkpoint' || o.t === 'finish';
  }

  localRespawn() {
    const c = this.cps[this.cp - 1];
    return c ? [c.p[0], c.p[1] + c.s[1] / 2 + 0.2, c.p[2]] : null;
  }

  async restart() {
    this.finishTime = null;
    if (this.game.offline) {
      this.cp = 0;
      this.start = this.game.now();
      this.game.player.teleport(this.game.built.spawns[0]);
      return;
    }
    const r = await net.request('mode', { name: 'restart' });
    if (r.pos) {
      this.game.player.teleport(r.pos);
      this.cp = r.obby.cp;
      this.start = r.obby.start;
    }
  }

  update() {
    if (!this.hasFinish) return;
    if (input.pressed('KeyR')) this.restart();
    const t = this.finishTime ?? this.game.now() - this.start;
    this.timerEl.textContent = '⏱ ' + formatTime(t);
    this.cpEl.textContent = `Puntos de control: ${this.cp}/${this.cps.length}`;
    this.bestEl.textContent = this.best != null ? `Mejor: ${formatTime(this.best)}` : '';
  }
}

class CustomClient extends ObbyClient {
  constructor(game, state) {
    super(game, state, { custom: true });
    this.coins = state.coins || { got: 0, total: [...game.built.objects.values()].filter((e) => e.o.t === 'coin').length };
    this.coinEl = h('div.hud-card', '');
    this.netEvents.coins = (c) => { this.coins = c; this.renderCoins(); };
    if (this.coins.total) {
      this.hud.setMode(this.hasFinish ? h('div.hud-card', this.timerEl, this.cpEl, this.bestEl) : null, this.coinEl);
      this.renderCoins();
    }
  }

  renderCoins() {
    this.coinEl.textContent = `🪙 ${this.coins.got}/${this.coins.total}`;
  }

  onCollect(e) {
    if (e.o.t === 'coin' && this.game.offline) {
      this.coins.got++;
      this.renderCoins();
    }
  }
}

// --- Turbo Karts ----------------------------------------------------------------
class RacingClient extends BaseClient {
  constructor(game, state) {
    super(game, state);
    this.race = state.race || { state: 'waiting', standings: [] };
    this.lockVehicle = true;
    this.blockEmotes = true;
    this.panel = h('div.hud-card');
    this.posEl = h('div.hud-card');
    this.hud.setMode(this.panel, this.posEl);
    this.hint = ['[G] iniciar carrera  [R] recolocar kart'];
    this.lastCount = null;
    this.hud.addTouchButton('Iniciar', 'KeyG', { right: '120px', top: '70px', width: '60px', height: '60px', fontSize: '11px' });
    this.hud.addTouchButton('R', 'KeyR', { right: '190px', top: '70px', width: '50px', height: '50px' });
    this.netEvents.race = (r) => {
      const prev = this.race.state;
      this.race = r;
      if (r.state === 'results' && prev !== 'results') this.showResults();
      if (r.state === 'racing' && prev === 'countdown') {
        audio.play('countdown', null, { go: true });
        this.hud.showCenter('¡YA!', '', 900);
      }
      this.render();
    };
    this.netEvents['race:grid'] = ({ p, ry }) => {
      const v = this.game.player.vehicle;
      if (!v) return;
      Object.assign(v.state, { x: p[0], y: p[1], z: p[2], yaw: (ry * Math.PI) / 180, speed: 0, pitch: 0, roll: 0 });
      v.applyPose();
      this.game.cam.yaw = v.state.yaw + Math.PI;
    };
    this.render();
  }

  get frozen() {
    return this.race.state === 'countdown' && this.race.standings.some((s) => s.id === store.user.id);
  }

  me() {
    return this.race.standings.find((s) => s.id === store.user.id);
  }

  render() {
    const r = this.race;
    const me = this.me();
    const labels = { waiting: 'Esperando: pulsa G para empezar', countdown: '¡Preparados!', racing: 'Carrera en curso', results: 'Resultados' };
    this.panel.textContent = labels[r.state] || '';
    if (me && (r.state === 'racing' || r.state === 'countdown')) {
      const pos = r.standings.findIndex((s) => s.id === me.id) + 1;
      this.posEl.textContent = me.finishedAt ? `🏁 ${formatTime(me.time)}` : `Vuelta ${Math.min(r.laps, me.lap + 1)}/${r.laps} · Posición ${pos}/${r.standings.length}`;
      this.posEl.classList.remove('hidden');
    } else this.posEl.classList.add('hidden');
  }

  showResults() {
    const res = this.race.results || [];
    const lines = res.map((s, i) => `${i + 1}. ${s.name} ${s.time ? formatTime(s.time) : '—'}`).join('\n');
    const me = res.findIndex((s) => s.id === store.user.id);
    if (me === 0 && res.length > 1) audio.play('win');
    this.hud.showCenter(me >= 0 ? `Posición ${me + 1}` : 'Fin de la carrera', lines, 6000);
  }

  async reset() {
    const r = await net.request('mode', { name: 'reset' });
    const v = this.game.player.vehicle;
    if (r.pos && v) {
      Object.assign(v.state, { x: r.pos[0], y: r.pos[1], z: r.pos[2], yaw: (r.ry * Math.PI) / 180, speed: 0, vy: 0, pitch: 0, roll: 0 });
      v.applyPose();
    }
  }

  onDie() {
    this.reset();
    return true;
  }

  /** Turbos de la pista: al pasar por encima, el kart acelera durante un momento. */
  vehicleCtl(v) {
    const now = performance.now();
    for (const [x, z] of this.game.world.meta.boosts || []) {
      if (Math.hypot(v.state.x - x, v.state.z - z) < 3.6 && now > (this.boostUntil || 0) - 900) {
        if (now > (this.boostUntil || 0)) audio.play('boost');
        this.boostUntil = now + 1300;
      }
    }
    return now < (this.boostUntil || 0) ? { boost: true } : {};
  }

  async update() {
    if (input.pressed('KeyG')) {
      const r = await net.request('mode', { name: 'start' });
      if (r.error) toast(r.error, 'warn');
    }
    if (input.pressed('KeyR')) this.reset();
    if (this.race.state === 'countdown') {
      const left = Math.ceil((this.race.startAt - this.game.now()) / 1000);
      if (left !== this.lastCount && left > 0 && left <= 5) {
        this.lastCount = left;
        audio.play('countdown');
        this.hud.showCenter(String(left), '', 950);
      }
    } else this.lastCount = null;
    if (this.race.state === 'racing') {
      const me = this.me();
      if (me && !me.finishedAt) this.panel.textContent = `⏱ ${formatTime(this.game.now() - this.race.startAt)}`;
    }
  }
}

// --- Noche Salvaje ----------------------------------------------------------------
class SurvivalClient extends BaseClient {
  constructor(game, state) {
    super(game, state);
    const s = state.survival;
    this.s = s;
    this.me = s.me;
    this.build = false;
    this.mat = 'wood';
    this.blocks = new Map();
    this.enemies = new Map();
    this.hint = ['[Clic] golpear/recoger/construir  [B] modo construcción', '[R] cambiar material  [X] quitar bloque  [F] comer bayas'];
    for (const id of s.depleted) this.setNode(id, false);
    for (const b of s.blocks) this.addBlock(b);
    for (const e of s.enemies) this.upsertEnemy(e);

    this.hpBar = h('div', { style: { width: '100%' } });
    this.foodBar = h('div', { style: { width: '100%' } });
    this.invEl = h('div.inv');
    this.dayEl = h('div.small.muted');
    this.buildEl = h('div.small', '');
    this.hud.setMode(h('div.hud-card.bars-surv',
      h('div.row.small', '❤️', h('div.bar.hp.grow', this.hpBar)),
      h('div.row.small', '🍗', h('div.bar.food.grow', this.foodBar)),
      this.invEl, this.dayEl, this.buildEl,
    ));
    this.hud.crosshair.classList.remove('hidden');
    this.hud.addTouchButton('Golpe', 'Mouse0', { right: '120px', bottom: '150px', width: '60px', height: '60px', fontSize: '11px' });
    this.hud.addTouchButton('🧱', 'KeyB', { right: '190px', top: '70px', width: '50px', height: '50px' });
    this.hud.addTouchButton('🫐', 'KeyF', { right: '120px', top: '70px', width: '50px', height: '50px' });
    this.renderMe();

    const ghostMat = new THREE.MeshBasicMaterial({ color: '#ffffff', transparent: true, opacity: 0.35, depthWrite: false });
    this.ghost = new THREE.Mesh(new THREE.BoxGeometry(2.02, 2.02, 2.02), ghostMat);
    this.ghost.visible = false;
    game.scene.add(this.ghost);

    this.netEvents['surv:me'] = (m) => { this.me = m; this.renderMe(); };
    this.netEvents['surv:node'] = ({ id, alive }) => this.setNode(id, alive);
    this.netEvents['surv:block'] = ({ add, remove }) => {
      if (add) { this.addBlock(add); audio.play('build', { x: add.x, y: add.y, z: add.z }); }
      if (remove) this.removeBlock(remove);
    };
    this.netEvents['surv:enemies'] = (list) => {
      const seen = new Set();
      for (const e of list) { this.upsertEnemy(e); seen.add(e.id); }
      for (const id of [...this.enemies.keys()]) if (!seen.has(id)) this.removeEnemy(id);
    };
    this.netEvents['surv:enemy'] = ({ remove }) => remove && this.removeEnemy(remove);
    this.netEvents['surv:dead'] = () => {
      this.game.player.dead = true;
      audio.play('death');
      this.hud.showCenter('💀 Has caído', 'Reapareces en el campamento…', 2800);
    };
    this.netEvents['surv:hurt'] = () => {
      this.hud.flashHurt();
      audio.play('hurt');
    };
  }

  skyTime(now) {
    const s = this.s;
    const f = (((now - s.start) % s.dayLength) + s.dayLength) % s.dayLength / s.dayLength;
    this.dayFrac = f;
    if (f < s.nightStart) return 0.23 + (f / s.nightStart) * 0.55;
    return (0.78 + ((f - s.nightStart) / (1 - s.nightStart)) * 0.45) % 1;
  }

  renderMe() {
    const m = this.me;
    this.hpBar.style.width = `${m.hp}%`;
    this.foodBar.style.width = `${m.hunger}%`;
    this.invEl.textContent = `🪵 ${m.inv.wood}   🪨 ${m.inv.stone}   🫐 ${m.inv.berry}`;
  }

  setNode(id, alive) {
    const e = this.game.built.objects.get(id);
    if (!e) return;
    e.hidden = !alive;
    if (e.mesh) e.mesh.visible = alive;
    e.colliders.forEach((c) => (c.enabled = alive));
  }

  addBlock(b) {
    if (this.blocks.has(b.id)) return;
    const mesh = new THREE.Mesh(boxGeo(2, 2, 2), material(b.mat === 'stone' ? 'stone' : 'wood', { color: b.mat === 'stone' ? '#9e9e9e' : '#a1887f' }));
    mesh.position.set(b.x, b.y, b.z);
    mesh.castShadow = mesh.receiveShadow = true;
    this.game.scene.add(mesh);
    const col = this.game.physics.add({ x: b.x, y: b.y, z: b.z, hx: 1, hy: 1, hz: 1, surface: b.mat === 'stone' ? 'stone' : 'wood' });
    this.blocks.set(b.id, { b, mesh, col });
  }

  removeBlock(id) {
    const e = this.blocks.get(id);
    if (!e) return;
    this.game.scene.remove(e.mesh);
    this.game.physics.remove(e.col);
    this.blocks.delete(id);
  }

  upsertEnemy(e) {
    let en = this.enemies.get(e.id);
    if (!en) {
      const g = new THREE.Group();
      const body = new THREE.Mesh(new THREE.BoxGeometry(1.4, 1.1, 1.4), new THREE.MeshStandardMaterial({ color: '#7e57c2', transparent: true, opacity: 0.85, roughness: 0.3 }));
      body.position.y = 0.55;
      body.castShadow = true;
      const eyeM = new THREE.MeshBasicMaterial({ color: '#ffeb3b' });
      for (const x of [-0.3, 0.3]) {
        const eye = new THREE.Mesh(new THREE.BoxGeometry(0.22, 0.22, 0.05), eyeM);
        eye.position.set(x, 0.75, 0.71);
        g.add(eye);
      }
      g.add(body);
      g.position.set(...e.p);
      this.game.scene.add(g);
      en = { mesh: g, body, target: new THREE.Vector3(...e.p), hp: e.hp };
      this.enemies.set(e.id, en);
    }
    en.target.set(...e.p);
    if (e.hp < en.hp) en.flash = 0.2;
    en.hp = e.hp;
  }

  removeEnemy(id) {
    const en = this.enemies.get(id);
    if (!en) return;
    this.game.scene.remove(en.mesh);
    en.mesh.traverse((c) => c.geometry?.dispose());
    this.enemies.delete(id);
  }

  promptFor(e) {
    if (e.o.t === 'resource') return { tree: 'Talar árbol (madera)', rock: 'Picar roca (piedra)', bush: 'Recoger bayas' }[e.o.kind];
    return undefined;
  }

  onInteract(e) {
    if (e.o.t !== 'resource') return false;
    this.gather(e.o.id);
    return true;
  }

  async gather(id) {
    this.game.player.attackTimer = 0.3;
    const r = await net.request('mode', { name: 'gather', data: { id } });
    if (r.ok) audio.play('chop', this.game.player.position);
    else if (r.error && r.error !== 'Demasiado rápido') toast(r.error, 'warn', 1500);
  }

  aimPoint() {
    const cam = this.game.camera;
    const dir = new THREE.Vector3();
    cam.getWorldDirection(dir);
    const o = cam.position;
    const hit = this.game.physics.raycast(o.x, o.y, o.z, dir.x, dir.y, dir.z, this.game.cam.distance + 10, 0.2);
    if (hit.dist >= this.game.cam.distance + 10) return null;
    return { p: o.clone().addScaledVector(dir, hit.dist), dir, collider: hit.collider };
  }

  async primary() {
    const p = this.game.player;
    if (p.dead) return;
    if (this.build) {
      if (!this.ghost.visible) return;
      const r = await net.request('mode', { name: 'build', data: { x: this.ghost.position.x, y: this.ghost.position.y, z: this.ghost.position.z, mat: this.mat } });
      if (r.error) toast(r.error, 'warn', 1500);
      return;
    }
    // Atacar a la criatura más cercana delante del jugador
    let best = null, bd = 3.8;
    for (const [id, en] of this.enemies) {
      const d = Math.hypot(en.mesh.position.x - p.body.x, en.mesh.position.z - p.body.z);
      if (d < bd) { bd = d; best = id; }
    }
    p.attackTimer = 0.3;
    if (best) {
      const r = await net.request('mode', { name: 'attack', data: { id: best } });
      if (r.ok) audio.play('hit', p.position);
      return;
    }
    // Recoger el recurso más cercano
    let node = null, nd = 4.2;
    for (const e of this.game.built.interactables) {
      if (e.o.t !== 'resource' || e.hidden) continue;
      const d = Math.hypot(e.o.p[0] - p.body.x, e.o.p[2] - p.body.z);
      if (d < nd) { nd = d; node = e; }
    }
    if (node) this.gather(node.o.id);
  }

  update(dt) {
    const p = this.game.player;
    if (input.pressed('KeyB')) {
      this.build = !this.build;
      toast(this.build ? 'Modo construcción: clic para colocar (2 de material)' : 'Modo construcción desactivado', 'info', 1800);
    }
    if (input.pressed('KeyR')) this.mat = this.mat === 'wood' ? 'stone' : 'wood';
    if (input.pressed('KeyF')) net.request('mode', { name: 'eat' }).then((r) => r.error ? toast(r.error, 'warn', 1500) : audio.play('coin'));
    if (input.pressed('Mouse0') && (input.locked || input.isTouch)) this.primary();
    this.buildEl.textContent = this.build ? `🧱 Construyendo con ${this.mat === 'wood' ? 'madera' : 'piedra'}` : '';
    const night = this.dayFrac >= this.s.nightStart;
    this.dayEl.textContent = night ? '🌙 Noche: ¡protégete!' : `☀️ Día · la noche llega en ${Math.max(0, Math.round((this.s.nightStart - this.dayFrac) * this.s.dayLength / 1000))} s`;

    // Bloque fantasma de construcción
    this.ghost.visible = false;
    if (this.build && !p.dead) {
      const a = this.aimPoint();
      if (a) {
        const q = a.p.clone().addScaledVector(a.dir, -0.6);
        const gp = new THREE.Vector3(Math.round(q.x / 2) * 2, Math.round(q.y / 2) * 2, Math.round(q.z / 2) * 2);
        if (gp.distanceTo(new THREE.Vector3(p.body.x, p.body.y, p.body.z)) < 9) {
          this.ghost.position.copy(gp);
          this.ghost.visible = true;
          this.ghost.material.color.set(this.mat === 'wood' ? '#ffcc80' : '#e0e0e0');
          if (input.pressed('KeyX') && a.collider) {
            const found = [...this.blocks.values()].find((bb) => bb.col === a.collider);
            if (found) net.request('mode', { name: 'break', data: { id: found.b.id } });
          }
        }
      }
    }

    // Criaturas: interpolación y salto
    const t = performance.now() / 1000;
    for (const en of this.enemies.values()) {
      const m = en.mesh;
      const prev = m.position.clone();
      m.position.lerp(en.target, Math.min(1, dt * 10));
      const dx = m.position.x - prev.x, dz = m.position.z - prev.z;
      if (Math.hypot(dx, dz) > 0.001) m.rotation.y = Math.atan2(dx, dz);
      en.body.scale.y = 1 + Math.sin(t * 8 + m.position.x) * 0.12;
      en.body.material.color.set(en.flash > 0 ? '#ff5252' : '#7e57c2');
      if (en.flash > 0) en.flash -= dt;
    }
  }

  dispose() {
    for (const id of [...this.enemies.keys()]) this.removeEnemy(id);
    for (const id of [...this.blocks.keys()]) this.removeBlock(id);
  }
}

// --- La Plaza -----------------------------------------------------------------
class HangoutClient extends BaseClient {
  constructor(game, state) {
    super(game, state);
    this.hud.setObjectives(state.objectives);
    this.hint = ['[2] bailar  [4] sentarse  [E] sentarse en bancos'];
  }
}

// --- Teclas ASMR (ASMR) ---------------------------------------------------------------
// Escala pentatónica: cada tecla tiene su nota, así caminar suena a música.
const PENTA = [261.6, 293.7, 329.6, 392.0, 440.0, 523.3, 587.3, 659.3, 784.0, 880.0];
function keySound(o) {
  const label = o.label || '';
  if (!label) return { note: 130.8, thock: 110 }; // barra espaciadora: grave
  let h = 0;
  for (const ch of label) h += ch.charCodeAt(0);
  return { note: PENTA[h % PENTA.length], thock: 150 + (h % 5) * 12 };
}

class KeysClient extends ObbyClient {
  constructor(game, state) {
    super(game, state);
    this.customAudio = true;
    this.hint = ['Camina sobre las teclas: cada una suena distinto 🎹', '[R] reiniciar recorrido'];
    this.under = new Map(); // id del jugador -> id de la tecla que pisa
    this.pressed = new Map(); // id de tecla -> nivel de pulsación (0..1)
  }

  startAudio() {
    audio.setAmbient(null);
    audio.startMusic();
    audio.loop('rain', { noise: true, filter: 2600, vol: 0.022 });
  }

  /** Tecla bajo una posición (o null). */
  keyAt(x, y, z) {
    const g = this.game.physics.groundAt(x, z, 0.3, y + 0.35);
    const o = g.c?.data;
    return o && o.t === 'keycap' && Math.abs(g.y - y) < 0.4 ? o : null;
  }

  step(id, o, pos, local) {
    const prev = this.under.get(id);
    if ((prev || null) === (o ? o.id : null)) return;
    this.under.set(id, o ? o.id : null);
    if (prev) audio.play('keyUp', local ? null : pos);
    if (o) audio.play('key', local ? null : pos, { ...keySound(o), vol: local ? 1 : 0.8, maxDist: 45 });
  }

  update(dt) {
    super.update(dt);
    const g = this.game;
    const b = g.player.body;
    const down = new Set();
    const mine = b.onGround && b.ground?.data?.t === 'keycap' ? b.ground.data : null;
    this.step('me', mine, null, true);
    if (mine) down.add(mine.id);
    for (const r of g.remotes.values()) {
      const o = this.keyAt(r.pos.x, r.pos.y, r.pos.z);
      this.step(r.id, o, { x: r.pos.x, y: r.pos.y, z: r.pos.z }, false);
      if (o) down.add(o.id);
    }
    // Animación: las teclas pisadas se hunden y vuelven a subir al soltarlas
    for (const e of g.built.keycaps) {
      if (!e.mesh) continue;
      const target = down.has(e.o.id) ? 1 : 0;
      const cur = this.pressed.get(e.o.id) || 0;
      const next = cur + (target - cur) * Math.min(1, dt * (target ? 30 : 12));
      this.pressed.set(e.o.id, next);
      if (!e.o.axis) e.mesh.position.y = e.o.p[1] - next * 0.32;
      else e.mesh.position.y -= next * 0.32;
    }
  }
}

export function createClientMode(name, game, state) {
  switch (name) {
    case 'asalto': return new AsaltoClient(game, state);
    case 'pesadilla': return new PesadillaClient(game, state);
    case 'desastres': return new DesastresClient(game, state);
    case 'huerto': return new HuertoClient(game, state);
    case 'bloques': return new BloquesClient(game, state);
    case 'keys': return new KeysClient(game, state);
    case 'onlyup': return new OnlyUpClient(game, state);
    case 'horror': return new HorrorClient(game, state);
    case 'royale': return new RoyaleClient(game, state);
    case 'rocket': return new RocketClient(game, state);
    case 'castores': return new CastoresClient(game, state);
    case 'city': return new CityClient(game, state);
    case 'obby': return new ObbyClient(game, state);
    case 'racing': return new RacingClient(game, state);
    case 'survival': return new SurvivalClient(game, state);
    case 'hangout': return new HangoutClient(game, state);
    default: return new CustomClient(game, state);
  }
}
