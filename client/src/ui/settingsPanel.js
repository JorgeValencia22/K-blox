// Panel de configuración: gráficos, controles, audio e interfaz.
import { pad } from '../engine/gamepad.js';
import { PAD_ACTIONS, PAD_BUTTONS, padMap } from '../../../shared/padmap.js';
import { h, modal, button, toast } from './dom.js';
import { get, put } from '../core/api.js';
import { settings } from '../core/settings.js';
import { audio } from '../audio/audio.js';

function slider(label, key, min, max, step, fmt = (v) => v) {
  const val = h('span.muted.small', fmt(settings.get(key)));
  const inp = h('input', { type: 'range', min, max, step, value: settings.get(key) });
  inp.addEventListener('input', () => {
    settings.set(key, Number(inp.value));
    val.textContent = fmt(Number(inp.value));
  });
  return h('div.field', h('label', h('div.row', h('span.grow', label), val)), inp);
}

function toggle(label, key) {
  const inp = h('input', { type: 'checkbox', checked: !!settings.get(key) });
  inp.addEventListener('change', () => settings.set(key, inp.checked));
  return h('label.row', { style: { margin: '8px 0', cursor: 'pointer' } }, inp, h('span', label));
}

function select(label, key, options) {
  const s = h('select.input', options.map(([v, t]) => h('option', { value: v, selected: String(settings.get(key)) === String(v) }, t)));
  s.addEventListener('change', () => settings.set(key, isNaN(Number(s.value)) ? s.value : Number(s.value)));
  return h('div.field', h('label', label), s);
}

/** Pasa la foto a un cuadrado de 128 px en JPEG (pesa poco y el servidor la acepta). */
function shrinkPhoto(file) {
  return new Promise((resolve, reject) => {
    const url = URL.createObjectURL(file);
    const img = new Image();
    img.onload = () => {
      const c = document.createElement('canvas');
      c.width = c.height = 128;
      const side = Math.min(img.width, img.height);
      c.getContext('2d').drawImage(img, (img.width - side) / 2, (img.height - side) / 2, side, side, 0, 0, 128, 128);
      URL.revokeObjectURL(url);
      resolve(c.toDataURL('image/jpeg', 0.85));
    };
    img.onerror = () => { URL.revokeObjectURL(url); reject(new Error('No se pudo leer la imagen')); };
    img.src = url;
  });
}

/** Chat de voz y subtítulos: solo con los amigos que elijas, más la foto de perfil. */
/** Mando: estado, ajustes, asignación de botones y prueba en directo. */
function padSection(rerender) {
  const status = h('p.small');
  const live = h('div.pad-live.small.muted');
  const map = padMap(settings.get('padMap'));
  const rows = PAD_BUTTONS.map((name, i) => {
    const sel = h('select.input', { style: { maxWidth: '230px' } }, PAD_ACTIONS.map((a) => h('option', { value: a.id, selected: map[i] === a.id }, a.label)));
    sel.addEventListener('change', () => {
      settings.set('padMap', { ...(settings.get('padMap') || {}), [i]: sel.value });
    });
    return h('div.pad-row', h('b.pad-btn', name), sel);
  });
  const refresh = () => {
    if (!status.isConnected) { clearInterval(timer); pad.cancelCapture(); return; }
    status.textContent = pad.connected ? `🎮 Mando detectado: ${pad.name}` : '🎮 Conecta tu mando (USB o Bluetooth) y pulsa un botón para que el navegador lo detecte.';
    const p = pad.pressedNow();
    const [lx, ly, rx, ry] = pad.stick();
    live.textContent = pad.connected ? `Prueba: ${p.length ? p.join(' + ') : 'ningún botón'} · stick izq. ${lx.toFixed(1)}, ${ly.toFixed(1)} · stick der. ${rx.toFixed(1)}, ${ry.toFixed(1)}` : '';
  };
  const timer = setInterval(refresh, 120);
  refresh();
  return h('div',
    h('div.section-title', 'Mando (DualShock 4, Xbox…)'),
    status,
    live,
    toggle('Usar mando', 'padEnabled'),
    slider('Sensibilidad de la cámara', 'padSens', 0.3, 3, 0.1, (v) => v.toFixed(1)),
    slider('Zona muerta de los sticks', 'padDeadzone', 0.05, 0.4, 0.01, (v) => v.toFixed(2)),
    toggle('Vibración', 'padRumble'),
    h('p.muted.small', 'En partida: stick izquierdo mueve, derecho gira la cámara. En menús: cruceta o stick para moverte, ✕ aceptar, ○ volver, L1/R1 cambia de sección. △ pulsa la acción principal (Comenzar, Aceptar…). Options abre la pausa.'),
    h('details', h('summary', 'Cambiar los botones'),
      h('p.muted.small', 'Cada fila es un botón del mando; elige qué hace en el juego.'),
      ...rows,
      h('div.row', { style: { marginTop: '8px' } }, button('Restablecer botones', () => { settings.set('padMap', {}); rerender(); }, 'small'))),
  );
}

