// Skate Pro (cliente): menú de mapas y modos, partida con física propia (shared/skate/sim.js), cámara,
// HUD, sonido, rivales en vivo del mismo mapa y pantalla de resultados. El servidor valida el resultado.
import * as THREE from 'three';
import { engine } from '../engine/renderer.js';
import { input } from '../engine/input.js';
import { audio } from '../audio/audio.js';
import { net } from '../core/net.js';
import { store } from '../core/store.js';
import { h, button, toast } from '../ui/dom.js';
import { SKATE_MAPS, SKATE_MAP_BY_ID, SKATE_MODES, SKATE_MODE_BY_ID, medalFor } from '../../../shared/skate/maps.js';
import { SkaterSim } from '../../../shared/skate/sim.js';
import { buildScene } from './skate/scene.js';
import { SkaterRig } from './skate/rig.js';

const MEDAL = ['—', '🥉', '🥈', '🥇'];
const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
const fmt = (n) => Math.round(n).toLocaleString('es-ES');
const fmtTime = (s) => `${Math.floor(s / 60)}:${String(Math.floor(s % 60)).padStart(2, '0')}`;
const load = (k, d) => { try { return localStorage.getItem(k) || d; } catch { return d; } };
const save = (k, v) => { try { localStorage.setItem(k, v); } catch { /* sin almacenamiento */ } };

// --- Sonidos ------------------------------------------------------------------------------------
const sfx = {
  pop() { audio.tone({ freq: 190, type: 'square', dur: 0.06, vol: 0.14, slide: 120, filter: 1400 }); audio.noiseBurst({ dur: 0.05, vol: 0.12, freq: 2200 }); },
  land(v = 1) { audio.noiseBurst({ dur: 0.1, vol: 0.16 * v, freq: 700 }); audio.tone({ freq: 90, type: 'sine', dur: 0.12, vol: 0.2 * v, slide: -40 }); },
  flip() { audio.noiseBurst({ dur: 0.12, vol: 0.07, freq: 3000, q: 2 }); },
  trick(n = 1) { audio.tone({ freq: 520 + n * 70, type: 'triangle', dur: 0.14, vol: 0.14 }); audio.tone({ freq: 780 + n * 90, type: 'triangle', dur: 0.12, vol: 0.09, when: 0.05 }); },
  bank() { [0, 4, 7, 12].forEach((s, i) => audio.tone({ freq: 440 * 2 ** (s / 12), type: 'triangle', dur: 0.18, vol: 0.14, when: i * 0.06 })); },
  letter() { [0, 4, 7, 12, 16].forEach((s, i) => audio.tone({ freq: 523 * 2 ** (s / 12), type: 'square', dur: 0.12, vol: 0.08, when: i * 0.05 })); },
  goal() { [0, 7, 12, 19].forEach((s, i) => audio.tone({ freq: 392 * 2 ** (s / 12), type: 'sawtooth', dur: 0.22, vol: 0.08, when: i * 0.09, filter: 2400 })); },
  bail() { audio.noiseBurst({ dur: 0.4, vol: 0.3, freq: 400, type: 'lowpass' }); audio.tone({ freq: 160, type: 'sawtooth', dur: 0.4, vol: 0.16, slide: -120, filter: 700 }); },
  hit() { audio.noiseBurst({ dur: 0.14, vol: 0.2, freq: 500, type: 'lowpass' }); },
  tick() { audio.tone({ freq: 880, type: 'square', dur: 0.07, vol: 0.08 }); },
  drop() { audio.noiseBurst({ dur: 0.09, vol: 0.2, freq: 900, q: 2 }); audio.tone({ freq: 140, type: 'square', dur: 0.08, vol: 0.12, slide: -60, filter: 900 }); },
  step(v = 1) { audio.noiseBurst({ dur: 0.05, vol: 0.09 * v, freq: 500, type: 'lowpass' }); },
  go() { audio.tone({ freq: 1320, type: 'square', dur: 0.3, vol: 0.1 }); },
};

/** Un pequeño ritmo propio (bajo + bombo + caja + charles) mientras se patina. */
class Groove {
  constructor() { this.t = 0; this.step = 0; this.on = false; }
  update(dt) {
    if (!this.on || !audio.ready) return;
    this.t += dt;
    const len = 60 / 104 / 2;
    while (this.t >= len) {
      this.t -= len;
      const s = this.step++ % 16;
      if (s % 4 === 0) audio.tone({ freq: 62, type: 'sine', dur: 0.18, vol: 0.2, slide: -30 });
      if (s === 4 || s === 12) audio.noiseBurst({ dur: 0.12, vol: 0.1, freq: 1800, q: 0.7 });
      if (s % 2 === 1) audio.noiseBurst({ dur: 0.03, vol: 0.04, freq: 7000, q: 2 });
      if (s % 8 === 0 || s === 6 || s === 10) audio.tone({ freq: [98, 98, 117, 131][(s >> 2) % 4], type: 'sawtooth', dur: 0.2, vol: 0.06, filter: 500 });
    }
  }
}

