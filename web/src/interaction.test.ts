import { describe, expect, it } from "vitest";
import {
  activateSkill,
  cancelSpawn,
  chooseSpawn,
  click,
  highlights,
  IDLE,
  startSkill,
  targetHint,
  targetShape,
  type Interaction,
} from "./interaction";
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
    traps: [],
    benched: [],
    terrain: [],
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

describe("new target shapes", () => {
  it("casts a `square` skill with one click on an empty square", () => {
    const v = view({
      skill_options: [{ skill: "trap", targets: [{ kind: "square", square: 20 }, { kind: "square", square: 21 }] }],
    });
    const it = startSkill(v, "trap");
    expect(it).toEqual({ kind: "skill", skill: "trap", first: null });
    expect(highlights(v, it).selectable).toEqual([20, 21]);
    expect(targetShape(v, "trap")).toBe("square");
    const r = click(v, it, 21);
    expect(r.send).toEqual({ type: "skill", skill: "trap", target: { kind: "square", square: 21 } });
    expect(r.interaction).toEqual(IDLE);
    expect(click(v, it, 3).send).toBeUndefined();
  });

  it("launches a `none` skill straight from the skill button", () => {
    const v = view({ skill_options: [{ skill: "tornado", targets: [{ kind: "none" }] }] });
    expect(startSkill(v, "tornado")).toEqual(IDLE);
    const r = activateSkill(v, IDLE, "tornado");
    expect(r.send).toEqual({ type: "skill", skill: "tornado", target: { kind: "none" } });
    expect(r.interaction).toEqual(IDLE);
    expect(activateSkill({ ...v, to_move: "black" }, IDLE, "tornado").send).toBeUndefined();
    expect(activateSkill({ ...v, outcome: { type: "stalemate" } }, IDLE, "tornado").send).toBeUndefined();
  });

  it("arms a targeted skill on activation and disarms it on a second click", () => {
    const v = view({ skill_options: [{ skill: "evolve", targets: [{ kind: "piece", square: 8 }] }] });
    const armed = activateSkill(v, IDLE, "evolve");
    expect(armed.interaction).toEqual({ kind: "skill", skill: "evolve", first: null });
    expect(armed.send).toBeUndefined();
    expect(activateSkill(v, armed.interaction, "evolve").interaction).toEqual(IDLE);
    expect(activateSkill(view({}), IDLE, "evolve")).toEqual({ interaction: IDLE });
  });

  it("targets a `spawn` skill in two steps: the square, then the piece type", () => {
    const spawn = (square: number, piece: "knight" | "bishop" | "rook" | "queen"): SkillTarget => ({
      kind: "spawn",
      square,
      piece,
    });
    const v = view({
      skill_options: [
        {
          skill: "mirage",
          targets: [spawn(20, "knight"), spawn(20, "bishop"), spawn(20, "rook"), spawn(20, "queen"), spawn(21, "knight")],
        },
      ],
    });
    const it = startSkill(v, "mirage");
    expect(highlights(v, it)).toEqual({ selectable: [20, 21], selected: null, targets: [] });
    const r = click(v, it, 20);
    expect(r.send).toBeUndefined();
    expect(r.interaction).toEqual({ kind: "skill", skill: "mirage", first: 20 });
    expect(r.spawn).toEqual({ skill: "mirage", square: 20, options: ["knight", "bishop", "rook", "queen"] });
    expect(highlights(v, r.interaction).selected).toBe(20);

    const done = chooseSpawn(r.spawn!, "rook");
    expect(done.send).toEqual({ type: "skill", skill: "mirage", target: { kind: "spawn", square: 20, piece: "rook" } });
    expect(done.interaction).toEqual(IDLE);
    expect(cancelSpawn(r.spawn!)).toEqual({ kind: "skill", skill: "mirage", first: null });
  });

  it("morph offers the types legal for each piece and skips the picker when only one is left", () => {
    const v = view({
      skill_options: [
        {
          skill: "morph",
          targets: [
            { kind: "spawn", square: 8, piece: "knight" },
            { kind: "spawn", square: 8, piece: "queen" },
            { kind: "spawn", square: 9, piece: "pawn" },
          ],
        },
      ],
    });
    const it = startSkill(v, "morph");
    expect(click(v, it, 8).spawn?.options).toEqual(["knight", "queen"]);
    const single = click(v, it, 9);
    expect(single.spawn).toBeUndefined();
    expect(single.send).toEqual({ type: "skill", skill: "morph", target: { kind: "spawn", square: 9, piece: "pawn" } });
  });

  it("backs out of the type picker back to the square choice", () => {
    const v = view({
      skill_options: [
        { skill: "mirage", targets: [{ kind: "spawn", square: 20, piece: "knight" }, { kind: "spawn", square: 20, piece: "rook" }] },
      ],
    });
    const picked: Interaction = { kind: "skill", skill: "mirage", first: 20 };
    expect(click(v, picked, 63).interaction).toEqual({ kind: "skill", skill: "mirage", first: null });
  });

  it("describes what to pick next", () => {
    expect(targetHint("square", null, false)).toBe("choisissez une case vide.");
    expect(targetHint("spawn", null, false)).toMatch(/case/);
    expect(targetHint("spawn", 20, true)).toBe("choisissez le type de pièce.");
    expect(targetHint("pair", 4, false)).toMatch(/seconde/);
  });

  it("keeps the turn after a skill that does not end it", () => {
    // Mind Reading / Mind Control: `to_move` stays `you`, so the board is still clickable after the cast.
    const v = view({
      to_move: "white",
      skill_options: [{ skill: "control", targets: [{ kind: "piece", square: 52 }] }],
      moves: [{ from: 12, to: 20 }],
    });
    const cast = click(v, startSkill(v, "control"), 52);
    expect(cast.interaction).toEqual(IDLE);
    expect(click({ ...v, skill_options: [] }, cast.interaction, 12).interaction).toEqual({ kind: "idle", selected: 12 });
  });
});
