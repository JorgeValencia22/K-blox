// Herramientas de la campaña de Guerra Galáctica: sonidos sintetizados, sable de plasma con
// encendido y apagado, estela del sable, partículas/explosiones e interfaz (DOM).
import * as THREE from 'three';
import { audio } from '../../audio/audio.js';
import { h, clear } from '../../ui/dom.js';

export const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
export const lerp = (a, b, k) => a + (b - a) * k;
export const ease = (u) => u * u * (3 - 2 * u);
export const angDiff = (a, b) => Math.atan2(Math.sin(a - b), Math.cos(a - b));
export const rand = (a = 0, b = 1) => a + Math.random() * (b - a);

// --- Sonidos -----------------------------------------------------------------------------------
export const sfx = {
  blaster(vol = 0.2) { audio.tone({ freq: 1500, type: 'square', dur: 0.16, vol, slide: -1200, filter: 3200 }); audio.tone({ freq: 700, type: 'sawtooth', dur: 0.12, vol: vol * 0.5, slide: -500 }); },
  foeShot(vol = 0.1) { audio.tone({ freq: 900, type: 'square', dur: 0.18, vol, slide: -650, filter: 2400 }); },
  ignite() {
    audio.tone({ freq: 70, type: 'sawtooth', dur: 0.6, vol: 0.22, slide: 160, filter: 700 });
    audio.tone({ freq: 220, type: 'sawtooth', dur: 0.5, vol: 0.1, slide: 380, filter: 1800 });
    audio.noiseBurst({ dur: 0.35, vol: 0.12, freq: 2400 });
  },
  retract() {
    audio.tone({ freq: 260, type: 'sawtooth', dur: 0.4, vol: 0.18, slide: -190, filter: 1200 });
    audio.noiseBurst({ dur: 0.25, vol: 0.08, freq: 1400 });
  },
  swing() { audio.tone({ freq: 150, type: 'sawtooth', dur: 0.3, vol: 0.2, slide: 170, filter: 1300 }); audio.noiseBurst({ dur: 0.22, vol: 0.1, freq: 900, q: 2 }); },
  hum() { audio.tone({ freq: 95, type: 'sawtooth', dur: 0.2, vol: 0.05, filter: 500 }); },
  clash() { audio.noiseBurst({ dur: 0.35, vol: 0.35, freq: 3200, q: 0.8 }); audio.tone({ freq: 2200, type: 'square', dur: 0.12, vol: 0.12, slide: -1200 }); audio.tone({ freq: 110, type: 'sawtooth', dur: 0.3, vol: 0.2, filter: 600 }); },
  deflect() { audio.tone({ freq: 2600, type: 'triangle', dur: 0.14, vol: 0.2, slide: 900 }); audio.noiseBurst({ dur: 0.12, vol: 0.18, freq: 4200 }); },
  hit() { audio.noiseBurst({ dur: 0.12, vol: 0.2, freq: 700 }); audio.tone({ freq: 140, type: 'square', dur: 0.1, vol: 0.15, slide: -60 }); },
  hurt() { audio.tone({ freq: 190, type: 'sawtooth', dur: 0.25, vol: 0.2, slide: -100, filter: 900 }); },
  push() { audio.tone({ freq: 70, type: 'sine', dur: 0.7, vol: 0.45, slide: -40 }); audio.noiseBurst({ dur: 0.6, vol: 0.25, freq: 300, type: 'lowpass' }); },
  boom(vol = 0.5, dur = 1.2) { audio.noiseBurst({ dur, vol, freq: 180, type: 'lowpass' }); audio.tone({ freq: 60, type: 'sine', dur, vol: vol * 0.8, slide: -35 }); },
  torpedo() { audio.tone({ freq: 300, type: 'sawtooth', dur: 0.8, vol: 0.25, slide: 900, filter: 2500 }); },
  alarm() { audio.tone({ freq: 620, type: 'square', dur: 0.35, vol: 0.12, slide: 180, filter: 1800 }); },
  zap() { audio.noiseBurst({ dur: 0.08, vol: 0.12, freq: 5000, q: 3 }); audio.tone({ freq: 1800, type: 'square', dur: 0.06, vol: 0.05, slide: -900 }); },
  beep(f = 880) { audio.tone({ freq: f, type: 'square', dur: 0.12, vol: 0.1 }); },
  whoosh() { audio.noiseBurst({ dur: 0.7, vol: 0.2, freq: 600, q: 0.6 }); audio.tone({ freq: 90, type: 'sine', dur: 0.7, vol: 0.2, slide: 60 }); },
};

