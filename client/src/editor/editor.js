// Editor de mundos: biblioteca de objetos, selección con el ratón, gizmos de
// mover/rotar/escalar, cuadrícula con ajuste, cámara libre, deshacer/rehacer,
// guardado en el servidor, modo de prueba local y publicación.
import * as THREE from 'three';
import { TransformControls } from 'three/examples/jsm/controls/TransformControls.js';
import { engine } from '../engine/renderer.js';
import { input } from '../engine/input.js';
import { Sky } from '../engine/sky.js';
import { buildWorld, disposeWorld } from '../world/worldBuilder.js';
import { OBJECT_TYPES, PREMIUM_DECO, makeObject, validateUserWorld } from '../../../shared/worldSchema.js';
import { CATEGORIES, LIMITS, MATERIALS } from '../../../shared/constants.js';
import { h, button, toast, clear, modal, confirmDialog } from '../ui/dom.js';
import { put, post } from '../core/api.js';
import { store } from '../core/store.js';
import { audio } from '../audio/audio.js';

const ICONS = { block: '🧱', sphere: '⚪', cylinder: '🛢️', wedge: '📐', stairs: '🪜', tree: '🌳', door: '🚪', window: '🪟', light: '💡', deco: '🌸', platform: '🛗', spawn: '🏁', checkpoint: '🚩', finish: '🏆', kill: '🔥', coin: '🪙', jumppad: '⏫', seat: '🪑', sign: '🪧' };
const DECO_KINDS = { flower: 'Flor', bush: 'Arbusto', rock: 'Roca', lamp: 'Farola', bench: 'Banco', fence: 'Valla', barrel: 'Barril', crate: 'Caja', statue: 'Estatua ★', fountain: 'Fuente ★' };
const DECO_SIZES = { flower: [0.8, 1, 0.8], bush: [1.6, 1.2, 1.6], rock: [2, 1.4, 2], lamp: [0.6, 5, 0.6], bench: [2.4, 1, 1], fence: [3, 1.2, 0.2], barrel: [1, 1.3, 1], crate: [1.2, 1.2, 1.2], statue: [1.6, 3.2, 1.2], fountain: [3, 2, 3] };
const SNAPS = [['0', 'Libre'], ['0.25', '0.25'], ['0.5', '0.5'], ['1', '1'], ['2', '2']];
const MAT_NAMES = { plastic: 'Plástico', wood: 'Madera', metal: 'Metal', stone: 'Piedra', grass: 'Césped', sand: 'Arena', glass: 'Cristal', neon: 'Neón', ice: 'Hielo', brick: 'Ladrillo' };

export class Editor {
  constructor(app, meta, data) {
    this.app = app;
    this.meta = meta;
    this.data = data;
    this.name = meta.name;
    this.selected = null;
    this.tool = 'translate';
    this.snap = 1;
    this.undoStack = [];
    this.redoStack = [];
    this.dirty = false;
    this.meshes = new Map();
    this.seq = Date.now() % 100000;
  }

  // --- Vista ------------------------------------------------------------------
  start() {
    this.scene = new THREE.Scene();
    this.camera = new THREE.PerspectiveCamera(60, innerWidth / innerHeight, 0.1, 1200);
    this.camera.position.set(0, 18, 28);
    this.yaw = 0;
    this.pitch = -0.5;
    this.sky = new Sky(this.scene, { fog: false });
    this.sky.drawDistance = 1000;
    this.grid = new THREE.GridHelper(200, 200, '#5c6bc0', '#3949ab');
    this.grid.material.transparent = true;
    this.grid.material.opacity = 0.35;
    this.scene.add(this.grid);
    this.objGroup = new THREE.Group();
    this.scene.add(this.objGroup);
    this.selBox = new THREE.BoxHelper(undefined, '#ffeb3b');
    this.selBox.visible = false;
    this.scene.add(this.selBox);

    this.tc = new TransformControls(this.camera, engine.canvas);
    this.tc.setSpace('local');
    this.tcHelper = this.tc.getHelper ? this.tc.getHelper() : this.tc;
    this.scene.add(this.tcHelper);
    this.tc.addEventListener('dragging-changed', (e) => {
      this.dragging = e.value;
      if (e.value) this.beforeDrag = this.snapshot();
      else this.commitTransform();
    });
    this.tc.addEventListener('objectChange', () => this.liveTransform());
    this.applyTool();

    this.rebuildTerrain();
    for (const o of this.data.objects) this.addMesh(o);
    this.buildUI();
    this.bindInput();
    engine.setView(this);
    audio.setAmbient(null);
  }

