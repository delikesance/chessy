// Mini-scènes d'aperçu des 27 compétences : tableau de données, une scène par identifiant.
// Une scène = quelques éléments (pièces ou pictogrammes) posés sur un mini-échiquier 5x5, chacun avec
// une animation « jouée » dans une fenêtre de temps (a, c, b dans l'ordre chronologique). Le rendu
// (skillPreview.tsx) boucle ces scènes en CSS ; sans animation, il déduit un état « avant » et « après ».
import type { CatalogId } from "../catalog";

export const BOARD_SIZE = 5;

export type Cell = readonly [col: number, row: number];
/** Fenêtres d'animation : a (12-34 %), c (28-50 %), b (46-68 %) de la boucle. */
export type Phase = "a" | "b" | "c";

/**
 * - mv : glisse vers `to` ; hit : s'élance vers `to` puis revient ; mvout : glisse vers `to` puis s'efface ;
 * - inmv : apparaît (fenêtre a) puis glisse vers `to` (fenêtre b) ; inout : apparaît (a) puis s'efface (b) ;
 * - out / in : disparaît / apparaît ; ghost : devient fantomatique ; pop / rise : surgit (échelle) ;
 * - flash : éclair bref en fin de fenêtre ; shake : tremble ; pulse / spin : animation continue.
 */
export type Anim = "mv" | "hit" | "mvout" | "inmv" | "inout" | "out" | "in" | "ghost" | "pop" | "rise" | "flash" | "shake" | "pulse" | "spin";

export type PieceSide = "w" | "b" | "n";
export type PieceKind = "pawn" | "knight" | "bishop" | "rook" | "queen" | "king";
export type PieceSprite = `${PieceSide}:${PieceKind}`;

export const GLYPHS = [
  "ice", "shield", "wall", "rock", "trap", "eye", "eyeoff", "spark", "ring", "cross", "target", "swirl", "hl",
  "hourglass", "halo", "strings", "cancel", "forcering", "dice", "bench", "undo", "swap",
] as const;
export type Glyph = (typeof GLYPHS)[number];

export interface SceneItem {
  s: PieceSprite | Glyph;
  at: Cell;
  anim?: Anim;
  /** Fenêtre de l'animation (par défaut a). Sans objet pour pulse, spin et inmv. */
  ph?: Phase;
  /** Destination des animations qui déplacent. */
  to?: Cell;
  /** Opacité statique (éléments fantômes). */
  dim?: number;
  /** Échelle d'un pictogramme. */
  k?: number;
  /** Couleur d'un pictogramme (remplace celle par défaut). */
  c?: string;
}

export type Scene = readonly SceneItem[];

const i = (s: SceneItem["s"], col: number, row: number, extra: Partial<SceneItem> = {}): SceneItem => ({ s, at: [col, row], ...extra });
const mv = (col: number, row: number) => [col, row] as const;

