import { describe, expect, it } from "vitest";
import { clickRejected, dragStart, dropOn, exceedsDragThreshold, IDLE } from "./interaction";
import {
  premoveAllowed,
  premoveClick,
  premoveDragStart,
  premoveHighlights,
  premoveNeedsPromo,
  premoveStillPossible,
  premoveTargets,
  resolvePremove,
} from "./premove";
import type { Color, Piece, PieceKind, SkillTarget, Square, StateView } from "./protocol";

const sqr = (name: string): Square => "abcdefgh".indexOf(name[0]) + (Number(name[1]) - 1) * 8;
const names = (squares: Square[]) => squares.map((s) => `${"abcdefgh"[s % 8]}${Math.floor(s / 8) + 1}`).sort();

let nextId = 1;
const piece = (kind: PieceKind, color: Color): Piece => ({ id: nextId++, kind, color });

function boardOf(spec: Record<string, [PieceKind, Color]>): (Piece | null)[] {
  const b: (Piece | null)[] = Array(64).fill(null);
  for (const [at, [kind, color]] of Object.entries(spec)) b[sqr(at)] = piece(kind, color);
  return b;
}

function view(partial: Partial<StateView>): StateView {
  return {
    game_id: "g",
    clock: { white_ms: 600_000, black_ms: 600_000, running: "black" },
    clock_enabled: true,
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
    traps: [],
    benched: [],
    terrain: [],
    outcome: { type: "ongoing" },
    events: [],
    opponent_connected: true,
    ...partial,
  };
}

describe("premoveTargets", () => {
  it("cavalier : ses 8 sauts, sans les cases de nos pièces", () => {
    const b = boardOf({ d4: ["knight", "white"] });
    expect(names(premoveTargets(b, sqr("d4"), "white"))).toEqual(["b3", "b5", "c2", "c6", "e2", "e6", "f3", "f5"]);
    const blocked = boardOf({ d4: ["knight", "white"], f5: ["pawn", "white"], e6: ["pawn", "black"] });
    const t = names(premoveTargets(blocked, sqr("d4"), "white"));
    expect(t).not.toContain("f5");
    expect(t).toContain("e6"); // case adverse : visable
  });

  it("cavalier au bord : seulement les cases du plateau", () => {
    const b = boardOf({ a1: ["knight", "white"] });
    expect(names(premoveTargets(b, sqr("a1"), "white"))).toEqual(["b3", "c2"]);
  });

  it("fou, tour, dame : toute la ligne jusqu'au bord, obstacles ignorés", () => {
    const b = boardOf({ c1: ["bishop", "white"], d2: ["pawn", "white"], e3: ["pawn", "black"] });
    const t = names(premoveTargets(b, sqr("c1"), "white"));
    expect(t).toEqual(["a3", "b2", "e3", "f4", "g5", "h6"]); // d2 (à nous) exclue, le reste de la diagonale visé
    const rook = boardOf({ a1: ["rook", "white"] });
    expect(premoveTargets(rook, sqr("a1"), "white")).toHaveLength(14);
    const queen = boardOf({ d4: ["queen", "white"] });
    expect(premoveTargets(queen, sqr("d4"), "white")).toHaveLength(27);
  });

  it("roi : une case autour, et le roque depuis e1/e8", () => {
    const b = boardOf({ e1: ["king", "white"] });
    expect(names(premoveTargets(b, sqr("e1"), "white"))).toEqual(["c1", "d1", "d2", "e2", "f1", "f2", "g1"]);
    const moved = boardOf({ e2: ["king", "white"] });
    expect(premoveTargets(moved, sqr("e2"), "white")).toHaveLength(8);
    const black = boardOf({ e8: ["king", "black"] });
    expect(names(premoveTargets(black, sqr("e8"), "black"))).toEqual(["c8", "d7", "d8", "e7", "f7", "f8", "g8"]);
  });

  it("pion : avance, double pas depuis la case de départ, diagonales avant même vides", () => {
    const b = boardOf({ e2: ["pawn", "white"], d3: ["pawn", "white"], e4: ["pawn", "white"] });
    expect(names(premoveTargets(b, sqr("e2"), "white"))).toEqual(["e3", "f3"]); // e4 et d3 : nos pièces
    const open = boardOf({ e2: ["pawn", "white"] });
    expect(names(premoveTargets(open, sqr("e2"), "white"))).toEqual(["d3", "e3", "e4", "f3"]);
    const mid = boardOf({ e4: ["pawn", "white"] });
    expect(names(premoveTargets(mid, sqr("e4"), "white"))).toEqual(["d5", "e5", "f5"]);
    const edge = boardOf({ a2: ["pawn", "white"] });
    expect(names(premoveTargets(edge, sqr("a2"), "white"))).toEqual(["a3", "a4", "b3"]);
  });

  it("pion noir : vers le bas", () => {
    const b = boardOf({ d7: ["pawn", "black"] });
    expect(names(premoveTargets(b, sqr("d7"), "black"))).toEqual(["c6", "d5", "d6", "e6"]);
  });

  it("pion : la promotion se déclenche sur la dernière rangée", () => {
    const b = boardOf({ g7: ["pawn", "white"], b2: ["pawn", "black"] });
    expect(names(premoveTargets(b, sqr("g7"), "white"))).toEqual(["f8", "g8", "h8"]);
    expect(premoveNeedsPromo(b, sqr("g7"), sqr("g8"))).toBe(true);
    expect(premoveNeedsPromo(b, sqr("g7"), sqr("g6"))).toBe(false);
    expect(premoveNeedsPromo(b, sqr("b2"), sqr("b1"))).toBe(true);
  });

  it("rien pour une case vide ou une pièce adverse", () => {
    const b = boardOf({ d4: ["knight", "black"] });
    expect(premoveTargets(b, sqr("d4"), "white")).toEqual([]);
    expect(premoveTargets(b, sqr("a1"), "white")).toEqual([]);
  });
});

