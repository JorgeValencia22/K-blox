// Turno de Noche (cliente): oficina en primera persona, monitor de cámaras que dibuja la
// escena real desde cada cámara, puertas, luces, linterna, animatrónicos, lobby, panel del
// animatrónico jugador, sustos y sonido. El servidor decide todo lo importante.
import * as THREE from 'three';
import { net } from '../core/net.js';
import { input } from '../engine/input.js';
import { engine } from '../engine/renderer.js';
import { audio } from '../audio/audio.js';
import { store } from '../core/store.js';
import { h, toast, clear, button } from '../ui/dom.js';
import { setGroupState } from '../world/worldBuilder.js';
import {
  FNAF, ANIMATRONICS, ANIM_IDS, NODES, CAMS, CAM_BY_ID, CAM_OF_NODE, ROUTES, HOME, MAX_NIGHT, FNAF_MODES, ROLES, NAV,
  nodePos, inOffice,
} from '../../../shared/worlds/fnaf.js';

const HOURS = ['12 AM', '1 AM', '2 AM', '3 AM', '4 AM', '5 AM', '6 AM'];
const DOOR_VIEW = {
  doorL: { pos: [-8.4, 2.6, 23.5], look: [-3, 1.4, 20] },
  doorR: { pos: [8.4, 2.6, 23.5], look: [3, 1.4, 20] },
  office: { pos: [0, 3.6, 25], look: [0, 1, 18] },
};
/** Vacía el elemento y añade los hijos (ignora null/false y aplana listas). */
const put = (el, ...kids) => {
  clear(el);
  for (const c of kids.flat(Infinity)) if (c != null && c !== false) el.append(c);
  return el;
};
const v3 = (a) => new THREE.Vector3(a[0], a[1], a[2]);
const near = (b, p, r) => Math.hypot(b.x - p[0], b.z - p[2]) < r;

// =====================================================================================
// Modelos de los animatrónicos (originales, hechos con piezas simples)
// =====================================================================================
const SKINS = {
  bear: { body: '#7b4a2a', belly: '#c08a5b', extra: '#111111' },
  bunny: { body: '#5c6bc0', belly: '#9fa8da', extra: '#c62828' },
  chicken: { body: '#f9c33a', belly: '#fff8e1', extra: '#ff7043' },
  fox: { body: '#b3332c', belly: '#e8b796', extra: '#212121' },
};

function buildAnimatronic(id) {
  const c = SKINS[id];
  const mat = (color, extra = {}) => new THREE.MeshStandardMaterial({ color, roughness: 0.85, ...extra });
  const fur = mat(c.body), belly = mat(c.belly), dark = mat(c.extra), metal = mat('#8a8f98', { metalness: 0.7, roughness: 0.4 });
  const eyeGlow = new THREE.MeshStandardMaterial({ color: '#ffffff', emissive: id === 'bunny' ? '#ff1744' : '#ffeb3b', emissiveIntensity: 0.3 });
  const root = new THREE.Group();
  const body = new THREE.Group();
  root.add(body);
  const m = (geo, material, x, y, z, s, r, parent = body) => {
    const o = new THREE.Mesh(geo, material);
    o.position.set(x, y, z);
    if (s) o.scale.set(...s);
    if (r) o.rotation.set(...r);
    o.castShadow = true;
    parent.add(o);
    return o;
  };
  const tall = id === 'fox' ? 0.95 : 1;
  // Torso y barriga
  m(new THREE.CapsuleGeometry(0.5, 0.55, 4, 12), fur, 0, 1.35 * tall, 0, [1.05, 1, 0.85]);
  m(new THREE.SphereGeometry(0.42, 14, 10), belly, 0, 1.25 * tall, 0.22, [0.9, 1, 0.5]);
  // Cabeza
  const head = new THREE.Group();
  head.position.set(0, 2.15 * tall, 0.02);
  body.add(head);
  m(new THREE.SphereGeometry(0.42, 18, 14), fur, 0, 0, 0, [1, 0.95, 0.95], null, head);
  const snoutLen = id === 'fox' ? 1.45 : id === 'chicken' ? 0.6 : 1;
  m(new THREE.SphereGeometry(0.22, 14, 10), belly, 0, -0.1, 0.32, [1.15, 0.7, snoutLen], null, head);
  // Mandíbula articulada
  const jaw = new THREE.Group();
  jaw.position.set(0, -0.16, 0.06);
  head.add(jaw);
  if (id === 'chicken') {
    m(new THREE.ConeGeometry(0.13, 0.32, 8), mat('#ff9800'), 0, 0.02, 0.48, null, [Math.PI / 2, 0, 0], head);
    m(new THREE.ConeGeometry(0.11, 0.26, 8), mat('#fb8c00'), 0, -0.04, 0.42, null, [Math.PI / 2, 0, 0], jaw);
  } else {
    m(new THREE.SphereGeometry(0.2, 12, 8), fur, 0, -0.06, 0.24, [1.1, 0.45, snoutLen * 1.1], null, jaw);
    // Dientes
    for (let i = -2; i <= 2; i++) m(new THREE.BoxGeometry(0.05, 0.07, 0.04), mat('#f5f5f0'), i * 0.07, 0.02, 0.4 + (id === 'fox' ? 0.12 : 0), null, null, jaw);
  }
  m(new THREE.SphereGeometry(0.07, 10, 8), mat('#1b1b1b'), 0, -0.02, 0.5 * (id === 'fox' ? 1.3 : id === 'chicken' ? 0 : 1), null, null, head).visible = id !== 'chicken';
  // Ojos (brillan en la oscuridad)
  const eyes = [];
  for (const s of [-1, 1]) {
    m(new THREE.SphereGeometry(0.11, 12, 10), mat('#f0f0f0'), s * 0.16, 0.1, 0.32, [1, 1, 0.6], null, head);
    eyes.push(m(new THREE.SphereGeometry(0.045, 8, 6), eyeGlow, s * 0.16, 0.1, 0.39, null, null, head));
    m(new THREE.BoxGeometry(0.22, 0.06, 0.05), dark, s * 0.16, 0.24, 0.32, null, [0, 0, s * -0.25], head); // ceja
  }
  if (id === 'fox') eyes[1].material = mat('#000000'), m(new THREE.CylinderGeometry(0.13, 0.13, 0.05, 12), mat('#111111'), 0.16, 0.1, 0.36, null, [Math.PI / 2, 0, 0], head); // parche
  // Orejas
  if (id === 'bear') for (const s of [-1, 1]) m(new THREE.SphereGeometry(0.14, 10, 8), fur, s * 0.3, 0.34, -0.02, [1, 1, 0.5], null, head);
  if (id === 'bunny') for (const s of [-1, 1]) m(new THREE.CapsuleGeometry(0.09, 0.62, 4, 8), fur, s * 0.17, 0.72, -0.05, [1, 1, 0.55], [0, 0, s * -0.15], head);
  if (id === 'fox') for (const s of [-1, 1]) m(new THREE.ConeGeometry(0.15, 0.4, 4), fur, s * 0.25, 0.44, -0.02, [1, 1, 0.5], [0, 0, s * -0.25], head);
  if (id === 'chicken') for (let i = 0; i < 3; i++) m(new THREE.SphereGeometry(0.07, 8, 6), mat('#ff7043'), (i - 1) * 0.08, 0.42, 0.05, [0.7, 1.4, 0.7], null, head);
  // Sombrero de copa y pajarita de Bruno; pajaritas de colores
  if (id === 'bear') {
    m(new THREE.CylinderGeometry(0.14, 0.14, 0.26, 14), dark, 0, 0.5, 0, null, null, head);
    m(new THREE.CylinderGeometry(0.24, 0.24, 0.03, 16), dark, 0, 0.38, 0, null, null, head);
  }
  if (id !== 'chicken') for (const s of [-1, 1]) m(new THREE.ConeGeometry(0.09, 0.16, 4), id === 'bear' ? dark : mat(c.extra), s * 0.09, 1.82 * tall, 0.36, [1, 1, 0.5], [0, 0, s * Math.PI / 2]);
  if (id === 'chicken') {
    // Babero "¡A COMER!"
    const cv = document.createElement('canvas');
    cv.width = 128; cv.height = 64;
    const g = cv.getContext('2d');
    g.fillStyle = '#ffffff'; g.fillRect(0, 0, 128, 64);
    g.fillStyle = '#e91e63'; g.font = '900 22px Nunito, sans-serif'; g.textAlign = 'center'; g.fillText('¡A COMER!', 64, 40);
    const tex = new THREE.CanvasTexture(cv);
    tex.colorSpace = THREE.SRGBColorSpace;
    m(new THREE.PlaneGeometry(0.62, 0.34), new THREE.MeshStandardMaterial({ map: tex, roughness: 0.9 }), 0, 1.55, 0.43);
  }
  // Brazos (con articulaciones metálicas a la vista)
  const arm = (s) => {
    const piv = new THREE.Group();
    piv.position.set(s * 0.6, 1.72 * tall, 0);
    body.add(piv);
    m(new THREE.CapsuleGeometry(0.13, 0.42, 4, 8), fur, 0, -0.28, 0, null, null, piv);
    m(new THREE.SphereGeometry(0.09, 8, 6), metal, 0, -0.56, 0, null, null, piv);
    m(new THREE.CapsuleGeometry(0.12, 0.38, 4, 8), fur, 0, -0.82, 0, null, null, piv);
    m(new THREE.SphereGeometry(0.14, 10, 8), belly, 0, -1.08, 0.02, null, null, piv);
    return piv;
  };
  const armL = arm(-1), armR = arm(1);
  if (id === 'fox') m(new THREE.TorusGeometry(0.12, 0.03, 6, 12, Math.PI * 1.4), metal, 0, -1.22, 0.05, null, [0, 0, 0.5], armR); // garfio
  if (id === 'bear') m(new THREE.CylinderGeometry(0.04, 0.03, 0.3, 8), metal, 0, -1.12, 0.14, null, [1.2, 0, 0], armR); // micrófono
  if (id === 'bunny') { // guitarra
    const gt = new THREE.Group();
    gt.position.set(0.05, 1.15, 0.5);
    gt.rotation.z = 0.7;
    body.add(gt);
    m(new THREE.BoxGeometry(0.5, 0.32, 0.08), mat('#c62828'), 0, 0, 0, null, null, gt);
    m(new THREE.BoxGeometry(0.62, 0.07, 0.05), mat('#3e2723'), 0.5, 0, 0, null, null, gt);
  }
  if (id === 'chicken') { // magdalena
    m(new THREE.CylinderGeometry(0.13, 0.1, 0.12, 12), mat('#ec407a'), 0, -1.22, 0.12, null, null, armR);
    m(new THREE.SphereGeometry(0.12, 10, 8), mat('#f8bbd0'), 0, -1.12, 0.12, null, null, armR);
    m(new THREE.SphereGeometry(0.035, 6, 4), mat('#ffffff', { emissive: '#ffffff', emissiveIntensity: 0.5 }), 0.03, -1.04, 0.14, null, null, armR);
  }
  // Piernas
  const leg = (s) => {
    const piv = new THREE.Group();
    piv.position.set(s * 0.26, 0.85 * tall, 0);
    body.add(piv);
    m(new THREE.CapsuleGeometry(0.15, 0.35, 4, 8), fur, 0, -0.22, 0, null, null, piv);
    m(new THREE.SphereGeometry(0.1, 8, 6), metal, 0, -0.45, 0, null, null, piv);
    m(new THREE.CapsuleGeometry(0.14, 0.2, 4, 8), fur, 0, -0.62, 0, null, null, piv);
    m(new THREE.BoxGeometry(0.3, 0.14, 0.42), belly, 0, -0.8, 0.08, null, null, piv);
    return piv;
  };
  const legL = leg(-1), legR = leg(1);
  return { root, body, head, jaw, eyes, eyeMat: eyeGlow, armL, armR, legL, legR };
}

