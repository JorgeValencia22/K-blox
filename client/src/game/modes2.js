// Modos de juego del cliente (segunda tanda): Only Up, Terror, Royale, Rocket y Castores.
import * as THREE from 'three';
import { net } from '../core/net.js';
import { input } from '../engine/input.js';
import { audio } from '../audio/audio.js';
import { store } from '../core/store.js';
import { h, toast, clear, formatTime } from '../ui/dom.js';
import { material } from '../engine/materials.js';
import { boxGeo } from '../world/objectParts.js';
import { flameActive } from '../../../shared/worlds/castores.js';

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
}

const mmss = (ms) => {
  const s = Math.max(0, Math.ceil(ms / 1000));
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`;
};

// =====================================================================================
// Kest Only Up
// =====================================================================================
export class OnlyUpClient extends Base {
  constructor(game, state) {
    super(game, state);
    const up = state.up || {};
    this.record = up.record || 0;
    this.summit = up.summit || game.world.meta.summit;
    this.zones = game.world.meta.zones;
    this.altEl = h('div.big', '0 m');
    this.recEl = h('div.small.muted');
    this.zoneEl = h('div.small');
    this.boardEl = h('div.small.muted', { style: { textAlign: 'left', marginTop: '4px' } });
    this.hud.setMode(h('div.hud-card', this.altEl, this.zoneEl, this.recEl), h('div.hud-card', h('b.small', 'Más alto'), this.boardEl));
    this.hint = ['Sin puntos de control: ¡no mires abajo!'];
    this.netEvents['up:board'] = (b) => {
      clear(this.boardEl).append(...b.map((r, i) => h('div', `${i + 1}. ${r.name} · ${r.h} m`)));
    };
    this.netEvents['up:summit'] = ({ time }) => {
      audio.play('win');
      this.hud.showCenter('🏔️ ¡LA CIMA!', `Has escalado en ${formatTime(time)}`, 5000);
    };
    this.customAudio = true;
  }

  startAudio() {
    audio.startMusic();
    audio.loop('wind-up', { noise: true, filter: 500, vol: 0.02 });
  }

  skyTime() {
    // Al subir se hace de noche: arriba del todo estás en el espacio
    const y = this.game.player.body.y;
    const k = Math.min(1, Math.max(0, (y - 150) / 60));
    return 0.36 + k * 0.56;
  }

  update() {
    const y = this.game.player.body.y;
    this.altEl.textContent = `⬆ ${Math.max(0, Math.round(y))} m`;
    if (y > this.record) this.record = y;
    this.recEl.textContent = `Récord: ${Math.round(this.record)} m · Cima: ${Math.round(this.summit)} m`;
    const z = this.zones.find((zz) => y < zz.until) || this.zones.at(-1);
    this.zoneEl.textContent = z.name;
    audio.setLoopVolume('wind-up', 0.015 + Math.min(0.08, y / 2500));
  }
}

// =====================================================================================
// Kest Terror
// =====================================================================================
export class HorrorClient extends Base {
  constructor(game, state) {
    super(game, state);
    this.customAudio = true;
    this.blockEmotes = true;
    this.hs = state.horror || { collected: [], total: 6, gateOpen: false };
    this.stamina = 100;
    this.exhausted = false;
    this.flashOn = true;
    this.beatAcc = 0;
    this.whisperAcc = 0;
    this.hint = ['[F] linterna  [Shift] correr (agota el aguante)', 'Encuentra las almas y escapa por el este'];

    // Linterna
    this.flash = new THREE.SpotLight('#fff1d6', 900, 42, 0.5, 0.55, 1.4);
    // Halo tenue alrededor del jugador para no quedar totalmente a ciegas
    this.aura = new THREE.PointLight('#8fa8ff', 6, 9, 1.5);
    game.scene.add(this.aura);
    this.flashTarget = new THREE.Object3D();
    game.scene.add(this.flash, this.flashTarget);
    this.flash.target = this.flashTarget;

    // La Sombra
    this.mon = this.buildMonster();
    game.scene.add(this.mon.root);
    this.monPos = new THREE.Vector3(0, 0, 0);
    this.monTarget = null;
    this.monChase = false;

    this.soulsEl = h('div.big', '');
    this.staminaBar = h('div', { style: { width: '100%', background: 'linear-gradient(90deg,#90caf9,#e1f5fe)' } });
    this.hud.setMode(h('div.hud-card', this.soulsEl, h('div.bar', { style: { width: '160px', marginTop: '6px' } }, this.staminaBar)));
    this.applyState();

    this.netEvents.horror = (s) => {
      const opened = !this.hs.gateOpen && s.gateOpen;
      if (s.round !== this.hs.round) this.resetSouls();
      this.hs = s;
      this.applyState();
      if (opened) {
        audio.play('win');
        this.hud.showCenter('🔓', 'La verja se ha abierto. ¡Corred al este!', 3500);
      }
    };
    this.netEvents['horror:caught'] = ({ id, name }) => {
      if (id === store.user.id) this.jumpscare();
      else toast(`😱 La Sombra ha atrapado a ${name}`, 'warn');
    };
  }

  buildMonster() {
    const root = new THREE.Group();
    const dark = new THREE.MeshStandardMaterial({ color: '#050505', roughness: 1 });
    const body = new THREE.Mesh(new THREE.BoxGeometry(1.1, 2.7, 0.6), dark);
    body.position.y = 1.9;
    const head = new THREE.Mesh(new THREE.BoxGeometry(0.8, 0.9, 0.7), dark);
    head.position.y = 3.7;
    const eyeMat = new THREE.MeshBasicMaterial({ color: '#ff1744' });
    const eyes = [-0.18, 0.18].map((x) => {
      const e = new THREE.Mesh(new THREE.BoxGeometry(0.14, 0.08, 0.05), eyeMat);
      e.position.set(x, 3.8, 0.36);
      return e;
    });
    const arms = [-0.75, 0.75].map((x) => {
      const a = new THREE.Mesh(new THREE.BoxGeometry(0.28, 2.6, 0.28), dark);
      a.position.set(x, 2.0, 0.1);
      return a;
    });
    const legs = [-0.3, 0.3].map((x) => {
      const l = new THREE.Mesh(new THREE.BoxGeometry(0.35, 1.0, 0.35), dark);
      l.position.set(x, 0.5, 0);
      return l;
    });
    root.add(body, head, ...eyes, ...arms, ...legs);
    const glow = new THREE.PointLight('#ff1744', 0, 7, 2);
    glow.position.set(0, 3.8, 0.8);
    root.add(glow);
    return { root, eyeMat, arms, glow };
  }

  resetSouls() {
    for (const e of this.game.built.objects.values()) {
      if (e.o.t === 'gem' && e.o.id.startsWith('soul')) {
        e.hidden = false;
        e.pending = false;
        if (e.mesh) e.mesh.visible = true;
      }
    }
  }

  applyState() {
    const s = this.hs;
    for (const id of s.collected || []) {
      const e = this.game.built.objects.get(id);
      if (e && !e.hidden) this.game.hideObject(e);
    }
    const gate = this.game.built.objects.get('exitgate');
    if (gate) {
      gate.colliders.forEach((c) => (c.enabled = !s.gateOpen));
      if (gate.mesh) gate.mesh.visible = !s.gateOpen;
    }
    this.soulsEl.textContent = s.gateOpen ? '🔓 ¡A la salida!' : `👻 Almas ${s.collected.length}/${s.total}`;
  }

  jumpscare() {
    audio.play('scream');
    const el = h('div', { style: { position: 'absolute', inset: 0, background: 'radial-gradient(circle, rgba(0,0,0,0.2), #000 70%)', display: 'grid', placeContent: 'center', fontSize: '160px', zIndex: 5, pointerEvents: 'none', animation: 'hurt 1.8s forwards' } }, '👁️👁️');
    this.hud.el.appendChild(el);
    setTimeout(() => el.remove(), 1800);
    this.hud.showCenter('😱', 'La Sombra te ha atrapado…', 1800);
    this.game.player.dead = true;
  }

  startAudio() {
    audio.stopMusic();
    audio.setAmbient(null);
    audio.loop('drone', { freq: 42, type: 'sawtooth', filter: 180, vol: 0.06 });
    audio.loop('drone2', { freq: 63.5, type: 'triangle', filter: 260, vol: 0.03 });
    audio.loop('wind-h', { noise: true, filter: 350, vol: 0.04 });
  }

  skyTime() {
    return 0.02;
  }

  afterSky() {
    // Oscuridad casi total: la linterna es tu mejor amiga
    const g = this.game;
    g.sky.hemi.intensity = 0.16;
    g.sky.sun.intensity = 0.08;
    g.sky.stars.material.opacity = 0.35;
    g.scene.fog.color.set('#020306');
    g.scene.fog.near = 8;
    g.scene.fog.far = 48;
    g.sky.uniforms.top.value.set('#020208');
    g.sky.uniforms.bottom.value.set('#07070d');
  }

  filterCtl(ctl, dt) {
    const moving = Math.abs(ctl.move.x) + Math.abs(ctl.move.y) > 0.1;
    if (ctl.run && moving && !this.exhausted) {
      this.stamina -= 28 * dt;
      if (this.stamina <= 0) { this.stamina = 0; this.exhausted = true; }
    } else {
      this.stamina = Math.min(100, this.stamina + 14 * dt);
      if (this.exhausted && this.stamina > 35) this.exhausted = false;
    }
    if (this.exhausted) ctl.run = false;
  }

  onSnap(m) {
    if (!m.mon) return;
    const [x, z, ry, chase] = m.mon;
    this.monTarget = { x, z, ry };
    this.monChase = !!chase;
  }

  update(dt) {
    const g = this.game;
    const b = g.player.body;
    if (input.pressed('KeyF')) {
      this.flashOn = !this.flashOn;
      audio.play('switch');
    }
    // Linterna: sale del pecho y apunta hacia donde mira la cámara
    const fwd = new THREE.Vector3();
    g.camera.getWorldDirection(fwd);
    this.flash.position.set(b.x, b.y + 1.5, b.z);
    this.flashTarget.position.set(b.x + fwd.x * 10, b.y + 1.5 + fwd.y * 10, b.z + fwd.z * 10);
    this.flash.intensity = this.flashOn ? 900 : 0;
    this.aura.position.set(b.x, b.y + 2.2, b.z);

    // Monstruo (interpolado)
    if (this.monTarget) {
      const t = this.monTarget;
      this.monPos.x += (t.x - this.monPos.x) * Math.min(1, dt * 10);
      this.monPos.z += (t.z - this.monPos.z) * Math.min(1, dt * 10);
      this.mon.root.position.set(this.monPos.x, 0, this.monPos.z);
      this.mon.root.rotation.y = t.ry;
      const sway = Math.sin(performance.now() / (this.monChase ? 110 : 260));
      this.mon.arms[0].rotation.x = sway * 0.6;
      this.mon.arms[1].rotation.x = -sway * 0.6;
      this.mon.eyeMat.color.set(this.monChase ? '#ff1744' : '#7f0000');
      this.mon.glow.intensity = this.monChase ? 6 : 1.5;
    }
    // Latidos más rápidos cuanto más cerca está
    const d = Math.hypot(this.monPos.x - b.x, this.monPos.z - b.z);
    if (d < 32) {
      this.beatAcc += dt;
      const interval = 0.35 + (d / 32) * 1.1;
      if (this.beatAcc > interval) {
        this.beatAcc = 0;
        audio.play('heartbeat', null, { vol: 1 - d / 40 });
      }
    }
    this.whisperAcc += dt;
    if (this.whisperAcc > 9 + Math.random() * 10) {
      this.whisperAcc = 0;
      audio.play('whisper', { x: b.x + (Math.random() - 0.5) * 20, y: b.y + 1, z: b.z + (Math.random() - 0.5) * 20 });
    }
    this.staminaBar.style.width = `${this.stamina}%`;
    this.staminaBar.style.opacity = this.exhausted ? 0.4 : 1;
  }

  dispose() {
    this.game.scene.remove(this.flash, this.flashTarget, this.mon.root, this.aura);
  }
}

// =====================================================================================
// Kest Royale
// =====================================================================================
export class RoyaleClient extends Base {
  constructor(game, state) {
    super(game, state);
    this.blockEmotes = true;
    this.weapons = state.weapons || {};
    this.rs = state.royale || { phase: 'lobby', pieces: [], looted: [] };
    this.me = null;
    this.storm = null;
    this.alive = 0;
    this.build = false;
    this.buildKind = 'wall';
    this.nextShot = 0;
    this.pieces = new Map();
    this.tracers = [];
    this.spectating = false;
    this.lastCount = null;

    this.statusEl = h('div.big', '');
    this.subEl = h('div.small.muted', '');
    this.feedEl = h('div.small', { style: { textAlign: 'left', maxWidth: '240px' } });
    this.hud.setMode(h('div.hud-card', this.statusEl, this.subEl), h('div.hud-card', this.feedEl));
    this.hpBar = h('div', { style: { width: '100%' } });
    this.shBar = h('div', { style: { width: '0%', background: 'linear-gradient(90deg,#29b6f6,#81d4fa)' } });
    this.weaponEl = h('div.small');
    this.matsEl = h('div.small.muted');
    this.bottom = h('div.hud-card.bars-surv', { style: { position: 'absolute', left: '50%', bottom: '14px', transform: 'translateX(-50%)', width: '260px' } },
      h('div.row.small', '🛡️', h('div.bar.grow', this.shBar)),
      h('div.row.small', '❤️', h('div.bar.hp.grow', this.hpBar)),
      this.weaponEl, this.matsEl);
    this.hud.el.appendChild(this.bottom);
    this.hud.crosshair.classList.remove('hidden');
    this.hint = ['[G] empezar batalla  [Clic] disparar  [1-3] armas', '[B] construir  [R] muro/rampa'];
    this.hud.addTouchButton('Fuego', 'Mouse0', { right: '120px', bottom: '150px', width: '64px', height: '64px', fontSize: '11px' });
    this.hud.addTouchButton('🧱', 'KeyB', { right: '190px', top: '70px', width: '50px', height: '50px' });
    this.hud.addTouchButton('▶', 'KeyG', { right: '120px', top: '70px', width: '50px', height: '50px' });

    // Tormenta: cilindro translúcido gigante
    const sm = new THREE.MeshBasicMaterial({ color: '#a855f7', transparent: true, opacity: 0.22, side: THREE.DoubleSide, depthWrite: false });
    this.stormMesh = new THREE.Mesh(new THREE.CylinderGeometry(1, 1, 160, 64, 1, true), sm);
    this.stormMesh.visible = false;
    game.scene.add(this.stormMesh);
    this.ghost = new THREE.Mesh(new THREE.BoxGeometry(4, 4, 0.4), new THREE.MeshBasicMaterial({ color: '#4fc3f7', transparent: true, opacity: 0.35, depthWrite: false }));
    this.ghost.visible = false;
    game.scene.add(this.ghost);

    for (const pc of this.rs.pieces || []) this.addPiece(pc);
    this.applyLooted();
    this.renderStatus();

    this.netEvents.royale = (s) => {
      const prev = this.rs.phase;
      this.rs = s;
      if (s.phase === 'lobby' && prev !== 'lobby') this.resetRound();
      if (s.phase === 'match' && prev === 'countdown') {
        audio.play('countdown', null, { go: true });
        this.hud.showCenter('¡A LUCHAR!', '', 1200);
      }
      if (s.phase === 'results') this.hud.showCenter(s.winner ? `👑 ${s.winner}` : 'Fin', 'gana la batalla', 6000);
      this.applyLooted();
      this.renderStatus();
    };
    this.netEvents['royale:me'] = (m) => { this.me = m; this.renderMe(); };
    this.netEvents['royale:hurt'] = () => { this.hud.flashHurt(); audio.play('hurt'); };
    this.netEvents['royale:dead'] = ({ place, kills, win }) => {
      if (win) {
        audio.play('levelup');
        this.hud.showCenter('👑 ¡VICTORIA!', `${kills} eliminaciones`, 6000);
        return;
      }
      audio.play('death');
      this.hud.showCenter(`Puesto #${place}`, `${kills} eliminaciones · ahora eres espectador`, 4500);
      this.spectating = true;
      this.game.player.model.root.visible = false;
    };
    this.netEvents['royale:feed'] = ({ victim, victimName, killer, how }) => {
      const line = killer ? `${killer} ${how} ${victimName}` : `${how} ${victimName}`;
      this.feedEl.prepend(h('div', '💀 ' + line));
      while (this.feedEl.children.length > 5) this.feedEl.lastChild.remove();
      const r = this.game.remotes.get(victim);
      if (r) r.model.root.visible = false;
    };
    this.netEvents['royale:shot'] = ({ from, o, e }) => {
      if (from === store.user.id) return;
      this.tracer(o, e, '#ffe082');
      audio.play('shoot', { x: o[0], y: o[1], z: o[2] }, { maxDist: 80 });
    };
    this.netEvents['royale:build'] = ({ add, remove, clear: clr }) => {
      if (add) { this.addPiece(add); audio.play('build', { x: add.x, y: add.y, z: add.z }); }
      if (remove) this.removePiece(remove);
      if (clr) for (const id of [...this.pieces.keys()]) this.removePiece(id);
    };
    this.netEvents['royale:chest'] = ({ id }) => {
      const e = this.game.built.objects.get(id);
      if (e) { e.opened = true; if (e.mesh) e.mesh.userData.targetOpen = true; }
    };
  }

  resetRound() {
    this.spectating = false;
    this.me = null;
    this.game.player.model.root.visible = true;
    for (const r of this.game.remotes.values()) r.model.root.visible = true;
    for (const e of this.game.built.objects.values()) {
      if (e.o.t === 'chest') { e.opened = false; if (e.mesh) e.mesh.userData.targetOpen = false; }
    }
    clear(this.feedEl);
    this.renderMe();
  }

  applyLooted() {
    for (const id of this.rs.looted || []) {
      const e = this.game.built.objects.get(id);
      if (e) { e.opened = true; if (e.mesh) e.mesh.userData.targetOpen = true; }
    }
  }

  get frozen() {
    return this.spectating || (this.rs.phase === 'countdown' && !!this.me);
  }

  decorate(model) {
    this.addGun(model);
  }

  decorateRemote(r) {
    if (!r.npc) this.addGun(r.model);
  }

  addGun(model) {
    const gun = new THREE.Mesh(new THREE.BoxGeometry(0.14, 0.2, 0.75), new THREE.MeshStandardMaterial({ color: '#263238', roughness: 0.4 }));
    gun.position.set(0, -0.7, 0.3);
    model.rArm.add(gun);
  }

  renderStatus() {
    const s = this.rs;
    if (s.phase === 'lobby') { this.statusEl.textContent = 'Sala de espera'; this.subEl.textContent = 'Pulsa G para empezar (se completa con bots)'; }
    else if (s.phase === 'countdown') { this.statusEl.textContent = '¡Preparados!'; this.subEl.textContent = `${s.total} combatientes`; }
    else if (s.phase === 'results') { this.statusEl.textContent = 'Resultados'; this.subEl.textContent = 'Nueva partida en unos segundos'; }
  }

  renderMe() {
    const m = this.me;
    this.bottom.style.display = m ? '' : 'none';
    if (!m) return;
    this.hpBar.style.width = `${m.hp}%`;
    this.shBar.style.width = `${m.shield}%`;
    const w = this.weapons[m.weapon];
    this.weaponEl.textContent = `🔫 ${w?.name || m.weapon}: ${m.ammo[m.weapon]} · Armas: ${m.weapons.map((x, i) => `${i + 1}.${this.weapons[x]?.name || x}`).join('  ')}`;
    this.matsEl.textContent = `🪵 Materiales: ${m.mats}${this.build ? ` · construyendo ${this.buildKind === 'wall' ? 'muro' : 'rampa'}` : ''}  ·  💀 ${m.kills}`;
  }

  addPiece(pc) {
    if (this.pieces.has(pc.id)) return;
    const g = this.game;
    const mat = material('wood', { color: '#bcaaa4' });
    let mesh, col;
    const ry = (pc.ry * Math.PI) / 180;
    if (pc.kind === 'wall') {
      mesh = new THREE.Mesh(boxGeo(4, 4, 0.4), mat);
      mesh.position.set(...pc.box.p);
      mesh.rotation.y = ry;
      col = g.physics.add({ x: pc.box.p[0], y: pc.box.p[1], z: pc.box.p[2], hx: 2, hy: 2, hz: 0.2, ry, surface: 'wood' });
    } else {
      const geo = new THREE.BufferGeometry();
      // Rampa: cuña de 4x4x4 que sube hacia +z local
      const v = [[-2, -2, -2], [2, -2, -2], [2, -2, 2], [-2, -2, 2], [-2, 2, 2], [2, 2, 2]];
      const tris = [[0, 2, 1], [0, 3, 2], [3, 5, 2], [3, 4, 5], [0, 1, 5], [0, 5, 4], [0, 4, 3], [1, 2, 5]];
      geo.setAttribute('position', new THREE.Float32BufferAttribute(tris.flat().flatMap((i) => v[i]), 3));
      geo.computeVertexNormals();
      mesh = new THREE.Mesh(geo, material('wood', { color: '#a1887f' }));
      mesh.position.set(...pc.box.p);
      mesh.rotation.y = ry;
      col = g.physics.add({ kind: 'ramp', x: pc.box.p[0], y: pc.box.p[1], z: pc.box.p[2], hx: 2, hy: 2, hz: 2, ry, surface: 'wood' });
    }
    mesh.castShadow = mesh.receiveShadow = true;
    g.scene.add(mesh);
    this.pieces.set(pc.id, { mesh, col });
  }

  removePiece(id) {
    const p = this.pieces.get(id);
    if (!p) return;
    this.game.scene.remove(p.mesh);
    p.mesh.geometry.dispose();
    this.game.physics.remove(p.col);
    this.pieces.delete(id);
  }

  onSnap(m) {
    if (m.st) {
      const [x, z, r, phase, t1] = m.st;
      this.storm = { x, z, r, phase, t1: t1 * 1000 };
    }
    if (m.al != null) this.alive = m.al;
  }

  tracer(o, e, color) {
    const geo = new THREE.BufferGeometry().setFromPoints([new THREE.Vector3(...o), new THREE.Vector3(...e)]);
    const line = new THREE.Line(geo, new THREE.LineBasicMaterial({ color, transparent: true, opacity: 0.9 }));
    this.game.scene.add(line);
    this.tracers.push({ line, until: performance.now() + 120 });
  }

  /** Punto al que apunta la mira (rayo desde la cámara contra el mundo y los jugadores). */
  aimPoint() {
    const g = this.game;
    const cam = g.camera;
    const dir = new THREE.Vector3();
    cam.getWorldDirection(dir);
    const o = cam.position;
    const hit = g.physics.raycast(o.x, o.y, o.z, dir.x, dir.y, dir.z, 140, 0.5);
    let best = hit.dist;
    const ray = new THREE.Ray(o.clone(), dir);
    for (const r of g.remotes.values()) {
      if (!r.model.root.visible) continue;
      const s = new THREE.Sphere(new THREE.Vector3(r.pos.x, r.pos.y + 1.1, r.pos.z), 0.9);
      const p = ray.intersectSphere(s, new THREE.Vector3());
      if (p) { const d = p.distanceTo(o); if (d < best) best = d; }
    }
    // Evita apuntar a algo situado entre la cámara y el jugador
    const b = g.player.body;
    const toPlayer = new THREE.Vector3(b.x, b.y + 1.6, b.z).sub(o).dot(dir);
    best = Math.max(best, toPlayer + 1);
    return o.clone().addScaledVector(dir, best);
  }

  async fire() {
    const m = this.me;
    if (!m || !m.alive || this.rs.phase !== 'match') return;
    const w = this.weapons[m.weapon];
    const now = performance.now();
    if (now < this.nextShot || m.ammo[m.weapon] <= 0) {
      if (m.ammo[m.weapon] <= 0 && now > this.nextShot) { audio.ui('error'); this.nextShot = now + 400; }
      return;
    }
    this.nextShot = now + w.cd;
    const b = this.game.player.body;
    const head = new THREE.Vector3(b.x, b.y + 1.6, b.z);
    const aim = this.aimPoint();
    const d = aim.clone().sub(head).normalize();
    this.game.player.attackTimer = 0.2;
    audio.play('shoot');
    this.tracer(head.toArray(), aim.toArray(), '#fff59d');
    const r = await net.request('mode', { name: 'shoot', data: { d: d.toArray() } });
    if (r.hits?.length) {
      audio.play('hitmarker');
      this.hud.crosshair.style.background = '#ff5252';
      setTimeout(() => (this.hud.crosshair.style.background = ''), 120);
    }
  }

  async placePiece() {
    if (!this.ghost.visible) return;
    const g = this.ghost.userData;
    const r = await net.request('mode', { name: 'build', data: g });
    if (r.error) toast(r.error, 'warn', 1500);
  }

  onInteract(e) {
    if (e.o.t !== 'chest') return false;
    net.request('interact', { id: e.o.id }).then((r) => {
      if (r.error) return toast(r.error, 'warn', 1500);
      e.opened = true;
      if (e.mesh) e.mesh.userData.targetOpen = true;
      audio.play('chest');
      toast(`🎁 ${r.loot}`, 'reward', 2500);
    });
    return true;
  }

  promptFor(e) {
    if (e.o.t === 'chest') return e.opened || this.rs.phase !== 'match' ? null : 'Abrir cofre de botín';
    return undefined;
  }

  update(dt) {
    const g = this.game;
    const now = g.now();
    if (input.pressed('KeyG') && this.rs.phase === 'lobby') {
      net.request('mode', { name: 'start' }).then((r) => r.error && toast(r.error, 'warn'));
    }
    if (this.rs.phase === 'countdown') {
      const left = Math.ceil((this.rs.startAt - now) / 1000);
      if (left !== this.lastCount && left > 0) { this.lastCount = left; audio.play('countdown'); this.hud.showCenter(String(left), '', 900); }
    }
    // Armas
    if (this.me) {
      ['Digit1', 'Digit2', 'Digit3'].forEach((k, i) => {
        if (input.pressed(k) && this.me.weapons[i]) net.request('mode', { name: 'equip', data: { w: this.me.weapons[i] } });
      });
    }
    if (input.pressed('KeyB')) { this.build = !this.build; this.renderMe(); }
    if (input.pressed('KeyR')) { this.buildKind = this.buildKind === 'wall' ? 'ramp' : 'wall'; this.renderMe(); }

    // Fantasma de construcción
    this.ghost.visible = false;
    if (this.build && this.me?.alive && this.rs.phase === 'match') {
      const b = g.player.body;
      const yaw = g.cam.yaw + Math.PI; // dirección a la que mira la cámara
      const fx = Math.sin(yaw), fz = Math.cos(yaw);
      const ry = ((Math.round((Math.atan2(fx, fz) * 180) / Math.PI / 90) * 90) % 360 + 360) % 360;
      const cx = Math.round((b.x + fx * 3) / 4) * 4, cz = Math.round((b.z + fz * 3) / 4) * 4;
      const y = Math.round(b.y * 2) / 2;
      const rr = (ry * Math.PI) / 180;
      if (this.buildKind === 'wall') {
        this.ghost.geometry = this.ghostWall || (this.ghostWall = new THREE.BoxGeometry(4, 4, 0.4));
        const off = { 0: [0, 2], 180: [0, -2], 90: [2, 0], 270: [-2, 0] }[ry];
        this.ghost.position.set(cx + off[0], y + 2, cz + off[1]);
      } else {
        this.ghost.geometry = this.ghostRamp || (this.ghostRamp = new THREE.BoxGeometry(4, 0.3, 5.6).rotateX(-Math.PI / 4));
        this.ghost.position.set(cx, y + 2, cz);
      }
      this.ghost.rotation.y = rr;
      this.ghost.userData = { kind: this.buildKind, x: cx, y, z: cz, ry };
      this.ghost.visible = true;
    }
    const firing = input.down('Mouse0') || input.mouse.buttons.has(0);
    if ((input.locked || input.isTouch) && firing) {
      if (this.build && input.pressed('Mouse0')) this.placePiece();
      else if (!this.build) {
        const auto = this.me?.weapon === 'rifle';
        if (auto || input.pressed('Mouse0')) this.fire();
      }
    }

    // Tormenta
    const s = this.storm;
    if (s && this.rs.phase === 'match') {
      this.stormMesh.visible = true;
      this.stormMesh.position.set(s.x, 40, s.z);
      this.stormMesh.scale.set(s.r, 1, s.r);
      const b = g.player.body;
      const out = Math.hypot(b.x - s.x, b.z - s.z) > s.r;
      const t = Math.max(0, s.t1 - now);
      this.statusEl.textContent = `👥 ${this.alive} vivos`;
      this.subEl.textContent = (s.phase < 0 ? '' : `Tormenta: ${mmss(t)}`) + (out ? ' · ⚠️ ¡ESTÁS EN LA TORMENTA!' : '');
      g.scene.fog.color.lerp(new THREE.Color(out ? '#6a1b9a' : g.scene.fog.color), 0.1);
    } else this.stormMesh.visible = false;

    for (let i = this.tracers.length - 1; i >= 0; i--) {
      const t = this.tracers[i];
      if (performance.now() > t.until) {
        g.scene.remove(t.line);
        t.line.geometry.dispose();
        this.tracers.splice(i, 1);
      }
    }
  }

  dispose() {
    const g = this.game;
    g.scene.remove(this.stormMesh, this.ghost);
    for (const id of [...this.pieces.keys()]) this.removePiece(id);
    for (const t of this.tracers) g.scene.remove(t.line);
    this.bottom.remove();
  }
}

