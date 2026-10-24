// Campaña de Guerra Galáctica (un jugador). Cuenta atrás de 10 s y después, sin menús:
//  1 combate espacial → 2 entrada en la Estación Oscura → 3 hangar (droides y soldados) →
//  4 núcleo magnético y huida → 5 explosión de la estación → 6 fallo de motores y caída →
//  7 duelo contra Lord Vex en el mundo de lava → 8 regreso a casa y misión completada.
import * as THREE from 'three';
import { engine } from '../../engine/renderer.js';
import { input } from '../../engine/input.js';
import { net } from '../../core/net.js';
import { audio } from '../../audio/audio.js';
import { toast } from '../../ui/dom.js';
import { CHud, Fx, Score, sfx, glowMat, glowSprite, addFlashLights, canvasTex, clamp, lerp, ease, rand } from './kit.js';
import { buildSpace, buildFighter, buildEnemy, buildFalcon, buildHangar, buildCore, buildLava, buildHome, addSpaceBackdrop, buildStation } from './scenes.js';
import { Arena } from './combat.js';

const V = (x = 0, y = 0, z = 0) => new THREE.Vector3(x, y, z);
const UP = V(0, 1, 0);
const TAU = Math.PI * 2;

/** Cámara de cine: rail de fotogramas clave {t, p, l, fov} con suavizado entre ellos. */
function rail(keys) {
  const mk = (k) => ({ p: V(...k.p), l: V(...k.l), fov: k.fov || 60 });
  return (t) => {
    if (t <= keys[0].t) return mk(keys[0]);
    for (let i = 0; i < keys.length - 1; i++) {
      const a = keys[i], b = keys[i + 1];
      if (t <= b.t) {
        const raw = (t - a.t) / Math.max(1e-4, b.t - a.t), u = b.lin ? raw : ease(raw);
        return { p: V(...a.p).lerp(V(...b.p), u), l: V(...a.l).lerp(V(...b.l), u), fov: lerp(a.fov || 60, b.fov || 60, u) };
      }
    }
    return mk(keys[keys.length - 1]);
  };
}

const CRAWL = [
  '# GUERRA GALÁCTICA',
  'La Estación Oscura apunta su superláser contra el último planeta libre.',
  'Destruye su núcleo y escapa antes de que explote.',
  'Pero Lord Vex te espera…',
];

// =============================================================================== Director =====
export class Campaign {
  constructor(client) {
    this.client = client;
    this.game = client.game;
    this.cam = new THREE.PerspectiveCamera(70, innerWidth / innerHeight, 0.25, 30000);
    this.hud = new CHud();
    this.fx = new Fx();
    this.score = new Score();
    this.cache = {};
    this.time = 0;
    this.timeScale = 1;
    this.shakeAmt = 0;
    this.frozen = false;
    this.over = false;
    this.cur = null;
    this.ch = null;
    this.view = { scene: new THREE.Scene(), camera: this.cam, update: (dt) => this.game.update(dt), onResize: (w, hh) => { this.cam.aspect = w / hh; this.cam.updateProjectionMatrix(); } };
    this.prevView = null;
    this.game.hud.el.style.visibility = 'hidden';
    this.game.cam.yaw = 0;
    this.game.cam.pitch = 0.3;
    this.go('intro');
  }

  shake(a) { this.shakeAmt = Math.max(this.shakeAmt, a); }

  /** Ordena al servidor (inicio y fin de la misión, para dar los premios). */
  send(name, data = {}) { return net.request('mode', { name, data }).catch(() => ({})); }

  setScene(built) {
    this.cur = built;
    this.view.scene = built.scene;
    this.fx.setScene(built.scene);
    this.cam.up.set(0, 1, 0);
    this.cam.fov = 70;
    this.cam.updateProjectionMatrix();
    this.shakeAmt = 0;
  }

  go(name, arg) {
    this.ch?.leave();
    const h = this.hud;
    h.crossOn(false); h.crossPos(null); h.showStats(false); h.showShip(false); h.boss(null); h.timer(null); h.skip(null); h.buttons(null);
    h.bars(false); h.title(''); h.caption(''); h.helpText(''); h.objective(''); h.hideMarks(); h.count(null);
    this.frozen = false;
    this.timeScale = 1;
    this.name = name;
    this.ch = new CHAPTERS[name](this, arg);
    this.ch.enter();
  }

  /** Fundido a negro, cambio de capítulo y fundido de vuelta. */
  change(name, ms = 700, arg) {
    if (this.changing) return;
    this.changing = true;
    this.frozen = true;
    this.hud.fade(1, ms);
    setTimeout(() => {
      if (this.over) return;
      this.changing = false;
      this.go(name, arg);
      this.hud.fade(0, ms);
    }, ms + 60);
  }

  update(dt) {
    if (this.over) return;
    // La partida se pone como vista del motor después de crear el modo: aquí la sustituimos por la nuestra
    if (engine.view !== this.view) { this.prevView = this.prevView || engine.view; engine.view = this.view; engine.resize(); }
    const rdt = dt;
    dt *= this.timeScale;
    this.time += dt;
    this.shakeAmt = Math.max(0, this.shakeAmt - rdt * 1.4);
    this.score.update(rdt);
    this.ch?.update(dt);
    this.cur?.scene.userData.anim?.(this.time, dt, this.fx);
    this.fx.update(dt);
    this.cur?.follow?.(this.cam.position);
    this.hud.lockHint(!input.locked && !input.isTouch && this.ch?.needsLock && !this.changing);
  }

  exit() {
    this.game.exit('leave');
  }

  dispose() {
    this.over = true;
    this.ch?.leave();
    this.fx.dispose();
    this.hud.dispose();
    this.game.hud.el.style.visibility = '';
    if (engine.view === this.view) { engine.view = this.prevView || this.game; engine.resize(); }
    for (const k of Object.keys(this.cache)) this.cache[k] = null;
  }
}

class Chapter {
  constructor(camp, arg) { this.c = camp; this.arg = arg; this.t = 0; this.needsLock = false; }
  enter() {}
  update(dt) { this.t += dt; }
  leave() {}
}

// ======================================================================= Vuelo de nave =====
/** Control de una nave en el espacio con ratón o teclado (la cámara de la partida sirve de joystick). */
class Flight {
  constructor(camp, ship, speed = 80, camOff = [3.4, 15]) {
    this.c = camp;
    this.camOff = camOff;
    this.ship = ship;
    this.q = new THREE.Quaternion();
    this.roll = 0;
    this.speed = speed;
    this.vel = V(0, 0, -speed);
    const cam = camp.game.cam;
    this.lastYaw = cam.yaw;
    cam.pitch = 0.3;
    this.cp = V();
    this.first = true;
  }

  steer(dt) {
    const c = this.c.game.cam;
    const mx = c.yaw - this.lastYaw, my = -(c.pitch - 0.3);
    c.pitch = 0.3;
    this.lastYaw = c.yaw;
    const mv = this.c.frozen ? { x: 0, y: 0 } : input.moveVector();
    return {
      yaw: mx * 1.4 - mv.x * 1.7 * dt, pitch: my * 1.4 + mv.y * 1.4 * dt,
      boost: !this.c.frozen && (input.down('ShiftLeft') || input.down('ShiftRight')),
      fire: !this.c.frozen && (input.down('Space') || input.down('Mouse0') || input.mouse.buttons.has(0)),
    };
  }

  fly(dt, ctl, speed = this.speed) {
    const yawQ = new THREE.Quaternion().setFromAxisAngle(UP, ctl.yaw);
    const pitchQ = new THREE.Quaternion().setFromAxisAngle(V(1, 0, 0), ctl.pitch);
    this.q.multiply(yawQ).multiply(pitchQ).normalize();
    this.roll += (clamp(ctl.yaw / Math.max(dt, 1e-3) * 0.5, -0.9, 0.9) - this.roll) * Math.min(1, dt * 4);
    this.ship.quaternion.copy(this.q).multiply(new THREE.Quaternion().setFromAxisAngle(V(0, 0, 1), this.roll));
    this.vel = this.forward().multiplyScalar(speed * (ctl.boost ? 1.8 : 1));
    this.ship.position.addScaledVector(this.vel, dt);
    this.ship.updateMatrixWorld();
  }

  forward() { return V(0, 0, -1).applyQuaternion(this.q); }

  /** Gira suavemente hacia un objetivo (ayuda al apuntar). */
  assist(dt, target) {
    const m = new THREE.Matrix4().lookAt(this.ship.position, target, UP);
    const q = new THREE.Quaternion().setFromRotationMatrix(m);
    this.q.slerp(q, Math.min(1, dt * 1.15));
  }

  chase(dt, snap = false) {
    const cam = this.c.cam;
    const goal = this.ship.position.clone().add(V(0, this.camOff[0], this.camOff[1]).applyQuaternion(this.q));
    if (snap || this.first) { cam.position.copy(goal); this.first = false; } else cam.position.lerp(goal, Math.min(1, dt * 6));
    cam.up.copy(UP).applyQuaternion(this.q);
    cam.lookAt(this.ship.position.clone().addScaledVector(this.forward(), 34));
    const sh = this.c.shakeAmt;
    if (sh > 0) cam.position.add(V(rand(-sh, sh), rand(-sh, sh), rand(-sh, sh)));
    cam.fov = lerp(cam.fov, 70, Math.min(1, dt * 4));
    cam.updateProjectionMatrix();
  }
}

// =================================================================== 0 · Cuenta atrás =====
class Intro extends Chapter {
  enter() {
    const c = this.c;
    this.sp = buildSpace();
    c.setScene(this.sp);
    this.sp.station.position.set(1100, 260, -2900);
    this.ship = buildFighter();
    this.sp.scene.add(this.ship);
    this.lastN = 11;
    c.cam.fov = 58;
    c.hud.showCrawl(CRAWL);
    c.hud.fade(0, 1400);
    c.hud.bars(true);
    c.hud.helpText('[Ratón] dirigir · [Clic] disparar · [Clic der.] fijar un caza enemigo · [Shift] turbo');
    c.score.set('calm');
    c.send('start');
  }

