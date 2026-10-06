import Phaser from "phaser";
import { useEffect, useRef } from "react";
import type { Highlights } from "../interaction";
import type { Square, StateView } from "../protocol";
import { BOARD_SIZE, BoardScene } from "./BoardScene";

interface Props {
  view: StateView;
  highlights: Highlights;
  onSquare: (square: Square) => void;
}

export function PhaserBoard({ view, highlights, onSquare }: Props) {
  const host = useRef<HTMLDivElement>(null);
  const scene = useRef<BoardScene | null>(null);
  // Latest props, readable from the deferred game setup and from scene callbacks.
  const latest = useRef({ view, highlights, onSquare });
  latest.current = { view, highlights, onSquare };

  useEffect(() => {
    let game: Phaser.Game | null = null;
    // Phaser tears a game down on its next frame, which never comes if it has not
    // booted yet. React StrictMode mounts, unmounts and remounts straight away, so
    // creating the game synchronously would leave a second canvas behind. Deferring
    // by a tick lets the throwaway mount be cancelled before anything is built.
    const timer = setTimeout(() => {
      const boardScene = new BoardScene();
      boardScene.onSquare = (square) => latest.current.onSquare(square);
      boardScene.setView(latest.current.view);
      boardScene.setHighlights(latest.current.highlights);
      scene.current = boardScene;
      game = new Phaser.Game({
        type: Phaser.AUTO,
        parent: host.current!,
        width: BOARD_SIZE,
        height: BOARD_SIZE,
        backgroundColor: "#1b1b1f",
        scene: boardScene,
        scale: { mode: Phaser.Scale.FIT, autoCenter: Phaser.Scale.CENTER_BOTH },
      });
      // Lets tests and the dev console inspect the canvas, which is not in the accessibility tree.
      if (import.meta.env.DEV) (window as unknown as { __chessy: unknown }).__chessy = { game, scene: boardScene };
    }, 0);

    return () => {
      clearTimeout(timer);
      scene.current = null;
      if (game) {
        game.destroy(true);
        game.canvas.remove(); // do not wait for the game's next frame
      }
    };
  }, []);

  useEffect(() => scene.current?.setView(view), [view]);
  useEffect(() => scene.current?.setHighlights(highlights), [highlights]);

  return <div className="board-host" ref={host} />;
}
