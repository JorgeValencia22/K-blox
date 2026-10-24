// Combate a pie de la campaña: el héroe (sable con combos, bloqueo que desvía disparos con un máximo
// de 6 antes de sobrecalentarse, bláster con cámara al hombro), los enemigos (droides, soldados
// imperiales y Lord Vex) y los disparos. Todo ocurre en el cliente, dentro de una escena propia.
import * as THREE from 'three';
import { AvatarModel } from '../../avatar/avatarModel.js';
import { AvatarAnimator } from '../../avatar/avatarAnimator.js';
import { DEFAULT_AVATAR } from '../../../../shared/avatar.js';
import { store } from '../../core/store.js';
import { input } from '../../engine/input.js';
import { sfx, makeSaberRig, makeBlaster, Trail, glowMat, glowSprite, clamp, lerp, ease, angDiff, rand } from './kit.js';

const V = (x = 0, y = 0, z = 0) => new THREE.Vector3(x, y, z);
const UP = V(0, 1, 0);
export const HEAT_MAX = 6;
const OVERHEAT_MS = 4800;

/** Rayo contra cilindro vertical (centro en el suelo): devuelve t o null. */
function rayCyl(o, d, cx, cz, r, y0, y1) {
  const ox = o.x - cx, oz = o.z - cz;
  const a = d.x * d.x + d.z * d.z;
  if (a < 1e-8) return null;
  const b = 2 * (ox * d.x + oz * d.z), c = ox * ox + oz * oz - r * r;
  const disc = b * b - 4 * a * c;
  if (disc < 0) return null;
  const sq = Math.sqrt(disc);
  for (const t of [(-b - sq) / (2 * a), (-b + sq) / (2 * a)]) {
    if (t < 0) continue;
    const y = o.y + d.y * t;
    if (y >= y0 && y <= y1) return t;
  }
  return null;
}
function raySphere(o, d, c, r) {
  const oc = o.clone().sub(c);
  const b = oc.dot(d), cc = oc.dot(oc) - r * r, disc = b * b - cc;
  if (disc < 0) return null;
  const t = -b - Math.sqrt(disc);
  return t >= 0 ? t : null;
}

/** Colocar sable en la mano de un modelo (para héroe y enemigos). */
function attachSaber(model, color, L = 1.3) {
  const hand = new THREE.Group();
  hand.position.set(0, -0.72, 0.08);
  model.rArm.add(hand);
  const rig = makeSaberRig(color, L);
  rig.root.rotation.x = 1.2;
  hand.add(rig.root);
  return { hand, rig };
}

// =========================================================================================== Héroe =====
export class Hero {
  constructor(arena, pos, yaw = 0) {
    this.arena = arena;
    const av = JSON.parse(JSON.stringify(store.user?.avatar || DEFAULT_AVATAR));
    this.model = new AvatarModel({ ...DEFAULT_AVATAR, ...av }, { shadows: true });
    this.anim = new AvatarAnimator(this.model);
    arena.scene.add(this.model.root);
    const { hand, rig } = attachSaber(this.model, '#29b6f6');
    this.hand = hand;
    this.rig = rig;
    this.gun = makeBlaster();
    this.gun.position.set(0, -0.06, 0.05);
    this.gun.rotation.x = Math.PI / 2;
    this.gun.visible = false;
    hand.add(this.gun);
    this.trail = new Trail(arena.scene, '#29b6f6');
    this.disc = new THREE.Mesh(new THREE.CircleGeometry(1.5, 28), glowMat('#80d8ff', 0));
    this.disc.position.set(0, 1.25, 0.75);
    this.model.root.add(this.disc);
    this.pos = pos.clone();
    this.vel = V();
    this.yaw = yaw;
    this.max = 150;
    this.hp = this.max;
    this.weapon = 'saber';
    this.want = 'saber';
    this.bladeGoal = 0;
    this.swing = null;
    this.combo = 0;
    this.comboAt = 0;
    this.queued = false;
    this.blocking = false;
    this.heat = 0;
    this.overUntil = 0;
    this.lastDeflect = 0;
    this.dash = 0;
    this.dashCd = 0;
    this.dashDir = V();
    this.invuln = 0;
    this.aimK = 0;
    this.nextShot = 0;
    this.dead = false;
    this.speed = 0;
    this.spin = 0;
    this.swapT = 0;
    this.lastHit = 0;
    this.knock = V();
  }

  get over() { return performance.now() < this.overUntil; }
  canBlock() { return this.weapon === 'saber' && this.rig.k > 0.7 && !this.over && !this.dead; }
  forward() { return V(Math.sin(this.yaw), 0, Math.cos(this.yaw)); }
  chest() { return this.pos.clone().add(V(0, 1.15, 0)); }

  /** Enciende la hoja con su animación (crece desde la empuñadura). */
  ignite() { this.bladeGoal = 1; sfx.ignite(); }
  extinguish() { this.bladeGoal = 0; sfx.retract(); }

  setWeapon(w) {
    if (w === this.want || this.dead) return;
    this.want = w;
    this.swing = null;
    if (w === 'blaster') this.extinguish();
    sfx.beep(w === 'saber' ? 660 : 520);
  }

  hurt(dmg, from) {
    if (this.dead || this.invuln > 0) return false;
    this.hp -= dmg;
    this.lastHit = performance.now();
    sfx.hurt();
    this.arena.camp.hud.hurt();
    this.arena.camp.shake(0.35);
    if (from) this.knock.copy(this.pos).sub(from).setY(0).normalize().multiplyScalar(2.2);
    if (this.hp <= 0) { this.hp = 0; this.die(); }
    this.arena.camp.hud.setHp(this.hp, this.max);
    return true;
  }

  revive(pos, yaw) {
    this.dead = false;
    this.hp = this.max;
    this.pos.copy(pos);
    this.yaw = yaw ?? this.yaw;
    this.vel.set(0, 0, 0);
    this.heat = 0;
    this.overUntil = 0;
    this.swing = null;
    this.invuln = 1.2;
    this.rig.tint(this.rig.color);
    this.anim.set('idle');
    if (this.want === 'saber') { this.weapon = 'saber'; this.rig.root.visible = true; this.gun.visible = false; }
    this.bladeGoal = this.want === 'saber' ? 1 : 0;
    this.arena.camp.hud.setHp(this.hp, this.max);
  }

