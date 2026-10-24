// Chat de voz y subtítulos SOLO entre amigos. Cada uno elige con quién habla (ajustes → Chat de voz).
// El audio va directo entre los dos navegadores (WebRTC); el servidor solo reenvía la negociación
// de la conexión. Los subtítulos los reconoce el navegador de quien habla y se envían solo a los
// amigos elegidos; no se guarda nada en el servidor.
import { net } from '../core/net.js';
import { store } from '../core/store.js';
import { settings } from '../core/settings.js';
import { get } from '../core/api.js';
import { h, toast } from '../ui/dom.js';

const ICE = [{ urls: 'stun:stun.l.google.com:19302' }];
const SHOW_MS = 5000;
const COLORS = ['#e53935', '#8e24aa', '#1e88e5', '#00897b', '#f4511e', '#6d4c41', '#3949ab', '#7cb342'];

class Voice {
  constructor() {
    this.peers = new Map(); // amigo -> { pc, audio }
    this.info = new Map();  // amigo -> { username, photo }
    this.online = new Set();
    this.mic = null;
    this.recog = null;
    this.inited = false;
    this.box = null;
  }

  init() {
    if (this.inited) return;
    this.inited = true;
    net.on('voice:signal', (m) => this.onSignal(m));
    net.on('voice:caption', (m) => this.onCaption(m));
    net.on('presence', (p) => this.onPresence(p));
    net.on('status', (s) => { if (s === 'online') this.refresh(); });
    settings.on('change', ({ key }) => { if (['voice', 'voiceCaptions', 'voiceFriends'].includes(key)) this.refresh(); });
    store.on('user', () => this.refresh());
    setInterval(() => this.lift(), 500);
    this.refresh();
  }

  /** Amigos elegidos para hablar con ellos. */
  wanted() {
    return new Set(settings.get('voiceFriends') || []);
  }

  enabled() {
    return !!store.user && !!settings.get('voice') && this.wanted().size > 0;
  }

  /** Aplica los ajustes: micrófono, conexiones con los amigos elegidos y subtítulos. */
  async refresh() {
    if (!this.enabled()) {
      this.stopAll();
      return;
    }
    await this.loadFriends();
    if (!(await this.ensureMic())) return;
    for (const id of this.wanted()) {
      if (this.online.has(id)) this.connect(id);
      else this.drop(id);
    }
    // Quitar los amigos que ya no están elegidos
    for (const id of [...this.peers.keys()]) if (!this.wanted().has(id)) this.drop(id);
    if (settings.get('voiceCaptions')) this.startCaptions();
    else this.stopCaptions();
  }

  async loadFriends() {
    try {
      const r = await get('/friends');
      this.online.clear();
      for (const f of r.friends || []) {
        this.info.set(f.id, { username: f.username, photo: f.photo || '' });
        if (f.online) this.online.add(f.id);
      }
    } catch {
      /* sin conexión: se reintenta al volver */
    }
  }

  async ensureMic() {
    if (this.mic) return true;
    if (!navigator.mediaDevices?.getUserMedia) {
      toast('Este navegador no permite usar el micrófono', 'err');
      return false;
    }
    try {
      this.mic = await navigator.mediaDevices.getUserMedia({ audio: { echoCancellation: true, noiseSuppression: true, autoGainControl: true } });
      return true;
    } catch (e) {
      toast(e.name === 'NotAllowedError' ? 'Has denegado el permiso del micrófono' : 'No se encontró ningún micrófono', 'err');
      settings.set('voice', false);
      return false;
    }
  }

  /** Crea la conexión con un amigo. El que tiene el id mayor es quien envía la oferta. */
  create(id) {
    if (this.peers.has(id)) return this.peers.get(id);
    const pc = new RTCPeerConnection({ iceServers: ICE });
    const peer = { pc, audio: null };
    this.peers.set(id, peer);
    this.mic?.getTracks().forEach((t) => pc.addTrack(t, this.mic));
    pc.ontrack = (e) => {
      if (!peer.audio) {
        peer.audio = new Audio();
        peer.audio.autoplay = true;
        document.body.appendChild(peer.audio);
      }
      peer.audio.srcObject = e.streams[0];
    };
    pc.onicecandidate = (e) => { if (e.candidate) net.send('voice:signal', { to: id, data: { kind: 'ice', candidate: e.candidate } }); };
    pc.onconnectionstatechange = () => { if (['failed', 'closed'].includes(pc.connectionState)) this.drop(id); };
    return peer;
  }