  // --- Mallas ------------------------------------------------------------------
  rebuildTerrain() {
    if (this.terrain) {
      this.scene.remove(this.terrain.group);
      disposeWorld(this.terrain);
    }
    this.terrain = buildWorld({ ...this.data, objects: [] }, { editor: true, terrainDetail: 2 });
    this.scene.add(this.terrain.group);
    const t = this.data.terrain;
    this.grid.position.y = t?.type === 'flat' ? (t.height ?? 0) + 0.02 : 0.02;
    this.grid.visible = t?.type !== 'hills';
  }

  addMesh(o) {
    const b = buildWorld({ objects: [o], terrain: null }, { editor: true });
    const g = b.meshes[0] || new THREE.Group();
    if (!b.meshes[0]) {
      // Objetos invisibles (zonas) se representan con un cubo de alambre
      g.add(new THREE.Mesh(new THREE.BoxGeometry(...o.s), new THREE.MeshBasicMaterial({ color: o.c, wireframe: true })));
      g.position.set(...o.p);
      g.rotation.y = ((o.ry || 0) * Math.PI) / 180;
    }
    g.userData.objId = o.id;
    this.objGroup.add(g);
    this.meshes.set(o.id, g);
    return g;
  }

  removeMesh(id) {
    const m = this.meshes.get(id);
    if (!m) return;
    this.objGroup.remove(m);
    m.traverse((c) => {
      c.geometry?.dispose();
      if (c.material?.map?.userData?.own) c.material.map.dispose();
    });
    this.meshes.delete(id);
  }

  refreshMesh(o) {
    const wasSel = this.selected === o.id;
    this.removeMesh(o.id);
    const m = this.addMesh(o);
    if (wasSel) this.tc.attach(m);
  }

  obj(id) {
    return this.data.objects.find((o) => o.id === id);
  }

  // --- Historial -----------------------------------------------------------------
  snapshot() {
    return JSON.stringify(this.data);
  }

  pushUndo(snap = this.snapshot()) {
    this.undoStack.push(snap);
    if (this.undoStack.length > 80) this.undoStack.shift();
    this.redoStack.length = 0;
    this.markDirty();
  }

  markDirty() {
    this.dirty = true;
    this.updateStatus();
  }

  restore(snap) {
    const sel = this.selected;
    this.data = JSON.parse(snap);
    for (const id of [...this.meshes.keys()]) this.removeMesh(id);
    for (const o of this.data.objects) this.addMesh(o);
    this.rebuildTerrain();
    this.select(this.obj(sel) ? sel : null);
    this.markDirty();
  }

  undo() {
    if (!this.undoStack.length) return;
    this.redoStack.push(this.snapshot());
    this.restore(this.undoStack.pop());
  }

  redo() {
    if (!this.redoStack.length) return;
    this.undoStack.push(this.snapshot());
    this.restore(this.redoStack.pop());
  }

  // --- Edición -------------------------------------------------------------------
  newId() {
    let id;
    do id = `o${(this.seq++).toString(36)}`; while (this.obj(id));
    return id;
  }

  placementPoint() {
    const ray = new THREE.Raycaster();
    ray.setFromCamera(new THREE.Vector2(0, 0), this.camera);
    const targets = [...this.objGroup.children, this.terrain.group];
    const hit = ray.intersectObjects(targets, true)[0];
    if (hit && hit.distance < 120) return hit.point;
    // Plano del suelo
    const t = new THREE.Vector3();
    const plane = new THREE.Plane(new THREE.Vector3(0, 1, 0), -(this.data.terrain?.height ?? 0));
    if (ray.ray.intersectPlane(plane, t) && t.distanceTo(this.camera.position) < 120) return t;
    return this.camera.position.clone().add(ray.ray.direction.clone().multiplyScalar(15));
  }

