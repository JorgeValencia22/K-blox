// Tomas para el material promocional, renderizadas con el motor real del juego
// (mundos, cielo, avatares, emotes, física, vehículos, animatrónicos, Tito…).
// La cámara y los controles son automáticos. El tiempo avanza a 30 FPS exactos y
// cada fotograma se envía a marketing-release/tools/capture.mjs.
import * as THREE from 'three';
import { getBuiltinWorld } from '../../../shared/worlds/index.js';
import { buildWorld } from '../world/worldBuilder.js';
import { Sky } from '../engine/sky.js';
import { AvatarModel } from '../avatar/avatarModel.js';
import { AvatarAnimator } from '../avatar/avatarAnimator.js';
import { randomAvatar } from '../../../shared/avatar.js';
import { mulberry32 } from '../../../shared/terrain.js';
import { LocalPlayer } from '../game/players.js';
import { Vehicle, driveGround } from '../game/vehicles.js';
import { buildAnimatronic } from '../game/fnaf.js';
import { buildTito, poseTito, handMesh } from '../game/poppy.js';
import { PesadillaClient } from '../game/modes3.js';
import { HorrorClient } from '../game/modes2.js';
import { nodePos, CAM_BY_ID, FNAF } from '../../../shared/worlds/fnaf.js';
import { trackPoint } from '../../../shared/worlds/racing.js';
import { impacts, riseLevel, tornadoAt } from '../../../shared/worlds/desastres.js';

// ?v=1: formato vertical 9:16 para TikTok / Reels / Shorts (fotogramas en <toma>_v)
const VERT = new URLSearchParams(location.search).get('v') === '1';
const W = VERT ? 1080 : 1920, H = VERT ? 1920 : 1080, FPS = 30;
const RECV = 'http://localhost:5199';
const params = new URLSearchParams(location.search);
const shotId = params.get('shot');
// ?still=<segundo>: solo guarda ese fotograma como PNG (capturas de pantalla sin pérdida)
const still = params.has('still') ? Number(params.get('still')) : null;
const log = (m) => fetch(`${RECV}/log?shot=${shotId}`, { method: 'POST', body: String(m) }).catch(() => {});

// alpha: las tomas sin fondo (scene.background null) salen transparentes, para recortar personajes
const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true, preserveDrawingBuffer: true, powerPreference: 'high-performance' });
renderer.setClearColor(0x000000, 0);
renderer.setSize(W, H);
renderer.setPixelRatio(1);
renderer.outputColorSpace = THREE.SRGBColorSpace;
renderer.toneMapping = THREE.ACESFilmicToneMapping;
renderer.toneMappingExposure = 1.05;
renderer.shadowMap.enabled = true;
renderer.shadowMap.type = THREE.PCFSoftShadowMap;
document.body.appendChild(renderer.domElement);
const out = document.createElement('canvas');
out.width = W; out.height = H;
const octx = out.getContext('2d');

// --- Utilidades --------------------------------------------------------------------
const v3 = (a) => new THREE.Vector3(...a);
const ease = (k) => k * k * (3 - 2 * k);
/** Camino de cámara suave por puntos (Catmull-Rom). */
const path = (pts) => new THREE.CatmullRomCurve3(pts.map(v3), false, 'centripetal');

function setupWorld(id, time, { fogNear = 40, fogFar = 600, lights = 40 } = {}) {
  const scene = new THREE.Scene();
  const world = getBuiltinWorld(id);
  const sky = new Sky(scene, { fog: world.sky?.fog !== false });
  sky.drawDistance = 700;
  const built = buildWorld(world, { shadows: true });
  scene.add(built.group);
  const ctx = { scene, world, sky, built, time, fogNear, fogFar, lightRadius: lights, lights: [] };
  return ctx;
}

/** Añade luces puntuales de las bombillas del mundo cercanas a `center`. */
function worldLights(ctx, center, { max = 10, groups = null, mult = 5 } = {}) {
  const spots = ctx.built.lightSpots
    .filter((s) => !groups || groups.includes(s.group))
    .map((s) => [Math.hypot(s.x - center[0], s.z - center[2]), s])
    .filter(([d]) => d < ctx.lightRadius).sort((a, b) => a[0] - b[0]).slice(0, max);
  for (const [, s] of spots) {
    const l = new THREE.PointLight(s.color, (s.intensity ?? 1.5) * mult, s.range ?? 14, 1.5);
    l.position.set(s.x, s.y, s.z);
    ctx.scene.add(l);
  }
}

function avatar(scene, data, pos, ry = 0, state = 'idle') {
  const model = new AvatarModel(data, { shadows: true });
  const anim = new AvatarAnimator(model);
  model.root.position.set(...pos);
  model.root.rotation.y = ry;
  anim.set(state);
  scene.add(model.root);
  return { model, anim };
}

const COOL = [
  { skin: '#f1c27d', hair: 'hair_messy', hairColor: '#4e342e', shirt: 'shirt_hoodie', shirtColor: '#212121', pants: 'pants_joggers', pantsColor: '#1a237e', shoesColor: '#fafafa', face: 'face_smile', accessories: ['acc_headphones'], accColors: { acc_headphones: '#00e676' }, effect: null },
  { skin: '#8d5524', hair: 'hair_afro', hairColor: '#212121', shirt: 'shirt_galaxy', shirtColor: '#7c4dff', pants: 'pants_stars', pantsColor: '#311b92', shoesColor: '#ffeb3b', face: 'face_stars', accessories: ['acc_crown', 'acc_wings'], accColors: { acc_crown: '#ffca28' }, effect: 'fx_sparkles' },
  { skin: '#ffdbac', hair: 'hair_pigtails', hairColor: '#ec407a', shirt: 'shirt_rainbow', shirtColor: '#f06292', pants: 'pants_tutu', pantsColor: '#f8bbd0', shoesColor: '#ffffff', face: 'face_hearts', accessories: ['acc_bunnyears', 'acc_pet'], accColors: {}, effect: 'fx_hearts' },
  { skin: '#e0ac69', hair: 'hair_spiky', hairColor: '#ff7043', shirt: 'shirt_flames', shirtColor: '#ff5722', pants: 'pants_cargo', pantsColor: '#37474f', shoesColor: '#212121', face: 'face_cool', accessories: ['acc_cap', 'acc_jetpack'], accColors: { acc_cap: '#e53935' }, effect: 'fx_fire' },
];

/**
 * Toma en órbita lenta alrededor de un punto del mapa (para el tutorial): parte de `pos`,
 * gira `sweep` radianes alrededor de `look` y coloca `people` avatares con emotes o caminando.
 */
function orbitShot(id, { pos, look, time, people = 0, dur = 6, sweep = 0.5, fogFar = 600, lightsAt = null, emotes = ['wave', 'cheer', 'dance', 'idle'] }) {
  return { dur, setup() {
    const c = setupWorld(id, time, { fogFar });
    const rnd = mulberry32(id.length * 7 + 3);
    const ppl = [];
    for (let i = 0; i < people; i++) {
      const a = (i / Math.max(1, people)) * Math.PI * 2, r = 2 + rnd() * 3;
      const walker = i % 3 === 2;
      const p = avatar(c.scene, i < 4 ? COOL[i] : randomAvatar(rnd), [look[0] + Math.cos(a) * r, look[1] - 1, look[2] + Math.sin(a) * r], rnd() * 6, walker ? 'walk' : emotes[i % emotes.length]);
      ppl.push({ ...p, walker, a, r });
    }
    if (lightsAt) worldLights(c, lightsAt, { max: 10 });
    const off = new THREE.Vector3(pos[0] - look[0], pos[1] - look[1], pos[2] - look[2]);
    const lk = v3(look);
    return { ...c,
      update: (t, dt) => ppl.forEach((p) => {
        if (p.walker) {
          const a = p.a + t * 0.35;
          p.model.root.position.set(lk.x + Math.cos(a) * p.r, p.model.root.position.y, lk.z + Math.sin(a) * p.r);
          p.model.root.rotation.y = -a;
          p.anim.update(dt, 4);
        } else p.anim.update(dt, 0);
        p.model.updateEffects(dt, p.walker);
      }),
      cam: (t, k) => [lk.clone().add(off.clone().applyAxisAngle(new THREE.Vector3(0, 1, 0), (ease(k) - 0.5) * sweep)), lk.clone()] };
  } };
}

/**
 * Desastre de "Desastres Naturales" con los mismos elementos que el juego (rocas con círculo de
 * aviso, lava que sube, tornado), un poco de luz en los impactos y temblor de cámara.
 * pov: un jugador con la física real corre y salta y la cámara le sigue en tercera persona.
 */
