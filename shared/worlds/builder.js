// Ayudante para generar mundos oficiales con código (deterministas).

export class WorldGen {
  constructor(prefix = 'o') {
    this.prefix = prefix;
    this.n = 0;
    this.objects = [];
  }

  add(t, p, s, c, m = 'plastic', extra = {}) {
    const o = { id: extra.id || `${this.prefix}${this.n++}`, t, p: p.map(r3), ry: 0, s: s.map(r3), c, m, ...extra };
    this.objects.push(o);
    return o;
  }

  block(p, s, c, m = 'plastic', extra) {
    return this.add('block', p, s, c, m, extra);
  }

  /**
   * Edificio hueco con puerta en la cara `front` ('n','s','e','w').
   * (x,z) = centro, y0 = suelo. Devuelve el id de la puerta.
   */
  building(x, y0, z, w, d, h, front, opts = {}) {
    const wall = opts.wall || '#eeeeee';
    const roof = opts.roof || '#b71c1c';
    const t = 0.5;
    const doorW = 2.4, doorH = 3.4;
    const mat = opts.material || 'brick';
    // Suelo interior y techo
    this.block([x, y0 + 0.1, z], [w, 0.2, d], opts.floor || '#bcaaa4', 'wood');
    this.block([x, y0 + h + 0.25, z], [w + 0.8, 0.5, d + 0.8], roof, 'plastic');
    const sides = {
      n: { cx: x, cz: z - d / 2 + t / 2, len: w, axis: 'x' },
      s: { cx: x, cz: z + d / 2 - t / 2, len: w, axis: 'x' },
      w: { cx: x - w / 2 + t / 2, cz: z, len: d, axis: 'z' },
      e: { cx: x + w / 2 - t / 2, cz: z, len: d, axis: 'z' },
    };
    let doorId = null;
    for (const [k, sd] of Object.entries(sides)) {
      const size = (len) => (sd.axis === 'x' ? [len, h, t] : [t, h, len]);
      if (k !== front) {
        this.block([sd.cx, y0 + h / 2, sd.cz], size(sd.len), wall, mat);
        // Ventanas decorativas en la cara exterior
        if (sd.len > 6 && !opts.noWindows) {
          const off = sd.axis === 'x' ? (k === 'n' ? -0.3 : 0.3) : (k === 'w' ? -0.3 : 0.3);
          const wx = sd.axis === 'x' ? sd.cx : sd.cx + off;
          const wz = sd.axis === 'x' ? sd.cz + off : sd.cz;
          this.add('window', [wx, y0 + h * 0.55, wz], sd.axis === 'x' ? [2.4, 1.6, 0.1] : [0.1, 1.6, 2.4], '#b3e5fc', 'glass');
        }
        continue;
      }
      const side = (sd.len - doorW) / 2;
      const off = (doorW + side) / 2;
      const lintelH = h - doorH;
      if (sd.axis === 'x') {
        this.block([sd.cx - off, y0 + h / 2, sd.cz], [side, h, t], wall, mat);
        this.block([sd.cx + off, y0 + h / 2, sd.cz], [side, h, t], wall, mat);
        if (lintelH > 0) this.block([sd.cx, y0 + doorH + lintelH / 2, sd.cz], [doorW, lintelH, t], wall, mat);
        doorId = this.add('door', [sd.cx, y0 + doorH / 2, sd.cz], [doorW - 0.1, doorH - 0.05, 0.3], opts.door || '#795548', 'wood').id;
      } else {
        this.block([sd.cx, y0 + h / 2, sd.cz - off], [t, h, side], wall, mat);
        this.block([sd.cx, y0 + h / 2, sd.cz + off], [t, h, side], wall, mat);
        if (lintelH > 0) this.block([sd.cx, y0 + doorH + lintelH / 2, sd.cz], [t, lintelH, doorW], wall, mat);
        doorId = this.add('door', [sd.cx, y0 + doorH / 2, sd.cz], [0.3, doorH - 0.05, doorW - 0.1], opts.door || '#795548', 'wood').id;
      }
    }
    return doorId;
  }
}

export const r3 = (v) => Math.round(v * 1000) / 1000;
