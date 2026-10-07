import { describe, expect, it } from "vitest";
import { ACCENTS, applyTheme, BOARD_THEMES, luminance, mixHex, PIECE_SETS, premoveColor, sanitizeTheme, THEME_DEFAULTS } from "./theme";

describe("theme", () => {
  it("contient les thèmes de la spec", () => {
    expect(BOARD_THEMES.map((b) => b.id)).toEqual(["obsidian", "graphite", "emerald", "walnut", "ocean", "amethyst", "coral"]);
    expect(BOARD_THEMES[0]).toMatchObject({ light: "#33496a", dark: "#15233b" });
    expect(BOARD_THEMES[1]).toMatchObject({ light: "#cdd1d9", dark: "#69727f" });
    expect(PIECE_SETS.map((p) => p.id)).toEqual(["hextech", "classic", "neon", "gold", "ember"]);
    expect(ACCENTS.map((a) => a.id)).toEqual(["gold", "blue", "violet", "coral", "amber", "mint", "rose"]);
    expect(ACCENTS[0].color).toBe("#e3c98a");
    expect(ACCENTS[1].color).toBe("#8fb4ff");
  });

  it("assainit les valeurs inconnues", () => {
    expect(sanitizeTheme(null)).toEqual(THEME_DEFAULTS);
    expect(sanitizeTheme({ board: "nope", pieces: "gold", accent: 3, move: "click", premove: false })).toMatchObject({
      board: "obsidian",
      pieces: "gold",
      accent: "gold",
      move: "click",
      premove: false,
    });
  });

  it("mixHex et premoveColor", () => {
    expect(mixHex("#000000", "#ffffff", 0.5)).toBe("#808080");
    expect(mixHex("#102030", "#102030", 0.7)).toBe("#102030");
    expect(premoveColor("blue")).toMatch(/^#[0-9a-f]{6}$/);
    expect(premoveColor("blue")).not.toBe("#8fb4ff");
    expect(premoveColor("gold")).toMatch(/^#[0-9a-f]{6}$/);
  });

  it("luminance distingue clair et foncé", () => {
    expect(luminance("#ffffff")).toBeGreaterThan(0.9);
    expect(luminance("#000000")).toBe(0);
  });

  it("applyTheme écrit les variables CSS", () => {
    const props = new Map<string, string>();
    const root = { style: { setProperty: (k: string, v: string) => props.set(k, v) }, dataset: {} as Record<string, string> } as unknown as HTMLElement;
    applyTheme({ ...THEME_DEFAULTS, board: "walnut", accent: "mint", reduceMotion: true }, root);
    expect(props.get("--board-light")).toBe("#f0d9b5");
    expect(props.get("--board-dark")).toBe("#b58863");
    expect(props.get("--accent")).toBe("#5fd0a0");
    expect(root.dataset.motion).toBe("reduce");
  });
});
