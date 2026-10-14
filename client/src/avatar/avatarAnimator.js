// Máquina de estados de animación procedural. Cada estado define la pose
// objetivo de las extremidades; las transiciones se suavizan interpolando,
// por lo que nunca se mezclan dos animaciones contradictorias.

export const LOOP_STATES = new Set(['idle', 'walk', 'run', 'fall', 'dance', 'robot', 'sit', 'swim', 'drive', 'fly', 'dead', 'crouch', 'floss', 'jacks', 'headbang']);
export const ONESHOT = {
  jump: 0.35, land: 0.18, wave: 1.6, cheer: 1.6, spin: 1.0, flip: 0.9, attack: 0.3,
  clap: 1.6, bow: 1.5, salute: 1.6, laugh: 2.0, sad: 2.4, shrug: 1.2, dab: 1.3, think: 2.2, point: 1.5,
};
export const EMOTES = {
  emote_wave: 'wave', emote_dance: 'dance', emote_cheer: 'cheer', emote_spin: 'spin', emote_robot: 'robot', emote_flip: 'flip',
  emote_clap: 'clap', emote_bow: 'bow', emote_salute: 'salute', emote_laugh: 'laugh', emote_sad: 'sad', emote_shrug: 'shrug',
  emote_dab: 'dab', emote_think: 'think', emote_point: 'point', emote_floss: 'floss', emote_jacks: 'jacks', emote_headbang: 'headbang',
};

// --- Emotes personalizados (creados por el admin con fotogramas clave) ---------------
// Estado de animación: "c:<id>". Cada fotograma guarda la pose completa y el tiempo (s).
export const POSE_PARTS = ['la', 'ra', 'll', 'rl', 'body', 'head'];
export const CUSTOM_EMOTES = new Map();
export const isCustom = (state) => typeof state === 'string' && state.startsWith('c:');
export const emptyPose = () => ({ la: [0, 0, 0.08], ra: [0, 0, -0.08], ll: [0, 0, 0], rl: [0, 0, 0], body: [0, 0, 0], head: [0, 0, 0], y: 0 });

export function setCustomEmotes(list) {
  CUSTOM_EMOTES.clear();
  for (const e of list || []) if (e && e.id && Array.isArray(e.frames) && e.frames.length) CUSTOM_EMOTES.set(e.id, e);
}

export const customDuration = (e) => (e.frames.length ? e.frames[e.frames.length - 1].t : 0);

/** Duración de un estado de un solo uso (null si es en bucle o no existe). */
export function oneShotDuration(state) {
  if (ONESHOT[state] != null) return ONESHOT[state];
  if (isCustom(state)) {
    const e = CUSTOM_EMOTES.get(state.slice(2));
    if (e && !e.loop) return Math.max(0.2, customDuration(e));
  }
  return null;
}

export const isKnownState = (state) => LOOP_STATES.has(state) || ONESHOT[state] != null || (isCustom(state) && CUSTOM_EMOTES.has(state.slice(2)));

// Catmull-Rom: pasa por todos los fotogramas con un movimiento suave.
const cr = (p0, p1, p2, p3, u) => {
  const u2 = u * u, u3 = u2 * u;
  return 0.5 * (2 * p1 + (-p0 + p2) * u + (2 * p0 - 5 * p1 + 4 * p2 - p3) * u2 + (-p0 + 3 * p1 - 3 * p2 + p3) * u3);
};

/** Pose de un emote personalizado en el instante t (segundos). */
export function sampleCustom(e, t) {
  const fr = e.frames;
  const P = emptyPose();
  if (!fr.length) return P;
  const dur = customDuration(e);
  if (fr.length === 1 || dur <= 0) return clonePose(fr[0].pose);
  if (e.loop) t = ((t % dur) + dur) % dur;
  else t = Math.max(0, Math.min(dur, t));
  let i = 0;
  while (i < fr.length - 2 && fr[i + 1].t <= t) i++;
  const a = fr[i], b = fr[i + 1];
  const u = b.t > a.t ? Math.min(1, Math.max(0, (t - a.t) / (b.t - a.t))) : 1;
  const n = fr.length;
  // En bucle el último fotograma coincide con el primero: se salta al vecino real.
  const at = (k) => (e.loop ? fr[k < 0 ? n - 2 : k > n - 1 ? 1 : k] : fr[Math.max(0, Math.min(n - 1, k))]).pose;
  const p0 = at(i - 1), p1 = a.pose, p2 = b.pose, p3 = at(i + 2);
  for (const k of POSE_PARTS) for (let j = 0; j < 3; j++) P[k][j] = cr(p0[k][j], p1[k][j], p2[k][j], p3[k][j], u);
  P.y = cr(p0.y, p1.y, p2.y, p3.y, u);
  return P;
}

