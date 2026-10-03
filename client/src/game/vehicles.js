// Vehículos: modelos, física arcade (coche/kart) y vuelo simplificado (avioneta).
// El conductor simula su vehículo y lo envía al servidor; el resto interpola.
import * as THREE from 'three';
import { VEHICLES } from '../../../shared/constants.js';
import { material } from '../engine/materials.js';

const std = (c, extra = {}) => new THREE.MeshStandardMaterial({ color: c, roughness: 0.5, ...extra });
const PALETTE = ['#e53935', '#1e88e5', '#43a047', '#fdd835', '#8e24aa', '#fb8c00'];

function hashColor(id) {
  let h = 0;
  for (const ch of id) h = (h * 31 + ch.charCodeAt(0)) | 0;
  return PALETTE[Math.abs(h) % PALETTE.length];
}

function wheel(r, w) {
  const g = new THREE.Group();
  const tire = new THREE.Mesh(new THREE.CylinderGeometry(r, r, w, 14).rotateZ(Math.PI / 2), std('#212121', { roughness: 0.9 }));
  const hub = new THREE.Mesh(new THREE.CylinderGeometry(r * 0.5, r * 0.5, w + 0.02, 8).rotateZ(Math.PI / 2), std('#cfd8dc', { metalness: 0.6 }));
  tire.castShadow = true;
  g.add(tire, hub);
  return g;
}

function addBox(parent, w, h, d, mat, x, y, z) {
  const m = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), mat);
  m.position.set(x, y, z);
  m.castShadow = true;
  m.receiveShadow = true;
  parent.add(m);
  return m;
}

export function buildVehicleMesh(type, id) {
  const root = new THREE.Group();
  const body = new THREE.Group();
  root.add(body);
  const color = hashColor(id);
  const paint = std(color, { metalness: 0.3, roughness: 0.35 });
  const wheels = [];
  let seat, prop = null;
  if (type === 'car') {
    addBox(body, 2.2, 0.7, 4.2, paint, 0, 0.75, 0);
    addBox(body, 2.0, 0.25, 1.2, paint, 0, 1.2, 1.4);
    addBox(body, 2.0, 0.6, 0.08, std('#b3e5fc', { transparent: true, opacity: 0.5 }), 0, 1.45, 0.75).rotation.x = -0.35;
    addBox(body, 0.9, 0.5, 0.8, std('#37474f'), 0.45, 1.25, -0.2);
    addBox(body, 0.9, 0.5, 0.8, std('#37474f'), -0.45, 1.25, -0.2);
    addBox(body, 0.5, 0.2, 0.08, new THREE.MeshBasicMaterial({ color: '#fff9c4' }), 0.7, 0.85, 2.11);
    addBox(body, 0.5, 0.2, 0.08, new THREE.MeshBasicMaterial({ color: '#fff9c4' }), -0.7, 0.85, 2.11);
    addBox(body, 0.5, 0.2, 0.08, new THREE.MeshBasicMaterial({ color: '#ff1744' }), 0.7, 0.85, -2.11);
    addBox(body, 0.5, 0.2, 0.08, new THREE.MeshBasicMaterial({ color: '#ff1744' }), -0.7, 0.85, -2.11);
    for (const [x, z] of [[1.05, 1.35], [-1.05, 1.35], [1.05, -1.35], [-1.05, -1.35]]) {
      const w = wheel(0.45, 0.36);
      w.position.set(x, 0.45, z);
      body.add(w);
      wheels.push(w);
    }
    seat = new THREE.Vector3(0.45, 0.95, -0.15);
  } else if (type === 'kart') {
    addBox(body, 1.5, 0.25, 2.5, paint, 0, 0.35, 0);
    addBox(body, 1.0, 0.25, 0.6, paint, 0, 0.45, 1.2);
    addBox(body, 0.7, 0.6, 0.15, std('#263238'), 0, 0.75, -0.55);
    addBox(body, 1.6, 0.1, 0.4, std('#263238'), 0, 1.0, -1.25);
    addBox(body, 0.1, 0.5, 0.1, std('#263238'), 0.5, 0.7, -1.2);
    addBox(body, 0.1, 0.5, 0.1, std('#263238'), -0.5, 0.7, -1.2);
    const steer = new THREE.Mesh(new THREE.TorusGeometry(0.18, 0.04, 6, 12), std('#212121'));
    steer.position.set(0, 0.85, 0.45);
    steer.rotation.x = -0.6;
    body.add(steer);
    for (const [x, z] of [[0.82, 0.95], [-0.82, 0.95], [0.82, -0.9], [-0.82, -0.9]]) {
      const w = wheel(0.32, 0.3);
      w.position.set(x, 0.32, z);
      body.add(w);
      wheels.push(w);
    }
    seat = new THREE.Vector3(0, 0.75, -0.15);
  } else {
    // Avioneta
    addBox(body, 1.3, 1.2, 5.6, paint, 0, 1.5, 0);
    addBox(body, 1.0, 0.9, 1.2, paint, 0, 1.45, 3.2);
    addBox(body, 9.5, 0.16, 1.7, std('#eceff1'), 0, 1.75, 0.6);
    addBox(body, 3.4, 0.12, 0.9, std('#eceff1'), 0, 1.8, -2.5);
    addBox(body, 0.14, 1.3, 1.0, paint, 0, 2.4, -2.55);
    addBox(body, 1.0, 0.5, 0.9, std('#90caf9', { transparent: true, opacity: 0.55 }), 0, 2.2, 1.2);
    prop = new THREE.Group();
    prop.position.set(0, 1.45, 3.85);
    addBox(prop, 0.2, 2.4, 0.08, std('#37474f'), 0, 0, 0);
    addBox(prop, 0.25, 0.25, 0.25, std('#cfd8dc', { metalness: 0.6 }), 0, 0, 0);
    body.add(prop);
    for (const [x, z] of [[1.1, 1.3], [-1.1, 1.3], [0, -2.4]]) {
      const w = wheel(0.3, 0.2);
      w.position.set(x, 0.3, z);
      body.add(w);
      addBox(body, 0.1, 0.6, 0.1, std('#455a64'), x, 0.7, z);
    }
    seat = new THREE.Vector3(0, 1.75, 0.3);
  }
  return { root, body, wheels, seat, prop, color };
}

