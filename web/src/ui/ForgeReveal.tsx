import { useEffect, useRef, type CSSProperties } from "react";
import { FAMILY_LABEL } from "../catalog";
import { RARITY_LABEL } from "../forged";
import { navigate } from "../router";
import { skillInfo } from "../skills";
import { store } from "../store";
import { SkillArt } from "./SkillArt";
import { UniqueBadge } from "./UniqueBadge";
import { tileRarity } from "./tileRarity";
import "./forgeReveal.css";

/** Révélation plein écran d'une compétence qui vient d'être forgée : cercle runique, médaillon de sa rareté, nom, famille. */
export function ForgeReveal({ skill }: { skill: string }) {
  const info = skillInfo(skill);
  const rarity = tileRarity(skill);
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    ref.current?.focus();
  }, []);
  const close = (toCollection: boolean) => {
    store.dismissReveal();
    if (toCollection) navigate({ name: "collection" });
  };
  return (
    <div className={`fr-backdrop r-${rarity}`} role="dialog" aria-modal="true" aria-labelledby="fr-name" tabIndex={-1} ref={ref} onKeyDown={(e) => e.key === "Escape" && close(false)}>
      <div className="fr-embers" aria-hidden="true">
        {Array.from({ length: 14 }, (_, i) => (
          <i key={i} style={{ "--i": i } as CSSProperties} />
        ))}
      </div>
      <div className="fr-stage" style={{ "--fam": `var(--fam-${info.family})` } as CSSProperties}>
        <p className="eyebrow fr-eyebrow">Le forgeron a achevé son œuvre</p>
        <div className="fr-banner" aria-label={RARITY_LABEL[rarity]}>
          <span aria-hidden="true">◆</span> {RARITY_LABEL[rarity]} <span aria-hidden="true">◆</span>
        </div>
        <div className="fr-orb">
          <svg className="fr-rings" viewBox="0 0 280 280" aria-hidden="true" focusable="false">
            <circle cx="140" cy="140" r="136" fill="none" stroke="currentColor" strokeWidth="1" opacity=".6" />
            <circle className="fr-dash" cx="140" cy="140" r="118" fill="none" stroke="currentColor" strokeWidth="1.4" strokeDasharray="3 9" />
            <g className="fr-runes" fill="currentColor">
              {Array.from({ length: 12 }, (_, i) => (
                <path key={i} d="M140 14l5 9-5 9-5-9z" transform={`rotate(${i * 30} 140 140)`} opacity={i % 3 === 0 ? 1 : 0.55} />
              ))}
            </g>
          </svg>
          <span className="fr-tile" data-rar={rarity}>
            <SkillArt id={skill} size={92} />
            {info.unique && <UniqueBadge />}
          </span>
        </div>
        <h2 id="fr-name" className="fr-name">
          {info.name}
        </h2>
        <p className="tag fr-fam">{FAMILY_LABEL[info.family]}</p>
        <p className="fr-desc">{info.description}</p>
        {info.unique && <p className="eyebrow fr-unique">Exemplaire unique au monde</p>}
        <button type="button" className="btn pri fr-go" onClick={() => close(true)}>
          Rejoindre l'arsenal
        </button>
        <button type="button" className="btn ghost sm fr-later" onClick={() => close(false)}>
          Plus tard
        </button>
      </div>
    </div>
  );
}
