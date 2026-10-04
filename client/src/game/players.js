// Jugador local (control + física + animaciones) y jugadores remotos (interpolación).
import * as THREE from 'three';
import { PHYSICS } from '../../../shared/constants.js';
import { AvatarModel } from '../avatar/avatarModel.js';
import { AvatarAnimator, ONESHOT, LOOP_STATES } from '../avatar/avatarAnimator.js';
import { audio } from '../audio/audio.js';

const tmpQ = new THREE.Quaternion();
const tmpV = new THREE.Vector3();

export class LocalPlayer {
  constructor(scene, avatar, spawn) {
    this.model = new AvatarModel(avatar);
    scene.add(this.model.root);
    this.anim = new AvatarAnimator(this.model);
    this.body = { x: spawn[0], y: spawn[1], z: spawn[2], vx: 0, vy: 0, vz: 0, r: PHYSICS.radius, h: PHYSICS.height, onGround: false, ground: null };
    this.yaw = 0;
    this.emote = null;
    this.seat = null;
    this.vehicle = null;
    this.dead = false;
    this.frozen = false;
    this.stepDist = 0;
    this.lastJump = 0;
    this.landTimer = 0;
    this.oneShot = null;
  }

  get position() {
    return this.body;
  }

  teleport(p) {
    Object.assign(this.body, { x: p[0], y: p[1], z: p[2], vx: 0, vy: 0, vz: 0, onGround: false, ground: null });
  }

  playEmote(name) {
    if (this.vehicle || this.dead) return;
    this.seat = null;
    if (ONESHOT[name]) this.oneShot = name;
    else this.emote = name;
    this.anim.set(name);
  }

  sitOn(seatObj) {
    this.seat = seatObj;
    this.emote = null;
    const o = seatObj;
    const a = ((o.ry || 0) * Math.PI) / 180;
    this.teleport([o.p[0], o.p[1] + o.s[1] / 2 - 0.05, o.p[2]]);
    this.body.onGround = true;
    this.yaw = a;
  }

  /** Actualiza física y animación. move: {x,y} relativo a la cámara. */
  update(dt, ctl, physics, camForward) {
    const b = this.body;
    const m = this.model;
    if (this.vehicle) {
      this.vehicle.seatTransform(tmpV, tmpQ);
      m.root.position.copy(tmpV);
      m.root.quaternion.copy(tmpQ);
      b.x = tmpV.x; b.y = tmpV.y; b.z = tmpV.z;
      this.anim.set(this.vehicle.type === 'plane' ? 'fly' : 'drive');
      this.anim.update(dt, 0);
      m.updateEffects(dt, false);
      return;
    }
    m.root.quaternion.identity();

    let wishX = 0, wishZ = 0;
    if (!this.dead && !this.frozen) {
      // El movimiento es relativo a la cámara: la derecha de (fx,fz) es (-fz, fx).
      const fx = camForward.x, fz = camForward.z;
      wishX = -fz * ctl.move.x + fx * ctl.move.y;
      wishZ = fx * ctl.move.x + fz * ctl.move.y;
    }
    const moving = Math.hypot(wishX, wishZ) > 0.05;
    if (moving && (this.seat || this.emote)) {
      this.seat = null;
      this.emote = null;
    }
    if (this.seat) {
      b.vx = b.vz = 0;
      this.anim.set('sit');
      this.anim.update(dt, 0);
      m.root.position.set(b.x, b.y, b.z);
      m.root.rotation.y = this.yaw;
      m.updateEffects(dt, false);
      return;
    }

    const swimming = b.inWater;
    const speed = swimming ? PHYSICS.swimSpeed : ctl.run ? PHYSICS.runSpeed : PHYSICS.walkSpeed;
    const accel = b.onGround || swimming ? PHYSICS.accel : PHYSICS.airAccel;
    const tx = wishX * speed, tz = wishZ * speed;
    const dvx = tx - b.vx, dvz = tz - b.vz;
    const dl = Math.hypot(dvx, dvz);
    const maxDv = (moving ? accel : b.onGround ? PHYSICS.decel : PHYSICS.airAccel * 0.3) * dt;
    if (dl > maxDv) { b.vx += (dvx / dl) * maxDv; b.vz += (dvz / dl) * maxDv; }
    else { b.vx = tx; b.vz = tz; }

    if (swimming) {
      b.gravity = -6;
      b.vy *= 1 - Math.min(1, dt * 3);
      if (ctl.jumpHeld) b.vy = Math.min(b.vy + 30 * dt, 4.5);
      if (ctl.jump && b.y > physics.waterLevel - 1.4) b.vy = PHYSICS.jumpVelocity * 0.8; // salir del agua
    } else {
      b.gravity = PHYSICS.gravity;
      if (ctl.jump && b.onGround && !this.dead && !this.frozen) {
        b.vy = PHYSICS.jumpVelocity;
        b.onGround = false;
        b.ground = null;
        this.lastJump = performance.now();
        this.oneShot = null;
        this.emote = null;
        audio.play('jump');
      }
    }
    const wasWater = this.wasInWater;
    physics.move(b, dt);
    this.wasInWater = b.inWater;
    if (b.inWater && !wasWater) audio.play('splash');

    if (b.landSpeed > 8) {
      this.landTimer = 0.18;
      audio.play('land');
    }
    this.landTimer -= dt;

    // Orientación hacia el movimiento
    const hs = Math.hypot(b.vx, b.vz);
    if (hs > 0.5) {
      const target = Math.atan2(b.vx, b.vz);
      const d = Math.atan2(Math.sin(target - this.yaw), Math.cos(target - this.yaw));
      this.yaw += d * Math.min(1, dt * 14);
    }

    // Pasos
    if (b.onGround && hs > 1) {
      this.stepDist += hs * dt;
      if (this.stepDist > (hs > 10 ? 2.6 : 2.1)) {
        this.stepDist = 0;
        audio.play('step', null, { surface: b.surface });
      }
    }

    // Selección del estado de animación (prioridades)
    let state;
    if (this.dead) state = 'dead';
    else if (swimming) state = 'swim';
    else if (!b.onGround && b.vy > 0 && performance.now() - this.lastJump < 500) state = 'jump';
    else if (!b.onGround && b.vy < -4) state = 'fall';
    else if (this.landTimer > 0) state = 'land';
    else if (this.oneShot && !moving) {
      state = this.oneShot;
      if (this.anim.state === state && this.anim.finished) { this.oneShot = null; state = 'idle'; }
    } else if (this.emote && !moving) state = this.emote;
    else if (ctl.crouch && b.onGround) state = 'crouch';
    else if (hs > 10) state = 'run';
    else if (hs > 0.6) state = 'walk';
    else state = 'idle';
    if (moving) this.oneShot = null;
    if (this.attackTimer > 0) {
      this.attackTimer -= dt;
      if (state === 'idle' || state === 'walk' || state === 'run') state = 'attack';
    }
    this.anim.set(state);
    this.anim.update(dt, hs);
    m.root.position.set(b.x, b.y, b.z);
    m.root.rotation.y = this.yaw;
    m.updateEffects(dt, hs > 1);
  }