// --- Música generativa sencilla (según el momento) -------------------------------------------------
const NOTE = (n) => 220 * 2 ** ((n - 9) / 12);
const MOODS = {
  calm: { bpm: 70, root: 0, chord: [0, 7, 12], lead: [12, 14, 15, 14], drum: 0, vol: 0.5 },
  space: { bpm: 128, root: -2, chord: [0, 7, 10], lead: [12, 15, 19, 15], drum: 1, vol: 0.9 },
  tense: { bpm: 100, root: -5, chord: [0, 3, 7], lead: [12, 11, 12, 15], drum: 1, vol: 0.85 },
  boss: { bpm: 138, root: -7, chord: [0, 3, 7], lead: [12, 15, 14, 12], drum: 2, vol: 1 },
  victory: { bpm: 96, root: 0, chord: [0, 4, 7], lead: [12, 16, 19, 24], drum: 1, vol: 0.9 },
  doom: { bpm: 60, root: -9, chord: [0, 1, 6], lead: [], drum: 0, vol: 0.7 },
  off: null,
};
export class Score {
  constructor() { this.mood = 'off'; this.t = 0; this.beat = 0; this.vol = 1; }
  set(mood) { this.mood = mood; this.beat = 0; this.t = 0; }
  update(dt) {
    const m = MOODS[this.mood];
    if (!m || !audio.ready) return;
    this.t += dt;
    const step = 60 / m.bpm / 2;
    while (this.t >= step) {
      this.t -= step;
      const b = this.beat++;
      const root = NOTE(9 + m.root - 12);
      if (b % 8 === 0) for (const c of m.chord) audio.tone({ freq: root * 2 ** (c / 12), type: 'sawtooth', dur: step * 7.5, vol: 0.035 * m.vol * this.vol, attack: step * 1.5, filter: 700, bus: 'music' });
      if (m.lead.length && b % 2 === 0) audio.tone({ freq: NOTE(9 + m.root + m.lead[(b / 2) % m.lead.length]), type: 'triangle', dur: step * 1.6, vol: 0.05 * m.vol * this.vol, attack: 0.02, bus: 'music' });
      if (m.drum && b % 2 === 0) audio.tone({ freq: 62, type: 'sine', dur: 0.22, vol: 0.2 * m.vol * this.vol, slide: -30, bus: 'music' });
      if (m.drum > 1 && b % 4 === 3) audio.noiseBurst({ dur: 0.1, vol: 0.06 * this.vol, freq: 4500, bus: 'music' });
      if (m.drum && b % 8 === 0) audio.noiseBurst({ dur: 0.35, vol: 0.05 * this.vol, freq: 200, type: 'lowpass', bus: 'music' });
    }
  }
}

// --- Materiales y utilidades de geometría ----------------------------------------------------------------
const matCache = new Map();
export function mat(color, o = {}) {
  const key = `${color}|${o.metal ?? 0.3}|${o.rough ?? 0.7}|${o.em ?? ''}|${o.ei ?? 0}|${o.side ?? 0}`;
  let m = matCache.get(key);
  if (!m) {
    m = new THREE.MeshStandardMaterial({ color, metalness: o.metal ?? 0.3, roughness: o.rough ?? 0.7, emissive: o.em || '#000000', emissiveIntensity: o.ei ?? 0, side: o.side ? THREE.DoubleSide : THREE.FrontSide });
    matCache.set(key, m);
  }
  return m;
}
export const glowMat = (color, opacity = 0.55) => new THREE.MeshBasicMaterial({ color, transparent: true, opacity, blending: THREE.AdditiveBlending, depthWrite: false });
export const emissive = (color, ei = 1) => new THREE.MeshStandardMaterial({ color: '#111111', emissive: color, emissiveIntensity: ei, roughness: 0.5 });

