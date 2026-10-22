// Miniaturas de los objetos de la tienda dibujadas con el mismo motor 3D del juego: cada objeto
// puesto sobre un avatar neutro. Se generan poco a poco (una por fotograma) y se guardan en memoria.
import * as THREE from 'three';
import { AvatarModel } from '../avatar/avatarModel.js';
import { DEFAULT_AVATAR } from '../../../shared/avatar.js';

const W = 220, H = 260;
const BASE = { ...DEFAULT_AVATAR, skin: '#f1c27d', shirtColor: '#90a4ae', pantsColor: '#546e7a', hairColor: '#4e342e' };
const cache = new Map();
const queue = [];
let renderer = null, scene = null, camera = null, running = false;

/** El avatar con el objeto puesto (para miniaturas y para probárselo en la tienda). */
export function withItem(avatar, item) {
  const a = { ...JSON.parse(JSON.stringify(avatar)), costume: null };
  switch (item.type) {
    case 'costume': a.costume = item.id; break;
    case 'outfit': Object.assign(a, JSON.parse(JSON.stringify(item.outfit))); a.accColors = { ...(item.outfit.accColors || {}) }; break;
    case 'hair': a.hair = item.id; break;
    case 'shirt': a.shirt = item.id; break;
    case 'pants': a.pants = item.id; break;
    case 'face': a.face = item.id; break;
    case 'accessory': a.accessories = [...(a.accessories || []).filter((x) => x !== item.id).slice(0, 3), item.id]; break;
    case 'effect': a.effect = item.id; break;
    default: break;
  }
  return a;
}

/** ¿Se ve mejor de cerca (cabeza) o de cuerpo entero? */
const closeUp = (item) => item.type === 'hair' || item.type === 'face';

function setup() {
  renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true, preserveDrawingBuffer: true });
  renderer.setSize(W, H);
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  scene = new THREE.Scene();
  scene.add(new THREE.HemisphereLight('#ffffff', '#3a3f7a', 1.3));
  const key = new THREE.DirectionalLight('#ffffff', 1.7);
  key.position.set(3, 6, 6);
  scene.add(key);
  camera = new THREE.PerspectiveCamera(30, W / H, 0.1, 50);
}

function draw(item) {
  if (!renderer) setup();
  const model = new AvatarModel(withItem(BASE, item), { shadows: false });
  // Los accesorios de espalda (capas, alas, mochilas) se ven mejor desde atrás
  const back = item.type === 'accessory' && /cape|wings|jetpack|backpack|guitar|sword|grabpack|batwings/.test(item.id);
  model.root.rotation.y = back ? Math.PI * 0.85 : 0.35;
  scene.add(model.root);
  if (closeUp(item)) { camera.position.set(0, 1.95, 2.6); camera.lookAt(0, 1.85, 0); }
  else { camera.position.set(0, 1.25, 5.6); camera.lookAt(0, 1.05, 0); }
  renderer.render(scene, camera);
  const url = renderer.domElement.toDataURL('image/png');
  scene.remove(model.root);
  model.dispose?.();
  return url;
}

function pump() {
  running = true;
  const job = queue.shift();
  if (!job) { running = false; return; }
  let url = cache.get(job.key);
  if (!url) {
    try { url = draw(job.item); } catch { url = ''; }
    cache.set(job.key, url);
  }
  for (const img of job.imgs) if (url) img.src = url;
  requestAnimationFrame(pump);
}

/** Imagen del objeto: se rellena en cuanto está dibujada. Emotes y decoraciones llevan un icono. */
export function itemThumb(item) {
  const icon = { emote: '💃', decoration: '🏛️' }[item.type];
  if (icon) return Object.assign(document.createElement('div'), { className: 'thumb-icon', textContent: icon });
  const img = new Image(W, H);
  img.className = 'thumb-img';
  img.alt = item.name;
  const key = `${item.id}|${JSON.stringify(item.costume || item.outfit || '')}`;
  if (cache.has(key)) { img.src = cache.get(key); return img; }
  const job = queue.find((j) => j.key === key);
  if (job) job.imgs.push(img);
  else queue.push({ key, item, imgs: [img] });
  if (!running) requestAnimationFrame(pump);
  return img;
}