// =====================================================================================
// Kest Rocket
// =====================================================================================
export class RocketClient extends Base {
  constructor(game, state) {
    super(game, state);
    this.lockVehicle = true;
    this.blockEmotes = true;
    this.rk = state.rocket || { state: 'waiting', score: [0, 0], teams: {}, colors: ['#1e88e5', '#fb8c00'] };
    this.boost = 100;
    this.ballCam = true;
    this.ballData = null;
    this.ballPos = new THREE.Vector3(0, 2.2, 0);
    this.hint = ['[Shift] turbo  [Espacio] saltar  [C] cámara al balón'];

    // Balón con textura de gajos
    const c = document.createElement('canvas');
    c.width = 256;
    c.height = 128;
    const cg = c.getContext('2d');
    cg.fillStyle = '#fafafa';
    cg.fillRect(0, 0, 256, 128);
    cg.fillStyle = '#263238';
    for (let i = 0; i < 8; i++) for (let j = 0; j < 4; j++) if ((i + j) % 2) cg.fillRect(i * 32, j * 32, 32, 32);
    const tex = new THREE.CanvasTexture(c);
    tex.colorSpace = THREE.SRGBColorSpace;
    this.ball = new THREE.Mesh(new THREE.SphereGeometry(2.2, 24, 16), new THREE.MeshStandardMaterial({ map: tex, roughness: 0.5 }));
    this.ball.castShadow = true;
    game.scene.add(this.ball);
    this.ballShadow = new THREE.Mesh(new THREE.CircleGeometry(2.2, 20).rotateX(-Math.PI / 2), new THREE.MeshBasicMaterial({ color: '#000', transparent: true, opacity: 0.3, depthWrite: false }));
    game.scene.add(this.ballShadow);

    this.scoreEl = h('div.big', '');
    this.timeEl = h('div.small.muted', '');
    this.boostBar = h('div', { style: { width: '100%', background: 'linear-gradient(90deg,#ff6d00,#ffd600)' } });
    this.hud.setMode(h('div.hud-card', this.scoreEl, this.timeEl), h('div.hud-card', h('div.small', 'TURBO'), h('div.bar', { style: { width: '120px' } }, this.boostBar)));
    this.hud.addTouchButton('Turbo', 'ShiftLeft', { right: '120px', bottom: '150px', width: '64px', height: '64px', fontSize: '11px' });
    this.render();

    this.netEvents.rocket = (s) => { this.rk = s; this.render(); };
    this.netEvents['rocket:spot'] = ({ p, ry }) => {
      const v = this.game.player.vehicle;
      if (!v) return;
      Object.assign(v.state, { x: p[0], y: p[1], z: p[2], yaw: (ry * Math.PI) / 180, speed: 0, vy: 0, pitch: 0, roll: 0 });
      v.applyPose();
      this.boost = 100;
    };
    this.netEvents['rocket:goal'] = ({ team, scorer, score }) => {
      this.rk.score = score;
      audio.play('goal');
      const mine = this.rk.teams[store.user.id] === team;
      this.hud.showCenter('¡GOOOL!', `${team === 0 ? 'Azul' : 'Naranja'}${scorer ? ' · ' + scorer : ''}${mine ? ' 🎉' : ''}`, 3000);
      this.render();
    };
    this.netEvents['rocket:end'] = ({ score, winner }) => {
      const mine = this.rk.teams[store.user.id];
      audio.play(winner === mine ? 'win' : 'death');
      this.hud.showCenter(winner === -1 ? 'EMPATE' : winner === mine ? '🏆 ¡VICTORIA!' : 'Derrota', `${score[0]} - ${score[1]}`, 7000);
    };
    this.netEvents['rocket:touch'] = ({ p }) => audio.play('ball', { x: p[0], y: p[1], z: p[2] }, { maxDist: 90 });
  }

