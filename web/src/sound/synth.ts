// Briques de synthèse Web Audio : moteur (bus, compresseur, réverbération générée) et « voix » jetables.
// Aucun fichier audio. Toutes les enveloppes partent de 0 et finissent à 0 (pas de clic), chaque nœud
// créé par une voix est déconnecté à la fin de sa dernière source.

export interface ToneSpec {
  type?: OscillatorType;
  /** Hz (avant l'aléa de hauteur de la voix). */
  freq: number;
  /** Glissando exponentiel vers cette fréquence. */
  freqEnd?: number;
  /** Durée du glissando (défaut : toute la note). */
  glide?: number;
  /** Décalage de départ depuis le début de la voix, en secondes. */
  at?: number;
  attack?: number;
  decay?: number;
  /** Niveau de maintien (0..1 du pic). */
  sustain?: number;
  hold?: number;
  release?: number;
  gain?: number;
  detune?: number;
  filter?: FilterSpec;
  vibrato?: { rate: number; depth: number };
  /** Modulation d'amplitude (trémolo) : profondeur 0..1. */
  tremolo?: { rate: number; depth: number };
  pan?: number;
  /** Balancement stéréo oscillant autour de `pan` (profondeur négative = sens inverse). */
  panLfo?: { rate: number; depth: number };
  /** Part envoyée à la réverbération (0..1). */
  send?: number;
}

export interface FilterSpec {
  type: BiquadFilterType;
  freq: number;
  freqEnd?: number;
  /** Durée du balayage (défaut : toute la note). */
  sweep?: number;
  q?: number;
  lfo?: { rate: number; depth: number };
}

export interface NoiseSpec {
  at?: number;
  attack?: number;
  decay?: number;
  sustain?: number;
  hold?: number;
  release?: number;
  gain?: number;
  filter?: FilterSpec;
  pan?: number;
  panLfo?: { rate: number; depth: number };
  send?: number;
}

export interface Engine {
  ctx: AudioContext;
  /** Entrée du bus sec (avant compresseur). */
  bus: AudioNode;
  /** Entrée de l'envoi de réverbération. */
  reverb: AudioNode;
  noise: AudioBuffer;
  master: GainNode;
}

const FLOOR = 0.0001;

/** Réponse impulsionnelle générée : bruit stéréo qui décroît, adouci par un filtre passe-bas à un pôle. */
export function makeImpulse(ctx: AudioContext, seconds = 1.3, decay = 3.2): AudioBuffer {
  const rate = ctx.sampleRate || 44100;
  const length = Math.max(1, Math.floor(rate * seconds));
  const buffer = ctx.createBuffer(2, length, rate);
  for (let c = 0; c < 2; c++) {
    const data = buffer.getChannelData(c);
    let lp = 0;
    for (let i = 0; i < length; i++) {
      const white = Math.random() * 2 - 1;
      lp += (white - lp) * 0.35;
      const t = i / length;
      data[i] = lp * Math.pow(1 - t, decay) * (t < 0.004 ? t / 0.004 : 1);
    }
  }
  return buffer;
}

function makeNoise(ctx: AudioContext, seconds = 1.5): AudioBuffer {
  const rate = ctx.sampleRate || 44100;
  const length = Math.floor(rate * seconds);
  const buffer = ctx.createBuffer(1, length, rate);
  const data = buffer.getChannelData(0);
  for (let i = 0; i < length; i++) data[i] = Math.random() * 2 - 1;
  return buffer;
}

/** Plafond du limiteur (avant le volume général) : aucune crête ne dépasse ce niveau, quel que soit le nombre de voix. */
export const LIMIT = 0.8;
/** Le limiteur travaille sur [-LIMIT_RANGE, LIMIT_RANGE] ; au-delà, la courbe est plate. */
const LIMIT_RANGE = 3;

/**
 * Écrêteur doux (tanh) : transparent aux faibles niveaux, plafonné à `LIMIT`. Contrairement à un
 * DynamicsCompressor (gain de rattrapage automatique, niveau qui dépend de la durée des sons), il est
 * statique : le niveau d'un son ne dépend que de sa recette, donc mesurable hors ligne et réglable au dB près.
 */
export function limiterCurve(size = 2048): Float32Array<ArrayBuffer> {
  const curve = new Float32Array(size);
  for (let i = 0; i < size; i++) {
    const x = LIMIT_RANGE * ((2 * i) / (size - 1) - 1);
    curve[i] = LIMIT * Math.tanh(x / LIMIT);
  }
  return curve;
}

