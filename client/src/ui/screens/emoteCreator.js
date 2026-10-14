// Creador de emotes por fotogramas clave (solo admin). Se elige una parte del cuerpo,
// se mueve con los deslizadores, se añade otro fotograma más adelante en el tiempo y
// el juego interpola de forma suave entre todos ellos.
import { h, button, toast, clear, confirmDialog } from '../dom.js';
import { post, del } from '../../core/api.js';
import { applyEmotes } from '../../core/emotes.js';
import { CUSTOM_EMOTES, emptyPose, clonePose, sampleCustom, customDuration } from '../../avatar/avatarAnimator.js';
import { EMOTE_LIMITS } from '../../../../shared/emotes.js';

const PARTS = [['ra', 'Brazo der.'], ['la', 'Brazo izq.'], ['rl', 'Pierna der.'], ['ll', 'Pierna izq.'], ['body', 'Cuerpo'], ['head', 'Cabeza']];
const AXES = [['Adelante / atrás', 0], ['Girar', 1], ['Hacia el lado', 2]];
const MIRROR = { la: 'ra', ra: 'la', ll: 'rl', rl: 'll' };
const DRAFT = '__draft';
const deg = (r) => Math.round((r * 180) / Math.PI);
const rad = (d) => (d * Math.PI) / 180;

// Poses rápidas para empezar (radianes)
const QUICK = {
  'Brazos arriba': { la: [-3, 0, 0.3], ra: [-3, 0, -0.3] },
  'Brazos en cruz': { la: [0, 0, 1.5], ra: [0, 0, -1.5] },
  'Agachado': { ll: [-1.2, 0, 0], rl: [-1.2, 0, 0], body: [0.4, 0, 0], y: -0.35 },
  'Saludo': { ra: [-2.8, 0, -0.4] },
};

