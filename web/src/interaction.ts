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

// ---- glisser-déposer -----------------------------------------------------------------------------
// Le plateau ne fait que signaler « glissé de A vers B » ; ces fonctions pures décident de ce que cela signifie
// en réutilisant la machine à états du clic (un glisser = clic sur A puis clic sur B).

/** Distance (px) au-delà de laquelle un appui devient un glisser plutôt qu'un clic. */
export const DRAG_THRESHOLD = 4;

export function exceedsDragThreshold(dx: number, dy: number, threshold = DRAG_THRESHOLD): boolean {
  return Math.hypot(dx, dy) >= threshold;
}

/** Interaction de départ d'un glisser : `idle` sans sélection, ou la compétence armée sans première case. */
function dragBase(it: Interaction): Interaction {
  return it.kind === "idle" ? IDLE : { kind: "skill", skill: it.skill, first: null };
}

/**
 * Peut-on commencer à glisser depuis `square` ? Renvoie l'interaction résultante (la pièce est « prise en main »,
 * ce qui fait apparaître ses cases légales) ou `null`. Pour une compétence, seules les cibles en deux étapes
 * (`piece_to`, `pair`) se glissent : on tire la première pièce vers la case cible.
 */
export function dragStart(view: StateView, it: Interaction, square: Square): Interaction | null {
  if (view.outcome.type !== "ongoing" || view.to_move !== view.you) return null;
  if (it.kind === "idle") {
    if (!view.moves.some((m) => m.from === square)) return null;
    return { kind: "idle", selected: square };
  }
  const targets = skillTargets(view, it.skill);
  const shape = targets[0]?.kind;
  if (shape !== "piece_to" && shape !== "pair") return null;
  if (!firstSquares(targets).includes(square)) return null;
  return { kind: "skill", skill: it.skill, first: square };
}

export interface DropOutcome {
  /** Ce que le clic équivalent produirait (envoi, promotion, nouvelle interaction). */
  result: ClickResult;
  /**
   * `snap` : coup simple accepté, la pièce se pose sur la case visée en attendant la réponse du serveur ;
   * `return` : la pièce revient à sa case (dépose invalide, promotion, compétence, simple sélection).
   */
  verdict: "snap" | "return";
  /** Dépose sur une case non valide (le plateau joue le son d'erreur). */
  rejected: boolean;
}

/** Relâchement de la pièce glissée de `from` sur `to`. */
export function dropOn(view: StateView, it: Interaction, from: Square, to: Square): DropOutcome {
  const base = dragBase(it);
  const start = dragStart(view, base, from);
  if (!start) return { result: { interaction: base }, verdict: "return", rejected: false };
  if (to === from) return { result: { interaction: start }, verdict: "return", rejected: false };
  const result = click(view, start, to);
  const valid = result.send !== undefined || result.promotion !== undefined;
  if (!valid) return { result: { interaction: base }, verdict: "return", rejected: true };
  return { result, verdict: result.send?.type === "move" ? "snap" : "return", rejected: false };
}

/**
 * Clic refusé : on joue le buzz « illegal ». Hors de notre tour (sans premove), cliquer sa propre pièce ;
 * pendant le ciblage d'une compétence, cliquer une pièce qui n'est pas une cible valide.
 */
export function clickRejected(view: StateView, it: Interaction, square: Square, premoveEnabled = false): boolean {
  if (view.outcome.type !== "ongoing") return false;
  const piece = view.board[square];
  if (view.to_move !== view.you) return !premoveEnabled && !!piece && piece.color === view.you;
  if (it.kind === "skill") {
    const targets = skillTargets(view, it.skill);
    const valid = it.first === null ? firstSquares(targets) : [...firstSquares(targets), ...secondSquares(targets, it.first)];
    return !!piece && !valid.includes(square);
  }
  return false;
}
