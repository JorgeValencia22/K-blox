// Skate Pro (cliente): el patinador (tu avatar sobre una tabla), su sombra y las chispas del grind.
import * as THREE from 'three';
import { AvatarModel } from '../../avatar/avatarModel.js';
import { DEFAULT_AVATAR } from '../../../../shared/avatar.js';
import { TRICKS } from '../../../../shared/skate/sim.js';

const ease = (u) => u * u * (3 - 2 * u);

function buildBoard(color) {
  const g = new THREE.Group();
  const deck = new THREE.Mesh(new THREE.BoxGeometry(0.24, 0.035, 0.84), new THREE.MeshStandardMaterial({ color, roughness: 0.5 }));
  deck.position.y = 0.11;
  const grip = new THREE.Mesh(new THREE.BoxGeometry(0.22, 0.006, 0.8), new THREE.MeshStandardMaterial({ color: '#15151a', roughness: 1 }));
  grip.position.y = 0.131;
  g.add(deck, grip);
  for (const z of [-0.26, 0.26]) {
    const truck = new THREE.Mesh(new THREE.BoxGeometry(0.22, 0.03, 0.05), new THREE.MeshStandardMaterial({ color: '#aab0b8', metalness: 0.7, roughness: 0.4 }));
    truck.position.set(0, 0.075, z);
    g.add(truck);
    for (const x of [-0.12, 0.12]) {
      const wheel = new THREE.Mesh(new THREE.CylinderGeometry(0.045, 0.045, 0.045, 12), new THREE.MeshStandardMaterial({ color: '#f1f1f1', roughness: 0.6 }));
      wheel.rotation.z = Math.PI / 2; wheel.position.set(x, 0.05, z);
      g.add(wheel);
    }
  }
  g.traverse((o) => { if (o.isMesh) o.castShadow = true; });
  return g;
}

export class SkaterRig {
  constructor(avatar, boardColor = '#ff5252') {
    this.root = new THREE.Group();
    this.tilt = new THREE.Group(); // inclinación (manual, rampas)
    this.root.add(this.tilt);
    this.boardPivot = new THREE.Group();
    this.board = buildBoard(boardColor);
    this.boardPivot.add(this.board);
    this.tilt.add(this.boardPivot);
    this.model = new AvatarModel({ ...DEFAULT_AVATAR, ...(avatar || {}) }, { name: null, shadows: true });
    this.body = new THREE.Group();
    this.body.add(this.model.root);
    this.tilt.add(this.body);
    this.model.root.rotation.y = -Math.PI / 2; // de lado sobre la tabla
    this.model.root.position.y = 0.14;
    this.crouch = 0;
    this.lean = 0;
    this.bailT = 0;
    this.boardDrop = new THREE.Vector3();
    // Sombra bajo el patinador
    this.blob = new THREE.Mesh(new THREE.CircleGeometry(0.55, 20), new THREE.MeshBasicMaterial({ color: '#000', transparent: true, opacity: 0.35, depthWrite: false }));
    this.blob.rotation.x = -Math.PI / 2;
    // Chispas del grind
    this.sparks = [];
    this.sparkGroup = new THREE.Group();
    const sg = new THREE.SphereGeometry(0.025, 4, 3);
    const sm = new THREE.MeshBasicMaterial({ color: '#ffd54f' });
    for (let i = 0; i < 28; i++) { const m = new THREE.Mesh(sg, sm); m.visible = false; this.sparkGroup.add(m); this.sparks.push({ m, life: 0, v: new THREE.Vector3() }); }
    this.sparkI = 0;
  }

  addTo(scene) { scene.add(this.root, this.blob, this.sparkGroup); }
  removeFrom(scene) { scene.remove(this.root, this.blob, this.sparkGroup); }

  spark(x, y, z, n = 3) {
    for (let i = 0; i < n; i++) {
      const s = this.sparks[this.sparkI++ % this.sparks.length];
      s.life = 0.35 + Math.random() * 0.25;
      s.m.visible = true;
      s.m.position.set(x, y, z);
      s.v.set((Math.random() - 0.5) * 3, 1 + Math.random() * 2.5, (Math.random() - 0.5) * 3);
    }
  }

