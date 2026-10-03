// Personaje de bloques original: cabeza, torso, brazos, piernas, cara, pelo,
// ropa, accesorios y efectos. Todo se genera con geometría simple y texturas de canvas.
import * as THREE from 'three';
import { DEFAULT_AVATAR } from '../../../shared/avatar.js';
import { settings } from '../core/settings.js';

const box = (w, h, d, mat, x = 0, y = 0, z = 0) => {
  const m = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), mat);
  m.position.set(x, y, z);
  m.castShadow = true;
  return m;
};
const std = (color, extra = {}) => new THREE.MeshStandardMaterial({ color, roughness: 0.7, ...extra });

function canvas(w, h, draw) {
  const c = document.createElement('canvas');
  c.width = w;
  c.height = h;
  draw(c.getContext('2d'), w, h);
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  t.magFilter = THREE.NearestFilter;
  return t;
}

function faceTexture(face, skin) {
  return canvas(64, 64, (g) => {
    g.fillStyle = skin;
    g.fillRect(0, 0, 64, 64);
    g.fillStyle = '#1b1b1b';
    const eye = (x, y, w = 6, h = 9) => g.fillRect(x, y, w, h);
    switch (face) {
      case 'face_happy':
        g.fillRect(16, 26, 9, 3); g.fillRect(39, 26, 9, 3);
        g.fillRect(18, 23, 5, 3); g.fillRect(41, 23, 5, 3);
        g.fillRect(20, 40, 24, 4); g.fillRect(18, 37, 4, 4); g.fillRect(42, 37, 4, 4);
        g.fillStyle = '#ff8a80'; g.fillRect(10, 34, 7, 4); g.fillRect(47, 34, 7, 4);
        break;
      case 'face_cool':
        g.fillRect(12, 22, 40, 10); g.fillStyle = '#4fc3f7'; g.fillRect(16, 24, 10, 4); g.fillRect(38, 24, 10, 4);
        g.fillStyle = '#1b1b1b'; g.fillRect(22, 42, 20, 3); g.fillRect(40, 39, 4, 4);
        break;
      case 'face_wink':
        eye(19, 22); g.fillRect(38, 27, 10, 3);
        g.fillRect(20, 40, 24, 4); g.fillRect(18, 37, 4, 4); g.fillRect(42, 37, 4, 4);
        break;
      case 'face_surprised':
        eye(18, 20, 8, 11); eye(38, 20, 8, 11);
        g.fillRect(27, 38, 10, 12); g.fillStyle = skin; g.fillRect(30, 41, 4, 6);
        break;
      default: // face_smile
        eye(19, 22); eye(39, 22);
        g.fillStyle = '#ffffff'; g.fillRect(21, 23, 2, 3); g.fillRect(41, 23, 2, 3);
        g.fillStyle = '#1b1b1b';
        g.fillRect(22, 40, 20, 3); g.fillRect(19, 37, 4, 4); g.fillRect(41, 37, 4, 4);
    }
  });
}

function shirtTexture(style, color) {
  return canvas(64, 64, (g) => {
    g.fillStyle = color;
    g.fillRect(0, 0, 64, 64);
    switch (style) {
      case 'shirt_stripes':
        g.fillStyle = 'rgba(255,255,255,0.75)';
        for (let y = 4; y < 64; y += 12) g.fillRect(0, y, 64, 5);
        break;
      case 'shirt_hoodie':
        g.fillStyle = 'rgba(0,0,0,0.18)'; g.fillRect(14, 38, 36, 16);
        g.fillStyle = '#ffffff'; g.fillRect(26, 6, 2, 16); g.fillRect(36, 6, 2, 16);
        break;
      case 'shirt_suit':
        g.fillStyle = '#ffffff';
        g.beginPath(); g.moveTo(20, 0); g.lineTo(44, 0); g.lineTo(32, 34); g.closePath(); g.fill();
        g.fillStyle = '#c62828'; g.fillRect(30, 4, 4, 26);
        g.fillStyle = 'rgba(255,255,255,0.6)'; g.fillRect(31, 40, 2, 2); g.fillRect(31, 50, 2, 2);
        break;
      case 'shirt_star': {
        g.fillStyle = '#ffd54f';
        g.beginPath();
        for (let i = 0; i < 10; i++) {
          const r = i % 2 ? 7 : 16, a = -Math.PI / 2 + (i * Math.PI) / 5;
          g.lineTo(32 + Math.cos(a) * r, 30 + Math.sin(a) * r);
        }
        g.fill();
        break;
      }
      default:
        g.fillStyle = 'rgba(0,0,0,0.12)'; g.fillRect(24, 0, 16, 5);
    }
  });
}

