import { test } from 'node:test';
import assert from 'node:assert/strict';
import { ChatFilter } from '../server/security/chatFilter.js';
import { validateUserWorld, newEmptyWorld } from '../shared/worldSchema.js';
import { getHeightmap } from '../shared/terrain.js';
import { levelFromXp, xpForLevel } from '../shared/catalog.js';
import { sanitizeAvatar } from '../shared/avatar.js';
import { getBuiltinWorld } from '../shared/worlds/index.js';

const f = new ChatFilter(['idiota', 'puto', 'gilipollas']);

test('filtro: enmascara palabras, variantes y separadores', () => {
  assert.equal(f.check('eres idiota').text, 'eres ######');
  assert.equal(f.check('eres 1d10t4').text, 'eres ######');
  assert.ok(!f.check('i d i o t a').text.includes('i'));
  assert.ok(f.check('GILIPOLLAS').text.startsWith('#'));
  assert.ok(f.check('puuuuto').text.startsWith('#'));
  // Sin falsos positivos dentro de otras palabras
  assert.equal(f.check('el computo total').text, 'el computo total');
});

test('filtro: bloquea datos personales', () => {
  assert.equal(f.check('llamame al 612345678').ok, false);
  assert.equal(f.check('seis uno dos tres cuatro cinco').ok, false);
  assert.equal(f.check('escribe a pepe@correo.com').ok, false);
  assert.equal(f.check('entra en web punto com').ok, false);
  assert.equal(f.check('mira kest dot com').ok, false);
  assert.equal(f.check('agregame en insta').ok, false);
  assert.equal(f.check('tengo 12 gemas').ok, true);
  assert.equal(f.check('tengo 12 gemas', { strict: true }).text, 'tengo ## gemas');
});

test('mundo de usuario: validación y límites', () => {
  const w = newEmptyWorld();
  w.objects.push({ id: 'p', t: 'platform', p: [0, 0, 0], s: [4, 1, 4], axis: 'w', dist: 999, speed: -1 });
  const v = validateUserWorld(w);
  assert.ok(v.ok);
  const p = v.world.objects.find((o) => o.id === 'p');
  assert.equal(p.axis, 'x');
  assert.equal(p.dist, 60);
  assert.equal(p.speed, 0.05);
  assert.equal(validateUserWorld(null).ok, false);
});

test('terreno: determinista y continuo', () => {
  const a = getHeightmap({ type: 'island', seed: 7 });
  const h1 = a.heightAt(10.3, -20.7);
  const h2 = a.heightAt(10.31, -20.7);
  assert.ok(Math.abs(h1 - h2) < 0.1);
  assert.ok(Math.abs(a.heightAt(0, 0) - 3) < 0.01, 'ciudad plana a altura 3');
  assert.ok(a.heightAt(0, -124) < 0, 'el río está bajo el nivel del mar');
});

test('niveles', () => {
  assert.equal(levelFromXp(0), 1);
  assert.equal(levelFromXp(xpForLevel(5)), 5);
  assert.equal(levelFromXp(xpForLevel(5) - 1), 4);
});

test('avatar: colores inválidos se corrigen', () => {
  const a = sanitizeAvatar({ skin: 'javascript:alert(1)', accessories: ['acc_cap', 'acc_cap', 'nope'] }, new Set());
  assert.equal(a.skin, '#f1c27d');
  assert.deepEqual(a.accessories, ['acc_cap']);
});

test('mundos oficiales: tienen apariciones y objetivos', () => {
  for (const id of ['city', 'obby', 'racing', 'survival', 'hangout', 'onlyup', 'keys', 'horror', 'royale', 'rocket', 'castores']) {
    const w = getBuiltinWorld(id);
    assert.ok(w.spawns.length > 0, id);
    assert.ok(w.objects.length > 20, id);
  }
  assert.equal(getBuiltinWorld('city').objects.filter((o) => o.t === 'gem').length, 12);
  assert.equal(getBuiltinWorld('obby').objects.filter((o) => o.t === 'checkpoint').length, 13);
});