  die() {
    this.dead = true;
    this.blocking = false;
    this.anim.set('dead');
    this.rig.setLen(0);
    this.arena.onHeroDead?.();
  }

  /** Un disparo enemigo llega a la zona de la hoja: lo desvía (con límite de 6 antes de sobrecalentarse). */
  deflect(bolt) {
    const A = this.arena;
    this.heat++;
    this.lastDeflect = performance.now();
    this.spin = 1;
    // El disparo vuelve hacia quien lo disparó (o el enemigo más cercano)
    let target = bolt.src && !bolt.src.dead ? bolt.src : A.nearestFoe(this.pos, 60);
    const to = target ? target.pos.clone().add(V(0, 1.1, 0)) : bolt.pos.clone().add(this.forward().multiplyScalar(30));
    bolt.vel.copy(to.sub(bolt.pos).normalize().multiplyScalar(70));
    bolt.owner = 'hero';
    bolt.reflected = true;
    bolt.dmg = 38;
    bolt.src = null;
    bolt.life = 2.5;
    bolt.recolor('#80d8ff');
    sfx.deflect();
    A.fx.spark(bolt.pos, '#ffffff', 16, 9);
    A.fx.ring(bolt.pos, this.forward(), '#80d8ff', 0.5, 0.35, 5);
    A.camp.shake(0.12);
    if (this.heat >= HEAT_MAX) {
      this.overUntil = performance.now() + OVERHEAT_MS;
      this.heat = 0;
      this.blocking = false;
      this.rig.tint('#ff3d00');
      sfx.clash();
      A.fx.burst(this.rig.top.getWorldPosition(V()), 0.6, '#ff6d00');
      A.camp.hud.caption('🔥 ¡Sable sobrecalentado! Esquiva con [Espacio]', 2200);
    }
  }

  update(dt, ctl) {
    const A = this.arena;
    const now = performance.now();
    const cam = A.camp.game.cam;
    this.invuln = Math.max(0, this.invuln - dt);
    this.dashCd = Math.max(0, this.dashCd - dt);
    this.spin = Math.max(0, this.spin - dt * 2.4);
    if (this.over === false && this.overUntil && now >= this.overUntil) { this.overUntil = 0; this.rig.tint(this.rig.color); sfx.beep(990); }
    // Enfriamiento poco a poco si no se desvían disparos
    // Recuperación lenta de vida si llevas un rato sin recibir golpes
    if (!this.dead && this.hp < this.max * 0.6 && now - this.lastHit > 4500) { this.hp = Math.min(this.max * 0.6, this.hp + 6 * dt); }
    if (this.heat > 0 && !this.over && now - this.lastDeflect > 2600) { this.heat = Math.max(0, this.heat - dt * 0.9); }

    // Cambio de arma: la hoja se apaga y luego se saca el bláster (y al revés)
    if (this.want !== this.weapon) {
      this.swapT += dt;
      if (this.want === 'blaster' && this.rig.k <= 0.02) { this.weapon = 'blaster'; this.rig.root.visible = false; this.gun.visible = true; this.swapT = 0; }
      if (this.want === 'saber') { this.weapon = 'saber'; this.gun.visible = false; this.rig.root.visible = true; this.bladeGoal = 1; sfx.ignite(); this.swapT = 0; }
    }
    this.rig.setLen(lerp(this.rig.k, this.bladeGoal, Math.min(1, dt * (this.bladeGoal > this.rig.k ? 7 : 11))));

    if (this.dead) { this.syncModel(dt, 0); return; }

    // --- movimiento ---
    const yawC = cam.yaw;
    const fwd = V(-Math.sin(yawC), 0, -Math.cos(yawC)), right = V(Math.cos(yawC), 0, -Math.sin(yawC));
    const want = right.multiplyScalar(ctl.mv.x).add(fwd.multiplyScalar(ctl.mv.y));
    this.blocking = ctl.canAct && ctl.rmb && this.canBlock() && this.dash <= 0;
    const aiming = this.weapon === 'blaster' && this.want === 'blaster';
    let sp = ctl.run ? 8.4 : 5.6;
    if (this.blocking) sp *= 0.5;
    if (this.swing) sp *= 0.35;
    if (aiming) sp *= 0.85;
    // Esquiva
    if (ctl.canAct && ctl.dodge && this.dashCd <= 0 && !this.swing) {
      this.dash = 0.24;
      this.dashCd = 1.1;
      this.invuln = 0.3;
      this.dashDir.copy(want.lengthSq() > 0.01 ? want.clone().normalize() : this.forward().negate());
      sfx.whoosh();
      A.fx.spark(this.pos.clone().add(V(0, 0.4, 0)), '#80d8ff', 8, 4);
    }
    const target = want.multiplyScalar(sp);
    this.vel.lerp(target, Math.min(1, dt * 12));
    let step = this.vel.clone().multiplyScalar(dt);
    if (this.dash > 0) { this.dash -= dt; step = this.dashDir.clone().multiplyScalar(18 * dt); }
    if (this.knock.lengthSq() > 0.01) { step.add(this.knock.clone().multiplyScalar(dt * 4)); this.knock.multiplyScalar(Math.max(0, 1 - dt * 5)); }
    if (this.swing && this.swing.lunge) step.add(this.forward().multiplyScalar(this.swing.lunge * dt / this.swing.dur));
    this.pos.add(step);
    A.collide(this.pos);
    this.speed = step.length() / Math.max(dt, 1e-4);

    // --- arma ---
    if (ctl.canAct) {
      if (ctl.k1) this.setWeapon('saber');
      if (ctl.k2) this.setWeapon('blaster');
      if (ctl.swap) this.setWeapon(this.want === 'saber' ? 'blaster' : 'saber');
    }
    if (this.weapon === 'saber' && this.want === 'saber') {
      if (ctl.canAct && ctl.lmbP && !this.blocking && !this.over) {
        if (!this.swing) this.startSwing(now);
        else if (this.swing.u > 0.45) this.queued = true;
      }
      this.updateSwing(dt, now);
    } else if (aiming && ctl.canAct && ctl.lmb && now >= this.nextShot) {
      this.nextShot = now + 210;
      this.fire();
    }

    // --- orientación ---
    let face = this.yaw;
    const camFace = Math.atan2(fwd.x, fwd.z);
    if (aiming || this.blocking || this.swing || ctl.lmb) face = camFace;
    else if (step.lengthSq() > 1e-5) face = Math.atan2(step.x, step.z);
    if (this.swing && this.swing.face != null) face = this.swing.face;
    this.yaw += angDiff(face, this.yaw) * Math.min(1, dt * (aiming ? 16 : 11));
    this.aimK += ((aiming ? 1 : 0) - this.aimK) * Math.min(1, dt * 7);
    this.syncModel(dt, this.speed, ctl);
  }

