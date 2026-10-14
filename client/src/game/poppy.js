// Fábrica Feliz (cliente): primera persona con dos manos extensibles (azul y roja)
// unidas a la mochila por un cable. Clic izquierdo / Z = mano azul, clic derecho / X =
// mano roja. El servidor valida cada agarre; aquí se dibuja todo y se anima.
import * as THREE from 'three';
import { net } from '../core/net.js';
import { input } from '../engine/input.js';
import { audio } from '../audio/audio.js';
import { store } from '../core/store.js';
import { h, toast, clear } from '../ui/dom.js';
import { POPPY, DOORS, GRABS, GRAB_BY_ID, MACHINE, TAPES, POPPY_AREAS } from '../../../shared/worlds/poppy.js';

const HANDS = { blue: { color: '#2979ff', side: -1 }, red: { color: '#ff1744', side: 1 } };
const KIND_LABEL = { scanner: 'Escáner', plug: 'Enchufe del generador', receiver: 'Receptor eléctrico', gear: 'Engranaje', lever: 'Palanca', switch: 'Interruptor de la caja' };
const put = (el, ...kids) => {
  clear(el);
  for (const c of kids.flat(Infinity)) if (c != null && c !== false) el.append(c);
  return el;
};

function handMesh(color) {
  const g = new THREE.Group();
  const mat = new THREE.MeshStandardMaterial({ color, roughness: 0.5, emissive: color, emissiveIntensity: 0.15 });
  const palm = new THREE.Mesh(new THREE.SphereGeometry(0.11, 12, 10), mat);
  palm.scale.set(1, 0.55, 1.15);
  g.add(palm);
  for (let i = 0; i < 4; i++) {
    const f = new THREE.Mesh(new THREE.CapsuleGeometry(0.024, 0.09, 3, 6), mat);
    f.position.set(-0.06 + i * 0.04, 0, -0.14);
    f.rotation.x = Math.PI / 2;
    g.add(f);
  }
  const thumb = new THREE.Mesh(new THREE.CapsuleGeometry(0.025, 0.07, 3, 6), mat);
  thumb.position.set(0.1, 0, -0.04);
  thumb.rotation.set(Math.PI / 2, 0, -0.8);
  g.add(thumb);
  const cuff = new THREE.Mesh(new THREE.CylinderGeometry(0.07, 0.08, 0.12, 10), new THREE.MeshStandardMaterial({ color: '#455a64', metalness: 0.7, roughness: 0.4 }));
  cuff.rotation.x = Math.PI / 2;
  cuff.position.z = 0.1;
  g.add(cuff);
  g.userData.mat = mat;
  return g;
}

function gearMesh() {
  const g = new THREE.Group();
  const m = new THREE.MeshStandardMaterial({ color: '#ffb300', metalness: 0.8, roughness: 0.3, emissive: '#5d3a00', emissiveIntensity: 0.5 });
  g.add(new THREE.Mesh(new THREE.TorusGeometry(0.28, 0.09, 6, 16), m));
  for (let i = 0; i < 8; i++) {
    const t = new THREE.Mesh(new THREE.BoxGeometry(0.12, 0.14, 0.16), m);
    const a = (i / 8) * Math.PI * 2;
    t.position.set(Math.cos(a) * 0.4, Math.sin(a) * 0.4, 0);
    t.rotation.z = a;
    g.add(t);
  }
  return g;
}

function tapeMesh() {
  const g = new THREE.Group();
  g.add(new THREE.Mesh(new THREE.BoxGeometry(0.5, 0.1, 0.3), new THREE.MeshStandardMaterial({ color: '#111111', roughness: 0.6 })));
  const label = new THREE.Mesh(new THREE.BoxGeometry(0.34, 0.02, 0.14), new THREE.MeshStandardMaterial({ color: '#fafafa', emissive: '#ff4081', emissiveIntensity: 0.3 }));
  label.position.y = 0.06;
  g.add(label);
  return g;
}

