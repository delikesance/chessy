// Palette sonore : une « recette » par son, construite avec les briques de bricks.ts / synth.ts.
// Les sons de base sont ici ; les 27 compétences, chacune avec sa propre signature, sont dans skillRecipes.ts.
import type { SfxName } from "./names";
import type { SkillId } from "../protocol";
import { bell, crystal, defenseBase, pluck, sweepNoise, thock } from "./bricks";
import { SKILLS } from "./skillRecipes";
import { midi, type Voice } from "./synth";

export type Recipe = (v: Voice) => void;

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

export const RECIPES: Record<SfxName, Recipe> = { ...BASE, ...Object.fromEntries(Object.entries(SKILLS).map(([k, r]) => [`skill_${k}`, r])) } as Record<SfxName, Recipe>;
