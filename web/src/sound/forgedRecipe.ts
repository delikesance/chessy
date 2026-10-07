// Le son d'une compétence forgée : le serveur donne un `SoundSpec` (quel effet, quelle note, quel timbre,
// quelle durée) et on l'assemble avec les mêmes briques que les 27 recettes écrites à la main.
// Chaque effet a sa « signature » (un geste sonore reconnaissable) ; la note, la clarté et la durée la déclinent.
import type { SoundSpec } from "../forged";
import { bell, crystal, defenseBase, fmBell, pluck, sparkle, sweepNoise, thock } from "./bricks";
import type { SkillRecipe } from "./skillRecipes";
import { midi, type Voice } from "./synth";

/** Gamme pentatonique : toutes les notes s'accordent entre elles. */
const SCALE = [0, 2, 4, 7, 9, 12, 14];
/** Durée relative selon `length` (0 court, 2 long). */
const STRETCH = [0.8, 1, 1.25];

type Gesture = (v: Voice, o: { root: number; bright: number; k: number }) => void;

const GESTURES: Gesture[] = [
  // 0 Freeze : cristal qui se fige, souffle glacé.
  (v, { root, bright, k }) => {
    sweepNoise(v, 6000, 1800, { dur: 0.3 * k, gain: 0.14, q: 3 });
    [0, 7, 12].forEach((d, i) => crystal(v, midi(root + 24 + d), 0.04 + i * 0.07 * k, 0.1 + bright * 0.02, 0.5 * k));
  },
  // 1 Shield : grave résonant et cloche.
  (v, { root, k }) => {
    defenseBase(v, { root: midi(root - 12), gain: 0.9 });
    bell(v, midi(root + 12), 0.1, 0.16, { decay: 0.5 * k });
  },
  // 2 Cloak : voile de bruit qui se referme sur une note grave.
  (v, { root, k }) => {
    sweepNoise(v, 500, 3200, { dur: 0.45 * k, gain: 0.16, q: 1.2 });
    v.tone({ type: "triangle", freq: midi(root - 12), gain: 0.14, attack: 0.15, decay: 0.7 * k, release: 0.1, send: 0.5, filter: { type: "lowpass", freq: 900 } });
  },
  // 3 Morph : glissando qui change de timbre.
  (v, { root, k }) => {
    v.tone({ freq: midi(root), freqEnd: midi(root + 12), glide: 0.35 * k, gain: 0.16, attack: 0.02, decay: 0.5 * k, release: 0.06, send: 0.3, vibrato: { rate: 9, depth: 30 } });
    fmBell(v, midi(root + 7), 0.3 * k, 0.16, { ratio: 1.5, index: 2, decay: 0.45 * k });
  },
  // 4 Promote : arpège qui monte et se pose.
  (v, { root, k }) => [0, 4, 7, 12].forEach((d, i) => bell(v, midi(root + 12 + d), i * 0.09 * k, 0.15, { decay: (0.4 + i * 0.08) * k })),
  // 5 Remove : coup sec, souffle qui s'éteint, note creuse qui reste.
  (v, { root, k }) => {
    thock(v, { body: midi(root - 12), click: 2200, gain: 0.5 });
    sweepNoise(v, 3000, 250, { at: 0.04, dur: 0.4 * k, gain: 0.16 });
    bell(v, midi(root - 12), 0.12, 0.22, { decay: 0.9 * k });
  },
  // 6 Convert : deux voix qui se croisent.
  (v, { root, k }) => {
    v.tone({ type: "triangle", freq: midi(root), freqEnd: midi(root + 12), glide: 0.4 * k, gain: 0.16, attack: 0.02, decay: 0.5 * k, release: 0.06, panLfo: { rate: 0.6, depth: 0.9 }, send: 0.3, filter: { type: "lowpass", freq: 3000 } });
    v.tone({ type: "triangle", freq: midi(root + 12), freqEnd: midi(root), glide: 0.4 * k, gain: 0.16, attack: 0.02, decay: 0.5 * k, release: 0.06, panLfo: { rate: 0.6, depth: -0.9 }, send: 0.3, filter: { type: "lowpass", freq: 3000 } });
    bell(v, midi(root + 19), 0.45 * k, 0.1, { decay: 0.4 });
  },
  // 7 Teleport : balayage, « pop », étincelles.
  (v, { root, k }) => {
    sweepNoise(v, 300, 6000, { dur: 0.2 * k, gain: 0.22, q: 4, attack: 0.15 });
    v.tone({ at: 0.2 * k, freq: midi(root + 24), freqEnd: midi(root), glide: 0.05, gain: 0.35, attack: 0.001, decay: 0.07, release: 0.03 });
    sparkle(v, { at: 0.25 * k, count: 6, gap: 0.05, f0: 2800, spread: 2000, gain: 0.08, decay: 0.2 });
  },
  // 8 Duplicate : une note et son écho.
  (v, { root, k }) => {
    pluck(v, midi(root + 12), 0, 0.22, 0.3, -0.5);
    pluck(v, midi(root + 12), 0.16 * k, 0.16, 0.4, 0.5);
    pluck(v, midi(root + 12), 0.32 * k, 0.1, 0.5, -0.2);
  },
  // 9 Swap : deux notes qui s'échangent de côté.
  (v, { root, k }) => {
    pluck(v, midi(root + 12), 0, 0.2, 0.3, -0.7);
    pluck(v, midi(root + 19), 0.04, 0.2, 0.3, 0.7);
    pluck(v, midi(root + 19), 0.2 * k, 0.18, 0.4, -0.7);
    pluck(v, midi(root + 12), 0.24 * k, 0.18, 0.4, 0.7);
  },
  // 10 Spawn : étincelles qui s'assemblent en une note.
  (v, { root, k }) => {
    sparkle(v, { at: 0, count: 7, gap: 0.04, f0: 2000, spread: 2500, gain: 0.08, decay: 0.15 });
    bell(v, midi(root + 12), 0.32 * k, 0.2, { decay: 0.5 * k });
  },
  // 11 Revive : gong grave puis cloches qui montent.
  (v, { root, k }) => {
    fmBell(v, midi(root - 12), 0, 0.3, { ratio: 1.41, index: 1.2, decay: 0.8 * k, send: 0.5 });
    [0, 7, 12].forEach((d, i) => bell(v, midi(root + 12 + d), (0.3 + i * 0.12) * k, 0.14, { decay: 0.5 * k }));
  },
  // 12 Truce : accord posé, doux.
  (v, { root, k }) => {
    [0, 7, 12].forEach((d, i) =>
      v.tone({ type: "triangle", freq: midi(root + d), at: i * 0.03, gain: 0.12, attack: 0.1, decay: 0.8 * k, release: 0.15, send: 0.5, filter: { type: "lowpass", freq: 1800 } }),
    );
    bell(v, midi(root + 19), 0.2, 0.08, { decay: 0.6 * k });
  },
  // 13 Mirror : le même motif monte puis descend, de part et d'autre.
  (v, { root, k }) => {
    [0, 4, 7].forEach((d, i) => pluck(v, midi(root + 12 + d), i * 0.08 * k, 0.17, 0.35, -0.7));
    [7, 4, 0].forEach((d, i) => pluck(v, midi(root + 12 + d), (0.3 + i * 0.08) * k, 0.17, 0.35, 0.7));
  },
  // 14 Fog : souffle lent sur un bourdon.
  (v, { root, k }) => {
    sweepNoise(v, 400, 1400, { dur: 0.8 * k, gain: 0.14, q: 0.9, attack: 0.4 });
    v.tone({ type: "triangle", freq: midi(root - 12), gain: 0.14, attack: 0.3, decay: 0.7 * k, release: 0.2, send: 0.5, filter: { type: "lowpass", freq: 700 } });
  },
  // 15 Silence : une note qui s'éteint d'un coup étouffé.
  (v, { root, k }) => {
    v.tone({ type: "triangle", freq: midi(root + 12), freqEnd: midi(root), glide: 0.6 * k, gain: 0.18, attack: 0.01, decay: 0.6 * k, release: 0.05, send: 0.3 });
    thock(v, { at: 0.62 * k, body: midi(root - 12), click: 900, gain: 0.35, dull: 900 });
  },
];