/**
 * Crea un avatar. Estructura:
 * root (pies) > body > [torso, neck>head, lArm, rArm, lLeg, rLeg, extras]
 */
export class AvatarModel {
  constructor(data = DEFAULT_AVATAR, { name = null, level = null, shadows = true, title = null } = {}) {
    this.root = new THREE.Group();
    this.root.name = 'avatar';
    this.shadows = shadows;
    this.name = name;
    this.level = level;
    this.effectTime = 0;
    this.build(data);
    if (name) this.setNameTag(name, level, title);
  }

  build(data) {
    this.data = { ...DEFAULT_AVATAR, ...data };
    const d = this.data;
    if (this.effect?.pts.parent && this.effect.pts.parent !== this.body) this.effect.pts.parent.remove(this.effect.pts);
    this.cape = null;
    this.halo = null;
    if (this.body) {
      this.root.remove(this.body);
      this.disposeTree(this.body);
    }
    const body = new THREE.Group();
    this.body = body;
    this.root.add(body);

    const skin = std(d.skin);
    const shirt = std(d.shirtColor);
    const pants = std(d.pantsColor);
    const shoes = std(d.shoesColor);
    const longSleeves = ['shirt_hoodie', 'shirt_suit', 'shirt_stripes'].includes(d.shirt);

    // Torso con textura frontal
    const front = new THREE.MeshStandardMaterial({ map: shirtTexture(d.shirt, d.shirtColor), roughness: 0.75 });
    const torso = new THREE.Mesh(new THREE.BoxGeometry(0.8, 0.72, 0.42), [shirt, shirt, shirt, shirt, front, shirt]);
    torso.position.y = 1.1;
    torso.castShadow = true;
    body.add(torso);
    this.torso = torso;
    if (d.shirt === 'shirt_hoodie') body.add(box(0.5, 0.3, 0.16, shirt, 0, 1.52, -0.26));

    // Cabeza
    const neck = new THREE.Group();
    neck.position.y = 1.47;
    body.add(neck);
    this.neck = neck;
    const faceMat = new THREE.MeshStandardMaterial({ map: faceTexture(d.face, d.skin), roughness: 0.7 });
    const head = new THREE.Mesh(new THREE.BoxGeometry(0.62, 0.6, 0.6), [skin, skin, skin, skin, faceMat, skin]);
    head.position.y = 0.32;
    head.castShadow = true;
    neck.add(head);
    this.head = head;
    this.buildHair(neck, d);

    // Brazos
    const arm = (side) => {
      const pivot = new THREE.Group();
      pivot.position.set(side * 0.54, 1.4, 0);
      if (longSleeves) {
        pivot.add(box(0.26, 0.62, 0.3, shirt, 0, -0.3, 0));
        pivot.add(box(0.24, 0.14, 0.28, skin, 0, -0.68, 0));
      } else {
        pivot.add(box(0.28, 0.3, 0.32, shirt, 0, -0.14, 0));
        pivot.add(box(0.24, 0.46, 0.28, skin, 0, -0.52, 0));
      }
      body.add(pivot);
      return pivot;
    };
    this.lArm = arm(-1);
    this.rArm = arm(1);

    // Piernas
    const leg = (side) => {
      const pivot = new THREE.Group();
      pivot.position.set(side * 0.2, 0.76, 0);
      if (d.pants === 'pants_shorts') {
        pivot.add(box(0.36, 0.3, 0.38, pants, 0, -0.15, 0));
        pivot.add(box(0.32, 0.3, 0.34, skin, 0, -0.45, 0));
      } else {
        pivot.add(box(0.36, 0.6, 0.38, pants, 0, -0.3, 0));
        if (d.pants === 'pants_cargo') pivot.add(box(0.06, 0.18, 0.2, std(new THREE.Color(d.pantsColor).multiplyScalar(0.7)), side * 0.2, -0.3, 0));
      }
      pivot.add(box(0.38, 0.16, 0.46, shoes, 0, -0.68, 0.03));
      body.add(pivot);
      return pivot;
    };
    this.lLeg = leg(-1);
    this.rLeg = leg(1);

    for (const acc of d.accessories || []) this.buildAccessory(acc, d);
    this.buildEffect(d.effect);
    if (!this.shadows) body.traverse((c) => { c.castShadow = false; });
  }

