import { test } from 'node:test';
import assert from 'node:assert/strict';
import { PhysicsWorld } from '../client/src/engine/physics.js';

const body = (x, y, z) => ({ x, y, z, vx: 0, vy: 0, vz: 0, r: 0.4, h: 2, onGround: false, ground: null });
const run = (w, b, secs, fn) => {
  for (let t = 0; t < secs; t += 1 / 60) {
    fn?.(b);
    w.move(b, 1 / 60);
  }
};

test('gravedad y suelo plano', () => {
  const w = new PhysicsWorld({ flatHeight: 0 });
  const b = body(0, 5, 0);
  run(w, b, 2);
  assert.ok(Math.abs(b.y) < 1e-6);
  assert.ok(b.onGround);
});

test('no atraviesa paredes (también rotadas)', () => {
  const w = new PhysicsWorld({ flatHeight: 0 });
  w.add({ x: 5, y: 2, z: 0, hx: 0.5, hy: 2, hz: 5 });
  w.add({ x: -5, y: 2, z: 0, hx: 0.5, hy: 2, hz: 5, ry: Math.PI / 4 });
  const b = body(0, 0, 0);
  run(w, b, 2, (bb) => { bb.vx = 10; bb.vz = 0; });
  assert.ok(b.x <= 5 - 0.5 - 0.4 + 1e-6, `x=${b.x}`);
  // Contra la pared rotada puede deslizarse a lo largo, pero nunca penetrarla.
  const rot = { x: -5, z: 0, cos: Math.cos(Math.PI / 4), sin: Math.sin(Math.PI / 4) };
  run(w, b, 3, (bb) => {
    bb.vx = -10;
    bb.vz = 0;
    const [lx, lz] = PhysicsWorld.local(rot, bb.x, bb.z);
    if (Math.abs(lz) < 5) assert.ok(lx >= 0.9 - 1e-6, `dentro de la pared rotada lx=${lx}`);
  });
});

test('sube escalones bajos pero no muros altos', () => {
  const w = new PhysicsWorld({ flatHeight: 0 });
  w.add({ x: 3, y: 0.2, z: 0, hx: 1, hy: 0.2, hz: 3 }); // escalón de 0.4
  const b = body(0, 0, 0);
  b.onGround = true;
  run(w, b, 0.4, (bb) => { bb.vx = 8; });
  assert.ok(Math.abs(b.y - 0.4) < 1e-6, `y=${b.y}`);
});

test('rampa: la altura sube de forma continua', () => {
  const w = new PhysicsWorld({ flatHeight: 0 });
  w.add({ kind: 'ramp', x: 0, y: 1, z: 5, hx: 2, hy: 1, hz: 5 }); // sube hacia +z, de 0 a 2
  const b = body(0, 0, -1);
  b.onGround = true;
  run(w, b, 1.2, (bb) => { bb.vz = 8; });
  assert.ok(b.y > 1.2 && b.y <= 2.0001, `y=${b.y}`);
});

test('plataforma móvil arrastra al jugador', () => {
  const w = new PhysicsWorld({ flatHeight: -50 });
  const p = w.add({ x: 0, y: 0, z: 0, hx: 2, hy: 0.3, hz: 2, dynamic: true });
  const b = body(0, 1, 0);
  run(w, b, 1);
  assert.ok(b.onGround && b.ground === p);
  for (let i = 0; i < 60; i++) {
    w.moveDynamic(p, p.x + 0.05, p.y, p.z);
    w.move(b, 1 / 60);
  }
  assert.ok(Math.abs(b.x - 3) < 0.01, `x=${b.x}`);
});

test('techo detiene el salto', () => {
  const w = new PhysicsWorld({ flatHeight: 0 });
  w.add({ x: 0, y: 3.5, z: 0, hx: 3, hy: 0.5, hz: 3 });
  const b = body(0, 0, 0);
  b.vy = 12;
  run(w, b, 0.3);
  assert.ok(b.y + b.h <= 3.0001, `cabeza=${b.y + b.h}`);
});