  startSwing(now) {
    const A = this.arena;
    this.combo = now - this.comboAt < 800 ? (this.combo + 1) % 3 : 0;
    const kinds = [{ dur: 0.34, dmg: 22, lunge: 1.1 }, { dur: 0.34, dmg: 22, lunge: 1.1 }, { dur: 0.5, dmg: 34, lunge: 2.2 }];
    const k = kinds[this.combo];
    // Ayuda a apuntar: se gira hacia el enemigo más cercano delante
    const t = A.nearestFoe(this.pos, 6.5, this.forward(), 0.1);
    this.swing = { kind: this.combo, ...k, t: 0, u: 0, hit: new Set(), face: t ? Math.atan2(t.pos.x - this.pos.x, t.pos.z - this.pos.z) : null, played: false };
    this.queued = false;
    sfx.swing();
  }

  updateSwing(dt, now) {
    const s = this.swing;
    if (!s) return;
    s.t += dt;
    s.u = s.t / s.dur;
    // Ventana de golpe
    if (s.u > 0.22 && s.u < 0.72) {
      const A = this.arena;
      const f = this.forward();
      for (const foe of A.foes) {
        if (foe.dead || s.hit.has(foe)) continue;
        const d = foe.pos.clone().sub(this.pos).setY(0);
        const dist = d.length();
        if (dist > 3.5 + foe.radius || (dist > 0.6 && d.normalize().dot(f) < 0.15)) continue;
        s.hit.add(foe);
        foe.hit(s.dmg, this.pos, 'saber');
      }
    }
    if (s.u >= 1) {
      this.comboAt = now;
      this.swing = null;
      if (this.queued) { this.queued = false; this.startSwing(now); }
    }
  }

  fire() {
    const A = this.arena;
    const cam = A.camp.cam;
    const o = cam.position.clone();
    const d = cam.getWorldDirection(V());
    const hit = A.rayWorld(o, d, 90);
    const aim = o.clone().addScaledVector(d, hit.t);
    this.model.root.updateMatrixWorld(true);
    const m = this.gun.userData.muzzle.getWorldPosition(V());
    A.spawnBolt({ pos: m, vel: aim.clone().sub(m).normalize().multiplyScalar(170), owner: 'hero', cosmetic: true, color: '#40c4ff', life: aim.distanceTo(m) / 170 });
    sfx.blaster(0.18);
    this.arena.fx.flash(m, '#40c4ff', 3);
    this.recoil = 1;
    if (hit.foe) { hit.foe.hit(hit.foe.kind === 'vex' ? 3 : 12, this.pos, 'blaster'); A.fx.spark(aim, '#fff59d', 6, 6); }
    else if (hit.target) hit.target.onHit(aim, 3.2);
    else if (hit.t < 89) A.fx.spark(aim, '#ffd180', 6, 5);
    A.camp.hud.crossHit?.();
  }

  /** Coloca el modelo y las poses (encima de la animación normal). */
  syncModel(dt, speed, ctl) {
    const m = this.model;
    m.root.position.copy(this.pos);
    m.root.rotation.y = this.yaw;
    this.anim.set(this.dead ? 'dead' : this.forcedAnim || (speed > 6.2 ? 'run' : speed > 0.6 ? 'walk' : 'idle'));
    this.anim.update(dt, speed);
    if (this.dead) return;
    const t = performance.now() / 1000;
    const aiming = this.weapon === 'blaster' && this.want === 'blaster';
    const camPitch = this.arena.camp.game.cam.pitch;
    const R = m.rArm.rotation, Lr = m.lArm.rotation, B = m.body.rotation;
    this.hand.rotation.set(0, 0, 0);
    this.rig.root.rotation.set(1.2, 0, 0);
    this.disc.material.opacity *= 0.8;
    if (this.forced === 'relaxed') return;
    if (this.forced === 'force') { R.set(-1.75, 0.1, 0.1); Lr.set(-0.4, 0, 0.3); B.set(-0.1, 0, 0); return; }
    if (this.forced === 'throw') { R.set(-2.2, 0, 0.1); Lr.set(-0.3, 0, 0.3); B.set(0.3, -0.2, 0); return; }
    if (this.swing) {
      const s = this.swing, e = ease(clamp(s.u, 0, 1)), w = clamp((s.u - 0.15) / 0.6, 0, 1), ew = ease(w);
      if (s.kind === 0) { R.set(lerp(-2.9, -0.8, ew), 0, lerp(0.8, -0.6, ew)); B.set(0.1 + ew * 0.2, lerp(-1.0, 0.9, ew), 0); this.rig.root.rotation.set(1.2, 0, lerp(-0.6, 0.9, ew)); }
      else if (s.kind === 1) { R.set(-1.5, 0, lerp(-0.9, 0.9, ew)); B.set(0.05, lerp(1.0, -1.1, ew), lerp(-0.2, 0.2, ew)); this.rig.root.rotation.set(1.2, 0, lerp(0.7, -0.7, ew)); }
      else { const ek = ew * ew; R.set(lerp(-3.2, -0.5, ek), 0, 0.1); B.set(lerp(-0.25, 0.55, ek), 0, 0); this.rig.root.rotation.set(1.2, 0, 0); }
      Lr.set(-0.9, 0, 0.55);
      if (s.u > 0.12 && s.u < 0.9) this.pushTrail();
    } else if (this.blocking) {
      // Postura de desvío: sable girando delante del cuerpo (como un molinete)
      R.set(-1.35, 0, 0.1);
      Lr.set(-0.8, 0, -0.5);
      B.set(0.12, Math.sin(t * 5) * 0.12, 0);
      this.hand.rotation.y = t * 26;
      this.rig.root.rotation.set(1.52, 0, 0);
      this.disc.material.opacity = 0.18 + this.spin * 0.35;
      this.pushTrail();
    } else if (aiming) {
      // A un lado, apuntando con el bláster: el brazo sigue la dirección de la mira
      const rec = (this.recoil = Math.max(0, (this.recoil || 0) - dt * 9));
      R.set(-1.57 + camPitch * 0.9 + rec * 0.12, 0.12, 0.02);
      Lr.set(-1.35 + camPitch * 0.8, -0.2, 0.55);
      B.set(0.04, 0.14, 0);
      m.neck.rotation.set(-camPitch * 0.4, -0.12, 0);
    } else if (this.weapon === 'saber') {
      // Guardia con el sable
      const bob = Math.sin(t * 2.2) * 0.05;
      R.set(-1.05 + bob, 0, -0.22);
      Lr.set(-0.35, 0, 0.3);
      B.y += 0.12;
    }
    if (this.over) this.rig.tint(Math.sin(t * 28) > 0 ? '#ff3d00' : '#7a1d00');
    if (this.rig.k > 0.3) this.rig.halo2M.opacity = (this.swing ? 0.4 : 0.22) + (this.blocking ? 0.12 : 0) + Math.sin(t * 40) * 0.015;
    // Hilo: zumbido suave mientras la hoja está encendida
    if (this.rig.k > 0.9 && Math.random() < dt * 1.2) sfx.hum();
  }