  update(dt) {
    super.update(dt);
    const c = this.c, t = this.t;
    const a = 0.7 + t * 0.09;
    c.cam.position.set(Math.sin(a) * 23, 5 + Math.sin(t * 0.5), Math.cos(a) * 23);
    c.cam.lookAt(0, 0.4, -4);
    this.ship.position.y = Math.sin(t * 1.3) * 0.25;
    this.ship.rotation.z = Math.sin(t * 0.9) * 0.05;
    const n = Math.ceil(10 - t);
    if (n !== this.lastN) {
      this.lastN = n;
      if (n > 0) { c.hud.count(n, 'LA MISIÓN EMPIEZA EN'); sfx.beep(n <= 3 ? 1100 : 740); }
    }
    if (t >= 10) c.go('dogfight');
  }

  leave() { this.c.hud.hideCrawl(); this.c.hud.count(null); }
}

// ================================================================ 1 · Combate espacial =====
const KILLS_NEEDED = 6;
class Dogfight extends Chapter {
  enter() {
    const c = this.c;
    this.sp = buildSpace();
    c.setScene(this.sp);
    this.ship = buildFighter();
    this.sp.scene.add(this.ship);
    this.f = new Flight(c, this.ship, 80);
    this.enemies = [];
    this.lasers = [];
    this.eb = [];
    this.kills = 0;
    this.hp = 100;
    this.lock = null;
    this.state = 'fly';
    this.nextShot = 0;
    this.gun = 0;
    this.needsLock = true;
    c.hud.showShip(true);
    c.hud.setShip(100);
    c.hud.helpText('[Ratón] dirigir · [Clic] disparar · [Clic der.] fijar objetivo (ayuda a apuntar) · [Shift] turbo');
    c.hud.title('ESCUADRÓN AZUL', 'Derriba los cazas enemigos', 3500, '#ffe81f');
    c.score.set('space');
    c.cam.fov = 70;
    for (let i = 0; i < 3; i++) this.spawn();
    this.f.chase(0, true);
  }

  spawn() {
    const e = buildEnemy();
    const fwd = this.f.forward();
    e.position.copy(this.ship.position).addScaledVector(fwd, rand(320, 480)).add(V(rand(-150, 150), rand(-70, 70), rand(-100, 100)));
    this.sp.scene.add(e);
    this.enemies.push({ m: e, hp: 3, orbit: rand(0, TAU), speed: rand(58, 82), next: performance.now() + rand(1500, 3000), dead: false });
  }

  toggleLock() {
    const live = this.enemies.filter((e) => !e.dead);
    if (!live.length) return;
    const fwd = this.f.forward(), p = this.ship.position;
    const score = (e) => fwd.dot(e.m.position.clone().sub(p).normalize());
    live.sort((a, b) => score(b) - score(a));
    // Si ya hay uno fijado, pasa al siguiente mejor situado
    const i = this.lock ? (live.indexOf(this.lock) + 1) % live.length : 0;
    this.lock = live[i];
    sfx.beep(1300);
  }

  fire() {
    const now = performance.now();
    if (now < this.nextShot || this.state !== 'fly') return;
    this.nextShot = now + 125;
    const g = this.ship.userData.guns[this.gun++ % 4];
    const o = V(...g).applyMatrix4(this.ship.matrixWorld);
    const m = new THREE.Mesh(new THREE.CylinderGeometry(0.14, 0.14, 6, 6).rotateX(Math.PI / 2), glowMat('#76ff03', 0.95));
    m.position.copy(o);
    m.quaternion.copy(this.ship.quaternion);
    this.sp.scene.add(m);
    this.lasers.push({ m, v: this.f.forward().multiplyScalar(430).add(this.f.vel), life: 1.8 });
    sfx.blaster(0.1);
  }

  enemyShot(from, to) {
    const m = new THREE.Mesh(new THREE.CylinderGeometry(0.2, 0.2, 5, 6).rotateX(Math.PI / 2), glowMat('#ff3b30', 0.95));
    m.position.copy(from);
    m.lookAt(to);
    this.sp.scene.add(m);
    this.eb.push({ m, v: to.clone().sub(from).normalize().multiplyScalar(200), life: 2.6 });
    if (from.distanceTo(this.ship.position) < 160) sfx.foeShot(0.07);
  }

  hurt(n) {
    if (this.state !== 'fly') return;
    this.hp -= n;
    this.c.shake(0.7);
    this.c.hud.hurt();
    sfx.boom(0.18, 0.3);
    this.c.hud.setShip(this.hp);
    if (this.hp <= 0) this.die();
  }

  die() {
    this.state = 'dead';
    this.c.fx.burst(this.ship.position.clone(), 3, '#ff9100');
    this.ship.visible = false;
    sfx.boom(0.6, 1.6);
    this.c.hud.title('¡DERRIBADO!', 'Tu caza ha sido destruido', 0, '#ff5252');
    this.c.hud.buttons([['🔁 Reintentar', () => this.c.go('dogfight')]]);
    if (input.locked) { this.c.game.ignoreUnlock = true; input.unlockPointer(); }
  }

  killEnemy(e) {
    e.dead = true;
    this.c.fx.burst(e.m.position.clone(), 2.2, '#ffab40');
    this.c.fx.ring(e.m.position.clone(), V(0, 1, 0), '#ffd180', 3, 0.6, 14);
    this.sp.scene.remove(e.m);
    sfx.boom(0.35, 0.9);
    this.kills++;
    this.c.shake(0.35);
    if (this.lock === e) this.lock = null;
    if (this.kills >= KILLS_NEEDED && this.state === 'fly') {
      this.state = 'clear';
      this.c.hud.title('¡CAZAS ELIMINADOS!', 'Entrando en la Estación Oscura…', 2600, '#76ff03');
      setTimeout(() => this.c.change('dock', 900), 2200);
    }
  }

  update(dt) {
    super.update(dt);
    const c = this.c, F = this.f, now = performance.now();
    if (this.state === 'dead') { F.chase(dt); this.marks(); return; }
    const ctl = F.steer(dt);
    F.fly(dt, ctl);
    if (ctl.fire && this.state === 'fly') this.fire();
    if (input.pressed('Mouse2') && this.state === 'fly') this.toggleLock();
    if (this.lock?.dead) this.lock = null;
    if (this.lock) F.assist(dt, this.lock.m.position);
    const sp0 = this.ship.position;
    for (const e of this.enemies) {
      if (e.dead) continue;
      e.orbit += dt * 0.6;
      const goal = sp0.clone().add(V(Math.cos(e.orbit) * 80, Math.sin(e.orbit * 1.3) * 38, Math.sin(e.orbit) * 80)).addScaledVector(F.forward(), 105);
      const dir = goal.sub(e.m.position), d = dir.length();
      e.m.position.addScaledVector(dir.normalize(), Math.min(d, (e.speed + (d > 300 ? 90 : 0)) * dt));
      e.m.lookAt(sp0);
      const halo = e.m.userData.halo;
      halo.material.opacity = 0.75 + Math.sin(now / 160 + e.orbit * 4) * 0.2;
      if (now >= e.next && e.m.position.distanceTo(sp0) < 340 && this.state === 'fly') {
        e.next = now + rand(1200, 2400);
        this.enemyShot(e.m.position.clone(), sp0.clone().addScaledVector(F.vel, 0.4).add(V(rand(-9, 9), rand(-9, 9), rand(-9, 9))));
      }
    }
    if (this.state === 'fly' && this.enemies.filter((e) => !e.dead).length < Math.min(3, KILLS_NEEDED - this.kills)) this.spawn();
    // Láseres propios (con guiado suave hacia el objetivo fijado)
    for (let i = this.lasers.length - 1; i >= 0; i--) {
      const l = this.lasers[i];
      if (this.lock && !this.lock.dead) {
        const want = this.lock.m.position.clone().sub(l.m.position).normalize().multiplyScalar(430);
        l.v.lerp(want, Math.min(1, dt * 3.2));
        l.m.lookAt(l.m.position.clone().add(l.v));
      }
      l.m.position.addScaledVector(l.v, dt);
      l.life -= dt;
      let hit = false;
      for (const e of this.enemies) {
        if (!e.dead && e.m.position.distanceTo(l.m.position) < 6) {
          hit = true;
          e.hp--;
          if (e.hp <= 0) this.killEnemy(e); else c.fx.burst(l.m.position.clone(), 0.5, '#ffe082');
          break;
        }
      }
      if (hit || l.life <= 0) { this.sp.scene.remove(l.m); l.m.geometry.dispose(); this.lasers.splice(i, 1); }
    }
    for (let i = this.eb.length - 1; i >= 0; i--) {
      const b = this.eb[i];
      b.m.position.addScaledVector(b.v, dt);
      b.life -= dt;
      const hit = this.state === 'fly' && b.m.position.distanceTo(sp0) < 3.6;
      if (hit) this.hurt(9);
      if (hit || b.life <= 0) { this.sp.scene.remove(b.m); b.m.geometry.dispose(); this.eb.splice(i, 1); }
    }
    for (const e of ctl.boost ? this.ship.userData.engines : this.ship.userData.engines) e.material.color.set(ctl.boost ? '#ffffff' : '#ff8a65');
    if (this.state === 'fly') c.hud.objective(`Cazas derribados: ${this.kills} / ${KILLS_NEEDED}${this.lock ? '   ·   🎯 objetivo fijado' : ''}`);
    F.chase(dt);
    this.marks();
  }

  /** Marcadores rojos sobre los enemigos (y flechas en el borde si están fuera de pantalla) + mira. */
  marks() {
    const c = this.c, W = innerWidth, H = innerHeight, cam = c.cam;
    cam.updateMatrixWorld();
    let i = 0;
    for (const e of this.enemies) {
      if (e.dead) continue;
      const v = e.m.position.clone().project(cam);
      const behind = v.z > 1;
      let x = behind ? -v.x : v.x, y = behind ? -v.y : v.y;
      const on = !behind && Math.abs(x) < 0.94 && Math.abs(y) < 0.9;
      const dist = Math.round(e.m.position.distanceTo(this.ship.position));
      if (on) c.hud.mark(i++, (x * 0.5 + 0.5) * W, (-y * 0.5 + 0.5) * H, { lock: e === this.lock, text: `${dist} m` });
      else {
        const m = Math.max(Math.abs(x), Math.abs(y), 1e-4);
        x = (x / m) * 0.9;
        y = (y / m) * 0.82;
        c.hud.mark(i++, (x * 0.5 + 0.5) * W, (-y * 0.5 + 0.5) * H, { edge: true, rot: Math.atan2(-y, x), lock: e === this.lock });
      }
    }
    c.hud.hideMarks(i);
    const p = this.ship.position.clone().addScaledVector(this.f.forward(), 160).project(cam);
    if (this.state === 'fly') { c.hud.crossOn(true, !!this.lock); c.hud.crossPos((p.x * 0.5 + 0.5) * W, (-p.y * 0.5 + 0.5) * H); } else c.hud.crossOn(false);
  }

