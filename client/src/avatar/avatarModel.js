// Personaje redondeado (estilo muñeco): cabeza esférica con cara pintada, cuerpo y
// extremidades en cápsula, manos y zapatos redondos. Ropa, peinados, accesorios y
// efectos se generan con geometría simple y texturas de canvas.
// Geometrías, materiales y texturas se comparten entre todos los avatares (caché):
// con muchos jugadores y bots se ahorra memoria y tiempo de creación.
import * as THREE from 'three';
import { RoundedBoxGeometry } from 'three/examples/jsm/geometries/RoundedBoxGeometry.js';
import { DEFAULT_AVATAR } from '../../../shared/avatar.js';
import { settings } from '../core/settings.js';

// --- Cachés compartidas ------------------------------------------------------------
const GEO = new Map();
const MAT = new Map();
const TEX = new Map();
const shared = (o) => {
  o.userData.shared = true;
  return o;
};
const geo = (key, make) => {
  let g = GEO.get(key);
  if (!g) GEO.set(key, (g = shared(make())));
  return g;
};
const sphere = (r, w = 14, h = 10) => geo(`s${r}|${w}|${h}`, () => new THREE.SphereGeometry(r, w, h));
const shell = (r, ps, pl, ts, tl) => geo(`sh${r}|${ps}|${pl}|${ts}|${tl}`, () => new THREE.SphereGeometry(r, 18, 10, ps, pl, ts, tl));
const capsule = (r, len) => geo(`c${r}|${len}`, () => new THREE.CapsuleGeometry(r, len, 3, 10));
const cyl = (rt, rb, hh, seg = 14, open = false) => geo(`y${rt}|${rb}|${hh}|${seg}|${open}`, () => new THREE.CylinderGeometry(rt, rb, hh, seg, 1, open));
const cone = (r, hh, seg = 10) => geo(`k${r}|${hh}|${seg}`, () => new THREE.ConeGeometry(r, hh, seg));
const torus = (R, t, arc = Math.PI * 2) => geo(`t${R}|${t}|${arc}`, () => new THREE.TorusGeometry(R, t, 6, 18, arc));
const rbox = (w, hh, d, rad = 0.04) => geo(`b${w}|${hh}|${d}|${rad}`, () => new RoundedBoxGeometry(w, hh, d, 2, rad));

const std = (color, extra = null) => {
  const key = `${color}|${extra ? JSON.stringify(extra) : ''}`;
  let m = MAT.get(key);
  if (!m) MAT.set(key, (m = shared(new THREE.MeshStandardMaterial({ color, roughness: 0.65, ...(extra || {}) }))));
  return m;
};
const texMat = (key, draw, w, hh) => {
  let m = MAT.get(key);
  if (m) return m;
  let t = TEX.get(key);
  if (!t) {
    const c = document.createElement('canvas');
    c.width = w;
    c.height = hh;
    draw(c.getContext('2d'), w, hh);
    t = shared(new THREE.CanvasTexture(c));
    t.colorSpace = THREE.SRGBColorSpace;
    t.anisotropy = 2;
    TEX.set(key, t);
  }
  MAT.set(key, (m = shared(new THREE.MeshStandardMaterial({ map: t, roughness: 0.7 }))));
  return m;
};

function mesh(g, m, x = 0, y = 0, z = 0, scale = null, rot = null) {
  const o = new THREE.Mesh(g, m);
  o.position.set(x, y, z);
  if (scale) o.scale.set(...scale);
  if (rot) o.rotation.set(...rot);
  o.castShadow = true;
  return o;
}

const shade = (hex, k) => '#' + new THREE.Color(hex).multiplyScalar(k).getHexString();

// --- Caras ---------------------------------------------------------------------------
// La cabeza es una esfera: en su textura (256×128 unidades) el frente está en x=64 y el
// ecuador en y=64. Ojos a la altura y≈57, boca en y≈76.
const FX = 64, EY = 57, MY = 77;

