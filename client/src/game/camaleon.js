// Pinta y Escóndete (cliente): todos los personajes son camaleones de 4 partes.
// Los escondidos se pintan: con el bote rellenan una parte, con el PINCEL dibujan a mano
// sobre su propio cuerpo (manchas, rayas...) y con el cuentagotas copian colores del
// escenario. Los buscadores juegan en primera persona y hacen clic para "pillar".
import * as THREE from 'three';
import { net } from '../core/net.js';
import { input } from '../engine/input.js';
import { engine } from '../engine/renderer.js';
import { audio } from '../audio/audio.js';
import { store } from '../core/store.js';
import { h, toast, clear } from '../ui/dom.js';
import { PALETTE, PARTS } from '../../../shared/worlds/camaleon.js';

const PART_NAMES = { head: 'Cabeza', body: 'Cuerpo', arms: 'Brazos', legs: 'Piernas', all: 'Todo' };
const POSES = ['normal', 'agachado', 'tumbado'];
const POSE_NAMES = { normal: '🧍 De pie', agachado: '🧎 Agachado', tumbado: '🛌 Tumbado' };
const SIZES = { S: 4, M: 9, L: 16 };
const TEX = 128;
const mmss = (ms) => {
  const s = Math.max(0, Math.ceil(ms / 1000));
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`;
};

/** Cuerpo de camaleón: cada parte tiene su propio lienzo (textura) donde se pinta. */
class ChamModel {
  constructor() {
    this.group = new THREE.Group();
    this.inner = new THREE.Group();
    this.group.add(this.inner);
    this.parts = {};
    this.fills = {};
    this.meshes = [];
    for (const p of PARTS) {
      const canvas = document.createElement('canvas');
      canvas.width = canvas.height = TEX;
      const ctx = canvas.getContext('2d', { willReadFrequently: true });
      ctx.fillStyle = '#ffffff';
      ctx.fillRect(0, 0, TEX, TEX);
      const tex = new THREE.CanvasTexture(canvas);
      tex.colorSpace = THREE.SRGBColorSpace;
      this.parts[p] = { canvas, ctx, tex, mat: new THREE.MeshStandardMaterial({ map: tex, roughness: 0.85 }) };
    }
    const add = (geo, part, x, y, z, rz = 0) => {
      const o = new THREE.Mesh(geo, this.parts[part].mat);
      o.position.set(x, y, z);
      o.rotation.z = rz;
      o.castShadow = true;
      o.userData.part = part;
      this.inner.add(o);
      this.meshes.push(o);
      return o;
    };
    for (const s of [-1, 1]) add(new THREE.CapsuleGeometry(0.15, 0.4, 3, 10), 'legs', s * 0.16, 0.36, 0);
    add(new THREE.CapsuleGeometry(0.34, 0.45, 4, 14), 'body', 0, 1.05, 0).scale.set(1, 1, 0.85);
    for (const s of [-1, 1]) add(new THREE.CapsuleGeometry(0.1, 0.5, 3, 10), 'arms', s * 0.46, 1.05, 0, s * 0.25);
    add(new THREE.SphereGeometry(0.34, 18, 12), 'head', 0, 1.72, 0.02);
    // Ojitos pequeños (lo único que no se pinta: ¡hay que buscarlos!)
    const eye = new THREE.MeshBasicMaterial({ color: '#111111' });
    for (const s of [-1, 1]) {
      const o = new THREE.Mesh(new THREE.SphereGeometry(0.035, 6, 4), eye);
      o.position.set(s * 0.11, 1.78, 0.33);
      this.inner.add(o);
    }
  }

  fill(part, color) {
    const p = this.parts[part];
    p.ctx.fillStyle = color;
    p.ctx.fillRect(0, 0, TEX, TEX);
    p.tex.needsUpdate = true;
    this.fills[part] = color;
  }

  /** Olvida los rellenos para que set() vuelva a pintar todo (nueva ronda). */
  reset() {
    this.fills = {};
  }

  set(paint) {
    if (!paint) return;
    for (const p of PARTS) if (paint[p] && paint[p] !== this.fills[p]) this.fill(p, paint[p]);
    this.inner.rotation.set(0, 0, 0);
    this.inner.position.set(0, 0, 0);
    this.inner.scale.set(1, 1, 1);
    if (paint.pose === 'agachado') this.inner.scale.set(1.05, 0.6, 1.05);
    else if (paint.pose === 'tumbado') {
      this.inner.rotation.x = -Math.PI / 2;
      this.inner.position.set(0, 0.32, 0.9);
    }
  }

  /** Dibuja un trazo de pincel: puntos (u,v) unidos con la punta redonda. */
  stroke({ part, color, r, pts }) {
    const p = this.parts[part];
    if (!p || !pts?.length) return;
    const ctx = p.ctx;
    ctx.strokeStyle = ctx.fillStyle = color;
    ctx.lineWidth = r * 2;
    ctx.lineCap = ctx.lineJoin = 'round';
    for (const dx of [-TEX, 0, TEX]) { // la textura da la vuelta al cuerpo: se pinta también en los bordes
      ctx.beginPath();
      pts.forEach(([u, v], i) => {
        const x = u * TEX + dx, y = (1 - v) * TEX;
        if (i === 0 || Math.abs(u - pts[i - 1][0]) > 0.5) ctx.moveTo(x, y);
        else ctx.lineTo(x, y);
      });
      if (pts.length === 1) { ctx.arc(pts[0][0] * TEX + dx, (1 - pts[0][1]) * TEX, r, 0, Math.PI * 2); ctx.fill(); }
      else ctx.stroke();
    }
    p.tex.needsUpdate = true;
  }

  /** Color medio de cada parte (para que el servidor calcule el camuflaje). */
  average() {
    const out = {};
    for (const part of PARTS) {
      const d = this.parts[part].ctx.getImageData(0, 0, TEX, TEX).data;
      let r = 0, g = 0, b = 0, n = 0;
      for (let i = 0; i < d.length; i += 4 * 37) { r += d[i]; g += d[i + 1]; b += d[i + 2]; n++; }
      out[part] = `#${[r, g, b].map((v) => Math.round(v / n).toString(16).padStart(2, '0')).join('')}`;
    }
    return out;
  }

  dispose() {
    this.group.traverse((c) => { c.geometry?.dispose(); });
    for (const p of Object.values(this.parts)) { p.tex.dispose(); p.mat.dispose(); }
  }
}

