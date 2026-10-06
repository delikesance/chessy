// Palette sonore : une « recette » par son, construite avec les briques de synth.ts.
// Familles de compétences : attaque (percussif, agressif), défense (résonant, grave), mobilité (balayage, souffle),
// contrôle (cristallin, dissonant), création (montant, scintillant) ; chaque compétence ajoute sa signature.
import type { SkillId } from "../protocol";
import type { SfxName } from "./names";
import { midi, type Voice } from "./synth";

export type Recipe = (v: Voice) => void;

// ---- briques réutilisables ------------------------------------------------------------------

/** « Tock » de bois : claquement de bruit passe-bande + corps sinusoïdal grave et bref. */
function thock(v: Voice, o: { at?: number; body?: number; click?: number; gain?: number; dull?: number }) {
  const at = o.at ?? 0;
  const body = o.body ?? 190;
  const g = o.gain ?? 0.8;
  v.noise({ at, gain: g * 0.7, attack: 0.001, decay: 0.03, release: 0.02, filter: { type: "bandpass", freq: o.click ?? 1900, q: 1.3 } });
  v.tone({ at, freq: body, freqEnd: body * 0.58, glide: 0.07, gain: g, attack: 0.001, decay: 0.09, release: 0.04 });
  v.tone({
    at, type: "triangle", freq: body * 2.9, freqEnd: body * 2.4, glide: 0.04, gain: g * 0.22, attack: 0.001, decay: 0.045, release: 0.02,
    filter: { type: "lowpass", freq: o.dull ?? 2600 },
  });
}

/** Cloche douce : fondamentale + partiels légèrement inharmoniques. */
function bell(v: Voice, f: number, at: number, g: number, o: { decay?: number; send?: number } = {}) {
  const decay = o.decay ?? 0.5;
  const send = o.send ?? 0.35;
  v.tone({ freq: f, at, gain: g, attack: 0.003, decay, release: 0.06, send });
  v.tone({ freq: f * 2.01, at, gain: g * 0.28, attack: 0.002, decay: decay * 0.5, release: 0.04, send });
  v.tone({ freq: f * 3.99, at, gain: g * 0.1, attack: 0.002, decay: decay * 0.25, release: 0.03, send });
}

/** Note pincée : triangle dont le filtre se referme. */
function pluck(v: Voice, f: number, at: number, g: number, send = 0.25) {
  v.tone({
    type: "triangle", freq: f, at, gain: g, attack: 0.002, decay: 0.22, release: 0.05, send,
    filter: { type: "lowpass", freq: f * 7, freqEnd: f * 1.6, sweep: 0.2 },
  });
}

/** Partiels de cristal (rapports inharmoniques d'une barre métallique). */
function crystal(v: Voice, f: number, at: number, g: number, decay = 0.55) {
  const ratios = [1, 2.76, 5.4, 8.93];
  const gains = [1, 0.5, 0.28, 0.14];
  const decays = [1, 0.62, 0.4, 0.26];
  ratios.forEach((r, i) => {
    if (f * r < 14000) v.tone({ freq: f * r, at, gain: g * gains[i], attack: 0.002, decay: decay * decays[i], release: 0.04, send: 0.5 });
  });
}

const sweepNoise = (v: Voice, from: number, to: number, o: { at?: number; dur: number; gain: number; q?: number; attack?: number; pan?: number }) =>
  v.noise({
    at: o.at, gain: o.gain, attack: o.attack ?? o.dur * 0.35, decay: o.dur * 0.65, release: 0.06, pan: o.pan,
    filter: { type: "bandpass", freq: from, freqEnd: to, sweep: o.dur, q: o.q ?? 2 },
    send: 0.2,
  });

// ---- bases de famille -----------------------------------------------------------------------

