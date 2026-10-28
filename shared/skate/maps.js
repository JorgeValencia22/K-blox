// Skate Pro: los seis mapas. Cada mapa es una lista de piezas (cajas, rampas, cuartos de tubo, piscinas,
// escaleras…) con su altura exacta: el mismo dato sirve para dibujar el mapa y para la física, que
// consulta `heightAt` (ver world.js). Unidades en metros; el ángulo `yaw` gira la pieza y su «adelante»
// local es (sin yaw, cos yaw) en (x, z).

import { buildCity } from './city.js';
import { P, box, ramp, quarter, pyramid, stairs, rail, bowl, zone, wall, halfpipe, funbox, stairSet } from './kit.js';

// ======================================================================================== 1 · PARQUE
const park = {
  id: 'park', name: 'Kest Skatepark', tag: 'Skatepark clásico', icon: '🛹',
  desc: 'El parque perfecto: caja de saltos, cuartos de tubo, medio tubo, piscina, escaleras con pasamanos y raíles.',
  theme: { sky: '#8ec9f5', fog: '#b7dcf5', ground: '#b9b9b4', accent: '#ff5252', night: false, light: 1 },
  bounds: { x0: -55, x1: 55, z0: -40, z1: 40 },
  spawn: { x: -42, z: 0, yaw: Math.PI / 2 },
  time: 120,
  medals: [8000, 25000, 60000],
  prims: P([
    funbox(0, 0, 8, 5, 0.65, 3.6, Math.PI / 2),
    box(0, -11, 7, 3.4, 0.28, 0, { color: 'paint' }),
    box(-12, 24, 9, 0.5, 0.45, 0, { grind: true, color: 'paint' }),
    pyramid(16, 10, 11, 11, 1.1, 4),
    [-22, -9, 4].map((x) => quarter(x, -29, 8, 2.4, 2.4, Math.PI, 3)),
    halfpipe(38, 6, 12, 8, 3.0, 3.0, Math.PI / 2, 1.6),
    bowl(31, -23, 10, 6.5, 2.1, 0.42, false, 0, { coping: true }),
    stairSet(-24, 14, 6, 6, 0.42, 0.18, 0),
    rail(-18, 28, -4, 28, 0.8),
    rail(6, 22, 20, 22, 0.9, 0.9),
    rail(24, 20, 34, 30, 1.1, 0.5),
    ramp(-36, -20, 6, 6, 0, 1.2, 0),
    box(-36, -13.5, 6, 6, 1.2, 0, { color: 'paint' }),
    wall(-52, 0, 1, 70, 3, 0, { v: 0 }),
  ]),
  gaps: [
    { id: 'canon', name: 'Salto del Cañón', x: 0, z: 0, r: 3.2, pts: 400 },
    { id: 'escalera', name: 'Salto de la escalera', x: -24, z: 16.4, r: 2.4, pts: 500 },
    { id: 'rails', name: 'Sobre el raíl', x: -11, z: 28, r: 2.2, pts: 450 },
  ],
  letters: [
    { ch: 'S', x: -30, z: 6, up: 1.1 }, { ch: 'K', x: 0, z: 0, up: 1.5 }, { ch: 'A', x: -9, z: -32, up: 1.8 },
    { ch: 'T', x: 31, z: -23, up: 1.3 }, { ch: 'E', x: 30.2, z: 6, up: 1.8 },
  ],
  goals: [
    { id: 'g1', text: 'Consigue 20.000 puntos', type: 'score', v: 20000 },
    { id: 'g2', text: 'Haz un combo de 5.000', type: 'combo', v: 5000 },
    { id: 'g3', text: 'Aterriza un Kickflip', type: 'trick', id2: 'kickflip' },
    { id: 'g4', text: 'Grinda 8 m seguidos', type: 'grind', v: 8 },
    { id: 'g5', text: 'Salta el Cañón de la caja', type: 'gap', id2: 'canon' },
    { id: 'g6', text: 'Giro de 540°', type: 'spin', v: 540 },
    { id: 'g7', text: 'Recoge S-K-A-T-E', type: 'letters' },
  ],
};