  buildHair(neck, d) {
    const m = std(d.hairColor, { roughness: 0.9 });
    const H = (w, h, dd, x, y, z) => neck.add(box(w, h, dd, m, x, y, z));
    switch (d.hair) {
      case 'hair_short':
        H(0.66, 0.14, 0.66, 0, 0.66, 0); H(0.66, 0.36, 0.12, 0, 0.48, -0.28); H(0.08, 0.2, 0.5, -0.32, 0.54, -0.04); H(0.08, 0.2, 0.5, 0.32, 0.54, -0.04);
        break;
      case 'hair_long':
        H(0.66, 0.14, 0.66, 0, 0.66, 0); H(0.68, 0.8, 0.14, 0, 0.28, -0.3); H(0.1, 0.6, 0.5, -0.34, 0.36, -0.04); H(0.1, 0.6, 0.5, 0.34, 0.36, -0.04);
        break;
      case 'hair_spiky':
        H(0.66, 0.12, 0.66, 0, 0.65, 0);
        for (let i = 0; i < 6; i++) {
          const cone = new THREE.Mesh(new THREE.ConeGeometry(0.13, 0.3, 4), m);
          cone.position.set(((i % 3) - 1) * 0.2, 0.82, i < 3 ? 0.12 : -0.14);
          cone.rotation.z = ((i % 3) - 1) * 0.3;
          neck.add(cone);
        }
        break;
      case 'hair_bun': {
        H(0.66, 0.14, 0.66, 0, 0.66, 0); H(0.66, 0.36, 0.12, 0, 0.48, -0.28);
        const bun = new THREE.Mesh(new THREE.SphereGeometry(0.18, 10, 8), m);
        bun.position.set(0, 0.82, -0.18);
        neck.add(bun);
        break;
      }
      case 'hair_mohawk':
        H(0.14, 0.32, 0.62, 0, 0.76, 0);
        break;
      default:
        break;
    }
  }