/** Attaque : impact percussif et mordant (claquement, thump grave, éclat de dent de scie). */
function attackBase(v: Voice, o: { at?: number; weight?: number } = {}) {
  const at = o.at ?? 0;
  const w = o.weight ?? 1;
  v.noise({ at, gain: 0.5 * w, attack: 0.001, decay: 0.06, release: 0.03, filter: { type: "bandpass", freq: 1500, q: 1 } });
  v.tone({ at, freq: 100, freqEnd: 48, glide: 0.15, gain: 0.75 * w, attack: 0.001, decay: 0.17, release: 0.05 });
  v.tone({ at, type: "sawtooth", freq: 150, gain: 0.2 * w, attack: 0.002, decay: 0.12, release: 0.04, filter: { type: "lowpass", freq: 1000, freqEnd: 300, sweep: 0.12 } });
}

/** Défense : grave résonant, comme un bol ou un bouclier qui sonne. */
function defenseBase(v: Voice, o: { at?: number; root?: number; gain?: number } = {}) {
  const at = o.at ?? 0;
  const root = o.root ?? 110;
  const g = o.gain ?? 1;
  v.tone({ at, freq: root, gain: 0.5 * g, attack: 0.012, decay: 0.55, release: 0.1, send: 0.3 });
  v.tone({ at, freq: root * 2, gain: 0.22 * g, attack: 0.01, decay: 0.4, release: 0.08, send: 0.3 });
  v.noise({ at, gain: 0.22 * g, attack: 0.01, decay: 0.45, release: 0.08, filter: { type: "bandpass", freq: root * 6, q: 12 }, send: 0.3 });
}

/** Mobilité : balayage de souffle, vers le haut ou le bas. */
function mobilityBase(v: Voice, o: { at?: number; up?: boolean; gain?: number; dur?: number } = {}) {
  const up = o.up ?? true;
  const dur = o.dur ?? 0.28;
  sweepNoise(v, up ? 400 : 3600, up ? 3600 : 400, { at: o.at, dur, gain: 0.26 * (o.gain ?? 1) });
  v.tone({ at: o.at, freq: up ? 320 : 960, freqEnd: up ? 960 : 320, gain: 0.14 * (o.gain ?? 1), attack: 0.03, decay: dur, release: 0.05, send: 0.25 });
}

/** Contrôle : cristal clair et paire dissonante (seconde mineure) qui bat. */
function controlBase(v: Voice, o: { at?: number; f?: number; gain?: number } = {}) {
  const at = o.at ?? 0;
  const f = o.f ?? 1300;
  const g = o.gain ?? 1;
  crystal(v, f, at, 0.2 * g);
  v.tone({ at, type: "triangle", freq: 466, gain: 0.1 * g, attack: 0.01, decay: 0.3, release: 0.06, filter: { type: "lowpass", freq: 1800 } });
  v.tone({ at, type: "triangle", freq: 494, gain: 0.1 * g, attack: 0.01, decay: 0.3, release: 0.06, filter: { type: "lowpass", freq: 1800 } });
}

/** Création : petites notes qui montent en étincelant (gamme pentatonique). */
function createBase(v: Voice, o: { at?: number; root?: number; gain?: number; steps?: number } = {}) {
  const at = o.at ?? 0;
  const root = o.root ?? 76;
  const g = o.gain ?? 1;
  const steps = [0, 2, 4, 7, 9, 12].slice(0, o.steps ?? 4);
  steps.forEach((s, i) => bell(v, midi(root + s), at + i * 0.055, 0.17 * g, { decay: 0.3, send: 0.45 }));
}

// ---- sons de base --------------------------------------------------------------------------

