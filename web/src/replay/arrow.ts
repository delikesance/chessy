// Flèche du meilleur coup, dessinée en SVG par-dessus le plateau (le plateau Phaser n'est pas modifié).
// Le repère est celui du plateau Phaser : SIZE × SIZE avec une marge FRAME, cases de TILE pixels.

import { FRAME, SIZE, TILE } from "../game/textures";
import type { Action, Color, Square } from "../protocol";

export const BOARD_VIEWBOX = SIZE;

/** Centre d'une case dans le repère du plateau, selon l'orientation (blancs en bas par défaut). */
export function squareCenter(square: Square, orientation: Color): { x: number; y: number } {
  const file = square % 8;
  const rank = Math.floor(square / 8);
  const white = orientation === "white";
  return {
    x: FRAME + (white ? file : 7 - file) * TILE + TILE / 2,
    y: FRAME + (white ? 7 - rank : rank) * TILE + TILE / 2,
  };
}

/** Cases de départ et d'arrivée d'une action fléchable (un coup simple), sinon `null`. */
export function arrowSquares(action: Action | null | undefined): { from: Square; to: Square } | null {
  if (!action) return null;
  if (action.type === "move") return { from: action.from, to: action.to };
  return null;
}

export interface ArrowGeometry {
  x1: number;
  y1: number;
  /** Fin du trait (la pointe est dessinée par `head`). */
  x2: number;
  y2: number;
  /** Sommets du triangle de la pointe, au format `points` d'un polygone SVG. */
  head: string;
}

/** Géométrie d'une flèche de `from` vers `to` ; `null` si les deux cases sont confondues. */
export function arrowGeometry(from: Square, to: Square, orientation: Color): ArrowGeometry | null {
  if (from === to) return null;
  const a = squareCenter(from, orientation);
  const b = squareCenter(to, orientation);
  const dx = b.x - a.x;
  const dy = b.y - a.y;
  const len = Math.hypot(dx, dy);
  const ux = dx / len;
  const uy = dy / len;
  const headLen = TILE * 0.42;
  const headHalf = TILE * 0.27;
  // La flèche part du bord de la case de départ (pas de son centre) et la pointe s'arrête avant le centre d'arrivée.
  const startX = a.x + ux * TILE * 0.2;
  const startY = a.y + uy * TILE * 0.2;
  const tipX = b.x - ux * TILE * 0.12;
  const tipY = b.y - uy * TILE * 0.12;
  const baseX = tipX - ux * headLen;
  const baseY = tipY - uy * headLen;
  const nx = -uy;
  const ny = ux;
  const r = (n: number) => Math.round(n * 10) / 10;
  return {
    x1: r(startX),
    y1: r(startY),
    x2: r(baseX),
    y2: r(baseY),
    head: `${r(tipX)},${r(tipY)} ${r(baseX + nx * headHalf)},${r(baseY + ny * headHalf)} ${r(baseX - nx * headHalf)},${r(baseY - ny * headHalf)}`,
  };
}
