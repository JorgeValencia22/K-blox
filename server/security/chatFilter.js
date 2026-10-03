// Filtro de chat: palabras prohibidas (resistente a leetspeak y separadores)
// y bloqueo de datos personales (teléfonos, correos, enlaces, redes sociales).
import fs from 'node:fs';

const LEET = { '0': 'o', '1': 'i', '3': 'e', '4': 'a', '5': 's', '7': 't', '8': 'b', '@': 'a', '$': 's', '!': 'i', '|': 'l', '€': 'e' };
const DIGIT_WORDS = {
  cero: 0, zero: 0, uno: 1, una: 1, one: 1, dos: 2, two: 2, tres: 3, three: 3, cuatro: 4, four: 4, cinco: 5, five: 5,
  seis: 6, six: 6, siete: 7, seven: 7, ocho: 8, eight: 8, nueve: 9, nine: 9,
};
const CONTACT_WORDS = ['whatsapp', 'whats app', 'telegram', 'instagram', 'insta', 'snapchat', 'snap', 'discord', 'tiktok', 'mi numero', 'my number', 'mi telefono', 'mi direccion', 'my address', 'donde vives', 'where do you live', 'tu direccion', 'tu telefono'];

const stripAccents = (s) => s.normalize('NFD').replace(/[̀-ͯ]/g, '');
const isLetter = (ch) => /[a-zñ]/.test(ch);

export class ChatFilter {
  constructor(words = []) {
    this.setWords(words);
  }

  static fromFile(file) {
    let words = [];
    try {
      words = JSON.parse(fs.readFileSync(file, 'utf8')).words || [];
    } catch {
      console.warn(`[chat] No se pudo leer ${file}, filtro de palabras vacío`);
    }
    return new ChatFilter(words);
  }

  setWords(words) {
    this.words = [...new Set(words.map((w) => collapse(stripAccents(String(w).toLowerCase()).replace(/[^a-zñ]/g, ''))).filter((w) => w.length >= 3))];
  }

  /**
   * Filtra un mensaje. opts.strict = cuenta nueva (sin números).
   * Devuelve { ok:true, text } o { ok:false, reason }.
   */
  check(text, opts = {}) {
    let msg = String(text ?? '').replace(/[\u0000-\u001f\u007f]/g, '').replace(/\s+/g, ' ').trim();
    if (!msg) return { ok: false, reason: 'Mensaje vacío' };

    const lower = stripAccents(msg.toLowerCase());
    if (/[^\s@]+@[^\s@]+\.[a-z]{2,}/i.test(lower)) return { ok: false, reason: 'No compartas correos electrónicos' };
    if (/(https?:\/\/|www\.|\b[a-z0-9-]{2,}\s*(\.|\bdot\b|\bpunto\b)\s*(com|net|org|es|io|gg|me|tv|xyz|co|ly|link)\b)/i.test(lower)) {
      return { ok: false, reason: 'No se permiten enlaces' };
    }
    const plain = lower.replace(/[^a-z\s]/g, ' ').replace(/\s+/g, ' ');
    for (const w of CONTACT_WORDS) {
      if (new RegExp(`\\b${w}\\b`).test(plain)) return { ok: false, reason: 'Por seguridad no compartas contactos ni datos personales' };
    }
    // Cuenta dígitos, incluidos los escritos con letras ("cinco cinco...")
    let digits = (lower.match(/\d/g) || []).length;
    for (const word of plain.split(' ')) if (word in DIGIT_WORDS) digits++;
    if (digits >= 6) return { ok: false, reason: 'No compartas números de teléfono ni datos personales' };
    if (opts.strict && /\d/.test(msg)) msg = msg.replace(/\d/g, '#');

    return { ok: true, text: this.maskWords(msg) };
  }

  maskWords(msg) {
    // Construye una versión compacta (solo letras, sin repeticiones) con mapeo a posiciones originales.
    const norm = stripAccents(msg.toLowerCase());
    const letters = [];
    const pos = [];
    for (let i = 0; i < norm.length; i++) {
      let ch = norm[i];
      ch = LEET[ch] || ch;
      if (!isLetter(ch)) continue;
      if (letters.length && letters[letters.length - 1] === ch && pos[pos.length - 1] === i - 1) {
        pos[pos.length - 1] = i; // colapsa repeticiones contiguas (puuuta)
        continue;
      }
      letters.push(ch);
      pos.push(i);
    }
    const compact = letters.join('');
    const mask = new Array(msg.length).fill(false);
    const startOfWord = (i) => i === 0 || !isLetter(LEET[norm[i - 1]] || norm[i - 1]);
    const endOfWord = (i) => i >= norm.length - 1 || !isLetter(LEET[norm[i + 1]] || norm[i + 1]);
    for (const w of this.words) {
      let from = 0;
      for (;;) {
        const k = compact.indexOf(w, from);
        if (k < 0) break;
        from = k + 1;
        const a = pos[k], b = pos[k + w.length - 1];
        // Solo palabras completas: evita falsos positivos dentro de otras palabras.
        let startIdx = a;
        while (startIdx > 0 && norm[startIdx - 1] === norm[a]) startIdx--;
        if (!startOfWord(startIdx) || !endOfWord(b)) continue;
        for (let i = startIdx; i <= b; i++) mask[i] = true;
      }
    }
    let out = '';
    for (let i = 0; i < msg.length; i++) out += mask[i] && msg[i] !== ' ' ? '#' : msg[i];
    return out;
  }
}

function collapse(s) {
  return s.replace(/(.)\1+/g, '$1');
}