const nameTag = (text) => {
  const c = document.createElement('canvas');
  c.width = 256; c.height = 64;
  const g = c.getContext('2d');
  g.font = '900 32px sans-serif'; g.textAlign = 'center'; g.lineWidth = 7; g.strokeStyle = '#000';
  g.strokeText(text, 128, 44); g.fillStyle = '#fff'; g.fillText(text, 128, 44);
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  const sp = new THREE.Sprite(new THREE.SpriteMaterial({ map: t, transparent: true, depthTest: false }));
  sp.scale.set(2.4, 0.6, 1);
  sp.position.y = 2.4;
  sp.renderOrder = 10;
  return sp;
};

export class SkateClient {
  constructor(game, state) {
    this.game = game;
    this.frozen = true;
    this.blockEmotes = true;
    this.customAudio = true;
    this.hint = [];
    this.state = state || {};
    this.best = this.state.best || {};
    this.me = this.state.you;
    this.sel = { map: load('kest.skate.map', 'city'), mode: load('kest.skate.mode', 'free') };
    if (!SKATE_MAP_BY_ID[this.sel.map]) this.sel.map = 'park';
    if (!SKATE_MODE_BY_ID[this.sel.mode]) this.sel.mode = 'attack';
    this.phase = 'menu';
    this.cam = new THREE.PerspectiveCamera(62, innerWidth / innerHeight, 0.2, 1200);
    this.view = { scene: new THREE.Scene(), camera: this.cam, update: (dt) => this.game.update(dt), onResize: (w, hh) => { this.cam.aspect = w / hh; this.cam.updateProjectionMatrix(); } };
    this.prevView = null;
    this.over = false;
    this.world = null;
    this.sim = null;
    this.rig = null;
    this.groove = new Groove();
    this.allies = new Map();
    this.camYaw = 0; this.camOff = 0; this.camPos = new THREE.Vector3(); this.camReady = false;
    this.shake = 0; this.t = 0; this.sendT = 0; this.helpOn = true;
    this.shown = 0;
    this.root = h('div.sk');
    document.body.appendChild(this.root);
    this.game.hud.el.style.visibility = 'hidden';
    this.netEvents = {
      'sk:ally': (m) => this.onAlly(m),
      'sk:gone': (m) => this.dropAlly(m.id),
    };
    this.showMenu();
  }

  // ----------------------------------------------------------------------------------- escena
  loadMap(id) {
    this.world?.dispose();
    this.rig?.dispose();
    this.rig = null;
    this.map = SKATE_MAP_BY_ID[id];
    this.world = buildScene(this.map);
    this.view.scene = this.world.scene;
    this.sim = new SkaterSim(this.map);
    this.world.place(this.sim.world);
    this.world.update(0, 0, { x: this.map.spawn.x, y: 0, z: this.map.spawn.z });
    for (const a of this.allies.values()) this.world.scene.add(a.g);
    this.camReady = false;
  }

  // -------------------------------------------------------------------------------------- menú
  showMenu() {
    this.phase = 'menu';
    this.sim = null;
    if (input.locked) { this.game.ignoreUnlock = true; input.unlockPointer(); }
    this.loadMap(this.sel.map);
    this.groove.on = false;
    this.root.replaceChildren(this.menuEl());
  }

  menuEl() {
    const m = SKATE_MAP_BY_ID[this.sel.map];
    const cards = SKATE_MAPS.map((mp) => {
      const best = this.best[mp.id] || 0;
      const med = medalFor(mp.id, best);
      const card = h('button.sk-card' + (mp.id === this.sel.map ? '.sel' : ''), { on: { click: () => { this.sel.map = mp.id; save('kest.skate.map', mp.id); this.showMenu(); } } },
        h('div.sk-ic', mp.icon), h('b', mp.name), h('small', mp.tag),
        h('div.sk-best', best ? `${MEDAL[med]} ${fmt(best)}` : 'Sin récord'));
      card.style.setProperty('--c', mp.theme.accent);
      return card;
    });
    const modes = SKATE_MODES.map((md) => h('button.sk-mode' + (md.id === this.sel.mode ? '.sel' : ''), { on: { click: () => { this.sel.mode = md.id; save('kest.skate.mode', md.id); this.root.replaceChildren(this.menuEl()); } } }, h('b', md.name), h('small', md.desc)));
    const controls = h('div.sk-controls',
      h('h4', 'Controles'),
      ...[['B', 'Bajarte / subir a la patineta'], ['W / S', 'Caminar · empujar / frenar'], ['Shift (a pie)', 'Correr'], ['A / D', 'Girar · girar en el aire'], ['Espacio', 'Saltar · ollie (mantén = más alto)'], ['Q/E/R · ←/→/↓', 'Kickflip / Heelflip / Shove-it'], ['G · Z', 'Tirarte (dive) · deshacer'],
        ['Q+R · E+R', '360 Flip · Varial'], ['F', 'Agarre (en el aire)'], ['Shift', 'Manual (W/S equilibrio)'], ['A / D en grind', 'Mantener el equilibrio'], ['T', 'Volver a la salida'], ['Ratón', 'Girar la cámara']]
        .map(([k, v]) => h('div.sk-ctl', h('kbd', k), h('span', v))));
    return h('div.sk-menu',
      h('div.sk-head', h('div.sk-logo', h('small', 'KESTWORLDS'), h('b', 'SKATE PRO')), button('← Salir', () => this.game.exit('leave'), 'small')),
      h('div.sk-body',
        h('div.sk-left', h('div.sk-title', 'Elige el mapa'), h('div.sk-cards', cards), h('div.sk-title', 'Elige el modo'), h('div.sk-modes', modes)),
        h('div.sk-right',
          h('div.sk-mapinfo', h('h3', `${m.icon} ${m.name}`), h('p', m.desc),
            h('div.sk-medals', `Medallas: 🥉 ${fmt(m.medals[0])} · 🥈 ${fmt(m.medals[1])} · 🥇 ${fmt(m.medals[2])}`)),
          controls,
          button('▶ ¡A PATINAR!', () => this.startRun(), 'primary sk-go'))));
  }