  get frozen() {
    return this.rk.state === 'kickoff' || this.rk.state === 'end';
  }

  render() {
    const s = this.rk;
    const [b, o] = s.score;
    this.scoreEl.innerHTML = '';
    this.scoreEl.append(h('span', { style: { color: '#64b5f6' } }, `AZUL ${b}`), ' – ', h('span', { style: { color: '#ffb74d' } }, `${o} NARANJA`));
    const team = s.teams[store.user.id];
    this.myTeam = team;
  }

  vehicleCtl(v, dt) {
    const want = input.down('ShiftLeft') || input.down('ShiftRight');
    const boosting = want && this.boost > 0 && !this.frozen;
    this.boost = boosting ? Math.max(0, this.boost - 34 * dt) : Math.min(100, this.boost + 9 * dt);
    if (boosting && Math.random() < dt * 8) audio.play('boost');
    return { boost: boosting, jump: !this.frozen && input.pressed('Space'), brake: this.frozen };
  }

  onSnap(m, t) {
    if (!m.b) return;
    this.ballData = { p: m.b.slice(0, 3), v: m.b.slice(3, 6), t };
    if (m.rm != null) this.remaining = m.rm;
    if (m.sc) this.rk.score = m.sc;
    if (m.s && m.s !== this.rk.state) { this.rk.state = m.s; }
  }

