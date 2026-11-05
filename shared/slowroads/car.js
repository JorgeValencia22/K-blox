// Coche de Slow Roads: modelo de bicicleta con neumáticos de curva de Pacejka simplificada, círculo de
// fricción, transferencia de peso, caja automática de 6 marchas con marcha atrás, tracción trasera,
// resistencia del aire y de rodadura, freno de mano (derrapes), cuatro ruedas apoyadas en el terreno
// (cabeceo, alabeo, saltos en las crestas) y piloto automático. Se simula a 120 Hz.
import { Road, MAX_LAT } from './road.js';

export const CAR = {
  mass: 1400, inertia: 2300, a: 1.25, b: 1.35, track: 1.56, cgHeight: 0.52, wheelR: 0.33,
  muF: 1.15, muR: 1.32, bF: 9.6, bR: 9.4, cF: 1.5, cR: 1.5,
  brakeForce: 1.05, frontBias: 0.62,
  gears: [0, 3.55, 2.2, 1.55, 1.15, 0.9, 0.74], reverse: 3.3, final: 3.7, eff: 0.9,
  idle: 900, redline: 7000, cdA: 0.66, crr: 0.015, maxSpeed: 76,
};
const G = 9.81;
const L = CAR.a + CAR.b;
const SUB = 1 / 120;
const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
const smooth = (a, b, v) => { const t = clamp((v - a) / (b - a), 0, 1); return t * t * (3 - 2 * t); };

/** Ángulo máximo de las ruedas delanteras: amplio parado, justo el que agarra a alta velocidad. */
export const steerLimit = (u) => clamp(0.07 + 24 / Math.max(u * u, 45), 0.07, 0.58);

/** Par motor (N·m) según las revoluciones. */
export function torque(rpm) {
  const x = (rpm - 4600) / 4200;
  return Math.max(110, 345 * (1 - 0.85 * x * x));
}

export class Car {
  constructor(road) {
    this.road = road;
    this.hints = [0, 0, 0, 0, 0];
    this.samples = [{}, {}, {}, {}, {}];
    this.place(8, -1.8);
  }

  /** Coloca el coche en la distancia s de la carretera, a `lat` del eje, mirando hacia delante. */
  place(s, lat = -1.8) {
    const p = this.road.at(s);
    this.x = p.x + p.lx * lat; this.z = p.z + p.lz * lat;
    this.yaw = p.psi;
    this.u = 0; this.v = 0; this.r = 0; this.vy = 0;
    this.steerIn = 0; this.steer = 0;
    this.gear = 1; this.rpm = CAR.idle; this.shiftT = 0;
    this.pitch = 0; this.roll = 0; this.sus = 0; this.susV = 0;
    this.ax = 0; this.ay = 0;
    this.grounded = true; this.airT = 0;
    this.wheelRot = 0; this.spin = 0; this.slide = 0; this.brakeOn = false; this.reversing = false;
    this.thr = 0; this.brk = 0;
    this.hints.fill(s);
    const g = this.ground();
    this.y = g.gy; this.s = g.s; this.lat = g.lat; this.grip = g.grip;
    this.pitch = g.pitch; this.roll = g.roll;
  }

  get speed() { return Math.hypot(this.u, this.v); }
  get kmh() { return this.speed * 3.6; }
  get vx() { return this.u * Math.sin(this.yaw) + this.v * Math.cos(this.yaw); }
  get vz() { return this.u * Math.cos(this.yaw) - this.v * Math.sin(this.yaw); }

  /** Altura y pendiente del terreno bajo las cuatro ruedas y el centro. */
  ground() {
    const sy = Math.sin(this.yaw), cy = Math.cos(this.yaw);
    const pts = [[CAR.a, CAR.track / 2], [CAR.a, -CAR.track / 2], [-CAR.b, CAR.track / 2], [-CAR.b, -CAR.track / 2], [0, 0]];
    const hs = [];
    let grip = 0;
    for (let i = 0; i < 5; i++) {
      const [f, l] = pts[i];
      const x = this.x + sy * f + cy * l, z = this.z + cy * f - sy * l;
      const smp = this.road.sample(x, z, this.hints[i], this.samples[i]);
      this.hints[i] = smp.s;
      hs.push(smp.h);
      if (i < 4) grip += smp.grip / 4;
    }
    const front = (hs[0] + hs[1]) / 2, rear = (hs[2] + hs[3]) / 2;
    const left = (hs[0] + hs[2]) / 2, right = (hs[1] + hs[3]) / 2;
    const c = this.samples[4];
    return {
      gy: (hs[0] + hs[1] + hs[2] + hs[3]) / 4,
      pitch: Math.atan2(front - rear, L), roll: Math.atan2(left - right, CAR.track),
      gF: (front - rear) / L, gL: (left - right) / CAR.track,
      s: c.s, lat: c.lat, grip, off: Math.abs(c.lat),
    };
  }

