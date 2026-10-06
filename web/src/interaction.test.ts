import { describe, expect, it } from "vitest";
import { click, highlights, IDLE, startSkill, type Interaction } from "./interaction";
import type { SkillTarget, StateView } from "./protocol";

function view(partial: Partial<StateView>): StateView {
  return {
    game_id: "g",
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
    outcome: { type: "ongoing" },
    events: [],
    opponent_connected: true,
    ...partial,
  };
}

describe("moving pieces", () => {
  const v = view({
    moves: [
      { from: 12, to: 20 },
      { from: 12, to: 28 },
      { from: 6, to: 21 },
    ],
  });

  it("selects a piece, shows its destinations, and plays the move", () => {
    let r = click(v, IDLE, 12);
    expect(r.interaction).toEqual({ kind: "idle", selected: 12 });
    expect(highlights(v, r.interaction)).toEqual({ selectable: [12, 6], selected: 12, targets: [20, 28] });
    r = click(v, r.interaction, 28);
    expect(r.send).toEqual({ type: "move", from: 12, to: 28 });
    expect(r.interaction).toEqual(IDLE);
  });

  it("switches selection and deselects on empty squares", () => {
    const r = click(v, { kind: "idle", selected: 12 }, 6);
    expect(r.interaction).toEqual({ kind: "idle", selected: 6 });
    expect(click(v, { kind: "idle", selected: 12 }, 50).interaction).toEqual(IDLE);
    expect(click(v, { kind: "idle", selected: 12 }, 12).interaction).toEqual(IDLE);
  });

  it("asks which piece to promote to", () => {
    const pv = view({
      moves: ["queen", "rook", "bishop", "knight"].map((promo) => ({
        from: 48,
        to: 56,
        promo: promo as "queen",
      })),
    });
    const r = click(pv, { kind: "idle", selected: 48 }, 56);
    expect(r.send).toBeUndefined();
    expect(r.promotion).toEqual({ from: 48, to: 56, options: ["queen", "rook", "bishop", "knight"] });
  });

  it("ignores clicks when it is not your turn or the game is over", () => {
    expect(click({ ...v, to_move: "black" }, IDLE, 12).interaction).toEqual(IDLE);
    expect(click({ ...v, outcome: { type: "stalemate" } }, IDLE, 12).interaction).toEqual(IDLE);
  });

  it("ignores clicks after a timeout or an agreed draw", () => {
    for (const outcome of [{ type: "timeout", winner: "black" }, { type: "draw_agreed" }] as const) {
      const r = click({ ...v, outcome }, IDLE, 12);
      expect(r.interaction).toEqual(IDLE);
      expect(r.send).toBeUndefined();
      expect(startSkill({ ...v, outcome, skill_options: [{ skill: "freeze", targets: [{ kind: "piece", square: 1 }] }] }, "freeze")).toEqual(IDLE);
    }
  });
});

describe("skills", () => {
  const piece = (square: number): SkillTarget => ({ kind: "piece", square });
  const pieceTo = (from: number, to: number): SkillTarget => ({ kind: "piece_to", from, to });

  it("casts single-target skills with one click", () => {
    const v = view({ skill_options: [{ skill: "freeze", targets: [piece(50), piece(51)] }] });
    const it = startSkill(v, "freeze");
    expect(highlights(v, it).selectable).toEqual([50, 51]);
    expect(click(v, it, 51).send).toEqual({ type: "skill", skill: "freeze", target: piece(51) });
    expect(click(v, it, 3).interaction).toEqual(IDLE);
  });

  it("targets in two steps: the piece, then where it goes", () => {
    const v = view({
      skill_options: [{ skill: "teleportation", targets: [pieceTo(0, 27), pieceTo(0, 28), pieceTo(1, 27)] }],
    });
    let r = click(v, startSkill(v, "teleportation"), 0);
    expect(r.send).toBeUndefined();
    expect(highlights(v, r.interaction)).toEqual({ selectable: [0, 1], selected: 0, targets: [27, 28] });
    r = click(v, r.interaction, 28);
    expect(r.send).toEqual({ type: "skill", skill: "teleportation", target: pieceTo(0, 28) });
  });

  it("backs out one step when clicking elsewhere", () => {
    const v = view({ skill_options: [{ skill: "teleportation", targets: [pieceTo(0, 27)] }] });
    const picked: Interaction = { kind: "skill", skill: "teleportation", first: 0 };
    const back = click(v, picked, 63).interaction;
    expect(back).toEqual({ kind: "skill", skill: "teleportation", first: null });
    expect(click(v, back, 63).interaction).toEqual(IDLE);
  });

  it("lets a pair be chosen in either order", () => {
    const v = view({
      skill_options: [{ skill: "destiny_swapper", targets: [{ kind: "pair", a: 1, b: 2 }] }],
    });
    const first = click(v, startSkill(v, "destiny_swapper"), 2);
    expect(highlights(v, first.interaction).targets).toEqual([1]);
    expect(click(v, first.interaction, 1).send).toEqual({
      type: "skill",
      skill: "destiny_swapper",
      target: { kind: "pair", a: 2, b: 1 },
    });
  });

  it("does not start a skill with no targets or off-turn", () => {
    expect(startSkill(view({}), "freeze")).toEqual(IDLE);
    const v = view({ to_move: "black", skill_options: [{ skill: "freeze", targets: [piece(1)] }] });
    expect(startSkill(v, "freeze")).toEqual(IDLE);
  });
});