/** Caja colocada por su centro. */
export function box(parent, w, hh, d, material, x = 0, y = 0, z = 0, ry = 0) {
  const m = new THREE.Mesh(new THREE.BoxGeometry(w, hh, d), typeof material === 'string' ? mat(material) : material);
  m.position.set(x, y, z);
  m.rotation.y = ry;
  m.castShadow = m.receiveShadow = true;
  parent.add(m);
  return m;
}
export function cyl(parent, rt, rb, hh, material, x = 0, y = 0, z = 0, seg = 16) {
  const m = new THREE.Mesh(new THREE.CylinderGeometry(rt, rb, hh, seg), typeof material === 'string' ? mat(material) : material);
  m.position.set(x, y, z);
  m.castShadow = m.receiveShadow = true;
  parent.add(m);
  return m;
}

export function canvasTex(w, hh, draw, repeat) {
  const c = document.createElement('canvas');
  c.width = w;
  c.height = hh;
  draw(c.getContext('2d'), w, hh);
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  if (repeat) { t.wrapS = t.wrapT = THREE.RepeatWrapping; t.repeat.set(...repeat); }
  t.anisotropy = 4;
  return t;
}

/** Sprite de brillo (halo de luz aditivo, siempre visible). */
const glowTexCache = new Map();
export function glowSprite(color, size) {
  color = `#${new THREE.Color(color).getHexString()}`; // admite colores cortos como #333
  let t = glowTexCache.get(color);
  if (!t) {
    t = canvasTex(128, 128, (g) => {
      const gr = g.createRadialGradient(64, 64, 0, 64, 64, 64);
      gr.addColorStop(0, '#ffffff'); gr.addColorStop(0.18, color); gr.addColorStop(0.55, `${color}55`); gr.addColorStop(1, `${color}00`);
      g.fillStyle = gr; g.fillRect(0, 0, 128, 128);
    });
    glowTexCache.set(color, t);
  }
  const s = new THREE.Sprite(new THREE.SpriteMaterial({ map: t, transparent: true, blending: THREE.AdditiveBlending, depthWrite: false, fog: false }));
  s.scale.set(size, size, 1);
  return s;
}