  /** Avanza `dt` segundos. inp = { steer (+ derecha), throttle, brake, hand }. Devuelve los eventos. */
  step(dt, inp) {
    const ev = [];
    let left = dt;
    while (left > 1e-6) {
      const h = Math.min(SUB, left);
      left -= h;
      this.sub(h, inp, ev);
    }
    return ev;
  }

  sub(dt, inp, ev) {
    const C = CAR;
    const g = this.ground();
    this.s = g.s; this.lat = g.lat; this.grip = g.grip;
    if (!Number.isFinite(this.x + this.z + this.u + this.v)) { this.place(Math.max(8, this.road.sMin + 20), -1.8); ev.push({ k: 'reset' }); return; }
    if (this.s < this.road.sMin + 12) { this.place(this.road.sMin + 40, -1.8); ev.push({ k: 'reset' }); return; }
    const u = this.u, v = this.v;
    const spd = Math.abs(u);
    const hand = clamp(inp.hand ? 1 : 0, 0, 1);

    // ---- pedales (con marcha atrás automática al parar y pisar el freno)
    const thr = clamp(inp.throttle || 0, 0, 1), brk = clamp(inp.brake || 0, 0, 1);
    let drive = 0, bk = 0;
    if (u < -0.8) { bk = thr; drive = -brk; } else if (u > 0.8) { drive = thr; bk = brk; } else { drive = thr - brk; }
    this.thr = Math.abs(drive); this.brk = bk;
    this.reversing = drive < 0 || u < -0.8;
    this.brakeOn = bk > 0.05 || hand > 0;

    // ---- dirección (ángulo limitado según la velocidad, con rampa)
    const maxSteer = steerLimit(u);
    const want = -clamp(inp.steer || 0, -1, 1) * maxSteer;
    const rate = maxSteer / (Math.abs(want) < Math.abs(this.steer) ? 0.22 : 0.5) * dt;
    this.steer += clamp(want - this.steer, -rate, rate);
    const del = this.steer, cd = Math.cos(del), sd = Math.sin(del);

    // ---- reparto de peso
    const grounded = this.grounded;
    const fz0F = C.mass * G * C.b / L, fz0R = C.mass * G * C.a / L;
    const dW = C.mass * this.ax * C.cgHeight / L;
    const fzF = grounded ? Math.max(0.25 * fz0F, fz0F - dW) : 0, fzR = grounded ? Math.max(0.25 * fz0R, fz0R + dW) : 0;
    const gripK = this.grip;
    const slideScale = 1 - 0.5 * hand;

    // ---- neumáticos
    const ua = Math.max(Math.abs(u), 1.5), sg = u >= 0 ? 1 : -1;
    const alF = Math.atan((v + C.a * this.r) / ua) - del * sg;
    const alR = Math.atan((v - C.b * this.r) / ua);
    const dF = C.muF * fzF * gripK, dR = C.muR * fzR * gripK * slideScale;
    let fyF = -dF * Math.sin(C.cF * Math.atan(C.bF * alF));
    let fyR = -dR * Math.sin(C.cR * Math.atan(C.bR * alR));

    // ---- longitudinal: motor en las ruedas traseras, frenos en las cuatro
    let fxR = 0, fxF = 0;
    let gear = this.gear;
    const wheelW = Math.abs(u) / C.wheelR;
    if (drive < 0) gear = -1; else if (gear < 1) gear = 1;
    if (gear > 0) {
      this.shiftT -= dt;
      const rpmOf = (gr) => wheelW * C.gears[gr] * C.final * 30 / Math.PI;
      const rpmNow = rpmOf(gear);
      if (this.shiftT <= 0) {
        if (gear < 6 && rpmNow > (drive > 0.7 ? 6300 : 5000)) { gear++; this.shiftT = 0.4; } else if (gear > 1 && rpmOf(gear - 1) < (drive > 0.6 ? 5600 : 4300) && rpmNow < 2600) { gear--; this.shiftT = 0.4; }
      }
    }
    this.gear = gear;
    const ratio = gear > 0 ? C.gears[gear] : C.reverse;
    const rpmWheels = wheelW * ratio * C.final * 30 / Math.PI;
    const clutch = smooth(0, 3, Math.abs(u)); // en parado el embrague patina
    const rpm = clamp(Math.max(C.idle + 800 * Math.abs(drive) * (1 - clutch), rpmWheels), C.idle, C.redline + 150);
    this.rpm += (rpm - this.rpm) * Math.min(1, dt * 18);
    if (Math.abs(drive) > 0 && this.shiftT <= 0.15 && Math.abs(u) < (gear < 0 ? 15 : C.maxSpeed)) {
      const cut = this.rpm > C.redline ? 0 : 1;
      fxR = Math.sign(drive) * torque(this.rpm) * Math.abs(drive) * ratio * C.final * C.eff / C.wheelR * cut;
    }
    const dirU = u > 0.15 ? 1 : u < -0.15 ? -1 : 0;
    const bMax = C.brakeForce * C.mass * G * gripK;
    if (bk > 0 && dirU !== 0) { fxF -= dirU * bk * bMax * C.frontBias; fxR -= dirU * bk * bMax * (1 - C.frontBias); }
    if (hand > 0 && dirU !== 0) fxR -= dirU * hand * 0.55 * C.mass * G * gripK;
    // círculo de fricción: lo que se gasta en lateral no está disponible para tracción/frenada
    const capF = Math.sqrt(Math.max(0, dF * dF - fyF * fyF)), capR = Math.sqrt(Math.max(0, dR * dR - fyR * fyR));
    if (Math.abs(fxF) > capF) fxF = Math.sign(fxF) * capF;
    const spinning = Math.abs(fxR) > capR && fxR * u >= 0 && drive !== 0;
    const capRh = hand > 0 ? capR : capR;
    if (Math.abs(fxR) > capRh) fxR = Math.sign(fxR) * capRh * (spinning ? 0.94 : 1);
    this.spin = spinning ? clamp((Math.abs(fxR) / Math.max(capR, 1)) * 0.5, 0, 1) : this.spin * 0.9;

    // ---- resistencias
    const off = g.off;
    const roll = (off > 80 ? 0.35 : off > 7.8 ? 0.065 : C.crr) * C.mass * G * Math.tanh(u * 2.5);
    const air = 0.5 * 1.2 * C.cdA * u * Math.abs(u);
    const sideDrag = 0.5 * 1.2 * 1.8 * 3.2 * v * Math.abs(v) * 0.4;
    // pendiente del terreno
    const slopeAx = grounded ? -G * g.gF * Math.cos(g.pitch) : 0;
    const slopeAy = grounded ? -G * g.gL : 0;

    let fxT = fxR + fxF * cd - fyF * sd - air - roll;
    let fyT = fyR + fyF * cd + fxF * sd - sideDrag;
    let mz = C.a * (fyF * cd + fxF * sd) - C.b * fyR - this.r * Math.abs(this.r) * 120 - this.r * 450;
    if (!grounded) { fxT = -air; fyT = -sideDrag; mz = -this.r * 800; }
    const du = fxT / C.mass + v * this.r + slopeAx;
    const dv = fyT / C.mass - u * this.r + slopeAy;
    this.ax += (du - v * this.r - this.ax) * Math.min(1, dt * 10); // aceleración longitudinal (para cabeceo y peso)
    this.ay += (u * this.r - this.ay) * Math.min(1, dt * 10);
    this.u += du * dt; this.v += dv * dt; this.r += (mz / C.inertia) * dt;
    if (grounded) {
      // a baja velocidad el modelo de neumáticos se mezcla con el cinemático (evita temblores)
      const kin = 1 - smooth(1.5, 5, Math.abs(this.u));
      if (kin > 0) {
        const rk = this.u * Math.tan(del) / L, vk = rk * C.b;
        const w = Math.min(1, dt * 12) * kin;
        this.r += (rk - this.r) * w; this.v += (vk - this.v) * w;
      }
      if (Math.abs(this.u) < 0.04 && drive === 0 && bk === 0) this.u *= 0.9;
      if (bk > 0.05 && Math.abs(this.u) < 0.25) this.u = 0;
      if (hand > 0 && Math.abs(this.u) < 0.3) this.u = 0;
    }
    this.slide = Math.min(1, Math.abs(this.v) / Math.max(3, Math.abs(this.u)) * 2.2);
    this.yaw += this.r * dt;

    // ---- posición horizontal
    const sy = Math.sin(this.yaw), cy = Math.cos(this.yaw);
    this.x += (this.u * sy + this.v * cy) * dt;
    this.z += (this.u * cy - this.v * sy) * dt;
    this.wheelRot += (this.u / C.wheelR) * dt + (this.spin > 0.05 ? this.spin * 26 * dt : 0);

    // ---- vertical: seguir el terreno o volar si la cresta es más brusca que la gravedad
    const g2 = this.ground();
    const prevY = this.y;
    const vyFree = this.vy - G * dt;
    const yFree = this.y + vyFree * dt;
    if (yFree <= g2.gy + 0.0009) {
      const vyG = (g2.gy - prevY) / dt;
      if (!grounded) {
        const imp = Math.max(0, vyG - vyFree);
        if (this.airT > 0.12) { ev.push({ k: 'land', impact: imp, air: this.airT }); this.susV -= imp * 0.9; }
      }
      this.y = g2.gy; this.vy = vyG; this.grounded = true; this.airT = 0;
    } else {
      this.y = yFree; this.vy = vyFree; this.grounded = false; this.airT += dt;
    }

    // ---- actitud de la carrocería (cabeceo / alabeo / suspensión)
    const k = 1 - Math.exp(-dt * (this.grounded ? 11 : 1.6));
    const tPitch = this.grounded ? g2.pitch + this.ax * 0.0042 : Math.atan2(this.vy, Math.max(3, Math.abs(this.u))) * 0.7;
    const tRoll = this.grounded ? g2.roll + this.ay * 0.0052 : 0;
    this.pitch += (tPitch - this.pitch) * k;
    this.roll += (tRoll - this.roll) * k;
    this.susV += (-this.sus * 260 - this.susV * 20) * dt;
    this.sus += this.susV * dt;
    this.sus = clamp(this.sus, -0.2, 0.2);
  }
}

