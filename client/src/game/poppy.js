// Fábrica Feliz (cliente): primera persona con dos manos extensibles (azul y roja)
// unidas a la mochila por un cable. Clic izquierdo / Z = mano azul, clic derecho / X =
// mano roja. El servidor valida cada agarre; aquí se dibuja todo y se anima.
import * as THREE from 'three';
import { net } from '../core/net.js';
import { input } from '../engine/input.js';
import { audio } from '../audio/audio.js';
import { store } from '../core/store.js';
import { h, toast, clear } from '../ui/dom.js';
import { setGroupState } from '../world/worldBuilder.js';
import { POPPY, DOORS, GRABS, GRAB_BY_ID, MACHINE, TAPES, POPPY_AREAS } from '../../../shared/worlds/poppy.js';

const HANDS = { blue: { color: '#2979ff', side: -1 }, red: { color: '#ff1744', side: 1 } };
const KIND_LABEL = { scanner: 'Escáner', plug: 'Enchufe del generador', receiver: 'Receptor eléctrico', gear: 'Engranaje', lever: 'Palanca', switch: 'Interruptor de la caja' };
const put = (el, ...kids) => {
  clear(el);
  for (const c of kids.flat(Infinity)) if (c != null && c !== false) el.append(c);
  return el;
};

export function handMesh(color) {
  const g = new THREE.Group();
  const mat = new THREE.MeshStandardMaterial({ color, roughness: 0.5, emissive: color, emissiveIntensity: 0.15 });
  const palm = new THREE.Mesh(new THREE.SphereGeometry(0.11, 12, 10), mat);
  palm.scale.set(1, 0.55, 1.15);
  g.add(palm);
  const fingers = [];
  for (let i = 0; i < 4; i++) {
    const piv = new THREE.Group();
    piv.position.set(-0.06 + i * 0.04, 0, -0.1);
    const f = new THREE.Mesh(new THREE.CapsuleGeometry(0.024, 0.09, 3, 6), mat);
    f.position.z = -0.05;
    f.rotation.x = Math.PI / 2;
    piv.add(f);
    g.add(piv);
    fingers.push(piv);
  }
  g.userData.fingers = fingers;
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

/** Tito Larguirucho: peluche altísimo con brazos larguísimos articulados y una boca enorme. */
export function buildTito() {
  const root = new THREE.Group();
  const body = new THREE.Group();
  root.add(body);
  const fur = new THREE.MeshStandardMaterial({ color: '#3949ab', roughness: 0.95 });
  const furDark = new THREE.MeshStandardMaterial({ color: '#283593', roughness: 1 });
  const dark = new THREE.MeshStandardMaterial({ color: '#1a1a2e', roughness: 1 });
  const hand = new THREE.MeshStandardMaterial({ color: '#fdd835', roughness: 0.8 });
  const mouthMat = new THREE.MeshStandardMaterial({ color: '#4a0000', roughness: 1 });
  const teethMat = new THREE.MeshStandardMaterial({ color: '#fffde7', roughness: 0.4 });
  const eyeMat = new THREE.MeshStandardMaterial({ color: '#111111', emissive: '#ff1744', emissiveIntensity: 0.2 });
  const add = (geo, mat, x, y, z, parent, s = null, r = null) => {
    const o = new THREE.Mesh(geo, mat);
    o.position.set(x, y, z);
    if (s) o.scale.set(...s);
    if (r) o.rotation.set(...r);
    o.castShadow = true;
    parent.add(o);
    return o;
  };
  // Torso con barriga y costuras
  add(new THREE.CapsuleGeometry(0.42, 1.5, 4, 12), fur, 0, 2.55, 0, body, [1, 1, 0.8]);
  add(new THREE.SphereGeometry(0.36, 12, 10), furDark, 0, 2.35, 0.2, body, [0.9, 1.4, 0.5]);
  for (let i = 0; i < 4; i++) add(new THREE.BoxGeometry(0.05, 0.02, 0.02), dark, 0, 1.9 + i * 0.28, 0.36, body);
  // Piernas con rodilla
  const legs = [-1, 1].map((sd) => {
    const hip = new THREE.Group();
    hip.position.set(sd * 0.25, 1.75, 0);
    body.add(hip);
    add(new THREE.CapsuleGeometry(0.14, 0.65, 4, 8), fur, 0, -0.42, 0, hip);
    const knee = new THREE.Group();
    knee.position.y = -0.85;
    hip.add(knee);
    add(new THREE.CapsuleGeometry(0.13, 0.6, 4, 8), fur, 0, -0.38, 0, knee);
    add(new THREE.SphereGeometry(0.2, 10, 8), dark, 0, -0.8, 0.08, knee, [1, 0.6, 1.4]);
    return { hip, knee };
  });
  // Brazos larguísimos: hombro, codo y mano con dedos
  const arms = [-1, 1].map((sd) => {
    const shoulder = new THREE.Group();
    shoulder.position.set(sd * 0.52, 3.35, 0);
    body.add(shoulder);
    add(new THREE.SphereGeometry(0.16, 10, 8), fur, 0, 0, 0, shoulder);
    add(new THREE.CapsuleGeometry(0.1, 1.3, 4, 8), fur, 0, -0.75, 0, shoulder);
    const elbow = new THREE.Group();
    elbow.position.y = -1.5;
    shoulder.add(elbow);
    add(new THREE.CapsuleGeometry(0.09, 1.25, 4, 8), fur, 0, -0.7, 0, elbow);
    const palm = add(new THREE.SphereGeometry(0.2, 10, 8), hand, 0, -1.45, 0.05, elbow, [1, 1.3, 0.7]);
    for (let i = 0; i < 3; i++) add(new THREE.CapsuleGeometry(0.045, 0.3, 3, 6), hand, -0.09 + i * 0.09, -0.3, 0.02, palm, null, [0, 0, (i - 1) * 0.25]);
    return { shoulder, elbow };
  });
  // Cabeza con boca que se abre
  const head = new THREE.Group();
  head.position.set(0, 4.05, 0.05);
  body.add(head);
  add(new THREE.SphereGeometry(0.5, 18, 14), fur, 0, 0.05, 0, head, [1, 0.95, 0.9]);
  for (const sd of [-1, 1]) {
    add(new THREE.SphereGeometry(0.16, 10, 8), fur, sd * 0.42, 0.45, 0, head, [0.7, 1, 0.5]);
    add(new THREE.SphereGeometry(0.1, 10, 8), dark, sd * 0.17, 0.16, 0.4, head);
    add(new THREE.SphereGeometry(0.04, 8, 6), eyeMat, sd * 0.17, 0.17, 0.49, head);
  }
  add(new THREE.SphereGeometry(0.34, 14, 10), mouthMat, 0, -0.12, 0.2, head, [1, 0.55, 0.8]); // interior de la boca
  // Labio y dientes de arriba (fijos)
  add(new THREE.TorusGeometry(0.33, 0.045, 6, 20, Math.PI), new THREE.MeshStandardMaterial({ color: '#c62828' }), 0, -0.04, 0.33, head, [1, 0.45, 1], [0, 0, Math.PI]);
  for (let i = 0; i < 9; i++) add(new THREE.ConeGeometry(0.03, 0.09, 4), teethMat, -0.24 + i * 0.06, -0.09, 0.38 - Math.abs(i - 4) * 0.012, head, null, [Math.PI, 0, 0]);
  const jaw = new THREE.Group();
  jaw.position.set(0, -0.12, 0.05);
  head.add(jaw);
  add(new THREE.SphereGeometry(0.36, 14, 8, 0, Math.PI * 2, Math.PI / 2, Math.PI / 2), fur, 0, 0.02, 0, jaw, [1, 0.6, 0.95]);
  add(new THREE.TorusGeometry(0.31, 0.045, 6, 20, Math.PI), new THREE.MeshStandardMaterial({ color: '#c62828' }), 0, -0.02, 0.28, jaw, [1, 0.45, 1]);
  for (let i = 0; i < 8; i++) add(new THREE.ConeGeometry(0.028, 0.08, 4), teethMat, -0.21 + i * 0.06, 0.02, 0.33 - Math.abs(i - 3.5) * 0.012, jaw);
  return { root, body, arms, legs, head, jaw, eyeMat };
}

/** Pose de Tito según lo que esté haciendo (t en segundos). */
export function poseTito(T, mode, t) {
  const [la, ra] = T.arms;
  const [ll, rl] = T.legs;
  if (mode === 'chase') {
    const sw = Math.sin(t * 11);
    T.body.rotation.x = 0.35;
    ll.hip.rotation.x = sw * 0.8; rl.hip.rotation.x = -sw * 0.8;
    ll.knee.rotation.x = Math.max(0, -sw) * 1.2; rl.knee.rotation.x = Math.max(0, sw) * 1.2;
    la.shoulder.rotation.set(-1.4 + sw * 0.5, 0, 0.3); ra.shoulder.rotation.set(-1.4 - sw * 0.5, 0, -0.3);
    la.elbow.rotation.x = -0.4; ra.elbow.rotation.x = -0.4;
    T.jaw.rotation.x = 0.35 + Math.abs(Math.sin(t * 7)) * 0.4;
    T.head.rotation.set(-0.25, 0, Math.sin(t * 3) * 0.15);
    T.eyeMat.emissiveIntensity = 3;
  } else if (mode === 'scare') {
    T.body.rotation.x = -0.04;
    la.shoulder.rotation.set(-1.9, 0, 1.0 + Math.sin(t * 30) * 0.1); ra.shoulder.rotation.set(-1.9, 0, -1.0 - Math.sin(t * 30) * 0.1);
    la.elbow.rotation.x = -0.9; ra.elbow.rotation.x = -0.9;
    T.jaw.rotation.x = 0.85 + Math.sin(t * 40) * 0.12;
    T.head.rotation.set(0.1 + Math.sin(t * 45) * 0.06, Math.sin(t * 37) * 0.08, Math.sin(t * 29) * 0.25);
    T.eyeMat.emissiveIntensity = 5;
    for (const l of T.legs) { l.hip.rotation.x = 0; l.knee.rotation.x = 0; }
  } else if (mode === 'dead') {
    T.body.rotation.x = 0;
    T.jaw.rotation.x = 0.6;
    T.eyeMat.emissiveIntensity = 0;
  } else {
    // Dormido o asomándose: cabeza ladeada y brazos colgando
    const peek = mode === 'peek';
    T.body.rotation.x = peek ? 0.12 : 0;
    for (const l of T.legs) { l.hip.rotation.x = 0; l.knee.rotation.x = 0; }
    la.shoulder.rotation.set(Math.sin(t * 0.7) * 0.06, 0, 0.05); ra.shoulder.rotation.set(-Math.sin(t * 0.7) * 0.06, 0, -0.05);
    la.elbow.rotation.x = peek ? -0.3 : 0; ra.elbow.rotation.x = peek ? -0.3 : 0;
    T.jaw.rotation.x = peek ? 0.25 + Math.sin(t * 2) * 0.1 : 0.03;
    T.head.rotation.set(peek ? 0 : 0.3, 0, peek ? 0.45 : 0.35);
    T.eyeMat.emissiveIntensity = peek ? 2 : 0.15;
  }
}

/** Muñeco colgado de un hilo (susto de la sala de montaje). */
function buildPuppet() {
  const g = new THREE.Group();
  const m = new THREE.MeshStandardMaterial({ color: '#ffe0b2', roughness: 0.9 });
  const cloth = new THREE.MeshStandardMaterial({ color: '#8e24aa', roughness: 1 });
  const head = new THREE.Mesh(new THREE.SphereGeometry(0.28, 12, 10), m);
  head.position.y = -0.35;
  g.add(head);
  for (const sd of [-1, 1]) {
    const e = new THREE.Mesh(new THREE.SphereGeometry(0.05, 8, 6), new THREE.MeshStandardMaterial({ color: '#000', emissive: '#ff1744', emissiveIntensity: 2 }));
    e.position.set(sd * 0.1, -0.32, 0.25);
    g.add(e);
  }
  const b = new THREE.Mesh(new THREE.CapsuleGeometry(0.2, 0.4, 4, 8), cloth);
  b.position.y = -0.85;
  g.add(b);
  const line = new THREE.Mesh(new THREE.CylinderGeometry(0.01, 0.01, 4, 4), new THREE.MeshBasicMaterial({ color: '#dddddd' }));
  line.position.y = 1.9;
  g.add(line);
  return g;
}

/** Brazo de Tito que sale por la rejilla de ventilación. */
function buildVentArm() {
  const g = new THREE.Group();
  const fur = new THREE.MeshStandardMaterial({ color: '#3949ab', roughness: 0.95 });
  const arm = new THREE.Mesh(new THREE.CapsuleGeometry(0.1, 2.6, 4, 8), fur);
  arm.rotation.z = Math.PI / 2;
  arm.position.x = 1.3;
  g.add(arm);
  const palm = new THREE.Mesh(new THREE.SphereGeometry(0.22, 10, 8), new THREE.MeshStandardMaterial({ color: '#fdd835' }));
  palm.position.x = 2.7;
  palm.scale.set(1.3, 1, 0.7);
  g.add(palm);
  for (let i = 0; i < 3; i++) {
    const f = new THREE.Mesh(new THREE.CapsuleGeometry(0.05, 0.3, 3, 6), palm.material);
    f.position.set(2.95, -0.12 + i * 0.12, 0);
    f.rotation.z = Math.PI / 2;
    g.add(f);
  }
  return g;
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
    this.titoT = 0;
    this.scared = new Set(); // sustos de esta ronda ya vistos
    this.darkUntil = 0;
    this.redUntil = 0;
    this.props = []; // objetos temporales de los sustos
    this.puppet = buildPuppet();
    this.puppet.visible = false;
    this.ventArm = buildVentArm();
    this.ventArm.position.set(-12.3, 4.6, 30);
    this.ventArm.scale.set(0.01, 1, 1);
    this.alarm = new THREE.PointLight('#ff1744', 0, 22, 1.4);
    game.scene.add(this.puppet, this.ventArm, this.alarm);
    // Capas de los sustos
    this.vignette = h('div.pp-vignette');
    this.blackEl = h('div.pp-black.hidden', h('div.pp-black-text'));
    this.hud.el.append(this.vignette, this.blackEl);
    this.intro();

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
      this.scared.clear();
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
      // El cable cuelga un poco (más al recogerlo)
      const pts = [];
      const len = origin.distanceTo(wp);
      const sag = len * (s.t > out + hold ? 0.12 : 0.04);
      for (let i = 0; i <= 12; i++) {
        const u = i / 12;
        const q = origin.clone().lerp(wp, u);
        q.y -= Math.sin(u * Math.PI) * sag;
        pts.push(q);
      }
      s.line.geometry.setFromPoints(pts);
      const grip = s.t > out * 0.8 && s.t < out + hold + back * 0.5 ? 1.2 : 0;
      for (const fg of s.mesh.userData.fingers || []) fg.rotation.x += (grip - fg.rotation.x) * 0.4;
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

  /** Susto animado: Tito se abalanza desde la oscuridad, sacude la cabeza y grita; luego todo se apaga. */
  jumpscare() {
    const now = performance.now();
    this.scareStart = now;
    this.scareUntil = now + 2600;
    audio.play('laugh');
    setTimeout(() => audio.play('fnafscream'), 280);
    this.vignette.className = 'pp-vignette scare';
    setTimeout(() => {
      this.blackEl.classList.remove('hidden');
      this.blackEl.firstChild.textContent = 'TITO TE HA ATRAPADO';
      this.vignette.className = 'pp-vignette';
    }, 1500);
    setTimeout(() => this.blackEl.classList.add('hidden'), 2900);
  }

  /** Apaga las luces de la fábrica un momento (los sustos). */
  dark(ms) {
    this.darkUntil = performance.now() + ms;
    const g = this.game;
    g.groupState.pplights = false;
    setGroupState(g.built, 'pplights', false);
    audio.play('powerdown');
    clearTimeout(this.darkT);
    this.darkT = setTimeout(() => {
      g.groupState.pplights = true;
      setGroupState(g.built, 'pplights', true);
      audio.play('switch');
    }, ms);
  }

  /** Sustos preparados en cada zona (una vez por ronda). */
  scares(b, now) {
    const once = (id, cond, fn) => { if (!this.scared.has(id) && cond) { this.scared.add(id); fn(); } };
    once('crate', b.z > 19.5 && b.z < 34, () => {
      this.dark(1300);
      const crate = new THREE.Mesh(new THREE.BoxGeometry(1.4, 1.4, 1.4), new THREE.MeshStandardMaterial({ color: '#8d6e63', roughness: 0.9 }));
      crate.position.set(b.x > 0 ? b.x - 2.5 : b.x + 2.5, 6, b.z + 3);
      this.game.scene.add(crate);
      this.props.push({ mesh: crate, vy: 0, floor: 0.7, until: now + 25000, bang: true });
    });
    once('vent', b.z > 27.5 && b.z < 35, () => {
      this.ventAt = now;
      audio.play('servo', { x: -12, y: 4.6, z: 30 });
      setTimeout(() => audio.play('laugh', { x: -12, y: 4.6, z: 30 }, { quiet: true }), 300);
    });
    once('puppet', b.z > 45 && b.z < 58, () => {
      this.puppetAt = now;
      this.puppet.position.set(b.x * 0.5, 6, b.z + 4.5);
      this.puppet.visible = true;
      audio.play('whisper');
      audio.play('switch', { x: this.puppet.position.x, y: 4, z: this.puppet.position.z });
    });
    once('blackout', b.z > 70 && b.z < 79 && !this.s.chase, () => {
      this.dark(2600);
      audio.play('musicbox');
      this.redUntil = now + 2600;
      this.peek = { p: [5.5, 0, 77.5], until: now + 2400, close: true };
    });
  }

  /** Pantalla de inicio estilo cinta VHS (se puede saltar). */
  intro() {
    if (PoppyClient.introShown) return;
    PoppyClient.introShown = true;
    const lines = ['▶ PLAY    12-03-1995', 'FÁBRICA FELIZ', '«Donde cada juguete tiene un corazón»', 'Hace diez años, todo el personal desapareció en una sola noche.', 'Hoy alguien te ha dejado una cinta… y una mochila con dos manos.', 'Encuentra la salida.'];
    const box = h('div.pp-intro-lines');
    const el = h('div.pp-intro', h('div.pp-intro-rec', '● REC'), box, h('small.pp-intro-skip', 'Pulsa cualquier tecla o toca para saltar'));
    this.hud.el.appendChild(el);
    audio.play('static', null, { dur: 0.8 });
    let i = 0;
    const next = () => {
      if (i >= lines.length) return;
      box.append(h(`div${i === 1 ? '.big' : ''}`, lines[i++]));
      audio.play('keyUp');
      this.introT = setTimeout(next, i === 2 ? 1500 : 1700);
    };
    next();
    const end = () => {
      clearTimeout(this.introT);
      el.classList.add('out');
      setTimeout(() => el.remove(), 700);
      removeEventListener('keydown', end);
    };
    el.addEventListener('pointerdown', end);
    addEventListener('keydown', end);
    setTimeout(end, 11000);
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
    const darkNow = now < this.darkUntil;
    g.sky.hemi.intensity = darkNow ? 0.03 : 0.22 + (Math.random() < 0.004 ? -0.15 : 0);
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
    // La linterna parpadea cuando se apagan las luces
    this.flash.intensity = this.flashOn ? (darkNow && Math.sin(now / 37) > 0.4 ? 60 : 380) : 0;
    // Alarma roja giratoria durante la persecución y en los apagones
    const red = this.s.chase && !this.s.won ? 1 : now < this.redUntil ? 0.6 : 0;
    this.alarm.intensity = red ? (Math.sin(now / 120) > 0 ? 30 * red : 4) : 0;
    this.alarm.position.set(cam.position.x + Math.sin(now / 300) * 3, 5.6, cam.position.z + 4);
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
    this.titoT += dt;
    if (now < this.scareUntil) {
      const k = Math.min(1, (now - this.scareStart) / 320);
      const dist = 6.5 - k * k * 5.1; // de 6,5 m a 1,4 m en un tercio de segundo
      const p = cam.position.clone().addScaledVector(new THREE.Vector3(fwd.x, 0, fwd.z).normalize(), dist);
      t.root.position.set(p.x, cam.position.y - 4.05 + (1 - k) * 0.6, p.z);
      t.root.rotation.set(0, Math.atan2(-fwd.x, -fwd.z), 0);
      poseTito(t, 'scare', this.titoT);
      g.cam.shake = k < 1 ? 0.05 : 0.22;
      this.handGlow.intensity = 9;
      this.handGlow.position.copy(cam.position).addScaledVector(fwd, 0.4);
      this.flash.intensity = Math.random() < 0.3 ? 0 : 40; // la linterna falla
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
    poseTito(t, peek ? 'peek' : this.titoState, this.titoT);
    t.root.position.y = pos.y + (this.titoState === 'dead' ? -1 : 0);
    t.root.rotation.x = this.titoState === 'dead' ? -1.4 : 0;
    // En el apagón de la sala de juegos solo se le ven los ojos
    t.root.visible = !(peek?.close && !darkNow);

    // Objetos de los sustos
    for (const pr of [...this.props]) {
      if (pr.mesh.position.y > pr.floor) {
        pr.vy -= 30 * dt;
        pr.mesh.position.y = Math.max(pr.floor, pr.mesh.position.y + pr.vy * dt);
        pr.mesh.rotation.x += dt * 2;
        if (pr.mesh.position.y <= pr.floor && pr.bang) { audio.play('bang', pr.mesh.position); g.cam.shake = 0.08; setTimeout(() => (g.cam.shake = 0), 300); }
      }
      if (now > pr.until) { g.scene.remove(pr.mesh); this.props.splice(this.props.indexOf(pr), 1); }
    }
    if (this.ventAt) {
      const e = (now - this.ventAt) / 1000;
      const out = e < 0.5 ? e / 0.5 : e < 1.8 ? 1 : Math.max(0, 1 - (e - 1.8) / 0.4);
      this.ventArm.scale.x = Math.max(0.01, out);
      this.ventArm.rotation.z = Math.sin(now / 90) * 0.08 * out;
      if (e > 2.3) this.ventAt = 0;
    }
    if (this.puppetAt) {
      const e = (now - this.puppetAt) / 1000;
      this.puppet.position.y = 6 - Math.min(1, e / 0.35) * 3.2 + (e > 3 ? (e - 3) * 4 : 0);
      this.puppet.rotation.z = Math.sin(e * 5) * 0.4 * Math.max(0, 1 - e / 3);
      this.puppet.rotation.y += dt * 2;
      if (e > 4.5) { this.puppetAt = 0; this.puppet.visible = false; }
    }
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
    this.scares(b, now);
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
    clearTimeout(this.darkT);
    clearTimeout(this.introT);
    for (const pr of this.props) g.scene.remove(pr.mesh);
    g.scene.remove(this.puppet, this.ventArm, this.alarm);
    g.scene.remove(this.viewHands, this.flash, this.flashTarget, this.handGlow, this.tito.root, ...this.items.values(), ...this.tapeMeshes.values());
    for (const el of [this.chargeEl, this.aimEl, this.tapeEl, this.vignette, this.blackEl]) el.remove();
    document.querySelector('.pp-intro')?.remove();
  }
}