/** Tito Larguirucho: peluche altísimo de brazos larguísimos y sonrisa enorme. */
function buildTito() {
  const root = new THREE.Group();
  const fur = new THREE.MeshStandardMaterial({ color: '#3949ab', roughness: 0.95 });
  const dark = new THREE.MeshStandardMaterial({ color: '#1a1a2e', roughness: 1 });
  const hand = new THREE.MeshStandardMaterial({ color: '#fdd835', roughness: 0.8 });
  const add = (geo, mat, x, y, z, parent = root, s = null) => {
    const o = new THREE.Mesh(geo, mat);
    o.position.set(x, y, z);
    if (s) o.scale.set(...s);
    o.castShadow = true;
    parent.add(o);
    return o;
  };
  add(new THREE.CapsuleGeometry(0.42, 1.5, 4, 10), fur, 0, 2.55, 0, root, [1, 1, 0.8]);
  const legs = [-1, 1].map((s) => {
    const piv = new THREE.Group();
    piv.position.set(s * 0.25, 1.75, 0);
    root.add(piv);
    add(new THREE.CapsuleGeometry(0.14, 1.4, 4, 8), fur, 0, -0.85, 0, piv);
    add(new THREE.SphereGeometry(0.2, 10, 8), dark, 0, -1.65, 0.08, piv, [1, 0.6, 1.4]);
    return piv;
  });
  const arms = [-1, 1].map((s) => {
    const piv = new THREE.Group();
    piv.position.set(s * 0.5, 3.35, 0);
    root.add(piv);
    add(new THREE.CapsuleGeometry(0.1, 2.6, 4, 8), fur, 0, -1.4, 0, piv);
    add(new THREE.SphereGeometry(0.2, 10, 8), hand, 0, -2.85, 0.05, piv, [1, 1.3, 0.7]);
    for (let i = 0; i < 3; i++) add(new THREE.CapsuleGeometry(0.04, 0.22, 3, 6), hand, -0.08 + i * 0.08, -3.1, 0.05, piv);
    return piv;
  });
  const head = new THREE.Group();
  head.position.set(0, 4.05, 0.05);
  root.add(head);
  add(new THREE.SphereGeometry(0.5, 18, 14), fur, 0, 0, 0, head, [1, 0.95, 0.9]);
  // Cara: sonrisa enorme pintada en una textura
  const cv = document.createElement('canvas');
  cv.width = 256; cv.height = 128;
  const g = cv.getContext('2d');
  g.fillStyle = '#3949ab'; g.fillRect(0, 0, 256, 128);
  g.fillStyle = '#c62828'; g.beginPath(); g.moveTo(40, 62); g.quadraticCurveTo(128, 140, 216, 62); g.quadraticCurveTo(128, 92, 40, 62); g.fill();
  g.fillStyle = '#fffde7';
  for (let i = 0; i < 12; i++) { const x = 52 + i * 13.5; g.beginPath(); g.moveTo(x, 66 + Math.abs(6 - i) * 0.8); g.lineTo(x + 6, 82); g.lineTo(x + 12, 66 + Math.abs(6 - i) * 0.8); g.fill(); }
  g.fillStyle = '#000000'; g.beginPath(); g.arc(98, 40, 9, 0, Math.PI * 2); g.arc(158, 40, 9, 0, Math.PI * 2); g.fill();
  g.fillStyle = '#ffffff'; g.beginPath(); g.arc(101, 37, 3, 0, Math.PI * 2); g.arc(161, 37, 3, 0, Math.PI * 2); g.fill();
  const tex = new THREE.CanvasTexture(cv);
  tex.colorSpace = THREE.SRGBColorSpace;
  const face = new THREE.Mesh(new THREE.SphereGeometry(0.505, 24, 16, Math.PI * 0.15, Math.PI * 0.7, Math.PI * 0.2, Math.PI * 0.6), new THREE.MeshStandardMaterial({ map: tex, roughness: 0.9 }));
  face.scale.set(1, 0.95, 0.9);
  head.add(face);
  for (const s of [-1, 1]) add(new THREE.SphereGeometry(0.16, 10, 8), fur, s * 0.42, 0.38, 0, head, [0.7, 1, 0.5]);
  return { root, arms, legs, head };
}

