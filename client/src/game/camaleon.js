// Pinta y Escóndete (cliente): todos los personajes son camaleones de 4 partes pintables.
// Los escondidos se pintan (paleta o cuentagotas) y eligen pose; los buscadores juegan
// en primera persona y hacen clic para "pillar" (lo comprueba el servidor).
import * as THREE from 'three';
import { net } from '../core/net.js';
import { input } from '../engine/input.js';
import { audio } from '../audio/audio.js';
import { store } from '../core/store.js';
import { h, toast, clear } from '../ui/dom.js';
import { PALETTE, PARTS } from '../../../shared/worlds/camaleon.js';

const PART_NAMES = { head: 'Cabeza', body: 'Cuerpo', arms: 'Brazos', legs: 'Piernas', all: 'Todo' };
const POSES = ['normal', 'agachado', 'tumbado'];
const POSE_NAMES = { normal: '🧍 De pie', agachado: '🧎 Agachado', tumbado: '🛌 Tumbado' };
const mmss = (ms) => {
  const s = Math.max(0, Math.ceil(ms / 1000));
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`;
};

/** Cuerpo de camaleón: piernas, cuerpo, brazos y cabeza, cada parte con su material. */
class ChamModel {
  constructor() {
    this.group = new THREE.Group();
    this.inner = new THREE.Group();
    this.group.add(this.inner);
    const mat = () => new THREE.MeshStandardMaterial({ color: '#ffffff', roughness: 0.85 });
    this.mats = { head: mat(), body: mat(), arms: mat(), legs: mat() };
    const add = (geo, m, x, y, z, rz = 0) => {
      const o = new THREE.Mesh(geo, m);
      o.position.set(x, y, z);
      o.rotation.z = rz;
      o.castShadow = true;
      this.inner.add(o);
      return o;
    };
    for (const s of [-1, 1]) add(new THREE.CapsuleGeometry(0.15, 0.4, 3, 8), this.mats.legs, s * 0.16, 0.36, 0);
    add(new THREE.CapsuleGeometry(0.34, 0.45, 4, 10), this.mats.body, 0, 1.05, 0).scale.set(1, 1, 0.85);
    for (const s of [-1, 1]) add(new THREE.CapsuleGeometry(0.1, 0.5, 3, 8), this.mats.arms, s * 0.46, 1.05, 0, s * 0.25);
    add(new THREE.SphereGeometry(0.34, 14, 10), this.mats.head, 0, 1.72, 0.02);
    // Ojitos pequeños (lo único que no se pinta: ¡hay que buscarlos!)
    const eye = new THREE.MeshBasicMaterial({ color: '#111111' });
    for (const s of [-1, 1]) add(new THREE.SphereGeometry(0.035, 6, 4), eye, s * 0.11, 1.78, 0.33);
  }

  set(paint) {
    if (!paint) return;
    for (const p of PARTS) if (paint[p]) this.mats[p].color.set(paint[p]);
    this.inner.rotation.set(0, 0, 0);
    this.inner.position.set(0, 0, 0);
    this.inner.scale.set(1, 1, 1);
    if (paint.pose === 'agachado') this.inner.scale.set(1.05, 0.6, 1.05);
    else if (paint.pose === 'tumbado') {
      this.inner.rotation.x = -Math.PI / 2;
      this.inner.position.set(0, 0.32, 0.9);
    }
  }

  dispose() {
    this.group.traverse((c) => { c.geometry?.dispose(); });
    for (const m of Object.values(this.mats)) m.dispose();
  }
}

export class CamaleonClient {
  constructor(game, state) {
    this.game = game;
    this.hud = game.hud;
    this.netEvents = {};
    this.blockEmotes = true;
    this.cs = state.cam || { phase: 'lobby', roles: {}, paints: {}, until: 0 };
    this.chams = new Map(); // id -> ChamModel
    this.part = 'all';
    this.camo = 0;
    this.missUntil = 0;
    this.hint = ['Escondido: [1-4] parte [5] todo  [G] cuentagotas  [P] pose  [V] usar el ratón en la paleta', 'Buscador: apunta y haz [Clic] para pillar (fallar te bloquea 1,5 s)'];

    this.titleEl = h('div.big', '');
    this.subEl = h('div.small.muted', '');
    this.camoFill = h('div', { style: { height: '100%', width: '0%', borderRadius: '6px', background: 'linear-gradient(90deg,#ef5350,#ffeb3b,#66bb6a)', transition: 'width .3s' } });
    this.camoBox = h('div.small', { style: { marginTop: '6px' } }, '🦎 Camuflaje', h('div.bar', { style: { width: '170px', height: '9px', marginTop: '4px' } }, this.camoFill));
    this.hud.setMode(h('div.hud-card', this.titleEl, this.subEl, this.camoBox));

    // Paleta de pintura (abajo)
    this.paintPanel = h('div.paint-panel.panel.hidden');
    this.hud.el.appendChild(this.paintPanel);
    this.renderPaintPanel();
    // Pantalla negra para los buscadores mientras los demás se esconden
    this.blind = h('div.cam-blind.hidden', h('div', h('div', { style: { fontSize: '64px' } }, '🙈'), h('b', 'Eres BUSCADOR'), this.blindTime = h('div', ''), h('small', 'Los camaleones se están pintando…')));
    this.hud.el.appendChild(this.blind);

    // El juego llama a decorate() con el jugador y a decorateRemote() con cada jugador remoto
    this.apply();

    this.netEvents.cam = (s) => {
      const prev = this.cs;
      this.cs = s;
      this.apply();
      const myRole = s.roles[store.user.id];
      if (s.phase === 'hide' && prev.phase !== 'hide') {
        audio.play('countdown', null, { go: true });
        this.hud.showCenter(myRole === 'seeker' ? '🙈 Eres BUSCADOR' : '🦎 ¡Píntate y escóndete!', `${s.mapName}`, 3500);
      }
      if (s.phase === 'seek' && prev.phase === 'hide') { audio.play('countdown', null, { go: true }); this.hud.showCenter('👀 ¡A BUSCAR!', myRole === 'seeker' ? 'Haz clic sobre los camaleones' : '¡Quieto!', 2500); }
      if (s.phase === 'results') {
        const left = Object.values(s.roles).filter((r) => r === 'hider').length;
        audio.play(left ? 'win' : 'checkpoint');
        this.hud.showCenter(left ? '🦎 ¡GANAN LOS CAMALEONES!' : '🔎 ¡GANAN LOS BUSCADORES!', left ? `Quedaban ${left} sin encontrar` : 'Todos encontrados', 5000);
      }
    };
    this.netEvents['cam:paint'] = ({ id, paint }) => {
      this.cs.paints[id] = paint;
      this.chams.get(id)?.set(paint);
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

  get firstPerson() {
    return this.role === 'seeker' && this.cs.phase === 'seek';
  }

  get frozen() {
    return this.role === 'seeker' && this.cs.phase === 'hide';
  }

  decorate(model) {
    this.attach(model, store.user.id);
  }

  attach(model, id) {
    model.body.visible = false;
    if (model.tag) model.tag.visible = false; // los nombres delatarían a los camaleones
    const c = new ChamModel();
    model.root.add(c.group);
    this.chams.set(id, c);
    c.set(this.cs.paints[id]);
  }

  decorateRemote(r) {
    if (r.npc) return;
    this.attach(r.model, r.id);
  }

  apply() {
    for (const [id, c] of this.chams) c.set(this.cs.paints[id] || { head: '#ffffff', body: '#ffffff', arms: '#ffffff', legs: '#ffffff', pose: 'normal' });
    const hider = this.role === 'hider' && (this.cs.phase === 'hide' || this.cs.phase === 'seek');
    this.paintPanel.classList.toggle('hidden', !hider);
    this.camoBox.classList.toggle('hidden', !hider);
    this.hud.crosshair.classList.toggle('hidden', !(this.role === 'seeker' && this.cs.phase === 'seek'));
    if (hider) this.renderPaintPanel();
  }

  renderPaintPanel() {
    const mine = this.cs.paints?.[store.user.id] || {};
    clear(this.paintPanel).append(
      h('div.row.wrap', { style: { gap: '4px' } }, ...['head', 'body', 'arms', 'legs', 'all'].map((p, i) => h(`button.pill${this.part === p ? '.on' : ''}`, {
        on: { click: () => { this.part = p; this.renderPaintPanel(); } },
      }, `${i + 1} ${PART_NAMES[p]}`))),
      h('div.cam-palette', PALETTE.map((c) => h('div.swatch', { style: { background: c }, title: c, on: { click: () => this.paint(c) } }))),
      h('div.row.wrap', { style: { gap: '4px' } },
        h('button.btn.small.primary', { on: { click: () => this.eyedropper() } }, '💧 Cuentagotas [G]'),
        ...POSES.map((p) => h(`button.btn.small${mine.pose === p ? '.active' : ''}`, { on: { click: () => this.setPose(p) } }, POSE_NAMES[p])),
      ),
    );
  }

  async paint(color) {
    audio.ui('click');
    const r = await net.request('mode', { name: 'paint', data: { part: this.part, color } });
    if (r.error) toast(r.error, 'warn');
  }

  async setPose(pose) {
    const r = await net.request('mode', { name: 'paint', data: { pose } });
    if (r.error) toast(r.error, 'warn');
    else this.renderPaintPanel();
  }

  /** Coge el color de lo que hay en el centro de la pantalla y lo pinta en la parte elegida. */
  eyedropper() {
    const g = this.game;
    const ray = new THREE.Raycaster();
    ray.setFromCamera(new THREE.Vector2(0, 0), g.camera);
    ray.far = 60;
    const hits = ray.intersectObject(g.built.group, true);
    const hit = hits.find((x) => x.object.visible);
    if (!hit) { toast('Apunta a una pared, el suelo o un objeto', 'warn'); return; }
    const col = new THREE.Color();
    const attr = hit.object.geometry.attributes.color;
    if (attr && hit.face) col.setRGB(attr.getX(hit.face.a), attr.getY(hit.face.a), attr.getZ(hit.face.a));
    else if (hit.object.material?.color) col.copy(hit.object.material.color);
    else return;
    audio.play('switch');
    this.paint(`#${col.getHexString()}`);
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

    if (role === 'hider' && (s.phase === 'hide' || s.phase === 'seek')) {
      for (const [i, p] of ['head', 'body', 'arms', 'legs', 'all'].entries()) {
        if (input.pressed(`Digit${i + 1}`)) { this.part = p; this.renderPaintPanel(); }
      }
      if (input.pressed('KeyG')) this.eyedropper();
      if (input.pressed('KeyP')) {
        const cur = s.paints[store.user.id]?.pose || 'normal';
        this.setPose(POSES[(POSES.indexOf(cur) + 1) % POSES.length]);
      }
      if (input.pressed('KeyV') && input.locked) { g.ignoreUnlock = true; input.unlockPointer(); }
    }
    if (role === 'seeker' && s.phase === 'seek' && input.pressed('Mouse0') && (input.locked || input.isTouch)) this.tag();
    // Los camaleones se ven en primera persona del buscador: ocultamos el propio cuerpo
    const mine = this.chams.get(store.user.id);
    if (mine) mine.group.visible = !this.firstPerson;
  }

  dispose() {
    for (const c of this.chams.values()) { c.group.parent?.remove(c.group); c.dispose(); }
    this.paintPanel.remove();
    this.blind.remove();
    this.hud.crosshair.classList.add('hidden');
  }
}
