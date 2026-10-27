// Intro de marca estilo cine (8,2 s): polvo, destello anamórfico, el logo se revela desde el centro
// (desenfoque → nitidez, aberración cromática, franja de brillo) y «PRESENTA» cierra su espaciado.
// Cualquier tecla, clic, toque o botón de mando la salta. Los dos sonidos se sintetizan aquí mismo.
import { h, LOGO_SVG } from './dom.js';

export const INTRO_DURATION = 8.2;

const ease = {
  lin: (t) => t,
  expo: (t) => (t >= 1 ? 1 : 1 - 2 ** (-10 * t)),
  cubic: (t) => 1 - (1 - t) ** 3,
  quart: (t) => 1 - (1 - t) ** 4,
  sine: (t) => -(Math.cos(Math.PI * t) - 1) / 2,
};
/** Valor de una animación que empieza en `at` s y dura `dur` s (queda en `from` antes y en `to` después). */
const seg = (t, at, dur, from, to, e = ease.lin) => from + (to - from) * e(Math.min(1, Math.max(0, (t - at) / dur)));
const smooth = (a, b, x) => { const k = Math.min(1, Math.max(0, (x - a) / (b - a))); return k * k * (3 - 2 * k); };

const RATE = 22050;
/** Sonido mono sintetizado, normalizado a 0,9 de pico. */
function synth(ctx, seconds, fn) {
  const n = Math.floor(RATE * seconds);
  const buf = ctx.createBuffer(1, n, RATE);
  const d = buf.getChannelData(0);
  let peak = 1e-4;
  for (let i = 0; i < n; i++) { d[i] = fn(i / RATE); peak = Math.max(peak, Math.abs(d[i])); }
  for (let i = 0; i < n; i++) d[i] = (d[i] / peak) * 0.9;
  return buf;
}
const noise = () => Math.random() * 2 - 1;
const swell = (t) => {
  const k = t / 3.2;
  const env = k * k * (1 - smooth(0.93, 1, k));
  const f = 70 + 260 * k * k;
  return (Math.sin(2 * Math.PI * f * t) * 0.45 + Math.sin(2 * Math.PI * f * 1.5 * t) * 0.22 + noise() * 0.18 * k) * env;
};
const hit = (t) => {
  const boom = Math.sin(2 * Math.PI * (48 - 10 * Math.min(t, 1)) * t) * Math.exp(-t * 2.4);
  const shimmer = (Math.sin(2 * Math.PI * 1760 * t) + Math.sin(2 * Math.PI * 2349 * t) * 0.7 + Math.sin(2 * Math.PI * 2960 * t) * 0.5) * Math.exp(-t * 3.2) * 0.12;
  return boom * 0.85 + shimmer + noise() * Math.exp(-t * 9) * 0.5;
};