export class PoppyClient {
  constructor(game, state) {
    this.game = game;
    this.hud = game.hud;
    this.netEvents = {};
    this.firstPerson = true;
    this.customAudio = true;
    this.blockEmotes = true;
    this.s = state.pp || { doors: [false, false, false, false], gears: {}, placed: 0, chase: false, won: false, round: 1, carried: {} };
    this.myTapes = new Set(state.tapes || []);
    this.chargeUntil = 0;
    this.flashOn = true;
    this.scareUntil = 0;
    this.peek = null;
    this.creakAcc = 0;
    this.beatAcc = 0;
    this.shots = []; // manos en vuelo (propias y de otros)
    this.hint = ['[Clic izq.] o [Z] MANO AZUL · [Clic der.] o [X] MANO ROJA (agarran a distancia)', '[E] coger / usar  [F] linterna  [Shift] correr'];

    // Manos en primera persona
    this.viewHands = new THREE.Group();
    this.hands = {};
    for (const [k, d] of Object.entries(HANDS)) {
      const m = handMesh(d.color);
      m.position.set(d.side * 0.32, -0.32, -0.62);
      this.viewHands.add(m);
      this.hands[k] = m;
    }
    game.scene.add(this.viewHands);
    this.cableMat = { blue: new THREE.LineBasicMaterial({ color: '#2979ff' }), red: new THREE.LineBasicMaterial({ color: '#ff1744' }) };

    // Linterna
    this.flash = new THREE.SpotLight('#fff1d6', 380, 26, 0.55, 0.5, 1.5);
    this.flashTarget = new THREE.Object3D();
    this.flash.target = this.flashTarget;
    this.handGlow = new THREE.PointLight('#ff1744', 0, 3, 2);
    game.scene.add(this.flash, this.flashTarget, this.handGlow);

    // Objetos que se agarran o se cogen
    this.items = new Map();
    for (const gr of GRABS) {
      let mesh;
      if (gr.kind === 'gear') mesh = gearMesh();
      else {
        const color = gr.hand === 'red' ? '#ff1744' : '#2979ff';
        mesh = new THREE.Mesh(new THREE.BoxGeometry(0.8, 0.8, 0.12), new THREE.MeshStandardMaterial({ color: '#263238', emissive: color, emissiveIntensity: 0.9 }));
        // Huella de mano en los escáneres
        if (gr.kind === 'scanner') mesh.add(new THREE.Mesh(new THREE.CircleGeometry(0.22, 16), new THREE.MeshBasicMaterial({ color })).translateZ(-0.07).rotateY(Math.PI));
      }
      mesh.position.set(...gr.p);
      game.scene.add(mesh);
      this.items.set(gr.id, mesh);
    }
    this.tapeMeshes = new Map();
    for (const t of TAPES) {
      const m = tapeMesh();
      m.position.set(...t.p);
      game.scene.add(m);
      this.tapeMeshes.set(t.id, m);
    }
    // Tito
    this.tito = buildTito();
    const [hx, hy, hz] = POPPY.monsterHome;
    this.tito.root.position.set(hx, hy, hz);
    this.tito.root.rotation.y = Math.PI;
    game.scene.add(this.tito.root);
    this.titoPos = new THREE.Vector3(hx, hy, hz);
    this.titoTarget = this.titoPos.clone();
    this.titoRy = Math.PI;
    this.titoState = 'sleep';

    // HUD
    this.chargeEl = h('div.pp-charge.hidden', h('div'));
    this.hud.el.appendChild(this.chargeEl);
    this.aimEl = h('div.pp-aim');
    this.hud.el.appendChild(this.aimEl);
    this.tapeEl = h('div.pp-tape.panel.hidden');
    this.hud.el.appendChild(this.tapeEl);
    this.hud.crosshair.classList.remove('hidden');
    if (input.isTouch) {
      this.hud.addTouchButton('🔵', 'KeyZ', { right: '120px', bottom: '170px', width: '64px', height: '64px' });
      this.hud.addTouchButton('🔴', 'KeyX', { right: '40px', bottom: '200px', width: '64px', height: '64px' });
    }
    this.offMouse = input.on('mousedown', (e) => {
      if (!input.locked || this.game.paused) return;
      if (e.button === 0) this.fire('blue');
      if (e.button === 2) this.fire('red');
    });

    this.netEvents.pp = (s) => { const prev = this.s; this.s = s; this.applyState(prev); };
    this.netEvents['pp:hand'] = ({ id, hand, to }) => {
      if (id === store.user.id) return;
      const r = this.game.remotes.get(id);
      if (r) this.launch(hand, new THREE.Vector3(r.pos.x, r.pos.y + 1.4, r.pos.z), new THREE.Vector3(...to), true);
    };
    this.netEvents['pp:door'] = ({ i }) => {
      audio.play('metaldoor', { x: 0, y: 2, z: DOORS[i].z });
      this.hud.showCenter('🚪', `${DOORS[i].name}: ¡abierta!`, 1800);
    };
    this.netEvents['pp:wake'] = () => {
      const c = this.game.built.objects.get('case');
      if (c?.mesh) c.mesh.visible = false;
      audio.play('pop', { x: 0, y: 3, z: 90 });
      audio.play('laugh', { x: 0, y: 4, z: 92 });
      setTimeout(() => audio.play('fnafscream'), 400);
      this.hud.showCenter('😈', '¡TITO SE HA DESPERTADO! ¡CORRE A LA SALIDA!', 3200);
      audio.loop('pp-chase', { freq: 55, type: 'sawtooth', filter: 380, vol: 0.06 });
    };
    this.netEvents['pp:caught'] = ({ id, name }) => {
      if (id === store.user.id) this.jumpscare();
      else toast(`😱 Tito ha atrapado a ${name}`, 'warn');
    };
    this.netEvents['pp:peek'] = ({ p }) => {
      if (this.s.chase) return;
      this.peek = { p, until: performance.now() + 3000 };
      audio.play('laugh', { x: p[0], y: 3, z: p[2] }, { quiet: true });
    };
    this.netEvents['pp:win'] = ({ by }) => {
      this.crateFall = performance.now();
      audio.stopLoops();
      this.startAudio();
      setTimeout(() => { audio.play('bang', { x: 0, y: 1, z: 165 }, { big: true }); audio.play('win'); }, 600);
      this.hud.showCenter('🎉', `¡${by} ha tirado la caja sobre Tito! ¡Habéis escapado!`, 5000);
    };
    this.applyState(null);
  }