const BASE: Record<Exclude<SfxName, `skill_${SkillId}`>, Recipe> = {
  move: (v) => thock(v, { body: 190, click: 1900, gain: 0.85 }),
  capture: (v) => {
    thock(v, { body: 135, click: 1100, gain: 1, dull: 1800 });
    thock(v, { at: 0.065, body: 105, click: 800, gain: 0.7, dull: 1500 });
    v.tone({ freq: 70, freqEnd: 45, gain: 0.55, attack: 0.002, decay: 0.16, release: 0.05 });
  },
  castle: (v) => {
    thock(v, { body: 175, click: 1700, gain: 0.8 });
    thock(v, { at: 0.11, body: 215, click: 2100, gain: 0.85 });
  },
  check: (v) => {
    const note = (f: number, at: number) =>
      v.tone({ type: "triangle", freq: f, at, gain: 0.34, attack: 0.004, decay: 0.12, release: 0.04, send: 0.2, filter: { type: "lowpass", freq: 3200 } });
    note(midi(79), 0);
    note(midi(86), 0.1);
  },
  promote: (v) => {
    [72, 76, 79, 84, 88].forEach((n, i) => bell(v, midi(n), i * 0.065, 0.22, { decay: i === 4 ? 0.7 : 0.3, send: 0.45 }));
  },
  illegal: (v) => {
    v.tone({
      type: "sawtooth", freq: 170, freqEnd: 108, gain: 0.3, attack: 0.012, decay: 0.16, release: 0.05,
      filter: { type: "lowpass", freq: 620, q: 1.2 },
    });
    v.tone({ type: "square", freq: 85, freqEnd: 54, gain: 0.12, attack: 0.012, decay: 0.16, release: 0.05, filter: { type: "lowpass", freq: 300 } });
  },
  your_turn: (v) => {
    bell(v, midi(76), 0, 0.17, { decay: 0.4, send: 0.45 });
    bell(v, midi(81), 0.11, 0.17, { decay: 0.55, send: 0.5 });
  },
  game_start: (v) => {
    [60, 67, 72].forEach((n, i) => {
      v.tone({ type: "triangle", freq: midi(n), at: i * 0.11, gain: 0.3, attack: 0.006, decay: 0.3, release: 0.08, send: 0.35, filter: { type: "lowpass", freq: 2600 } });
    });
    bell(v, midi(84), 0.33, 0.16, { decay: 0.7, send: 0.5 });
    thock(v, { at: 0.34, body: 150, gain: 0.5 });
  },
  game_win: (v) => {
    const brass = (n: number, at: number, hold: number, g: number) => {
      v.tone({ type: "sawtooth", freq: midi(n), at, gain: g * 0.5, attack: 0.012, decay: 0.15, sustain: 0.55, hold, release: 0.25, send: 0.4, filter: { type: "lowpass", freq: 1300, freqEnd: 2600, sweep: 0.12, q: 0.7 } });
      v.tone({ type: "triangle", freq: midi(n), at, gain: g * 0.5, attack: 0.012, decay: 0.15, sustain: 0.6, hold, release: 0.25, send: 0.4 });
    };
    brass(72, 0, 0, 0.5);
    brass(76, 0.12, 0, 0.5);
    brass(79, 0.24, 0, 0.5);
    [72, 76, 79, 84].forEach((n) => brass(n, 0.4, 0.35, 0.34));
    bell(v, midi(91), 0.45, 0.14, { decay: 1.0, send: 0.6 });
  },
  game_lose: (v) => {
    [64, 62, 60, 57].forEach((n, i) => {
      v.tone({
        type: "triangle", freq: midi(n), at: i * 0.16, gain: 0.34, attack: 0.01, decay: i === 3 ? 0.9 : 0.28, release: 0.12, send: 0.4,
        filter: { type: "lowpass", freq: 1500, freqEnd: 700, sweep: 0.4 },
      });
    });
    v.tone({ freq: midi(45), at: 0.48, gain: 0.3, attack: 0.02, decay: 0.8, release: 0.2, send: 0.3 });
  },
  game_draw: (v) => {
    // Quinte à vide : ni majeure ni mineure.
    [midi(67), midi(74)].forEach((f) => v.tone({ freq: f, gain: 0.22, attack: 0.04, decay: 0.8, release: 0.2, send: 0.5 }));
    bell(v, midi(79), 0.12, 0.1, { decay: 0.6, send: 0.5 });
  },
  low_time: (v) => {
    v.tone({ freq: 1760, gain: 0.22, attack: 0.002, decay: 0.035, release: 0.02 });
    v.noise({ gain: 0.1, attack: 0.001, decay: 0.012, release: 0.01, filter: { type: "highpass", freq: 5000 } });
  },
  match_found: (v) => {
    sweepNoise(v, 500, 4000, { dur: 0.12, gain: 0.1 });
    v.tone({ freq: 440, freqEnd: 1320, glide: 0.1, gain: 0.12, attack: 0.01, decay: 0.1, release: 0.03 });
    bell(v, midi(81), 0.11, 0.2, { decay: 0.5, send: 0.5 });
    bell(v, midi(88), 0.22, 0.2, { decay: 0.7, send: 0.55 });
  },
  chat: (v) => {
    v.tone({ freq: 520, freqEnd: 800, glide: 0.06, gain: 0.3, attack: 0.004, decay: 0.09, release: 0.04, filter: { type: "lowpass", freq: 2400 } });
  },
  friend_request: (v) => {
    pluck(v, midi(79), 0, 0.3);
    pluck(v, midi(83), 0.09, 0.3);
    pluck(v, midi(86), 0.18, 0.28, 0.4);
  },
  challenge: (v) => {
    const stab = (n: number, at: number, hold: number) => {
      v.tone({ type: "triangle", freq: midi(n), at, gain: 0.3, attack: 0.008, decay: 0.12, sustain: 0.5, hold, release: 0.1, send: 0.3, filter: { type: "lowpass", freq: 1800 } });
      v.tone({ type: "square", freq: midi(n), at, gain: 0.07, attack: 0.008, decay: 0.12, sustain: 0.5, hold, release: 0.1, filter: { type: "lowpass", freq: 1200 } });
    };
    stab(67, 0, 0);
    stab(67, 0.12, 0);
    stab(74, 0.24, 0.12);
  },
  notice: (v) => {
    bell(v, midi(81), 0, 0.2, { decay: 0.35, send: 0.4 });
  },
  ui_click: (v) => {
    v.tone({ freq: 1250, freqEnd: 880, glide: 0.02, gain: 0.16, attack: 0.001, decay: 0.025, release: 0.015 });
    v.noise({ gain: 0.05, attack: 0.001, decay: 0.01, release: 0.008, filter: { type: "highpass", freq: 3500 } });
  },
  trap_sprung: (v) => {
    v.noise({ gain: 0.55, attack: 0.001, decay: 0.025, release: 0.02, filter: { type: "highpass", freq: 3500 } });
    v.tone({ type: "square", freq: 1200, freqEnd: 180, glide: 0.09, gain: 0.2, attack: 0.001, decay: 0.1, release: 0.03, filter: { type: "lowpass", freq: 3000 } });
    crystal(v, 620, 0.07, 0.22, 0.3);
  },
  shield: (v) => {
    defenseBase(v, { root: 165 });
    v.tone({ type: "triangle", freq: 440, gain: 0.22, attack: 0.03, decay: 0.5, release: 0.1, send: 0.5, filter: { type: "bandpass", freq: 440, q: 5 } });
    bell(v, 1320, 0.06, 0.1, { decay: 0.4 });
  },
  pushed: (v) => {
    v.tone({ freq: 90, freqEnd: 50, glide: 0.14, gain: 0.7, attack: 0.002, decay: 0.2, release: 0.05 });
    sweepNoise(v, 2400, 400, { at: 0.02, dur: 0.22, gain: 0.3, attack: 0.02 });
    crystal(v, 520, 0.03, 0.14, 0.35);
  },
  saved: (v) => {
    [60, 64, 67].forEach((n) => v.tone({ freq: midi(n), gain: 0.16, attack: 0.05, decay: 0.7, release: 0.15, send: 0.6, vibrato: { rate: 5, depth: 2 } }));
    bell(v, midi(96), 0.12, 0.1, { decay: 0.8, send: 0.6 });
    bell(v, midi(91), 0.2, 0.1, { decay: 0.8, send: 0.6 });
  },
  vanish: (v) => {
    // Grésillement qui s'effondre : petites notes carrées descendantes sous un filtre qui se ferme.
    for (let i = 0; i < 7; i++) {
      v.tone({
        type: "square", freq: 1800 - i * 190, at: i * 0.028, gain: 0.1, attack: 0.002, decay: 0.03, release: 0.01,
        filter: { type: "lowpass", freq: 3200 - i * 350 },
      });
    }
    sweepNoise(v, 6000, 500, { dur: 0.22, gain: 0.12, attack: 0.01 });
  },
};