// --- Sable de plasma ---------------------------------------------------------------------------------------
/** Empuñadura + hoja (la hoja crece/encoge con setLen(0..1): animación de encendido y apagado). */
export function makeSaberRig(color = '#29b6f6', L = 1.3) {
  const root = new THREE.Group();
  const hilt = new THREE.Mesh(new THREE.CylinderGeometry(0.04, 0.048, 0.34, 10), new THREE.MeshStandardMaterial({ color: '#cfd8dc', metalness: 0.85, roughness: 0.25 }));
  const grip = new THREE.Mesh(new THREE.CylinderGeometry(0.05, 0.05, 0.14, 10), new THREE.MeshStandardMaterial({ color: '#1c1f24', roughness: 0.6 }));
  grip.position.y = -0.04;
  const ring = new THREE.Mesh(new THREE.TorusGeometry(0.048, 0.012, 6, 12), new THREE.MeshStandardMaterial({ color: '#ffd54f', metalness: 0.9, roughness: 0.2 }));
  ring.rotation.x = Math.PI / 2;
  ring.position.y = 0.14;
  const emitter = new THREE.Mesh(new THREE.CylinderGeometry(0.05, 0.04, 0.05, 10), new THREE.MeshStandardMaterial({ color: '#90a4ae', metalness: 0.9, roughness: 0.3 }));
  emitter.position.y = 0.18;
  const blade = new THREE.Group();
  blade.position.y = 0.2;
  const coreM = new THREE.MeshBasicMaterial({ color: '#ffffff' });
  const core = new THREE.Mesh(new THREE.CylinderGeometry(0.026, 0.03, L, 10), coreM);
  const tip = new THREE.Mesh(new THREE.SphereGeometry(0.03, 8, 6), coreM);
  const haloM = glowMat(color, 0.62), halo2M = glowMat(color, 0.22);
  const halo = new THREE.Mesh(new THREE.CylinderGeometry(0.07, 0.08, L + 0.06, 12), haloM);
  const halo2 = new THREE.Mesh(new THREE.CylinderGeometry(0.15, 0.16, L + 0.14, 12), halo2M);
  const haloTip = new THREE.Mesh(new THREE.SphereGeometry(0.075, 8, 6), haloM);
  for (const m of [core, halo, halo2]) m.position.y = L / 2;
  tip.position.y = L;
  haloTip.position.y = L;
  const base = new THREE.Object3D();
  const top = new THREE.Object3D();
  top.position.y = L;
  blade.add(core, tip, halo, halo2, haloTip, base, top);
  root.add(hilt, grip, ring, emitter, blade);
  const rig = {
    root, blade, L, base, top, k: 0, color, halo2M, haloM,
    setLen(k) { rig.k = k; blade.scale.y = Math.max(0.0001, k); blade.visible = k > 0.01; },
    tint(c) { haloM.color.set(c); halo2M.color.set(c); },
  };
  rig.setLen(0);
  return rig;
}

export function makeBlaster() {
  const g = new THREE.Group();
  const dark = new THREE.MeshStandardMaterial({ color: '#2b343a', roughness: 0.45, metalness: 0.6 });
  const light = new THREE.MeshStandardMaterial({ color: '#90a4ae', roughness: 0.3, metalness: 0.8 });
  const body = new THREE.Mesh(new THREE.BoxGeometry(0.11, 0.17, 0.5), dark);
  const barrel = new THREE.Mesh(new THREE.CylinderGeometry(0.03, 0.035, 0.42, 8).rotateX(Math.PI / 2), light);
  barrel.position.z = 0.4;
  const grip = new THREE.Mesh(new THREE.BoxGeometry(0.08, 0.24, 0.1), dark);
  grip.position.set(0, -0.16, -0.1);
  grip.rotation.x = 0.25;
  const scope = new THREE.Mesh(new THREE.CylinderGeometry(0.028, 0.028, 0.24, 8).rotateX(Math.PI / 2), light);
  scope.position.set(0, 0.13, 0.02);
  const cell = new THREE.Mesh(new THREE.BoxGeometry(0.06, 0.06, 0.2), new THREE.MeshBasicMaterial({ color: '#40c4ff' }));
  cell.position.set(0, 0.02, -0.02);
  const muzzle = new THREE.Object3D();
  muzzle.position.z = 0.62;
  g.add(body, barrel, grip, scope, cell, muzzle);
  g.userData.muzzle = muzzle;
  return g;
}

// --- Estela del sable ---------------------------------------------------------------------------------------
export class Trail {
  constructor(scene, color = '#40c4ff', n = 16) {
    this.n = n;
    this.pts = [];
    this.geo = new THREE.BufferGeometry();
    this.geo.setAttribute('position', new THREE.BufferAttribute(new Float32Array(n * 2 * 3), 3));
    this.geo.setAttribute('color', new THREE.BufferAttribute(new Float32Array(n * 2 * 3), 3));
    const idx = [];
    for (let i = 0; i < n - 1; i++) { const a = i * 2; idx.push(a, a + 1, a + 2, a + 1, a + 3, a + 2); }
    this.geo.setIndex(idx);
    this.mat = new THREE.MeshBasicMaterial({ vertexColors: true, transparent: true, blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.DoubleSide });
    this.mesh = new THREE.Mesh(this.geo, this.mat);
    this.mesh.frustumCulled = false;
    this.color = new THREE.Color(color);
    scene.add(this.mesh);
    this.scene = scene;
    this.geo.setDrawRange(0, 0);
  }