  // -------------------------------------------------------------------------------- partida
  startRun() {
    this.mode = SKATE_MODE_BY_ID[this.sel.mode];
    this.loadMap(this.sel.map);
    this.sim = new SkaterSim(this.map);
    this.world.place(this.sim.world);
    if (this.mode.id === 'free') this.sim.toWalk();
    this.rig = new SkaterRig(store.user?.avatar, this.map.theme.accent);
    this.rig.addTo(this.world.scene);
    this.phase = this.mode.time ? 'count' : 'run';
    this.count = 3.2;
    this.timeLeft = this.mode.time;
    this.elapsed = 0;
    this.runMs0 = performance.now();
    this.lastCount = 4;
    this.ended = false;
    this.camReady = false;
    this.shown = 0;
    this.pad = { jump: false };
    this.stack = []; this.lineT = 0; this.chips = null; this.chipsT = 0; this.curTrick = null; this.undoT = 0; this.districtName = '';
    this.root.replaceChildren(this.hudEl());
    this.syncHud(true);
    input.lockPointer();
    net.request('mode', { name: 'start', data: { map: this.map.id, mode: this.mode.id } }).catch(() => {});
    this.groove.on = true;
  }

  hudEl() {
    const q = (c, ...k) => h(c, ...k);
    const ring = (n) => `<svg viewBox="0 0 100 100"><circle cx="50" cy="50" r="44" class="sk-ring-bg"/><circle cx="50" cy="50" r="44" class="sk-ring-fg" pathLength="100"/></svg>`;
    this.el = {
      compass: q('div.sk-compass', q('div.sk-district', q('b', ''), q('small', '')), q('div.sk-compassbar')),
      time: q('div.sk-time', ''), mode: q('div.sk-modename', ''), letters: q('div.sk-letters'),
      pops: q('div.sk-pops'), count: q('div.sk-count'), flash: q('div.sk-flash'),
      lock: q('div.sk-lock.hidden', '🖱️ Haz clic para girar la cámara con el ratón'),
      ring: h('div.sk-ring', { html: ring() }), mult: q('div.sk-multn', 'x1'),
      stack: q('div.sk-stack'), cur: q('div.sk-cur'), rate: q('div.sk-rate'), pts: q('div.sk-pts', ''), line: q('div.sk-line', ''), chips: q('div.sk-chips'),
      undo: q('div.sk-undo.hidden'), balance: q('div.sk-balance.hidden', q('i.sk-bmark')), goals: q('div.sk-goals'), rank: q('div.sk-rank'),
      speed: q('div.sk-speedfill'), help: q('div.sk-help'), tag: q('div.sk-tag.hidden'),
    };
    this.el.letters.append(...'SKATE'.split('').map((c) => h('span', c)));
    this.el.ring.append(this.el.mult);
    const touch = input.isTouch ? this.touchPad() : null;
    const board = q('div.sk-board', q('div.sk-boardl', this.el.ring, q('div.sk-boardr', this.el.stack, this.el.cur, q('div.sk-scoreline', this.el.pts, this.el.chips), this.el.line)), this.el.rate, this.el.tag);
    const top = q('div.sk-top', q('div.sk-topl', this.el.mode, this.el.letters), this.el.compass,
      q('div.sk-topr', this.el.time, q('div.sk-btns', button('☰ Mapas', () => this.confirmMenu(), 'small'), button('?', () => { this.helpOn = !this.helpOn; this.syncHud(true); }, 'small'))));
    return q('div.sk-hud', this.el.flash, top, this.el.pops, this.el.goals, this.el.rank, this.el.balance, board, this.el.undo, q('div.sk-speed', q('small', 'VELOCIDAD'), q('div.sk-speedbar', this.el.speed)), this.el.help, this.el.count, this.el.lock, touch);
  }

