// Personajes no jugadores (NPC) simulados en el servidor: pasean por una red de
// caminos, se paran, bailan, se sientan, saludan, hablan con los jugadores, dan
// pistas y pueden acompañarlos. Todos los jugadores de la sala ven lo mismo.
import { mulberry32, getHeightmap } from '../../shared/terrain.js';
import { randomAvatar } from '../../shared/avatar.js';
import * as users from '../services/users.js';

const DEG = Math.PI / 180;

// Red de caminos por mundo: nodos [x, z, acción?] y aristas entre índices.
const CONFIGS = {
  city: {
    y: 3.1,
    people: [
      ['Lía', 'Guía'], ['Bruno', 'Mecánico'], ['Nora', 'Pintora'], ['Teo', 'Turista'],
      ['Maya', 'Cartera'], ['Iker', 'Corredor'], ['Sol', 'Jardinera'], ['Dani', 'Músico'],
    ],
    nodes: [
      [9, 9], [9, -9], [-9, 9], [-9, -9], // 0-3 plaza
      [20, 0], [-20, 0], [0, -22], [9, 24], [0, 26], // 4-8 salidas de la plaza
      [50, 0], [-50, 0], [0, 50], [0, -50], // 9-12 anillo
      [50, 50], [50, -50], [-50, 50], [-50, -50], // 13-16 esquinas
      [88, 0], [-88, 0], [0, 88], [0, -88], // 17-20 extremos de avenidas
      [12, 12, 'sit', -135, 3.95], [-12, 12, 'sit', 135, 3.95], [12, -12, 'sit', -45, 3.95], [-12, -12, 'sit', 45, 3.95], // 21-24 bancos
    ],
    edges: [
      [0, 1], [1, 3], [3, 2], [2, 0], [0, 4], [1, 4], [2, 5], [3, 5], [1, 6], [3, 6], [0, 7], [7, 8],
      [4, 9], [5, 10], [8, 11], [6, 12], [9, 17], [10, 18], [11, 19], [12, 20],
      [9, 13], [13, 11], [11, 15], [15, 10], [10, 16], [16, 12], [12, 14], [14, 9],
      [0, 21], [2, 22], [1, 23], [3, 24],
    ],
  },
  hangout: {
    y: 0,
    people: [
      ['Rita', 'DJ'], ['Pau', 'Bailarín'], ['Alba', 'Cantante'], ['Gael', 'Skater'], ['Vera', 'Fotógrafa'], ['Luca', 'Cocinero'], ['Zoe', 'Exploradora'],
    ],
    nodes: [
      [13, 0], [9, -9], [0, -13], [-9, -9], [-13, 0], [-9, 9], [-6, 15], [6, 15], [9, 9], // 0-8 anillo de la fuente
      [32, 0], [-32, 0], [0, -30], [0, 30], [20, 13], [30, -28], // 9-14 exterior
      [-19, -19, 'dance'], [-22, -16, 'dance'], [14, -14, 'cheer'], // 15-17 pista y hoguera
      [0, 8, 'sit', 0, 0.95], [8, 0, 'sit', 90, 0.95], [-8, 0, 'sit', 270, 0.95], [0, -8, 'sit', 180, 0.95], // 18-21 bancos
    ],
    edges: [
      [0, 1], [1, 2], [2, 3], [3, 4], [4, 5], [5, 6], [6, 7], [7, 8], [8, 0],
      [0, 9], [4, 10], [2, 11], [7, 12], [8, 13], [9, 13], [9, 14], [11, 14],
      [3, 15], [15, 16], [1, 17], [8, 18], [0, 19], [4, 20], [1, 21],
    ],
  },
};

