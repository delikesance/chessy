import { describe, expect, it } from "vitest";
import { CATALOG, skillEntry } from "./catalog";

describe("catalog", () => {
  it("lists the 27 skills, 7 of them unique and 7 playable", () => {
    expect(CATALOG).toHaveLength(27);
    expect(new Set(CATALOG.map((c) => c.id)).size).toBe(27);
    expect(CATALOG.filter((c) => c.unique)).toHaveLength(7);
    expect(CATALOG.filter((c) => c.implemented).map((c) => c.id).sort()).toEqual(
      ["clone", "destiny_swapper", "freeze", "imune", "remover", "rollback", "teleportation"],
    );
  });

  it("gives unknown ids a neutral entry", () => {
    expect(skillEntry("mystery_skill").name).toBe("Mystery skill");
  });
});