  leave() { this.c.hud.hideMarks(); this.c.hud.crossPos(null); this.c.hud.crossOn(false); }
}

// ================================================================== 2 · Entrada y aterrizaje =====
class Dock extends Chapter {
  enter() {
    const c = this.c;
    this.phase = 'approach';
    this.sp = buildSpace();
    c.setScene(this.sp);
    const R = 520;
    this.sp.station.position.set(0, 0, -(R + 980));
    // Compuerta del hangar en la superficie
    const mouth = new THREE.Group();
    const field = new THREE.Mesh(new THREE.PlaneGeometry(110, 54), new THREE.MeshBasicMaterial({ color: '#7fd6ff', transparent: true, opacity: 0.7, blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.DoubleSide }));
    const frame = new THREE.Mesh(new THREE.BoxGeometry(124, 68, 6), new THREE.MeshStandardMaterial({ color: '#1d2228', emissive: '#ff9100', emissiveIntensity: 0.9 }));
    frame.position.z = -3.4;
    mouth.add(frame, field, glowSprite('#9fe3ff', 260));
    mouth.position.set(0, 0, -(980 - 2));
    this.sp.scene.add(mouth);
    this.field = field;
    this.ship = buildFighter();
    this.sp.scene.add(this.ship);
    c.hud.bars(true);
    c.hud.skip(() => { this.t = 99; });
    c.hud.caption('Control de la estación: «Caza rebelde identificado… autorizado a aterrizar. ¿Es una trampa?»', 4200);
    c.score.set('tense');
    this.camA = rail([
      { t: 0, p: [-26, 8, 30], l: [0, 0, 0], fov: 58 },
      { t: 2.6, p: [30, 5, 16], l: [0, 0, -10], fov: 54 },
      { t: 5.4, p: [3, 4, 18], l: [0, 0, -60], fov: 66 },
    ]);
    this.hang = null;
  }

  update(dt) {
    super.update(dt);
    const c = this.c, t = this.t;
    if (this.phase === 'approach') {
      this.ship.position.set(0, 0, -t * t * 8.5 - t * 120);
      this.ship.rotation.z = Math.sin(t * 1.4) * 0.12;
      const k = this.camA(Math.min(t, 5.4));
      const sp = this.ship.position;
      c.cam.position.set(sp.x + k.p.x, sp.y + k.p.y, sp.z + k.p.z);
      c.cam.lookAt(sp.x + k.l.x, sp.y + k.l.y, sp.z + k.l.z);
      c.cam.fov = k.fov;
      c.cam.updateProjectionMatrix();
      this.field.material.opacity = 0.6 + Math.sin(t * 8) * 0.12;
      if (this.ship.position.z < -946 || t >= 99) {
        this.phase = 'inside';
        this.t = 0;
        c.hud.whiteFlash(900);
        sfx.whoosh();
        this.setupInside();
      }
      return;
    }
    // Dentro del hangar: el caza entra, frena y aterriza; el piloto baja
    const k = ease(clamp(this.t / 4.6, 0, 1));
    const sh = this.ship;
    sh.position.set(-22, lerp(11, 1.5, k) + Math.sin(this.t * 3) * 0.08 * (1 - k), lerp(66, 14, k));
    sh.rotation.set(lerp(0.08, 0, k), 0, 0);
    for (const e of sh.userData.engines) e.material.color.set(k < 0.9 ? '#ffb199' : '#8d6e63');
    const cp = rail([
      { t: 0, p: [12, 5, 44], l: [-22, 8, 60], fov: 62 },
      { t: 3, p: [10, 4, 30], l: [-22, 4, 30], fov: 56 },
      { t: 5.8, p: [-9, 2.4, 24], l: [-19, 2, 13], fov: 52 },
      { t: 7.2, p: [-14, 2.6, 24], l: [-19, 2.2, 12], fov: 52 },
    ])(this.t);
    c.cam.position.copy(cp.p);
    c.cam.lookAt(cp.l);
    c.cam.fov = cp.fov;
    c.cam.updateProjectionMatrix();
    if (this.t > 4.8 && !this.out) {
      this.out = true;
      const A = this.arena;
      A.hero.model.root.visible = true;
      A.hero.pos.set(-17.5, 0, 12);
      A.hero.yaw = 0.2;
      A.hero.syncModel(0, 0);
      A.hero.ignite();
      c.fx.spark(V(-18, 2, 13), '#80d8ff', 14, 5);
      sfx.whoosh();
      c.hud.caption('Nada se mueve… demasiado tranquilo. Enciende el sable.', 3800);
    }
    if (this.t >= 7.2 || this.t >= 99) c.go('hangar');
  }

  setupInside() {
    const c = this.c;
    const built = buildHangar();
    c.cache.hangar = built;
    c.setScene(built);
    this.ship = buildFighter();
    this.ship.userData.engines.forEach((e) => e.material.color.set('#ffb199'));
    built.scene.add(this.ship);
    this.ship.position.set(-22, 11, 66);
    this.arena = new Arena(c, built, { pos: V(-17.5, 0, 12), yaw: 0.2 });
    this.arena.hero.model.root.visible = false;
    this.arena.cameraEnabled = false;
    c.cache.arena = this.arena;
    c.cache.ship = this.ship;
    c.hud.caption('', 1);
    this.out = false;
    c.hud.fade(0, 500);
  }
}

// ================================================================= 3 · Hangar (oleadas) =====
class Hangar extends Chapter {
  enter() {
    const c = this.c;
    this.built = c.cache.hangar;
    this.A = c.cache.arena;
    c.setScene(this.built);
    c.hud.fade(0, 400);
    this.A.cameraEnabled = true;
    this.A.hero.model.root.visible = true;
    c.frozen = false;
    c.game.cam.yaw = 0.1;
    c.game.cam.pitch = 0.32;
    c.hud.showStats(true);
    c.hud.setHp(this.A.hero.hp, this.A.hero.max);
    this.wave = 0;
    this.state = 'start';
    this.timer = 2.5;
    this.needsLock = true;
    this.reinf = 0;
    this.A.onHeroDead = () => this.heroDead();
    c.score.set('tense');
    c.hud.helpText('[WASD] mover · [Clic] sable · [Clic der.] desviar disparos (máx. 6) · [2] bláster · [1] sable · [Espacio] esquivar');
    c.hud.objective('Sobrevive a las oleadas imperiales');
    if (this.A.hero.want === 'saber' && this.A.hero.rig.k < 0.5) this.A.hero.ignite();
  }

  spawnWave() {
    const c = this.c, A = this.A, sp = this.built.spawns;
    let i = 0;
    const at = (n) => { const s = sp[n % sp.length]; return V(s[0] + rand(-3, 3), 0, s[1] + rand(-3, 3)); };
    if (this.wave === 0) {
      for (let k = 0; k < 3; k++) A.spawn('droid', at(i++));
      for (let k = 0; k < 2; k++) A.spawn('staff', at(i++));
      c.hud.title('OLEADA 1', 'Droides de combate', 2800, '#ffe81f');
      c.hud.caption('¡Droides de seguridad! Usa el sable y desvía sus disparos con el clic derecho.', 4200);
    } else {
      for (let k = 0; k < 5; k++) A.spawn('trooper', at(i++));
      c.hud.title('OLEADA 2', 'Soldados imperiales', 2800, '#ffe81f');
      c.hud.caption('¡Soldados imperiales! Si el sable se sobrecalienta, saca el bláster [2].', 4200);
      this.reinf = 11;
    }
    if (this.wave === 0) this.reinf = 0;
    sfx.alarm();
    for (const f of A.foes) c.fx.spark(f.pos.clone().add(V(0, 1, 0)), '#ff5252', 12, 6);
    this.state = 'wave';
  }

  heroDead() {
    const c = this.c;
    c.hud.title('HAS CAÍDO', '', 0, '#ff5252');
    c.hud.buttons([['🔁 Reintentar oleada', () => this.retry()]]);
    if (input.locked) { c.game.ignoreUnlock = true; input.unlockPointer(); }
  }

  retry() {
    const A = this.A, c = this.c;
    A.clear();
    A.hero.revive(V(-17.5, 0, 12), 0.2);
    c.hud.title('');
    c.hud.buttons(null);
    this.state = 'start';
    this.timer = 1.5;
    this.reinf = 0;
  }

  update(dt) {
    super.update(dt);
    const c = this.c, A = this.A, H = A.hero;
    A.update(dt);
    if (this.state === 'start') { this.timer -= dt; if (this.timer <= 0) this.spawnWave(); }
    else if (this.state === 'wave') {
      let left = A.alive().length;
      if (this.wave === 1 && this.reinf > 0) {
        this.reinf -= dt;
        if (this.reinf <= 0 || left === 0) {
          this.reinf = -1;
          const sp = this.built.spawns;
          for (let k = 0; k < 3; k++) { const s = sp[(k * 3 + 1) % sp.length]; A.spawn('trooper', V(s[0], 0, s[1])); }
          c.hud.caption('¡Llegan refuerzos!', 2200);
          sfx.alarm();
          left = A.alive().length;
        }
      }
      c.hud.objective(`Enemigos: ${left}`);
      if (left === 0 && this.reinf <= 0) {
        this.wave++;
        if (this.wave === 1) { this.state = 'start'; this.timer = 3.5; H.hp = Math.min(H.max, H.hp + 45); c.hud.caption('Oleada superada. ¡Cuidado, vienen más!', 3000); }
        else {
          this.state = 'clear';
          this.built.state.doorOpen = true;
          sfx.beep(990);
          c.hud.title('¡HANGAR DESPEJADO!', 'La compuerta norte se abre', 3200, '#76ff03');
          c.hud.objective('Avanza por el pasillo hasta el núcleo →');
          H.hp = Math.min(H.max, H.hp + 50);
        }
      }
    } else if (this.state === 'clear' && H.pos.z < this.built.triggerZ && !this.leaving) {
      this.leaving = true;
      c.change('core', 800);
    }
  }

