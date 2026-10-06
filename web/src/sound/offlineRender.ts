// Rendu hors ligne minimal (Node, sans navigateur) du sous-ensemble de Web Audio utilisé par synth.ts :
// oscillateurs, bruit en boucle, gains, filtres biquad, panoramique, convolution et écrêteur (WaveShaper).
// Sert aux tests (niveau crête/RMS, empreintes des sons) ; l'appli n'importe jamais ce fichier.
// Approximation (oscillateurs non bande-limités) : les niveaux ont été recoupés avec un vrai OfflineAudioContext de Chrome.
import { createEngine, Voice } from "./synth";

export const RATE = 44100;
type Stereo = [Float32Array, Float32Array];

type AutoEvent = { kind: "set" | "lin" | "exp"; t: number; v: number };

class Param {
  value: number;
  events: AutoEvent[] = [];
  srcs: Node[] = [];
  constructor(v: number, private readonly n: number) {
    this.value = v;
  }
  private add(e: AutoEvent) {
    // Insertion stable par temps.
    let i = this.events.length;
    while (i > 0 && this.events[i - 1].t > e.t) i--;
    this.events.splice(i, 0, e);
  }
  setValueAtTime(v: number, t: number) {
    this.add({ kind: "set", t, v });
    return this;
  }
  linearRampToValueAtTime(v: number, t: number) {
    this.add({ kind: "lin", t, v });
    return this;
  }
  exponentialRampToValueAtTime(v: number, t: number) {
    this.add({ kind: "exp", t, v });
    return this;
  }
  setTargetAtTime() {
    return this;
  }
  cancelScheduledValues() {
    this.events = [];
    return this;
  }
  /** Valeur échantillon par échantillon (automation + signaux connectés). */
  array(): Float32Array {
    const out = new Float32Array(this.n);
    const ev = this.events;
    if (!ev.length) out.fill(this.value);
    else {
      let i0 = 0;
      const first = Math.min(this.n, Math.max(0, Math.round(ev[0].t * RATE)));
      out.fill(this.value, 0, first);
      i0 = first;
      for (let k = 0; k < ev.length; k++) {
        const a = ev[k];
        const b = ev[k + 1];
        const s = Math.max(i0, Math.round(a.t * RATE));
        const e = b ? Math.min(this.n, Math.round(b.t * RATE)) : this.n;
        if (e <= s) continue;
        if (b && b.kind !== "set" && b.t > a.t) {
          const ratio = a.v > 0 && b.v > 0 && b.kind === "exp";
          for (let i = s; i < e; i++) {
            const x = (i - s) / (b.t * RATE - a.t * RATE);
            out[i] = ratio ? a.v * Math.pow(b.v / a.v, x) : a.v + (b.v - a.v) * x;
          }
        } else out.fill(a.v, s, e);
        i0 = e;
      }
    }
    for (const s of this.srcs) {
      const sig = s.render()[0];
      for (let i = 0; i < this.n; i++) out[i] += sig[i];
    }
    return out;
  }
}

abstract class Node {
  srcs: Node[] = [];
  private cache: Stereo | null = null;
  constructor(protected readonly n: number) {}
  connect(dest: Node | Param) {
    dest.srcs.push(this);
    return dest;
  }
  disconnect() {}
  abstract compute(input: Stereo): Stereo;
  render(): Stereo {
    if (this.cache) return this.cache;
    const inp: Stereo = [new Float32Array(this.n), new Float32Array(this.n)];
    for (const s of this.srcs) {
      const o = s.render();
      for (let i = 0; i < this.n; i++) {
        inp[0][i] += o[0][i];
        inp[1][i] += o[1][i];
      }
    }
    this.cache = this.compute(inp);
    return this.cache;
  }
}

