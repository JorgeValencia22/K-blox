// Mando (DualShock 4, Xbox…). En partida mueve al personaje y la cámara y simula las teclas y los
// botones del ratón que usa cada juego. En menús, ventanas y pausa navega con la cruceta o el stick
// (✕ acepta, ○ vuelve). Las asignaciones, la sensibilidad y la vibración se ajustan en Configuración.
import { input } from './input.js';
import { settings } from '../core/settings.js';
import { toast } from '../ui/dom.js';
import { audio } from '../audio/audio.js';
import { ACTION_BY_ID, deadzone, curve, normalizePad, padMap, pickDirection, PAD_BUTTONS } from '../../../shared/padmap.js';

const FOCUSABLE = 'button:not([disabled]), a[href], input:not([type=hidden]):not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"]), .nav-item';
const LOOK_SPEED = 950; // píxeles de ratón por segundo con el stick a fondo y sensibilidad 1
const REPEAT_FIRST = 0.38;
const REPEAT_NEXT = 0.11;

const keyName = (code) => (code.startsWith('Key') ? code.slice(3).toLowerCase() : code.startsWith('Digit') ? code.slice(5) : code === 'Space' ? ' ' : code === 'ShiftLeft' ? 'Shift' : code);

class Pad {
  constructor() {
    this.index = -1;
    this.name = '';
    this.prev = new Array(18).fill(false);
    this.cur = { b: new Array(18).fill(false), v: new Array(18).fill(0), ax: [0, 0, 0, 0] };
    this.held = new Set(); // teclas y botones simulados que están pulsados
    this.synth = false;
    this.ui = false;
    this.focusEl = null;
    this.rep = {};
    this.capture = null;
    this.lastT = 0;
    this.rumbleAt = 0;
    this.started = false;
  }

  get enabled() { return settings.get('padEnabled') !== false; }
  get connected() { return this.index >= 0; }

  start() {
    if (this.started || typeof navigator === 'undefined' || !navigator.getGamepads) return;
    this.started = true;
    addEventListener('gamepadconnected', (e) => { this.attach(e.gamepad); toast(`🎮 Mando conectado: ${this.name}`, 'ok'); });
    addEventListener('gamepaddisconnected', (e) => {
      if (e.gamepad.index !== this.index) return;
      this.index = -1;
      this.release();
      input.padActive = false;
      document.body.classList.remove('padmode');
      toast('🎮 Mando desconectado', 'warn');
    });
    // Al usar teclado o ratón de verdad, se vuelve al modo normal (las teclas simuladas no cuentan)
    addEventListener('keydown', () => { if (!this.synth) this.setActive(false); }, true);
    addEventListener('mousemove', (e) => { if (!this.synth && (Math.abs(e.movementX) > 2 || Math.abs(e.movementY) > 2)) this.setActive(false); }, true);
    addEventListener('mousedown', () => this.setActive(false), true);
    const loop = (t) => { this.tick(t); requestAnimationFrame(loop); };
    requestAnimationFrame(loop);
  }

  attach(gp) {
    this.index = gp.index;
    this.name = (gp.id || 'Mando').replace(/\s*\(.*?\)\s*/g, ' ').trim().slice(0, 40) || 'Mando';
  }

  setActive(on) {
    if (input.padActive === on) return;
    input.padActive = on;
    document.body.classList.toggle('padmode', on);
    if (!on) {
      this.release();
      this.clearFocus();
    }
  }

  /** Lectura actual del mando conectado (o null). */
  read() {
    const pads = navigator.getGamepads?.() || [];
    let gp = pads[this.index];
    if (!gp || !gp.connected) {
      gp = [...pads].find((p) => p && p.connected);
      if (!gp) { if (this.index >= 0) this.index = -1; return null; }
      this.attach(gp);
    }
    return gp;
  }

  // --- Ciclo ----------------------------------------------------------------------------------------
  tick(t) {
    const dt = Math.min(0.05, Math.max(0.001, (t - (this.lastT || t)) / 1000));
    this.lastT = t;
    const gp = this.read();
    if (!gp || !this.enabled) {
      input.padMove.x = input.padMove.y = 0;
      return;
    }
    const s = normalizePad(gp);
    this.cur = s;
    const dz = settings.get('padDeadzone') ?? 0.15;
    const L = deadzone(s.ax[0], s.ax[1], dz);
    const R = deadzone(s.ax[2], s.ax[3], dz);
    const any = s.b.some(Boolean) || Math.hypot(L.x, L.y) > 0.3 || Math.hypot(R.x, R.y) > 0.3;
    if (this.capture) { this.tickCapture(s); this.prev = s.b.slice(); return; }
    if (any) { this.setActive(true); audio.unlock?.(); }
    if (!input.padActive) { this.prev = s.b.slice(); return; }

    const ui = this.isUI();
    if (ui !== this.ui) { this.ui = ui; this.release(); this.clearFocus(); }
    if (ui) {
      input.padMove.x = input.padMove.y = 0;
      this.tickUI(s, L, R, dt);
    } else {
      this.tickGame(s, L, R, dt);
    }
    this.prev = s.b.slice();
  }

