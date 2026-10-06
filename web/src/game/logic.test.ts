import { describe, expect, it } from "vitest";
import {
  appendLog,
  capturedPieces,
  describeAction,
  evalShare,
  formatClock,
  launchOf,
  materialBalance,
  remainingMs,
  sqName,
} from "./logic";
import type { Piece, PieceKind, StateView } from "../protocol";

let nextId = 0;
const p = (kind: PieceKind, color: "white" | "black"): Piece => ({ id: nextId++, kind, color });

function boardWith(...pieces: Piece[]): (Piece | null)[] {
  const b: (Piece | null)[] = Array(64).fill(null);
  pieces.forEach((piece, i) => (b[i] = piece));
  return b;
}

function fullSide(color: "white" | "black"): Piece[] {
  const kinds: PieceKind[] = [
    ...Array<PieceKind>(8).fill("pawn"),
    "rook", "rook", "knight", "knight", "bishop", "bishop", "queen", "king",
  ];
  return kinds.map((k) => p(k, color));
}

describe("clock", () => {
  const clock = { white_ms: 600_000, black_ms: 90_500, running: "black" as const };

  it("only the running side counts down", () => {
    expect(remainingMs(clock, "white", 5000)).toBe(600_000);
    expect(remainingMs(clock, "black", 5000)).toBe(85_500);
    expect(remainingMs(clock, "black", 999_999)).toBe(0);
    expect(remainingMs({ ...clock, running: null }, "black", 5000)).toBe(90_500);
  });

  it("formats minutes and shows tenths under ten seconds", () => {
    expect(formatClock(600_000)).toBe("10:00");
    expect(formatClock(59_999)).toBe("0:59");
    expect(formatClock(9_950)).toBe("0:09.9");
    expect(formatClock(0)).toBe("0:00.0");
    expect(formatClock(-5)).toBe("0:00.0");
  });
});

describe("material", () => {
  it("balances piece values", () => {
    const board = boardWith(p("queen", "white"), p("rook", "black"), p("pawn", "black"));
    expect(materialBalance(board, "white")).toBe(3);
    expect(materialBalance(board, "black")).toBe(-3);
  });

  it("squeezes the balance into a bar share", () => {
    expect(evalShare(0)).toBeCloseTo(0.5);
    expect(evalShare(9)).toBeGreaterThan(0.85);
    expect(evalShare(-9)).toBeLessThan(0.15);
  });

  it("lists captured pieces strongest first", () => {
    const pieces = fullSide("white").filter((x) => x.kind !== "queen");
    const board = boardWith(...pieces.slice(1)); // sans la dame ni un pion
    expect(capturedPieces(board, "white")).toEqual(["queen", "pawn"]);
  });

  it("does not count a promoted pawn as captured", () => {
    const pieces = fullSide("white");
    const board = boardWith(...pieces.slice(1), p("queen", "white")); // un pion devenu seconde dame
    expect(capturedPieces(board, "white")).toEqual([]);
  });
});

function view(partial: Partial<StateView>): StateView {
  return {
    game_id: "g",
    clock: { white_ms: 0, black_ms: 0, running: null },
    rated: false,
    opponent: { username: null, elo: null, guest: true },
    draw_offer: "none",
    ply_count: 0,
    you: "white",
    ply: 1,
    to_move: "black",
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

describe("journal", () => {
  it("names squares", () => {
    expect(sqName(0)).toBe("a1");
    expect(sqName(63)).toBe("h8");
  });

  it("describes a capturing move by the side that just played", () => {
    const board = boardWith();
    board[28] = { id: 1, kind: "knight", color: "white" };
    const line = describeAction(
      view({
        ply: 7,
        board,
        events: [
          { type: "moved", from: 11, to: 28, piece: 1 },
          { type: "captured", square: 28, piece: { id: 2, kind: "pawn", color: "black" } },
        ],
      }),
    );
    expect(line).toEqual({ ply: 7, actor: "white", kind: "move", text: "Cavalier d2–e4 · prend pion", skill: undefined });
  });

  it("recognises skill casts and who cast them", () => {
    const v = view({
      to_move: "white",
      events: [
        { type: "skill_used", color: "black", skill: "freeze", target: { kind: "piece", square: 3 } },
        { type: "effect_added", piece: 4, effect: "frozen", expires_at: 9 },
      ],
    });
    expect(launchOf(v)).toEqual({ color: "black", skill: "freeze" });
    expect(describeAction(v)).toMatchObject({ actor: "black", kind: "skill", text: "Freeze · pièce gelée" });
  });

  it("ignores empty histories and duplicate plies", () => {
    expect(describeAction(view({}))).toBeNull();
    const line = { ply: 3, actor: "white" as const, kind: "move" as const, text: "x" };
    expect(appendLog([line], line)).toHaveLength(1);
    expect(appendLog([line], null)).toHaveLength(1);
  });
});
