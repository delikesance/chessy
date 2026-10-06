import Phaser from "phaser";
import type { Highlights } from "../interaction";
import type { Color, GameEvent, Piece, PieceKind, Square, StateView } from "../protocol";
import { BOARD_PX, FRAME, PIECE_TEX, SIZE, TILE, drawBoard, drawPiece, pieceKey } from "./textures";

export const BOARD_SIZE = SIZE;

const MOVE_MS = 260;
const PIECE_SCALE = 76 / PIECE_TEX;
const KINDS: PieceKind[] = ["pawn", "knight", "bishop", "rook", "queen", "king"];

const ACCENT = 0x8fb4ff;
const TEXT = 0xe9ebef;
const DANGER = 0xee8272;
const FX = {
  portal: 0xb79cff,
  shield: 0x5fd0a0,
  ice: 0xbfe3ff,
  trail: 0x7aa2ff,
  clone: 0xeec06a,
  thread: 0xb79cff,
  dust: 0xe9ebef,
};

type Sprite = Phaser.GameObjects.Image;

/**
 * Renders the board and animates changes. It holds no game logic: clicks are
 * reported as squares and the owner decides what they mean.
 */
export class BoardScene extends Phaser.Scene {
  onSquare: (square: Square) => void = () => {};

  private view: StateView | null = null;
  private highlight: Highlights = { selectable: [], selected: null, targets: [] };
  private ready = false;

  private orientation: Color = "white";
  private gameId: string | null = null;
  private lastPly = -1;
  private boardImage: Phaser.GameObjects.Image | null = null;
  private highlightLayer!: Phaser.GameObjects.Graphics;
  private sprites = new Map<number, Sprite>();
  private placed = new Map<number, Square>();
  private marks = new Map<string, Phaser.GameObjects.Graphics>();

  constructor() {
    super("board");
  }

  create() {
    for (const color of ["white", "black"] as Color[]) {
      for (const kind of KINDS) {
        const tex = this.textures.createCanvas(pieceKey(color, kind), PIECE_TEX, PIECE_TEX);
        if (!tex) continue;
        drawPiece(tex.getSourceImage() as HTMLCanvasElement, kind, color);
        tex.refresh();
      }
    }
    this.highlightLayer = this.add.graphics().setDepth(1);
    this.input.on("pointerdown", (pointer: Phaser.Input.Pointer) => {
      const square = this.squareAt(pointer.x, pointer.y);
      if (square !== null) this.onSquare(square);
    });
    this.input.on("pointermove", (pointer: Phaser.Input.Pointer) => {
      const square = this.squareAt(pointer.x, pointer.y);
      const hot = square !== null && (this.highlight.selectable.includes(square) || this.highlight.targets.includes(square));
      this.game.canvas.style.cursor = hot ? "pointer" : "default";
    });
    this.ready = true;
    this.render();
  }

  setView(view: StateView | null) {
    this.view = view;
    if (this.ready) this.render();
  }

  setHighlights(highlight: Highlights) {
    this.highlight = highlight;
    if (this.ready) this.drawHighlights();
  }

  /** Where each piece currently stands, for tests and debugging. */
  debug() {
    return {
      orientation: this.orientation,
      pieces: [...this.placed.entries()].map(([id, square]) => ({ id, square })),
      highlight: this.highlight,
      badges: [...this.marks.keys()],
    };
  }

  update(time: number) {
    // Les marqueurs d'effet suivent leur pièce pendant qu'elle glisse et respirent doucement.
    for (const [key, mark] of this.marks) {
      const sprite = this.sprites.get(Number(key.split(":")[0]));
      if (!sprite) continue;
      mark.setPosition(sprite.x, sprite.y).setAlpha(sprite.alpha * (0.78 + 0.22 * Math.sin(time / 380)));
    }
  }

  // ---- geometry ----------------------------------------------------------