  touchPad() {
    const btn = (label, code, cls = '') => {
      const b = h('button.sk-tb' + cls, label);
      b.addEventListener('pointerdown', (e) => { e.preventDefault(); input.pressVirtual(code); });
      for (const ev of ['pointerup', 'pointercancel', 'pointerleave']) b.addEventListener(ev, () => input.releaseVirtual(code));
      return b;
    };
    return h('div.sk-touch', btn('OLLIE', 'Space', '.big'), btn('KICK', 'KeyQ'), btn('HEEL', 'KeyE'), btn('SHOVE', 'KeyR'), btn('GRAB', 'KeyF'), btn('MANUAL', 'ShiftLeft'), btn('B', 'KeyB'));
  }

  confirmMenu() {
    if (this.phase === 'results') return this.showMenu();
    if (!window.confirm('¿Dejar la sesión y volver al menú de mapas? No se guardará esta partida.')) return;
    this.showMenu();
  }

  syncHud(full = false) {
    const el = this.el;
    if (!el || !this.sim) return;
    const st = this.sim.stats;
    if (full) {
      el.mode.textContent = `${this.map.icon} ${this.map.name} · ${this.mode.name}`;
      el.help.classList.toggle('hidden', !this.helpOn);
      el.help.replaceChildren(h('div', 'B subir/bajar de la patineta · W/S empujar o caminar · A/D girar · Espacio ollie o saltar · Shift correr/manual · ←/→/↓ o Q/E/R trucos · F agarre · Shift manual · G tirarte · Z deshacer · T volver a la salida'));
      const showGoals = this.mode.id === 'missions';
      el.goals.classList.toggle('hidden', !showGoals);
      el.goals.replaceChildren(h('b', 'MISIONES'), ...this.map.goals.map((g) => h('div.sk-goal' + (st.goals.has(g.id) ? '.ok' : ''), { 'data-id': g.id }, (st.goals.has(g.id) ? '✔ ' : '○ ') + g.text)));
    }
    this.world.markLetters(st.letters);
    this.world.markGaps(st.gaps);
    [...el.letters.children].forEach((sp) => sp.classList.toggle('on', st.letters.has(sp.textContent)));
  }

  pop(text, cls = '', ms = 1600) {
    if (!this.el) return;
    const p = h('div.sk-pop' + (cls ? '.' + cls : ''), text);
    this.el.pops.appendChild(p);
    while (this.el.pops.children.length > 5) this.el.pops.firstChild.remove();
    setTimeout(() => p.remove(), ms);
  }

  // --------------------------------------------------------------------------------- bucle
  update(dt) {
    if (this.over) return;
    if (engine.view !== this.view) { this.prevView = this.prevView || engine.view; engine.view = this.view; engine.resize(); }
    this.t += dt;
    this.groove.update(dt);
    if (this.phase === 'menu') return this.updateMenu(dt);
    if (this.game.paused) return;
    dt = Math.min(dt, 0.05);
    this.el.lock.classList.toggle('hidden', input.locked || input.isTouch || this.phase === 'results');
    if (this.phase === 'count') {
      this.count -= dt;
      const n = Math.ceil(this.count);
      if (n !== this.lastCount) { this.lastCount = n; if (n > 0) { this.el.count.textContent = String(n); this.el.count.className = 'sk-count show'; sfx.tick(); } }
      if (this.count <= 0) { this.phase = 'run'; this.el.count.textContent = '¡YA!'; this.el.count.className = 'sk-count show go'; sfx.go(); setTimeout(() => { if (this.el) this.el.count.className = 'sk-count'; }, 700); this.runMs0 = performance.now(); }
      this.cameraFollow(dt, true);
      this.rig.update(this.sim, dt, this.sim.world.heightAt(this.sim.x, this.sim.z).h);
      this.world.update(dt, this.t, this.sim);
      return;
    }
    if (this.phase === 'run') this.run(dt);
    this.cameraFollow(dt);
    this.rig.update(this.sim, dt, this.sim.world.heightAt(this.sim.x, this.sim.z).h);
    this.updateAllies(dt);
    this.world.update(dt, this.t, this.sim);
    if (this.phase === 'run') this.updateHud(dt);
  }

  updateMenu(dt) {
    const m = this.map;
    const a = this.t * 0.18;
    const cx = (m.bounds.x0 + m.bounds.x1) / 2, cz = (m.bounds.z0 + m.bounds.z1) / 2;
    const r = Math.max(m.bounds.x1 - m.bounds.x0, m.bounds.z1 - m.bounds.z0) * 0.55;
    const y0 = m.respawnBelow ? 14 : 3;
    this.cam.position.set(cx + Math.cos(a) * r, y0 + r * 0.35, cz + Math.sin(a) * r);
    this.cam.lookAt(cx, y0 * 0.4, cz);
    this.cam.fov = 55; this.cam.updateProjectionMatrix();
    this.world.update(dt, this.t, { x: cx, y: 0, z: cz });
  }

