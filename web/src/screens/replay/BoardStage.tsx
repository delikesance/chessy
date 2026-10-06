import type { ReactNode } from "react";
import { PhaserBoard } from "../../game/PhaserBoard";
import type { Highlights } from "../../interaction";
import type { Color, Square, StateView } from "../../protocol";
import { arrowGeometry, BOARD_VIEWBOX } from "../../replay/arrow";

const NO_HIGHLIGHTS: Highlights = { selectable: [], selected: null, targets: [] };
const noop = () => {};

export interface Arrow {
  from: Square;
  to: Square;
}

interface Props {
  view: StateView;
  orientation: Color;
  interactive?: boolean;
  highlights?: Highlights;
  onSquare?: (square: Square) => void;
  /** Flèche du meilleur coup, dessinée au-dessus du plateau (le plateau Phaser n'est pas modifié). */
  arrow?: Arrow | null;
  children?: ReactNode;
}

/** Plateau Phaser (lecture seule par défaut) avec une couche SVG pour la flèche et des voiles par-dessus. */
export function BoardStage({ view, orientation, interactive = false, highlights = NO_HIGHLIGHTS, onSquare = noop, arrow, children }: Props) {
  const geo = arrow ? arrowGeometry(arrow.from, arrow.to, orientation) : null;
  return (
    <div className="gm-board rp-board">
      <PhaserBoard view={view} highlights={highlights} onSquare={onSquare} interactive={interactive} />
      {geo && (
        <svg className="rp-arrow" viewBox={`0 0 ${BOARD_VIEWBOX} ${BOARD_VIEWBOX}`} aria-hidden="true" focusable="false">
          <line x1={geo.x1} y1={geo.y1} x2={geo.x2} y2={geo.y2} />
          <polygon points={geo.head} />
        </svg>
      )}
      {children}
    </div>
  );
}