class Source extends Node {
  onended: (() => void) | null = null;
  startT = Infinity;
  stopT = Infinity;
  start(t = 0) {
    this.startT = t;
  }
  stop(t = 0) {
    this.stopT = t;
  }
  compute(): Stereo {
    return [new Float32Array(this.n), new Float32Array(this.n)];
  }
}

class Osc extends Source {
  type: OscillatorType = "sine";
  frequency: Param;
  detune: Param;
  constructor(n: number) {
    super(n);
    this.frequency = new Param(440, n);
    this.detune = new Param(0, n);
  }
  compute(): Stereo {
    const out = new Float32Array(this.n);
    const f = this.frequency.array();
    const d = this.detune.array();
    const s = Math.max(0, Math.round(this.startT * RATE));
    const e = Math.min(this.n, Math.round(this.stopT * RATE));
    let ph = 0;
    for (let i = s; i < e; i++) {
      ph += (f[i] * Math.pow(2, d[i] / 1200)) / RATE;
      ph -= Math.floor(ph);
      switch (this.type) {
        case "square":
          out[i] = ph < 0.5 ? 1 : -1;
          break;
        case "sawtooth":
          out[i] = ph < 0.5 ? 2 * ph : 2 * ph - 2; // part de 0 comme Web Audio (sinon opposition de phase avec le triangle)
          break;
        case "triangle":
          out[i] = ph < 0.25 ? 4 * ph : ph < 0.75 ? 2 - 4 * ph : 4 * ph - 4;
          break;
        default:
          out[i] = Math.sin(2 * Math.PI * ph);
      }
    }
    return [out, out];
  }
}

class BufSrc extends Source {
  buffer: FakeBuffer | null = null;
  loop = false;
  offset = 0;
  override start(t = 0, offset = 0) {
    this.startT = t;
    this.offset = offset;
  }
  compute(): Stereo {
    const out = new Float32Array(this.n);
    const data = this.buffer?.getChannelData(0);
    if (data) {
      const s = Math.max(0, Math.round(this.startT * RATE));
      const e = Math.min(this.n, Math.round(this.stopT * RATE));
      let p = Math.floor(this.offset * RATE) % data.length;
      for (let i = s; i < e; i++) {
        out[i] = data[p];
        p++;
        if (p >= data.length) p = this.loop ? 0 : data.length - 1;
      }
    }
    return [out, out];
  }
}

class GainN extends Node {
  gain: Param;
  constructor(n: number) {
    super(n);
    this.gain = new Param(1, n);
  }
  compute(inp: Stereo): Stereo {
    const g = this.gain.array();
    const l = new Float32Array(this.n);
    const r = new Float32Array(this.n);
    for (let i = 0; i < this.n; i++) {
      l[i] = inp[0][i] * g[i];
      r[i] = inp[1][i] * g[i];
    }
    return [l, r];
  }
}

class Biquad extends Node {
  type: BiquadFilterType = "lowpass";
  frequency: Param;
  Q: Param;
  gain: Param;
  constructor(n: number) {
    super(n);
    this.frequency = new Param(350, n);
    this.Q = new Param(1, n);
    this.gain = new Param(0, n);
  }
  compute(inp: Stereo): Stereo {
    const freq = this.frequency.array();
    const q = this.Q.array();
    const out: Stereo = [new Float32Array(this.n), new Float32Array(this.n)];
    for (let c = 0; c < 2; c++) {
      let x1 = 0, x2 = 0, y1 = 0, y2 = 0;
      let b0 = 1, b1 = 0, b2 = 0, a1 = 0, a2 = 0;
      for (let i = 0; i < this.n; i++) {
        if (i % 16 === 0) {
          const f = Math.min(RATE * 0.49, Math.max(10, freq[i]));
          const w0 = (2 * Math.PI * f) / RATE;
          const cos = Math.cos(w0);
          const sin = Math.sin(w0);
          let a0: number;
          if (this.type === "bandpass") {
            const alpha = sin / (2 * Math.max(0.0001, q[i]));
            a0 = 1 + alpha;
            b0 = alpha / a0;
            b1 = 0;
            b2 = -alpha / a0;
            a1 = (-2 * cos) / a0;
            a2 = (1 - alpha) / a0;
          } else {
            // lowpass / highpass : Q en dB (comme Web Audio)
            const alpha = sin / (2 * Math.pow(10, q[i] / 20));
            a0 = 1 + alpha;
            if (this.type === "highpass") {
              b0 = (1 + cos) / 2 / a0;
              b1 = -(1 + cos) / a0;
              b2 = b0;
            } else {
              b0 = (1 - cos) / 2 / a0;
              b1 = (1 - cos) / a0;
              b2 = b0;
            }
            a1 = (-2 * cos) / a0;
            a2 = (1 - alpha) / a0;
          }
        }
        const x = inp[c][i];
        const y = b0 * x + b1 * x1 + b2 * x2 - a1 * y1 - a2 * y2;
        x2 = x1;
        x1 = x;
        y2 = y1;
        y1 = y;
        out[c][i] = y;
      }
    }
    return out;
  }
}