// =====================================================================================
export class FnafClient {
  constructor(game, state) {
    this.game = game;
    this.hud = game.hud;
    this.netEvents = {};
    this.customAudio = true;
    this.s = state.fnaf || { phase: 'lobby', players: [], cfg: { mode: 'classic', night: 1 } };
    this.snap = null;
    this.monitor = null; // { cam } con el monitor abierto
    this.lastCam = '1A';
    this.flashOn = false;
    this.flashAcc = 0;
    this.scareUntil = 0;
    this.scareAnim = null;
    this.staticUntil = 0;
    this.camPanT = 0;
    this.lobbyOpen = true;
    this.hold = null;
    this.stamina = 100;
    this.exhausted = false;
    this.bat = 100;
    this.lightKey = { L: false, R: false };
    this.beepAcc = 0;
    this.breathAcc = 0;
    this.lastHour = -1;
    this.fanT = 0;

    // Animatrónicos
    this.anims = {};
    for (const id of ANIM_IDS) {
      const model = buildAnimatronic(id);
      const [x, y, z, ry] = nodePos(HOME[id], id);
      model.root.position.set(x, y, z);
      model.root.rotation.y = (ry * Math.PI) / 180;
      game.scene.add(model.root);
      this.anims[id] = { id, model, pos: new THREE.Vector3(x, y, z), target: new THREE.Vector3(x, y, z), ry: (ry * Math.PI) / 180, state: 'idle', node: HOME[id], t: Math.random() * 10 };
    }

    // Luces propias: lámpara de la oficina, luces de pasillo de cada puerta y linterna
    this.lamp = new THREE.PointLight('#ffd8a0', 0, 13, 1.6);
    this.lamp.position.set(0, 3.6, 21);
    this.doorLights = {};
    for (const s of ['L', 'R']) {
      const l = new THREE.SpotLight('#fff3d6', 0, 14, 0.7, 0.45, 1.2);
      l.position.set(...FNAF.doors[s].lamp);
      const t = new THREE.Object3D();
      t.position.set(s === 'L' ? -6.5 : 6.5, 0.5, 20.5);
      l.target = t;
      game.scene.add(l, t);
      this.doorLights[s] = l;
    }
    this.flash = new THREE.SpotLight('#fff1d6', 0, 26, 0.45, 0.5, 1.4);
    this.flashTarget = new THREE.Object3D();
    this.musicLight = new THREE.PointLight('#ffffff', 0, 5, 2);
    // Iluminador infrarrojo de la cámara que se está mirando
    this.irLight = new THREE.PointLight('#dfffe0', 0, 26, 1.1);
    game.scene.add(this.irLight);
    game.scene.add(this.lamp, this.flash, this.flashTarget, this.musicLight);
    this.flash.target = this.flashTarget;
    // Ventilador de la mesa (gira de verdad)
    this.fan = new THREE.Group();
    const bladeMat = new THREE.MeshStandardMaterial({ color: '#cfd8dc', metalness: 0.5, roughness: 0.4 });
    for (let i = 0; i < 3; i++) {
      const bl = new THREE.Mesh(new THREE.BoxGeometry(0.1, 0.32, 0.02), bladeMat);
      bl.position.y = 0.16;
      const piv = new THREE.Group();
      piv.rotation.z = (i / 3) * Math.PI * 2;
      piv.add(bl);
      this.fan.add(piv);
    }
    this.fan.position.set(1.9, 1.6, 17.6);
    game.scene.add(this.fan);
    this.doors = { L: game.built.objects.get('fdoorL'), R: game.built.objects.get('fdoorR') };
    this.doorY = { L: FNAF.doors.L.p[1], R: FNAF.doors.R.p[1] };
    this.batteryMeshes = new Map();

    this.buildUi();
    this.bindNet();
    this.applyState(null);
    for (const s of ['L', 'R']) this.doorPos(s, true);
    if (input.isTouch) {
      this.hud.addTouchButton('📹', 'KeyM', { right: '30px', bottom: '200px', width: '56px', height: '56px' });
      this.hud.addTouchButton('💡', 'KeyQ', { right: '96px', bottom: '200px', width: '56px', height: '56px' });
      this.hud.addTouchButton('🔦', 'KeyF', { right: '162px', bottom: '200px', width: '56px', height: '56px' });
      this.hud.addTouchButton('📋', 'KeyL', { left: '30px', top: '150px', width: '50px', height: '50px' });
    }
  }

  // --- Estado ---------------------------------------------------------------------------
  get me() {
    return this.s.players?.find((p) => p.id === store.user.id) || {};
  }
  get night() {
    return this.s.phase === 'night' ? this.s.night : null;
  }
  get isGuard() {
    const m = this.me;
    return !!this.night && m.guard && m.alive;
  }
  get isAnim() {
    return !!this.night && !!this.me.anim;
  }
  get isWatcher() {
    // Eliminados, espectadores y quien llega a mitad de noche: miran las cámaras
    return !!this.night && !this.me.anim && !(this.me.guard && this.me.alive);
  }
  get firstPerson() {
    return !!this.night;
  }
  get blockEmotes() {
    return !!this.night;
  }
  get frozen() {
    return !!this.monitor || this.isAnim || this.isWatcher || performance.now() < this.scareUntil || this.s.phase === 'result';
  }
  get hint() {
    if (this.s.phase !== 'night') return ['[L] abrir/cerrar el panel para empezar la noche'];
    if (this.isAnim) return ['Muévete con los botones del panel. ¡Si te miran por la cámara, te congelas!'];
    if (this.night?.mode === 'last') return ['[F] linterna  [R] deslumbrar animatrónico  [Shift] correr (cansa)', '[E] puertas, pilas, compartir pila  [Q] luz de pasillo'];
    return ['[E] usar (monitor, puertas, generador)  [Q] mantén para la luz', '[F] linterna (ahuyenta si alguien entra)  [Espacio] cerrar cámaras'];
  }

