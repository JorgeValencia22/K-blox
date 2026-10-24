// Escenarios de la campaña: espacio, hangar de la estación, núcleo, mundo de lava y planeta hogar,
// más las naves (caza rebelde, caza enemigo y el «Halcón»). Cada constructor devuelve
// { scene, bounds(p), colliders, ... } y, si hay animación, scene.userData.anim(t, dt).
import * as THREE from 'three';
import { mat, box, cyl, canvasTex, glowMat, glowSprite, emissive, addFlashLights, rand, clamp } from './kit.js';
import { AvatarModel } from '../../avatar/avatarModel.js';
import { AvatarAnimator } from '../../avatar/avatarAnimator.js';
import { randomAvatar } from '../../../../shared/avatar.js';
import { mulberry32 } from '../../../../shared/terrain.js';

const plateTex = (dark = true, repeat = [8, 8]) => canvasTex(512, 512, (g) => {
  g.fillStyle = dark ? '#454c57' : '#6d737c';
  g.fillRect(0, 0, 512, 512);
  for (let i = 0; i < 280; i++) {
    const v = (dark ? 58 : 96) + Math.floor(Math.random() * 46);
    g.fillStyle = `rgb(${v},${v + 3},${v + 8})`;
    g.fillRect(Math.random() * 512, Math.random() * 512, 8 + Math.random() * 70, 6 + Math.random() * 40);
  }
  g.strokeStyle = 'rgba(0,0,0,.45)';
  g.lineWidth = 2;
  for (let i = 0; i <= 512; i += 64) { g.beginPath(); g.moveTo(i, 0); g.lineTo(i, 512); g.stroke(); g.beginPath(); g.moveTo(0, i); g.lineTo(512, i); g.stroke(); }
  for (let i = 0; i < 70; i++) { g.fillStyle = Math.random() < 0.75 ? '#fff3c4' : '#80d8ff'; g.fillRect(Math.random() * 512, Math.random() * 512, 3, 3); }
}, repeat);

// ================================================================================ Naves ==========
/** Caza rebelde (el del jugador): morro en -z. */
export function buildFighter() {
  const g = new THREE.Group();
  const white = mat('#eceff1', { metal: 0.2, rough: 0.5 }), grey = mat('#90a4ae', { metal: 0.5, rough: 0.4 }), red = mat('#e53935', { rough: 0.6 });
  g.add(box(g, 0.9, 0.8, 6, white), box(g, 0.92, 0.1, 2, red, 0, 0.41, -2.6));
  const nose = new THREE.Mesh(new THREE.ConeGeometry(0.55, 2.4, 4).rotateX(-Math.PI / 2).rotateZ(Math.PI / 4), white);
  nose.position.z = -4.1;
  const cockpit = new THREE.Mesh(new THREE.SphereGeometry(0.5, 12, 8, 0, Math.PI * 2, 0, Math.PI / 2), new THREE.MeshStandardMaterial({ color: '#1a237e', roughness: 0.1, metalness: 0.6 }));
  cockpit.scale.set(0.9, 0.9, 1.8);
  cockpit.position.set(0, 0.4, -0.8);
  g.add(nose, cockpit);
  const engines = [];
  for (const [sx, sy] of [[-1, 1], [1, 1], [-1, -1], [1, -1]]) {
    const wing = box(g, 4.2, 0.1, 1.8, white, sx * 2.4, sy * 0.55, 1.6);
    wing.rotation.z = sx * sy * 0.22;
    const ws = box(g, 1.2, 0.12, 1.4, red, sx * 3.2, sy * 0.72, 1.6);
    ws.rotation.z = wing.rotation.z;
    const cannon = new THREE.Mesh(new THREE.CylinderGeometry(0.07, 0.07, 3.8, 6).rotateX(Math.PI / 2), grey);
    cannon.position.set(sx * 4.5, sy * 0.95, 0.4);
    const eng = new THREE.Mesh(new THREE.CylinderGeometry(0.36, 0.36, 2.2, 10).rotateX(Math.PI / 2), grey);
    eng.position.set(sx * 0.95, sy * 0.55, 2.2);
    const glow = new THREE.Mesh(new THREE.CircleGeometry(0.3, 12), new THREE.MeshBasicMaterial({ color: '#ff8a65' }));
    glow.position.set(sx * 0.95, sy * 0.55, 3.31);
    engines.push(glow);
    g.add(cannon, eng, glow);
  }
  g.userData.engines = engines;
  g.userData.guns = [[-4.5, 0.95, -1.5], [4.5, 0.95, -1.5], [-4.5, -0.95, -1.5], [4.5, -0.95, -1.5]];
  return g;
}

/** Caza enemigo, bien visible: casco claro, paneles con borde rojo y halo luminoso. */
export function buildEnemy() {
  const g = new THREE.Group();
  const hull = mat('#a9b4c0', { metal: 0.5, rough: 0.35 });
  const panel = new THREE.MeshStandardMaterial({ color: '#59636f', roughness: 0.5, metalness: 0.4, emissive: '#ff3b30', emissiveIntensity: 0.35, side: THREE.DoubleSide });
  const ball = new THREE.Mesh(new THREE.SphereGeometry(1.2, 14, 10), hull);
  const eye = new THREE.Mesh(new THREE.CircleGeometry(0.62, 8), new THREE.MeshBasicMaterial({ color: '#ff5252' }));
  eye.position.z = -1.18;
  eye.rotation.y = Math.PI;
  const arm = new THREE.Mesh(new THREE.CylinderGeometry(0.24, 0.24, 4.6, 8).rotateZ(Math.PI / 2), hull);
  g.add(ball, eye, arm);
  for (const s of [-1, 1]) {
    const w = new THREE.Mesh(new THREE.CylinderGeometry(2.8, 2.8, 0.16, 6).rotateZ(Math.PI / 2), panel);
    w.position.x = s * 2.4;
    const edge = new THREE.Mesh(new THREE.TorusGeometry(2.8, 0.07, 6, 6).rotateY(Math.PI / 2), glowMat('#ff5252', 0.9));
    edge.position.x = s * 2.4;
    g.add(w, edge);
  }
  const halo = glowSprite('#ff3b30', 17);
  g.add(halo);
  g.userData.halo = halo;
  return g;
}

