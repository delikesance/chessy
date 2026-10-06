// The click state machine for the board, kept free of Phaser and React so it
// can be unit-tested. The scene only reports which square was clicked.

import type { Action, PieceKind, SkillId, SkillTarget, SpawnKind, Square, StateView } from "./protocol";

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

/** Mirage / Morph : la case est choisie, reste à choisir le type de pièce. */
export interface PendingSpawn {
  skill: SkillId;
  square: Square;
  options: SpawnKind[];
}

export interface ClickResult {
  interaction: Interaction;
  send?: Action;
  promotion?: PendingPromotion;
  spawn?: PendingSpawn;
}

/** Forme du ciblage d'une compétence, pour choisir l'interaction et le texte d'aide. */
export type TargetShape = "none" | "piece" | "square" | "pair" | "piece_to" | "spawn";

const uniq = <T>(xs: T[]): T[] => [...new Set(xs)];

function skillTargets(view: StateView, skill: SkillId): SkillTarget[] {
  return view.skill_options.find((o) => o.skill === skill)?.targets ?? [];
}

export function targetShape(view: StateView, skill: SkillId): TargetShape | null {
  const sample = skillTargets(view, skill)[0];
  return sample ? sample.kind : null;
}

/** Squares that can start a skill's targeting. */
function firstSquares(targets: SkillTarget[]): Square[] {
  const out: Square[] = [];
  for (const t of targets) {
    if (t.kind === "piece" || t.kind === "square" || t.kind === "spawn") out.push(t.square);
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

/** Types de pièce proposés par une cible `spawn` sur `square`. */
function spawnOptions(targets: SkillTarget[], square: Square): SpawnKind[] {
  return uniq(targets.flatMap((t) => (t.kind === "spawn" && t.square === square ? [t.piece] : [])));
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
    const shape = targets[0]?.kind;
    if (shape === "piece") return cast({ kind: "piece", square });
    if (shape === "square") return cast({ kind: "square", square });
    if (shape === "spawn") {
      const options = spawnOptions(targets, square);
      if (options.length === 1) return cast({ kind: "spawn", square, piece: options[0] });
      return {
        interaction: { kind: "skill", skill: it.skill, first: square },
        spawn: { skill: it.skill, square, options },
      };
    }
    return { interaction: { kind: "skill", skill: it.skill, first: square } };
  }
  // Clicking elsewhere backs out one step: first the picked piece, then the skill.
  return { interaction: it.first !== null ? { kind: "skill", skill: it.skill, first: null } : IDLE };
}

/** Second étape de Mirage / Morph : le joueur a choisi le type de pièce. */
export function chooseSpawn(spawn: PendingSpawn, piece: SpawnKind): ClickResult {
  return {
    interaction: IDLE,
    send: { type: "skill", skill: spawn.skill, target: { kind: "spawn", square: spawn.square, piece } },
  };
}

/** Annule le choix du type : on revient à la sélection de la case. */
export function cancelSpawn(spawn: PendingSpawn): Interaction {
  return { kind: "skill", skill: spawn.skill, first: null };
}

export function startSkill(view: StateView, skill: SkillId): Interaction {
  if (view.to_move !== view.you || view.outcome.type !== "ongoing") return IDLE;
  const targets = skillTargets(view, skill);
  // Une compétence sans cible (`none`) ne se vise pas : elle se lance directement (voir `activateSkill`).
  if (targets.length === 0 || targets[0].kind === "none") return IDLE;
  return { kind: "skill", skill, first: null };
}

/**
 * Clic sur une compétence : lancement immédiat pour une cible `none`, sinon début du ciblage.
 * Cliquer à nouveau sur la compétence armée la désarme.
 */
export function activateSkill(view: StateView, current: Interaction, skill: SkillId): ClickResult {
  if (current.kind === "skill" && current.skill === skill) return { interaction: IDLE };
  if (view.to_move !== view.you || view.outcome.type !== "ongoing") return { interaction: IDLE };
  const targets = skillTargets(view, skill);
  if (targets.some((t) => t.kind === "none")) {
    return { interaction: IDLE, send: { type: "skill", skill, target: { kind: "none" } } };
  }
  return { interaction: startSkill(view, skill) };
}

/** Texte d'aide pendant le ciblage d'une compétence (sans le nom de la compétence). */
export function targetHint(shape: TargetShape | null, first: Square | null, spawnPending: boolean): string {
  if (spawnPending) return "choisissez le type de pièce.";
  switch (shape) {
    case "piece":
      return "choisissez une pièce en surbrillance.";
    case "square":
      return "choisissez une case vide.";
    case "spawn":
      return first === null ? "choisissez une case en surbrillance." : "choisissez le type de pièce.";
    case "piece_to":
      return first === null ? "choisissez la pièce à déplacer." : "choisissez la case de destination.";
    case "pair":
      return first === null ? "choisissez la première pièce." : "choisissez la seconde pièce.";
    default:
      return "choisissez une pièce ou une case en surbrillance.";
  }
}
