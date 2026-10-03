// Escenas 3D de la interfaz: fondo animado del menú y vista previa del avatar.
import * as THREE from 'three';
import { Sky } from '../engine/sky.js';
import { AvatarModel } from '../avatar/avatarModel.js';
import { AvatarAnimator } from '../avatar/avatarAnimator.js';
import { buildWorld } from '../world/worldBuilder.js';
import { getBuiltinWorld } from '../../../shared/worlds/index.js';
import { SKIN_TONES } from '../../../shared/avatar.js';

const rnd = (a) => a[Math.floor(Math.random() * a.length)];
const COLORS = ['#e53935', '#1e88e5', '#43a047', '#fdd835', '#8e24aa', '#fb8c00', '#00acc1', '#f06292'];

function randomAvatar() {
  return {
    skin: rnd(SKIN_TONES), hair: rnd(['hair_short', 'hair_long', 'hair_spiky', 'hair_bun', 'none']), hairColor: rnd(['#4e342e', '#212121', '#fdd835', '#d84315', '#8d6e63']),
    shirt: rnd(['shirt_tee', 'shirt_stripes', 'shirt_hoodie', 'shirt_star']), shirtColor: rnd(COLORS), pants: rnd(['pants_jeans', 'pants_shorts']),
    pantsColor: rnd(['#37474f', '#1a237e', '#4e342e', '#212121']), shoesColor: '#212121', face: rnd(['face_smile', 'face_happy', 'face_wink']),
    accessories: Math.random() < 0.4 ? [rnd(['acc_cap', 'acc_glasses', 'acc_headphones', 'acc_backpack'])] : [],
  };
}

/** Fondo del menú principal: la plaza de Kest Hangout con paseantes. */
export class MenuScene {
  constructor() {
    this.scene = new THREE.Scene();
    this.camera = new THREE.PerspectiveCamera(50, innerWidth / innerHeight, 0.1, 500);
    this.sky = new Sky(this.scene, { fog: true });
    this.sky.drawDistance = 260;
    const world = getBuiltinWorld('hangout');
    this.built = buildWorld(world, { shadows: true });
    this.scene.add(this.built.group);
    this.walkers = [];
    for (let i = 0; i < 9; i++) {
      const m = new AvatarModel(randomAvatar(), { shadows: true });
      const a = new AvatarAnimator(m);
      const w = { m, a, angle: Math.random() * Math.PI * 2, r: 10 + Math.random() * 18, speed: (0.12 + Math.random() * 0.12) * (Math.random() < 0.5 ? -1 : 1), mode: 'walk' };
      if (i < 3) {
        w.mode = ['dance', 'wave', 'cheer'][i];
        w.fixed = [[-20 + i * 3, 0.1, -20 + i * 2]][0];
      }
      this.scene.add(m.root);
      this.walkers.push(w);
    }
    this.t = 0;
  }

  update(dt) {
    this.t += dt;
    for (const w of this.walkers) {
      if (w.fixed) {
        w.m.root.position.set(...w.fixed);
        w.m.root.rotation.y = Math.sin(this.t * 0.3) * 0.5;
        w.a.set(w.mode === 'dance' ? 'dance' : this.t % 6 < 1.6 ? w.mode : 'idle');
        if (w.a.finished) w.a.set('idle');
        w.a.update(dt, 0);
        continue;
      }
      w.angle += w.speed * dt;
      const x = Math.cos(w.angle) * w.r, z = Math.sin(w.angle) * w.r;
      w.m.root.position.set(x, 0, z);
      w.m.root.rotation.y = Math.atan2(-Math.sin(w.angle) * w.speed, Math.cos(w.angle) * w.speed);
      w.a.set('walk');
      w.a.update(dt, 6);
    }
    const a = this.t * 0.05;
    this.camera.position.set(Math.cos(a) * 42, 16, Math.sin(a) * 42);
    this.camera.lookAt(0, 2, 0);
    this.sky.update(dt, new THREE.Vector3(0, 0, 0), 0.4 + Math.sin(this.t * 0.02) * 0.05);
  }
}

/** Vista previa giratoria del avatar (pantalla de avatar). */
export class AvatarPreview {
  constructor(data) {
    this.scene = new THREE.Scene();
    this.scene.background = new THREE.Color('#1a1d3f');
    this.camera = new THREE.PerspectiveCamera(35, innerWidth / innerHeight, 0.1, 100);
    this.scene.add(new THREE.HemisphereLight('#ffffff', '#3a3f7a', 1.2));
    const key = new THREE.DirectionalLight('#ffffff', 1.6);
    key.position.set(3, 6, 5);
    key.castShadow = true;
    this.scene.add(key);
    const floor = new THREE.Mesh(new THREE.CylinderGeometry(1.6, 1.8, 0.2, 40), new THREE.MeshStandardMaterial({ color: '#2b2f63', roughness: 0.6 }));
    floor.position.y = -0.1;
    floor.receiveShadow = true;
    this.scene.add(floor);
    this.model = new AvatarModel(data);
    this.scene.add(this.model.root);
    this.anim = new AvatarAnimator(this.model);
    this.rot = 0.4;
    this.dragging = false;
    this.offsetX = 0;
  }

  set(data) {
    this.model.build(data);
  }

  play(state) {
    this.anim.set(state);
  }

  onResize(w) {
    // Desplaza el personaje a la izquierda cuando el panel lateral ocupa la derecha
    this.offsetX = w > 860 ? 1.1 : 0;
  }

  update(dt) {
    if (!this.dragging) this.rot += dt * 0.4;
    this.model.root.rotation.y = this.rot;
    if (this.anim.finished) this.anim.set('idle');
    this.anim.update(dt, 0);
    this.model.updateEffects(dt, false);
    const narrow = innerWidth <= 860;
    this.camera.position.set(this.offsetX, narrow ? 1.6 : 1.4, narrow ? 8 : 7.2);
    this.camera.lookAt(this.offsetX, narrow ? 0.4 : 1.05, 0);
  }

  dispose() {
    this.model.dispose();
  }
}
