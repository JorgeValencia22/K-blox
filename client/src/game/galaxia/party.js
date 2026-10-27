// Cooperativo de Guerra Galáctica (1 a 4 jugadores). Cada jugador lleva su combate en su pantalla,
// pero la partida es de todos:
//  · los golpes a los enemigos se envían a los demás, así la vida de cada enemigo es compartida;
//  · los aliados se ven como hologramas en la escena, con su nombre y su vida;
//  · los capítulos clave (hangar, núcleo, duelo final) esperan a que lleguen todos;
//  · un aliado que se acerca a un caído lo levanta; si caen todos, se reintenta el combate.
import * as THREE from 'three';
import { net } from '../../core/net.js';
import { h, clear } from '../../ui/dom.js';
import { AvatarModel } from '../../avatar/avatarModel.js';
import { AvatarAnimator } from '../../avatar/avatarAnimator.js';
import { DEFAULT_AVATAR } from '../../../../shared/avatar.js';
import { attachSaber } from './combat.js';
import { heroOf } from './heroes.js';
import { clamp } from './kit.js';

const SYNC = ['hangar', 'core', 'boss'];
const SEND_MS = 110;
const REVIVE_RANGE = 3.4;
const REVIVE_TIME = 2.5;

function nameTag(text, color) {
  const c = document.createElement('canvas');
  c.width = 256; c.height = 64;
  const g = c.getContext('2d');
  g.font = '900 34px sans-serif';
  g.textAlign = 'center';
  g.lineWidth = 7;
  g.strokeStyle = '#000';
  g.strokeText(text, 128, 44);
  g.fillStyle = color;
  g.fillText(text, 128, 44);
  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  const sp = new THREE.Sprite(new THREE.SpriteMaterial({ map: tex, transparent: true, depthTest: false }));
  sp.scale.set(2.4, 0.6, 1);
  sp.position.y = 2.7;
  sp.renderOrder = 10;
  return sp;
}

export class Party {
  /** `roster`: jugadores del vestíbulo; `me`: mi id. */
  constructor(roster, me) {
    this.me = me;
    this.roster = new Map(roster.map((p) => [p.id, p]));
    this.active = roster.length > 1;
    this.hpMul = 1 + 0.5 * (roster.length - 1);
    this.camp = null;
    this.allies = new Map(); // id -> { s, ghost }
    this.pending = {}; // capítulo -> Map(id enemigo -> daño recibido antes de que aparezca aquí)
    this.passed = new Set();
    this.hold = null;
    this.sendT = 0;
    this.reviveT = 0;
    this.retryAt = 0;
    this.panel = null;
    this.panelT = 0;
    this.netEvents = {
      'gx:ally': (m) => this.onAlly(m),
      'gx:hit': (m) => this.onHit(m),
      'gx:go': (m) => this.release(m.ch),
      'gx:lobby': (l) => this.onLobby(l),
    };
  }

  attach(camp) {
    this.camp = camp;
    if (this.active) {
      this.panel = h('div.gxc-party');
      camp.hud.root.appendChild(this.panel);
    }
  }

  onLobby(l) {
    for (const p of l.players) this.roster.set(p.id, p);
    for (const id of [...this.roster.keys()]) if (!l.players.some((p) => p.id === id)) { this.roster.delete(id); this.dropGhost(id); this.allies.delete(id); }
    if (this.camp && this.roster.size < 2) this.active = this.active && this.roster.size > 1;
    this.checkAlone();
  }

  /** Si todos los aliados se han ido, ya nadie espera ni comparte golpes. */
  checkAlone() {
    if (this.hold && this.roster.size <= 1) this.release(this.hold.ch);
  }

  // --- Esperar a los aliados antes de un capítulo compartido -----------------------------------
  needsBarrier(name) {
    return this.active && SYNC.includes(name) && !this.passed.has(name);
  }