  eyeHeight() {
    return 1.62;
  }

  bindNet() {
    const ev = this.netEvents;
    ev.fnaf = (s) => {
      const prev = this.s;
      this.s = s;
      this.applyState(prev);
    };
    ev['fn:move'] = ({ a, from, to, stage }) => {
      const cam = this.viewCam();
      if (cam && (CAM_BY_ID[cam].node === from || CAM_BY_ID[cam].node === to)) {
        this.staticUntil = performance.now() + 900;
        audio.play('static', null, { dur: 0.5 });
      }
      if (this.me.role === 'cams' && this.isGuard && CAM_OF_NODE[to] && to !== from) this.hud.showCenter('', `📹 Movimiento en CAM ${CAM_OF_NODE[to]}`, 1200);
      const p = NODES[to] && nodePos(to, a);
      if (to === 'doorL' || to === 'doorR' || to === 'westCorner' || to === 'eastCorner') audio.play('servo', { x: p[0], y: 1, z: p[2] });
      if (to === 'kitchen') audio.play('pots', { x: p[0], y: 1, z: p[2] }, { vol: 0.7 });
      if (a === 'fox' && stage != null && this.viewCam() === '1C') this.staticUntil = performance.now() + 500;
    };
    ev['fn:sfx'] = (e) => this.sfx(e);
    ev['fn:inside'] = ({ a }) => {
      if (this.isGuard && inOffice([this.game.player.body.x, 0, this.game.player.body.z])) {
        if (this.monitor) this.closeMonitor();
        audio.play('breath', null, { vol: 1.5 });
        this.hud.showCenter('⚠️', `¡${ANIMATRONICS[a].name} ha entrado! ¡Deslúmbralo con la linterna [F]!`, 2500);
      }
    };
    ev['fn:repel'] = ({ a, by }) => {
      audio.play('servo');
      toast(`🔦 ${by} ha ahuyentado a ${ANIMATRONICS[a].name}`, 'ok');
    };
    ev['fn:scare'] = ({ id, a, name }) => {
      if (id === store.user.id) this.jumpscare(a);
      else toast(`😱 ${ANIMATRONICS[a].name} ha atrapado a ${name}`, 'warn');
    };
    ev['fn:end'] = (res) => this.showResults(res);
    ev['fn:hour'] = ({ h }) => {
      if (h > 0 && h < 6) this.hud.showCenter('', `🕐 ${HOURS[h]}`, 1600);
    };
    ev['fn:event'] = ({ text }) => {
      toast(text, 'warn', 4500);
      audio.play('static', null, { dur: 0.6 });
    };
    ev['fn:stun'] = ({ a, by }) => {
      audio.play('pop');
      if (by !== store.user.username) toast(`🔦 ${by} ha deslumbrado a ${ANIMATRONICS[a].name}`, 'info');
    };
    ev['fn:me'] = ({ bat }) => { if (bat != null) this.bat = bat; };
  }

  sfx(e) {
    const door = e.side && { x: FNAF.doors[e.side].p[0], y: 1.6, z: FNAF.doors[e.side].p[2] };
    switch (e.k) {
      case 'door': audio.play('metaldoor', door); break;
      case 'bang': audio.play('bang', door, { big: e.big }); if (this.isGuard) this.game.cam.shake = 0.06; setTimeout(() => (this.game.cam.shake = 0), 600); break;
      case 'laugh': audio.play('laugh', e.p ? { x: e.p[0], y: e.p[1], z: e.p[2] } : null, { quiet: e.quiet }); break;
      case 'static': this.staticUntil = performance.now() + 6000; audio.play('static', null, { dur: 1.2 }); break;
      case 'pop': audio.play('pop', door); break;
      case 'run': audio.play('run', { x: -7, y: 1, z: 12 }); break;
      case 'powerdown': audio.play('powerdown'); if (this.monitor) this.closeMonitor(); break;
      case 'musicbox': this.musicUntil = performance.now() + 15000; audio.play('musicbox'); this.musicLoop = setInterval(() => { if (performance.now() < this.musicUntil && this.night?.blackout === 2) audio.play('musicbox'); else clearInterval(this.musicLoop); }, 8200); break;
      case 'dark': clearInterval(this.musicLoop); break;
      case 'chime': audio.play('chime'); break;
      case 'spot': audio.play('servo', { x: e.p[0], y: e.p[1], z: e.p[2] }); break;
      default: break;
    }
  }

  async send(name, data = {}) {
    const r = await net.request('mode', { name, data });
    if (r.error && r.error !== 'Demasiado rápido') {
      toast(r.error, 'warn');
      audio.ui('error');
    }
    return r;
  }

  /** Aplica un estado nuevo del servidor (fase, puertas, luces, jugadores…). */
  applyState(prev) {
    const s = this.s;
    const g = this.game;
    const nightNow = s.phase === 'night';
    const wasNight = prev?.phase === 'night';
    if (nightNow && !wasNight) this.onNightStart();
    if (!nightNow && wasNight) this.onNightEnd();
    if (s.phase === 'lobby' && prev?.phase !== 'lobby') {
      this.resultsEl.classList.add('hidden');
      this.lobbyOpen = true;
    }
    const lit = !nightNow;
    g.groupState.fnafLights = lit;
    setGroupState(g.built, 'fnafLights', lit);
    const n = this.night;
    if (n) {
      for (const sd of ['L', 'R']) this.doorPos(sd, false);
      g.groupState.office = !n.blackout;
      setGroupState(g.built, 'office', !n.blackout);
      if (prev?.night && n.doors && (n.doors.L !== prev.night.doors?.L || n.doors.R !== prev.night.doors?.R)) { /* el sonido llega por fn:sfx */ }
    }
    this.renderLobby();
    this.renderPanels();
    this.game.updateHint();
  }

  onNightStart() {
    const n = this.night;
    this.lobbyEl.classList.add('hidden');
    this.resultsEl.classList.add('hidden');
    this.bat = 100;
    this.stamina = 100;
    audio.stopMusic();
    this.startNightAudio();
    const label = n.num === 7 ? 'Noche personalizada' : `Noche ${n.num}`;
    put(this.cardEl, h('div.fn-card-time', '12:00 AM'), h('div.fn-card-night', label), h('div.fn-card-mode', FNAF_MODES[n.mode].name));
    this.cardEl.classList.remove('hidden');
    this.cardEl.classList.remove('out');
    clearTimeout(this.cardT);
    this.cardT = setTimeout(() => { this.cardEl.classList.add('out'); setTimeout(() => this.cardEl.classList.add('hidden'), 900); }, 3600);
    audio.play('static', null, { dur: 0.5 });
    this.playCall(n.num);
    this.lastHour = 0;
    if (this.isAnim || this.isWatcher) {
      if (input.locked) { this.game.ignoreUnlock = true; input.unlockPointer(); }
    }
    if (this.isAnim) this.hud.showCenter('🎭', `Eres ${ANIMATRONICS[this.me.anim].name}, ${ANIMATRONICS[this.me.anim].species}. ¡A por los guardias!`, 4000);
  }

  onNightEnd() {
    clearTimeout(this.callT);
    this.subEl.classList.add('hidden');
    this.nextHallu = 0;
    if (this.monitor) this.closeMonitor(true);
    this.flashOn = false;
    clearInterval(this.musicLoop);
    audio.stopLoops();
    this.setCanvasFilter(null);
    for (const b of this.batteryMeshes.values()) this.game.scene.remove(b);
    this.batteryMeshes.clear();
    // Los animatrónicos vuelven al escenario
    for (const a of Object.values(this.anims)) {
      const [x, y, z, ry] = nodePos(HOME[a.id], a.id);
      a.pos.set(x, y, z); a.target.set(x, y, z); a.ry = (ry * Math.PI) / 180; a.state = 'idle'; a.node = HOME[a.id];
    }
    this.snap = null;
    for (const s of ['L', 'R']) this.doorPos(s, true);
  }

  startAudio() {
    audio.stopMusic();
    audio.setAmbient(null);
    if (this.night) this.startNightAudio();
    else audio.startMusic();
  }

  startNightAudio() {
    audio.stopLoops();
    audio.loop('fnaf-fan', { noise: true, filter: 260, vol: 0.035 });
    audio.loop('fnaf-hum', { freq: 60, type: 'sawtooth', filter: 140, vol: 0.025 });
    audio.loop('fnaf-drone', { freq: 41, type: 'triangle', filter: 200, vol: 0.03 });
  }