// ======================================================================================== 2 · CALLE
const street = {
  id: 'street', name: 'Calle Mayor', tag: 'Spots urbanos', icon: '🏙️',
  desc: 'Skate de calle de verdad: escalera de 10 escalones, bancos, jardineras, un salto de avenida y bancos inclinados.',
  theme: { sky: '#ffb877', fog: '#f3c9a0', ground: '#6b6e73', accent: '#ffd600', night: false, light: 0.9, dusk: true },
  bounds: { x0: -70, x1: 70, z0: -22, z1: 22 },
  spawn: { x: -62, z: 0, yaw: Math.PI / 2 },
  time: 120,
  medals: [8000, 22000, 55000],
  prims: P([
    box(0, 15, 140, 14, 0.16, 0, { color: 'side' }),
    box(0, -15, 140, 14, 0.16, 0, { color: 'side' }),
    ramp(-30, -1, 4.5, 3.4, 0, 1.05, Math.PI / 2),
    ramp(-22, -1, 4.5, 3.4, 0, 1.05, -Math.PI / 2),
    stairSet(-52, 10, 6, 5, 0.42, 0.17, 0, { both: true }),
    stairSet(34, 10, 7, 10, 0.45, 0.17, 0, { both: true }),
    box(-20, 17, 7, 0.55, 0.5, 0, { grind: true, color: 'paint' }),
    box(-6, 18, 2.4, 0.8, 0.46, 0, { grind: true, color: 'wood' }),
    box(0, 18, 2.4, 0.8, 0.46, 0, { grind: true, color: 'wood' }),
    box(12, 17, 9, 0.6, 0.55, 0, { grind: true, color: 'paint' }),
    box(-40, -16, 8, 0.6, 0.5, 0, { grind: true, color: 'paint' }),
    box(-26, -17, 10, 2.5, 0.28, 0, { color: 'paint' }),
    ramp(2, -16, 8, 4, 0, 1.3, Math.PI),
    box(2, -20, 8, 4, 1.3, 0, { color: 'paint' }),
    rail(-10, -12, 6, -12, 0.85),
    rail(44, -13, 58, -13, 0.9),
    box(16, 4, 9, 2.6, 1.6, 0, { solid: true, color: 'bus' }),
    ramp(16, -2, 5, 3.4, 0, 1.5, 0),
    pyramid(48, 14, 12, 8, 0.9, 4),
    quarter(62, 2, 7, 2, 2, 0, 2),
    quarter(62, 12, 7, 2, 2, Math.PI, 2),
    wall(-69, 0, 1, 44, 4, 0, { v: 0 }),
  ]),
  gaps: [
    { id: 'avenida', name: 'Salto de la avenida', x: -26, z: -1, r: 3.4, pts: 700 },
    { id: 'escalera10', name: 'Escalera de 10', x: 34, z: 15, r: 3.4, pts: 900 },
    { id: 'autobus', name: 'Sobre la furgoneta', x: 16, z: 3.6, r: 3.6, pts: 600 },
    { id: 'rail_dobl', name: 'Raíl largo', x: -2, z: -12, r: 4.5, pts: 450 },
  ],
  letters: [
    { ch: 'S', x: -50, z: 12, up: 1.6 }, { ch: 'K', x: -26, z: -1, up: 2.2 }, { ch: 'A', x: 16, z: 3.6, up: 3.0 },
    { ch: 'T', x: 40, z: 15, up: 3.4 }, { ch: 'E', x: 56, z: -13, up: 1.8 },
  ],
  goals: [
    { id: 'g1', text: 'Consigue 20.000 puntos', type: 'score', v: 20000 },
    { id: 'g2', text: 'Combo de 6.000 puntos', type: 'combo', v: 6000 },
    { id: 'g3', text: 'Salta la avenida', type: 'gap', id2: 'avenida' },
    { id: 'g4', text: 'Baja la escalera de 10', type: 'gap', id2: 'escalera10' },
    { id: 'g5', text: 'Aterriza un Heelflip', type: 'trick', id2: 'heelflip' },
    { id: 'g6', text: 'Manual de 4 segundos', type: 'manual', v: 4 },
    { id: 'g7', text: 'Recoge S-K-A-T-E', type: 'letters' },
  ],
};