  /** ¿Hay un menú, ventana o pausa que navegar en vez de controlar el juego? */
  isUI() {
    if (!input.inGame || !input.enabled) return true;
    if (document.querySelector('.modal-back, .gxl, .pause:not(.hidden), .gxc-btns:not(.hidden), .dialogue:not(.hidden), .qf-panel')) return true;
    const a = document.activeElement;
    return !!a && (a.tagName === 'INPUT' || a.tagName === 'TEXTAREA' || a.isContentEditable);
  }

  // --- Juego -------------------------------------------------------------------------------------------
  tickGame(s, L, R, dt) {
    input.padMove.x = L.x;
    input.padMove.y = -L.y;
    const sens = (settings.get('padSens') ?? 1) * LOOK_SPEED * dt;
    input.padLook.dx += curve(R.x) * sens;
    input.padLook.dy += curve(R.y) * sens;
    const map = padMap(settings.get('padMap'));
    for (let i = 0; i < 18; i++) {
      if (s.b[i] === this.prev[i]) continue;
      const act = ACTION_BY_ID[map[i]];
      if (act?.code) this.press(act.code, s.b[i]);
    }
  }

  press(code, down) {
    if (down === this.held.has(code)) return;
    if (down) this.held.add(code); else this.held.delete(code);
    if (code.startsWith('Mouse')) {
      const n = Number(code.slice(5));
      if (down) { input.mouse.buttons.add(n); input.justPressed.add(code); } else input.mouse.buttons.delete(n);
      return;
    }
    this.synth = true;
    try {
      window.dispatchEvent(new KeyboardEvent(down ? 'keydown' : 'keyup', { code, key: keyName(code), bubbles: true, cancelable: true }));
    } finally { this.synth = false; }
  }

  release() {
    for (const code of [...this.held]) this.press(code, false);
  }

  // --- Menús -------------------------------------------------------------------------------------------
  layer() {
    for (const sel of ['#modal-root .modal-back:last-of-type', '.qf-panel', '.gxl', '.pause:not(.hidden)', '.gxc-btns:not(.hidden)', '.dialogue:not(.hidden)']) {
      const el = document.querySelector(sel);
      if (el) return el;
    }
    return document.getElementById('ui') || document.body;
  }

  focusables(root) {
    return [...root.querySelectorAll(FOCUSABLE)].filter((el) => {
      if (el.closest('.hidden')) return false;
      const r = el.getBoundingClientRect();
      if (r.width < 6 || r.height < 6) return false;
      const cs = getComputedStyle(el);
      return cs.visibility !== 'hidden' && cs.display !== 'none' && cs.pointerEvents !== 'none';
    });
  }

  setFocus(el) {
    this.clearFocus();
    this.focusEl = el;
    el.classList.add('pad-focus');
    el.scrollIntoView?.({ block: 'nearest', inline: 'nearest' });
    if (el.tagName === 'INPUT' && el.type === 'range') el.focus();
  }

  clearFocus() {
    this.focusEl?.classList.remove('pad-focus');
    this.focusEl = null;
  }

  move(dir) {
    const list = this.focusables(this.layer());
    if (!list.length) return;
    if (!this.focusEl || !list.includes(this.focusEl)) {
      this.setFocus(list.find((e) => e.classList.contains('primary') || e.classList.contains('sel')) || list[0]);
      return;
    }
    const box = (el) => { const r = el.getBoundingClientRect(); return { x: r.x, y: r.y, w: r.width, h: r.height }; };
    const others = list.filter((e) => e !== this.focusEl);
    const i = pickDirection(box(this.focusEl), others.map(box), dir);
    if (i >= 0) this.setFocus(others[i]);
  }

  activate() {
    const el = this.focusEl;
    if (!el || !el.isConnected) { this.move('down'); return; }
    if (el.tagName === 'INPUT' && ['text', 'search', 'password', 'email', 'number'].includes(el.type)) { el.focus(); return; }
    if (el.tagName === 'INPUT' && el.type === 'range') return;
    if (el.tagName === 'SELECT') { el.focus(); el.showPicker?.(); return; }
    el.click();
  }

