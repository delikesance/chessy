// Premoves : un coup posé pendant le tour de l'adversaire (côté client uniquement, aucun changement de protocole).
// Logique pure, sans React ni Phaser. Les cases proposées sont purement géométriques : ni obstacles ni échecs.

import type { Highlights, PendingPromotion } from "./interaction";
import type { Color, Move, Piece, PieceKind, Square, StateView } from "./protocol";

export interface Premove {
  from: Square;
  to: Square;
  /** Promotion choisie (dame par défaut) quand le pion atteint la dernière rangée. */
  promo?: PieceKind;
}

export const PROMO_OPTIONS: PieceKind[] = ["queen", "rook", "bishop", "knight"];

const file = (s: Square) => s % 8;
const rank = (s: Square) => Math.floor(s / 8);

const KNIGHT_JUMPS: [number, number][] = [[1, 2], [2, 1], [2, -1], [1, -2], [-1, -2], [-2, -1], [-2, 1], [-1, 2]];
const KING_STEPS: [number, number][] = [[1, 0], [-1, 0], [0, 1], [0, -1], [1, 1], [1, -1], [-1, 1], [-1, -1]];
const DIAGONALS: [number, number][] = [[1, 1], [1, -1], [-1, 1], [-1, -1]];
const ORTHOGONALS: [number, number][] = [[1, 0], [-1, 0], [0, 1], [0, -1]];

const inside = (f: number, r: number) => f >= 0 && f < 8 && r >= 0 && r < 8;
const sq = (f: number, r: number) => r * 8 + f;

/** Case de départ du roi (e1 / e8). */
const kingHome = (color: Color): Square => (color === "white" ? 4 : 60);

/** Rangée de promotion d'un pion de `color`. */
export const promotionRank = (color: Color) => (color === "white" ? 7 : 0);

/**
 * Cases que la pièce de `from` atteindrait géométriquement. Les pièces adverses et les obstacles
 * sont ignorés, mais jamais une case occupée par l'une de nos propres pièces.
 */
export function premoveTargets(board: (Piece | null)[], from: Square, color: Color): Square[] {
  const piece = board[from];
  if (!piece || piece.color !== color) return [];
  const f0 = file(from);
  const r0 = rank(from);
  const out: Square[] = [];
  const add = (f: number, r: number) => {
    if (!inside(f, r)) return;
    const s = sq(f, r);
    const occupant = board[s];
    if (occupant && occupant.color === color) return;
    if (!out.includes(s)) out.push(s);
  };
  const ray = (dirs: [number, number][]) => {
    for (const [df, dr] of dirs) {
      for (let k = 1; k < 8; k++) add(f0 + df * k, r0 + dr * k);
    }
  };
  switch (piece.kind) {
    case "knight":
      for (const [df, dr] of KNIGHT_JUMPS) add(f0 + df, r0 + dr);
      break;
    case "king":
      for (const [df, dr] of KING_STEPS) add(f0 + df, r0 + dr);
      // Roque : le roi de deux cases depuis sa case de départ (rochade éventuelle jugée à l'exécution).
      if (from === kingHome(color)) {
        add(f0 + 2, r0);
        add(f0 - 2, r0);
      }
      break;
    case "bishop":
      ray(DIAGONALS);
      break;
    case "rook":
      ray(ORTHOGONALS);
      break;
    case "queen":
      ray(DIAGONALS);
      ray(ORTHOGONALS);
      break;
    case "pawn": {
      const dir = color === "white" ? 1 : -1;
      const start = color === "white" ? 1 : 6;
      add(f0, r0 + dir);
      if (r0 === start) add(f0, r0 + 2 * dir);
      // Diagonales avant, même vides : une capture peut devenir possible.
      add(f0 - 1, r0 + dir);
      add(f0 + 1, r0 + dir);
      break;
    }
  }
  return out;
}

/** Le pion de `from` atteint-il la dernière rangée en allant sur `to` ? */
export function premoveNeedsPromo(board: (Piece | null)[], from: Square, to: Square): boolean {
  const piece = board[from];
  return !!piece && piece.kind === "pawn" && rank(to) === promotionRank(piece.color);
}

/** Un premove peut être posé : partie en cours, ce n'est pas notre tour. */
export function premoveAllowed(view: Pick<StateView, "outcome" | "to_move" | "you">, enabled = true): boolean {
  return enabled && view.outcome.type === "ongoing" && view.to_move !== view.you;
}

/** Le premove a-t-il encore un sens ? (partie en cours, la pièce d'origine est toujours là et à nous) */
export function premoveStillPossible(view: Pick<StateView, "outcome" | "board" | "you">, pm: Premove): boolean {
  if (view.outcome.type !== "ongoing") return false;
  const piece = view.board[pm.from];
  return !!piece && piece.color === view.you;
}

export type PremoveResolution =
  | { action: "send"; move: Move }
  | { action: "drop"; reason: "not_turn" | "over" | "gone" | "illegal" };

/** Au début de notre tour : le premove figure-t-il dans les coups légaux ? */
export function resolvePremove(view: StateView, pm: Premove): PremoveResolution {
  if (view.outcome.type !== "ongoing") return { action: "drop", reason: "over" };
  if (view.to_move !== view.you) return { action: "drop", reason: "not_turn" };
  const piece = view.board[pm.from];
  if (!piece || piece.color !== view.you) return { action: "drop", reason: "gone" };
  const found = view.moves.find((m) => m.from === pm.from && m.to === pm.to && (m.promo ?? undefined) === (pm.promo ?? undefined));
  if (!found) return { action: "drop", reason: "illegal" };
  return { action: "send", move: found.promo ? { from: found.from, to: found.to, promo: found.promo } : { from: found.from, to: found.to } };
}

export interface PremoveClick {
  /** Pièce actuellement choisie pour un premove. */
  selected: Square | null;
  /** Nouveau premove à poser (remplace l'ancien). */
  set?: Premove;
  /** Choix de la pièce de promotion avant de poser le premove. */
  promotion?: PendingPromotion;
  /** Annule le premove en attente. */
  cancel?: boolean;
}

/** Machine à états des clics en mode premove (clic-clic, et dépose d'un glisser avec `selected = from`). */
export function premoveClick(view: StateView, selected: Square | null, square: Square, enabled = true): PremoveClick {
  if (!premoveAllowed(view, enabled)) return { selected: null };
  if (selected !== null && premoveTargets(view.board, selected, view.you).includes(square)) {
    if (premoveNeedsPromo(view.board, selected, square)) {
      return { selected: null, promotion: { from: selected, to: square, options: PROMO_OPTIONS } };
    }
    return { selected: null, set: { from: selected, to: square } };
  }
  const mine = view.board[square];
  if (mine && mine.color === view.you && square !== selected) return { selected: square };
  // Case non valide : on annule la sélection et le premove en attente.
  return { selected: null, cancel: true };
}

/** Peut-on commencer à glisser une pièce depuis `square` pour un premove ? */
export function premoveDragStart(view: StateView, square: Square, enabled = true): boolean {
  if (!premoveAllowed(view, enabled)) return false;
  const p = view.board[square];
  return !!p && p.color === view.you && premoveTargets(view.board, square, view.you).length > 0;
}

/** Surbrillances pendant le choix d'un premove (pièces à nous, cases géométriquement atteignables). */
export function premoveHighlights(view: StateView, selected: Square | null): Highlights {
  const selectable = view.board.flatMap((p, s) => (p && p.color === view.you ? [s] : []));
  const targets = selected === null ? [] : premoveTargets(view.board, selected, view.you);
  return { selectable, selected, targets };
}
