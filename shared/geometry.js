// Utilidades geométricas compartidas (cliente y servidor).

/** ¿Está el punto p dentro de la caja del objeto o (rotada en Y), ampliada `pad`? */
export function insideObject(p, o, pad = 0, padY = pad) {
  const a = (-(o.ry || 0) * Math.PI) / 180;
  const dx = p[0] - o.p[0], dz = p[2] - o.p[2];
  const lx = dx * Math.cos(a) + dz * Math.sin(a);
  const lz = -dx * Math.sin(a) + dz * Math.cos(a);
  return Math.abs(lx) <= o.s[0] / 2 + pad && Math.abs(lz) <= o.s[2] / 2 + pad && Math.abs(p[1] - o.p[1]) <= o.s[1] / 2 + padY;
}

/**
 * Convierte la fracción de un ciclo (0..1) en hora del cielo, con días más
 * largos que las noches: 70 % del ciclo es de día.
 */
export function cycleToSkyTime(f) {
  f = ((f % 1) + 1) % 1;
  if (f < 0.7) return 0.23 + (f / 0.7) * 0.55;
  return (0.78 + ((f - 0.7) / 0.3) * 0.45) % 1;
}