  // --- Estado ---------------------------------------------------------------------
  applyState(prev) {
    const s = this.s;
    s.doors.forEach((open, i) => {
      const e = this.game.built.objects.get(DOORS[i].id);
      if (!e) return;
      e.colliders.forEach((c) => (c.enabled = !open));
      e.targetY = open ? 6.2 : 2;
    });
    for (const [id, st] of Object.entries(s.gears || {})) {
      const m = this.items.get(id);
      if (m && !this.flyingGear?.has(id)) m.visible = !st;
    }
    if (prev && s.round !== prev.round) {
      this.myTapes.clear();
      for (const m of this.tapeMeshes.values()) m.visible = true;
      const c = this.game.built.objects.get('case');
      if (c?.mesh) c.mesh.visible = true;
      this.crateFall = 0;
      const cr = this.game.built.objects.get('crate');
      if (cr?.mesh) cr.mesh.position.set(0, 5.4, 165);
      audio.stopLoops();
      this.startAudio();
    }
    for (const [id, m] of this.tapeMeshes) m.visible = !this.myTapes.has(id);
    this.renderObjectives();
  }

  renderObjectives() {
    const s = this.s;
    const next = s.doors.findIndex((o) => !o);
    const mine = s.carried?.[store.user.id] || 0;
    const list = [];
    if (s.won) list.push({ text: '¡Habéis escapado! Nueva ronda en unos segundos', done: true });
    else if (s.chase) list.push({ text: 'Corre por el pasillo y agarra el interruptor ROJO de la salida para tirarle la caja a Tito' });
    else if (next >= 0) list.push({ text: DOORS[next].hint });
    else list.push({ text: 'Entra en la sala de la vitrina… si te atreves' });
    if (next === 2 && !s.chase) list.push({ text: 'Engranajes en la máquina', progress: s.placed, total: 3 }, { text: `Llevas ${mine} engranaje${mine === 1 ? '' : 's'}` });
    list.push({ text: 'Cintas VHS encontradas', progress: this.myTapes.size, total: TAPES.length });
    this.hud.setObjectives(list, `🧸 Fábrica Feliz · Ronda ${s.round}`);
  }

