import Phaser from "phaser";
import type { Highlights } from "../interaction";
import type { Color, GameEvent, PieceKind, Square, StateView } from "../protocol";

const TILE = 80;
export const BOARD_SIZE = TILE * 8;

const LIGHT = 0xf0d9b5;
const DARK = 0xb58863;

// The trailing U+FE0E forces text presentation; some platforms render the pawn as an emoji otherwise.
const GLYPH: Record<PieceKind, string> = {
  king: "♚︎",
  queen: "♛︎",
  rook: "♜︎",
  bishop: "♝︎",
  knight: "♞︎",
  pawn: "♟︎",
};

const FONT = '"Segoe UI Symbol", "Noto Sans Symbols 2", "DejaVu Sans", sans-serif';
const MOVE_MS = 240;

type Sprite = Phaser.GameObjects.Text;

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
  private boardLayer!: Phaser.GameObjects.Graphics;
  private highlightLayer!: Phaser.GameObjects.Graphics;
  private labels: Phaser.GameObjects.Text[] = [];
  private sprites = new Map<number, Sprite>();
  private placed = new Map<number, Square>();
  private badges = new Map<string, Sprite>();

  constructor() {
    super("board");
  }

  create() {
    this.boardLayer = this.add.graphics();
    this.highlightLayer = this.add.graphics().setDepth(1);
    this.input.on("pointerdown", (pointer: Phaser.Input.Pointer) => {
      const square = this.squareAt(pointer.x, pointer.y);
      if (square !== null) this.onSquare(square);
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
      badges: [...this.badges.keys()],
    };
  }

  update() {
    // Badges follow their piece while it slides.
    for (const [key, badge] of this.badges) {
      const sprite = this.sprites.get(Number(key.split(":")[0]));
      if (sprite) badge.setPosition(sprite.x + 26, sprite.y - 28).setAlpha(sprite.alpha);
    }
  }

  // ---- geometry ----------------------------------------------------------

  private cell(square: Square): { x: number; y: number } {
    const file = square % 8;
    const rank = Math.floor(square / 8);
    const white = this.orientation === "white";
    return { x: (white ? file : 7 - file) * TILE, y: (white ? 7 - rank : rank) * TILE };
  }

  private center(square: Square): { x: number; y: number } {
    const { x, y } = this.cell(square);
    return { x: x + TILE / 2, y: y + TILE / 2 };
  }

  private squareAt(px: number, py: number): Square | null {
    const col = Math.floor(px / TILE);
    const row = Math.floor(py / TILE);
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
      this.highlightLayer.clear();
      return;
    }
    const fresh = view.game_id !== this.gameId || view.you !== this.orientation;
    if (fresh) {
      this.clearPieces();
      this.gameId = view.game_id;
      this.orientation = view.you;
      this.drawBoard();
    }
    this.reconcilePieces(view, !fresh);
    this.reconcileBadges(view);
    this.drawHighlights();
  }

  private drawBoard() {
    this.boardLayer.clear();
    this.labels.forEach((l) => l.destroy());
    this.labels = [];
    for (let square = 0; square < 64; square++) {
      const { x, y } = this.cell(square);
      const light = ((square % 8) + Math.floor(square / 8)) & 1;
      this.boardLayer.fillStyle(light ? LIGHT : DARK, 1).fillRect(x, y, TILE, TILE);
    }
    const style = { fontFamily: FONT, fontSize: "13px", color: "#6b4f35" };
    for (let i = 0; i < 8; i++) {
      const file = this.orientation === "white" ? i : 7 - i;
      const rank = this.orientation === "white" ? 7 - i : i;
      this.labels.push(
        this.add.text(i * TILE + TILE - 12, BOARD_SIZE - 16, String.fromCharCode(97 + file), style).setDepth(1),
        this.add.text(4, i * TILE + 3, String(rank + 1), style).setDepth(1),
      );
    }
  }

  private drawHighlights() {
    const g = this.highlightLayer;
    g.clear();
    const view = this.view;
    if (!view) return;

    for (const e of view.events) {
      for (const square of touchedSquares(e)) {
        const { x, y } = this.cell(square);
        g.fillStyle(0xf6e05e, 0.28).fillRect(x, y, TILE, TILE);
      }
    }
    if (view.in_check) {
      const king = view.board.findIndex((p) => p?.kind === "king" && p.color === view.to_move);
      if (king >= 0) {
        const { x, y } = this.cell(king);
        g.fillStyle(0xe53e3e, 0.5).fillRect(x, y, TILE, TILE);
      }
    }
    for (const square of this.highlight.selectable) {
      const { x, y } = this.cell(square);
      g.lineStyle(3, 0x2b6cb0, 0.55).strokeRect(x + 3, y + 3, TILE - 6, TILE - 6);
    }
    if (this.highlight.selected !== null) {
      const { x, y } = this.cell(this.highlight.selected);
      g.fillStyle(0x4299e1, 0.5).fillRect(x, y, TILE, TILE);
    }
    for (const square of this.highlight.targets) {
      const { x, y } = this.center(square);
      if (view.board[square]) {
        g.lineStyle(6, 0xe53e3e, 0.75).strokeCircle(x, y, TILE / 2 - 6);
      } else {
        g.fillStyle(0x38a169, 0.7).fillCircle(x, y, 12);
      }
    }
  }

  private makeSprite(kind: PieceKind, color: Color, square: Square): Sprite {
    const { x, y } = this.center(square);
    return this.add
      .text(x, y, GLYPH[kind], {
        fontFamily: FONT,
        fontSize: "64px",
        color: color === "white" ? "#ffffff" : "#1a1a1a",
        stroke: color === "white" ? "#1a1a1a" : "#e2e2e2",
        strokeThickness: color === "white" ? 5 : 2,
      })
      .setOrigin(0.5)
      .setDepth(2);
  }

  private clearPieces() {
    this.sprites.forEach((s) => {
      this.tweens.killTweensOf(s);
      s.destroy();
    });
    this.badges.forEach((b) => b.destroy());
    this.sprites.clear();
    this.placed.clear();
    this.badges.clear();
  }

  /**
   * Brings the sprites in line with the board. Pieces keep their id across
   * moves, so a moved piece slides, a new id pops in and a vanished one fades.
   */
  private reconcilePieces(view: StateView, animate: boolean) {
    const teleported = new Set<Square>();
    for (const e of view.events) if (e.type === "teleported") teleported.add(e.to);

    const present = new Set<number>();
    view.board.forEach((piece, square) => {
      if (!piece) return;
      present.add(piece.id);
      let sprite = this.sprites.get(piece.id);
      const target = this.center(square);

      if (!sprite) {
        sprite = this.makeSprite(piece.kind, piece.color, square);
        this.sprites.set(piece.id, sprite);
        this.placed.set(piece.id, square);
        if (animate) {
          sprite.setScale(0.2).setAlpha(0);
          this.tweens.add({ targets: sprite, scale: 1, alpha: 1, duration: 280, ease: "Back.Out" });
        }
        return;
      }
      sprite.setText(GLYPH[piece.kind]);
      if (this.placed.get(piece.id) === square) return;
      this.placed.set(piece.id, square);
      this.tweens.killTweensOf(sprite);
      if (animate && teleported.has(square)) {
        this.tweens.add({
          targets: sprite,
          alpha: 0,
          scale: 0.3,
          duration: 140,
          onComplete: () => {
            sprite.setPosition(target.x, target.y);
            this.tweens.add({ targets: sprite, alpha: 1, scale: 1, duration: 200, ease: "Back.Out" });
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
          onComplete: () => sprite.setDepth(2),
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
        continue;
      }
      this.tweens.add({
        targets: sprite,
        alpha: 0,
        scale: 0.4,
        duration: MOVE_MS,
        onComplete: () => sprite.destroy(),
      });
    }
  }

  private reconcileBadges(view: StateView) {
    const wanted = new Set<string>();
    for (const effect of view.effects) {
      const key = `${effect.piece}:${effect.kind}`;
      if (!this.sprites.has(effect.piece)) continue;
      wanted.add(key);
      if (this.badges.has(key)) continue;
      const frozen = effect.kind === "frozen";
      this.badges.set(
        key,
        this.add
          .text(0, 0, frozen ? "❄︎" : "✦", {
            fontFamily: FONT,
            fontSize: "26px",
            color: frozen ? "#63b3ed" : "#f6ad55",
            stroke: "#1a202c",
            strokeThickness: 4,
          })
          .setOrigin(0.5)
          .setDepth(11),
      );
    }
    for (const [key, badge] of this.badges) {
      if (wanted.has(key)) continue;
      badge.destroy();
      this.badges.delete(key);
    }
  }
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