  update(dt) {
    const g = this.game;
    if (input.pressed('KeyC')) this.ballCam = !this.ballCam;
    // Balón: extrapolado al instante actual a partir de la última instantánea
    if (this.ballData) {
      const d = this.ballData;
      const s = Math.min(0.25, Math.max(0, (g.now() - d.t) / 1000));
      const live = this.rk.state === 'play';
      const target = new THREE.Vector3(d.p[0] + (live ? d.v[0] * s : 0), Math.max(2.2, d.p[1] + (live ? d.v[1] * s - 11 * s * s : 0)), d.p[2] + (live ? d.v[2] * s : 0));
      if (target.distanceTo(this.ballPos) > 12) this.ballPos.copy(target);
      else this.ballPos.lerp(target, Math.min(1, dt * 18));
      this.ball.rotation.x += (d.v[2] / 2.2) * dt;
      this.ball.rotation.z -= (d.v[0] / 2.2) * dt;
    }
    this.ball.position.copy(this.ballPos);
    this.ballShadow.position.set(this.ballPos.x, 0.05, this.ballPos.z);
    this.ballShadow.material.opacity = Math.max(0.08, 0.35 - this.ballPos.y / 60);
    // Cámara mirando al balón (como en el juego original)
    const v = g.player.vehicle;
    if (this.ballCam && v) {
      const want = Math.atan2(v.state.x - this.ballPos.x, v.state.z - this.ballPos.z);
      g.cam.yaw += Math.atan2(Math.sin(want - g.cam.yaw), Math.cos(want - g.cam.yaw)) * Math.min(1, dt * 6);
      g.lastLook = g.now();
    }
    this.boostBar.style.width = `${this.boost}%`;
    const st = this.rk.state;
    this.timeEl.textContent = st === 'kickoff' ? '¡Saque!' : st === 'end' ? 'Final del partido' : `${this.remaining != null ? mmss(this.remaining * 1000) : '3:00'}${this.remaining === 0 ? ' · prórroga (gol de oro)' : ''} · eres ${this.myTeam === 0 ? 'AZUL' : 'NARANJA'}`;
  }