/** Estado y control de un vehículo en el cliente. */
export class Vehicle {
  constructor(data, scene) {
    this.id = data.id;
    this.type = data.type;
    this.cfg = VEHICLES[data.type];
    const m = buildVehicleMesh(data.type, data.id);
    Object.assign(this, { root: m.root, body: m.body, wheels: m.wheels, seat: m.seat, prop: m.prop });
    scene.add(this.root);
    this.driver = data.driver || null;
    this.state = { x: data.p[0], y: data.p[1], z: data.p[2], yaw: data.r?.[1] ?? 0, pitch: data.r?.[0] ?? 0, roll: data.r?.[2] ?? 0, speed: 0, vy: 0, onGround: true, throttle: 0 };
    this.spawn = { p: [...data.p], r: data.r ? [...data.r] : [0, 0, 0] };
    this.buffer = [];
    this.wheelSpin = 0;
    this.applyPose();
  }

  applyPose() {
    const s = this.state;
    this.root.position.set(s.x, s.y, s.z);
    this.root.rotation.set(0, s.yaw, 0);
    this.body.rotation.set(-s.pitch, 0, s.roll, 'YXZ');
  }

  setPose(p, r) {
    Object.assign(this.state, { x: p[0], y: p[1], z: p[2], pitch: r[0], yaw: r[1], roll: r[2] });
    this.applyPose();
  }

  /** Transformación del asiento en coordenadas del mundo. */
  seatTransform(outPos, outQuat) {
    this.root.updateMatrixWorld();
    this.body.updateMatrixWorld();
    outPos.copy(this.seat).applyMatrix4(this.body.matrixWorld);
    this.body.getWorldQuaternion(outQuat);
  }

  pushRemote(t, pose) {
    this.buffer.push({ t, p: pose.p, r: pose.r, s: pose.s || 0 });
    if (this.buffer.length > 30) this.buffer.shift();
  }