function drawFace(g, face, skin) {
  g.fillStyle = skin;
  g.fillRect(0, 0, 256, 128);
  const ink = '#1d1b26';
  const oval = (x, y, rx, ry, color = ink) => { g.fillStyle = color; g.beginPath(); g.ellipse(x, y, rx, ry, 0, 0, Math.PI * 2); g.fill(); };
  const line = (pts, w = 1.6, color = ink) => {
    g.strokeStyle = color; g.lineWidth = w; g.lineCap = 'round'; g.lineJoin = 'round';
    g.beginPath(); pts.forEach(([x, y], i) => (i ? g.lineTo(x, y) : g.moveTo(x, y))); g.stroke();
  };
  const arc = (x, y, r, a0, a1, w = 1.6, color = ink) => { g.strokeStyle = color; g.lineWidth = w; g.lineCap = 'round'; g.beginPath(); g.arc(x, y, r, a0, a1); g.stroke(); };
  const eyes = (rx = 2.4, ry = 3.4, dy = 0) => {
    for (const s of [-1, 1]) {
      oval(FX + s * 9, EY + dy, rx, ry);
      oval(FX + s * 9 + 0.8, EY + dy - 1.2, rx * 0.35, ry * 0.3, '#ffffff');
    }
  };
  const blush = (a = 0.35) => { oval(FX - 15, MY - 6, 3.6, 2, `rgba(255,120,120,${a})`); oval(FX + 15, MY - 6, 3.6, 2, `rgba(255,120,120,${a})`); };
  const smile = (r = 6, w = 1.7) => arc(FX, MY - 7, r, 0.25 * Math.PI, 0.75 * Math.PI, w);
  const brows = (tilt = 0, dy = 0) => {
    line([[FX - 13, EY - 7 + dy - tilt], [FX - 6, EY - 7 + dy + tilt]], 1.4);
    line([[FX + 6, EY - 7 + dy + tilt], [FX + 13, EY - 7 + dy - tilt]], 1.4);
  };
  const star = (x, y, r, color) => {
    g.fillStyle = color; g.beginPath();
    for (let i = 0; i < 10; i++) { const rr = i % 2 ? r * 0.45 : r, a = -Math.PI / 2 + (i * Math.PI) / 5; g.lineTo(x + Math.cos(a) * rr, y + Math.sin(a) * rr); }
    g.fill();
  };
  const heart = (x, y, s, color) => {
    g.fillStyle = color; g.beginPath(); g.moveTo(x, y + s * 0.9);
    g.bezierCurveTo(x - s * 1.4, y - s * 0.2, x - s * 0.6, y - s * 1.2, x, y - s * 0.4);
    g.bezierCurveTo(x + s * 0.6, y - s * 1.2, x + s * 1.4, y - s * 0.2, x, y + s * 0.9); g.fill();
  };
  switch (face) {
    case 'face_happy':
      arc(FX - 9, EY + 1, 3, 1.1 * Math.PI, 1.9 * Math.PI, 1.8); arc(FX + 9, EY + 1, 3, 1.1 * Math.PI, 1.9 * Math.PI, 1.8);
      g.fillStyle = ink; g.beginPath(); g.arc(FX, MY - 6, 5.5, 0, Math.PI); g.fill();
      oval(FX, MY - 2.4, 3, 1.4, '#ff6f7d'); blush(0.45);
      break;
    case 'face_cool':
      g.fillStyle = '#111'; g.beginPath(); g.roundRect(FX - 16, EY - 4, 13, 7, 3); g.roundRect(FX + 3, EY - 4, 13, 7, 3); g.fill();
      line([[FX - 3, EY - 2], [FX + 3, EY - 2]], 1.5, '#111');
      line([[FX - 4, MY - 2], [FX + 5, MY - 4]], 1.6);
      break;
    case 'face_wink':
      eyes(); g.fillStyle = skin; g.fillRect(FX + 5, EY - 5, 9, 10);
      arc(FX + 9, EY + 1, 3, 1.1 * Math.PI, 1.9 * Math.PI, 1.8);
      smile(); blush(0.3);
      break;
    case 'face_surprised':
      eyes(2.8, 3.8); brows(0, -3); oval(FX, MY - 3, 2.6, 3.4);
      break;
    case 'face_freckles':
      eyes(); smile();
      for (const s of [-1, 1]) for (const [dx, dy] of [[11, 6], [14, 8], [17, 5], [13, 10]]) oval(FX + s * dx, EY + dy, 0.6, 0.6, '#a0522d');
      break;
    case 'face_angry':
      eyes(2.2, 2.8, 1); brows(-2.2, 1); arc(FX, MY + 1, 5, 1.2 * Math.PI, 1.8 * Math.PI, 1.7);
      break;
    case 'face_sleepy':
      line([[FX - 12, EY + 1], [FX - 6, EY + 1]], 1.6); line([[FX + 6, EY + 1], [FX + 12, EY + 1]], 1.6);
      oval(FX + 2, MY - 3, 2, 2.4);
      g.fillStyle = '#5c6bc0'; g.font = 'bold 9px sans-serif'; g.fillText('z', FX + 18, EY - 6); g.font = 'bold 6px sans-serif'; g.fillText('z', FX + 23, EY - 11);
      break;
    case 'face_shy':
      eyes(2, 2.8, 1); arc(FX, MY - 4, 3, 0.3 * Math.PI, 0.7 * Math.PI, 1.5); blush(0.75);
      break;
    case 'face_tongue':
      eyes(); g.fillStyle = ink; g.beginPath(); g.arc(FX, MY - 6, 5.5, 0, Math.PI); g.fill();
      oval(FX + 1.5, MY - 1, 3, 3.2, '#ff5c79');
      break;
    case 'face_nerd':
      eyes(1.8, 2.4); g.strokeStyle = '#263238'; g.lineWidth = 1.4;
      g.beginPath(); g.arc(FX - 9, EY, 5, 0, Math.PI * 2); g.moveTo(FX + 14, EY); g.arc(FX + 9, EY, 5, 0, Math.PI * 2); g.stroke();
      line([[FX - 4, EY], [FX + 4, EY]], 1.4, '#263238');
      smile(4); g.fillStyle = '#ffffff'; g.fillRect(FX - 2, MY - 2, 4, 2.6);
      break;
    case 'face_determined':
      eyes(2.4, 3); brows(-1.2, 0); line([[FX - 5, MY - 3], [FX + 5, MY - 3]], 1.8);
      break;
    case 'face_cat':
      eyes(2.6, 3.6); oval(FX, MY - 9, 1.6, 1.1, '#ff8a9a');
      arc(FX - 2.5, MY - 7, 2.5, 0.1 * Math.PI, 0.9 * Math.PI, 1.3); arc(FX + 2.5, MY - 7, 2.5, 0.1 * Math.PI, 0.9 * Math.PI, 1.3);
      for (const s of [-1, 1]) for (const dy of [-1.5, 1.5]) line([[FX + s * 13, MY - 8 + dy], [FX + s * 21, MY - 9 + dy * 2]], 0.8);
      break;
    case 'face_lol':
      arc(FX - 9, EY + 1, 3, 1.1 * Math.PI, 1.9 * Math.PI, 1.8); arc(FX + 9, EY + 1, 3, 1.1 * Math.PI, 1.9 * Math.PI, 1.8);
      g.fillStyle = ink; g.beginPath(); g.arc(FX, MY - 6, 6.5, 0, Math.PI); g.fill();
      oval(FX - 14, EY + 5, 2, 3.2, '#4fc3f7'); oval(FX + 14, EY + 5, 2, 3.2, '#4fc3f7');
      break;
    case 'face_evil':
      eyes(2.2, 2.6, 1); brows(-2.4, 1);
      g.fillStyle = ink; g.beginPath(); g.moveTo(FX - 8, MY - 6); g.quadraticCurveTo(FX, MY + 1, FX + 8, MY - 7); g.quadraticCurveTo(FX, MY - 3, FX - 8, MY - 6); g.fill();
      break;
    case 'face_stars':
      star(FX - 9, EY, 4.5, '#ffca28'); star(FX + 9, EY, 4.5, '#ffca28'); smile(6, 1.9);
      break;
    case 'face_hearts':
      heart(FX - 9, EY, 3.6, '#ff3d6e'); heart(FX + 9, EY, 3.6, '#ff3d6e'); smile(5); blush(0.5);
      break;
    case 'face_robot':
      g.fillStyle = '#90a4ae'; g.beginPath(); g.roundRect(FX - 20, EY - 8, 40, 30, 4); g.fill();
      oval(FX - 9, EY, 3.4, 3.4, '#00e5ff'); oval(FX + 9, EY, 3.4, 3.4, '#00e5ff');
      g.fillStyle = '#263238'; for (let i = 0; i < 5; i++) g.fillRect(FX - 9 + i * 4, MY - 6, 2.4, 4);
      break;
    default: // face_smile
      eyes(); smile(); blush(0.25);
  }
}

function faceMaterial(face, skin) {
  return texMat(`face|${face}|${skin}`, (g) => {
    g.fillStyle = skin;
    g.fillRect(0, 0, 512, 256);
    // Rasgos grandes y expresivos (estilo muñeco): se amplían alrededor del centro de la cara
    g.scale(2, 2);
    g.translate(FX, 64);
    g.scale(1.4, 1.4);
    g.translate(-FX, -64);
    drawFace(g, face, skin);
  }, 512, 256);
}