  dispose() {
    this.game.scene.remove(this.ball, this.ballShadow);
  }
}

// =====================================================================================
// Kest Castores
// =====================================================================================
export class CastoresClient extends Base {
  constructor(game, state) {
    super(game, state);
    this.customAudio = true;
    this.blockEmotes = false;
    this.cs = state.castores || { state: 'waiting', removed: [], logs: [] };
    this.logMeshes = new Map();
    this.logData = [];
    this.myLog = null;
    this.flameState = new Map();
    this.sawAcc = 0;
    this.hint = ['[E] roer tablones / coger y soltar troncos', 'Los troncos grandes pesan: ¡mejor entre dos!'];
    this.timerEl = h('div.big', '');
    this.progEl = h('div.small', '');
    this.hud.setMode(h('div.hud-card', this.timerEl, this.progEl));
    this.applyState();
    this.netEvents.castores = (s) => {
      const prev = this.cs.state;
      this.cs = s;
      this.applyState();
      if (s.state === 'heist' && prev === 'countdown') { audio.play('countdown', null, { go: true }); this.hud.showCenter('¡AL ATRACO!', 'Roed, robad y corred', 1800); }
      if (s.state === 'won') { audio.play('win'); this.hud.showCenter('🦫 ¡PRESA TERMINADA!', `${s.delivered} troncos robados`, 6000); }
      if (s.state === 'lost') { audio.play('death'); this.hud.showCenter('⏰ ¡Tiempo!', `${s.delivered}/${s.target} troncos`, 6000); }
      if (s.state === 'countdown') this.myLog = null;
    };
    this.netEvents['castores:gnaw'] = ({ id, hp }) => {
      const e = this.game.built.objects.get(id);
      if (e?.mesh) {
        audio.play('gnaw', { x: e.o.p[0], y: 2, z: e.o.p[2] });
        e.mesh.userData.shake = 0.25;
        e.mesh.scale.y = 0.6 + hp * 0.1;
      }
    };
    this.netEvents['castores:log'] = ({ act }) => audio.play(act === 'grab' ? 'log' : 'land');
  }