class Panner extends Node {
  pan: Param;
  constructor(n: number) {
    super(n);
    this.pan = new Param(0, n);
  }
  compute(inp: Stereo): Stereo {
    const p = this.pan.array();
    const l = new Float32Array(this.n);
    const r = new Float32Array(this.n);
    for (let i = 0; i < this.n; i++) {
      const x = (Math.min(1, Math.max(-1, p[i])) + 1) / 2;
      const m = (inp[0][i] + inp[1][i]) / 2;
      l[i] = m * Math.cos((x * Math.PI) / 2);
      r[i] = m * Math.sin((x * Math.PI) / 2);
    }
    return [l, r];
  }
}

function fft(re: Float64Array, im: Float64Array, inverse = false) {
  const n = re.length;
  for (let i = 1, j = 0; i < n; i++) {
    let bit = n >> 1;
    for (; j & bit; bit >>= 1) j ^= bit;
    j ^= bit;
    if (i < j) {
      [re[i], re[j]] = [re[j], re[i]];
      [im[i], im[j]] = [im[j], im[i]];
    }
  }
  for (let len = 2; len <= n; len <<= 1) {
    const ang = ((inverse ? 2 : -2) * Math.PI) / len;
    const wr = Math.cos(ang);
    const wi = Math.sin(ang);
    for (let i = 0; i < n; i += len) {
      let cr = 1;
      let ci = 0;
      for (let k = 0; k < len / 2; k++) {
        const a = i + k;
        const b = a + len / 2;
        const xr = re[b] * cr - im[b] * ci;
        const xi = re[b] * ci + im[b] * cr;
        re[b] = re[a] - xr;
        im[b] = im[a] - xi;
        re[a] += xr;
        im[a] += xi;
        const t = cr * wr - ci * wi;
        ci = cr * wi + ci * wr;
        cr = t;
      }
    }
  }
  if (inverse) for (let i = 0; i < n; i++) { re[i] /= n; im[i] /= n; }
}

class Convolver extends Node {
  buffer: FakeBuffer | null = null;
  compute(inp: Stereo): Stereo {
    const ir = this.buffer;
    const out: Stereo = [new Float32Array(this.n), new Float32Array(this.n)];
    if (!ir) return out;
    // Normalisation de Chrome (Reverb.cpp) : puissance RMS de la réponse, calibration 0,00125.
    let sum = 0;
    for (let c = 0; c < ir.numberOfChannels; c++) for (const v of ir.getChannelData(c)) sum += v * v;
    const power = Math.max(0.000125, Math.sqrt(sum / (ir.numberOfChannels * ir.length)));
    const scale = (0.00125 / power) * (44100 / RATE);
    let size = 1;
    while (size < this.n + ir.length) size <<= 1;
    const mr = new Float64Array(size);
    const mi = new Float64Array(size);
    for (let i = 0; i < this.n; i++) mr[i] = (inp[0][i] + inp[1][i]) / 2;
    fft(mr, mi);
    for (let c = 0; c < 2; c++) {
      const h = ir.getChannelData(Math.min(c, ir.numberOfChannels - 1));
      const hr = new Float64Array(size);
      const hi = new Float64Array(size);
      for (let i = 0; i < h.length; i++) hr[i] = h[i] * scale;
      fft(hr, hi);
      for (let i = 0; i < size; i++) {
        const re = mr[i] * hr[i] - mi[i] * hi[i];
        const im = mr[i] * hi[i] + mi[i] * hr[i];
        hr[i] = re;
        hi[i] = im;
      }
      fft(hr, hi, true);
      for (let i = 0; i < this.n; i++) out[c][i] = hr[i];
    }
    return out;
  }
}