  // --- Manos -------------------------------------------------------------------------
  /** Busca el objeto agarrable más alineado con la mira. */
  aimTarget() {
    const cam = this.game.camera;
    const fwd = new THREE.Vector3();
    cam.getWorldDirection(fwd);
    let best = null, bd = 0.965;
    for (const gr of GRABS) {
      const m = this.items.get(gr.id);
      if (gr.kind === 'gear' && (!m.visible || this.s.gears?.[gr.id])) continue;
      const to = new THREE.Vector3(...gr.p).sub(cam.position);
      const d = to.length();
      if (d > POPPY.handRange) continue;
      const dot = to.normalize().dot(fwd);
      // Que no haya una pared en medio
      if (dot > bd) {
        const hit = this.game.physics.raycast(cam.position.x, cam.position.y, cam.position.z, to.x, to.y, to.z, d, 0.05);
        if (hit.dist < d - 0.8 && gr.kind !== 'gear') continue;
        bd = dot;
        best = gr;
      }
    }
    return best;
  }

  async fire(hand) {
    if (this.shots.some((s) => s.own && s.hand === hand) || this.frozen) return;
    const cam = this.game.camera;
    const fwd = new THREE.Vector3();
    cam.getWorldDirection(fwd);
    const t = this.aimTarget();
    const from = this.hands[hand].getWorldPosition(new THREE.Vector3());
    let to;
    if (t) to = new THREE.Vector3(...t.p);
    else {
      const hit = this.game.physics.raycast(cam.position.x, cam.position.y, cam.position.z, fwd.x, fwd.y, fwd.z, POPPY.handRange, 0.05);
      to = cam.position.clone().addScaledVector(fwd, Math.min(POPPY.handRange, hit.dist));
    }
    audio.play('boost');
    const shot = this.launch(hand, from, to, false);
    if (!t) return;
    const r = await net.request('mode', { name: 'grab', data: { id: t.id, hand } });
    if (r.error) {
      toast(r.error, 'warn');
      audio.ui('error');
      return;
    }
    if (r.msg) this.hud.showCenter('⏱️', r.msg, 1500);
    audio.play(t.kind === 'gear' ? 'chest' : 'switch', { x: t.p[0], y: t.p[1], z: t.p[2] });
    if (r.charged) {
      this.chargeUntil = performance.now() + POPPY.chargeMs;
      audio.play('hit');
      this.hud.showCenter('⚡', '¡Mano roja cargada! Dispárala al receptor (7 s)', 1800);
    }
    if (t.kind === 'receiver') this.chargeUntil = 0;
    if (r.gear) {
      // El engranaje vuelve con la mano
      shot.carry = this.items.get(t.id);
      this.flyingGear = this.flyingGear || new Set();
      this.flyingGear.add(t.id);
    }
  }

  /** Lanza una mano de `from` a `to` con su cable (también las de otros jugadores). */
  launch(hand, from, to, remote) {
    const mesh = remote ? handMesh(HANDS[hand].color) : this.hands[hand];
    if (remote) this.game.scene.add(mesh);
    const line = new THREE.Line(new THREE.BufferGeometry().setFromPoints([from, to]), this.cableMat[hand]);
    this.game.scene.add(line);
    const shot = { hand, from: from.clone(), to: to.clone(), t: 0, mesh, line, own: !remote, remote };
    this.shots.push(shot);
    return shot;
  }