  pushTrail() {
    this.model.root.updateMatrixWorld(true);
    const a = this.rig.base.getWorldPosition(V()), b = this.rig.top.getWorldPosition(V());
    this.trail.push(a, b);
  }

  dispose() { this.trail.dispose(); this.arena.scene.remove(this.model.root); }
}

// ========================================================================================= Enemigos =====
// Dificultad: el doble de vida para los enemigos y el doble de daño que reciben los héroes
export const DIFF = 2;

const KINDS = {
  droid: { name: 'Droide', hp: 45, speed: 4.3, costume: 'skin_droid', ai: 'gun', rate: [1.8, 2.8], dmg: 6, acc: 0.45, range: [10, 17], radius: 0.6 },
  staff: { name: 'Droide de vara', hp: 60, speed: 6.4, costume: 'skin_droid', ai: 'melee', dmg: 12, reach: 2.4, windup: 0.5, saber: '#ffab00', len: 0.9, radius: 0.6 },
  trooper: { name: 'Soldado imperial', hp: 35, speed: 4.8, costume: 'skin_trooper', ai: 'burst', rate: [2.8, 4.0], dmg: 7, acc: 0.5, range: [13, 21], radius: 0.6 },
  vex: { name: 'Lord Vex', hp: 360, speed: 5.6, costume: 'skin_darklord', ai: 'vex', dmg: 15, reach: 2.9, saber: '#ff1744', len: 1.5, scale: 1.22, radius: 0.9 },
};

export class Foe {
  constructor(arena, kind, pos) {
    const K = KINDS[kind];
    this.arena = arena;
    this.kind = kind;
    this.K = K;
    this.name = K.name;
    this.radius = (K.radius || 0.6) * (K.scale || 1);
    this.model = new AvatarModel({ ...DEFAULT_AVATAR, costume: K.costume }, { shadows: true });
    this.model.root.scale.setScalar(K.scale || 1);
    this.anim = new AvatarAnimator(this.model);
    arena.scene.add(this.model.root);
    this.pos = pos.clone();
    this.yaw = 0;
    this.max = this.hp = K.hp * DIFF * (arena.hpScale || 1);
    this.dead = false;
    this.t = rand(0, 4);
    this.stun = 0;
    this.cool = rand(0.8, 2.2);
    this.strafe = Math.random() < 0.5 ? 1 : -1;
    this.strafeT = rand(1, 3);
    this.burst = 0;
    this.atk = null;
    this.flash = 0;
    this.deathT = 0;
    this.speed = 0;
    this.fade = 1;
    this.frozen = false;
    this.forcedSpeed = 0;
    this.bladeGoal = kind === 'vex' ? 0 : 1;
    if (K.saber) {
      const s = attachSaber(this.model, K.saber, K.len || 1.2);
      this.rig = s.rig;
      this.hand = s.hand;
      this.rig.setLen(kind === 'vex' ? 0 : 1);
      this.trail = new Trail(arena.scene, K.saber);
    } else {
      // Pistola en la mano
      const gun = makeBlaster();
      gun.scale.setScalar(1.1);
      gun.position.set(0, -0.72, 0.1);
      gun.rotation.x = Math.PI / 2;
      this.model.rArm.add(gun);
      this.gun = gun;
    }
    // Vex: estado de combate
    if (kind === 'vex') Object.assign(this, { mode: 'idle', modeT: 1, comboN: 0, pushCd: 6, leapCd: 10, dashCd: 3, guard: 0, recent: [], marker: null });
  }

  dist() { return this.arena.hero.pos.distanceTo(this.pos); }

  hit(dmg, from, how) {
    if (this.dead) return;
    const A = this.arena;
    if (this.kind === 'vex') {
      const guarding = this.guard > 0 || this.mode === 'push' || this.mode === 'leapUp';
      if (guarding || (how === 'blaster' && Math.random() < 0.55)) {
        sfx.clash();
        A.fx.spark(this.pos.clone().add(V(0, 1.4, 0)), '#ffffff', 12, 8);
        A.camp.shake(0.15);
        if (how === 'blaster') A.fx.ring(this.pos.clone().add(V(0, 1.3, 0)), V(0, 0, 1), '#ff8a80', 0.4, 0.3, 4);
        return;
      }
      const now = performance.now();
      this.recent = this.recent.filter((t) => now - t < 1700);
      this.recent.push(now);
      if (this.recent.length >= 3 && how === 'saber') { this.guard = 1.3; this.recent = []; }
      if (this.mode === 'recover') dmg *= 1.4;
    }
    this.hp -= dmg;
    this.flash = 0.12;
    sfx.hit();
    A.fx.spark(this.pos.clone().add(V(0, 1.3, 0)), how === 'saber' ? '#ffcc80' : '#fff59d', 12, 8);
    if (how === 'saber') A.camp.shake(0.18);
    if (this.kind !== 'vex') { this.stun = 0.28; this.atk = null; if (from) this.pos.addScaledVector(this.pos.clone().sub(from).setY(0).normalize(), 0.5); }
    A.onFoeHit?.(this);
    if (this.hp <= 0) this.die();
  }