  readInput() {
    const mv = input.moveVector();
    const down = (c) => input.down(c);
    const pr = (c) => input.pressed(c);
    return {
      sx: mv.x, py: mv.y,
      jump: down('Space'), jumpP: pr('Space'),
      kickP: pr('KeyQ') || pr('ArrowLeft'), heelP: pr('KeyE') || pr('ArrowRight'), shuvP: pr('KeyR') || pr('ArrowDown'),
      undoP: pr('KeyZ') || pr('Backspace'), diveP: pr('KeyG'),
      grab: down('KeyF'), manual: down('ShiftLeft') || down('ShiftRight') || down('KeyX'),
      respawnP: pr('KeyT'),
      boardP: pr('KeyB') || pr('Enter'), camYaw: this.camYaw + this.camOff,
    };
  }

  run(dt) {
    const sim = this.sim;
    this.elapsed += dt;
    if (this.mode.time) this.timeLeft = Math.max(0, this.mode.time - this.elapsed);
    const ev = sim.step(dt, this.readInput());
    for (const e of ev) this.onEvent(e);
    if (this.mode.time && this.timeLeft <= 0 && sim.state !== 'air') this.finish();
    else if (this.mode.time && this.timeLeft <= -4) this.finish();
    if (this.mode.id === 'missions' && sim.stats.goals.size >= this.map.goals.length && sim.combo.base === 0) this.finish();
    // Rival: envío de estado
    this.sendT += dt;
    if (this.sendT >= 0.1) {
      this.sendT = 0;
      net.send('mode:fast', { name: 'st', data: { m: this.map.id, x: sim.x, y: sim.y, z: sim.z, yaw: sim.yaw, sc: sim.stats.score, st: ['ground', 'air', 'grind', 'manual', 'bail'].indexOf(sim.state) } });
    }
  }

  onEvent(e) {
    switch (e.k) {
      case 'pop': sfx.pop(); break;
      case 'flip': sfx.flip(); break;
      case 'land':
        sfx.land(clamp(e.impact / 8, 0.3, 1.2));
        if (e.impact > 6) this.shake = Math.max(this.shake, 0.25);
        if (e.clean && (e.height > 0.8 || e.air > 0.5)) { this.chips = { h: e.height, d: e.dist, t: e.air }; this.chipsT = 3.2; this.drawChips(); }
        break;
      case 'trick': sfx.trick(e.mult); this.onTrick(e); break;
      case 'bonus': this.pop(`+${fmt(e.pts)} ${e.name}`, 'gd'); if (e.direct) this.flash('#ffd600'); break;
      case 'grind': sfx.hit(); break;
      case 'gap': this.pop(`GAP: ${e.name}  +${fmt(e.pts)}`, 'cy', 2200); sfx.goal(); this.syncHud(); break;
      case 'letter': sfx.letter(); this.pop(`¡Letra ${e.ch}!`, 'gd', 1800); this.syncHud(); break;
      case 'bank': sfx.bank(); this.endLine(e.pts, true); break;
      case 'lost': this.endLine(e.pts, false); break;
      case 'bail':
        sfx.bail(); this.shake = 0.5; this.flash('#ff1744'); input.rumble?.(0.7, 260);
        this.undoT = e.undo ? 4 : 0;
        break;
      case 'mount': sfx.drop(); this.camReady = true; this.camYaw = this.sim.yaw; this.camOff = 0; this.pop('Patineta lista', 'cy', 1200); break;
      case 'dismount': sfx.land(0.6); this.pop('Te bajas de la patineta', '', 1200); break;
      case 'jump': sfx.step(0.5); break;
      case 'step': sfx.step(e.hard ? 1 : 0.5); break;
      case 'undo': sfx.bank(); this.camReady = false; this.undoT = 0; this.pop('Deshecho', 'cy'); this.setCur(null); break;
      case 'dive': this.pop('¡DIVE!', 'cy'); break;
      case 'hit': if (e.speed > 2) { sfx.hit(); this.shake = Math.max(this.shake, 0.15); } break;
      case 'fall': this.pop('¡TE CAÍSTE DEL EDIFICIO!', 'rd big', 2200); sfx.bail(); this.camReady = false; break;
      case 'respawn': this.camReady = false; this.pop('De vuelta al marcador', ''); this.endLine(0, false); break;
      case 'goal': sfx.goal(); this.pop(`✔ ${e.text}`, 'gd', 2600); this.syncHud(true); break;
      default:
    }
  }

  /** Un truco nuevo en la línea: el anterior baja a la pila de nombres, como en el original. */
  onTrick(e) {
    if (this.curTrick) { this.stack.push(this.curTrick.name); while (this.stack.length > 3) this.stack.shift(); }
    this.curTrick = { name: e.name, pts: e.shown, rating: e.rating };
    this.drawTrick();
  }

  setCur(t) { this.curTrick = t; if (!t) this.stack = []; this.drawTrick(); }

