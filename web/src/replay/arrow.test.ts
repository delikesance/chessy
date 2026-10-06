import { describe, expect, it } from "vitest";
import { FRAME, SIZE, TILE } from "../game/textures";
import { sq } from "./fixtures";
import { arrowGeometry, arrowSquares, BOARD_VIEWBOX, squareCenter } from "./arrow";

describe("flèche du meilleur coup", () => {
  it("place les cases selon l'orientation", () => {
    expect(BOARD_VIEWBOX).toBe(SIZE);
    // a1 en bas à gauche pour les blancs.
    expect(squareCenter(sq("a1"), "white")).toEqual({ x: FRAME + TILE / 2, y: FRAME + 7 * TILE + TILE / 2 });
    // h1 en haut à gauche pour les noirs (plateau retourné).
    expect(squareCenter(sq("h1"), "black")).toEqual({ x: FRAME + TILE / 2, y: FRAME + TILE / 2 });
    const w = squareCenter(sq("e4"), "white");
    const b = squareCenter(sq("e4"), "black");
    expect(w.x + b.x).toBe(2 * FRAME + 8 * TILE);
    expect(w.y + b.y).toBe(2 * FRAME + 8 * TILE);
  });

  it("ne fléche que les coups simples", () => {
    expect(arrowSquares({ type: "move", from: 12, to: 28 })).toEqual({ from: 12, to: 28 });
    expect(arrowSquares({ type: "skill", skill: "tornado", target: { kind: "none" } })).toBeNull();
    expect(arrowSquares(null)).toBeNull();
  });

  it("calcule une flèche qui part près de la case de départ et pointe sur la case d'arrivée", () => {
    const g = arrowGeometry(sq("e2"), sq("e4"), "white")!;
    const from = squareCenter(sq("e2"), "white");
    const to = squareCenter(sq("e4"), "white");
    expect(g.x1).toBe(from.x);
    expect(g.y1).toBeLessThan(from.y);
    expect(g.y2).toBeGreaterThan(to.y);
    expect(g.head.split(" ")).toHaveLength(3);
    const tip = g.head.split(" ")[0].split(",").map(Number);
    expect(tip[0]).toBe(to.x);
    expect(Math.abs(tip[1] - to.y)).toBeLessThan(TILE / 2);
  });

  it("n'a pas de flèche entre deux cases identiques", () => {
    expect(arrowGeometry(5, 5, "white")).toBeNull();
  });
});