  leave() { this.A && (this.A.onHeroDead = null); }
}

// ============================================================ 4 · Núcleo y huida =====
class Core extends Chapter {
  enter() {
    const c = this.c;
    this.built = buildCore();
    c.cache.core = this.built;
    c.setScene(this.built);
    const old = c.cache.arena;
    this.A = new Arena(c, this.built, { pos: V(0, 0, 36), yaw: Math.PI });
    // El héroe conserva su vida y arma
    this.A.hero.hp = old ? Math.max(old.hero.hp, 70) : this.A.hero.hp;
    this.A.hero.want = 'blaster';
    this.A.hero.weapon = 'blaster';
    this.A.hero.rig.root.visible = false;
    this.A.hero.gun.visible = true;
    this.A.hero.rig.setLen(0);
    this.A.hero.bladeGoal = 0;
    old?.dispose();
    c.cache.arena = this.A;
    this.A.onHeroDead = () => this.heroDead();
    const st = this.built.state;
    const C = this.built.center;
    this.A.targets.push({
      test: (o, d) => { if (st.hp <= 0 || Math.abs(d.z) < 1e-4) return null; const t = (C.z - o.z) / d.z; if (t < 0) return null; const p = o.clone().addScaledVector(d, t); return Math.hypot(p.x - C.x, p.y - C.y) < 17.5 ? t : null; },
      onHit: (p, dmg) => this.hitCore(p, dmg),
    });
    c.game.cam.yaw = 0;
    c.game.cam.pitch = 0.3;
    c.hud.fade(0, 700);
    c.hud.showStats(true);
    c.hud.setHp(this.A.hero.hp, this.A.hero.max);
    c.hud.title('EL NÚCLEO', 'Dispara al generador magnético con el bláster', 3600, '#ffe81f');
    c.hud.objective('Destruye el generador magnético');
    c.hud.helpText('[Clic] disparar (apunta al anillo) · [Clic der.] desviar con el sable · [1] sable · [Espacio] esquivar');
    c.hud.caption('Ahí está: el generador. Dispárale hasta que empiece a soltar chispas.', 4200);
    c.score.set('tense');
    this.phase = 'shoot';
    this.needsLock = true;
    this.reinf = 4;
    this.sparkT = 0;
    this.run = 0;
  }

  hitCore(p, dmg) {
    const st = this.built.state;
    if (this.phase !== 'shoot') return;
    st.hp = Math.max(0, st.hp - dmg);
    this.c.fx.spark(p, '#b3e5fc', 10, 9);
    sfx.zap();
    this.c.hud.boss('⚡ ESTABILIDAD DEL NÚCLEO', st.hp, 100);
    if (st.hp <= 0) this.overload();
  }

  overload() {
    const c = this.c, st = this.built.state, A = this.A;
    this.phase = 'run';
    st.alarm = true;
    st.doorOpen = true;
    this.run = 34;
    c.hud.whiteFlash(1000);
    c.shake(1.2);
    sfx.boom(0.8, 2.5);
    for (const f of A.foes) if (!f.dead) f.die();
    A.enemiesFire = false;
    c.fx.burst(this.built.center.clone(), 7, '#80d8ff');
    c.fx.ring(this.built.center.clone(), V(0, 0, 1), '#80d8ff', 4, 1.4, 14);
    c.hud.boss(null);
    c.hud.title('¡NÚCLEO INESTABLE!', '¡CORRE A LA COMPUERTA DEL ESTE!', 3600, '#ff5252');
    c.hud.objective('Llega al Halcón antes de que la estación explote →');
    c.hud.caption('¡Va a explotar! ¡Por el pasillo del este, rápido!', 3600);
    c.score.set('boss');
    if (A.hero.want === 'blaster') { /* con el bláster se corre igual */ }
    this.boomT = 0;
  }

  heroDead() {
    const c = this.c;
    c.hud.title('HAS CAÍDO', '', 0, '#ff5252');
    c.hud.buttons([['🔁 Reintentar', () => this.retry()]]);
    if (input.locked) { c.game.ignoreUnlock = true; input.unlockPointer(); }
  }

  retry() {
    const A = this.A, c = this.c;
    A.clear();
    A.hero.revive(this.phase === 'run' ? V(30, 0, 0) : V(0, 0, 36), this.phase === 'run' ? Math.PI / 2 : Math.PI);
    c.hud.title('');
    c.hud.buttons(null);
    if (this.phase === 'run') { this.run = 34; A.enemiesFire = false; }
  }

  update(dt) {
    super.update(dt);
    const c = this.c, A = this.A, st = this.built.state;
    A.update(dt);
    if (this.phase === 'shoot') {
      this.reinf -= dt;
      if (this.reinf <= 0) {
        this.reinf = 11;
        if (A.alive().length < 3) {
          const sp = this.built.spawns;
          for (let k = 0; k < 2; k++) { const s = sp[Math.floor(rand(0, sp.length))]; A.spawn('trooper', V(s[0] + rand(-3, 3), 0, s[1])); }
          sfx.alarm();
        }
      }
      // Chispas y humo cada vez más fuertes según se desestabiliza
      const unstable = 1 - st.hp / 100;
      this.sparkT -= dt;
      if (unstable > 0.3 && this.sparkT <= 0) {
        this.sparkT = lerp(0.5, 0.1, unstable);
        const p = this.built.center.clone().add(V(rand(-16, 16), rand(-16, 16), rand(0, 3)));
        c.fx.spark(p, unstable > 0.66 ? '#ffab40' : '#b3e5fc', 12, 10);
        if (unstable > 0.66) c.fx.smoke(p, 1, '#333');
        sfx.zap();
        c.shake(0.1 * unstable);
      }
      if (unstable > 0.3 && !this.warned1) { this.warned1 = true; c.hud.caption('¡Está soltando chispas! ¡Sigue disparando!', 3000); }
      if (unstable > 0.66 && !this.warned2) { this.warned2 = true; c.hud.caption('¡Casi está! ¡Un poco más!', 2500); }
    } else if (this.phase === 'run') {
      this.run -= dt;
      c.hud.timer(`⏱ ${Math.max(0, Math.ceil(this.run))} s`);
      this.boomT -= dt;
      c.shake(0.22);
      if (this.boomT <= 0) {
        this.boomT = 0.28;
        const h = A.hero.pos;
        const ahead = h.x > 40 ? 1 : 0;
        const p = V(h.x + rand(-8, 22) * (ahead ? 1 : 0.5), rand(1, 10), ahead ? rand(-5, 5) : h.z + rand(-14, 14));
        c.fx.burst(p, rand(0.8, 1.7), Math.random() < 0.5 ? '#ff7043' : '#ffca28');
        if (Math.random() < 0.4) sfx.boom(0.18, 0.5);
      }
      if (A.hero.pos.x > this.built.cx1 + 12 && !this.leaving) {
        this.leaving = true;
        c.hud.timer(null);
        c.change('escape', 500);
      } else if (this.run <= 0 && !A.hero.dead) {
        this.run = 34;
        c.hud.caption('¡Demasiado lento! Otra vez, ¡corre!', 2600);
        A.hero.pos.set(30, 0, 0);
        c.hud.whiteFlash(500);
      }
    }
  }

  leave() { this.c.hud.timer(null); this.c.hud.boss(null); this.A && (this.A.onHeroDead = null); }
}

// =========================================================== 5 · Huida y explosión =====
class Escape extends Chapter {
  enter() {
    const c = this.c;
    const R = 520;
    this.R = R;
    this.sp = buildSpace();
    c.setScene(this.sp);
    this.sp.station.position.set(0, 0, 0);
    this.sp.planet.position.set(-3400, -1800, 2400);
    this.falcon = buildFalcon();
    this.falcon.rotation.y = Math.PI;
    this.sp.scene.add(this.falcon);
    this.st = 0;
    this.END = 15;
    c.cache.arena?.dispose();
    c.cache.arena = null;
    c.hud.bars(true);
    c.hud.skip(() => { this.st = this.END; });
    c.hud.fade(0, 400);
    c.hud.caption('¡Agárrate! ¡Salimos de aquí!', 3000);
    c.score.set('boss');
    c.timeScale = 1;
    sfx.whoosh();
    // Bahía de salida
    const bay = new THREE.Mesh(new THREE.PlaneGeometry(70, 34), new THREE.MeshBasicMaterial({ color: '#9fe3ff', transparent: true, opacity: 0.55, blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.DoubleSide }));
    bay.position.set(0, 0, R + 1.5);
    this.sp.scene.add(bay);
    this.cracks = [];
    // Escombros: una malla instanciada que sale despedida
    const n = 260;
    this.deb = new THREE.InstancedMesh(new THREE.BoxGeometry(1, 1, 1), new THREE.MeshStandardMaterial({ color: '#8a9099', roughness: 0.8, metalness: 0.5, emissive: '#ff6a1a', emissiveIntensity: 0.6 }), n);
    this.deb.visible = false;
    this.deb.frustumCulled = false;
    this.sp.scene.add(this.deb);
    this.debData = Array.from({ length: n }, () => { const d = V().randomDirection(); return { d, speed: rand(70, 330), spin: V(rand(-3, 3), rand(-3, 3), rand(-3, 3)), s: rand(2, 16), rot: V() }; });
    this.fireball = new THREE.Mesh(new THREE.SphereGeometry(1, 40, 24), new THREE.MeshBasicMaterial({ color: '#fff3d6', transparent: true, opacity: 1, depthWrite: false }));
    this.fireShell = new THREE.Mesh(new THREE.SphereGeometry(1, 32, 20), glowMat('#ff6a10', 0.7));
    this.bloom = glowSprite('#ff9a30', 1);
    this.fireball.visible = this.fireShell.visible = this.bloom.visible = false;
    this.rings = [0, 1].map((i) => { const r = new THREE.Mesh(new THREE.TorusGeometry(1, 0.025, 8, 120), glowMat(i ? '#ff9e40' : '#bfeaff', 0.9)); r.visible = false; r.rotation.set(Math.PI / 2 + (i ? 0.5 : -0.2), 0, i ? 0.4 : 0); this.sp.scene.add(r); return r; });
    this.sp.scene.add(this.fireball, this.fireShell, this.bloom);
    this.blast = false;
    this.nextCrack = 5.6;
    this.camK = rail([
      { t: 0, p: [-22, 8, 26], l: [0, 0, -2], fov: 62 },
      { t: 3.6, p: [18, 5, 24], l: [0, 1, 0], fov: 58 },
      { t: 8.2, p: [-24, 9, 46], l: [0, 0, 0], fov: 60 },
      { t: 15, p: [-80, 26, 190], l: [0, 0, 0], fov: 66 },
    ]);
  }

