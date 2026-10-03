// Máquina de estados de animación procedural. Cada estado define la pose
// objetivo de las extremidades; las transiciones se suavizan interpolando,
// por lo que nunca se mezclan dos animaciones contradictorias.

export const LOOP_STATES = new Set(['idle', 'walk', 'run', 'fall', 'dance', 'robot', 'sit', 'swim', 'drive', 'fly', 'dead']);
export const ONESHOT = { jump: 0.35, land: 0.18, wave: 1.6, cheer: 1.6, spin: 1.0, flip: 0.9, attack: 0.3 };
export const EMOTES = { emote_wave: 'wave', emote_dance: 'dance', emote_cheer: 'cheer', emote_spin: 'spin', emote_robot: 'robot', emote_flip: 'flip' };

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
    const d = ONESHOT[this.state];
    return d != null && this.stateTime >= d;
  }

  target(speed) {
    const t = this.time, st = this.stateTime;
    const P = { la: [0, 0, 0.08], ra: [0, 0, -0.08], ll: [0, 0, 0], rl: [0, 0, 0], body: [0, 0, 0], y: 0, head: [0, 0, 0] };
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
    const k = Math.min(1, dt * (['spin', 'flip'].includes(this.state) ? 30 : 14));
    const cur = this.pose;
    const lerp3 = (a, b) => { for (let i = 0; i < 3; i++) a[i] += (b[i] - a[i]) * k; };
    // Giro y voltereta se aplican directamente para no "desenrollar" la vuelta.
    if (this.state === 'spin' || this.state === 'flip') {
      cur.body = [...P.body];
    } else {
      if (Math.abs(cur.body[1]) > Math.PI) cur.body[1] = 0;
      if (Math.abs(cur.body[0]) > Math.PI) cur.body[0] = 0;
      lerp3(cur.body, P.body);
    }
    lerp3(cur.la, P.la); lerp3(cur.ra, P.ra); lerp3(cur.ll, P.ll); lerp3(cur.rl, P.rl); lerp3(cur.head, P.head);
    cur.y += (P.y - cur.y) * k;
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