function voiceSection() {
  const list = h('div.voice-friends', h('p.muted.small', 'Cargando amigos…'));
  get('/friends').then((r) => {
    const chosen = new Set(settings.get('voiceFriends') || []);
    const rows = (r.friends || []).map((f) => {
      const cb = h('input', { type: 'checkbox', checked: chosen.has(f.id) });
      cb.addEventListener('change', () => {
        const cur = new Set(settings.get('voiceFriends') || []);
        if (cb.checked) cur.add(f.id); else cur.delete(f.id);
        settings.set('voiceFriends', [...cur]);
      });
      return h('label.row', { style: { margin: '6px 0', cursor: 'pointer' } }, cb, h('span', f.username), h('span.small.muted', f.online ? ' · en línea' : ' · desconectado'));
    });
    list.replaceChildren(...(rows.length ? rows : [h('p.muted.small', 'Todavía no tienes amigos. Añádelos en la pestaña Amigos.')]));
  }).catch(() => list.replaceChildren(h('p.muted.small', 'No se pudieron cargar los amigos.')));

  const file = h('input', { type: 'file', accept: 'image/*', style: { display: 'none' } });
  file.addEventListener('change', async () => {
    const f = file.files[0];
    if (!f) return;
    try {
      await put('/me/photo', { photo: await shrinkPhoto(f) });
      toast('Foto de perfil guardada', 'ok');
    } catch (e) {
      toast(e.message, 'err');
    }
    file.value = '';
  });
  const removePhoto = button('Quitar foto', async () => {
    try { await put('/me/photo', { photo: '' }); toast('Foto quitada', 'ok'); } catch (e) { toast(e.message, 'err'); }
  });

  return h('div',
    h('div.section-title', 'Chat de voz (solo amigos)'),
    toggle('Chat de voz con amigos', 'voice'),
    toggle('Subtítulos de lo que dicen', 'voiceCaptions'),
    h('p.muted.small', 'Solo puedes hablar y ver subtítulos de los amigos que elijas aquí. Nadie más puede escucharte. Los subtítulos los reconoce tu navegador (Chrome o Edge), que envía el audio a sus servicios para convertirlo en texto.'),
    list,
    h('div.section-title', 'Foto de perfil'),
    h('p.muted.small', 'Tu foto aparece junto a tus subtítulos. Si no pones foto, sale tu inicial.'),
    h('div.row.wrap', { style: { gap: '8px' } }, button('Subir foto', () => file.click()), removePhoto, file),
  );
}

export function openSettings() {
  let body;
  const render = () => {
    const presets = h('div.pills', ['low', 'medium', 'high'].map((p) => h(`button.pill${settings.get('quality') === p ? '.on' : ''}`, {
      on: { click: () => { settings.applyPreset(p); audio.ui('click'); rerender(); } },
    }, { low: 'Bajo', medium: 'Medio', high: 'Alto' }[p])));
    return h('div',
      h('div.section-title', 'Gráficos'),
      h('div.field', h('label', 'Calidad predefinida'), presets),
      slider('Resolución', 'resolution', 0.4, 1, 0.05, (v) => `${Math.round(v * 100)} %`),
      select('Sombras', 'shadows', [['off', 'Desactivadas'], ['low', 'Bajas'], ['high', 'Altas']]),
      slider('Distancia de dibujado', 'drawDistance', 100, 600, 20, (v) => `${v} m`),
      select('Detalle del terreno (al entrar)', 'terrainDetail', [[1, 'Alto'], [2, 'Medio'], [4, 'Bajo']]),
      select('Luces dinámicas (al entrar)', 'pointLights', [[0, 'Ninguna'], [2, 'Pocas'], [4, 'Muchas']]),
      toggle('Resolución automática (más FPS)', 'autoRes'),
      toggle('Efectos visuales', 'effects'),
      toggle('Niebla', 'fog'),
      toggle('Ciclo de día y noche', 'dayNight'),
      h('div.section-title', 'Controles'),
      slider('Sensibilidad de cámara', 'sensitivity', 0.2, 3, 0.1, (v) => v.toFixed(1)),
      toggle('Invertir eje vertical', 'invertY'),
      select('Tipo de Shift (Skate Pro)', 'shiftMode', [['auto', 'Automático: el patinador gira solo hacia donde miras'], ['hold', 'Manual: mantén Shift para fijar la cámara'], ['toggle', 'Manual: Shift activa y desactiva']]),
      h('p.muted.small', 'En manual, el manual (equilibrio) y correr pasan a la tecla X.'),
      h('div.section-title', 'Audio'),
      slider('Música', 'music', 0, 1, 0.05, (v) => `${Math.round(v * 100)} %`),
      slider('Efectos', 'sfx', 0, 1, 0.05, (v) => `${Math.round(v * 100)} %`),
      slider('Ambiente', 'ambient', 0, 1, 0.05, (v) => `${Math.round(v * 100)} %`),
      toggle('Sonidos de interfaz', 'uiSounds'),
      h('div.section-title', 'Interfaz'),
      toggle('Mostrar chat', 'showChat'),
      padSection(rerender),
      voiceSection(),
    );
  };
  const wrap = h('div');
  const rerender = () => { wrap.replaceChildren(render()); };
  rerender();
  body = wrap;
  modal('Configuración', body, { actions: [{ label: 'Listo', cls: 'primary' }] });
}

export { button };
