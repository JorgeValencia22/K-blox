// Convierte un mundo (JSON) en mallas Three.js + colisionadores + objetos interactivos.
// Los objetos estáticos se fusionan por material y zona (pocas llamadas de dibujo);
// los interactivos/animados se mantienen como mallas independientes.
import * as THREE from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import { getHeightmap } from '../../../shared/terrain.js';
import { worldSpawns } from '../../../shared/worldSchema.js';
import { PhysicsWorld } from '../engine/physics.js';
import { material } from '../engine/materials.js';
import { objectParts, objectColliders, DYNAMIC_VISUAL } from './objectParts.js';
import { buildTerrainMesh, buildWater } from './terrainMesh.js';

const CHUNK = 64;
const DEG = Math.PI / 180;

function colorize(geo, color) {
  const g = geo.index ? geo.toNonIndexed() : geo;
  if (!g.attributes.uv) g.setAttribute('uv', new THREE.Float32BufferAttribute(new Float32Array(g.attributes.position.count * 2), 2));
  const c = new THREE.Color(color);
  const n = g.attributes.position.count;
  const arr = new Float32Array(n * 3);
  for (let i = 0; i < n; i++) arr.set([c.r, c.g, c.b], i * 3);
  g.setAttribute('color', new THREE.BufferAttribute(arr, 3));
  return g;
}

export function signTexture(text, bg = '#ffffff') {
  const c = document.createElement('canvas');
  c.width = 512;
  c.height = 256;
  const g = c.getContext('2d');
  g.fillStyle = bg;
  g.fillRect(0, 0, 512, 256);
  const lum = new THREE.Color(bg);
  g.fillStyle = lum.r + lum.g + lum.b > 1.5 ? '#263238' : '#ffffff';
  g.font = '900 72px Nunito, system-ui, sans-serif';
  g.textAlign = 'center';
  g.textBaseline = 'middle';
  let size = 72;
  while (g.measureText(text).width > 470 && size > 20) {
    size -= 4;
    g.font = `900 ${size}px Nunito, system-ui, sans-serif`;
  }
  g.fillText(text, 256, 128);
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  t.userData.own = true;
  return t;
}

/**
 * opts.editor = true: cada objeto es una malla seleccionable (sin fusionar).
 * opts.quality: { shadows, terrainDetail }
 */
