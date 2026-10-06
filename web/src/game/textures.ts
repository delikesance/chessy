// Textures du plateau et des pièces, générées sur canvas : aucune image externe.
import type { Color, PieceKind } from "../protocol";

export const TILE = 80;
export const FRAME = 24;
export const BOARD_PX = TILE * 8;
export const SIZE = BOARD_PX + FRAME * 2;

const LIGHT = "#9aa1ac";
const DARK = "#59606c";

/** Générateur pseudo-aléatoire déterministe : la pierre est identique à chaque partie. */
function mulberry32(seed: number) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function shade(hex: string, amount: number): string {
  const n = parseInt(hex.slice(1), 16);
  const ch = (v: number) => Math.max(0, Math.min(255, Math.round(v + amount * 255)));
  return `rgb(${ch(n >> 16)},${ch((n >> 8) & 255)},${ch(n & 255)})`;
}

/** Cadre usiné + 64 cases de pierre + coordonnées dans les cases. */
export function drawBoard(canvas: HTMLCanvasElement, orientation: Color) {
  canvas.width = SIZE;
  canvas.height = SIZE;
  const ctx = canvas.getContext("2d")!;
  const rnd = mulberry32(1337);

  // Cadre : dégradé sombre, filet clair, chanfrein intérieur.
  const frame = ctx.createLinearGradient(0, 0, SIZE, SIZE);
  frame.addColorStop(0, "#23272e");
  frame.addColorStop(0.5, "#181b20");
  frame.addColorStop(1, "#1f2329");
  ctx.fillStyle = frame;
  ctx.fillRect(0, 0, SIZE, SIZE);
  ctx.strokeStyle = "#3b414b";
  ctx.lineWidth = 2;
  ctx.strokeRect(1, 1, SIZE - 2, SIZE - 2);
  ctx.strokeStyle = "rgba(255,255,255,0.05)";
  ctx.lineWidth = 1;
  ctx.strokeRect(6.5, 6.5, SIZE - 13, SIZE - 13);
  ctx.strokeStyle = "rgba(0,0,0,0.5)";
  ctx.strokeRect(FRAME - 3.5, FRAME - 3.5, BOARD_PX + 7, BOARD_PX + 7);

  ctx.font = '600 12px "Geist Mono Variable", "Geist Mono", ui-monospace, monospace';
  ctx.textBaseline = "top";

  for (let row = 0; row < 8; row++) {
    for (let col = 0; col < 8; col++) {
      const x = FRAME + col * TILE;
      const y = FRAME + row * TILE;
      const file = orientation === "white" ? col : 7 - col;
      const rank = orientation === "white" ? 7 - row : row;
      const light = (file + rank) % 2 === 1;
      const base = light ? LIGHT : DARK;

      const g = ctx.createLinearGradient(x, y, x + TILE, y + TILE);
      g.addColorStop(0, shade(base, 0.05));
      g.addColorStop(1, shade(base, -0.05));
      ctx.fillStyle = g;
      ctx.fillRect(x, y, TILE, TILE);

      // Grain de pierre : poussière claire et sombre.
      for (let i = 0; i < 260; i++) {
        const px = x + rnd() * TILE;
        const py = y + rnd() * TILE;
        const size = rnd() < 0.15 ? 2 : 1;
        ctx.fillStyle = rnd() < 0.5 ? "rgba(255,255,255,0.07)" : "rgba(0,0,0,0.09)";
        ctx.fillRect(px, py, size, size);
      }
      // Quelques veines fines.
      ctx.lineWidth = 1;
      for (let i = 0; i < 2; i++) {
        ctx.strokeStyle = rnd() < 0.5 ? "rgba(255,255,255,0.05)" : "rgba(0,0,0,0.07)";
        ctx.beginPath();
        const sx = x + rnd() * TILE;
        const sy = y + rnd() * TILE;
        ctx.moveTo(sx, sy);
        ctx.bezierCurveTo(sx + rnd() * 30 - 15, sy + rnd() * 30, sx + rnd() * 40 - 20, sy + rnd() * 40, x + rnd() * TILE, y + rnd() * TILE);
        ctx.stroke();
      }
      // Chanfrein : lumière en haut à gauche, ombre en bas à droite.
      ctx.fillStyle = "rgba(255,255,255,0.10)";
      ctx.fillRect(x, y, TILE, 1);
      ctx.fillRect(x, y, 1, TILE);
      ctx.fillStyle = "rgba(0,0,0,0.22)";
      ctx.fillRect(x, y + TILE - 1, TILE, 1);
      ctx.fillRect(x + TILE - 1, y, 1, TILE);

      // Coordonnées dans les cases : rang sur la colonne de gauche, colonne sur la rangée du bas.
      ctx.fillStyle = light ? "rgba(30,34,41,0.7)" : "rgba(233,235,239,0.62)";
      if (col === 0) {
        ctx.textAlign = "left";
        ctx.fillText(String(rank + 1), x + 5, y + 4);
      }
      if (row === 7) {
        ctx.textAlign = "right";
        ctx.fillText("abcdefgh"[file], x + TILE - 5, y + TILE - 17);
      }
    }
  }
  // Ombre intérieure du cadre sur les cases.
  const inner = ctx.createLinearGradient(0, FRAME, 0, FRAME + 10);
  inner.addColorStop(0, "rgba(0,0,0,0.35)");
  inner.addColorStop(1, "rgba(0,0,0,0)");
  ctx.fillStyle = inner;
  ctx.fillRect(FRAME, FRAME, BOARD_PX, 10);
}