/** Piloto automático: sigue el carril derecho y adapta la velocidad a las curvas que vienen. */
export function autopilot(car, road, cruise = 33, out = {}) {
  const spd = Math.max(0, car.u);
  const look = clamp(9 + spd * 0.85, 12, 62);
  const t = road.at(car.s + look);
  const tx = t.x - t.lx * 1.7, tz = t.z - t.lz * 1.7;
  const dx = tx - car.x, dz = tz - car.z;
  const sy = Math.sin(car.yaw), cy = Math.cos(car.yaw);
  const fwd = dx * sy + dz * cy, left = dx * cy - dz * sy;
  const alpha = Math.atan2(left, Math.max(0.5, fwd));
  const del = Math.atan(2 * L * Math.sin(alpha) / Math.max(4, Math.hypot(fwd, left)));
  const maxSteer = steerLimit(car.u);
  out.steer = clamp(-del / maxSteer, -1, 1);
  let kmax = 0;
  for (let d = 0; d <= 110; d += 22) kmax = Math.max(kmax, Math.abs(road.curvature(car.s + d + spd * 0.4)));
  const vT = Math.min(cruise, Math.sqrt(4.2 / Math.max(kmax, 1e-4)));
  out.throttle = clamp((vT - car.u) * 0.35, 0, 1);
  out.brake = clamp((car.u - vT) * 0.22, 0, 1);
  out.hand = false;
  return out;
}

export function makeRun(seed) {
  const road = new Road(seed);
  const car = new Car(road);
  return { road, car };
}

export { MAX_LAT };
