// Les 27 compétences : chacune a sa propre signature sonore (timbre, contour de hauteur, rythme, durée 0,6-1,6 s).
// Les niveaux sont ensuite réglés par `LEVELS` (levels.ts) pour que rien ne soit agressif.
import type { SkillId } from "../protocol";
import { bell, crystal, fmBell, pluck, rnd, sparkle, sweepNoise, thock } from "./bricks";
import { midi, type Voice } from "./synth";

export type SkillRecipe = (v: Voice) => void;

export const SKILLS: Record<SkillId, SkillRecipe> = {
  // ---- Mobilité ---------------------------------------------------------------------------------

  /** Balayage montant éclair, « pop » d'arrivée, puis pluie d'étincelles aiguës. */
  teleportation: (v) => {
    sweepNoise(v, 300, 7000, { dur: 0.2, gain: 0.3, q: 4, attack: 0.15 });
    v.tone({ freq: 260, freqEnd: 3400, glide: 0.2, gain: 0.22, attack: 0.02, decay: 0.2, release: 0.02, send: 0.2, filter: { type: "lowpass", freq: 1500, freqEnd: 9000, sweep: 0.2 } });
    v.tone({ at: 0.22, freq: 1500, freqEnd: 180, glide: 0.05, gain: 0.6, attack: 0.001, decay: 0.07, release: 0.03 });
    v.noise({ at: 0.22, gain: 0.3, attack: 0.001, decay: 0.02, release: 0.01, filter: { type: "highpass", freq: 3500 } });
    sparkle(v, { at: 0.27, count: 9, gap: 0.05, f0: 3200, spread: 2600, gain: 0.1, decay: 0.28 });
  },

  /** Rembobinage : gonflement inversé, bande qui défile en accélérant, « clac » final et deux notes qui retombent. */
  rollback: (v) => {
    v.noise({ gain: 0.3, attack: 0.4, decay: 0.02, release: 0.03, filter: { type: "bandpass", freq: 4200, freqEnd: 300, sweep: 0.42, q: 1.5 }, send: 0.15 });
    v.tone({ type: "sawtooth", freq: 1400, freqEnd: 180, glide: 0.42, gain: 0.1, attack: 0.02, decay: 0.4, release: 0.02, vibrato: { rate: 28, depth: 50 }, filter: { type: "lowpass", freq: 2500 } });
    let t = 0;
    [0.1, 0.085, 0.07, 0.058, 0.047, 0.038, 0.03, 0.024].forEach((gap, i) => {
      t += gap;
      v.noise({ at: t, gain: 0.2 + i * 0.02, attack: 0.001, decay: 0.012, release: 0.01, filter: { type: "bandpass", freq: 3800 - i * 250, q: 8 } });
    });
    thock(v, { at: 0.5, body: 200, click: 2000, gain: 0.55 });
    pluck(v, midi(88), 0.52, 0.2, 0.35);
    pluck(v, midi(83), 0.62, 0.2, 0.4);
  },

  /** Deux voix qui se croisent (glissandos opposés, panoramique inversé) puis se répondent de part et d'autre. */
  destiny_swapper: (v) => {
    const cross = (from: number, to: number, depth: number) =>
      v.tone({ type: "triangle", freq: from, freqEnd: to, glide: 0.4, gain: 0.2, attack: 0.02, decay: 0.45, release: 0.06, panLfo: { rate: 0.6, depth }, send: 0.3, filter: { type: "lowpass", freq: 3000 } });
    cross(392, 784, 0.9);
    cross(784, 392, -0.9);
    bell(v, midi(79), 0.44, 0.16, { decay: 0.4, pan: -0.7 });
    bell(v, midi(84), 0.52, 0.16, { decay: 0.45, pan: 0.7 });
    bell(v, midi(91), 0.62, 0.1, { decay: 0.6, pan: -0.3, send: 0.55 });
  },

  /** Le pion sort (souffle), silence, puis revient : deux tocs de bois et un accord chaud qui se pose. */
  bench: (v) => {
    sweepNoise(v, 2400, 300, { dur: 0.22, gain: 0.2, attack: 0.02 });
    v.tone({ freq: 200, freqEnd: 400, glide: 0.4, at: 0.2, gain: 0.05, attack: 0.15, decay: 0.3, release: 0.1, send: 0.5, filter: { type: "lowpass", freq: 900 } });
    thock(v, { at: 0.62, body: 300, click: 1600, gain: 0.45 });
    thock(v, { at: 0.74, body: 240, click: 1300, gain: 0.5 });
    [62, 69, 74].forEach((n, i) => v.tone({ type: "triangle", freq: midi(n), at: 0.78 + i * 0.03, gain: 0.14, attack: 0.08, decay: 0.55, release: 0.12, send: 0.5, filter: { type: "lowpass", freq: 1800 } }));
  },

  /** Mélange de cartes (rafale de bruit en stéréo alternée) puis deux pincées qui se croisent. */
  transposition: (v) => {
    for (let i = 0; i < 9; i++) {
      v.noise({ at: i * 0.028, gain: 0.2, attack: 0.001, decay: 0.02, release: 0.01, pan: i % 2 ? 0.8 : -0.8, filter: { type: "bandpass", freq: 2200 + (i % 3) * 900, q: 2.5 } });
    }
    pluck(v, midi(93), 0.28, 0.3, 0.3, -0.7);
    pluck(v, midi(100), 0.34, 0.3, 0.3, 0.7);
    pluck(v, midi(100), 0.46, 0.26, 0.4, -0.7);
    pluck(v, midi(93), 0.52, 0.26, 0.4, 0.7);
  },

  /** Distorsion du temps : glissando grave qui s'étire, tic-tacs de plus en plus espacés, gong profond. */
  temporal: (v) => {
    [0, 7].forEach((d) =>
      v.tone({
        type: "triangle", freq: 880, freqEnd: 110, glide: 1.0, gain: 0.16, detune: d, attack: 0.05, decay: 1.0, release: 0.1, send: 0.4,
        tremolo: { rate: 9, depth: 0.8 }, filter: { type: "lowpass", freq: 3000, freqEnd: 400, sweep: 1.0 },
      }),
    );
    [0, 0.1, 0.24, 0.44, 0.7].forEach((t, i) => {
      v.noise({ at: t, gain: 0.24, attack: 0.001, decay: 0.014, release: 0.01, filter: { type: "bandpass", freq: 3400 - i * 500, q: 7 } });
      v.tone({ at: t, freq: 900 - i * 150, gain: 0.14, attack: 0.001, decay: 0.035, release: 0.015 });
    });
    fmBell(v, 110, 0.75, 0.3, { ratio: 1.41, index: 1.2, decay: 0.9, send: 0.6 });
  },

  // ---- Défense ----------------------------------------------------------------------------------

  /** Bol chantant : gonflement chaud en sol grave, partiels inharmoniques, « ting » clair par-dessus. */
  imune: (v) => {
    v.tone({ freq: 196, gain: 0.3, attack: 0.12, decay: 0.9, release: 0.15, send: 0.4, tremolo: { rate: 4.5, depth: 0.35 } });
    v.tone({ freq: 392, gain: 0.15, attack: 0.1, decay: 0.7, release: 0.1, send: 0.4 });
    v.tone({ freq: 1058, gain: 0.06, attack: 0.08, decay: 0.5, release: 0.08, send: 0.4 });
    v.noise({ gain: 0.1, attack: 0.15, decay: 0.7, release: 0.1, filter: { type: "bandpass", freq: 400, q: 12 }, send: 0.3 });
    fmBell(v, 1568, 0.25, 0.1, { ratio: 2.0, index: 1, decay: 0.6, send: 0.5 });
  },

  /** Souffle aérien qui s'évapore : bruit filtré en spirale stéréo, filet de son très aigu qui disparaît. */
  invisibility: (v) => {
    v.noise({
      gain: 0.3, attack: 0.05, decay: 0.8, release: 0.1, send: 0.5, panLfo: { rate: 2.5, depth: 0.6 },
      filter: { type: "bandpass", freq: 2400, freqEnd: 800, sweep: 0.8, q: 1.2, lfo: { rate: 5, depth: 300 } },
    });
    v.tone({ freq: 1319, freqEnd: 659, glide: 0.8, gain: 0.08, attack: 0.04, decay: 0.9, release: 0.1, send: 0.6, tremolo: { rate: 7, depth: 0.8 } });
    v.tone({ freq: 1760, freqEnd: 880, glide: 0.8, detune: 8, gain: 0.05, attack: 0.1, decay: 0.7, release: 0.1, send: 0.7, tremolo: { rate: 9, depth: 0.9 } });
  },

  /** Champ de force : montée de charge, claquement électrique, bourdonnement grésillant. */
  forcefield: (v) => {
    v.tone({ type: "sawtooth", freq: 90, freqEnd: 700, glide: 0.25, gain: 0.2, attack: 0.02, decay: 0.28, release: 0.02, filter: { type: "lowpass", freq: 400, freqEnd: 4000, sweep: 0.25, q: 3 } });
    v.noise({ at: 0.25, gain: 0.4, attack: 0.001, decay: 0.05, release: 0.02, filter: { type: "highpass", freq: 2500 } });
    v.tone({ type: "square", at: 0.25, freq: 2800, freqEnd: 250, glide: 0.06, gain: 0.18, attack: 0.001, decay: 0.08, release: 0.02, filter: { type: "lowpass", freq: 3500 } });
    v.tone({ type: "sawtooth", at: 0.28, freq: 110, gain: 0.2, attack: 0.01, decay: 0.65, release: 0.1, send: 0.3, tremolo: { rate: 55, depth: 0.9 }, filter: { type: "lowpass", freq: 700 } });
    v.tone({ at: 0.28, freq: 880, gain: 0.1, attack: 0.01, decay: 0.6, release: 0.08, send: 0.3, tremolo: { rate: 30, depth: 0.9 } });
    [0.4, 0.55, 0.62].forEach((t) => v.noise({ at: t, gain: 0.2, attack: 0.001, decay: 0.012, release: 0.008, filter: { type: "highpass", freq: 6000 } }));
  },

  /** Chœur d'anges : accord majeur de voix en dents de scie filtrées en « aaah », cloche et pluie céleste. */
  celestial: (v) => {
    [60, 64, 67, 72, 76].forEach((n, i) =>
      v.tone({
        type: "sawtooth", freq: midi(n), detune: (i - 2) * 5, at: i * 0.04, gain: 0.11, attack: 0.3, decay: 1.1, release: 0.3, send: 0.7,
        vibrato: { rate: 5.2, depth: 3 }, filter: { type: "bandpass", freq: i % 2 ? 1200 : 800, q: 1.4 },
      }),
    );
    fmBell(v, midi(96), 0.55, 0.1, { ratio: 3.5, index: 0.8, decay: 0.9, send: 0.7 });
    sparkle(v, { at: 0.7, count: 5, gap: 0.09, f0: 2400, spread: 1800, gain: 0.07, decay: 0.4, seed: 3 });
  },

  // ---- Attaque ----------------------------------------------------------------------------------

  /** Machine : coups métalliques, grondement de servomoteur, trois bips de verrouillage puis chute grave. */
  terminator: (v) => {
    v.tone({ freq: 90, freqEnd: 40, glide: 0.2, gain: 0.7, attack: 0.001, decay: 0.2, release: 0.05 });
    [0, 0.09].forEach((t) => v.noise({ at: t, gain: 0.4, attack: 0.001, decay: 0.05, release: 0.02, filter: { type: "bandpass", freq: 2000, q: 3 } }));
    v.tone({ type: "sawtooth", at: 0.05, freq: 130, freqEnd: 50, glide: 0.35, gain: 0.2, attack: 0.01, decay: 0.4, release: 0.05, tremolo: { rate: 28, depth: 0.8 }, filter: { type: "lowpass", freq: 500, q: 2 } });
    [0.3, 0.4, 0.5].forEach((t) => v.tone({ type: "square", at: t, freq: 1320, gain: 0.1, attack: 0.002, decay: 0.05, release: 0.015, filter: { type: "lowpass", freq: 3000 } }));
    v.tone({ type: "sawtooth", at: 0.62, freq: 98, freqEnd: 49, glide: 0.3, gain: 0.3, attack: 0.005, decay: 0.35, release: 0.06, filter: { type: "lowpass", freq: 600, q: 2 } });
  },

  /** Piège : claquement sec, ressort qui vibre, anneau métallique (cloches FM). */
  trap: (v) => {
    v.noise({ gain: 0.7, attack: 0.001, decay: 0.02, release: 0.01, filter: { type: "highpass", freq: 3500 } });
    v.tone({ type: "square", freq: 2400, freqEnd: 150, glide: 0.05, gain: 0.25, attack: 0.001, decay: 0.08, release: 0.02, filter: { type: "lowpass", freq: 3500 } });
    v.tone({ type: "sawtooth", at: 0.05, freq: 700, gain: 0.12, attack: 0.002, decay: 0.25, release: 0.04, vibrato: { rate: 55, depth: 200 }, filter: { type: "lowpass", freq: 2200 } });
    fmBell(v, 1250, 0.06, 0.3, { ratio: 2.76, index: 1.6, decay: 0.8, send: 0.4 });
    fmBell(v, 1870, 0.06, 0.15, { ratio: 1.6, index: 1.2, decay: 0.5, send: 0.4 });
    fmBell(v, 940, 0.3, 0.12, { ratio: 2.76, index: 1.2, decay: 0.45, send: 0.4 });
  },

  /** Sacrifice : glas grave (cloche FM qui sonne), puis quatre notes royales qui retombent en mineur. */
  queensac: (v) => {
    fmBell(v, midi(43), 0, 0.42, { ratio: 2.4, index: 0.8, decay: 1.3, send: 0.6 });
    fmBell(v, midi(38), 0.62, 0.34, { ratio: 2.4, index: 0.8, decay: 1.1, send: 0.6 });
    [67, 63, 60, 55].forEach((n, i) => {
      v.tone({ type: "sawtooth", freq: midi(n), at: 0.1 + i * 0.22, gain: 0.1, attack: 0.03, decay: 0.45, sustain: 0.3, release: 0.15, send: 0.4, filter: { type: "lowpass", freq: 900 } });
      v.tone({ type: "triangle", freq: midi(n), at: 0.1 + i * 0.22, gain: 0.14, attack: 0.03, decay: 0.45, sustain: 0.3, release: 0.15, send: 0.4 });
    });
  },

  /** Suppression : coup sourd, zap qui chute de l'aigu au grave, petits parasites numériques qui s'éteignent. */
  remover: (v) => {
    v.tone({ freq: 80, freqEnd: 38, glide: 0.15, gain: 0.8, attack: 0.001, decay: 0.2, release: 0.05 });
    v.tone({ type: "sawtooth", at: 0.02, freq: 3600, freqEnd: 90, glide: 0.5, gain: 0.16, attack: 0.005, decay: 0.55, release: 0.03, filter: { type: "bandpass", freq: 3000, freqEnd: 200, sweep: 0.5, q: 4 } });
    sweepNoise(v, 5500, 200, { dur: 0.5, gain: 0.22, q: 3, attack: 0.02 });
    for (let i = 0; i < 4; i++) v.tone({ at: 0.45 + i * 0.07, freq: 1400 - i * 300, gain: 0.08, attack: 0.002, decay: 0.04, release: 0.015, pan: i % 2 ? 0.5 : -0.5 });
  },

  /** Changement de camp : pièce qui tournoie (trémolo qui ralentit), atterrissage, puis tierce mineure -> majeure. */
  switch: (v) => {
    ([[0, 34], [0.12, 22], [0.26, 14], [0.44, 8]] as const).forEach(([at, rate]) =>
      v.tone({ freq: 2637, at, gain: 0.1, attack: 0.003, decay: 0.16, release: 0.03, send: 0.35, tremolo: { rate, depth: 0.9 } }),
    );
    fmBell(v, 1760, 0.62, 0.22, { ratio: 2.1, index: 1.2, decay: 0.3, send: 0.35 });
    pluck(v, midi(64), 0.7, 0.26, 0.3);
    pluck(v, midi(67), 0.78, 0.26, 0.3);
    pluck(v, midi(68), 0.9, 0.3, 0.45);
  },

  // ---- Contrôle ---------------------------------------------------------------------------------

  /** Gel : cascade de tintements de cristal aigus et inharmoniques, crépitements de givre, brume qui bat. */
  freeze: (v) => {
    for (let i = 0; i < 9; i++) crystal(v, 3400 - i * 190 + rnd(i) * 300, i * 0.04, 0.13 - i * 0.006, 0.35, rnd(i + 20) * 1.4 - 0.7);
    for (let i = 0; i < 6; i++) v.noise({ at: 0.15 + rnd(i + 5) * 0.5, gain: 0.25, attack: 0.001, decay: 0.01, release: 0.008, filter: { type: "highpass", freq: 8000 } });
    v.tone({ freq: 4400, gain: 0.05, attack: 0.05, decay: 0.9, release: 0.1, send: 0.6 });
    v.tone({ freq: 4400, detune: 40, gain: 0.05, attack: 0.05, decay: 0.9, release: 0.1, send: 0.6 });
  },

  /** Annulation : deux « dings » clairs, parasites hachés qui se raccourcissent, chute dans le grave. */
  canceller: (v) => {
    pluck(v, midi(91), 0, 0.28, 0.3);
    pluck(v, midi(94), 0.09, 0.28, 0.3);
    [0.2, 0.29, 0.36, 0.41].forEach((t, i) =>
      v.tone({ type: "square", freq: 1200 - i * 180, at: t, gain: 0.1, attack: 0.002, decay: 0.06 - i * 0.012, release: 0.01, filter: { type: "lowpass", freq: 3500 } }),
    );
    v.noise({ at: 0.2, gain: 0.12, attack: 0.002, decay: 0.2, release: 0.02, filter: { type: "bandpass", freq: 1500, q: 0.6 } });
    v.tone({ freq: 150, freqEnd: 40, glide: 0.3, at: 0.45, gain: 0.5, attack: 0.002, decay: 0.3, release: 0.05 });
    v.tone({ type: "sawtooth", freq: 233, at: 0.45, gain: 0.1, attack: 0.004, decay: 0.2, release: 0.04, filter: { type: "lowpass", freq: 700 } });
  },

  /** Tornade : vent en spirale qui monte et retombe, hurlement grave, débris dispersés. */
  tornado: (v) => {
    v.noise({
      gain: 0.8, attack: 0.5, decay: 0.9, release: 0.15, send: 0.25, panLfo: { rate: 2.2, depth: 0.9 },
      filter: { type: "bandpass", freq: 700, q: 1.1, lfo: { rate: 5.5, depth: 500 } },
    });
    v.noise({
      at: 0.15, gain: 0.1, attack: 0.4, decay: 0.8, release: 0.15, panLfo: { rate: 3.1, depth: -0.8 },
      filter: { type: "highpass", freq: 2800, lfo: { rate: 7, depth: 1200 } },
    });
    v.tone({ freq: 160, freqEnd: 420, glide: 0.8, gain: 0.12, attack: 0.4, decay: 0.9, release: 0.1, vibrato: { rate: 4.5, depth: 30 } });
    for (let i = 0; i < 8; i++) {
      v.noise({ at: 0.3 + rnd(i + 11) * 0.9, gain: 0.15, attack: 0.001, decay: 0.02, release: 0.01, pan: rnd(i + 30) * 1.6 - 0.8, filter: { type: "bandpass", freq: 1200 + rnd(i) * 1800, q: 3 } });
    }
  },

  /** Géomancie : grondement de la terre qui gonfle, craquement, éboulis qui retombent, bourdon profond. */
  geomancy: (v) => {
    v.noise({ gain: 0.7, attack: 0.2, decay: 0.45, release: 0.1, filter: { type: "lowpass", freq: 110, q: 2 } });
    v.tone({ freq: 42, gain: 0.5, attack: 0.25, decay: 0.5, release: 0.1, tremolo: { rate: 13, depth: 0.8 } });
    v.noise({ at: 0.36, gain: 0.6, attack: 0.001, decay: 0.07, release: 0.02, filter: { type: "bandpass", freq: 1400, q: 4 } });
    v.tone({ at: 0.36, freq: 90, freqEnd: 40, glide: 0.15, gain: 0.7, attack: 0.001, decay: 0.2, release: 0.05 });
    [[0.5, 95], [0.62, 80], [0.78, 66]].forEach(([t, b]) => thock(v, { at: t, body: b, click: 700, gain: 0.5, dull: 800 }));
    v.noise({ at: 0.5, gain: 0.15, attack: 0.02, decay: 0.5, release: 0.1, filter: { type: "lowpass", freq: 400 } });
    v.tone({ freq: 55, at: 0.55, gain: 0.3, attack: 0.05, decay: 0.5, release: 0.1, send: 0.3 });
  },

  /** Lecture des pensées : thérémine éthérée (sinus à vibrato qui glisse), murmures, deux notes de révélation. */
  mind: (v) => {
    v.tone({ freq: 660, freqEnd: 1047, glide: 0.4, gain: 0.2, attack: 0.12, decay: 0.55, release: 0.1, send: 0.7, vibrato: { rate: 5.5, depth: 14 } });
    v.tone({ freq: 1047, freqEnd: 784, glide: 0.5, at: 0.45, gain: 0.18, attack: 0.05, decay: 0.7, release: 0.2, send: 0.7, vibrato: { rate: 5.5, depth: 14 } });
    v.noise({ gain: 0.08, attack: 0.2, decay: 0.8, release: 0.1, send: 0.6, filter: { type: "bandpass", freq: 2500, q: 20, lfo: { rate: 3, depth: 600 } }, panLfo: { rate: 1.5, depth: 0.7 } });
    bell(v, midi(93), 0.78, 0.12, { decay: 0.6, send: 0.6, pan: -0.4 });
    bell(v, midi(100), 0.88, 0.1, { decay: 0.7, send: 0.6, pan: 0.4 });
  },

  /** Contrôle mental : agrégat sombre au triton pulsé comme un ronronnement, fils de marionnette, verrou métallique. */
  control: (v) => {
    [110, 155.6, 220].forEach((f) =>
      v.tone({ type: "sawtooth", freq: f, gain: 0.12, attack: 0.08, decay: 0.8, release: 0.1, send: 0.3, tremolo: { rate: 22, depth: 0.9 }, filter: { type: "lowpass", freq: 500 } }),
    );
    [0, 0.05, 0.1, 0.15].forEach((t, i) => pluck(v, midi(88 + i * 2), t, 0.14, 0.2, -0.5 + i * 0.33));
    thock(v, { at: 0.55, body: 140, click: 1500, gain: 0.5 });
    fmBell(v, 220, 0.55, 0.28, { ratio: 3.5, index: 3, decay: 0.35, send: 0.3 });
  },

  // ---- Création ---------------------------------------------------------------------------------

  /** Clone : une note, puis deux copies qui se séparent en glissant dans des sens opposés (un à gauche, un à droite). */
  clone: (v) => {
    // l'original, puis deux copies identiques qui apparaissent à droite puis à gauche (légèrement désaccordées)
    bell(v, midi(81), 0, 0.26, { decay: 0.3 });
    bell(v, midi(81), 0.1, 0.2, { decay: 0.3, pan: 0.7 });
    bell(v, midi(81), 0.2, 0.2, { decay: 0.3, pan: -0.7 });
    v.tone({ freq: 880, detune: 25, at: 0.1, gain: 0.07, attack: 0.01, decay: 0.3, release: 0.05, pan: 0.7, send: 0.4 });
    v.tone({ freq: 880, detune: -25, at: 0.2, gain: 0.07, attack: 0.01, decay: 0.3, release: 0.05, pan: -0.7, send: 0.4 });
    v.tone({ freq: 880, freqEnd: 987, glide: 0.4, at: 0.34, gain: 0.14, attack: 0.01, decay: 0.5, release: 0.1, pan: -0.6, send: 0.4, detune: 12 });
    v.tone({ freq: 880, freqEnd: 740, glide: 0.4, at: 0.34, gain: 0.14, attack: 0.01, decay: 0.5, release: 0.1, pan: 0.6, send: 0.4, detune: -12 });
    bell(v, 987, 0.72, 0.12, { decay: 0.35, pan: -0.6 });
    bell(v, 740, 0.72, 0.12, { decay: 0.35, pan: 0.6 });
  },

  /** Mur : cinq blocs de pierre empilés (de plus en plus aigus et forts), mortier qui racle, claque finale et poussière. */
  wall: (v) => {
    for (let i = 0; i < 5; i++) {
      thock(v, { at: i * 0.095, body: 70 + i * 22, click: 600 + i * 220, gain: 0.55 + i * 0.08, dull: 900 + i * 150 });
      v.noise({ at: i * 0.095 + 0.045, gain: 0.12, attack: 0.002, decay: 0.04, release: 0.01, filter: { type: "bandpass", freq: 500, q: 1.5 } });
    }
    v.tone({ at: 0.5, freq: 60, freqEnd: 40, glide: 0.2, gain: 0.8, attack: 0.002, decay: 0.3, release: 0.06 });
    v.noise({ at: 0.5, gain: 0.5, attack: 0.01, decay: 0.45, release: 0.1, filter: { type: "lowpass", freq: 260 } });
  },

  /** Mirage : accord de septième majeure miroitant (voix désaccordées + trémolos), brume de chaleur, harpe lointaine. */
  mirage: (v) => {
    [84, 88, 91, 95].forEach((n, i) =>
      [-22, 22].forEach((c) =>
        v.tone({ freq: midi(n), detune: c + i * 3, gain: 0.07, attack: 0.35, decay: 0.75, release: 0.2, send: 0.7, tremolo: { rate: 6 + i * 1.3, depth: 0.7 } }),
      ),
    );
    v.noise({ gain: 0.05, attack: 0.3, decay: 0.8, release: 0.15, send: 0.5, filter: { type: "bandpass", freq: 6500, q: 3, lfo: { rate: 7, depth: 2500 } } });
    [96, 91, 88, 84].forEach((n, i) => bell(v, midi(n), 0.75 + i * 0.09, 0.07, { decay: 0.45, send: 0.7, pan: i % 2 ? 0.4 : -0.4 }));
  },

  /** Évolution : arpège chiptune qui grimpe (carrés), accord triomphal tenu, balayage scintillant. */
  evolve: (v) => {
    [72, 76, 79, 84, 88, 91, 96].forEach((n, i) =>
      v.tone({ type: "square", freq: midi(n), at: i * 0.06, gain: 0.14, attack: 0.002, decay: 0.09, release: 0.03, send: 0.2, filter: { type: "lowpass", freq: 5000 } }),
    );
    [84, 88, 91, 96].forEach((n) => v.tone({ type: "triangle", freq: midi(n), at: 0.45, gain: 0.12, attack: 0.02, decay: 0.7, release: 0.15, send: 0.5 }));
    sweepNoise(v, 2000, 9000, { at: 0.1, dur: 0.35, gain: 0.08, q: 3, attack: 0.25 });
    bell(v, midi(103), 0.5, 0.08, { decay: 0.6, send: 0.6 });
  },

  /** Métamorphose : voix en dents de scie dont la voyelle (filtre passe-bande) glisse, bloops liquides. */
  morph: (v) => {
    v.tone({ type: "sawtooth", freq: 196, freqEnd: 330, glide: 0.35, gain: 0.28, attack: 0.04, decay: 0.4, release: 0.05, send: 0.3, vibrato: { rate: 6, depth: 6 }, filter: { type: "bandpass", freq: 350, freqEnd: 2400, sweep: 0.4, q: 6 } });
    v.tone({ type: "sawtooth", freq: 330, freqEnd: 174, glide: 0.4, at: 0.4, gain: 0.28, attack: 0.02, decay: 0.55, release: 0.1, send: 0.4, vibrato: { rate: 6, depth: 6 }, filter: { type: "bandpass", freq: 2400, freqEnd: 500, sweep: 0.5, q: 6 } });
    v.tone({ freq: 600, freqEnd: 1800, glide: 0.12, gain: 0.15, attack: 0.005, decay: 0.14, release: 0.03 });
    v.tone({ freq: 1200, freqEnd: 400, glide: 0.12, at: 0.55, gain: 0.15, attack: 0.005, decay: 0.14, release: 0.03 });
  },

  /** Intervention divine : choc grave, tonnerre qui gronde, orgue qui s'ouvre en grand accord, gerbe de cloches. */
  godhelp: (v) => {
    v.tone({ freq: 62, freqEnd: 34, glide: 0.4, gain: 0.9, attack: 0.002, decay: 0.5, release: 0.1 });
    v.noise({ gain: 0.6, attack: 0.05, decay: 0.7, release: 0.1, filter: { type: "lowpass", freq: 160, q: 2 } });
    [38, 45, 50, 57, 62].forEach((n) =>
      v.tone({ type: "sawtooth", freq: midi(n), at: 0.12, gain: 0.07, attack: 0.15, decay: 1.1, release: 0.25, send: 0.5, filter: { type: "lowpass", freq: 700, freqEnd: 2600, sweep: 0.6 } }),
    );
    [86, 91, 95, 98].forEach((n, i) => bell(v, midi(n), 0.5 + i * 0.07, 0.1, { decay: 0.8, send: 0.6 }));
  },
};