  updateShots(dt) {
    const out = 0.16, hold = 0.18, back = 0.2;
    for (const s of [...this.shots]) {
      s.t += dt;
      // Para las manos propias, el origen sigue a la cámara
      const origin = s.own ? this.restPos(s.hand) : s.from;
      let k;
      if (s.t < out) k = s.t / out;
      else if (s.t < out + hold) k = 1;
      else k = Math.max(0, 1 - (s.t - out - hold) / back);
      const p = origin.clone().lerp(s.to, k);
      if (s.own) this.viewHands.worldToLocal(p);
      s.mesh.position.copy(p);
      if (s.remote) s.mesh.lookAt(s.to);
      const wp = s.own ? this.viewHands.localToWorld(s.mesh.position.clone()) : s.mesh.position;
      s.line.geometry.setFromPoints([origin, wp]);
      if (s.carry && s.t > out + hold) s.carry.position.copy(wp);
      if (s.t >= out + hold + back) {
        this.game.scene.remove(s.line);
        s.line.geometry.dispose();
        if (s.remote) this.game.scene.remove(s.mesh);
        else s.mesh.position.set(HANDS[s.hand].side * 0.32, -0.32, -0.62);
        if (s.carry) {
          s.carry.visible = false;
          for (const [id, m] of this.items) if (m === s.carry) { this.flyingGear.delete(id); m.position.set(...GRAB_BY_ID[id].p); }
          audio.play('coin');
        }
        this.shots.splice(this.shots.indexOf(s), 1);
      }
    }
  }

  restPos(hand) {
    return this.viewHands.localToWorld(new THREE.Vector3(HANDS[hand].side * 0.32, -0.32, -0.62));
  }

  // --- Interacciones (E) ------------------------------------------------------------
  interactions(b) {
    const out = [];
    const d = (p) => Math.hypot(b.x - p[0], b.z - p[2]);
    for (const t of TAPES) {
      if (this.myTapes.has(t.id)) continue;
      if (d(t.p) < 2.2 && Math.abs(b.y - t.p[1]) < 3.2) out.push({ d: d(t.p), label: `📼 Coger cinta VHS`, act: () => this.pickTape(t) });
    }
    for (const gr of GRABS) {
      if (gr.kind !== 'gear' || this.s.gears?.[gr.id]) continue;
      if (d(gr.p) < 2.2 && Math.abs(b.y - gr.p[1]) < 2.2) out.push({ d: d(gr.p), label: '⚙️ Coger engranaje', act: () => net.request('mode', { name: 'pick', data: { id: gr.id } }).then((r) => (r.error ? toast(r.error, 'warn') : audio.play('coin'))) });
    }
    if (d(MACHINE) < 3) {
      const mine = this.s.carried?.[store.user.id] || 0;
      out.push({ d: d(MACHINE), label: mine ? `⚙️ Poner ${mine} engranaje${mine === 1 ? '' : 's'} en la máquina` : `Máquina de montaje (${this.s.placed}/3)`, act: () => net.request('mode', { name: 'machine' }).then((r) => (r.error ? toast(r.error, 'warn') : audio.play('chest'))) });
    }
    return out;
  }

  async pickTape(t) {
    const r = await net.request('mode', { name: 'pick', data: { id: t.id } });
    if (r.error) return toast(r.error, 'warn');
    this.myTapes.add(t.id);
    this.tapeMeshes.get(t.id).visible = false;
    audio.play('gem');
    put(this.tapeEl, h('b', `📼 ${t.title}`), h('p', t.text), h('small.muted', `Cintas: ${this.myTapes.size}/${TAPES.length}`));
    this.tapeEl.classList.remove('hidden');
    clearTimeout(this.tapeT);
    this.tapeT = setTimeout(() => this.tapeEl.classList.add('hidden'), 9000);
    this.renderObjectives();
  }

  get frozen() {
    return performance.now() < this.scareUntil;
  }

  jumpscare() {
    this.scareUntil = performance.now() + 1700;
    audio.play('fnafscream');
    const flash = h('div', { style: { position: 'absolute', inset: 0, background: 'radial-gradient(circle, rgba(120,0,0,0.15), rgba(0,0,0,0.85) 75%)', zIndex: 5, pointerEvents: 'none', animation: 'hurt 1.6s forwards' } });
    this.hud.el.appendChild(flash);
    setTimeout(() => flash.remove(), 1700);
  }

