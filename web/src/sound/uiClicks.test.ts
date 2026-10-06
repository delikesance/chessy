import { describe, expect, it } from "vitest";
import { parseHash } from "../router";
import { shouldClickSound } from "./uiClicks";

interface Fake {
  tags: string[];
  attrs?: string[];
  parent?: Fake;
  closest(sel: string): Fake | null;
  hasAttribute(name: string): boolean;
}

/** Faux élément : `closest` teste une liste de classes/sélecteurs simplifiés. */
function el(tags: string[], parent?: Fake, attrs: string[] = []): Fake {
  const self: Fake = {
    tags,
    attrs,
    parent,
    hasAttribute: (n) => attrs.includes(n),
    closest(sel) {
      const wanted = sel.split(",").map((s) => s.trim());
      const matches = (node: Fake) =>
        wanted.some((w) => {
          if (w === 'button.btn' || w === "a.btn") return node.tags.includes("btn");
          if (w === ".nav-tab") return node.tags.includes("nav-tab");
          if (w === ".seg > button") return node.tags.includes("seg-btn");
          if (w === ".nav-chip") return node.tags.includes("nav-chip");
          if (w === '[data-sfx="click"]') return node.tags.includes("sfx-click");
          if (w === '[data-sfx="off"]') return node.tags.includes("sfx-off");
          if (w === ".gm-veil") return node.tags.includes("gm-veil");
          if (w === ".gm-board") return node.tags.includes("gm-board");
          return false;
        });
      for (let n: Fake | undefined = self; n; n = n.parent) if (matches(n)) return n;
      return null;
    },
  };
  return self;
}

describe("clics d'interface", () => {
  it("boutons principaux : un son", () => {
    expect(shouldClickSound(el(["btn"]))).toBe(true);
    expect(shouldClickSound(el(["nav-tab"]))).toBe(true);
    expect(shouldClickSound(el(["seg-btn"]))).toBe(true);
  });
  it("autres éléments, désactivés, plateau, voiles et aperçus : silence", () => {
    expect(shouldClickSound(el(["other"]))).toBe(false);
    expect(shouldClickSound(el(["btn"], undefined, ["disabled"]))).toBe(false);
    expect(shouldClickSound(el(["btn"], el(["gm-veil"])))).toBe(false);
    expect(shouldClickSound(el(["btn"], el(["gm-board"])))).toBe(false);
    expect(shouldClickSound(el(["btn", "sfx-off"]))).toBe(false);
    expect(shouldClickSound(null)).toBe(false);
    expect(shouldClickSound({})).toBe(false);
  });
});

describe("route des réglages", () => {
  it("#/settings", () => {
    expect(parseHash("#/settings")).toEqual({ name: "settings" });
  });
});
