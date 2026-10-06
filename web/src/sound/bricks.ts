// Briques sonores réutilisables par les recettes (basiques et compétences) : construites sur `Voice`.
import type { Voice } from "./synth";

/** Pseudo-aléa déterministe (0..1) : les « étincelles » sonnent pareil à chaque lecture. */
export const rnd = (i: number) => {
  const x = Math.sin(i * 127.1 + 311.7) * 43758.5453;
  return x - Math.floor(x);
};

/** « Tock » de bois : claquement de bruit passe-bande + corps sinusoïdal grave et bref. */
export function thock(v: Voice, o: { at?: number; body?: number; click?: number; gain?: number; dull?: number; pan?: number }) {
  const at = o.at ?? 0;
  const body = o.body ?? 190;
  const g = o.gain ?? 0.8;
  v.noise({ at, gain: g * 0.7, attack: 0.001, decay: 0.03, release: 0.02, pan: o.pan, filter: { type: "bandpass", freq: o.click ?? 1900, q: 1.3 } });
  v.tone({ at, freq: body, freqEnd: body * 0.58, glide: 0.07, gain: g, attack: 0.001, decay: 0.09, release: 0.04, pan: o.pan });
  v.tone({
    at, type: "triangle", freq: body * 2.9, freqEnd: body * 2.4, glide: 0.04, gain: g * 0.22, attack: 0.001, decay: 0.045, release: 0.02, pan: o.pan,
    filter: { type: "lowpass", freq: o.dull ?? 2600 },
  });
}

/** Cloche douce : fondamentale + partiels légèrement inharmoniques. */
export function bell(v: Voice, f: number, at: number, g: number, o: { decay?: number; send?: number; pan?: number } = {}) {
  const decay = o.decay ?? 0.5;
  const send = o.send ?? 0.35;
  v.tone({ freq: f, at, gain: g, attack: 0.003, decay, release: 0.06, send, pan: o.pan });
  v.tone({ freq: f * 2.01, at, gain: g * 0.28, attack: 0.002, decay: decay * 0.5, release: 0.04, send, pan: o.pan });
  v.tone({ freq: f * 3.99, at, gain: g * 0.1, attack: 0.002, decay: decay * 0.25, release: 0.03, send, pan: o.pan });
}

/** Cloche FM (porteuse modulée en fréquence) : timbre métallique, creux ou clair selon le rapport et l'indice. */
export function fmBell(v: Voice, f: number, at: number, g: number, o: { ratio?: number; index?: number; decay?: number; send?: number; pan?: number; attack?: number } = {}) {
  const mod = f * (o.ratio ?? 1.4);
  v.tone({
    freq: f, at, gain: g, attack: o.attack ?? 0.002, decay: o.decay ?? 0.5, release: 0.05, send: o.send ?? 0.35, pan: o.pan,
    vibrato: { rate: mod, depth: mod * (o.index ?? 2) },
  });
}

/** Note pincée : triangle dont le filtre se referme. */
export function pluck(v: Voice, f: number, at: number, g: number, send = 0.25, pan?: number) {
  v.tone({
    type: "triangle", freq: f, at, gain: g, attack: 0.002, decay: 0.22, release: 0.05, send, pan,
    filter: { type: "lowpass", freq: f * 7, freqEnd: f * 1.6, sweep: 0.2 },
  });
}

/** Partiels de cristal (rapports inharmoniques d'une barre métallique). */
export function crystal(v: Voice, f: number, at: number, g: number, decay = 0.55, pan?: number) {
  const ratios = [1, 2.76, 5.4, 8.93];
  const gains = [1, 0.5, 0.28, 0.14];
  const decays = [1, 0.62, 0.4, 0.26];
  ratios.forEach((r, i) => {
    if (f * r < 14000) v.tone({ freq: f * r, at, gain: g * gains[i], attack: 0.002, decay: decay * decays[i], release: 0.04, send: 0.5, pan });
  });
}

/** Souffle de bruit filtré dont la bande balaye `from` -> `to`. */
export const sweepNoise = (v: Voice, from: number, to: number, o: { at?: number; dur: number; gain: number; q?: number; attack?: number; pan?: number; send?: number }) =>
  v.noise({
    at: o.at, gain: o.gain, attack: o.attack ?? o.dur * 0.35, decay: o.dur * 0.65, release: 0.06, pan: o.pan,
    filter: { type: "bandpass", freq: from, freqEnd: to, sweep: o.dur, q: o.q ?? 2 },
    send: o.send ?? 0.2,
  });

/** Petites étincelles aiguës dispersées dans le temps et dans l'espace stéréo. */
export function sparkle(v: Voice, o: { at: number; count: number; gap: number; f0: number; spread: number; gain: number; decay?: number; seed?: number }) {
  for (let i = 0; i < o.count; i++) {
    const r = rnd(i + (o.seed ?? 0));
    v.tone({
      freq: o.f0 + r * o.spread, at: o.at + i * o.gap, gain: o.gain * (1 - i / (o.count * 1.6)), attack: 0.002, decay: o.decay ?? 0.14, release: 0.03,
      send: 0.5, pan: rnd(i + 40 + (o.seed ?? 0)) * 1.4 - 0.7,
    });
  }
}

/** Grave résonant, comme un bol ou un bouclier qui sonne. */
export function defenseBase(v: Voice, o: { at?: number; root?: number; gain?: number } = {}) {
  const at = o.at ?? 0;
  const root = o.root ?? 110;
  const g = o.gain ?? 1;
  v.tone({ at, freq: root, gain: 0.5 * g, attack: 0.012, decay: 0.55, release: 0.1, send: 0.3 });
  v.tone({ at, freq: root * 2, gain: 0.22 * g, attack: 0.01, decay: 0.4, release: 0.08, send: 0.3 });
  v.noise({ at, gain: 0.22 * g, attack: 0.01, decay: 0.45, release: 0.08, filter: { type: "bandpass", freq: root * 6, q: 12 }, send: 0.3 });
}