export function clonePose(p) {
  const q = emptyPose();
  for (const k of POSE_PARTS) if (Array.isArray(p?.[k])) q[k] = [0, 1, 2].map((j) => Number(p[k][j]) || 0);
  q.y = Number(p?.y) || 0;
  return q;
}

export class AvatarAnimator {
  constructor(model) {
    this.model = model;
    this.state = 'idle';
    this.time = 0;
    this.stateTime = 0;
    this.pose = { la: [0, 0, 0], ra: [0, 0, 0], ll: [0, 0, 0], rl: [0, 0, 0], body: [0, 0, 0], y: 0, head: [0, 0, 0] };
  }

  set(state) {
    if (state === this.state) return;
    this.state = state;
    this.stateTime = 0;
  }

  /** ¿Ha terminado la animación de un solo uso actual? */
  get finished() {
    const d = oneShotDuration(this.state);
    return d != null && this.stateTime >= d;
  }

  target(speed) {
    const t = this.time, st = this.stateTime;
    const P = { la: [0, 0, 0.08], ra: [0, 0, -0.08], ll: [0, 0, 0], rl: [0, 0, 0], body: [0, 0, 0], y: 0, head: [0, 0, 0] };
    if (isCustom(this.state)) {
      const e = CUSTOM_EMOTES.get(this.state.slice(2));
      return e ? sampleCustom(e, st) : P;
    }
    switch (this.state) {
      case 'idle': {
        const b = Math.sin(t * 2) * 0.04;
        P.la[0] = b; P.ra[0] = -b; P.y = Math.sin(t * 2) * 0.015;
        break;
      }
      case 'walk': {
        const f = t * Math.max(6, speed * 1.1), a = 0.7;
        P.la[0] = Math.sin(f) * a; P.ra[0] = -Math.sin(f) * a;
        P.ll[0] = -Math.sin(f) * a; P.rl[0] = Math.sin(f) * a;
        P.y = Math.abs(Math.cos(f)) * 0.05;
        break;
      }
      case 'run': {
        const f = t * Math.max(10, speed * 0.95), a = 1.05;
        P.la[0] = Math.sin(f) * a; P.ra[0] = -Math.sin(f) * a;
        P.ll[0] = -Math.sin(f) * a; P.rl[0] = Math.sin(f) * a;
        P.body[0] = 0.18; P.y = Math.abs(Math.cos(f)) * 0.09;
        break;
      }
      case 'crouch': {
        const f = t * Math.max(4, speed * 1.2), a = speed > 0.3 ? 0.4 : 0;
        P.ll[0] = -0.9 - Math.sin(f) * a; P.rl[0] = -0.9 + Math.sin(f) * a;
        P.la[0] = -0.5; P.ra[0] = -0.5; P.body[0] = 0.45; P.y = -0.32;
        break;
      }
      case 'jump':
        P.la = [-2.6, 0, 0.3]; P.ra = [-2.6, 0, -0.3]; P.ll[0] = -0.5; P.rl[0] = 0.2;
        break;
      case 'fall':
        P.la = [-2.2 + Math.sin(t * 14) * 0.25, 0, 0.6]; P.ra = [-2.2 - Math.sin(t * 14) * 0.25, 0, -0.6];
        P.ll[0] = 0.3; P.rl[0] = -0.3;
        break;
      case 'land':
        P.y = -0.12; P.la[2] = 0.5; P.ra[2] = -0.5; P.ll[0] = -0.2; P.rl[0] = -0.2;
        break;
      case 'dance': {
        const f = t * 7;
        P.la = [-2.4 + Math.sin(f) * 0.6, 0, 0.4]; P.ra = [-2.4 - Math.sin(f) * 0.6, 0, -0.4];
        P.body[1] = Math.sin(f * 0.5) * 0.5; P.y = Math.abs(Math.sin(f)) * 0.15;
        P.ll[2] = Math.sin(f) * 0.2; P.rl[2] = Math.sin(f) * 0.2;
        P.head[2] = Math.sin(f) * 0.15;
        break;
      }
      case 'robot': {
        const k = Math.floor(t * 3) % 4;
        const poses = [[-1.57, 0], [0, -1.57], [-1.57, -1.57], [0, 0]];
        P.la[0] = poses[k][0]; P.ra[0] = poses[k][1];
        P.body[1] = [0, 0.4, 0, -0.4][k]; P.head[1] = [0.4, 0, -0.4, 0][k];
        break;
      }
      case 'wave':
        P.ra = [-2.8, 0, -0.3 + Math.sin(st * 14) * 0.4];
        break;
      case 'cheer':
        P.la = [-3, 0, 0.3]; P.ra = [-3, 0, -0.3]; P.y = Math.abs(Math.sin(st * 9)) * 0.35;
        break;
      case 'spin':
        P.body[1] = Math.min(1, st / ONESHOT.spin) * Math.PI * 2; P.la[2] = 1.3; P.ra[2] = -1.3;
        break;
      case 'flip': {
        const k = Math.min(1, st / ONESHOT.flip);
        P.body[0] = -k * Math.PI * 2; P.y = Math.sin(k * Math.PI) * 1.4; P.ll[0] = -0.8; P.rl[0] = -0.8;
        break;
      }
      case 'sit':
        P.ll[0] = -1.57; P.rl[0] = -1.57; P.la[0] = -0.4; P.ra[0] = -0.4; P.y = -0.48;
        break;
      case 'drive':
        P.ll[0] = -1.4; P.rl[0] = -1.4; P.la[0] = -1.2; P.ra[0] = -1.2; P.y = -0.45;
        break;
      case 'fly':
        P.ll[0] = -1.4; P.rl[0] = -1.4; P.la[0] = -1.3; P.ra[0] = -1.3; P.y = -0.45;
        break;
      case 'swim': {
        const f = t * 5;
        P.body[0] = 1.3; P.y = 0.4;
        P.la[0] = -Math.PI + Math.sin(f) * 1.6; P.ra[0] = -Math.PI - Math.sin(f) * 1.6;
        P.ll[0] = Math.sin(f * 2) * 0.4; P.rl[0] = -Math.sin(f * 2) * 0.4;
        break;
      }
      case 'attack':
        P.ra = [-2.2 + Math.min(1, st / 0.3) * 2.4, 0, -0.2];
        break;
      case 'clap': {
        const c = Math.abs(Math.sin(st * 11)) * 0.55;
        P.la = [-1.35, 0.9 - c, 0.1]; P.ra = [-1.35, -0.9 + c, -0.1]; P.head[0] = 0.08;
        break;
      }
      case 'bow': {
        const k = Math.sin(Math.min(1, st / ONESHOT.bow) * Math.PI);
        P.body[0] = k * 0.95; P.la = [0, 0, 0.05]; P.ra = [-0.9 * k, 0.6 * k, -0.2]; P.head[0] = k * 0.2;
        break;
      }
      case 'salute':
        P.ra = [-2.2, 0, -1.25]; P.head[0] = -0.05; P.la = [0, 0, 0.05];
        break;
      case 'laugh': {
        const f = Math.sin(st * 16);
        P.body[0] = -0.25 + f * 0.06; P.head[0] = -0.3 + f * 0.08; P.y = Math.abs(f) * 0.04;
        P.la = [-0.6, 0, 0.5]; P.ra = [-0.6, 0, -0.5];
        break;
      }
      case 'sad': {
        const f = Math.sin(st * 9) * 0.05;
        P.body[0] = 0.35; P.head[0] = 0.45 + f; P.la = [-2.0, 0.6, 0.2]; P.ra = [-2.0, -0.6, -0.2]; P.y = -0.03;
        break;
      }
      case 'shrug':
        P.la = [-0.3, 0, 0.9]; P.ra = [-0.3, 0, -0.9]; P.head[2] = 0.18; P.y = Math.sin(Math.min(1, st / 0.4) * Math.PI) * 0.05;
        break;
      case 'dab':
        P.la = [-1.2, 0, 1.3]; P.ra = [-1.5, -0.8, 1.9]; P.head = [0.5, -0.4, 0]; P.body[1] = -0.2;
        break;
      case 'think':
        P.ra = [-1.6, 0, -0.9]; P.la = [-0.7, 0, 0.9]; P.head = [-0.15, 0, 0.18 + Math.sin(st * 2) * 0.05];
        break;
      case 'point':
        P.ra = [-1.55, -0.1, 0]; P.head[0] = 0.05; P.body[1] = -0.1;
        break;
      case 'floss': {
        const f = Math.sin(t * 9);
        P.body[1] = f * 0.25; P.la = [f * 0.5, 0, 0.45 + f * 0.25]; P.ra = [f * 0.5, 0, -0.45 + f * 0.25];
        P.ll[2] = -f * 0.1; P.rl[2] = -f * 0.1;
        break;
      }
      case 'jacks': {
        const k = (1 - Math.cos(t * 9)) / 2;
        P.la = [0, 0, 0.15 + k * 2.6]; P.ra = [0, 0, -0.15 - k * 2.6]; P.ll[2] = -k * 0.35; P.rl[2] = k * 0.35;
        P.y = Math.sin(k * Math.PI) * 0.18;
        break;
      }
      case 'headbang': {
        const f = Math.sin(t * 13);
        P.head[0] = 0.25 + f * 0.4; P.body[0] = 0.12 + f * 0.1;
        P.la = [-1.2, 0.3, 0.3]; P.ra = [-0.6 + f * 0.35, -0.2, -0.4];
        break;
      }
      case 'dead':
        P.body[0] = -1.5; P.y = 0.25; P.la[2] = 1.2; P.ra[2] = -1.2;
        break;
      default:
        break;
    }
    return P;
  }