  setColor(c) { this.color.set(c); }

  /** Añade el segmento actual de la hoja (base y punta, en coordenadas del mundo). */
  push(a, b) {
    this.pts.unshift([a.clone(), b.clone(), 1]);
    if (this.pts.length > this.n) this.pts.pop();
  }

  update(dt) {
    const pos = this.geo.attributes.position, col = this.geo.attributes.color;
    for (const p of this.pts) p[2] -= dt * 4.5;
    this.pts = this.pts.filter((p) => p[2] > 0);
    const n = this.pts.length;
    for (let i = 0; i < n; i++) {
      const [a, b, life] = this.pts[i];
      pos.setXYZ(i * 2, a.x, a.y, a.z);
      pos.setXYZ(i * 2 + 1, b.x, b.y, b.z);
      const k = life * life * 0.85;
      col.setXYZ(i * 2, this.color.r * k * 0.3, this.color.g * k * 0.3, this.color.b * k * 0.3);
      col.setXYZ(i * 2 + 1, this.color.r * k, this.color.g * k, this.color.b * k);
    }
    pos.needsUpdate = col.needsUpdate = true;
    this.geo.setDrawRange(0, Math.max(0, (n - 1) * 6));
  }

  dispose() { this.scene.remove(this.mesh); this.geo.dispose(); this.mat.dispose(); }
}

let dotTex = null;
const dot = () => dotTex || (dotTex = canvasTex(64, 64, (g) => { const gr = g.createRadialGradient(32, 32, 0, 32, 32, 32); gr.addColorStop(0, 'rgba(255,255,255,1)'); gr.addColorStop(0.4, 'rgba(255,255,255,.7)'); gr.addColorStop(1, 'rgba(255,255,255,0)'); g.fillStyle = gr; g.fillRect(0, 0, 64, 64); }));

// --- Partículas, explosiones y anillos -------------------------------------------------------------------------
export class Fx {
  constructor() { this.list = []; this.scene = null; this.lights = []; this.lightI = 0; }

  setScene(scene) {
    this.dispose();
    this.scene = scene;
    this.lights = scene.userData.flashLights || [];
  }

  dispose() {
    for (const f of this.list) this.kill(f);
    this.list = [];
  }

  kill(f) {
    f.obj?.parent?.remove(f.obj);
    f.obj?.traverse?.((o) => { o.geometry?.dispose(); if (o.material && !o.material.isSpriteMaterial) o.material.dispose?.(); });
  }

