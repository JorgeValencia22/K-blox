// Emotes personalizados por fotogramas clave (creados por el admin) y su validación.
// Una pose guarda la rotación (radianes, ejes X/Y/Z) de cada parte y la altura del cuerpo.

export const EMOTE_LIMITS = { maxFrames: 30, maxDuration: 12, maxEmotes: 60, nameLen: 24 };
export const POSE_KEYS = ['la', 'ra', 'll', 'rl', 'body', 'head'];
const ANGLE = Math.PI * 2;

const num = (v, min, max) => {
  const n = Number(v);
  return Number.isFinite(n) ? Math.min(max, Math.max(min, n)) : 0;
};
const round = (n) => Math.round(n * 1000) / 1000;

export function cleanPose(p) {
  p = p && typeof p === 'object' ? p : {};
  const out = {};
  for (const k of POSE_KEYS) {
    const v = Array.isArray(p[k]) ? p[k] : [];
    out[k] = [0, 1, 2].map((i) => round(num(v[i], -ANGLE, ANGLE)));
  }
  out.y = round(num(p.y, -1, 2));
  return out;
}

/** Normaliza un emote: fotogramas ordenados por tiempo, número y valores acotados. */
export function cleanEmote(e) {
  if (!e || typeof e !== 'object') return { error: 'Emote no válido' };
  const name = String(e.name ?? '').replace(/[\u0000-\u001f\u007f<>]/g, '').trim().slice(0, EMOTE_LIMITS.nameLen);
  if (!name) return { error: 'Ponle un nombre al emote' };
  if (!Array.isArray(e.frames) || e.frames.length < 2) return { error: 'Hacen falta al menos 2 fotogramas' };
  if (e.frames.length > EMOTE_LIMITS.maxFrames) return { error: `Máximo ${EMOTE_LIMITS.maxFrames} fotogramas` };
  const frames = e.frames
    .map((f) => ({ t: round(num(f?.t, 0, EMOTE_LIMITS.maxDuration)), pose: cleanPose(f?.pose) }))
    .sort((a, b) => a.t - b.t);
  frames[0].t = 0;
  for (let i = 1; i < frames.length; i++) if (frames[i].t <= frames[i - 1].t) frames[i].t = round(frames[i - 1].t + 0.05);
  if (frames[frames.length - 1].t > EMOTE_LIMITS.maxDuration) return { error: `Máximo ${EMOTE_LIMITS.maxDuration} segundos` };
  return { name, loop: !!e.loop, frames };
}