/** El «Halcón»: nave de carga con forma de disco y dos «tenazas» al frente. Morro en -z. */
export function buildFalcon() {
  const g = new THREE.Group();
  const hull = mat('#c9ced4', { metal: 0.4, rough: 0.45 }), dark = mat('#7a828c', { metal: 0.5, rough: 0.5 }), trim = mat('#9aa3ad', { metal: 0.5, rough: 0.4 });
  const disc = new THREE.Mesh(new THREE.CylinderGeometry(5.4, 5.8, 1.2, 36), hull);
  const top = new THREE.Mesh(new THREE.CylinderGeometry(3.4, 4.8, 0.5, 30), trim);
  top.position.y = 0.8;
  const ring = new THREE.Mesh(new THREE.TorusGeometry(4.6, 0.1, 6, 40).rotateX(Math.PI / 2), dark);
  ring.position.y = 0.62;
  g.add(disc, top, ring);
  for (const s of [-1, 1]) {
    const m = box(g, 1.7, 0.95, 6.4, hull, s * 1.9, 0, -6.2);
    m.rotation.y = s * -0.04;
    box(g, 1.4, 0.3, 4.6, dark, s * 1.9, 0.62, -6.0);
  }
  box(g, 5, 0.9, 1.6, hull, 0, 0, -4.4);
  const tube = new THREE.Mesh(new THREE.CylinderGeometry(0.55, 0.55, 4, 12).rotateX(Math.PI / 2), trim);
  tube.position.set(4.1, 0.1, -3.7);
  const cockpit = new THREE.Mesh(new THREE.SphereGeometry(0.85, 14, 10), new THREE.MeshStandardMaterial({ color: '#1b2a41', roughness: 0.1, metalness: 0.6, emissive: '#0b2a4a', emissiveIntensity: 0.4 }));
  cockpit.scale.set(1, 0.8, 1.2);
  cockpit.position.set(4.1, 0.3, -5.5);
  const dish = new THREE.Mesh(new THREE.CylinderGeometry(1.1, 0.25, 0.3, 14), dark);
  dish.position.set(-2.2, 1.5, -2.6);
  dish.rotation.x = 0.4;
  const engMat = new THREE.MeshBasicMaterial({ color: '#4fc3f7' });
  const engine = new THREE.Mesh(new THREE.BoxGeometry(7.4, 0.55, 0.3), engMat);
  engine.position.set(0, 0, 5.75);
  const glow = glowSprite('#4fc3f7', 16);
  glow.position.set(0, 0, 6.4);
  g.add(tube, cockpit, dish, engine, glow);
  g.userData = { engMat, glow, engine };
  g.userData.setEngine = (k) => { engMat.color.set(k > 0 ? '#4fc3f7' : '#1c2a33'); glow.visible = k > 0; glow.scale.setScalar(16 * Math.max(0.4, k)); };
  return g;
}

// ============================================================================== Espacio ==========
function nebulaTex() {
  return canvasTex(1024, 512, (g, w, hh) => {
    const bg = g.createLinearGradient(0, 0, 0, hh);
    bg.addColorStop(0, '#0b1030'); bg.addColorStop(0.5, '#150a33'); bg.addColorStop(1, '#07142b');
    g.fillStyle = bg; g.fillRect(0, 0, w, hh);
    const cols = ['rgba(150,60,255,', 'rgba(40,150,255,', 'rgba(255,70,140,', 'rgba(30,220,200,'];
    for (let i = 0; i < 46; i++) {
      const x = Math.random() * w, y = Math.random() * hh, r = 60 + Math.random() * 190;
      const gr = g.createRadialGradient(x, y, 0, x, y, r);
      gr.addColorStop(0, `${cols[i % 4]}${0.1 + Math.random() * 0.14})`); gr.addColorStop(1, `${cols[i % 4]}0)`);
      g.fillStyle = gr; g.fillRect(x - r, y - r, r * 2, r * 2);
    }
    for (let i = 0; i < 700; i++) { g.fillStyle = `rgba(255,255,255,${0.3 + Math.random() * 0.7})`; g.fillRect(Math.random() * w, Math.random() * hh, 1.4, 1.4); }
  });
}

/** Cielo estrellado con nebulosa, sol lejano y luces. Se llama una vez por escena de espacio. */
export function addSpaceBackdrop(scene, { dark = false } = {}) {
  scene.background = new THREE.Color(dark ? '#02030a' : '#07091c');
  const sky = new THREE.Mesh(new THREE.SphereGeometry(12000, 32, 16), new THREE.MeshBasicMaterial({ map: nebulaTex(), side: THREE.BackSide, depthWrite: false, fog: false, color: dark ? '#556' : '#ffffff' }));
  sky.renderOrder = -10;
  const n = 6000, pos = new Float32Array(n * 3), col = new Float32Array(n * 3);
  for (let i = 0; i < n; i++) {
    const v = new THREE.Vector3().randomDirection().multiplyScalar(9000 + Math.random() * 2000);
    pos.set([v.x, v.y, v.z], i * 3);
    const c = new THREE.Color().setHSL(Math.random() < 0.3 ? 0.6 : 0.1, 0.5, 0.75 + Math.random() * 0.25);
    col.set([c.r, c.g, c.b], i * 3);
  }
  const sg = new THREE.BufferGeometry();
  sg.setAttribute('position', new THREE.BufferAttribute(pos, 3));
  sg.setAttribute('color', new THREE.BufferAttribute(col, 3));
  const stars = new THREE.Points(sg, new THREE.PointsMaterial({ size: 2.6, sizeAttenuation: false, vertexColors: true, fog: false, depthWrite: false }));
  scene.add(sky, stars);
  scene.add(new THREE.HemisphereLight('#9fb4ff', '#3a2a55', dark ? 0.45 : 1.15));
  const sun = new THREE.DirectionalLight('#fff0d8', dark ? 1 : 2.6);
  sun.position.set(0.6, 0.5, 0.7);
  scene.add(sun);
  const sunGlow = glowSprite('#ffe9b0', 2400);
  sunGlow.position.set(5200, 3600, 5600);
  if (!dark) scene.add(sunGlow);
  addFlashLights(scene, 3);
  const follow = (camPos) => { sky.position.copy(camPos); stars.position.copy(camPos); };
  return { sky, stars, sun, follow };
}

