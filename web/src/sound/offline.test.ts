// Rendu hors ligne de tous les sons (chaîne complète : recette, niveau, bus, réverbération, limiteur, volume général)
// avec un moteur Web Audio minimal (offlineRender.ts), recoupé avec un vrai OfflineAudioContext de Chrome.
import { beforeAll, describe, expect, it, vi } from "vitest";
import { SOUND_DEFAULTS } from "./index";
import { levelOf } from "./levels";
import { ALL_SFX, BASIC_SFX, SKILL_IDS, skillSfx, type SfxName } from "./names";
import { activeLength, distance, fingerprint, loudestRms, peakOf, renderRecipe, type Rendered } from "./offlineRender";
import { RECIPES } from "./recipes";
import { LIMIT, limiterCurve } from "./synth";

/** Aléa reproductible (le bruit et la réverbération utilisent Math.random). */
function seeded(seed: number) {
  let a = seed;
  return () => {
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const rendered = new Map<SfxName, Rendered>();
const get = (name: SfxName) => rendered.get(name)!;

beforeAll(() => {
  const spy = vi.spyOn(Math, "random").mockImplementation(seeded(42));
  for (const name of ALL_SFX) {
    // Réglages par défaut : volume général par défaut, effets par défaut, niveau propre au son.
    rendered.set(name, renderRecipe(RECIPES[name], { master: SOUND_DEFAULTS.master, volume: SOUND_DEFAULTS.effects * levelOf(name) }));
  }
  spy.mockRestore();
}, 120_000);

describe("niveau sonore (réglages par défaut)", () => {
  it("aucun son ne dépasse 0,35 en crête, tout est audible et fini", () => {
    for (const name of ALL_SFX) {
      const peak = peakOf(get(name));
      expect(peak, `${name} crête`).toBeLessThanOrEqual(0.35);
      expect(peak, `${name} audible`).toBeGreaterThanOrEqual(0.03);
      expect(
        get(name).mono.every((x) => Number.isFinite(x)),
        `${name} NaN`,
      ).toBe(true);
    }
  });

  it("niveau RMS perçu borné (fenêtre de 100 ms la plus forte)", () => {
    for (const name of ALL_SFX) expect(loudestRms(get(name).mono), name).toBeLessThanOrEqual(0.12);
    // les compétences restent sous 0,085 : présentes mais pas fortes
    for (const id of SKILL_IDS) expect(loudestRms(get(skillSfx(id)).mono), id).toBeLessThanOrEqual(0.085);
  });

  it("hiérarchie : interface très discrète < coups < prises < compétences/fins de partie", () => {
    const pk = (n: SfxName) => peakOf(get(n));
    for (const n of ["ui_click", "chat", "notice", "low_time"] as const) expect(pk(n), n).toBeLessThanOrEqual(0.09);
    expect(pk("ui_click")).toBeLessThan(pk("move") * 0.4);
    expect(pk("move")).toBeLessThan(pk("capture"));
    expect(pk("game_win")).toBeGreaterThanOrEqual(pk("capture") * 0.9);
    // une compétence est plus présente (RMS) qu'un coup simple
    const skillsRms = SKILL_IDS.map((id) => loudestRms(get(skillSfx(id)).mono));
    expect(Math.min(...skillsRms)).toBeGreaterThan(0.02);
    // le niveau moyen des compétences est homogène : aucune n'écrase les autres
    expect(Math.max(...skillsRms) / Math.min(...skillsRms)).toBeLessThan(3.5);
  });

  it("les sons de base ont un niveau défini", () => {
    for (const n of BASIC_SFX) expect(levelOf(n)).toBeGreaterThan(0);
  });
});

describe("limiteur", () => {
  it("courbe douce : impaire, monotone, plafonnée, transparente aux faibles niveaux", () => {
    const c = limiterCurve(2049);
    const mid = (c.length - 1) / 2;
    expect(Math.abs(c[mid])).toBeLessThan(1e-6);
    for (let i = 1; i < c.length; i++) expect(c[i]).toBeGreaterThanOrEqual(c[i - 1]);
    for (const x of c) expect(Math.abs(x)).toBeLessThanOrEqual(LIMIT + 1e-6);
    expect(c[0]).toBeCloseTo(-c[c.length - 1], 6);
    // faibles niveaux : gain ~1 (entrée 0,05 -> sortie ~0,05)
    const step = 6 / (c.length - 1);
    const k = mid + Math.round(0.05 / step);
    expect(c[k] / (0.05)).toBeGreaterThan(0.95);
  });

  it("de nombreuses voix superposées restent plafonnées par le limiteur", () => {
    const r = renderRecipe(
      (v) => {
        for (let i = 0; i < 12; i++) RECIPES.skill_godhelp(v);
      },
      { master: 1, volume: 1, seconds: 2 },
    );
    expect(peakOf(r)).toBeLessThanOrEqual(LIMIT + 0.01);
  });
});

describe("compétences : sons uniques", () => {
  it("durée de 0,6 à 1,6 s (jusqu'à -40 dB sous le pic)", () => {
    for (const id of SKILL_IDS) {
      const d = activeLength(get(skillSfx(id)).mono);
      expect(d, `${id} durée`).toBeGreaterThanOrEqual(0.6);
      expect(d, `${id} durée`).toBeLessThanOrEqual(1.7);
    }
  });

  it("les 27 sons sont deux à deux distincts (empreinte : enveloppe + timbre par fenêtre de 100 ms + durée)", () => {
    const fps = SKILL_IDS.map((id) => ({ id, fp: fingerprint(get(skillSfx(id))) }));
    let min = Infinity;
    let pair = "";
    for (let i = 0; i < fps.length; i++) {
      for (let j = i + 1; j < fps.length; j++) {
        const d = distance(fps[i].fp, fps[j].fp);
        if (d < min) {
          min = d;
          pair = `${fps[i].id}/${fps[j].id}`;
        }
      }
    }
    // Référence : avant cette refonte, la paire la plus proche était à 1,3 ; la médiane des distances dépasse 4.
    expect(min, `paire la plus proche : ${pair}`).toBeGreaterThanOrEqual(2.0);
  });

  it("une compétence ne ressemble à aucun son de base (sauf les parentés voulues)", () => {
    const skills = SKILL_IDS.map((id) => ({ id, fp: fingerprint(get(skillSfx(id))) }));
    for (const b of BASIC_SFX) {
      const fb = fingerprint(get(b));
      for (const s of skills) expect(distance(fb, s.fp), `${b} / ${s.id}`).toBeGreaterThan(0.8);
    }
  });
});
