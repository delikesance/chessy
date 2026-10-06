// Décide quels sons jouer quand la position change (logique pure : pas de React, pas de Web Audio).
import { resultFor } from "../outcome";
import type { Color, GameEvent, Outcome, StateView } from "../protocol";
import { actorOf } from "./logic";

export interface GameSoundState {
  game: string;
  key: string;
  ended: boolean;
}

export type GameSoundStep =
  | { type: "start" }
  | { type: "events"; events: GameEvent[]; me: Color; actor: Color; check: boolean }
  | { type: "your_turn"; delay: number }
  | { type: "end"; result: "win" | "loss" | "draw"; delay: number };

/**
 * `prev` : ce qu'on avait vu avant (null = première position vue : reprise ou début de partie).
 * `key` : `actionKey(view)` ; une même position renvoyée (reconnexion) ne rejoue rien.
 * `over` : issue annoncée par `game_over` (peut arriver avant que `view.outcome` ne change : abandon, temps).
 * `started` : parties dont le son de début a déjà été joué.
 */
export function gameSoundSteps(
  prev: GameSoundState | null,
  view: StateView,
  key: string,
  over: Outcome | null,
  started: Set<string>,
): { steps: GameSoundStep[]; next: GameSoundState } {
  const outcome = over && over.type !== "ongoing" ? over : view.outcome;
  const ended = outcome.type !== "ongoing";
  const next: GameSoundState = { game: view.game_id, key, ended };
  const steps: GameSoundStep[] = [];

  if (!prev || prev.game !== view.game_id) {
    // Première position vue : seule une partie toute neuve sonne ; une partie en cours (reprise) reste muette.
    if (view.ply === 0 && !ended && !started.has(view.game_id)) steps.push({ type: "start" });
    started.add(view.game_id);
    return { steps, next };
  }

  const advanced = key !== prev.key;
  const actor = actorOf(view);
  if (advanced && view.events.length > 0) {
    steps.push({ type: "events", events: view.events, me: view.you, actor, check: view.in_check && !ended });
  }
  if (advanced && !ended && view.to_move === view.you && actor !== view.you) {
    steps.push({ type: "your_turn", delay: view.events.length > 0 ? 0.42 : 0 });
  }
  if (ended && !prev.ended) {
    const result = resultFor(outcome, view.you);
    if (result) steps.push({ type: "end", result, delay: advanced && view.events.length > 0 ? 0.6 : 0 });
  }
  return { steps, next };
}

/** Seconde restante à annoncer (10..1) sous 10 s, sinon null. */
export function lowTimeSecond(ms: number): number | null {
  if (ms <= 0 || ms > 10_000) return null;
  return Math.ceil(ms / 1000);
}
