// Pruebas de Slow Roads: carretera infinita determinista, física del coche, piloto automático y servidor.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { Road, STEP, ROAD_HALF } from '../shared/slowroads/road.js';
import { Car, autopilot, CAR } from '../shared/slowroads/car.js';

const drive = (car, secs, f) => {
  const evs = [];
  for (let i = 0; i < Math.round(secs * 60); i++) evs.push(...car.step(1 / 60, f(i / 60, car)));
  return evs;
};

test('la carretera es determinista: misma semilla, mismo camino', () => {
  const a = new Road(1234), b = new Road(1234), c = new Road(99);
  a.ensure(5000); b.ensure(3000); b.ensure(5000); c.ensure(5000);
  for (const s of [0, 500, 1800, 4900]) {
    const pa = a.at(s), pb = b.at(s), pc = c.at(s);
    assert.equal(pa.x, pb.x); assert.equal(pa.z, pb.z); assert.equal(pa.y, pb.y);
    if (s > 500) assert.notEqual(pa.x, pc.x);
  }
});

test('la carretera es continua, suave y de curvas amplias', () => {
  const r = new Road(7);
  r.ensure(20000);
  let maxTurn = 0, maxSlope = 0;
  for (let i = r.first + 1; i < r.last; i++) {
    const a = i - r.first;
    const d = Math.hypot(r.xs[a + 1] - r.xs[a], r.zs[a + 1] - r.zs[a]);
    assert.ok(Math.abs(d - STEP) < 0.02, 'paso constante');
    maxTurn = Math.max(maxTurn, Math.abs(r.hd[a + 1] - r.hd[a]) / STEP);
    maxSlope = Math.max(maxSlope, Math.abs(r.ys[a + 1] - r.ys[a]) / STEP);
  }
  assert.ok(maxTurn <= 1 / 134, `curvatura máxima ${maxTurn}`);
  assert.ok(maxSlope < 0.14, `pendiente máxima ${maxSlope}`);
});

test('lo de atrás se borra y lo de delante se genera sin cambiar lo que queda', () => {
  const r = new Road(42);
  r.ensure(3000);
  const before = r.at(2500);
  const n0 = r.xs.length;
  assert.ok(r.prune(2000));
  assert.ok(r.sMin >= 1900 && r.sMin <= 2000);
  assert.ok(r.xs.length < n0);
  const after = r.at(2500);
  assert.equal(before.x, after.x); assert.equal(before.z, after.z); assert.equal(before.y, after.y);
  r.ensure(9000);
  assert.ok(r.sMax >= 9000);
  assert.ok(r.xs.length < 3000, 'la memoria no crece sin límite al avanzar y podar');
});

test('la proyección sobre la carretera da la distancia lateral y el asfalto', () => {
  const r = new Road(5);
  const p = r.at(800);
  const out = {};
  r.sample(p.x + p.lx * 2, p.z + p.lz * 2, 790, out);
  assert.ok(Math.abs(out.s - 800) < 0.5);
  assert.ok(Math.abs(out.lat - 2) < 0.05);
  assert.ok(out.on && out.grip === 1);
  assert.ok(Math.abs(out.h - p.y) < 0.05);
  r.sample(p.x + p.lx * (ROAD_HALF + 20), p.z + p.lz * (ROAD_HALF + 20), 800, out);
  assert.ok(!out.on && out.grip < 0.8);
});

test('el coche acelera como un deportivo (0-100 km/h en 4-9 s) y cambia de marcha solo', () => {
  const road = new Road(3);
  const car = new Car(road);
  let t100 = 0;
  const gears = new Set();
  drive(car, 14, (t, c) => {
    gears.add(c.gear);
    if (!t100 && c.kmh >= 100) t100 = t;
    return autopilotSteer(c, road, 1);
  });
  assert.ok(t100 > 4 && t100 < 9, `0-100 en ${t100}`);
  assert.ok(gears.has(1) && gears.has(2) && gears.has(3), 'cambia de marcha');
  assert.ok(car.kmh > 150 && car.kmh < 280, `velocidad ${car.kmh}`);
});

const autopilotSteer = (c, road, thr = 0) => { const o = autopilot(c, road, 90); o.throttle = thr; o.brake = 0; return o; };