  points(pos, n, color, size, speed, life, grav = 9, drag = 0) {
    const arr = new Float32Array(n * 3), vel = [];
    for (let i = 0; i < n; i++) {
      arr.set([pos.x, pos.y, pos.z], i * 3);
      vel.push(new THREE.Vector3().randomDirection().multiplyScalar(speed * rand(0.35, 1)));
    }
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.BufferAttribute(arr, 3));
    const obj = new THREE.Points(geo, new THREE.PointsMaterial({ color, size, map: dot(), transparent: true, blending: THREE.AdditiveBlending, depthWrite: false, sizeAttenuation: true, fog: false }));
    obj.frustumCulled = false;
    this.scene.add(obj);
    this.list.push({ kind: 'pts', obj, vel, t: 0, life, grav, drag });
  }

  spark(pos, color = '#ffe082', n = 14, speed = 8) { if (this.scene) this.points(pos, n, color, 0.22, speed, 0.55); }

  /** Explosión: bola de fuego, chispas y destello de luz. */
  burst(pos, scale = 1, color = '#ffab40') {
    if (!this.scene) return;
    this.points(pos, Math.round(26 * Math.min(scale, 5)), color, 0.5 * scale, 11 * scale, 0.9, 2);
    const ball = new THREE.Mesh(new THREE.SphereGeometry(1.2 * scale, 14, 10), glowMat(new THREE.Color(color).lerp(new THREE.Color('#ffffff'), 0.55), 0.9));
    ball.position.copy(pos);
    this.scene.add(ball);
    this.list.push({ kind: 'ball', obj: ball, t: 0, life: 0.7, s0: scale });
    this.flash(pos, color, 7 * scale);
  }

  flash(pos, color = '#ffffff', intensity = 6) {
    if (!this.lights.length) return;
    const l = this.lights[this.lightI++ % this.lights.length];
    l.position.copy(pos);
    l.color.set(color);
    l.intensity = intensity;
    this.list.push({ kind: 'light', obj: null, light: l, t: 0, life: 0.25, base: intensity });
  }

  /** Anillo de energía que se expande (onda de choque). */
  ring(pos, normal, color, size = 1, life = 0.6, grow = 8, thick = 0.1) {
    if (!this.scene) return;
    const r = new THREE.Mesh(new THREE.TorusGeometry(size, thick * size, 8, 40), glowMat(color, 0.85));
    r.position.copy(pos);
    r.lookAt(pos.clone().add(normal));
    this.scene.add(r);
    this.list.push({ kind: 'ring', obj: r, t: 0, life, grow });
  }

  smoke(pos, n = 1, color = '#2b2b2b') {
    if (!this.scene) return;
    for (let i = 0; i < n; i++) {
      const s = glowSprite(color, rand(2, 4));
      s.material.blending = THREE.NormalBlending;
      s.material.opacity = 0.5;
      s.position.copy(pos).add(new THREE.Vector3(rand(-0.4, 0.4), 0, rand(-0.4, 0.4)));
      this.scene.add(s);
      this.list.push({ kind: 'smoke', obj: s, t: 0, life: rand(1.4, 2.4), vy: rand(1.5, 3) });
    }
  }

  update(dt) {
    for (let i = this.list.length - 1; i >= 0; i--) {
      const f = this.list[i];
      f.t += dt;
      const k = f.t / f.life;
      if (f.kind === 'pts') {
        const a = f.obj.geometry.attributes.position;
        f.vel.forEach((v, j) => { v.y -= f.grav * dt; if (f.drag) v.multiplyScalar(1 - f.drag * dt); a.setXYZ(j, a.getX(j) + v.x * dt, a.getY(j) + v.y * dt, a.getZ(j) + v.z * dt); });
        a.needsUpdate = true;
        f.obj.material.opacity = 1 - k;
      } else if (f.kind === 'ball') {
        const s = 1 + k * 2.6;
        f.obj.scale.set(s, s, s);
        f.obj.material.opacity = 0.95 * (1 - k) * (1 - k);
      } else if (f.kind === 'light') f.light.intensity = f.base * Math.max(0, 1 - k);
      else if (f.kind === 'ring') {
        const s = 1 + k * f.grow;
        f.obj.scale.set(s, s, s);
        f.obj.material.opacity = 0.85 * (1 - k);
      } else if (f.kind === 'smoke') {
        f.obj.position.y += f.vy * dt;
        f.obj.scale.multiplyScalar(1 + dt * 0.9);
        f.obj.material.opacity = 0.5 * (1 - k);
      }
      if (k >= 1) { if (f.light) f.light.intensity = 0; this.kill(f); this.list.splice(i, 1); }
    }
  }
}

/** Luces de destello reutilizables (no se crean luces nuevas durante la partida: evita tirones). */
export function addFlashLights(scene, n = 3) {
  const arr = [];
  for (let i = 0; i < n; i++) { const l = new THREE.PointLight('#ffffff', 0, 40, 1.6); scene.add(l); arr.push(l); }
  scene.userData.flashLights = arr;
  return arr;
}

