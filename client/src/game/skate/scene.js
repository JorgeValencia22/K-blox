// Skate Pro (cliente): dibuja un mapa de shared/skate/maps.js con THREE. Cada pieza se construye a
// partir de los mismos datos que usa la física, así que lo que se ve es lo que se pisa.
import * as THREE from 'three';
import { canvasTex } from '../galaxia/kit.js';
import { prepare, bowlHeight } from '../../../../shared/skate/world.js';

const TAU = Math.PI * 2;

// ------------------------------------------------------------------------------------ texturas
function noiseTex(base, spots, size = 256, repeat = [1, 1], lines = null) {
  return canvasTex(size, size, (g, w, h) => {
    g.fillStyle = base; g.fillRect(0, 0, w, h);
    for (let i = 0; i < spots; i++) {
      const v = Math.random();
      g.fillStyle = v < 0.5 ? 'rgba(0,0,0,.07)' : 'rgba(255,255,255,.06)';
      g.fillRect(Math.random() * w, Math.random() * h, 1 + Math.random() * 3, 1 + Math.random() * 3);
    }
    if (lines) {
      g.strokeStyle = lines; g.lineWidth = 2;
      g.strokeRect(1, 1, w - 2, h - 2);
    }
  }, repeat);
}
const windowsTex = (lit) => canvasTex(128, 256, (g, w, h) => {
  g.fillStyle = '#1a1b2e'; g.fillRect(0, 0, w, h);
  for (let y = 6; y < h - 6; y += 18) for (let x = 6; x < w - 6; x += 16) {
    g.fillStyle = Math.random() < lit ? (Math.random() < 0.5 ? '#ffe08a' : '#8fd8ff') : '#262842';
    g.fillRect(x, y, 9, 11);
  }
}, [3, 4]);
const woodTex = () => canvasTex(256, 256, (g, w, h) => {
  g.fillStyle = '#a97a47'; g.fillRect(0, 0, w, h);
  for (let y = 0; y < h; y += 32) { g.fillStyle = y % 64 ? '#9a6c3b' : '#b3844f'; g.fillRect(0, y, w, 30); g.fillStyle = 'rgba(0,0,0,.25)'; g.fillRect(0, y + 30, w, 2); }
}, [6, 6]);
const sky = (top, bottom) => {
  const t = canvasTex(8, 256, (g, w, h) => { const gr = g.createLinearGradient(0, 0, 0, h); gr.addColorStop(0, top); gr.addColorStop(0.55, bottom); gr.addColorStop(1, bottom); g.fillStyle = gr; g.fillRect(0, 0, w, h); });
  return new THREE.Mesh(new THREE.SphereGeometry(500, 24, 16), new THREE.MeshBasicMaterial({ map: t, side: THREE.BackSide, fog: false, depthWrite: false }));
};

/** Prisma con perfil [z, y] extruido a lo ancho: rampas y cuartos de tubo. */
function prism(profile, width, base) {
  const sh = new THREE.Shape();
  sh.moveTo(profile[0][0], base);
  for (const [z, y] of profile) sh.lineTo(z, y);
  sh.lineTo(profile[profile.length - 1][0], base);
  const g = new THREE.ExtrudeGeometry(sh, { depth: width, bevelEnabled: false, steps: 1 });
  g.rotateY(-Math.PI / 2); // (x, y, z) → (-z, y, x)
  g.translate(width / 2, 0, 0);
  return g;
}

const PALETTE = {
  conc: '#bdbdb6', paint: '#e8e8e8', wood: '#a97a47', metal: '#8d949c', roof: '#4a4a58', side: '#a3a39c', vent: '#6c7480',
  bus: '#ffb300', cont: ['#c62828', '#1565c0', '#2e7d32', '#ef6c00', '#6a1b9a', '#00838f'],
};

