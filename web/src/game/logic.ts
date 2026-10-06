// Logique pure de l'écran de jeu (horloges, matériel, journal), sans React ni Phaser.

import { skillName } from "../skills";
import type { Clock, Color, GameEvent, Piece, PieceKind, Square, StateView } from "../protocol";

// ---- horloges -----------------------------------------------------------------

/** Temps restant de `color` après `elapsedMs` écoulées depuis la réception de `clock`. */
export function remainingMs(clock: Clock, color: Color, elapsedMs: number): number {
  const base = color === "white" ? clock.white_ms : clock.black_ms;
  const left = clock.running === color ? base - Math.max(0, elapsedMs) : base;
  return Math.max(0, Math.round(left));
}

/** `9:59`, `0:42`, et le dixième de seconde sous 10 s (`0:07.3`). */
export function formatClock(ms: number): string {
  const total = Math.max(0, ms);
  const tenths = Math.floor(total / 100) % 10;
  const seconds = Math.floor(total / 1000);
  const m = Math.floor(seconds / 60);
  const s = seconds % 60;
  const base = `${m}:${String(s).padStart(2, "0")}`;
  return total < 10_000 ? `${base}.${tenths}` : base;
}

// ---- matériel -----------------------------------------------------------------

export const PIECE_VALUE: Record<PieceKind, number> = { pawn: 1, knight: 3, bishop: 3, rook: 5, queen: 9, king: 0 };

const START_COUNT: Record<PieceKind, number> = { pawn: 8, knight: 2, bishop: 2, rook: 2, queen: 1, king: 1 };

export const CAPTURE_ORDER: PieceKind[] = ["queen", "rook", "bishop", "knight", "pawn"];

export function materialOf(board: (Piece | null)[], color: Color): number {
  return board.reduce((sum, p) => (p && p.color === color ? sum + PIECE_VALUE[p.kind] : sum), 0);
}

/** Avantage matériel de `color` (positif = en avance). */
export function materialBalance(board: (Piece | null)[], color: Color): number {
  return materialOf(board, color) - materialOf(board, color === "white" ? "black" : "white");
}

/** Part (0..1) de la barre d'évaluation occupée par `color` : sigmoïde douce autour de 0,5. */
export function evalShare(balance: number): number {
  return 1 / (1 + Math.exp(-balance / 4));
}

/**
 * Pièces de `color` absentes de l'échiquier, de la plus forte à la plus faible.
 * Les pièces gagnées par promotion compensent les pions manquants.
 */
export function capturedPieces(board: (Piece | null)[], color: Color): PieceKind[] {
  const count: Record<PieceKind, number> = { pawn: 0, knight: 0, bishop: 0, rook: 0, queen: 0, king: 0 };
  for (const p of board) if (p && p.color === color) count[p.kind]++;
  const lost = {} as Record<PieceKind, number>;
  let promoted = 0;
  for (const kind of CAPTURE_ORDER) {
    lost[kind] = Math.max(0, START_COUNT[kind] - count[kind]);
    if (kind !== "pawn") promoted += Math.max(0, count[kind] - START_COUNT[kind]);
  }
  lost.pawn = Math.max(0, lost.pawn - promoted);
  return CAPTURE_ORDER.flatMap((kind) => Array<PieceKind>(lost[kind]).fill(kind));
}

// ---- journal ------------------------------------------------------------------

export const PIECE_FR: Record<PieceKind, string> = {
  pawn: "Pion",
  knight: "Cavalier",
  bishop: "Fou",
  rook: "Tour",
  queen: "Dame",
  king: "Roi",
};

export function sqName(square: Square): string {
  return `${"abcdefgh"[square % 8]}${Math.floor(square / 8) + 1}`;
}

export interface LogLine {
  /** Numéro de demi-coup (`ply` de la position obtenue). */
  ply: number;
  actor: Color;
  kind: "move" | "skill";
  text: string;
  skill?: string;
}

/** Qui a joué : l'auteur de `skill_used` si présent, sinon l'inverse du trait actuel. */
export function actorOf(view: Pick<StateView, "events" | "to_move">): Color {
  for (const e of view.events) if (e.type === "skill_used") return e.color;
  return view.to_move === "white" ? "black" : "white";
}

/** Une ligne de journal pour la dernière action de `view`, ou `null` si elle n'a rien produit. */
export function describeAction(view: StateView): LogLine | null {
  const { events, board } = view;
  if (events.length === 0) return null;
  const actor = actorOf(view);
  const skillEvent = events.find((e): e is Extract<GameEvent, { type: "skill_used" }> => e.type === "skill_used");
  const parts: string[] = [];
  for (const e of events) parts.push(...describeEvent(e, board, skillEvent !== undefined));
  const text = parts.filter(Boolean).join(" · ");
  if (!text && !skillEvent) return null;
  return {
    ply: view.ply,
    actor,
    kind: skillEvent ? "skill" : "move",
    text: skillEvent ? `${skillName(skillEvent.skill)}${text ? ` · ${text}` : ""}` : text,
    skill: skillEvent?.skill,
  };
}

function describeEvent(e: GameEvent, board: (Piece | null)[], inSkill: boolean): string[] {
  switch (e.type) {
    case "moved": {
      const kind = board[e.to]?.kind ?? "pawn";
      return [`${PIECE_FR[kind]} ${sqName(e.from)}–${sqName(e.to)}`];
    }
    case "captured":
      return [`prend ${PIECE_FR[e.piece.kind].toLowerCase()}`];
    case "promoted":
      return [`promotion en ${PIECE_FR[e.to].toLowerCase()}`];
    case "castled":
      return ["roque"];
    case "teleported":
      return [`${sqName(e.from)} vers ${sqName(e.to)}`];
    case "cloned":
      return [`copie ${sqName(e.from)} sur ${sqName(e.to)}`];
    case "swapped":
      return [`${sqName(e.a)} et ${sqName(e.b)} échangées`];
    case "removed":
      return [`${PIECE_FR[e.piece.kind].toLowerCase()} ${sqName(e.square)} retiré`];
    case "rolled_back":
      return [`retour ${sqName(e.from)} vers ${sqName(e.to)}`];
    case "effect_added":
      return [e.effect === "frozen" ? "pièce gelée" : "pièce protégée"];
    case "skill_used":
      return inSkill ? [] : [skillName(e.skill)];
  }
}

/** Compétence lancée lors de la dernière action, s'il y en a une. */
export function launchOf(view: Pick<StateView, "events">): { color: Color; skill: string } | null {
  for (const e of view.events) if (e.type === "skill_used") return { color: e.color, skill: e.skill };
  return null;
}

/** Ajoute `line` au journal sans doublon de demi-coup. */
export function appendLog(log: LogLine[], line: LogLine | null, max = 200): LogLine[] {
  if (!line || log.some((l) => l.ply === line.ply)) return log;
  return [...log, line].slice(-max);
}