export const FORGED_EFFECTS = GESTURES.length;

/**
 * Gain propre à chaque geste, comme `LEVELS` pour les 27 : mesuré sur le rendu hors ligne pour que toutes les
 * compétences forgées aient une présence comparable (RMS ~0,05, crête <= 0,27). Voir `forgedRecipe.test.ts`.
 */
const EFFECT_LEVEL = [1.4, 0.55, 1.5, 1.5, 1.3, 1.1, 1.8, 1.4, 2.4, 2.4, 1.25, 0.75, 1.0, 2.8, 1.35, 1.3];

export const forgedLevel = (effect: number): number => EFFECT_LEVEL[effect] ?? 1;

/** La recette d'un `SoundSpec` (un effet inconnu du client donne le geste le plus neutre). */
export function composeRecipe(spec: SoundSpec): SkillRecipe {
  const gesture = GESTURES[spec.effect] ?? GESTURES[1];
  const degree = Math.max(0, Math.min(SCALE.length - 1, spec.degree));
  const root = 57 + SCALE[degree] + (spec.timbre >= 2 ? 5 : 0);
  const bright = Math.max(0, Math.min(3, spec.timbre));
  const k = STRETCH[Math.max(0, Math.min(2, spec.length))];
  return (v) => gesture(v, { root, bright, k });
}
