// Panel de configuración: gráficos, controles, audio e interfaz.
import { h, modal, button } from './dom.js';
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
      toggle('Efectos visuales', 'effects'),
      toggle('Niebla', 'fog'),
      toggle('Ciclo de día y noche', 'dayNight'),
      h('div.section-title', 'Controles'),
      slider('Sensibilidad de cámara', 'sensitivity', 0.2, 3, 0.1, (v) => v.toFixed(1)),
      toggle('Invertir eje vertical', 'invertY'),
      h('div.section-title', 'Audio'),
      slider('Música', 'music', 0, 1, 0.05, (v) => `${Math.round(v * 100)} %`),
      slider('Efectos', 'sfx', 0, 1, 0.05, (v) => `${Math.round(v * 100)} %`),
      slider('Ambiente', 'ambient', 0, 1, 0.05, (v) => `${Math.round(v * 100)} %`),
      toggle('Sonidos de interfaz', 'uiSounds'),
      h('div.section-title', 'Interfaz'),
      toggle('Mostrar chat', 'showChat'),
    );
  };
  const wrap = h('div');
  const rerender = () => { wrap.replaceChildren(render()); };
  rerender();
  body = wrap;
  modal('Configuración', body, { actions: [{ label: 'Listo', cls: 'primary' }] });
}

export { button };
