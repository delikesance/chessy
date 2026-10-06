import { describe, expect, it } from "vitest";
import { CATALOG } from "../catalog";
import { animClass, BOARD_SIZE, GLYPHS, resolveItem, SCENES } from "./skillScenes";
import type { Cell } from "./skillScenes";

const inBoard = ([c, r]: Cell) => c >= 0 && r >= 0 && c < BOARD_SIZE && r < BOARD_SIZE;
const MOVING = new Set(["mv", "hit", "mvout", "inmv"]);

describe("skill preview scenes", () => {
  it("has exactly one non-empty scene per catalog skill", () => {
    for (const { id } of CATALOG) expect(SCENES[id]?.length, `scene for ${id}`).toBeGreaterThan(0);
    expect(Object.keys(SCENES).sort()).toEqual(CATALOG.map((c) => c.id).sort());
  });

  it("keeps every item on the board, with a destination where the animation moves", () => {
    for (const [id, scene] of Object.entries(SCENES)) {
      for (const item of scene) {
        expect(inBoard(item.at), `${id}: ${item.s} at ${item.at}`).toBe(true);
        if (item.anim && MOVING.has(item.anim)) {
          expect(item.to, `${id}: ${item.s} needs a destination`).toBeDefined();
          expect(inBoard(item.to!), `${id}: ${item.s} destination`).toBe(true);
        }
        if (!item.s.includes(":")) expect(GLYPHS as readonly string[], `${id}: glyph ${item.s}`).toContain(item.s);
      }
    }
  });

  it("animates something in every scene and has a distinct before and after", () => {
    for (const [id, scene] of Object.entries(SCENES)) {
      expect(scene.some((i) => i.anim), `${id} animates`).toBe(true);
      const snap = (s: "before" | "after") =>
        JSON.stringify(scene.map((i) => resolveItem(i, s)));
      expect(snap("before"), `${id} before/after differ`).not.toEqual(snap("after"));
    }
  });

  it("derives static states from the animation kind", () => {
    const pawn = { s: "w:pawn", at: [1, 1], anim: "mv", to: [3, 3] } as const;
    expect(resolveItem(pawn, "before")?.at).toEqual([1, 1]);
    expect(resolveItem(pawn, "after")?.at).toEqual([3, 3]);
    expect(resolveItem({ s: "w:pawn", at: [0, 0], anim: "out" }, "after")).toBeNull();
    expect(resolveItem({ s: "w:pawn", at: [0, 0], anim: "pop" }, "before")).toBeNull();
    expect(animClass({ s: "ice", at: [0, 0], anim: "pop", ph: "b" })).toBe("sv-pop-b");
    expect(animClass({ s: "swirl", at: [0, 0], anim: "spin" })).toBe("sv-spin");
  });
});
