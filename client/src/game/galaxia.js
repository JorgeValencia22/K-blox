// Guerra Galáctica (cliente): sables de plasma con brillo, blásters con disparos que viajan,
// bloqueo que desvía disparos, onda de energía, panel de duelos e Historia y la misión en caza
// estelar para destruir la Estación Oscura (StarMission, más abajo).
import * as THREE from 'three';
import { net } from '../core/net.js';
import { input } from '../engine/input.js';
import { engine } from '../engine/renderer.js';
import { audio } from '../audio/audio.js';
import { store } from '../core/store.js';
import { h, toast, clear, modal, button } from '../ui/dom.js';
import { GX } from '../../../shared/worlds/galaxia.js';

const COLOR_NAMES = ['azul', 'verde', 'morado', 'amarillo'];
const mmss = (ms) => { const s = Math.max(0, Math.ceil(ms / 1000)); return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`; };

// --- Sonidos sintetizados -------------------------------------------------------------------------
const sfx = {
  blaster(vol = 0.22) { audio.tone({ freq: 1400, type: 'square', dur: 0.16, vol, slide: -1150, filter: 3200 }); audio.tone({ freq: 700, type: 'sawtooth', dur: 0.12, vol: vol * 0.5, slide: -500 }); },
  ignite() { audio.tone({ freq: 90, type: 'sawtooth', dur: 0.5, vol: 0.2, slide: 60, filter: 900 }); audio.noiseBurst({ dur: 0.3, vol: 0.12, freq: 2000 }); },
  swing() { audio.tone({ freq: 160, type: 'sawtooth', dur: 0.28, vol: 0.2, slide: 140, filter: 1200 }); audio.noiseBurst({ dur: 0.22, vol: 0.1, freq: 900, q: 2 }); },
  clash() { audio.noiseBurst({ dur: 0.35, vol: 0.35, freq: 3200, q: 0.8 }); audio.tone({ freq: 2200, type: 'square', dur: 0.12, vol: 0.12, slide: -1200 }); audio.tone({ freq: 110, type: 'sawtooth', dur: 0.3, vol: 0.2, filter: 600 }); },
  deflect() { audio.tone({ freq: 2600, type: 'triangle', dur: 0.14, vol: 0.2, slide: 900 }); audio.noiseBurst({ dur: 0.12, vol: 0.18, freq: 4000 }); },
  push() { audio.tone({ freq: 70, type: 'sine', dur: 0.7, vol: 0.45, slide: -40 }); audio.noiseBurst({ dur: 0.6, vol: 0.25, freq: 300, type: 'lowpass' }); },
  boom(vol = 0.5, dur = 1.2) { audio.noiseBurst({ dur, vol, freq: 180, type: 'lowpass' }); audio.tone({ freq: 60, type: 'sine', dur, vol: vol * 0.8, slide: -35 }); },
  torpedo() { audio.tone({ freq: 300, type: 'sawtooth', dur: 0.8, vol: 0.25, slide: 900, filter: 2500 }); },
};

/** Material que brilla (se suma a lo que hay detrás). */
const glowMat = (color, opacity = 0.55) => new THREE.MeshBasicMaterial({ color, transparent: true, opacity, blending: THREE.AdditiveBlending, depthWrite: false });

/** Sable de plasma: empuñadura metálica, núcleo blanco y halo de color. */
export function makeSaber(color) {
  const g = new THREE.Group();
  const hilt = new THREE.Mesh(new THREE.CylinderGeometry(0.045, 0.05, 0.32, 10), new THREE.MeshStandardMaterial({ color: '#b0bec5', metalness: 0.8, roughness: 0.25 }));
  const grip = new THREE.Mesh(new THREE.CylinderGeometry(0.052, 0.052, 0.12, 10), new THREE.MeshStandardMaterial({ color: '#212121', roughness: 0.6 }));
  grip.position.y = -0.05;
  const blade = new THREE.Group();
  const core = new THREE.Mesh(new THREE.CylinderGeometry(0.028, 0.032, 1.25, 10), new THREE.MeshBasicMaterial({ color: '#ffffff' }));
  const halo = new THREE.Mesh(new THREE.CylinderGeometry(0.075, 0.085, 1.32, 12), glowMat(color, 0.6));
  const halo2 = new THREE.Mesh(new THREE.CylinderGeometry(0.15, 0.16, 1.38, 12), glowMat(color, 0.22));
  for (const m of [core, halo, halo2]) m.position.y = 0.78;
  blade.add(core, halo, halo2);
  g.add(hilt, grip, blade);
  g.userData = { blade, halo, halo2, color };
  return g;
}

function makeBlaster() {
  const g = new THREE.Group();
  const dark = new THREE.MeshStandardMaterial({ color: '#263238', roughness: 0.45, metalness: 0.5 });
  const body = new THREE.Mesh(new THREE.BoxGeometry(0.12, 0.16, 0.55), dark);
  const barrel = new THREE.Mesh(new THREE.CylinderGeometry(0.035, 0.035, 0.4, 8), dark);
  barrel.rotation.x = Math.PI / 2;
  barrel.position.z = 0.42;
  const grip = new THREE.Mesh(new THREE.BoxGeometry(0.08, 0.22, 0.1), dark);
  grip.position.set(0, -0.15, -0.1);
  const scope = new THREE.Mesh(new THREE.CylinderGeometry(0.03, 0.03, 0.22, 8), new THREE.MeshStandardMaterial({ color: '#90a4ae', metalness: 0.7 }));
  scope.rotation.x = Math.PI / 2;
  scope.position.set(0, 0.11, 0);
  g.add(body, barrel, grip, scope);
  return g;
}

export class GalaxiaClient {
  constructor(game, state) {
    this.game = game;
    this.hud = game.hud;
    this.netEvents = {};
    this.blockEmotes = true;
    this.rules = state.rules || {};
    this.gx = state.gx || { duel: { phase: 'idle' }, story: { phase: 'idle', members: [] } };
    this.weap = new Map(Object.entries(state.weapons || {}));
    this.me = state.me || null;
    this.colorIdx = 0;
    this.gear = new Map(); // id -> { group, kind, model }
    this.blocking = new Set();
    this.bolts = [];
    this.fx = [];
    this.nextShot = 0;
    this.nextSwing = 0;
    this.nextPush = 0;
    this.downUntil = 0;
    this.lastCount = null;
    this.blockSent = false;
    this.boss = null;
    this.mission = null;
    this.hint = ['[Clic] atacar / disparar  [Clic der.] o [Q] bloquear (¡desvía los disparos!)', '[1] sable  [2] bláster  [F] onda de energía  [C] color del sable  [E] usar terminales'];

    // HUD
    this.statusEl = h('div.big', 'Base rebelde');
    this.subEl = h('div.small.muted', 'Elige: ⚔️ Duelos (este) · 📖 Historia (mesa) · 🚀 Hangar (norte)');
    this.feedEl = h('div.small', { style: { textAlign: 'left', maxWidth: '260px' } });
    this.hud.setMode(h('div.hud-card', this.statusEl, this.subEl), h('div.hud-card', this.feedEl));
    this.hpBar = h('div', { style: { width: '100%', background: 'linear-gradient(90deg,#00e676,#69f0ae)' } });
    this.weaponEl = h('div.small');
    this.pushEl = h('div.small.muted');
    this.bottom = h('div.hud-card.bars-surv', { style: { position: 'absolute', left: '50%', bottom: '14px', transform: 'translateX(-50%)', width: '280px' } },
      h('div.row.small', '❤️', h('div.bar.hp.grow', this.hpBar)), this.weaponEl, this.pushEl);
    this.bossName = h('div.gx-boss-name', '');
    this.bossFill = h('div.gx-boss-fill');
    this.bossEl = h('div.gx-boss.hidden', this.bossName, h('div.gx-boss-bar', this.bossFill));
    this.downEl = h('div.gx-down.hidden', h('div.big', '💫 ¡Te han derribado!'), h('div.small', 'Vuelves a la batalla en unos segundos…'));
    this.hud.el.append(this.bottom, this.bossEl, this.downEl);
    this.hud.crosshair.classList.remove('hidden');
    this.hud.addTouchButton('⚔️', 'Mouse0', { right: '120px', bottom: '150px', width: '64px', height: '64px', fontSize: '22px' });
    this.hud.addTouchButton('🛡️', 'KeyQ', { right: '196px', bottom: '110px', width: '54px', height: '54px' });
    this.hud.addTouchButton('💥', 'KeyF', { right: '196px', bottom: '176px', width: '54px', height: '54px' });
    this.hud.addTouchButton('🔄', 'KeyX', { right: '120px', top: '70px', width: '50px', height: '50px' });

    // Brillo del sable propio (ilumina el entorno)
    this.saberLight = new THREE.PointLight('#29b6f6', 0, 7, 2);
    game.scene.add(this.saberLight);

    this.netEvents.gx = (s) => this.onState(s);
    this.netEvents['gx:me'] = (m) => {
      const was = this.me;
      this.me = m;
      if (m.weapon === 'saber' && was?.weapon !== 'saber') sfx.ignite();
      this.renderMe();
    };
    this.netEvents['gx:weapon'] = ({ id, w, c }) => {
      this.weap.set(id, { w, c });
      this.equip(id);
    };
    this.netEvents['gx:block'] = ({ id, on }) => { if (on) this.blocking.add(id); else this.blocking.delete(id); };
    this.netEvents['gx:swing'] = ({ id }) => {
      if (id === store.user.id) return;
      const r = game.remotes.get(id);
      if (r) { sfx.swing(); this.trail(r.model); }
    };
    this.netEvents['gx:shot'] = (s) => {
      if (s.from === store.user.id && !s.deflect) return;
      this.bolt(s.o, s.e, s.c);
      if (s.deflect) { this.spark(s.e, '#ffffff', 14); sfx.deflect(); }
      else if (s.c !== '#ffffff') {
        const me = game.player.body;
        const d = Math.hypot(s.o[0] - me.x, s.o[2] - me.z);
        if (d < 70) sfx.blaster(0.16 * (1 - d / 80));
      }
    };
    this.netEvents['gx:clash'] = ({ p }) => { this.spark(p, '#fff59d', 26); this.flash(p, '#ffffff', 6); sfx.clash(); game.cam.shake = 0.25; };
    this.netEvents['gx:push'] = ({ id, p, d }) => { this.wave(p, d, id === store.user.id ? '#80d8ff' : '#ff5252'); if (id !== store.user.id) sfx.push(); };
    this.netEvents['gx:knock'] = ({ v }) => {
      const b = game.player.body;
      b.vx += v[0];
      b.vy = Math.max(b.vy, v[1]);
      b.vz += v[2];
      b.onGround = false;
      game.cam.shake = 0.5;
    };
    this.netEvents['gx:hurt'] = () => { this.hud.flashHurt(); audio.play('hurt'); };
    this.netEvents['gx:hit'] = ({ id, hp, max }) => {
      const r = game.remotes.get(id);
      if (r) this.spark([r.pos.x, r.pos.y + 1.2, r.pos.z], '#ffab40', 10);
      if (r && /Vex/.test(r.name)) { this.boss = { id, hp, max, name: r.name }; this.renderBoss(); }
    };
    this.netEvents['gx:feed'] = ({ vid, victim, killer, out }) => {
      const line = out ? `🌀 ${victim} se cayó de la arena` : killer ? `⚔️ ${killer} derrotó a ${victim}` : `💀 ${victim} cayó`;
      this.feedEl.prepend(h('div', line));
      while (this.feedEl.children.length > 5) this.feedEl.lastChild.remove();
      const r = vid && game.remotes.get(vid);
      if (r) { this.spark([r.pos.x, r.pos.y + 1, r.pos.z], '#ff9100', 30); sfx.boom(0.25, 0.5); }
      if (this.boss?.id === vid) { this.boss = null; this.renderBoss(); }
    };
    this.netEvents['gx:down'] = ({ ms }) => {
      this.downUntil = performance.now() + ms;
      this.downEl.classList.remove('hidden');
      audio.play('death');
    };
    this.netEvents['gx:dash'] = ({ id }) => {
      const r = game.remotes.get(id);
      if (r) this.spark([r.pos.x, r.pos.y + 1, r.pos.z], '#ff1744', 12);
    };
    this.netEvents['gx:duelEnd'] = ({ winner, winnerId }) => {
      const mine = winnerId === store.user.id;
      const inDuel = this.gx.duel.a === store.user.id || this.gx.duel.b === store.user.id;
      if (mine) { audio.play('levelup'); this.hud.showCenter('🏆 ¡VICTORIA!', 'Has ganado el duelo', 4500); }
      else if (inDuel) { audio.play('death'); this.hud.showCenter('DERROTA', `${winner || 'Tu rival'} gana el duelo`, 4500); }
      else this.hud.showCenter(`🏆 ${winner || '—'}`, 'gana el duelo', 3000);
    };
    this.netEvents['gx:story'] = ({ text, sub, boss, win, lose }) => {
      if (!this.inStory() && !win && !lose) return;
      this.hud.showCenter(text, sub, boss ? 4200 : 3000);
      if (boss) { audio.play('fnafscream'); game.cam.shake = 0.6; }
      else if (win) audio.play('levelup');
      else if (lose) audio.play('death');
      else audio.play('countdown', null, { go: true });
    };

    for (const id of this.weap.keys()) this.equip(id);
    this.renderMe();
    this.onState(this.gx);
  }

  inStory() { return (this.gx.story.members || []).includes(store.user.id); }
  inDuel() { const d = this.gx.duel; return d.a === store.user.id || d.b === store.user.id; }

  get frozen() {
    if (this.mission) return true;
    if (performance.now() < this.downUntil) return true;
    const d = this.gx.duel;
    return d.phase === 'countdown' && this.inDuel();
  }

  onState(s) {
    const prevDuel = this.gx.duel?.phase;
    this.gx = s;
    if (s.duel.phase === 'fight' && prevDuel === 'countdown' && this.inDuel()) {
      audio.play('countdown', null, { go: true });
      this.hud.showCenter('¡LUCHA!', '', 1100);
    }
    if (s.duel.phase === 'idle' && this.boss && !this.inStory()) { this.boss = null; this.renderBoss(); }
    if (s.story.phase === 'idle' && this.boss && !this.inDuel()) { this.boss = null; this.renderBoss(); }
    this.renderStatus();
  }

  renderStatus() {
    const d = this.gx.duel, s = this.gx.story, now = this.game.now();
    if (this.inDuel()) {
      this.statusEl.textContent = `⚔️ ${d.an || '?'} vs ${d.bn || '?'}`;
      this.subEl.textContent = d.phase === 'fight' ? `Tiempo: ${mmss(d.endAt - now)} · ¡no te caigas de la arena!` : d.phase === 'end' ? 'Duelo terminado' : '¡Prepárate!';
    } else if (this.inStory()) {
      this.statusEl.textContent = s.phase === 'wave' && s.wave >= s.waves ? '🔴 JEFE: Lord Vex' : `📖 Oleada ${Math.min(s.wave + 1, s.waves)} de ${s.waves}`;
      this.subEl.textContent = s.phase === 'wave' ? `Enemigos: ${s.left}` : s.phase === 'break' || s.phase === 'intro' ? `Siguiente oleada en ${mmss(s.nextAt - now)}` : '';
    } else {
      this.statusEl.textContent = 'Base rebelde';
      const bits = [];
      if (d.phase !== 'idle') bits.push(`⚔️ Duelo: ${d.an} vs ${d.bn}`);
      else if (d.queue) bits.push(`⚔️ ${d.queue} esperando rival`);
      if (s.phase !== 'idle') bits.push(`📖 Historia en curso (oleada ${Math.min(s.wave + 1, s.waves)})`);
      this.subEl.textContent = bits.join(' · ') || 'Elige: ⚔️ Duelos (este) · 📖 Historia (mesa) · 🚀 Hangar (norte)';
    }
  }

  renderMe() {
    const m = this.me;
    this.bottom.style.display = m ? '' : 'none';
    if (!m) return;
    this.hpBar.style.width = `${Math.max(0, (m.hp / m.max) * 100)}%`;
    this.weaponEl.textContent = m.weapon === 'saber' ? `🗡️ Sable de plasma ${COLOR_NAMES[this.colorFromHex(m.color)] || ''}  ·  [2] bláster` : '🔫 Bláster láser  ·  [1] sable';
    this.saberLight.color.set(m.color || '#29b6f6');
  }

  colorFromHex(hex) { return ['#29b6f6', '#00e676', '#d500f9', '#ffea00'].indexOf(hex); }

  renderBoss() {
    const b = this.boss;
    this.bossEl.classList.toggle('hidden', !b);
    if (!b) return;
    this.bossName.textContent = `🔴 ${b.name}`;
    this.bossFill.style.width = `${Math.max(0, (b.hp / b.max) * 100)}%`;
  }

  // --- Armas en las manos -------------------------------------------------------------------------
  modelOf(id) { return id === store.user.id ? this.game.player.model : this.game.remotes.get(id)?.model; }

  decorate() { this.equip(store.user.id); }
  decorateRemote(r) { if (!r.npc) this.equip(r.id); }

  equip(id) {
    const model = this.modelOf(id);
    const w = this.weap.get(id);
    if (!model || !w) return;
    const old = this.gear.get(id);
    if (old && old.kind === w.w && old.color === w.c && old.model === model) return;
    if (old) old.group.parent?.remove(old.group);
    const group = w.w === 'saber' ? makeSaber(w.c || '#29b6f6') : makeBlaster();
    group.position.set(0, -0.72, w.w === 'saber' ? 0.08 : 0.25);
    if (w.w === 'saber') group.rotation.x = 1.2;
    model.rArm.add(group);
    this.gear.set(id, { group, kind: w.w, color: w.c, model });
  }

  /** Estela del sable en un golpe. */
  trail(model) {
    const g = this.gear.get([...this.gear.entries()].find(([, v]) => v.model === model)?.[0]);
    if (!g || g.kind !== 'saber') return;
    g.swingUntil = performance.now() + 260;
  }

  // --- Efectos ------------------------------------------------------------------------------------
  bolt(o, e, color) {
    const a = new THREE.Vector3(...o), b = new THREE.Vector3(...e);
    const len = a.distanceTo(b);
    if (len < 0.5) return;
    const geo = new THREE.CylinderGeometry(0.05, 0.05, 1.6, 6).rotateX(Math.PI / 2);
    const m = new THREE.Group();
    m.add(new THREE.Mesh(geo, new THREE.MeshBasicMaterial({ color: '#ffffff' })));
    const glow = new THREE.Mesh(new THREE.CylinderGeometry(0.14, 0.14, 1.9, 8).rotateX(Math.PI / 2), glowMat(color, 0.75));
    m.add(glow);
    m.position.copy(a);
    m.lookAt(b);
    this.game.scene.add(m);
    this.bolts.push({ m, a, b, t: 0, dur: len / 110 });
  }

  spark(p, color, n = 16) {
    const pos = new Float32Array(n * 3), vel = [];
    for (let i = 0; i < n; i++) {
      pos.set(p, i * 3);
      vel.push(new THREE.Vector3((Math.random() - 0.5) * 9, Math.random() * 6, (Math.random() - 0.5) * 9));
    }
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.BufferAttribute(pos, 3));
    const pts = new THREE.Points(geo, new THREE.PointsMaterial({ color, size: 0.22, transparent: true, blending: THREE.AdditiveBlending, depthWrite: false }));
    this.game.scene.add(pts);
    this.fx.push({ kind: 'spark', obj: pts, vel, t: 0, life: 0.5 });
  }

  flash(p, color, intensity = 4) {
    const l = new THREE.PointLight(color, intensity, 10, 2);
    l.position.set(...p);
    this.game.scene.add(l);
    this.fx.push({ kind: 'light', obj: l, t: 0, life: 0.18, base: intensity });
  }

  wave(p, d, color) {
    const ring = new THREE.Mesh(new THREE.TorusGeometry(1, 0.12, 8, 32), glowMat(color, 0.8));
    ring.position.set(...p);
    ring.lookAt(p[0] + d[0], p[1], p[2] + d[1]);
    this.game.scene.add(ring);
    this.fx.push({ kind: 'wave', obj: ring, t: 0, life: 0.55, d });
  }

  // --- Terminales ----------------------------------------------------------------------------------
  interactions(b) {
    const out = [];
    const near = (p, r = 3.2) => Math.hypot(b.x - p[0], b.z - p[2]) < r;
    const T = GX.terminals;
    if (near(T.duel)) out.push({ d: 1, label: '⚔️ Arena de duelos', act: () => this.duelMenu() });
    if (near(T.story, 3.8)) out.push({ d: 1, label: this.gx.story.phase === 'idle' ? '📖 Empezar la Historia' : '📖 Unirse a la Historia', act: () => this.startStory() });
    if (near(T.ship, 4.5)) out.push({ d: 1, label: '🚀 Despegar: destruir la Estación Oscura', act: () => this.launch() });
    return out;
  }

  freeMouse() {
    if (input.locked) { this.game.ignoreUnlock = true; input.unlockPointer(); }
  }

  duelMenu() {
    this.freeMouse();
    const d = this.gx.duel;
    const close = modal('⚔️ Arena de duelos', h('div',
      h('p.muted.small', 'Duelo 1v1 con sables de plasma. Gana quien deje sin vida a su rival… o lo saque de la arena. Bloquea con [Clic der.]/[Q] y usa la onda de energía [F] para empujar.'),
      d.phase !== 'idle' ? h('p.small', `Ahora mismo: ${d.an} contra ${d.bn}. Espera a que terminen.`) : null,
      h('div.row.wrap',
        button('🔴 Contra Lord Vex', () => { close(); this.req('duel', { vs: 'bot' }); }, 'primary'),
        button('👥 Contra otro jugador', () => { close(); this.req('duel', { vs: 'player' }).then((r) => r?.waiting && toast('Esperando a otro jugador… (pídele a un amigo que elija «Contra otro jugador»)', 'info', 5000)); }),
        d.queue ? button('Salir de la cola', () => { close(); this.req('duelCancel'); }, 'small') : null,
      )), { actions: [{ label: 'Cerrar' }] });
  }

  startStory() {
    this.req('story').then((r) => r?.joined && toast('¡Te unes a la defensa de la base!', 'ok'));
  }

  async req(name, data = {}) {
    const r = await net.request('mode', { name, data });
    if (r?.error && r.error !== 'cadencia') toast(r.error, 'warn', 2200);
    return r;
  }

  launch() {
    if (this.inDuel() || this.inStory()) return toast('Termina antes lo que estás haciendo', 'warn');
    if (this.mission) return;
    this.req('starStart');
    this.mission = new StarMission(this, () => { this.mission = null; });
  }

  // --- Combate --------------------------------------------------------------------------------------
  aimDir() {
    const cam = this.game.camera;
    const dir = new THREE.Vector3();
    cam.getWorldDirection(dir);
    const g = this.game;
    const o = cam.position;
    const hit = g.physics.raycast(o.x, o.y, o.z, dir.x, dir.y, dir.z, 120, 0.4);
    let best = hit.dist;
    const ray = new THREE.Ray(o.clone(), dir);
    for (const r of g.remotes.values()) {
      if (!r.model.root.visible) continue;
      const p = ray.intersectSphere(new THREE.Sphere(new THREE.Vector3(r.pos.x, r.pos.y + 1.1, r.pos.z), 0.9), new THREE.Vector3());
      if (p) best = Math.min(best, p.distanceTo(o));
    }
    const b = g.player.body;
    const head = new THREE.Vector3(b.x, b.y + 1.5, b.z);
    best = Math.max(best, head.clone().sub(o).dot(dir) + 1);
    const aim = o.clone().addScaledVector(dir, best);
    return { head, aim, d: aim.clone().sub(head).normalize() };
  }

  async attack() {
    const m = this.me;
    if (!m?.alive && m) return;
    const now = performance.now();
    const p = this.game.player;
    if ((m?.weapon || 'saber') === 'saber') {
      if (now < this.nextSwing) return;
      this.nextSwing = now + (this.rules.saber?.cd || 420);
      p.attackTimer = 0.3;
      sfx.swing();
      this.trail(p.model);
      const f = this.game.cam.forward();
      const r = await net.request('mode', { name: 'swing', data: { d: [f.x, 0, f.z] } });
      if (r.hits?.some((x) => x.dmg)) { audio.play('hitmarker'); this.hud.crosshair.style.background = '#ff5252'; setTimeout(() => (this.hud.crosshair.style.background = ''), 120); }
      if (r.hits?.some((x) => x.blocked)) this.game.cam.shake = 0.2;
    } else {
      if (now < this.nextShot) return;
      this.nextShot = now + (this.rules.blaster?.cd || 260);
      p.attackTimer = 0.15;
      const { head, aim, d } = this.aimDir();
      sfx.blaster();
      this.bolt(head.toArray(), aim.toArray(), '#40c4ff');
      const r = await net.request('mode', { name: 'shoot', data: { d: d.toArray() } });
      if (r.hits?.some((x) => x.dmg)) { audio.play('hitmarker'); this.hud.crosshair.style.background = '#ff5252'; setTimeout(() => (this.hud.crosshair.style.background = ''), 120); }
    }
  }

  async energyPush() {
    const now = performance.now();
    if (now < this.nextPush) return toast(`Onda lista en ${Math.ceil((this.nextPush - now) / 1000)} s`, 'warn', 1000);
    const f = this.game.cam.forward();
    const r = await this.req('push', { d: [f.x, 0, f.z] });
    if (r?.ok) { this.nextPush = now + (this.rules.push?.cd || 6000); sfx.push(); this.game.cam.shake = 0.3; this.game.player.attackTimer = 0.3; }
  }

  update(dt) {
    if (this.mission) { this.mission.update(dt); return; }
    const g = this.game;
    const now = performance.now();
    if (this.downUntil && now >= this.downUntil) { this.downUntil = 0; this.downEl.classList.add('hidden'); }
    // Cuenta atrás del duelo
    const d = this.gx.duel;
    if (d.phase === 'countdown' && this.inDuel()) {
      const left = Math.ceil((d.startAt - g.now()) / 1000);
      if (left !== this.lastCount && left > 0 && left <= 3) { this.lastCount = left; audio.play('countdown'); this.hud.showCenter(String(left), 'DUELO', 900); }
    }
    this.renderStatus();
    this.pushEl.textContent = now < this.nextPush ? `💥 Onda de energía: ${Math.ceil((this.nextPush - now) / 1000)} s` : '💥 Onda de energía lista [F]';

    // Cambiar de arma y color
    const m = this.me;
    if (m) {
      let w = null;
      if (input.pressed('Digit1')) w = 'saber';
      if (input.pressed('Digit2')) w = 'blaster';
      if (input.pressed('KeyX')) w = m.weapon === 'saber' ? 'blaster' : 'saber';
      if (input.pressed('KeyC') && m.weapon === 'saber') { this.colorIdx = (this.colorFromHex(m.color) + 1) % 4; this.req('weapon', { w: 'saber', c: this.colorIdx }); sfx.ignite(); }
      if (w && w !== m.weapon) this.req('weapon', { w });
    }
    const canAct = !this.frozen && (input.locked || input.isTouch);
    const blockKey = input.down('KeyQ') || input.down('Mouse2') || input.mouse.buttons.has(2);
    const block = canAct && blockKey && m?.weapon === 'saber';
    if (block !== this.blockSent) {
      this.blockSent = block;
      net.request('mode', { name: 'block', data: { on: block } });
      if (block) this.blocking.add(store.user.id); else this.blocking.delete(store.user.id);
    }
    if (canAct && !block) {
      const firing = input.down('Mouse0') || input.mouse.buttons.has(0);
      if (m?.weapon === 'blaster' ? firing : input.pressed('Mouse0')) this.attack();
      if (input.pressed('KeyF')) this.energyPush();
    }

    // Disparos y efectos
    for (let i = this.bolts.length - 1; i >= 0; i--) {
      const b = this.bolts[i];
      b.t += dt;
      const k = Math.min(1, b.t / b.dur);
      b.m.position.lerpVectors(b.a, b.b, k);
      if (k >= 1) { g.scene.remove(b.m); b.m.traverse((o) => o.geometry?.dispose()); this.bolts.splice(i, 1); }
    }
    for (let i = this.fx.length - 1; i >= 0; i--) {
      const f = this.fx[i];
      f.t += dt;
      const k = f.t / f.life;
      if (f.kind === 'spark') {
        const a = f.obj.geometry.attributes.position;
        f.vel.forEach((v, j) => { v.y -= 14 * dt; a.setXYZ(j, a.getX(j) + v.x * dt, a.getY(j) + v.y * dt, a.getZ(j) + v.z * dt); });
        a.needsUpdate = true;
        f.obj.material.opacity = 1 - k;
      } else if (f.kind === 'light') f.obj.intensity = f.base * (1 - k);
      else if (f.kind === 'wave') {
        const s = 1 + k * 7;
        f.obj.scale.set(s, s, s);
        f.obj.position.x += f.d[0] * dt * 10;
        f.obj.position.z += f.d[1] * dt * 10;
        f.obj.material.opacity = 0.8 * (1 - k);
      }
      if (k >= 1) { g.scene.remove(f.obj); f.obj.geometry?.dispose(); this.fx.splice(i, 1); }
    }
  }

  /** Poses que se ponen encima de la animación normal (bloqueo y brillo del sable). */
  afterSky() {
    if (this.mission) return;
    const now = performance.now();
    for (const [id, gr] of this.gear) {
      if (gr.kind !== 'saber') continue;
      const model = gr.model;
      if (this.blocking.has(id)) {
        model.rArm.rotation.set(-1.5, 0, 0.55);
        gr.group.rotation.set(0.3, 0, 1.25);
      } else gr.group.rotation.set(1.2, 0, 0);
      // El halo palpita un poco (y más durante el golpe)
      const swing = now < (gr.swingUntil || 0);
      const pul = 1 + Math.sin(now / 45 + id.length) * 0.05 + (swing ? 0.35 : 0);
      gr.group.userData.halo2.scale.set(pul, 1, pul);
      gr.group.userData.halo2.material.opacity = swing ? 0.45 : 0.22;
    }
    // Luz del sable propio
    const mine = this.gear.get(store.user.id);
    if (mine?.kind === 'saber') {
      const wp = new THREE.Vector3();
      mine.group.userData.blade.getWorldPosition(wp);
      this.saberLight.position.copy(wp);
      this.saberLight.intensity = 1.6;
    } else this.saberLight.intensity = 0;
  }

  dispose() {
    const g = this.game;
    this.mission?.end(true);
    for (const gr of this.gear.values()) gr.group.parent?.remove(gr.group);
    for (const b of this.bolts) g.scene.remove(b.m);
    for (const f of this.fx) g.scene.remove(f.obj);
    g.scene.remove(this.saberLight);
    this.bottom.remove();
    this.bossEl.remove();
    this.downEl.remove();
  }
}

// =====================================================================================================
// Misión: destruye la Estación Oscura (se juega en una escena propia, en el cliente)
// =====================================================================================================
const KILLS_NEEDED = 6;
const TRENCH_LEN = 1500;
const TRENCH = { w: 26, h: 22 };

function panelTexture(dark = false) {
  const c = document.createElement('canvas');
  c.width = c.height = 512;
  const g = c.getContext('2d');
  g.fillStyle = dark ? '#2b2f36' : '#6d737c';
  g.fillRect(0, 0, 512, 512);
  for (let i = 0; i < 260; i++) {
    const v = (dark ? 30 : 90) + Math.floor(Math.random() * 50);
    g.fillStyle = `rgb(${v},${v + 3},${v + 8})`;
    g.fillRect(Math.random() * 512, Math.random() * 512, 8 + Math.random() * 70, 6 + Math.random() * 40);
  }
  g.strokeStyle = 'rgba(0,0,0,.35)';
  for (let i = 0; i <= 512; i += 32) { g.beginPath(); g.moveTo(i, 0); g.lineTo(i, 512); g.stroke(); g.beginPath(); g.moveTo(0, i); g.lineTo(512, i); g.stroke(); }
  for (let i = 0; i < 90; i++) { g.fillStyle = Math.random() < 0.8 ? '#fff3c4' : '#80d8ff'; g.fillRect(Math.random() * 512, Math.random() * 512, 2, 2); }
  const t = new THREE.CanvasTexture(c);
  t.wrapS = t.wrapT = THREE.RepeatWrapping;
  t.colorSpace = THREE.SRGBColorSpace;
  return t;
}

function buildXWing() {
  const g = new THREE.Group();
  const white = new THREE.MeshStandardMaterial({ color: '#eceff1', roughness: 0.5, metalness: 0.2 });
  const grey = new THREE.MeshStandardMaterial({ color: '#90a4ae', roughness: 0.4, metalness: 0.5 });
  const red = new THREE.MeshStandardMaterial({ color: '#e53935', roughness: 0.6 });
  const body = new THREE.Mesh(new THREE.BoxGeometry(0.9, 0.8, 6), white);
  const nose = new THREE.Mesh(new THREE.ConeGeometry(0.55, 2.4, 4).rotateX(-Math.PI / 2).rotateZ(Math.PI / 4), white);
  nose.position.z = -4.1;
  const cockpit = new THREE.Mesh(new THREE.SphereGeometry(0.5, 12, 8, 0, Math.PI * 2, 0, Math.PI / 2), new THREE.MeshStandardMaterial({ color: '#1a237e', roughness: 0.1, metalness: 0.6 }));
  cockpit.scale.set(0.9, 0.9, 1.8);
  cockpit.position.set(0, 0.4, -0.8);
  const stripe = new THREE.Mesh(new THREE.BoxGeometry(0.92, 0.1, 2), red);
  stripe.position.set(0, 0.41, -2.6);
  g.add(body, nose, cockpit, stripe);
  const engines = [];
  for (const [sx, sy] of [[-1, 1], [1, 1], [-1, -1], [1, -1]]) {
    const wing = new THREE.Mesh(new THREE.BoxGeometry(4.2, 0.1, 1.8), white);
    wing.position.set(sx * 2.4, sy * 0.55, 1.6);
    wing.rotation.z = sx * sy * 0.22;
    const wstripe = new THREE.Mesh(new THREE.BoxGeometry(1.2, 0.12, 1.4), red);
    wstripe.position.set(sx * 3.2, sy * 0.72, 1.6);
    wstripe.rotation.z = wing.rotation.z;
    const cannon = new THREE.Mesh(new THREE.CylinderGeometry(0.07, 0.07, 3.8, 6).rotateX(Math.PI / 2), grey);
    cannon.position.set(sx * 4.5, sy * 0.95, 0.4);
    const eng = new THREE.Mesh(new THREE.CylinderGeometry(0.36, 0.36, 2.2, 10).rotateX(Math.PI / 2), grey);
    eng.position.set(sx * 0.95, sy * 0.55, 2.2);
    const glow = new THREE.Mesh(new THREE.CircleGeometry(0.3, 12), new THREE.MeshBasicMaterial({ color: '#ff8a65' }));
    glow.position.set(sx * 0.95, sy * 0.55, 3.31);
    engines.push(glow);
    g.add(wing, wstripe, cannon, eng, glow);
  }
  g.userData.engines = engines;
  g.userData.guns = [[-4.5, 0.95, -1.5], [4.5, 0.95, -1.5], [-4.5, -0.95, -1.5], [4.5, -0.95, -1.5]];
  return g;
}

function buildTie() {
  const g = new THREE.Group();
  const dark = new THREE.MeshStandardMaterial({ color: '#37474f', roughness: 0.5, metalness: 0.5 });
  const panel = new THREE.MeshStandardMaterial({ color: '#1c2228', roughness: 0.7, metalness: 0.3, side: THREE.DoubleSide });
  const ball = new THREE.Mesh(new THREE.SphereGeometry(1.1, 14, 10), dark);
  const window_ = new THREE.Mesh(new THREE.CircleGeometry(0.55, 8), new THREE.MeshBasicMaterial({ color: '#ff5252' }));
  window_.position.z = -1.08;
  window_.rotation.y = Math.PI;
  const arm = new THREE.Mesh(new THREE.CylinderGeometry(0.22, 0.22, 4.2, 8).rotateZ(Math.PI / 2), dark);
  g.add(ball, window_, arm);
  for (const s of [-1, 1]) {
    const w = new THREE.Mesh(new THREE.CylinderGeometry(2.6, 2.6, 0.15, 6).rotateZ(Math.PI / 2), panel);
    w.position.x = s * 2.2;
    g.add(w);
  }
  return g;
}

function buildStation() {
  const g = new THREE.Group();
  const tex = panelTexture();
  tex.repeat.set(14, 7);
  const mat = new THREE.MeshStandardMaterial({ color: '#9ea4ad', map: tex, roughness: 0.8, metalness: 0.3, emissive: '#fff3c4', emissiveMap: tex, emissiveIntensity: 0.06 });
  const R = 520;
  const sphere = new THREE.Mesh(new THREE.SphereGeometry(R, 64, 40), mat);
  // Trinchera del ecuador
  const trench = new THREE.Mesh(new THREE.TorusGeometry(R * 1.0, 6, 6, 120), new THREE.MeshStandardMaterial({ color: '#2a2d33', roughness: 1 }));
  trench.rotation.x = Math.PI / 2;
  // Plato del superláser
  const dish = new THREE.Mesh(new THREE.SphereGeometry(R * 0.26, 32, 16, 0, Math.PI * 2, 0, Math.PI * 0.35), new THREE.MeshStandardMaterial({ color: '#5c6168', roughness: 0.9, side: THREE.DoubleSide }));
  dish.position.set(0, R * 0.45, R * 0.82);
  dish.lookAt(0, R * 0.45 * 2, R * 0.82 * 2);
  dish.rotateX(Math.PI / 2);
  const eye = new THREE.Mesh(new THREE.SphereGeometry(14, 12, 10), new THREE.MeshBasicMaterial({ color: '#76ff03' }));
  eye.position.set(0, R * 0.47, R * 0.87);
  g.add(sphere, trench, dish, eye);
  g.userData = { R, eye };
  return g;
}

class StarMission {
  constructor(client, onDone) {
    this.client = client;
    this.game = client.game;
    this.onDone = onDone;
    this.t0 = performance.now();
    this.phase = 'launch';
    this.phaseT = 0;
    this.kills = 0;
    this.hp = 100;
    this.lasers = [];
    this.enemyBolts = [];
    this.enemies = [];
    this.parts = [];
    this.nextShot = 0;
    this.gunIdx = 0;
    this.speed = 70;
    this.done = false;

    // Escena propia: estrellas, planeta, estación y luces
    const scene = new THREE.Scene();
    scene.background = new THREE.Color('#02030a');
    this.scene = scene;
    const camera = new THREE.PerspectiveCamera(70, innerWidth / innerHeight, 0.5, 20000);
    this.camera = camera;
    scene.add(new THREE.HemisphereLight('#c5cae9', '#1a1a2e', 0.8));
    const sun = new THREE.DirectionalLight('#fff3e0', 2.2);
    sun.position.set(1, 0.6, 0.4);
    scene.add(sun);
    const starGeo = new THREE.BufferGeometry();
    const sp = new Float32Array(5000 * 3);
    for (let i = 0; i < 5000; i++) {
      const v = new THREE.Vector3().randomDirection().multiplyScalar(9000 + Math.random() * 2000);
      sp.set([v.x, v.y, v.z], i * 3);
    }
    starGeo.setAttribute('position', new THREE.BufferAttribute(sp, 3));
    this.stars = new THREE.Points(starGeo, new THREE.PointsMaterial({ color: '#ffffff', size: 2.2, sizeAttenuation: false }));
    scene.add(this.stars);
    const planet = new THREE.Mesh(new THREE.SphereGeometry(1400, 48, 32), new THREE.MeshStandardMaterial({ color: '#c58b4a', roughness: 1, emissive: '#3e2410', emissiveIntensity: 0.4 }));
    planet.position.set(-3200, -1500, -1500);
    scene.add(planet);
    this.station = buildStation();
    this.station.position.set(0, 0, -3200);
    scene.add(this.station);

    this.ship = buildXWing();
    scene.add(this.ship);
    this.shipQ = new THREE.Quaternion();
    this.ship.position.set(0, 0, 0);
    this.roll = 0;
    this.camPos = new THREE.Vector3(0, 3, 14);

    // HUD de la misión
    this.titleEl = h('div.gx-m-title', '');
    this.objEl = h('div.gx-m-obj', '');
    this.hpFill = h('div.gx-m-hpfill');
    this.reticle = h('div.gx-m-reticle');
    this.lockEl = h('div.gx-m-lock.hidden', '¡DISPARA LOS TORPEDOS! [Clic]');
    this.white = h('div.gx-m-white');
    this.btns = h('div.gx-m-btns.hidden');
    this.el = h('div.gx-mission', this.white, this.reticle, this.titleEl, this.objEl, h('div.gx-m-hp', h('span', 'ESCUDOS'), h('div.gx-m-hpbar', this.hpFill)), this.lockEl, this.btns,
      h('div.gx-m-help', '[Ratón] o [WASD] dirigir · [Clic] o [Espacio] disparar · [Shift] turbo'));
    document.body.appendChild(this.el);
    // El HUD normal de la partida se esconde durante el vuelo
    this.game.hud.el.style.visibility = 'hidden';
    // Luz de la cabina: ilumina las paredes de la trinchera al pasar
    const shipLight = new THREE.PointLight('#cfe8ff', 2.5, 60, 1.5);
    shipLight.position.set(0, 4, -6);
    this.ship.add(shipLight);

    // La partida sigue funcionando (red, chat…), pero se dibuja esta escena
    this.view = { scene, camera, update: (dt) => this.game.update(dt), onResize: (w, hh) => { camera.aspect = w / hh; camera.updateProjectionMatrix(); } };
    if (engine.view === this.game) { engine.view = this.view; engine.resize(); }
    this.lastYaw = this.game.cam.yaw;
    this.game.cam.pitch = 0.3;
    this.lastPitch = 0.3;
    this.say('ESCUADRÓN AZUL', '¡Despegad! Derribad los cazas enemigos', 3500);
    sfx.boom(0.2, 1.5);
  }

  say(title, obj, ms = 0) {
    this.titleEl.textContent = title;
    this.objEl.textContent = obj;
    this.titleEl.classList.remove('pop');
    void this.titleEl.offsetWidth;
    this.titleEl.classList.add('pop');
    if (ms) { clearTimeout(this.sayT); this.sayT = setTimeout(() => { if (this.titleEl.textContent === title) this.titleEl.textContent = ''; }, ms); }
  }

  /** Mando del jugador: giro (ratón o teclado/joystick). */
  steer(dt) {
    const c = this.game.cam;
    const mx = c.yaw - this.lastYaw, my = -(c.pitch - this.lastPitch);
    c.pitch = 0.3;
    this.lastYaw = c.yaw;
    this.lastPitch = 0.3;
    const mv = input.moveVector();
    return { mx, my, kx: mv.x, ky: mv.y, dt, yaw: mx * 1.4 - mv.x * 1.7 * dt, pitch: my * 1.4 + mv.y * 1.4 * dt, boost: input.down('ShiftLeft') || input.down('ShiftRight'), fire: input.down('Space') || input.down('Mouse0') || input.mouse.buttons.has(0), firePressed: input.pressed('Space') || input.pressed('Mouse0') };
  }

  fire(color = '#76ff03') {
    const now = performance.now();
    if (now < this.nextShot) return;
    this.nextShot = now + 120;
    const gun = this.ship.userData.guns[this.gunIdx++ % 4];
    const o = new THREE.Vector3(...gun).applyMatrix4(this.ship.matrixWorld);
    const dir = new THREE.Vector3(0, 0, -1).applyQuaternion(this.ship.quaternion);
    const m = new THREE.Mesh(new THREE.CylinderGeometry(0.12, 0.12, 5, 6).rotateX(Math.PI / 2), glowMat(color, 0.95));
    m.position.copy(o);
    m.quaternion.copy(this.ship.quaternion);
    this.scene.add(m);
    this.lasers.push({ m, v: dir.multiplyScalar(420).add(this.vel || new THREE.Vector3()), life: 1.6 });
    sfx.blaster(0.12);
  }

  explode(p, scale = 1, color = '#ffab40') {
    const n = Math.round(40 * Math.min(scale, 4));
    const pos = new Float32Array(n * 3), vel = [];
    for (let i = 0; i < n; i++) { pos.set([p.x, p.y, p.z], i * 3); vel.push(new THREE.Vector3().randomDirection().multiplyScalar((8 + Math.random() * 25) * scale)); }
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.BufferAttribute(pos, 3));
    const pts = new THREE.Points(geo, new THREE.PointsMaterial({ color, size: 1.2 * scale, transparent: true, blending: THREE.AdditiveBlending, depthWrite: false }));
    const ball = new THREE.Mesh(new THREE.SphereGeometry(2 * scale, 16, 12), glowMat('#fff59d', 0.9));
    ball.position.copy(p);
    this.scene.add(pts, ball);
    this.parts.push({ pts, vel, ball, t: 0, life: 1.1, scale });
  }

  spawnEnemy() {
    const e = buildTie();
    const fwd = new THREE.Vector3(0, 0, -1).applyQuaternion(this.ship.quaternion);
    const p = this.ship.position.clone().addScaledVector(fwd, 420 + Math.random() * 200).add(new THREE.Vector3((Math.random() - 0.5) * 300, (Math.random() - 0.5) * 160, (Math.random() - 0.5) * 120));
    e.position.copy(p);
    this.scene.add(e);
    this.enemies.push({ m: e, hp: 3, nextShot: performance.now() + 1500 + Math.random() * 1500, orbit: Math.random() * Math.PI * 2, speed: 55 + Math.random() * 25 });
  }

  hurt(n) {
    if (this.phase === 'dead' || this.phase === 'escape' || this.phase === 'boom') return;
    this.hp -= n;
    this.shake = 0.6;
    this.client.hud.flashHurt();
    sfx.boom(0.18, 0.3);
    if (this.hp <= 0) this.die();
  }

  die() {
    this.phase = 'dead';
    this.explode(this.ship.position.clone(), 2);
    this.ship.visible = false;
    sfx.boom(0.6, 1.6);
    this.say('¡DERRIBADO!', 'Tu caza ha sido destruido');
    this.showButtons(true);
  }

  showButtons(retry) {
    if (input.locked) { this.game.ignoreUnlock = true; input.unlockPointer(); }
    clear(this.btns).append(
      retry ? button('🔁 Reintentar', () => this.restart(), 'primary big') : null,
      button('🏠 Volver a la base', () => this.end(), 'big'),
    );
    this.btns.classList.remove('hidden');
  }

  restart() {
    this.btns.classList.add('hidden');
    this.hp = 100;
    this.ship.visible = true;
    for (const e of this.enemies) this.scene.remove(e.m);
    this.enemies = [];
    if (this.trench) this.enterTrench(true);
    else { this.ship.position.set(0, 0, 0); this.ship.quaternion.identity(); this.phase = 'dogfight'; this.kills = Math.min(this.kills, KILLS_NEEDED - 2); this.say('¡OTRA VEZ!', `Derriba ${KILLS_NEEDED - this.kills} cazas más`, 2500); }
  }

  enterTrench(retry = false) {
    this.phase = 'trench';
    this.phaseT = 0;
    for (const e of this.enemies) this.scene.remove(e.m);
    this.enemies = [];
    if (!this.trench) this.buildTrench();
    this.station.visible = false;
    this.trench.visible = true;
    this.tz = retry ? -TRENCH_LEN * 0.55 : 0;
    this.tx = 0;
    this.ty = -TRENCH.h * 0.45;
    this.torpedoFired = false;
    this.white.style.opacity = 1;
    setTimeout(() => (this.white.style.opacity = 0), 60);
    this.say('¡A LA TRINCHERA!', 'Esquiva las vigas y busca el puerto del reactor al final', 3500);
  }

  buildTrench() {
    const g = new THREE.Group();
    const tex = panelTexture(true);
    tex.repeat.set(1, 40);
    const wallTex = panelTexture(true);
    wallTex.repeat.set(40, 1);
    const floor = new THREE.Mesh(new THREE.BoxGeometry(TRENCH.w, 1, TRENCH_LEN + 300), new THREE.MeshStandardMaterial({ map: tex, color: '#8d939c', roughness: 0.9, emissive: '#fff3c4', emissiveMap: tex, emissiveIntensity: 0.12 }));
    floor.position.set(0, -TRENCH.h, -TRENCH_LEN / 2);
    g.add(floor);
    for (const s of [-1, 1]) {
      const w = new THREE.Mesh(new THREE.BoxGeometry(1, TRENCH.h, TRENCH_LEN + 300), new THREE.MeshStandardMaterial({ map: wallTex, color: '#9aa0a8', roughness: 0.9, emissive: '#fff3c4', emissiveMap: wallTex, emissiveIntensity: 0.12 }));
      w.position.set(s * TRENCH.w / 2, -TRENCH.h / 2, -TRENCH_LEN / 2);
      g.add(w);
      // Superficie de la estación a los lados
      const top = new THREE.Mesh(new THREE.BoxGeometry(400, 1, TRENCH_LEN + 300), new THREE.MeshStandardMaterial({ map: tex, color: '#9ea4ad', roughness: 0.9 }));
      top.position.set(s * (TRENCH.w / 2 + 200), 0, -TRENCH_LEN / 2);
      g.add(top);
    }
    // Relieves en las paredes
    const greeble = new THREE.MeshStandardMaterial({ color: '#5f656e', roughness: 0.8, metalness: 0.4 });
    for (let i = 0; i < 160; i++) {
      const s = Math.random() < 0.5 ? -1 : 1;
      const b = new THREE.Mesh(new THREE.BoxGeometry(1 + Math.random() * 2, 1 + Math.random() * 4, 2 + Math.random() * 8), greeble);
      b.position.set(s * (TRENCH.w / 2 - 0.6), -Math.random() * TRENCH.h, -Math.random() * TRENCH_LEN);
      g.add(b);
    }
    // Vigas que cruzan la trinchera (hay que esquivarlas) y torretas
    this.beams = [];
    for (let i = 0; i < 9; i++) {
      const z = -180 - i * 135;
      const y = -TRENCH.h * (0.2 + Math.random() * 0.6);
      const hor = i % 3 !== 2;
      const beam = new THREE.Mesh(hor ? new THREE.BoxGeometry(TRENCH.w, 2.2, 2.2) : new THREE.BoxGeometry(2.4, TRENCH.h, 2.4), new THREE.MeshStandardMaterial({ color: '#455a64', roughness: 0.6, metalness: 0.5, emissive: '#ff1744', emissiveIntensity: 0.15 }));
      const x = hor ? 0 : (Math.random() - 0.5) * (TRENCH.w - 8);
      beam.position.set(x, hor ? y : -TRENCH.h / 2, z);
      g.add(beam);
      this.beams.push({ z, y, x, hor });
    }
    this.turrets = [];
    for (let i = 0; i < 14; i++) {
      const s = i % 2 ? -1 : 1;
      const t = new THREE.Mesh(new THREE.CylinderGeometry(1.4, 1.8, 3, 8), greeble);
      const z = -120 - i * 100;
      t.position.set(s * (TRENCH.w / 2 + 3), 1.5, z);
      g.add(t);
      this.turrets.push({ p: t.position.clone(), next: 0 });
    }
    // Puerto del reactor al final
    const port = new THREE.Group();
    port.add(new THREE.Mesh(new THREE.CylinderGeometry(3.4, 3.4, 0.6, 20), new THREE.MeshStandardMaterial({ color: '#263238', roughness: 0.5 })));
    const hole = new THREE.Mesh(new THREE.CircleGeometry(1.8, 20).rotateX(-Math.PI / 2), new THREE.MeshBasicMaterial({ color: '#ff6d00' }));
    hole.position.y = 0.32;
    port.add(hole);
    port.position.set(0, -TRENCH.h + 0.6, -TRENCH_LEN);
    g.add(port);
    this.port = port;
    this.portGlow = new THREE.PointLight('#ff6d00', 3, 40, 2);
    this.portGlow.position.set(0, -TRENCH.h + 3, -TRENCH_LEN);
    g.add(this.portGlow);
    g.position.set(0, 5000, 0);
    this.scene.add(g);
    this.trench = g;
  }

  update(dt) {
    if (this.done) return;
    this.phaseT += dt;
    const ctl = this.steer(dt);
    const now = performance.now();
    if (this.phase === 'launch' || this.phase === 'dogfight') this.flyFree(dt, ctl, now);
    else if (this.phase === 'trench') this.flyTrench(dt, ctl, now);
    else if (this.phase === 'escape' || this.phase === 'boom') this.finale(dt);
    else if (this.phase === 'dead') this.chase(dt);

    // Láseres propios
    for (let i = this.lasers.length - 1; i >= 0; i--) {
      const l = this.lasers[i];
      l.m.position.addScaledVector(l.v, dt);
      l.life -= dt;
      let hit = false;
      for (const e of this.enemies) {
        if (e.m.position.distanceTo(l.m.position) < 4.2) {
          e.hp--;
          hit = true;
          if (e.hp <= 0) this.killEnemy(e);
          else this.explode(l.m.position.clone(), 0.3, '#ffe082');
          break;
        }
      }
      if (hit || l.life <= 0) { this.scene.remove(l.m); l.m.geometry.dispose(); this.lasers.splice(i, 1); }
    }
    // Disparos enemigos
    for (let i = this.enemyBolts.length - 1; i >= 0; i--) {
      const b = this.enemyBolts[i];
      b.m.position.addScaledVector(b.v, dt);
      b.life -= dt;
      const hit = this.ship.visible && b.m.position.distanceTo(this.ship.position) < 3.2;
      if (hit) this.hurt(b.dmg);
      if (hit || b.life <= 0) { this.scene.remove(b.m); b.m.geometry.dispose(); this.enemyBolts.splice(i, 1); }
    }
    // Explosiones
    for (let i = this.parts.length - 1; i >= 0; i--) {
      const p = this.parts[i];
      if (p.torpedo) continue;
      p.t += dt;
      const k = p.t / p.life;
      const a = p.pts.geometry.attributes.position;
      p.vel.forEach((v, j) => a.setXYZ(j, a.getX(j) + v.x * dt, a.getY(j) + v.y * dt, a.getZ(j) + v.z * dt));
      a.needsUpdate = true;
      p.pts.material.opacity = 1 - k;
      const s = 1 + k * 3;
      p.ball.scale.set(s, s, s);
      p.ball.material.opacity = 0.9 * (1 - k) * (1 - k);
      if (k >= 1) { this.scene.remove(p.pts, p.ball); p.pts.geometry.dispose(); p.ball.geometry.dispose(); this.parts.splice(i, 1); }
    }
    this.hpFill.style.width = `${Math.max(0, this.hp)}%`;
    this.hpFill.style.background = this.hp > 50 ? '#00e5ff' : this.hp > 25 ? '#ffca28' : '#ff1744';
    for (const eg of this.ship.userData.engines) eg.material.color.set(ctl.boost ? '#ffffff' : '#ff8a65');
    this.stars.position.copy(this.camera.position);
  }

  shipForward() { return new THREE.Vector3(0, 0, -1).applyQuaternion(this.ship.quaternion); }

  flyFree(dt, ctl, now) {
    if (this.phase === 'launch' && this.phaseT > 3) { this.phase = 'dogfight'; for (let i = 0; i < 3; i++) this.spawnEnemy(); }
    // Orientación: guiñada y cabeceo en ejes locales, con alabeo visual
    const yawQ = new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 1, 0), ctl.yaw);
    const pitchQ = new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(1, 0, 0), ctl.pitch);
    this.shipQ.multiply(yawQ).multiply(pitchQ).normalize();
    this.roll += (Math.max(-0.9, Math.min(0.9, ctl.yaw / Math.max(dt, 1e-3) * 0.5)) - this.roll) * Math.min(1, dt * 4);
    this.ship.quaternion.copy(this.shipQ).multiply(new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 0, 1), this.roll));
    const sp = this.speed * (ctl.boost ? 1.8 : 1);
    this.vel = this.shipForward().multiplyScalar(sp);
    this.ship.position.addScaledVector(this.vel, dt);
    this.ship.updateMatrixWorld();
    if (ctl.fire && this.phase === 'dogfight') this.fire();

    // Cazas enemigos: rodean y atacan
    const sp0 = this.ship.position;
    for (const e of this.enemies) {
      e.orbit += dt * 0.6;
      const goal = sp0.clone().add(new THREE.Vector3(Math.cos(e.orbit) * 70, Math.sin(e.orbit * 1.3) * 35, Math.sin(e.orbit) * 70)).addScaledVector(this.shipForward(), 90);
      const dir = goal.sub(e.m.position);
      const d = dir.length();
      e.m.position.addScaledVector(dir.normalize(), Math.min(d, (e.speed + (d > 300 ? 80 : 0)) * dt));
      e.m.lookAt(sp0);
      if (now >= e.nextShot && e.m.position.distanceTo(sp0) < 320) {
        e.nextShot = now + 1100 + Math.random() * 1200;
        const lead = sp0.clone().addScaledVector(this.vel, 0.4).add(new THREE.Vector3((Math.random() - 0.5) * 8, (Math.random() - 0.5) * 8, (Math.random() - 0.5) * 8));
        this.enemyShot(e.m.position.clone(), lead, 10);
      }
    }
    // Si no quedan cerca, aparecen más
    if (this.phase === 'dogfight' && this.enemies.length < Math.min(3, KILLS_NEEDED - this.kills)) this.spawnEnemy();
    // La estación queda siempre delante, a lo lejos
    if (this.phase === 'dogfight') this.objEl.textContent = `Cazas derribados: ${this.kills} / ${KILLS_NEEDED}`;
    this.station.position.set(sp0.x, sp0.y * 0.6, sp0.z - 3200);
    this.chase(dt);
    this.updateReticle();
  }

  enemyShot(from, to, dmg) {
    const dir = to.clone().sub(from).normalize();
    const m = new THREE.Mesh(new THREE.CylinderGeometry(0.15, 0.15, 4.5, 6).rotateX(Math.PI / 2), glowMat('#ff1744', 0.95));
    m.position.copy(from);
    m.lookAt(to);
    this.scene.add(m);
    this.enemyBolts.push({ m, v: dir.multiplyScalar(220), life: 2.5, dmg });
    if (from.distanceTo(this.ship.position) < 150) sfx.blaster(0.06);
  }

  killEnemy(e) {
    this.explode(e.m.position.clone(), 1.4);
    sfx.boom(0.35, 0.9);
    this.scene.remove(e.m);
    this.enemies.splice(this.enemies.indexOf(e), 1);
    this.kills++;
    this.shake = 0.3;
    if (this.phase === 'dogfight' && this.kills >= KILLS_NEEDED) {
      this.phase = 'approach';
      this.say('¡CAZAS ELIMINADOS!', 'Entrando en la trinchera de la Estación Oscura…', 2500);
      setTimeout(() => { if (!this.done && this.phase === 'approach') this.enterTrench(); }, 1800);
    }
  }

  flyTrench(dt, ctl, now) {
    const T = this.trench.position;
    const sp = 85 * (ctl.boost ? 1.35 : 1);
    this.tz -= sp * dt;
    const vx = -ctl.mx * 110 + ctl.kx * 30 * dt, vy = ctl.my * 90 + ctl.ky * 24 * dt;
    this.tx = Math.max(-TRENCH.w / 2 + 3, Math.min(TRENCH.w / 2 - 3, this.tx + vx));
    this.ty = Math.max(-TRENCH.h + 2.5, Math.min(-2, this.ty + vy));
    this.ship.position.set(T.x + this.tx, T.y + this.ty, T.z + this.tz);
    this.roll += (Math.max(-0.8, Math.min(0.8, -vx / Math.max(dt, 1e-3) / 40)) - this.roll) * Math.min(1, dt * 5);
    this.ship.quaternion.setFromEuler(new THREE.Euler(Math.max(-0.4, Math.min(0.4, vy / Math.max(dt, 1e-3) / 60)), 0, this.roll));
    this.ship.updateMatrixWorld();
    this.vel = new THREE.Vector3(0, 0, -sp);
    if (ctl.fire && !this.torpedoFired) this.fire();
    // Vigas
    for (const b of this.beams) {
      if (Math.abs(this.tz - b.z) > 1.8) continue;
      const hitB = b.hor ? Math.abs(this.ty - b.y) < 2.6 : Math.abs(this.tx - b.x) < 2.8;
      if (hitB && !b.hitAt) { b.hitAt = now; this.hurt(34); this.explode(this.ship.position.clone(), 0.6); }
      if (!hitB) b.hitAt = 0;
    }
    // Torretas
    for (const t of this.turrets) {
      const wz = T.z + t.p.z;
      const ahead = this.ship.position.z - wz;
      if (ahead > 30 && ahead < 260 && now >= t.next) {
        t.next = now + 900 + Math.random() * 700;
        const from = new THREE.Vector3(T.x + t.p.x, T.y + t.p.y + 2, wz);
        this.enemyShot(from, this.ship.position.clone().add(new THREE.Vector3(0, 0, -sp * 0.5)).add(new THREE.Vector3((Math.random() - 0.5) * 6, (Math.random() - 0.5) * 6, 0)), 9);
      }
    }
    // Puerto del reactor
    const toPort = this.tz - -TRENCH_LEN;
    this.objEl.textContent = toPort > 0 ? `Puerto del reactor: ${Math.round(toPort)} m` : '';
    const window_ = toPort < 160 && toPort > 25;
    this.lockEl.classList.toggle('hidden', !window_ || this.torpedoFired);
    this.portGlow.intensity = 3 + Math.sin(now / 80) * 2;
    if (window_ && ctl.firePressed && !this.torpedoFired) this.launchTorpedo();
    if (toPort < -40 && !this.torpedoFired) {
      this.say('¡HAS FALLADO!', 'Vuelve a intentarlo: dispara cuando aparezca el aviso', 2500);
      this.tz = -TRENCH_LEN * 0.55;
    }
    this.chase(dt, true);
    this.updateReticle();
  }

  launchTorpedo() {
    this.torpedoFired = true;
    sfx.torpedo();
    const T = this.trench.position;
    for (const s of [-1, 1]) {
      const m = new THREE.Mesh(new THREE.SphereGeometry(0.6, 10, 8), glowMat('#80d8ff', 1));
      m.position.copy(this.ship.position).add(new THREE.Vector3(s * 1.2, -0.6, -2));
      this.scene.add(m);
      this.parts.push({ pts: new THREE.Points(new THREE.BufferGeometry()), vel: [], ball: m, t: 0, life: 99, torpedo: true });
    }
    this.say('¡TORPEDOS FUERA!', '', 1500);
    // Los torpedos vuelan hacia el puerto y entran en él
    const target = new THREE.Vector3(T.x, T.y - TRENCH.h + 1, T.z - TRENCH_LEN);
    const torps = this.parts.filter((p) => p.torpedo);
    const start = performance.now();
    const fly = () => {
      if (this.done) return;
      const k = Math.min(1, (performance.now() - start) / 1100);
      for (const p of torps) p.ball.position.lerp(target, k * 0.25 + 0.02);
      if (k < 1) requestAnimationFrame(fly);
      else {
        for (const p of torps) { this.scene.remove(p.ball); this.parts.splice(this.parts.indexOf(p), 1); }
        this.explode(target, 2.5, '#ff6d00');
        sfx.boom(0.5, 1.4);
        this.say('¡IMPACTO!', '¡Sal de ahí antes de que explote!', 2500);
        this.escape();
      }
    };
    fly();
  }

  escape() {
    this.reticle.style.display = 'none';
    this.phase = 'escape';
    this.phaseT = 0;
    // Salimos de la trinchera y nos alejamos: la estación vuelve a verse entera, detrás
    setTimeout(() => {
      if (this.done) return;
      this.trench.visible = false;
      this.station.visible = true;
      this.station.position.set(0, 0, 0);
      this.ship.position.set(0, 120, 1500);
      this.ship.quaternion.setFromEuler(new THREE.Euler(0, Math.PI, 0));
      this.white.style.opacity = 1;
      setTimeout(() => (this.white.style.opacity = 0), 80);
    }, 1400);
  }

  finale(dt) {
    const t = this.phaseT;
    if (t < 1.4) { this.ship.position.z -= 85 * dt; this.ship.position.y += 25 * dt; this.chase(dt, true); return; }
    // Vista desde detrás de la nave, que se aleja de la estación
    this.ship.position.addScaledVector(this.shipForward(), 90 * dt);
    const camGoal = this.ship.position.clone().add(new THREE.Vector3(0, 6, -26));
    this.camera.position.lerp(camGoal, Math.min(1, dt * 3));
    this.camera.lookAt(this.station.position);
    const R = this.station.userData.R;
    if (this.phase === 'escape' && t > 2.4 && t < 5.5 && Math.random() < dt * 9) {
      // Explosiones en cadena por la superficie
      const p = new THREE.Vector3().randomDirection().multiplyScalar(R * 1.01).add(this.station.position);
      this.explode(p, 5 + Math.random() * 6, Math.random() < 0.5 ? '#ff9100' : '#ffea00');
      if (Math.random() < 0.4) sfx.boom(0.15, 0.6);
    }
    if (this.phase === 'escape' && t > 5.6) {
      this.phase = 'boom';
      this.boomT = 0;
      sfx.boom(0.9, 3.5);
      this.white.style.opacity = 1;
      setTimeout(() => (this.white.style.opacity = 0), 160);
      // Bola de fuego y onda expansiva
      this.fireball = new THREE.Mesh(new THREE.SphereGeometry(R, 40, 24), glowMat('#fff3e0', 1));
      this.fireball.position.copy(this.station.position);
      this.ring = new THREE.Mesh(new THREE.TorusGeometry(R, R * 0.04, 8, 96), glowMat('#80d8ff', 0.9));
      this.ring.position.copy(this.station.position);
      this.ring.rotation.x = Math.PI / 2 + 0.25;
      this.scene.add(this.fireball, this.ring);
      this.station.visible = false;
      for (let i = 0; i < 6; i++) this.explode(this.station.position.clone().add(new THREE.Vector3().randomDirection().multiplyScalar(R * 0.5)), 30, i % 2 ? '#ffab40' : '#fff59d');
    }
    if (this.phase === 'boom') {
      this.boomT += dt;
      const k = this.boomT;
      const s = 1 + k * 1.5;
      this.fireball.scale.set(s, s, s);
      this.fireball.material.opacity = Math.max(0, 1 - k / 2.2);
      this.fireball.material.color.lerp(new THREE.Color('#ff6d00'), dt);
      const rs = 1 + k * 4.5;
      this.ring.scale.set(rs, rs, rs);
      this.ring.material.opacity = Math.max(0, 0.9 - k / 4);
      if (k > 1.2 && !this.won) this.win();
    }
  }

  win() {
    this.won = true;
    const ms = performance.now() - this.t0;
    this.say('💥 ¡ESTACIÓN OSCURA DESTRUIDA!', `¡Lo has conseguido, piloto! (${Math.round(ms / 1000)} s)`);
    audio.play('levelup');
    net.request('mode', { name: 'starDone', data: { ms } }).then((r) => {
      if (r?.error) toast(r.error, 'warn');
      else toast('🏆 ¡Misión cumplida! Mira tus premios en el Avatar.', 'reward', 5000);
    });
    setTimeout(() => { if (!this.done) this.showButtons(false); }, 3500);
  }

  /** Cámara de persecución detrás de la nave. */
  chase(dt, tight = false) {
    if (this.phase === 'dead') { this.camera.lookAt(this.ship.position); return; }
    const off = new THREE.Vector3(0, tight ? 2.6 : 3.2, tight ? 11 : 14).applyQuaternion(tight ? new THREE.Quaternion() : this.shipQ);
    const goal = this.ship.position.clone().add(off);
    this.camera.position.lerp(goal, Math.min(1, dt * (tight ? 9 : 6)));
    const look = this.ship.position.clone().addScaledVector(tight ? new THREE.Vector3(0, 0, -1) : this.shipForward(), 30);
    this.camera.up.set(0, 1, 0).applyQuaternion(tight ? new THREE.Quaternion() : this.shipQ);
    this.camera.lookAt(look);
    if (this.shake > 0) {
      this.camera.position.add(new THREE.Vector3((Math.random() - 0.5) * this.shake, (Math.random() - 0.5) * this.shake, 0));
      this.shake = Math.max(0, this.shake - dt * 1.5);
    }
  }

  /** Mira en pantalla: donde apuntan los cañones, 140 m por delante. */
  updateReticle() {
    const p = this.ship.position.clone().addScaledVector(this.shipForward(), 140).project(this.camera);
    this.reticle.style.left = `${(p.x * 0.5 + 0.5) * 100}%`;
    this.reticle.style.top = `${(-p.y * 0.5 + 0.5) * 100}%`;
  }

  end(silent = false) {
    if (this.done) return;
    this.done = true;
    clearTimeout(this.sayT);
    this.el.remove();
    this.game.hud.el.style.visibility = '';
    if (engine.view === this.view) { engine.view = this.game; engine.resize(); }
    this.scene.traverse((o) => { o.geometry?.dispose(); if (o.material && !Array.isArray(o.material)) { o.material.map?.dispose(); o.material.dispose(); } });
    if (!silent) this.onDone();
  }
}