  update(dt) {
    const c = this.c, R = this.R;
    const slow = this.st > 8.4 && this.st < 12 ? 0.35 : 1;
    const sdt = dt * slow;
    this.t += dt;
    this.st += sdt;
    const T = this.st;
    // El Halcón acelera alejándose de la estación
    const z = R + 10 + 16 * T + 5.2 * T * T;
    this.falcon.position.set(Math.sin(T * 0.7) * 6, T * 3.2, z);
    this.falcon.rotation.set(Math.sin(T * 0.9) * 0.05, Math.PI, Math.sin(T * 0.6) * 0.1);
    this.falcon.userData.setEngine(1);
    // Cámara
    const k = this.camK(Math.min(T, this.END));
    const fp = this.falcon.position;
    c.cam.position.set(fp.x + k.p.x, fp.y + k.p.y, fp.z + k.p.z * (T > 8.2 ? 0.55 : 1));
    const look = fp.clone().lerp(V(0, 0, 0), clamp((T - 7.4) / 2.2, 0, 0.82));
    c.cam.lookAt(look.add(k.l));
    c.cam.fov = k.fov;
    c.cam.updateProjectionMatrix();
    if (this.blastT != null) { const sh = Math.max(0, 1.1 - this.blastT * 0.45); c.cam.position.add(V(rand(-sh, sh), rand(-sh, sh), rand(-sh, sh)).multiplyScalar(3)); }
    // Grietas que se iluminan y estallan por la superficie
    if (T > this.nextCrack && T < 8.4) {
      this.nextCrack += 0.22;
      const dirv = V().randomDirection();
      if (dirv.z < -0.1) dirv.z *= -1;
      const p = dirv.multiplyScalar(R * 1.002);
      const g = glowSprite(Math.random() < 0.5 ? '#ff7a1a' : '#ffd54a', rand(60, 150));
      g.position.copy(p);
      this.sp.scene.add(g);
      c.fx.burst(p, rand(6, 12), '#ff9100');
      sfx.boom(0.12, 0.6);
      c.shake(0.4);
    }
    if (T >= 8.4 && !this.blast) this.explode();
    if (this.blast) this.blastUpdate(sdt);
    if (T > 3 && !this.said1) { this.said1 = true; c.hud.caption('Detonación en tres… dos…', 3000); }
    if (T > 8.6 && !this.said2) { this.said2 = true; c.hud.caption('', 1); }
    if (T >= 13.2 && !this.fading) { this.fading = true; c.hud.fade(1, 1300); }
    if (T >= this.END) { this.END = 1e9; c.go('drift'); c.hud.fade(0, 1500); }
    c.timeScale = 1;
    this.c.fx.update(0);
  }

  explode() {
    const c = this.c, R = this.R;
    this.blast = true;
    this.blastT = 0;
    c.hud.whiteFlash(1600);
    sfx.boom(1, 4);
    c.score.set('doom');
    this.sp.station.visible = false;
    for (const s of this.sp.scene.children.filter((o) => o.isSprite && o.position.length() > R * 0.9 && o.position.length() < R * 1.1)) this.sp.scene.remove(s);
    this.fireball.visible = this.fireShell.visible = this.bloom.visible = true;
    this.deb.visible = true;
    for (const r of this.rings) r.visible = true;
    c.fx.points(V(0, 0, 0), 1400, '#ffb74d', 9, 330, 3.4, 0);
    c.fx.points(V(0, 0, 0), 700, '#fff3e0', 12, 160, 3, 0);
    c.hud.title('💥', '', 2200, '#ffffff');
  }

  blastUpdate(dt) {
    this.blastT += dt;
    const t = this.blastT, R = this.R;
    const s = R * (0.12 + t * 0.62);
    this.fireball.scale.setScalar(s);
    this.fireball.material.opacity = Math.max(0, 1 - t / 2.6);
    this.fireball.material.color.lerp(V3C('#ff7a1a'), dt * 1.1);
    this.fireShell.scale.setScalar(s * 1.3);
    this.fireShell.material.opacity = Math.max(0, 0.7 - t / 4);
    this.bloom.scale.setScalar(R * (3 + t * 1.5));
    this.bloom.material.opacity = Math.max(0, 1 - t / 4.5);
    this.rings.forEach((r, i) => { const sc = R * (0.3 + t * (i ? 0.95 : 1.4)); r.scale.set(sc, sc, sc); r.material.opacity = Math.max(0, 0.9 - t / (i ? 4 : 3)); });
    const m = new THREE.Matrix4(), q = new THREE.Quaternion(), e = new THREE.Euler(), p = V(), sc = V();
    this.debData.forEach((d, i) => {
      d.rot.addScaledVector(d.spin, dt);
      p.copy(d.d).multiplyScalar(R * 0.3 + d.speed * t);
      e.set(d.rot.x, d.rot.y, d.rot.z);
      q.setFromEuler(e);
      sc.setScalar(d.s * Math.max(0.2, 1 - t / 7));
      m.compose(p, q, sc);
      this.deb.setMatrixAt(i, m);
    });
    this.deb.instanceMatrix.needsUpdate = true;
  }

  leave() { this.c.timeScale = 1; }
}
const V3C = (c) => new THREE.Color(c);

// ==================================================== 6 · A la deriva y fallo de motores =====
class Drift extends Chapter {
  enter() {
    const c = this.c;
    const scene = new THREE.Scene();
    const bd = addSpaceBackdrop(scene, { dark: true });
    this.sp = { scene, follow: bd.follow };
    // Restos de la explosión y planeta hogar al fondo
    const n = 600, pos = new Float32Array(n * 3);
    for (let i = 0; i < n; i++) pos.set([rand(-700, 700), rand(-300, 300), rand(-900, 500)], i * 3);
    const dg = new THREE.BufferGeometry();
    dg.setAttribute('position', new THREE.BufferAttribute(pos, 3));
    scene.add(new THREE.Points(dg, new THREE.PointsMaterial({ color: '#ffb74d', size: 3.2, sizeAttenuation: false, transparent: true, opacity: 0.8, fog: false })));
    this.chunks = [];
    for (let i = 0; i < 40; i++) {
      const m = new THREE.Mesh(new THREE.DodecahedronGeometry(rand(2, 9)), new THREE.MeshStandardMaterial({ color: '#7b8088', roughness: 0.9, emissive: '#ff4a10', emissiveIntensity: 0.25 }));
      m.position.set(rand(-500, 500), rand(-220, 220), rand(-700, 300));
      scene.add(m);
      this.chunks.push({ m, s: V(rand(-1, 1), rand(-1, 1), rand(-1, 1)) });
    }
    const remains = glowSprite('#ff7a1a', 900);
    remains.position.set(0, 0, 1500);
    scene.add(remains);
    this.home = new THREE.Mesh(new THREE.SphereGeometry(380, 40, 24), new THREE.MeshStandardMaterial({ color: '#d9a066', roughness: 1, emissive: '#3a2008', emissiveIntensity: 0.55 }));
    this.home.position.set(380, -60, -3400);
    const atm = new THREE.Mesh(new THREE.SphereGeometry(398, 24, 16), glowMat('#8fd3ff', 0.2));
    atm.position.copy(this.home.position);
    scene.add(this.home, atm);
    c.setScene(this.sp);
    this.ship = buildFalcon();
    scene.add(this.ship);
    this.ship.rotation.y = 0;
    this.f = new Flight(c, this.ship, 70, [7, 34]);
    this.f.chase(0, true);
    c.hud.fade(0, 1200);
    c.hud.title('TODO QUEDA EN SILENCIO…', '', 3200, '#ffffff');
    c.hud.objective('Pon rumbo al planeta hogar 🏠');
    c.hud.helpText('[Ratón] o [WASD] pilotar el Halcón · [Shift] turbo');
    c.hud.showShip(true);
    c.hud.setShip(100);
    c.score.set('doom');
    this.needsLock = true;
    this.fail = false;
    this.spin = V();
  }

  update(dt) {
    super.update(dt);
    const c = this.c, t = this.t;
    this.chunks.forEach((o) => { o.m.rotation.x += o.s.x * dt * 0.3; o.m.rotation.y += o.s.y * dt * 0.3; });
    if (!this.fail) {
      const ctl = this.f.steer(dt);
      this.f.fly(dt, ctl, 70);
      this.ship.userData.setEngine(1);
      if (t > 8.5) this.failure();
    } else {
      // Sin motores: el Halcón da vueltas sin control
      this.spin.x += dt * 0.15; this.spin.z += dt * 0.35;
      this.f.q.multiply(new THREE.Quaternion().setFromEuler(new THREE.Euler(dt * 0.25 * Math.sin(t), dt * 0.12, dt * 0.5)));
      this.f.fly(dt, { yaw: 0, pitch: 0, boost: false }, Math.max(18, 70 - (t - 8.5) * 22));
      this.ship.userData.setEngine(Math.random() < 0.15 ? 1 : 0);
      c.hud.setShip(Math.max(8, 40 - (t - 8.5) * 5));
      if (Math.sin(t * 9) > 0.8) c.shake(0.12);
      if (t > 12.5 && !this.leaving) { this.leaving = true; c.change('crash', 900); }
    }
    this.f.chase(dt);
    // Marcador del planeta hogar
    const v = this.home.position.clone().project(c.cam);
    const W = innerWidth, H = innerHeight;
    if (v.z < 1 && Math.abs(v.x) < 1 && Math.abs(v.y) < 1) c.hud.mark(0, (v.x * 0.5 + 0.5) * W, (-v.y * 0.5 + 0.5) * H, { text: `🏠 HOGAR · ${Math.round(this.home.position.distanceTo(this.ship.position))} m` });
    else c.hud.hideMarks(0);
  }

