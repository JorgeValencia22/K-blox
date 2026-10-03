// Entrada unificada: teclado, ratón (con bloqueo de puntero) y controles táctiles.
import { Emitter } from '../core/events.js';

class Input extends Emitter {
  constructor() {
    super();
    this.keys = new Set();
    this.justPressed = new Set();
    this.mouse = { dx: 0, dy: 0, wheel: 0, buttons: new Set() };
    this.enabled = true;
    this.isTouch = matchMedia('(pointer: coarse)').matches || 'ontouchstart' in window;
    this.joy = { x: 0, y: 0 };
    this.touchLook = { dx: 0, dy: 0 };
    this.virtual = new Set(); // botones táctiles mantenidos
    this.canvas = null;
    this.dragLook = false;
    this.leftDragLook = false; // en partida, arrastrar con el botón izquierdo también gira la cámara
  }

  attach(canvas) {
    this.canvas = canvas;
    addEventListener('keydown', (e) => {
      if (this.isTyping(e)) return;
      if (['Tab', 'Space', 'ArrowUp', 'ArrowDown'].includes(e.code)) e.preventDefault();
      if (!this.keys.has(e.code)) this.justPressed.add(e.code);
      this.keys.add(e.code);
      this.emit('key', e);
    });
    addEventListener('keyup', (e) => {
      this.keys.delete(e.code);
      this.emit('keyup', e);
    });
    addEventListener('blur', () => this.keys.clear());
    canvas.addEventListener('mousedown', (e) => {
      this.mouse.buttons.add(e.button);
      this.justPressed.add(`Mouse${e.button}`);
      if (e.button === 2 || (e.button === 0 && this.leftDragLook)) this.dragLook = true;
      this.emit('mousedown', e);
    });
    addEventListener('mouseup', (e) => {
      this.mouse.buttons.delete(e.button);
      if (e.button === 2 || e.button === 0) this.dragLook = false;
    });
    canvas.addEventListener('contextmenu', (e) => e.preventDefault());
    addEventListener('mousemove', (e) => {
      if (document.pointerLockElement === canvas || this.dragLook) {
        this.mouse.dx += e.movementX;
        this.mouse.dy += e.movementY;
      }
    });
    canvas.addEventListener('wheel', (e) => {
      this.mouse.wheel += Math.sign(e.deltaY);
      e.preventDefault();
    }, { passive: false });
    document.addEventListener('pointerlockchange', () => this.emit('pointerlock', document.pointerLockElement === canvas));
  }

  isTyping(e) {
    const t = e.target;
    return t && (t.tagName === 'INPUT' || t.tagName === 'TEXTAREA' || t.tagName === 'SELECT' || t.isContentEditable);
  }

  lockPointer() {
    if (this.isTouch || !this.canvas) return;
    try {
      const r = this.canvas.requestPointerLock?.();
      r?.catch?.(() => {});
    } catch {
      /* el navegador puede rechazarlo */
    }
  }

  unlockPointer() {
    if (document.pointerLockElement) document.exitPointerLock();
  }

  get locked() {
    return document.pointerLockElement === this.canvas;
  }

  down(code) {
    return this.enabled && (this.keys.has(code) || this.virtual.has(code));
  }

  pressed(code) {
    return this.enabled && this.justPressed.has(code);
  }

  /** Vector de movimiento: x = derecha, y = adelante (teclado o joystick). */
  moveVector() {
    if (!this.enabled) return { x: 0, y: 0 };
    let x = 0, y = 0;
    if (this.keys.has('KeyW') || this.keys.has('ArrowUp')) y += 1;
    if (this.keys.has('KeyS') || this.keys.has('ArrowDown')) y -= 1;
    if (this.keys.has('KeyD') || this.keys.has('ArrowRight')) x += 1;
    if (this.keys.has('KeyA') || this.keys.has('ArrowLeft')) x -= 1;
    x += this.joy.x;
    y += this.joy.y;
    const l = Math.hypot(x, y);
    if (l > 1) { x /= l; y /= l; }
    return { x, y };
  }

  takeLook() {
    const r = { dx: this.mouse.dx + this.touchLook.dx, dy: this.mouse.dy + this.touchLook.dy, wheel: this.mouse.wheel };
    this.mouse.dx = this.mouse.dy = this.mouse.wheel = 0;
    this.touchLook.dx = this.touchLook.dy = 0;
    return r;
  }

  /** Llamar al final de cada frame. */
  endFrame() {
    this.justPressed.clear();
  }

  pressVirtual(code) {
    if (!this.virtual.has(code)) this.justPressed.add(code);
    this.virtual.add(code);
  }

  releaseVirtual(code) {
    this.virtual.delete(code);
  }
}

export const input = new Input();