  update(dt, speed = 0) {
    this.time += dt;
    this.stateTime += dt;
    const P = this.target(speed);
    const custom = isCustom(this.state);
    // Los emotes personalizados se funden durante 0.15 s y luego siguen la curva exacta.
    const k = custom && this.stateTime > 0.15 ? 1 : Math.min(1, dt * (['spin', 'flip'].includes(this.state) ? 30 : 14));
    const cur = this.pose;
    const lerp3 = (a, b) => { for (let i = 0; i < 3; i++) a[i] += (b[i] - a[i]) * k; };
    // Giro y voltereta se aplican directamente para no "desenrollar" la vuelta.
    if (custom) {
      lerp3(cur.body, P.body);
    } else if (this.state === 'spin' || this.state === 'flip') {
      cur.body = [...P.body];
    } else {
      if (Math.abs(cur.body[1]) > Math.PI) cur.body[1] = 0;
      if (Math.abs(cur.body[0]) > Math.PI) cur.body[0] = 0;
      lerp3(cur.body, P.body);
    }
    lerp3(cur.la, P.la); lerp3(cur.ra, P.ra); lerp3(cur.ll, P.ll); lerp3(cur.rl, P.rl); lerp3(cur.head, P.head);
    cur.y += (P.y - cur.y) * k;
    this.apply();
  }

  /** Coloca una pose fija (editor de emotes). */
  applyPose(P) {
    Object.assign(this.pose, clonePose(P));
    this.apply();
  }

  apply() {
    const cur = this.pose;
    const m = this.model;
    m.lArm.rotation.set(...cur.la);
    m.rArm.rotation.set(...cur.ra);
    m.lLeg.rotation.set(...cur.ll);
    m.rLeg.rotation.set(...cur.rl);
    m.neck.rotation.set(...cur.head);
    m.body.rotation.set(cur.body[0], cur.body[1], cur.body[2]);
    if (this.state === 'flip') {
      // La voltereta gira alrededor de la cintura (y = 1), no de los pies.
      const a = cur.body[0];
      m.body.position.set(0, cur.y + 1 - Math.cos(a), -Math.sin(a));
    } else {
      m.body.position.set(0, cur.y, 0);
    }
  }
}