  failure() {
    const c = this.c;
    this.fail = true;
    sfx.alarm();
    sfx.boom(0.4, 1.2);
    c.shake(0.8);
    c.hud.title('⚠ FALLO DE MOTORES', 'Sistemas dañados · pérdida de control', 3500, '#ff5252');
    c.hud.objective('¡Los motores han fallado!');
    c.hud.caption('El campo de fuerza de la explosión ha dañado los motores… ¡nos caemos!', 4200);
    c.hud.hideMarks(0);
    c.score.set('doom');
  }

  leave() { this.c.hud.hideMarks(); }
}

// =================================================================== 7 · La caída =====
class Crash extends Chapter {
  enter() {
    const c = this.c;
    const scene = new THREE.Scene();
    scene.background = new THREE.Color('#02030a');
    const bd = addSpaceBackdrop(scene, { dark: true });
    this.sp = { scene, follow: bd.follow };
    const rock = canvasTex(512, 512, (g) => {
      g.fillStyle = '#1b1512'; g.fillRect(0, 0, 512, 512);
      for (let i = 0; i < 500; i++) { const v = 24 + Math.random() * 30; g.fillStyle = `rgb(${v},${v - 5},${v - 8})`; g.fillRect(Math.random() * 512, Math.random() * 512, 10 + Math.random() * 60, 8 + Math.random() * 34); }
      g.strokeStyle = '#ff6a1a'; g.lineWidth = 3; g.shadowColor = '#ff4a00'; g.shadowBlur = 10;
      for (let i = 0; i < 20; i++) { g.beginPath(); let x = Math.random() * 512, y = Math.random() * 512; g.moveTo(x, y); for (let k = 0; k < 9; k++) { x += rand(-60, 60); y += rand(-60, 60); g.lineTo(x, y); } g.stroke(); }
    }, [90, 90]);
    this.planet = new THREE.Mesh(new THREE.SphereGeometry(3000, 64, 40), new THREE.MeshStandardMaterial({ map: rock, color: '#b0a09a', roughness: 1, emissive: '#ff4a10', emissiveMap: rock, emissiveIntensity: 0.35 }));
    this.planet.position.set(17, -3000, -129);
    this.atm = new THREE.Mesh(new THREE.SphereGeometry(3120, 40, 24), new THREE.MeshBasicMaterial({ color: '#ff6a3a', transparent: true, opacity: 0.22, side: THREE.BackSide, blending: THREE.AdditiveBlending, depthWrite: false }));
    this.atm.position.copy(this.planet.position);
    scene.add(this.planet, this.atm);
    this.glowL = new THREE.PointLight('#ff6a1a', 0, 900, 1.2);
    scene.add(this.glowL);
    c.setScene(this.sp);
    this.ship = buildFalcon();
    this.ship.userData.setEngine(0);
    scene.add(this.ship);
    this.fire = glowSprite('#ff7a1a', 40);
    this.ship.add(this.fire);
    this.fire.position.set(0, 0, -6);
    this.fire.visible = false;
    this.END = 11.5;
    c.hud.bars(true);
    c.hud.skip(() => { this.t = this.END; });
    c.hud.fade(0, 900);
    c.hud.caption('¡Entramos en la atmósfera! ¡Sin motores!', 3600);
    c.score.set('doom');
    this.camK = rail([
      { t: 0, p: [-12, 12, 34], l: [0, 0, 0], fov: 62 },
      { t: 6, p: [22, 18, 40], l: [0, -6, 0], fov: 66 },
      { t: 9.6, p: [34, 8, 20], l: [0, -3, -8], fov: 72 },
      { t: 11.5, p: [40, 6, 18], l: [0, -2, 0], fov: 74 },
    ]);
    this.impact = false;
    this.smokeT = 0;
  }

  update(dt) {
    super.update(dt);
    const c = this.c, t = this.t;
    const u = clamp(t / 9.2, 0, 1);
    const y = Math.max(1.8, 1700 * (1 - Math.pow(u, 1.55)));
    this.ship.position.set(Math.sin(t * 0.5) * 20 + t * 4, y, -t * 14);
    this.ship.rotation.set(0.5 + Math.sin(t * 1.2) * 0.2, t * 0.7, Math.sin(t * 1.9) * 0.6 + t * 0.4);
    if (this.impact) { this.ship.position.y = 1.8; this.ship.rotation.set(0.15, 0.7, -0.2); }
    // Fuego de reentrada
    const alt = this.ship.position.y;
    this.fire.visible = alt < 800 && !this.impact;
    this.fire.scale.setScalar(lerp(120, 30, clamp(alt / 800, 0, 1)) * (1 + Math.sin(t * 40) * 0.08));
    this.glowL.position.copy(this.ship.position);
    this.glowL.intensity = this.fire.visible ? 40 + Math.sin(t * 30) * 10 : 0;
    this.smokeT -= dt;
    if (this.smokeT <= 0 && !this.impact) {
      this.smokeT = 0.05;
      const p = this.ship.position.clone();
      c.fx.points(p, 6, '#ff9a40', 6, 30, 0.8, 0);
      if (alt < 800) c.fx.smoke(p, 1, '#552');
    }
    // Color del cielo: del espacio al polvo rojizo
    scene_bg(this.sp.scene, clamp(1 - alt / 900, 0, 1));
    const k = this.camK(Math.min(t, this.END));
    const sp = this.ship.position;
    c.cam.position.set(sp.x + k.p.x, Math.max(sp.y + k.p.y, 3), sp.z + k.p.z);
    c.cam.lookAt(sp.x + k.l.x, sp.y + k.l.y, sp.z + k.l.z);
    c.cam.fov = k.fov;
    c.cam.updateProjectionMatrix();
    c.shake(alt < 900 ? 0.5 : 0.2);
    const sh = this.c.shakeAmt;
    c.cam.position.add(V(rand(-sh, sh), rand(-sh, sh), rand(-sh, sh)));
    if (y <= 2 && !this.impact) {
      this.impact = true;
      c.hud.whiteFlash(900);
      c.fx.burst(sp.clone().add(V(0, 2, 0)), 9, '#ff9100');
      c.fx.ring(sp.clone().add(V(0, 1, 0)), UP, '#ffcc80', 6, 1.2, 40);
      c.fx.smoke(sp.clone(), 14, '#4a3a30');
      c.fx.points(sp.clone().add(V(0, 2, 0)), 500, '#ffb74d', 3, 60, 2, 20);
      c.shake(2);
      sfx.boom(1, 3);
      c.hud.caption('', 1);
      c.hud.title('💥 ¡IMPACTO!', '', 2000, '#ffffff');
    }
    if (t > 10.2 && !this.fading) { this.fading = true; c.hud.fade(1, 1200); }
    if (t >= this.END && !this.left) { this.left = true; c.go('boss'); c.hud.fade(0, 1400); }
  }
}
function scene_bg(scene, k) { scene.background.lerpColors(new THREE.Color('#02030a'), new THREE.Color('#2a0c06'), k); }

// ========================================================== 8 · Lord Vex y el mundo de lava =====
class Boss extends Chapter {
  enter() {
    const c = this.c;
    this.built = buildLava();
    c.cache.lava = this.built;
    c.setScene(this.built);
    this.A = new Arena(c, this.built, { pos: V(-6, 0, 8), yaw: Math.PI / 2 });
    c.cache.arena = this.A;
    this.A.cameraEnabled = false;
    this.A.hero.want = 'saber';
    this.A.hero.weapon = 'saber';
    this.A.hero.gun.visible = false;
    this.A.hero.rig.root.visible = true;
    this.A.hero.rig.setLen(0);
    this.A.hero.bladeGoal = 0;
    this.A.onHeroDead = () => this.heroDead();
    this.A.onBossDead = () => this.bossDead();
    this.phase = 'arrive';
    this.c.frozen = true;
    c.hud.bars(true);
    c.hud.skip(() => { this.t = Math.max(this.t, this.cinEnd || 0); this.skipped = true; });
    c.hud.showStats(false);
    c.hud.fade(0, 1400);
    c.score.set('calm');
    this.cinEnd = 5.2;
    this.vex = null;
    c.hud.caption('Un mundo volcánico… hemos sobrevivido, pero no estamos solos.', 4200);
    this.camArrive = rail([
      { t: 0, p: [-26, 8, 40], l: [-30, 3, 20], fov: 60 },
      { t: 3.2, p: [-14, 4, 22], l: [-30, 2, 20], fov: 56 },
      { t: 5.2, p: [-14, 2.2, 14], l: [-6, 1.6, 8], fov: 50 },
    ]);
    this.A.hero.pos.set(-6, 0, 8);
    this.A.update(0.016);
    this.shotT = 0;
  }

  spawnVex() {
    const A = this.A;
    const v = A.spawn('vex', V(46, 0, -22));
    v.frozen = true;
    v.forcedSpeed = 3;
    this.vex = v;
    A.hpScale = 1;
  }

  heroDead() {
    const c = this.c;
    c.hud.title('HAS CAÍDO', 'Lord Vex sigue en pie', 0, '#ff5252');
    c.hud.buttons([['🔁 Reintentar duelo', () => this.retry()]]);
    if (input.locked) { c.game.ignoreUnlock = true; input.unlockPointer(); }
  }

  retry() {
    const A = this.A, c = this.c;
    A.clear();
    A.hero.revive(V(-6, 0, 8), Math.PI / 2);
    A.hero.rig.setLen(1);
    A.hero.bladeGoal = 1;
    A.enemiesFire = true;
    const v = A.spawn('vex', V(18, 0, -6));
    v.bladeGoal = 1;
    v.rig.setLen(1);
    this.vex = v;
    c.hud.title('');
    c.hud.buttons(null);
    c.hud.caption('¡Otra vez! No te rindas.', 2500);
  }

  bossDead() {
    const c = this.c;
    this.phase = 'down';
    this.downT = 0;
    c.frozen = true;
    c.timeScale = 0.4;
    c.hud.bars(true);
    c.hud.boss(null);
    c.hud.showStats(false);
    c.hud.title('¡LORD VEX HA CAÍDO!', '', 3200, '#ffffff');
    c.hud.caption('', 1);
    c.score.set('doom');
    c.hud.whiteFlash(500);
    sfx.boom(0.5, 2);
    this.A.cameraEnabled = false;
    this.ghosted = false;
  }

