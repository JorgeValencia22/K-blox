// Laberinto Sombrío: almas compartidas por todo el equipo, verja de salida y "La Sombra",
// un monstruo simulado en el servidor que se mueve por los pasillos del laberinto.
import { BaseMode } from './BaseMode.js';
import * as users from '../../services/users.js';
import { WALL, mazeDistances } from '../../../shared/worlds/horror.js';

const PATROL_SPEED = 4.2;
const CHASE_SPEED = 8.4; // un poco más rápido que caminar; corriendo se escapa (con aguante limitado)
const SIGHT = 22;
const HEAR_RUN = 34;
const CATCH_DIST = 1.6;

export class HorrorMode extends BaseMode {
  constructor(room) {
    super(room);
    this.maze = this.world.meta.maze;
    this.souls = this.objectsOfType('gem').filter((o) => o.id.startsWith('soul'));
    this.exitZone = this.objectsOfType('zone').find((z) => z.id === 'exitzone');
    this.round = 1;
    this.resetRound();
  }

  resetRound() {
    this.collected = new Set();
    this.gateOpen = false;
    this.ending = 0;
    const { n } = this.maze;
    // La Sombra empieza en la esquina opuesta a la entrada
    const [x, z] = this.center(n - 1, 0);
    this.mon = { x, z, state: 'patrol', target: null, goal: null, retreatUntil: 0, ry: 0 };
  }

  center(i, j) {
    const { x0, z0, cell } = this.maze;
    return [x0 + (i + 0.5) * cell, z0 + (j + 0.5) * cell];
  }

  cellOf(x, z) {
    const { x0, z0, cell, n } = this.maze;
    const i = Math.max(0, Math.min(n - 1, Math.floor((x - x0) / cell)));
    const j = Math.max(0, Math.min(n - 1, Math.floor((z - z0) / cell)));
    return [i, j];
  }

  insideMaze(x, z) {
    const { x0, z0, cell, n } = this.maze;
    return x > x0 && z > z0 && x < x0 + n * cell && z < z0 + n * cell;
  }

  /** Siguiente celda hacia `goal` desde `from` (por pasillos). */
  nextCell(from, goal) {
    const { n, cells } = this.maze;
    const dist = mazeDistances(cells, n, goal[0], goal[1]);
    const d0 = dist[from[1] * n + from[0]];
    if (d0 <= 0) return goal;
    const steps = [[0, -1, WALL.N], [1, 0, WALL.E], [0, 1, WALL.S], [-1, 0, WALL.W]];
    for (const [di, dj, w] of steps) {
      if (cells[from[1] * n + from[0]] & w) continue;
      const a = from[0] + di, b = from[1] + dj;
      if (a < 0 || b < 0 || a >= n || b >= n) continue;
      if (dist[b * n + a] === d0 - 1) return [a, b];
    }
    return goal;
  }

  state() {
    return { collected: [...this.collected], total: this.souls.length, gateOpen: this.gateOpen, round: this.round };
  }

  sync() {
    this.broadcast('horror', this.state());
  }

  spectatorState() {
    return { horror: this.state() };
  }

  adminLose(p) {
    // La Sombra aparece junto al jugador y lo atrapa
    this.mon.x = p.pos[0];
    this.mon.z = p.pos[2];
    p.data.caughtAt = 0;
    return false;
  }

  onJoin(p) {
    p.data = { caughtAt: 0, escaped: false };
    return { horror: this.state() };
  }

  onInteract(p, o) {
    if (o.t !== 'gem' || !o.id.startsWith('soul')) return null;
    if (this.collected.has(o.id)) return { error: 'Ya recogida' };
    this.collected.add(o.id);
    users.award(p.id, { xp: 20, reason: 'Alma recuperada' });
    this.room.systemMessage(`👻 ${p.name} ha encontrado un alma (${this.collected.size}/${this.souls.length})`);
    if (this.collected.size >= this.souls.length) {
      this.gateOpen = true;
      this.room.systemMessage('🔓 ¡La verja de salida se ha abierto! Corred hacia la salida del este.');
    }
    this.sync();
    return { ok: true, collected: o.id };
  }