describe("conditions et résolution", () => {
  const board = boardOf({ e2: ["pawn", "white"], g1: ["knight", "white"] });

  it("autorisé seulement pendant le tour de l'adversaire d'une partie en cours", () => {
    expect(premoveAllowed(view({}))).toBe(true);
    expect(premoveAllowed(view({ to_move: "white" }))).toBe(false);
    expect(premoveAllowed(view({ outcome: { type: "stalemate" } }))).toBe(false);
    expect(premoveAllowed(view({}), false)).toBe(false);
  });

  it("coup légal -> envoyé", () => {
    const v = view({ to_move: "white", board, moves: [{ from: sqr("e2"), to: sqr("e4") }] });
    expect(resolvePremove(v, { from: sqr("e2"), to: sqr("e4") })).toEqual({ action: "send", move: { from: sqr("e2"), to: sqr("e4") } });
  });

  it("coup devenu illégal -> abandonné", () => {
    const v = view({ to_move: "white", board, moves: [{ from: sqr("e2"), to: sqr("e3") }] });
    expect(resolvePremove(v, { from: sqr("e2"), to: sqr("e4") })).toEqual({ action: "drop", reason: "illegal" });
  });

  it("pièce d'origine absente ou capturée -> abandonné", () => {
    const v = view({ to_move: "white", board: boardOf({ g1: ["knight", "white"] }), moves: [{ from: sqr("e2"), to: sqr("e4") }] });
    expect(resolvePremove(v, { from: sqr("e2"), to: sqr("e4") })).toEqual({ action: "drop", reason: "gone" });
  });

  it("promotion : la pièce choisie doit correspondre", () => {
    const b = boardOf({ g7: ["pawn", "white"] });
    const moves = (["queen", "rook", "bishop", "knight"] as PieceKind[]).map((promo) => ({ from: sqr("g7"), to: sqr("g8"), promo }));
    const v = view({ to_move: "white", board: b, moves });
    expect(resolvePremove(v, { from: sqr("g7"), to: sqr("g8"), promo: "queen" })).toEqual({
      action: "send",
      move: { from: sqr("g7"), to: sqr("g8"), promo: "queen" },
    });
    expect(resolvePremove(v, { from: sqr("g7"), to: sqr("g8") })).toEqual({ action: "drop", reason: "illegal" });
  });

  it("partie terminée ou pas notre tour -> abandonné", () => {
    const over = view({ to_move: "white", board, outcome: { type: "checkmate", winner: "black" }, moves: [{ from: sqr("e2"), to: sqr("e4") }] });
    expect(resolvePremove(over, { from: sqr("e2"), to: sqr("e4") })).toEqual({ action: "drop", reason: "over" });
    expect(resolvePremove(view({ board }), { from: sqr("e2"), to: sqr("e4") })).toEqual({ action: "drop", reason: "not_turn" });
  });

  it("caduc quand la partie se termine ou que la pièce disparaît", () => {
    const pm = { from: sqr("e2"), to: sqr("e4") };
    expect(premoveStillPossible(view({ board }), pm)).toBe(true);
    expect(premoveStillPossible(view({ board, outcome: { type: "resignation", winner: "black" } }), pm)).toBe(false);
    expect(premoveStillPossible(view({ board: boardOf({ g1: ["knight", "white"] }) }), pm)).toBe(false);
    expect(premoveStillPossible(view({ board: boardOf({ e2: ["pawn", "black"] }) }), pm)).toBe(false);
  });
});