  private cell(square: Square): { x: number; y: number } {
    const file = square % 8;
    const rank = Math.floor(square / 8);
    const white = this.orientation === "white";
    return { x: FRAME + (white ? file : 7 - file) * TILE, y: FRAME + (white ? 7 - rank : rank) * TILE };
  }

  private center(square: Square): { x: number; y: number } {
    const { x, y } = this.cell(square);
    return { x: x + TILE / 2, y: y + TILE / 2 };
  }

  private squareAt(px: number, py: number): Square | null {
    const col = Math.floor((px - FRAME) / TILE);
    const row = Math.floor((py - FRAME) / TILE);
    if (col < 0 || col > 7 || row < 0 || row > 7) return null;
    const white = this.orientation === "white";
    return (white ? 7 - row : row) * 8 + (white ? col : 7 - col);
  }

  // ---- drawing -----------------------------------------------------------

  private render() {
    const view = this.view;
    if (!view) {
      this.clearPieces();
      this.gameId = null;
      this.lastPly = -1;
      this.highlightLayer.clear();
      return;
    }
    const fresh = view.game_id !== this.gameId || view.you !== this.orientation;
    if (fresh) {
      this.clearPieces();
      this.gameId = view.game_id;
      this.orientation = view.you;
      this.lastPly = -1;
      this.drawBoard();
    }
    // Les effets ne se jouent qu'une fois, quand le demi-coup avance.
    const advanced = !fresh && view.ply !== this.lastPly;
    this.lastPly = view.ply;
    this.reconcilePieces(view, !fresh, advanced);
    this.reconcileMarks(view);
    if (advanced) this.playEffects(view.events);
    this.drawHighlights();
  }

  private drawBoard() {
    const key = `board-${this.orientation}`;
    if (!this.textures.exists(key)) {
      const tex = this.textures.createCanvas(key, SIZE, SIZE);
      if (tex) {
        drawBoard(tex.getSourceImage() as HTMLCanvasElement, this.orientation);
        tex.refresh();
      }
    }
    this.boardImage?.destroy();
    this.boardImage = this.add.image(0, 0, key).setOrigin(0).setDepth(0);
  }

  private drawHighlights() {
    const g = this.highlightLayer;
    g.clear();
    const view = this.view;
    if (!view) return;

    // Dernière position : cases touchées par la dernière action.
    for (const e of view.events) {
      for (const square of touchedSquares(e)) {
        const { x, y } = this.cell(square);
        g.fillStyle(ACCENT, 0.22).fillRect(x, y, TILE, TILE);
        g.lineStyle(2, ACCENT, 0.55).strokeRect(x + 1, y + 1, TILE - 2, TILE - 2);
      }
    }
    if (view.in_check) {
      const king = view.board.findIndex((p) => p?.kind === "king" && p.color === view.to_move);
      if (king >= 0) {
        const { x, y } = this.center(king);
        g.fillStyle(DANGER, 0.22).fillCircle(x, y, TILE * 0.62);
        g.fillStyle(DANGER, 0.3).fillCircle(x, y, TILE * 0.42);
        g.lineStyle(3, DANGER, 0.9).strokeCircle(x, y, TILE * 0.44);
      }
    }
    for (const square of this.highlight.selectable) {
      if (square === this.highlight.selected) continue;
      const { x, y } = this.cell(square);
      g.lineStyle(2, TEXT, 0.55).strokeRect(x + 5, y + 5, TILE - 10, TILE - 10);
    }
    if (this.highlight.selected !== null) {
      const { x, y } = this.cell(this.highlight.selected);
      g.fillStyle(TEXT, 0.2).fillRect(x, y, TILE, TILE);
      g.lineStyle(3, TEXT, 0.95).strokeRect(x + 2, y + 2, TILE - 4, TILE - 4);
    }
    for (const square of this.highlight.targets) {
      const { x, y } = this.center(square);
      if (view.board[square]) {
        g.lineStyle(6, DANGER, 0.9).strokeCircle(x, y, TILE / 2 - 5);
      } else {
        g.fillStyle(0x0e0f12, 0.6).fillCircle(x, y, 13);
        g.lineStyle(2.5, TEXT, 0.95).strokeCircle(x, y, 13);
        g.fillStyle(TEXT, 0.95).fillCircle(x, y, 4);
      }
    }
  }