/** Écrêteur : applique la courbe (interpolation linéaire, entrée -1..1 sur toute la courbe, plate au-delà). */
class Shaper extends Node {
  curve: Float32Array | null = null;
  oversample = "none";
  compute(inp: Stereo): Stereo {
    const c = this.curve;
    if (!c) return inp;
    const out: Stereo = [new Float32Array(this.n), new Float32Array(this.n)];
    const last = c.length - 1;
    for (let ch = 0; ch < 2; ch++) {
      for (let i = 0; i < this.n; i++) {
        const x = Math.min(1, Math.max(-1, inp[ch][i]));
        const p = ((x + 1) / 2) * last;
        const k = Math.min(last - 1, Math.floor(p));
        out[ch][i] = c[k] + (c[k + 1] - c[k]) * (p - k);
      }
    }
    return out;
  }
}

class Destination extends Node {
  compute(inp: Stereo): Stereo {
    return inp;
  }
}

class FakeBuffer {
  private data: Float32Array[];
  constructor(readonly numberOfChannels: number, readonly length: number, readonly sampleRate: number) {
    this.data = Array.from({ length: numberOfChannels }, () => new Float32Array(length));
  }
  getChannelData(c: number) {
    return this.data[c];
  }
}

export class OfflineCtx {
  readonly sampleRate = RATE;
  currentTime = 0;
  state = "running";
  readonly destination: Destination;
  constructor(readonly n: number) {
    this.destination = new Destination(n);
  }
  createGain() {
    return new GainN(this.n);
  }
  createOscillator() {
    return new Osc(this.n);
  }
  createBufferSource() {
    return new BufSrc(this.n);
  }
  createBiquadFilter() {
    return new Biquad(this.n);
  }
  createStereoPanner() {
    return new Panner(this.n);
  }
  createConvolver() {
    return new Convolver(this.n);
  }
  createWaveShaper() {
    return new Shaper(this.n);
  }
  createBuffer(channels: number, length: number, rate: number) {
    return new FakeBuffer(channels, length, rate);
  }
}

export interface Rendered {
  /** Mélange mono (moyenne G/D). */
  mono: Float32Array;
  left: Float32Array;
  right: Float32Array;
}

/** Joue une recette dans un contexte hors ligne et renvoie le signal de sortie (chaîne complète : bus, compresseur, volume général). */
export function renderRecipe(recipe: (v: Voice) => void, o: { master?: number; volume?: number; seconds?: number; pitch?: number } = {}): Rendered {
  const n = Math.round(RATE * (o.seconds ?? 2.8));
  const ctx = new OfflineCtx(n);
  const engine = createEngine(ctx as unknown as AudioContext, o.master ?? 1);
  const voice = new Voice(engine, 0.006, o.pitch ?? 1, o.volume ?? 1, () => {});
  recipe(voice);
  const [left, right] = ctx.destination.render();
  voice.dispose();
  const mono = new Float32Array(n);
  for (let i = 0; i < n; i++) mono[i] = (left[i] + right[i]) / 2;
  return { mono, left, right };
}

