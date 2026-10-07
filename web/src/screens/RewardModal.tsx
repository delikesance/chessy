import { useEffect, useRef, useState, type CSSProperties } from "react";
import type { RewardChoice, RewardOffer, SkillId } from "../protocol";
import { skillInfo } from "../skills";
import { store } from "../store";
import { SkillArt } from "../ui/SkillArt";
import { UniqueBadge } from "../ui/UniqueBadge";
import { SkillCard } from "./SkillCard";
import "./reward.css";
import { tileRarity } from "../ui/tileRarity";

type Pick = { kind: "steal"; skill: SkillId } | { kind: "random" } | null;

/** Construit le message `reward_choice` ; `replace` n'est joint que si le deck est plein. */
export function buildChoice(offer: RewardOffer, pick: Pick, replace: SkillId | undefined): RewardChoice | null {
  if (!pick) return null;
  if (offer.deck_full && replace === undefined) return null;
  const extra = offer.deck_full ? { replace } : {};
  return pick.kind === "steal" ? { kind: "steal", skill: pick.skill, ...extra } : { kind: "random", ...extra };
}

/** Récompense de victoire : voler une compétence, en tirer une au hasard, ou passer. */
export function RewardModal({ offer }: { offer: RewardOffer }) {
  const [pick, setPick] = useState<Pick>(null);
  const [replace, setReplace] = useState<SkillId | undefined>();
  // Une compétence aléatoire est forgée par le serveur, ce qui prend un instant.
  const [forging, setForging] = useState(false);
  const dialog = useRef<HTMLDivElement>(null);
  useEffect(() => {
    dialog.current?.focus();
  }, []);
  useEffect(() => {
    if (!forging) return;
    // Si le serveur refuse (la récompense reste affichée), on rend la main.
    const t = setTimeout(() => setForging(false), 15_000);
    return () => clearTimeout(t);
  }, [forging]);

  const choice = buildChoice(offer, pick, replace);
  const needsReplace = offer.deck_full && pick !== null && replace === undefined;

  return (
    <div className="md-backdrop rw-backdrop">
      <div className="rw card" role="dialog" aria-modal="true" aria-labelledby="rw-title" tabIndex={-1} ref={dialog}>
        <p className="eyebrow">Victoire</p>
        <h2 id="rw-title" className="rw-title">
          Choisissez votre récompense
        </h2>
        <p className="muted rw-sub">Prenez une compétence à votre adversaire, faites-en forger une inédite, ou passez.</p>

        <div className="rw-sec">
          <p className="rw-label" id="rw-take">
            Récupérer
          </p>
          <div className="rw-opts" role="radiogroup" aria-labelledby="rw-take">
            {offer.steal_options.map((skill) => (
              <SkillCard
                key={skill}
                skill={skill}
                radio
                selected={pick?.kind === "steal" && pick.skill === skill}
                onClick={() => setPick({ kind: "steal", skill })}
              />
            ))}
            <button
              type="button"
              role="radio"
              aria-checked={pick?.kind === "random"}
              className={`skc radio rw-random${pick?.kind === "random" ? " on" : ""}`}
              disabled={forging}
              onClick={() => setPick({ kind: "random" })}
            >
              <span className="skc-art" data-rar="legendary">
                <SkillArt id="godhelp" size={46} family="create" />
              </span>
              <span className="skc-body">
                <span className="skc-name">Forger une compétence</span>
                <span className="skc-desc">
                  Le forgeron crée une compétence inédite, de rareté aléatoire (commune à légendaire) ; l'adversaire en perd
                  une au hasard.
                </span>
              </span>
              <span className="skc-ring" aria-hidden="true" />
            </button>
          </div>
          {offer.steal_options.length === 0 && (
            <p className="muted rw-empty">Votre adversaire n'a rien que vous n'ayez déjà : seul le tirage au hasard reste possible.</p>
          )}
        </div>

        {offer.deck_full && (
          <div className="rw-sec">
            <p className="rw-label" id="rw-replace">
              Votre deck est plein (<span className="mono">{offer.deck.length}/7</span>) : choisissez la compétence à remplacer
            </p>
            <div className="rw-replace" role="radiogroup" aria-labelledby="rw-replace">
              {offer.deck.map((skill) => {
                const info = skillInfo(skill);
                const on = replace === skill;
                return (
                  <button
                    key={skill}
                    type="button"
                    role="radio"
                    aria-checked={on}
                    className={`slot rw-slot${on ? " on" : ""}${info.unique ? " foil" : ""}`}
                    style={{ "--fam": `var(--fam-${info.family})` } as CSSProperties}
                    onClick={() => setReplace(skill)}
                  >
                    <span className="slot-art" data-rar={tileRarity(skill)}>
                      <SkillArt id={skill} size={46} />
                      {info.unique && <UniqueBadge />}
                    </span>
                    <span className="slot-name">{info.name}</span>
                    <span className="skc-ring rw-ring" aria-hidden="true" />
                  </button>
                );
              })}
            </div>
          </div>
        )}

        <div className="rw-foot">
          <p className="muted rw-hint" role="status">
            {forging ? "Le forgeron travaille…" : needsReplace ? "Sélectionnez la compétence à remplacer pour continuer." : ""}
          </p>
          <button type="button" className="btn ghost" disabled={forging} onClick={() => store.send({ type: "reward_choice", choice: { kind: "skip" } })}>
            Passer
          </button>
          <button
            type="button"
            className="btn pri"
            disabled={!choice || forging}
            onClick={() => {
              if (!choice) return;
              if (choice.kind === "random") setForging(true);
              store.send({ type: "reward_choice", choice });
            }}
          >
            {forging ? "Forge en cours…" : "Confirmer"}
          </button>
        </div>
      </div>
    </div>
  );
}