export class CamaleonClient {
  constructor(game, state) {
    this.game = game;
    this.hud = game.hud;
    this.netEvents = {};
    this.blockEmotes = true;
    this.cs = state.cam || { phase: 'lobby', roles: {}, paints: {}, until: 0 };
    this.pendingStrokes = state.strokes || {};
    this.chams = new Map(); // id -> ChamModel
    this.part = 'all';
    this.color = '#66bb6a';
    this.size = 'M';
    this.brush = false;
    this.camo = 0;
    this.missUntil = 0;
    this.buffers = new Map(); // parte -> puntos pendientes de enviar
    this.hint = ['Escondido: [B] pincel  [F] rellenar  [G] copiar color  [1-5] parte  [P] pose  [V] soltar ratón', 'Buscador: apunta y haz [Clic] para pillar (fallar te bloquea 1,5 s)'];

    this.titleEl = h('div.big', '');
    this.subEl = h('div.small.muted', '');
    this.camoFill = h('div', { style: { height: '100%', width: '0%', borderRadius: '6px', background: 'linear-gradient(90deg,#ef5350,#ffeb3b,#66bb6a)', transition: 'width .3s' } });
    this.camoBox = h('div.small', { style: { marginTop: '6px' } }, '🦎 Camuflaje', h('div.bar', { style: { width: '170px', height: '9px', marginTop: '4px' } }, this.camoFill));
    this.hud.setMode(h('div.hud-card', this.titleEl, this.subEl, this.camoBox));

    this.paintPanel = h('div.paint-panel.panel.hidden');
    this.hud.el.appendChild(this.paintPanel);
    this.blind = h('div.cam-blind.hidden', h('div', h('div', { style: { fontSize: '64px' } }, '🙈'), h('b', 'Eres BUSCADOR'), this.blindTime = h('div', ''), h('small', 'Los camaleones se están pintando…')));
    this.hud.el.appendChild(this.blind);
    this.brushHint = h('div.brush-hint.hidden', '🖌️ Pinta arrastrando sobre tu camaleón · botón derecho para girar la cámara · [B] terminar');
    this.hud.el.appendChild(this.brushHint);

    // Pincel: se pinta arrastrando con el botón izquierdo sobre el propio camaleón
    this.ray = new THREE.Raycaster();
    this.onDown = (e) => { if (this.brush && e.button === 0) { this.painting = true; this.last = null; this.paintAt(e); } };
    this.onMove = (e) => { if (this.brush && this.painting) this.paintAt(e); };
    this.onUp = () => { if (this.painting) { this.painting = false; this.flush(); } };
    engine.canvas.addEventListener('pointerdown', this.onDown);
    addEventListener('pointermove', this.onMove);
    addEventListener('pointerup', this.onUp);

    this.apply();

    this.netEvents.cam = (s) => {
      const prev = this.cs;
      this.cs = s;
      if (s.phase === 'hide' && prev.phase !== 'hide') for (const c of this.chams.values()) c.reset();
      this.apply();
      const myRole = s.roles[store.user.id];
      if (s.phase === 'hide' && prev.phase !== 'hide') {
        audio.play('countdown', null, { go: true });
        this.hud.showCenter(myRole === 'seeker' ? '🙈 Eres BUSCADOR' : '🦎 ¡Píntate y escóndete!', myRole === 'seeker' ? s.mapName : `${s.mapName} · pulsa [B] para pintar a mano`, 3500);
      }
      if (s.phase === 'seek' && prev.phase === 'hide') { audio.play('countdown', null, { go: true }); this.hud.showCenter('👀 ¡A BUSCAR!', myRole === 'seeker' ? 'Haz clic sobre los camaleones' : '¡Quieto!', 2500); }
      if (s.phase === 'results') {
        const left = Object.values(s.roles).filter((r) => r === 'hider').length;
        audio.play(left ? 'win' : 'checkpoint');
        this.hud.showCenter(left ? '🦎 ¡GANAN LOS CAMALEONES!' : '🔎 ¡GANAN LOS BUSCADORES!', left ? `Quedaban ${left} sin encontrar` : 'Todos encontrados', 5000);
      }
      if (this.brush && myRole !== 'hider') this.setBrush(false);
    };
    this.netEvents['cam:paint'] = ({ id, paint }) => {
      this.cs.paints[id] = paint;
      this.chams.get(id)?.set(paint);
    };
    this.netEvents['cam:stroke'] = ({ id, ...stroke }) => {
      if (id !== store.user.id) this.chams.get(id)?.stroke(stroke);
    };
    this.netEvents['cam:found'] = ({ id, name, by }) => {
      audio.play(id === store.user.id ? 'death' : 'hitmarker');
      if (id === store.user.id) this.hud.showCenter('👀 ¡Te han encontrado!', `${by} te ha pillado. Ahora ayudas a buscar.`, 3000);
      else toast(`🔎 ${by} ha encontrado a ${name}`, 'info');
    };
    this.netEvents['cam:me'] = ({ camo }) => { this.camo = camo; };
  }