// --- Interfaz (DOM) ----------------------------------------------------------------------------------------------
export class CHud {
  constructor() {
    this.fadeEl = h('div.gxc-fade');
    this.barsEl = h('div.gxc-bars', h('i'), h('i'));
    this.cap = h('div.gxc-cap');
    this.titleEl = h('div.gxc-title');
    this.objEl = h('div.gxc-obj');
    this.timerEl = h('div.gxc-timer.hidden');
    this.flashEl = h('div.gxc-flash');
    this.hurtEl = h('div.gxc-hurt');
    this.cross = h('div.gxc-cross.hidden', h('i'));
    this.marks = h('div.gxc-marks');
    this.hpFill = h('div.gxc-hpfill');
    this.hpTxt = h('span', '');
    this.pips = h('div.gxc-pips');
    this.weaponEl = h('div.gxc-weapon');
    this.stats = h('div.gxc-stats.hidden', h('div.gxc-bar', this.hpFill), this.weaponEl, this.pips);
    this.bossName = h('div.gxc-boss-name');
    this.bossFill = h('div.gxc-boss-fill');
    this.bossEl = h('div.gxc-boss.hidden', this.bossName, h('div.gxc-boss-bar', this.bossFill));
    this.shipHp = h('div.gxc-shiphp.hidden', h('span', 'ESCUDOS'), h('div.gxc-bar', (this.shipFill = h('div.gxc-hpfill', { style: { background: '#00e5ff' } }))));
    this.help = h('div.gxc-help');
    this.lockEl = h('div.gxc-lock.hidden', '🖱️ Haz clic en el juego para controlar la cámara');
    this.skipBtn = h('button.gxc-skip.hidden', { on: { click: () => this.onSkip?.() } }, 'Saltar ▶');
    this.countEl = h('div.gxc-count.hidden');
    this.crawl = h('div.gxc-crawlwrap.hidden', h('div.gxc-crawl'));
    this.btns = h('div.gxc-btns.hidden');
    this.root = h('div.gxc', this.crawl, this.marks, this.cross, this.hurtEl, this.flashEl, this.bossEl, this.shipHp, this.stats, this.objEl, this.timerEl, this.titleEl, this.cap, this.countEl, this.help, this.btns, this.lockEl, this.skipBtn, this.barsEl, this.fadeEl);
    document.body.appendChild(this.root);
    this.markEls = [];
    this.fadeEl.style.opacity = 1;
  }

  fade(to, ms = 600) {
    this.fadeEl.style.transition = `opacity ${ms}ms ease`;
    this.fadeEl.style.background = '#000';
    requestAnimationFrame(() => { this.fadeEl.style.opacity = to; });
  }

  whiteFlash(ms = 700) {
    const f = this.flashEl;
    f.style.transition = 'none';
    f.style.opacity = 1;
    void f.offsetWidth;
    f.style.transition = `opacity ${ms}ms ease-out`;
    f.style.opacity = 0;
  }

  bars(on) { this.barsEl.classList.toggle('on', on); }

  caption(text, ms = 3200) {
    clear(this.cap);
    if (!text) return;
    this.cap.append(h('span', text));
    this.cap.classList.remove('pop');
    void this.cap.offsetWidth;
    this.cap.classList.add('pop');
    clearTimeout(this.capT);
    if (ms) this.capT = setTimeout(() => clear(this.cap), ms);
  }

  title(big, small = '', ms = 3000, color = '') {
    clear(this.titleEl);
    if (!big) return;
    this.titleEl.append(...[h('div.t1', { style: color ? { color } : {} }, big), small ? h('div.t2', small) : null].filter(Boolean));
    this.titleEl.classList.remove('pop');
    void this.titleEl.offsetWidth;
    this.titleEl.classList.add('pop');
    clearTimeout(this.titleT);
    if (ms) this.titleT = setTimeout(() => clear(this.titleEl), ms);
  }