  startAudio() {
    audio.setAmbient('day');
    audio.playTrack('/audio/ia-beat.mp3');
    audio.loop('river', { noise: true, filter: 900, vol: 0.025 });
  }

  // Castores: cola plana, dientes y orejas para todos los jugadores
  decorate(model) {
    const brown = new THREE.MeshStandardMaterial({ color: '#5d4037', roughness: 0.9 });
    const tail = new THREE.Mesh(new THREE.BoxGeometry(0.55, 0.12, 0.9), brown);
    tail.position.set(0, 0.6, -0.55);
    tail.rotation.x = -0.35;
    model.body.add(tail);
    const tooth = new THREE.MeshStandardMaterial({ color: '#fffde7' });
    for (const x of [-0.06, 0.06]) {
      const t = new THREE.Mesh(new THREE.BoxGeometry(0.1, 0.14, 0.04), tooth);
      t.position.set(x, 0.12, 0.32);
      model.neck.add(t);
    }
    for (const x of [-0.27, 0.27]) {
      const ear = new THREE.Mesh(new THREE.BoxGeometry(0.14, 0.14, 0.08), brown);
      ear.position.set(x, 0.66, -0.05);
      model.neck.add(ear);
    }
  }

  decorateRemote(r) {
    if (!r.npc) this.decorate(r.model);
  }