  get role() {
    return this.cs.roles[store.user.id] || 'seeker';
  }

  get hiding() {
    return this.role === 'hider' && (this.cs.phase === 'hide' || this.cs.phase === 'seek');
  }

  get firstPerson() {
    return this.role === 'seeker' && this.cs.phase === 'seek';
  }

  get frozen() {
    return (this.role === 'seeker' && this.cs.phase === 'hide') || this.brush;
  }

  /** Con el pincel, la cámara apunta más abajo para que el camaleón quede por encima de la paleta. */
  camHeight() {
    return this.brush ? 0.85 : 1.7;
  }

  decorate(model) {
    this.attach(model, store.user.id);
  }

  decorateRemote(r) {
    if (!r.npc) this.attach(r.model, r.id);
  }

  attach(model, id) {
    model.body.visible = false;
    if (model.tag) model.tag.visible = false; // los nombres delatarían a los camaleones
    const c = new ChamModel();
    model.root.add(c.group);
    this.chams.set(id, c);
    c.set(this.cs.paints[id]);
    for (const st of this.pendingStrokes[id] || []) c.stroke(st);
  }

  apply() {
    for (const [id, c] of this.chams) c.set(this.cs.paints[id] || { head: '#ffffff', body: '#ffffff', arms: '#ffffff', legs: '#ffffff', pose: 'normal' });
    const hider = this.hiding;
    this.paintPanel.classList.toggle('hidden', !hider);
    this.camoBox.classList.toggle('hidden', !hider);
    this.hud.crosshair.classList.toggle('hidden', !(this.role === 'seeker' && this.cs.phase === 'seek') && !(hider && !this.brush));
    if (hider) this.renderPaintPanel();
  }