  die() {
    if (this.dead) return;
    this.dead = true;
    this.hp = 0;
    const A = this.arena;
    A.kills++;
    if (this.kind === 'vex') { this.anim.set('sad'); this.bladeGoal = 0; this.rig?.setLen(0); A.onBossDead?.(this); return; }
    this.anim.set('dead');
    if (this.kind === 'droid' || this.kind === 'staff') { A.fx.burst(this.pos.clone().add(V(0, 1, 0)), 0.8, '#ffab40'); sfx.boom(0.2, 0.4); }
    this.rig?.setLen(0);
    A.onFoeDead?.(this);
  }

  shoot(spread = 1) {
    const A = this.arena, H = A.hero;
    const o = this.pos.clone().add(V(0, 1.45, 0));
    const lead = H.pos.clone().add(V(0, 1.1, 0)).addScaledVector(H.vel, 0.25);
    const err = (1 - this.K.acc) * 2.4 * spread * clamp(this.dist() / 15, 0.4, 2);
    lead.add(V(rand(-err, err), rand(-err * 0.5, err * 0.5), rand(-err, err)));
    A.spawnBolt({ pos: o, vel: lead.sub(o).normalize().multiplyScalar(34), owner: 'foe', dmg: this.K.dmg * DIFF, color: '#ff1744', src: this, life: 3.5 });
    sfx.foeShot(clamp(0.12 - this.dist() * 0.002, 0.02, 0.12));
    A.fx.flash(o, '#ff5252', 2);
    this.recoil = 1;
  }

  /** Golpe cuerpo a cuerpo: bloqueado si el héroe tiene el sable levantado delante. */
  strike(dmg, reach) {
    const A = this.arena, H = A.hero;
    const d = H.pos.clone().sub(this.pos).setY(0);
    if (d.length() > reach || H.dead) return;
    const front = d.clone().normalize().dot(V(Math.sin(this.yaw), 0, Math.cos(this.yaw))) > 0.1;
    if (!front) return;
    if (H.blocking && H.canBlock() && H.forward().dot(d.clone().normalize()) < 0.2) {
      sfx.clash();
      A.fx.spark(H.pos.clone().add(V(0, 1.4, 0)).addScaledVector(d.normalize(), -0.6), '#ffffff', 18, 9);
      A.fx.ring(H.pos.clone().add(V(0, 1.3, 0)), d, '#ffd180', 0.5, 0.35, 5);
      A.camp.shake(0.3);
      H.spin = 1;
      return;
    }
    H.hurt(dmg, this.pos);
  }

  update(dt, now) {
    const A = this.arena, H = A.hero;
    if (this.rig && !this.dead) this.rig.setLen(lerp(this.rig.k, this.bladeGoal, Math.min(1, dt * 6)));
    if (this.frozen && !this.dead) {
      this.anim.set(this.forcedSpeed > 4 ? 'run' : this.forcedSpeed > 0.3 ? 'walk' : 'idle');
      this.anim.update(dt, this.forcedSpeed);
      this.syncModel();
      if (this.rig) { this.hand.rotation.y = 0; this.rig.root.rotation.x = 1.2; this.model.rArm.rotation.set(-1.1, 0, -0.2); }
      return;
    }
    if (this.dead) {
      this.deathT += dt;
      this.anim.update(dt, 0);
      this.syncModel();
      if (this.kind !== 'vex' && this.deathT > 1.1) { this.fade = Math.max(0, 1 - (this.deathT - 1.1) / 0.6); this.model.root.scale.setScalar((this.K.scale || 1) * this.fade); }
      return;
    }
    this.t += dt;
    this.flash = Math.max(0, this.flash - dt);
    if (this.stun > 0) { this.stun -= dt; this.anim.set('idle'); this.anim.update(dt, 0); this.syncModel(); return; }
    const to = H.pos.clone().sub(this.pos).setY(0);
    const dist = to.length();
    const dir = dist > 0.01 ? to.clone().divideScalar(dist) : V(0, 0, 1);
    const targetYaw = Math.atan2(dir.x, dir.z);
    if (!H.dead) this.yaw += angDiff(targetYaw, this.yaw) * Math.min(1, dt * (this.kind === 'vex' ? 9 : 6));
    let move = V();
    const K = this.K;
    this.cool -= dt;
    if (H.dead) { /* sin objetivo */ } else if (K.ai === 'gun' || K.ai === 'burst') {
      this.strafeT -= dt;
      if (this.strafeT <= 0) { this.strafe = -this.strafe; this.strafeT = rand(1.2, 3); }
      if (dist > K.range[1]) move.add(dir);
      else if (dist < K.range[0]) move.addScaledVector(dir, -0.8);
      move.add(V(-dir.z, 0, dir.x).multiplyScalar(this.strafe * 0.55));
      if (K.ai === 'burst') {
        if (this.burst > 0) {
          if (this.cool <= 0) { this.shoot(0.8); this.burst--; this.cool = this.burst > 0 ? 0.16 : rand(K.rate[0], K.rate[1]); }
        } else if (this.cool <= 0 && dist < 50 && A.enemiesFire) { this.burst = 3; this.cool = 0.05; }
      } else if (this.cool <= 0 && dist < 50 && A.enemiesFire) { this.shoot(); this.cool = rand(K.rate[0], K.rate[1]); }
    } else if (K.ai === 'melee') {
      if (this.atk) {
        this.atk.t += dt;
        if (!this.atk.done && this.atk.t >= K.windup) { this.atk.done = true; sfx.swing(); this.strike(K.dmg * DIFF, K.reach + 0.5); }
        if (this.atk.t >= K.windup + 0.55) this.atk = null;
      } else {
        if (dist > K.reach) move.add(dir);
        else if (this.cool <= 0 && A.enemiesFire) { this.atk = { t: 0, done: false, side: Math.random() < 0.5 ? 1 : -1 }; this.cool = rand(1, 1.8); sfx.beep(300); }
      }
    } else if (K.ai === 'vex') move = this.vexAI(dt, dir, dist, now);
    let sp = K.speed;
    if (this.kind === 'vex' && this.mode === 'dash') sp = 20;
    if (this.kind === 'vex' && this.mode === 'leapUp') sp = 0;
    if (move.lengthSq() > 0.001) { move.normalize().multiplyScalar(sp); this.pos.addScaledVector(move, dt); }
    this.speed = move.length();
    A.collide(this.pos, this.radius);
    // Evita traspasar al héroe
    const sep = this.pos.clone().sub(H.pos).setY(0);
    const minD = this.radius + 0.55;
    if (sep.length() < minD && !(this.kind === 'vex' && this.mode === 'leap')) { sep.setLength(minD); this.pos.x = H.pos.x + sep.x; this.pos.z = H.pos.z + sep.z; }
    this.anim.set(this.speed > 5.2 ? 'run' : this.speed > 0.4 ? 'walk' : 'idle');
    this.anim.update(dt, this.speed);
    this.syncModel();
    this.pose(dt);
  }

