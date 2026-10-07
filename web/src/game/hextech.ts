// Rendus du jeu « hextech » : pièces en 3D (ivoire et or / saphir et turquoise), damier d'obsidienne, cadre d'or.
import ivoryBishop from "../assets/hextech/pieces/ivory-bishop.webp";
import ivoryKing from "../assets/hextech/pieces/ivory-king.webp";
import ivoryKnight from "../assets/hextech/pieces/ivory-knight.webp";
import ivoryPawn from "../assets/hextech/pieces/ivory-pawn.webp";
import ivoryQueen from "../assets/hextech/pieces/ivory-queen.webp";
import ivoryRook from "../assets/hextech/pieces/ivory-rook.webp";
import sapphireBishop from "../assets/hextech/pieces/sapphire-bishop.webp";
import sapphireKing from "../assets/hextech/pieces/sapphire-king.webp";
import sapphireKnight from "../assets/hextech/pieces/sapphire-knight.webp";
import sapphirePawn from "../assets/hextech/pieces/sapphire-pawn.webp";
import sapphireQueen from "../assets/hextech/pieces/sapphire-queen.webp";
import sapphireRook from "../assets/hextech/pieces/sapphire-rook.webp";
import boardFrame from "../assets/hextech/board-frame.webp";
import boardSquares from "../assets/hextech/board-squares.webp";
import type { Color, PieceKind } from "../protocol";

const PIECES: Record<Color, Record<PieceKind, string>> = {
  white: { pawn: ivoryPawn, knight: ivoryKnight, bishop: ivoryBishop, rook: ivoryRook, queen: ivoryQueen, king: ivoryKing },
  black: { pawn: sapphirePawn, knight: sapphireKnight, bishop: sapphireBishop, rook: sapphireRook, queen: sapphireQueen, king: sapphireKing },
};

export const hexSourceKey = (color: Color, kind: PieceKind) => `hx-src-${color}-${kind}`;
export const HEX_SQUARES_KEY = "hx-src-squares";
export const HEX_FRAME_KEY = "hx-src-frame";

/** Toutes les images à précharger : [clé de texture, URL]. */
export function hextechAssets(): [string, string][] {
  const out: [string, string][] = [
    [HEX_SQUARES_KEY, boardSquares],
    [HEX_FRAME_KEY, boardFrame],
  ];
  for (const color of ["white", "black"] as Color[]) {
    for (const kind of Object.keys(PIECES[color]) as PieceKind[]) out.push([hexSourceKey(color, kind), PIECES[color][kind]]);
  }
  return out;
}