// ======================================================================================== 3 · BOWL
const bowlMap = {
  id: 'bowl', name: 'Bowl Dorado', tag: 'Piscinas y cuencos', icon: '🏊',
  desc: 'Cuencos enormes de hormigón: piscina en forma de riñón, cuenco cuadrado, espina y cuartos de tubo para volar alto.',
  theme: { sky: '#7fd0e8', fog: '#cdeff7', ground: '#d8c9a3', accent: '#00bfa5', night: false, light: 1.05 },
  bounds: { x0: -48, x1: 48, z0: -36, z1: 36 },
  spawn: { x: -42, z: 26, yaw: Math.PI / 2 },
  time: 120,
  medals: [10000, 30000, 70000],
  prims: P([
    bowl(0, 0, 17, 10, 3.3, 0.4, false, 0, { coping: true }),
    box(-3, 0, 3, 3, 0.7, 0.4, { y0: -3.3, color: 'paint' }),
    ramp(3, 0, 4, 3, 0, 0.9, Math.PI / 2, { y0: -3.3 }),
    bowl(-31, -12, 7.5, 7.5, 1.9, 0.5, true, 0, { coping: true }),
    P([quarter(26, -4, 8, 2.8, 2.8, Math.PI / 2, 1.6), quarter(35, -4, 8, 2.8, 2.8, -Math.PI / 2, 1.6)]),
    box(30.5, -4, 4, 8, 2.8, 0, { v: 0 }),
    [-30, -14, 2, 18].map((x) => quarter(x, 31, 8, 2.2, 2.2, Math.PI, 2)),
    pyramid(-30, 18, 9, 9, 1.0, 3),
    halfpipe(32, 20, 10, 6, 2.5, 2.5, Math.PI / 2, 1.2),
    rail(-12, 22, 2, 22, 0.85),
    box(8, -26, 8, 0.6, 0.5, 0, { grind: true, color: 'paint' }),
    wall(-47, 0, 1, 72, 3, 0, { v: 0 }),
  ]),
  gaps: [
    { id: 'foso', name: 'Sobre el foso', x: 0, z: 0, r: 4.2, pts: 800 },
    { id: 'cuadrado', name: 'Cuenco a cuenco', x: -31, z: -12, r: 3.4, pts: 600 },
    { id: 'espina', name: 'Salto de la espina', x: 30.5, z: -4, r: 3.2, pts: 700 },
  ],
  letters: [
    { ch: 'S', x: 0, z: 0, up: 1.0 }, { ch: 'K', x: -31, z: -12, up: 1.2 }, { ch: 'A', x: 30.5, z: -4, up: 2.2 },
    { ch: 'T', x: -14, z: 28, up: 1.8 }, { ch: 'E', x: 26, z: 20, up: 1.8 },
  ],
  goals: [
    { id: 'g1', text: 'Consigue 25.000 puntos', type: 'score', v: 25000 },
    { id: 'g2', text: 'Combo de 8.000 puntos', type: 'combo', v: 8000 },
    { id: 'g3', text: 'Vuela más de 2,5 m de altura', type: 'height', v: 2.5 },
    { id: 'g4', text: 'Grinda el borde de la piscina', type: 'grind', v: 10 },
    { id: 'g5', text: 'Salta la espina', type: 'gap', id2: 'espina' },
    { id: 'g6', text: 'Giro de 720°', type: 'spin', v: 720 },
    { id: 'g7', text: 'Recoge S-K-A-T-E', type: 'letters' },
  ],
};