  addObject(type, kind) {
    if (this.data.objects.length >= LIMITS.worldMaxObjects) return toast(`Máximo ${LIMITS.worldMaxObjects} objetos`, 'warn');
    const pt = this.placementPoint();
    const o = makeObject(type, this.newId());
    if (type === 'deco' && kind) {
      o.kind = kind;
      o.s = [...DECO_SIZES[kind]];
      o.c = { flower: '#ec407a', bush: '#43a047', rock: '#9e9e9e', lamp: '#37474f', bench: '#6d4c41', fence: '#8d6e63', barrel: '#8d6e63', crate: '#a1887f', statue: '#bdbdbd', fountain: '#90a4ae' }[kind];
    }
    if (type === 'checkpoint') o.n = this.data.objects.filter((x) => x.t === 'checkpoint').length + 1;
    const s = this.snap || 0.001;
    o.p = [round(pt.x, s), round(pt.y + o.s[1] / 2, 0.001), round(pt.z, s)];
    this.pushUndo();
    this.data.objects.push(o);
    this.addMesh(o);
    this.select(o.id);
    audio.play('build');
  }

  select(id) {
    this.selected = id;
    const m = id ? this.meshes.get(id) : null;
    if (m) this.tc.attach(m);
    else this.tc.detach();
    this.renderProps();
    this.updateStatus();
  }

  liveTransform() {
    const o = this.obj(this.selected);
    const m = this.meshes.get(this.selected);
    if (!o || !m) return;
    if (this.tool === 'rotate') {
      m.rotation.x = 0;
      m.rotation.z = 0;
    }
    o.p = [round3(m.position.x), round3(m.position.y), round3(m.position.z)];
    o.ry = round3(((m.rotation.y * 180) / Math.PI) % 360);
    this.renderProps(true);
  }

  commitTransform() {
    const o = this.obj(this.selected);
    const m = this.meshes.get(this.selected);
    if (!o || !m) return;
    if (this.tool === 'scale') {
      const sc = m.scale;
      o.s = o.s.map((v, i) => Math.max(0.1, round3(v * [sc.x, sc.y, sc.z][i])));
      if (this.snap) o.s = o.s.map((v) => Math.max(this.snap / 2, round(v, this.snap / 2)));
      this.refreshMesh(o);
    }
    if (this.beforeDrag && this.beforeDrag !== this.snapshot()) this.pushUndo(this.beforeDrag);
    this.beforeDrag = null;
    this.renderProps();
  }

  duplicate() {
    const o = this.obj(this.selected);
    if (!o) return;
    this.pushUndo();
    const c = JSON.parse(JSON.stringify(o));
    c.id = this.newId();
    c.p = [c.p[0] + (this.snap || 1) * 2, c.p[1], c.p[2]];
    if (c.t === 'checkpoint') c.n = Math.min(99, c.n + 1);
    this.data.objects.push(c);
    this.addMesh(c);
    this.select(c.id);
  }

  remove() {
    if (!this.selected) return;
    this.pushUndo();
    this.data.objects = this.data.objects.filter((o) => o.id !== this.selected);
    this.removeMesh(this.selected);
    this.select(null);
  }

  setProp(o, key, value, rebuild = true) {
    this.pushUndo();
    o[key] = value;
    if (rebuild) this.refreshMesh(o);
    else {
      const m = this.meshes.get(o.id);
      if (key === 'p') m.position.set(...value);
      if (key === 'ry') m.rotation.y = (value * Math.PI) / 180;
    }
  }

  applyTool() {
    this.tc.setMode(this.tool);
    this.tc.showX = this.tool !== 'rotate';
    this.tc.showZ = this.tool !== 'rotate';
    this.tc.showY = true;
    this.tc.setTranslationSnap(this.snap || null);
    this.tc.setRotationSnap(this.snap ? THREE.MathUtils.degToRad(15) : null);
    this.tc.setScaleSnap(this.snap ? 0.25 : null);
    this.toolBtns?.forEach(([t, b]) => b.classList.toggle('active', t === this.tool));
  }

