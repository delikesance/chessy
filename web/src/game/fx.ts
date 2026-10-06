// Primitives de dessin des marqueurs et effets (Graphics centrés sur l'origine). Aucune logique de jeu.
import Phaser from "phaser";
import type { EffectKind } from "../protocol";

export const FX = {
  portal: 0xb79cff,
  shield: 0x5fd0a0,
  ice: 0xbfe3ff,
  stone: 0xc3c9d4,
  trail: 0x7aa2ff,
  clone: 0xeec06a,
  thread: 0xb79cff,
  dust: 0xe9ebef,
  gold: 0xf2cf6b,
  field: 0x6fe3d2,
  mirage: 0x9fd3ff,
  rune: 0xf0a35e,
  morph: 0xb79cff,
  puppet: 0xb08cff,
  glitch: 0x4dd2ff,
  glitchAlt: 0xff4d8d,
  attack: 0xee8272,
};

const pt = (x: number, y: number) => new Phaser.Math.Vector2(x, y);

/** Bouclier au trait, centré sur l'origine du Graphics. */
export function drawShield(g: Phaser.GameObjects.Graphics, k = 1) {
  const pts = [
    [0, -34], [26, -26], [26, 2], [0, 34], [-26, 2], [-26, -26],
  ].map(([px, py]) => pt(px * k, py * k));
  g.fillStyle(FX.shield, 0.16).fillPoints(pts, true);
  g.lineStyle(3, FX.shield, 0.95).strokePoints(pts, true);
}

/** Cristal facetté (Freeze, pièces verrouillées). */
export function drawCrystal(g: Phaser.GameObjects.Graphics, color = FX.ice) {
  const pts: Phaser.Math.Vector2[] = [];
  for (let i = 0; i < 6; i++) {
    const a = (Math.PI / 3) * i - Math.PI / 2;
    pts.push(pt(Math.cos(a) * 33, Math.sin(a) * 33));
  }
  g.fillStyle(color, 0.2).fillPoints(pts, true);
  g.lineStyle(3, color, 0.95).strokePoints(pts, true);
  g.lineStyle(1.5, color, 0.6);
  for (let i = 0; i < 3; i++) g.lineBetween(pts[i].x, pts[i].y, pts[i + 3].x, pts[i + 3].y);
}

/** Anneau hexagonal du Force Field : deux hexagones concentriques et des attaches aux sommets. */
export function drawHexRing(g: Phaser.GameObjects.Graphics, r = 36, color = FX.field) {
  const outer: Phaser.Math.Vector2[] = [];
  const inner: Phaser.Math.Vector2[] = [];
  for (let i = 0; i < 6; i++) {
    const a = (Math.PI / 3) * i;
    outer.push(pt(Math.cos(a) * r, Math.sin(a) * r));
    inner.push(pt(Math.cos(a) * (r - 6), Math.sin(a) * (r - 6)));
  }
  g.fillStyle(color, 0.1).fillPoints(outer, true);
  g.lineStyle(3, color, 0.95).strokePoints(outer, true);
  g.lineStyle(1.5, color, 0.55).strokePoints(inner, true);
  g.lineStyle(1.5, color, 0.55);
  for (let i = 0; i < 6; i++) g.lineBetween(outer[i].x, outer[i].y, inner[i].x, inner[i].y);
}

/** Halo doré de Celestial Intervention : cercle, rayons et lueur. */
export function drawHalo(g: Phaser.GameObjects.Graphics, r = 34, color = FX.gold) {
  g.fillStyle(color, 0.12).fillCircle(0, 0, r + 6);
  g.fillStyle(color, 0.16).fillCircle(0, 0, r - 4);
  g.lineStyle(3, color, 0.95).strokeCircle(0, 0, r);
  g.lineStyle(2, color, 0.7);
  for (let i = 0; i < 12; i++) {
    const a = (Math.PI / 6) * i;
    const long = i % 2 === 0;
    g.lineBetween(Math.cos(a) * (r + 3), Math.sin(a) * (r + 3), Math.cos(a) * (r + (long ? 12 : 7)), Math.sin(a) * (r + (long ? 12 : 7)));
  }
}

/** Anneau pointillé (pièce métamorphosée, copie temporaire, pièce invisible). */
export function drawDashedRing(g: Phaser.GameObjects.Graphics, color: number, r = 34, dashes = 16, width = 3, alpha = 0.95) {
  g.lineStyle(width, color, alpha);
  const step = (Math.PI * 2) / dashes;
  for (let i = 0; i < dashes; i++) {
    g.beginPath().arc(0, 0, r, i * step, i * step + step * 0.55, false).strokePath();
  }
}