  applyState() {
    const s = this.cs;
    for (const id of s.removed || []) {
      const e = this.game.built.objects.get(id);
      if (e && !e.hidden) {
        e.hidden = true;
        e.colliders.forEach((c) => (c.enabled = false));
        if (e.mesh) e.mesh.visible = false;
        audio.play('log', { x: e.o.p[0], y: 2, z: e.o.p[2] });
      }
    }
    if (s.state === 'countdown') {
      // Nueva ronda: los tablones vuelven a su sitio
      for (const e of this.game.built.objects.values()) {
        if (e.o.plank && !(s.removed || []).includes(e.o.id)) {
          e.hidden = false;
          e.colliders.forEach((c) => (c.enabled = true));
          if (e.mesh) { e.mesh.visible = true; e.mesh.scale.y = 1; }
        }
      }
    }
    for (const l of s.logs || []) if (!this.logMeshes.has(l.id)) this.addLog(l);
  }

  addLog(l) {
    const len = l.big ? 4.4 : 2.6, r = l.big ? 0.55 : 0.36;
    const g = new THREE.Group();
    const bark = new THREE.Mesh(new THREE.CylinderGeometry(r, r, len, 12).rotateZ(Math.PI / 2), material('wood', { color: '#6d4c41' }));
    const ringMat = new THREE.MeshStandardMaterial({ color: '#d7b98e' });
    for (const s of [-1, 1]) {
      const ring = new THREE.Mesh(new THREE.CircleGeometry(r * 0.95, 12).rotateY((s * Math.PI) / 2), ringMat);
      ring.position.x = (s * len) / 2 + s * 0.01;
      g.add(ring);
    }
    bark.castShadow = true;
    g.add(bark);
    this.game.scene.add(g);
    this.logMeshes.set(l.id, { mesh: g, big: l.big, target: null });
  }