  async connect(id) {
    if (this.peers.has(id) || !this.mic) return;
    this.create(id);
    if (store.user.id > id) {
      const pc = this.peers.get(id).pc;
      const offer = await pc.createOffer();
      await pc.setLocalDescription(offer);
      net.send('voice:signal', { to: id, data: { kind: 'offer', sdp: offer.sdp } });
    }
  }

  async onSignal({ from, data }) {
    if (!this.wanted().has(from) || !this.enabled()) return;
    if (!this.mic) return;
    const peer = this.peers.get(from) || this.create(from);
    const pc = peer.pc;
    try {
      if (data.kind === 'offer') {
        await pc.setRemoteDescription({ type: 'offer', sdp: data.sdp });
        const answer = await pc.createAnswer();
        await pc.setLocalDescription(answer);
        net.send('voice:signal', { to: from, data: { kind: 'answer', sdp: answer.sdp } });
      } else if (data.kind === 'answer') {
        await pc.setRemoteDescription({ type: 'answer', sdp: data.sdp });
      } else if (data.kind === 'ice' && data.candidate) {
        await pc.addIceCandidate(data.candidate);
      }
    } catch {
      /* negociación fallida: se volverá a intentar al reconectar */
    }
  }

  onPresence({ id, online }) {
    if (online) this.online.add(id);
    else this.online.delete(id);
    if (!this.enabled() || !this.wanted().has(id)) return;
    if (online) this.connect(id);
    else this.drop(id);
  }

  drop(id) {
    const peer = this.peers.get(id);
    if (!peer) return;
    peer.pc.close();
    peer.audio?.remove();
    this.peers.delete(id);
  }

  stopAll() {
    for (const id of [...this.peers.keys()]) this.drop(id);
    this.stopCaptions();
    this.mic?.getTracks().forEach((t) => t.stop());
    this.mic = null;
  }

  // --- Subtítulos -----------------------------------------------------------------------------
  startCaptions() {
    if (this.recog || !this.mic) return;
    const SR = window.SpeechRecognition || window.webkitSpeechRecognition;
    if (!SR) {
      toast('Los subtítulos de voz funcionan en Chrome o Edge', 'warn');
      settings.set('voiceCaptions', false);
      return;
    }
    const r = new SR();
    r.lang = 'es-ES';
    r.continuous = true;
    r.interimResults = false;
    r.onresult = (e) => {
      for (let i = e.resultIndex; i < e.results.length; i++) {
        if (!e.results[i].isFinal) continue;
        const text = e.results[i][0].transcript;
        const to = [...this.wanted()].filter((id) => this.online.has(id));
        if (text.trim() && to.length) net.send('voice:caption', { to, text });
      }
    };
    r.onend = () => { if (this.recog === r) r.start(); };
    r.onerror = () => {};
    this.recog = r;
    try { r.start(); } catch { /* ya estaba en marcha */ }
  }

  stopCaptions() {
    const r = this.recog;
    this.recog = null;
    try { r?.stop(); } catch { /* nada que parar */ }
  }

  ensureBox() {
    if (this.box) return this.box;
    this.box = h('div#voice-subs');
    document.body.appendChild(this.box);
    return this.box;
  }

  onCaption({ from, text }) {
    if (!settings.get('voiceCaptions') || !this.wanted().has(from)) return;
    const f = this.info.get(from) || { username: '?', photo: '' };
    const box = this.ensureBox();
    const row = h('div.vsub-row', this.avatar(f), h('span.vsub-text', text));
    box.append(row);
    while (box.children.length > 3) box.firstChild.remove();
    setTimeout(() => row.remove(), SHOW_MS + text.length * 40);
  }

  /** Foto de perfil si la tiene; si no, la inicial sobre un color fijo. */
  avatar(f) {
    if (f.photo) return h('img.vsub-photo', { src: f.photo, alt: f.username });
    const letter = (f.username || '?')[0].toUpperCase();
    const color = COLORS[[...(f.username || '')].reduce((s, c) => s + c.charCodeAt(0), 0) % COLORS.length];
    return h('div.vsub-photo.vsub-init', { style: { background: color } }, letter);
  }

  /** Sube los subtítulos cuando el juego muestra los suyos, para no taparlos. */
  lift() {
    if (!this.box) return;
    const busy = [...document.querySelectorAll('.gxc-cap span, .game-subs')].some((e) => e.offsetParent && e.textContent.trim());
    this.box.classList.toggle('lift', busy);
  }
}

export const voice = new Voice();
