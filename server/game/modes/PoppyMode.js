// Fábrica Feliz: puzles cooperativos con las manos extensibles y persecución final.
// El servidor valida cada agarre (alcance, dirección y mano correcta), abre las puertas,
// cuenta los engranajes, mueve a Tito Larguirucho y reparte las recompensas.
import { BaseMode } from './BaseMode.js';
import * as users from '../../services/users.js';
import { POPPY, DOORS, GRABS, GRAB_BY_ID, MACHINE, TAPES } from '../../../shared/worlds/poppy.js';

const xz = (a, b) => Math.hypot(a[0] - b[0], a[2] - b[2]);
const round2 = (v) => Math.round(v * 100) / 100;
const GEAR_IDS = GRABS.filter((g) => g.kind === 'gear').map((g) => g.id);

export class PoppyMode extends BaseMode {
  constructor(room) {
    super(room);
    this.round = 1;
    this.resetRound();
  }

  resetRound() {
    this.doors = DOORS.map(() => false);
    this.gears = Object.fromEntries(GEAR_IDS.map((id) => [id, null])); // null | id del jugador | 'placed'
    this.placed = 0;
    this.dual = { scanB: 0, lever: 0 };
    const [x, y, z] = POPPY.monsterHome;
    this.mon = { x, y, z, ry: Math.PI, state: 'sleep', target: null, waitUntil: 0 };
    this.chaseAt = 0;
    this.won = false;
    this.resetAt = 0;
    this.nextPeek = Date.now() + 45_000;
    for (const p of this.room.players.values()) Object.assign(this.d(p), { gears: 0, chargeUntil: 0 });
  }

  d(p) {
    if (!p.data.pp) p.data.pp = { gears: 0, chargeUntil: 0, tapes: new Set() };
    return p.data.pp;
  }

  state() {
    const carried = {};
    for (const p of this.room.players.values()) if (this.d(p).gears) carried[p.id] = this.d(p).gears;
    return { doors: this.doors, gears: this.gears, placed: this.placed, chase: this.mon.state !== 'sleep', won: this.won, round: this.round, carried };
  }

  sync() {
    this.broadcast('pp', this.state());
  }

  onJoin(p) {
    this.d(p);
    return { pp: this.state(), tapes: [...this.d(p).tapes] };
  }

  spectatorState() {
    return { pp: this.state() };
  }

  onLeave(p) {
    // Los engranajes que llevaba vuelven a su sitio
    const pd = this.d(p);
    if (pd.gears) {
      let n = pd.gears;
      for (const id of GEAR_IDS) if (n > 0 && this.gears[id] === p.id) { this.gears[id] = null; n--; }
      pd.gears = 0;
      this.sync();
    }
    if (this.mon.target === p.id) this.mon.target = null;
  }

  adminLose(p) {
    this.catch(p);
    return true;
  }

  /** ¿Apunta el jugador hacia el objetivo? (comprobación horizontal generosa) */
  aims(p, target, maxAngle = 0.75) {
    const dx = target[0] - p.pos[0], dz = target[2] - p.pos[2];
    const d = Math.hypot(dx, dz);
    if (d < 1.2) return true;
    return (dx * Math.sin(p.ry) + dz * Math.cos(p.ry)) / d > Math.cos(maxAngle);
  }

  openDoor(i, p) {
    if (this.doors[i]) return;
    if (i > 0 && !this.doors[i - 1]) return;
    this.doors[i] = true;
    this.room.systemMessage(`🚪 ${p.name} ha abierto: ${DOORS[i].name}`);
    users.award(p.id, { xp: 25, reason: 'Puerta abierta' });
    this.broadcast('pp:door', { i });
    this.sync();
  }

