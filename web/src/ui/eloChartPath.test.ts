import { describe, expect, it } from "vitest";
import { buildChart } from "./eloChartPath";

const box = { width: 100, height: 50, padX: 10, padY: 5 };

describe("buildChart", () => {
  it("renvoie null sans données", () => {
    expect(buildChart([], box)).toBeNull();
  });

  it("place le minimum en bas et le maximum en haut, espacés régulièrement", () => {
    const g = buildChart([1200, 1300, 1250], box)!;
    expect(g.points.map((p) => p.x)).toEqual([10, 50, 90]);
    expect(g.points[1].y).toBe(5);
    expect(g.points[0].y).toBe(45);
    expect(g.points[2].y).toBe(25);
    expect(g.polyline).toBe("10,45 50,5 90,25");
    expect([g.min, g.max]).toEqual([1200, 1300]);
  });

  it("trace une droite pour un point unique ou une série plate", () => {
    const one = buildChart([1200], box)!;
    expect(one.points).toHaveLength(2);
    expect(one.points[0].y).toBe(one.points[1].y);
    const flat = buildChart([1200, 1200, 1200], box)!;
    expect(new Set(flat.points.map((p) => p.y)).size).toBe(1);
  });

  it("garde tous les points dans le cadre", () => {
    const g = buildChart([1200, 1180, 1215, 1190, 1300, 1100], box)!;
    for (const p of g.points) {
      expect(p.x).toBeGreaterThanOrEqual(10);
      expect(p.x).toBeLessThanOrEqual(90);
      expect(p.y).toBeGreaterThanOrEqual(5);
      expect(p.y).toBeLessThanOrEqual(45);
    }
  });
});