  buildAccessory(id, d) {
    const n = this.neck;
    const gold = std('#ffca28', { metalness: 0.7, roughness: 0.3 });
    const dark = std('#212121');
    switch (id) {
      case 'acc_cap':
        n.add(box(0.68, 0.18, 0.68, std('#e53935'), 0, 0.7, 0));
        n.add(box(0.6, 0.05, 0.32, std('#e53935'), 0, 0.63, 0.44));
        break;
      case 'acc_tophat': {
        const hat = new THREE.Mesh(new THREE.CylinderGeometry(0.28, 0.28, 0.5, 16), dark);
        hat.position.y = 0.9;
        const brim = new THREE.Mesh(new THREE.CylinderGeometry(0.46, 0.46, 0.04, 16), dark);
        brim.position.y = 0.64;
        const band = new THREE.Mesh(new THREE.CylinderGeometry(0.285, 0.285, 0.08, 16), std('#c62828'));
        band.position.y = 0.72;
        n.add(hat, brim, band);
        break;
      }
      case 'acc_crown': {
        const ring = new THREE.Mesh(new THREE.CylinderGeometry(0.3, 0.3, 0.16, 16, 1, true), gold);
        ring.position.y = 0.72;
        n.add(ring);
        for (let i = 0; i < 6; i++) {
          const a = (i / 6) * Math.PI * 2;
          const spike = new THREE.Mesh(new THREE.ConeGeometry(0.06, 0.16, 4), gold);
          spike.position.set(Math.cos(a) * 0.28, 0.87, Math.sin(a) * 0.28);
          n.add(spike);
        }
        break;
      }
      case 'acc_glasses':
        n.add(box(0.2, 0.14, 0.03, dark, -0.14, 0.38, 0.31)); n.add(box(0.2, 0.14, 0.03, dark, 0.14, 0.38, 0.31));
        n.add(box(0.1, 0.03, 0.03, dark, 0, 0.4, 0.31));
        n.children.at(-2).material = n.children.at(-3).material = new THREE.MeshStandardMaterial({ color: '#90caf9', transparent: true, opacity: 0.5 });
        break;
      case 'acc_sunglasses':
        n.add(box(0.56, 0.14, 0.04, std('#111111', { metalness: 0.5, roughness: 0.2 }), 0, 0.38, 0.31));
        break;
      case 'acc_headphones': {
        const band = new THREE.Mesh(new THREE.TorusGeometry(0.36, 0.04, 6, 16, Math.PI), dark);
        band.position.y = 0.36;
        n.add(band);
        n.add(box(0.1, 0.24, 0.24, std('#7c4dff'), -0.36, 0.34, 0)); n.add(box(0.1, 0.24, 0.24, std('#7c4dff'), 0.36, 0.34, 0));
        break;
      }
      case 'acc_backpack':
        this.body.add(box(0.6, 0.6, 0.24, std('#ff7043'), 0, 1.1, -0.33));
        this.body.add(box(0.4, 0.2, 0.06, std('#ffab91'), 0, 0.98, -0.47));
        break;
      case 'acc_cape': {
        const pivot = new THREE.Group();
        pivot.position.set(0, 1.44, -0.23);
        pivot.add(box(0.76, 1.15, 0.04, std('#c62828', { side: THREE.DoubleSide }), 0, -0.57, 0));
        this.body.add(pivot);
        this.cape = pivot;
        break;
      }
      case 'acc_halo': {
        const halo = new THREE.Mesh(new THREE.TorusGeometry(0.26, 0.04, 8, 24), new THREE.MeshBasicMaterial({ color: '#fff59d' }));
        halo.rotation.x = Math.PI / 2;
        halo.position.y = 0.95;
        n.add(halo);
        this.halo = halo;
        break;
      }
      default:
        break;
    }
  }

