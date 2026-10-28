// Skate Pro (cliente): el patinador. Tu avatar a pie (camina, corre, salta, lleva la tabla bajo el brazo),
// se sube a la tabla y patina con todas sus poses: empujar, rodar, agacharse para el ollie, volar,
// flips, agarres, grinds, manuales, aterrizajes, caídas y el «dive». Además la sombra y las chispas.
import * as THREE from 'three';
import { AvatarModel } from '../../avatar/avatarModel.js';
import { AvatarAnimator } from '../../avatar/avatarAnimator.js';
import { DEFAULT_AVATAR } from '../../../../shared/avatar.js';

const TAU = Math.PI * 2;
const ease = (u) => u * u * (3 - 2 * u);
const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
const SWAP = 0.35;

function buildBoard(color) {
  const g = new THREE.Group();
  const deck = new THREE.Mesh(new THREE.BoxGeometry(0.24, 0.035, 0.84), new THREE.MeshStandardMaterial({ color, roughness: 0.5 }));
  deck.position.y = 0.11;
  for (const s of [-1, 1]) { // puntas levantadas
    const kick = new THREE.Mesh(new THREE.BoxGeometry(0.24, 0.03, 0.12), deck.material);
    kick.position.set(0, 0.125, s * 0.43); kick.rotation.x = -s * 0.35;
    g.add(kick);
  }
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
    this.carry = new THREE.Group(); // lleva la tabla en la mano o la deja en el suelo
    this.boardPivot = new THREE.Group();
    this.board = buildBoard(boardColor);
    this.boardPivot.add(this.board);
    this.carry.add(this.boardPivot);
    this.tilt.add(this.carry);
    this.model = new AvatarModel({ ...DEFAULT_AVATAR, ...(avatar || {}) }, { name: null, shadows: true });
    this.anim = new AvatarAnimator(this.model);
    this.body = new THREE.Group();
    this.body.add(this.model.root);
    this.tilt.add(this.body);
    this.model.root.position.y = 0.14;
    this.bd = 1; // 0 = a pie, 1 = sobre la tabla
    this.p = { crouch: 0, wide: 0.3, armL: 0.5, armR: 0.5, armLx: 0, armRx: 0, lean: 0, legLx: 0, legRx: 0, twist: 0 };
    this.prevState = 'ground';
    this.wasGround = true;
    this.bailT = 0;
    this.carryPos = new THREE.Vector3(-0.42, 0.78, 0.06);
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
    r.rotation.set(0, sim.yaw, 0);
    this.blob.position.set(sim.x, groundY + 0.03, sim.z);
    const air = Math.max(0, sim.y - groundY);
    this.blob.scale.setScalar(Math.max(0.4, 1 - air * 0.12));
    this.blob.material.opacity = Math.max(0.08, 0.35 - air * 0.05);

    // Cuánto está «sobre la tabla»: se mueve en 0,35 s al subirse o bajarse
    const targetBd = st === 'walk' ? 0 : 1;
    this.bd += clamp(targetBd - this.bd, -dt / SWAP, dt / SWAP);
    const bd = this.bd, u = ease(bd);
    this.model.root.rotation.y = -Math.PI / 2 * u;
    this.model.root.position.y = 0.14 * u;
    this.carry.position.copy(this.carryPos).multiplyScalar(1 - u);
    this.carry.rotation.set((1 - u) * Math.PI / 2, 0, 0);
    this.boardPivot.rotation.set(0, 0, 0);
    this.boardPivot.position.set(0, 0, 0);
    this.board.rotation.set(0, 0, 0);
    this.body.rotation.set(0, 0, 0);
    this.body.position.set(0, 0, 0);
    const m = this.model;

    if (bd < 0.5 && st === 'walk') {
      this.walkPose(sim, dt);
    } else {
      this.skatePose(sim, dt, st, u);
    }
    // El tilt de la tabla sigue la superficie solo sobre ruedas
    if (!(st === 'ground' || st === 'manual')) { this.tilt.rotation.x += (0 - this.tilt.rotation.x) * Math.min(1, dt * 10); this.tilt.rotation.z += (0 - this.tilt.rotation.z) * Math.min(1, dt * 10); }
    this.prevState = st;
    // Chispas
    for (const s of this.sparks) {
      if (s.life <= 0) continue;
      s.life -= dt;
      s.v.y -= 9 * dt;
      s.m.position.addScaledVector(s.v, dt);
      if (s.life <= 0) s.m.visible = false;
    }
    void m;
  }

  /** A pie: usa el animador del avatar (andar, correr, saltar, caer, parado) con la tabla en la mano. */
  walkPose(sim, dt) {
    const a = this.anim;
    const sp = Math.hypot(sim.vx, sim.vz);
    let state = 'idle';
    if (!sim.grounded) state = sim.vy > 0.3 ? 'jump' : 'fall';
    else if (sim.landT > 0.12) state = 'land';
    else if (sp > 3.4) state = 'run';
    else if (sp > 0.35) state = 'walk';
    a.set(state);
    a.update(dt, sp * 1.6);
    const m = this.model;
    // El brazo derecho sostiene la tabla contra el cuerpo
    m.rArm.rotation.set(0.12 + Math.sin(a.time * 3) * 0.01, 0, 0.3);
    this.tilt.rotation.x *= 0.8; this.tilt.rotation.z *= 0.8;
    this.carry.rotation.z = -0.12;
  }

  skatePose(sim, dt, st, u) {
    const m = this.model, body = this.body, P = this.p;
    const spd = sim.speed;
    // Pendiente: la tabla sigue la superficie
    const onWheels = st === 'ground' || st === 'manual';
    const slope = onWheels ? Math.atan2(sim.dirX * sim.nx + sim.dirZ * sim.nz, sim.ny) : 0;
    this.tilt.rotation.x += (-slope - this.tilt.rotation.x) * Math.min(1, dt * 14);
    const side = onWheels ? Math.atan2(-(sim.dirZ * sim.nx - sim.dirX * sim.nz), sim.ny) : 0;
    this.tilt.rotation.z += (side * 0.6 - this.tilt.rotation.z) * Math.min(1, dt * 10);

    // Objetivos de la pose
    let crouch = 0, wide = 0.3, armL = 0.5, armR = 0.5, armLx = 0, armRx = 0, lean = 0, legLx = 0, legRx = 0, twist = 0;
    let bodyX = 0, bodyZ = 0;
    let legLz = null, legRz = null;
    const a = sim.air;
    if (st === 'ground') {
      lean = sim.steer * 0.3;
      if (sim.charge > 0) { // agacharse para el ollie
        crouch = 0.18 + sim.charge * 0.55; wide = 0.34 + crouch * 0.35; armL = 0.2; armR = 0.2; armLx = -0.5; armRx = -0.5; bodyX = 0.12;
      } else if (sim.pushT > 0) { // empujón con el pie de atrás
        const pt = sim.pushT;
        const k = pt < 0.5 ? Math.sin(Math.PI * pt / 0.5) : 0;
        crouch = 0.1 + k * 0.08; wide = 0.3;
        legRz = -(0.32 + k * 0.75); legRx = -0.35 * k;
        armLx = -0.5 * k; armRx = 0.5 * k; armL = 0.55; armR = 0.55;
        bodyX = 0.1 * k; twist = 0.2 * k;
      } else {
        crouch = 0.05 + Math.min(0.1, spd * 0.012);
        wide = 0.3 + crouch * 0.3;
        armL = 0.45 + Math.min(0.5, spd * 0.045) + sim.steer * 0.25; armR = 0.45 + Math.min(0.5, spd * 0.045) - sim.steer * 0.25;
        if (sim.pumping) { crouch += 0.12; armLx = -0.4; armRx = -0.4; }
      }
      crouch += clamp(sim.landT / 0.28, 0, 1) * 0.32; // amortigua el aterrizaje
    } else if (st === 'manual') {
      this.tilt.rotation.x -= 0.45;
      armL = 0.9 + sim.bal * 0.5; armR = 0.9 - sim.bal * 0.5; crouch = 0.05; bodyZ = sim.bal * 0.45; lean = 0;
    } else if (st === 'air' && a) {
      armL = 1.1; armR = 1.1; wide = 0.34;
      const t = a.t;
      if (t < 0.14) { // despegue: se estira y sube la tabla
        crouch = -0.03; armLx = -1.2; armRx = -1.2; wide = 0.26;
      } else { crouch = 0.14; armLx = -0.25; armRx = -0.25; legLx = -0.35; legRx = -0.35; }
      const f = a.flip;
      if (f) {
        const pr = Math.min(1, f.t / f.dur), q = ease(pr), kick = Math.sin(Math.PI * pr);
        if (f.id === 'kickflip') { this.board.rotation.z = q * TAU; legLx = -0.9 * kick; }
        else if (f.id === 'heelflip') { this.board.rotation.z = -q * TAU; legLx = 0.7 * kick; }
        else if (f.id === 'shuvit') { this.boardPivot.rotation.y = q * Math.PI; legRx = -0.8 * kick; }
        else if (f.id === 'tre') { this.board.rotation.z = q * TAU; this.boardPivot.rotation.y = q * TAU; legLx = -0.9 * kick; legRx = -0.8 * kick; }
        else if (f.id === 'varial') { this.board.rotation.z = -q * TAU; this.boardPivot.rotation.y = q * Math.PI; legLx = 0.7 * kick; legRx = -0.8 * kick; }
        crouch += 0.08 * kick;
      }
      if (a.grab > 0.05) { // agarre: la mano va a la tabla y la tabla sube
        armRx = 1.25; armR = 0.15; crouch = 0.3; legLx = -0.4; legRx = -0.4;
        this.boardPivot.position.y = 0.1;
      }
      bodyX = clamp(-sim.vy * 0.02, -0.18, 0.2);
    } else if (st === 'grind') {
      crouch = 0.14; wide = 0.34; armL = 0.95 + sim.bal * 0.6; armR = 0.95 - sim.bal * 0.6; bodyZ = sim.bal * 0.5;
      if (sim.grind?.id === 'gboard') this.boardPivot.rotation.y = Math.PI / 2;
      if (sim.grind?.id === 'gnose') this.tilt.rotation.x += 0.3;
      this.spark(sim.x, sim.y + 0.05, sim.z, 2);
    } else if (st === 'bail') {
      const t = sim.bailT;
      const dv = sim.dive;
      this.bailT = t;
      if (dv && dv.spread && t < 1.1) { // Spread Eagle: cuerpo plano boca abajo con brazos y piernas abiertos
        bodyX = 1.45; armL = 1.5; armR = 1.5; wide = 0.65; crouch = -0.35;
        body.rotation.z = Math.sin(t * 3) * 0.2;
      } else if (dv && t < 0.9) { // Dive normal
        bodyX = 1.2; armLx = -2.2; armRx = -2.2; armL = 0.3; armR = 0.3; wide = 0.18; crouch = -0.3;
      } else { // tumbo
        const k = Math.min(1, t / 0.35);
        bodyX = -ease(k) * 1.45;
        crouch = 0.1 * k;
        armL = 1.4 + Math.sin(t * 18) * 0.4; armR = 1.4 - Math.sin(t * 18) * 0.4; wide = 0.5;
        if (t > 0.9) { bodyX = -1.55; armL = 0.9; armR = 0.9; }
      }
      this.boardPivot.rotation.set(0.3, t * 6, 0.4);
      this.boardPivot.position.set(0.5, 0.05, -0.5 * Math.min(1, t / 0.35));
    }

    // Suavizado de la pose
    const k = Math.min(1, dt * (st === 'air' || st === 'bail' ? 16 : 12));
    const sm = (key, v) => { P[key] += (v - P[key]) * k; };
    sm('crouch', crouch); sm('wide', wide); sm('armL', armL); sm('armR', armR); sm('armLx', armLx); sm('armRx', armRx);
    sm('lean', lean); sm('legLx', legLx); sm('legRx', legRx); sm('twist', twist);
    body.rotation.x = bodyX;
    body.rotation.z = bodyZ || P.lean;
    body.rotation.y = P.twist;
    body.position.y = -P.crouch;
    m.lLeg.rotation.set(P.legLx, 0, legLz ?? P.wide);
    m.rLeg.rotation.set(P.legRx, 0, legRz ?? -P.wide);
    m.lArm.rotation.set(P.armLx, 0, -P.armL);
    m.rArm.rotation.set(P.armRx, 0, P.armR);
    m.neck.rotation.set(0, 0, 0);
    // Subiéndose a la tabla: se agacha un instante
    if (this.bd < 1) body.position.y -= 0.25 * Math.sin(Math.PI * this.bd);
    void u;
  }

  dispose() {
    this.model.dispose?.();
    this.root.traverse((o) => { o.geometry?.dispose?.(); });
    this.blob.geometry.dispose();
  }
}