export function buildScene(map) {
  const th = map.theme;
  const scene = new THREE.Scene();
  const root = new THREE.Group();
  scene.add(root);
  scene.fog = new THREE.Fog(th.fog, 60, th.haze ? 190 : 300);
  scene.background = new THREE.Color(th.fog);
  const disposables = [];
  const mats = new Map();
  const std = (key, color, o = {}) => {
    const k = key + color + JSON.stringify(Object.keys(o));
    if (!mats.has(k)) { const m = new THREE.MeshStandardMaterial({ color, roughness: 0.9, metalness: 0.02, ...o }); mats.set(k, m); disposables.push(m); }
    return mats.get(k);
  };
  const concTex = noiseTex('#ffffff', 900, 256, [24, 24]);
  const concrete = (tint) => std('c', tint, { map: concTex });
  const woodM = new THREE.MeshStandardMaterial({ map: woodTex(), roughness: 0.8 });
  disposables.push(woodM, concTex);
  const matFor = (p) => {
    switch (p.color) {
      case 'wood': return woodM;
      case 'paint': return concrete(th.night ? '#7a7a92' : '#d9d9d2');
      case 'metal': return std('m', PALETTE.metal, { metalness: 0.5, roughness: 0.5 });
      case 'roof': return concrete(th.night ? '#43435a' : PALETTE.roof);
      case 'side': return concrete(th.night ? '#4a4a60' : PALETTE.side);
      case 'vent': return std('v', PALETTE.vent, { metalness: 0.4, roughness: 0.6 });
      case 'bus': return std('b', PALETTE.bus, { roughness: 0.5 });
      case 'cont': { const c = PALETTE.cont[Math.floor((p.x * 7 + p.z * 3 + 100) % PALETTE.cont.length)]; return std('k', c, { roughness: 0.6, metalness: 0.2 }); }
      default: return concrete(th.night ? '#5d5d74' : PALETTE.conc);
    }
  };

  // ------------------------------------------------------------------------------------- luces
  scene.add(sky(th.night ? '#07031a' : th.sky, th.fog));
  scene.add(new THREE.HemisphereLight(th.night ? '#7a6cff' : '#ffffff', th.night ? '#201838' : '#8a8478', th.night ? 0.8 : 0.95 * th.light));
  const sun = new THREE.DirectionalLight(th.night ? '#9fb4ff' : th.dusk ? '#ffc68a' : '#fff4de', th.night ? 0.9 : 1.5 * th.light);
  sun.position.set(30, 50, 20);
  sun.castShadow = true;
  sun.shadow.mapSize.set(2048, 2048);
  const sc = sun.shadow.camera;
  sc.left = -34; sc.right = 34; sc.top = 34; sc.bottom = -34; sc.near = 1; sc.far = 140;
  sun.shadow.bias = -0.0006;
  scene.add(sun, sun.target);

  // --------------------------------------------------------------------------- suelo y piscinas
  const b = map.bounds, W = b.x1 - b.x0, D = b.z1 - b.z0;
  const bowls = map.prims.filter((p) => p.t === 'bowl').map(prepare);
  const edge = (bw, a) => { // punto del borde de una piscina en la dirección a (local)
    const dx = Math.cos(a), dz = Math.sin(a);
    const k = bw.sq ? 1 / ((dx / bw.rx) ** 4 + (dz / bw.rz) ** 4) ** 0.25 : 1 / Math.hypot(dx / bw.rx, dz / bw.rz);
    return [dx * k, dz * k];
  };
  const world = (bw, lx, lz) => [bw.x + lx * bw.c + lz * bw.s, bw.z - lx * bw.s + lz * bw.c];
  const N = 64;
  const shape = new THREE.Shape();
  const gx0 = b.x0 - 150, gx1 = b.x1 + 150, gz0 = b.z0 - 150, gz1 = b.z1 + 150;
  shape.moveTo(gx0, -gz0); shape.lineTo(gx1, -gz0); shape.lineTo(gx1, -gz1); shape.lineTo(gx0, -gz1); shape.lineTo(gx0, -gz0);
  for (const bw of bowls) {
    const hole = new THREE.Path();
    for (let i = 0; i < N; i++) { const [lx, lz] = edge(bw, (i / N) * TAU); const [wx, wz] = world(bw, lx, lz); i ? hole.lineTo(wx, -wz) : hole.moveTo(wx, -wz); }
    shape.holes.push(hole);
  }
  const groundTex = th.sea ? noiseTex('#ffffff', 600, 256, [40, 40]) : concTex;
  const ground = new THREE.Mesh(new THREE.ShapeGeometry(shape), new THREE.MeshStandardMaterial({ color: th.night ? '#2b2940' : th.ground, map: groundTex, roughness: 0.95 }));
  ground.rotation.x = -Math.PI / 2;
  ground.receiveShadow = true;
  root.add(ground);
  disposables.push(ground.geometry, ground.material);
  for (const bw of bowls) {
    const R = 14, pos = [], col = [], idx = [];
    const cLow = new THREE.Color('#4fb3d4'), cHigh = new THREE.Color(th.night ? '#7c7c95' : '#d3d3cc');
    for (let r = 0; r <= R; r++) {
      const rho = r === 0 ? 0 : (r / R) ** 0.8;
      for (let i = 0; i <= N; i++) {
        const [lx, lz] = edge(bw, (i / N) * TAU);
        const x = lx * rho, z = lz * rho;
        const y = bowlHeight(bw, x * 0.9999, z * 0.9999) ?? bw.y0;
        const [wx, wz] = world(bw, x, z);
        pos.push(wx, y, wz);
        const k = Math.min(1, (y - (bw.y0 - bw.depth)) / (bw.depth * 0.7));
        const c = cLow.clone().lerp(cHigh, k);
        col.push(c.r, c.g, c.b);
      }
    }
    for (let r = 0; r < R; r++) for (let i = 0; i < N; i++) {
      const a = r * (N + 1) + i, bI = a + 1, c = a + N + 1, d = c + 1;
      idx.push(a, c, bI, bI, c, d);
    }
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
    g.setAttribute('color', new THREE.Float32BufferAttribute(col, 3));
    g.setIndex(idx);
    g.computeVertexNormals();
    const m = new THREE.Mesh(g, new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.85, side: THREE.DoubleSide, map: concTex }));
    m.receiveShadow = true;
    root.add(m);
    disposables.push(g, m.material);
    if (bw.coping) {
      const pts = [];
      for (let i = 0; i < 40; i++) { const [lx, lz] = edge(bw, (i / 40) * TAU); const [wx, wz] = world(bw, lx, lz); pts.push(new THREE.Vector3(wx, bw.y0 + 0.02, wz)); }
      const tube = new THREE.Mesh(new THREE.TubeGeometry(new THREE.CatmullRomCurve3(pts, true), 120, 0.07, 6, true), std('m', '#b8bec6', { metalness: 0.7, roughness: 0.35 }));
      root.add(tube);
      disposables.push(tube.geometry);
    }
  }

  // ------------------------------------------------------------------------------------ piezas
  const accent = std('a', th.accent, { emissive: th.night ? th.accent : '#000', emissiveIntensity: th.night ? 0.6 : 0 });
  const add = (mesh, p, shadow = true) => { mesh.castShadow = shadow; mesh.receiveShadow = true; root.add(mesh); disposables.push(mesh.geometry); return mesh; };
  for (const p of map.prims) {
    if (p.v === 0 || p.t === 'bowl' || p.t === 'zone' || p.t === 'rail') continue;
    const y0 = p.y0 || 0;
    if (p.t === 'box') {
      const height = Math.max(0.05, p.h);
      const m = add(new THREE.Mesh(new THREE.BoxGeometry(p.w, height, p.d), matFor(p)), p);
      m.position.set(p.x, y0 + height / 2, p.z); m.rotation.y = p.yaw || 0;
      if (p.grind) { // borde metálico por donde se grinda
        const long = p.w >= p.d;
        const strip = add(new THREE.Mesh(new THREE.BoxGeometry(long ? p.w : 0.08, 0.06, long ? 0.08 : p.d), accent), p, false);
        strip.position.set(p.x, y0 + height + 0.03, p.z); strip.rotation.y = p.yaw || 0;
      }
    } else if (p.t === 'ramp') {
      const m = add(new THREE.Mesh(prism([[-p.d / 2, y0 + p.h0], [p.d / 2, y0 + p.h1]], p.w, Math.min(0, y0 + Math.min(p.h0, p.h1) - 0.01)), matFor(p)), p);
      m.material = matFor(p);
      m.position.set(p.x, 0, p.z); m.rotation.y = p.yaw || 0;
    } else if (p.t === 'quarter') {
      const q = prepare(p);
      const prof = [];
      for (let i = 0; i <= 14; i++) { const u = (i / 14) * q.umax; prof.push([u, y0 + p.r - Math.sqrt(Math.max(0, p.r * p.r - u * u))]); }
      if (p.deck) prof.push([q.len, y0 + p.h]);
      const m = add(new THREE.Mesh(prism(prof, p.w, Math.min(y0, 0)), matFor(p)), p);
      m.position.set(p.x, 0, p.z); m.rotation.y = p.yaw || 0;
      const cop = add(new THREE.Mesh(new THREE.CylinderGeometry(0.06, 0.06, p.w, 8), std('m', '#b8bec6', { metalness: 0.7, roughness: 0.35 })), p, false);
      cop.rotation.z = Math.PI / 2;
      const c = Math.cos(p.yaw || 0), s = Math.sin(p.yaw || 0);
      cop.position.set(p.x + s * q.umax, y0 + p.h + 0.02, p.z + c * q.umax);
      cop.rotation.set(0, p.yaw || 0, 0); cop.rotateZ(Math.PI / 2);
    } else if (p.t === 'pyr') {
      const gm = new THREE.CylinderGeometry((p.fl / 2) * Math.SQRT2, (p.w / 2) * Math.SQRT2, p.h, 4, 1);
      gm.rotateY(Math.PI / 4); gm.scale(1, 1, p.d / p.w);
      const m = add(new THREE.Mesh(gm, matFor(p)), p);
      m.position.set(p.x, y0 + p.h / 2, p.z); m.rotation.y = p.yaw || 0;
    } else if (p.t === 'stairs') {
      for (let i = 0; i < p.n; i++) {
        const m = add(new THREE.Mesh(new THREE.BoxGeometry(p.w, (i + 1) * p.rise, p.run), matFor(p)), p);
        const lz = i * p.run + p.run / 2;
        const c = Math.cos(p.yaw || 0), s = Math.sin(p.yaw || 0);
        m.position.set(p.x + s * lz, y0 + ((i + 1) * p.rise) / 2, p.z + c * lz); m.rotation.y = p.yaw || 0;
      }
    }
  }
  // Raíles
  const railM = std('r', th.night ? '#ff4fd8' : '#c9ced4', { metalness: 0.8, roughness: 0.3, emissive: th.night ? '#ff2bd6' : '#000', emissiveIntensity: th.night ? 0.8 : 0 });
  for (const p of map.prims) {
    if (p.t !== 'rail') continue;
    const a = new THREE.Vector3(p.x1, p.h1, p.z1), c = new THREE.Vector3(p.x2, p.h2, p.z2);
    const len = a.distanceTo(c);
    const bar = new THREE.Mesh(new THREE.CylinderGeometry(0.045, 0.045, len, 8), railM);
    bar.position.copy(a).lerp(c, 0.5);
    bar.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), c.clone().sub(a).normalize());
    bar.castShadow = true;
    root.add(bar); disposables.push(bar.geometry);
    const posts = Math.max(2, Math.round(len / 2.6));
    for (let i = 0; i <= posts; i++) {
      const pt = a.clone().lerp(c, i / posts);
      const base = Math.max(0, pt.y - (map.respawnBelow ? 3 : 1.2) * 0 - 0.9);
      const post = new THREE.Mesh(new THREE.CylinderGeometry(0.035, 0.035, Math.max(0.15, pt.y - base), 6), railM);
      post.position.set(pt.x, base + (pt.y - base) / 2, pt.z);
      root.add(post); disposables.push(post.geometry);
    }
  }
  // Arena
  for (const p of map.prims) {
    if (p.t !== 'zone' || !p.sand) continue;
    const m = new THREE.Mesh(new THREE.PlaneGeometry(p.w, p.d), new THREE.MeshStandardMaterial({ map: noiseTex('#e6cf94', 1500, 256, [20, 6]), roughness: 1 }));
    m.rotation.x = -Math.PI / 2; m.position.set(p.x, 0.02, p.z); m.receiveShadow = true;
    root.add(m); disposables.push(m.geometry, m.material);
  }

  // ------------------------------------------------------------------------------------- vallas
  const fenceTex = canvasTex(64, 64, (g, w, h) => { g.clearRect(0, 0, w, h); g.strokeStyle = 'rgba(200,205,210,.8)'; g.lineWidth = 2; for (let i = -64; i < 128; i += 16) { g.beginPath(); g.moveTo(i, 0); g.lineTo(i + 64, 64); g.moveTo(i + 64, 0); g.lineTo(i, 64); g.stroke(); } }, [1, 1]);
  const fenceM = new THREE.MeshBasicMaterial({ map: fenceTex, transparent: true, side: THREE.DoubleSide, depthWrite: false });
  disposables.push(fenceM, fenceTex);
  const fence = (x, z, w, d) => {
    const m = new THREE.Mesh(new THREE.PlaneGeometry(Math.max(w, d), 2.4), fenceM.clone());
    m.material.map = fenceTex.clone(); m.material.map.repeat.set(Math.max(w, d) / 2.4, 1); m.material.map.needsUpdate = true;
    m.position.set(x, (map.respawnBelow ? 0 : 1.2), z);
    if (d > w) m.rotation.y = Math.PI / 2;
    root.add(m); disposables.push(m.geometry);
    return m;
  };
  if (!map.respawnBelow) { fence((b.x0 + b.x1) / 2, b.z0, W, 0); fence((b.x0 + b.x1) / 2, b.z1, W, 0); fence(b.x0, (b.z0 + b.z1) / 2, 0, D); fence(b.x1, (b.z0 + b.z1) / 2, 0, D); }

  // ----------------------------------------------------------------------------------- decorado
  decorate(map, root, { std, add, disposables, concrete, scene, accent });

  // ----------------------------------------------------------------- letras S-K-A-T-E y huecos
  const letterSprites = new Map();
  const lettersGroup = new THREE.Group();
  root.add(lettersGroup);
  const heightAt = (x, z) => 0; // las letras se colocan con la altura que da el mundo (se corrige en `place`)
  const label = (text, color, size = 1.2, font = 900) => {
    const t = canvasTex(256, 256, (g, w, h) => {
      g.clearRect(0, 0, w, h);
      g.font = `${font} 150px Montserrat, sans-serif`; g.textAlign = 'center'; g.textBaseline = 'middle';
      g.lineWidth = 16; g.strokeStyle = '#000'; g.strokeText(text, w / 2, h / 2 + 8); g.fillStyle = color; g.fillText(text, w / 2, h / 2 + 8);
    });
    const sp = new THREE.Sprite(new THREE.SpriteMaterial({ map: t, transparent: true, depthWrite: false, fog: false }));
    sp.scale.set(size, size, 1);
    disposables.push(t, sp.material);
    return sp;
  };
  const place = (world) => {
    for (const l of map.letters) {
      const sp = label(l.ch, '#ffd600', 1.5);
      sp.position.set(l.x, world.heightAt(l.x, l.z).h + (l.y0 || 0) + l.up, l.z);
      lettersGroup.add(sp);
      letterSprites.set(l.ch, sp);
    }
    for (const g of map.gaps) {
      const mk = label('◆', '#00e5ff', 0.9);
      mk.position.set(g.x, world.heightAt(g.x, g.z).h + 2.4, g.z);
      mk.userData.gap = g.id;
      lettersGroup.add(mk);
      letterSprites.set(`gap:${g.id}`, mk);
    }
  };

  // ------------------------------------------------------------------------------------ control
  const api = {
    scene, sun, root,
    place,
    markLetters(set) { for (const [k, sp] of letterSprites) if (!k.startsWith('gap:')) sp.visible = !set.has(k); },
    markGaps(set) { for (const [k, sp] of letterSprites) if (k.startsWith('gap:')) sp.visible = !set.has(k.slice(4)); },
    update(dt, t, focus) {
      sun.position.set(focus.x + 30, focus.y + 50, focus.z + 20);
      sun.target.position.set(focus.x, focus.y, focus.z);
      for (const [k, sp] of letterSprites) {
        if (!sp.visible) continue;
        const base = sp.userData.y ?? (sp.userData.y = sp.position.y);
        sp.position.y = base + Math.sin(t * 2.2 + sp.position.x) * 0.15;
        sp.material.rotation = k.startsWith('gap:') ? t * 0.8 : 0;
      }
      decorate.update?.(t);
    },
    dispose() {
      for (const d of disposables) d.dispose?.();
      root.traverse((o) => { o.geometry?.dispose?.(); });
    },
  };
  void heightAt;
  return api;
}