export const SCENES: Record<CatalogId, Scene> = {
  // Mobilité
  teleportation: [
    i("b:pawn", 1, 3), i("b:pawn", 2, 2),
    i("ring", 0, 4, { anim: "flash", c: "#e9ebef" }),
    i("w:knight", 0, 4, { anim: "out" }),
    i("w:knight", 4, 1, { anim: "in" }),
    i("spark", 4, 1, { anim: "flash", c: "#9ec0ff" }),
  ],
  rollback: [
    i("hl", 1, 2),
    i("w:knight", 3, 1, { anim: "mv", to: mv(1, 2) }),
    i("undo", 2, 1, { anim: "flash" }),
    i("b:pawn", 3, 3),
  ],
  destiny_swapper: [
    i("w:pawn", 1, 3, { anim: "mv", to: mv(3, 1) }),
    i("w:knight", 3, 1, { anim: "mv", to: mv(1, 3) }),
    i("swap", 2, 2, { anim: "flash" }),
    i("b:rook", 3, 4),
  ],
  bench: [
    i("bench", 4, 4),
    i("w:knight", 2, 3, { anim: "mvout", to: mv(4, 4) }),
    i("b:pawn", 2, 2, { anim: "mv", ph: "c", to: mv(2, 3) }),
    i("w:knight", 3, 3, { anim: "in", ph: "b" }),
  ],
  transposition: [
    i("b:king", 2, 0), i("w:king", 2, 4),
    i("w:pawn", 1, 3, { anim: "mv", to: mv(3, 1) }),
    i("b:rook", 3, 1, { anim: "mv", to: mv(1, 3) }),
    i("swap", 2, 2, { anim: "flash" }),
  ],
  temporal: [
    i("hl", 1, 4, { dim: 0.7 }),
    i("w:pawn", 1, 3, { anim: "mv", ph: "b", to: mv(1, 2) }),
    i("hourglass", 3, 2, { anim: "spin", k: 1.3 }),
    i("b:knight", 3, 0),
  ],
  // Défense
  imune: [
    i("b:rook", 2, 0, { anim: "hit", ph: "b", to: mv(2, 2) }),
    i("w:bishop", 2, 3),
    i("shield", 2, 3, { anim: "pop" }),
    i("w:king", 4, 4),
  ],
  invisibility: [
    i("b:rook", 2, 0),
    i("w:bishop", 2, 3, { anim: "ghost" }),
    i("eyeoff", 4, 0, { anim: "pop" }),
    i("w:pawn", 0, 4),
  ],
  forcefield: [
    i("b:rook", 2, 0, { anim: "hit", ph: "c", to: mv(2, 2) }),
    i("w:bishop", 2, 3),
    i("forcering", 2, 3, { anim: "pop" }),
    i("spark", 2, 2, { anim: "flash", ph: "c", c: "#5fd0a0" }),
  ],
  celestial: [
    i("b:rook", 2, 0, { anim: "hit", to: mv(2, 1) }),
    i("w:bishop", 2, 2, { anim: "mv", ph: "b", to: mv(0, 4) }),
    i("halo", 2, 2, { anim: "inmv", to: mv(0, 4) }),
    i("w:pawn", 3, 3),
  ],
  // Contrôle
  freeze: [
    i("w:pawn", 2, 4), i("w:rook", 0, 2),
    i("b:knight", 2, 2, { anim: "shake", ph: "b" }),
    i("ice", 2, 2, { anim: "pop" }),
  ],
  canceller: [
    i("b:knight", 2, 1),
    i("w:pawn", 2, 3),
    i("ice", 2, 3, { anim: "out", ph: "b" }),
    i("cancel", 2, 3, { anim: "pop", ph: "b" }),
  ],
  tornado: [
    i("b:king", 0, 0), i("w:king", 4, 4),
    i("w:rook", 1, 1, { anim: "mv", to: mv(3, 1) }),
    i("b:knight", 3, 1, { anim: "mv", to: mv(3, 3) }),
    i("w:bishop", 3, 3, { anim: "mv", to: mv(1, 3) }),
    i("b:pawn", 1, 3, { anim: "mv", to: mv(1, 1) }),
    i("swirl", 2, 2, { anim: "spin", k: 2.3, c: "#b79cff" }),
  ],
  geomancy: [
    i("b:rook", 2, 0), i("w:king", 2, 4),
    i("rock", 1, 2, { anim: "rise" }),
    i("rock", 2, 2, { anim: "rise", ph: "c" }),
    i("rock", 3, 2, { anim: "rise", ph: "b" }),
  ],
  mind: [
    i("b:queen", 3, 0),
    i("w:knight", 1, 4),
    i("hl", 1, 4, { anim: "pop" }),
    i("hl", 2, 2, { anim: "pop", ph: "b" }),
    i("eye", 4, 4, { anim: "pulse" }),
  ],
  control: [
    i("w:pawn", 1, 3),
    i("b:rook", 3, 1, { anim: "mv", ph: "b", to: mv(3, 3) }),
    i("strings", 3, 1, { anim: "inmv", to: mv(3, 3) }),
  ],
  // Attaque
  remover: [
    i("w:rook", 2, 4),
    i("b:pawn", 1, 1), i("b:pawn", 3, 1),
    i("b:pawn", 2, 1, { anim: "out", ph: "b" }),
    i("target", 2, 1, { anim: "flash" }),
  ],
  switch: [
    i("w:rook", 0, 4), i("b:pawn", 1, 1),
    i("b:knight", 3, 1, { anim: "out" }),
    i("w:knight", 3, 1, { anim: "in" }),
    i("spark", 3, 1, { anim: "flash", c: "#ee8272" }),
  ],
  terminator: [
    i("w:pawn", 1, 4),
    i("b:queen", 2, 1),
    i("target", 2, 1, { anim: "flash" }),
    i("w:queen", 2, 3, { anim: "pop", ph: "b" }),
  ],
  trap: [
    i("w:knight", 0, 3),
    i("trap", 2, 2, { anim: "pop" }),
    i("b:rook", 2, 0, { anim: "mv", ph: "b", to: mv(2, 2) }),
    i("spark", 2, 2, { anim: "flash", ph: "b", c: "#ee8272" }),
  ],
  queensac: [
    i("b:rook", 0, 4),
    i("w:king", 3, 4, { anim: "mv", to: mv(3, 2) }),
    i("w:queen", 3, 2, { anim: "mvout", to: mv(3, 4) }),
    i("cross", 3, 4, { anim: "flash", ph: "b" }),
  ],
  // Création
  clone: [
    i("b:pawn", 3, 1),
    i("w:bishop", 1, 3),
    i("w:bishop", 2, 3, { anim: "pop" }),
    i("spark", 2, 3, { anim: "flash", c: "#eec06a" }),
  ],
  wall: [
    i("b:rook", 2, 0), i("w:king", 2, 4),
    i("wall", 1, 3, { anim: "rise" }),
    i("wall", 2, 3, { anim: "rise", ph: "c" }),
    i("wall", 3, 3, { anim: "rise", ph: "b" }),
  ],
  mirage: [
    i("b:rook", 2, 0, { anim: "mv", ph: "b", to: mv(2, 3) }),
    i("w:knight", 2, 3, { anim: "inout", dim: 0.55 }),
  ],
  evolve: [
    i("w:pawn", 1, 3), i("w:pawn", 3, 3),
    i("w:pawn", 2, 3, { anim: "out" }),
    i("w:queen", 2, 3, { anim: "in" }),
    i("spark", 2, 3, { anim: "flash", c: "#eec06a" }),
  ],
  morph: [
    i("b:rook", 4, 0),
    i("w:bishop", 2, 2, { anim: "out" }),
    i("w:knight", 2, 2, { anim: "in" }),
    i("ring", 2, 2, { anim: "flash", c: "#eec06a" }),
  ],
  godhelp: [
    i("b:king", 2, 0), i("w:king", 2, 4),
    i("dice", 4, 0, { anim: "flash" }),
    i("n:knight", 2, 2, { anim: "pop" }),
    i("spark", 2, 2, { anim: "flash", c: "#eec06a" }),
  ],
};

