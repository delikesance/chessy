// The click state machine for the board, kept free of Phaser and React so it
// can be unit-tested. The scene only reports which square was clicked.

import type { Action, PieceKind, SkillId, SkillTarget, Square, StateView } from "./protocol";

export type Interaction =
  | { kind: "idle"; selected: Square | null }
  | { kind: "skill"; skill: SkillId; first: Square | null };

export const IDLE: Interaction = { kind: "idle", selected: null };

export interface Highlights {
  /** Squares the player can pick next. */
  selectable: Square[];
  /** The piece currently picked up, if any. */
  selected: Square | null;
  /** Where the picked-up piece (or skill) can go. */
  targets: Square[];
}

export interface PendingPromotion {
  from: Square;
  to: Square;
  options: PieceKind[];
}

export interface ClickResult {
  interaction: Interaction;
  send?: Action;
  promotion?: PendingPromotion;
}

const uniq = (xs: Square[]) => [...new Set(xs)];

function skillTargets(view: StateView, skill: SkillId): SkillTarget[] {
  return view.skill_options.find((o) => o.skill === skill)?.targets ?? [];
}

/** Squares that can start a skill's targeting. */
function firstSquares(targets: SkillTarget[]): Square[] {
  const out: Square[] = [];
  for (const t of targets) {
    if (t.kind === "piece") out.push(t.square);
    else if (t.kind === "piece_to") out.push(t.from);
    else if (t.kind === "pair") out.push(t.a, t.b);
  }
  return uniq(out);
}

/** Squares that can complete a skill's targeting once `first` is chosen. */
function secondSquares(targets: SkillTarget[], first: Square): Square[] {
  const out: Square[] = [];
  for (const t of targets) {
    if (t.kind === "piece_to" && t.from === first) out.push(t.to);
    else if (t.kind === "pair" && t.a === first) out.push(t.b);
    else if (t.kind === "pair" && t.b === first) out.push(t.a);
  }
  return uniq(out);
}

export function highlights(view: StateView, it: Interaction): Highlights {
  if (it.kind === "idle") {
    const selectable = uniq(view.moves.map((m) => m.from));
    const targets =
      it.selected === null ? [] : uniq(view.moves.filter((m) => m.from === it.selected).map((m) => m.to));
    return { selectable, selected: it.selected, targets };
  }
  const targets = skillTargets(view, it.skill);
  if (it.first === null) {
    return { selectable: firstSquares(targets), selected: null, targets: [] };
  }
  return {
    selectable: firstSquares(targets),
    selected: it.first,
    targets: secondSquares(targets, it.first),
  };
}

export function click(view: StateView, it: Interaction, square: Square): ClickResult {
  if (view.outcome.type !== "ongoing" || view.to_move !== view.you) {
    return { interaction: it };
  }
  return it.kind === "idle" ? clickIdle(view, it, square) : clickSkill(view, it, square);
}

function clickIdle(view: StateView, it: Extract<Interaction, { kind: "idle" }>, square: Square): ClickResult {
  if (it.selected !== null) {
    const candidates = view.moves.filter((m) => m.from === it.selected && m.to === square);
    if (candidates.length > 0) {
      const promos = candidates.flatMap((m) => (m.promo ? [m.promo] : []));
      if (promos.length > 0) {
        return {
          interaction: IDLE,
          promotion: { from: it.selected, to: square, options: promos },
        };
      }
      return { interaction: IDLE, send: { type: "move", from: it.selected, to: square } };
    }
  }
  const selectable = view.moves.some((m) => m.from === square);
  if (selectable && it.selected !== square) return { interaction: { kind: "idle", selected: square } };
  return { interaction: IDLE };
}

function clickSkill(view: StateView, it: Extract<Interaction, { kind: "skill" }>, square: Square): ClickResult {
  const targets = skillTargets(view, it.skill);
  const starts = firstSquares(targets);
  const cast = (target: SkillTarget): ClickResult => ({
    interaction: IDLE,
    send: { type: "skill", skill: it.skill, target },
  });

  if (it.first !== null && secondSquares(targets, it.first).includes(square)) {
    const sample = targets[0];
    if (sample?.kind === "piece_to") return cast({ kind: "piece_to", from: it.first, to: square });
    return cast({ kind: "pair", a: it.first, b: square });
  }
  if (starts.includes(square)) {
    if (targets[0]?.kind === "piece") return cast({ kind: "piece", square });
    return { interaction: { kind: "skill", skill: it.skill, first: square } };
  }
  // Clicking elsewhere backs out one step: first the picked piece, then the skill.
  return { interaction: it.first !== null ? { kind: "skill", skill: it.skill, first: null } : IDLE };
}

export function startSkill(view: StateView, skill: SkillId): Interaction {
  if (view.to_move !== view.you || view.outcome.type !== "ongoing") return IDLE;
  return skillTargets(view, skill).length > 0 ? { kind: "skill", skill, first: null } : IDLE;
}