  update(dt) {
    super.update(dt);
    const c = this.c, A = this.A, H = A.hero;
    const t = this.t;
    if (this.phase === 'arrive') {
      A.update(dt);
      const k = this.camArrive(Math.min(t, 5.2));
      c.cam.position.copy(k.p); c.cam.lookAt(k.l); c.cam.fov = k.fov; c.cam.updateProjectionMatrix();
      if (t >= this.cinEnd) { this.phase = 'intro'; this.t = 0; this.cinEnd = 8; this.spawnVex(); c.score.set('boss'); c.hud.caption('Has destruido mi estación… ahora destruiré tu esperanza.', 4200); }
    } else if (this.phase === 'intro') {
      const v = this.vex;
      // Lord Vex avanza entre el humo y enciende su sable
      const u = clamp(t / 6, 0, 1);
      v.pos.set(lerp(46, 15, ease(u)), 0, lerp(-22, -5, ease(u)));
      v.forcedSpeed = u < 1 ? 3 : 0;
      v.yaw = Math.atan2(H.pos.x - v.pos.x, H.pos.z - v.pos.z);
      if (t > 6 && v.bladeGoal === 0) { v.bladeGoal = 1; sfx.ignite(); c.hud.whiteFlash(300); c.shake(0.6); c.hud.title('LORD VEX', 'El caballero oscuro', 2600, '#ff5252'); }
      A.update(dt);
      const camI = rail([
        { t: 0, p: [30, 1.6, -4], l: [44, 3, -20], fov: 54 },
        { t: 3.6, p: [26, 1.2, 4], l: [28, 2.4, -9], fov: 44 },
        { t: 6, p: [4, 1.6, 4], l: [15, 2, -5], fov: 40 },
        { t: 8, p: [-10, 2.6, 16], l: [8, 1.8, -2], fov: 52 },
      ])(Math.min(t, 8));
      c.cam.position.copy(camI.p); c.cam.lookAt(camI.l); c.cam.fov = camI.fov; c.cam.updateProjectionMatrix();
      if (t >= this.cinEnd) this.beginFight();
    } else if (this.phase === 'fight') {
      A.update(dt);
      const v = this.vex;
      c.hud.boss('LORD VEX', v.hp, v.max);
    } else if (this.phase === 'down') this.downUpdate(dt);
    else if (this.phase === 'lava') this.lavaUpdate(dt);
  }

  beginFight() {
    const c = this.c, A = this.A;
    this.phase = 'fight';
    c.frozen = false;
    c.hud.skip(null);
    c.hud.bars(false);
    c.hud.showStats(true);
    A.cameraEnabled = true;
    A.hero.ignite();
    A.hero.want = 'saber';
    this.vex.frozen = false;
    this.vex.bladeGoal = 1;
    this.vex.rig.setLen(1);
    this.vex.mode = 'idle';
    this.vex.modeT = 0.6;
    c.game.cam.yaw = -Math.PI / 2 + 0.2;
    c.game.cam.pitch = 0.28;
    c.hud.title('¡DERROTA A LORD VEX!', '', 2400, '#ffe81f');
    c.hud.helpText('[Clic] sable · [Clic der.] bloquear sus golpes · [Espacio] esquivar · [2] bláster · Cuando brille su sable, ¡va a golpear!');
    this.needsLock = true;
  }

  /** Lord Vex se desvanece: se vuelve translúcido y se deshace en ascuas. */
  downUpdate(dt) {
    const c = this.c, v = this.vex;
    this.downT += dt;
    const t = this.downT;
    if (!this.ghosted) {
      this.ghosted = true;
      this.mats = [];
      v.model.root.traverse((o) => { if (o.isMesh && o.material) { o.material = o.material.clone(); o.material.transparent = true; this.mats.push(o.material); } });
    }
    const k = clamp(t / 2.2, 0, 1);
    for (const m of this.mats) { m.opacity = lerp(1, 0.28, k); if (m.emissive) { m.emissive.set('#b71c1c'); m.emissiveIntensity = k * 1.4; } }
    if (Math.random() < 0.5) c.fx.points(v.pos.clone().add(V(rand(-0.5, 0.5), rand(0.5, 2.2), rand(-0.5, 0.5))), 6, '#ff5252', 0.35, 2.2, 1.2, -2);
    v.anim.update(dt, 0);
    v.model.root.position.set(v.pos.x, Math.sin(t * 2) * 0.05 + k * 0.6, v.pos.z);
    const pos = v.pos.clone();
    c.cam.position.set(pos.x + Math.sin(t * 0.5) * 9, 2.4, pos.z + Math.cos(t * 0.5) * 9);
    c.cam.lookAt(pos.x, 1.4, pos.z);
    c.cam.fov = 48;
    c.cam.updateProjectionMatrix();
    this.A.hero.update(dt, { mv: { x: 0, y: 0 }, canAct: false });
    this.A.hero.trail.update(dt);
    if (t > 3.6 && !this.toLava) { this.toLava = true; c.hud.fade(1, 700); setTimeout(() => this.startLava(), 800); }
  }

  /** Cinemática: la fuerza levanta el cuerpo y lo lanza a la lava, donde arde. */
  startLava() {
    const c = this.c, A = this.A, v = this.vex, H = A.hero;
    this.phase = 'lava';
    this.lt = 0;
    c.timeScale = 1;
    c.hud.fade(0, 700);
    H.pos.set(30, 0, 0);
    H.yaw = Math.PI / 2;
    H.rig.setLen(0);
    H.bladeGoal = 0;
    H.trail.pts = [];
    v.pos.set(35, 0, 0);
    v.model.root.position.set(35, 0.6, 0);
    v.model.root.rotation.set(0, Math.PI / 2, 0);
    this.L = V(63, -2.6, 0);
    this.flames = [];
    this.burning = false;
    c.hud.caption('Es el fin… para ti.', 3800);
    c.hud.skip(() => { this.lt = 15; });
    c.score.set('victory');
  }

  lavaUpdate(dt) {
    const c = this.c, v = this.vex, H = this.A.hero;
    this.lt += dt;
    const t = this.lt;
    H.update(dt, { mv: { x: 0, y: 0 }, canAct: false });
    H.forced = t > 1 && t < 6.8 ? (t > 4.3 ? 'throw' : 'force') : null;
    const m = v.model.root;
    if (t < 1.6) {
      m.position.set(35, 0.6 + Math.sin(t * 3) * 0.04, 0);
    } else if (t < 4.6) {
      // Se eleva y se pone horizontal, temblando
      const u = ease(clamp((t - 1.6) / 3, 0, 1));
      m.position.set(35 + Math.sin(t * 22) * 0.04, lerp(0.6, 3.8, u), Math.cos(t * 20) * 0.04);
      m.rotation.set(-u * 1.35, Math.PI / 2, 0);
      if (Math.random() < 0.6) c.fx.points(m.position.clone(), 4, '#b388ff', 0.3, 2, 0.8, -1);
    } else if (t < 7) {
      // Sale despedido en arco hacia la lava
      const u = clamp((t - 4.6) / 2.2, 0, 1);
      m.position.set(lerp(35, this.L.x, u), lerp(3.8, this.L.y, u) + Math.sin(u * Math.PI) * 6, 0);
      m.rotation.set(-1.35 + u * 4.5, Math.PI / 2, u * 2.4);
      if (u >= 1 && !this.burning) this.splash();
    }
    if (this.burning) {
      const bt = t - this.burnAt;
      m.position.y = Math.max(this.L.y - 3.2, this.L.y + 0.4 - bt * 0.9);
      this.flames.forEach((f, i) => { f.position.y = this.L.y + 1 + Math.abs(Math.sin(bt * 5 + i)) * 2.4 * (1 - bt / 6); f.scale.setScalar(lerp(14, 3, clamp(bt / 6, 0, 1)) * (0.8 + Math.sin(bt * 17 + i * 2) * 0.2)); f.material.opacity = clamp(1.2 - bt / 5, 0, 1); });
      if (Math.random() < 0.4) c.fx.points(V(this.L.x + rand(-1, 1), this.L.y + 1, rand(-1, 1)), 4, '#ffab40', 0.5, 5, 1.2, -3);
      for (const mm of this.mats) mm.opacity = Math.max(0, mm.opacity - dt * 0.2);
      if (Math.random() < 0.15) c.fx.smoke(V(this.L.x, this.L.y + 1, 0), 1, '#222');
    }
    // Cámara
    const cam = rail([
      { t: 0, p: [38, 3, 15], l: [34, 2, 0], fov: 50 },
      { t: 4.4, p: [29, 3.2, 12], l: [34, 3.4, 0], fov: 46 },
      { t: 4.8, p: [40, 5, 14], l: [46, 5, 0], fov: 58 },
      { t: 7.2, p: [56, 7, 18], l: [62, 1, 0], fov: 60 },
      { t: 9.4, p: [52, 5, 15], l: [63, 0.5, 0], fov: 54 },
      { t: 13.5, p: [40, 4, 10], l: [63, 1, 0], fov: 42 },
    ])(Math.min(t, 13.5));
    c.cam.position.copy(cam.p);
    c.cam.lookAt(cam.l);
    c.cam.fov = cam.fov;
    c.cam.updateProjectionMatrix();
    if (t > 11 && !this.fading) { this.fading = true; c.hud.fade(1, 1500); }
    if (t >= 13.2 && !this.left) { this.left = true; c.hud.caption('', 1); c.go('finale'); c.hud.fade(0, 1400); }
    if (t >= 15) { this.lt = 13.2; }
  }

  splash() {
    const c = this.c;
    this.burning = true;
    this.burnAt = this.lt;
    const L = this.L;
    c.fx.burst(V(L.x, L.y + 1, L.z), 4.5, '#ff7a1a');
    c.fx.ring(V(L.x, L.y + 0.2, L.z), UP, '#ffb060', 2, 1.1, 18);
    c.fx.points(V(L.x, L.y + 1, L.z), 400, '#ff9a30', 1.2, 26, 1.8, 18);
    sfx.boom(0.7, 2);
    c.shake(0.8);
    this.flames = [];
    for (let i = 0; i < 6; i++) { const f = glowSprite(i % 2 ? '#ff6a1a' : '#ffb347', 12); f.position.set(L.x + rand(-1.8, 1.8), L.y + 1, rand(-1.8, 1.8)); c.cur.scene.add(f); this.flames.push(f); }
    c.hud.caption('', 1);
  }