/** La Estación Oscura: esfera con paneles, trinchera, plato del superláser y bahía de hangar iluminada. */
export function buildStation(R = 520) {
  const g = new THREE.Group();
  const tex = plateTex(false, [16, 8]);
  const sphere = new THREE.Mesh(new THREE.SphereGeometry(R, 72, 44), new THREE.MeshStandardMaterial({ color: '#b5bbc4', map: tex, roughness: 0.75, metalness: 0.35, emissive: '#fff3c4', emissiveMap: tex, emissiveIntensity: 0.32 }));
  const trench = new THREE.Mesh(new THREE.TorusGeometry(R, 6, 6, 140), new THREE.MeshStandardMaterial({ color: '#23262c', roughness: 1 }));
  trench.rotation.x = Math.PI / 2;
  const dish = new THREE.Mesh(new THREE.SphereGeometry(R * 0.27, 36, 18, 0, Math.PI * 2, 0, Math.PI * 0.36), new THREE.MeshStandardMaterial({ color: '#6c727a', roughness: 0.9, side: THREE.DoubleSide, emissive: '#2c3a30', emissiveIntensity: 0.3 }));
  dish.position.set(0, R * 0.5, -R * 0.8);
  dish.lookAt(0, R, -R * 1.6);
  dish.rotateX(Math.PI / 2);
  const eye = glowSprite('#76ff03', 120);
  eye.position.set(0, R * 0.52, -R * 0.86);
  g.add(sphere, trench, dish, eye);
  g.userData = { R, eye };
  return g;
}

export function buildSpace() {
  const scene = new THREE.Scene();
  const bd = addSpaceBackdrop(scene);
  const planet = new THREE.Mesh(new THREE.SphereGeometry(1500, 48, 32), new THREE.MeshStandardMaterial({ color: '#c58b4a', roughness: 1, emissive: '#3e2410', emissiveIntensity: 0.5 }));
  planet.position.set(-3600, -1700, -1700);
  const atm = new THREE.Mesh(new THREE.SphereGeometry(1560, 32, 20), glowMat('#ffb36a', 0.14));
  atm.position.copy(planet.position);
  scene.add(planet, atm);
  const station = buildStation();
  station.position.set(0, 0, -3200);
  scene.add(station);
  return { scene, station, planet, follow: bd.follow };
}