/** Chaîne de sortie : bus -> limiteur doux -> gain général -> sortie ; réverbération en parallèle. */
export function createEngine(ctx: AudioContext, masterGain: number): Engine {
  const bus = ctx.createGain();
  bus.gain.value = 1;
  const master = ctx.createGain();
  master.gain.value = masterGain;
  const pre = ctx.createGain();
  pre.gain.value = 1 / LIMIT_RANGE;
  const limiter = ctx.createWaveShaper();
  limiter.curve = limiterCurve();
  limiter.oversample = "2x";
  const convolver = ctx.createConvolver();
  convolver.buffer = makeImpulse(ctx);
  const reverb = ctx.createGain();
  const wet = ctx.createGain();
  wet.gain.value = 0.5;
  reverb.connect(convolver);
  convolver.connect(wet);
  wet.connect(bus);
  bus.connect(pre);
  pre.connect(limiter);
  limiter.connect(master);
  master.connect(ctx.destination);
  return { ctx, bus, reverb, noise: makeNoise(ctx), master };
}

/** Une lecture : crée ses nœuds, planifie tout, puis se démonte seule à la fin des sources. */
export class Voice {
  readonly out: GainNode;
  private nodes: AudioNode[] = [];
  private sources = 0;
  private ended = 0;
  private disposed = false;
  private timer: ReturnType<typeof setTimeout> | null = null;
  /** Instant de fin prévu (temps du contexte). */
  endAt: number;

  constructor(
    private readonly e: Engine,
    readonly t0: number,
    /** Multiplicateur de hauteur (aléa ±3 %). */
    readonly pitch: number,
    volume: number,
    private readonly onDone: (v: Voice) => void,
  ) {
    this.out = e.ctx.createGain();
    this.out.gain.value = volume;
    this.out.connect(e.bus);
    this.nodes.push(this.out);
    this.endAt = t0;
  }

  private track<T extends AudioNode>(n: T): T {
    this.nodes.push(n);
    return n;
  }

  private envelope(
    param: AudioParam,
    start: number,
    peak: number,
    s: { attack?: number; decay?: number; sustain?: number; hold?: number; release?: number },
  ): number {
    const a = Math.max(0.002, s.attack ?? 0.004);
    const d = Math.max(0.005, s.decay ?? 0.1);
    const sus = Math.max(FLOOR, (s.sustain ?? 0) * peak);
    const hold = s.hold ?? 0;
    const r = Math.max(0.01, s.release ?? 0.04);
    param.setValueAtTime(FLOOR, start);
    param.linearRampToValueAtTime(Math.max(FLOOR, peak), start + a);
    param.exponentialRampToValueAtTime(sus, start + a + d);
    if (hold > 0) param.setValueAtTime(sus, start + a + d + hold);
    const end = start + a + d + hold + r;
    param.exponentialRampToValueAtTime(FLOOR, end);
    param.setValueAtTime(0, end + 0.001);
    return end;
  }

  private filterFor(f: FilterSpec, start: number, dur: number): BiquadFilterNode {
    const node = this.track(this.e.ctx.createBiquadFilter());
    node.type = f.type;
    node.Q.value = f.q ?? 0.8;
    const f0 = f.freq * this.pitch;
    node.frequency.setValueAtTime(f0, start);
    if (f.freqEnd) node.frequency.exponentialRampToValueAtTime(Math.max(20, f.freqEnd * this.pitch), start + (f.sweep ?? dur));
    if (f.lfo) this.lfo(node.frequency, f.lfo.rate, f.lfo.depth, start, start + dur);
    return node;
  }

  private lfo(target: AudioParam, rate: number, depth: number, start: number, end: number) {
    const osc = this.track(this.e.ctx.createOscillator());
    const amount = this.track(this.e.ctx.createGain());
    osc.frequency.value = rate;
    amount.gain.value = depth;
    osc.connect(amount);
    amount.connect(target);
    this.watch(osc);
    osc.start(start);
    osc.stop(end + 0.03);
  }

  private route(chain: AudioNode, start: number, dur: number, pan: number | undefined, send: number | undefined, panLfo?: { rate: number; depth: number }) {
    let last: AudioNode = chain;
    const ctx = this.e.ctx;
    if ((pan !== undefined || panLfo) && typeof ctx.createStereoPanner === "function") {
      const p = this.track(ctx.createStereoPanner());
      p.pan.value = pan ?? 0;
      if (panLfo) this.lfo(p.pan, panLfo.rate, panLfo.depth, start, start + dur);
      last.connect(p);
      last = p;
    }
    last.connect(this.out);
    if (send) {
      const s = this.track(ctx.createGain());
      s.gain.value = send;
      last.connect(s);
      s.connect(this.e.reverb);
    }
  }