// ---- pièces -------------------------------------------------------------------

const BASE = "M24 90H76Q80 90 80 86V81Q80 78 77 78H23Q20 78 20 81V86Q20 90 24 90Z";
const circle = (cx: number, cy: number, r: number) => `M${cx - r} ${cy}a${r} ${r} 0 1 1 ${2 * r} 0a${r} ${r} 0 1 1 ${-2 * r} 0Z`;

interface Shape {
  parts: string[];
  details: string[];
}

const SHAPES: Record<PieceKind, Shape> = {
  pawn: {
    parts: [BASE, "M37 78C39 68 43 62 44 54H56C57 62 61 68 63 78Z", "M35 56H65Q68 56 68 52Q68 47 64 47H36Q32 47 32 52Q32 56 35 56Z", circle(50, 33, 13)],
    details: [],
  },
  rook: {
    parts: [BASE, "M33 78L37 46H63L67 78Z", "M30 48V20H40V28H45V20H55V28H60V20H70V48Z"],
    details: ["M30 48H70", "M36 55H64"],
  },
  bishop: {
    parts: [
      BASE,
      "M38 78C40 70 44 66 44 58H56C56 66 60 70 62 78Z",
      "M36 62H64Q66 62 66 58Q66 54 63 54H37Q34 54 34 58Q34 62 36 62Z",
      "M50 14C62 24 69 38 62 50C60 53 58 54 56 54H44C42 54 40 53 38 50C31 38 38 24 50 14Z",
      circle(50, 11, 4),
    ],
    details: ["M50 26V38M44 32H56"],
  },
  knight: {
    parts: [
      BASE,
      "M31 78C31 64 39 58 44 48C38 50 33 54 27 59L21 52C25 42 31 34 39 26L37 15L46 21C48 19 52 17 56 17C70 20 79 34 79 54C79 66 74 72 74 78Z",
    ],
    details: ["M53 24C61 32 67 44 64 62", "M29 45L33 46"],
  },
  queen: {
    parts: [
      BASE,
      "M32 78L35 52L22 28L39 42L50 20L61 42L78 28L65 52L68 78Z",
      "M33 58H67Q70 58 70 54Q70 50 67 50H33Q30 50 30 54Q30 58 33 58Z",
      circle(22, 25, 4.5),
      circle(50, 16, 4.5),
      circle(78, 25, 4.5),
    ],
    details: [],
  },
  king: {
    parts: [
      BASE,
      "M36 78C36 68 38 62 34 52C31 46 38 40 50 40C62 40 69 46 66 52C62 62 64 68 64 78Z",
      "M35 46H65Q68 46 68 42Q68 38 64 38H36Q32 38 32 42Q32 46 35 46Z",
      "M47 5H53V14H62V20H53V32H47V20H38V14H47Z",
    ],
    details: [],
  },
};

export const PIECE_TEX = 128;

export function pieceKey(color: Color, kind: PieceKind): string {
  return `piece-${color}-${kind}`;
}

/** Pièce avec volume (dégradé latéral, liseré) et ombre portée cuite dans la texture. */
export function drawPiece(canvas: HTMLCanvasElement, kind: PieceKind, color: Color) {
  canvas.width = PIECE_TEX;
  canvas.height = PIECE_TEX;
  const ctx = canvas.getContext("2d")!;
  const white = color === "white";
  const s = 1.18;
  ctx.setTransform(s, 0, 0, s, (PIECE_TEX - 100 * s) / 2, 2);
  const shape = SHAPES[kind];
  const paths = shape.parts.map((d) => new Path2D(d));

  // Passe 1 : ombre portée de l'ensemble.
  ctx.shadowColor = "rgba(0,0,0,0.55)";
  ctx.shadowBlur = 7;
  ctx.shadowOffsetY = 4;
  ctx.fillStyle = white ? "#c8c4ba" : "#202127";
  for (const p of paths) ctx.fill(p);
  ctx.shadowColor = "transparent";

  // Passe 2 : volume.
  const grad = ctx.createLinearGradient(22, 0, 80, 0);
  if (white) {
    grad.addColorStop(0, "#fffdf8");
    grad.addColorStop(0.45, "#e6e2d8");
    grad.addColorStop(1, "#a7a399");
  } else {
    grad.addColorStop(0, "#666a77");
    grad.addColorStop(0.45, "#383b44");
    grad.addColorStop(1, "#15161a");
  }
  ctx.lineJoin = "round";
  for (const p of paths) {
    ctx.fillStyle = grad;
    ctx.fill(p);
    ctx.lineWidth = 2;
    ctx.strokeStyle = white ? "#2b2d34" : "#050506";
    ctx.stroke(p);
  }
  // Reflet fin sur le côté éclairé.
  ctx.save();
  ctx.lineWidth = 1.2;
  ctx.strokeStyle = white ? "rgba(255,255,255,0.8)" : "rgba(255,255,255,0.22)";
  ctx.translate(1.5, 1.5);
  ctx.globalCompositeOperation = "source-atop";
  for (const p of paths.slice(1)) ctx.stroke(p);
  ctx.restore();

  ctx.lineWidth = 1.6;
  ctx.strokeStyle = white ? "rgba(43,45,52,0.7)" : "rgba(255,255,255,0.28)";
  for (const d of shape.details) ctx.stroke(new Path2D(d));
  if (kind === "knight") {
    ctx.fillStyle = white ? "#2b2d34" : "#e9ebef";
    ctx.fill(new Path2D(circle(56, 31, 2.4)));
  }
}
