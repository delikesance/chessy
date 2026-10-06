import { describe, expect, it } from "vitest";
import { buildCurve, cpToUnit, curveMarks, evalSeries, indexFromX, xForIndex } from "./evalCurve";
import { fixtureAnalysis, fixtureRecord } from "./fixtures";

const record = fixtureRecord();
const analysis = fixtureAnalysis(3, record);

describe("courbe d'évaluation", () => {
  it("construit une série de plies + 1 valeurs, départ compris", () => {
    const series = evalSeries(analysis, record.plies);
    expect(series).toHaveLength(record.plies + 1);
    expect(series[0]).toBe(analysis.plies[0].best!.eval_cp);
    expect(series[record.plies]).toBe(-900);
  });

  it("reprend l'évaluation précédente pour une position non analysée et borne à ±2000", () => {
    const partial = { ...analysis, plies: [{ ...analysis.plies[0], eval_cp: 5000 }, { ...analysis.plies[2], eval_cp: -9999 }] };
    const series = evalSeries(partial, 4);
    expect(series).toEqual([30, 2000, 2000, -2000, -2000]);
  });

  it("démarre à 0 sans meilleur coup initial", () => {
    expect(evalSeries({ ...analysis, plies: [] }, 2)).toEqual([0, 0, 0]);
  });

  it("compresse les évaluations de façon monotone et symétrique", () => {
    expect(cpToUnit(0)).toBe(0);
    expect(cpToUnit(300)).toBeGreaterThan(cpToUnit(100));
    expect(cpToUnit(-300)).toBeCloseTo(-cpToUnit(300));
    expect(cpToUnit(2000)).toBeLessThanOrEqual(1);
    expect(cpToUnit(99999)).toBe(cpToUnit(2000));
  });

  it("place les blancs en haut : avantage blanc = ordonnée plus petite", () => {
    const curve = buildCurve([0, 400, -400], 300, 100);
    expect(curve.mid).toBe(50);
    expect(curve.points[0].y).toBe(50);
    expect(curve.points[1].y).toBeLessThan(50);
    expect(curve.points[2].y).toBeGreaterThan(50);
    expect(curve.points.map((p) => p.x)).toEqual([0, 150, 300]);
    expect(curve.line.startsWith("M0 50 L150")).toBe(true);
    expect(curve.area.endsWith("Z")).toBe(true);
  });

  it("gère une courbe vide ou d'un seul point", () => {
    expect(buildCurve([], 100, 50).line).toBe("");
    const one = buildCurve([100], 100, 50);
    expect(one.points[0].x).toBe(50);
  });

  it("convertit un clic en indice et inversement", () => {
    expect(indexFromX(0, 300, 10)).toBe(0);
    expect(indexFromX(300, 300, 10)).toBe(10);
    expect(indexFromX(155, 300, 10)).toBe(5);
    expect(indexFromX(-40, 300, 10)).toBe(0);
    expect(indexFromX(999, 300, 10)).toBe(10);
    expect(indexFromX(10, 300, 0)).toBe(0);
    expect(xForIndex(5, 10, 300)).toBe(150);
  });

  it("repère les erreurs et les gaffes seulement", () => {
    const curve = buildCurve(evalSeries(analysis, record.plies), 400, 100);
    const marks = curveMarks(analysis, curve);
    expect(marks.map((m) => [m.index, m.label])).toEqual([[15, "blunder"]]);
    expect(marks[0].x).toBe(curve.points[15].x);
  });
});