  private makeSprite(piece: Piece, x: number, y: number): Sprite {
    return this.add.image(x, y, pieceKey(piece.color, piece.kind)).setScale(PIECE_SCALE).setDepth(2);
  }

  private clearPieces() {
    this.sprites.forEach((s) => {
      this.tweens.killTweensOf(s);
      s.destroy();
    });
    this.marks.forEach((m) => m.destroy());
    this.sprites.clear();
    this.placed.clear();
    this.marks.clear();
  }

  /**
   * Brings the sprites in line with the board. Pieces keep their id across
   * moves, so a moved piece slides, a new id pops in and a vanished one fades.
   */
  private reconcilePieces(view: StateView, animate: boolean, advanced: boolean) {
    const teleported = new Set<Square>();
    const clonedFrom = new Map<number, Square>();
    const removed = new Set<number>();
    const captured = new Set<number>();
    if (advanced) {
      for (const e of view.events) {
        if (e.type === "teleported") teleported.add(e.to);
        else if (e.type === "cloned") clonedFrom.set(e.piece.id, e.from);
        else if (e.type === "removed") removed.add(e.piece.id);
        else if (e.type === "captured") captured.add(e.piece.id);
      }
    }

    const present = new Set<number>();
    view.board.forEach((piece, square) => {
      if (!piece) return;
      present.add(piece.id);
      let sprite = this.sprites.get(piece.id);
      const target = this.center(square);

      if (!sprite) {
        const origin = animate && clonedFrom.has(piece.id) ? this.center(clonedFrom.get(piece.id)!) : target;
        sprite = this.makeSprite(piece, origin.x, origin.y);
        this.sprites.set(piece.id, sprite);
        this.placed.set(piece.id, square);
        if (animate && clonedFrom.has(piece.id)) {
          // Dédoublement : la copie se détache de l'original et glisse vers sa case.
          sprite.setAlpha(0.2).setDepth(9);
          this.tweens.add({ targets: sprite, alpha: 1, duration: 200 });
          this.tweens.add({
            targets: sprite,
            x: target.x,
            y: target.y,
            duration: 420,
            delay: 120,
            ease: "Cubic.InOut",
            onComplete: () => sprite!.setDepth(2),
          });
        } else if (animate) {
          sprite.setScale(PIECE_SCALE * 0.2).setAlpha(0);
          this.tweens.add({ targets: sprite, scale: PIECE_SCALE, alpha: 1, duration: 300, ease: "Back.Out" });
        }
        return;
      }
      if (sprite.texture.key !== pieceKey(piece.color, piece.kind)) sprite.setTexture(pieceKey(piece.color, piece.kind));
      if (this.placed.get(piece.id) === square) return;
      this.placed.set(piece.id, square);
      this.tweens.killTweensOf(sprite);
      if (animate && teleported.has(square)) {
        this.tweens.add({
          targets: sprite,
          alpha: 0,
          scale: PIECE_SCALE * 0.3,
          duration: 180,
          onComplete: () => {
            sprite!.setPosition(target.x, target.y);
            this.tweens.add({ targets: sprite, alpha: 1, scale: PIECE_SCALE, duration: 260, ease: "Back.Out" });
          },
        });
      } else if (animate) {
        sprite.setDepth(10);
        this.tweens.add({
          targets: sprite,
          x: target.x,
          y: target.y,
          duration: MOVE_MS,
          ease: "Cubic.InOut",
          onComplete: () => sprite!.setDepth(2),
        });
      } else {
        sprite.setPosition(target.x, target.y);
      }
    });

    for (const [id, sprite] of this.sprites) {
      if (present.has(id)) continue;
      this.sprites.delete(id);
      this.placed.delete(id);
      this.tweens.killTweensOf(sprite);
      if (!animate) {
        sprite.destroy();
      } else if (removed.has(id)) {
        this.dissolve(sprite);
      } else if (captured.has(id)) {
        this.tweens.add({
          targets: sprite,
          alpha: 0,
          scale: PIECE_SCALE * 1.25,
          duration: 280,
          delay: MOVE_MS * 0.6,
          ease: "Quad.In",
          onComplete: () => sprite.destroy(),
        });
      } else {
        this.tweens.add({ targets: sprite, alpha: 0, scale: PIECE_SCALE * 0.4, duration: MOVE_MS, onComplete: () => sprite.destroy() });
      }
    }
  }