// --- Ropa ------------------------------------------------------------------------------
// Textura de torso (cápsula girada 180°): el frente queda centrado en x=64 de 128.
function drawShirt(g, style, color) {
  const W = 128, H = 128;
  g.fillStyle = color;
  g.fillRect(0, 0, W, H);
  const dark = shade(color, 0.7), light = shade(color, 1.25);
  const rnd = mulberry(style.length * 97);
  switch (style) {
    case 'shirt_stripes':
      g.fillStyle = 'rgba(255,255,255,0.8)';
      for (let y = 22; y < 112; y += 14) g.fillRect(0, y, W, 6);
      break;
    case 'shirt_tank':
      g.fillStyle = dark; g.fillRect(0, 26, W, 3);
      break;
    case 'shirt_heart':
      g.fillStyle = '#ff4d79'; g.beginPath(); g.moveTo(64, 82); g.bezierCurveTo(44, 66, 50, 46, 64, 58); g.bezierCurveTo(78, 46, 84, 66, 64, 82); g.fill();
      break;
    case 'shirt_hoodie':
      g.fillStyle = dark; g.fillRect(44, 74, 40, 22);
      g.fillStyle = '#ffffff'; g.fillRect(58, 30, 2, 22); g.fillRect(68, 30, 2, 22);
      break;
    case 'shirt_flannel':
      g.fillStyle = 'rgba(0,0,0,0.28)'; for (let x = 0; x < W; x += 16) g.fillRect(x, 0, 6, H);
      g.fillStyle = 'rgba(0,0,0,0.22)'; for (let y = 0; y < H; y += 16) g.fillRect(0, y, W, 6);
      g.fillStyle = 'rgba(255,255,255,0.25)'; for (let x = 8; x < W; x += 16) g.fillRect(x, 0, 1, H);
      break;
    case 'shirt_sweater':
      g.fillStyle = '#ffffff';
      for (let x = 4; x < W; x += 12) { g.beginPath(); g.moveTo(x, 52); g.lineTo(x + 6, 44); g.lineTo(x + 12, 52); g.lineTo(x + 6, 60); g.fill(); }
      g.fillStyle = dark; g.fillRect(0, 36, W, 4); g.fillRect(0, 64, W, 4);
      break;
    case 'shirt_jersey':
      g.fillStyle = '#ffffff'; g.fillRect(0, 30, W, 5); g.fillRect(0, 100, W, 4);
      g.font = '900 30px Nunito, sans-serif'; g.textAlign = 'center'; g.fillText('10', 64, 80);
      break;
    case 'shirt_camo':
    case 'shirt_galaxy':
    case 'shirt_flames':
    case 'shirt_rainbow':
      pattern(g, style.replace('shirt_', ''), color, W, H, rnd);
      break;
    case 'shirt_overalls':
      g.fillStyle = '#ffffff'; g.fillRect(0, 0, W, H);
      g.fillStyle = color; g.fillRect(0, 0, W, H); // la camiseta usa el color
      g.fillStyle = '#3f6fb5'; g.fillRect(44, 48, 40, 80); g.fillRect(0, 92, W, 36);
      g.fillRect(44, 20, 6, 30); g.fillRect(78, 20, 6, 30);
      g.fillStyle = '#ffd54f'; g.fillRect(46, 50, 4, 4); g.fillRect(78, 50, 4, 4);
      break;
    case 'shirt_lightning':
      g.fillStyle = '#ffeb3b'; g.beginPath(); g.moveTo(70, 34); g.lineTo(52, 66); g.lineTo(64, 66); g.lineTo(56, 94); g.lineTo(78, 58); g.lineTo(66, 58); g.lineTo(74, 34); g.fill();
      break;
    case 'shirt_star': {
      g.fillStyle = '#ffd54f'; g.beginPath();
      for (let i = 0; i < 10; i++) { const r = i % 2 ? 8 : 18, a = -Math.PI / 2 + (i * Math.PI) / 5; g.lineTo(64 + Math.cos(a) * r, 62 + Math.sin(a) * r); }
      g.fill();
      break;
    }
    case 'shirt_panda':
      g.fillStyle = '#fafafa'; g.beginPath(); g.ellipse(64, 64, 22, 20, 0, 0, Math.PI * 2); g.fill();
      g.fillStyle = '#212121'; for (const s of [-1, 1]) { g.beginPath(); g.ellipse(64 + s * 8, 60, 5, 6, s * 0.4, 0, Math.PI * 2); g.fill(); g.beginPath(); g.arc(64 + s * 17, 46, 6, 0, Math.PI * 2); g.fill(); }
      g.beginPath(); g.ellipse(64, 70, 3, 2, 0, 0, Math.PI * 2); g.fill();
      break;
    case 'shirt_jacket':
      g.fillStyle = '#ffffff'; g.fillRect(54, 20, 20, 108);
      g.fillStyle = color; g.beginPath(); g.moveTo(54, 20); g.lineTo(64, 50); g.lineTo(54, 128); g.fill(); g.beginPath(); g.moveTo(74, 20); g.lineTo(64, 50); g.lineTo(74, 128); g.fill();
      g.fillStyle = '#bdbdbd'; g.fillRect(63, 50, 2, 78);
      break;
    case 'shirt_suit':
      g.fillStyle = '#ffffff'; g.beginPath(); g.moveTo(50, 20); g.lineTo(78, 20); g.lineTo(64, 70); g.closePath(); g.fill();
      g.fillStyle = '#c62828'; g.beginPath(); g.moveTo(61, 26); g.lineTo(67, 26); g.lineTo(68, 62); g.lineTo(64, 68); g.lineTo(60, 62); g.fill();
      g.fillStyle = light; g.fillRect(63, 78, 2, 2); g.fillRect(63, 92, 2, 2);
      break;
    case 'shirt_ninja':
      g.fillStyle = '#212121'; g.fillRect(0, 0, W, H);
      g.fillStyle = color; g.fillRect(0, 76, W, 9);
      g.strokeStyle = '#424242'; g.lineWidth = 3; g.beginPath(); g.moveTo(44, 24); g.lineTo(64, 70); g.lineTo(84, 24); g.stroke();
      break;
    case 'shirt_astronaut':
      g.fillStyle = '#eceff1'; g.fillRect(0, 0, W, H);
      g.fillStyle = color; g.fillRect(0, 98, W, 6); g.fillRect(0, 30, W, 4);
      g.fillStyle = '#37474f'; g.beginPath(); g.roundRect(50, 48, 28, 22, 3); g.fill();
      for (const [c, x] of [['#f44336', 55], ['#4caf50', 62], ['#2196f3', 69]]) { g.fillStyle = c; g.fillRect(x, 54, 4, 4); }
      break;
    default: // shirt_tee
      g.fillStyle = dark; g.fillRect(52, 22, 24, 4);
  }
}

