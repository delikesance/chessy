import { useState } from "react";
import type { RewardOffer, SkillId } from "../protocol";
import { store } from "../store";
import { SkillCard } from "./SkillCard";

/** Lets the winner steal a skill, roll a random one, or pass. */
export function RewardModal({ offer }: { offer: RewardOffer }) {
  const [replace, setReplace] = useState<SkillId | undefined>();
  const needsReplace = offer.deck_full && replace === undefined;

  return (
    <div className="modal-backdrop">
      <div className="modal" role="dialog" aria-label="Récompense">
        <h2>Victoire : choisissez votre récompense</h2>

        {offer.deck_full && (
          <div className="replace">
            <p>Votre deck est plein (7/7). Choisissez la compétence à remplacer :</p>
            <div className="chips">
              {offer.deck.map((skill) => (
                <button
                  key={skill}
                  type="button"
                  className={replace === skill ? "chip selected" : "chip"}
                  onClick={() => setReplace(skill)}
                >
                  {skill}
                </button>
              ))}
            </div>
          </div>
        )}

        <h3>Prendre une compétence à l'adversaire</h3>
        {offer.steal_options.length === 0 && <p className="muted">Il n'a rien que vous n'ayez déjà.</p>}
        <div className="skill-grid">
          {offer.steal_options.map((skill) => (
            <SkillCard
              key={skill}
              skill={skill}
              disabled={needsReplace}
              onClick={() => store.send({ type: "reward_choice", choice: { kind: "steal", skill, replace } })}
            />
          ))}
        </div>

        <div className="actions">
          <button
            type="button"
            disabled={needsReplace}
            onClick={() => store.send({ type: "reward_choice", choice: { kind: "random", replace } })}
          >
            Compétence aléatoire
          </button>
          <button type="button" onClick={() => store.send({ type: "reward_choice", choice: { kind: "skip" } })}>
            Passer
          </button>
        </div>
        <p className="muted">
          Aléatoire : vous recevez une compétence tirée au hasard et l'adversaire en perd une au hasard.
        </p>
      </div>
    </div>
  );
}