  renderPaintPanel() {
    const mine = this.cs.paints?.[store.user.id] || {};
    clear(this.paintPanel).append(
      h('div.row.wrap', { style: { gap: '4px' } }, ...['head', 'body', 'arms', 'legs', 'all'].map((p, i) => h(`button.pill${this.part === p ? '.on' : ''}`, {
        on: { click: () => { this.part = p; this.renderPaintPanel(); } },
      }, `${i + 1} ${PART_NAMES[p]}`))),
      h('div.cam-palette', PALETTE.map((c) => h(`div.swatch${this.color === c ? '.on' : ''}`, { style: { background: c }, title: c, on: { click: () => this.pickColor(c) } }))),
      h('div.row.wrap', { style: { gap: '4px', alignItems: 'center' } },
        h('span.cur-color', { style: { background: this.color }, title: 'Color actual' }),
        h(`button.btn.small${this.brush ? '.active' : '.primary'}`, { on: { click: () => this.setBrush(!this.brush) } }, this.brush ? '✔ Terminar [B]' : '🖌️ Pincel [B]'),
        ...(this.brush ? Object.keys(SIZES).map((k) => h(`button.btn.small${this.size === k ? '.active' : ''}`, { on: { click: () => { this.size = k; this.renderPaintPanel(); } } }, { S: '· fino', M: '● medio', L: '⬤ gordo' }[k])) : []),
        h('button.btn.small', { on: { click: () => this.fillPart() } }, `🪣 Rellenar ${PART_NAMES[this.part].toLowerCase()} [F]`),
        h('button.btn.small', { on: { click: () => this.eyedropper() } }, '💧 Copiar color [G]'),
      ),
      h('div.row.wrap', { style: { gap: '4px' } }, ...POSES.map((p) => h(`button.btn.small${mine.pose === p ? '.active' : ''}`, { on: { click: () => this.setPose(p) } }, POSE_NAMES[p]))),
    );
  }

  pickColor(c) {
    this.color = c;
    audio.ui('click');
    this.renderPaintPanel();
  }

  async fillPart() {
    audio.play('splash');
    const r = await net.request('mode', { name: 'paint', data: { part: this.part, color: this.color } });
    if (r.error) toast(r.error, 'warn');
    this.sendAverage();
  }

  async setPose(pose) {
    const r = await net.request('mode', { name: 'paint', data: { pose } });
    if (r.error) toast(r.error, 'warn');
    else this.renderPaintPanel();
  }

  // --- Pincel ---------------------------------------------------------------------
  setBrush(on) {
    const g = this.game;
    this.brush = on;
    if (on) {
      if (input.locked) { g.ignoreUnlock = true; input.unlockPointer(); }
      input.leftDragLook = false; // el botón izquierdo pinta; el derecho gira la cámara
      this.prevDist = g.cam.targetDistance;
      g.cam.targetDistance = 4.2;
      // La cámara se pone delante del camaleón, mirándolo de frente
      g.cam.yaw = g.player.yaw;
      g.cam.pitch = 0.12;
    } else {
      input.leftDragLook = true;
      if (this.prevDist) g.cam.targetDistance = this.prevDist;
      this.flush();
    }
    this.brushHint.classList.toggle('hidden', !on);
    this.apply();
  }

  paintAt(e) {
    const mine = this.chams.get(store.user.id);
    if (!mine) return;
    const rect = engine.canvas.getBoundingClientRect();
    const ndc = new THREE.Vector2(((e.clientX - rect.left) / rect.width) * 2 - 1, -((e.clientY - rect.top) / rect.height) * 2 + 1);
    this.ray.setFromCamera(ndc, this.game.camera);
    const hit = this.ray.intersectObjects(mine.meshes, false)[0];
    if (!hit?.uv) { this.last = null; return; }
    const part = hit.object.userData.part;
    const pt = [hit.uv.x, hit.uv.y];
    const r = SIZES[this.size];
    // Une con el punto anterior para que el trazo sea continuo
    const pts = this.last && this.last.part === part ? [this.last.pt, pt] : [pt];
    mine.stroke({ part, color: this.color, r, pts });
    this.last = { part, pt };
    const buf = this.buffers.get(part) || [];
    if (!buf.length && pts.length === 2) buf.push(pts[0]);
    buf.push(pt);
    this.buffers.set(part, buf);
    if (buf.length >= 20 || performance.now() - (this.sentAt || 0) > 90) this.flush(true);
  }

  flush(keepLast = false) {
    this.sentAt = performance.now();
    for (const [part, pts] of this.buffers) {
      if (!pts.length) continue;
      net.send('mode', { name: 'stroke', data: { part, color: this.color, r: SIZES[this.size], pts } });
      this.buffers.set(part, keepLast ? [pts[pts.length - 1]] : []);
    }
    clearTimeout(this.avgT);
    this.avgT = setTimeout(() => this.sendAverage(), 600);
  }