// ================================================================================ Hangar ==========
export function buildHangar() {
  const scene = new THREE.Scene();
  scene.background = new THREE.Color('#06080d');
  scene.fog = new THREE.Fog('#070a12', 70, 230);
  const root = new THREE.Group();
  scene.add(root);
  const floorTex = plateTex(true, [10, 10]);
  const wallTex = plateTex(true, [12, 2]);
  const floorM = new THREE.MeshStandardMaterial({ map: floorTex, color: '#8d96a3', roughness: 0.55, metalness: 0.55 });
  const wallM = new THREE.MeshStandardMaterial({ map: wallTex, color: '#7a8492', roughness: 0.8, metalness: 0.4 });
  const W = 36, ZN = -72, ZS = 36, Hh = 26;
  box(root, W * 2, 1, ZS - ZN, floorM, 0, -0.5, (ZS + ZN) / 2);
  box(root, W * 2, 1, ZS - ZN, mat('#20252d'), 0, Hh + 0.5, (ZS + ZN) / 2);
  for (const s of [-1, 1]) box(root, 1, Hh, ZS - ZN, wallM, s * (W + 0.5), Hh / 2, (ZS + ZN) / 2);
  // Pared norte con puerta al pasillo; pared sur con la gran abertura al espacio
  for (const s of [-1, 1]) box(root, W - 7, Hh, 1, wallM, s * (7 + (W - 7) / 2), Hh / 2, ZN - 0.5);
  box(root, 14, Hh - 12, 1, wallM, 0, 12 + (Hh - 12) / 2, ZN - 0.5);
  for (const s of [-1, 1]) box(root, W - 22, Hh, 1, wallM, s * (22 + (W - 22) / 2), Hh / 2, ZS + 0.5);
  box(root, 44, Hh - 18, 1, wallM, 0, 18 + (Hh - 18) / 2, ZS + 0.5);
  // Campo de fuerza azul en la abertura
  const ff = new THREE.Mesh(new THREE.PlaneGeometry(44, 18), new THREE.MeshBasicMaterial({ color: '#4fc3f7', transparent: true, opacity: 0.16, side: THREE.DoubleSide, depthWrite: false, blending: THREE.AdditiveBlending }));
  ff.position.set(0, 9, ZS + 0.4);
  root.add(ff);
  // Espacio y estrellas tras la abertura
  const space = addSpaceBackdrop(scene);
  scene.fog.color.set('#070a12');
  scene.add(new THREE.AmbientLight('#a8b8d8', 1.5));
  // Franjas de luz del techo
  const strip = emissive('#e1f5fe', 1.3);
  for (let z = ZN + 8; z < ZS; z += 16) for (const x of [-22, 0, 22]) box(root, 2.2, 0.3, 11, strip, x, Hh - 0.2, z);
  // Guías luminosas del suelo
  box(root, 0.5, 0.05, ZS - ZN - 10, emissive('#29b6f6', 1.1), -9, 0.03, (ZS + ZN) / 2);
  box(root, 0.5, 0.05, ZS - ZN - 10, emissive('#29b6f6', 1.1), 9, 0.03, (ZS + ZN) / 2);
  // Columnas con luces rojas
  const colliders = [];
  for (const s of [-1, 1]) for (let z = 20; z > ZN; z -= 20) {
    box(root, 3.4, Hh, 3.4, mat('#4a525d', { metal: 0.6, rough: 0.5 }), s * 30, Hh / 2, z);
    box(root, 3.6, 0.7, 3.6, emissive('#ff1744', 1.2), s * 30, 6, z);
    box(root, 3.6, 0.7, 3.6, emissive('#ff1744', 1.2), s * 30, 17, z);
    colliders.push({ x: s * 30, z, r: 2.4 });
  }
  // Cajas de cobertura
  for (const [x, z] of [[-14, -4], [12, -10], [-4, -30], [18, -34], [-20, -46], [6, -52], [26, -20], [-26, -26]]) {
    box(root, 5, 2.8, 5, mat('#59616c', { metal: 0.6, rough: 0.55 }), x, 1.4, z, rand(0, 1));
    box(root, 5.1, 0.25, 5.1, emissive('#ffa000', 0.9), x, 2.85, z);
    colliders.push({ x, z, r: 3.1 });
  }
  // Cazas aparcados en el fondo
  for (const [x, z, ry] of [[-22, -62, 0.4], [22, -62, -0.4], [-8, -66, 0]]) {
    const t = buildEnemy();
    t.position.set(x, 5.5, z);
    t.rotation.y = ry;
    t.userData.halo.visible = false;
    box(root, 0.8, 5, 0.8, '#37474f', x, 2.5, z);
    root.add(t);
  }
  // Pasillo norte hasta la compuerta sellada
  const cz0 = ZN, cz1 = -150;
  box(root, 14, 1, cz0 - cz1, floorM, 0, -0.5, (cz0 + cz1) / 2);
  box(root, 14, 1, cz0 - cz1, mat('#20252d'), 0, 12.5, (cz0 + cz1) / 2);
  for (const s of [-1, 1]) box(root, 1, 13, cz0 - cz1, wallM, s * 7.5, 6, (cz0 + cz1) / 2);
  for (let z = cz0 - 8; z > cz1; z -= 14) { box(root, 12, 0.3, 1.6, strip, 0, 12.2, z); box(root, 0.3, 4, 1, emissive('#ff1744', 1), -6.9, 6, z); box(root, 0.3, 4, 1, emissive('#ff1744', 1), 6.9, 6, z); }
  const door = box(root, 14, 13, 1.6, mat('#3a1b1b', { metal: 0.7 }), 0, 6, -142);
  const doorGlow = box(root, 10, 0.8, 1.7, emissive('#ff1744', 1.6), 0, 6, -142);
  // Luces
  for (const [x, y, z, c, i] of [[0, 20, -10, '#dfe9ff', 2.4], [0, 20, -50, '#dfe9ff', 2.4], [-26, 8, -30, '#ff3b30', 1.2], [26, 8, -30, '#ff3b30', 1.2], [0, 9, 28, '#4fc3f7', 1.8], [0, 8, -110, '#ff6659', 1.2]]) {
    const l = new THREE.PointLight(c, i * 30, 90, 1.2);
    l.position.set(x, y, z);
    scene.add(l);
  }
  const state = { doorOpen: false };
  scene.userData.state = state;
  scene.userData.anim = (t) => {
    ff.material.opacity = 0.13 + Math.sin(t * 3) * 0.03;
    doorGlow.material.emissiveIntensity = state.doorOpen ? 0 : 1.2 + Math.sin(t * 5) * 0.5;
    door.position.y = state.doorOpen ? Math.min(door.position.y + 0.25, 19) : 6;
    if (state.doorOpen) doorGlow.material.emissive.set('#00e676');
  };
  const bounds = (p) => {
    if (p.z > ZN + 0.5) { p.x = clamp(p.x, -W + 1.5, W - 1.5); p.z = Math.min(p.z, ZS - 1.5); }
    else { p.x = clamp(p.x, -6, 6); p.z = Math.max(p.z, state.doorOpen ? -148 : -139); }
  };
  return {
    scene, bounds, colliders, ceiling: Hh - 1.5, follow: space.follow, state, W, ZN, ZS,
    spawns: [[0, -64], [-22, -56], [22, -56], [-30, -40], [30, -40], [-34, -10], [34, -10], [0, -50]],
    triggerZ: -136,
  };
}