  /** Coloca y anima el patinador según el estado del simulador. */
  update(sim, dt, groundY) {
    const st = sim.state;
    const r = this.root;
    r.position.set(sim.x, sim.y, sim.z);
    this.blob.position.set(sim.x, groundY + 0.03, sim.z);
    const air = Math.max(0, sim.y - groundY);
    this.blob.scale.setScalar(Math.max(0.4, 1 - air * 0.12));
    this.blob.material.opacity = Math.max(0.08, 0.35 - air * 0.05);
    r.rotation.set(0, sim.yaw, 0);
    const m = this.model;
    const body = this.body;
    // Pendiente: la tabla sigue la superficie
    const targetPitch = st === 'ground' || st === 'manual' ? Math.atan2(-(sim.ny * 0 + sim.vy), Math.max(0.5, Math.hypot(sim.vx, sim.vz))) * 0 : 0;
    void targetPitch;
    const slope = st === 'ground' || st === 'manual' ? Math.atan2(sim.dirX * sim.nx + sim.dirZ * sim.nz, sim.ny) : 0;
    this.tilt.rotation.x += (-slope - this.tilt.rotation.x) * Math.min(1, dt * 14);
    const side = st === 'ground' || st === 'manual' ? Math.atan2(-(sim.dirZ * sim.nx - sim.dirX * sim.nz), sim.ny) : 0;
    this.tilt.rotation.z += (side * 0.6 - this.tilt.rotation.z) * Math.min(1, dt * 10);

    // Pose
    let wide = 0.3, armsOut = 0.5, crouch = 0;
    const lean = sim.steer * 0.25;
    const air_ = sim.air;
    this.boardPivot.rotation.set(0, 0, 0);
    this.boardPivot.position.set(0, 0, 0);
    this.board.rotation.set(0, 0, 0);
    this.body.rotation.set(0, 0, 0);
    if (st === 'ground') {
      crouch = sim.charge > 0 ? 0.2 + sim.charge * 0.5 : Math.min(0.06, sim.speed * 0.006);
      wide = 0.3 + crouch * 0.4;
      armsOut = 0.45 + Math.min(0.5, sim.speed * 0.04);
      body.rotation.z = lean;
    } else if (st === 'manual') {
      this.tilt.rotation.x -= 0.45;
      armsOut = 0.9 + sim.bal * 0.5; crouch = 0.05; wide = 0.3;
      body.rotation.z = sim.bal * 0.45;
    } else if (st === 'air' && air_) {
      armsOut = 1.15; crouch = 0.12; wide = 0.34;
      const f = air_.flip;
      const p = f ? Math.min(1, f.t / f.dur) : 0;
      if (f) {
        const q = ease(p);
        if (f.id === 'kickflip') this.board.rotation.z = q * TAU_;
        else if (f.id === 'heelflip') this.board.rotation.z = -q * TAU_;
        else if (f.id === 'shuvit') this.boardPivot.rotation.y = q * Math.PI;
        else if (f.id === 'tre') { this.board.rotation.z = q * TAU_; this.boardPivot.rotation.y = q * Math.PI * 2; }
        else if (f.id === 'varial') { this.board.rotation.z = -q * TAU_; this.boardPivot.rotation.y = q * Math.PI; }
      }
      if (air_.grab > 0.05 && sim.state === 'air') { this.model.lArm.rotation.x = 0; armsOut = 0.4; crouch = 0.3; }
      this.boardPivot.position.y = air_.grab > 0.05 ? 0.1 : 0;
    } else if (st === 'grind') {
      crouch = 0.12; armsOut = 0.95 + sim.bal * 0.6; wide = 0.34;
      body.rotation.z = sim.bal * 0.5;
      if (sim.grind?.id === 'gboard') this.boardPivot.rotation.y = Math.PI / 2;
      this.spark(sim.x, sim.y + 0.05, sim.z, 2);
    } else if (st === 'bail') {
      this.bailT = sim.bailT;
      const k = Math.min(1, sim.bailT / 0.35);
      body.rotation.x = -ease(k) * 1.45;
      body.position.y = -0.1 * k;
      armsOut = 1.4 + Math.sin(sim.bailT * 18) * 0.4; wide = 0.5;
      this.boardPivot.rotation.set(0.3, sim.bailT * 6, 0.4);
      this.boardPivot.position.set(0.5, 0.05 * k, -0.5 * k);
    }
    if (st !== 'bail') body.position.y = -crouch;
    m.lLeg.rotation.z = wide; m.rLeg.rotation.z = -wide;
    m.lLeg.rotation.x = 0; m.rLeg.rotation.x = 0;
    m.lArm.rotation.z = -armsOut; m.rArm.rotation.z = armsOut;
    m.lArm.rotation.x = 0; m.rArm.rotation.x = 0;
    if (st === 'air' && air_ && air_.grab > 0.05) { m.rArm.rotation.z = 0.2; m.rArm.rotation.x = 1.3; }
    // Chispas
    for (const s of this.sparks) {
      if (s.life <= 0) continue;
      s.life -= dt;
      s.v.y -= 9 * dt;
      s.m.position.addScaledVector(s.v, dt);
      if (s.life <= 0) s.m.visible = false;
    }
  }

  dispose() {
    this.model.dispose?.();
    this.root.traverse((o) => { o.geometry?.dispose?.(); });
    this.blob.geometry.dispose();
  }
}
const TAU_ = Math.PI * 2;
void TRICKS;