  onEvent(p, name, data = {}) {
    const pd = this.d(p);
    const now = Date.now();
    if (name === 'grab') {
      const g = GRAB_BY_ID[String(data.id || '')];
      const hand = data.hand === 'red' ? 'red' : 'blue';
      if (!g) return { error: 'No hay nada que agarrar' };
      const eye = [p.pos[0], p.pos[1] + 1.6, p.pos[2]];
      if (Math.hypot(eye[0] - g.p[0], eye[1] - g.p[1], eye[2] - g.p[2]) > POPPY.handRange) return { error: 'Está demasiado lejos para tus manos' };
      if (!this.aims(p, g.p)) return { error: 'Apunta bien' };
      this.broadcast('pp:hand', { id: p.id, hand, to: g.p });
      if (g.hand !== 'any' && g.hand !== hand) return { error: g.hand === 'blue' ? 'Esto necesita la MANO AZUL' : 'Esto necesita la MANO ROJA' };
      switch (g.kind) {
        case 'scanner':
        case 'lever':
          if (g.dual) {
            this.dual[g.id] = now;
            const other = g.id === 'scanB' ? 'lever' : 'scanB';
            if (now - this.dual[other] <= POPPY.dualMs) this.openDoor(g.door, p);
            else return { ok: true, msg: 'Ahora el otro mando, ¡rápido!' };
          } else this.openDoor(g.door, p);
          return { ok: true };
        case 'plug':
          pd.chargeUntil = now + POPPY.chargeMs;
          return { ok: true, charged: pd.chargeUntil };
        case 'receiver':
          if (pd.chargeUntil < now) return { error: 'Tu mano roja no tiene electricidad: cárgala en el generador' };
          pd.chargeUntil = 0;
          this.openDoor(g.door, p);
          return { ok: true };
        case 'gear':
          return this.takeGear(p, g.id);
        case 'switch':
          if (this.mon.state === 'sleep' || this.won) return { error: 'Ahora no pasa nada…' };
          this.win(p);
          return { ok: true };
        default:
          return { error: 'No se puede' };
      }
    }
    if (name === 'pick') {
      const id = String(data.id || '');
      const t = TAPES.find((x) => x.id === id);
      if (t) {
        if (xz(p.pos, t.p) > 2.6 || Math.abs(p.pos[1] - t.p[1]) > 3.2) return { error: 'Acércate más' };
        if (pd.tapes.has(id)) return { ok: true, tape: id };
        pd.tapes.add(id);
        let all = false;
        users.updateStats(p.id, (s) => {
          s.poppyTapes = Array.isArray(s.poppyTapes) ? s.poppyTapes : [];
          if (!s.poppyTapes.includes(id)) s.poppyTapes.push(id);
          all = TAPES.every((x) => s.poppyTapes.includes(x.id));
        });
        users.award(p.id, { xp: 15, reason: 'Cinta VHS encontrada' });
        if (all) users.unlockAchievement(p.id, 'poppy_tapes');
        return { ok: true, tape: id };
      }
      const g = GRAB_BY_ID[id];
      if (g?.kind === 'gear') {
        if (xz(p.pos, g.p) > 2.6 || Math.abs(p.pos[1] - g.p[1]) > 2.5) return { error: 'Acércate más' };
        return this.takeGear(p, id);
      }
      return { error: 'No hay nada aquí' };
    }
    if (name === 'machine') {
      if (xz(p.pos, MACHINE) > 3.2) return { error: 'Acércate a la máquina' };
      if (!pd.gears) return { error: `Faltan engranajes (${this.placed}/3)` };
      for (const id of GEAR_IDS) if (this.gears[id] === p.id) this.gears[id] = 'placed';
      this.placed += pd.gears;
      pd.gears = 0;
      if (this.placed >= 3) this.openDoor(2, p);
      else this.room.systemMessage(`⚙️ ${p.name} ha puesto engranajes (${this.placed}/3)`);
      this.sync();
      return { ok: true };
    }
    return { error: 'Evento no soportado' };
  }

  takeGear(p, id) {
    if (this.gears[id]) return { error: 'Ese engranaje ya lo tiene alguien' };
    this.gears[id] = p.id;
    this.d(p).gears++;
    this.sync();
    return { ok: true, gear: id };
  }

  // --- Tito Larguirucho -------------------------------------------------------------
  catch(p) {
    const m = this.mon;
    this.broadcast('pp:caught', { id: p.id, name: p.name });
    this.room.systemMessage(`😱 Tito ha atrapado a ${p.name}`);
    m.target = null;
    m.waitUntil = Date.now() + 3500;
    setTimeout(() => {
      if (!this.room.players.has(p.id)) return;
      const pos = this.mon.state === 'sleep' ? this.room.respawn(p) : POPPY.chaseRespawn;
      this.room.teleport(p, pos);
      this.emit(p, 'respawn', { p: pos });
    }, 1800);
    // Si el punto de vuelta queda junto a Tito, vuelve a su vitrina
    if (Math.abs(m.z - POPPY.chaseRespawn[2]) < 14) [m.x, m.y, m.z] = POPPY.monsterHome;
  }