const LINES = {
  hola: ['¡Hola! ¡Qué buen día para explorar!', '¡Hey! ¿Qué tal tu partida?', '¡Buenas! Me encanta este sitio.', '¡Hola! ¿Eres nuevo por aquí?', '¡Saludos, viajero de bloques!'],
  adios: ['¡Hasta luego!', '¡Nos vemos!', '¡Que te diviertas!', '¡Chao! Vuelve cuando quieras.'],
  baile: ['¡A bailar! 💃', '¡Dale, que suena buena música! 🎶', '¡Mira este paso!'],
  sigue: ['¡Vale, te acompaño un rato!', '¡Vamos! Tú guías.', '¡Te sigo!'],
  ocupado: ['Ahora mismo estoy acompañando a otra persona.'],
  hangoutTips: [
    'Si bailas en la pista de colores (tecla 2) ganas Kesty Coins.',
    'El trampolín más lejano te lleva a la plataforma del cielo.',
    'Siéntate junto a la hoguera, es muy relajante.',
    'Prueba el tobogán: sube por las escaleras amarillas.',
  ],
  cityTips: [
    'En el aparcamiento del sureste hay coches libres.',
    'La avioneta está en el aeródromo, al este. ¡Mantén pulsado Espacio para acelerar!',
    'Hay un cofre en lo alto del observatorio: sube por el ascensor amarillo.',
    'Desde la cumbre de la montaña del noroeste se ve toda la isla.',
  ],
  roles: {
    Guía: 'Conozco cada rincón de Kest City.',
    Mecánico: 'Si un coche se queda atascado, en 3 minutos vuelve a su sitio.',
    Pintora: 'Estoy buscando colores para mi próximo cuadro.',
    Turista: '¡Es mi primera vez en la isla!',
    Cartera: 'Reparto cartas por toda la ciudad.',
    Corredor: 'Entreno para la carrera de karts.',
    Jardinera: 'Cuido los árboles del parque.',
    Músico: 'Practico una canción nueva para la plaza.',
    DJ: '¡La música de la pista la pongo yo!',
  },
};

const pick = (rng, list) => list[Math.floor(rng() * list.length)];
const OPTIONS = [
  { id: 'hola', label: '👋 Saludar' },
  { id: 'pista', label: '💡 ¿Alguna pista?' },
  { id: 'baile', label: '💃 ¡Bailemos!' },
  { id: 'sigue', label: '🚶 Sígueme' },
  { id: 'adios', label: '👋 Adiós' },
];

function compass(dx, dz) {
  // -z es el norte en el mapa
  const a = (Math.atan2(dx, -dz) * 180) / Math.PI;
  const dirs = ['norte', 'noreste', 'este', 'sureste', 'sur', 'suroeste', 'oeste', 'noroeste'];
  return dirs[(Math.round(a / 45) + 8) % 8];
}

export class NpcManager {
  static supports(key) {
    return !!CONFIGS[key];
  }

  constructor(room, key) {
    this.room = room;
    this.key = key;
    this.cfg = CONFIGS[key];
    this.rng = mulberry32(key.length * 7919 + 13);
    this.hm = room.world.terrain?.type === 'island' ? getHeightmap(room.world.terrain) : null;
    this.adj = this.cfg.nodes.map(() => []);
    for (const [a, b] of this.cfg.edges) { this.adj[a].push(b); this.adj[b].push(a); }
    // Nodos de paso (los de banco/baile son destinos, no se generan NPC encima)
    const walkable = this.cfg.nodes.map((n, i) => i).filter((i) => !this.cfg.nodes[i][2]);
    this.npcs = this.cfg.people.map(([name, title], i) => {
      const start = walkable[(i * 3) % walkable.length];
      const n = this.cfg.nodes[start];
      return {
        id: `npc-${key}-${i}`, name, title, avatar: randomAvatar(mulberry32(i * 101 + key.length)),
        pos: [n[0], this.groundY(n[0], n[2] ? n[4] : undefined, n[1]), n[1]], ry: 0, anim: 'idle',
        node: start, prev: -1, target: null, state: 'idle', timer: 1 + this.rng() * 3, followId: null, talkedBy: new Set(),
      };
    });
  }

  groundY(x, forced, z) {
    if (forced != null) return forced;
    if (this.hm) return Math.max(this.cfg.y, this.hm.heightAt(x, z) + 0.05);
    return this.cfg.y;
  }

  publicList() {
    return this.npcs.map((n) => ({ id: n.id, name: n.name, title: n.title, level: 'NPC', npc: true, avatar: n.avatar, p: n.pos, ry: n.ry, a: n.anim }));
  }