// --- États statiques (mouvement réduit) ------------------------------------------------------------

export type Snapshot = "before" | "after";

export interface Resolved {
  at: Cell;
  opacity: number;
}

/** Position et opacité d'un élément avant ou après la scène ; `null` si absent de cet instantané. */
export function resolveItem(item: SceneItem, snap: Snapshot): Resolved | null {
  const base = item.dim ?? 1;
  const anim = item.anim;
  if (snap === "before") {
    if (anim === "in" || anim === "pop" || anim === "rise" || anim === "flash" || anim === "inmv" || anim === "inout") return null;
    return { at: item.at, opacity: base };
  }
  switch (anim) {
    case "out":
    case "mvout":
    case "inout":
    case "flash":
      return null;
    case "mv":
    case "inmv":
      return { at: item.to ?? item.at, opacity: base };
    case "ghost":
      return { at: item.at, opacity: Math.min(base, 0.25) };
    default:
      return { at: item.at, opacity: base };
  }
}

/** Nom de la classe d'animation CSS d'un élément (voir skillPreview.css). */
export function animClass(item: SceneItem): string | undefined {
  const a = item.anim;
  if (!a) return undefined;
  if (a === "pulse" || a === "spin") return `sv-${a}`;
  if (a === "mvout" || a === "inmv" || a === "inout") return `sv-${a}`;
  return `sv-${a}-${item.ph ?? "a"}`;
}
