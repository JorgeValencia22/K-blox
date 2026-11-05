// Slow Roads (cliente): paisaje infinito. La carretera (shared/slowroads/road.js) se dibuja en trozos de
// 48 m que se crean por delante del coche y se destruyen por detrás; cielo con ciclo de día y noche,
// estrellas, nubes, niebla y lluvia. Todo se pinta con la misma función de altura que usa la física.
import * as THREE from 'three';
import { RoomEnvironment } from 'three/examples/jsm/environments/RoomEnvironment.js';
import { STEP, ROAD_HALF, SHOULDER, MAX_LAT } from '../../../../shared/slowroads/road.js';
import { canvasTex } from '../galaxia/kit.js';
import { engine } from '../../engine/renderer.js';

const CH = 16; // puntos por trozo (48 m)
const LATS = [-MAX_LAT, -72, -54, -40, -30, -22, -16, -12, -9.5, -7.8, -ROAD_HALF, 0, ROAD_HALF, 7.8, 9.5, 12, 16, 22, 30, 40, 54, 72, MAX_LAT];
const AHEAD = 760, BEHIND = 130;
const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
const lerp = (a, b, t) => a + (b - a) * t;
const C = (hex) => new THREE.Color(hex);

function mulberry(a) {
  return () => { a |= 0; a = (a + 0x6d2b79f5) | 0; let t = Math.imul(a ^ (a >>> 15), 1 | a); t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
}

// Paleta del cielo a lo largo del día (t: 0 = medianoche, .5 = mediodía)
const KEYS = [
  { t: 0.0, top: '#03060f', hor: '#0b1226', fog: '#0a1022', sun: '#6d7fb8', sunI: 0.0, amb: 0.4, hemi: 0.42, star: 1 },
  { t: 0.2, top: '#0b1430', hor: '#3a3f6a', fog: '#2c3358', sun: '#ffa56a', sunI: 0.1, amb: 0.4, hemi: 0.4, star: 0.7 },
  { t: 0.27, top: '#2b4a86', hor: '#ff9d6a', fog: '#d9a58a', sun: '#ffb27a', sunI: 0.9, amb: 0.5, hemi: 0.5, star: 0.1 },
  { t: 0.36, top: '#3d79c9', hor: '#b9dcf3', fog: '#bcd9ec', sun: '#fff1d6', sunI: 2.0, amb: 0.7, hemi: 0.8, star: 0 },
  { t: 0.5, top: '#2f6fd0', hor: '#a9d4f5', fog: '#b4d6ee', sun: '#fffaf0', sunI: 2.6, amb: 0.8, hemi: 0.95, star: 0 },
  { t: 0.64, top: '#3a74c6', hor: '#b4d6ee', fog: '#bad6e9', sun: '#fff0d0', sunI: 2.1, amb: 0.7, hemi: 0.85, star: 0 },
  { t: 0.72, top: '#46528f', hor: '#ff8f5a', fog: '#e09a7c', sun: '#ff9a5a', sunI: 1.1, amb: 0.5, hemi: 0.5, star: 0.1 },
  { t: 0.78, top: '#1a2149', hor: '#8a4a6d', fog: '#5a4766', sun: '#ff7f55', sunI: 0.2, amb: 0.4, hemi: 0.4, star: 0.6 },
  { t: 0.86, top: '#060b1e', hor: '#1a2144', fog: '#131a36', sun: '#6d7fb8', sunI: 0.0, amb: 0.4, hemi: 0.42, star: 1 },
  { t: 1.0, top: '#03060f', hor: '#0b1226', fog: '#0a1022', sun: '#6d7fb8', sunI: 0.0, amb: 0.4, hemi: 0.42, star: 1 },
];
KEYS.forEach((k) => { k.top = C(k.top); k.hor = C(k.hor); k.fog = C(k.fog); k.sun = C(k.sun); });
function keyAt(t) {
  t = ((t % 1) + 1) % 1;
  let i = 0;
  while (i < KEYS.length - 2 && KEYS[i + 1].t <= t) i++;
  const a = KEYS[i], b = KEYS[i + 1], f = (t - a.t) / (b.t - a.t);
  const o = { top: a.top.clone().lerp(b.top, f), hor: a.hor.clone().lerp(b.hor, f), fog: a.fog.clone().lerp(b.fog, f), sun: a.sun.clone().lerp(b.sun, f) };
  for (const k of ['sunI', 'amb', 'hemi', 'star']) o[k] = lerp(a[k], b[k], f);
  return o;
}

const SKY_VS = 'varying vec3 vDir; void main(){ vDir = normalize(position); vec4 p = modelViewMatrix * vec4(position,1.0); gl_Position = projectionMatrix * p; gl_Position.z = gl_Position.w; }';
const SKY_FS = `varying vec3 vDir; uniform vec3 top; uniform vec3 hor; uniform vec3 sunDir; uniform vec3 sunCol; uniform float sunI; uniform vec3 moonDir;
void main(){
  float h = clamp(vDir.y, -0.2, 1.0);
  float g = pow(clamp(h, 0.0, 1.0), 0.55);
  vec3 c = mix(hor, top, g);
  c = mix(c, hor * 0.85, smoothstep(0.0, -0.2, vDir.y));
  float sd = max(dot(normalize(vDir), normalize(sunDir)), 0.0);
  c += sunCol * (pow(sd, 6.0) * 0.18 + pow(sd, 90.0) * 0.55 + pow(sd, 2200.0) * 3.0) * clamp(sunI, 0.0, 1.5) * 0.7;
  float md = max(dot(normalize(vDir), normalize(moonDir)), 0.0);
  c += vec3(0.75, 0.82, 1.0) * (pow(md, 900.0) * 1.6 + pow(md, 40.0) * 0.06);
  gl_FragColor = vec4(c, 1.0);
}`;

function noiseCanvasTex(size, draw, repeat) { return canvasTex(size, size, draw, repeat); }

function roadTexture() {
  return canvasTex(256, 256, (g, w, h) => {
    g.fillStyle = '#3b3d42'; g.fillRect(0, 0, w, h);
    for (let i = 0; i < 5200; i++) {
      const v = Math.random();
      g.fillStyle = v < 0.5 ? 'rgba(0,0,0,.10)' : 'rgba(255,255,255,.07)';
      g.fillRect(Math.random() * w, Math.random() * h, 1 + Math.random() * 2, 1 + Math.random() * 2);
    }
    // huellas más oscuras donde ruedan los neumáticos
    for (const cx of [0.27, 0.73]) { const gr = g.createLinearGradient((cx - 0.09) * w, 0, (cx + 0.09) * w, 0); gr.addColorStop(0, 'rgba(0,0,0,0)'); gr.addColorStop(0.5, 'rgba(0,0,0,.14)'); gr.addColorStop(1, 'rgba(0,0,0,0)'); g.fillStyle = gr; g.fillRect((cx - 0.09) * w, 0, 0.18 * w, h); }
    g.fillStyle = '#e8e8e2';
    g.fillRect(w * 0.045, 0, w * 0.018, h); g.fillRect(w * 0.937, 0, w * 0.018, h);
    g.fillStyle = '#f2d25c';
    g.fillRect(w * 0.491, 0, w * 0.018, h * 0.36);
  });
}

function glowTex() {
  return canvasTex(64, 64, (g, w, h) => { const gr = g.createRadialGradient(w / 2, h / 2, 0, w / 2, h / 2, w / 2); gr.addColorStop(0, 'rgba(255,255,255,1)'); gr.addColorStop(1, 'rgba(255,255,255,0)'); g.fillStyle = gr; g.fillRect(0, 0, w, h); });
}
function cloudTex() {
  return canvasTex(128, 64, (g, w, h) => {
    for (let i = 0; i < 16; i++) {
      const x = 22 + Math.random() * (w - 44), y = 20 + Math.random() * (h - 36), r = 10 + Math.random() * 16;
      const gr = g.createRadialGradient(x, y, 0, x, y, r); gr.addColorStop(0, 'rgba(255,255,255,.55)'); gr.addColorStop(1, 'rgba(255,255,255,0)');
      g.fillStyle = gr; g.fillRect(x - r, y - r, r * 2, r * 2);
    }
  });
}

export class SlowWorld {
  constructor(road, { shadows = true, renderer = null } = {}) {
    this.road = road;
    this.scene = new THREE.Scene();
    this.chunks = new Map();
    this.shadows = shadows;
    this.time = 0.42; this.weather = 'clear';
    this.wetT = 0; this.rainAmt = 0; this.fogMul = 1;
    this.windows = [];
    this.scene.fog = new THREE.Fog('#b4d6ee', 80, 640);

    // Cielo
    this.skyMat = new THREE.ShaderMaterial({
      vertexShader: SKY_VS, fragmentShader: SKY_FS, side: THREE.BackSide, depthWrite: false, fog: false,
      uniforms: { top: { value: C('#2f6fd0') }, hor: { value: C('#a9d4f5') }, sunDir: { value: new THREE.Vector3(0, 1, 0) }, sunCol: { value: C('#fff') }, sunI: { value: 1 }, moonDir: { value: new THREE.Vector3(0, -1, 0) } },
    });
    this.sky = new THREE.Mesh(new THREE.SphereGeometry(1000, 32, 16), this.skyMat);
    this.sky.renderOrder = -10; this.sky.frustumCulled = false;
    this.scene.add(this.sky);
    // Estrellas
    const sp = new Float32Array(900 * 3), rng = mulberry(7);
    for (let i = 0; i < 900; i++) { const a = rng() * Math.PI * 2, y = rng() * 0.95 + 0.04, r = Math.sqrt(1 - y * y); sp[i * 3] = Math.cos(a) * r * 950; sp[i * 3 + 1] = y * 950; sp[i * 3 + 2] = Math.sin(a) * r * 950; }
    const sg = new THREE.BufferGeometry(); sg.setAttribute('position', new THREE.BufferAttribute(sp, 3));
    this.stars = new THREE.Points(sg, new THREE.PointsMaterial({ color: '#ffffff', size: 2.2, sizeAttenuation: false, transparent: true, opacity: 0, fog: false, depthWrite: false }));
    this.stars.frustumCulled = false;
    this.scene.add(this.stars);
    // Nubes
    this.clouds = new THREE.Group();
    const ct = cloudTex();
    for (let i = 0; i < 22; i++) {
      const m = new THREE.Mesh(new THREE.PlaneGeometry(1, 1), new THREE.MeshBasicMaterial({ map: ct, transparent: true, depthWrite: false, fog: false, opacity: 0.85 }));
      const a = rng() * Math.PI * 2, d = 250 + rng() * 650;
      m.position.set(Math.cos(a) * d, 130 + rng() * 120, Math.sin(a) * d);
      m.scale.set(280 + rng() * 380, 130 + rng() * 120, 1);
      m.rotation.x = Math.PI / 2; m.userData.speed = 1.5 + rng() * 2.5;
      this.clouds.add(m);
    }
    this.scene.add(this.clouds);

    // Luces
    this.hemi = new THREE.HemisphereLight('#bcd9ff', '#4a5a3a', 0.9);
    this.scene.add(this.hemi);
    this.sun = new THREE.DirectionalLight('#fff4d6', 2.4);
    this.sun.castShadow = shadows;
    this.sun.shadow.mapSize.set(2048, 2048);
    const sc = this.sun.shadow.camera;
    sc.left = -34; sc.right = 34; sc.top = 34; sc.bottom = -34; sc.near = 1; sc.far = 260;
    this.sun.shadow.bias = -0.0004; this.sun.shadow.normalBias = 0.05;
    this.scene.add(this.sun, this.sun.target);
    // Reflejos suaves para la pintura del coche
    try {
      const pm = new THREE.PMREMGenerator(renderer || engine.renderer);
      this.scene.environment = pm.fromScene(new RoomEnvironment(), 0.04).texture;
      this.scene.environmentIntensity = 0.7;
      pm.dispose();
    } catch { /* sin reflejos */ }

    // Materiales compartidos
    this.roadMat = new THREE.MeshLambertMaterial({ map: roadTexture(), polygonOffset: true, polygonOffsetFactor: -2, polygonOffsetUnits: -2 });
    this.roadMat.map.wrapS = this.roadMat.map.wrapT = THREE.RepeatWrapping;
    this.groundMat = new THREE.MeshLambertMaterial({ vertexColors: true });
    this.trunkMat = new THREE.MeshLambertMaterial({ color: '#5a4030' });
    this.pineMat = new THREE.MeshLambertMaterial({ color: '#ffffff' });
    this.leafMat = new THREE.MeshLambertMaterial({ color: '#ffffff' });
    this.rockMat = new THREE.MeshLambertMaterial({ color: '#8d8d88', flatShading: true });
    this.postMat = new THREE.MeshLambertMaterial({ color: '#e9e9e4' });
    this.geo = {
      trunk: new THREE.CylinderGeometry(0.18, 0.28, 3, 6).translate(0, 1.5, 0),
      pine: mergeCones(),
      leaf: new THREE.IcosahedronGeometry(2.4, 0).translate(0, 4.6, 0),
      rock: new THREE.DodecahedronGeometry(1, 0),
      post: new THREE.BoxGeometry(0.1, 0.9, 0.1).translate(0, 0.45, 0),
    };
    this.rainLines = null;
    this.setTime(this.time);
  }

  // ---------------------------------------------------------------------------------- trozos
  buildChunk(idx) {
    const road = this.road;
    const i0 = idx * CH;
    const rows = CH + 1, cols = LATS.length;
    const pos = new Float32Array(rows * cols * 3), nor = new Float32Array(rows * cols * 3), col = new Float32Array(rows * cols * 3);
    const rpos = new Float32Array(rows * 2 * 3), rnor = new Float32Array(rows * 2 * 3), ruv = new Float32Array(rows * 2 * 2);
    const tmp = {}, rng = mulberry(road.seed * 7919 + idx * 104729);
    const c = new THREE.Color();
    const centers = [];
    for (let r = 0; r < rows; r++) {
      const s = (i0 + r) * STEP;
      const p = road.at(s, {}); centers.push(p);
      for (let k = 0; k < cols; k++) {
        const lat = LATS[k];
        const x = p.x + p.lx * lat, z = p.z + p.lz * lat;
        const y = road.heightAt(x, z, lat, p.y);
        const o = (r * cols + k) * 3;
        pos[o] = x; pos[o + 1] = y; pos[o + 2] = z;
        const e = 1.2;
        const hx = road.heightAt(x + e, z, lat, p.y) - road.heightAt(x - e, z, lat, p.y);
        const hz = road.heightAt(x, z + e, lat, p.y) - road.heightAt(x, z - e, lat, p.y);
        const n = new THREE.Vector3(-hx / (2 * e), 1, -hz / (2 * e)).normalize();
        nor[o] = n.x; nor[o + 1] = n.y; nor[o + 2] = n.z;
        // color: hierba con variación por altura y mancha, tierra en el arcén, roca en las laderas
        const d = Math.abs(lat), hills = road.hills(x, z);
        const patch = 0.5 + 0.5 * Math.sin(x * 0.045) * Math.cos(z * 0.039);
        c.setRGB(lerp(0.2, 0.34, patch) + clamp(hills / 120, 0, 0.18), lerp(0.42, 0.55, patch) + clamp(hills / 220, -0.05, 0.1), lerp(0.14, 0.2, patch));
        if (d < ROAD_HALF + SHOULDER + 0.5) c.lerp(new THREE.Color('#8a7a5a'), 1 - smoothClamp((d - ROAD_HALF) / (SHOULDER + 0.6)));
        if (n.y < 0.82) c.lerp(new THREE.Color('#7b7568'), clamp((0.82 - n.y) * 4, 0, 0.85));
        if (hills > 34 && d > 20) c.lerp(new THREE.Color('#e9eef2'), clamp((hills - 34) / 8, 0, 1) * 0.9);
        col[o] = c.r; col[o + 1] = c.g; col[o + 2] = c.b;
      }
      for (let k = 0; k < 2; k++) {
        const lat = k ? ROAD_HALF : -ROAD_HALF, o = (r * 2 + k) * 3;
        rpos[o] = p.x + p.lx * lat; rpos[o + 1] = p.y + 0.035; rpos[o + 2] = p.z + p.lz * lat;
        rnor[o] = 0; rnor[o + 1] = 1; rnor[o + 2] = 0;
        ruv[(r * 2 + k) * 2] = k; ruv[(r * 2 + k) * 2 + 1] = s / 12;
      }
    }
    const idxs = [], ridx = [];
    for (let r = 0; r < CH; r++) {
      for (let k = 0; k < cols - 1; k++) {
        const a = r * cols + k, b = a + 1, cc = a + cols, d = cc + 1;
        idxs.push(a, cc, b, b, cc, d);
      }
      const a = r * 2, b = a + 1, cc = a + 2, d = cc + 1;
      ridx.push(a, cc, b, b, cc, d);
    }
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.BufferAttribute(pos, 3));
    geo.setAttribute('normal', new THREE.BufferAttribute(nor, 3));
    geo.setAttribute('color', new THREE.BufferAttribute(col, 3));
    geo.setIndex(idxs);
    const ground = new THREE.Mesh(geo, this.groundMat);
    ground.receiveShadow = this.shadows;
    ground.frustumCulled = true;
    const rg = new THREE.BufferGeometry();
    rg.setAttribute('position', new THREE.BufferAttribute(rpos, 3));
    rg.setAttribute('normal', new THREE.BufferAttribute(rnor, 3));
    rg.setAttribute('uv', new THREE.BufferAttribute(ruv, 2));
    rg.setIndex(ridx);
    const rd = new THREE.Mesh(rg, this.roadMat);
    rd.receiveShadow = this.shadows;
    const grp = new THREE.Group();
    grp.add(ground, rd);

    // Árboles, rocas y postes
    const trunks = [], pines = [], leaves = [], rocks = [], posts = [];
    const sMid = (i0 + CH / 2) * STEP, span = CH * STEP;
    for (let n = 0; n < 34; n++) {
      const s = i0 * STEP + rng() * span;
      const side = rng() < 0.5 ? -1 : 1;
      const lat = side * (ROAD_HALF + SHOULDER + 3 + Math.pow(rng(), 1.7) * 78);
      const p = road.at(s, tmp);
      const x = p.x + p.lx * lat, z = p.z + p.lz * lat;
      const hills = road.hills(x, z);
      if (hills > 36 || rng() < 0.18 * (hills < -6 ? 3 : 1)) continue;
      const y = road.heightAt(x, z, lat, p.y);
      const kind = rng();
      const sc = 0.8 + rng() * 1.1;
      const tone = 0.75 + rng() * 0.5;
      const item = { x, y, z, sc, ry: rng() * 6.28, tone };
      if (kind < 0.12) rocks.push({ ...item, sc: 0.5 + rng() * 1.8 });
      else if (kind < 0.62) { pines.push(item); trunks.push(item); } else { leaves.push(item); trunks.push(item); }
    }
    for (let s = Math.ceil(i0 * STEP / 30) * 30; s < (i0 + CH) * STEP; s += 30) {
      const p = road.at(s, tmp);
      for (const side of [-1, 1]) {
        const lat = side * (ROAD_HALF + 0.9), x = p.x + p.lx * lat, z = p.z + p.lz * lat;
        posts.push({ x, y: road.heightAt(x, z, lat, p.y), z, sc: 1, ry: p.psi, tone: 1 });
      }
    }
    this.addInstances(grp, this.geo.trunk, this.trunkMat, trunks, true, [0.8, 0.8, 0.8]);
    this.addInstances(grp, this.geo.pine, this.pineMat, pines, true, [0.08, 0.34, 0.16]);
    this.addInstances(grp, this.geo.leaf, this.leafMat, leaves, true, [0.22, 0.5, 0.16]);
    this.addInstances(grp, this.geo.rock, this.rockMat, rocks, false, [1, 1, 1], 0.6);
    this.addInstances(grp, this.geo.post, this.postMat, posts, false, [1, 1, 1]);
    this.scene.add(grp);
    return { grp, geos: [geo, rg], idx };
  }

  addInstances(grp, geo, mat, items, cast, base, squash = 1) {
    if (!items.length) return;
    const m = new THREE.InstancedMesh(geo, mat, items.length);
    const d = new THREE.Object3D(), col = new THREE.Color();
    items.forEach((it, i) => {
      d.position.set(it.x, it.y - 0.15, it.z); d.rotation.set(0, it.ry, 0); d.scale.set(it.sc, it.sc * squash, it.sc); d.updateMatrix();
      m.setMatrixAt(i, d.matrix);
      col.setRGB(base[0] * it.tone, base[1] * it.tone, base[2] * it.tone);
      m.setColorAt(i, col);
    });
    m.castShadow = cast && this.shadows;
    m.receiveShadow = false;
    m.frustumCulled = false;
    grp.add(m);
  }

  disposeChunk(ch) {
    this.scene.remove(ch.grp);
    ch.geos.forEach((g) => g.dispose());
    ch.grp.traverse((o) => { if (o.isInstancedMesh) o.dispose(); });
  }

  /** Crea los trozos que faltan por delante y borra los que quedan atrás. */
  streamChunks(s, max = 3) {
    const road = this.road;
    const from = Math.floor(Math.max(road.sMin + 1, s - BEHIND) / (CH * STEP));
    const to = Math.floor((s + AHEAD) / (CH * STEP));
    road.ensure((to + 2) * CH * STEP);
    let made = 0;
    for (let i = from; i <= to && made < max; i++) {
      if (this.chunks.has(i)) continue;
      this.chunks.set(i, this.buildChunk(i)); made++;
    }
    for (const [i, ch] of this.chunks) {
      if (i < from - 1 || i > to + 2) { this.disposeChunk(ch); this.chunks.delete(i); }
    }
    road.prune(s - BEHIND - 120);
    return made;
  }

  // ------------------------------------------------------------------------------- clima/hora
  setTime(t) { this.time = ((t % 1) + 1) % 1; this.applySky(); }
  setWeather(w) { this.weather = w; }

  get isNight() { return this.time < 0.22 || this.time > 0.8; }
  get night() { return 1 - clamp((keyAt(this.time).hemi - 0.4) / 0.35, 0, 1); }

  applySky() {
    const k = keyAt(this.time);
    const wx = this.weather;
    const grey = wx === 'rain' ? 0.65 : wx === 'fog' ? 0.5 : 0;
    const dim = 1 - grey * 0.45;
    const g = C('#8a929a').multiplyScalar(0.45 + k.hemi * 0.45);
    const top = k.top.clone().lerp(g, grey), hor = k.hor.clone().lerp(g, grey + (wx === 'fog' ? 0.2 : 0));
    const fog = k.fog.clone().lerp(g, grey + (wx === 'fog' ? 0.25 : 0));
    this.skyMat.uniforms.top.value.copy(top); this.skyMat.uniforms.hor.value.copy(hor);
    this.scene.fog.color.copy(fog);
    this.scene.fog.near = wx === 'fog' ? 10 : wx === 'rain' ? 40 : 90;
    this.scene.fog.far = wx === 'fog' ? 260 : wx === 'rain' ? 380 : 650;
    // Sol y luna recorren un arco; t = .25 amanecer (este), .5 mediodía, .75 atardecer
    const a = (this.time - 0.25) * Math.PI * 2;
    const sd = new THREE.Vector3(Math.cos(a) * 0.9, Math.sin(a), 0.38).normalize();
    this.sunDir = sd;
    this.skyMat.uniforms.sunDir.value.copy(sd);
    this.skyMat.uniforms.moonDir.value.set(-sd.x, -sd.y, -0.38).normalize();
    this.skyMat.uniforms.sunCol.value.copy(k.sun);
    this.skyMat.uniforms.sunI.value = k.sunI * (1 - grey * 0.8);
    this.hemi.intensity = k.hemi * dim;
    this.hemi.color.copy(hor).lerp(C('#ffffff'), 0.4);
    this.hemi.groundColor.set('#3a4a2c').multiplyScalar(0.5 + k.hemi * 0.5);
    this.sun.color.copy(k.sun);
    const moon = sd.y < -0.02;
    this.sun.intensity = (moon ? 0.7 * clamp(-sd.y * 4, 0, 1) : k.sunI) * (1 - grey * 0.85);
    this.sun.userData.dir = moon ? sd.clone().multiplyScalar(-1) : sd;
    this.scene.environmentIntensity = (0.15 + k.hemi * 0.6) * dim;
    this.stars.material.opacity = k.star * (1 - grey);
    this.cloudTone = k.hemi;
    for (const m of this.clouds.children) { m.material.color.setScalar(0.35 + k.hemi * 0.65 - grey * 0.2); m.material.opacity = (wx === 'clear' ? 0.55 : 0.95) * clamp(k.hemi + 0.2, 0.3, 1); }
  }

  update(dt, carPos, rain) {
    this.sky.position.copy(carPos);
    this.stars.position.copy(carPos);
    for (const m of this.clouds.children) { m.position.x += m.userData.speed * dt; if (m.position.x - carPos.x > 900) m.position.x -= 1800; if (m.position.x - carPos.x < -900) m.position.x += 1800; }
    this.clouds.position.set(carPos.x * 0.98, 0, carPos.z * 0.98);
    const d = this.sun.userData.dir || new THREE.Vector3(0.4, 1, 0.3);
    this.sun.position.set(carPos.x + d.x * 120, carPos.y + d.y * 120, carPos.z + d.z * 120);
    this.sun.target.position.copy(carPos);
    // Lluvia
    const raining = this.weather === 'rain';
    this.rainAmt += ((raining ? 1 : 0) - this.rainAmt) * Math.min(1, dt * 0.8);
    if (this.rainAmt > 0.02) {
      if (!this.rainLines) {
        const n = 1400, p = new Float32Array(n * 6);
        for (let i = 0; i < n; i++) { const x = (Math.random() - 0.5) * 70, y = Math.random() * 38, z = (Math.random() - 0.5) * 70; p.set([x, y, z, x, y - 1.1, z], i * 6); }
        const g = new THREE.BufferGeometry(); g.setAttribute('position', new THREE.BufferAttribute(p, 3));
        this.rainLines = new THREE.LineSegments(g, new THREE.LineBasicMaterial({ color: '#c8d4e0', transparent: true, opacity: 0.4, fog: false, depthWrite: false }));
        this.rainLines.frustumCulled = false;
        this.scene.add(this.rainLines);
      }
      const a = this.rainLines.geometry.attributes.position, arr = a.array;
      const fall = 32 * dt;
      for (let i = 0; i < arr.length; i += 6) {
        arr[i + 1] -= fall; arr[i + 4] -= fall;
        if (arr[i + 4] < 0) { const y = 36 + Math.random() * 4; arr[i + 1] = y; arr[i + 4] = y - 1.1; }
      }
      a.needsUpdate = true;
      this.rainLines.position.set(carPos.x, carPos.y, carPos.z);
      this.rainLines.material.opacity = 0.4 * this.rainAmt;
      this.rainLines.visible = true;
    } else if (this.rainLines) this.rainLines.visible = false;
  }

  dispose() {
    for (const ch of this.chunks.values()) this.disposeChunk(ch);
    this.chunks.clear();
    this.scene.environment?.dispose?.();
    for (const m of [this.roadMat, this.groundMat, this.trunkMat, this.pineMat, this.leafMat, this.rockMat, this.postMat, this.skyMat]) { m.map?.dispose?.(); m.dispose(); }
    Object.values(this.geo).forEach((g) => g.dispose());
    this.stars.geometry.dispose(); this.stars.material.dispose();
    this.rainLines?.geometry.dispose();
    this.scene.traverse((o) => { if (o.isMesh && o.material?.map && o.parent === this.clouds) o.material.map.dispose(); });
  }
}

const smoothClamp = (t) => { t = clamp(t, 0, 1); return t * t * (3 - 2 * t); };

function mergeCones() {
  // Pino: tres conos apilados en una sola geometría
  const parts = [[2.5, 3.2, 1.8], [2.0, 2.9, 3.4], [1.4, 2.5, 4.9]];
  const pos = [], nor = [], idx = [];
  let base = 0;
  for (const [r, h, y] of parts) {
    const g = new THREE.ConeGeometry(r, h, 8, 1).translate(0, y + h / 2 - 0.4, 0).toNonIndexed();
    const p = g.attributes.position.array, n = g.attributes.normal.array;
    for (let i = 0; i < p.length; i++) { pos.push(p[i]); nor.push(n[i]); }
    for (let i = 0; i < p.length / 3; i++) idx.push(base + i);
    base += p.length / 3;
    g.dispose();
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.setAttribute('normal', new THREE.Float32BufferAttribute(nor, 3));
  return g;
}

export { noiseCanvasTex, glowTex };