// ======================================================================================== 4 · AZOTEA
const roof = {
  id: 'roof', name: 'Azotea Neón', tag: 'Saltos entre edificios', icon: '🌃',
  desc: 'De noche, sobre los tejados: salta de edificio en edificio, grinda raíles y cuidado con el vacío.',
  theme: { sky: '#120a2e', fog: '#2a1450', ground: '#2d2a3b', accent: '#ff2bd6', night: true, light: 0.55 },
  bounds: { x0: -52, x1: 52, z0: -22, z1: 22 },
  spawn: { x: -46, z: 0, yaw: Math.PI / 2 },
  time: 120,
  medals: [7000, 20000, 50000],
  respawnBelow: 2,
  prims: P([
    box(-32, 0, 40, 40, 8, 0, { color: 'roof' }),
    box(0, 0, 6, 14, 5.5, 0, { color: 'roof' }),
    box(31, 0, 42, 40, 6.5, 0, { color: 'roof' }),
    ramp(-13.8, 0, 7, 3.6, 0, 1.6, Math.PI / 2, { y0: 8 }),
    ramp(1.8, 0, 4, 2.4, 0, 1.3, Math.PI / 2, { y0: 5.5 }),
    ramp(13.8, 0, 7, 3.6, 1.0, 0, Math.PI / 2, { y0: 6.5 }),
    quarter(-49, 0, 8, 2.2, 2.2, -Math.PI / 2, 0.5, { y0: 8 }),
    box(-40, -12, 10, 0.6, 0.5, 0, { grind: true, y0: 8, color: 'paint' }),
    box(-28, 13, 9, 0.6, 0.5, 0, { grind: true, y0: 8, color: 'paint' }),
    rail(-38, 8, -20, 8, 8.85),
    rail(-24, -9, -12.5, -9, 9.0, 8.4),
    funbox(-28, 0, 6, 4, 0.6, 3.2, Math.PI / 2, { y0: 8 }),
    box(-16, 14, 4, 4, 2.4, 0, { solid: true, y0: 8, color: 'vent' }),
    box(-44, 14, 3, 3, 3, 0, { solid: true, y0: 8, color: 'vent' }),
    rail(18, 9, 30, 9, 7.35),
    rail(20, -10, 36, -10, 7.4, 6.9),
    halfpipe(44, 0, 9, 5, 2.2, 2.2, 0, 0.8, { y0: 6.5 }),
    funbox(26, 0, 6, 4, 0.55, 3, Math.PI / 2, { y0: 6.5 }),
    pyramid(46, 14, 7, 7, 0.9, 3, 0, { y0: 6.5 }),
    box(32, -15, 10, 0.6, 0.5, 0, { grind: true, y0: 6.5, color: 'paint' }),
  ]),
  gaps: [
    { id: 'salto1', name: 'Primer salto', x: -8, z: 0, r: 4.2, pts: 800 },
    { id: 'salto2', name: 'Segundo salto', x: 6.5, z: 0, r: 3.4, pts: 800 },
  ],
  letters: [
    { ch: 'S', x: -34, z: 8, up: 1.4 }, { ch: 'K', x: -8, z: 0, up: 1.8 }, { ch: 'A', x: 0, z: 0, up: 1.0 },
    { ch: 'T', x: 6.5, z: 0, up: 1.8 }, { ch: 'E', x: 42, z: 0, up: 3.2 },
  ],
  goals: [
    { id: 'g1', text: 'Consigue 15.000 puntos', type: 'score', v: 15000 },
    { id: 'g2', text: 'Combo de 5.000 puntos', type: 'combo', v: 5000 },
    { id: 'g3', text: 'Salta al primer edificio', type: 'gap', id2: 'salto1' },
    { id: 'g4', text: 'Cruza al último tejado', type: 'gap', id2: 'salto2' },
    { id: 'g5', text: 'Grinda 10 m seguidos', type: 'grind', v: 10 },
    { id: 'g6', text: 'Aterriza un 360 Flip', type: 'trick', id2: 'tre' },
    { id: 'g7', text: 'Recoge S-K-A-T-E', type: 'letters' },
  ],
};

