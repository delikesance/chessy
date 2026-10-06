import { describe, expect, it } from "vitest";
import type { GameEvent, StateView } from "../protocol";
import { gameSoundSteps, lowTimeSecond, type GameSoundState } from "./gameSound";

function view(partial: Partial<StateView>): StateView {
  return {
    game_id: "g1",
    clock: { white_ms: 600_000, black_ms: 600_000, running: "white" },
    clock_enabled: true,
    rated: false,
    opponent: { username: null, elo: null, guest: true },
    draw_offer: "none",
    ply_count: 0,
    you: "white",
    ply: 0,
    to_move: "white",
    in_check: false,
    board: Array(64).fill(null),
    moves: [],
    skill_options: [],
    my_skills: [],
    opponent_skills: { total: 0, used: [] },
    effects: [],
    traps: [],
    benched: [],
    terrain: [],
    outcome: { type: "ongoing" },
    events: [],
    opponent_connected: true,
    ...partial,
  };
}

const moved: GameEvent[] = [{ type: "moved", from: 12, to: 28, piece: 1 }];
const seen = (v: StateView, key: string): GameSoundState => ({ game: v.game_id, key, ended: v.outcome.type !== "ongoing" });

describe("gameSoundSteps", () => {
  it("début d'une partie neuve : son de début, une seule fois par partie", () => {
    const started = new Set<string>();
    const v = view({});
    expect(gameSoundSteps(null, v, "k0", null, started).steps).toEqual([{ type: "start" }]);
    expect(gameSoundSteps(null, v, "k0", null, started).steps).toEqual([]); // reconnexion à la même partie
  });

  it("reprise d'une partie en cours : silence", () => {
    const v = view({ ply: 7, to_move: "white", events: moved });
    expect(gameSoundSteps(null, v, "k7", null, new Set()).steps).toEqual([]);
  });

  it("même position renvoyée : rien", () => {
    const v = view({ ply: 3, events: moved });
    expect(gameSoundSteps(seen(v, "k"), v, "k", null, new Set()).steps).toEqual([]);
  });

  it("coup de l'adversaire : sons du coup puis `your_turn`", () => {
    const before = view({ ply: 1, to_move: "black" });
    const after = view({ ply: 2, to_move: "white", events: moved, in_check: true });
    const { steps } = gameSoundSteps(seen(before, "a"), after, "b", null, new Set());
    expect(steps.map((s) => s.type)).toEqual(["events", "your_turn"]);
    const ev = steps[0];
    expect(ev.type === "events" && ev.actor).toBe("black");
    expect(ev.type === "events" && ev.check).toBe(true);
    const turn = steps[1];
    expect(turn.type === "your_turn" && turn.delay).toBeGreaterThan(0);
  });

  it("notre propre coup : sons du coup, pas de `your_turn`", () => {
    const before = view({ ply: 0, to_move: "white" });
    const after = view({ ply: 1, to_move: "black", events: moved });
    const { steps } = gameSoundSteps(seen(before, "a"), after, "b", null, new Set());
    expect(steps.map((s) => s.type)).toEqual(["events"]);
  });

  it("compétence qui garde la main (Mind Reading) : pas de `your_turn`", () => {
    const before = view({ ply: 2, to_move: "white" });
    const events: GameEvent[] = [{ type: "skill_used", color: "white", skill: "mind", target: { kind: "none" } }];
    const after = view({ ply: 2, to_move: "white", events });
    const { steps } = gameSoundSteps(seen(before, "a"), after, "b", null, new Set());
    expect(steps.map((s) => s.type)).toEqual(["events"]);
  });

  it("fin de partie : victoire, défaite, nulle, après le son du coup", () => {
    const before = view({ ply: 10, to_move: "black" });
    const win = view({ ply: 11, to_move: "black", events: moved, outcome: { type: "checkmate", winner: "white" } });
    const r = gameSoundSteps(seen(before, "a"), win, "b", null, new Set());
    expect(r.steps.map((s) => s.type)).toEqual(["events", "end"]);
    const end = r.steps[1];
    expect(end.type === "end" && end.result).toBe("win");
    expect(end.type === "end" && end.delay).toBeGreaterThan(0);
    expect(r.next.ended).toBe(true);

    const lose = view({ ply: 11, events: moved, outcome: { type: "checkmate", winner: "black" } });
    expect(gameSoundSteps(seen(before, "a"), lose, "b", null, new Set()).steps.at(-1)).toMatchObject({ type: "end", result: "loss" });
    const draw = view({ ply: 11, events: moved, outcome: { type: "stalemate" } });
    expect(gameSoundSteps(seen(before, "a"), draw, "b", null, new Set()).steps.at(-1)).toMatchObject({ type: "end", result: "draw" });
  });

  it("abandon annoncé par game_over seul : une seule fois, sans délai", () => {
    const v = view({ ply: 5, to_move: "black" });
    const over = { type: "resignation", winner: "white" } as const;
    const r = gameSoundSteps(seen(v, "k"), v, "k", over, new Set());
    expect(r.steps).toEqual([{ type: "end", result: "win", delay: 0 }]);
    expect(gameSoundSteps(r.next, v, "k", over, new Set()).steps).toEqual([]);
  });

  it("partie déjà terminée à la première vue : silence", () => {
    const v = view({ ply: 20, outcome: { type: "timeout", winner: "black" } });
    expect(gameSoundSteps(null, v, "k", null, new Set()).steps).toEqual([]);
  });

  it("changement de partie : traité comme une première vue", () => {
    const old = view({ game_id: "old", ply: 9 });
    const fresh = view({ game_id: "new", ply: 0 });
    expect(gameSoundSteps(seen(old, "k"), fresh, "z", null, new Set()).steps).toEqual([{ type: "start" }]);
  });
});

describe("lowTimeSecond", () => {
  it("annonce les secondes sous 10 s", () => {
    expect(lowTimeSecond(10_500)).toBeNull();
    expect(lowTimeSecond(10_000)).toBe(10);
    expect(lowTimeSecond(9_001)).toBe(10);
    expect(lowTimeSecond(8_999)).toBe(9);
    expect(lowTimeSecond(1)).toBe(1);
    expect(lowTimeSecond(0)).toBeNull();
  });
});
