// Asalto a la Casa (cliente): HUD, elección de rol, objetos, tablas, golpes y comida.
import * as THREE from 'three';
import { net } from '../core/net.js';
import { input } from '../engine/input.js';
import { audio } from '../audio/audio.js';
import { store } from '../core/store.js';
import { h, toast, clear, modal } from '../ui/dom.js';
import { ASALTO, ITEMS, ROLES, FOODS } from '../../../shared/worlds/asalto.js';

const mmss = (ms) => {
  const s = Math.max(0, Math.ceil(ms / 1000));
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`;
};
const MAX_HP = ASALTO.boardsMax * ASALTO.boardHp;

/** Malla sencilla de cada objeto que se puede recoger. */
function itemMesh(type) {
  const g = new THREE.Group();
  const mat = (c, extra = {}) => new THREE.MeshStandardMaterial({ color: c, roughness: 0.6, ...extra });
  const add = (geo, m, x = 0, y = 0, z = 0, rx = 0, rz = 0) => {
    const o = new THREE.Mesh(geo, m);
    o.position.set(x, y, z);
    o.rotation.set(rx, 0, rz);
    o.castShadow = true;
    g.add(o);
    return o;
  };
  switch (type) {
    case 'plank': add(new THREE.BoxGeometry(1.6, 0.12, 0.4), mat('#a1887f')); add(new THREE.BoxGeometry(1.6, 0.12, 0.4), mat('#8d6e63'), 0, 0.14, 0.1); break;
    case 'apple': add(new THREE.SphereGeometry(0.25, 12, 8), mat('#e53935')); add(new THREE.BoxGeometry(0.04, 0.15, 0.04), mat('#5d4037'), 0, 0.27, 0); break;
    case 'pizza': add(new THREE.CylinderGeometry(0.4, 0.4, 0.06, 3), mat('#ffca28')); add(new THREE.SphereGeometry(0.06, 6, 4), mat('#c62828'), 0.08, 0.05, 0); break;
    case 'cookie': add(new THREE.CylinderGeometry(0.22, 0.22, 0.06, 12), mat('#a1887f')); break;
    case 'medkit': add(new THREE.BoxGeometry(0.6, 0.4, 0.3), mat('#fafafa')); add(new THREE.BoxGeometry(0.3, 0.08, 0.31), mat('#e53935')); add(new THREE.BoxGeometry(0.08, 0.3, 0.31), mat('#e53935')); break;
    case 'pan': add(new THREE.CylinderGeometry(0.3, 0.26, 0.08, 14), mat('#37474f', { metalness: 0.6 })); add(new THREE.BoxGeometry(0.07, 0.05, 0.6), mat('#212121'), 0, 0, 0.55); break;
    case 'bat': add(new THREE.CylinderGeometry(0.09, 0.05, 1.1, 10), mat('#ff7043'), 0, 0, 0, Math.PI / 2); break;
    case 'hammer': add(new THREE.CylinderGeometry(0.04, 0.04, 0.8, 8), mat('#8d6e63'), 0, 0, 0, Math.PI / 2); add(new THREE.BoxGeometry(0.22, 0.22, 0.42), mat('#ef5350'), 0, 0, -0.4); break;
    default: add(new THREE.BoxGeometry(0.4, 0.4, 0.4), mat('#ffffff'));
  }
  return g;
}

export class AsaltoClient {
  constructor(game, state) {
    this.game = game;
    this.hud = game.hud;
    this.netEvents = {};
    this.blockEmotes = true;
    this.customAudio = true;
    this.meta = game.world.meta;
    this.as = state.asalto || { phase: 'day', night: 1, boards: {}, items: [], left: 0 };
    this.me = state.me || { hp: 100, inv: {}, weapon: null, role: 'manitas' };
    this.extra = { tr: 0, bh: null };
    this.itemMeshes = new Map();
    this.hint = ['[Clic] o [F] golpear  [Q] comer  [E] coger / tapiar', '[T] cambiar de rol (de día)'];

    this.phaseEl = h('div.big', '');
    this.subEl = h('div.small.muted', '');
    this.hpFill = h('div', { style: { height: '100%', width: '100%', borderRadius: '6px', background: 'linear-gradient(90deg,#ef5350,#66bb6a)', transition: 'width .2s' } });
    this.invEl = h('div.small', { style: { marginTop: '6px' } });
    this.alertEl = h('div.small', { style: { color: '#ff8a80', fontWeight: 900, marginTop: '4px' } });
    this.bossEl = h('div.small', { style: { marginTop: '4px' } });
    this.hud.setMode(h('div.hud-card', this.phaseEl, this.subEl, h('div.bar', { style: { width: '190px', height: '9px', marginTop: '6px' } }, this.hpFill), this.invEl, this.alertEl, this.bossEl));
    this.hud.crosshair.classList.remove('hidden');
    this.hud.addTouchButton?.('Golpe', 'Mouse0', { right: '120px', bottom: '150px', width: '60px', height: '60px', fontSize: '11px' });
    this.hud.addTouchButton?.('Comer', 'KeyQ', { right: '190px', bottom: '150px', width: '56px', height: '56px', fontSize: '11px' });

    // Luz cálida dentro de la casa (se nota de noche)
    this.houseLight = new THREE.PointLight('#ffcc80', 0, 26, 1.4);
    this.houseLight.position.set(0, 3.4, 0);
    game.scene.add(this.houseLight);

    this.applyAll();
    this.renderMe();

    this.netEvents.asalto = (s) => {
      const prev = this.as.phase;
      this.as = s;
      this.applyAll();
      if (s.phase === 'night' && prev !== 'night') { audio.play('countdown', null, { go: true }); this.hud.showCenter(`🌙 NOCHE ${s.night}`, s.night === ASALTO.nights ? '¡Viene El Gran Bigotón!' : '¡Proteged el tesoro!', 3500); }
      if (s.phase === 'day' && prev === 'night') { audio.play('win'); this.hud.showCenter('☀️ ¡AMANECE!', 'Buscad tablas y comida', 3000); }
      if (s.phase === 'won') { audio.play('levelup'); this.hud.showCenter('🏆 ¡CASA SALVADA!', 'Habéis sobrevivido a las 3 noches', 6000); }
      if (s.phase === 'lost') { audio.play('death'); this.hud.showCenter('💰 ¡Se llevaron el tesoro!', 'Inténtalo otra vez', 6000); }
    };
    this.netEvents['asalto:me'] = (m) => {
      const wasKo = this.me.ko;
      this.me = m;
      this.renderMe();
      if (m.ko && !wasKo) { audio.play('death'); this.hud.showCenter('💫', 'Te has mareado… vuelves en unos segundos', 3000); }
    };
    this.netEvents['asalto:boards'] = ({ id, hp, hit }) => {
      this.as.boards[id] = hp;
      this.applyBoards(id);
      const o = this.meta.openings.find((x) => x.id === id);
      if (o) audio.play(hit ? 'hit' : 'build', { x: o.ext[0], y: 1.5, z: o.ext[2] });
    };
    this.netEvents['asalto:item'] = ({ id }) => {
      this.as.items = this.as.items.filter((i) => i.id !== id);
      this.applyItems();
    };
    this.netEvents['asalto:hurt'] = ({ by }) => {
      audio.play('hurt');
      const flash = h('div', { style: { position: 'absolute', inset: 0, background: 'radial-gradient(circle, transparent 40%, rgba(255,0,0,0.35))', pointerEvents: 'none', animation: 'hurt .6s forwards' } });
      this.hud.el.appendChild(flash);
      setTimeout(() => flash.remove(), 600);
      if (by === 'El Gran Bigotón') this.game.cam.shake = 0.15;
    };
    this.netEvents['asalto:hit'] = ({ id }) => {
      this.game.showBubble(id, ['¡Ay!', '¡Uy!', '¡Auch!', '¡Oye!'][Math.floor(Math.random() * 4)]);
      const r = this.game.remotes.get(id);
      audio.play('hit', r ? r.pos : null);
    };
    this.netEvents['asalto:flee'] = ({ name, by, boss }) => {
      audio.play(boss ? 'win' : 'coin');
      toast(boss ? `🏆 ${by} ha echado al Gran Bigotón` : `🏃 ${name} huye corriendo (${by})`, boss ? 'reward' : 'info');
    };
    this.netEvents['asalto:boss'] = () => {
      audio.play('scream');
      this.hud.showCenter('😠 EL GRAN BIGOTÓN', '¡Echadle de la casa entre todos!', 3500);
    };
    if (!game.spectator) setTimeout(() => this.chooseRole(), 700);
  }

  chooseRole() {
    if (this.game.disposed) return;
    if (input.locked) { this.game.ignoreUnlock = true; input.unlockPointer(); }
    const close = modal('Elige tu papel en la familia', h('div.list', Object.entries(ROLES).map(([id, r]) => h(`div.list-item${this.me.role === id ? '.on' : ''}`, {
      style: { cursor: 'pointer' },
      on: { click: async () => { close(); const res = await net.request('mode', { name: 'role', data: { id } }); if (res.error) toast(res.error, 'warn'); else toast(`Ahora eres ${r.name}`, 'ok'); } },
    }, h('span', { style: { fontSize: '26px' } }, r.icon), h('span.grow', h('b', r.name), h('div.small.muted', r.desc)))),
    ), { actions: [{ label: 'Cerrar' }] });
  }

  applyAll() {
    for (const o of this.meta.openings) this.applyBoards(o.id);
    this.applyItems();
  }

  applyBoards(id) {
    const o = this.meta.openings.find((x) => x.id === id);
    if (!o) return;
    const n = Math.ceil((this.as.boards[id] || 0) / ASALTO.boardHp);
    o.boards.forEach((bid, i) => {
      const e = this.game.built.objects.get(bid);
      if (!e) return;
      if (e.mesh) e.mesh.visible = i < n;
      e.colliders.forEach((c) => (c.enabled = i < n));
    });
  }

  applyItems() {
    const ids = new Set(this.as.items.map((i) => i.id));
    for (const [id, m] of this.itemMeshes) if (!ids.has(id)) { this.game.scene.remove(m); this.itemMeshes.delete(id); }
    for (const it of this.as.items) {
      if (this.itemMeshes.has(it.id)) continue;
      const m = itemMesh(it.type);
      m.position.set(it.p[0], 0.8, it.p[2]);
      m.userData.type = it.type;
      this.game.scene.add(m);
      this.itemMeshes.set(it.id, m);
    }
  }

  renderMe() {
    const m = this.me;
    this.hpFill.style.width = `${m.hp}%`;
    const inv = m.inv || {};
    const role = ROLES[m.role];
    const parts = [
      role ? `${role.icon} ${role.name}` : '',
      m.weapon ? `${ITEMS[m.weapon].icon} ${ITEMS[m.weapon].name}` : '👊 Puños',
      `🪵 ${inv.plank || 0}`,
      ...FOODS.filter((f) => inv[f]).map((f) => `${ITEMS[f].icon}${inv[f]}`),
      inv.medkit ? `🩹${inv.medkit}` : '',
    ].filter(Boolean);
    clear(this.invEl).append(parts.join('  ·  '));
    this.setWeaponModel(m.weapon);
  }

  /** Muestra el arma en la mano del jugador. */
  setWeaponModel(type) {
    if (this.weaponType === type) return;
    this.weaponType = type;
    const arm = this.game.player.model.rArm;
    if (this.weaponMesh) arm.remove(this.weaponMesh);
    this.weaponMesh = null;
    if (!type) return;
    const m = itemMesh(type);
    m.position.set(0, -0.7, 0.35);
    m.rotation.x = -Math.PI / 2;
    arm.add(m);
    this.weaponMesh = m;
  }

  get frozen() {
    return !!this.me.ko;
  }

  decorateRemote(r) {
    if (r.id.startsWith('asboss')) r.model.root.scale.setScalar(1.7);
  }

  interactions(b) {
    if (this.game.spectator || this.me.ko) return [];
    const out = [];
    for (const it of this.as.items) {
      const d = Math.hypot(b.x - it.p[0], b.z - it.p[2]);
      if (d < 2.2) out.push({ d, label: `Coger ${ITEMS[it.type].icon} ${ITEMS[it.type].name}`, act: () => this.send('pick', { id: it.id }) });
    }
    for (const o of this.meta.openings) {
      const d = Math.min(Math.hypot(b.x - o.int[0], b.z - o.int[2]), Math.hypot(b.x - o.ext[0], b.z - o.ext[2]));
      if (d < 2.6 && (this.as.boards[o.id] || 0) < MAX_HP) {
        out.push({ d: d + 0.2, label: (this.me.inv?.plank || 0) > 0 ? `Tapiar ${o.label} (🪵 ${this.me.inv.plank})` : `Necesitas tablas para tapiar la ${o.label}`, act: () => this.send('board', { id: o.id }) });
      }
    }
    return out;
  }

  async send(name, data = {}) {
    const r = await net.request('mode', { name, data });
    if (r.error && r.error !== 'cadencia') { toast(r.error, 'warn'); audio.ui('error'); }
    if (r.ok && name === 'pick') audio.play(ITEMS[r.type]?.weapon ? 'chest' : 'coin');
    return r;
  }

  attack() {
    this.game.player.attackTimer = 0.3;
    this.send('hit').then((r) => { if (r.hit) audio.play('hitmarker'); });
  }

  eat() {
    const inv = this.me.inv || {};
    const order = this.me.hp < 45 && inv.medkit ? ['medkit', ...FOODS] : [...FOODS, 'medkit'];
    const type = order.find((t) => inv[t] > 0);
    if (!type) { toast('No tienes comida: busca manzanas, pizza o galletas', 'warn'); return; }
    this.send('eat', { type }).then((r) => { if (r.ok) audio.play('coin'); });
  }

  onSnap(m) {
    if ('tr' in m) this.extra = m;
  }

  skyTime() {
    return this.as.phase === 'night' ? 0.92 : 0.38;
  }

  startAudio() {
    audio.setAmbient('day');
    audio.startMusic();
  }

  update(dt) {
    const g = this.game;
    const now = g.now();
    const s = this.as;
    if (!this.me.ko && !g.spectator) {
      if ((input.pressed('Mouse0') && (input.locked || input.isTouch)) || input.pressed('KeyF')) this.attack();
      if (input.pressed('KeyQ')) this.eat();
      if (input.pressed('KeyT') && s.phase !== 'night') this.chooseRole();
    }
    if (s.phase === 'day') {
      this.phaseEl.textContent = `☀️ Día ${s.night}`;
      this.subEl.textContent = `La noche llega en ${mmss(s.until - now)} · tapia ventanas y puertas`;
    } else if (s.phase === 'night') {
      this.phaseEl.textContent = `🌙 Noche ${s.night}/${ASALTO.nights}`;
      this.subEl.textContent = `Encapuchados restantes: ${s.left}`;
    } else {
      this.phaseEl.textContent = s.phase === 'won' ? '🏆 ¡Casa salvada!' : '💰 Tesoro robado';
      this.subEl.textContent = 'Nueva partida en breve';
    }
    const tr = this.extra.tr || 0;
    this.alertEl.textContent = tr > 0.03 && s.phase === 'night' ? `⚠️ ¡Están robando el tesoro! ${Math.min(100, Math.round(tr * 100))} % (quédate a su lado para impedirlo)` : '';
    this.bossEl.textContent = this.extra.bh ? `😠 Gran Bigotón: ${'█'.repeat(Math.ceil((this.extra.bh[0] / this.extra.bh[1]) * 12))}` : '';
    // Objetos girando
    const t = performance.now() / 1000;
    for (const m of this.itemMeshes.values()) { m.rotation.y = t * 1.5; m.position.y = 0.8 + Math.sin(t * 2.5 + m.position.x) * 0.12; }
    this.houseLight.intensity = s.phase === 'night' ? 30 : 0;
    g.cam.shake *= 0.9;
  }

  dispose() {
    for (const m of this.itemMeshes.values()) this.game.scene.remove(m);
    this.game.scene.remove(this.houseLight);
    if (this.weaponMesh) this.game.player.model.rArm.remove(this.weaponMesh);
    this.hud.crosshair.classList.add('hidden');
    this.game.cam.shake = 0;
  }
}