  // --- Interfaz ----------------------------------------------------------------------------
  buildUi() {
    const hud = this.hud;
    // Panel superior: hora, noche, energía
    this.topEl = h('div.fn-top.hidden');
    hud.el.appendChild(this.topEl);
    // Monitor (capa sobre la imagen 3D de la cámara)
    this.staticCanvas = h('canvas', { width: 160, height: 90 });
    this.monitorEl = h('div.fn-monitor.hidden',
      this.staticCanvas,
      h('div.fn-scan'),
    );
    this.camLabel = h('div.fn-camlabel');
    this.camMsg = h('div.fn-cammsg');
    this.mapEl = h('div.fn-map');
    this.monitorClose = h('button.fn-close', { on: { click: () => this.closeMonitor() } }, '▼ Bajar monitor [Espacio]');
    this.monitorEl.append(this.camLabel, this.camMsg, this.mapEl, this.monitorClose);
    hud.el.appendChild(this.monitorEl);
    this.staticCtx = this.staticCanvas.getContext('2d');
    // Panel del animatrónico jugador
    this.animEl = h('div.fn-anim.panel.hidden');
    hud.el.appendChild(this.animEl);
    // Lobby y resultados
    this.lobbyEl = h('div.fn-lobby.panel');
    hud.el.appendChild(this.lobbyEl);
    this.openLobbyBtn = button('🌙 Empezar la noche (panel) [L]', () => this.toggleLobby(true), 'primary fn-open-lobby');
    this.openLobbyBtn.classList.add('hidden');
    hud.el.appendChild(this.openLobbyBtn);
    this.resultsEl = h('div.fn-results.panel.hidden');
    hud.el.appendChild(this.resultsEl);
    // Susto
    this.scareEl = h('div.fn-scare.hidden');
    hud.el.appendChild(this.scareEl);
    this.holdEl = h('div.fn-hold.hidden', h('div'));
    hud.el.appendChild(this.holdEl);
    this.tabletEl = h('div.fn-tablet.hidden');
    this.cardEl = h('div.fn-card.hidden');
    this.subEl = h('div.fn-sub.hidden');
    this.sixEl = h('div.fn-six.hidden');
    this.overCanvas = h('canvas', { width: 200, height: 112 });
    this.overEl = h('div.fn-over.hidden', this.overCanvas, h('div.fn-over-text'));
    hud.el.append(this.tabletEl, this.cardEl, this.subEl, this.sixEl, this.overEl);
  }

  renderLobby() {
    const s = this.s;
    const el = this.lobbyEl;
    this.openLobbyBtn.classList.toggle('hidden', s.phase !== 'lobby' || this.lobbyOpen);
    if (s.phase !== 'lobby' || !this.lobbyOpen) {
      el.classList.add('hidden');
      return;
    }
    el.classList.remove('hidden');
    const isHost = s.host === store.user.id;
    const cfg = s.cfg;
    const me = this.me;
    const sec = (t) => h('div.section-title', t);
    const stats = store.user?.stats || {};
    put(el, 
      h('div.row', h('h3.grow', '🐻 Turno de Noche'), h('button.btn.small', { on: { click: () => this.toggleLobby(false) } }, 'Ocultar [L]')),
      isHost ? h('p.small', '👑 Eres el anfitrión: elige la modalidad y la noche y pulsa ▶ Empezar (abajo).')
        : h('div.row', { style: { gap: '8px' } }, h('p.muted.small.grow', `Anfitrión: ${s.players.find((p) => p.id === s.host)?.name || '—'}. Él elige y empieza la noche.`), button('👑 Ser anfitrión', () => this.send('host'), 'small')),
      isHost ? button(`▶ Empezar ${cfg.night === 7 ? 'noche personalizada' : `noche ${cfg.night}`} · ${FNAF_MODES[cfg.mode].name}`, () => this.send('start'), 'primary') : null,
      sec('Modalidad'),
      h('div.fn-modes', Object.entries(FNAF_MODES).map(([id, m]) => h(`button.fn-mode${cfg.mode === id ? '.on' : ''}`, {
        disabled: !isHost, title: m.desc, on: { click: () => this.send('cfg', { mode: id }) },
      }, h('b', `${m.icon} ${m.name}`), h('small', m.desc)))),
      sec('Noche'),
      h('div.pills', { style: { flexWrap: 'wrap' } }, [...Array(MAX_NIGHT).keys()].map((i) => i + 1).concat(7).map((nt) => h(`button.pill${cfg.night === nt ? '.on' : ''}`, {
        disabled: !isHost, on: { click: () => this.send('cfg', { night: nt }) },
      }, nt === 7 ? '⚙️ Personalizada' : `Noche ${nt}`))),
      cfg.night === 7 ? this.customSliders(isHost) : null,
      cfg.mode === 'versus' ? [sec('¿Quieres ser animatrónico?'), h('div.pills', { style: { flexWrap: 'wrap' } },
        h(`button.pill${!me.wantAnim ? '.on' : ''}`, { on: { click: () => this.send('wantAnim', { anim: null }) } }, '🛡️ Guardia'),
        ...ANIM_IDS.map((a) => {
          const taken = s.players.find((p) => p.wantAnim === a && p.id !== store.user.id);
          return h(`button.pill${me.wantAnim === a ? '.on' : ''}`, { disabled: !!taken, title: `${ANIMATRONICS[a].ability}: ${ANIMATRONICS[a].abilityDesc}`, on: { click: () => this.send('wantAnim', { anim: a }) } },
            `${ANIMATRONICS[a].name}${taken ? ` (${taken.name})` : ''}`);
        })),
      h('p.muted.small', 'Bruno: risa engañosa · Rita: llena de estática las cámaras · Pía: funde una bombilla · Fito: carga y corre por el pasillo. Si un guardia te mira por la cámara, te congelas.')] : null,
      cfg.mode !== 'last' ? [sec('Tu especialidad'), h('div.pills', { style: { flexWrap: 'wrap' } }, Object.entries(ROLES).map(([id, r]) => h(`button.pill${me.role === id ? '.on' : ''}`, {
        title: r.desc, on: { click: () => this.send('role', { role: id }) },
      }, `${r.icon} ${r.name}`))), h('p.muted.small', ROLES[me.role || 'free']?.desc || '')] : null,
      sec(`Jugadores (${s.players.length})`),
      h('div.fn-players', s.players.map((p) => h('div.fn-player', h('span', `${p.id === s.host ? '👑 ' : ''}${p.name}`), h('small.muted', cfg.mode === 'versus' && p.wantAnim ? `🎭 ${ANIMATRONICS[p.wantAnim].name}` : cfg.mode === 'last' ? '🔦' : `${ROLES[p.role]?.icon || ''} ${ROLES[p.role]?.name || ''}`)))),
      isHost ? button(`▶ Empezar ${cfg.night === 7 ? 'noche personalizada' : `noche ${cfg.night}`}`, () => this.send('start'), 'primary') : h('p.muted.small', 'Esperando a que el anfitrión empiece… (o pulsa 👑 Ser anfitrión arriba)'),
      sec('Récords'),
      h('div.small', `Tu mejor noche: ${stats.fnafBest || 0} · Noches superadas: ${stats.fnafWins || 0} · Partidas: ${stats.fnafNights || 0}`),
      h('div.small', `Victorias como animatrónico: ${stats.fnafAnimWins || 0} · Último superviviente: ${stats.fnafLastWins || 0}`),
      this.recordList(),
      h('p.muted.small', 'Cosméticos que se ganan: Gorra de guardia (noche 1), Uniforme (noche 3), Orejas de Bruno (noche 5) y Pajarita (ganar como animatrónico).'),
    );
  }

  customSliders(isHost) {
    const c = { ...(this.s.cfg.custom || { bear: 5, bunny: 8, chicken: 7, fox: 6 }) };
    return h('div.fn-custom', ANIM_IDS.map((a) => {
      const out = h('b', String(c[a]));
      const r = h('input', { type: 'range', min: 0, max: 20, value: c[a], disabled: !isHost });
      r.addEventListener('input', () => { out.textContent = r.value; });
      r.addEventListener('change', () => { c[a] = Number(r.value); this.send('cfg', { custom: c }); });
      return h('label.ec-slider', h('span', `${ANIMATRONICS[a].name} (IA) `, out), r);
    }));
  }

  recordList() {
    const list = this.s.records?.[this.s.cfg.mode] || [];
    if (!list.length) return h('p.muted.small', 'Todavía no hay récords de grupo en esta modalidad. ¡Sed los primeros!');
    return h('ol.fn-records', list.map((r) => h('li', `Noche ${r.night === 7 ? 'personalizada' : r.night} · ${r.team} (${r.players} jug.)`)));
  }

  toggleLobby(show = !this.lobbyOpen) {
    this.lobbyOpen = show;
    if (show && input.locked) { this.game.ignoreUnlock = true; input.unlockPointer(); }
    this.renderLobby();
  }