  drawTrick() {
    const el = this.el;
    if (!el) return;
    el.stack.replaceChildren(...this.stack.map((n, i) => h('div.sk-prev' + (i === this.stack.length - 1 ? '.last' : ''), n)));
    const c = this.curTrick;
    el.cur.replaceChildren(...(c ? [h('div.sk-curname', h('i', '🛹'), c.name)] : []));
    el.pts.textContent = c ? fmt(c.pts) : '';
    const r = c?.rating || '';
    el.rate.textContent = r;
    el.rate.className = 'sk-rate' + (r ? ' show r' + ['NICE', 'GREAT', 'EXCELLENT!', 'SICK!', 'INCREDIBLE!', 'LEGENDARY!'].indexOf(r) : '');
  }

  endLine(pts, banked) {
    const el = this.el;
    if (!el) return;
    if (banked && pts > 0) this.pop(`LINE +${fmt(pts)}`, 'gr big', 2000);
    else if (pts > 0) this.pop('LÍNEA PERDIDA', 'rd');
    this.stack = []; this.curTrick = null;
    this.drawTrick();
    el.line.textContent = '';
    el.mult.textContent = 'x1';
    el.ring.style.setProperty('--p', 0);
  }

  drawChips() {
    const c = this.chips;
    this.el.chips.replaceChildren(...(c ? [h('span', `⤒ ${c.h.toFixed(1)} m`), h('span', `⇥ ${c.d.toFixed(1)} m`), h('span', `◷ ${c.t.toFixed(1)} s`)] : []));
  }

  flash(color) {
    const f = this.el?.flash;
    if (!f) return;
    f.style.background = color;
    f.classList.remove('go'); void f.offsetWidth; f.classList.add('go');
  }

  districtAt(x, z) {
    const ds = this.map.districts;
    if (!ds) return null;
    for (let i = ds.length - 1; i >= 0; i--) { const d = ds[i]; if (x >= d.x0 && x <= d.x1 && z >= d.z0 && z <= d.z1) return d; }
    return null;
  }

  updateHud(dt) {
    const sim = this.sim, el = this.el;
    el.time.textContent = this.mode.time ? fmtTime(this.timeLeft) : '';
    el.time.classList.toggle('low', !!this.mode.time && this.timeLeft < 15);
    el.speed.style.width = `${clamp(sim.speed / 13, 0, 1) * 100}%`;
    el.speed.style.background = sim.speed > 9.6 ? '#ff5252' : '#00e5ff';
    const bal = sim.state === 'grind' || sim.state === 'manual';
    el.balance.classList.toggle('hidden', !bal);
    if (bal) el.balance.firstChild.style.left = `${50 + clamp(sim.bal, -1, 1) * 48}%`;
    // Línea y multiplicador
    if (sim.combo.base > 0 && sim.state !== 'bail') {
      el.line.textContent = `LINE: ${fmt(sim.comboPts)}`;
      el.mult.textContent = `x${sim.mult}`;
      el.ring.style.setProperty('--p', clamp((sim.mult - 1) / 3, 0, 1) * 100);
    }
    // Estado actual
    let tag = '';
    if (sim.state === 'walk') tag = 'B · Subirte a la patineta';
    else if (sim.state === 'manual') tag = sim.sw ? 'Switch Manual' : 'Manual';
    else if (sim.state === 'grind') tag = 'Grind';
    else if (sim.pumping) tag = 'Pumping';
    else if (sim.dive) tag = sim.dive.spread ? 'Spread Eagle' : 'Dive';
    el.tag.textContent = tag;
    el.tag.classList.toggle('hidden', !tag);
    // Deshacer
    this.undoT = Math.max(0, this.undoT - dt);
    el.undo.classList.toggle('hidden', !(this.undoT > 0 && sim.state === 'bail'));
    if (!el.undo.firstChild) el.undo.replaceChildren(h('div', h('kbd', 'Z'), ' Tap again to Undo'), h('div.sk-undo2', h('kbd', 'T'), ' Volver al marcador'));
    if (this.chipsT > 0) { this.chipsT -= dt; if (this.chipsT <= 0) { this.chips = null; this.drawChips(); } }
    // Barrio
    this.dT = (this.dT || 0) - dt;
    if (this.dT <= 0) {
      this.dT = 0.25;
      const d = this.districtAt(sim.x, sim.z);
      const name = d ? d.name : this.map.name;
      if (name !== this.districtName) {
        this.districtName = name;
        el.compass.firstChild.firstChild.textContent = name;
        el.compass.firstChild.lastChild.textContent = this.map.name;
        el.compass.classList.remove('flash'); void el.compass.offsetWidth; el.compass.classList.add('flash');
      }
    }
    // Rueda y grind
    if (audio.ready) {
      const l = audio.loop('sk-roll', { noise: true, vol: 0, filter: 700 });
      if (l) {
        const rolling = sim.state === 'ground' || sim.state === 'manual';
        audio.setLoopVolume('sk-roll', rolling ? clamp(sim.speed / 10, 0, 1) * 0.1 : 0);
        l.f.frequency.value = 300 + sim.speed * 90;
      }
      const g = audio.loop('sk-grind', { noise: true, vol: 0, filter: 3200 });
      if (g) audio.setLoopVolume('sk-grind', sim.state === 'grind' ? 0.12 : 0);
    }
    this.rankT = (this.rankT || 0) + dt;
    if (this.rankT > 0.5) { this.rankT = 0; this.drawRank(); }
  }