// ---- les 27 compétences ---------------------------------------------------------------------

const SKILLS: Record<SkillId, Recipe> = {
  // Mobilité : balayage / souffle
  teleportation: (v) => {
    mobilityBase(v, { gain: 0.5, dur: 0.16 });
    v.tone({ freq: 300, freqEnd: 2600, glide: 0.13, gain: 0.3, attack: 0.005, decay: 0.14, release: 0.02, send: 0.2 });
    // « pop » d'arrivée
    v.tone({ at: 0.14, freq: 950, freqEnd: 190, glide: 0.05, gain: 0.5, attack: 0.001, decay: 0.07, release: 0.03 });
    v.noise({ at: 0.14, gain: 0.3, attack: 0.001, decay: 0.02, release: 0.01, filter: { type: "highpass", freq: 3000 } });
    bell(v, midi(91), 0.17, 0.08, { decay: 0.3 });
  },
  rollback: (v) => {
    // Rembobinage : le souffle gonfle à l'envers puis un tic ferme le mouvement.
    sweepNoise(v, 3800, 300, { dur: 0.3, gain: 0.26, attack: 0.02 });
    v.tone({ freq: 1800, freqEnd: 300, glide: 0.28, gain: 0.16, attack: 0.01, decay: 0.28, release: 0.03, vibrato: { rate: 24, depth: 40 } });
    thock(v, { at: 0.3, body: 240, click: 2400, gain: 0.45 });
  },
  destiny_swapper: (v) => {
    mobilityBase(v, { gain: 0.35, dur: 0.22 });
    v.tone({ freq: 400, freqEnd: 1300, glide: 0.26, gain: 0.22, attack: 0.02, decay: 0.28, release: 0.04, pan: -0.6, send: 0.25 });
    v.tone({ freq: 1300, freqEnd: 400, glide: 0.26, gain: 0.22, attack: 0.02, decay: 0.28, release: 0.04, pan: 0.6, send: 0.25 });
    bell(v, midi(79), 0.27, 0.14, { decay: 0.45 });
  },
  bench: (v) => {
    sweepNoise(v, 500, 2600, { dur: 0.45, gain: 0.16, attack: 0.2 });
    v.tone({ freq: 392, freqEnd: 587, glide: 0.4, gain: 0.2, attack: 0.15, decay: 0.3, release: 0.1, send: 0.5, vibrato: { rate: 5, depth: 3 } });
    bell(v, midi(81), 0.38, 0.14, { decay: 0.6, send: 0.55 });
  },
  transposition: (v) => {
    mobilityBase(v, { gain: 0.3, dur: 0.18 });
    [81, 88, 81, 88].forEach((n, i) => v.tone({ type: "triangle", freq: midi(n), at: i * 0.055, gain: 0.2, attack: 0.002, decay: 0.07, release: 0.03, pan: i % 2 ? 0.6 : -0.6, send: 0.2, filter: { type: "lowpass", freq: 4000 } }));
    sweepNoise(v, 800, 5000, { at: 0.2, dur: 0.1, gain: 0.12, attack: 0.01 });
  },
  temporal: (v) => {
    mobilityBase(v, { up: false, gain: 0.3, dur: 0.4 });
    v.tone({ freq: 760, freqEnd: 170, glide: 0.5, gain: 0.28, attack: 0.01, decay: 0.5, release: 0.05, tremolo: { rate: 17, depth: 0.85 }, send: 0.3 });
    [0, 0.13, 0.26].forEach((t, i) => v.noise({ at: t, gain: 0.2, attack: 0.001, decay: 0.012, release: 0.01, filter: { type: "bandpass", freq: 3600 - i * 700, q: 6 } }));
    thock(v, { at: 0.46, body: 230, click: 2200, gain: 0.35 });
  },

  // Défense : résonant, grave
  imune: (v) => {
    defenseBase(v, { root: 110 });
    v.tone({ type: "triangle", freq: 440, gain: 0.26, attack: 0.03, decay: 0.55, release: 0.1, send: 0.5, filter: { type: "bandpass", freq: 440, q: 6 } });
    bell(v, midi(88), 0.04, 0.1, { decay: 0.5 });
  },
  invisibility: (v) => {
    defenseBase(v, { root: 98, gain: 0.45 });
    sweepNoise(v, 3200, 300, { dur: 0.55, gain: 0.2, attack: 0.04, q: 1.2 });
    v.tone({ freq: 1320, freqEnd: 330, glide: 0.5, gain: 0.16, attack: 0.02, decay: 0.55, release: 0.1, send: 0.5, vibrato: { rate: 6, depth: 14 } });
  },
  forcefield: (v) => {
    defenseBase(v, { root: 123, gain: 0.8 });
    v.tone({ type: "sawtooth", freq: 110, gain: 0.25, attack: 0.06, decay: 0.45, release: 0.1, filter: { type: "lowpass", freq: 500, freqEnd: 1500, sweep: 0.3, q: 2 }, send: 0.3 });
    v.tone({ freq: 880, gain: 0.14, attack: 0.04, decay: 0.45, release: 0.08, tremolo: { rate: 30, depth: 0.9 }, send: 0.3 });
  },
  celestial: (v) => {
    defenseBase(v, { root: 98, gain: 0.5 });
    [60, 64, 67, 72].forEach((n, i) => v.tone({ freq: midi(n), detune: (i - 1.5) * 6, gain: 0.13, attack: 0.14, decay: 0.7, release: 0.2, send: 0.65, vibrato: { rate: 4.5, depth: 2 } }));
    bell(v, midi(96), 0.22, 0.1, { decay: 0.9, send: 0.6 });
  },

  // Attaque : percussif, agressif
  terminator: (v) => {
    attackBase(v, { weight: 0.8 });
    v.tone({ type: "sawtooth", freq: 125, freqEnd: 48, glide: 0.4, gain: 0.3, attack: 0.005, decay: 0.42, release: 0.06, filter: { type: "lowpass", freq: 520, q: 2 } });
    [0.0, 0.09].forEach((t) => v.tone({ type: "square", freq: 1500, at: 0.16 + t, gain: 0.07, attack: 0.002, decay: 0.04, release: 0.015, filter: { type: "lowpass", freq: 3000 } }));
  },
  trap: (v) => {
    attackBase(v, { weight: 0.5 });
    v.noise({ at: 0.03, gain: 0.45, attack: 0.001, decay: 0.02, release: 0.01, filter: { type: "highpass", freq: 4200 } });
    v.tone({ type: "square", freq: 1300, freqEnd: 170, glide: 0.09, gain: 0.16, attack: 0.001, decay: 0.1, release: 0.03, filter: { type: "lowpass", freq: 2800 } });
    crystal(v, 560, 0.09, 0.18, 0.3);
  },
  queensac: (v) => {
    attackBase(v, { weight: 1.1 });
    v.tone({ freq: 65, gain: 0.5, attack: 0.004, decay: 1.0, release: 0.15, send: 0.4 });
    v.tone({ freq: 130.8, gain: 0.25, attack: 0.004, decay: 0.8, release: 0.1, send: 0.4 });
    v.tone({ freq: 196.7, gain: 0.14, attack: 0.004, decay: 0.6, release: 0.1, send: 0.4 });
    [50, 53, 57].forEach((n) => v.tone({ type: "sawtooth", freq: midi(n), at: 0.08, gain: 0.1, attack: 0.01, decay: 0.5, release: 0.12, send: 0.4, filter: { type: "lowpass", freq: 700 } }));
  },
  remover: (v) => {
    attackBase(v, { weight: 0.55 });
    sweepNoise(v, 5200, 260, { dur: 0.6, gain: 0.34, q: 3, attack: 0.02 });
    for (let i = 0; i < 8; i++) {
      v.tone({ freq: 2600 - i * 260 + (i % 2) * 90, at: 0.04 + i * 0.058, gain: 0.1, attack: 0.002, decay: 0.045, release: 0.015, pan: i % 2 ? 0.5 : -0.5 });
    }
  },
  switch: (v) => {
    attackBase(v, { weight: 0.6 });
    v.noise({ gain: 0.3, attack: 0.04, decay: 0.07, release: 0.02, filter: { type: "bandpass", freq: 600, freqEnd: 4200, sweep: 0.1, q: 2.5 } });
    v.tone({ type: "triangle", freq: midi(72), at: 0.06, gain: 0.26, attack: 0.003, decay: 0.09, release: 0.03, send: 0.2 });
    v.tone({ type: "triangle", freq: midi(79), at: 0.13, gain: 0.26, attack: 0.003, decay: 0.16, release: 0.04, send: 0.3 });
  },

  // Contrôle : cristallin, dissonant
  freeze: (v) => {
    controlBase(v, { f: 1480 });
    crystal(v, 2093, 0.06, 0.12, 0.6);
    [0.1, 0.14, 0.21, 0.25].forEach((t, i) => v.noise({ at: t, gain: 0.3, attack: 0.001, decay: 0.012, release: 0.008, filter: { type: "highpass", freq: 6000 + i * 600 } }));
  },
  canceller: (v) => {
    controlBase(v, { gain: 0.45, f: 1100 });
    v.tone({ freq: 1500, freqEnd: 200, glide: 0.3, gain: 0.2, attack: 0.01, decay: 0.3, release: 0.03, send: 0.2 });
    // « refusé » : tritons grondants
    v.tone({ type: "sawtooth", freq: 233, at: 0.3, gain: 0.2, attack: 0.006, decay: 0.16, release: 0.05, filter: { type: "lowpass", freq: 820 } });
    v.tone({ type: "sawtooth", freq: 329, at: 0.3, gain: 0.16, attack: 0.006, decay: 0.16, release: 0.05, filter: { type: "lowpass", freq: 820 } });
  },
  tornado: (v) => {
    v.noise({ gain: 0.45, attack: 0.25, decay: 0.55, release: 0.1, filter: { type: "bandpass", freq: 900, q: 2.2, lfo: { rate: 6, depth: 600 } }, panLfo: { rate: 3, depth: 0.85 }, send: 0.25 });
    v.noise({ at: 0.08, gain: 0.18, attack: 0.2, decay: 0.45, release: 0.1, filter: { type: "highpass", freq: 2500, lfo: { rate: 8, depth: 900 } }, panLfo: { rate: 4, depth: 0.7 } });
    v.tone({ freq: 200, freqEnd: 520, glide: 0.4, gain: 0.14, attack: 0.1, decay: 0.45, release: 0.08, vibrato: { rate: 7, depth: 25 }, pan: -0.3 });
    controlBase(v, { gain: 0.25, f: 880 });
  },
  geomancy: (v) => {
    v.noise({ gain: 0.6, attack: 0.04, decay: 0.5, release: 0.1, filter: { type: "lowpass", freq: 130, q: 1 } });
    thock(v, { at: 0.18, body: 72, click: 650, gain: 0.8, dull: 900 });
    thock(v, { at: 0.3, body: 88, click: 800, gain: 0.7, dull: 1000 });
    controlBase(v, { at: 0.34, gain: 0.45, f: 900 });
  },
  mind: (v) => {
    [-9, 0, 9].forEach((c) => v.tone({ freq: 440, detune: c, gain: 0.13, attack: 0.15, decay: 0.75, release: 0.2, send: 0.7, vibrato: { rate: 5, depth: 3 } }));
    v.tone({ freq: 660, detune: 5, gain: 0.07, attack: 0.18, decay: 0.7, release: 0.2, send: 0.7, vibrato: { rate: 4.5, depth: 4 } });
    v.tone({ freq: 1760, at: 0.2, gain: 0.05, attack: 0.1, decay: 0.6, release: 0.2, send: 0.8, tremolo: { rate: 6, depth: 0.7 } });
    controlBase(v, { gain: 0.3, f: 1760, at: 0.1 });
  },
  control: (v) => {
    controlBase(v, { gain: 0.7, f: 1250 });
    v.tone({ freq: 440, gain: 0.16, attack: 0.02, decay: 0.45, release: 0.08, tremolo: { rate: 12, depth: 0.7 }, send: 0.3 });
    v.tone({ freq: 466, gain: 0.16, attack: 0.02, decay: 0.45, release: 0.08, tremolo: { rate: 12, depth: 0.7 }, send: 0.3 });
    // fils de marionnette puis verrou
    [0, 0.06, 0.12].forEach((t, i) => pluck(v, midi(88 + i * 3), t, 0.12, 0.2));
    thock(v, { at: 0.3, body: 140, click: 1500, gain: 0.5 });
  },

  // Création : montant, scintillant
  clone: (v) => {
    createBase(v, { root: 79, gain: 0.5, steps: 3 });
    bell(v, midi(81), 0, 0.24, { decay: 0.35 });
    bell(v, midi(81), 0.13, 0.13, { decay: 0.35 });
    bell(v, midi(81), 0.26, 0.07, { decay: 0.35 });
  },
  wall: (v) => {
    v.noise({ gain: 0.5, attack: 0.04, decay: 0.45, release: 0.1, filter: { type: "lowpass", freq: 220, q: 1 } });
    [80, 95, 112, 132].forEach((b, i) => thock(v, { at: i * 0.085, body: b, click: 700 + i * 150, gain: 0.7, dull: 1000 }));
    createBase(v, { at: 0.2, root: 67, gain: 0.45, steps: 3 });
  },
  mirage: (v) => {
    [-35, -15, 15, 35].forEach((c, i) => v.tone({ freq: 1046, detune: c, gain: 0.1, attack: 0.1, decay: 0.55, release: 0.15, send: 0.7, tremolo: { rate: 8 + i, depth: 0.6 } }));
    for (let i = 0; i < 4; i++) v.tone({ type: "square", freq: 900 + i * 230, at: 0.2 + i * 0.045, gain: 0.05, attack: 0.002, decay: 0.03, release: 0.01, filter: { type: "lowpass", freq: 2500 } });
    createBase(v, { gain: 0.4, root: 84, steps: 4 });
  },
  evolve: (v) => {
    [72, 76, 79, 84, 88, 91].forEach((n, i) => {
      v.tone({ type: "triangle", freq: midi(n), at: i * 0.055, gain: 0.2, attack: 0.003, decay: 0.2, release: 0.05, send: 0.4, filter: { type: "lowpass", freq: 1200 + i * 700 } });
    });
    [72, 79, 84, 88].forEach((n) => v.tone({ freq: midi(n), at: 0.36, gain: 0.1, attack: 0.02, decay: 0.7, release: 0.15, send: 0.6 }));
    bell(v, midi(96), 0.38, 0.1, { decay: 0.8, send: 0.6 });
  },
  morph: (v) => {
    createBase(v, { gain: 0.35, root: 74, steps: 3 });
    v.tone({ freq: 300, freqEnd: 900, glide: 0.26, gain: 0.24, attack: 0.02, decay: 0.28, release: 0.02, vibrato: { rate: 7, depth: 25 }, send: 0.25 });
    v.tone({ freq: 900, freqEnd: 350, glide: 0.3, at: 0.26, gain: 0.24, attack: 0.02, decay: 0.32, release: 0.06, vibrato: { rate: 7, depth: 25 }, send: 0.35 });
    v.tone({ type: "triangle", freq: 600, freqEnd: 1800, glide: 0.26, gain: 0.08, detune: 12, attack: 0.02, decay: 0.28, release: 0.02, filter: { type: "bandpass", freq: 1500, freqEnd: 600, sweep: 0.5, q: 3 } });
  },
  godhelp: (v) => {
    // Impact grave puis chœur.
    v.tone({ freq: 58, freqEnd: 36, glide: 0.45, gain: 0.85, attack: 0.002, decay: 0.55, release: 0.1 });
    v.noise({ gain: 0.45, attack: 0.001, decay: 0.15, release: 0.05, filter: { type: "lowpass", freq: 320 } });
    [48, 55, 60, 64, 67].forEach((n, i) => v.tone({ freq: midi(n), detune: (i - 2) * 7, at: 0.1, gain: 0.12, attack: 0.1, decay: 1.0, release: 0.25, send: 0.7, vibrato: { rate: 5, depth: 2.5 } }));
    createBase(v, { at: 0.35, gain: 0.5, root: 84, steps: 3 });
  },
};

export const RECIPES: Record<SfxName, Recipe> = { ...BASE, ...Object.fromEntries(Object.entries(SKILLS).map(([k, r]) => [`skill_${k}`, r])) } as Record<SfxName, Recipe>;