  buildEffect(effect) {
    this.effect = null;
    if (!effect) return;
    const n = effect === 'fx_rainbow' ? 40 : 28;
    const pos = new Float32Array(n * 3);
    const col = new Float32Array(n * 3);
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.BufferAttribute(pos, 3));
    g.setAttribute('color', new THREE.BufferAttribute(col, 3));
    const m = new THREE.PointsMaterial({ size: 0.16, vertexColors: true, transparent: true, opacity: 0.9, depthWrite: false });
    const pts = new THREE.Points(g, m);
    pts.frustumCulled = false;
    const seeds = Array.from({ length: n }, () => Math.random());
    const c = new THREE.Color();
    for (let i = 0; i < n; i++) {
      if (effect === 'fx_fire') c.setHSL(0.02 + seeds[i] * 0.1, 1, 0.55);
      else if (effect === 'fx_rainbow') c.setHSL(i / n, 0.9, 0.6);
      else c.setHSL(0.13 + seeds[i] * 0.4, 0.8, 0.8);
      col.set([c.r, c.g, c.b], i * 3);
    }
    this.effect = { type: effect, pts, seeds, trail: [] };
    if (effect === 'fx_rainbow') this.root.parent ? this.root.parent.add(pts) : (this.pendingTrail = pts);
    else this.body.add(pts);
  }

  /** Animación de efectos (llamar cada frame). moving: si se desplaza. */
  updateEffects(dt, moving) {
    this.effectTime += dt;
    const t = this.effectTime;
    if (this.halo) this.halo.position.y = 0.95 + Math.sin(t * 3) * 0.03;
    if (this.cape) this.cape.rotation.x = 0.15 + (moving ? 0.4 + Math.sin(t * 10) * 0.08 : Math.sin(t * 2) * 0.04);
    const e = this.effect;
    if (!e) return;
    // Los efectos de partículas se pueden desactivar en la configuración gráfica.
    e.pts.visible = settings.get('effects');
    if (!e.pts.visible) return;
    const pos = e.pts.geometry.attributes.position;
    const n = pos.count;
    if (e.type === 'fx_sparkles') {
      for (let i = 0; i < n; i++) {
        const s = e.seeds[i];
        const a = t * (1 + s) + s * 20;
        pos.setXYZ(i, Math.cos(a) * (0.7 + s * 0.3), 0.3 + ((t * 0.5 + s) % 1) * 2, Math.sin(a) * (0.7 + s * 0.3));
      }
    } else if (e.type === 'fx_fire') {
      for (let i = 0; i < n; i++) {
        const s = e.seeds[i];
        const life = (t * (0.8 + s) + s) % 1;
        const a = s * 40;
        pos.setXYZ(i, Math.cos(a) * 0.45 * (1 - life), life * 2.3, Math.sin(a) * 0.35 * (1 - life));
      }
    } else if (e.type === 'fx_rainbow') {
      if (this.pendingTrail && this.root.parent) {
        this.root.parent.add(this.pendingTrail);
        this.pendingTrail = null;
      }
      const p = this.root.position;
      e.trail.unshift([p.x, p.y + 0.3, p.z]);
      if (e.trail.length > n) e.trail.length = n;
      for (let i = 0; i < n; i++) {
        const q = e.trail[Math.min(i, e.trail.length - 1)];
        pos.setXYZ(i, q[0], q[1] + Math.sin(i * 0.5 + t * 4) * 0.08, q[2]);
      }
      e.pts.visible = moving || e.trail.length < n;
    }
    pos.needsUpdate = true;
  }

  /** Etiqueta sobre la cabeza. Con  es un personaje no jugador (NPC). */
  setNameTag(name, level, title = null) {
    if (this.tag) {
      this.root.remove(this.tag);
      this.tag.material.map.dispose();
      this.tag.material.dispose();
    }
    const c = document.createElement('canvas');
    c.width = 256;
    c.height = 64;
    const g = c.getContext('2d');
    g.font = '800 28px Nunito, system-ui, sans-serif';
    const label = title ? `${name}  ·  ${title}` : level ? `${name}  ·  Nv ${level}` : name;
    const w = Math.min(250, g.measureText(label).width + 28);
    g.fillStyle = title ? 'rgba(0,120,105,0.75)' : 'rgba(15,17,40,0.65)';
    g.beginPath();
    g.roundRect((256 - w) / 2, 10, w, 44, 14);
    g.fill();
    g.fillStyle = '#ffffff';
    g.textAlign = 'center';
    g.textBaseline = 'middle';
    g.fillText(label, 128, 33);
    const tex = new THREE.CanvasTexture(c);
    tex.colorSpace = THREE.SRGBColorSpace;
    const s = new THREE.Sprite(new THREE.SpriteMaterial({ map: tex, depthTest: true, transparent: true }));
    s.scale.set(3.2, 0.8, 1);
    s.position.y = 2.75;
    this.root.add(s);
    this.tag = s;
  }

  disposeTree(obj) {
    obj.traverse((c) => {
      c.geometry?.dispose();
      const mats = Array.isArray(c.material) ? c.material : c.material ? [c.material] : [];
      mats.forEach((m) => { m.map?.dispose(); m.dispose(); });
    });
  }

  dispose() {
    this.disposeTree(this.root);
    if (this.effect?.pts.parent && this.effect.pts.parent !== this.body) {
      this.effect.pts.parent.remove(this.effect.pts);
    }
    this.root.parent?.remove(this.root);
  }
}