function disasterShot(kind, { pov = false, roofPov = false, lane = false, cam = null, look = [0, 2, 0], people = 0, t0 = 4, fling = false } = {}) {
  const c = setupWorld('desastres', kind === 'lava' ? 0.55 : 0.38, { fogFar: 500 });
  const sc = c.scene;
  const seed = 4242;
  const rnd = mulberry32(7);
  // Lava
  const lava = new THREE.Mesh(new THREE.PlaneGeometry(200, 200).rotateX(-Math.PI / 2), new THREE.MeshStandardMaterial({ color: '#ff3d00', emissive: '#ff6d00', emissiveIntensity: 1.2, roughness: 0.6 }));
  lava.visible = kind === 'lava';
  const lavaLight = new THREE.PointLight('#ff6d00', kind === 'lava' ? 60 : 0, 90, 1.2);
  sc.add(lava, lavaLight);
  // Tornado
  const tornado = new THREE.Group();
  const tm = new THREE.MeshStandardMaterial({ color: '#90a4ae', transparent: true, opacity: 0.55, depthWrite: false });
  for (let i = 0; i < 7; i++) { const cyl = new THREE.Mesh(new THREE.CylinderGeometry(2 + i * 1.6, 1.4 + i * 1.6, 5, 16, 1, true), tm); cyl.position.y = 2.5 + i * 5; tornado.add(cyl); }
  tornado.visible = kind === 'tornado';
  sc.add(tornado);
  // Meteoritos
  const rockMat = new THREE.MeshStandardMaterial({ color: '#5d4037', emissive: '#ff6d00', emissiveIntensity: 0.6 });
  const ringMat = new THREE.MeshBasicMaterial({ color: '#ff1744', transparent: true, opacity: 0.45, depthWrite: false });
  const trailMat = new THREE.MeshBasicMaterial({ color: '#ff6d00', transparent: true, opacity: 0.55, depthWrite: false });
  // Impactos: los del juego (misma función) y, en las tomas del carril, más cerca de la cámara
  const lanePts = Array.from({ length: 24 }, (_, i) => ({ t: (t0 + 0.4 + i * 0.42) * 1.6, x: -44 + i * 3.6 + (rnd() - 0.5) * 6, z: 12 + (rnd() < 0.5 ? -1 : 1) * (pov ? 9 + rnd() * 8 : 4 + rnd() * 7), r: 4.5 }));
  // En la toma del jugador, los impactos caen por delante de él (se ven llegar sin tapar la cámara)
  const aheadPts = Array.from({ length: 20 }, (_, i) => { const tt = 0.3 + i * 0.4; return { t: (t0 + tt) * 1.6, x: -44 + 8 * tt + 9 + rnd() * 10, z: 12 + (rnd() < 0.5 ? -1 : 1) * (4 + rnd() * 4), r: 4.5 }; });
  const list = kind === 'meteor' ? (pov ? aheadPts : lane ? lanePts : impacts('meteor', seed)) : [];
  const rocks = list.map(() => {
    const rock = new THREE.Mesh(new THREE.DodecahedronGeometry(1.2, 0), rockMat);
    const trail = new THREE.Mesh(new THREE.ConeGeometry(0.7, 6, 10, 1, true), trailMat);
    const ring = new THREE.Mesh(new THREE.RingGeometry(0.6, 1, 24).rotateX(-Math.PI / 2), ringMat);
    rock.add(trail); trail.position.set(2.2, 4.4, 0); trail.rotation.z = Math.atan2(6, 30) + Math.PI;
    rock.visible = ring.visible = false;
    sc.add(rock, ring);
    return { rock, ring };
  });
  const flash = new THREE.PointLight('#ffb74d', 0, 40, 1.4);
  sc.add(flash);
  // Gente
  const ppl = [];
  for (let i = 0; i < people; i++) {
    const a = rnd() * Math.PI * 2, r = 6 + rnd() * 14;
    const roof = kind === 'lava';
    const spots = [[-28, 5.6, -26], [26, 5.6, -28], [-30, 5.6, 24], [24, 5.6, 26], [0, 0.2, 6], [-24, 5.6, 21]];
    const pos = roof ? spots[i % spots.length] : lane ? [-36 + i * 4, 0.1, 12 + (i % 2 ? 2 : -2)] : [look[0] + Math.cos(a) * r, 0.1, (Array.isArray(look) ? look[2] : 0) + Math.sin(a) * r];
    ppl.push({ ...avatar(sc, i < 4 ? COOL[i] : randomAvatar(rnd), pos, rnd() * 6, roof ? ['cheer', 'wave', 'dance', 'jacks'][i % 4] : 'run'), a, r, roof });
  }
  // Jugador (pov)
  const player = pov ? new LocalPlayer(sc, COOL[3], [-44, 0.4, 12]) : null;
  const fwd = new THREE.Vector3(1, 0, 0);
  let camPos = null;
  let shake = 0;
  const camPath = cam ? path(cam) : null;
  return { ...c,
    update: (t, dt) => {
      const T = t0 + t; // segundos dentro del desastre
      if (kind === 'lava') { const y = riseLevel('lava', T); lava.position.y = y; lava.material.emissiveIntensity = 1 + Math.sin(t * 5) * 0.2; lavaLight.position.set(0, y + 6, 0); }
      if (kind === 'tornado') { const tc = tornadoAt(seed, T * 2.2); tornado.position.set(tc.x, 0, tc.z); tornado.rotation.y += dt * 4; }
      list.forEach((im, i) => {
        const d = im.t - T * 1.6, { rock, ring } = rocks[i];
        if (d > 0 && d < 2.6) {
          rock.visible = ring.visible = true;
          rock.position.set(im.x + d * 6, d * 30, im.z);
          rock.scale.setScalar(2.4); rock.rotation.x += dt * 4;
          ring.position.set(im.x, 0.08, im.z); ring.scale.setScalar(im.r * (1.2 - d * 0.15));
        } else { rock.visible = ring.visible = false; }
        if (d <= 0 && d > -dt * 1.6) { flash.position.set(im.x, 2, im.z); flash.intensity = 260; shake = Math.max(shake, 0.25); }
      });
      flash.intensity *= 0.82; shake *= 0.9;
      ppl.forEach((p, i) => {
        if (!p.roof && lane) {
          p.model.root.position.x = -36 + i * 4 + t * 7; p.model.root.rotation.y = Math.PI / 2; p.anim.update(dt, 7);
        } else if (!p.roof) {
          const a = p.a + t * 0.45;
          p.model.root.position.set(Math.cos(a) * p.r, 0.1, Math.sin(a) * p.r);
          p.model.root.rotation.y = -a;
          if (fling && i === 0) { const tc = tornado.position; const k = Math.min(1, Math.max(0, (t - 3) / 2.5)); p.model.root.position.lerp(new THREE.Vector3(tc.x, 4 + k * 26, tc.z), k); p.model.root.rotation.y += t * 8 * k; p.anim.set(k > 0 ? 'fall' : 'run'); }
          p.anim.update(dt, 7);
        } else p.anim.update(dt, 0);
        p.model.updateEffects(dt, !p.roof);
      });
      if (player) {
        const b = player.body;
        const jump = (t % 1.6) < 0.05;
        player.update(dt, { move: { x: Math.sin(t * 1.3) * 0.25, y: 1 }, run: false, jump, jumpHeld: jump, crouch: false, descend: false }, c.built.physics, fwd);
      }
    },
    cam: (t, k, dt) => {
      let p, l;
      if (player) {
        const b = player.body;
        const want = new THREE.Vector3(b.x - fwd.x * 5.5, b.y + 2.8, b.z - fwd.z * 5.5);
        if (!camPos) camPos = want.clone();
        camPos.lerp(want, Math.min(1, dt * 4));
        p = camPos.clone(); l = new THREE.Vector3(b.x + fwd.x * 4, b.y + (kind === 'meteor' ? 3 : 1), b.z + fwd.z * 4);
      } else if (roofPov) {
        const hero = ppl[0].model.root.position;
        p = new THREE.Vector3(hero.x + 3.2 - k * 0.8, hero.y + 2.6, hero.z + 5.5 - k);
        l = new THREE.Vector3(hero.x - 6, lava.position.y + 0.5, hero.z - 14);
      } else {
        p = camPath.getPoint(ease(k));
        l = look === 'tornado' ? tornado.position.clone().setY(12) : v3(look);
      }
      if (shake > 0.01) { p.x += (Math.random() - 0.5) * shake; p.y += (Math.random() - 0.5) * shake; }
      return [p, l];
    } };
}