// ================================================================================ decorado por mapa
function decorate(map, root, ctx) {
  const { std, add, disposables, concrete, scene } = ctx;
  const th = map.theme;
  const tree = (x, z, s = 1) => {
    const trunk = new THREE.Mesh(new THREE.CylinderGeometry(0.15 * s, 0.22 * s, 3 * s, 6), std('t', '#6d4c2f'));
    trunk.position.set(x, 1.5 * s, z);
    const leaves = new THREE.Mesh(new THREE.IcosahedronGeometry(1.6 * s, 0), std('l', '#3f8f3a'));
    leaves.position.set(x, 3.6 * s, z);
    trunk.castShadow = leaves.castShadow = true;
    root.add(trunk, leaves); disposables.push(trunk.geometry, leaves.geometry);
  };
  const palm = (x, z) => {
    const trunk = new THREE.Mesh(new THREE.CylinderGeometry(0.14, 0.24, 6.2, 6), std('t', '#8b6a44'));
    trunk.position.set(x, 3.1, z); trunk.rotation.z = 0.12; trunk.castShadow = true;
    root.add(trunk); disposables.push(trunk.geometry);
    for (let i = 0; i < 7; i++) {
      const leaf = new THREE.Mesh(new THREE.ConeGeometry(0.35, 3.2, 4), std('p', '#2e9e4f'));
      leaf.position.set(x + Math.cos(i * 0.9) * 1.3 + 0.7, 6.1, z + Math.sin(i * 0.9) * 1.3);
      leaf.rotation.set(Math.sin(i * 0.9) * 1.1, 0, -Math.cos(i * 0.9) * 1.1 - 0.4);
      root.add(leaf); disposables.push(leaf.geometry);
    }
  };
  const lamp = (x, z, h = 6, color = '#fff2c4') => {
    const pole = new THREE.Mesh(new THREE.CylinderGeometry(0.07, 0.09, h, 6), std('m', '#59616b', { metalness: 0.5 }));
    pole.position.set(x, h / 2, z);
    const bulb = new THREE.Mesh(new THREE.SphereGeometry(0.24, 8, 6), new THREE.MeshBasicMaterial({ color }));
    bulb.position.set(x, h + 0.1, z);
    root.add(pole, bulb); disposables.push(pole.geometry, bulb.geometry, bulb.material);
  };
  const building = (x, z, w, d, h, lit = 0.5) => {
    const tex = windowsTex(lit); tex.repeat.set(Math.max(2, Math.round(w / 6)), Math.max(2, Math.round(h / 6)));
    const m = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), new THREE.MeshStandardMaterial({ map: tex, emissiveMap: th.night ? tex : null, emissive: th.night ? '#ffffff' : '#000', emissiveIntensity: th.night ? 0.8 : 0, roughness: 0.9 }));
    m.position.set(x, h / 2 - (map.respawnBelow ? 0 : 0), z);
    root.add(m); disposables.push(m.geometry, m.material, tex);
  };
  const neon = (x, y, z, w, color, ry = 0) => {
    const m = new THREE.Mesh(new THREE.BoxGeometry(w, 0.25, 0.12), new THREE.MeshBasicMaterial({ color }));
    m.position.set(x, y, z); m.rotation.y = ry;
    root.add(m); disposables.push(m.geometry, m.material);
  };
  const b = map.bounds;
  switch (map.id) {
    case 'park':
      for (const [x, z] of [[-48, -34], [-48, 34], [48, 34], [10, 36], [-30, 36], [-10, -37], [50, -36]]) tree(x, z, 1.1);
      for (const [x, z] of [[-45, -20], [-45, 20], [45, 20], [20, -34], [0, 32]]) lamp(x, z);
      for (let i = 0; i < 6; i++) building(-70 + i * 26, 70, 20, 14, 18 + (i % 3) * 9, 0.4);
      break;
    case 'street':
      for (let i = 0; i < 9; i++) { building(-72 + i * 18, 39, 16, 30, 22 + (i * 7) % 20, 0.5); building(-72 + i * 18, -39, 16, 30, 20 + (i * 5) % 22, 0.5); }
      for (let x = -64; x <= 64; x += 16) { lamp(x, 8.8, 6.5, '#ffd68a'); lamp(x, -8.8, 6.5, '#ffd68a'); }
      for (const x of [-8, 18, 44]) tree(x, 19, 0.9);
      break;
    case 'bowl':
      for (let i = 0; i < 5; i++) palm(-44 + i * 22, 38);
      for (let i = 0; i < 4; i++) palm(-34 + i * 22, -37);
      break;
    case 'roof': {
      for (let i = 0; i < 14; i++) building(-120 + i * 20, -60 - (i % 3) * 14, 14, 14, 20 + (i * 13) % 50, 0.6);
      for (let i = 0; i < 14; i++) building(-120 + i * 20, 62 + (i % 4) * 10, 14, 14, 20 + (i * 17) % 55, 0.6);
      const tankPos = [[-40, 0, 12], [44, 14, 6.5]];
      for (const [x, z, y] of tankPos) { const tank = new THREE.Mesh(new THREE.CylinderGeometry(1.6, 1.6, 3, 12), std('t', '#6b5d4f')); tank.position.set(x + 0, y + 1.5 + (y === 12 ? -4 : 0), z); tank.castShadow = true; root.add(tank); disposables.push(tank.geometry); }
      neon(-47, 9.6, 8, 5, '#ff2bd6'); neon(-20, 9.8, -19, 6, '#00e5ff'); neon(36, 8, 18, 5, '#ffd600'); neon(-30, 11, 19, 6, '#ff2bd6');
      const lights = [['#ff2bd6', -36, 11, 8], ['#00e5ff', -20, 11, -14], ['#ffd600', 36, 9, 10], ['#ff2bd6', 24, 9, -14]];
      for (const [c, x, y, z] of lights) { const l = new THREE.PointLight(c, 1.2, 28); l.position.set(x, y, z); root.add(l); }
      const stars = new THREE.BufferGeometry();
      const sp = []; for (let i = 0; i < 400; i++) sp.push((Math.random() - 0.5) * 700, 80 + Math.random() * 300, (Math.random() - 0.5) * 700);
      stars.setAttribute('position', new THREE.Float32BufferAttribute(sp, 3));
      const pts = new THREE.Points(stars, new THREE.PointsMaterial({ color: '#ffffff', size: 1.6, fog: false }));
      scene.add(pts); disposables.push(stars, pts.material);
      break;
    }
    case 'port': {
      for (let i = 0; i < 4; i++) {
        const c = new THREE.Mesh(new THREE.BoxGeometry(11, 2.6, 2.6), std('k', ['#c62828', '#1565c0', '#2e7d32', '#ef6c00'][i], { roughness: 0.6 }));
        c.position.set(-20 + i * 16, 1.3, 40 + (i % 2) * 3); root.add(c); disposables.push(c.geometry);
      }
      for (const x of [-30, 20]) { // grúas
        const mat = std('g', '#f0a500', { metalness: 0.3 });
        const tw = new THREE.Mesh(new THREE.BoxGeometry(1.2, 30, 1.2), mat); tw.position.set(x, 15, -52);
        const arm = new THREE.Mesh(new THREE.BoxGeometry(34, 1, 1), mat); arm.position.set(x + 8, 30, -52);
        root.add(tw, arm); disposables.push(tw.geometry, arm.geometry);
      }
      for (let i = 0; i < 7; i++) lamp(-54 + i * 18, -41, 9, '#fff0c8');
      const sea = new THREE.Mesh(new THREE.PlaneGeometry(600, 300), new THREE.MeshStandardMaterial({ color: '#2d5b78', roughness: 0.4, metalness: 0.2 }));
      sea.rotation.x = -Math.PI / 2; sea.position.set(0, -0.6, -190); root.add(sea); disposables.push(sea.geometry, sea.material);
      break;
    }
    case 'beach': {
      for (let i = 0; i < 9; i++) palm(-52 + i * 13, -6.5 + (i % 2) * 14);
      const sea = new THREE.Mesh(new THREE.PlaneGeometry(700, 300), new THREE.MeshStandardMaterial({ color: '#27a6d1', roughness: 0.25, metalness: 0.1 }));
      sea.rotation.x = -Math.PI / 2; sea.position.set(0, -0.3, 200); root.add(sea); disposables.push(sea.geometry, sea.material);
      for (const x of [-40, 0, 40]) lamp(x, -7.7, 5.5);
      for (let i = 0; i < 6; i++) building(-70 + i * 28, -70, 20, 16, 14 + (i % 3) * 7, 0.4);
      break;
    }
    default:
  }
  void concrete; void add; void b;
}