  /** ○: cierra la ventana o vuelve atrás; si no hay botón de volver, simula Esc. */
  back() {
    const a = document.activeElement;
    if (a && (a.tagName === 'INPUT' || a.tagName === 'TEXTAREA')) { a.blur(); return; }
    const root = this.layer();
    const rx = /^(?:[^\w]*)(cancelar|cerrar|listo|ignorar|volver|atr[aá]s|← )/i;
    const btn = this.focusables(root).reverse().find((b) => rx.test((b.textContent || '').trim()));
    if (btn) { btn.click(); return; }
    this.synth = true;
    try { window.dispatchEvent(new KeyboardEvent('keydown', { code: 'Escape', key: 'Escape', bubbles: true })); } finally { this.synth = false; }
  }

  /** △: pulsa la acción principal de la ventana (Comenzar, Aceptar, Continuar…). */
  primary() {
    const b = this.focusables(this.layer()).find((e) => e.classList.contains('gxl-go') || (e.classList.contains('primary') && e.tagName === 'BUTTON'));
    if (b) b.click();
  }

  tabs(dir) {
    const cur = document.querySelector('.nav-item.on');
    const sib = cur && (dir > 0 ? cur.nextElementSibling : cur.previousElementSibling);
    if (sib?.classList.contains('nav-item')) sib.click();
  }

  /** Un paso de la cruceta: mueve el foco o, con un slider enfocado, cambia su valor. */
  step(name) {
    const f = this.focusEl;
    if (f && f.tagName === 'INPUT' && f.type === 'range' && (name === 'left' || name === 'right')) {
      const st = Number(f.step) || 1;
      f.value = String(Number(f.value) + (name === 'right' ? st : -st));
      f.dispatchEvent(new Event('input', { bubbles: true }));
    } else this.move(name);
  }

  tickUI(s, L, R, dt) {
    const dirs = [['up', 12], ['down', 13], ['left', 14], ['right', 15]];
    for (const [name, b] of dirs) {
      const stick = name === 'up' ? L.y < -0.55 : name === 'down' ? L.y > 0.55 : name === 'left' ? L.x < -0.55 : L.x > 0.55;
      const on = s.b[b] || stick;
      if (!on) { this.rep[name] = null; continue; }
      if (this.rep[name] == null) { this.step(name); this.rep[name] = REPEAT_FIRST; }
      else { this.rep[name] -= dt; if (this.rep[name] <= 0) { this.step(name); this.rep[name] = REPEAT_NEXT; } }
    }
    if (Math.abs(R.y) > 0.3) {
      const el = this.focusEl?.closest('.modal, .list, .page-body, .gxl') || this.layer();
      (el.scrollBy ? el : document.scrollingElement).scrollBy(0, R.y * 900 * dt);
    }
    const down = (i) => s.b[i] && !this.prev[i];
    if (down(0)) this.activate();
    else if (down(1)) this.back();
    else if (down(9)) { this.synth = true; try { window.dispatchEvent(new KeyboardEvent('keydown', { code: 'Escape', key: 'Escape', bubbles: true })); } finally { this.synth = false; } }
    else if (down(3)) this.primary();
    else if (down(4)) this.tabs(-1);
    else if (down(5)) this.tabs(1);
  }

  // --- Ajustes: asignar un botón y probar el mando -----------------------------------------------------
  /** Espera la próxima pulsación y devuelve el índice del botón. */
  captureNext(cb) {
    this.capture = { cb, armed: false };
  }

  cancelCapture() { this.capture = null; }

  tickCapture(s) {
    const c = this.capture;
    if (!c.armed) { c.armed = !s.b.some(Boolean); return; }
    const i = s.b.findIndex(Boolean);
    if (i >= 0) { this.capture = null; c.cb(i); }
  }

  /** Botones pulsados ahora mismo (para la prueba en Configuración). */
  pressedNow() {
    return this.cur.b.map((on, i) => (on ? PAD_BUTTONS[i] : null)).filter(Boolean);
  }

  stick() { return this.cur.ax; }

  // --- Vibración -------------------------------------------------------------------------------------
  rumble(strength = 0.5, ms = 120) {
    if (!input.padActive || settings.get('padRumble') === false) return;
    const now = performance.now();
    if (now - this.rumbleAt < 60) return;
    this.rumbleAt = now;
    const gp = this.read();
    const act = gp?.vibrationActuator;
    if (!act?.playEffect) return;
    const s = Math.max(0, Math.min(1, strength));
    act.playEffect('dual-rumble', { startDelay: 0, duration: ms, weakMagnitude: s * 0.7, strongMagnitude: s }).catch(() => {});
  }
}

export const pad = new Pad();
input.rumble = (s, ms) => pad.rumble(s, ms);