  arrive(ch, cb) {
    this.hold = { ch, cb };
    this.camp.hud.caption('⏳ Esperando a tus aliados…', 0);
    net.request('mode', { name: 'arrive', data: { ch } }).then((r) => { if (r?.go || r?.error) this.release(ch); });
  }

  release(ch) {
    if (!this.hold || this.hold.ch !== ch) return;
    const { cb } = this.hold;
    this.hold = null;
    this.passed.add(ch);
    this.camp.hud.caption('', 1);
    cb();
  }

  // --- Vida compartida de los enemigos -----------------------------------------------------------
  send(name, data) { net.send('mode:fast', { name, data }); }

  hit(id, dmg) {
    this.send('hit', { i: id, d: Math.round(dmg * 10) / 10, c: this.camp.name });
  }

  onHit({ i, d, c }) {
    const camp = this.camp;
    if (!camp || !(d > 0)) return;
    if (c === camp.name) this.applyHit(i, d);
    else if (SYNC.indexOf(c) > SYNC.indexOf(camp.name)) {
      const m = (this.pending[c] ||= new Map());
      m.set(i, (m.get(i) || 0) + d);
    }
  }

  applyHit(i, d) {
    const ch = this.camp.ch;
    if (i === 'core') { ch?.remoteCore?.(d); return; }
    const f = ch?.A?.foes?.find((x) => x.id === i);
    if (f) f.applyRemote(d);
    else {
      const m = (this.pending[this.camp.name] ||= new Map());
      m.set(i, (m.get(i) || 0) + d);
    }
  }

  /** Un enemigo nuevo aparece aquí: recibe el daño que los aliados ya le habían hecho. */
  spawned(arena, foe) {
    const m = this.pending[this.camp?.name];
    const d = m?.get(foe.id);
    if (d) { m.delete(foe.id); setTimeout(() => foe.applyRemote(d), 0); }
  }

  // --- Aliados ---------------------------------------------------------------------------------------
  onAlly({ id, s }) {
    if (id === this.me) return;
    const a = this.allies.get(id) || { s: null, ghost: null };
    a.s = s;
    a.at = performance.now();
    this.allies.set(id, a);
  }

  dropGhost(id) {
    const a = this.allies.get(id);
    if (!a?.ghost) return;
    a.ghost.scene.remove(a.ghost.model.root);
    a.ghost.model.dispose?.();
    a.ghost = null;
  }

  makeGhost(id, scene) {
    const p = this.roster.get(id) || {};
    const cls = heroOf(p.hero);
    const model = new AvatarModel({ ...DEFAULT_AVATAR, ...(p.avatar || {}) }, { shadows: true });
    const anim = new AvatarAnimator(model);
    const { rig } = attachSaber(model, cls.color);
    model.root.add(nameTag(`${cls.icon} ${p.name || '?'}`, cls.color));
    scene.add(model.root);
    return { model, anim, rig, scene, pos: null, yaw: 0 };
  }

  sendState(dt) {
    this.sendT += dt * 1000;
    if (this.sendT < SEND_MS) return;
    this.sendT = 0;
    const A = this.camp.ch?.A;
    const H = A?.hero;
    const s = { ch: this.camp.name };
    if (H && this.camp.cur?.scene === A.scene) {
      Object.assign(s, {
        x: +H.pos.x.toFixed(2), y: +H.pos.y.toFixed(2), z: +H.pos.z.toFixed(2), yaw: +H.yaw.toFixed(2),
        a: H.dead ? 'dead' : H.speed > 6.2 ? 'run' : H.speed > 0.6 ? 'walk' : 'idle',
        hp: Math.round(H.hp), max: H.max, dead: H.dead, bl: H.rig.k > 0.5 ? 1 : 0,
      });
    }
    this.send('st', s);
  }