// ================================================================================== Núcleo ==========
export function buildCore() {
  const scene = new THREE.Scene();
  scene.background = new THREE.Color('#05070d');
  scene.fog = new THREE.Fog('#05070d', 60, 260);
  scene.add(new THREE.AmbientLight('#9db0d6', 1.4));
  const root = new THREE.Group();
  scene.add(root);
  const R = 46, Hh = 64;
  const floorM = new THREE.MeshStandardMaterial({ map: plateTex(true, [8, 8]), color: '#8590a0', roughness: 0.5, metalness: 0.6 });
  const wallM = new THREE.MeshStandardMaterial({ map: plateTex(true, [24, 4]), color: '#6e7886', roughness: 0.8, metalness: 0.4, side: THREE.BackSide });
  const floor = new THREE.Mesh(new THREE.CylinderGeometry(R, R, 1, 64), floorM);
  floor.position.y = -0.5;
  const walls = new THREE.Mesh(new THREE.CylinderGeometry(R, R, Hh, 64, 1, true), wallM);
  walls.position.y = Hh / 2;
  const ceil = new THREE.Mesh(new THREE.CylinderGeometry(R, R, 1, 64), mat('#1b1f26'));
  ceil.position.y = Hh;
  root.add(floor, walls, ceil);
  for (const rr of [10, 22, 34, 44]) { const r = new THREE.Mesh(new THREE.TorusGeometry(rr, 0.12, 6, 80).rotateX(Math.PI / 2), emissive('#29b6f6', 1.1)); r.position.y = 0.03; root.add(r); }
  // Ventanales rojos y luces en la pared
  for (let i = 0; i < 24; i++) {
    const a = (i / 24) * Math.PI * 2;
    const b = box(root, 1.2, 12, 0.4, emissive(i % 3 === 0 ? '#ff1744' : '#4fc3f7', 1), Math.sin(a) * (R - 0.4), 14, Math.cos(a) * (R - 0.4));
    b.rotation.y = a + Math.PI;
  }
  // Generador magnético: anillos que giran, esfera de energía y campo
  const C = new THREE.Vector3(0, 20, -26);
  const core = new THREE.Group();
  core.position.copy(C);
  const ringA = new THREE.Mesh(new THREE.TorusGeometry(16, 1.4, 16, 72), new THREE.MeshStandardMaterial({ color: '#4a5560', metalness: 0.8, roughness: 0.3, emissive: '#2979ff', emissiveIntensity: 0.5 }));
  const ringB = new THREE.Mesh(new THREE.TorusGeometry(11.5, 0.9, 12, 60), new THREE.MeshStandardMaterial({ color: '#37424c', metalness: 0.8, roughness: 0.3, emissive: '#00e5ff', emissiveIntensity: 0.8 }));
  const ringC = new THREE.Mesh(new THREE.TorusGeometry(16.9, 0.18, 8, 90), glowMat('#80d8ff', 0.9));
  const orb = new THREE.Mesh(new THREE.SphereGeometry(4.5, 24, 16), new THREE.MeshBasicMaterial({ color: '#e1f5fe' }));
  const orbGlow = glowSprite('#40c4ff', 34);
  const field = new THREE.Mesh(new THREE.CircleGeometry(11, 48), new THREE.MeshBasicMaterial({ color: '#29b6f6', transparent: true, opacity: 0.18, side: THREE.DoubleSide, depthWrite: false, blending: THREE.AdditiveBlending }));
  core.add(ringA, ringB, ringC, orb, orbGlow, field);
  root.add(core);
  // Pilares con bobinas y arcos eléctricos hacia el anillo
  const colliders = [];
  const pylons = [[-24, -14], [24, -14], [-24, -40], [24, -40]];
  for (const [x, z] of pylons) {
    cyl(root, 1.6, 2.2, Hh, mat('#3c4650', { metal: 0.7 }), x, Hh / 2, z, 12);
    const coil = new THREE.Mesh(new THREE.TorusGeometry(2.2, 0.35, 8, 20).rotateX(Math.PI / 2), emissive('#40c4ff', 1.3));
    coil.position.set(x, 22, z);
    root.add(coil);
    colliders.push({ x, z, r: 2.6 });
  }
  const arcs = [];
  for (const [x, z] of pylons) {
    const geo = new THREE.BufferGeometry().setAttribute('position', new THREE.BufferAttribute(new Float32Array(14 * 3), 3));
    const line = new THREE.Line(geo, new THREE.LineBasicMaterial({ color: '#b3e5fc', transparent: true, opacity: 0.9, blending: THREE.AdditiveBlending, depthWrite: false }));
    line.frustumCulled = false;
    root.add(line);
    arcs.push({ geo, from: new THREE.Vector3(x, 22, z) });
  }
  for (const [x, z] of [[-10, 10], [10, 6], [0, -2], [-16, -2], [16, -4], [-6, 22]]) {
    box(root, 4.5, 2.6, 4.5, mat('#59616c', { metal: 0.6 }), x, 1.3, z, rand(0, 1));
    box(root, 4.6, 0.25, 4.6, emissive('#ffa000', 0.9), x, 2.65, z);
    colliders.push({ x, z, r: 2.9 });
  }
  // Compuerta de la salida (este) y pasillo de huida
  const exitDoor = box(root, 1.6, 11, 11, mat('#3a1b1b', { metal: 0.7 }), R - 1.2, 5.5, 0);
  const exitGlow = box(root, 1.7, 0.8, 8, emissive('#ff1744', 1.4), R - 1.2, 5.5, 0);
  const cx0 = R - 2, cx1 = 160;
  box(root, cx1 - cx0, 1, 12, floorM, (cx0 + cx1) / 2, -0.5, 0);
  box(root, cx1 - cx0, 1, 12, mat('#1b1f26'), (cx0 + cx1) / 2, 12.5, 0);
  for (const s of [-1, 1]) box(root, cx1 - cx0, 13, 1, wallM.clone(), (cx0 + cx1) / 2, 6, s * 6.5).material.side = THREE.FrontSide;
  const strip = emissive('#e1f5fe', 1.2);
  const alarmLights = [];
  for (let x = cx0 + 8; x < cx1 - 10; x += 14) {
    box(root, 1.6, 0.3, 10, strip, x, 12.2, 0);
    alarmLights.push(box(root, 0.8, 0.8, 0.4, emissive('#ff1744', 1.4), x, 9, 5.9));
    alarmLights.push(box(root, 0.8, 0.8, 0.4, emissive('#ff1744', 1.4), x, 9, -5.9));
  }
  // Bahía del Halcón al final
  box(root, 40, 1, 40, floorM, cx1 + 18, -0.5, 0);
  box(root, 40, 1, 40, mat('#1b1f26'), cx1 + 18, 14, 0);
  box(root, 1, 14, 40, wallM.clone(), cx1 + 38, 6.5, 0).material.side = THREE.FrontSide;
  for (const s of [-1, 1]) box(root, 40, 14, 1, wallM.clone(), cx1 + 18, 6.5, s * 20).material.side = THREE.FrontSide;
  const falcon = buildFalcon();
  falcon.position.set(cx1 + 18, 1.9, 0);
  falcon.rotation.y = -Math.PI / 2;
  root.add(falcon);
  for (const [x, y, z, c, i] of [[0, 16, 20, '#dfe9ff', 2.2], [0, 20, -26, '#40c4ff', 4], [-30, 8, 0, '#4fc3f7', 1.5], [30, 8, 0, '#4fc3f7', 1.5], [cx1 + 10, 10, 0, '#dfe9ff', 2.2], [70, 10, 0, '#dfe9ff', 1.4], [130, 10, 0, '#dfe9ff', 1.4]]) {
    const l = new THREE.PointLight(c, i * 30, 110, 1.2);
    l.position.set(x, y, z);
    scene.add(l);
  }
  addFlashLights(scene, 3);
  const state = { doorOpen: false, hp: 100, alarm: false, spark: 0 };
  scene.userData.state = state;
  const jitterArc = (arc, to, k) => {
    const a = arc.geo.attributes.position;
    for (let i = 0; i < 14; i++) {
      const u = i / 13;
      const p = arc.from.clone().lerp(to, u);
      const j = Math.sin(u * Math.PI) * 2.2 * k;
      a.setXYZ(i, p.x + rand(-j, j), p.y + rand(-j, j), p.z + rand(-j, j));
    }
    a.needsUpdate = true;
  };
  scene.userData.anim = (t, dt) => {
    ringA.rotation.z += dt * (0.5 + (1 - state.hp / 100) * 0.4);
    ringB.rotation.z -= dt * 1.1;
    ringC.rotation.z += dt * 0.3;
    const pulse = 1 + Math.sin(t * 4) * 0.06;
    orb.scale.setScalar(pulse * (state.hp <= 0 ? 1.8 : 1));
    orbGlow.scale.setScalar(34 * pulse);
    field.material.opacity = 0.12 + Math.sin(t * 6) * 0.05;
    const unstable = 1 - state.hp / 100;
    ringA.material.emissiveIntensity = 0.5 + unstable * 1.4 + Math.sin(t * 20) * unstable * 0.4;
    ringA.material.emissive.set(state.hp < 34 ? '#ff6d00' : '#2979ff');
    for (const a of arcs) { a.geo.parent; jitterArc(a, C.clone().add(new THREE.Vector3(rand(-14, 14), rand(-14, 14), 0)), 0.4 + unstable * 1.6); }
    exitGlow.material.emissive.set(state.doorOpen ? '#00e676' : '#ff1744');
    exitDoor.position.y = state.doorOpen ? Math.min(exitDoor.position.y + 0.3, 17) : 5.5;
    for (const l of alarmLights) l.material.emissiveIntensity = state.alarm ? 0.4 + Math.abs(Math.sin(t * 6)) * 2.5 : 1.2;
  };
  const bounds = (p) => {
    if (state.doorOpen && p.x > 40 && Math.abs(p.z) < 5.6) {
      p.x = Math.min(p.x, cx1 + 30);
      p.z = clamp(p.z, p.x > cx1 ? -18 : -5.4, p.x > cx1 ? 18 : 5.4);
      return;
    }
    const r = Math.hypot(p.x, p.z);
    if (r > 44) { p.x *= 44 / r; p.z *= 44 / r; }
  };
  return {
    scene, bounds, colliders, ceiling: 58, state, center: C, falcon, cx1,
    spawns: [[-40, -10], [40, -14], [-30, -36], [30, -36], [0, -44]],
    ringPlane: { z: C.z, c: C, r: 17.5 },
  };
}