  /** Mensajes grabados del jefe de seguridad (noches 1 y 2), como subtítulos. */
  playCall(num) {
    const CALLS = {
      1: ['📞 ¿Hola? ¿Hola? Ah, bien… Soy el jefe de seguridad. Te dejo unas notas para tu primera noche.',
        'Los animatrónicos se mueven un poco por la noche. Es… normal. Les gusta pasear por el local.',
        'Si uno se queda mirando hacia la oficina, enciende la luz de esa puerta y, si está ahí, ciérrala.',
        'Ojo con la energía: cada puerta, luz y cámara gasta. Si se acaba… bueno, mejor que no se acabe.',
        'Y vigila la Cala Pirata. A Fito no le gusta que no le miren. Suerte, y ¡a disfrutar!'],
      2: ['📞 Hola otra vez. Esta noche estarán más activos, sobre todo Rita y Pía.',
        'Bruno solo se mueve cuando nadie le mira… y le encanta la oscuridad. Si oyes una risa, búscalo.',
        'Si alguno entra en la oficina, no te quedes quieto: apúntale con la linterna. Odian la luz.',
        'Ah, y si oyes pasos corriendo por el pasillo izquierdo… cierra la puerta. Rápido.'],
    };
    const lines = CALLS[num];
    clearTimeout(this.callT);
    if (!lines) return;
    let i = 0;
    const next = () => {
      if (!this.night || i >= lines.length) { this.subEl.classList.add('hidden'); return; }
      this.subEl.textContent = lines[i++];
      this.subEl.classList.remove('hidden');
      audio.play('static', null, { dur: 0.15 });
      this.callT = setTimeout(next, 6500);
    };
    this.callT = setTimeout(next, 4500);
  }

  showResults(res) {
    if (/6:00/.test(res.title) || (res.reason === 'six' && res.survivors.length)) {
      put(this.sixEl, h('div.fn-six-roll', h('div', '5'), h('div', '6')), h('span', 'AM'));
      this.sixEl.classList.remove('hidden');
      audio.play('chime');
      setTimeout(() => this.sixEl.classList.add('done'), 600);
      setTimeout(() => { this.sixEl.classList.add('hidden'); this.sixEl.classList.remove('done'); }, 4200);
    }
    const el = this.resultsEl;
    el.classList.remove('hidden');
    let left = 9;
    const timer = h('p.muted.small', `Volviendo al lobby en ${left} s…`);
    put(el, 
      h('h2', res.title),
      res.survivors.length ? h('p', `🌅 Sobrevivieron: ${res.survivors.join(', ')}`) : null,
      res.deaths.length ? h('div', res.deaths.map((d) => h('div.small', `😱 ${d.name} — atrapado por ${ANIMATRONICS[d.by]?.name || '?'} a las ${HOURS[d.at] || '?'}`))) : null,
      res.mode === 'team' ? h('p.small', `📋 Tareas completadas: ${res.tasks}`) : null,
      res.power != null && res.mode !== 'last' ? h('p.small', `🔋 Energía restante: ${Math.round(res.power)}%`) : null,
      timer,
    );
    clearInterval(this.resTimer);
    this.resTimer = setInterval(() => {
      left--;
      timer.textContent = `Volviendo al lobby en ${Math.max(0, left)} s…`;
      if (left <= 0) clearInterval(this.resTimer);
    }, 1000);
    if (/6:00|Ganan los guardias|superviviente/.test(res.title) && res.survivors.includes(store.user.username)) audio.play('win');
  }

  /** Paneles de la noche (arriba y del animatrónico). */
  renderPanels() {
    const n = this.night;
    this.topEl.classList.toggle('hidden', !n);
    this.animEl.classList.toggle('hidden', !this.isAnim);
    if (!n) {
      this.hud.setObjectives([]);
      return;
    }
    if (n.mode === 'team' && n.tasks.length) {
      this.hud.setObjectives(n.tasks.map((t) => ({ text: t.name })), `📋 Tareas (${n.done} hechas)`);
    } else if (n.mode === 'last') {
      this.hud.setObjectives([{ text: 'Sobrevive hasta las 6:00 o sé el último en pie' }, { text: `Supervivientes: ${this.s.players.filter((p) => p.guard && p.alive).length}` }]);
    } else this.hud.setObjectives([]);
    if (this.isAnim) this.renderAnimPanel();
    if (this.isWatcher && !this.monitor) this.openMonitor(true);
  }

  updateTop() {
    const n = this.night;
    if (!n) return;
    const now = this.game.now();
    const h0 = Math.max(0, Math.min(6, Math.floor((now - n.start) / FNAF.hourMs)));
    const sn = this.snap;
    const power = sn ? sn.pw : 100;
    const usage = sn ? sn.u : 1;
    const me = this.me;
    const role = me.anim ? `🎭 ${ANIMATRONICS[me.anim].name}` : n.mode === 'last' ? `🔦 Pila ${Math.round(this.bat)}%` : `${ROLES[me.role]?.icon || ''} ${ROLES[me.role]?.name || ''}`;
    const bars = Math.min(5, Math.ceil(usage));
    const key = `${h0}|${Math.floor(power)}|${bars}|${role}|${n.eco}|${me.alive}|${Math.round(this.stamina / 10)}`;
    if (key === this.topKey) return;
    this.topKey = key;
    put(this.topEl, ...[
      h('div.fn-clock', HOURS[h0], h('small', n.num === 7 ? 'Noche personalizada' : `Noche ${n.num}`)),
      h('div.fn-power', h('div', `🔋 Energía: ${Math.floor(power)}%`, n.eco ? ' (ahorro)' : ''),
        h('div.fn-usage', 'Uso: ', ...[0, 1, 2, 3, 4].map((i) => h(`i${i < bars ? '.on' : ''}${i >= 3 ? '.hot' : ''}`)))),
      h('div.fn-role', role, !me.alive && !me.anim ? ' · 👻 espectador' : ''),
      n.mode === 'last' && me.alive ? h('div.fn-stam', h('div', { style: { width: `${this.stamina}%` } })) : null,
    ].filter(Boolean));
  }

  // --- Monitor de cámaras ------------------------------------------------------------------
  viewCam() {
    if (this.monitor) return this.monitor.cam;
    return null;
  }

  async openMonitor(free = false) {
    if (this.monitor) return;
    if (!free && (this.snap?.pw ?? 100) <= 0) { toast('No hay energía', 'warn'); return; }
    const cam = this.lastCam;
    this.monitor = { cam, free };
    this.monitorEl.classList.remove('hidden');
    this.renderMap();
    audio.play('camswitch');
    this.tabletEl.className = 'fn-tablet up';
    this.staticUntil = performance.now() + 350;
    if (input.locked) { this.game.ignoreUnlock = true; input.unlockPointer(); }
    const r = await this.send('cam', { id: cam });
    if (r.error && this.monitor) this.closeMonitor(true);
  }

  closeMonitor(silent = false) {
    if (!this.monitor) return;
    this.monitor = null;
    this.monitorEl.classList.add('hidden');
    this.setCanvasFilter(null);
    if (!silent) { this.tabletEl.className = 'fn-tablet down'; clearTimeout(this.tabT); this.tabT = setTimeout(() => this.tabletEl.classList.add('hidden'), 300); }
    if (!silent) net.request('mode', { name: 'cam', data: { id: null } });
    audio.play('camswitch');
    if (!input.isTouch && this.isGuard && !this.game.paused) this.game.requestLock();
  }

  setCam(id) {
    if (!this.monitor || !CAM_BY_ID[id]) return;
    this.monitor.cam = id;
    this.lastCam = id;
    this.staticUntil = performance.now() + 250;
    audio.play('camswitch');
    net.request('mode', { name: 'cam', data: { id } });
    this.renderMap();
  }

  renderMap() {
    const cur = this.monitor?.cam;
    const viewed = this.snap?.v || [];
    put(this.mapEl, 
      h('div.fn-map-title', 'PIZZERÍA KESTY'),
      h('div.fn-office', 'TÚ'),
      ...CAMS.map((c) => h(`button.fn-cambtn${c.id === cur ? '.on' : ''}${viewed.includes(c.id) && c.id !== cur ? '.seen' : ''}`, {
        style: { left: `${c.map[0]}%`, top: `${c.map[1]}%` }, title: c.name, on: { click: () => this.setCam(c.id) },
      }, `CAM ${c.id}`)),
    );
  }

  /** Textura de estática animada sobre la imagen de la cámara. */
  drawStatic(amount) {
    const ctx = this.staticCtx;
    const img = ctx.createImageData(160, 90);
    const d = img.data;
    for (let i = 0; i < d.length; i += 4) {
      const v = Math.random() * 255;
      d[i] = d[i + 1] = d[i + 2] = v;
      d[i + 3] = 255;
    }
    ctx.putImageData(img, 0, 0);
    this.staticCanvas.style.opacity = String(amount);
  }

  setCanvasFilter(f) {
    const c = engine.renderer?.domElement;
    if (c && c.style.filter !== (f || '')) c.style.filter = f || '';
  }

