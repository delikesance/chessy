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
