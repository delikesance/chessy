import { useCallback, useEffect, useMemo, useState } from "react";
import { PhaserBoard } from "../game/PhaserBoard";
import { click, highlights, IDLE, startSkill, type Interaction, type PendingPromotion } from "../interaction";
import { describeOutcome } from "../outcome";
import type { Square, StateView } from "../protocol";
import { skillName } from "../skills";
import { store } from "../store";

const PROMO_LABEL = { queen: "Dame", rook: "Tour", bishop: "Fou", knight: "Cavalier" } as const;

export function Game({ view }: { view: StateView }) {
  const [interaction, setInteraction] = useState<Interaction>(IDLE);
  const [promotion, setPromotion] = useState<PendingPromotion | null>(null);

  // A new position invalidates whatever was half-selected.
  useEffect(() => {
    setInteraction(IDLE);
    setPromotion(null);
  }, [view.game_id, view.ply]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        setInteraction(IDLE);
        setPromotion(null);
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  const onSquare = useCallback(
    (square: Square) => {
      if (promotion) return;
      const result = click(view, interaction, square);
      setInteraction(result.interaction);
      if (result.promotion) setPromotion(result.promotion);
      if (result.send) store.send({ type: "action", action: result.send });
    },
    [view, interaction, promotion],
  );

  const hl = useMemo(() => highlights(view, interaction), [view, interaction]);
  const over = view.outcome.type !== "ongoing";
  const myTurn = view.to_move === view.you && !over;
  const optionsFor = (skill: string) => view.skill_options.find((o) => o.skill === skill)?.targets.length ?? 0;
  const activeSkill = interaction.kind === "skill" ? interaction.skill : null;

  return (
    <main className="game">
      <div className="board-wrap">
        <PhaserBoard view={view} highlights={hl} onSquare={onSquare} />
        {promotion && (
          <div className="promotion" role="dialog" aria-label="Promotion">
            {promotion.options.map((kind) => (
              <button
                key={kind}
                type="button"
                onClick={() => {
                  store.send({
                    type: "action",
                    action: { type: "move", from: promotion.from, to: promotion.to, promo: kind },
                  });
                  setPromotion(null);
                }}
              >
                {PROMO_LABEL[kind as keyof typeof PROMO_LABEL]}
              </button>
            ))}
          </div>
        )}
      </div>

      <aside className="side">
        <section className="panel">
          <p className="turn" data-testid="turn">
            {over
              ? describeOutcome(view.outcome, view.you)
              : myTurn
                ? "À vous de jouer"
                : "Tour de l'adversaire…"}
          </p>
          {view.in_check && !over && <p className="check">Échec !</p>}
          {!view.opponent_connected && !over && (
            <p className="warn">L'adversaire s'est déconnecté. Il a 60 s pour revenir.</p>
          )}
          <p className="muted">
            Vous jouez les {view.you === "white" ? "blancs" : "noirs"}.
          </p>
        </section>

        <section className="panel">
          <h2>Vos compétences</h2>
          {view.my_skills.length === 0 && <p className="muted">Aucune compétence.</p>}
          <div className="skill-bar">
            {view.my_skills.map((slot) => {
              const usable = myTurn && !slot.used && optionsFor(slot.skill) > 0;
              return (
                <button
                  key={slot.skill}
                  type="button"
                  className={["skill-btn", activeSkill === slot.skill ? "selected" : "", slot.used ? "used" : ""].join(" ")}
                  disabled={!usable}
                  onClick={() => setInteraction(activeSkill === slot.skill ? IDLE : startSkill(view, slot.skill))}
                  title={slot.used ? "Déjà utilisée" : undefined}
                >
                  {skillName(slot.skill)}
                  {slot.used && <small> (utilisée)</small>}
                </button>
              );
            })}
          </div>
          {activeSkill && (
            <p className="hint">
              Cliquez sur une case en surbrillance. <button type="button" onClick={() => setInteraction(IDLE)}>Annuler</button>
            </p>
          )}
        </section>

        <section className="panel">
          <h2>Adversaire</h2>
          <p className="muted">
            {view.opponent_skills.total} compétence{view.opponent_skills.total > 1 ? "s" : ""}
            {view.opponent_skills.used.length > 0 &&
              ` · utilisées : ${view.opponent_skills.used.map(skillName).join(", ")}`}
          </p>
        </section>

        {over ? (
          <button type="button" className="primary" onClick={() => store.leaveGame()}>
            Retour au lobby
          </button>
        ) : (
          <button type="button" className="danger" onClick={() => store.send({ type: "resign" })}>
            Abandonner
          </button>
        )}
      </aside>
    </main>
  );
}