  // --- Panel del animatrónico jugador -------------------------------------------------------
  renderAnimPanel() {
    const n = this.night;
    const id = this.me.anim;
    if (!n || !id) return;
    const a = this.anims[id];
    const node = a.node;
    const def = ANIMATRONICS[id];
    const watched = this.isWatched(node);
    const side = node === 'doorL' ? 'L' : node === 'doorR' ? 'R' : null;
    const doorClosed = side && !!this.snap?.d?.[side === 'L' ? 0 : 1];
    const key = `${node}|${watched}|${doorClosed}|${a.state}|${Math.floor((this.snap?.ch || 0) / 10)}|${this.bearPick}`;
    if (key === this.animKey) return;
    this.animKey = key;
    const moves = id === 'fox' ? [] : (ROUTES[id][node] || []).filter((x) => x !== 'office');
    put(this.animEl, 
      h('div.row', h('b.grow', `🎭 ${def.name} — ${NODES[node]?.name || node}`), watched ? h('span.fn-watched', '👁 ¡TE ESTÁN MIRANDO!') : h('span.muted.small', 'Nadie te mira')),
      a.state === 'inside' ? h('p', '¡Estás dentro de la oficina! Si no te deslumbran a tiempo, atrapas a los guardias.') : null,
      id === 'fox' ? h('div', h('div.small', `Carga de la Carrera: ${Math.round(this.snap?.ch || 0)}% (sube cuando nadie mira la Cala Pirata)`),
        h('div.fn-stam', h('div', { style: { width: `${this.snap?.ch || 0}%`, background: '#ef5350' } })),
        button('🏃 ¡Carrera!', () => this.send('ability'), 'primary small')) : null,
      moves.length ? h('div.section-title', 'Moverse a') : null,
      h('div.pills', { style: { flexWrap: 'wrap' } }, moves.map((m) => h('button.pill', { disabled: watched, on: { click: () => this.send('move', { node: m }) } }, NODES[m].name))),
      side ? h('div.row', { style: { gap: '6px', marginTop: '8px' } },
        doorClosed ? button('💥 Aporrear la puerta', () => this.send('bang'), 'small') : button('😈 ¡Entrar en la oficina!', () => this.send('enter'), 'primary small'),
        h('span.muted.small', doorClosed ? 'La puerta está cerrada (gasta su energía)' : '¡La puerta está abierta!')) : null,
      id !== 'fox' ? h('div', { style: { marginTop: '8px' } },
        id === 'bear' ? h('div.small', 'Risa engañosa: elige la sala donde sonará') : null,
        id === 'bear' ? h('div.pills', { style: { flexWrap: 'wrap' } }, Object.keys(NODES).filter((k) => k !== 'office').map((k) => h('button.pill', { on: { click: () => this.send('ability', { node: k }) } }, NODES[k].name)))
          : button(`✨ ${def.ability}`, () => this.send('ability'), 'small'),
        h('div.muted.small', def.abilityDesc)) : null,
    );
  }

  isWatched(node) {
    const cam = CAM_OF_NODE[node];
    return !!cam && (this.snap?.v || []).includes(cam);
  }

  // --- Interacciones ---------------------------------------------------------------------
  interactions(b) {
    if (!this.isGuard || this.monitor) return [];
    const n = this.night;
    const out = [];
    const d = (p) => Math.hypot(b.x - p[0], b.z - p[2]);
    const dsn = this.snap?.d || [0, 0, 0, 0];
    {
      if (d(FNAF.monitor) < 2.6) out.push({ d: d(FNAF.monitor), label: '📹 Ver las cámaras', act: () => this.openMonitor() });
      for (const [s, i] of [['L', 0], ['R', 1]]) {
        const pd = d(FNAF.doors[s].panel);
        if (pd < 2.4) out.push({ d: pd, label: `${dsn[i] ? 'Abrir' : 'Cerrar'} puerta ${s === 'L' ? 'izquierda' : 'derecha'} · mantén [Q] para la luz`, act: () => this.send('door', { side: s }) });
      }
      const gd = d(FNAF.generator);
      if (gd < 2.4 && n.mode !== 'last') {
        const powerRole = this.s.players.some((p) => p.guard && p.alive && p.role === 'power');
        if (!powerRole || this.me.role === 'power') out.push({ d: gd, label: `Generador: ${n.eco ? 'quitar' : 'poner'} modo ahorro${n.boostUsed ? '' : ' · [R] reinicio de emergencia'}`, act: () => this.send('gen', { action: 'eco' }) });
      }
    }
    for (const t of n.tasks || []) {
      const td = d(t.pos);
      if (td < 2.3) out.push({ d: td, label: `Mantén [E]: ${t.name}`, act: () => this.startHold(t) });
    }
    if (n.mode === 'last') {
      for (const bt of n.batteries || []) {
        const bd = d(bt.p);
        if (bd < 2) out.push({ d: bd, label: '🔋 Coger pila', act: () => this.send('battery', { id: bt.id }).then((r) => r.bat != null && (this.bat = r.bat)) });
      }
      for (const r of this.game.remotes.values()) {
        if (r.npc || r.bot) continue;
        const pl = this.s.players.find((p) => p.id === r.id);
        if (!pl?.alive) continue;
        const rd = Math.hypot(b.x - r.pos.x, b.z - r.pos.z);
        if (rd < 2.3 && this.bat >= 25) out.push({ d: rd + 0.5, label: `🔋 Dar pila a ${r.name}`, act: () => this.send('give').then((x) => x.bat != null && (this.bat = x.bat)) });
      }
    }
    return out;
  }

  async startHold(t) {
    const r = await this.send('task', { id: t.id, phase: 'start' });
    if (!r.ok) return;
    this.hold = { t, at: performance.now() };
    this.holdEl.classList.remove('hidden');
  }

  updateHold() {
    const hd = this.hold;
    if (!hd) return;
    const b = this.game.player.body;
    const k = (performance.now() - hd.at) / 3000;
    this.holdEl.firstChild.style.width = `${Math.min(100, k * 100)}%`;
    if (!input.down('KeyE') || !near(b, hd.t.pos, 2.6) || !this.isGuard) {
      this.hold = null;
      this.holdEl.classList.add('hidden');
      return;
    }
    if (k >= 1) {
      this.hold = null;
      this.holdEl.classList.add('hidden');
      this.send('task', { id: hd.t.id, phase: 'done' }).then((x) => x.ok && audio.play('gem'));
    }
  }

  filterCtl(ctl, dt) {
    if (this.night?.mode !== 'last') return;
    const moving = Math.abs(ctl.move.x) + Math.abs(ctl.move.y) > 0.1;
    if (ctl.run && moving && !this.exhausted) {
      this.stamina -= 22 * dt;
      if (this.stamina <= 0) { this.stamina = 0; this.exhausted = true; }
    } else {
      this.stamina = Math.min(100, this.stamina + 14 * dt);
      if (this.exhausted && this.stamina > 35) this.exhausted = false;
    }
    if (this.exhausted) ctl.run = false;
  }

  // --- Red ---------------------------------------------------------------------------
  onSnap(m) {
    if (!m.fn) return;
    this.snap = m.fn;
    for (const [id, x, y, z, ry, st, node] of m.fn.a) {
      const a = this.anims[id];
      if (!a) continue;
      a.target.set(x, y, z);
      // Saltos entre salas (fuera de cámara): se colocan sin cruzar paredes
      if (a.pos.distanceTo(a.target) > 3.5 && !['run', 'chase', 'walk'].includes(st)) a.pos.copy(a.target);
      a.ry = ry;
      a.state = st;
      a.node = node;
    }
    if (this.monitor) {
      const viewedKey = (m.fn.v || []).join();
      if (viewedKey !== this.viewedKey) { this.viewedKey = viewedKey; this.renderMap(); }
    }
    if (this.isAnim) this.renderAnimPanel();
  }

  // --- Susto ------------------------------------------------------------------------
  jumpscare(animId) {
    if (this.monitor) this.closeMonitor(true);
    const now = performance.now();
    this.scareStart = now;
    this.scareUntil = now + 1500;
    this.scareAnim = animId;
    audio.play('servo');
    setTimeout(() => audio.play('fnafscream'), 120);
    this.scareEl.classList.remove('hidden', 'dark');
    this.scareEl.textContent = '';
    this.scareEl.classList.add('flash');
    // Después del grito: televisión con estática y GAME OVER
    setTimeout(() => {
      this.scareEl.classList.add('hidden');
      this.scareEl.classList.remove('flash');
      this.overEl.lastChild.innerHTML = '';
      this.overEl.lastChild.append(h('b', 'GAME OVER'), h('small', `${ANIMATRONICS[animId].name} te ha atrapado`));
      this.overEl.classList.remove('hidden');
      this.overUntil = performance.now() + 2600;
      audio.play('static', null, { dur: 2.4 });
    }, 1450);
    setTimeout(() => this.overEl.classList.add('hidden'), 4100);
  }

  /** Alucinación: un instante, la cara de un animatrónico delante de ti. */
  hallucinate() {
    const ids = ANIM_IDS;
    this.halluAnim = ids[Math.floor(Math.random() * ids.length)];
    this.halluUntil = performance.now() + 140;
    audio.play('whisper');
    audio.play('static', null, { dur: 0.2 });
  }

