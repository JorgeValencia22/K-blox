// Materiales compartidos con texturas ligeras generadas por código (originales).
import * as THREE from 'three';
import { settings } from '../core/settings.js';

const texCache = new Map();
const matCache = new Map();

function canvasTex(size, draw) {
  const c = document.createElement('canvas');
  c.width = c.height = size;
  const g = c.getContext('2d');
  draw(g, size);
  const t = new THREE.CanvasTexture(c);
  t.wrapS = t.wrapT = THREE.RepeatWrapping;
  t.colorSpace = THREE.SRGBColorSpace;
  t.anisotropy = 4;
  return t;
}

function noise(g, s, amount, alpha = 0.08, scale = 1) {
  for (let i = 0; i < amount; i++) {
    const v = Math.random() > 0.5 ? 255 : 0;
    g.fillStyle = `rgba(${v},${v},${v},${Math.random() * alpha})`;
    g.fillRect(Math.random() * s, Math.random() * s, scale, scale);
  }
}

const TEXTURES = {
  plastic: (g, s) => {
    g.fillStyle = '#fff'; g.fillRect(0, 0, s, s);
    noise(g, s, 400, 0.04);
    g.strokeStyle = 'rgba(0,0,0,0.06)'; g.lineWidth = 2; g.strokeRect(1, 1, s - 2, s - 2);
  },
  wood: (g, s) => {
    g.fillStyle = '#fff'; g.fillRect(0, 0, s, s);
    for (let y = 0; y < s; y += 2) {
      g.fillStyle = `rgba(80,40,0,${0.04 + Math.abs(Math.sin(y * 0.35)) * 0.1})`;
      g.fillRect(0, y, s, 1);
    }
    g.fillStyle = 'rgba(60,30,0,0.18)';
    for (let y = 0; y < s; y += s / 4) g.fillRect(0, y, s, 1);
  },
  brick: (g, s) => {
    g.fillStyle = '#fff'; g.fillRect(0, 0, s, s);
    const bh = s / 4;
    g.fillStyle = 'rgba(0,0,0,0.18)';
    for (let r = 0; r < 4; r++) {
      g.fillRect(0, r * bh, s, 2);
      const off = r % 2 ? s / 4 : 0;
      for (let x = off; x < s + s / 2; x += s / 2) g.fillRect(x, r * bh, 2, bh);
    }
    noise(g, s, 500, 0.08);
  },
  stone: (g, s) => {
    g.fillStyle = '#fff'; g.fillRect(0, 0, s, s);
    noise(g, s, 1400, 0.12, 2);
  },
  grass: (g, s) => {
    g.fillStyle = '#fff'; g.fillRect(0, 0, s, s);
    for (let i = 0; i < 700; i++) {
      g.fillStyle = `rgba(0,${Math.random() > 0.5 ? 60 : 0},0,${Math.random() * 0.12})`;
      g.fillRect(Math.random() * s, Math.random() * s, 1, 3);
    }
  },
  sand: (g, s) => {
    g.fillStyle = '#fff'; g.fillRect(0, 0, s, s);
    noise(g, s, 2000, 0.1);
  },
  metal: (g, s) => {
    g.fillStyle = '#fff'; g.fillRect(0, 0, s, s);
    for (let y = 0; y < s; y++) {
      g.fillStyle = `rgba(0,0,0,${Math.random() * 0.05})`;
      g.fillRect(0, y, s, 1);
    }
  },
  ice: (g, s) => {
    g.fillStyle = '#fff'; g.fillRect(0, 0, s, s);
    g.strokeStyle = 'rgba(255,255,255,0.5)';
    for (let i = 0; i < 6; i++) { g.beginPath(); g.moveTo(Math.random() * s, Math.random() * s); g.lineTo(Math.random() * s, Math.random() * s); g.stroke(); }
  },
};

export function texture(name) {
  if (!TEXTURES[name]) return null;
  if (!texCache.has(name)) texCache.set(name, canvasTex(64, TEXTURES[name]));
  return texCache.get(name);
}

const PROPS = {
  plastic: { roughness: 0.55, metalness: 0.02 },
  wood: { roughness: 0.85, metalness: 0 },
  metal: { roughness: 0.45, metalness: 0.2 },
  stone: { roughness: 0.92, metalness: 0 },
  grass: { roughness: 0.95, metalness: 0 },
  sand: { roughness: 1, metalness: 0 },
  brick: { roughness: 0.9, metalness: 0 },
  ice: { roughness: 0.15, metalness: 0.1 },
  glass: { roughness: 0.1, metalness: 0.1 },
};

/** Material compartido por nombre. Con vertexColors=true el color viene de la geometría. */
export function material(name, { color = null, vertexColors = !color } = {}) {
  const key = `${name}|${color}|${vertexColors}|${settings.get('quality') === 'high'}`;
  if (matCache.has(key)) return matCache.get(key);
  let m;
  if (name === 'neon') {
    m = new THREE.MeshBasicMaterial({ vertexColors, color: color || 0xffffff });
  } else if (name === 'glass') {
    m = new THREE.MeshStandardMaterial({ vertexColors, color: color || 0xffffff, transparent: true, opacity: 0.42, depthWrite: false, ...PROPS.glass });
  } else if (settings.get('quality') === 'high' || name === 'metal' || name === 'ice') {
    m = new THREE.MeshStandardMaterial({ vertexColors, color: color || 0xffffff, map: texture(name) || texture('plastic'), ...(PROPS[name] || PROPS.plastic) });
  } else {
    // En calidad baja/media se usa iluminación Lambert (mucho más barata en gráficos integrados).
    m = new THREE.MeshLambertMaterial({ vertexColors, color: color || 0xffffff, map: texture(name) || texture('plastic') });
  }
  matCache.set(key, m);
  return m;
}