  syncModel() {
    const m = this.model.root;
    m.position.copy(this.pos);
    if (this.mode === 'leapUp' || this.mode === 'leap') m.position.y += this.leapY || 0;
    m.rotation.y = this.yaw;
  }

  pose(dt) {
    const m = this.model, R = m.rArm.rotation, B = m.body.rotation, L = m.lArm.rotation;
    if (this.K.ai === 'melee' || this.kind === 'vex') {
      const a = this.atk;
      if (a) {
        const w = a.w ?? this.K.windup ?? 0.5;
        const wu = clamp(a.t / w, 0, 1), st = clamp((a.t - w) / 0.22, 0, 1);
        if (a.t < w) { R.set(lerp(-1, -3.0, ease(wu)), 0, 0.5); B.set(lerp(0, -0.3, ease(wu)), lerp(0, a.side * 0.5, wu), 0); if (this.rig) this.rig.halo2M.opacity = 0.22 + wu * 0.5; }
        else { R.set(lerp(-3.0, -0.6, ease(st)), 0, lerp(0.5, -0.5, st)); B.set(lerp(-0.3, 0.35, ease(st)), lerp(a.side * 0.5, -a.side * 0.8, ease(st)), 0); if (this.rig) this.rig.halo2M.opacity = 0.5; this.pushTrail(); }
      } else {
        R.set(-1.1, 0, -0.2);
        L.set(-0.4, 0, 0.3);
        if (this.rig) this.rig.halo2M.opacity = this.guard > 0 ? 0.55 : 0.22;
        if (this.guard > 0) { R.set(-1.4, 0, 0.1); this.hand.rotation.y = this.t * 20; this.rig.root.rotation.x = 1.5; } else { this.hand.rotation.y = 0; this.rig.root.rotation.x = 1.2; }
      }
    } else if (this.gun) {
      const rec = (this.recoil = Math.max(0, (this.recoil || 0) - dt * 8));
      R.set(-1.5 + rec * 0.15, 0.1, 0);
      L.set(-1.2, -0.2, 0.5);
    }
  }

  pushTrail() {
    if (!this.trail || !this.rig) return;
    this.model.root.updateMatrixWorld(true);
    this.trail.push(this.rig.base.getWorldPosition(V()), this.rig.top.getWorldPosition(V()));
  }

  // --- Lord Vex ---------------------------------------------------------------------------------------
  vexAI(dt, dir, dist, now) {
    const A = this.arena, H = A.hero;
    const move = V();
    this.guard = Math.max(0, this.guard - dt);
    this.modeT -= dt;
    this.pushCd -= dt;
    this.leapCd -= dt;
    this.dashCd -= dt;
    const enraged = this.hp < this.max * 0.5;
    switch (this.mode) {
      case 'idle':
        if (dist > 3.2) move.add(dir);
        if (this.modeT <= 0) {
          if (this.pushCd <= 0 && dist < 9) this.setMode('push', 0.9);
          else if (enraged && this.leapCd <= 0 && dist > 5) this.setMode('leapUp', 0.55);
          else if (dist > 9 && this.dashCd <= 0) this.setMode('dash', 0.35);
          else if (dist < 3.6) { this.comboN = 3; this.startStrike(); }
          else this.modeT = 0.2;
        }
        break;
      case 'dash':
        move.add(dir);
        if (this.modeT <= 0 || dist < 3) { this.dashCd = 5; this.mode = 'idle'; this.modeT = 0.1; }
        break;
      case 'combo':
        if (this.atk) {
          this.atk.t += dt;
          if (this.atk.t < this.atk.w && dist > 2.6) move.addScaledVector(dir, 0.6);
          if (!this.atk.done && this.atk.t >= this.atk.w) { this.atk.done = true; sfx.swing(); this.strike(this.K.dmg * DIFF, this.K.reach + 0.6); }
          if (this.atk.t >= this.atk.w + 0.26) {
            this.comboN--;
            if (this.comboN > 0) this.startStrike(); else { this.atk = null; this.setMode('recover', enraged ? 0.9 : 1.4); }
          }
        }
        break;
      case 'recover':
        if (this.modeT <= 0) { this.mode = 'idle'; this.modeT = enraged ? 0.2 : 0.5; }
        break;
      case 'push':
        if (this.modeT <= 0) {
          this.pushCd = enraged ? 7 : 11;
          A.fx.ring(this.pos.clone().add(V(0, 1, 0)), V(0, 1, 0), '#ff5252', 1.2, 0.7, 9);
          A.fx.ring(this.pos.clone().add(V(0, 0.2, 0)), V(0, 1, 0), '#b71c1c', 1.2, 0.7, 9);
          sfx.push();
          A.camp.shake(0.5);
          if (H.pos.distanceTo(this.pos) < 11 && H.invuln <= 0 && !H.dead) { H.knock.copy(H.pos).sub(this.pos).setY(0).normalize().multiplyScalar(9); H.hurt(9 * DIFF, this.pos); }
          this.mode = 'idle';
          this.modeT = 0.6;
        }
        break;
      case 'leapUp': {
        const u = 1 - clamp(this.modeT / 0.55, 0, 1);
        this.leapY = Math.sin(u * Math.PI * 0.5) * 7;
        if (this.modeT <= 0) { this.leapTo = H.pos.clone(); this.setMode('leap', 0.5); A.camp.hud.caption('', 1); this.marker = A.addMarker(this.leapTo, 4.2); }
        break;
      }
      case 'leap': {
        const u = 1 - clamp(this.modeT / 0.5, 0, 1);
        this.pos.lerp(this.leapTo, Math.min(1, dt * 7));
        this.leapY = (1 - u * u) * 7;
        if (this.modeT <= 0) {
          this.leapY = 0;
          this.leapCd = 12;
          A.removeMarker(this.marker);
          A.fx.burst(this.pos.clone().add(V(0, 0.4, 0)), 1.2, '#ff7043');
          A.fx.ring(this.pos.clone().add(V(0, 0.2, 0)), V(0, 1, 0), '#ff7043', 1.5, 0.6, 6);
          sfx.boom(0.4, 0.8);
          A.camp.shake(0.7);
          if (H.pos.distanceTo(this.pos) < 4.4 && H.invuln <= 0) H.hurt(18 * DIFF, this.pos);
          this.setMode('recover', 1.6);
        }
        break;
      }
      default: break;
    }
    return move;
  }