  // --- Bucle --------------------------------------------------------------------------
  update(dt) {
    const g = this.game;
    const now = performance.now();
    const n = this.night;
    if (input.pressed('KeyL') && this.s.phase === 'lobby') this.toggleLobby();
    this.updateTop();
    this.updateHold();
    if (!n) return;
    const b = g.player.body;
    // Monitor
    if (this.monitor) {
      if (!this.monitor.free && (input.pressed('Space') || input.pressed('KeyM'))) this.closeMonitor();
      else if (input.pressed('ArrowRight') || input.pressed('ArrowLeft')) {
        const i = CAMS.findIndex((c) => c.id === this.monitor.cam);
        this.setCam(CAMS[(i + (input.pressed('ArrowRight') ? 1 : CAMS.length - 1)) % CAMS.length].id);
      }
    } else if (this.isGuard && input.pressed('KeyM') && near(b, FNAF.monitor, 2.6)) this.openMonitor();
    if (!this.isGuard) return;
    // Luz de pasillo: mantener Q junto a un panel
    for (const s of ['L', 'R']) {
      const want = input.down('KeyQ') && near(b, FNAF.doors[s].panel, 2.4) && !this.monitor;
      if (want !== this.lightKey[s]) {
        this.lightKey[s] = want;
        this.send('light', { side: s, on: want }).then((r) => { if (r.error) this.lightKey[s] = false; });
        if (want) audio.play('switch');
      }
    }
    // Generador: reinicio de emergencia
    if (input.pressed('KeyR') && near(b, FNAF.generator, 2.4) && n.mode !== 'last') this.send('gen', { action: 'boost' });
    // Linterna
    if (input.pressed('KeyF')) { this.flashOn = !this.flashOn; audio.play('switch'); }
    const cam = g.camera;
    const fwd = new THREE.Vector3();
    cam.getWorldDirection(fwd);
    // Forcejeo: si la linterna apunta a un animatrónico dentro de la oficina, se envía al servidor
    if (this.flashOn && !this.monitor) {
      this.flashAcc += dt;
      if (this.flashAcc > 0.13) {
        this.flashAcc = 0;
        for (const a of Object.values(this.anims)) {
          if (a.state !== 'inside') continue;
          const to = a.pos.clone().add(new THREE.Vector3(0, 1.6, 0)).sub(cam.position);
          if (to.length() < 10 && to.normalize().dot(fwd) > 0.82) net.send('mode', { name: 'flash', data: { a: a.id } });
        }
      }
    }
    // Último superviviente: deslumbrar (R)
    if (n.mode === 'last' && input.pressed('KeyR')) {
      let best = null, bd = 0.85;
      for (const a of Object.values(this.anims)) {
        const to = a.pos.clone().add(new THREE.Vector3(0, 1.6, 0)).sub(cam.position);
        if (to.length() > 11) continue;
        const dot = to.normalize().dot(fwd);
        if (dot > bd) { bd = dot; best = a; }
      }
      if (!best) toast('Apunta a un animatrónico', 'warn');
      else this.send('stun', { a: best.id }).then((r) => { if (r.bat != null) this.bat = r.bat; });
      this.flashOn = true;
      this.flashBurst = now + 300;
    }
    // Respiración si hay alguien al otro lado de la puerta y estás cerca
    this.breathAcc += dt;
    if (this.breathAcc > 3.2) {
      this.breathAcc = 0;
      for (const a of Object.values(this.anims)) {
        if ((a.node === 'doorL' || a.node === 'doorR') && a.state === 'door') {
          const s = a.node === 'doorL' ? 'L' : 'R';
          if (near(b, FNAF.doors[s].panel, 3.5)) audio.play('breath', { x: a.pos.x, y: 1.6, z: a.pos.z }, { vol: 0.8 });
        }
      }
    }
  }

  doorPos(s, instant) {
    const e = this.doors[s];
    if (!e) return;
    const closed = !!this.snap?.d?.[s === 'L' ? 0 : 1] || (!this.snap && this.night?.doors?.[s]);
    e.colliders.forEach((c) => (c.enabled = closed));
    e.targetY = closed ? this.doorY[s] : this.doorY[s] + 3.1;
    if (instant && e.mesh) e.mesh.position.y = e.targetY;
  }

  /** Animación de los animatrónicos, puertas, luces y vista de cámaras (cada frame). */
  afterSky(dt) {
    const g = this.game;
    const now = performance.now();
    const n = this.night;
    const sn = this.snap;
    // Puertas
    for (const s of ['L', 'R']) {
      this.doorPos(s, false);
      const e = this.doors[s];
      if (e?.mesh) e.mesh.position.y += (e.targetY - e.mesh.position.y) * Math.min(1, dt * 12);
    }
    // Animatrónicos
    for (const a of Object.values(this.anims)) this.animate(a, dt, now);
    // Pilas del último superviviente
    if (n?.mode === 'last') this.syncBatteries(now);

    // Ventilador y estática del GAME OVER
    this.fan.rotation.z -= dt * (n && !(n.blackout || (sn && sn.pw <= 0)) ? 28 : 0);
    if (!this.overEl.classList.contains('hidden')) {
      const ctx = this.overCanvas.getContext('2d');
      const img = ctx.createImageData(200, 112);
      for (let i = 0; i < img.data.length; i += 4) { const v = Math.random() * 255; img.data[i] = img.data[i + 1] = img.data[i + 2] = v; img.data[i + 3] = 255; }
      ctx.putImageData(img, 0, 0);
    }
    // Alucinaciones a partir de las 3 AM (nunca con el monitor subido)
    if (n && this.isGuard && !this.monitor && now > (this.nextHallu || 0)) {
      const hr = Math.floor((this.game.now() - n.start) / FNAF.hourMs);
      if (!this.nextHallu) this.nextHallu = now + 60000;
      else if (hr >= 3 && Math.random() < 0.5) { this.hallucinate(); this.nextHallu = now + 50000 + Math.random() * 70000; }
      else this.nextHallu = now + 30000;
    }

    // Iluminación
    const lit = !n;
    const power = sn ? sn.pw : 100;
    const blackout = n && (n.blackout || power <= 0);
    g.sky.hemi.intensity = lit ? 0.85 : 0.05;
    g.sky.sun.intensity = lit ? 0.25 : 0.0;
    g.scene.fog.color.set(lit ? '#16121c' : '#020203');
    g.scene.fog.near = lit ? 20 : 3;
    g.scene.fog.far = lit ? 80 : 30;
    g.sky.uniforms.top.value.set('#020205');
    g.sky.uniforms.bottom.value.set('#050508');
    let lamp = blackout ? 0 : 7;
    if (n && now / 1000 % 9 < 0.12) lamp *= 0.3; // parpadeo
    if (n?.blackout === 3 || n?.blackout === 4) lamp = 0;
    this.lamp.intensity = n ? lamp : 0;
    for (const [s, i] of [['L', 2], ['R', 3]]) this.doorLights[s].intensity = n && sn?.d?.[i] && !blackout ? 160 : 0;
    // Bruno en el apagón: su cara parpadea en la puerta
    const bear = this.anims.bear;
    this.musicLight.position.set(bear.pos.x + 1, 2.2, bear.pos.z);
    this.musicLight.intensity = n?.blackout === 2 ? (Math.sin(now / 90) > 0 ? 8 : 0) : 0;
    // Linterna
    const cam = g.camera;
    const fwd = new THREE.Vector3();
    cam.getWorldDirection(fwd);
    const flashPower = n && this.isGuard && !this.monitor && this.flashOn && (n.mode === 'last' ? this.bat > 0 : power > 0);
    this.flash.intensity = flashPower ? (now < (this.flashBurst || 0) ? 900 : 380) : 0;
    this.flash.position.copy(cam.position).addScaledVector(fwd, 0.3);
    this.flashTarget.position.copy(cam.position).addScaledVector(fwd, 8);

    // Susto: el animatrónico aparece pegado a la cámara con la boca abierta
    const hallu = now < (this.halluUntil || 0) ? this.halluAnim : null;
    if ((now < this.scareUntil && this.scareAnim) || hallu) {
      const a = this.anims[hallu || this.scareAnim];
      const m = a.model;
      // Se abalanza desde 4 m hasta tu cara en un cuarto de segundo
      const k = hallu ? 1 : Math.min(1, (now - this.scareStart) / 250);
      const dist = 4.2 - k * k * 3.0;
      const flat = new THREE.Vector3(fwd.x, 0, fwd.z).normalize();
      const p = cam.position.clone().addScaledVector(flat, dist);
      const tall = a.id === 'fox' ? 0.95 : 1;
      m.root.position.set(p.x, cam.position.y - 2.15 * tall + 0.05, p.z);
      m.root.rotation.set(0, Math.atan2(-flat.x, -flat.z), 0);
      m.body.rotation.x = -0.1;
      m.jaw.rotation.x = 0.7 + Math.sin(now / 35) * 0.25;
      m.eyeMat.emissiveIntensity = 4;
      m.head.rotation.set(Math.sin(now / 45) * 0.12, Math.sin(now / 53) * 0.15, Math.sin(now / 38) * 0.3);
      // Brazos abiertos hacia ti, sin taparle la cara
      m.armL.rotation.set(-1.15, 0, -0.85 - Math.sin(now / 30) * 0.12);
      m.armR.rotation.set(-1.15, 0, 0.85 + Math.sin(now / 30) * 0.12);
      g.cam.shake = k < 1 ? 0.04 : 0.2;
      this.lamp.intensity = Math.random() < 0.25 ? 2 : 14;
      this.lamp.position.set(cam.position.x, cam.position.y + 0.6, cam.position.z);
      this.flash.intensity = 0;
      this.wasScare = true;
      return;
    }
    if (this.wasScare) { this.wasScare = false; for (const a of Object.values(this.anims)) { a.model.armL.rotation.set(0, 0, 0); a.model.armR.rotation.set(0, 0, 0); a.model.head.rotation.set(0, 0, 0); } }
    this.lamp.position.set(0, 3.6, 21);
    if (g.cam.shake > 0.1) g.cam.shake = 0;

    // Vista de cámara (monitor, animatrónico o espectador)
    const view = this.cameraView(now);
    if (view) {
      cam.position.set(...view.pos);
      const look = v3(view.look);
      const dir = look.clone().sub(cam.position);
      const pan = Math.sin(this.camPanT += dt * 0.35) * 0.22;
      dir.applyAxisAngle(new THREE.Vector3(0, 1, 0), pan);
      cam.lookAt(cam.position.clone().add(dir));
      // Visión nocturna: iluminador infrarrojo junto a la cámara y filtro verdoso
      g.sky.hemi.intensity = 0.9;
      this.irLight.position.set(view.pos[0], view.pos[1] - 0.4, view.pos[2]);
      this.irLight.intensity = view.noSignal ? 0 : 55;
      this.hud.lockHint.style.visibility = 'hidden';
      const eco = n?.eco ? 0.35 : 0;
      const noSignal = view.noSignal;
      const st = noSignal ? 1 : now < this.staticUntil ? 0.85 : 0.08 + eco + Math.random() * 0.04;
      this.drawStatic(st);
      this.setCanvasFilter(this.isAnim ? 'contrast(1.2) saturate(0.5) sepia(0.4) hue-rotate(-30deg) brightness(1.1)' : 'contrast(1.15) saturate(0.45) sepia(0.35) hue-rotate(55deg) brightness(1.15)');
      this.camLabel.textContent = view.label;
      this.camMsg.textContent = noSignal ? (view.audioOnly ? '🔊 SOLO AUDIO' : 'SIN SEÑAL') : '';
      this.monitorEl.classList.toggle('anim-view', this.isAnim);
      this.monitorEl.classList.remove('hidden');
      this.monitorClose.classList.toggle('hidden', !this.monitor || this.monitor.free);
      this.mapEl.classList.toggle('hidden', !this.monitor);
    } else if (!this.monitor) {
      this.irLight.intensity = 0;
      this.hud.lockHint.style.visibility = '';
      this.setCanvasFilter(null);
      this.monitorEl.classList.add('hidden');
    }
  }