/** Marionnette : une barre de contrôle au-dessus de la pièce et trois fils qui descendent sur elle. */
export function drawStrings(g: Phaser.GameObjects.Graphics, color = FX.puppet) {
  const top = -74;
  g.lineStyle(2, color, 0.9);
  g.lineBetween(-22, top, 22, top);
  g.lineStyle(3, color, 1).lineBetween(0, top - 8, 0, top);
  g.fillStyle(color, 1).fillCircle(0, top - 9, 3);
  const heads: [number, number][] = [[-14, -26], [0, -36], [14, -26]];
  g.lineStyle(1.5, color, 0.85);
  heads.forEach(([hx, hy], i) => {
    const bx = (i - 1) * 22;
    g.lineBetween(bx, top, hx, hy);
    g.fillStyle(color, 1).fillCircle(hx, hy, 2.4);
  });
  g.lineStyle(2, color, 0.55).strokeCircle(0, 0, 33);
}

/** Rune de piège : double cercle, triangle inscrit et graduations. */
export function drawRune(g: Phaser.GameObjects.Graphics, color = FX.rune) {
  g.fillStyle(color, 0.08).fillCircle(0, 0, 29);
  g.lineStyle(2, color, 0.85).strokeCircle(0, 0, 29);
  g.lineStyle(1.5, color, 0.6).strokeCircle(0, 0, 23);
  const tri = [0, 1, 2].map((i) => {
    const a = -Math.PI / 2 + (Math.PI * 2 * i) / 3;
    return pt(Math.cos(a) * 20, Math.sin(a) * 20);
  });
  g.lineStyle(2, color, 0.85).strokePoints(tri, true);
  g.lineStyle(1.5, color, 0.7);
  for (let i = 0; i < 12; i++) {
    const a = (Math.PI / 6) * i;
    g.lineBetween(Math.cos(a) * 25, Math.sin(a) * 25, Math.cos(a) * 29, Math.sin(a) * 29);
  }
  g.fillStyle(color, 0.9).fillCircle(0, 0, 2.4);
}

/** Flèche épaisse de `a` vers `b` (Mind Reading). */
export function drawArrow(g: Phaser.GameObjects.Graphics, ax: number, ay: number, bx: number, by: number, color: number) {
  const angle = Math.atan2(by - ay, bx - ax);
  const head = 26;
  const sx = ax + Math.cos(angle) * 20;
  const sy = ay + Math.sin(angle) * 20;
  const ex = bx - Math.cos(angle) * (head * 0.6 + 6);
  const ey = by - Math.sin(angle) * (head * 0.6 + 6);
  g.lineStyle(16, color, 0.18).lineBetween(sx, sy, ex, ey);
  g.lineStyle(7, color, 0.92).lineBetween(sx, sy, ex, ey);
  const tip = pt(bx - Math.cos(angle) * 6, by - Math.sin(angle) * 6);
  const l = pt(tip.x - Math.cos(angle - 0.45) * head, tip.y - Math.sin(angle - 0.45) * head);
  const r = pt(tip.x - Math.cos(angle + 0.45) * head, tip.y - Math.sin(angle + 0.45) * head);
  g.fillStyle(color, 0.95).fillTriangle(tip.x, tip.y, l.x, l.y, r.x, r.y);
  g.fillStyle(color, 0.95).fillCircle(sx, sy, 7);
  g.lineStyle(2, 0x0e0f12, 0.8).strokeCircle(sx, sy, 7);
}

/** Dessine le marqueur persistant d'un effet, centré sur l'origine. */
export function drawEffectMark(g: Phaser.GameObjects.Graphics, kind: EffectKind) {
  switch (kind) {
    case "frozen":
      drawCrystal(g, FX.ice);
      break;
    case "locked":
      drawCrystal(g, FX.stone);
      break;
    case "forcefield":
      drawHexRing(g);
      break;
    case "celestial":
      drawHalo(g);
      break;
    case "morphed":
      drawDashedRing(g, FX.morph, 35, 14, 3.5);
      break;
    case "color_loan":
      drawStrings(g);
      break;
    case "invisible":
      drawDashedRing(g, FX.mirage, 33, 20, 2, 0.8);
      break;
    case "vanish":
      drawDashedRing(g, FX.glitch, 31, 24, 2, 0.7);
      break;
    case "immune":
    default:
      drawShield(g);
  }
}

/** Couleur dominante d'un effet, pour ses éclats de lancement. */
export function effectColor(kind: EffectKind): number {
  switch (kind) {
    case "frozen":
      return FX.ice;
    case "locked":
      return FX.stone;
    case "forcefield":
      return FX.field;
    case "celestial":
      return FX.gold;
    case "morphed":
      return FX.morph;
    case "color_loan":
      return FX.puppet;
    case "invisible":
      return FX.mirage;
    case "vanish":
      return FX.glitch;
    default:
      return FX.shield;
  }
}
