// Iconos de línea (SVG) para la navegación, al estilo de las plataformas de juegos.
const PATHS = {
  "menu": "<path d=\"M3 11 12 4l9 7v9a1 1 0 0 1-1 1h-5v-6H9v6H4a1 1 0 0 1-1-1z\"/>",
  "discover": "<circle cx=\"12\" cy=\"12\" r=\"9\"/><path d=\"m15.5 8.5-2 5-5 2 2-5z\"/>",
  "avatar": "<circle cx=\"12\" cy=\"7\" r=\"4\"/><path d=\"M4 21c0-4.4 3.6-7 8-7s8 2.6 8 7\"/>",
  "shop": "<path d=\"M4 7h16l-1.5 12a2 2 0 0 1-2 1.8H7.5a2 2 0 0 1-2-1.8z\"/><path d=\"M9 10V6a3 3 0 0 1 6 0v4\"/>",
  "coins": "<circle cx=\"12\" cy=\"12\" r=\"9\"/><path d=\"M12 7v10M9 9.5c0-1.4 1.3-2 3-2s3 .8 3 2-1.2 1.7-3 2-3 .8-3 2.1 1.3 2 3 2 3-.7 3-2\"/>",
  "create": "<path d=\"m14 6 4 4M4 20l4-1 11-11a2.8 2.8 0 0 0-4-4L4 15z\"/>",
  "friends": "<circle cx=\"9\" cy=\"8\" r=\"3.5\"/><path d=\"M2 20c0-3.8 3-6 7-6s7 2.2 7 6\"/><circle cx=\"17.5\" cy=\"8.5\" r=\"2.5\"/><path d=\"M17 14c3 0 5 1.8 5 5\"/>",
  "profile": "<path d=\"m12 3 2.7 5.6 6.1.9-4.4 4.3 1 6.1L12 17l-5.4 2.9 1-6.1L3.2 9.5l6.1-.9z\"/>",
  "settings": "<circle cx=\"12\" cy=\"12\" r=\"3\"/><path d=\"M12 2v3M12 19v3M2 12h3M19 12h3M4.9 4.9 7 7M17 17l2.1 2.1M4.9 19.1 7 17M17 7l2.1-2.1\"/>",
  "admin": "<path d=\"M12 3 4 6v6c0 5 3.4 8.4 8 9 4.6-.6 8-4 8-9V6z\"/>",
  "key": "<circle cx=\"8\" cy=\"15\" r=\"4\"/><path d=\"m11 12 9-9M17 6l3 3M14 9l2 2\"/>",
  "lock": "<rect x=\"5\" y=\"11\" width=\"14\" height=\"10\" rx=\"2\"/><path d=\"M8 11V7a4 4 0 0 1 8 0v4\"/>"
};

export function icon(name) {
  return `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">${PATHS[name] || ''}</svg>`;
}
