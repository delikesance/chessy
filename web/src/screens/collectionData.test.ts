import { describe, expect, it } from "vitest";
import { CATALOG } from "../catalog";
import { filterCatalog, RULES } from "./collectionData";

describe("collection", () => {
  it("fournit des règles pour chaque compétence du catalogue", () => {
    for (const c of CATALOG) expect(RULES[c.id], c.id).toBeTruthy();
    expect(Object.keys(RULES)).toHaveLength(CATALOG.length);
  });
  it("filtre par famille et par type", () => {
    expect(filterCatalog("all", "all")).toHaveLength(CATALOG.length);
    expect(filterCatalog("all", "unique").every((c) => c.unique)).toBe(true);
    expect(filterCatalog("all", "classic").every((c) => !c.unique)).toBe(true);
    expect(filterCatalog("attack", "all").every((c) => c.family === "attack")).toBe(true);
    expect(filterCatalog("defense", "unique")).toHaveLength(0);
  });
});
