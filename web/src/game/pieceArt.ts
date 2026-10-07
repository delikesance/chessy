// Jeu de pièces « cburnett » (Colin M.L. Burnett, CC BY-SA 3.0) : dessins vectoriels à plat, chargés comme des SVG.
import bB from "../assets/pieces/bB.svg";
import bK from "../assets/pieces/bK.svg";
import bN from "../assets/pieces/bN.svg";
import bP from "../assets/pieces/bP.svg";
import bQ from "../assets/pieces/bQ.svg";
import bR from "../assets/pieces/bR.svg";
import wB from "../assets/pieces/wB.svg";
import wK from "../assets/pieces/wK.svg";
import wN from "../assets/pieces/wN.svg";
import wP from "../assets/pieces/wP.svg";
import wQ from "../assets/pieces/wQ.svg";
import wR from "../assets/pieces/wR.svg";
import type { Color, PieceKind } from "../protocol";

const URLS: Record<Color, Record<PieceKind, string>> = {
  white: { pawn: wP, knight: wN, bishop: wB, rook: wR, queen: wQ, king: wK },
  black: { pawn: bP, knight: bN, bishop: bB, rook: bR, queen: bQ, king: bK },
};

export const pieceArtKey = (color: Color, kind: PieceKind) => `art-${color}-${kind}`;

/** Toutes les images à précharger : [clé de texture, URL]. */
export function pieceArtAssets(): [string, string][] {
  const out: [string, string][] = [];
  for (const color of ["white", "black"] as Color[]) {
    for (const kind of Object.keys(URLS[color]) as PieceKind[]) out.push([pieceArtKey(color, kind), URLS[color][kind]]);
  }
  return out;
}