  // --- Audio y luz ---------------------------------------------------------------------
  startAudio() {
    audio.stopMusic();
    audio.setAmbient(null);
    audio.loop('pp-drone', { freq: 46, type: 'triangle', filter: 220, vol: 0.035 });
    audio.loop('pp-hum', { freq: 120, type: 'sawtooth', filter: 160, vol: 0.012 });
    audio.loop('pp-air', { noise: true, filter: 400, vol: 0.02 });
  }

  skyTime() {
    return 0.02;
  }

  afterSky(dt) {
    const g = this.game;
    const now = performance.now();
    g.sky.hemi.intensity = 0.22;
    g.sky.sun.intensity = 0;
    g.scene.fog.color.set('#07070a');
    g.scene.fog.near = 4;
    g.scene.fog.far = 42;
    g.sky.uniforms.top.value.set('#020205');
    g.sky.uniforms.bottom.value.set('#050508');
    const cam = g.camera;
    // Las manos siguen a la cámara
    this.viewHands.position.copy(cam.position);
    this.viewHands.quaternion.copy(cam.quaternion);
    const bob = Math.sin(now / 160) * 0.01 * Math.min(1, Math.hypot(g.player.body.vx, g.player.body.vz) / 6);
    for (const [k, m] of Object.entries(this.hands)) if (!this.shots.some((s) => s.own && s.hand === k)) m.position.y = -0.32 + bob;
    // Linterna
    const fwd = new THREE.Vector3();
    cam.getWorldDirection(fwd);
    this.flash.position.copy(cam.position).addScaledVector(fwd, 0.3);
    this.flashTarget.position.copy(cam.position).addScaledVector(fwd, 8);
    this.flash.intensity = this.flashOn ? 380 : 0;
    // Mano roja cargada
    const charged = now < this.chargeUntil;
    this.hands.red.userData.mat.emissiveIntensity = charged ? 1.2 + Math.sin(now / 40) * 0.6 : 0.15;
    this.handGlow.intensity = charged ? 2.5 : 0;
    this.handGlow.position.copy(this.hands.red.getWorldPosition(new THREE.Vector3()));
    this.chargeEl.classList.toggle('hidden', !charged);
    if (charged) this.chargeEl.firstChild.style.width = `${((this.chargeUntil - now) / POPPY.chargeMs) * 100}%`;

    // Puertas que suben
    for (const dd of DOORS) {
      const e = g.built.objects.get(dd.id);
      if (e?.mesh && e.targetY != null) e.mesh.position.y += (e.targetY - e.mesh.position.y) * Math.min(1, dt * 4);
    }
    // Caja que cae sobre Tito
    const cr = g.built.objects.get('crate');
    if (cr?.mesh && this.crateFall) {
      const k = Math.min(1, (now - this.crateFall) / 600);
      cr.mesh.position.set(this.titoPos.x, 5.4 - k * k * (5.4 - 1.3 - this.titoPos.y), this.titoPos.z);
    }

    // Tito
    const t = this.tito;
    if (now < this.scareUntil) {
      const p = cam.position.clone().addScaledVector(fwd, 1.4);
      t.root.position.set(p.x, cam.position.y - 4.05, p.z);
      t.root.rotation.y = Math.atan2(-fwd.x, -fwd.z);
      t.arms[0].rotation.x = -2.2; t.arms[1].rotation.x = -2.2;
      t.head.rotation.z = Math.sin(now / 40) * 0.2;
      g.cam.shake = 0.16;
      return;
    }
    if (g.cam.shake > 0.1) g.cam.shake = 0;
    this.titoPos.lerp(this.titoTarget, Math.min(1, dt * 10));
    let pos = this.titoPos, ry = this.titoRy;
    const peek = this.peek && now < this.peek.until ? this.peek : null;
    if (peek) {
      // Se asoma de lejos y desaparece si te acercas
      const pb = g.player.body;
      if (Math.hypot(pb.x - peek.p[0], pb.z - peek.p[2]) < 7) this.peek = null;
      else { pos = new THREE.Vector3(...peek.p); ry = Math.atan2(pb.x - peek.p[0], pb.z - peek.p[2]); }
    }
    t.root.position.copy(pos);
    t.root.rotation.y = ry;
    const run = this.titoState === 'chase';
    const sw = run ? Math.sin(now / 90) : 0;
    t.legs[0].rotation.x = sw * 0.7; t.legs[1].rotation.x = -sw * 0.7;
    t.arms[0].rotation.x = run ? -0.6 + sw * 0.9 : Math.sin(now / 900) * 0.08;
    t.arms[1].rotation.x = run ? -0.6 - sw * 0.9 : -Math.sin(now / 900) * 0.08;
    t.head.rotation.z = this.titoState === 'sleep' && !peek ? 0.35 : Math.sin(now / 500) * 0.12;
    t.root.position.y = pos.y + (this.titoState === 'dead' ? -1 : 0);
    t.root.rotation.x = this.titoState === 'dead' ? -1.4 : 0;
  }

