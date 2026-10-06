import { useEffect, useRef } from "react";
import { FRAME, SIZE, TILE, drawBoard, drawPiece } from "../game/textures";
import type { Color, PieceKind } from "../protocol";
import { accentColor, boardTheme, pieceSet, premoveColor, type ThemeSettings } from "../theme";

const KIND_BY_LETTER: Record<string, PieceKind> = { p: "pawn", n: "knight", b: "bishop", r: "rook", q: "queen", k: "king" };

/** 1.e4 e5 2.Cf3 Cc6 : de quoi montrer pièces, dernier coup, cases légales et premove. */
const POSITION = "r1bqkbnr/pppp1ppp/2n5/4p3/4P3/5N2/PPPP1PPP/RNBQKB1R";

const sq = (name: string) => "abcdefgh".indexOf(name[0]) + (Number(name[1]) - 1) * 8;
const LAST = ["b8", "c6"].map(sq);
const TARGETS = ["d4", "g5", "h4", "g1"].map(sq);
const CAPTURE = sq("e5");
const SELECTED = sq("f3");
const PREMOVE: [number, number] = [sq("d2"), sq("d3")];

const pieceCache = new Map<string, HTMLCanvasElement>();

function pieceCanvas(kind: PieceKind, color: Color, set: ThemeSettings["pieces"]): HTMLCanvasElement {
  const key = `${set}-${color}-${kind}`;
  let canvas = pieceCache.get(key);
  if (!canvas) {
    canvas = document.createElement("canvas");
    const p = pieceSet(set);
    drawPiece(canvas, kind, color, color === "white" ? p.white : p.black);
    pieceCache.set(key, canvas);
  }
  return canvas;
}

const center = (square: number) => ({ x: FRAME + (square % 8) * TILE + TILE / 2, y: FRAME + (7 - Math.floor(square / 8)) * TILE + TILE / 2 });
const cell = (square: number) => ({ x: FRAME + (square % 8) * TILE, y: FRAME + (7 - Math.floor(square / 8)) * TILE });

function draw(canvas: HTMLCanvasElement, theme: ThemeSettings) {
  drawBoard(canvas, "white", boardTheme(theme.board));
  const ctx = canvas.getContext("2d")!;
  const accent = accentColor(theme.accent);
  const premove = premoveColor(theme.accent);

  // Dernier coup : cases teintées par l'accent.
  for (const s of LAST) {
    const { x, y } = cell(s);
    ctx.globalAlpha = 0.32;
    ctx.fillStyle = accent;
    ctx.fillRect(x, y, TILE, TILE);
    ctx.globalAlpha = 0.7;
    ctx.strokeStyle = accent;
    ctx.lineWidth = 2;
    ctx.strokeRect(x + 1, y + 1, TILE - 2, TILE - 2);
  }
  // Pièce choisie.
  {
    const { x, y } = cell(SELECTED);
    ctx.globalAlpha = 0.3;
    ctx.fillStyle = "#ffffff";
    ctx.fillRect(x, y, TILE, TILE);
    ctx.globalAlpha = 0.95;
    ctx.strokeStyle = "#ffffff";
    ctx.lineWidth = 3;
    ctx.strokeRect(x + 2, y + 2, TILE - 4, TILE - 4);
  }
  // Premove : cases tintées et flèche pointillée.
  ctx.globalAlpha = 1;
  for (const s of PREMOVE) {
    const { x, y } = cell(s);
    ctx.globalAlpha = 0.42;
    ctx.fillStyle = premove;
    ctx.fillRect(x, y, TILE, TILE);
    ctx.globalAlpha = 0.95;
    ctx.strokeStyle = premove;
    ctx.lineWidth = 3;
    ctx.strokeRect(x + 2, y + 2, TILE - 4, TILE - 4);
  }
  ctx.globalAlpha = 1;
  const a = center(PREMOVE[0]);
  const b = center(PREMOVE[1]);
  ctx.strokeStyle = premove;
  ctx.fillStyle = premove;
  ctx.lineWidth = 6;
  ctx.lineCap = "butt";
  ctx.setLineDash([13, 9]);
  // Le premove monte d'une case (d2 vers d3) : tirets puis pointe vers le haut.
  ctx.beginPath();
  ctx.moveTo(a.x, a.y - 16);
  ctx.lineTo(b.x, b.y + 20);
  ctx.stroke();
  ctx.setLineDash([]);
  ctx.beginPath();
  ctx.moveTo(b.x, b.y - 10);
  ctx.lineTo(b.x - 14, b.y + 14);
  ctx.lineTo(b.x + 14, b.y + 14);
  ctx.closePath();
  ctx.fill();

  // Pièces.
  const rows = POSITION.split("/");
  rows.forEach((row, i) => {
    let file = 0;
    for (const ch of row) {
      if (/\d/.test(ch)) {
        file += Number(ch);
        continue;
      }
      const color: Color = ch === ch.toLowerCase() ? "black" : "white";
      const kind = KIND_BY_LETTER[ch.toLowerCase()];
      const square = (7 - i) * 8 + file;
      const { x, y } = center(square);
      ctx.drawImage(pieceCanvas(kind, color, theme.pieces), x - 38, y - 38, 76, 76);
      file++;
    }
  });

  // Cases légales de la pièce choisie.
  for (const s of TARGETS) {
    const { x, y } = center(s);
    ctx.fillStyle = "rgba(14,15,18,0.6)";
    ctx.beginPath();
    ctx.arc(x, y, 13, 0, Math.PI * 2);
    ctx.fill();
    ctx.strokeStyle = "#e9ebef";
    ctx.lineWidth = 2.5;
    ctx.stroke();
    ctx.fillStyle = "#e9ebef";
    ctx.beginPath();
    ctx.arc(x, y, 4, 0, Math.PI * 2);
    ctx.fill();
  }
  const c = center(CAPTURE);
  ctx.strokeStyle = "#ee8272";
  ctx.lineWidth = 6;
  ctx.beginPath();
  ctx.arc(c.x, c.y, TILE / 2 - 5, 0, Math.PI * 2);
  ctx.stroke();
}

/** Plateau d'aperçu des réglages : mêmes textures que le plateau de jeu (drawBoard / drawPiece). */
export function BoardPreview({ theme }: { theme: ThemeSettings }) {
  const ref = useRef<HTMLCanvasElement>(null);
  useEffect(() => {
    const canvas = ref.current;
    if (!canvas) return;
    canvas.width = SIZE;
    canvas.height = SIZE;
    draw(canvas, theme);
  }, [theme.board, theme.pieces, theme.accent]); // eslint-disable-line react-hooks/exhaustive-deps
  return (
    <canvas
      ref={ref}
      className="st-board"
      width={SIZE}
      height={SIZE}
      role="img"
      aria-label={`Aperçu du plateau : ${boardTheme(theme.board).label}, pièces ${pieceSet(theme.pieces).label}`}
      style={{ aspectRatio: `${SIZE} / ${SIZE}` }}
    />
  );
}
