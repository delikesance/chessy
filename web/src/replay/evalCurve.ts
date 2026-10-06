// Courbe d'évaluation (SVG) : géométrie pure, sans React. Les blancs sont en haut, les noirs en bas.

import type { Analysis, AnalysisLabel } from "../protocol";
import { clamp } from "./frames";

export const EVAL_CAP = 2000;

export interface CurvePoint {
  /** Indice de position (0 = position initiale). */
  index: number;
  cp: number;
  x: number;
  y: number;
}

export interface EvalCurve {
  width: number;
  height: number;
  /** Ordonnée de la ligne d'égalité. */
  mid: number;
  points: CurvePoint[];
  /** Tracé de la courbe. */
  line: string;
  /** Surface entre la courbe et la ligne d'égalité (à rogner au-dessus / au-dessous de `mid`). */
  area: string;
}

/**
 * Évaluation après chaque position, de l'indice 0 à `plies`. L'évaluation initiale vient du meilleur coup
 * du premier camp (à défaut : 0) ; une position non analysée reprend l'évaluation précédente.
 */
export function evalSeries(analysis: Analysis, plies: number): number[] {
  const byPly = new Map(analysis.plies.map((p) => [p.ply, p]));
  const first = byPly.get(1)?.best?.eval_cp ?? 0;
  const out: number[] = [clamp(first, -EVAL_CAP, EVAL_CAP)];
  for (let ply = 1; ply <= plies; ply++) {
    const cp = byPly.get(ply)?.eval_cp;
    out.push(cp === undefined ? out[ply - 1] : clamp(cp, -EVAL_CAP, EVAL_CAP));
  }
  return out;
}

/** Compression douce de -2000..2000 vers -1..1 : les petits avantages restent lisibles. */
export function cpToUnit(cp: number): number {
  return Math.tanh(clamp(cp, -EVAL_CAP, EVAL_CAP) / 700);
}

export function xForIndex(index: number, last: number, width: number): number {
  return last <= 0 ? width / 2 : (index / last) * width;
}

/** Position cliquée (`x` dans le repère du SVG) → indice de position le plus proche. */
export function indexFromX(x: number, width: number, last: number): number {
  if (last <= 0 || width <= 0) return 0;
  return clamp(Math.round((x / width) * last), 0, last);
}

export function buildCurve(series: number[], width: number, height: number, pad = 6): EvalCurve {
  const mid = height / 2;
  const last = Math.max(0, series.length - 1);
  const amp = Math.max(0, mid - pad);
  const points = series.map((cp, index) => ({
    index,
    cp,
    x: round(xForIndex(index, last, width)),
    y: round(mid - cpToUnit(cp) * amp),
  }));
  const line = points.length ? `M${points.map((p) => `${p.x} ${p.y}`).join(" L")}` : "";
  const area = points.length
    ? `M${points[0].x} ${mid} L${points.map((p) => `${p.x} ${p.y}`).join(" L")} L${points[points.length - 1].x} ${mid} Z`
    : "";
  return { width, height, mid, points, line, area };
}

const round = (n: number) => Math.round(n * 100) / 100;

export interface CurveMark {
  index: number;
  x: number;
  y: number;
  label: AnalysisLabel;
}

/** Repères sur la courbe pour les coups à éviter (erreurs et gaffes). */
export function curveMarks(analysis: Analysis, curve: EvalCurve): CurveMark[] {
  const marks: CurveMark[] = [];
  for (const p of analysis.plies) {
    if (p.label !== "mistake" && p.label !== "blunder") continue;
    const point = curve.points[p.ply];
    if (point) marks.push({ index: p.ply, x: point.x, y: point.y, label: p.label });
  }
  return marks;
}