  onSnap(m) {
    if (!m.pp) return;
    const [x, y, z, ry, st] = m.pp;
    if (this.titoTarget.distanceTo(new THREE.Vector3(x, y, z)) > 12) this.titoPos.set(x, y, z);
    this.titoTarget.set(x, y, z);
    this.titoRy = ry;
    this.titoState = st;
  }

  update(dt) {
    const g = this.game;
    const b = g.player.body;
    const now = performance.now();
    if (input.pressed('KeyF')) { this.flashOn = !this.flashOn; audio.play('switch'); }
    if (input.pressed('KeyZ')) this.fire('blue');
    if (input.pressed('KeyX')) this.fire('red');
    this.updateShots(dt);
    // Mira: indica qué se puede agarrar
    const t = this.aimTarget();
    const label = t ? `${t.hand === 'red' ? '🔴' : t.hand === 'blue' ? '🔵' : '🔵🔴'} ${KIND_LABEL[t.kind]}` : '';
    if (label !== this.aimLabel) {
      this.aimLabel = label;
      this.aimEl.textContent = label;
      this.hud.crosshair.classList.toggle('pp-target', !!t);
    }
    // Zona actual
    const area = POPPY_AREAS.find((a) => b.z >= a.z0 && b.z < a.z1);
    if (area && area.name !== this.area) {
      this.area = area.name;
      if (this.areaShown) this.hud.showCenter('', area.name, 1400);
      this.areaShown = true;
    }
    // Latidos si Tito está cerca y persiguiendo
    const dT = Math.hypot(this.titoPos.x - b.x, this.titoPos.z - b.z);
    if (this.titoState === 'chase' && dT < 30) {
      this.beatAcc += dt;
      if (this.beatAcc > 0.28 + (dT / 30) * 0.8) { this.beatAcc = 0; audio.play('heartbeat', null, { vol: 1 - dT / 34 }); }
      if (Math.random() < dt * 0.6) audio.play('servo', { x: this.titoPos.x, y: 2, z: this.titoPos.z });
    }
    // Ruidos de la fábrica
    this.creakAcc += dt;
    if (this.creakAcc > 9 + Math.random() * 10) {
      this.creakAcc = 0;
      audio.play(Math.random() < 0.5 ? 'door' : 'servo', { x: b.x + (Math.random() - 0.5) * 20, y: 3, z: b.z + 8 + Math.random() * 10 });
    }
    // Objetos que giran
    for (const [id, m] of this.items) if (GRAB_BY_ID[id].kind === 'gear' && m.visible && !this.flyingGear?.has(id)) m.rotation.z += dt * 1.5;
    for (const m of this.tapeMeshes.values()) if (m.visible) m.rotation.y += dt;
  }

  dispose() {
    this.offMouse?.();
    clearTimeout(this.tapeT);
    audio.stopLoops();
    this.hud.crosshair.classList.add('hidden');
    this.hud.crosshair.classList.remove('pp-target');
    const g = this.game;
    for (const s of this.shots) { g.scene.remove(s.line); if (s.remote) g.scene.remove(s.mesh); }
    g.scene.remove(this.viewHands, this.flash, this.flashTarget, this.handGlow, this.tito.root, ...this.items.values(), ...this.tapeMeshes.values());
    for (const el of [this.chargeEl, this.aimEl, this.tapeEl]) el.remove();
  }
}