  update(dt) {
    const camp = this.camp;
    if (!camp || !this.active) return;
    this.sendState(dt);
    const A = camp.ch?.A;
    const H = A?.hero;
    const here = !!(H && camp.cur?.scene === A.scene);
    for (const [id, a] of this.allies) {
      const s = a.s;
      const show = here && s && s.ch === camp.name && s.x != null && performance.now() - a.at < 3000;
      if (!show) { this.dropGhost(id); continue; }
      if (a.ghost && a.ghost.scene !== A.scene) this.dropGhost(id);
      a.ghost ||= this.makeGhost(id, A.scene);
      const g = a.ghost;
      const target = new THREE.Vector3(s.x, s.y, s.z);
      if (!g.pos) g.pos = target.clone();
      g.pos.lerp(target, Math.min(1, dt * 10));
      let dy = s.yaw - g.yaw;
      dy = Math.atan2(Math.sin(dy), Math.cos(dy));
      g.yaw += dy * Math.min(1, dt * 10);
      g.model.root.position.copy(g.pos);
      g.model.root.rotation.y = g.yaw;
      g.anim.set(s.a || 'idle');
      g.anim.update(dt, s.a === 'run' ? 8 : s.a === 'walk' ? 4 : 0);
      g.rig.setLen(g.rig.k + ((s.bl ? 1 : 0) - g.rig.k) * Math.min(1, dt * 8));
    }
    if (here) this.rescue(dt, H);
    this.panelT -= dt;
    if (this.panelT <= 0) { this.panelT = 0.25; this.renderPanel(); }
  }

  /** Un aliado vivo cerca de un caído lo levanta; si caen todos, se reintenta. */
  rescue(dt, H) {
    const camp = this.camp;
    if (!H.dead) { this.reviveT = 0; return; }
    const near = [...this.allies.values()].some((a) => a.s && a.s.ch === camp.name && !a.s.dead && a.s.x != null && Math.hypot(a.s.x - H.pos.x, a.s.z - H.pos.z) < REVIVE_RANGE);
    this.reviveT = near ? this.reviveT + dt : Math.max(0, this.reviveT - dt);
    if (near) camp.hud.caption(`🤝 Tus aliados te levantan… ${Math.ceil(REVIVE_TIME - this.reviveT)}`, 400);
    if (this.reviveT >= REVIVE_TIME) {
      this.reviveT = 0;
      H.revive(H.pos, H.yaw);
      H.hp = H.max * 0.5;
      camp.hud.setHp(H.hp, H.max);
      camp.hud.title('');
      camp.hud.buttons(null);
      camp.hud.announce('¡DE VUELTA!', 'tus aliados te han levantado', '#69f0ae');
      return;
    }
    const others = [...this.allies.values()].filter((a) => a.s && a.s.ch === camp.name);
    const allDown = others.length === 0 || others.every((a) => a.s.dead);
    if (allDown && performance.now() > this.retryAt) {
      this.retryAt = performance.now() + 4000;
      setTimeout(() => { if (camp.ch?.A?.hero.dead) camp.ch.retry?.(); }, 1800);
    }
  }

  renderPanel() {
    if (!this.panel) return;
    clear(this.panel);
    for (const p of this.roster.values()) {
      if (p.id === this.me) continue;
      const cls = heroOf(p.hero);
      const a = this.allies.get(p.id);
      const s = a?.s;
      const k = s && s.hp != null ? clamp(s.hp / s.max, 0, 1) : null;
      this.panel.append(h('div.gxc-ally' + (s?.dead ? '.down' : ''),
        h('b', { style: { color: cls.color } }, `${cls.icon} ${p.name}`),
        h('div.gxc-ally-bar', h('i', { style: { width: `${(k ?? 1) * 100}%`, background: k != null && k < 0.3 ? '#ff1744' : cls.color } })),
        h('span', s?.dead ? 'CAÍDO' : s?.ch && s.ch !== this.camp.name ? '…' : '')));
    }
  }

  dispose() {
    for (const id of [...this.allies.keys()]) this.dropGhost(id);
    this.panel?.remove();
  }
}