function pattern(g, kind, color, W, H, rnd) {
  if (kind === 'camo') {
    const cols = [shade(color, 0.6), shade(color, 1.3), '#3e4a2e', '#7a6a3a'];
    for (let i = 0; i < 40; i++) { g.fillStyle = cols[i % 4]; g.beginPath(); g.ellipse(rnd() * W, rnd() * H, 6 + rnd() * 10, 4 + rnd() * 6, rnd() * 3, 0, Math.PI * 2); g.fill(); }
  } else if (kind === 'galaxy') {
    const gr = g.createLinearGradient(0, 0, W, H);
    gr.addColorStop(0, '#1a0b3d'); gr.addColorStop(0.5, '#4a148c'); gr.addColorStop(1, '#0d47a1');
    g.fillStyle = gr; g.fillRect(0, 0, W, H);
    for (let i = 0; i < 14; i++) { g.fillStyle = `rgba(${rnd() < 0.5 ? '233,30,99' : '0,229,255'},0.25)`; g.beginPath(); g.arc(rnd() * W, rnd() * H, 8 + rnd() * 14, 0, Math.PI * 2); g.fill(); }
    for (let i = 0; i < 60; i++) { g.fillStyle = '#ffffff'; g.fillRect(rnd() * W, rnd() * H, rnd() < 0.15 ? 2 : 1, rnd() < 0.15 ? 2 : 1); }
  } else if (kind === 'flames') {
    g.fillStyle = '#212121'; g.fillRect(0, 0, W, H);
    for (const [c, k] of [['#ff3d00', 1], ['#ff9100', 0.75], ['#ffea00', 0.45]]) {
      g.fillStyle = c; g.beginPath(); g.moveTo(0, H);
      for (let x = 0; x <= W; x += 8) g.lineTo(x, H - (30 + Math.abs(Math.sin(x * 0.21)) * 50) * k - rnd() * 6);
      g.lineTo(W, H); g.fill();
    }
  } else if (kind === 'rainbow') {
    const c = ['#f44336', '#ff9800', '#ffeb3b', '#4caf50', '#2196f3', '#9c27b0'];
    c.forEach((col, i) => { g.fillStyle = col; g.fillRect(0, 20 + i * 15, W, 15); });
  } else if (kind === 'plaid') {
    g.fillStyle = color; g.fillRect(0, 0, W, H);
    g.fillStyle = 'rgba(0,0,0,0.3)'; for (let x = 0; x < W; x += 20) g.fillRect(x, 0, 8, H);
    g.fillStyle = 'rgba(0,0,0,0.25)'; for (let y = 0; y < H; y += 20) g.fillRect(0, y, W, 8);
    g.fillStyle = 'rgba(255,235,59,0.6)'; for (let x = 14; x < W; x += 20) g.fillRect(x, 0, 1.5, H);
  }
}

function shirtMaterial(style, color) {
  return texMat(`shirt|${style}|${color}`, (g) => drawShirt(g, style, color), 128, 128);
}

function pantsMaterial(style, color, skin) {
  const plain = ['pants_jeans', 'pants_shorts', 'pants_cargo', 'pants_skirt', 'pants_armor'];
  if (plain.includes(style)) return std(color);
  return texMat(`pants|${style}|${color}|${skin}`, (g) => {
    const W = 64, H = 128;
    g.fillStyle = color; g.fillRect(0, 0, W, H);
    const rnd = mulberry(7);
    if (style === 'pants_sweat') { g.fillStyle = '#ffffff'; g.fillRect(14, 0, 3, H); g.fillRect(46, 0, 3, H); }
    else if (style === 'pants_ripped') {
      g.fillStyle = 'rgba(255,255,255,0.25)'; for (let i = 0; i < 30; i++) g.fillRect(rnd() * W, rnd() * H, 6, 1);
      g.fillStyle = skin; g.beginPath(); g.ellipse(32, 64, 7, 4, 0, 0, Math.PI * 2); g.fill();
      g.fillStyle = '#ffffff'; g.fillRect(25, 60, 14, 1); g.fillRect(25, 68, 14, 1);
    } else pattern(g, style.replace('pants_', ''), color, W, H, rnd);
  }, 64, 128);
}