  /** Interpolación del vehículo de otro jugador. */
  interpolate(renderT) {
    const b = this.buffer;
    if (!b.length) return;
    let a = b[0], c = b[b.length - 1];
    for (let i = 0; i < b.length - 1; i++) {
      if (b[i].t <= renderT && b[i + 1].t >= renderT) { a = b[i]; c = b[i + 1]; break; }
    }
    const f = c.t === a.t ? 1 : Math.min(1, Math.max(0, (renderT - a.t) / (c.t - a.t)));
    const lerpA = (x, y) => x + Math.atan2(Math.sin(y - x), Math.cos(y - x)) * f;
    this.setPose(
      [a.p[0] + (c.p[0] - a.p[0]) * f, a.p[1] + (c.p[1] - a.p[1]) * f, a.p[2] + (c.p[2] - a.p[2]) * f],
      [lerpA(a.r[0], c.r[0]), lerpA(a.r[1], c.r[1]), lerpA(a.r[2], c.r[2])],
    );
    this.state.speed = a.s + (c.s - a.s) * f;
  }

  animate(dt) {
    const s = this.state;
    this.wheelSpin += (s.speed * dt) / 0.4;
    for (const w of this.wheels) w.rotation.x = this.wheelSpin;
    if (this.prop) this.prop.rotation.z += dt * (5 + (s.throttle ?? 0) * 60 + Math.abs(s.speed) * 0.8);
  }

  pose() {
    const s = this.state;
    return { id: this.id, p: [s.x, s.y, s.z], r: [s.pitch, s.yaw, s.roll], s: s.speed };
  }

  dispose() {
    this.root.parent?.remove(this.root);
    this.root.traverse((c) => {
      c.geometry?.dispose();
      if (c.material && !c.material.userData?.shared) c.material.dispose();
    });
  }
}

const tmpBody = { x: 0, y: 0, z: 0, vx: 0, vy: 0, vz: 0, r: 1, h: 1.4, step: 0.8, onGround: true, ground: null, maxSlope: 2.2 };

/**
 * Conducción arcade de coche/kart. ctl: { throttle(-1..1), steer(-1..1), brake(bool) }
 * Devuelve { hit } si choca a cierta velocidad.
 */
export function driveGround(v, ctl, dt, physics) {
  const s = v.state, c = v.cfg;
  if (ctl.throttle > 0) s.speed += (s.speed < 0 ? c.brake : c.accel) * ctl.throttle * dt;
  else if (ctl.throttle < 0) s.speed += (s.speed > 0 ? -c.brake : -c.accel * 0.6) * -ctl.throttle * dt;
  else s.speed *= 1 - Math.min(1, 1.1 * dt);
  if (ctl.brake) s.speed *= 1 - Math.min(1, 3 * dt);
  s.speed = Math.max(-c.reverse, Math.min(c.maxSpeed, s.speed));
  if (Math.abs(s.speed) < 0.05 && !ctl.throttle) s.speed = 0;
  const steerK = Math.min(1, Math.abs(s.speed) / 6) * Math.sign(s.speed);
  s.yaw -= ctl.steer * c.steer * steerK * dt * (ctl.brake ? 1.5 : 1);

  Object.assign(tmpBody, { x: s.x, y: s.y, z: s.z, vx: Math.sin(s.yaw) * s.speed, vz: Math.cos(s.yaw) * s.speed, vy: s.vy, r: c.radius, onGround: s.onGround, ground: s.ground || null });
  physics.move(tmpBody, dt);
  let hit = 0;
  if (tmpBody.hitWall) {
    hit = Math.abs(s.speed);
    s.speed *= 0.35;
  }
  s.x = tmpBody.x; s.y = tmpBody.y; s.z = tmpBody.z; s.vy = tmpBody.vy; s.onGround = tmpBody.onGround; s.ground = tmpBody.ground;

  // Inclinación según el suelo
  const L = c.radius * 1.2;
  const gh = (dx, dz) => physics.groundAt(s.x + dx, s.z + dz, 0.2, s.y + 1.5).y;
  const fx = Math.sin(s.yaw), fz = Math.cos(s.yaw);
  if (s.onGround) {
    const hf = gh(fx * L, fz * L), hb = gh(-fx * L, -fz * L);
    const hr = gh(-fz * L * 0.7, fx * L * 0.7), hl = gh(fz * L * 0.7, -fx * L * 0.7);
    const tp = Math.atan2(hf - hb, 2 * L), tr = Math.atan2(hl - hr, 1.4 * L);
    s.pitch += (Math.max(-0.6, Math.min(0.6, tp)) - s.pitch) * Math.min(1, dt * 10);
    s.roll += (Math.max(-0.5, Math.min(0.5, tr)) - s.roll) * Math.min(1, dt * 10);
  } else {
    s.pitch *= 1 - dt;
  }
  v.applyPose();
  return { hit };
}