// --- Tomas -----------------------------------------------------------------------------
const SHOTS = {
  // Tutorial: los seis juegos que faltaban (encuadres de las portadas, en órbita lenta)
  t_bloques: orbitShot('bloques', { pos: [22, 44, -18], look: [-4, 29, -40], time: 0.38, people: 6, emotes: ['jacks', 'cheer', 'dance', 'wave'] }),
  t_desastres: orbitShot('desastres', { pos: [26, 80, 32], look: [-6, 76, -8], time: 0.4, people: 6 }),
  t_desastres_isla: orbitShot('desastres', { pos: [55, 40, 70], look: [0, 4, 0], time: 0.42, sweep: 0.7 }),
  t_survival: orbitShot('survival', { pos: [16, 14, 22], look: [2, 6, 4], time: 0.86, people: 3, lightsAt: [5, 8, -5] }),
  t_camaleon: orbitShot('camaleon', { pos: [8, 6, -66], look: [-3, 1, -82], time: 0.38, people: 5 }),
  t_camaleon_mapa: orbitShot('camaleon', { pos: [14, 9, 2], look: [0, 1, -20], time: 0.4, people: 3, emotes: ['idle', 'point', 'idle'] }),
  t_castores: orbitShot('castores', { pos: [14, 10, 54], look: [0, 1, 30], time: 0.62, people: 3 }),
  t_castores_aserradero: orbitShot('castores', { pos: [22, 14, 30], look: [0, 3, 6], time: 0.6, sweep: 0.6 }),
  t_asalto: orbitShot('asalto', { pos: [16, 9, 20], look: [0, 2, 0], time: 0.42, people: 3 }),
  t_asalto_noche: orbitShot('asalto', { pos: [20, 12, 26], look: [0, 2, 0], time: 0.92, sweep: 0.6, lightsAt: [0, 2, 0] }),
  t_city_calle: orbitShot('city', { pos: [14, 6, 24], look: [0, 2, 0], time: 0.32, people: 4, sweep: 0.8 }),
  t_huerto: orbitShot('huerto', { pos: [14, 7, 18], look: [0, 1, 0], time: 0.34, people: 3, emotes: ['idle', 'wave', 'cheer'] }),
  t_royale_suelo: orbitShot('royale', { pos: [10, 4, 14], look: [0, 2, 0], time: 0.42, people: 3, sweep: 0.8 }),

  // Tutorial, controles: un avatar camina, corre y salta con la física real (cámara de tercera persona)
  ctl_walk: { dur: 9, warm: 0.5, setup() {
    const c = setupWorld('hangout', 0.4, { fogFar: 300 });
    const p = new LocalPlayer(c.scene, COOL[1], [0, 0.4, 14]);
    const fwd = new THREE.Vector3(0, 0, -1);
    let camPos = null;
    return { ...c,
      update: (t, dt) => {
        const run = t > 3 && t < 6.5;
        const jump = (t > 6.6 && t < 6.7) || (t > 7.8 && t < 7.9);
        const turn = Math.sin(t * 0.6) * 0.5;
        fwd.set(Math.sin(turn), 0, -Math.cos(turn));
        p.update(dt, { move: { x: 0, y: t > 0.3 ? 1 : 0 }, run, jump, jumpHeld: jump, crouch: false, descend: false }, c.built.physics, fwd);
      },
      cam: (t, k, dt) => {
        const b = p.body;
        const want = new THREE.Vector3(b.x - fwd.x * 6, b.y + 3, b.z - fwd.z * 6);
        if (!camPos) camPos = want.clone();
        camPos.lerp(want, Math.min(1, dt * 4));
        return [camPos.clone(), new THREE.Vector3(b.x + fwd.x * 3, b.y + 1.4, b.z + fwd.z * 3)];
      } };
  } },
  // Vista aérea de Isla Metrópolis (ciudad, montañas, río)
  city_aerial: { dur: 6, setup() {
    const c = setupWorld('city', 0.3, { fogFar: 900 });
    const cam = path([[190, 95, 40], [150, 80, 120], [70, 62, 170], [-20, 55, 175]]);
    const look = path([[0, 10, 0], [10, 8, -10], [20, 10, -20], [10, 12, -30]]);
    return { ...c, cam: (t, k) => [cam.getPoint(ease(k)), look.getPoint(ease(k))] };
  } },

  // Fiesta en La Plaza: personajes del juego con sus emotes en la pista de baile
  hangout_party: { dur: 6, setup() {
    const c = setupWorld('hangout', 0.64, { fogFar: 300 });
    const tiles = c.world.objects.filter((o) => o.dance);
    const cx = tiles.reduce((a, o) => a + o.p[0], 0) / tiles.length, cz = tiles.reduce((a, o) => a + o.p[2], 0) / tiles.length;
    const rnd = mulberry32(7);
    const emotes = ['dance', 'robot', 'floss', 'headbang', 'jacks', 'dance', 'floss', 'robot', 'dance', 'headbang'];
    const people = [];
    for (let i = 0; i < 10; i++) {
      const a = (i / 10) * Math.PI * 2, r = 1.5 + (i % 3) * 1.4;
      const data = i < 4 ? COOL[i] : randomAvatar(rnd);
      people.push(avatar(c.scene, data, [cx + Math.cos(a) * r, 0.1, cz + Math.sin(a) * r], rnd() * 6, emotes[i]));
    }
    worldLights(c, [cx, 0, cz], { max: 12 });
    for (const [x, col] of [[-1, '#ff4081'], [1, '#00e5ff']]) {
      const l = new THREE.PointLight(col, 60, 18, 1.4);
      l.position.set(cx + x * 5, 4, cz);
      c.scene.add(l);
      c.lights.push(l);
    }
    return { ...c, people,
      update: (t, dt) => {
        for (const p of people) { p.anim.update(dt, 0); p.model.updateEffects(dt, false); }
        c.lights.forEach((l, i) => { l.intensity = 40 + Math.sin(t * 6 + i * 2) * 30; });
      },
      cam: (t, k) => {
        const a = 0.6 + k * 1.1;
        return [new THREE.Vector3(cx + Math.cos(a) * 7.5, 2.5 + Math.sin(k * 3) * 0.3, cz + Math.sin(a) * 7.5), new THREE.Vector3(cx, 1.2, cz)];
      } };
  } },

  // Obby del Cielo: un personaje cruza los primeros saltos con la física real del juego
  obby_run: { dur: 6.5, warm: 0.6, setup() {
    const c = setupWorld('obby', 0.33, { fogFar: 700 });
    // Empieza en la primera plataforma (el cartel de salida tapa el borde del inicio)
    const plats = [[-2, -16], [2, -22], [-2, -28], [2, -34], [-2, -40], [2, -46], [0, -54]];
    const p = new LocalPlayer(c.scene, COOL[3], [-2, 20.4, -15]);
    let target = 1;
    let camPos = null;
    return { ...c,
      update: (t, dt) => {
        const b = p.body;
        const [tx, tz] = plats[Math.min(target, plats.length - 1)];
        const dx = tx - b.x, dz = tz - b.z, d = Math.hypot(dx, dz);
        if (d < 1.5 && b.onGround && target < plats.length - 1) target++;
        const fwd = new THREE.Vector3(dx / (d || 1), 0, dz / (d || 1));
        const curr = plats[target - 1];
        const fromCurr = Math.hypot(b.x - curr[0], b.z - curr[1]);
        const jump = b.onGround && fromCurr > 0.9 && d > 2.5; // caminando el salto alcanza ~6 m
        p.update(dt, { move: { x: 0, y: d > 0.3 ? 1 : 0 }, run: false, jump, jumpHeld: jump, crouch: false, descend: false }, c.built.physics, fwd);
      },
      cam: (t, k, dt) => {
        const b = p.body;
        const want = new THREE.Vector3(b.x + 5, b.y + 3.2, b.z + 7);
        if (!camPos) camPos = want.clone();
        camPos.lerp(want, Math.min(1, dt * 3));
        return [camPos.clone(), new THREE.Vector3(b.x * 0.5, b.y + 0.8, b.z - 5)];
      } };
  } },

  // Turbo Karts: cuatro karts con la física de conducción del juego siguiendo el circuito
  racing_karts: { dur: 6, warm: 2.5, setup() {
    const c = setupWorld('racing', 0.38, { fogFar: 700 });
    const colors = ['#e53935', '#1e88e5', '#fdd835', '#43a047'];
    const rnd = mulberry32(3);
    const karts = c.world.meta.grid.slice(0, 4).map((g, i) => {
      const v = new Vehicle({ id: `k${i}`, type: 'kart', p: [g.p[0], 0.6, g.p[2]], r: [0, (g.ry * Math.PI) / 180, 0], color: colors[i] }, c.scene);
      const driver = avatar(c.scene, i === 0 ? COOL[0] : randomAvatar(rnd), [0, 0, 0], 0, 'drive');
      return { v, driver, skill: [0.86, 0.9, 0.94, 0.98][i], lane: [-2.2, 2.2, -0.6, 1.2][i] };
    });
    const pts = Array.from({ length: 400 }, (_, i) => trackPoint(i / 400));
    const camPos = new THREE.Vector3();
    let first = true;
    const q = new THREE.Quaternion(), pos = new THREE.Vector3();
    return { ...c,
      update: (t, dt) => {
        for (const k of karts) {
          const s = k.v.state;
          let bi = 0, bd = Infinity;
          for (let i = 0; i < pts.length; i++) { const d = Math.hypot(pts[i][0] - s.x, pts[i][1] - s.z); if (d < bd) { bd = d; bi = i; } }
          const [ax, az] = pts[(bi + 14) % pts.length], [bx, bz] = pts[(bi + 15) % pts.length];
          const tl = Math.hypot(bx - ax, bz - az) || 1;
          const tx = ax + ((bz - az) / tl) * k.lane, tz = az - ((bx - ax) / tl) * k.lane; // carril propio
          const want = Math.atan2(tx - s.x, tz - s.z);
          const diff = Math.atan2(Math.sin(want - s.yaw), Math.cos(want - s.yaw));
          driveGround(k.v, { throttle: k.skill, steer: Math.max(-1, Math.min(1, -diff * 2.2)), brake: false, boost: false, jump: false }, dt, c.built.physics);
          k.v.animate(dt);
          k.v.seatTransform(pos, q);
          k.driver.model.root.position.copy(pos);
          k.driver.model.root.quaternion.copy(q);
          k.driver.anim.update(dt, 0);
        }
      },
      cam: (t, k, dt) => {
        // Cámara baja tras el kart más rápido, que sale el último y va alcanzando al grupo
        const lead = karts[3].v.state;
        const fx = Math.sin(lead.yaw), fz = Math.cos(lead.yaw);
        const want = new THREE.Vector3(lead.x - fx * 4.2 + fz * 1.6, lead.y + 1.5, lead.z - fz * 4.2 - fx * 1.6);
        if (first) { camPos.copy(want); first = false; }
        camPos.lerp(want, Math.min(1, dt * 5));
        return [camPos.clone(), new THREE.Vector3(lead.x + fx * 10, lead.y + 0.9, lead.z + fz * 10)];
      } };
  } },

  royale_aerial: { dur: 5, setup() {
    const c = setupWorld('royale', 0.42, { fogFar: 800 });
    const cam = path([[110, 70, 60], [60, 55, 110], [-10, 48, 115]]);
    return { ...c, cam: (t, k) => [cam.getPoint(ease(k)), new THREE.Vector3(0, 8 + k * 4, 0)] };
  } },

  rocket_stadium: { dur: 4.5, setup() {
    const c = setupWorld('rocket', 0.45, { fogFar: 800 });
    const tc = document.createElement('canvas');
    tc.width = 256; tc.height = 128;
    const cg = tc.getContext('2d');
    cg.fillStyle = '#fafafa'; cg.fillRect(0, 0, 256, 128);
    cg.fillStyle = '#263238';
    for (let i = 0; i < 8; i++) for (let j = 0; j < 4; j++) if ((i + j) % 2) cg.fillRect(i * 32, j * 32, 32, 32);
    const tex = new THREE.CanvasTexture(tc);
    tex.colorSpace = THREE.SRGBColorSpace;
    const ball = new THREE.Mesh(new THREE.SphereGeometry(2.2, 24, 16), new THREE.MeshStandardMaterial({ map: tex, roughness: 0.5 }));
    ball.castShadow = true;
    c.scene.add(ball);
    const rnd = mulberry32(9);
    const cars = [['#1e88e5', [-30, 0.6, 12], 1.2], ['#fb8c00', [26, 0.6, -14], -2.2], ['#1e88e5', [-24, 0.6, -18], 0.6]].map(([col, p, yaw], i) => {
      const v = new Vehicle({ id: 'r' + i, type: 'car', p, r: [0, yaw, 0], color: col }, c.scene);
      return { v, driver: avatar(c.scene, i === 0 ? COOL[3] : randomAvatar(rnd), [0, 0, 0], 0, 'drive') };
    });
    const q = new THREE.Quaternion(), pos = new THREE.Vector3();
    const bp = (t) => new THREE.Vector3(-6 + t * 4.5, 2.2 + Math.abs(Math.sin(t * 2.2)) * 3 * Math.exp(-t * 0.3), Math.sin(t * 0.6) * 5);
    const cam = path([[-10, 26, 62], [-28, 12, 42], [-36, 6, 22]]);
    return { ...c,
      update: (t, dt) => {
        const b = bp(Math.max(0, t));
        ball.position.copy(b);
        ball.rotation.z = -t * 2.1;
        for (const { v, driver } of cars) {
          const st = v.state;
          const want = Math.atan2(b.x - st.x, b.z - st.z);
          const diff = Math.atan2(Math.sin(want - st.yaw), Math.cos(want - st.yaw));
          driveGround(v, { throttle: 1, steer: Math.max(-1, Math.min(1, -diff * 2)), brake: false, boost: true, jump: false }, dt, c.built.physics);
          v.animate(dt);
          v.seatTransform(pos, q);
          driver.model.root.position.copy(pos);
          driver.model.root.quaternion.copy(q);
          driver.anim.update(dt, 0);
        }
      },
      cam: (t, k) => [cam.getPoint(ease(k)), bp(Math.max(0, t)).setY(1.5)] };
  } },

  keys_glide: { dur: 5, setup() {
    const c = setupWorld('keys', 0.8, { fogFar: 500 });
    const rnd = mulberry32(11);
    const hopper = avatar(c.scene, COOL[2], [0, 0.6, 14], Math.PI, 'jump');
    worldLights(c, [0, 0, 10], { max: 8 });
    return { ...c,
      update: (t, dt) => {
        const ph = (t * 1.6) % 1;
        hopper.model.root.position.set(Math.sin(t) * 1.5, 0.6 + Math.sin(ph * Math.PI) * 1.6, 14 - t * 1.4);
        hopper.anim.set(ph < 0.5 ? 'jump' : 'fall');
        hopper.anim.update(dt, 0);
        hopper.model.updateEffects(dt, true);
      },
      cam: (t, k) => { const z = 14 - t * 1.4; return [new THREE.Vector3(3.2 - k * 1.2, 2.6, z + 5.2), new THREE.Vector3(Math.sin(t) * 0.8, 1.3, z - 2)]; } };
  } },

  onlyup_crane: { dur: 5.5, setup() {
    const c = setupWorld('onlyup', 0.36, { fogFar: 900 });
    const cam = path([[22, 3, 28], [20, 30, 24], [16, 70, 20], [12, 110, 16]]);
    return { ...c, cam: (t, k) => { const p = cam.getPoint(ease(k)); return [p, new THREE.Vector3(0, p.y + 18, 0)]; } };
  } },

  huerto_farm: { dur: 4, setup() {
    const c = setupWorld('huerto', 0.34, { fogFar: 600 });
    const rnd = mulberry32(5);
    const ppl = [0, 1, 2].map((i) => avatar(c.scene, randomAvatar(rnd), [-3 + i * 2.5, 0.2, 5 + (i % 2)], Math.PI * 0.15, ['wave', 'cheer', 'idle'][i]));
    const cam = path([[9, 5, 15], [5, 3.6, 12.5], [2, 3, 11]]);
    return { ...c, update: (t, dt) => ppl.forEach((p) => p.anim.update(dt, 0)), cam: (t, k) => [cam.getPoint(ease(k)), new THREE.Vector3(-1, 1.5, 4)] };
  } },

  // Personalización: avatares del juego con ropa, accesorios de colores, efectos y emotes
  avatar_show: { dur: 6, setup() {
    const scene = new THREE.Scene();
    scene.background = new THREE.Color('#141a2e');
    scene.add(new THREE.HemisphereLight('#ffffff', '#3a3f7a', 1.1));
    const key = new THREE.DirectionalLight('#ffffff', 2.2);
    key.position.set(4, 7, 6);
    key.castShadow = true;
    key.shadow.mapSize.set(2048, 2048);
    scene.add(key);
    const rim = new THREE.DirectionalLight('#7c5cff', 1.6);
    rim.position.set(-6, 4, -5);
    scene.add(rim);
    const floor = new THREE.Mesh(new THREE.CylinderGeometry(6, 6.4, 0.3, 64), new THREE.MeshStandardMaterial({ color: '#232a52', roughness: 0.6 }));
    floor.position.y = -0.15;
    floor.receiveShadow = true;
    scene.add(floor);
    const ring = new THREE.Mesh(new THREE.TorusGeometry(6.05, 0.05, 8, 96), new THREE.MeshBasicMaterial({ color: '#00d1b2' }));
    ring.rotation.x = Math.PI / 2;
    scene.add(ring);
    const emotes = ['dab', 'floss', 'takel', 'headbang'];
    const ppl = COOL.map((d, i) => avatar(scene, d, [-3.6 + i * 2.4, 0, 0], 0, emotes[i]));
    return { scene, sky: null,
      update: (t, dt) => ppl.forEach((p, i) => {
        if (p.anim.finished) { p.anim.set('idle'); p.anim.set(emotes[i]); }
        p.anim.update(dt, 0);
        p.model.updateEffects(dt, false);
      }),
      cam: (t, k) => [new THREE.Vector3(Math.sin(k * 0.6 - 0.3) * 3, 1.9 - k * 0.3, 7.4 - k * 1.6), new THREE.Vector3(0, 1.25, 0)] };
  } },

  // Primer plano de dos avatares celebrando (miniatura de YouTube)
  // --- Eventos (Desastres Naturales e Isla Royale), con los mismos efectos que el juego --------
  ev_meteor_pov: { dur: 8, warm: 0.5, setup() { return disasterShot('meteor', { pov: true }); } },
  ev_meteor_wide: { dur: 6, setup() { return disasterShot('meteor', { cam: [[-47, 3, 16], [-42, 4, 14]], look: [10, 14, 10], people: 5, lane: true }); } },
  ev_lava: { dur: 7, setup() { return disasterShot('lava', { cam: [[44, 16, 44], [30, 11, 50]], look: [-4, 1, 0], people: 6, t0: 30 }); } },
  ev_lava_pov: { dur: 6, setup() { return disasterShot('lava', { roofPov: true, people: 6, t0: 34 }); } },
  ev_tornado: { dur: 8, setup() { return disasterShot('tornado', { cam: [[40, 8, 46], [26, 6, 40]], look: 'tornado', people: 5, fling: true }); } },
  ev_storm: { dur: 8, setup() {
    const c = setupWorld('royale', 0.5, { fogFar: 900 });
    c.scene.add(new THREE.HemisphereLight('#c084fc', '#1a0b3d', 0.5));
    // Muro de la tormenta (mismo color que en el juego) con degradado vertical y vetas, para que se lea como muro
    const tc = document.createElement('canvas'); tc.width = 256; tc.height = 256;
    const tg = tc.getContext('2d');
    const grd = tg.createLinearGradient(0, 256, 0, 0);
    grd.addColorStop(0, 'rgba(168,85,247,0.85)'); grd.addColorStop(0.6, 'rgba(168,85,247,0.45)'); grd.addColorStop(1, 'rgba(168,85,247,0)');
    tg.fillStyle = grd; tg.fillRect(0, 0, 256, 256);
    tg.strokeStyle = 'rgba(240,171,252,0.35)'; tg.lineWidth = 6;
    for (let i = -256; i < 512; i += 40) { tg.beginPath(); tg.moveTo(i, 256); tg.lineTo(i + 140, 0); tg.stroke(); }
    const stormTex = new THREE.CanvasTexture(tc); stormTex.wrapS = THREE.RepeatWrapping; stormTex.repeat.set(10, 1);
    const storm = new THREE.Mesh(new THREE.CylinderGeometry(1, 1, 50, 96, 1, true), new THREE.MeshBasicMaterial({ map: stormTex, transparent: true, side: THREE.DoubleSide, depthWrite: false, fog: false }));
    const edge = new THREE.Mesh(new THREE.TorusGeometry(1, 0.012, 6, 128), new THREE.MeshBasicMaterial({ color: '#e879f9', transparent: true, opacity: 0.9, blending: THREE.AdditiveBlending, depthWrite: false }));
    edge.rotation.x = Math.PI / 2;
    c.scene.add(storm, edge);
    const rnd = mulberry32(17);
    const runners = [0, 1, 2, 3].map((i) => avatar(c.scene, i ? randomAvatar(rnd) : COOL[3], [0, 0, 0], 0, 'run'));
    return { ...c,
      update: (t, dt) => {
        const r = 70 - t * 5.5; // la tormenta se cierra
        storm.position.set(0, 25, 0); storm.scale.set(r, 1, r);
        stormTex.offset.x = t * 0.05;
        edge.scale.set(r, r, 1); edge.position.set(0, 1.5, 0);
        runners.forEach((p, i) => {
          const a = -0.18 + i * 0.12, d = Math.max(4, r - 3 - i * 2.5);
          const x = Math.cos(a) * d, z = Math.sin(a) * d;
          p.model.root.position.set(x, c.built.physics.terrainHeight(x, z), z);
          p.model.root.rotation.y = Math.atan2(-x, -z);
          p.anim.update(dt, 7);
        });
      },
      cam: (t, k) => [new THREE.Vector3(-14 + k * 4, 16 - k * 6, 0), new THREE.Vector3(60, 6, 0)] };
  } },

  // POV Turno de Noche: la puerta se cierra de golpe y, después, el apagón
  ev_fnaf_door: { dur: 4, setup() {
    const s = SHOTS.fnaf_office.setup();
    const door = s.built.objects.get('fdoorL');
    const base = door?.mesh ? door.mesh.position.y : 0;
    return { ...s,
      update: (t, dt, cam3) => {
        s.update(t + 1.7, dt, cam3);
        if (door?.mesh) door.mesh.position.y = t < 1.6 ? base : base - Math.min(1, (t - 1.6) / 0.18) * 3.1;
      },
      cam: (t, k, dt) => { const [p, l] = s.cam(t + 1.7, k, dt); if (t > 1.6 && t < 2.1) p.y += Math.sin(t * 90) * 0.04; return [p, l]; } };
  } },
  ev_fnaf_blackout: { dur: 5, setup() {
    const c = setupWorld('fnaf', 0.02, { fogNear: 2, fogFar: 22 });
    c.scene.add(new THREE.HemisphereLight('#2a2448', '#000000', 0.18));
    const m = buildAnimatronic('bear');
    m.root.position.set(-5.6, 0, 19.6);
    m.root.rotation.y = Math.PI / 2;
    c.scene.add(m.root);
    const lamp = new THREE.PointLight('#ffd8a0', 7, 13, 1.6);
    lamp.position.set(0, 3.6, 21);
    c.scene.add(lamp);
    return { ...c,
      update: (t) => {
        lamp.intensity = t < 1.2 ? (Math.sin(t * 40) > 0.3 ? 7 : 1) : 0; // la luz parpadea y se va
        m.eyeMat.emissiveIntensity = t > 2.2 ? 4 + Math.sin(t * 9) * 1.5 : 0; // dos ojos en la oscuridad
        m.root.visible = t > 2.2;
        m.jaw.rotation.x = t > 3.8 ? 0.5 : 0.05;
        m.root.position.x = -5.6 + Math.max(0, t - 3.4) * 2.2;
      },
      cam: (t) => { const p = new THREE.Vector3(-1.4, 1.62, 21); const yaw = 1.05; return [p, p.clone().add(new THREE.Vector3(-Math.sin(yaw) * 3, -0.05, -Math.cos(yaw) * 3 + 0.3))]; } };
  } },

  // Protagonista de la miniatura: un avatar de cuerpo entero sin fondo (PNG transparente)
  thumb_hero: { dur: 2, setup() {
    const scene = new THREE.Scene();
    scene.add(new THREE.HemisphereLight('#ffffff', '#6a5cff', 1.3));
    const key = new THREE.DirectionalLight('#ffffff', 2.8);
    key.position.set(2.5, 4, 5);
    scene.add(key);
    const rimA = new THREE.DirectionalLight('#00e5ff', 2.4);
    rimA.position.set(-4, 3, -3);
    const rimB = new THREE.DirectionalLight('#ff4081', 2.0);
    rimB.position.set(4, 2, -3);
    scene.add(rimA, rimB);
    const hero = avatar(scene, COOL[1], [0, 0, 0], 0, 'cheer');
    return { scene, sky: null,
      update: (t, dt) => { hero.anim.update(dt, 0); hero.model.updateEffects(dt, false); },
      cam: () => [new THREE.Vector3(0, 1.05, 4.4), new THREE.Vector3(0, 1.3, 0)], fov: 40 };
  } },

  // Miniatura estilo Roblox, capa de fondo: La Plaza al atardecer con gente bailando
  thumb_bg: { dur: 2, setup() {
    const c = setupWorld('hangout', 0.7, { fogFar: 260 });
    const tiles = c.world.objects.filter((o) => o.dance);
    const cx = tiles.reduce((a, o) => a + o.p[0], 0) / tiles.length, cz = tiles.reduce((a, o) => a + o.p[2], 0) / tiles.length;
    const rnd = mulberry32(21);
    const emotes = ['dance', 'robot', 'floss', 'headbang', 'jacks', 'cheer', 'dance', 'wave'];
    const ppl = [];
    for (let i = 0; i < 14; i++) {
      const a = rnd() * Math.PI * 2, r = 1 + rnd() * 5;
      ppl.push(avatar(c.scene, randomAvatar(rnd), [cx + Math.cos(a) * r, 0.1, cz + Math.sin(a) * r], rnd() * 6, emotes[i % emotes.length]));
    }
    worldLights(c, [cx, 0, cz], { max: 12 });
    return { ...c,
      update: (t, dt) => ppl.forEach((p) => { p.anim.update(dt, 0); p.model.updateEffects(dt, false); }),
      cam: () => [new THREE.Vector3(cx + 1, 1.1, cz + 11), new THREE.Vector3(cx, 2.2, cz)] };
  } },

  // Miniatura estilo Roblox, capa de personajes: cuatro avatares en pose, sin fondo
  thumb_chars: { dur: 2, setup() {
    const scene = new THREE.Scene();
    scene.add(new THREE.HemisphereLight('#fff1e0', '#5a4fd1', 1.25));
    const sun = new THREE.DirectionalLight('#ffd7a0', 3.0);
    sun.position.set(4, 5, 4);
    scene.add(sun);
    const rimA = new THREE.DirectionalLight('#00e5ff', 2.6);
    rimA.position.set(-5, 3, -4);
    const rimB = new THREE.DirectionalLight('#ff4081', 2.2);
    rimB.position.set(5, 2, -4);
    scene.add(rimA, rimB);
    const cast = [
      [COOL[3], [0, 0.2, 0], 0, 'cheer'],
      [COOL[2], [-1.35, 0, -0.5], 0.35, 'dab'],
      [COOL[1], [1.4, 0, -0.5], -0.35, 'point'],
      [COOL[0], [-2.6, 0, -1.6], 0.5, 'wave'],
    ].map(([d, p, ry, st]) => avatar(scene, d, p, ry, st));
    return { scene, sky: null,
      update: (t, dt) => cast.forEach((p) => { p.anim.update(dt, 0); p.model.updateEffects(dt, true); }),
      cam: () => [new THREE.Vector3(0.1, 1.15, 3.9), new THREE.Vector3(0, 1.4, 0)] };
  } },

  thumb_avatar: { dur: 2, setup() {
    const scene = new THREE.Scene();
    scene.background = new THREE.Color('#1b2a6b');
    scene.add(new THREE.HemisphereLight('#ffffff', '#5a4fd1', 1.4));
    const key = new THREE.DirectionalLight('#ffffff', 2.6);
    key.position.set(3, 5, 6);
    scene.add(key);
    const rim = new THREE.DirectionalLight('#00e5ff', 2.2);
    rim.position.set(-5, 3, -4);
    scene.add(rim);
    const ppl = [avatar(scene, COOL[2], [-0.55, 0, 0], 0.25, 'cheer'), avatar(scene, COOL[1], [0.65, 0, -0.3], -0.3, 'cheer')];
    return { scene, sky: null,
      update: (t, dt) => ppl.forEach((p) => { p.anim.update(dt, 0); p.model.updateEffects(dt, false); }),
      cam: () => [new THREE.Vector3(0.1, 1.55, 3.3), new THREE.Vector3(0.05, 1.35, 0)] };
  } },

  // --- Turno de Noche ----------------------------------------------------------------
  fnaf_stage: { dur: 5.5, setup() {
    const c = setupWorld('fnaf', 0.02, { fogNear: 6, fogFar: 60 });
    c.scene.add(new THREE.HemisphereLight('#5c4a7a', '#000000', 0.35));
    const anims = ['bunny', 'bear', 'chicken'].map((a) => {
      const m = buildAnimatronic(a);
      const [x, y, z, ry] = nodePos('stage', a);
      m.root.position.set(x, y, z);
      m.root.rotation.y = (ry * Math.PI) / 180 * 0.5;
      m.eyeMat.emissiveIntensity = 1.6;
      c.scene.add(m.root);
      return m;
    });
    const spot = new THREE.SpotLight('#ffcc80', 160, 30, 0.6, 0.6, 1.4);
    spot.position.set(0, 4.4, -13);
    spot.target.position.set(0, 1.5, -20);
    c.scene.add(spot, spot.target);
    const cam = path([[0, 1.9, -5], [0.4, 2.0, -9], [0, 2.15, -12.8]]);
    return { ...c,
      update: (t) => {
        anims.forEach((m, i) => {
          const tw = Math.sin(t * 0.9 + i * 2) > 0.92 ? Math.sin(t * 40) * 0.12 : 0;
          m.head.rotation.z = Math.sin(t * 0.6 + i) * 0.08 + tw;
        });
        // A los 3,8 s Bruno gira la cabeza hacia la cámara y la luz parpadea
        if (t > 3.8) anims[1].head.rotation.y = Math.min(0.5, (t - 3.8) * 2) * -0.6;
        spot.intensity = t > 3.6 && t < 4.1 && Math.sin(t * 60) > 0 ? 20 : 160;
        anims.forEach((m) => { m.eyeMat.emissiveIntensity = t > 3.8 ? 3 : 1.6; });
      },
      cam: (t, k) => [cam.getPoint(ease(k)), new THREE.Vector3(0, 1.9, -20)] };
  } },

  fnaf_office: { dur: 4.5, setup() {
    const c = setupWorld('fnaf', 0.02, { fogNear: 3, fogFar: 30 });
    c.scene.add(new THREE.HemisphereLight('#3a3550', '#000000', 0.12));
    const door = c.built.objects.get('fdoorL');
    if (door?.mesh) door.mesh.position.y += 3.1; // puerta izquierda abierta
    const m = buildAnimatronic('bunny');
    const [x, y, z] = nodePos('doorL', 'bunny');
    m.root.position.set(x, y, z);
    m.root.rotation.y = Math.PI / 2;
    m.head.rotation.set(0.15, 0, 0.28);
    c.scene.add(m.root);
    const lamp = new THREE.PointLight('#ffd8a0', 7, 13, 1.6);
    lamp.position.set(0, 3.6, 21);
    const hall = new THREE.SpotLight('#fff3d6', 0, 14, 0.7, 0.45, 1.2);
    hall.position.set(...FNAF.doors.L.lamp);
    hall.target.position.set(-6.5, 0.5, 20.5);
    c.scene.add(lamp, hall, hall.target);
    return { ...c,
      update: (t) => {
        // La luz del pasillo se enciende a los 1,6 s y revela a Rita en la puerta
        hall.intensity = t > 1.6 ? (t < 1.9 && Math.sin(t * 70) > 0 ? 40 : 170) : 0;
        m.eyeMat.emissiveIntensity = t > 1.6 ? 2.5 : 0.35;
        m.jaw.rotation.x = t > 2.6 ? 0.15 + Math.sin(t * 6) * 0.08 : 0.04;
        lamp.intensity = Math.sin(t * 13) > 0.97 ? 2 : 7;
      },
      cam: (t, k) => {
        const yaw = 0.25 + ease(Math.min(1, t / 1.4)) * 0.95; // gira hacia la puerta izquierda
        const p = new THREE.Vector3(-1.6, 1.62, 20.9);
        return [p, p.clone().add(new THREE.Vector3(-Math.sin(yaw) * 3, -0.05, -Math.cos(yaw) * 3 + Math.sin(yaw) * 0.3))];
      } };
  } },

  fnaf_cam: { dur: 3.5, setup() {
    const c = setupWorld('fnaf', 0.02, { fogNear: 6, fogFar: 60 });
    c.scene.add(new THREE.HemisphereLight('#ffffff', '#222222', 0.9));
    const camDef = CAM_BY_ID['2A'];
    const ir = new THREE.PointLight('#dfffe0', 55, 26, 1.1);
    ir.position.set(camDef.pos[0], camDef.pos[1] - 0.4, camDef.pos[2]);
    c.scene.add(ir);
    const m = buildAnimatronic('bunny');
    const [x, y, z, ry] = nodePos('westHall', 'bunny');
    m.root.position.set(x, y, z + 1);
    m.root.rotation.y = (ry * Math.PI) / 180;
    m.eyeMat.emissiveIntensity = 2.5;
    c.scene.add(m.root);
    const rnd = mulberry32(1);
    return { ...c, post: 'monitor', label: 'CAM 2A · Pasillo oeste',
      update: (t) => { m.head.rotation.z = Math.sin(t * 3) * 0.1; m.root.visible = !(t > 1.6 && t < 2.0); },
      cam: (t) => {
        const pan = Math.sin(t * 0.35) * 0.22;
        const dir = v3(camDef.look).sub(v3(camDef.pos)).applyAxisAngle(new THREE.Vector3(0, 1, 0), pan);
        return [v3(camDef.pos), v3(camDef.pos).add(dir)];
      }, staticAt: (t) => (t > 1.55 && t < 2.05 ? 0.85 : 0.1 + rnd() * 0.04) };
  } },

  fnaf_scare: { dur: 1.7, setup() {
    const c = setupWorld('fnaf', 0.02, { fogNear: 3, fogFar: 30 });
    c.scene.add(new THREE.HemisphereLight('#3a3550', '#000000', 0.15));
    const m = buildAnimatronic('bear');
    c.scene.add(m.root);
    const lamp = new THREE.PointLight('#ffd8a0', 12, 13, 1.6);
    c.scene.add(lamp);
    const eye = new THREE.Vector3(0, 1.62, 21.5), fwd = new THREE.Vector3(0, 0, -1);
    return { ...c,
      update: (t) => {
        const k = Math.min(1, t / 0.25);
        const dist = 4.2 - k * k * 3.0;
        m.root.position.set(eye.x, eye.y - 2.15 + 0.05, eye.z - dist);
        m.root.rotation.set(0, 0, 0);
        m.jaw.rotation.x = 0.7 + Math.sin(t * 28) * 0.25;
        m.eyeMat.emissiveIntensity = 4;
        m.head.rotation.set(Math.sin(t * 22) * 0.12, Math.sin(t * 19) * 0.15, Math.sin(t * 26) * 0.3);
        m.armL.rotation.set(-1.15, 0, -0.85 - Math.sin(t * 33) * 0.12);
        m.armR.rotation.set(-1.15, 0, 0.85 + Math.sin(t * 33) * 0.12);
        lamp.intensity = Math.sin(t * 50) > 0.5 ? 2 : 14;
        lamp.position.set(eye.x, eye.y + 0.6, eye.z);
      },
      cam: (t) => {
        const sh = t > 0.25 ? 0.2 : 0.04;
        const p = eye.clone().add(new THREE.Vector3((Math.random() - 0.5) * sh, (Math.random() - 0.5) * sh, 0));
        return [p, p.clone().add(fwd)];
      } };
  } },

  // --- Fábrica Feliz --------------------------------------------------------------------
  poppy_hands: { dur: 4.2, setup() {
    const c = setupWorld('poppy', 0.02, { fogNear: 4, fogFar: 42 });
    c.scene.add(new THREE.HemisphereLight('#4a4a66', '#000000', 0.3));
    worldLights(c, [0, 0, 10], { max: 6, mult: 4 });
    const hands = { blue: handMesh('#2979ff'), red: handMesh('#ff1744') };
    const view = new THREE.Group();
    view.add(hands.blue, hands.red);
    hands.blue.position.set(-0.32, -0.32, -0.62);
    hands.red.position.set(0.32, -0.32, -0.62);
    c.scene.add(view);
    const flash = new THREE.SpotLight('#fff1d6', 380, 26, 0.55, 0.5, 1.5);
    const ft = new THREE.Object3D();
    flash.target = ft;
    c.scene.add(flash, ft);
    const cable = new THREE.Line(new THREE.BufferGeometry(), new THREE.LineBasicMaterial({ color: '#2979ff' }));
    c.scene.add(cable);
    const door = c.built.objects.get('pdoorA');
    const target = new THREE.Vector3(3.2, 2.2, 15.7);
    const camera = { pos: new THREE.Vector3(1.6, 1.82, 9.2) };
    return { ...c,
      update: (t, dt, cam3) => {
        view.position.copy(cam3.position);
        view.quaternion.copy(cam3.quaternion);
        const bob = Math.sin(t * 9) * 0.008;
        hands.red.position.y = -0.32 + bob;
        const fwd = new THREE.Vector3();
        cam3.getWorldDirection(fwd);
        flash.position.copy(cam3.position).addScaledVector(fwd, 0.3);
        ft.position.copy(cam3.position).addScaledVector(fwd, 8);
        // Disparo de la mano azul al escáner (1,0 s) con el cable colgando
        const s = t - 1.0, out = 0.16, hold = 0.25, back = 0.22;
        const rest = view.localToWorld(new THREE.Vector3(-0.32, -0.32, -0.62));
        if (s > 0 && s < out + hold + back) {
          const k = s < out ? s / out : s < out + hold ? 1 : 1 - (s - out - hold) / back;
          const wp = rest.clone().lerp(target, k);
          hands.blue.position.copy(view.worldToLocal(wp.clone()));
          const pts = [];
          const sag = rest.distanceTo(wp) * (s > out + hold ? 0.12 : 0.04);
          for (let i = 0; i <= 12; i++) { const u = i / 12; const q = rest.clone().lerp(wp, u); q.y -= Math.sin(u * Math.PI) * sag; pts.push(q); }
          cable.geometry.setFromPoints(pts);
          cable.visible = true;
          for (const f of hands.blue.userData.fingers) f.rotation.x = s > out * 0.8 ? 1.2 : 0;
        } else {
          hands.blue.position.set(-0.32, -0.32 + bob, -0.62);
          cable.visible = false;
          for (const f of hands.blue.userData.fingers) f.rotation.x = 0;
        }
        if (door?.mesh) door.mesh.position.y = 2 + ease(Math.max(0, Math.min(1, (t - 1.45) / 1.6))) * 4.2;
      },
      cam: (t, k) => {
        const p = camera.pos.clone().add(new THREE.Vector3(0, Math.sin(t * 2) * 0.02, -k * 1.2));
        const look = target.clone().lerp(new THREE.Vector3(0, 2, 16), ease(Math.max(0, (t - 2) / 2)));
        return [p, look];
      } };
  } },

  poppy_case: { dur: 4.5, setup() {
    const c = setupWorld('poppy', 0.02, { fogNear: 4, fogFar: 42 });
    c.scene.add(new THREE.HemisphereLight('#5a4a7a', '#000000', 0.35));
    const t0 = buildTito();
    t0.root.position.set(0, 0.5, 92);
    c.scene.add(t0.root);
    const spot = new THREE.SpotLight('#ce93d8', 140, 25, 0.5, 0.7, 1.4);
    spot.position.set(2, 6, 87);
    spot.target.position.set(0, 3, 92);
    c.scene.add(spot, spot.target);
    const cam = path([[6, 1.9, 82.5], [4.2, 2.1, 85], [2.6, 2.4, 86.6]]);
    return { ...c,
      update: (t) => {
        t0.root.rotation.y = Math.atan2(4 - 0, 85 - 92) * 0.85;
        poseTito(t0, t > 3.2 ? 'peek' : 'sleep', t);
        if (t > 3.2) t0.eyeMat.emissiveIntensity = 3;
      },
      cam: (t, k) => [cam.getPoint(ease(k)), new THREE.Vector3(0, 3.3, 92)] };
  } },

  poppy_chase: { dur: 4.5, setup() {
    const c = setupWorld('poppy', 0.02, { fogNear: 4, fogFar: 46 });
    c.scene.add(new THREE.HemisphereLight('#3a2a3a', '#000000', 0.3));
    worldLights(c, [0, 0, 125], { max: 6, mult: 4 });
    const t0 = buildTito();
    c.scene.add(t0.root);
    const alarm = new THREE.PointLight('#ff1744', 30, 22, 1.4);
    c.scene.add(alarm);
    // El pasillo tiene muros en zigzag (z 110, 120, 130, 140): se pasa por los huecos
    const weave = (z) => 2 * Math.cos(Math.PI * (z - 110) / 10);
    // Linterna del jugador mirando atrás mientras huye
    const torch = new THREE.SpotLight('#fff1d6', 260, 24, 0.5, 0.5, 1.5);
    c.scene.add(torch, torch.target);
    return { ...c,
      update: (t) => {
        const camZ = 104 + t * 7.5;
        const tz = camZ - 5.5 + Math.min(1.2, t * 0.3);
        t0.root.position.set(weave(tz), 0, tz);
        torch.position.set(weave(camZ), 1.5, camZ - 0.3); torch.target.position.set(weave(tz), 2.4, tz);
        t0.root.rotation.set(0, 0, 0);
        poseTito(t0, 'chase', t);
        alarm.position.set(Math.sin(t * 3) * 2, 5.4, camZ - 3);
        alarm.intensity = Math.sin(t * 8) > 0 ? 38 : 14;
      },
      cam: (t) => {
        const camZ = 104 + t * 7.5;
        const p = new THREE.Vector3(weave(camZ) + Math.sin(t * 7) * 0.05, 1.7 + Math.abs(Math.sin(t * 9)) * 0.06, camZ);
        const tz = camZ - 5.5;
        return [p, new THREE.Vector3(weave(tz) * 0.6, 2.4, tz)];
      } };
  } },

  poppy_scare: { dur: 1.6, setup() {
    const c = setupWorld('poppy', 0.02, { fogNear: 4, fogFar: 42 });
    c.scene.add(new THREE.HemisphereLight('#3a2a3a', '#000000', 0.25));
    const t0 = buildTito();
    c.scene.add(t0.root);
    const red = new THREE.PointLight('#ff1744', 9, 6, 2);
    c.scene.add(red);
    const eye = new THREE.Vector3(0, 1.8, 130), fwd = new THREE.Vector3(0, 0, -1);
    return { ...c,
      update: (t) => {
        const k = Math.min(1, t / 0.32);
        const dist = 6.5 - k * k * 5.1;
        t0.root.position.set(eye.x, eye.y - 4.3 + (1 - k) * 0.6, eye.z - dist);
        t0.root.rotation.set(0, 0, 0);
        poseTito(t0, 'scare', t);
        red.position.copy(eye).addScaledVector(fwd, 0.4);
      },
      cam: (t) => {
        const sh = t > 0.32 ? 0.22 : 0.05;
        const p = eye.clone().add(new THREE.Vector3((Math.random() - 0.5) * sh, (Math.random() - 0.5) * sh, 0));
        return [p, p.clone().add(fwd)];
      } };
  } },

  // --- Silencio Mortal y Laberinto Sombrío ---------------------------------------------
  pesadilla_hall: { dur: 4.5, setup() {
    const c = setupWorld('pesadilla', 0.02, { fogNear: 2, fogFar: 26 });
    c.scene.add(new THREE.HemisphereLight('#2a2f4a', '#000000', 0.2));
    const mon = PesadillaClient.prototype.buildMonster.call({});
    c.scene.add(mon.root);
    const flash = new THREE.SpotLight('#fff1d6', 520, 30, 0.52, 0.5, 1.6);
    const ft = new THREE.Object3D();
    flash.target = ft;
    c.scene.add(flash, ft);
    return { ...c,
      update: (t, dt, cam3) => {
        mon.root.position.set(-1.5, 0, 12.5 + t * 1.1);
        const sway = Math.sin(t * 5);
        mon.arms[0].rotation.x = sway * 0.7; mon.arms[1].rotation.x = -sway * 0.7;
        mon.head.rotation.z = Math.sin(t * 1.4) * 0.25;
        const fwd = new THREE.Vector3();
        cam3.getWorldDirection(fwd);
        flash.position.copy(cam3.position).addScaledVector(fwd, 0.3);
        ft.position.copy(cam3.position).addScaledVector(fwd, 8);
        flash.intensity = t > 3.3 && Math.sin(t * 45) > 0.2 ? 60 : 520; // la linterna falla
      },
      cam: (t) => {
        const p = new THREE.Vector3(-1.5 + Math.sin(t * 1.2) * 0.1, 1.62, 23.6 - t * 0.3);
        return [p, new THREE.Vector3(-1.5, 1.9, 12)];
      } };
  } },

  horror_maze: { dur: 4, setup() {
    const c = setupWorld('horror', 0.02, { fogNear: 3, fogFar: 40 });
    c.scene.add(new THREE.HemisphereLight('#4a3f7a', '#000000', 0.35));
    const mon = HorrorClient.prototype.buildMonster.call({});
    c.scene.add(mon.root);
    const flash = new THREE.SpotLight('#fff1d6', 900, 42, 0.5, 0.55, 1.4);
    const ft = new THREE.Object3D();
    flash.target = ft;
    const aura = new THREE.PointLight('#8fa8ff', 6, 9, 1.5);
    c.scene.add(flash, ft, aura);
    const cam = path([[-58, 1.7, 75], [-58.2, 1.7, 72], [-58, 1.7, 70]]);
    return { ...c,
      update: (t, dt, cam3) => {
        const sway = Math.sin(t * 4);
        mon.root.position.set(-58, 0, 58 + t * 1.6);
        mon.arms[0].rotation.x = sway * 0.6; mon.arms[1].rotation.x = -sway * 0.6;
        mon.glow.intensity = t > 2 ? 4 : 1.5;
        const fwd = new THREE.Vector3();
        cam3.getWorldDirection(fwd);
        flash.position.copy(cam3.position).addScaledVector(fwd, 0.3);
        ft.position.copy(cam3.position).addScaledVector(fwd, 8);
        aura.position.copy(cam3.position);
        flash.intensity = t > 2.6 && Math.sin(t * 50) > 0.3 ? 80 : 900;
      },
      cam: (t, k) => [cam.getPoint(ease(k)), new THREE.Vector3(-58, 2.4, 60)] };
  } },
};

