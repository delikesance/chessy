import { describe, expect, it } from "vitest";
import { CATALOG, skillEntry } from "./catalog";

describe("catalog", () => {
  it("lists the 27 skills, 7 of them unique, all playable", () => {
    expect(CATALOG).toHaveLength(27);
    expect(new Set(CATALOG.map((c) => c.id)).size).toBe(27);
    expect(CATALOG.filter((c) => c.unique)).toHaveLength(7);
    expect(CATALOG.every((c) => c.implemented)).toBe(true);
  });

  it("uses the server skill ids", () => {
    const ids = CATALOG.map((c) => c.id).sort();
    expect(ids).toEqual(
      [
        "teleportation", "imune", "freeze", "rollback", "clone", "destiny_swapper", "remover",
        "wall", "mirage", "evolve", "switch", "mind", "control", "morph", "canceller", "tornado",
        "invisibility", "terminator", "trap", "bench", "forcefield", "transposition", "queensac",
        "temporal", "geomancy", "celestial", "godhelp",
      ].sort(),
    );
  });

  it("gives unknown ids a neutral entry", () => {
    expect(skillEntry("mystery_skill").name).toBe("Mystery skill");
  });
});