test('frena en una distancia realista y se detiene del todo', () => {
  const road = new Road(3);
  const car = new Car(road);
  drive(car, 8, (t, c) => autopilotSteer(c, road, 1));
  const v0 = car.speed, s0 = car.s;
  assert.ok(v0 > 25);
  drive(car, 6, (t, c) => ({ ...autopilot(c, road, 90), throttle: 0, brake: c.u > 0.3 ? 1 : 0 }));
  assert.ok(car.speed < 0.5, `se queda parado (${car.speed})`);
  const dist = car.s - s0;
  assert.ok(dist > v0 * v0 / (2 * 12) && dist < v0 * v0 / (2 * 6), `frenada ${dist} m desde ${v0}`);
});

test('marcha atrás: parado, el freno da marcha atrás', () => {
  const road = new Road(3);
  const car = new Car(road);
  drive(car, 3, () => ({ steer: 0, throttle: 0, brake: 1 }));
  assert.ok(car.u < -2, `u=${car.u}`);
  assert.equal(car.gear, -1);
});

test('en curva el coche gira y un volantazo a alta velocidad provoca derrape sin explotar', () => {
  const road = new Road(3);
  const car = new Car(road);
  drive(car, 9, (t, c) => autopilotSteer(c, road, 1));
  const yaw0 = car.yaw;
  let maxSlide = 0, maxLat = 0;
  drive(car, 3, (t, c) => { maxSlide = Math.max(maxSlide, c.slide); maxLat = Math.max(maxLat, Math.abs(c.ay)); return { steer: 1, throttle: 0.3, brake: 0, hand: false }; });
  const turned = Math.atan2(Math.sin(car.yaw - yaw0), Math.cos(car.yaw - yaw0));
  assert.ok(turned < -0.4, 'gira a la derecha');
  assert.ok(maxLat > 6 && maxLat < 20, `aceleración lateral ${maxLat}`);
  assert.ok(Number.isFinite(car.x) && car.kmh < 300);
});

test('el freno de mano hace derrapar la parte trasera', () => {
  const road = new Road(3);
  const car = new Car(road);
  drive(car, 7, (t, c) => autopilotSteer(c, road, 1));
  let slide = 0;
  drive(car, 1.2, (t, c) => { slide = Math.max(slide, c.slide); return { steer: 0.8, throttle: 0, brake: 0, hand: true }; });
  assert.ok(slide > 0.4, `derrape ${slide}`);
});

test('el piloto automático recorre 15 km sin salirse de la carretera', () => {
  const road = new Road(2024);
  const car = new Car(road);
  let worst = 0, maxKmh = 0;
  const steps = 60 * 700;
  for (let i = 0; i < steps; i++) {
    car.step(1 / 60, autopilot(car, road, 33));
    worst = Math.max(worst, Math.abs(car.lat));
    maxKmh = Math.max(maxKmh, car.kmh);
    if (i % 120 === 0) road.prune(car.s - 150);
  }
  assert.ok(car.s > 15000, `recorrido ${car.s} m`);
  assert.ok(worst < ROAD_HALF, `se salió ${worst} m del eje`);
  assert.ok(maxKmh > 90 && maxKmh < 140);
  assert.ok(road.xs.length < 700, 'la carretera se va borrando por detrás');
});

test('una cresta brusca hace volar al coche y aterriza sin atravesar el suelo', () => {
  const road = new Road(11);
  // Cresta artificial: eleva el eje en torno a s=300 con un perfil muy agudo
  const orig = road.elevation.bind(road);
  road.elevation = (s) => orig(s) + 6 * Math.exp(-((s - 300) ** 2) / 80);
  road.xs.length = 0; road.zs.length = 0; road.ys.length = 0; road.hd.length = 0; road.last = -1; road.first = 0;
  road.ensure(900);
  const car = new Car(road);
  let flew = 0, landed = false, minGap = 1;
  drive(car, 16, (t, c) => {
    if (!c.grounded) flew = Math.max(flew, c.airT);
    minGap = Math.min(minGap, c.y - road.sample(c.x, c.z, c.s, {}).h);
    return autopilotSteer(c, road, 1);
  }).forEach((e) => { if (e.k === 'land') landed = true; });
  assert.ok(flew > 0.1, `tiempo en el aire ${flew}`);
  assert.ok(landed);
  assert.ok(minGap > -0.05, 'no atraviesa el suelo');
});

test('constantes del coche razonables', () => {
  assert.ok(CAR.mass > 1000 && CAR.gears.length === 7);
});