  // ---- marqueurs persistants (Imune, Freeze) ---------------------------------

  private reconcileMarks(view: StateView) {
    const wanted = new Set<string>();
    for (const effect of view.effects) {
      const key = `${effect.piece}:${effect.kind}`;
      if (!this.sprites.has(effect.piece)) continue;
      wanted.add(key);
      if (this.marks.has(key)) continue;
      const g = this.add.graphics().setDepth(11);
      if (effect.kind === "frozen") drawCrystal(g);
      else drawShield(g);
      const sprite = this.sprites.get(effect.piece)!;
      g.setPosition(sprite.x, sprite.y).setAlpha(0);
      this.tweens.add({ targets: g, alpha: 1, duration: 260 });
      this.marks.set(key, g);
    }
    for (const [key, mark] of this.marks) {
      if (wanted.has(key)) continue;
      this.tweens.killTweensOf(mark);
      mark.destroy();
      this.marks.delete(key);
    }
  }

  // ---- effets de compétences -------------------------------------------------

  private playEffects(events: GameEvent[]) {
    for (const e of events) {
      switch (e.type) {
        case "teleported": {
          // Portail : anneaux violets qui se referment au départ et s'ouvrent à l'arrivée.
          const a = this.center(e.from);
          const b = this.center(e.to);
          this.rings(a.x, a.y, FX.portal, 46, 6, 460);
          this.rings(a.x, a.y, FX.portal, 30, 4, 460, 80);
          this.rings(b.x, b.y, FX.portal, 6, 46, 520, 260);
          this.rings(b.x, b.y, FX.portal, 4, 30, 520, 340);
          break;
        }
        case "effect_added": {
          const sprite = this.sprites.get(e.piece);
          if (!sprite) break;
          const pos = this.placed.get(e.piece);
          const at = pos !== undefined ? this.center(pos) : { x: sprite.x, y: sprite.y };
          if (e.effect === "immune") this.shieldBurst(at.x, at.y);
          else this.crystalBurst(at.x, at.y);
          break;
        }
        case "rolled_back":
          this.reverseTrail(e.from, e.to);
          break;
        case "cloned": {
          const a = this.center(e.from);
          this.rings(a.x, a.y, FX.clone, 14, 44, 420);
          this.rings(a.x, a.y, FX.clone, 8, 30, 420, 100);
          break;
        }
        case "swapped":
          this.destinyThread(e.a, e.b);
          break;
        case "removed": {
          const c = this.center(e.square);
          this.rings(c.x, c.y, FX.dust, 10, 40, 380);
          break;
        }
        case "captured": {
          const c = this.center(e.square);
          this.rings(c.x, c.y, TEXT, 8, TILE * 0.6, 340, MOVE_MS * 0.6);
          break;
        }
        default:
          break;
      }
    }
  }