  // --- Entrada -------------------------------------------------------------------
  bindInput() {
    this.offKey = input.on('key', (e) => {
      if (this.testing) return;
      const ctrl = e.ctrlKey || e.metaKey;
      if (ctrl && e.code === 'KeyZ') { e.preventDefault(); e.shiftKey ? this.redo() : this.undo(); }
      else if (ctrl && e.code === 'KeyY') { e.preventDefault(); this.redo(); }
      else if (ctrl && e.code === 'KeyD') { e.preventDefault(); this.duplicate(); }
      else if (ctrl && e.code === 'KeyS') { e.preventDefault(); this.save(); }
      else if (e.code === 'Delete' || e.code === 'Backspace') this.remove();
      else if (e.code === 'Digit1') { this.tool = 'translate'; this.applyTool(); }
      else if (e.code === 'Digit2') { this.tool = 'rotate'; this.applyTool(); }
      else if (e.code === 'Digit3') { this.tool = 'scale'; this.applyTool(); }
      else if (e.code === 'KeyF' && this.selected) this.focus();
      else if (e.code === 'Escape') this.select(null);
    });
    this.downAt = null;
    this.onDown = (e) => {
      if (e.button === 0) this.downAt = [e.clientX, e.clientY];
    };
    this.onUp = (e) => {
      if (e.button !== 0 || !this.downAt || this.testing) return;
      const moved = Math.hypot(e.clientX - this.downAt[0], e.clientY - this.downAt[1]);
      this.downAt = null;
      if (moved > 4 || this.dragging || this.tc.axis) return;
      const ray = new THREE.Raycaster();
      ray.setFromCamera(new THREE.Vector2((e.clientX / innerWidth) * 2 - 1, -(e.clientY / innerHeight) * 2 + 1), this.camera);
      const hit = ray.intersectObjects(this.objGroup.children, true)[0];
      let n = hit?.object;
      while (n && !n.userData.objId) n = n.parent;
      this.select(n ? n.userData.objId : null);
    };
    engine.canvas.addEventListener('pointerdown', this.onDown);
    engine.canvas.addEventListener('pointerup', this.onUp);
  }

  focus() {
    const o = this.obj(this.selected);
    if (!o) return;
    const d = Math.max(...o.s) * 2 + 6;
    const dir = new THREE.Vector3(Math.sin(this.yaw) * Math.cos(this.pitch), -Math.sin(this.pitch), Math.cos(this.yaw) * Math.cos(this.pitch));
    this.camera.position.set(o.p[0], o.p[1], o.p[2]).addScaledVector(dir, d);
  }

  update(dt) {
    if (this.testing) return;
    // Cámara libre: botón derecho para mirar, WASD/QE para moverse
    const look = input.takeLook();
    if (input.dragLook) {
      this.yaw -= look.dx * 0.003;
      this.pitch = Math.max(-1.5, Math.min(1.5, this.pitch - look.dy * 0.003));
    }
    const fwd = new THREE.Vector3(-Math.sin(this.yaw) * Math.cos(this.pitch), Math.sin(this.pitch), -Math.cos(this.yaw) * Math.cos(this.pitch));
    const right = new THREE.Vector3(Math.cos(this.yaw), 0, -Math.sin(this.yaw));
    const ctrl = input.down('ControlLeft') || input.down('ControlRight');
    const sp = (input.down('ShiftLeft') ? 40 : 15) * dt;
    if (!ctrl) {
      const mv = input.moveVector();
      this.camera.position.addScaledVector(fwd, mv.y * sp).addScaledVector(right, mv.x * sp);
      if (input.down('KeyE')) this.camera.position.y += sp;
      if (input.down('KeyQ')) this.camera.position.y -= sp;
    }
    if (look.wheel) this.camera.position.addScaledVector(fwd, -look.wheel * 2.5);
    this.camera.lookAt(this.camera.position.clone().add(fwd));
    this.sky.update(dt, this.camera.position, this.data.sky?.time ?? 0.35);
    const m = this.selected && this.meshes.get(this.selected);
    if (m) { this.selBox.setFromObject(m); this.selBox.visible = true; } else this.selBox.visible = false;
    input.endFrame();
  }