describe("clics en mode premove", () => {
  const board = boardOf({ e2: ["pawn", "white"], g1: ["knight", "white"], g7: ["pawn", "white"], e7: ["pawn", "black"] });
  const v = view({ board });

  it("choisit une pièce, puis pose le premove", () => {
    let r = premoveClick(v, null, sqr("g1"));
    expect(r).toEqual({ selected: sqr("g1") });
    r = premoveClick(v, r.selected, sqr("f3"));
    expect(r.set).toEqual({ from: sqr("g1"), to: sqr("f3") });
    expect(r.selected).toBeNull();
  });

  it("change de pièce en cliquant une autre pièce à nous", () => {
    expect(premoveClick(v, sqr("g1"), sqr("e2"))).toEqual({ selected: sqr("e2") });
  });

  it("case non valide : annule", () => {
    expect(premoveClick(v, sqr("g1"), sqr("a5"))).toEqual({ selected: null, cancel: true });
    expect(premoveClick(v, null, sqr("a5")).cancel).toBe(true);
    expect(premoveClick(v, sqr("g1"), sqr("e7")).cancel).toBe(true); // pièce adverse hors de portée
  });

  it("promotion : propose le choix, dame en premier", () => {
    const r = premoveClick(v, sqr("g7"), sqr("g8"));
    expect(r.set).toBeUndefined();
    expect(r.promotion).toEqual({ from: sqr("g7"), to: sqr("g8"), options: ["queen", "rook", "bishop", "knight"] });
  });

  it("rien quand ce n'est pas autorisé", () => {
    expect(premoveClick(view({ board, to_move: "white" }), null, sqr("g1"))).toEqual({ selected: null });
    expect(premoveClick(v, null, sqr("g1"), false)).toEqual({ selected: null });
  });

  it("glisser : départ possible sur nos pièces seulement", () => {
    expect(premoveDragStart(v, sqr("g1"))).toBe(true);
    expect(premoveDragStart(v, sqr("e7"))).toBe(false);
    expect(premoveDragStart(v, sqr("a1"))).toBe(false);
    expect(premoveDragStart(view({ board, to_move: "white" }), sqr("g1"))).toBe(false);
  });

  it("surbrillances", () => {
    const h = premoveHighlights(v, sqr("g1"));
    expect(h.selectable.sort()).toEqual([sqr("e2"), sqr("g1"), sqr("g7")].sort());
    expect(names(h.targets)).toEqual(["f3", "h3"]);
    expect(h.selected).toBe(sqr("g1"));
  });
});