  cameraView(now) {
    const n = this.night;
    if (!n) return null;
    if (this.isAnim) {
      const a = this.anims[this.me.anim];
      const dv = DOOR_VIEW[a.node];
      if (dv) return { ...dv, label: `🎭 ${NODES[a.node].name}` };
      const cam = CAM_BY_ID[CAM_OF_NODE[a.node]];
      if (!cam) return null;
      return { pos: cam.pos, look: cam.look, label: `🎭 ${cam.name} (CAM ${cam.id})` };
    }
    if (!this.monitor) return null;
    const cam = CAM_BY_ID[this.monitor.cam];
    const sn = this.snap;
    const camsOff = (sn && sn.pw <= 0) || this.game.now() < n.camsOff || n.blackout;
    const statics = this.game.now() < n.staticUntil;
    if (statics) this.staticUntil = Math.max(this.staticUntil, now + 200);
    return { pos: cam.pos, look: cam.look, label: `CAM ${cam.id} · ${cam.name}`, noSignal: !!(cam.audioOnly || camsOff), audioOnly: cam.audioOnly };
  }

  animate(a, dt, now) {
    const m = a.model;
    const st = a.state;
    const moving = ['run', 'chase', 'walk'].includes(st);
    a.pos.lerp(a.target, Math.min(1, dt * (moving ? 10 : 6)));
    // Fito se asoma poco a poco de la cortina de la Cala Pirata
    let x = a.pos.x;
    if (a.id === 'fox' && a.node === 'pirate' && st !== 'run') x -= (3 - Math.min(3, this.snap?.fs || 0)) * 0.7;
    if (!(now < this.scareUntil && this.scareAnim === a.id)) {
      m.root.position.set(x, a.pos.y, a.pos.z);
      m.root.rotation.y = a.ry;
    }
    a.t += dt;
    const t = a.t;
    let walk = 0;
    if (moving) walk = Math.sin(t * (st === 'run' ? 16 : st === 'chase' ? 11 : 6));
    m.legL.rotation.x = walk * 0.6;
    m.legR.rotation.x = -walk * 0.6;
    m.armL.rotation.x = -walk * 0.5;
    m.armR.rotation.x = walk * 0.5;
    m.body.position.y = moving ? Math.abs(walk) * 0.06 : 0;
    m.body.rotation.x = st === 'run' ? 0.35 : 0;
    // Tics de cabeza, mandíbula y ojos
    const twitch = Math.sin(t * 0.7) > 0.96 ? Math.sin(t * 40) * 0.08 : 0;
    m.head.rotation.z = (st === 'door' ? 0.28 : 0.05 * Math.sin(t * 0.5)) + twitch;
    m.head.rotation.x = st === 'door' ? 0.15 : 0;
    m.jaw.rotation.x = st === 'inside' ? 0.35 + Math.sin(t * 9) * 0.2 : st === 'chase' || st === 'run' ? 0.25 : 0.04;
    if (st === 'inside') { m.armL.rotation.x = -1.6 + Math.sin(t * 6) * 0.2; m.armR.rotation.x = -1.6 - Math.sin(t * 6) * 0.2; }
    if (st === 'stun') { m.head.rotation.z = Math.sin(t * 30) * 0.2; m.body.rotation.z = Math.sin(t * 25) * 0.05; } else m.body.rotation.z = 0;
    const musicFace = st === 'music' && Math.sin(now / 90) > 0;
    m.eyeMat.emissiveIntensity = st === 'stun' ? 0 : st === 'inside' || st === 'chase' || musicFace ? 2.5 : 0.35;
  }

  syncBatteries(now) {
    const list = this.night.batteries || [];
    const ids = new Set(list.map((b) => b.id));
    for (const [id, mesh] of this.batteryMeshes) if (!ids.has(id)) { this.game.scene.remove(mesh); this.batteryMeshes.delete(id); }
    for (const b of list) {
      let mesh = this.batteryMeshes.get(b.id);
      if (!mesh) {
        mesh = new THREE.Group();
        mesh.add(new THREE.Mesh(new THREE.CylinderGeometry(0.12, 0.12, 0.4, 10), new THREE.MeshStandardMaterial({ color: '#43a047', emissive: '#1b5e20', emissiveIntensity: 0.8 })));
        mesh.add(new THREE.Mesh(new THREE.CylinderGeometry(0.06, 0.06, 0.08, 8).translate(0, 0.24, 0), new THREE.MeshStandardMaterial({ color: '#bdbdbd', metalness: 0.8 })));
        mesh.position.set(...b.p);
        this.game.scene.add(mesh);
        this.batteryMeshes.set(b.id, mesh);
      }
      mesh.rotation.y += 0.03;
      mesh.position.y = b.p[1] + Math.sin(now / 300) * 0.08;
    }
  }

  dispose() {
    clearInterval(this.musicLoop);
    clearInterval(this.resTimer);
    this.setCanvasFilter(null);
    audio.stopLoops();
    const g = this.game;
    for (const a of Object.values(this.anims)) g.scene.remove(a.model.root);
    for (const b of this.batteryMeshes.values()) g.scene.remove(b);
    this.hud.lockHint.style.visibility = '';
    g.scene.remove(this.irLight, this.lamp, this.flash, this.flashTarget, this.musicLight, ...Object.values(this.doorLights));
    clearTimeout(this.callT);
    clearTimeout(this.cardT);
    g.scene.remove(this.fan);
    for (const el of [this.tabletEl, this.cardEl, this.subEl, this.sixEl, this.overEl, this.openLobbyBtn, this.topEl, this.monitorEl, this.animEl, this.lobbyEl, this.resultsEl, this.scareEl, this.holdEl]) el.remove();
  }
}
