// Grabación del tráiler de Guerra Galáctica: ejecuta los capítulos reales de la campaña a 30 fps
// (sin HUD) y envía cada fotograma a marketing-release/tools/galaxia-trailer.mjs.
// Herramienta de marketing: no forma parte del juego publicado.
import * as THREE from 'three';
import { Campaign } from '../game/galaxia/campaign.js';
import { CHud } from '../game/galaxia/kit.js';
import { engine } from '../engine/renderer.js';

const W = 1920, H = 1080, FPS = 30;
const RECV = 'http://localhost:5200';
const shot = new URLSearchParams(location.search).get('shot');
const seg = shot.replace('galaxia_', '');

// Sin red ni audio ni transiciones con tiempo real: la grabación avanza fotograma a fotograma
Campaign.prototype.send = () => Promise.resolve({});
Campaign.prototype.change = function change(name) { this.go(name); };
CHud.prototype.fade = () => {};
CHud.prototype.whiteFlash = () => {};
engine.resize = () => {};

const canvas = document.createElement('canvas');
canvas.width = W;
canvas.height = H;
const renderer = new THREE.WebGLRenderer({ canvas, antialias: true, preserveDrawingBuffer: true, powerPreference: 'high-performance' });
renderer.setSize(W, H, false);
renderer.setPixelRatio(1);
renderer.outputColorSpace = THREE.SRGBColorSpace;
renderer.toneMapping = THREE.ACESFilmicToneMapping;
renderer.toneMappingExposure = 1.05;
renderer.shadowMap.enabled = true;
renderer.shadowMap.type = THREE.PCFSoftShadowMap;
document.body.appendChild(canvas);

const game = { cam: { yaw: 0, pitch: 0.3 }, hud: { el: document.createElement('div') }, update() {}, exit() {}, remotes: new Map() };

/** Tarjetas de texto (título y final): fondo degradado y letras grandes, con un leve zoom. */
const card = document.createElement('canvas');
card.width = W;
card.height = H;
const cg = card.getContext('2d');
function drawCard(t, big, small, color = '#ffe81f') {
  const k = 1 + t * 0.025;
  const grd = cg.createRadialGradient(W / 2, H / 2, 80, W / 2, H / 2, W * 0.7);
  grd.addColorStop(0, '#2a0a3a');
  grd.addColorStop(1, '#03020a');
  cg.fillStyle = grd;
  cg.fillRect(0, 0, W, H);
  cg.save();
  cg.translate(W / 2, H / 2);
  cg.scale(k, k);
  cg.textAlign = 'center';
  cg.textBaseline = 'middle';
  cg.font = '900 150px "Arial Black", Arial, sans-serif';
  cg.shadowColor = color;
  cg.shadowBlur = 60;
  cg.fillStyle = color;
  cg.fillText(big, 0, -30);
  cg.shadowBlur = 0;
  cg.font = '700 46px "Arial Black", Arial, sans-serif';
  cg.fillStyle = '#ffffff';
  cg.fillText(small, 0, 120);
  cg.restore();
}

/** Segmentos del tráiler: cada uno lleva su duración en segundos. */
const SEGS = {
  title: { dur: 3, card: () => ({ big: 'GUERRA GALÁCTICA', small: 'Una campaña épica · un jugador' }) },
  dock: { dur: 7, setup: (c) => c.go('dock') },
  core: { dur: 3, setup: (c) => { c.go('core'); c.ch.overload(); } },
  escape: { dur: 9, setup: (c) => c.go('escape') },
  drift: { dur: 3, setup: (c) => c.go('drift') },
  crash: { dur: 6, setup: (c) => c.go('crash') },
  lava: { dur: 7, setup: (c) => { c.go('boss'); c.ch.spawnVex(); c.ch.startLava(); } },
  home: { dur: 7, setup: (c) => c.go('home') },
  end: { dur: 4, card: () => ({ big: 'DISPONIBLE YA', small: 'Gratis en Microsoft Store · busca «KestWorlds»', color: '#4fe3ff' }) },
};

async function post(i, blob) {
  await fetch(`${RECV}/frame?shot=${shot}&i=${i}`, { method: 'POST', body: blob });
}

async function run() {
  const s = SEGS[seg];
  const n = Math.round(s.dur * FPS);
  const dt = 1 / FPS;
  if (s.card) {
    for (let i = 0; i < n; i++) {
      drawCard(i * dt, s.card().big, s.card().small, s.card().color);
      await post(i, await new Promise((r) => card.toBlob(r, 'image/jpeg', 0.92)));
    }
  } else {
    const c = new Campaign({ game });
    c.hud.root.style.display = 'none';
    c.hud.setHp?.(100, 100);
    s.setup(c);
    for (let i = 0; i < n; i++) {
      c.update(dt);
      renderer.render(c.cur.scene, c.cam);
      await post(i, await new Promise((r) => canvas.toBlob(r, 'image/jpeg', 0.92)));
    }
  }
  await fetch(`${RECV}/done?shot=${shot}`, { method: 'POST', body: 'ok' });
}

run().catch((e) => fetch(`${RECV}/log?shot=${shot}`, { method: 'POST', body: `ERROR ${e.message}\n${e.stack}` }));