  setMode(mode, t) {
    this.mode = mode;
    this.modeT = t;
    if (mode === 'push') { sfx.beep(180); this.arena.fx.ring(this.pos.clone().add(V(0, 1.3, 0)), V(0, 1, 0), '#ff1744', 2, 0.9, -1.8, 0.05); }
    if (mode === 'leapUp') sfx.whoosh();
    if (mode === 'dash') sfx.whoosh();
  }

  startStrike() {
    this.mode = 'combo';
    const n = this.comboN;
    const enraged = this.hp < this.max * 0.5;
    this.atk = { t: 0, w: (n === 3 ? 0.6 : 0.42) * (enraged ? 0.82 : 1), done: false, side: n % 2 ? 1 : -1 };
    sfx.beep(240);
  }

  dispose() { this.trail?.dispose(); this.arena.scene.remove(this.model.root); }
}

// ========================================================================================== Arena =====
export class Arena {
  constructor(camp, built, { pos = V(0, 0, 0), yaw = 0, ceiling } = {}) {
    this.camp = camp;
    this.scene = built.scene;
    this.fx = camp.fx;
    this.built = built;
    this.colliders = built.colliders || [];
    this.ceiling = ceiling ?? built.ceiling ?? 99;
    this.foes = [];
    this.bolts = [];
    this.markers = [];
    this.targets = [];
    this.kills = 0;
    this.enemiesFire = true;
    this.hpScale = 1;
    this.hero = new Hero(this, pos, yaw);
    this.active = true;
    this.cameraEnabled = true;
    camp.hud.setHp(this.hero.hp, this.hero.max);
  }

  collide(p, r = 0.5) {
    for (const c of this.colliders) {
      const dx = p.x - c.x, dz = p.z - c.z, d = Math.hypot(dx, dz), m = c.r + r;
      if (d < m && d > 1e-4) { p.x = c.x + (dx / d) * m; p.z = c.z + (dz / d) * m; }
    }
    this.built.bounds(p);
  }

  spawn(kind, pos) { const f = new Foe(this, kind, pos instanceof THREE.Vector3 ? pos : V(pos[0], 0, pos[1])); this.foes.push(f); return f; }
  alive(kind) { return this.foes.filter((f) => !f.dead && (!kind || f.kind === kind)); }

  nearestFoe(p, maxD, fwd = null, minDot = -1) {
    let best = null, bd = maxD;
    for (const f of this.foes) {
      if (f.dead) continue;
      const d = f.pos.clone().sub(p).setY(0);
      const l = d.length();
      if (l > bd) continue;
      if (fwd && l > 0.5 && d.normalize().dot(fwd) < minDot) continue;
      best = f;
      bd = l;
    }
    return best;
  }

  spawnBolt({ pos, vel, owner, dmg = 0, color = '#ff1744', life = 3, src = null, cosmetic = false }) {
    const g = new THREE.Group();
    const core = new THREE.Mesh(new THREE.CylinderGeometry(0.05, 0.05, 1.3, 6).rotateX(Math.PI / 2), new THREE.MeshBasicMaterial({ color: '#ffffff' }));
    const glow = new THREE.Mesh(new THREE.CylinderGeometry(0.15, 0.15, 1.7, 8).rotateX(Math.PI / 2), glowMat(color, 0.8));
    g.add(core, glow);
    g.position.copy(pos);
    g.lookAt(pos.clone().add(vel));
    this.scene.add(g);
    const b = { mesh: g, glow, pos: pos.clone(), vel: vel.clone(), owner, dmg, life, src, cosmetic,
      recolor(c) { glow.material.color.set(c); } };
    this.bolts.push(b);
    return b;
  }

  addMarker(p, r) {
    const ring = new THREE.Mesh(new THREE.RingGeometry(r * 0.92, r, 40).rotateX(-Math.PI / 2), glowMat('#ff1744', 0.7));
    ring.position.copy(p).setY(0.12);
    const fill = new THREE.Mesh(new THREE.CircleGeometry(r, 40).rotateX(-Math.PI / 2), glowMat('#ff1744', 0.18));
    fill.position.copy(p).setY(0.1);
    this.scene.add(ring, fill);
    const m = { ring, fill };
    this.markers.push(m);
    return m;
  }

  removeMarker(m) {
    if (!m) return;
    this.scene.remove(m.ring, m.fill);
    m.ring.geometry.dispose();
    m.fill.geometry.dispose();
    this.markers = this.markers.filter((x) => x !== m);
  }

