// Cooperativo de Guerra Galáctica (cliente): recibe del servidor la posición de los enemigos, de
// Lord Vex y de los demás jugadores, y los dibuja. Mi personaje se mueve en mi pantalla y envía su
// posición y sus golpes; el servidor decide los daños y las muertes.
import * as THREE from 'three';
import { AvatarModel } from '../../avatar/avatarModel.js';
import { AvatarAnimator } from '../../avatar/avatarAnimator.js';
import { DEFAULT_AVATAR } from '../../../../shared/avatar.js';
import { store } from '../../core/store.js';
import { sfx, glowMat, angDiff } from './kit.js';
import { Foe } from './combat.js';

const V = (x = 0, y = 0, z = 0) => new THREE.Vector3(x, y, z);
const STATE_MS = 100; // 10 veces por segundo: sobra para ver el movimiento y no satura el servidor

/** Un jugador de la sala visto por el servidor: lo dibujamos nosotros, con su avatar. */
export class RemoteHero {
  constructor(arena, id, avatar, name) {
    this.id = id;
    this.name = name;
    this.model = new AvatarModel({ ...DEFAULT_AVATAR, ...(avatar || {}) }, { shadows: true });
    this.anim = new AvatarAnimator(this.model);
    arena.scene.add(this.model.root);
    this.pos = V();
    this.target = V();
    this.yaw = 0;
    this.targetYaw = 0;
    this.dead = false;
    this.swingT = 0;
  }

  set(h, dt) {
    this.target.set(h.x, 0, h.z);
    this.targetYaw = h.yaw;
    this.pos.lerp(this.target, Math.min(1, dt * 12));
    this.yaw += angDiff(this.targetYaw, this.yaw) * Math.min(1, dt * 10);
    const moved = this.pos.distanceTo(this.target) > 0.05 || this.lastPos?.distanceTo(this.pos) > 0.02;
    this.lastPos = this.pos.clone();
    this.dead = !h.alive;
    this.anim.set(this.dead ? 'dead' : this.swingT > 0 ? 'attack' : moved ? 'run' : 'idle');
    this.anim.update(dt, moved ? 5 : 0);
    this.swingT = Math.max(0, this.swingT - dt);
    this.model.root.position.copy(this.pos);
    this.model.root.rotation.y = this.yaw;
    this.model.root.visible = true;
  }

  dispose(arena) {
    arena.scene.remove(this.model.root);
  }
}

/** Frame de red: envía mi estado y pinta lo que manda el servidor. Lo llama Arena.update en cooperativo. */
export class NetPlay {
  constructor(send) {
    this.send = send; // send(name, data)
    this.snap = null;
    this.stateAcc = 0;
    this.foes = new Map(); // id -> Foe visual
    this.gone = new Map(); // id -> segundos desde que murió
    this.heroes = new Map(); // id -> RemoteHero (los demás)
    this.bolts = new Map(); // id -> mesh
    this.me = store.user?.id;
  }

  /** Sustituye el último estado del servidor (cada 100 ms). */
  onSnap(snap) {
    this.snap = snap;
  }

  /** Acción de combate (golpe, disparo…) hacia el servidor. */
  act(name, data) {
    this.send(name, data);
  }

  /** Envía mi posición ~15 veces por segundo. */
  sendState(A, dt) {
    this.stateAcc -= dt * 1000;
    if (this.stateAcc > 0) return;
    this.stateAcc = STATE_MS;
    const h = A.hero;
    this.send('state', { p: [h.pos.x, h.pos.y, h.pos.z], yaw: h.yaw, block: !!h.blocking });
  }

  frame(A, dt) {
    this.sendState(A, dt);
    const snap = this.snap;
    if (!snap) return;
    const me = snap.heroes.find((h) => h.id === this.me);
    if (me) {
      A.hero.hp = me.hp;
      if (!me.alive && !A.hero.dead) { A.hero.dead = true; A.hero.anim?.set?.('dead'); }
      if (me.alive && A.hero.dead) { A.hero.dead = false; }
    }
    this.applyFoes(A, snap.foes, dt);
    this.applyHeroes(A, snap, dt);
    this.applyBolts(A, snap.bolts || []);
  }

  applyFoes(A, list, dt) {
    const seen = new Set();
    for (const f of list) {
      seen.add(f.id);
      let v = this.foes.get(f.id);
      if (!v) {
        v = new Foe(A, f.k, V(f.x, 0, f.z));
        v.maxHp = f.max;
        this.foes.set(f.id, v);
        A.foes.push(v);
      }
      v.pos.set(f.x, 0, f.z);
      v.leapY = f.y || 0;
      v.yaw = f.yaw;
      v.hp = f.hp;
      v.anim.set(f.a === 'attack' ? 'attack' : f.a === 'run' ? 'run' : 'idle');
      v.anim.update(dt, f.a === 'run' ? 5 : 0);
      v.syncModel?.();
    }
    // Los que ya no están en la lista han muerto: se quedan un momento tendidos y desaparecen
    for (const [id, v] of this.foes) {
      if (seen.has(id)) continue;
      if (!this.gone.has(id)) { this.gone.set(id, 0); v.dead = true; v.deathT = 0; v.anim.set('dead'); }
      const t = this.gone.get(id) + dt;
      this.gone.set(id, t);
      v.anim.update(dt, 0);
      if (t > 1.8 && v.kind !== 'vex') { // Lord Vex se queda en escena para su final
        v.model.root.parent?.remove(v.model.root);
        A.foes = A.foes.filter((x) => x !== v);
        this.foes.delete(id);
        this.gone.delete(id);
      }
    }
  }

