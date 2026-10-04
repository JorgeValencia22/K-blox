// Medidor de volumen del micrófono para Kest Pesadilla. El sonido NUNCA sale del
// dispositivo: solo se calcula un número de 0 a 1 (lo fuerte que hablas) y eso es
// lo único que se envía al servidor. No hay grabación ni chat de voz.
export class MicMeter {
  constructor() {
    this.stream = null;
    this.ctx = null;
    this.analyser = null;
    this.buf = null;
    this.value = 0;
  }

  get active() {
    return !!this.analyser;
  }

  /** Pide permiso y empieza a medir. Lanza un error con mensaje legible si no se puede. */
  async start() {
    if (!navigator.mediaDevices?.getUserMedia) {
      throw new Error(window.isSecureContext ? 'Este navegador no permite usar el micrófono' : 'El micrófono solo funciona con https:// o en localhost');
    }
    try {
      this.stream = await navigator.mediaDevices.getUserMedia({ audio: { echoCancellation: true, noiseSuppression: false, autoGainControl: false } });
    } catch (e) {
      throw new Error(e.name === 'NotAllowedError' ? 'Has denegado el permiso del micrófono' : 'No se encontró ningún micrófono');
    }
    this.ctx = new AudioContext();
    const src = this.ctx.createMediaStreamSource(this.stream);
    this.analyser = this.ctx.createAnalyser();
    this.analyser.fftSize = 1024;
    this.buf = new Float32Array(this.analyser.fftSize);
    src.connect(this.analyser); // no se conecta a los altavoces
  }

  /** Volumen actual suavizado (0 = silencio, 1 = gritar). */
  level(dt = 1 / 60) {
    if (!this.analyser) return 0;
    this.analyser.getFloatTimeDomainData(this.buf);
    let sum = 0;
    for (let i = 0; i < this.buf.length; i++) sum += this.buf[i] * this.buf[i];
    const rms = Math.sqrt(sum / this.buf.length);
    const db = 20 * Math.log10(rms + 1e-8);
    const v = Math.max(0, Math.min(1, (db + 52) / 36)); // −52 dB ≈ silencio, −16 dB ≈ grito
    // Sube rápido y baja despacio, como un vúmetro
    this.value = v > this.value ? v : Math.max(v, this.value - dt * 1.2);
    return this.value;
  }

  stop() {
    this.stream?.getTracks().forEach((t) => t.stop());
    this.ctx?.close().catch(() => {});
    this.stream = this.ctx = this.analyser = null;
    this.value = 0;
  }
}