export function buildWorld(world, opts = {}) {
  const editor = !!opts.editor;
  const group = new THREE.Group();
  group.name = 'world';
  const hm = world.terrain && world.terrain.type !== 'none' ? getHeightmap(world.terrain) : null;
  const physics = new PhysicsWorld({
    heightmap: hm && world.terrain.type !== 'flat' ? hm : null,
    flatHeight: world.terrain?.type === 'flat' ? world.terrain.height ?? 0 : null,
    waterLevel: world.water ? world.water.level : null,
  });

  if (hm) {
    if (world.terrain.type === 'flat') {
      const size = world.terrain.size || 200;
      const g = new THREE.BoxGeometry(size, 1, size);
      g.translate(0, (world.terrain.height ?? 0) - 0.5, 0);
      const uv = g.attributes.uv;
      for (let i = 0; i < uv.count; i++) uv.setXY(i, uv.getX(i) * size / 4, uv.getY(i) * size / 4);
      const m = new THREE.MeshStandardMaterial({ color: world.terrain.color || '#7cb342', roughness: 0.95, map: material('grass').map });
      const ground = new THREE.Mesh(g, m);
      ground.receiveShadow = true;
      ground.name = 'terrain';
      group.add(ground);
    } else {
      group.add(buildTerrainMesh(hm, { step: opts.terrainDetail || 1, tint: world.terrain.type === 'hills' && world.terrain.color !== '#7cb342' ? world.terrain.color : null }));
    }
  }
  if (world.water) group.add(buildWater(world.water.level, (hm?.size || 400) * 2.5));

  const buckets = new Map();
  const result = {
    group, physics, hm,
    objects: new Map(), // id -> entrada
    interactables: [],
    keycaps: [], // teclas de Kest Teclas (se hunden al pisarlas)
    triggers: [],
    platforms: [],
    animated: [],
    lightSpots: [],
    groupMats: new Map(), // grupo -> [materiales]
    groupMeshes: new Map(),
    spawns: worldSpawns(world),
    meshes: [], // para selección en el editor
  };

  const m4 = new THREE.Matrix4();
  const q = new THREE.Quaternion();
  const up = new THREE.Vector3(0, 1, 0);
  const one = new THREE.Vector3(1, 1, 1);

  for (const o of world.objects || []) {
    const ry = (o.ry || 0) * DEG;
    const entry = { o, mesh: null, colliders: [] };
    result.objects.set(o.id, entry);

    // Colisionadores
    for (const c of objectColliders(o)) {
      const cos = Math.cos(ry), sin = Math.sin(ry);
      const wx = o.p[0] + c.p[0] * cos + c.p[2] * sin;
      const wz = o.p[2] - c.p[0] * sin + c.p[2] * cos;
      entry.colliders.push(physics.add({
        kind: c.kind, x: wx, y: o.p[1] + c.p[1], z: wz, hx: c.h[0], hy: c.h[1], hz: c.h[2], ry,
        surface: o.m, dynamic: o.t === 'platform' || (o.t === 'keycap' && !!o.axis), data: o,
      }));
    }

    if (o.t === 'zone') {
      result.triggers.push(entry);
      continue;
    }
    const parts = objectParts(o);
    const separate = editor || DYNAMIC_VISUAL.has(o.t) || (o.t === 'deco' && o.group) || o.dance || o.t === 'seat' || o.sep;
    q.setFromAxisAngle(up, ry);
    m4.compose(new THREE.Vector3(...o.p), q, one);

    if (separate) {
      const g = new THREE.Group();
      g.position.set(...o.p);
      g.rotation.y = ry;
      for (const part of parts) {
        const mat = part.tag === 'bulb' && o.group ? groupMaterial(result, o.group, part.color) : material(part.mat, { color: part.color });
        const mesh = new THREE.Mesh(part.geo, mat);
        mesh.castShadow = !['neon', 'glass'].includes(part.mat) && opts.shadows !== false;
        mesh.receiveShadow = true;
        if (part.tag) mesh.userData.tag = part.tag;
        g.add(mesh);
      }
      if (o.t === 'sign' && o.text) {
        const tex = signTexture(o.text, o.c);
        const pm = new THREE.MeshBasicMaterial({ map: tex });
        const w = Math.max(o.s[0], o.s[2]), hgt = o.s[1];
        for (const side of [1, -1]) {
          const plane = new THREE.Mesh(new THREE.PlaneGeometry(w * 0.96, hgt * 0.92), pm);
          if (o.s[0] >= o.s[2]) plane.position.z = side * (o.s[2] / 2 + 0.01);
          else { plane.position.x = side * (o.s[0] / 2 + 0.01); plane.rotation.y = Math.PI / 2; }
          if (side < 0) plane.rotation.y += Math.PI;
          g.add(plane);
        }
      }
      if (o.t === 'keycap' && o.label) {
        // Letra impresa en la parte superior de la tecla
        const plane = new THREE.Mesh(new THREE.PlaneGeometry(Math.min(o.s[0], o.s[2]) * 0.8, Math.min(o.s[0], o.s[2]) * 0.8), keyLabelMaterial(o.label, o.c));
        plane.rotation.x = -Math.PI / 2;
        plane.position.y = o.s[1] / 2 + 0.012;
        g.add(plane);
      }
      g.userData.objId = o.id;
      if (o.t === 'seat' && o.hidden && editor) {
        g.add(new THREE.Mesh(new THREE.BoxGeometry(...o.s), new THREE.MeshBasicMaterial({ color: o.c, wireframe: true })));
      }
      group.add(g);
      entry.mesh = g;
      result.meshes.push(g);
      if (o.group) addToGroup(result, o.group, g);
    } else {
      // Fusión: piezas normales por material+zona; bombillas por grupo.
      const chunk = `${Math.floor(o.p[0] / CHUNK)},${Math.floor(o.p[2] / CHUNK)}`;
      for (const part of parts) {
        const geo = colorize(part.geo, part.color).applyMatrix4(m4);
        const key = part.tag === 'bulb' && o.group ? `bulb|${o.group}` : `${part.mat}|${chunk}`;
        if (!buckets.has(key)) buckets.set(key, []);
        buckets.get(key).push(geo);
      }
    }

    // Comportamientos
    switch (o.t) {
      case 'platform':
      case 'saw':
        result.platforms.push(entry);
        break;
      case 'keycap':
        result.keycaps.push(entry);
        if (o.axis) result.platforms.push(entry);
        break;
      case 'kill': case 'checkpoint': case 'finish': case 'jumppad': case 'coin': case 'gem':
        result.triggers.push(entry);
        if (o.t === 'coin' || o.t === 'gem' || o.t === 'kill') result.animated.push(entry);
        break;
      case 'door': case 'chest': case 'switch': case 'seat': case 'resource':
        result.interactables.push(entry);
        break;
      case 'light':
        result.lightSpots.push({ x: o.p[0], y: o.p[1], z: o.p[2], color: o.c, intensity: o.intensity ?? 1.5, range: o.range ?? 14, group: o.group });
        break;
      case 'deco':
        if (o.kind === 'lamp') result.lightSpots.push({ x: o.p[0], y: o.p[1] + o.s[1] / 2 + 0.4, z: o.p[2], color: '#ffe0a0', intensity: 1.4, range: 16, group: o.group, nightOnly: true });
        if (o.kind === 'campfire') {
          result.lightSpots.push({ x: o.p[0], y: o.p[1] + 1, z: o.p[2], color: '#ff9a3c', intensity: 2, range: 14 });
          result.animated.push(entry);
        }
        break;
      default:
        break;
    }
    if (o.dance || o.t === 'water' || (o.t === 'deco' && o.kind === 'campfire')) result.animated.push(entry);
  }

  for (const [key, geos] of buckets) {
    const [mat, rest] = key.split('|');
    const merged = mergeGeometries(geos, false);
    geos.forEach((g) => g.dispose());
    if (!merged) continue;
    const mtl = mat === 'bulb' ? groupMaterial(result, rest, '#ffffff', true) : material(mat);
    const mesh = new THREE.Mesh(merged, mtl);
    mesh.castShadow = !['neon', 'glass', 'bulb'].includes(mat) && opts.shadows !== false;
    mesh.receiveShadow = mat !== 'neon';
    mesh.matrixAutoUpdate = false;
    mesh.updateMatrix();
    group.add(mesh);
  }
  return result;
}