  onSnap(m) {
    if (!m.lg) return;
    this.logData = m.lg;
    this.cs.logs.forEach((l, i) => {
      const e = this.logMeshes.get(l.id);
      const d = m.lg[i];
      if (!e || !d) return;
      e.target = d;
      if (this.myLog === l.id && (d[4] === 0 || d[4] === 2)) this.myLog = null; // entregado o soltado (p. ej. al caer)
    });
  }

  myLogInfo() {
    if (!this.myLog) return null;
    const i = this.cs.logs.findIndex((l) => l.id === this.myLog);
    return i >= 0 ? { big: this.cs.logs[i].big, helped: this.logData[i]?.[4] === 3 } : null;
  }

  filterCtl(ctl) {
    const info = this.myLogInfo();
    if (!info) return;
    // Cargar troncos ralentiza; los grandes, mucho, salvo que te ayuden
    const k = info.big ? (info.helped ? 0.8 : 0.42) : 0.85;
    ctl.move.x *= k;
    ctl.move.y *= k;
    ctl.run = false;
    if (info.big) ctl.jump = false;
  }

  interactions(b) {
    const out = [];
    if (this.cs.state !== 'heist') return out;
    if (this.myLog) {
      out.push({ d: 0.5, label: 'Soltar tronco', act: () => this.drop() });
      return out;
    }
    for (const e of this.game.built.objects.values()) {
      if (!e.o.plank || e.hidden) continue;
      const d = Math.hypot(b.x - e.o.p[0], b.z - e.o.p[2]);
      if (d < 3.6) out.push({ d, label: 'Roer tablón', act: () => this.gnaw(e.o.id) });
    }
    this.cs.logs.forEach((l, i) => {
      const t = this.logData[i];
      if (!t || t[4] === 2 || t[4] === 3 || (t[4] === 1 && !l.big)) return;
      const d = Math.hypot(b.x - t[0], b.z - t[2]);
      if (d < 3) out.push({ d, label: t[4] === 1 ? 'Ayudar a cargar' : l.big ? 'Coger tronco GRANDE' : 'Coger tronco', act: () => this.grab(l.id) });
    });
    return out;
  }

  async gnaw(id) {
    this.game.player.attackTimer = 0.25;
    const r = await net.request('mode', { name: 'gnaw', data: { id } });
    if (r.error && r.error !== 'cadencia') toast(r.error, 'warn', 1200);
  }

  async grab(id) {
    const r = await net.request('mode', { name: 'grab', data: { id } });
    if (r.error) return toast(r.error, 'warn', 1500);
    this.myLog = id;
    if (r.big && !r.helping) toast('Tronco grande: ¡pide ayuda a otro castor para ir más rápido!', 'info', 2500);
  }

  async drop() {
    await net.request('mode', { name: 'drop' });
    this.myLog = null;
  }

  update(dt) {
    const g = this.game;
    const now = g.now();
    const t = now / 1000;
    const s = this.cs;
    if (s.state === 'countdown') this.timerEl.textContent = `⏳ ${Math.ceil((s.startAt - now) / 1000)}`;
    else if (s.state === 'heist') this.timerEl.textContent = `⏱ ${mmss(s.endsAt - now)}`;
    else this.timerEl.textContent = s.state === 'won' ? '🎉 ¡Hecho!' : s.state === 'lost' ? '⏰ Fin' : '';
    this.progEl.textContent = `🪵 Troncos en la presa: ${s.delivered}/${s.target}`;

    // Troncos: interpolación
    for (const e of this.logMeshes.values()) {
      if (!e.target) continue;
      const [x, y, z, ry] = e.target;
      const m = e.mesh;
      if (Math.hypot(m.position.x - x, m.position.z - z) > 15) m.position.set(x, y, z);
      else m.position.lerp(new THREE.Vector3(x, y, z), Math.min(1, dt * 14));
      m.rotation.y = ry + Math.PI / 2;
    }

    // Peligros: sierras y lanzallamas
    const b = g.player.body;
    const center = new THREE.Vector3(b.x, b.y + 1, b.z);
    for (const e of g.built.platforms) {
      if (e.o.t !== 'saw' || !e.mesh) continue;
      e.mesh.traverse((c) => { if (c.userData.tag === 'spin') c.rotation.x += dt * 14; });
      const p = e.mesh.position;
      const d = center.distanceTo(p);
      if (d < 1.9 && !g.player.dead) g.die('¡Sierra!');
      if (d < 16) {
        this.sawAcc += dt;
        if (this.sawAcc > 0.22) { this.sawAcc = 0; audio.play('saw', { x: p.x, y: p.y, z: p.z }, { maxDist: 18 }); }
      }
    }
    for (const e of g.built.objects.values()) {
      if (e.o.t !== 'flame') continue;
      const on = flameActive(e.o, t);
      if (on !== this.flameState.get(e.o.id)) {
        this.flameState.set(e.o.id, on);
        if (on) audio.play('flame', { x: e.o.p[0], y: 2, z: e.o.p[2] }, { maxDist: 25 });
      }
      e.mesh?.traverse((c) => {
        if (c.userData.tag === 'flamejet') {
          c.visible = on;
          c.scale.y = 0.8 + Math.sin(t * 30) * 0.2;
        }
      });
      if (on && !g.player.dead && Math.hypot(b.x - e.o.p[0], b.z - e.o.p[2]) < 1.2 && b.y < e.o.p[1] + 3) g.die('¡Fuego!');
    }
    // Temblor de los tablones al roerlos
    for (const e of g.built.objects.values()) {
      if (!e.o.plank || !e.mesh || !e.mesh.userData.shake) continue;
      e.mesh.userData.shake -= dt;
      e.mesh.position.x = e.o.p[0] + Math.sin(t * 60) * 0.06 * Math.max(0, e.mesh.userData.shake) * 4;
    }
  }

  dispose() {
    for (const e of this.logMeshes.values()) this.game.scene.remove(e.mesh);
  }
}