  snapEntries() {
    return this.npcs.map((n) => ({ id: n.id, p: n.pos.map((v) => Math.round(v * 100) / 100), ry: Math.round(n.ry * 100) / 100, a: n.anim }));
  }

  pickNext(n) {
    const options = this.adj[n.node].filter((i) => i !== n.prev);
    const list = options.length ? options : this.adj[n.node];
    n.prev = n.node;
    n.node = pick(this.rng, list);
    const t = this.cfg.nodes[n.node];
    n.target = [t[0], t[1]];
    n.state = 'walk';
  }

  /** Mueve el NPC hacia (tx,tz). Devuelve true al llegar. */
  step(n, tx, tz, speed, dt, stopAt = 0.15) {
    const dx = tx - n.pos[0], dz = tz - n.pos[2];
    const d = Math.hypot(dx, dz);
    if (d <= stopAt) return true;
    const s = Math.min(d - stopAt, speed * dt);
    n.pos[0] += (dx / d) * s;
    n.pos[2] += (dz / d) * s;
    n.pos[1] = this.groundY(n.pos[0], undefined, n.pos[2]);
    n.ry = Math.atan2(dx, dz);
    return d - s <= stopAt;
  }

  arrive(n) {
    const node = this.cfg.nodes[n.node];
    const action = node[2];
    if (action === 'sit') {
      n.pos = [node[0], node[4], node[1]];
      n.ry = node[3] * DEG;
      n.anim = 'sit';
      n.state = 'pause';
      n.timer = 6 + this.rng() * 8;
    } else if (action === 'dance') {
      n.anim = pick(this.rng, ['dance', 'dance', 'robot']);
      n.state = 'pause';
      n.timer = 8 + this.rng() * 8;
    } else if (action === 'cheer' || this.rng() < 0.12) {
      n.anim = pick(this.rng, ['wave', 'cheer']);
      n.state = 'pause';
      n.timer = 1.6;
    } else if (this.rng() < 0.35) {
      n.anim = 'idle';
      n.state = 'pause';
      n.timer = 2 + this.rng() * 4;
    } else this.pickNext(n);
  }

  nearestNode(n) {
    let best = 0, bd = Infinity;
    this.cfg.nodes.forEach((node, i) => {
      if (node[2]) return;
      const d = Math.hypot(node[0] - n.pos[0], node[1] - n.pos[2]);
      if (d < bd) { bd = d; best = i; }
    });
    return best;
  }

  tick(dt) {
    for (const n of this.npcs) {
      switch (n.state) {
        case 'walk':
          n.anim = 'walk';
          if (this.step(n, n.target[0], n.target[1], 3, dt)) this.arrive(n);
          break;
        case 'pause':
        case 'talk':
        case 'emote':
          n.timer -= dt;
          if (n.timer <= 0) {
            const node = this.cfg.nodes[n.node];
            if (node[2] === 'sit') n.pos[1] = this.groundY(n.pos[0], undefined, n.pos[2]);
            n.anim = 'idle';
            this.pickNext(n);
          }
          break;
        case 'follow': {
          const p = this.room.players.get(n.followId);
          n.timer -= dt;
          if (!p || n.timer <= 0 || p.vehicleId || Math.hypot(p.pos[0] - n.pos[0], p.pos[2] - n.pos[2]) > 60) {
            n.followId = null;
            n.state = 'return';
            n.node = this.nearestNode(n);
            const t = this.cfg.nodes[n.node];
            n.target = [t[0], t[1]];
            break;
          }
          const d = Math.hypot(p.pos[0] - n.pos[0], p.pos[2] - n.pos[2]);
          if (d > 3) {
            this.step(n, p.pos[0], p.pos[2], d > 9 ? 8 : 5, dt, 2.5);
            n.anim = d > 9 ? 'run' : 'walk';
          } else {
            n.anim = 'idle';
            n.ry = Math.atan2(p.pos[0] - n.pos[0], p.pos[2] - n.pos[2]);
          }
          break;
        }
        case 'return':
          n.anim = 'walk';
          if (this.step(n, n.target[0], n.target[1], 4, dt)) { n.prev = -1; this.pickNext(n); }
          break;
        default:
          n.timer -= dt;
          if (n.timer <= 0) this.pickNext(n);
      }
    }
  }

