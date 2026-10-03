// Geometría de cada tipo de objeto del mundo. Devuelve "partes" en espacio local
// del objeto (centro en el origen, sin rotación). El constructor de mundos decide
// si las fusiona (estáticas) o crea mallas independientes (interactivas).
import * as THREE from 'three';

const TEX_SCALE = 2; // la textura se repite cada 2 unidades

/** Caja con UV proporcionales al tamaño (para que la textura no se estire). */
export function boxGeo(sx, sy, sz) {
  const g = new THREE.BoxGeometry(sx, sy, sz);
  const uv = g.attributes.uv;
  const dims = [[sz, sy], [sz, sy], [sx, sz], [sx, sz], [sx, sy], [sx, sy]];
  for (let f = 0; f < 6; f++) {
    for (let v = 0; v < 4; v++) {
      const i = f * 4 + v;
      uv.setXY(i, (uv.getX(i) * dims[f][0]) / TEX_SCALE, (uv.getY(i) * dims[f][1]) / TEX_SCALE);
    }
  }
  return g;
}

/** Cuña (rampa) que sube hacia +z local. */
export function wedgeGeo(sx, sy, sz) {
  const hx = sx / 2, hy = sy / 2, hz = sz / 2;
  const A = [-hx, -hy, -hz], B = [hx, -hy, -hz], C = [hx, -hy, hz], D = [-hx, -hy, hz];
  const E = [-hx, hy, hz], F = [hx, hy, hz];
  const tris = [
    [A, C, B], [A, D, C], // base
    [D, F, C], [D, E, F], // trasera (vertical en +z)
    [A, B, F], [A, F, E], // pendiente
    [A, E, D], // lado -x
    [B, C, F], // lado +x
  ];
  const pos = [], uvs = [];
  for (const t of tris) for (const v of t) {
    pos.push(...v);
    uvs.push((v[0] + v[2]) / TEX_SCALE, v[1] / TEX_SCALE);
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.setAttribute('uv', new THREE.Float32BufferAttribute(uvs, 2));
  g.computeVertexNormals();
  return g;
}

export function stairsSteps(sx, sy, sz) {
  const n = Math.max(2, Math.round(sy / 0.45));
  const sh = sy / n, sd = sz / n;
  const steps = [];
  for (let i = 0; i < n; i++) {
    const h = sh * (i + 1);
    steps.push({ p: [0, -sy / 2 + h / 2, -sz / 2 + sd * (i + 0.5)], s: [sx, h, sd] });
  }
  return steps;
}

const at = (g, x, y, z) => g.translate(x, y, z);

/**
 * Partes visuales: [{ geo, mat, color, tag? }]. tag marca piezas especiales
 * (bulb, fire, lid, flag, water) que se animan o se encienden/apagan.
 */
export function objectParts(o) {
  const [sx, sy, sz] = o.s;
  const c = o.c;
  const P = [];
  const add = (geo, mat, color = c, tag) => P.push({ geo, mat, color, tag });
  switch (o.t) {
    case 'block':
    case 'window':
    case 'kill':
    case 'platform':
    case 'zone_visible':
      add(boxGeo(sx, sy, sz), o.m);
      break;
    case 'sphere':
      add(new THREE.SphereGeometry(0.5, 18, 12).scale(sx, sy, sz), o.m);
      break;
    case 'cylinder':
      add(new THREE.CylinderGeometry(0.5, 0.5, 1, 20).scale(sx, sy, sz), o.m);
      break;
    case 'wedge':
      add(wedgeGeo(sx, sy, sz), o.m);
      break;
    case 'stairs':
      for (const st of stairsSteps(sx, sy, sz)) add(at(boxGeo(...st.s), ...st.p), o.m);
      break;
    case 'tree':
      treeParts(o, add);
      break;
    case 'resource':
      if (o.kind === 'tree') treeParts({ ...o, kind: 'pine' }, add);
      else if (o.kind === 'rock') add(new THREE.DodecahedronGeometry(0.5, 0).scale(sx, sy, sz), 'stone', '#9e9e9e');
      else {
        add(new THREE.IcosahedronGeometry(0.5, 0).scale(sx, sy, sz), 'grass', '#388e3c');
        for (let i = 0; i < 5; i++) {
          const a = i * 1.26;
          add(at(new THREE.SphereGeometry(0.12, 6, 4), Math.cos(a) * sx * 0.38, sy * 0.1 + (i % 2) * 0.2, Math.sin(a) * sz * 0.38), 'plastic', '#e53935', 'berry');
        }
      }
      break;
    case 'door':
      add(boxGeo(sx, sy, sz), o.m);
      add(at(new THREE.SphereGeometry(0.09, 8, 6), sx > sz ? sx * 0.38 : 0, 0, sx > sz ? sz * 0.6 : sz * 0.38), 'metal', '#ffd54f');
      break;
    case 'light':
      add(new THREE.SphereGeometry(0.5, 12, 8).scale(sx, sy, sz), 'neon', c, 'bulb');
      break;
    case 'deco':
      decoParts(o, add);
      break;
    case 'spawn':
      add(boxGeo(sx, sy, sz), 'plastic', '#eceff1');
      add(at(boxGeo(sx * 0.7, 0.04, sz * 0.7), 0, sy / 2 + 0.02, 0), 'neon', c);
      break;
    case 'checkpoint':
      add(boxGeo(sx, sy, sz), 'neon', c);
      add(at(new THREE.CylinderGeometry(0.06, 0.06, 3, 6), sx / 2 - 0.2, 1.5, 0), 'metal', '#eeeeee');
      add(at(boxGeo(0.9, 0.6, 0.05), sx / 2 - 0.2 - 0.45, 2.7, 0), 'plastic', '#ff7043', 'flag');
      break;
    case 'finish':
      for (let i = 0; i < 4; i++) for (let j = 0; j < 4; j++) {
        add(at(boxGeo(sx / 4, sy, sz / 4), -sx / 2 + sx / 8 + (i * sx) / 4, 0, -sz / 2 + sz / 8 + (j * sz) / 4), 'neon', (i + j) % 2 ? '#212121' : '#fafafa');
      }
      add(at(boxGeo(0.4, 5, 0.4), -sx / 2, 2.5, -sz / 2), 'metal', '#fdd835');
      add(at(boxGeo(0.4, 5, 0.4), sx / 2, 2.5, -sz / 2), 'metal', '#fdd835');
      add(at(boxGeo(sx + 0.4, 0.8, 0.3), 0, 5, -sz / 2), 'neon', c);
      break;
    case 'coin':
      add(new THREE.CylinderGeometry(0.45, 0.45, 0.12, 20).rotateX(Math.PI / 2).scale(sx, sy, sz), 'metal', c);
      break;
    case 'gem':
      add(new THREE.OctahedronGeometry(0.6, 0).scale(sx, sy * 1.4, sz), 'neon', c);
      break;
    case 'chest':
      add(at(boxGeo(sx, sy * 0.6, sz), 0, -sy * 0.2, 0), 'wood', c);
      add(at(boxGeo(sx * 1.02, sy * 0.06, sz * 1.02), 0, -sy * 0.05, 0), 'metal', '#ffca28');
      add(at(boxGeo(sx, sy * 0.4, sz), 0, sy * 0.3, 0), 'wood', c, 'lid');
      break;
    case 'jumppad':
      add(new THREE.CylinderGeometry(0.5, 0.55, 1, 20).scale(sx, sy, sz), 'neon', c);
      add(at(new THREE.CylinderGeometry(0.35, 0.35, 0.05, 20).scale(sx, 1, sz), 0, sy / 2 + 0.03, 0), 'neon', '#ffffff');
      break;
    case 'seat':
      if (!o.hidden) add(boxGeo(sx, sy, sz), o.m);
      break;
    case 'switch':
      add(boxGeo(sx, sy, sz), 'metal', '#546e7a');
      add(at(boxGeo(sx * 0.7, sy * 0.35, 0.15), 0, sy * 0.15, 0), 'neon', c, 'lever');
      break;
    case 'water':
      add(new THREE.CylinderGeometry(0.5, 0.5, 1, 24).scale(sx, sy, sz), 'glass', c, 'water');
      break;
    case 'sign':
      add(boxGeo(sx, sy, sz), o.m);
      break;
    case 'keycap': {
      // Tecla mecánica: base más oscura y cuerpo superior un poco más estrecho
      const base = new THREE.Color(c).multiplyScalar(0.72).getStyle();
      add(at(boxGeo(sx, sy * 0.45, sz), 0, -sy * 0.275, 0), o.m, base);
      add(at(boxGeo(sx * 0.9, sy * 0.55, sz * 0.9), 0, sy * 0.225, 0), o.m, c);
      break;
    }
    case 'saw': {
      // Sierra circular giratoria (disco vertical con dientes)
      add(new THREE.CylinderGeometry(sy / 2, sy / 2, 0.18, 28).rotateZ(Math.PI / 2), 'metal', '#cfd8dc', 'spin');
      for (let i = 0; i < 12; i++) {
        const a = (i / 12) * Math.PI * 2;
        add(at(boxGeo(0.2, 0.35, 0.35).rotateX(a), 0, Math.cos(a) * sy * 0.5, Math.sin(a) * sy * 0.5), 'metal', '#eceff1', 'spin');
      }
      add(new THREE.CylinderGeometry(sy * 0.12, sy * 0.12, 0.3, 12).rotateZ(Math.PI / 2), 'plastic', '#e53935', 'spin');
      break;
    }
    case 'flame':
      add(at(boxGeo(sx * 0.5, sx * 0.5, sx * 0.5), 0, -sy / 2 + sx * 0.25, 0), 'metal', '#455a64');
      add(at(new THREE.ConeGeometry(sx * 0.5, sy * 0.9, 10).rotateX(Math.PI), 0, sy * 0.05, 0), 'neon', '#ff6d00', 'flamejet');
      add(at(new THREE.ConeGeometry(sx * 0.25, sy * 0.7, 8).rotateX(Math.PI), 0, sy * 0.05, 0), 'neon', '#ffea00', 'flamejet');
      break;
    default:
      break;
  }
  return P;
}

function treeParts(o, add) {
  const [sx, sy, sz] = o.s;
  const trunkH = sy * 0.45;
  add(at(boxGeo(sx * 0.22, trunkH, sz * 0.22), 0, -sy / 2 + trunkH / 2, 0), 'wood', '#6d4c41');
  if (o.kind === 'pine') {
    add(at(new THREE.ConeGeometry(sx * 0.55, sy * 0.45, 7), 0, -sy / 2 + trunkH * 0.75 + sy * 0.225, 0), 'grass', o.c);
    add(at(new THREE.ConeGeometry(sx * 0.4, sy * 0.38, 7), 0, -sy / 2 + trunkH * 0.75 + sy * 0.5, 0), 'grass', o.c);
  } else {
    add(at(boxGeo(sx, sy * 0.38, sz), 0, -sy / 2 + trunkH + sy * 0.15, 0), 'grass', o.c);
    add(at(boxGeo(sx * 0.62, sy * 0.24, sz * 0.62), 0, -sy / 2 + trunkH + sy * 0.43, 0), 'grass', o.c);
  }
}

function decoParts(o, add) {
  const [sx, sy, sz] = o.s;
  const c = o.c;
  switch (o.kind) {
    case 'flower':
      add(at(boxGeo(0.08, sy * 0.7, 0.08), 0, -sy * 0.15, 0), 'grass', '#43a047');
      add(at(boxGeo(sx * 0.5, sy * 0.25, sz * 0.5), 0, sy * 0.3, 0), 'plastic', c);
      add(at(boxGeo(sx * 0.2, sy * 0.27, sz * 0.2), 0, sy * 0.3, 0), 'plastic', '#ffeb3b');
      break;
    case 'bush':
      add(new THREE.IcosahedronGeometry(0.5, 0).scale(sx, sy, sz), 'grass', c === '#ec407a' ? '#43a047' : c);
      break;
    case 'rock':
      add(new THREE.DodecahedronGeometry(0.5, 0).scale(sx, sy, sz), 'stone', c === '#ec407a' ? '#9e9e9e' : c);
      break;
    case 'lamp':
      add(at(boxGeo(sx * 0.3, sy, sz * 0.3), 0, 0, 0), 'metal', '#37474f');
      add(at(boxGeo(sx * 1.1, sx * 0.9, sz * 1.1), 0, sy / 2 + sx * 0.3, 0), 'neon', '#fff3c4', 'bulb');
      break;
    case 'bench':
      add(at(boxGeo(sx, sy * 0.12, sz * 0.5), 0, -sy * 0.05, 0), 'wood', c);
      add(at(boxGeo(sx, sy * 0.4, sz * 0.1), 0, sy * 0.3, -sz * 0.25), 'wood', c);
      for (const x of [-0.4, 0.4]) add(at(boxGeo(0.1, sy * 0.45, sz * 0.5), x * sx, -sy * 0.3, 0), 'metal', '#37474f');
      break;
    case 'fence':
      for (const x of [-0.45, 0, 0.45]) add(at(boxGeo(0.15, sy, 0.15), x * sx, 0, 0), 'wood', c);
      add(at(boxGeo(sx, 0.12, 0.08), 0, sy * 0.25, 0), 'wood', c);
      add(at(boxGeo(sx, 0.12, 0.08), 0, -sy * 0.15, 0), 'wood', c);
      break;
    case 'barrel':
      add(new THREE.CylinderGeometry(0.45, 0.5, 1, 14).scale(sx, sy, sz), 'wood', c);
      add(at(new THREE.CylinderGeometry(0.52, 0.52, 0.06, 14).scale(sx, 1, sz), 0, sy * 0.25, 0), 'metal', '#455a64');
      break;
    case 'crate':
      add(boxGeo(sx, sy, sz), 'wood', c);
      break;
    case 'campfire':
      add(at(boxGeo(sx, sy * 0.25, 0.25).rotateY(0.6), 0, -sy * 0.35, 0), 'wood', '#5d4037');
      add(at(boxGeo(sx, sy * 0.25, 0.25).rotateY(-0.6), 0, -sy * 0.35, 0), 'wood', '#5d4037');
      add(at(new THREE.ConeGeometry(sx * 0.3, sy * 0.9, 6), 0, sy * 0.05, 0), 'neon', '#ff9100', 'fire');
      break;
    case 'log':
      add(new THREE.CylinderGeometry(0.5, 0.5, 1, 10).rotateZ(Math.PI / 2).scale(sx, sy, sz), 'wood', c);
      break;
    case 'statue':
      add(at(boxGeo(sx, sy * 0.2, sz), 0, -sy * 0.4, 0), 'stone', '#9e9e9e');
      add(at(boxGeo(sx * 0.4, sy * 0.35, sz * 0.25), 0, -sy * 0.05, 0), 'stone', '#bdbdbd');
      add(at(boxGeo(sx * 0.3, sy * 0.25, sz * 0.3), 0, sy * 0.28, 0), 'stone', '#bdbdbd');
      add(at(boxGeo(sx * 0.12, sy * 0.35, sz * 0.12), sx * 0.27, sy * 0.05, 0), 'stone', '#bdbdbd');
      add(at(boxGeo(sx * 0.12, sy * 0.35, sz * 0.12), -sx * 0.27, sy * 0.05, 0), 'stone', '#bdbdbd');
      break;
    case 'fountain':
      add(at(new THREE.CylinderGeometry(0.5, 0.5, 0.3, 20).scale(sx, sy, sz), 0, -sy * 0.35, 0), 'stone', '#90a4ae');
      add(at(new THREE.CylinderGeometry(0.45, 0.45, 0.05, 20).scale(sx, 1, sz), 0, -sy * 0.2, 0), 'glass', '#4fc3f7');
      add(at(new THREE.CylinderGeometry(0.08, 0.08, 0.7, 10).scale(sx, sy, sz), 0, 0, 0), 'stone', '#b0bec5');
      add(at(new THREE.SphereGeometry(0.12, 10, 8).scale(sx, sy, sz), 0, sy * 0.38, 0), 'metal', '#ffd54f');
      break;
    default:
      add(boxGeo(sx, sy, sz), o.m);
  }
}

/** Colisionadores en espacio local: [{kind, p:[x,y,z], h:[hx,hy,hz]}]. */
export function objectColliders(o) {
  if (o.nc) return [];
  const [sx, sy, sz] = o.s;
  const box = (p, s) => ({ kind: 'box', p, h: [s[0] / 2, s[1] / 2, s[2] / 2] });
  switch (o.t) {
    case 'keycap':
      return [box([0, 0, 0], [sx, sy, sz])];
    case 'flame':
      return [box([0, -sy / 2 + sx * 0.25, 0], [sx * 0.5, sx * 0.5, sx * 0.5])];
    case 'block': case 'window': case 'sign': case 'spawn': case 'checkpoint': case 'finish': case 'platform':
    case 'jumppad': case 'chest': case 'door': case 'cylinder': case 'switch':
      return [box([0, 0, 0], [sx, sy, sz])];
    case 'sphere':
      return [box([0, 0, 0], [sx * 0.85, sy * 0.9, sz * 0.85])];
    case 'wedge':
      return [{ kind: 'ramp', p: [0, 0, 0], h: [sx / 2, sy / 2, sz / 2] }];
    case 'stairs':
      return stairsSteps(sx, sy, sz).map((st) => box(st.p, st.s));
    case 'tree':
      return [box([0, -sy / 2 + sy * 0.25, 0], [sx * 0.25, sy * 0.5, sz * 0.25])];
    case 'resource':
      if (o.kind === 'tree') return [box([0, -sy / 2 + sy * 0.25, 0], [sx * 0.25, sy * 0.5, sz * 0.25])];
      if (o.kind === 'rock') return [box([0, 0, 0], [sx * 0.8, sy * 0.85, sz * 0.8])];
      return [];
    case 'deco':
      if (['flower', 'bush', 'campfire'].includes(o.kind)) return [];
      if (o.kind === 'lamp') return [box([0, 0, 0], [sx * 0.3, sy, sz * 0.3])];
      if (o.kind === 'bench') return [box([0, -sy * 0.1, 0], [sx, sy * 0.6, sz * 0.5])];
      if (o.kind === 'rock') return [box([0, 0, 0], [sx * 0.8, sy * 0.85, sz * 0.8])];
      return [box([0, 0, 0], [sx, sy, sz])];
    default:
      return [];
  }
}

export const INTERACTIVE = new Set(['door', 'chest', 'switch', 'seat', 'gem', 'coin', 'resource']);
export const DYNAMIC_VISUAL = new Set(['door', 'chest', 'switch', 'gem', 'coin', 'platform', 'kill', 'light', 'water', 'sign', 'resource', 'jumppad', 'checkpoint', 'keycap', 'saw', 'flame']);
