import { useEffect, useRef } from "react";
import { gameSoundSteps, lowTimeSecond, type GameSoundState } from "../../game/gameSound";
import { remainingMs } from "../../game/logic";
import type { Outcome, StateView } from "../../protocol";
import { sfx } from "../../sound";

/** Parties dont le son de début a déjà été joué (survit aux remontages du composant). */
const started = new Set<string>();

/**
 * Sons de la partie : coup / capture / échec / roque / promotion / compétence / pièges de chaque camp,
 * `your_turn` quand le trait nous revient, début et fin de partie, `low_time` sous 10 s à notre tour.
 * `action` = `actionKey(view)` : une position renvoyée à l'identique (reconnexion) ne rejoue rien, et une
 * partie déjà en cours au premier affichage reste muette.
 */
export function useGameSounds(view: StateView, action: string, over: Outcome | null, stamp: number) {
  const prev = useRef<GameSoundState | null>(null);

  useEffect(() => {
    const { steps, next } = gameSoundSteps(prev.current, view, action, over, started);
    prev.current = next;
    for (const step of steps) {
      switch (step.type) {
        case "start":
          sfx.play("game_start");
          break;
        case "events":
          sfx.playEvents(step.events, { me: step.me, actor: step.actor, check: step.check });
          break;
        case "your_turn":
          sfx.play("your_turn", { delay: step.delay });
          break;
        case "end":
          sfx.play(step.result === "win" ? "game_win" : step.result === "loss" ? "game_lose" : "game_draw", { delay: step.delay });
          break;
      }
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [view.game_id, action, over]);

  // Tic discret chaque seconde sous 10 s, seulement quand c'est notre horloge qui tourne.
  const lastSecond = useRef(-1);
  useEffect(() => {
    if (!view.clock_enabled || view.outcome.type !== "ongoing" || over) return;
    if (view.to_move !== view.you || view.clock.running !== view.you) return;
    const timer = setInterval(() => {
      const sec = lowTimeSecond(remainingMs(view.clock, view.you, performance.now() - stamp));
      if (sec === null) {
        lastSecond.current = -1;
      } else if (sec !== lastSecond.current) {
        lastSecond.current = sec;
        sfx.play("low_time");
      }
    }, 150);
    return () => clearInterval(timer);
  }, [view.clock, view.clock_enabled, view.to_move, view.you, view.outcome, over, stamp]);
}