  /** Conversación con un jugador. Devuelve { ok, name, title, say, options }. */
  talk(p, npcId, action) {
    const n = this.npcs.find((x) => x.id === npcId);
    if (!n) return { error: 'Personaje no encontrado' };
    if (Math.hypot(p.pos[0] - n.pos[0], p.pos[2] - n.pos[2]) > 6) return { error: 'Acércate más para hablar' };
    const face = () => { n.ry = Math.atan2(p.pos[0] - n.pos[0], p.pos[2] - n.pos[2]); };
    const keepSeat = this.cfg.nodes[n.node][2] === 'sit' && n.state === 'pause';
    let say;
    switch (action) {
      case 'hola':
      default:
        say = `${pick(this.rng, LINES.hola)} Soy ${n.name}. ${LINES.roles[n.title] || ''}`.trim();
        if (!keepSeat) { face(); n.anim = 'wave'; n.state = 'talk'; n.timer = 5; }
        this.rewardFirstTalk(p, n);
        break;
      case 'pista':
        say = this.hint(p);
        if (!keepSeat) { face(); n.anim = 'idle'; n.state = 'talk'; n.timer = 6; }
        break;
      case 'baile':
        say = pick(this.rng, LINES.baile);
        face();
        n.anim = pick(this.rng, ['dance', 'robot']);
        n.state = 'emote';
        n.timer = 8;
        break;
      case 'sigue':
        if (n.followId && n.followId !== p.id) { say = LINES.ocupado[0]; break; }
        say = pick(this.rng, LINES.sigue);
        n.followId = p.id;
        n.state = 'follow';
        n.timer = 45;
        break;
      case 'adios':
        say = pick(this.rng, LINES.adios);
        if (n.state === 'follow' && n.followId === p.id) n.timer = 0;
        else if (!keepSeat) { face(); n.anim = 'wave'; n.state = 'emote'; n.timer = 1.6; }
        break;
    }
    this.room.io?.to(this.room.channel).emit('npc:say', { id: n.id, text: say });
    return { ok: true, name: n.name, title: n.title, say, options: OPTIONS };
  }

  hint(p) {
    if (this.key === 'city') {
      const gems = (this.room.world.objects || []).filter((o) => o.t === 'gem' && !p.data.gems?.has(o.id));
      if (gems.length && this.rng() < 0.7) {
        let best = gems[0], bd = Infinity;
        for (const g of gems) {
          const d = Math.hypot(g.p[0] - p.pos[0], g.p[2] - p.pos[2]);
          if (d < bd) { bd = d; best = g; }
        }
        const high = best.p[1] - p.pos[1] > 8 ? ' Está en lo alto, ¡busca cómo subir!' : '';
        return `Hay una gema al ${compass(best.p[0] - p.pos[0], best.p[2] - p.pos[2])}, a unos ${Math.round(bd)} metros.${high}`;
      }
      if (!gems.length) return '¡Ya tienes todas las gemas! ' + pick(this.rng, LINES.cityTips);
      return pick(this.rng, LINES.cityTips);
    }
    return pick(this.rng, LINES.hangoutTips);
  }

  rewardFirstTalk(p, n) {
    if (n.talkedBy.has(p.id)) return;
    n.talkedBy.add(p.id);
    const coins = users.dailyCapped(p.id, 'npc_talk', 3, 30);
    users.award(p.id, { xp: 5, coins, reason: `Has conocido a ${n.name}` });
    const stats = users.updateStats(p.id, (s) => {
      s.npcMet = Array.isArray(s.npcMet) ? s.npcMet : [];
      if (!s.npcMet.includes(n.name)) s.npcMet.push(n.name);
    });
    if (stats && stats.npcMet.length >= 5) users.unlockAchievement(p.id, 'friendly');
  }
}