  /** Rayo del jugador contra enemigos, objetivos especiales y obstáculos. */
  rayWorld(o, d, max) {
    let t = max, foe = null, target = null;
    for (const f of this.foes) {
      if (f.dead) continue;
      const tt = raySphere(o, d, f.pos.clone().add(V(0, 1.05 * (f.K.scale || 1), 0)), 0.85 * (f.K.scale || 1));
      if (tt != null && tt < t) { t = tt; foe = f; target = null; }
    }
    for (const tg of this.targets) {
      const tt = tg.test(o, d);
      if (tt != null && tt < t) { t = tt; target = tg; foe = null; }
    }
    for (const c of this.colliders) {
      const tt = rayCyl(o, d, c.x, c.z, c.r, 0, 3.2);
      if (tt != null && tt < t) { t = tt; foe = null; target = null; }
    }
    if (d.y < 0) { const tg = -o.y / d.y; if (tg > 0 && tg < t) { t = tg; foe = null; target = null; } }
    return { t, foe, target };
  }

  clear() {
    for (const f of this.foes) f.dispose();
    for (const b of this.bolts) this.scene.remove(b.mesh);
    for (const m of [...this.markers]) this.removeMarker(m);
    this.foes = [];
    this.bolts = [];
  }

  dispose() {
    this.clear();
    this.hero.dispose();
    this.camp.cam.up.set(0, 1, 0);
  }

  /** Lee el teclado/ratón y devuelve las órdenes del héroe. */
  controls() {
    const canAct = (input.locked || input.isTouch) && !this.camp.frozen;
    const mv = this.camp.frozen ? { x: 0, y: 0 } : input.moveVector();
    return {
      mv, canAct,
      run: input.down('ShiftLeft') || input.down('ShiftRight'),
      lmb: input.down('Mouse0') || input.mouse.buttons.has(0),
      lmbP: input.pressed('Mouse0'),
      rmb: input.down('Mouse2') || input.mouse.buttons.has(2),
      dodge: input.pressed('Space'),
      k1: input.pressed('Digit1'), k2: input.pressed('Digit2'), swap: input.pressed('KeyX'),
    };
  }

  update(dt) {
    const now = performance.now();
    const ctl = this.controls();
    this.hero.update(dt, ctl);
    for (const f of this.foes) f.update(dt, now);
    this.foes = this.foes.filter((f) => !(f.dead && f.kind !== 'vex' && f.deathT > 1.8) || (f.dispose(), false));
    this.updateBolts(dt);
    this.hero.trail.update(dt);
    for (const f of this.foes) f.trail?.update(dt);
    this.camp.hud.setHp(this.hero.hp, this.hero.max);
    this.camp.hud.setPips(Math.ceil(this.hero.heat), HEAT_MAX, this.hero.over);
    this.camp.hud.setWeapon(this.hero.want, this.hero.over ? ' · 🔥 enfriando…' : '');
    this.camp.hud.crossOn(this.hero.want === 'blaster' && !this.hero.dead);
    for (const m of this.markers) { const s = 1 + Math.sin(now / 90) * 0.04; m.ring.scale.set(s, s, s); }
    if (this.cameraEnabled) this.updateCamera(dt);
  }

  updateBolts(dt) {
    const H = this.hero;
    for (let i = this.bolts.length - 1; i >= 0; i--) {
      const b = this.bolts[i];
      b.pos.addScaledVector(b.vel, dt);
      b.mesh.position.copy(b.pos);
      b.life -= dt;
      let gone = b.life <= 0;
      if (!gone && !b.cosmetic) {
        if (b.owner === 'foe' && !H.dead) {
          const c = H.chest();
          const d = c.distanceTo(b.pos);
          const front = b.pos.clone().sub(H.pos).setY(0).normalize().dot(H.forward()) > -0.25;
          if (d < 2.2 && front && H.blocking && H.canBlock()) { H.deflect(b); continue; }
          if (d < 0.9 && H.invuln <= 0) { H.hurt(b.dmg, b.pos); this.fx.spark(b.pos, '#ff5252', 8, 6); gone = true; }
        } else if (b.owner === 'hero') {
          for (const f of this.foes) {
            if (f.dead) continue;
            const c = f.pos.clone().add(V(0, 1.1, 0));
            if (c.distanceTo(b.pos) < 0.95 * (f.K.scale || 1)) { f.hit(f.kind === 'vex' ? 16 : b.dmg, H.pos, 'deflect'); this.fx.spark(b.pos, '#80d8ff', 10, 7); gone = true; break; }
          }
        }
        // Se apagan al chocar con columnas y paredes
        if (!gone) for (const c of this.colliders) if (Math.hypot(b.pos.x - c.x, b.pos.z - c.z) < c.r && b.pos.y < 3.2) { this.fx.spark(b.pos, '#ffb74d', 6, 4); gone = true; break; }
        if (!gone && (b.pos.y < 0 || b.pos.y > this.ceiling + 2)) gone = true;
      }
      if (gone) { this.scene.remove(b.mesh); b.mesh.traverse((o) => o.geometry?.dispose()); this.bolts.splice(i, 1); }
    }
  }

  /** Cámara por encima del hombro; al apuntar con el bláster se desplaza a un lado y el héroe sale del centro. */
  updateCamera(dt) {
    const c = this.camp.game.cam;
    const H = this.hero;
    const yaw = c.yaw, pitch = clamp(c.pitch, -0.7, 1.2);
    const back = V(Math.sin(yaw) * Math.cos(pitch), Math.sin(pitch), Math.cos(yaw) * Math.cos(pitch));
    const fwd = back.clone().negate();
    const right = V().crossVectors(fwd, UP).normalize();
    const k = H.aimK;
    const dist = lerp(6.2, 3.7, k);
    const shoulder = lerp(0.3, 1.25, k);
    const focus = H.pos.clone().add(V(0, 1.55, 0));
    const cp = focus.clone().addScaledVector(back, dist).addScaledVector(right, shoulder);
    cp.y = clamp(cp.y, 0.5, this.ceiling - 0.3);
    this.built.bounds(cp);
    const cam = this.camp.cam;
    const sh = this.camp.shakeAmt;
    cam.position.copy(cp);
    if (sh > 0) cam.position.add(V(rand(-sh, sh), rand(-sh, sh), rand(-sh, sh)));
    cam.up.set(0, 1, 0);
    cam.lookAt(cp.clone().addScaledVector(fwd, 20));
    cam.fov = lerp(cam.fov, 62 - k * 6, Math.min(1, dt * 6));
    cam.updateProjectionMatrix();
  }
}
