// Ayudantes de DOM: creación de elementos, toasts y modales.
import { audio } from '../audio/audio.js';

/**
 * h('div.clase#id', {attrs, on:{click}}, ...hijos)
 * Los textos se insertan como nodos de texto (nunca como HTML) para evitar inyecciones.
 */
export function h(tag, props, ...children) {
  if (props == null || typeof props !== 'object' || props instanceof Node || Array.isArray(props)) {
    if (props != null) children.unshift(props);
    props = {};
  }
  const m = tag.match(/^([a-z0-9]+)?((?:[.#][\w-]+)*)$/i);
  const el = document.createElement(m?.[1] || 'div');
  for (const part of (m?.[2] || '').match(/[.#][\w-]+/g) || []) {
    if (part[0] === '.') el.classList.add(part.slice(1));
    else el.id = part.slice(1);
  }
  for (const [k, v] of Object.entries(props)) {
    if (v == null || v === false) continue;
    if (k === 'on') for (const [ev, fn] of Object.entries(v)) el.addEventListener(ev, fn);
    else if (k === 'style' && typeof v === 'object') Object.assign(el.style, v);
    else if (k === 'class') el.className += ' ' + v;
    else if (k === 'html') el.innerHTML = v; // solo para SVG/markup estático propio
    else if (k in el && typeof v !== 'string') el[k] = v;
    else el.setAttribute(k, v === true ? '' : v);
  }
  append(el, children);
  return el;
}

function append(el, children) {
  for (const c of children.flat(Infinity)) {
    if (c == null || c === false) continue;
    el.appendChild(c instanceof Node ? c : document.createTextNode(String(c)));
  }
}

export function clear(el) {
  while (el.firstChild) el.removeChild(el.firstChild);
  return el;
}

/** Botón con sonido de interfaz. */
export function button(label, onClick, cls = '') {
  const b = h(`button.btn${cls ? '.' + cls.split(' ').join('.') : ''}`, {
    on: {
      click: (e) => {
        audio.ui('click');
        onClick?.(e);
      },
      mouseenter: () => audio.ui('hover'),
    },
  }, label);
  return b;
}

export function toast(text, kind = 'info', ms = 3200) {
  const root = document.getElementById('toasts');
  const t = h(`div.toast.${kind}`, text);
  root.appendChild(t);
  while (root.children.length > 5) root.firstChild.remove();
  setTimeout(() => {
    t.classList.add('out');
    setTimeout(() => t.remove(), 300);
  }, ms);
}

/** Abre un modal. content: nodo o función (close) => nodo. Devuelve close(). */
export function modal(title, content, { actions = [], onClose, wide = false } = {}) {
  const root = document.getElementById('modal-root');
  let closed = false;
  const close = () => {
    if (closed) return;
    closed = true;
    back.remove();
    onClose?.();
  };
  const body = typeof content === 'function' ? content(close) : content;
  const box = h('div.modal.panel', { style: wide ? { width: 'min(720px, 100%)' } : {} },
    h('h3', title),
    body,
    actions.length ? h('div.actions', actions.map((a) => button(a.label, () => a.onClick ? a.onClick(close) : close(), a.cls || ''))) : null,
  );
  const back = h('div.modal-back', { on: { mousedown: (e) => { if (e.target === back) close(); } } }, box);
  root.appendChild(back);
  return close;
}

export function confirmDialog(title, text, okLabel = 'Aceptar', cls = 'primary') {
  return new Promise((resolve) => {
    let result = false;
    modal(title, h('p.muted', text), {
      actions: [
        { label: 'Cancelar' },
        { label: okLabel, cls, onClick: (close) => { result = true; close(); } },
      ],
      onClose: () => resolve(result),
    });
  });
}

export const LOGO_SVG = `<svg viewBox="0 0 64 64"><defs><linearGradient id="lg1" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="#00d1b2"/><stop offset="1" stop-color="#7c5cff"/></linearGradient></defs><path d="M32 4 58 18v28L32 60 6 46V18z" fill="url(#lg1)"/><path d="M32 4 58 18 32 32 6 18z" fill="#ffffff" opacity=".35"/><path d="M32 32v28L6 46V18z" fill="#000" opacity=".18"/><path d="M24 22v20M24 32l10-10M27 30l9 12" stroke="#fff" stroke-width="4.5" stroke-linecap="round" fill="none"/></svg>`;

export function logo(big = false) {
  return h(`div.logo${big ? '.big' : ''}`, { html: `${LOGO_SVG}<div class="word">Kest <b>Worlds</b></div>` });
}

export function formatTime(ms) {
  const s = Math.max(0, ms) / 1000;
  const m = Math.floor(s / 60);
  return `${m}:${(s % 60).toFixed(1).padStart(4, '0')}`;
}

export function coverStyle(world) {
  if (world.cover) return { backgroundImage: `url(${world.cover})` };
  const c = world.coverStyle || { a: '#3949ab', b: '#00acc1', icon: '🧱' };
  return { backgroundImage: `linear-gradient(135deg, ${c.a}, ${c.b})` };
}