// ================================================================================ Mundo de lava ==========
export function buildLava() {
  const scene = new THREE.Scene();
  scene.background = new THREE.Color('#2b0d08');
  scene.fog = new THREE.Fog('#3a1208', 90, 520);
  const root = new THREE.Group();
  scene.add(root);
  scene.add(new THREE.HemisphereLight('#ffa070', '#3a1208', 1.8));
  scene.add(new THREE.AmbientLight('#ff8a5a', 1.1));
  const sun = new THREE.DirectionalLight('#ffc08a', 3.6);
  sun.position.set(-60, 40, 50);
  scene.add(sun);
  // Cielo rojizo con ceniza
  const sky = new THREE.Mesh(new THREE.SphereGeometry(1500, 24, 14), new THREE.MeshBasicMaterial({
    map: canvasTex(16, 256, (g, w, hh) => { const gr = g.createLinearGradient(0, 0, 0, hh); gr.addColorStop(0, '#1a0604'); gr.addColorStop(0.55, '#5c1a0a'); gr.addColorStop(0.85, '#ff7a30'); gr.addColorStop(1, '#ffb060'); g.fillStyle = gr; g.fillRect(0, 0, w, hh); }),
    side: THREE.BackSide, fog: false, depthWrite: false,
  }));
  scene.add(sky);
  // Suelo de la arena (basalto con grietas de lava)
  const rockTex = canvasTex(512, 512, (g) => {
    g.fillStyle = '#1d1816'; g.fillRect(0, 0, 512, 512);
    for (let i = 0; i < 400; i++) { const v = 22 + Math.random() * 30; g.fillStyle = `rgb(${v},${v - 4},${v - 6})`; g.fillRect(Math.random() * 512, Math.random() * 512, 10 + Math.random() * 50, 8 + Math.random() * 30); }
    g.strokeStyle = '#ff6a1a'; g.lineWidth = 2.5; g.shadowColor = '#ff4a00'; g.shadowBlur = 8;
    for (let i = 0; i < 16; i++) { g.beginPath(); let x = Math.random() * 512, y = Math.random() * 512; g.moveTo(x, y); for (let k = 0; k < 8; k++) { x += rand(-50, 50); y += rand(-50, 50); g.lineTo(x, y); } g.stroke(); }
  }, [6, 6]);
  const R = 48;
  const arena = new THREE.Mesh(new THREE.CylinderGeometry(R, R + 2, 6, 64), new THREE.MeshStandardMaterial({ map: rockTex, color: '#a09088', roughness: 0.95 }));
  arena.position.y = -3;
  arena.receiveShadow = true;
  root.add(arena);
  // Lago de lava
  const lavaTex = canvasTex(256, 256, (g) => {
    g.fillStyle = '#d63a08'; g.fillRect(0, 0, 256, 256);
    for (let i = 0; i < 90; i++) { const r = rand(10, 46); const gr = g.createRadialGradient(0, 0, 0, 0, 0, r); gr.addColorStop(0, i % 3 ? '#ffd24a' : '#ff9a1a'); gr.addColorStop(1, '#d63a0800'); g.save(); g.translate(Math.random() * 256, Math.random() * 256); g.fillStyle = gr; g.fillRect(-r, -r, r * 2, r * 2); g.restore(); }
    for (let i = 0; i < 40; i++) { g.fillStyle = 'rgba(30,8,4,.6)'; g.fillRect(Math.random() * 256, Math.random() * 256, rand(6, 28), rand(3, 10)); }
  }, [26, 26]);
  const lava = new THREE.Mesh(new THREE.PlaneGeometry(1600, 1600).rotateX(-Math.PI / 2), new THREE.MeshStandardMaterial({ map: lavaTex, color: '#ffffff', emissive: '#ff5a10', emissiveMap: lavaTex, emissiveIntensity: 1.1, roughness: 0.6 }));
  lava.position.y = -2.6;
  root.add(lava);
  // Volcán y montañas
  const rng = mulberry32(88);
  const volcano = new THREE.Mesh(new THREE.ConeGeometry(140, 200, 28, 1, true), new THREE.MeshStandardMaterial({ color: '#2a1b17', roughness: 1 }));
  volcano.position.set(-170, 90, -300);
  root.add(volcano);
  const crater = glowSprite('#ff7a1a', 230);
  crater.position.set(-170, 196, -300);
  root.add(crater);
  for (let i = 0; i < 26; i++) {
    const a = rng() * Math.PI * 2, d = 200 + rng() * 360, s = 30 + rng() * 80;
    const m = new THREE.Mesh(new THREE.ConeGeometry(s, s * 1.6, 7), new THREE.MeshStandardMaterial({ color: '#241814', roughness: 1 }));
    m.position.set(Math.cos(a) * d, s * 0.7 - 6, Math.sin(a) * d);
    root.add(m);
  }
  // Pilares de roca en el borde de la arena
  const colliders = [];
  for (let i = 0; i < 12; i++) {
    const a = (i / 12) * Math.PI * 2 + 0.2, s = 2.4 + rng() * 2;
    const m = new THREE.Mesh(new THREE.ConeGeometry(s, 9 + rng() * 10, 6), new THREE.MeshStandardMaterial({ color: '#2b211d', roughness: 1 }));
    m.position.set(Math.cos(a) * (R - 3), 4.5, Math.sin(a) * (R - 3));
    m.castShadow = true;
    root.add(m);
    colliders.push({ x: m.position.x, z: m.position.z, r: s * 0.8 });
  }
  for (let i = 0; i < 9; i++) {
    const a = rng() * Math.PI * 2, d = 12 + rng() * 26, s = 1.5 + rng() * 2.4;
    const m = new THREE.Mesh(new THREE.DodecahedronGeometry(s), new THREE.MeshStandardMaterial({ color: '#312621', roughness: 1 }));
    m.position.set(Math.cos(a) * d, s * 0.5, Math.sin(a) * d);
    root.add(m);
    colliders.push({ x: m.position.x, z: m.position.z, r: s * 0.95 });
  }
  // El Halcón estrellado
  const wreck = buildFalcon();
  wreck.position.set(-30, 1.2, 20);
  wreck.rotation.set(0.12, 0.7, -0.25);
  wreck.userData.setEngine(0);
  root.add(wreck);
  colliders.push({ x: -30, z: 20, r: 6.5 });
  // Luces de lava y ascuas
  const glowLights = [];
  for (const [x, z] of [[60, 0], [-20, 62], [20, -62]]) {
    const l = new THREE.PointLight('#ff6a1a', 90, 150, 1.2);
    l.position.set(x, 4, z);
    scene.add(l);
    glowLights.push(l);
  }
  addFlashLights(scene, 3);
  const nEmbers = 700, ep = new Float32Array(nEmbers * 3);
  for (let i = 0; i < nEmbers; i++) ep.set([rand(-120, 120), rand(0, 70), rand(-120, 120)], i * 3);
  const eg = new THREE.BufferGeometry();
  eg.setAttribute('position', new THREE.BufferAttribute(ep, 3));
  const embers = new THREE.Points(eg, new THREE.PointsMaterial({ color: '#ff9a40', size: 0.5, transparent: true, opacity: 0.85, blending: THREE.AdditiveBlending, depthWrite: false }));
  embers.frustumCulled = false;
  root.add(embers);
  const smokeT = { v: 0 };
  scene.userData.anim = (t, dt, fx) => {
    lavaTex.offset.set(t * 0.012, t * 0.007);
    glowLights.forEach((l, i) => { l.intensity = 90 + Math.sin(t * 3 + i * 2) * 20; });
    const a = eg.attributes.position;
    for (let i = 0; i < nEmbers; i++) {
      let y = a.getY(i) + dt * (1.4 + (i % 5) * 0.6);
      let x = a.getX(i) + Math.sin(t + i) * dt * 1.4;
      if (y > 70) { y = 0; x = rand(-120, 120); }
      a.setXYZ(i, x, y, a.getZ(i));
    }
    a.needsUpdate = true;
    smokeT.v -= dt;
    if (smokeT.v < 0 && fx) { smokeT.v = 0.35; fx.smoke(new THREE.Vector3(-28, 3.2, 19), 1, '#222'); }
  };
  const bounds = (p) => { const r = Math.hypot(p.x, p.z); if (r > R - 2.5) { p.x *= (R - 2.5) / r; p.z *= (R - 2.5) / r; } };
  return { scene, bounds, colliders, ceiling: 99, R, wreck, lava, lavaY: -2.6 };
}