  // ------------------------------------------------------------------------------- cámara
  cameraFollow(dt, still = false) {
    const sim = this.sim;
    const look = input.takeLook();
    if (sim.state !== 'walk') { if (look.dx) this.camOff = clamp(this.camOff - look.dx * 0.004, -2.6, 2.6); else this.camOff *= Math.exp(-dt * 0.9); }
    const walking = sim.state === 'walk';
    if (walking) { this.camYaw -= look.dx * 0.004 + 0; this.camOff = 0; }
    const spd = sim.speed;
    let target = sim.yaw;
    if (sim.state !== 'grind' && spd > 1.2) target = Math.atan2(sim.vx, sim.vz);
    if (sim.state === 'bail') target = this.camYaw;
    if (!this.camReady) { this.camYaw = target; this.camReady = true; this.camPos.set(sim.x - Math.sin(target) * 3.6, sim.y + 1.4, sim.z - Math.cos(target) * 3.6); }
    const d = Math.atan2(Math.sin(target - this.camYaw), Math.cos(target - this.camYaw));
    if (!still && !walking) this.camYaw += d * (1 - Math.exp(-dt * (sim.state === 'air' ? 1.3 : 2.6)));
    const yaw = this.camYaw + this.camOff;
    // Cámara baja y pegada, un poco a la derecha del patinador como en el original
    const dist = walking ? 3.4 : 3.5 + clamp(spd, 0, 12) * 0.05;
    const rx = Math.cos(yaw) * 0.55, rz = -Math.sin(yaw) * 0.55;
    const px = sim.x - Math.sin(yaw) * dist + rx, pz = sim.z - Math.cos(yaw) * dist + rz;
    const groundY = sim.world.heightAt(px, pz).h;
    const fall = sim.state === 'bail' || sim.dive ? 1.2 : 0;
    const py = Math.max(sim.y + 1.25 + (sim.state === 'air' ? 0.25 : 0) + fall, groundY + 0.7);
    const k = 1 - Math.exp(-dt * 7);
    this.camPos.x += (px - this.camPos.x) * k;
    this.camPos.z += (pz - this.camPos.z) * k;
    this.camPos.y += (py - this.camPos.y) * (1 - Math.exp(-dt * 5));
    this.shake = Math.max(0, this.shake - dt * 1.6);
    const sh = this.shake;
    this.cam.position.set(this.camPos.x + (Math.random() - 0.5) * sh * 0.3, this.camPos.y + (Math.random() - 0.5) * sh * 0.3, this.camPos.z);
    this.cam.lookAt(sim.x - rx * 0.5, sim.y + 0.95, sim.z - rz * 0.5);
    this.cam.rotateZ(-sim.steer * 0.035 * clamp(spd / 8, 0, 1));
    const fov = walking ? 66 + clamp(spd, 0, 6) * 1.2 : 72 + clamp(spd, 0, 14) * 1.15;
    if (Math.abs(this.cam.fov - fov) > 0.05) { this.cam.fov += (fov - this.cam.fov) * Math.min(1, dt * 4); this.cam.updateProjectionMatrix(); }
  }

  // ------------------------------------------------------------------------ rivales en vivo
  onAlly(m) {
    if (!m || m.id === this.me) return;
    let a = this.allies.get(m.id);
    if (!a) {
      const g = new THREE.Group();
      const col = new THREE.Color().setHSL((parseInt(m.id.slice(-4), 16) % 360) / 360, 0.7, 0.55);
      const body = new THREE.Mesh(new THREE.CapsuleGeometry(0.22, 0.8, 4, 8), new THREE.MeshStandardMaterial({ color: col }));
      body.position.y = 0.95;
      const board = new THREE.Mesh(new THREE.BoxGeometry(0.24, 0.05, 0.84), new THREE.MeshStandardMaterial({ color: '#222' }));
      board.position.y = 0.1;
      g.add(body, board, nameTag(m.name || 'Patinador'));
      a = { g, x: m.x, y: m.y, z: m.z, yaw: m.yaw, name: m.name, sc: 0, map: m.m, at: 0 };
      this.allies.set(m.id, a);
    }
    Object.assign(a, { tx: m.x, ty: m.y, tz: m.z, tyaw: m.yaw, sc: m.sc, map: m.m, name: m.name, at: performance.now() });
    if (a.map === this.map?.id && this.phase !== 'menu' && !a.g.parent) this.world?.scene.add(a.g);
  }

  dropAlly(id) {
    const a = this.allies.get(id);
    if (a) { a.g.parent?.remove(a.g); this.allies.delete(id); }
  }