  // --- Interfaz -------------------------------------------------------------------
  buildUI() {
    const nameInput = h('input.input', { value: this.name, maxLength: LIMITS.worldNameMax, style: { width: '180px', padding: '6px 10px' } });
    nameInput.addEventListener('change', () => { this.name = nameInput.value.trim() || this.name; this.markDirty(); });
    nameInput.addEventListener('keydown', (e) => e.stopPropagation());
    this.toolBtns = [['translate', '✥ Mover (1)'], ['rotate', '⟳ Rotar (2)'], ['scale', '⤢ Escalar (3)']].map(([t, l]) => [t, button(l, () => { this.tool = t; this.applyTool(); }, 'small')]);
    const snapSel = h('select.input', { style: { width: '90px', padding: '6px' } }, SNAPS.map(([v, l]) => h('option', { value: v, selected: Number(v) === this.snap }, `▦ ${l}`)));
    snapSel.addEventListener('change', () => { this.snap = Number(snapSel.value); this.applyTool(); });
    this.saveBtn = button('💾 Guardar', () => this.save(), 'small');
    const top = h('div.ed-top',
      button('← Salir', () => this.exit(), 'small'), nameInput, h('div.sep'),
      ...this.toolBtns.map(([, b]) => b), snapSel, h('div.sep'),
      button('↶', () => this.undo(), 'small'), button('↷', () => this.redo(), 'small'),
      button('⧉ Duplicar', () => this.duplicate(), 'small'), button('🗑', () => this.remove(), 'small'),
      h('div', { style: { flex: 1 } }),
      this.saveBtn, button('▶ Probar', () => this.test(), 'small violet'), button('🚀 Publicar', () => this.publishDialog(), 'small primary'),
    );
    this.applyTool();

    // Biblioteca
    const lib = h('div.lib');
    for (const [type, def] of Object.entries(OBJECT_TYPES)) {
      if (type === 'deco') continue;
      lib.append(h('button', { title: def.label, on: { click: () => this.addObject(type) } }, h('span', ICONS[type] || '■'), def.label));
    }
    const decoLib = h('div.lib');
    for (const [kind, label] of Object.entries(DECO_KINDS)) {
      const premium = PREMIUM_DECO[kind];
      decoLib.append(h('button', {
        title: premium && !store.owns(premium) ? 'Disponible en la tienda' : label,
        style: premium && !store.owns(premium) ? { opacity: 0.45 } : {},
        on: { click: () => (premium && !store.owns(premium) ? toast('Consigue esta decoración en la tienda', 'warn') : this.addObject('deco', kind)) },
      }, h('span', '🌸'), label));
    }
    const left = h('div.ed-left.panel', h('b', 'Biblioteca'), h('p.muted.small', 'Se coloca donde mira la cámara'), lib, h('div.section-title', 'Decoración'), decoLib,
      h('div.section-title', 'Controles'),
      h('div.muted.small', { style: { lineHeight: 1.6 } }, 'Clic: seleccionar', h('br'), 'Clic derecho + ratón: mirar', h('br'), 'WASD / Q E: mover cámara', h('br'), 'Rueda: acercar', h('br'), 'Supr: borrar · Ctrl+D: duplicar', h('br'), 'Ctrl+Z / Ctrl+Y: deshacer/rehacer', h('br'), 'F: enfocar · Ctrl+S: guardar'));
    this.props = h('div.ed-right.panel');
    this.status = h('div.ed-status.panel');
    this.root = h('div.screen.editor', top, left, this.props, this.status);
    this.app.ui.appendChild(this.root);
    for (const el of [left, this.props, top]) el.addEventListener('keydown', (e) => { if (input.isTyping(e)) e.stopPropagation(); });
    this.renderProps();
    this.updateStatus();
  }

  updateStatus() {
    if (!this.status) return;
    const o = this.obj(this.selected);
    this.status.textContent = `${this.data.objects.length}/${LIMITS.worldMaxObjects} objetos${o ? ` · ${OBJECT_TYPES[o.t]?.label || o.t} seleccionado` : ''}${this.dirty ? ' · cambios sin guardar' : ''}`;
  }