// --- Bucle de grabación -------------------------------------------------------------------
function drawMonitor(shot, t) {
  // Igual que el monitor de cámaras del juego: visión nocturna, estática, líneas y etiqueta
  octx.save();
  octx.filter = 'contrast(1.15) saturate(0.45) sepia(0.35) hue-rotate(55deg) brightness(1.15)';
  octx.drawImage(renderer.domElement, 0, 0);
  octx.restore();
  const st = shot.staticAt ? shot.staticAt(t) : 0.1;
  const n = document.createElement('canvas');
  n.width = 320; n.height = 180;
  const nc = n.getContext('2d');
  const img = nc.createImageData(320, 180);
  for (let i = 0; i < img.data.length; i += 4) { const v = Math.random() * 255; img.data[i] = img.data[i + 1] = img.data[i + 2] = v; img.data[i + 3] = 255; }
  nc.putImageData(img, 0, 0);
  octx.globalAlpha = st;
  octx.globalCompositeOperation = 'screen';
  octx.imageSmoothingEnabled = false;
  octx.drawImage(n, 0, 0, W, H);
  octx.globalAlpha = 1;
  octx.globalCompositeOperation = 'source-over';
  octx.fillStyle = 'rgba(0,0,0,0.18)';
  for (let y = 0; y < H; y += 4) octx.fillRect(0, y, W, 2);
  octx.font = `900 ${VERT ? 40 : 44}px monospace`;
  octx.fillStyle = Math.floor(t * 2) % 2 ? '#ff1744' : 'rgba(255,23,68,0.2)';
  octx.fillText('● REC', 60, 110);
  octx.fillStyle = '#ffffff';
  octx.fillText(shot.label || '', VERT ? 60 : 260, VERT ? 170 : 110);
}