  sendAverage() {
    const mine = this.chams.get(store.user.id);
    if (mine && this.hiding) net.send('mode', { name: 'avg', data: { colors: mine.average() } });
  }

  /** Copia el color de lo que hay en el centro de la pantalla (pared, suelo, objeto…). */
  eyedropper() {
    const g = this.game;
    const ray = new THREE.Raycaster();
    ray.setFromCamera(new THREE.Vector2(0, 0), g.camera);
    ray.far = 60;
    const hit = ray.intersectObject(g.built.group, true).find((x) => x.object.visible);
    if (!hit) { toast('Apunta (con la mirilla) a una pared, el suelo o un objeto', 'warn'); return; }
    const col = new THREE.Color();
    const attr = hit.object.geometry.attributes.color;
    if (attr && hit.face) col.setRGB(attr.getX(hit.face.a), attr.getY(hit.face.a), attr.getZ(hit.face.a));
    else if (hit.object.material?.color) col.copy(hit.object.material.color);
    else return;
    audio.play('switch');
    this.pickColor(`#${col.getHexString()}`);
    toast('💧 Color copiado: rellena con [F] o pinta con el pincel [B]', 'info', 1800);
  }

  async tag() {
    if (performance.now() < this.missUntil) { audio.ui('error'); return; }
    const d = new THREE.Vector3();
    this.game.camera.getWorldDirection(d);
    this.game.player.attackTimer = 0.3;
    const r = await net.request('mode', { name: 'tag', data: { d: [d.x, d.y, d.z] } });
    if (r.error === 'cadencia') return;
    if (r.error) { toast(r.error, 'warn'); return; }
    if (!r.hit) {
      this.missUntil = performance.now() + 1500;
      audio.play('hurt');
      this.hud.showCenter('❌', 'Nadie… (1,5 s sin poder buscar)', 1200);
    }
  }

  update() {
    const g = this.game;
    const s = this.cs;
    const now = g.now();
    const role = this.role;
    const left = Object.values(s.roles || {}).filter((r) => r === 'hider').length;
    const phaseName = { lobby: '⏳ Empezando…', hide: '🎨 ¡A esconderse!', seek: '👀 ¡Buscando!', results: '🏁 Fin de la ronda' }[s.phase];
    this.titleEl.textContent = phaseName || '';
    this.subEl.textContent = s.phase === 'lobby' ? 'La ronda empieza enseguida'
      : `${s.mapName || ''} · ${role === 'hider' ? '🦎 Camaleón' : '🔎 Buscador'} · quedan ${left} · ${mmss(s.until - now)}`;
    this.camoFill.style.width = `${Math.round(this.camo * 100)}%`;
    const blind = role === 'seeker' && s.phase === 'hide';
    this.blind.classList.toggle('hidden', !blind);
    if (blind) this.blindTime.textContent = mmss(s.until - now);

    if (this.hiding) {
      for (const [i, p] of ['head', 'body', 'arms', 'legs', 'all'].entries()) {
        if (input.pressed(`Digit${i + 1}`)) { this.part = p; this.renderPaintPanel(); }
      }
      if (input.pressed('KeyB')) this.setBrush(!this.brush);
      if (input.pressed('KeyF')) this.fillPart();
      if (input.pressed('KeyG')) this.eyedropper();
      if (input.pressed('KeyP')) {
        const cur = s.paints[store.user.id]?.pose || 'normal';
        this.setPose(POSES[(POSES.indexOf(cur) + 1) % POSES.length]);
      }
      if (input.pressed('KeyV') && input.locked) { g.ignoreUnlock = true; input.unlockPointer(); }
    }
    if (role === 'seeker' && s.phase === 'seek' && input.pressed('Mouse0') && (input.locked || input.isTouch)) this.tag();
    const mine = this.chams.get(store.user.id);
    if (mine) mine.group.visible = !this.firstPerson;
  }

  dispose() {
    engine.canvas.removeEventListener('pointerdown', this.onDown);
    removeEventListener('pointermove', this.onMove);
    removeEventListener('pointerup', this.onUp);
    clearTimeout(this.avgT);
    input.leftDragLook = true;
    for (const c of this.chams.values()) { c.group.parent?.remove(c.group); c.dispose(); }
    this.paintPanel.remove();
    this.blind.remove();
    this.brushHint.remove();
    this.hud.crosshair.classList.add('hidden');
  }
}