  leave() {
    this.c.timeScale = 1;
    this.A && (this.A.onHeroDead = this.A.onBossDead = null);
  }
}

// ============================================================ 9 · Regreso y final =====
class Finale extends Chapter {
  enter() {
    const c = this.c;
    this.stage = 'takeoff';
    this.built = c.cache.lava;
    c.setScene(this.built);
    c.cache.arena?.dispose();
    c.cache.arena = null;
    this.fal = this.built.wreck;
    this.fal.userData.setEngine(1);
    this.fal.rotation.set(0.12, 0.7, -0.25);
    c.hud.bars(true);
    c.hud.skip(() => { this.t = this.END; });
    c.hud.caption('El Halcón arranca de nuevo. ¡A casa!', 3600);
    this.END = 7.2;
    this.dust = 0;
    c.score.set('victory');
  }

  update(dt) {
    super.update(dt);
    const c = this.c, t = this.t;
    if (this.stage === 'takeoff') {
      const u = clamp(t / this.END, 0, 1);
      const e = ease(clamp(t / 4.5, 0, 1));
      this.fal.position.set(-30 + t * t * 1.5, 1.2 + e * 40 + t * t * 0.4, 20 - t * t * 2.2);
      this.fal.rotation.set(lerp(0.12, -0.12, e), lerp(0.7, 0.2, e), lerp(-0.25, 0, e));
      this.dust -= dt;
      if (this.dust <= 0 && t < 4.5) { this.dust = 0.07; c.fx.smoke(V(-30 + rand(-6, 6), 0.4, 20 + rand(-6, 6)), 2, '#5a4a40'); c.fx.points(V(-30, 0.6, 20), 8, '#ff9a40', 0.5, 12, 0.8, 4); }
      c.shake(t < 4.5 ? 0.15 : 0);
      c.cam.position.set(-6, lerp(3, 12, u), 40);
      c.cam.lookAt(this.fal.position.x * 0.8, this.fal.position.y * 0.9 + 2, this.fal.position.z * 0.8);
      c.cam.fov = lerp(60, 52, u);
      c.cam.updateProjectionMatrix();
      if (t >= this.END) { this.stage = 'space'; this.t = 0; c.change('finaleSpace', 700); this.stage = 'wait'; }
    }
  }
}

class FinaleSpace extends Chapter {
  enter() {
    const c = this.c;
    this.sp = buildSpace();
    c.setScene(this.sp);
    this.sp.station.visible = false;
    this.sp.planet.position.set(-900, -420, -2600);
    this.sp.planet.scale.setScalar(1.35);
    this.sp.planet.material.color.set('#e0a96a');
    this.ship = buildFalcon();
    this.ship.rotation.y = 0;
    this.sp.scene.add(this.ship);
    this.ship.userData.setEngine(1);
    this.ship.position.set(0, 0, 0);
    c.hud.bars(true);
    c.hud.skip(() => { this.t = 99; });
    c.hud.caption('Ahí está nuestro planeta… ¡lo conseguimos!', 4000);
    c.score.set('victory');
    this.END = 7;
  }

  update(dt) {
    super.update(dt);
    const c = this.c, t = this.t;
    this.ship.position.set(-t * 22, -t * 9, -t * 130 - t * t * 8);
    this.ship.rotation.z = Math.sin(t * 0.8) * 0.12;
    const k = rail([
      { t: 0, p: [14, 6, 28], l: [0, 0, -4], fov: 60 },
      { t: 3.5, p: [-24, 10, 30], l: [0, 0, -6], fov: 56 },
      { t: 7, p: [8, 4, 22], l: [0, 0, -40], fov: 66 },
    ])(Math.min(t, 7));
    const sp = this.ship.position;
    c.cam.position.set(sp.x + k.p.x, sp.y + k.p.y, sp.z + k.p.z);
    c.cam.lookAt(sp.x + k.l.x, sp.y + k.l.y, sp.z + k.l.z);
    c.cam.fov = k.fov;
    c.cam.updateProjectionMatrix();
    if (t >= this.END && !this.left) { this.left = true; c.change('home', 800); }
  }
}

class Home extends Chapter {
  enter() {
    const c = this.c;
    this.built = buildHome();
    c.setScene(this.built);
    this.fal = buildFalcon();
    this.fal.rotation.y = Math.PI;
    this.built.scene.add(this.fal);
    this.fal.userData.setEngine(1);
    // Rampa trasera (hacia la multitud, al norte)
    this.ramp = new THREE.Mesh(new THREE.BoxGeometry(3.4, 0.25, 7), new THREE.MeshStandardMaterial({ color: '#8d949c', metalness: 0.5, roughness: 0.5 }));
    this.ramp.position.set(0, 0.2, -8.2);
    this.ramp.visible = false;
    this.built.scene.add(this.ramp);
    // Héroe sin sable, listo para saludar
    const arena = new Arena(c, { scene: this.built.scene, bounds: () => {}, colliders: [] }, { pos: V(0, 0, -5.4), yaw: Math.PI });
    this.A = arena;
    arena.hero.model.root.visible = false;
    arena.hero.rig.root.visible = false;
    arena.hero.rig.setLen(0);
    arena.hero.gun.visible = false;
    arena.hero.forced = 'relaxed';
    arena.cameraEnabled = false;
    c.frozen = true;
    this.END = 20;
    this.said = 0;
    this.done = false;
    c.hud.bars(true);
    c.hud.skip(() => { this.t = Math.max(this.t, 14.5); });
    c.hud.fade(0, 1200);
    c.score.set('victory');
  }

  update(dt) {
    super.update(dt);
    const c = this.c, t = this.t, fal = this.fal, H = this.A.hero;
    // Aterrizaje
    const lk = ease(clamp(t / 5, 0, 1));
    fal.position.set(0, lerp(110, 1.9, lk), lerp(190, 0, lk));
    fal.rotation.set(lerp(0.2, 0, lk), Math.PI, 0);
    fal.userData.setEngine(t < 5 ? 1 : 0.4);
    if (t > 4.8 && !this.dust) { this.dust = true; c.fx.smoke(V(0, 0.5, 0), 10, '#b89060'); c.fx.ring(V(0, 0.4, 0), UP, '#ffe0b0', 4, 1.4, 14); c.shake(0.5); sfx.boom(0.4, 1.4); }
    // Rampa y salida del héroe
    if (t > 6.2) { this.ramp.visible = true; const k = ease(clamp((t - 6.2) / 1.4, 0, 1)); this.ramp.rotation.x = lerp(-0.9, -0.12, k); this.ramp.position.set(0, lerp(2.4, 0.5, k), lerp(-5.5, -8.5, k)); if (!this.rampSfx) { this.rampSfx = true; sfx.push(); } }
    if (t > 8 && !H.model.root.visible) { H.model.root.visible = true; }
    if (H.model.root.visible) {
      const u = clamp((t - 8) / 9, 0, 1);
      H.pos.set(0, lerp(1.6, 0, clamp((t - 8) / 2.4, 0, 1)), lerp(-5.5, -23, ease(u)));
      H.yaw = Math.PI;
      H.syncModel(dt, u < 1 ? 2.4 : 0);
      H.model.root.position.copy(H.pos);
      H.forcedAnim = u >= 1 ? 'cheer' : null;
    }
    // Cámara
    const c0 = rail([
      { t: 0, p: [26, 10, -10], l: [0, 12, 0], fov: 56 },
      { t: 5, p: [34, 6, -22], l: [0, 2, 0], fov: 50 },
      { t: 8, p: [18, 2.4, -32], l: [0, 3, -4], fov: 46 },
      { t: 12, p: [5, 1.3, -34], l: [0, 2.3, -14], fov: 50 },
      { t: 17, p: [-5, 1.6, -38], l: [0, 2.6, -22], fov: 54 },
      { t: 20, p: [-12, 4, -44], l: [0, 4, -20], fov: 58 },
    ])(Math.min(t, 20));
    c.cam.position.copy(c0.p);
    if (t < 5) c.cam.lookAt(fal.position.x * 0.9, fal.position.y * 0.8 + 1, fal.position.z * 0.9); else c.cam.lookAt(c0.l);
    c.cam.fov = c0.fov;
    c.cam.updateProjectionMatrix();
    this.A.hero.trail.update(dt);
    // Mensajes y final
    if (t > 7 && this.said < 1) { this.said = 1; c.hud.caption('¡Ha vuelto! ¡Lo ha conseguido!', 3600); }
    if (t > 12.5 && this.said < 2) {
      this.said = 2;
      c.hud.caption('', 1);
      c.hud.title('¡MISIÓN COMPLETADA!', 'Has destruido la Estación Oscura y derrotado a Lord Vex', 0, '#ffe81f');
      audio.play('levelup');
      c.hud.whiteFlash(500);
      c.send('done', { ms: Math.round(c.time * 1000) }).then((r) => { if (r?.error) return; toast('🏆 ¡Misión cumplida! Mira tus premios en Avatar → Trajes.', 'reward', 6000); });
      c.hud.skip(null);
    }
    if (t > 12.5) {
      this.fw = (this.fw || 0) - dt;
      if (this.fw <= 0) {
        this.fw = rand(0.25, 0.6);
        const p = V(rand(-60, 60), rand(35, 70), rand(-90, -30));
        const col = ['#ff5252', '#ffd740', '#69f0ae', '#40c4ff', '#ea80fc'][Math.floor(rand(0, 5))];
        c.fx.points(p, 90, col, 1.1, 22, 1.6, 6);
        c.fx.flash(p, col, 4);
        if (Math.random() < 0.5) sfx.boom(0.08, 0.4);
      }
    }
    if (t > 15.5 && !this.btn) {
      this.btn = true;
      if (input.locked) { c.game.ignoreUnlock = true; input.unlockPointer(); }
      c.hud.buttons([['🏠 Volver al menú', () => c.exit()]]);
    }
  }
}

const CHAPTERS = { intro: Intro, dogfight: Dogfight, dock: Dock, hangar: Hangar, core: Core, escape: Escape, drift: Drift, crash: Crash, boss: Boss, finale: Finale, finaleSpace: FinaleSpace, home: Home };