  private watch(source: AudioScheduledSourceNode) {
    this.sources++;
    source.onended = () => {
      this.ended++;
      if (this.ended >= this.sources) this.dispose();
    };
  }

  private extend(end: number) {
    this.endAt = Math.max(this.endAt, end);
    // Filet de sécurité si `onended` ne vient jamais (onglet gelé, contexte fermé).
    if (this.timer) clearTimeout(this.timer);
    const ms = Math.max(0, (this.endAt - this.e.ctx.currentTime) * 1000) + 600;
    this.timer = setTimeout(() => this.dispose(), ms);
  }

  tone(s: ToneSpec): this {
    const ctx = this.e.ctx;
    const start = this.t0 + (s.at ?? 0);
    const osc = this.track(ctx.createOscillator());
    osc.type = s.type ?? "sine";
    osc.frequency.setValueAtTime(s.freq * this.pitch, start);
    const amp = this.track(ctx.createGain());
    const end = this.envelope(amp.gain, start, s.gain ?? 0.5, s);
    const dur = end - start;
    if (s.freqEnd) osc.frequency.exponentialRampToValueAtTime(Math.max(20, s.freqEnd * this.pitch), start + (s.glide ?? dur));
    if (s.detune) osc.detune.value = s.detune;
    if (s.vibrato) this.lfo(osc.frequency, s.vibrato.rate, s.vibrato.depth * this.pitch, start, end);
    if (s.tremolo) {
      // Le gain de l'enveloppe est piloté par un second gain modulé : amplitude = 1 - depth/2 + depth/2 * lfo.
      const trem = this.track(ctx.createGain());
      trem.gain.value = 1 - s.tremolo.depth / 2;
      this.lfo(trem.gain, s.tremolo.rate, s.tremolo.depth / 2, start, end);
      amp.connect(trem);
      this.chain(osc, s.filter, start, dur, amp, trem, s);
    } else {
      this.chain(osc, s.filter, start, dur, amp, amp, s);
    }
    this.watch(osc);
    osc.start(start);
    osc.stop(end + 0.03);
    this.extend(end + 0.03);
    return this;
  }

  private chain(src: AudioNode, f: FilterSpec | undefined, start: number, dur: number, amp: GainNode, tail: AudioNode, s: { pan?: number; send?: number; panLfo?: { rate: number; depth: number } }) {
    if (f) {
      const filter = this.filterFor(f, start, dur);
      src.connect(filter);
      filter.connect(amp);
    } else {
      src.connect(amp);
    }
    this.route(tail, start, dur, s.pan, s.send, s.panLfo);
  }

  noise(s: NoiseSpec): this {
    const ctx = this.e.ctx;
    const start = this.t0 + (s.at ?? 0);
    const src = this.track(ctx.createBufferSource());
    src.buffer = this.e.noise;
    src.loop = true;
    const amp = this.track(ctx.createGain());
    const end = this.envelope(amp.gain, start, s.gain ?? 0.5, s);
    this.chain(src, s.filter, start, end - start, amp, amp, s);
    this.watch(src);
    src.start(start, Math.random() * 0.5);
    src.stop(end + 0.03);
    this.extend(end + 0.03);
    return this;
  }

  /** Coupe la voix en douceur (vol de voix). */
  fadeOut(seconds = 0.02) {
    if (this.disposed) return;
    const now = this.e.ctx.currentTime;
    try {
      this.out.gain.cancelScheduledValues(now);
      this.out.gain.setValueAtTime(this.out.gain.value, now);
      this.out.gain.linearRampToValueAtTime(0, now + seconds);
    } catch {
      // paramètre déjà libéré
    }
    if (this.timer) clearTimeout(this.timer);
    this.timer = setTimeout(() => this.dispose(), seconds * 1000 + 30);
  }

  dispose() {
    if (this.disposed) return;
    this.disposed = true;
    if (this.timer) clearTimeout(this.timer);
    this.timer = null;
    for (const n of this.nodes) {
      try {
        n.disconnect();
      } catch {
        // déjà déconnecté
      }
    }
    this.nodes = [];
    this.onDone(this);
  }

  get isDisposed() {
    return this.disposed;
  }
}

/** Fréquence d'une note MIDI (69 = La4 = 440 Hz). */
export const midi = (n: number) => 440 * Math.pow(2, (n - 69) / 12);
