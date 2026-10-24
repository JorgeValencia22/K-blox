// Genera la portada de un mapa oficial con el propio motor del juego:
// construye el mundo, coloca personajes característicos y una cámara bien elegida,
// y deja la imagen JPEG (base64) en #out para que la recoja scripts/covers.js.
import * as THREE from 'three';
import { getBuiltinWorld } from '../../../shared/worlds/index.js';
import { buildWorld } from '../world/worldBuilder.js';
import { Sky } from '../engine/sky.js';
import { AvatarModel } from '../avatar/avatarModel.js';
import { AvatarAnimator } from '../avatar/avatarAnimator.js';
import { randomAvatar } from '../../../shared/avatar.js';
import { mulberry32 } from '../../../shared/terrain.js';
import { buildAnimatronic } from '../game/fnaf.js';
import { buildTito, poseTito } from '../game/poppy.js';
import { PesadillaClient } from '../game/modes3.js';
import { nodePos } from '../../../shared/worlds/fnaf.js';
import { makeSaber } from '../game/galaxia.js';
import { DEFAULT_AVATAR } from '../../../shared/avatar.js';

const W = 960, H = 540;
const id = new URLSearchParams(location.search).get('w') || 'hangout';

// Cámara (pos, mira), hora del cielo, luz extra y personajes de cada portada
const SHOTS = {
  poppy: { pos: [3.4, 2.2, 86.2], look: [0, 3.1, 92], time: 0.02, extra: 0.5, tint: '#7e57c2' },
  fnaf: { pos: [0, 2.3, -11.5], look: [0, 1.9, -20], time: 0.02, extra: 0.45, tint: '#ffb74d' },
  camaleon: { pos: [8, 6, -66], look: [-3, 1, -82], time: 0.38, people: 5 },
  asalto: { pos: [16, 9, 20], look: [0, 2, 0], time: 0.42, people: 3 },
  pesadilla: { pos: [-1.5, 1.7, 23.5], look: [-1.5, 1.9, 14], time: 0.02, extra: 0.4, tint: '#5c6bc0' },
  desastres: { pos: [26, 80, 32], look: [-6, 76, -8], time: 0.4, people: 6 },
  huerto: { pos: [14, 7, 18], look: [0, 1, 0], time: 0.34, people: 3 },
  bloques: { pos: [22, 44, -18], look: [-4, 29, -40], time: 0.38, people: 6 },
  city: { pos: [55, 45, 75], look: [0, 8, 0], time: 0.3 },
  obby: { pos: [14, 28, 18], look: [0, 22, -30], time: 0.32, people: 2 },
  racing: { pos: [140, 14, 32], look: [123, 0, 5], time: 0.38 },
  survival: { pos: [16, 14, 22], look: [2, 6, 4], time: 0.86, extra: 0.3, tint: '#ff8a65', people: 3 },
  hangout: { pos: [0, 11, 36], look: [0, 2, 2], time: 0.72, people: 8 },
  onlyup: { pos: [20, 6, 26], look: [0, 50, 0], time: 0.36, people: 1 },
  keys: { pos: [0, 9, 38], look: [0, 3, 0], time: 0.8, people: 3 },
  horror: { pos: [-58, 2.2, 71], look: [-58, 2, 62], time: 0.02, extra: 0.35, tint: '#7e57c2' },
  royale: { pos: [45, 42, 45], look: [0, 6, 0], time: 0.42, people: 4 },
  rocket: { pos: [0, 32, 62], look: [0, 0, 0], time: 0.45 },
  castores: { pos: [14, 10, 54], look: [0, 1, 30], time: 0.62, people: 3 },
  galaxia: { pos: [69.6, 2.6, 6.2], look: [69.6, 2.3, 0], time: 0.7 },
};