function groupMaterial(result, groupName, color, vertexColors = false) {
  const key = `${groupName}|${vertexColors}`;
  if (!result._gm) result._gm = new Map();
  if (!result._gm.has(key)) {
    const m = new THREE.MeshBasicMaterial({ color: vertexColors ? '#ffffff' : color, vertexColors });
    m.userData.onColor = m.color.clone();
    result._gm.set(key, m);
    if (!result.groupMats.has(groupName)) result.groupMats.set(groupName, []);
    result.groupMats.get(groupName).push(m);
  }
  return result._gm.get(key);
}

function addToGroup(result, name, mesh) {
  if (!result.groupMeshes.has(name)) result.groupMeshes.set(name, []);
  result.groupMeshes.get(name).push(mesh);
}

/** Enciende/apaga los objetos de un grupo (farolas, fuente...). */
export function setGroupState(result, name, on) {
  for (const m of result.groupMats.get(name) || []) {
    m.color.copy(on ? m.userData.onColor : new THREE.Color('#3a3a3a'));
  }
  for (const mesh of result.groupMeshes.get(name) || []) {
    mesh.traverse((c) => {
      if (c.userData.tag === 'water') c.visible = on;
    });
  }
}

/** Posición de una plataforma móvil en el instante t (segundos, reloj del servidor). */
export function platformOffset(o, t) {
  const v = Math.sin(t * (o.speed ?? 0.4) * Math.PI * 2) * ((o.dist ?? 6) / 2);
  return [o.axis === 'x' ? v : 0, o.axis === 'y' ? v : 0, o.axis === 'z' ? v : 0];
}

export function disposeWorld(result) {
  result.group.traverse((c) => {
    if (c.geometry) c.geometry.dispose();
    // Solo las texturas propias (carteles); las de materiales son compartidas.
    if (c.material?.map?.userData?.own) c.material.map.dispose();
  });
}

const keyLabelCache = new Map();
/** Material con la letra de una tecla (texto oscuro o claro según el color de la tecla). */
function keyLabelMaterial(label, bg) {
  const key = label + '|' + bg;
  if (keyLabelCache.has(key)) return keyLabelCache.get(key);
  const c = document.createElement('canvas');
  c.width = c.height = 128;
  const g = c.getContext('2d');
  const col = new THREE.Color(bg);
  g.fillStyle = col.r + col.g + col.b > 1.6 ? '#37474f' : '#f5f5f5';
  g.font = `900 ${label.length > 2 ? 30 : 64}px Nunito, system-ui, sans-serif`;
  g.textAlign = 'center';
  g.textBaseline = 'middle';
  g.fillText(label, 64, 66);
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  const m = new THREE.MeshBasicMaterial({ map: t, transparent: true, depthWrite: false });
  keyLabelCache.set(key, m);
  return m;
}