  /** Estado de animación para la red. */
  netAnim() {
    return LOOP_STATES.has(this.anim.state) || ONESHOT[this.anim.state] ? this.anim.state : 'idle';
  }

  dispose() {
    this.model.dispose();
  }
}

export class RemotePlayer {
  constructor(scene, data) {
    this.id = data.id;
    this.name = data.name;
    this.level = data.level;
    this.npc = !!data.npc;
    this.bot = !!data.bot;
    this.title = data.title || null;
    this.model = new AvatarModel(data.avatar, { name: data.name, level: data.level, title: this.title });
    scene.add(this.model.root);
    this.anim = new AvatarAnimator(this.model);
    this.buffer = [];
    this.vehicleId = data.v || null;
    this.pos = new THREE.Vector3(...(data.p || [0, 0, 0]));
    this.yaw = data.ry || 0;
    this.lastA = data.a || 'idle';
    this.speed = 0;
    this.muted = false;
    this.model.root.position.copy(this.pos);
  }

  push(t, s) {
    this.buffer.push({ t, p: s.p, ry: s.ry, a: s.a });
    if (this.buffer.length > 40) this.buffer.shift();
    this.vehicleId = s.v ? s.v.id : null;
  }

  update(dt, renderT, vehicles) {
    const m = this.model;
    const veh = this.vehicleId ? vehicles.get(this.vehicleId) : null;
    const b = this.buffer;
    let a = 'idle';
    if (b.length) {
      let i0 = b[0], i1 = b[b.length - 1];
      if (renderT <= b[0].t) i1 = i0;
      for (let i = 0; i < b.length - 1; i++) {
        if (b[i].t <= renderT && b[i + 1].t >= renderT) { i0 = b[i]; i1 = b[i + 1]; break; }
      }
      const f = i1.t === i0.t ? 1 : Math.min(1, (renderT - i0.t) / (i1.t - i0.t));
      const nx = i0.p[0] + (i1.p[0] - i0.p[0]) * f, ny = i0.p[1] + (i1.p[1] - i0.p[1]) * f, nz = i0.p[2] + (i1.p[2] - i0.p[2]) * f;
      const dist = Math.hypot(nx - this.pos.x, nz - this.pos.z);
      this.speed = this.speed * 0.8 + (dt > 0 ? dist / dt : 0) * 0.2;
      this.pos.set(nx, ny, nz);
      this.yaw = i0.ry + Math.atan2(Math.sin(i1.ry - i0.ry), Math.cos(i1.ry - i0.ry)) * f;
      a = f > 0.5 ? i1.a : i0.a;
      while (b.length > 2 && b[1].t < renderT - 1000) b.shift();
    }
    if (veh) {
      veh.seatTransform(tmpV, tmpQ);
      m.root.position.copy(tmpV);
      m.root.quaternion.copy(tmpQ);
      this.anim.set(veh.type === 'plane' ? 'fly' : 'drive');
    } else {
      m.root.quaternion.identity();
      m.root.position.copy(this.pos);
      m.root.rotation.y = this.yaw;
      if (a !== this.lastA && a === 'jump') audio.play('jump', this.pos);
      this.lastA = a;
      this.anim.set(a);
    }
    this.anim.update(dt, this.speed);
    m.updateEffects(dt, this.speed > 1);
  }

  dispose() {
    this.model.dispose();
  }
}