  renderProps(liveOnly = false) {
    const o = this.obj(this.selected);
    if (liveOnly && this.vecInputs && o) {
      this.vecInputs.p.forEach((inp, i) => { if (document.activeElement !== inp) inp.value = o.p[i]; });
      if (document.activeElement !== this.vecInputs.ry) this.vecInputs.ry.value = o.ry;
      return;
    }
    clear(this.props);
    this.vecInputs = null;
    if (!o) return this.renderWorldProps();
    const num = (value, onChange, step = 0.5) => {
      const i = h('input.input', { type: 'number', value, step });
      i.addEventListener('change', () => onChange(Number(i.value)));
      return i;
    };
    const p = o.p.map((v, i) => num(v, (n) => { const np = [...o.p]; np[i] = n; this.setProp(o, 'p', np, false); }));
    const s = o.s.map((v, i) => num(v, (n) => { const ns = [...o.s]; ns[i] = Math.max(0.1, Math.min(200, n)); this.setProp(o, 's', ns); }));
    const ry = num(o.ry, (n) => this.setProp(o, 'ry', n, false), 15);
    this.vecInputs = { p, ry };
    const color = h('input', { type: 'color', value: o.c });
    color.addEventListener('change', () => this.setProp(o, 'c', color.value));
    const mat = h('select.input', MATERIALS.map((m) => h('option', { value: m, selected: o.m === m }, MAT_NAMES[m])));
    mat.addEventListener('change', () => this.setProp(o, 'm', mat.value));
    const def = OBJECT_TYPES[o.t];
    const extra = [];
    for (const [k, spec] of Object.entries(def.props || {})) {
      if (spec === 'text') {
        const t = h('input.input', { value: o[k] || '', maxLength: 60 });
        t.addEventListener('change', () => this.setProp(o, k, t.value.slice(0, 60)));
        extra.push(h('div.field', h('label', 'Texto'), t));
      } else if (typeof spec[0] === 'number') {
        const labels = { intensity: 'Intensidad', range: 'Alcance', dist: 'Distancia', speed: 'Velocidad', n: 'Número', power: 'Potencia' };
        extra.push(h('div.field', h('label', `${labels[k] || k} (${spec[1]}–${spec[2]})`), num(o[k], (n) => this.setProp(o, k, Math.max(spec[1], Math.min(spec[2], n))), k === 'speed' ? 0.05 : 1)));
      } else {
        const sel = h('select.input', spec.map((v) => h('option', { value: v, selected: o[k] === v }, DECO_KINDS[v] || v.toUpperCase())));
        sel.addEventListener('change', () => this.setProp(o, k, sel.value));
        extra.push(h('div.field', h('label', k === 'axis' ? 'Eje de movimiento' : 'Tipo'), sel));
      }
    }
    const help = {
      platform: 'Se mueve de forma continua en el eje indicado. Los jugadores que estén encima viajan con ella.',
      spawn: 'Los jugadores aparecen aquí. Necesitas al menos uno para publicar.',
      checkpoint: 'Los puntos de control se deben pasar en orden (1, 2, 3…). Si caes, reapareces en el último.',
      finish: 'Al llegar a la meta tras todos los puntos de control se completa el recorrido.',
      kill: 'Tocarla hace reaparecer al jugador.',
      coin: 'Los jugadores pueden recoger monedas en tu mundo.',
      jumppad: 'Lanza a los jugadores hacia arriba.',
      door: 'Los jugadores la abren y cierran con E.',
      seat: 'Los jugadores se sientan con E.',
    }[o.t];
    // Element.append convierte null en texto, por eso se filtran los vacíos.
    this.props.append(...[
      h('b', `${ICONS[o.t] || ''} ${def.label}`),
      help ? h('p.muted.small', help) : null,
      h('div.field', h('label', 'Posición (X Y Z)'), h('div.vec', p)),
      h('div.field', h('label', 'Tamaño (X Y Z)'), h('div.vec', s)),
      h('div.field', h('label', 'Rotación Y (grados)'), ry),
      h('div.field', h('label', 'Color'), h('div.row', color, h('span.muted.small', o.c))),
      h('div.field', h('label', 'Material'), mat),
      ...extra,
      h('div.row.wrap', button('⧉ Duplicar', () => this.duplicate(), 'small'), button('🗑 Eliminar', () => this.remove(), 'small danger')),
    ].filter(Boolean));
  }