// ======================================================================================== 5 · PUERTO
const port = {
  id: 'port', name: 'Puerto Industrial', tag: 'Mega rampa', icon: '🚢',
  desc: 'Contenedores, grúas, raíles en el muelle y una mega rampa de 8 metros con salto de 12 m.',
  theme: { sky: '#9dbbd0', fog: '#bccddb', ground: '#74777a', accent: '#ff9800', night: false, light: 0.95, haze: true },
  bounds: { x0: -62, x1: 62, z0: -44, z1: 44 },
  spawn: { x: -54, z: 0, yaw: Math.PI / 2 },
  time: 120,
  medals: [9000, 28000, 65000],
  prims: P([
    box(-56, 0, 12, 10, 8, 0, { color: 'metal' }),
    ramp(-38, 0, 10, 24, 0, 8, -Math.PI / 2),
    ramp(-9, 0, 8, 6, 0, 2.4, Math.PI / 2),
    ramp(6, 0, 8, 8, 1.0, 0, Math.PI / 2),
    ...[-30, -14, 2].map((x) => box(x, -24, 12, 3, 2.6, 0, { solid: true, color: 'cont' })),
    ramp(-39.2, -24, 3, 6.4, 0, 2.6, Math.PI / 2),
    halfpipe(30, -30, 12, 8, 3.0, 3.0, Math.PI / 2, 1.4),
    rail(22, 12, 42, 12, 0.95),
    rail(22, 18, 40, 18, 1.1, 0.5),
    box(46, 0, 7, 3, 0.5, 0, { grind: true, color: 'paint' }),
    stairSet(26, 30, 6, 7, 0.45, 0.18, Math.PI, { both: true }),
    funbox(40, 36, 9, 5, 0.7, 3.4, 0),
    pyramid(52, 14, 10, 10, 1.1, 4),
    wall(-61, 0, 1, 88, 3, 0, { v: 0 }),
  ]),
  gaps: [
    { id: 'mega', name: 'La Mega Rampa', x: -1, z: 0, r: 5.5, pts: 2000 },
    { id: 'contenedores', name: 'Entre contenedores', x: -22, z: -24, r: 3.2, pts: 800 },
    { id: 'muelle', name: 'Escalera del muelle', x: 26, z: 28.4, r: 3, pts: 600 },
  ],
  letters: [
    { ch: 'S', x: -56, z: 0, up: 1.4 }, { ch: 'K', x: -1, z: 0, up: 4.4 }, { ch: 'A', x: -14, z: -24, up: 1.2 },
    { ch: 'T', x: 30, z: -30, up: 4.6 }, { ch: 'E', x: 40, z: 36, up: 1.3 },
  ],
  goals: [
    { id: 'g1', text: 'Consigue 25.000 puntos', type: 'score', v: 25000 },
    { id: 'g2', text: 'Combo de 8.000 puntos', type: 'combo', v: 8000 },
    { id: 'g3', text: 'Salta la Mega Rampa', type: 'gap', id2: 'mega' },
    { id: 'g4', text: 'Pasa más de 1,5 s en el aire', type: 'air', v: 1.5 },
    { id: 'g5', text: 'Aterriza un Shove-it', type: 'trick', id2: 'shuvit' },
    { id: 'g6', text: 'Grinda 8 m seguidos', type: 'grind', v: 8 },
    { id: 'g7', text: 'Recoge S-K-A-T-E', type: 'letters' },
  ],
};