  updateAllies(dt) {
    const now = performance.now();
    for (const [id, a] of this.allies) {
      if (now - a.at > 4000) { this.dropAlly(id); continue; }
      const same = a.map === this.map.id && this.phase !== 'menu';
      if (same && !a.g.parent) this.world.scene.add(a.g);
      if (!same && a.g.parent) a.g.parent.remove(a.g);
      if (a.tx === undefined) continue;
      const k = 1 - Math.exp(-dt * 10);
      a.x += (a.tx - a.x) * k; a.y += (a.ty - a.y) * k; a.z += (a.tz - a.z) * k;
      a.yaw += Math.atan2(Math.sin(a.tyaw - a.yaw), Math.cos(a.tyaw - a.yaw)) * k;
      a.g.position.set(a.x, a.y, a.z); a.g.rotation.y = a.yaw;
    }
  }

  drawRank() {
    const rows = [{ name: 'Tú', sc: this.sim.stats.score, me: true }];
    for (const a of this.allies.values()) if (a.map === this.map.id) rows.push({ name: a.name, sc: a.sc });
    if (rows.length < 2) { this.el.rank.replaceChildren(); return; }
    rows.sort((x, y) => y.sc - x.sc);
    this.el.rank.replaceChildren(h('b', 'EN ESTE MAPA'), ...rows.slice(0, 6).map((r, i) => h('div.sk-rrow' + (r.me ? '.me' : ''), h('span', `${i + 1}. ${r.name}`), h('b', fmt(r.sc)))));
  }

  // ----------------------------------------------------------------------------- resultados
  async finish() {
    if (this.ended) return;
    this.ended = true;
    this.phase = 'results';
    this.groove.on = false;
    audio.setLoopVolume('sk-roll', 0); audio.setLoopVolume('sk-grind', 0);
    const sim = this.sim;
    sim.finish([]);
    sim.checkGoals([]);
    const sum = sim.summary();
    if (input.locked) { this.game.ignoreUnlock = true; input.unlockPointer(); }
    const mode = this.mode;
    const medal = mode.id === 'attack' ? medalFor(this.map.id, sum.score) : 0;
    const box = h('div.sk-results',
      h('div.sk-rtitle', mode.id === 'free' ? 'Sesión terminada' : '¡Tiempo!'), h('div.sk-rscore', fmt(sum.score)), h('small', 'PUNTOS'),
      mode.id === 'attack' ? h('div.sk-rmedal', MEDAL[medal], h('small', medal ? ['', 'Bronce', 'Plata', 'Oro'][medal] : `Faltan ${fmt(this.map.medals[0] - sum.score)} para el bronce`)) : null,
      h('div.sk-rgoals', ...this.map.goals.map((g) => h('div.sk-goal' + (sim.stats.goals.has(g.id) ? '.ok' : ''), (sim.stats.goals.has(g.id) ? '✔ ' : '○ ') + g.text))),
      h('div.sk-rstats', ...[['Mejor combo', fmt(sum.bestCombo)], ['Trucos', sum.tricks], ['Mayor altura', `${sum.maxHeight} m`], ['Más tiempo en el aire', `${sum.maxAir} s`], ['Mayor grind', `${sum.longestGrind} m`], ['Caídas', sum.bails]].map(([k, v]) => h('div', h('small', k), h('b', v)))),
      this.resultInfo = h('div.sk-rinfo', mode.record ? 'Guardando…' : 'La sesión libre no guarda récords.'),
      h('div.sk-ractions', button('↻ Repetir', () => this.startRun(), 'primary'), button('🗺️ Cambiar de mapa', () => this.showMenu()), button('Salir', () => this.game.exit('leave'))));
    this.root.appendChild(h('div.sk-resultwrap', box));
    if (!mode.record) return;
    const r = await net.request('mode', { name: 'done', data: { score: sum.score, ms: Math.round(this.elapsed * 1000), goals: sum.goals, bestCombo: sum.bestCombo, tricks: sum.tricks } }).catch(() => ({ error: 'Sin conexión' }));
    if (!this.resultInfo?.isConnected) return;
    if (r.ok) {
      this.best = r.best || this.best;
      this.resultInfo.textContent = `${r.newBest ? '🏆 ¡Nuevo récord! ' : ''}+${r.xp} XP${r.stars ? ` · ${'★'.repeat(r.stars)}` : ''}`;
      this.resultInfo.classList.add('ok');
    } else { this.resultInfo.textContent = r.error === 'Partida no válida' ? 'La partida no se pudo validar.' : (r.error || 'No se pudo guardar.'); toast(this.resultInfo.textContent, 'warn'); }
  }

  dispose() {
    this.over = true;
    audio.stopLoops();
    this.rig?.dispose();
    this.world?.dispose();
    for (const a of this.allies.values()) a.g.parent?.remove(a.g);
    this.root.remove();
    this.game.hud.el.style.visibility = '';
    if (engine.view === this.view) { engine.view = this.prevView || this.game; engine.resize(); }
  }
}