export function emoteCreator(preview) {
  let frames = [{ t: 0, pose: emptyPose() }];
  let sel = 0;
  let part = 'ra';
  let name = '';
  let loop = false;
  let editingId = null;
  let scrub = null; // tiempo mostrado con la barra (null = fotograma seleccionado)
  let playing = false;

  preview.autoRotate = false;
  preview.rot = 0.35;

  /** Emote listo para reproducir o guardar. En bucle se cierra volviendo al primer fotograma. */
  function build() {
    const fr = frames.map((f) => ({ t: f.t, pose: clonePose(f.pose) }));
    if (loop && fr.length > 1) {
      const gap = fr.length > 1 ? fr[fr.length - 1].t - fr[fr.length - 2].t : 0.5;
      fr.push({ t: Math.round((fr[fr.length - 1].t + Math.max(0.2, gap)) * 100) / 100, pose: clonePose(fr[0].pose) });
    }
    return { id: editingId, name, loop, frames: fr };
  }

  function show() {
    if (playing) return;
    preview.manualPose = scrub == null ? frames[sel].pose : sampleCustom(build(), scrub);
  }

  const root = h('div.emote-creator');
  const body = h('div');
  root.append(body);

  function slider(label, value, min, max, onInput) {
    const out = h('b', String(value));
    const r = h('input', { type: 'range', min, max, step: 1, value });
    r.addEventListener('input', () => { out.textContent = r.value; onInput(Number(r.value)); });
    r.addEventListener('change', render);
    return h('label.ec-slider', h('span', label, ' ', out), r);
  }

  function render() {
    clear(body);
    const f = frames[sel];
    const sec = (t) => h('div.section-title', t);

    // Emotes ya creados
    const saved = [...CUSTOM_EMOTES.values()].filter((e) => e.id !== DRAFT);
    body.append(sec('Tus emotes'), h('div.pills', { style: { flexWrap: 'wrap' } },
      h(`button.pill${editingId == null ? '.on' : ''}`, { on: { click: () => resetDraft() } }, '＋ Nuevo'),
      ...saved.map((e) => h(`button.pill${editingId === e.id ? '.on' : ''}`, { on: { click: () => loadEmote(e) } }, e.name))));

    // Nombre y bucle
    const nameIn = h('input.input', { value: name, maxLength: EMOTE_LIMITS.nameLen, placeholder: 'Nombre del emote' });
    nameIn.addEventListener('input', () => { name = nameIn.value; });
    const loopIn = h('input', { type: 'checkbox', checked: loop });
    loopIn.addEventListener('change', () => { loop = loopIn.checked; render(); });
    body.append(h('div.row', { style: { gap: '8px', marginTop: '8px' } }, nameIn, h('label.row.small', { style: { gap: '4px', whiteSpace: 'nowrap' } }, loopIn, 'En bucle')));

    // Línea de tiempo
    body.append(sec(`Fotogramas (${frames.length}/${EMOTE_LIMITS.maxFrames})`), h('div.ec-timeline',
      ...frames.map((fr, i) => h(`button.ec-frame${i === sel && scrub == null ? '.on' : ''}`, { on: { click: () => { sel = i; scrub = null; stop(); render(); } } },
        h('b', String(i + 1)), h('small', `${fr.t.toFixed(1)} s`))),
      h('button.ec-frame.add', { on: { click: addFrame }, title: 'Añadir fotograma' }, '＋')));
    const tIn = h('input.input', { type: 'number', min: 0, max: EMOTE_LIMITS.maxDuration, step: 0.1, value: f.t, disabled: sel === 0, style: { width: '84px' } });
    tIn.addEventListener('change', () => {
      const v = Math.max(0.05, Math.min(EMOTE_LIMITS.maxDuration, Number(tIn.value) || 0));
      f.t = Math.round(v * 100) / 100;
      const cur = frames[sel];
      frames.sort((a, b) => a.t - b.t);
      sel = frames.indexOf(cur);
      render();
    });
    body.append(h('div.row.small', { style: { gap: '6px', flexWrap: 'wrap', marginTop: '6px' } },
      h('span', 'Tiempo:'), tIn, h('span.muted', 's'),
      button('⧉ Duplicar', duplicateFrame, 'small'),
      frames.length > 1 ? button('🗑 Borrar', removeFrame, 'small danger') : null));

    // Parte del cuerpo y deslizadores
    body.append(sec(`Fotograma ${sel + 1}: mueve las partes`), h('div.pills', { style: { flexWrap: 'wrap' } },
      ...PARTS.map(([id, label]) => h(`button.pill${part === id ? '.on' : ''}`, { on: { click: () => { part = id; render(); } } }, label))));
    for (const [label, ax] of AXES) {
      body.append(slider(label, deg(f.pose[part][ax]), -180, 180, (v) => { f.pose[part][ax] = rad(v); scrub = null; show(); }));
    }
    body.append(slider('Altura del cuerpo (cm)', Math.round(f.pose.y * 100), -100, 200, (v) => { f.pose.y = v / 100; scrub = null; show(); }));
    body.append(h('div.row.small', { style: { gap: '6px', flexWrap: 'wrap' } },
      MIRROR[part] ? button('↔ Copiar al otro lado', () => {
        const [x, y, z] = f.pose[part];
        f.pose[MIRROR[part]] = [x, -y, -z];
        render();
      }, 'small') : null,
      button('↺ Parte recta', () => { f.pose[part] = [...emptyPose()[part]]; render(); }, 'small'),
      button('↺ Todo recto', () => { f.pose = emptyPose(); render(); }, 'small')));
    body.append(h('div.row.small', { style: { gap: '6px', flexWrap: 'wrap', marginTop: '6px' } }, h('span.muted', 'Poses rápidas:'),
      ...Object.entries(QUICK).map(([label, p]) => button(label, () => { Object.assign(f.pose, clonePose({ ...f.pose, ...p })); render(); }, 'small'))));

    // Vista previa
    const dur = customDuration(build());
    const scr = h('input', { type: 'range', min: 0, max: Math.max(0.01, dur), step: 0.01, value: scrub ?? f.t, style: { width: '100%' } });
    scr.addEventListener('input', () => { stop(); scrub = Number(scr.value); show(); });
    body.append(sec(`Vista previa (${dur.toFixed(1)} s)`), scr,
      h('div.row', { style: { gap: '6px', marginTop: '6px' } },
        button(playing ? '⏹ Parar' : '▶ Reproducir', () => (playing ? stop() : play()), 'small'),
        h('span.grow'),
        editingId ? button('🗑 Borrar emote', removeEmote, 'small danger') : null,
        button('💾 Guardar emote', save, 'primary small')),
      h('p.muted.small', 'Cada fotograma es una pose. Añade fotogramas más adelante en el tiempo y el personaje se moverá suavemente de una pose a otra. Los emotes guardados los pueden usar todos los jugadores (tecla G en partida).'));
    show();
  }

  function addFrame() {
    if (frames.length >= EMOTE_LIMITS.maxFrames) return toast(`Máximo ${EMOTE_LIMITS.maxFrames} fotogramas`, 'warn');
    const last = frames[frames.length - 1];
    if (last.t + 0.5 > EMOTE_LIMITS.maxDuration) return toast(`Máximo ${EMOTE_LIMITS.maxDuration} segundos`, 'warn');
    frames.push({ t: Math.round((last.t + 0.5) * 100) / 100, pose: clonePose(frames[sel].pose) });
    sel = frames.length - 1;
    scrub = null;
    stop();
    render();
  }

  function duplicateFrame() {
    if (frames.length >= EMOTE_LIMITS.maxFrames) return toast(`Máximo ${EMOTE_LIMITS.maxFrames} fotogramas`, 'warn');
    const f = frames[sel], next = frames[sel + 1];
    const t = next ? (f.t + next.t) / 2 : f.t + 0.5;
    frames.splice(sel + 1, 0, { t: Math.round(t * 100) / 100, pose: clonePose(f.pose) });
    sel++;
    render();
  }

  function removeFrame() {
    frames.splice(sel, 1);
    frames[0].t = 0;
    sel = Math.max(0, sel - 1);
    render();
  }

  function play() {
    const e = build();
    if (e.frames.length < 2) return toast('Añade al menos 2 fotogramas', 'warn');
    CUSTOM_EMOTES.set(DRAFT, { ...e, id: DRAFT });
    playing = true;
    preview.play(`c:${DRAFT}`);
    render();
    if (!loop) {
      clearTimeout(play.t);
      play.t = setTimeout(() => { if (playing) stop(); }, customDuration(e) * 1000 + 400);
    }
  }

  function stop() {
    if (!playing) return;
    playing = false;
    CUSTOM_EMOTES.delete(DRAFT);
    preview.anim.set('idle');
    render();
  }

  function resetDraft() {
    stop();
    frames = [{ t: 0, pose: emptyPose() }];
    sel = 0; name = ''; loop = false; editingId = null; scrub = null;
    render();
  }

  function loadEmote(e) {
    stop();
    editingId = e.id; name = e.name; loop = !!e.loop;
    frames = e.frames.map((f) => ({ t: f.t, pose: clonePose(f.pose) }));
    if (loop && frames.length > 2) frames.pop(); // quita el fotograma de cierre del bucle
    sel = 0; scrub = null;
    render();
  }

  async function save() {
    if (!name.trim()) return toast('Ponle un nombre al emote', 'warn');
    if (frames.length < 2) return toast('Añade al menos 2 fotogramas', 'warn');
    stop();
    try {
      const r = await post('/admin/emotes', { emote: build() });
      applyEmotes(r.emotes);
      editingId = r.emote.id;
      toast(`Emote "${r.emote.name}" guardado`, 'ok');
      render();
    } catch (err) {
      toast(err.message, 'err');
    }
  }

  async function removeEmote() {
    if (!(await confirmDialog('Borrar emote', `¿Borrar "${name}"? Nadie podrá usarlo.`, 'Borrar', 'danger'))) return;
    try {
      const r = await del(`/admin/emotes/${editingId}`);
      applyEmotes(r.emotes);
      toast('Emote borrado', 'ok');
      resetDraft();
    } catch (err) {
      toast(err.message, 'err');
    }
  }

  render();
  root.cleanup = () => {
    playing = false;
    clearTimeout(play.t);
    CUSTOM_EMOTES.delete(DRAFT);
    preview.manualPose = null;
    preview.autoRotate = true;
    preview.anim.set('idle');
  };
  return root;
}