  renderWorldProps() {
    const w = this.data;
    const t = w.terrain || { type: 'none' };
    const terrainSel = h('select.input', [['flat', 'Llano'], ['hills', 'Colinas'], ['none', 'Sin suelo (cielo)']].map(([v, l]) => h('option', { value: v, selected: t.type === v }, l)));
    terrainSel.addEventListener('change', () => {
      this.pushUndo();
      w.terrain = terrainSel.value === 'none' ? null : { type: terrainSel.value, size: t.size || 200, seed: t.seed || 3, amp: t.amp ?? 5, height: 0, color: t.color || '#7cb342' };
      this.rebuildTerrain();
      this.renderProps();
    });
    const fields = [h('div.field', h('label', 'Terreno'), terrainSel)];
    if (w.terrain) {
      const size = h('input', { type: 'range', min: 50, max: 400, step: 10, value: w.terrain.size });
      size.addEventListener('change', () => { this.pushUndo(); w.terrain.size = Number(size.value); this.rebuildTerrain(); });
      const color = h('input', { type: 'color', value: w.terrain.color || '#7cb342' });
      color.addEventListener('change', () => { this.pushUndo(); w.terrain.color = color.value; this.rebuildTerrain(); });
      fields.push(h('div.field', h('label', 'Tamaño'), size), h('div.field', h('label', 'Color del suelo'), color));
      if (w.terrain.type === 'hills') {
        const amp = h('input', { type: 'range', min: 0, max: 15, step: 1, value: w.terrain.amp });
        amp.addEventListener('change', () => { this.pushUndo(); w.terrain.amp = Number(amp.value); this.rebuildTerrain(); });
        const seed = h('input.input', { type: 'number', value: w.terrain.seed, min: 1, max: 99999 });
        seed.addEventListener('change', () => { this.pushUndo(); w.terrain.seed = Number(seed.value) || 1; this.rebuildTerrain(); });
        fields.push(h('div.field', h('label', 'Altura de las colinas'), amp), h('div.field', h('label', 'Semilla'), seed));
      }
    }
    const water = h('input', { type: 'checkbox', checked: !!w.water });
    water.addEventListener('change', () => { this.pushUndo(); w.water = water.checked ? { enabled: true, level: 0 } : null; this.rebuildTerrain(); });
    const time = h('input', { type: 'range', min: 0, max: 1, step: 0.01, value: w.sky?.time ?? 0.35 });
    time.addEventListener('input', () => { w.sky = { ...(w.sky || {}), time: Number(time.value) }; this.markDirty(); });
    const dn = h('input', { type: 'checkbox', checked: !!w.sky?.dayNight });
    dn.addEventListener('change', () => { w.sky = { ...(w.sky || {}), dayNight: dn.checked }; this.markDirty(); });
    const fog = h('input', { type: 'checkbox', checked: w.sky?.fog !== false });
    fog.addEventListener('change', () => { w.sky = { ...(w.sky || {}), fog: fog.checked }; this.markDirty(); });
    this.props.append(
      h('b', '🌍 Mundo'),
      h('p.muted.small', 'Selecciona un objeto para editarlo. Estos ajustes afectan a todo el mundo.'),
      ...fields,
      h('label.row', { style: { margin: '8px 0' } }, water, 'Agua (nivel 0)'),
      h('div.field', h('label', 'Hora del día'), time),
      h('label.row', { style: { margin: '8px 0' } }, dn, 'Ciclo de día y noche'),
      h('label.row', { style: { margin: '8px 0' } }, fog, 'Niebla'),
    );
  }

  // --- Guardado, prueba y publicación ---------------------------------------------
  captureCover() {
    const prevSel = this.selBox.visible;
    this.selBox.visible = false;
    this.tcHelper.visible = false;
    engine.renderer.render(this.scene, this.camera);
    const c = document.createElement('canvas');
    c.width = 384;
    c.height = 216;
    c.getContext('2d').drawImage(engine.canvas, 0, 0, 384, 216);
    this.tcHelper.visible = true;
    this.selBox.visible = prevSel;
    return c.toDataURL('image/jpeg', 0.72);
  }