  applyHeroes(A, snap, dt) {
    const seen = new Set();
    for (const h of snap.heroes) {
      if (h.id === this.me) continue;
      seen.add(h.id);
      let r = this.heroes.get(h.id);
      if (!r) {
        const remote = A.camp.game.remotes?.get(h.id);
        r = new RemoteHero(A, h.id, remote?.avatar, h.n);
        this.heroes.set(h.id, r);
      }
      r.set(h, dt);
      if (!h.alive) r.model.root.visible = false;
    }
    for (const [id, r] of this.heroes) {
      if (!seen.has(id)) { r.dispose(A); this.heroes.delete(id); }
    }
  }

  applyBolts(A, list) {
    const seen = new Set();
    for (const b of list) {
      seen.add(b.id);
      let m = this.bolts.get(b.id);
      if (!m) {
        m = new THREE.Mesh(new THREE.SphereGeometry(0.16, 8, 6), glowMat('#ff1744', 0.95));
        A.scene.add(m);
        this.bolts.set(b.id, m);
      }
      m.position.set(b.x, b.y, b.z);
    }
    for (const [id, m] of this.bolts) {
      if (seen.has(id)) continue;
      A.scene.remove(m);
      m.geometry.dispose();
      this.bolts.delete(id);
    }
  }

  /** Evento del servidor (golpes, muertes, oleadas…). */
  onEvent(A, ev) {
    const foe = (id) => this.foes.get(id);
    switch (ev.t) {
      case 'hit': {
        const f = foe(ev.id);
        if (f) A.fx.spark(f.pos.clone().add(V(0, 1.3, 0)), '#ffcc80', 10, 8);
        sfx.hit();
        break;
      }
      case 'death': {
        A.fx.burst(V(ev.x, ev.y, ev.z), 0.8, '#ffab40');
        sfx.boom(0.2, 0.4);
        break;
      }
      case 'deflect':
        A.fx.spark(V(ev.x, ev.y, ev.z), '#ffffff', 16, 9);
        sfx.deflect();
        break;
      case 'clash':
        A.fx.spark(V(ev.x, ev.y, ev.z), '#fff59d', 26, 8);
        sfx.clash();
        A.camp.shake(0.25);
        break;
      case 'shot': {
        if (ev.from === this.me) break;
        sfx.blaster(0.15);
        A.fx.flash(V(ev.o[0], ev.o[1], ev.o[2]), '#ff1744', 2);
        break;
      }
      case 'foeShot':
        sfx.foeShot(0.08);
        A.fx.flash(V(ev.o[0], ev.o[1], ev.o[2]), '#ff5252', 2);
        break;
      case 'boltHit':
        A.fx.spark(V(ev.x, ev.y, ev.z), '#ff5252', 8, 6);
        break;
      case 'hurt':
        if (ev.id === this.me) { A.camp.hud.hurt(); sfx.hurt(); A.camp.shake(0.35); }
        break;
      case 'heroDown':
        if (ev.id === this.me) { sfx.death?.(); A.camp.hud.title('💫 ¡TE HAN DERRIBADO!', 'Tus compañeros pueden levantarte… o no', 3000, '#ff5252'); }
        break;
      case 'overheat':
        if (ev.id === this.me) A.camp.hud.caption('🔥 ¡Sable sobrecalentado! Esquiva con [Espacio]', 2200);
        break;
      case 'wave':
        A.camp.hud.title(`OLEADA ${ev.wave}`, '', 2600, '#ffe81f');
        sfx.alarm();
        break;
      case 'waveDone':
        A.camp.hud.caption('Oleada superada. Recupera el aliento.', 2600);
        break;
      case 'caption':
        A.camp.hud.caption(ev.text, 3000);
        break;
      case 'marker': {
        A.addMarker(V(ev.x, 0, ev.z), ev.r);
        break;
      }
      case 'leapImpact':
        A.fx.burst(V(ev.x, ev.y, ev.z), 1.2, '#ff7043');
        A.fx.ring(V(ev.x, 0.2, ev.z), V(0, 1, 0), '#ff7043', 1.5, 0.6, 6);
        sfx.boom(0.4, 0.8);
        A.camp.shake(0.7);
        break;
      case 'vexPush':
        A.fx.ring(V(ev.x, 1, ev.z), V(0, 1, 0), '#ff5252', 1.2, 0.7, 9);
        sfx.push();
        A.camp.shake(0.5);
        break;
      default:
        break;
    }
  }

  dispose(A) {
    for (const r of this.heroes.values()) r.dispose(A);
    this.heroes.clear();
    this.foes.clear();
    this.gone.clear();
    for (const m of this.bolts.values()) { A.scene.remove(m); m.geometry.dispose(); }
    this.bolts.clear();
  }
}