  objective(t) { this.objEl.textContent = t || ''; }
  timer(t) { this.timerEl.classList.toggle('hidden', !t); this.timerEl.textContent = t || ''; }
  hurt() { this.hurtEl.style.transition = 'none'; this.hurtEl.style.opacity = 1; void this.hurtEl.offsetWidth; this.hurtEl.style.transition = 'opacity .5s'; this.hurtEl.style.opacity = 0; }
  showStats(on) { this.stats.classList.toggle('hidden', !on); }
  setHp(v, max) { this.hpFill.style.width = `${clamp(v / max, 0, 1) * 100}%`; this.hpFill.style.background = v / max > 0.5 ? '#00e676' : v / max > 0.25 ? '#ffca28' : '#ff1744'; }
  setShip(v) { this.shipFill.style.width = `${clamp(v, 0, 100)}%`; this.shipFill.style.background = v > 50 ? '#00e5ff' : v > 25 ? '#ffca28' : '#ff1744'; }
  showShip(on) { this.shipHp.classList.toggle('hidden', !on); }
  setWeapon(w, extra = '') { this.weaponEl.textContent = (w === 'saber' ? '🗡️ Sable de plasma' : '🔫 Bláster') + extra; }

  setPips(n, max, over) {
    if (this.pips.children.length !== max) { clear(this.pips); for (let i = 0; i < max; i++) this.pips.append(h('i')); }
    [...this.pips.children].forEach((p, i) => { p.className = over ? 'over' : i < max - n ? 'on' : ''; });
    this.pips.title = over ? 'Sable sobrecalentado' : 'Disparos que puedes desviar';
  }

  boss(name, v, max) {
    this.bossEl.classList.toggle('hidden', !name);
    if (!name) return;
    this.bossName.textContent = name;
    this.bossFill.style.width = `${clamp(v / max, 0, 1) * 100}%`;
  }

  lockHint(on) { this.lockEl.classList.toggle('hidden', !on); }
  crossPos(x, y) { this.cross.style.left = x == null ? '' : `${x}px`; this.cross.style.top = x == null ? '' : `${y}px`; }
  crossOn(on, locked = false) { this.cross.classList.toggle('hidden', !on); this.cross.classList.toggle('lock', locked); }
  helpText(t) { this.help.textContent = t || ''; }
  /** Las cinemáticas no se pueden saltar: se mantiene el método para no tocar cada capítulo, pero no hace nada. */
  skip() { this.onSkip = null; this.skipBtn.classList.add('hidden'); }

  count(n, sub = '') {
    this.countEl.classList.toggle('hidden', n == null);
    if (n == null) return;
    clear(this.countEl).append(h('div.n', String(n)), h('div.s', sub));
  }

  /** Texto que sube con perspectiva (la introducción). */
  showCrawl(lines) {
    clear(this.crawl.firstChild).append(...lines.map((l) => (l.startsWith('# ') ? h('h2', l.slice(2)) : h('p', l))));
    this.crawl.classList.remove('hidden');
    this.crawl.firstChild.style.animation = 'none';
    void this.crawl.offsetWidth;
    this.crawl.firstChild.style.animation = '';
  }
  hideCrawl() { this.crawl.classList.add('hidden'); }

  buttons(list) {
    clear(this.btns);
    this.btns.classList.toggle('hidden', !list?.length);
    if (list) this.btns.append(...list.map(([label, fn, cls]) => h(`button.btn.${cls || 'primary'}.big`, { on: { click: fn } }, label)));
  }

  /** Marcador sobre un enemigo (se reutilizan los elementos). */
  mark(i, x, y, opts = {}) {
    let el = this.markEls[i];
    if (!el) { el = h('div.gxc-mark', h('i'), h('span')); this.marks.append(el); this.markEls[i] = el; }
    el.style.display = '';
    el.style.left = `${x}px`;
    el.style.top = `${y}px`;
    el.className = `gxc-mark${opts.lock ? ' lock' : ''}${opts.edge ? ' edge' : ''}`;
    el.firstChild.style.transform = opts.edge ? `rotate(${opts.rot || 0}rad)` : '';
    el.lastChild.textContent = opts.text || '';
  }
  hideMarks(from = 0) { for (let i = from; i < this.markEls.length; i++) this.markEls[i].style.display = 'none'; }

  dispose() { clearTimeout(this.capT); clearTimeout(this.titleT); this.root.remove(); }
}