  /** Anneau qui s'élargit (ou se referme) en s'effaçant. */
  private rings(x: number, y: number, color: number, r0: number, r1: number, duration: number, delay = 0) {
    const g = this.add.graphics().setDepth(12).setPosition(x, y).setAlpha(0);
    const state = { t: 0 };
    this.tweens.add({
      targets: state,
      t: 1,
      duration,
      delay,
      ease: "Cubic.Out",
      onStart: () => g.setAlpha(1),
      onUpdate: () => {
        const r = r0 + (r1 - r0) * state.t;
        g.clear().lineStyle(4 * (1 - state.t) + 1, color, 0.9 * (1 - state.t * 0.85)).strokeCircle(0, 0, r);
        g.fillStyle(color, 0.16 * (1 - state.t)).fillCircle(0, 0, r);
      },
      onComplete: () => g.destroy(),
    });
  }

  private shieldBurst(x: number, y: number) {
    const g = this.add.graphics().setDepth(12).setPosition(x, y);
    drawShield(g, 1.5);
    g.setScale(0.4).setAlpha(0);
    this.tweens.add({ targets: g, scale: 1.25, alpha: { from: 1, to: 0 }, duration: 620, ease: "Cubic.Out", onComplete: () => g.destroy() });
    this.rings(x, y, FX.shield, 18, 54, 520);
  }

  private crystalBurst(x: number, y: number) {
    const g = this.add.graphics().setDepth(12).setPosition(x, y);
    const state = { t: 0 };
    this.tweens.add({
      targets: state,
      t: 1,
      duration: 640,
      ease: "Cubic.Out",
      onUpdate: () => {
        g.clear().lineStyle(3, FX.ice, 1 - state.t * 0.9);
        for (let i = 0; i < 6; i++) {
          const a = (Math.PI / 3) * i;
          const r0 = 10 + state.t * 14;
          const r1 = 22 + state.t * 28;
          g.lineBetween(Math.cos(a) * r0, Math.sin(a) * r0, Math.cos(a) * r1, Math.sin(a) * r1);
          const b = a + 0.5;
          g.lineBetween(Math.cos(a) * r1, Math.sin(a) * r1, Math.cos(b) * (r1 - 8), Math.sin(b) * (r1 - 8));
        }
      },
      onComplete: () => g.destroy(),
    });
  }

  /** Rollback : chevrons qui remontent le trajet de la pièce, du point d'arrivée vers l'origine du trajet. */
  private reverseTrail(from: Square, to: Square) {
    const a = this.center(from);
    const b = this.center(to);
    const angle = Math.atan2(b.y - a.y, b.x - a.x);
    const steps = 5;
    for (let i = 0; i < steps; i++) {
      const t = 1 - i / (steps - 1); // du bout (to) vers le début (from) : sens inverse
      const g = this.add.graphics().setDepth(11).setPosition(a.x + (b.x - a.x) * t, a.y + (b.y - a.y) * t).setRotation(angle).setAlpha(0);
      g.lineStyle(4, FX.trail, 1).beginPath().moveTo(-7, -9).lineTo(5, 0).lineTo(-7, 9).strokePath();
      this.tweens.add({
        targets: g,
        alpha: { from: 0.9, to: 0 },
        duration: 520,
        delay: i * 90,
        onStart: () => g.setAlpha(0.9),
        onComplete: () => g.destroy(),
      });
    }
    const line = this.add.graphics().setDepth(1.5);
    line.lineStyle(10, FX.trail, 0.25).lineBetween(a.x, a.y, b.x, b.y);
    this.tweens.add({ targets: line, alpha: 0, duration: 700, onComplete: () => line.destroy() });
  }