/** Muestra la intro y devuelve una promesa que se cumple una sola vez al terminar o al saltarla. */
export function playBrandIntro() {
  const logoHtml = `<div class="bi-mark">${LOGO_SVG}</div><div class="bi-word">Kest<b>Worlds</b></div>`;
  const glow = h('div.bi-logo.bi-glow', { html: logoHtml });
  const main = h('div.bi-logo', { html: logoHtml });
  const shine = h('div.bi-logo.bi-shine', { html: logoHtml });
  const streak = h('div.bi-streak', h('i.core'), h('i.mid'), h('i.halo'));
  const dust = h('canvas.bi-dust');
  const tag = h('div.bi-tag', 'PRESENTA');
  const fade = h('div.bi-fade');
  const root = h('div.bi',
    dust, streak, glow, main, shine, tag, h('div.bi-vig'), h('div.bi-bar.top'), h('div.bi-bar.bot'), fade);
  document.body.appendChild(root);

  let audio = null;
  let hitDone = false;
  try {
    const AC = window.AudioContext || window.webkitAudioContext;
    const ctx = new AC();
    const out = ctx.createGain();
    out.connect(ctx.destination);
    const play = (buf, db) => { const s = ctx.createBufferSource(); const g = ctx.createGain(); g.gain.value = 10 ** (db / 20); s.buffer = buf; s.connect(g); g.connect(out); s.start(); };
    audio = { ctx, out, swell: synth(ctx, 3.2, swell), hit: synth(ctx, 2.8, hit), play };
    ctx.resume?.().catch(() => {});
    audio.play(audio.swell, -4);
  } catch { audio = null; }

  // Polvo flotando en la luz.
  const dctx = dust.getContext('2d');
  const parts = Array.from({ length: 70 }, () => {
    const a = (-Math.PI / 2) + (0.3 + (Math.random() - 0.5) * 1.4);
    const v = 5 + Math.random() * 13;
    return { x: Math.random(), y: Math.random(), vx: Math.cos(a) * v, vy: Math.sin(a) * v, r: 0.8 + Math.random() * 1.6 };
  });
  const fit = () => { dust.width = innerWidth; dust.height = innerHeight; };
  fit();
  addEventListener('resize', fit);

  return new Promise((resolve) => {
    let done = false;
    let raf = 0;
    let last = performance.now();
    const t0 = last;
    let skipPad = false;

    const frame = (now) => {
      const t = Math.min(INTRO_DURATION, (now - t0) / 1000);
      const dt = Math.min(0.1, (now - last) / 1000);
      last = now;

      // Polvo
      dctx.clearRect(0, 0, dust.width, dust.height);
      dctx.fillStyle = 'rgba(204,224,255,.35)';
      for (const p of parts) {
        p.x += (p.vx * dt) / dust.width; p.y += (p.vy * dt) / dust.height;
        if (p.y < -0.02) { p.y = 1.02; p.x = Math.random(); }
        if (p.x > 1.02) p.x = -0.02;
        dctx.beginPath(); dctx.arc(p.x * dust.width, p.y * dust.height, p.r, 0, 6.2832); dctx.fill();
      }

      // Destello anamórfico
      const lengthK = seg(t, 0.3, 1.7, 0, 1, ease.expo);
      const intensity = t < 2.5 ? seg(t, 0.3, 1.6, 0, 1) : seg(t, 2.5, 1.4, 1, 0);
      streak.style.setProperty('--len', `${(lengthK * 100).toFixed(2)}%`);
      streak.style.opacity = intensity.toFixed(3);

      // Impacto: golpe de cámara y sonido
      if (t >= 2.0 && !hitDone) {
        hitDone = true;
        audio?.play(audio.hit, 0);
        root.classList.add('knock');
        setTimeout(() => root.classList.remove('knock'), 260);
      }

      // Logo
      const reveal = seg(t, 2.0, 1.5, 0, 1.5, ease.cubic);
      const blur = seg(t, 2.0, 1.7, 24, 0, ease.quart);
      const aber = seg(t, 2.0, 1.8, 22, 0, ease.quart);
      const s1 = seg(t, 2.0, 2.4, 1.09, 1, ease.quart);
      const scale = t < 3.8 ? s1 : seg(t, 3.8, 4.2, seg(3.8, 2.0, 2.4, 1.09, 1, ease.quart), 1.025, ease.sine);
      const half = Math.max(0, reveal * 0.62) * 100;
      const mask = `linear-gradient(90deg, transparent ${50 - half - 3}%, #000 ${50 - half + 3}%, #000 ${50 + half - 3}%, transparent ${50 + half + 3}%)`;
      const visible = t >= 2.0;
      main.style.visibility = glow.style.visibility = shine.style.visibility = visible ? 'visible' : 'hidden';
      main.style.webkitMaskImage = main.style.maskImage = mask;
      main.style.filter = `blur(${blur.toFixed(2)}px) drop-shadow(${aber.toFixed(2)}px 0 0 rgba(255,40,40,.55)) drop-shadow(${(-aber).toFixed(2)}px 0 0 rgba(40,220,255,.55))`;
      main.style.transform = shine.style.transform = `scale(${scale.toFixed(4)})`;
      // Resplandor
      const gReveal = seg(t, 2.0, 1.8, 0, 1.5);
      const gHalf = Math.max(0, gReveal * 0.62) * 100;
      glow.style.webkitMaskImage = glow.style.maskImage = `linear-gradient(90deg, transparent ${50 - gHalf - 3}%, #000 ${50 - gHalf + 3}%, #000 ${50 + gHalf - 3}%, transparent ${50 + gHalf + 3}%)`;
      glow.style.opacity = (t < 4.4 ? seg(t, 2.1, 1.2, 0, 0.34) : seg(t, 4.4, 2.0, 0.34, 0.2, ease.sine)).toFixed(3);
      glow.style.transform = `scale(${scale.toFixed(4)})`;
      // Franja de brillo
      const sh = seg(t, 3.8, 1.1, -0.2, 1.3, ease.sine);
      const pos = (sh / 1.1) * 100;
      const band = `linear-gradient(106deg, transparent ${pos - 6.4}%, #000 ${pos}%, transparent ${pos + 6.4}%)`;
      shine.style.webkitMaskImage = shine.style.maskImage = t >= 3.8 && t <= 4.95 ? band : 'linear-gradient(#0000,#0000)';

      // «PRESENTA»: aparece y el espaciado se cierra
      tag.style.opacity = seg(t, 4.4, 1.1, 0, 1).toFixed(3);
      tag.style.letterSpacing = `${seg(t, 4.4, 1.6, 26, 8, ease.quart).toFixed(2)}px`;

      // Entrada y salida a negro
      fade.style.opacity = (t < 7.3 ? seg(t, 0, 0.8, 1, 0) : seg(t, INTRO_DURATION - 0.9, 0.9, 0, 1)).toFixed(3);

      // Mando
      if (!skipPad) {
        for (const gp of navigator.getGamepads?.() || []) if (gp && gp.buttons.some((b) => b.pressed)) skipPad = true;
        if (skipPad) { finish(true); return; }
      }
      if (t >= INTRO_DURATION) finish(false);
      else raf = requestAnimationFrame(frame);
    };

    const finish = (skipped) => {
      if (done) return;
      done = true;
      cancelAnimationFrame(raf);
      removeEventListener('resize', fit);
      removeEventListener('keydown', onSkip, true);
      removeEventListener('pointerdown', onSkip, true);
      if (audio) {
        const { ctx, out } = audio;
        out.gain.setTargetAtTime(0, ctx.currentTime, 0.08);
        setTimeout(() => ctx.close?.().catch(() => {}), 600);
      }
      if (skipped) {
        fade.style.transition = 'opacity .3s';
        fade.style.opacity = '1';
        setTimeout(() => root.remove(), 320);
      } else root.remove();
      resolve({ skipped });
    };
    const onSkip = (e) => { if (e.type === 'keydown' && e.repeat) return; finish(true); };
    addEventListener('keydown', onSkip, true);
    addEventListener('pointerdown', onSkip, true);
    raf = requestAnimationFrame(frame);
  });
}
