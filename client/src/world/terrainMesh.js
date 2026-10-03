// Malla del terreno a partir del mapa de alturas compartido, coloreada por altura y pendiente.
import * as THREE from 'three';
import { texture } from '../engine/materials.js';

const C = {
  sand: new THREE.Color('#e8d79b'),
  grass: new THREE.Color('#6cbf4a'),
  grass2: new THREE.Color('#4f9d39'),
  rock: new THREE.Color('#8d8a84'),
  snow: new THREE.Color('#f4f7fb'),
  under: new THREE.Color('#bba774'),
};

export function buildTerrainMesh(hm, { step = 1, tint = null, castShadow = false } = {}) {
  const res = Math.floor(hm.res / step);
  const n = res + 1;
  const pos = new Float32Array(n * n * 3);
  const col = new Float32Array(n * n * 3);
  const uv = new Float32Array(n * n * 2);
  const tmp = new THREE.Color();
  const tintC = tint ? new THREE.Color(tint) : null;
  for (let j = 0; j < n; j++) {
    for (let i = 0; i < n; i++) {
      const gi = i * step, gj = j * step;
      const x = -hm.half + gi * hm.cell, z = -hm.half + gj * hm.cell;
      const y = hm.get(gi, gj);
      const k = j * n + i;
      pos.set([x, y, z], k * 3);
      uv.set([x / 4, z / 4], k * 2);
      const slope = Math.max(Math.abs(hm.get(gi + 1, gj) - hm.get(gi - 1, gj)), Math.abs(hm.get(gi, gj + 1) - hm.get(gi, gj - 1))) / (2 * hm.cell);
      if (tintC) tmp.copy(tintC).lerp(C.rock, Math.min(1, Math.max(0, (slope - 0.6) * 1.5)));
      else if (y < 0) tmp.copy(C.under);
      else if (y < 1.6) tmp.copy(C.sand);
      else if (y > 52) tmp.copy(C.snow);
      else {
        const v = (Math.sin(x * 0.05) + Math.cos(z * 0.07)) * 0.25 + 0.5;
        tmp.copy(C.grass).lerp(C.grass2, v);
        if (slope > 0.75 || y > 34) tmp.lerp(C.rock, Math.min(1, Math.max((slope - 0.75) * 2, (y - 34) / 12)));
      }
      col.set([tmp.r, tmp.g, tmp.b], k * 3);
    }
  }
  const idx = new Uint32Array(res * res * 6);
  let p = 0;
  for (let j = 0; j < res; j++) {
    for (let i = 0; i < res; i++) {
      const a = j * n + i, b = a + 1, c = a + n, d = c + 1;
      // Misma diagonal (b-c) que Heightmap.heightAt
      idx.set([a, c, b, b, c, d], p);
      p += 6;
    }
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.BufferAttribute(pos, 3));
  g.setAttribute('color', new THREE.BufferAttribute(col, 3));
  g.setAttribute('uv', new THREE.BufferAttribute(uv, 2));
  g.setIndex(new THREE.BufferAttribute(idx, 1));
  g.computeVertexNormals();
  const m = new THREE.MeshLambertMaterial({ vertexColors: true, map: texture('grass') });
  const mesh = new THREE.Mesh(g, m);
  mesh.receiveShadow = true;
  mesh.castShadow = castShadow;
  mesh.name = 'terrain';
  return mesh;
}

export function buildWater(level, size) {
  const g = new THREE.PlaneGeometry(size, size, 1, 1).rotateX(-Math.PI / 2);
  const m = new THREE.MeshStandardMaterial({ color: '#2f9bd8', transparent: true, opacity: 0.72, roughness: 0.15, metalness: 0.2, depthWrite: false });
  const mesh = new THREE.Mesh(g, m);
  mesh.position.y = level;
  mesh.name = 'water';
  mesh.renderOrder = 2;
  return mesh;
}