  win(p) {
    this.won = true;
    this.mon.state = 'dead';
    this.broadcast('pp:win', { by: p.name });
    this.room.systemMessage(`📦 ¡${p.name} ha soltado la caja sobre Tito! ¡Habéis escapado de Fábrica Feliz!`);
    for (const o of this.room.players.values()) {
      const coins = users.dailyCapped(o.id, 'poppy', 60, 120);
      users.award(o.id, { xp: 220, coins, reason: '¡Has escapado de Fábrica Feliz!' });
      users.updateStats(o.id, (s) => { s.poppyEscapes = (s.poppyEscapes || 0) + 1; s.wins = (s.wins || 0) + 1; });
      users.unlockAchievement(o.id, 'poppy_escape');
      users.unlockItem(o.id, 'acc_grabpack', 'Fábrica Feliz');
      users.setHistoryResult(o.historyId, 'Escapó de la fábrica');
    }
    this.resetAt = Date.now() + 15_000;
    this.sync();
  }

  tick(dt) {
    const now = Date.now();
    if (this.resetAt && now > this.resetAt) {
      this.round++;
      this.resetRound();
      for (const p of this.room.players.values()) {
        const pos = this.room.respawn(p);
        this.emit(p, 'respawn', { p: pos });
      }
      this.room.systemMessage(`🧸 Ronda ${this.round}: la fábrica vuelve a estar cerrada…`);
      this.sync();
      return;
    }
    if (!this.room.players.size) return;
    const m = this.mon;
    const players = [...this.room.players.values()];
    // Despierta cuando alguien entra en la sala de la vitrina
    if (m.state === 'sleep') {
      if (this.doors[3] && players.some((p) => p.pos[2] > POPPY.chaseStartZ)) {
        m.state = 'chase';
        m.waitUntil = now + 2500;
        this.chaseAt = now;
        this.broadcast('pp:wake', {});
        this.room.systemMessage('😈 ¡Tito Larguirucho se ha despertado! ¡CORRED HACIA LA SALIDA!');
        this.sync();
      } else if (now > this.nextPeek) {
        // Susto controlado: se asoma un momento cerca de la siguiente puerta cerrada
        this.nextPeek = now + 40_000 + Math.random() * 30_000;
        const next = this.doors.findIndex((o) => !o);
        if (next >= 0) {
          const z = DOORS[next].z - 2.5;
          this.broadcast('pp:peek', { p: [Math.random() < 0.5 ? -6 : 6, 0, z] });
        }
      }
      return;
    }
    if (m.state !== 'chase' || now < m.waitUntil) return;
    // Persigue al jugador más cercano que esté en la zona final
    let best = null, bd = Infinity;
    for (const p of players) {
      if (p.pos[2] < 80) continue;
      const d = Math.hypot(p.pos[0] - m.x, p.pos[2] - m.z);
      if (d < bd) { bd = d; best = p; }
    }
    if (!best) {
      // Nadie a la vista: vuelve hacia su vitrina
      const [hx, , hz] = POPPY.monsterHome;
      const d = Math.hypot(hx - m.x, hz - m.z);
      if (d > 0.5) { m.x += ((hx - m.x) / d) * 3 * dt; m.z += ((hz - m.z) / d) * 3 * dt; }
      return;
    }
    m.target = best.id;
    const speed = POPPY.monsterSpeed + Math.min(2.5, (now - this.chaseAt) / 30_000);
    const dx = best.pos[0] - m.x, dz = best.pos[2] - m.z;
    const s = Math.min(bd, speed * dt);
    m.x += (dx / bd) * s;
    m.z += (dz / bd) * s;
    m.y = m.z > 90 && m.z < 94 && Math.abs(m.x) < 3 ? 0.5 : 0;
    m.ry = Math.atan2(dx, dz);
    if (bd < POPPY.catchDist && Math.abs(best.pos[1] - m.y) < 2.5) this.catch(best);
  }

  snapExtra() {
    const m = this.mon;
    return { pp: [round2(m.x), round2(m.y), round2(m.z), round2(m.ry), m.state === 'chase' && Date.now() >= m.waitUntil ? 'chase' : m.state] };
  }
}