// ---- mesures ---------------------------------------------------------------------------------

export function peakOf(r: Rendered): number {
  let p = 0;
  for (let i = 0; i < r.left.length; i++) p = Math.max(p, Math.abs(r.left[i]), Math.abs(r.right[i]));
  return p;
}

/** Fin audible : dernier instant où l'enveloppe (fenêtres de 20 ms) dépasse `-40 dB` sous le pic des fenêtres. */
export function activeLength(mono: Float32Array, floorDb = -40): number {
  const w = Math.round(RATE * 0.02);
  const rms: number[] = [];
  for (let a = 0; a + w <= mono.length; a += w) {
    let s = 0;
    for (let i = a; i < a + w; i++) s += mono[i] * mono[i];
    rms.push(Math.sqrt(s / w));
  }
  const max = Math.max(...rms, 1e-9);
  let last = 0;
  rms.forEach((v, i) => {
    if (v > max * Math.pow(10, floorDb / 20)) last = i + 1;
  });
  return (last * w) / RATE;
}

export function rmsOf(mono: Float32Array, seconds: number): number {
  const end = Math.min(mono.length, Math.max(1, Math.round(seconds * RATE)));
  let s = 0;
  for (let i = 0; i < end; i++) s += mono[i] * mono[i];
  return Math.sqrt(s / end);
}

/** RMS de la fenêtre de 100 ms la plus forte (« niveau perçu » maximal). */
export function loudestRms(mono: Float32Array, windowSeconds = 0.1): number {
  const w = Math.round(RATE * windowSeconds);
  let best = 0;
  for (let a = 0; a + w <= mono.length; a += w >> 1) {
    let s = 0;
    for (let i = a; i < a + w; i++) s += mono[i] * mono[i];
    best = Math.max(best, Math.sqrt(s / w));
  }
  return best;
}

/** Centroïde spectral d'une fenêtre (Hz). */
export function centroidOf(x: Float32Array, from: number, size = 2048): number {
  const re = new Float64Array(size);
  const im = new Float64Array(size);
  for (let i = 0; i < size; i++) re[i] = (x[from + i] ?? 0) * (0.5 - 0.5 * Math.cos((2 * Math.PI * i) / size));
  fft(re, im);
  let num = 0;
  let den = 0;
  for (let k = 1; k < size / 2; k++) {
    const m = Math.hypot(re[k], im[k]);
    num += m * ((k * RATE) / size);
    den += m;
  }
  return den > 1e-9 ? num / den : 0;
}

/**
 * Empreinte d'un son : pour chaque fenêtre de 100 ms sur 1,8 s, niveau (dB re pic, borné à -60, / 12) et
 * centroïde spectral (octaves au-dessus de 100 Hz, / 1), plus la durée audible. Deux sons qui se distinguent
 * à l'oreille (timbre, contour, rythme, durée) ont une grande distance entre empreintes.
 */
export function fingerprint(r: Rendered, windows = 18): number[] {
  const w = Math.round(RATE * 0.1);
  const peak = Math.max(1e-9, peakOf(r));
  const fp: number[] = [];
  for (let k = 0; k < windows; k++) {
    const a = k * w;
    let s = 0;
    for (let i = a; i < a + w; i++) s += r.mono[i] * r.mono[i];
    const db = 20 * Math.log10(Math.max(1e-9, Math.sqrt(s / w)) / peak);
    const level = Math.max(-60, db);
    const cen = level > -45 ? Math.log2(Math.max(100, centroidOf(r.mono, a, 4096)) / 100) : 0;
    fp.push(level / 12, level > -45 ? cen : 0);
  }
  fp.push(activeLength(r.mono) * 1.5);
  return fp;
}

export function distance(a: number[], b: number[]): number {
  let s = 0;
  for (let i = 0; i < a.length; i++) s += (a[i] - b[i]) ** 2;
  return Math.sqrt(s / a.length) * 4;
}

export { Voice };
