// Renderizador WebGL único y bucle principal. Cada "vista" (menú, partida,
// editor, vista previa de avatar) aporta su escena, cámara y update().
import * as THREE from 'three';
import { settings } from '../core/settings.js';

class Engine {
  constructor() {
    this.view = null;
    this.clock = new THREE.Clock();
    this.fps = 60;
    this.frameHooks = new Set();
  }

  init(container) {
    this.container = container;
    const r = new THREE.WebGLRenderer({ antialias: settings.get('quality') !== 'low', powerPreference: 'high-performance' });
    r.outputColorSpace = THREE.SRGBColorSpace;
    r.toneMapping = THREE.ACESFilmicToneMapping;
    r.toneMappingExposure = 1.05;
    r.shadowMap.type = settings.get('quality') === 'high' ? THREE.PCFSoftShadowMap : THREE.PCFShadowMap;
    container.appendChild(r.domElement);
    this.renderer = r;
    this.canvas = r.domElement;
    this.applySettings();
    settings.on('change', () => this.applySettings());
    addEventListener('resize', () => this.resize());
    this.resize();
    r.setAnimationLoop(() => this.frame());
  }

  applySettings() {
    const r = this.renderer;
    // En móviles la densidad de píxeles se limita: la diferencia apenas se nota y el rendimiento mejora mucho.
    const maxDpr = matchMedia('(pointer: coarse)').matches ? 1.5 : 2;
    r.setPixelRatio(Math.min(devicePixelRatio, maxDpr) * settings.get('resolution'));
    r.shadowMap.enabled = settings.get('shadows') !== 'off';
    this.resize();
    this.view?.onSettings?.();
  }

  resize() {
    const w = innerWidth, h = innerHeight;
    this.renderer.setSize(w, h, false);
    if (this.view?.camera) {
      this.view.camera.aspect = w / h;
      this.view.camera.updateProjectionMatrix();
    }
    this.view?.onResize?.(w, h);
  }

  setView(view) {
    if (this.view === view) return;
    this.view?.onHide?.();
    this.view = view;
    this.resize();
  }

  frame() {
    const dt = Math.min(this.clock.getDelta(), 0.1);
    this.fps = this.fps * 0.95 + (dt > 0 ? 1 / dt : 60) * 0.05;
    for (const fn of this.frameHooks) fn(dt);
    const v = this.view;
    if (!v) return;
    try {
      v.update?.(dt);
    } catch (e) {
      console.error('Error en update:', e);
    }
    if (v.scene && v.camera) this.renderer.render(v.scene, v.camera);
  }
}

export const engine = new Engine();