/**
 * Vuelo simplificado. ctl: { pitch(-1..1, + = morro arriba), roll(-1..1), yaw(-1..1), throttleDelta(-1..1) }
 * Devuelve { crash } si impacta contra el suelo o un edificio.
 */
export function flyPlane(v, ctl, dt, physics) {
  const s = v.state, c = v.cfg;
  s.throttle = Math.max(0, Math.min(1, (s.throttle ?? 0) + ctl.throttleDelta * 0.6 * dt));
  const thrust = s.throttle * c.maxSpeed;
  s.speed += (thrust - s.speed) * 0.35 * dt - Math.sin(s.pitch) * 16 * dt;
  s.speed = Math.max(0, Math.min(c.maxSpeed * 1.15, s.speed));
  const ground = physics.groundAt(s.x, s.z, 1, s.y + 1).y;
  const flying = !s.onGround;

  if (!flying) {
    // Rodaje por pista
    s.yaw -= ctl.roll * 1.1 * dt * Math.min(1, s.speed / 8) + ctl.yaw * 0.8 * dt * Math.min(1, s.speed / 8);
    s.roll += (0 - s.roll) * Math.min(1, dt * 6);
    const wantUp = ctl.pitch > 0 && s.speed >= c.minFlySpeed;
    s.pitch += ((wantUp ? 0.25 : 0) - s.pitch) * Math.min(1, dt * 3);
    s.x += Math.sin(s.yaw) * s.speed * dt;
    s.z += Math.cos(s.yaw) * s.speed * dt;
    s.y = ground;
    if (physics.waterLevel != null && ground < physics.waterLevel - 0.3) return { crash: true };
    if (wantUp) {
      s.onGround = false;
      s.y += 0.2;
    }
    if (!s.onGround) s.speed = Math.max(s.speed, c.minFlySpeed);
    // Choque contra edificios en rodaje
    if (physics.pointBlocked(s.x + Math.sin(s.yaw) * 3.5, s.y + 1.4, s.z + Math.cos(s.yaw) * 3.5)) {
      s.speed = 0;
    }
  } else {
    s.roll += (ctl.roll * 1.05 - s.roll) * Math.min(1, dt * 2.2);
    s.pitch += ctl.pitch * 0.9 * dt;
    if (!ctl.pitch) s.pitch -= s.pitch * 0.25 * dt; // ligera autoestabilización
    if (s.speed < c.minFlySpeed) s.pitch -= (c.minFlySpeed - s.speed) * 0.04 * dt; // pérdida
    s.pitch = Math.max(-1.1, Math.min(1.1, s.pitch));
    s.yaw -= (Math.sin(s.roll) * 0.95 + ctl.yaw * 0.4) * dt;
    const cp = Math.cos(s.pitch);
    let sink = 0;
    if (s.speed < c.minFlySpeed) sink = -(c.minFlySpeed - s.speed) * 0.9;
    s.x += Math.sin(s.yaw) * cp * s.speed * dt;
    s.z += Math.cos(s.yaw) * cp * s.speed * dt;
    s.y += (Math.sin(s.pitch) * s.speed + sink) * dt;
    // Choques
    const nose = [s.x + Math.sin(s.yaw) * 3.5 * cp, s.y + 1.4 + Math.sin(s.pitch) * 3.5, s.z + Math.cos(s.yaw) * 3.5 * cp];
    if (physics.pointBlocked(...nose)) return { crash: true };
    const g2 = physics.groundAt(s.x, s.z, 1, s.y + 0.5).y;
    if (s.y <= g2 + 0.05) {
      const vs = -Math.sin(s.pitch) * s.speed - sink;
      if (s.pitch < -0.3 || Math.abs(s.roll) > 0.6 || vs > 10) return { crash: true };
      s.y = g2;
      s.onGround = true;
      s.pitch = 0;
    }
    if (physics.waterLevel != null && s.y < physics.waterLevel - 0.5) return { crash: true };
  }
  v.applyPose();
  return {};
}

export { material };