describe("glisser-déposer (notre tour)", () => {
  const board = boardOf({ e2: ["pawn", "white"], g1: ["knight", "white"] });
  const v = view({
    to_move: "white",
    board,
    moves: [
      { from: sqr("e2"), to: sqr("e3") },
      { from: sqr("e2"), to: sqr("e4") },
      { from: sqr("g1"), to: sqr("f3") },
    ],
  });

  it("seuil de 4 px", () => {
    expect(exceedsDragThreshold(2, 2)).toBe(false);
    expect(exceedsDragThreshold(3, 3)).toBe(true);
    expect(exceedsDragThreshold(0, 4)).toBe(true);
    expect(exceedsDragThreshold(0, 3.9)).toBe(false);
  });

  it("démarre sur une pièce jouable seulement", () => {
    expect(dragStart(v, IDLE, sqr("e2"))).toEqual({ kind: "idle", selected: sqr("e2") });
    expect(dragStart(v, IDLE, sqr("a1"))).toBeNull();
    expect(dragStart(view({ board, to_move: "black" }), IDLE, sqr("e2"))).toBeNull();
    expect(dragStart({ ...v, outcome: { type: "stalemate" } }, IDLE, sqr("e2"))).toBeNull();
  });

  it("dépose valide : coup envoyé, la pièce se pose", () => {
    const d = dropOn(v, IDLE, sqr("e2"), sqr("e4"));
    expect(d.result.send).toEqual({ type: "move", from: sqr("e2"), to: sqr("e4") });
    expect(d.verdict).toBe("snap");
    expect(d.rejected).toBe(false);
  });

  it("dépose invalide : retour, buzz, désélection", () => {
    const d = dropOn(v, IDLE, sqr("e2"), sqr("h5"));
    expect(d.result.send).toBeUndefined();
    expect(d.result.interaction).toEqual(IDLE);
    expect(d.verdict).toBe("return");
    expect(d.rejected).toBe(true);
  });

  it("dépose sur sa propre case : simple sélection", () => {
    const d = dropOn(v, IDLE, sqr("e2"), sqr("e2"));
    expect(d.result.interaction).toEqual({ kind: "idle", selected: sqr("e2") });
    expect(d.rejected).toBe(false);
    expect(d.verdict).toBe("return");
  });

  it("promotion : sélecteur, la pièce revient", () => {
    const b = boardOf({ g7: ["pawn", "white"] });
    const pv = view({ to_move: "white", board: b, moves: (["queen", "rook", "bishop", "knight"] as PieceKind[]).map((promo) => ({ from: sqr("g7"), to: sqr("g8"), promo })) });
    const d = dropOn(pv, IDLE, sqr("g7"), sqr("g8"));
    expect(d.result.promotion).toEqual({ from: sqr("g7"), to: sqr("g8"), options: ["queen", "rook", "bishop", "knight"] });
    expect(d.result.send).toBeUndefined();
    expect(d.verdict).toBe("return");
  });

  const tp = (from: string, to: string): SkillTarget => ({ kind: "piece_to", from: sqr(from), to: sqr(to) });
  const skillView = view({
    to_move: "white",
    board,
    skill_options: [{ skill: "teleportation", targets: [tp("e2", "e5"), tp("e2", "a5"), tp("g1", "g5")] }],
  });
  const armed = { kind: "skill", skill: "teleportation", first: null } as const;

  it("compétence en deux étapes : glisser la pièce vers la case cible", () => {
    expect(dragStart(skillView, armed, sqr("e2"))).toEqual({ kind: "skill", skill: "teleportation", first: sqr("e2") });
    expect(dragStart(skillView, armed, sqr("a1"))).toBeNull();
    const d = dropOn(skillView, armed, sqr("e2"), sqr("e5"));
    expect(d.result.send).toEqual({ type: "skill", skill: "teleportation", target: tp("e2", "e5") });
    expect(d.verdict).toBe("return"); // la compétence a sa propre animation
    const bad = dropOn(skillView, armed, sqr("e2"), sqr("g5"));
    expect(bad.rejected).toBe(true);
    expect(bad.result.interaction).toEqual(armed);
  });

  it("compétence à une seule étape : pas de glisser", () => {
    const one = view({ to_move: "white", board, skill_options: [{ skill: "imune", targets: [{ kind: "piece", square: sqr("e2") }] }] });
    expect(dragStart(one, { kind: "skill", skill: "imune", first: null }, sqr("e2"))).toBeNull();
  });
});

describe("clic refusé", () => {
  const board = boardOf({ e2: ["pawn", "white"], e7: ["pawn", "black"] });
  it("hors de notre tour, sans premove : cliquer sa pièce est refusé", () => {
    expect(clickRejected(view({ board }), IDLE, sqr("e2"), false)).toBe(true);
    expect(clickRejected(view({ board }), IDLE, sqr("e2"), true)).toBe(false);
    expect(clickRejected(view({ board }), IDLE, sqr("e7"), false)).toBe(false);
    expect(clickRejected(view({ board, outcome: { type: "stalemate" } }), IDLE, sqr("e2"), false)).toBe(false);
  });
  it("ciblage de compétence : une pièce qui n'est pas une cible", () => {
    const v = view({ to_move: "white", board, skill_options: [{ skill: "imune", targets: [{ kind: "piece", square: sqr("e2") }] }] });
    const armed = { kind: "skill", skill: "imune", first: null } as const;
    expect(clickRejected(v, armed, sqr("e7"))).toBe(true);
    expect(clickRejected(v, armed, sqr("e2"))).toBe(false);
    expect(clickRejected(v, armed, sqr("a4"))).toBe(false);
  });
});
