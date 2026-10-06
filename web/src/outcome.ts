import type { Color, Outcome } from "./protocol";

/** One-line French description of how a game ended, from `you`'s point of view. */
export function describeOutcome(outcome: Outcome, you: Color): string {
  switch (outcome.type) {
    case "ongoing":
      return "";
    case "checkmate":
      return outcome.winner === you ? "Échec et mat : vous avez gagné !" : "Échec et mat : vous avez perdu.";
    case "resignation":
      return outcome.winner === you ? "Votre adversaire a abandonné : victoire !" : "Vous avez abandonné.";
    case "timeout":
      return outcome.winner === you ? "Temps écoulé pour l'adversaire : victoire !" : "Votre temps est écoulé.";
    case "draw_agreed":
      return "Nulle par accord mutuel.";
    case "stalemate":
      return "Pat : partie nulle.";
    case "fifty_moves":
      return "Règle des 50 coups : partie nulle.";
    case "repetition":
      return "Triple répétition : partie nulle.";
    case "insufficient_material":
      return "Matériel insuffisant : partie nulle.";
  }
}

export type Result = "win" | "loss" | "draw";

/** Résultat du point de vue de `you`. */
export function resultFor(outcome: Outcome, you: Color): Result | null {
  if (outcome.type === "ongoing") return null;
  if ("winner" in outcome) return outcome.winner === you ? "win" : "loss";
  return "draw";
}

/** Titre court + motif pour le panneau de fin de partie. */
export function resultHeadline(outcome: Outcome, you: Color): { title: string; reason: string } {
  const result = resultFor(outcome, you);
  const title = result === "win" ? "Victoire" : result === "loss" ? "Défaite" : "Partie nulle";
  const reasons: Record<string, [string, string]> = {
    checkmate: ["Échec et mat", "Échec et mat"],
    resignation: ["Abandon de l'adversaire", "Vous avez abandonné"],
    timeout: ["Temps écoulé pour l'adversaire", "Votre temps est écoulé"],
    draw_agreed: ["Nulle par accord mutuel", "Nulle par accord mutuel"],
    stalemate: ["Pat", "Pat"],
    fifty_moves: ["Règle des 50 coups", "Règle des 50 coups"],
    repetition: ["Triple répétition", "Triple répétition"],
    insufficient_material: ["Matériel insuffisant", "Matériel insuffisant"],
  };
  const pair = reasons[outcome.type];
  return { title, reason: pair ? (result === "loss" ? pair[1] : pair[0]) : "" };
}

/** Variation d'Elo formatée avec un vrai signe moins : `+14`, `−9`, `±0`. */
export function formatDelta(delta: number): string {
  if (delta > 0) return `+${delta}`;
  if (delta < 0) return `−${Math.abs(delta)}`;
  return "±0";
}