  /** Destiny Swapper : deux fils croisés relient les pièces échangées. */
  private destinyThread(sqA: Square, sqB: Square) {
    const a = this.center(sqA);
    const b = this.center(sqB);
    const mx = (a.x + b.x) / 2;
    const my = (a.y + b.y) / 2;
    const nx = -(b.y - a.y);
    const ny = b.x - a.x;
    const len = Math.hypot(nx, ny) || 1;
    const bow = 38;
    const g = this.add.graphics().setDepth(11);
    const draw = (sign: number, progress: number) => {
      const cx = mx + (nx / len) * bow * sign;
      const cy = my + (ny / len) * bow * sign;
      g.beginPath().moveTo(a.x, a.y);
      const steps = 24;
      for (let i = 1; i <= steps * progress; i++) {
        const t = i / steps;
        const x = (1 - t) * (1 - t) * a.x + 2 * (1 - t) * t * cx + t * t * b.x;
        const y = (1 - t) * (1 - t) * a.y + 2 * (1 - t) * t * cy + t * t * b.y;
        g.lineTo(x, y);
      }
      g.strokePath();
    };
    const state = { t: 0 };
    this.tweens.add({
      targets: state,
      t: 1,
      duration: 380,
      onUpdate: () => {
        g.clear().lineStyle(3, FX.thread, 0.95);
        draw(1, state.t);
        draw(-1, state.t);
      },
      onComplete: () => this.tweens.add({ targets: g, alpha: 0, duration: 420, onComplete: () => g.destroy() }),
    });
    this.rings(a.x, a.y, FX.thread, 10, 36, 420, 200);
    this.rings(b.x, b.y, FX.thread, 10, 36, 420, 200);
  }

  /** Remover : la pièce se désagrège en poussière. */
  private dissolve(sprite: Sprite) {
    const { x, y } = sprite;
    this.tweens.add({ targets: sprite, alpha: 0, scale: PIECE_SCALE * 1.1, duration: 380, ease: "Quad.In", onComplete: () => sprite.destroy() });
    for (let i = 0; i < 16; i++) {
      const size = 3 + Math.random() * 4;
      const dust = this.add.rectangle(x + (Math.random() - 0.5) * 36, y + (Math.random() - 0.5) * 48, size, size, FX.dust).setDepth(12).setAlpha(0.9);
      this.tweens.add({
        targets: dust,
        x: dust.x + (Math.random() - 0.5) * 60,
        y: dust.y - 20 - Math.random() * 46,
        alpha: 0,
        angle: Math.random() * 180,
        duration: 600 + Math.random() * 400,
        delay: Math.random() * 160,
        ease: "Cubic.Out",
        onComplete: () => dust.destroy(),
      });
    }
  }
}

/** Bouclier au trait, centré sur l'origine du Graphics. */
function drawShield(g: Phaser.GameObjects.Graphics, k = 1) {
  const pts = [
    [0, -34], [26, -26], [26, 2], [0, 34], [-26, 2], [-26, -26],
  ].map(([px, py]) => new Phaser.Math.Vector2(px * k, py * k));
  g.fillStyle(FX.shield, 0.16).fillPoints(pts, true);
  g.lineStyle(3, FX.shield, 0.95).strokePoints(pts, true);
}

/** Cristal de glace : hexagone facetté. */
function drawCrystal(g: Phaser.GameObjects.Graphics) {
  const pts: Phaser.Math.Vector2[] = [];
  for (let i = 0; i < 6; i++) {
    const a = (Math.PI / 3) * i - Math.PI / 2;
    pts.push(new Phaser.Math.Vector2(Math.cos(a) * 33, Math.sin(a) * 33));
  }
  g.fillStyle(FX.ice, 0.2).fillPoints(pts, true);
  g.lineStyle(3, FX.ice, 0.95).strokePoints(pts, true);
  g.lineStyle(1.5, FX.ice, 0.6);
  for (let i = 0; i < 3; i++) g.lineBetween(pts[i].x, pts[i].y, pts[i + 3].x, pts[i + 3].y);
}

function touchedSquares(e: GameEvent): Square[] {
  switch (e.type) {
    case "moved":
    case "teleported":
    case "rolled_back":
      return [e.from, e.to];
    case "cloned":
      return [e.to];
    case "swapped":
      return [e.a, e.b];
    case "removed":
      return [e.square];
    default:
      return [];
  }
}

export { BOARD_PX };