  onState(p) {
    if (!this.gateOpen || p.data.escaped || !this.exitZone || !this.inside(p, this.exitZone, 0.5, 3)) return;
    p.data.escaped = true;
    users.updateStats(p.id, (s) => { s.escapes = (s.escapes || 0) + 1; s.wins = (s.wins || 0) + 1; });
    const coins = users.dailyCapped(p.id, 'horror', 60, 120);
    users.award(p.id, { xp: 150, coins, reason: '¡Has escapado!' });
    users.unlockAchievement(p.id, 'escape');
    users.setHistoryResult(p.historyId, 'Escapó del laberinto');
    this.room.systemMessage(`🏃 ${p.name} ha escapado del laberinto`);
    if (!this.ending) this.ending = Date.now() + 8000;
  }

  pickTarget() {
    const m = this.mon;
    let best = null, bd = Infinity;
    for (const p of this.room.players.values()) {
      if (p.data.escaped || Date.now() - p.data.caughtAt < 4000) continue;
      if (!this.insideMaze(p.pos[0], p.pos[2]) && Math.hypot(p.pos[0] - m.x, p.pos[2] - m.z) > 10) continue;
      const d = Math.hypot(p.pos[0] - m.x, p.pos[2] - m.z);
      const heard = p.anim === 'run' && d < HEAR_RUN;
      if ((d < SIGHT || heard) && d < bd) { bd = d; best = p; }
    }
    return best;
  }

  tick(dt) {
    const now = Date.now();
    if (this.ending && now > this.ending) {
      // Fin de la ronda: todos vuelven a la entrada y el laberinto se reinicia
      this.round++;
      this.resetRound();
      for (const p of this.room.players.values()) {
        p.data.escaped = false;
        const pos = this.room.respawn(p);
        this.emit(p, 'respawn', { p: pos });
      }
      this.room.systemMessage(`🌑 Ronda ${this.round}: La Sombra vuelve a acechar...`);
      this.sync();
      return;
    }
    if (this.room.players.size === 0) return;
    const m = this.mon;
    const target = now > m.retreatUntil ? this.pickTarget() : null;
    let speed = PATROL_SPEED;
    let goalX, goalZ;
    const here = this.cellOf(m.x, m.z);
    if (target) {
      m.state = 'chase';
      speed = CHASE_SPEED;
      const tc = this.cellOf(target.pos[0], target.pos[2]);
      if (tc[0] === here[0] && tc[1] === here[1]) {
        goalX = target.pos[0];
        goalZ = target.pos[2];
      } else {
        [goalX, goalZ] = this.center(...this.nextCell(here, tc));
      }
    } else {
      m.state = 'patrol';
      if (!m.goal || (here[0] === m.goal[0] && here[1] === m.goal[1] && Math.hypot(...this.center(...m.goal).map((v, i) => v - [m.x, m.z][i])) < 0.6)) {
        m.goal = [Math.floor(Math.random() * this.maze.n), Math.floor(Math.random() * this.maze.n)];
      }
      [goalX, goalZ] = this.center(...this.nextCell(here, m.goal));
    }
    const dx = goalX - m.x, dz = goalZ - m.z, d = Math.hypot(dx, dz);
    if (d > 0.05) {
      const s = Math.min(d, speed * dt);
      m.x += (dx / d) * s;
      m.z += (dz / d) * s;
      m.ry = Math.atan2(dx, dz);
    }
    // Atrapar
    for (const p of this.room.players.values()) {
      if (p.data.escaped || now - p.data.caughtAt < 4000) continue;
      if (Math.hypot(p.pos[0] - m.x, p.pos[2] - m.z) < CATCH_DIST && p.pos[1] < 3) {
        p.data.caughtAt = now;
        m.retreatUntil = now + 5000;
        m.goal = null;
        this.broadcast('horror:caught', { id: p.id, name: p.name });
        this.room.systemMessage(`😱 La Sombra ha atrapado a ${p.name}`);
        setTimeout(() => {
          if (!this.room.players.has(p.id)) return;
          const pos = this.room.respawn(p);
          this.emit(p, 'respawn', { p: pos });
        }, 1800);
      }
    }
  }

  snapExtra() {
    const m = this.mon;
    return { mon: [Math.round(m.x * 100) / 100, Math.round(m.z * 100) / 100, Math.round(m.ry * 100) / 100, m.state === 'chase' ? 1 : 0] };
  }
}
