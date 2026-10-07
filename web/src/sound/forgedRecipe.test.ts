// Les sons composés pour les compétences forgées tiennent les mêmes plafonds que les 27 écrits à la main :
// durée, crête, niveau perçu, et chaque geste est reconnaissable.
import { beforeAll, describe, expect, it, vi } from "vitest";
import type { SoundSpec } from "../forged";
import { composeRecipe, FORGED_EFFECTS, forgedLevel } from "./forgedRecipe";
import { SOUND_DEFAULTS } from "./index";
import { activeLength, distance, fingerprint, loudestRms, peakOf, renderRecipe, type Rendered } from "./offlineRender";

function seeded(seed: number) {
  let a = seed;
  return () => {
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const VARIANTS: [number, number, number][] = [
  [0, 0, 0],
  [3, 1, 1],
  [6, 3, 2],
];

const rendered = new Map<string, Rendered>();
const key = (s: SoundSpec) => `${s.effect}/${s.degree}/${s.timbre}/${s.length}`;

beforeAll(() => {
  const spy = vi.spyOn(Math, "random").mockImplementation(seeded(7));
  for (let effect = 0; effect < FORGED_EFFECTS; effect++) {
    for (const [degree, timbre, length] of VARIANTS) {
      const spec = { effect, degree, timbre, length };
      rendered.set(key(spec), renderRecipe(composeRecipe(spec), { master: SOUND_DEFAULTS.master, volume: SOUND_DEFAULTS.effects * forgedLevel(effect) }));
    }
  }
  spy.mockRestore();
}, 120_000);

describe("sons des compétences forgées", () => {
  it("couvrent les 16 effets du serveur", () => {
    expect(FORGED_EFFECTS).toBe(16);
  });

  it("durée de 0,5 à 1,7 s, crête <= 0,3, niveau perçu comparable à celui des 27", () => {
    for (const [k, r] of rendered) {
      const d = activeLength(r.mono);
      expect(d, `${k} durée`).toBeGreaterThanOrEqual(0.5);
      expect(d, `${k} durée`).toBeLessThanOrEqual(1.7);
      expect(peakOf(r), `${k} crête`).toBeLessThanOrEqual(0.3);
      expect(peakOf(r), `${k} audible`).toBeGreaterThanOrEqual(0.04);
      const rms = loudestRms(r.mono);
      expect(rms, `${k} rms`).toBeLessThanOrEqual(0.085);
      expect(rms, `${k} rms`).toBeGreaterThanOrEqual(0.02);
      expect(r.mono.every((x) => Number.isFinite(x)), `${k} NaN`).toBe(true);
    }
  });

  it("deux effets différents ne sonnent pas pareil", () => {
    const fps = Array.from({ length: FORGED_EFFECTS }, (_, effect) => ({ effect, fp: fingerprint(rendered.get(key({ effect, degree: 3, timbre: 1, length: 1 }))!) }));
    let min = Infinity;
    let pair = "";
    for (let i = 0; i < fps.length; i++) {
      for (let j = i + 1; j < fps.length; j++) {
        const d = distance(fps[i].fp, fps[j].fp);
        if (d < min) {
          min = d;
          pair = `${fps[i].effect}/${fps[j].effect}`;
        }
      }
    }
    expect(min, `paire la plus proche : ${pair}`).toBeGreaterThanOrEqual(1.2);
  });

  it("un effet inconnu du client donne un son plutôt qu'une erreur", () => {
    expect(() => composeRecipe({ effect: 99, degree: 99, timbre: 99, length: 99 })).not.toThrow();
  });
});