async function main() {
  const def = SHOTS[shotId];
  if (!def) throw new Error(`Toma desconocida: ${shotId}`);
  await document.fonts.ready;
  const shot = def.setup();
  window.__shot = shot; // depuración (herramienta interna de grabación)
  const camera = new THREE.PerspectiveCamera(VERT ? (def.vfov || 74) : (def.fov || 55), W / H, 0.1, 1500);
  const dt = 1 / FPS;
  const total = Math.round(def.dur * FPS);
  const warm = Math.round((def.warm || 0) * FPS);
  let lastCam = null;
  const step = (t) => {
    const k = Math.min(1, t / def.dur);
    const [pos, look] = shot.cam(t, k, dt);
    camera.position.copy(pos);
    camera.lookAt(look);
    camera.updateMatrixWorld();
    shot.update?.(t, dt, camera);
    if (shot.sky) {
      shot.sky.update(dt, camera.position, shot.time);
      if (shot.scene.fog) { shot.scene.fog.near = shot.fogNear; shot.scene.fog.far = shot.fogFar; }
    }
    lastCam = pos;
  };
  // Calentamiento (física y animaciones asentadas) sin grabar
  for (let i = 0; i < warm; i++) step(-((warm - i) * dt) + 0);
  if (still !== null) {
    const n = Math.round(still * FPS);
    for (let i = 0; i <= n; i++) step(i * dt);
    renderer.render(shot.scene, camera);
    if (shot.post === 'monitor') drawMonitor(shot, n * dt); else octx.drawImage(renderer.domElement, 0, 0);
    const png = await new Promise((r) => out.toBlob(r, 'image/png'));
    await fetch(`${RECV}/frame?shot=stills&i=${n}&name=${shotId}${VERT ? '_v' : ''}`, { method: 'POST', body: png });
    await fetch(`${RECV}/done?shot=${shotId}`, { method: 'POST', body: 'foto fija' });
    return;
  }
  for (let i = 0; i < total; i++) {
    step(i * dt);
    renderer.render(shot.scene, camera);
    if (shot.post === 'monitor') drawMonitor(shot, i * dt);
    else octx.drawImage(renderer.domElement, 0, 0);
    const blob = await new Promise((r) => out.toBlob(r, 'image/jpeg', 0.94));
    await fetch(`${RECV}/frame?shot=${shotId}${VERT ? '_v' : ''}&i=${i}`, { method: 'POST', body: blob });
    if (i % 30 === 0) log(`${i}/${total}`);
  }
  await fetch(`${RECV}/done?shot=${shotId}`, { method: 'POST', body: `${total} fotogramas` });
}

main().catch((e) => fetch(`${RECV}/done?shot=${shotId}`, { method: 'POST', body: 'ERROR ' + (e.stack || e.message) }));