// ============================================================================== Planeta hogar ==========
export function buildHome() {
  const scene = new THREE.Scene();
  scene.background = new THREE.Color('#f3b57a');
  scene.fog = new THREE.Fog('#f0b27a', 120, 900);
  const root = new THREE.Group();
  scene.add(root);
  scene.add(new THREE.HemisphereLight('#ffe2b8', '#8a5a34', 1.3));
  const sun = new THREE.DirectionalLight('#fff0d0', 3);
  sun.position.set(-80, 60, -120);
  scene.add(sun);
  const sky = new THREE.Mesh(new THREE.SphereGeometry(2200, 24, 14), new THREE.MeshBasicMaterial({
    map: canvasTex(16, 256, (g, w, hh) => { const gr = g.createLinearGradient(0, 0, 0, hh); gr.addColorStop(0, '#3a2f6b'); gr.addColorStop(0.45, '#c46a6a'); gr.addColorStop(0.8, '#ffb870'); gr.addColorStop(1, '#ffd9a0'); g.fillStyle = gr; g.fillRect(0, 0, w, hh); }),
    side: THREE.BackSide, fog: false, depthWrite: false,
  }));
  scene.add(sky);
  const sunDisc = glowSprite('#fff1c4', 420);
  sunDisc.position.set(-500, 120, -1000);
  scene.add(sunDisc);
  const sandTex = canvasTex(256, 256, (g) => { g.fillStyle = '#d8b07a'; g.fillRect(0, 0, 256, 256); for (let i = 0; i < 900; i++) { g.fillStyle = `rgba(${150 + Math.random() * 60},${110 + Math.random() * 40},70,.25)`; g.fillRect(Math.random() * 256, Math.random() * 256, 3, 2); } }, [60, 60]);
  const ground = new THREE.Mesh(new THREE.PlaneGeometry(3000, 3000).rotateX(-Math.PI / 2), new THREE.MeshStandardMaterial({ map: sandTex, roughness: 1 }));
  ground.position.y = -0.05;
  ground.receiveShadow = true;
  root.add(ground);
  const rng = mulberry32(5);
  for (let i = 0; i < 40; i++) {
    const a = rng() * Math.PI * 2, d = 90 + rng() * 500, s = 20 + rng() * 60;
    const m = new THREE.Mesh(new THREE.SphereGeometry(1, 16, 10), new THREE.MeshStandardMaterial({ color: '#d2a56c', roughness: 1 }));
    m.scale.set(s, s * 0.22, s * 0.8);
    m.position.set(Math.cos(a) * d, 0, Math.sin(a) * d);
    root.add(m);
  }
  // Pista de aterrizaje
  const pad = cyl(root, 18, 18, 0.4, mat('#5e6670', { metal: 0.5 }), 0, 0.15, 0, 40);
  cyl(root, 17, 17, 0.45, mat('#39414a', { metal: 0.5 }), 0, 0.16, 0, 40);
  for (let i = 0; i < 20; i++) { const a = (i / 20) * Math.PI * 2; box(root, 0.8, 0.2, 0.8, emissive(i % 2 ? '#4fc3f7' : '#ffd54f', 1.3), Math.sin(a) * 17.5, 0.4, Math.cos(a) * 17.5); }
  // Base rebelde
  const wallM = mat('#c9b08a', { rough: 0.9, metal: 0.05 });
  for (const [x, z, w, d, hh] of [[-46, -30, 22, 16, 9], [-30, -52, 18, 14, 7], [40, -40, 26, 18, 11], [58, -14, 16, 16, 8], [-52, 6, 14, 20, 8]]) {
    box(root, w, hh, d, wallM, x, hh / 2, z);
    box(root, w + 1, 0.8, d + 1, '#8d7a5d', x, hh + 0.4, z);
    box(root, w * 0.5, 0.5, 0.2, emissive('#4fc3f7', 1), x, hh * 0.55, z + d / 2 + 0.05);
  }
  for (const [x, z] of [[-60, -44], [46, -56], [28, 36]]) { cyl(root, 0.4, 0.6, 28, '#cfd8dc', x, 14, z); box(root, 5, 0.4, 0.4, '#cfd8dc', x, 22, z); root.add(glowSprite('#ff5252', 3).translateX(x).translateY(28.5).translateZ(z)); }
  // Estandartes
  for (const s of [-1, 1]) { cyl(root, 0.15, 0.15, 9, '#9e9e9e', s * 24, 4.5, 14); box(root, 0.2, 5, 3, emissive(s < 0 ? '#29b6f6' : '#ffd54f', 0.5), s * 24, 6.5, 15.6); }
  addFlashLights(scene, 3);
  // Multitud que aclama
  const crowd = [];
  const rr = mulberry32(31);
  for (let i = 0; i < 16; i++) {
    const m = new AvatarModel(randomAvatar(rr), { shadows: false });
    const a = new AvatarAnimator(m);
    const ang = Math.PI * (0.15 + 0.7 * (i / 15)) + Math.PI;
    const d = 24 + (i % 3) * 3.4;
    m.root.position.set(Math.cos(ang) * d + 6, 0, Math.sin(ang) * d * 0.9 + 4);
    m.root.rotation.y = Math.atan2(-m.root.position.x, -m.root.position.z);
    a.set(['cheer', 'wave', 'cheer', 'dance'][i % 4]);
    root.add(m.root);
    crowd.push(a);
  }
  scene.userData.anim = (t, dt) => { for (const a of crowd) a.update(dt, 0); };
  return { scene, bounds: () => {}, colliders: [], pad };
}
