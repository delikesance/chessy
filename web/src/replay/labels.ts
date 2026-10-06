// Libellés, couleurs et phrases de l'analyse (docs/spec-v4.md §2 et §5). Pur et testable.

import type { Analysis, AnalysisLabel, Color, LabelCounts, MoveInfo, PlyAnalysis } from "../protocol";
import { COLOR_FR } from "./frames";

/** Du meilleur au pire. */
export const LABEL_ORDER: AnalysisLabel[] = ["best", "good", "inaccuracy", "mistake", "blunder"];

export const LABEL_TEXT: Record<AnalysisLabel, string> = {
  best: "Meilleur coup",
  good: "Bon coup",
  inaccuracy: "Imprécision",
  mistake: "Erreur",
  blunder: "Gaffe",
};

/** Forme courte (tableau récapitulatif). */
export const LABEL_SHORT: Record<AnalysisLabel, string> = {
  best: "Meilleur",
  good: "Bon",
  inaccuracy: "Imprécision",
  mistake: "Erreur",
  blunder: "Gaffe",
};

/** Pluriels du résumé (« 2 gaffes »). */
export const LABEL_PLURAL: Record<AnalysisLabel, string> = {
  best: "meilleurs coups",
  good: "bons coups",
  inaccuracy: "imprécisions",
  mistake: "erreurs",
  blunder: "gaffes",
};

/** Symbole accolé à la pastille : la couleur ne porte jamais seule l'information. */
export const LABEL_GLYPH: Record<AnalysisLabel, string> = {
  best: "★",
  good: "✓",
  inaccuracy: "?!",
  mistake: "?",
  blunder: "??",
};

/**
 * Couleurs distinctes, sans vert vif : « meilleur » en bleu, « bon » en gris-bleu, imprécision ambre,
 * erreur orange, gaffe rouge. Définies en CSS par `--lb-<label>` (voir replay.css), reprises ici pour le SVG.
 */
export const LABEL_COLOR: Record<AnalysisLabel, string> = {
  best: "#7aa2ff",
  good: "#9aa3b2",
  inaccuracy: "#eec06a",
  mistake: "#f0955a",
  blunder: "#e5484d",
};

export function isLabel(value: unknown): value is AnalysisLabel {
  return typeof value === "string" && (LABEL_ORDER as string[]).includes(value);
}

/** Seuils du serveur (perte en centipions). */
export function labelFromLoss(loss: number): AnalysisLabel {
  if (loss <= 10) return "best";
  if (loss <= 50) return "good";
  if (loss <= 120) return "inaccuracy";
  if (loss <= 300) return "mistake";
  return "blunder";
}

/** Analyse indexée par numéro d'action. */
export function analysisByPly(analysis: Analysis | null | undefined): Map<number, PlyAnalysis> {
  const map = new Map<number, PlyAnalysis>();
  if (analysis) for (const p of analysis.plies) map.set(p.ply, p);
  return map;
}

/** Évaluation en pions, du point de vue des blancs : `+0,8`, `−1,3`, `0,0`, `+mat`. */
export function formatEval(cp: number): string {
  if (Math.abs(cp) >= 2000) return cp > 0 ? "+mat" : "−mat";
  const pawns = Math.round(Math.abs(cp) / 10) / 10;
  if (pawns === 0) return "0,0";
  const text = pawns.toFixed(1).replace(".", ",");
  return cp > 0 ? `+${text}` : `−${text}`;
}

/** Précision `87 %` (arrondie, bornée à 0..100). */
export function formatAccuracy(value: number): string {
  return `${Math.round(Math.min(100, Math.max(0, value)))} %`;
}

export type Subject = "you" | Color;

/** « Vous avez joué » / « Les blancs ont joué ». */
export function playedPhrase(subject: Subject): string {
  return subject === "you" ? "Vous avez joué" : `Les ${COLOR_FR[subject]} ont joué`;
}

/**
 * Phrase du panneau d'analyse : « Vous avez joué Fg5 ; le meilleur coup était Cf3 (+0,8). »
 * `null` sans analyse de ce coup.
 */
export function bestMoveSentence(move: MoveInfo, analysis: PlyAnalysis | undefined, subject: Subject): string | null {
  if (!analysis) return null;
  const who = playedPhrase(subject);
  const best = analysis.best;
  if (analysis.label === "best" || (best && best.notation === move.notation)) {
    return `${who} ${move.notation} : c'est le meilleur coup.`;
  }
  if (!best) return `${who} ${move.notation} (${formatEval(analysis.eval_cp)}).`;
  return `${who} ${move.notation} ; le meilleur coup était ${best.notation} (${formatEval(best.eval_cp)}).`;
}

/** Total de coups étiquetés « mauvais » (imprécision, erreur, gaffe) d'un camp. */
export function mistakeTotal(counts: LabelCounts): number {
  return counts.inaccuracy + counts.mistake + counts.blunder;
}

/** « 2 gaffes, 1 erreur » : uniquement les catégories non vides, de la pire à la moins grave. */
export function summarySentence(counts: LabelCounts): string {
  const parts: string[] = [];
  for (const label of ["blunder", "mistake", "inaccuracy"] as const) {
    const n = counts[label];
    if (n > 0) parts.push(`${n} ${n > 1 ? LABEL_PLURAL[label] : LABEL_TEXT[label].toLowerCase()}`);
  }
  return parts.length ? parts.join(", ") : "Aucune erreur";
}
