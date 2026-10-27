// Mando: asignación por defecto, zona muerta, DualShock 4 con formato no estándar y navegación por menús.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { DEFAULT_PAD, ACTION_BY_ID, PAD_ACTIONS, padMap, deadzone, hatToDpad, normalizePad, pickDirection, isDualShock } from '../shared/padmap.js';

const btns = (on = []) => Array.from({ length: 18 }, (_, i) => ({ pressed: on.includes(i), value: on.includes(i) ? 1 : 0 }));

test('todas las asignaciones por defecto apuntan a acciones que existen', () => {
  for (const [b, a] of Object.entries(DEFAULT_PAD)) assert.ok(ACTION_BY_ID[a], `${b} → ${a}`);
  assert.equal(new Set(PAD_ACTIONS.map((a) => a.id)).size, PAD_ACTIONS.length);
});

test('las asignaciones del jugador sustituyen a las de por defecto y se ignoran las inválidas', () => {
  const m = padMap({ 0: 'fire', 1: 'inventada', 99: 'jump' });
  assert.equal(m[0], 'fire');
  assert.equal(m[1], DEFAULT_PAD[1]);
  assert.equal(m[99], undefined);
});

test('zona muerta: dentro no hay movimiento y fuera crece desde cero', () => {
  assert.deepEqual(deadzone(0.1, 0.05, 0.15), { x: 0, y: 0 });
  const r = deadzone(1, 0, 0.15);
  assert.ok(Math.abs(r.x - 1) < 1e-9 && r.y === 0);
  const s = deadzone(0.2, 0, 0.15);
  assert.ok(s.x > 0 && s.x < 0.1);
});

test('DualShock 4 estándar (Chrome/Edge): botones y ejes tal cual', () => {
  const gp = { id: 'Wireless Controller (STANDARD GAMEPAD Vendor: 054c Product: 09cc)', mapping: 'standard', buttons: btns([0, 7]), axes: [0.5, -0.5, 0.1, 0.9] };
  const n = normalizePad(gp);
  assert.ok(n.b[0] && n.b[7] && !n.b[1]);
  assert.deepEqual(n.ax, [0.5, -0.5, 0.1, 0.9]);
  assert.ok(isDualShock(gp.id));
});

test('DualShock 4 sin formato estándar (Firefox): reordena botones y lee la cruceta como eje', () => {
  // En ese formato la ✕ es el botón 1, y la cruceta llega en el eje 9
  const axes = new Array(10).fill(0); axes[9] = 1.28; axes[3] = -1; axes[4] = -1; axes[5] = 0.7;
  const gp = { id: '054c-05c4-Wireless Controller', mapping: '', buttons: btns([1]), axes };
  let n = normalizePad(gp);
  assert.ok(n.b[0], '✕ = botón 0');
  assert.equal(n.ax[3], 0.7, 'stick derecho vertical en el eje 5');
  axes[9] = -1;
  n = normalizePad({ ...gp, axes });
  assert.ok(n.b[12] && !n.b[13], 'cruceta arriba');
  axes[3] = 1; // gatillo izquierdo como eje
  n = normalizePad({ ...gp, axes });
  assert.ok(n.b[6], 'L2 desde el eje');
});

test('cruceta como eje: 8 direcciones y reposo', () => {
  assert.deepEqual(hatToDpad(1.28), { up: false, down: false, left: false, right: false });
  assert.ok(hatToDpad(-1).up);
  assert.ok(hatToDpad(0.428).down && hatToDpad(0.428).left);
  assert.ok(hatToDpad(-0.428).right);
});

test('navegación por menús: elige el vecino más cercano en cada dirección', () => {
  const r = (x, y) => ({ x, y, w: 100, h: 40 });
  const from = r(100, 100);
  const list = [r(100, 0), r(100, 200), r(0, 100), r(250, 100), r(600, 600)];
  assert.equal(pickDirection(from, list, 'up'), 0);
  assert.equal(pickDirection(from, list, 'down'), 1);
  assert.equal(pickDirection(from, list, 'left'), 2);
  assert.equal(pickDirection(from, list, 'right'), 3);
  assert.equal(pickDirection(from, [r(100, 100)], 'up'), -1);
});