// ======================================================================================== 6 · PLAYA
const beach = {
  id: 'beach', name: 'Playa Venice', tag: 'Paseo marítimo', icon: '🌴',
  desc: 'El paseo de tablones junto al mar: cuenco con forma de concha, rampas en la arena (¡frena!), raíles y bancos.',
  theme: { sky: '#6fd3ff', fog: '#c9f1ff', ground: '#9b8f7f', accent: '#ffb300', night: false, light: 1.1, sea: true },
  bounds: { x0: -60, x1: 60, z0: -34, z1: 36 },
  spawn: { x: -52, z: -2, yaw: Math.PI / 2 },
  time: 120,
  medals: [8000, 24000, 58000],
  prims: P([
    box(0, 0, 120, 16, 0.2, 0, { color: 'wood' }),
    zone(0, 22, 120, 28, 2.4, { sand: true }),
    bowl(-34, -22, 11, 7.5, 2.3, 0.4, false, 0.25, { coping: true }),
    halfpipe(30, -24, 11, 7, 2.6, 2.6, Math.PI / 2, 1.2),
    ramp(-10, -2, 6, 4, 0.2, 1.3, Math.PI / 2, { wood: true }),
    ramp(2, -2, 6, 4, 1.3, 0.2, Math.PI / 2, { wood: true }),
    funbox(-30, 2, 7, 4, 0.55, 3, Math.PI / 2, { color: 'wood' }),
    box(14, 5, 10, 0.5, 0.5, 0, { grind: true, y0: 0.2, color: 'paint' }),
    box(26, -5, 8, 0.5, 0.5, 0, { grind: true, y0: 0.2, color: 'paint' }),
    rail(36, 3, 50, 3, 1.05),
    rail(-48, 6, -38, 6, 1.0),
    pyramid(12, 22, 8, 8, 0.7, 3),
    ramp(-20, 25, 5, 5, 0, 1.0, 0),
    stairSet(46, -8, 6, 5, 0.42, 0.17, Math.PI / 2 * 3, { y0: 0.2 }),
    wall(-59, 0, 1, 68, 3, 0, { v: 0 }),
  ]),
  gaps: [
    { id: 'concha', name: 'Sobre la concha', x: -34, z: -22, r: 4, pts: 700 },
    { id: 'olas', name: 'Salto de las olas', x: -4, z: -2, r: 3.4, pts: 600 },
    { id: 'arena', name: 'Salto a la arena', x: -20, z: 27, r: 3, pts: 500 },
  ],
  letters: [
    { ch: 'S', x: -48, z: 6, up: 1.8 }, { ch: 'K', x: -34, z: -22, up: 1.3 }, { ch: 'A', x: -4, z: -2, up: 2.6 },
    { ch: 'T', x: 30, z: -24, up: 4.6 }, { ch: 'E', x: 12, z: 22, up: 1.6 },
  ],
  goals: [
    { id: 'g1', text: 'Consigue 18.000 puntos', type: 'score', v: 18000 },
    { id: 'g2', text: 'Combo de 5.000 puntos', type: 'combo', v: 5000 },
    { id: 'g3', text: 'Salta sobre la concha', type: 'gap', id2: 'concha' },
    { id: 'g4', text: 'Aterriza un Shove-it', type: 'trick', id2: 'shuvit' },
    { id: 'g5', text: 'Manual de 3 segundos', type: 'manual', v: 3 },
    { id: 'g6', text: 'Giro de 360°', type: 'spin', v: 360 },
    { id: 'g7', text: 'Recoge S-K-A-T-E', type: 'letters' },
  ],
};

const city = buildCity({ park, street, bowl: bowlMap, roof, port, beach });
export const SKATE_MAPS = [city, park, street, bowlMap, roof, port, beach];
export const SKATE_MAP_IDS = SKATE_MAPS.map((m) => m.id);
export const SKATE_MAP_BY_ID = Object.fromEntries(SKATE_MAPS.map((m) => [m.id, m]));
export const SKATE_MODES = [
  { id: 'free', name: 'Sesión libre', desc: 'Sin tiempo ni presión. Practica trucos y explora el mapa.', time: 0, record: false },
  { id: 'attack', name: 'Puntuación', desc: '2 minutos para hacer el máximo de puntos. Medallas de bronce, plata y oro.', time: 120, record: true },
  { id: 'missions', name: 'Misiones', desc: '3 minutos para cumplir los 7 objetivos del mapa. Gana estrellas.', time: 180, record: true },
];
export const SKATE_MODE_BY_ID = Object.fromEntries(SKATE_MODES.map((m) => [m.id, m]));

/** Medalla (0 ninguna, 1 bronce, 2 plata, 3 oro) que da una puntuación en un mapa. */
export function medalFor(mapId, score) {
  const m = SKATE_MAP_BY_ID[mapId];
  if (!m) return 0;
  return m.medals.reduce((n, t) => (score >= t ? n + 1 : n), 0);
}