async function main() {
  const shot = SHOTS[id] || { pos: [20, 15, 20], look: [0, 2, 0], time: 0.35 };
  const world = getBuiltinWorld(id);
  const renderer = new THREE.WebGLRenderer({ antialias: true, preserveDrawingBuffer: true });
  renderer.setSize(W, H);
  renderer.setPixelRatio(1);
  renderer.shadowMap.enabled = true;
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  document.body.appendChild(renderer.domElement);
  const scene = new THREE.Scene();
  const camera = new THREE.PerspectiveCamera(55, W / H, 0.1, 1200);
  const sky = new Sky(scene, { fog: world.sky?.fog !== false });
  sky.drawDistance = 600;
  const built = buildWorld(world, { shadows: true });
  scene.add(built.group);
  const look = new THREE.Vector3(...shot.look);
  camera.position.set(...shot.pos);
  camera.lookAt(look);
  sky.update(0.016, look, shot.time);
  if (scene.fog) { scene.fog.near = 30; scene.fog.far = 500; }
  // Luces del mundo (bombillas, farolas) cercanas a lo que se ve
  for (const s of built.lightSpots.slice(0, 400)) {
    if (Math.hypot(s.x - look.x, s.z - look.z) > 45) continue;
    const l = new THREE.PointLight(s.color, (s.intensity ?? 1.5) * 6, s.range ?? 14, 1.6);
    l.position.set(s.x, s.y, s.z);
    scene.add(l);
  }
  if (shot.extra) {
    // Mundos oscuros: luz ambiental de color para que se vea el ambiente
    scene.add(new THREE.HemisphereLight(shot.tint, '#000000', shot.extra));
    if (scene.fog) { scene.fog.color.set('#05050a'); scene.fog.near = 6; scene.fog.far = 60; }
  }

  // Personajes característicos
  const rnd = mulberry32(id.length * 97 + 13);
  if (id === 'fnaf') {
    for (const a of ['bunny', 'bear', 'chicken']) {
      const m = buildAnimatronic(a);
      const [x, y, z, ry] = nodePos('stage', a);
      m.root.position.set(x, y, z);
      m.root.rotation.y = (ry * Math.PI) / 180 * 0.5;
      m.eyeMat.emissiveIntensity = 1.5;
      m.head.rotation.z = a === 'bunny' ? 0.25 : a === 'chicken' ? -0.15 : 0;
      scene.add(m.root);
    }
    const spot = new THREE.SpotLight('#ffcc80', 160, 30, 0.6, 0.6, 1.4);
    spot.position.set(0, 4.4, -13);
    spot.target.position.set(0, 1.5, -20);
    scene.add(spot, spot.target);
  }
  if (id === 'poppy') {
    const t = buildTito();
    t.root.position.set(0, 0.5, 92);
    t.root.rotation.y = Math.atan2(camera.position.x, camera.position.z - 92);
    poseTito(t, 'peek', 1.2);
    scene.add(t.root);
    const spot = new THREE.SpotLight('#ce93d8', 140, 25, 0.5, 0.7, 1.4);
    spot.position.set(2, 6, 87);
    spot.target.position.set(0, 3, 92);
    scene.add(spot, spot.target);
  }
  if (id === 'galaxia') {
    // Duelo de sables: el Caballero Estelar contra Lord Vex
    for (const [x, ry, costume, color, pose] of [[67.9, Math.PI / 2 - 0.5, 'skin_starknight', '#29b6f6', 0.18], [71.3, -Math.PI / 2 + 0.5, 'skin_darklord', '#ff1744', 0.1]]) {
      const m = new AvatarModel({ ...DEFAULT_AVATAR, costume });
      const a = new AvatarAnimator(m);
      a.set('attack');
      for (let k = 0; k < 4; k++) a.update(pose / 4 * 2, 0);
      m.root.position.set(x, 1.2, 0);
      m.root.rotation.y = ry;
      const s = makeSaber(color);
      s.position.set(0, -0.72, 0.08);
      s.rotation.x = 1.9;
      m.rArm.add(s);
      const glow = new THREE.PointLight(color, 9, 7, 1.6);
      glow.position.set(x + (x < 69.6 ? 0.7 : -0.7), 2.6, 0.3);
      scene.add(m.root, glow);
    }
    const clash = new THREE.PointLight('#ffffff', 14, 6, 1.5);
    clash.position.set(69.6, 2.9, 0.2);
    scene.add(clash);
  }
  if (id === 'pesadilla') {
    const mon = PesadillaClient.prototype.buildMonster.call({});
    mon.root.position.set(-1.5, 0, 17);
    mon.root.rotation.y = 0;
    scene.add(mon.root);
    const red = new THREE.PointLight('#ff1744', 30, 14, 1.4);
    red.position.set(-1.5, 3, 20);
    scene.add(red);
  }
  if (id === 'horror') {
    const mon = PesadillaClient.prototype.buildMonster.call({});
    mon.root.position.set(-58, 0, 64);
    scene.add(mon.root);
    const moon = new THREE.PointLight('#b39ddb', 25, 30, 1.2);
    moon.position.set(-58, 5, 68);
    scene.add(moon);
  }
  if (id === 'desastres') {
    // Tornado y lluvia de meteoritos
    const tm = new THREE.MeshStandardMaterial({ color: '#78909c', transparent: true, opacity: 0.75, roughness: 1 });
    for (let i = 0; i < 9; i++) {
      const c = new THREE.Mesh(new THREE.CylinderGeometry(2 + i * 1.1, 1.4 + i * 1.1, 5, 16, 1, true), tm);
      c.position.set(-28 + Math.sin(i) * 1.5, 52 + i * 4.6, -26);
      scene.add(c);
    }
    for (const [x, y, z] of [[10, 100, -10], [-6, 110, 6], [22, 95, 4], [-16, 104, -6]]) {
      const m = new THREE.Mesh(new THREE.SphereGeometry(1.6, 12, 10), new THREE.MeshStandardMaterial({ color: '#ff6d00', emissive: '#ff3d00', emissiveIntensity: 2 }));
      m.position.set(x, y, z);
      scene.add(m);
      const tail = new THREE.Mesh(new THREE.ConeGeometry(1.3, 9, 10), new THREE.MeshBasicMaterial({ color: '#ffab40', transparent: true, opacity: 0.6 }));
      tail.position.set(x + 3, y + 5, z - 2);
      tail.rotation.z = 0.5;
      scene.add(tail);
      const l = new THREE.PointLight('#ff6d00', 60, 40, 1.4);
      l.position.set(x, y, z);
      scene.add(l);
    }
  }
  // Jugadores con avatares variados (aspecto de juego multijugador)
  const n = shot.people || 0;
  const anims = ['wave', 'dance', 'cheer', 'idle', 'robot', 'idle', 'dance', 'wave'];
  for (let i = 0; i < n; i++) {
    const m = new AvatarModel(randomAvatar(rnd));
    const a = new AvatarAnimator(m);
    const ang = (i / Math.max(1, n)) * Math.PI * 2 + rnd();
    const r = 2 + rnd() * 5;
    const x = look.x + Math.cos(ang) * r, z = look.z + Math.sin(ang) * r;
    const hit = built.physics.raycast(x, look.y + 30, z, 0, -1, 0, 80, 0.05);
    m.root.position.set(x, look.y + 30 - (hit.dist ?? 30), z);
    m.root.rotation.y = Math.atan2(camera.position.x - x, camera.position.z - z) + (rnd() - 0.5);
    a.set(anims[i % anims.length]);
    for (let k = 0; k < 20; k++) a.update(0.05, 0);
    scene.add(m.root);
  }

  // Dos pasadas para que carguen texturas y sombras
  renderer.render(scene, camera);
  await new Promise((r) => setTimeout(r, 300));
  renderer.render(scene, camera);
  document.getElementById('out').textContent = renderer.domElement.toDataURL('image/jpeg', 0.84);
  document.title = 'listo';
}

main().catch((e) => {
  document.getElementById('out').textContent = 'ERROR ' + (e.stack || e.message);
  document.title = 'error';
});