  async save(silent = false) {
    const v = validateUserWorld(this.data);
    if (!v.ok) return toast(v.error, 'err');
    this.saveBtn.disabled = true;
    try {
      await put(`/worlds/${this.meta.id}`, { data: this.data, name: this.name, cover: this.captureCover() });
      this.dirty = false;
      this.updateStatus();
      if (!silent) toast('Mundo guardado', 'ok');
      return true;
    } catch (e) {
      toast(e.message, 'err');
      return false;
    } finally {
      this.saveBtn.disabled = false;
    }
  }

  test() {
    const v = validateUserWorld(this.data);
    if (!v.ok) return toast(v.error, 'err');
    if (!v.world.objects.some((o) => o.t === 'spawn')) toast('Consejo: añade un punto de aparición. Se usará el centro del mapa.', 'warn');
    this.testing = true;
    this.tc.detach();
    this.root.classList.add('hidden');
    this.app.testWorld(v.world, `${this.name} (prueba)`, () => {
      this.testing = false;
      this.root.classList.remove('hidden');
      engine.setView(this);
      this.select(this.selected);
    });
  }

  publishDialog() {
    if (!this.data.objects.some((o) => o.t === 'spawn')) return toast('Añade al menos un punto de aparición antes de publicar', 'warn');
    const name = h('input.input', { value: this.name, maxLength: LIMITS.worldNameMax });
    const desc = h('textarea.input', { rows: 3, maxLength: LIMITS.worldDescMax }, this.meta.description || '');
    const cat = h('select.input', CATEGORIES.map((c) => h('option', { value: c.id, selected: (this.meta.category || 'adventure') === c.id }, c.name)));
    const vis = h('select.input', h('option', { value: 'public', selected: this.meta.visibility === 'public' }, 'Público (aparece en Descubrir)'), h('option', { value: 'private', selected: this.meta.visibility !== 'public' }, 'Privado (solo con invitación)'));
    const max = h('input.input', { type: 'number', min: 1, max: 30, value: this.meta.maxPlayers || 12 });
    for (const el of [name, desc, max]) el.addEventListener('keydown', (e) => e.stopPropagation());
    modal('Publicar mundo', h('div',
      h('p.muted.small', this.meta.published ? `Versión actual: v${this.meta.version}. Publicar crea la versión v${this.meta.version + 1}; el proyecto sigue siendo editable.` : 'Tu mundo será jugable por otros jugadores. Podrás actualizarlo cuando quieras.'),
      h('div.field', h('label', 'Nombre'), name),
      h('div.field', h('label', 'Descripción'), desc),
      h('div.field', h('label', 'Categoría'), cat),
      h('div.field', h('label', 'Visibilidad'), vis),
      h('div.field', h('label', 'Máximo de jugadores (1-30)'), max),
      h('p.muted.small', 'La portada se genera con la vista actual de la cámara.'),
    ), {
      actions: [{ label: 'Cancelar' }, { label: '🚀 Publicar', cls: 'primary', onClick: async (close) => {
        this.name = name.value.trim() || this.name;
        if (!(await this.save(true))) return;
        try {
          const r = await post(`/worlds/${this.meta.id}/publish`, { name: name.value, description: desc.value, category: cat.value, visibility: vis.value, maxPlayers: Number(max.value), cover: this.captureCover() });
          Object.assign(this.meta, { published: true, version: r.version, description: desc.value, category: cat.value, visibility: vis.value, maxPlayers: Number(max.value) });
          toast(`¡Publicado! Versión ${r.version}`, 'ok');
          audio.play('win');
          close();
        } catch (e) { toast(e.message, 'err'); }
      } }],
    });
  }

  async exit() {
    if (this.dirty && !(await confirmDialog('Cambios sin guardar', '¿Salir del editor sin guardar?', 'Salir sin guardar', 'danger'))) return;
    this.dispose();
    this.app.closeEditor();
  }

  dispose() {
    this.offKey?.();
    engine.canvas.removeEventListener('pointerdown', this.onDown);
    engine.canvas.removeEventListener('pointerup', this.onUp);
    this.tc.detach();
    this.tc.dispose?.();
    for (const id of [...this.meshes.keys()]) this.removeMesh(id);
    if (this.terrain) disposeWorld(this.terrain);
    this.root?.remove();
  }
}

const round = (v, s) => Math.round(v / s) * s;
const round3 = (v) => Math.round(v * 1000) / 1000;