function mulberry(a) {
  return () => {
    a |= 0; a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

// Medidas (en unidades del mundo). La cabeza está centrada en (0, HEAD_Y) relativo al cuello.
const HEAD_R = 0.37;
const HEAD_Y = 0.36;
const LONG_SLEEVES = new Set(['shirt_hoodie', 'shirt_suit', 'shirt_stripes', 'shirt_flannel', 'shirt_sweater', 'shirt_jacket', 'shirt_panda', 'shirt_galaxy', 'shirt_ninja', 'shirt_astronaut', 'shirt_camo']);

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
    this.cape = this.halo = this.pet = this.wings = this.jet = null;
    if (this.body) {
      this.root.remove(this.body);
      this.disposeTree(this.body);
    }
    const body = new THREE.Group();
    this.body = body;
    this.root.add(body);

    const skin = std(d.skin);
    const shirtTex = shirtMaterial(d.shirt, d.shirtColor);
    const plainShirt = d.shirt === 'shirt_ninja' ? std('#212121') : d.shirt === 'shirt_astronaut' ? std('#eceff1') : std(d.shirtColor);
    const pants = pantsMaterial(d.pants, d.pantsColor, d.skin);
    const shoes = std(d.shoesColor, { roughness: 0.5 });

    // Torso: cápsula achatada; la textura de la camiseta lleva el dibujo delante
    const torso = mesh(capsule(0.3, 0.3), shirtTex, 0, 1.13, 0, [1.22, 1, 0.8], [0, Math.PI, 0]);
    body.add(torso);
    this.torso = torso;
    // Cadera (une el torso con las piernas, del color del pantalón)
    body.add(mesh(sphere(0.3), d.pants === 'pants_skirt' || d.pants === 'pants_plaid' ? pants : std(d.pantsColor), 0, 0.76, 0, [1.12, 0.55, 0.78]));
    if (d.shirt === 'shirt_hoodie' || d.shirt === 'shirt_panda') body.add(mesh(sphere(0.22), plainShirt, 0, 1.56, -0.2, [1.3, 0.75, 0.75]));
    if (d.shirt === 'shirt_jacket') body.add(mesh(torus(0.2, 0.05), plainShirt, 0, 1.53, 0, null, [Math.PI / 2, 0, 0]));
    if (d.shirt === 'shirt_astronaut') body.add(mesh(rbox(0.46, 0.5, 0.2, 0.06), std('#cfd8dc'), 0, 1.15, -0.32));

    // Cabeza
    const neck = new THREE.Group();
    neck.position.y = 1.52;
    body.add(neck);
    this.neck = neck;
    const head = mesh(sphere(HEAD_R, 22, 16), faceMaterial(d.face, d.skin), 0, HEAD_Y, 0);
    neck.add(head);
    this.head = head;
    neck.add(mesh(cyl(0.11, 0.12, 0.16, 10), skin, 0, 0.02, 0));
    for (const s of [-1, 1]) neck.add(mesh(sphere(0.075, 8, 6), skin, s * 0.36, HEAD_Y - 0.01, -0.02, [0.55, 1, 0.9]));
    this.buildHair(neck, d);

    // Brazos
    const longSleeves = LONG_SLEEVES.has(d.shirt);
    const sleeveless = d.shirt === 'shirt_tank';
    const arm = (side) => {
      const pivot = new THREE.Group();
      pivot.position.set(side * 0.46, 1.47, 0);
      pivot.add(mesh(sphere(0.13), sleeveless ? skin : plainShirt, 0, -0.02, 0));
      if (longSleeves) pivot.add(mesh(capsule(0.105, 0.42), plainShirt, 0, -0.3, 0));
      else {
        if (!sleeveless) pivot.add(mesh(capsule(0.12, 0.12), plainShirt, 0, -0.12, 0));
        pivot.add(mesh(capsule(0.095, 0.36), skin, 0, -0.33, 0));
      }
      pivot.add(mesh(sphere(0.115), d.shirt === 'shirt_astronaut' ? std('#eceff1') : skin, 0, -0.62, 0.01));
      body.add(pivot);
      return pivot;
    };
    this.lArm = arm(-1);
    this.rArm = arm(1);

    // Piernas
    const skirt = d.pants === 'pants_skirt' || d.pants === 'pants_plaid';
    if (skirt) body.add(mesh(cyl(0.3, 0.44, 0.4, 16, true), pants, 0, 0.6, 0, [1, 1, 0.85]));
    const leg = (side) => {
      const pivot = new THREE.Group();
      pivot.position.set(side * 0.16, 0.74, 0);
      if (d.pants === 'pants_shorts' || skirt) {
        if (!skirt) pivot.add(mesh(capsule(0.145, 0.14), pants, 0, -0.12, 0));
        pivot.add(mesh(capsule(0.115, 0.36), skin, 0, -0.36, 0));
      } else {
        pivot.add(mesh(capsule(0.135, 0.38), pants, 0, -0.3, 0, null, [0, Math.PI, 0]));
        if (d.pants === 'pants_cargo') pivot.add(mesh(rbox(0.06, 0.14, 0.16, 0.02), std(shade(d.pantsColor, 0.75)), side * 0.13, -0.3, 0));
        if (d.pants === 'pants_armor') pivot.add(mesh(sphere(0.1), std('#b0bec5', { metalness: 0.7, roughness: 0.3 }), 0, -0.36, 0.1, [1, 1, 0.6]));
      }
      pivot.add(mesh(sphere(0.15), shoes, 0, -0.65, 0.06, [1, 0.62, 1.45]));
      body.add(pivot);
      return pivot;
    };
    this.lLeg = leg(-1);
    this.rLeg = leg(1);

    for (const acc of d.accessories || []) this.buildAccessory(acc, d);
    this.buildEffect(d.effect);
    if (!this.shadows) body.traverse((c) => { c.castShadow = false; });
  }

  buildHair(n, d) {
    const m = std(d.hairColor, { roughness: 0.85 });
    const R = HEAD_R * 1.07, y = HEAD_Y;
    const add = (g, x, yy, z, s, r) => n.add(mesh(g, m, x, yy, z, s, r));
    const top = (t = 0.42, r = R) => add(shell(r, 0, Math.PI * 2, 0, Math.PI * t), 0, y, 0);
    const back = (t0 = 0.3, t1 = 0.66, r = R) => add(shell(r, Math.PI, Math.PI, Math.PI * t0, Math.PI * (t1 - t0)), 0, y, 0);
    switch (d.hair) {
      case 'hair_short':
        top(0.42); back();
        break;
      case 'hair_buzz':
        add(shell(HEAD_R * 1.025, 0, Math.PI * 2, 0, Math.PI * 0.4), 0, y, 0);
        break;
      case 'hair_long':
        top(0.42); back(0.3, 0.7);
        add(capsule(0.2, 0.42), 0, y - 0.32, -0.2, [1.55, 1, 0.55]);
        for (const s of [-1, 1]) add(capsule(0.08, 0.36), s * 0.33, y - 0.2, 0.02);
        break;
      case 'hair_bowl':
        add(shell(R * 1.04, 0, Math.PI * 2, 0, Math.PI * 0.46), 0, y + 0.01, 0);
        break;
      case 'hair_spiky':
        top(0.4); back(0.3, 0.6);
        for (let i = 0; i < 8; i++) {
          const a = (i / 8) * Math.PI * 2;
          add(cone(0.1, 0.32, 6), Math.cos(a) * 0.2, y + 0.33, Math.sin(a) * 0.2 - 0.03, null, [Math.sin(a) * 0.7, 0, -Math.cos(a) * 0.7]);
        }
        add(cone(0.11, 0.36, 6), 0, y + 0.44, 0);
        break;
      case 'hair_bun':
        top(0.42); back(0.3, 0.6);
        add(sphere(0.17), 0, y + 0.36, -0.2);
        break;
      case 'hair_sidepart':
        top(0.42); back();
        add(sphere(0.2), 0.1, y + 0.26, 0.2, [1.5, 0.55, 0.9], [0.3, 0, -0.25]);
        break;
      case 'hair_curly':
        top(0.4); back(0.3, 0.6);
        for (let i = 0; i < 16; i++) {
          const a = (i / 16) * Math.PI * 2, rr = i % 2 ? 0.28 : 0.2;
          add(sphere(0.11, 8, 6), Math.cos(a) * rr, y + 0.3 + (i % 2 ? 0 : 0.08), Math.sin(a) * rr - 0.04);
        }
        break;
      case 'hair_ponytail':
        top(0.42); back(0.3, 0.6);
        add(sphere(0.08), 0, y + 0.18, -0.4);
        add(capsule(0.09, 0.38), 0, y - 0.08, -0.48, null, [0.35, 0, 0]);
        break;
      case 'hair_mohawk':
        add(shell(HEAD_R * 1.02, 0, Math.PI * 2, 0, Math.PI * 0.38), 0, y, 0);
        for (let i = 0; i < 5; i++) add(cone(0.08, 0.34, 4), 0, y + 0.4 - Math.abs(i - 1.5) * 0.04, 0.22 - i * 0.12, [0.6, 1, 1.4], [-0.3 + i * 0.15, 0, 0]);
        break;
      case 'hair_pigtails':
        top(0.42); back();
        for (const s of [-1, 1]) {
          add(sphere(0.07), s * 0.36, y + 0.12, -0.08);
          add(capsule(0.1, 0.24), s * 0.46, y - 0.08, -0.08, null, [0, 0, s * 0.35]);
        }
        break;
      case 'hair_emo':
        top(0.42); back(0.3, 0.7);
        add(sphere(0.22), -0.08, y + 0.12, 0.27, [1.3, 1.2, 0.45], [0, 0, 0.3]);
        break;
      case 'hair_afro':
        add(shell(0.56, Math.PI / 2 + 0.8, Math.PI * 2 - 1.6, 0, Math.PI * 0.66), 0, y + 0.14, -0.06);
        add(shell(0.55, 0, Math.PI * 2, 0, Math.PI * 0.34), 0, y + 0.14, -0.06);
        break;
      case 'hair_wavy':
        top(0.42); back(0.3, 0.72);
        for (let i = 0; i < 7; i++) {
          const a = Math.PI + 0.3 + (i / 6) * (Math.PI - 0.6);
          add(sphere(0.13, 8, 6), Math.cos(a) * 0.32, y - 0.3 - (i % 2) * 0.06, Math.sin(a) * 0.32, [1, 1.6, 1]);
        }
        break;
      case 'hair_spacebuns':
        top(0.42); back();
        for (const s of [-1, 1]) add(sphere(0.15), s * 0.24, y + 0.33, -0.02);
        break;
      case 'hair_braids':
        top(0.42); back();
        for (const s of [-1, 1]) for (let i = 0; i < 5; i++) add(sphere(0.075, 8, 6), s * 0.3, y - 0.12 - i * 0.12, -0.14 + i * 0.01);
        break;
      case 'hair_swoop':
        top(0.42); back();
        add(sphere(0.26), 0, y + 0.36, 0.1, [1.15, 0.6, 1.25], [-0.35, 0, 0]);
        break;
      case 'hair_anime':
        top(0.42); back(0.3, 0.66);
        for (let i = 0; i < 9; i++) {
          const a = (i / 9) * Math.PI * 2;
          add(cone(0.14, 0.5, 5), Math.cos(a) * 0.25, y + 0.22, Math.sin(a) * 0.25 - 0.05, null, [Math.sin(a) * 1.2, 0, -Math.cos(a) * 1.2]);
        }
        add(cone(0.1, 0.36, 5), 0.1, y + 0.18, 0.33, null, [1.9, 0, 0.3]);
        break;
      default:
        break;
    }
  }

  buildAccessory(id, d) {
    const n = this.neck, b = this.body, y = HEAD_Y, top = HEAD_Y + HEAD_R;
    const gold = std('#ffca28', { metalness: 0.7, roughness: 0.3 });
    const dark = std('#212121');
    const metal = std('#b0bec5', { metalness: 0.7, roughness: 0.3 });
    const N = (g, m, x, yy, z, s, r) => { const o = mesh(g, m, x, yy, z, s, r); n.add(o); return o; };
    const B = (g, m, x, yy, z, s, r) => { const o = mesh(g, m, x, yy, z, s, r); b.add(o); return o; };
    switch (id) {
      case 'acc_cap': {
        const red = std('#e53935');
        N(shell(HEAD_R * 1.12, 0, Math.PI * 2, 0, Math.PI * 0.44), red, 0, y, 0);
        N(cyl(0.3, 0.3, 0.03, 16), red, 0, y + 0.18, 0.28, [1, 1, 0.75]);
        break;
      }
      case 'acc_glasses':
        for (const s of [-1, 1]) N(torus(0.085, 0.016), dark, s * 0.13, y + 0.03, HEAD_R - 0.02);
        N(cyl(0.012, 0.012, 0.09, 6), dark, 0, y + 0.04, HEAD_R - 0.01, null, [0, 0, Math.PI / 2]);
        break;
      case 'acc_bow': {
        const pink = std('#ff4081');
        N(cone(0.1, 0.16, 8), pink, 0.1, top - 0.06, 0.1, null, [0, 0, Math.PI / 2]);
        N(cone(0.1, 0.16, 8), pink, 0.3, top - 0.06, 0.1, null, [0, 0, -Math.PI / 2]);
        N(sphere(0.05, 8, 6), pink, 0.2, top - 0.06, 0.1);
        break;
      }
      case 'acc_scarf': {
        const c = std('#e53935');
        B(torus(0.2, 0.07), c, 0, 1.54, 0, [1, 1, 1], [Math.PI / 2, 0, 0]);
        B(capsule(0.06, 0.26), c, 0.12, 1.36, 0.2, [1.4, 1, 0.6]);
        break;
      }
      case 'acc_beanie': {
        const c = std('#26a69a');
        N(shell(HEAD_R * 1.13, 0, Math.PI * 2, 0, Math.PI * 0.45), c, 0, y + 0.03, 0);
        N(torus(0.37, 0.05), std('#00897b'), 0, y + 0.1, 0, null, [Math.PI / 2, 0, 0]);
        N(sphere(0.09, 8, 6), std('#ffffff'), 0, top + 0.1, 0);
        break;
      }
      case 'acc_partyhat':
        N(cone(0.16, 0.42, 14), std('#7c4dff'), 0.05, top + 0.17, 0, null, [0, 0, -0.15]);
        N(sphere(0.06, 8, 6), std('#ffeb3b'), 0.08, top + 0.4, 0);
        break;
      case 'acc_sunglasses':
        N(rbox(0.52, 0.12, 0.06, 0.03), std('#111111', { metalness: 0.5, roughness: 0.2 }), 0, y + 0.04, HEAD_R - 0.03);
        break;
      case 'acc_backpack':
        B(rbox(0.5, 0.56, 0.22, 0.07), std('#ff7043'), 0, 1.15, -0.33);
        B(rbox(0.36, 0.2, 0.06, 0.03), std('#ffab91'), 0, 1.02, -0.46);
        break;
      case 'acc_antenna':
        for (const s of [-1, 1]) {
          N(cyl(0.015, 0.015, 0.32, 6), dark, s * 0.12, top + 0.12, 0, null, [0, 0, -s * 0.3]);
          N(sphere(0.05, 8, 6), std('#76ff03', { emissive: '#33691e' }), s * 0.17, top + 0.28, 0);
        }
        break;
      case 'acc_cateears':
        for (const s of [-1, 1]) {
          N(cone(0.11, 0.2, 4), std(d.hairColor), s * 0.22, top - 0.02, 0, null, [0, 0, -s * 0.35]);
          N(cone(0.06, 0.12, 4), std('#ff8a9a'), s * 0.215, top - 0.03, 0.03, null, [0, 0, -s * 0.35]);
        }
        break;
      case 'acc_bunnyears':
        for (const s of [-1, 1]) {
          N(capsule(0.07, 0.36), std('#fafafa'), s * 0.13, top + 0.2, 0, [1, 1, 0.5], [0, 0, -s * 0.15]);
          N(capsule(0.035, 0.28), std('#ff8a9a'), s * 0.13, top + 0.2, 0.03, [1, 1, 0.4], [0, 0, -s * 0.15]);
        }
        break;
      case 'acc_chef':
        N(cyl(0.28, 0.28, 0.2, 16), std('#fafafa'), 0, top + 0.02, 0);
        N(sphere(0.33, 12, 8), std('#ffffff'), 0, top + 0.22, 0, [1, 0.6, 1]);
        break;
      case 'acc_headphones':
        N(torus(HEAD_R + 0.04, 0.035, Math.PI), dark, 0, y, 0);
        for (const s of [-1, 1]) N(cyl(0.12, 0.12, 0.1, 14), std('#7c4dff'), s * (HEAD_R + 0.04), y, 0, null, [0, 0, Math.PI / 2]);
        break;
      case 'acc_cowboy': {
        const c = std('#8d6e63');
        N(cyl(0.6, 0.6, 0.04, 20), c, 0, top - 0.1, 0, [1, 1, 0.9]);
        N(cyl(0.26, 0.3, 0.3, 16), c, 0, top + 0.05, 0);
        N(cyl(0.305, 0.305, 0.06, 16), std('#3e2723'), 0, top - 0.04, 0);
        break;
      }
      case 'acc_flowercrown':
        N(torus(0.32, 0.03), std('#66bb6a'), 0, top - 0.1, 0, null, [Math.PI / 2, 0, 0]);
        for (let i = 0; i < 8; i++) {
          const a = (i / 8) * Math.PI * 2;
          N(sphere(0.06, 8, 6), std(['#ff80ab', '#ffeb3b', '#ffffff', '#b388ff'][i % 4]), Math.cos(a) * 0.32, top - 0.08, Math.sin(a) * 0.32);
        }
        break;
      case 'acc_tophat':
        N(cyl(0.26, 0.26, 0.46, 16), dark, 0, top + 0.16, 0);
        N(cyl(0.44, 0.44, 0.04, 18), dark, 0, top - 0.06, 0);
        N(cyl(0.265, 0.265, 0.08, 16), std('#c62828'), 0, top + 0.0, 0);
        break;
      case 'acc_ninjamask':
        N(shell(HEAD_R * 1.03, 0, Math.PI * 2, Math.PI * 0.56, Math.PI * 0.2), dark, 0, y, 0);
        N(torus(HEAD_R * 1.02, 0.03), dark, 0, y + 0.16, 0, null, [Math.PI / 2, 0, 0]);
        break;
      case 'acc_witch': {
        const c = std('#4a148c');
        N(cyl(0.6, 0.6, 0.03, 20), c, 0, top - 0.08, 0);
        N(cone(0.28, 0.6, 14), c, 0, top + 0.24, -0.04, null, [-0.25, 0, 0]);
        N(cyl(0.285, 0.29, 0.07, 14), std('#ab47bc'), 0, top - 0.03, 0);
        break;
      }
      case 'acc_horns':
        for (const s of [-1, 1]) N(cone(0.07, 0.26, 8), std('#b71c1c'), s * 0.2, top + 0.02, 0.05, null, [0.2, 0, -s * 0.45]);
        break;
      case 'acc_viking':
        N(shell(HEAD_R * 1.1, 0, Math.PI * 2, 0, Math.PI * 0.44), metal, 0, y, 0);
        N(torus(HEAD_R * 1.08, 0.03), gold, 0, y + 0.07, 0, null, [Math.PI / 2, 0, 0]);
        for (const s of [-1, 1]) N(cone(0.07, 0.3, 8), std('#fff8e1'), s * 0.4, y + 0.24, 0, null, [0, 0, -s * 1.0]);
        break;
      case 'acc_cape': {
        const pivot = new THREE.Group();
        pivot.position.set(0, 1.5, -0.24);
        pivot.add(mesh(rbox(0.72, 1.1, 0.04, 0.02), std('#c62828', { side: THREE.DoubleSide }), 0, -0.55, 0));
        b.add(pivot);
        this.cape = pivot;
        break;
      }
      case 'acc_guitar': {
        const g = new THREE.Group();
        g.position.set(0, 1.12, -0.3);
        g.rotation.z = 0.6;
        g.add(mesh(sphere(0.2, 12, 8), std('#e65100'), 0, -0.2, 0, [1, 1.1, 0.35]));
        g.add(mesh(sphere(0.15, 12, 8), std('#e65100'), 0, 0.06, 0, [1, 1, 0.35]));
        g.add(mesh(rbox(0.06, 0.5, 0.04, 0.01), std('#4e342e'), 0, 0.42, 0));
        g.add(mesh(cyl(0.05, 0.05, 0.02, 12), dark, 0, -0.12, 0.08, null, [Math.PI / 2, 0, 0]));
        b.add(g);
        break;
      }
      case 'acc_sword': {
        const g = new THREE.Group();
        g.position.set(0, 1.2, -0.3);
        g.rotation.z = -0.7;
        g.add(mesh(rbox(0.08, 0.8, 0.02, 0.01), std('#eceff1', { metalness: 0.8, roughness: 0.2 }), 0, 0.2, 0));
        g.add(mesh(rbox(0.26, 0.05, 0.05, 0.02), gold, 0, -0.22, 0));
        g.add(mesh(cyl(0.03, 0.03, 0.2, 8), std('#5d4037'), 0, -0.34, 0));
        b.add(g);
        break;
      }
      case 'acc_halo': {
        const halo = mesh(torus(0.26, 0.035), new THREE.MeshBasicMaterial({ color: '#fff59d' }), 0, top + 0.18, 0, null, [Math.PI / 2, 0, 0]);
        n.add(halo);
        this.halo = halo;
        break;
      }
      case 'acc_pet': {
        const pet = new THREE.Group();
        pet.add(mesh(sphere(0.16), std('#80deea', { emissive: '#00838f', emissiveIntensity: 0.3 }), 0, 0, 0));
        for (const s of [-1, 1]) pet.add(mesh(sphere(0.03, 6, 4), dark, s * 0.06, 0.03, 0.14));
        for (const s of [-1, 1]) pet.add(mesh(cone(0.05, 0.1, 4), std('#80deea'), s * 0.09, 0.15, 0));
        pet.position.set(0.7, 2.1, 0);
        b.add(pet);
        this.pet = pet;
        break;
      }
      case 'acc_crown':
        N(cyl(0.27, 0.29, 0.14, 16, true), gold, 0, top - 0.02, 0);
        for (let i = 0; i < 6; i++) {
          const a = (i / 6) * Math.PI * 2;
          N(cone(0.055, 0.15, 4), gold, Math.cos(a) * 0.27, top + 0.12, Math.sin(a) * 0.27);
          if (i % 2 === 0) N(sphere(0.035, 6, 4), std('#e53935', { metalness: 0.3, roughness: 0.2 }), Math.cos(a) * 0.29, top - 0.01, Math.sin(a) * 0.29);
        }
        break;
      case 'acc_wings':
      case 'acc_batwings': {
        const bat = id === 'acc_batwings';
        const shape = new THREE.Shape();
        if (bat) {
          shape.moveTo(0, 0); shape.lineTo(0.9, 0.5); shape.lineTo(0.8, 0.1); shape.lineTo(0.65, 0.2); shape.lineTo(0.55, -0.1); shape.lineTo(0.4, 0.05); shape.lineTo(0.3, -0.25); shape.lineTo(0, -0.1);
        } else {
          shape.moveTo(0, 0); shape.quadraticCurveTo(0.5, 0.6, 1.0, 0.45); shape.quadraticCurveTo(0.8, 0.05, 0.75, -0.2); shape.quadraticCurveTo(0.5, -0.45, 0.2, -0.5); shape.lineTo(0, -0.15);
        }
        const g = geo(`wing|${id}`, () => new THREE.ExtrudeGeometry(shape, { depth: 0.03, bevelEnabled: false }));
        const m = std(bat ? '#311b92' : '#ffffff', { side: THREE.DoubleSide });
        this.wings = [-1, 1].map((s) => {
          const piv = new THREE.Group();
          piv.position.set(s * 0.08, 1.35, -0.28);
          const w = mesh(g, m);
          w.scale.set(s, 1, 1);
          piv.add(w);
          b.add(piv);
          return piv;
        });
        break;
      }
      case 'acc_jetpack': {
        B(rbox(0.46, 0.5, 0.2, 0.06), metal, 0, 1.12, -0.32);
        const flames = [];
        for (const s of [-1, 1]) {
          B(cyl(0.09, 0.11, 0.5, 12), std('#ff7043'), s * 0.16, 1.05, -0.48);
          const f = B(cone(0.08, 0.28, 8), new THREE.MeshBasicMaterial({ color: '#ffab00', transparent: true, opacity: 0.85 }), s * 0.16, 0.66, -0.48, null, [Math.PI, 0, 0]);
          flames.push(f);
        }
        this.jet = flames;
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
    const size = effect === 'fx_hearts' || effect === 'fx_snow' ? 0.2 : 0.16;
    const m = new THREE.PointsMaterial({ size, vertexColors: true, transparent: true, opacity: 0.9, depthWrite: false });
    const pts = new THREE.Points(g, m);
    pts.frustumCulled = false;
    const seeds = Array.from({ length: n }, () => Math.random());
    const c = new THREE.Color();
    for (let i = 0; i < n; i++) {
      if (effect === 'fx_fire') c.setHSL(0.02 + seeds[i] * 0.1, 1, 0.55);
      else if (effect === 'fx_rainbow') c.setHSL(i / n, 0.9, 0.6);
      else if (effect === 'fx_hearts') c.setHSL(0.93 + seeds[i] * 0.05, 0.9, 0.65);
      else if (effect === 'fx_snow') c.setHSL(0.55, 0.4, 0.92);
      else if (effect === 'fx_lightning') c.setHSL(0.5 + seeds[i] * 0.1, 1, 0.7);
      else c.setHSL(0.13 + seeds[i] * 0.4, 0.8, 0.8);
      col.set([c.r, c.g, c.b], i * 3);
    }
    this.effect = { type: effect, pts, seeds, trail: [] };
    if (effect === 'fx_rainbow') this.root.parent ? this.root.parent.add(pts) : (this.pendingTrail = pts);
    else this.body.add(pts);
  }

  /** Animación de efectos y accesorios (llamar cada frame). moving: si se desplaza. */
  updateEffects(dt, moving) {
    this.effectTime += dt;
    const t = this.effectTime;
    if (this.halo) this.halo.position.y = HEAD_Y + HEAD_R + 0.18 + Math.sin(t * 3) * 0.03;
    if (this.cape) this.cape.rotation.x = 0.15 + (moving ? 0.4 + Math.sin(t * 10) * 0.08 : Math.sin(t * 2) * 0.04);
    if (this.pet) {
      this.pet.position.set(0.7 + Math.sin(t * 0.9) * 0.1, 2.1 + Math.sin(t * 2.2) * 0.12, Math.cos(t * 0.9) * 0.15);
      this.pet.rotation.y = Math.sin(t * 1.3) * 0.5;
    }
    if (this.wings) {
      const flap = (moving ? 0.35 : 0.12) * Math.sin(t * (moving ? 9 : 2.5));
      this.wings[0].rotation.y = 0.35 + flap;
      this.wings[1].rotation.y = -0.35 - flap;
    }
    if (this.jet) for (const f of this.jet) f.scale.set(1, (moving ? 1.3 : 0.7) + Math.sin(t * 30 + f.position.x * 9) * 0.25, 1);
    const e = this.effect;
    if (!e) return;
    // Los efectos de partículas se pueden desactivar en la configuración gráfica.
    e.pts.visible = settings.get('effects');
    if (!e.pts.visible) return;
    const pos = e.pts.geometry.attributes.position;
    const n = pos.count;
    if (e.type === 'fx_sparkles' || e.type === 'fx_hearts') {
      for (let i = 0; i < n; i++) {
        const s = e.seeds[i];
        const a = t * (1 + s) + s * 20;
        pos.setXYZ(i, Math.cos(a) * (0.7 + s * 0.3), 0.3 + ((t * 0.5 + s) % 1) * 2.2, Math.sin(a) * (0.7 + s * 0.3));
      }
    } else if (e.type === 'fx_snow') {
      for (let i = 0; i < n; i++) {
        const s = e.seeds[i];
        const life = (t * (0.25 + s * 0.2) + s) % 1;
        pos.setXYZ(i, Math.cos(s * 40) * 0.9 + Math.sin(t + s * 9) * 0.1, 2.8 - life * 2.8, Math.sin(s * 40) * 0.9);
      }
    } else if (e.type === 'fx_lightning') {
      for (let i = 0; i < n; i++) {
        const s = e.seeds[i];
        const on = Math.sin(t * 20 + s * 50) > 0.3;
        const a = s * 40 + Math.floor(t * 8);
        pos.setXYZ(i, on ? Math.cos(a) * 0.6 : 0, on ? 0.2 + ((s * 7 + t * 3) % 2.2) : -50, on ? Math.sin(a) * 0.5 : 0);
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

  /** Etiqueta sobre la cabeza. Con título es un personaje no jugador (NPC). */
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
    s.position.y = 2.85;
    this.root.add(s);
    this.tag = s;
  }

  disposeTree(obj) {
    obj.traverse((c) => {
      if (c.geometry && !c.geometry.userData.shared) c.geometry.dispose();
      const mats = Array.isArray(c.material) ? c.material : c.material ? [c.material] : [];
      for (const m of mats) {
        if (m.userData.shared) continue;
        if (m.map && !m.map.userData.shared) m.map.dispose();
        m.dispose();
      }
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
