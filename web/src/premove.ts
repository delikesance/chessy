// Premoves : des coups posés à l'avance pendant le tour de l'adversaire (côté client uniquement, aucun changement
// de protocole). On peut en empiler jusqu'à MAX_PREMOVES : chacun se pose sur la position « virtuelle » obtenue en
// appliquant les précédents. Logique pure, sans React ni Phaser. Les cases proposées sont purement géométriques :
// ni obstacles ni échecs.

import type { Highlights, PendingPromotion } from "./interaction";
import type { Color, Move, Piece, PieceKind, Square, StateView } from "./protocol";

export interface Premove {
  from: Square;
  to: Square;
  /** Promotion choisie (dame par défaut) quand le pion atteint la dernière rangée. */
  promo?: PieceKind;
}

/** Nombre maximal de premoves empilés. */
export const MAX_PREMOVES = 10;

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
 * Applique un premove sur une copie du plateau : déplacement simple, la capture remplace, le pion promu devient
 * `promo` (dame par défaut), le roi de deux cases depuis e1/e8 emmène sa tour. La prise en passant est ignorée.
 * Si la pièce d'origine n'existe pas (ou n'est pas de `color`), le plateau est simplement copié.
 */
export function applyPremove(board: (Piece | null)[], pm: Premove, color: Color): (Piece | null)[] {
  const next = board.slice();
  const piece = next[pm.from];
  if (!piece || piece.color !== color) return next;
  next[pm.from] = null;
  const promoted = piece.kind === "pawn" && rank(pm.to) === promotionRank(color);
  next[pm.to] = promoted ? { ...piece, kind: pm.promo ?? "queen" } : piece;
  if (piece.kind === "king" && pm.from === kingHome(color) && Math.abs(file(pm.to) - file(pm.from)) === 2 && rank(pm.to) === rank(pm.from)) {
    const short = file(pm.to) > file(pm.from);
    const rookFrom = sq(short ? 7 : 0, rank(pm.from));
    const rookTo = sq(short ? 5 : 3, rank(pm.from));
    const rook = next[rookFrom];
    if (rook && rook.kind === "rook" && rook.color === color && !next[rookTo]) {
      next[rookFrom] = null;
      next[rookTo] = rook;
    }
  }
  return next;
}

/** Plateau « virtuel » : la position réelle avec tous les premoves de la file appliqués dans l'ordre. */
export function virtualBoard(board: (Piece | null)[], queue: Premove[], color: Color): (Piece | null)[] {
  return queue.reduce((b, pm) => applyPremove(b, pm, color), board);
}

/** La vue dont le plateau est la position virtuelle (identique à `view` quand la file est vide). */
export function virtualView<V extends Pick<StateView, "board" | "you">>(view: V, queue: Premove[]): V {
  return queue.length === 0 ? view : { ...view, board: virtualBoard(view.board, queue, view.you) };
}

/** Ajoute un premove à la file (inchangée si elle est pleine). */
export function queuePremove(queue: Premove[], pm: Premove): Premove[] {
  return queue.length >= MAX_PREMOVES ? queue : [...queue, pm];
}

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

export type QueueResolution =
  | { action: "idle" }
  | { action: "send"; move: Move; rest: Premove[] }
  | { action: "fail"; reason: "not_turn" | "over" | "gone" | "illegal" };

/**
 * Au début de notre tour : le premier premove de la file est joué s'il est légal et les suivants restent en
 * attente. S'il ne l'est pas, toute la file tombe (`fail`, comme sur chess.com).
 */
export function resolveQueue(view: StateView, queue: Premove[]): QueueResolution {
  if (queue.length === 0) return { action: "idle" };
  const r = resolvePremove(view, queue[0]);
  if (r.action === "send") return { action: "send", move: r.move, rest: queue.slice(1) };
  return { action: "fail", reason: r.reason };
}

export interface PremoveClick {
  /** Pièce actuellement choisie pour un premove. */
  selected: Square | null;
  /** Premove à ajouter à la file. */
  add?: Premove;
  /** Choix de la pièce de promotion avant d'ajouter le premove. */
  promotion?: PendingPromotion;
}

/**
 * Machine à états des clics en mode premove (clic-clic, et dépose d'un glisser avec `selected = from`).
 * `view` porte le plateau virtuel (voir `virtualView`) : on choisit la pièce là où elle sera.
 */
export function premoveClick(view: StateView, selected: Square | null, square: Square, enabled = true): PremoveClick {
  if (!premoveAllowed(view, enabled)) return { selected: null };
  if (selected !== null && premoveTargets(view.board, selected, view.you).includes(square)) {
    if (premoveNeedsPromo(view.board, selected, square)) {
      return { selected: null, promotion: { from: selected, to: square, options: PROMO_OPTIONS } };
    }
    return { selected: null, add: { from: selected, to: square } };
  }
  const mine = view.board[square];
  if (mine && mine.color === view.you && square !== selected) return { selected: square };
  // Case non valide : on abandonne seulement la sélection (la file reste ; Échap ou clic droit l'annule).
  return { selected: null };
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
