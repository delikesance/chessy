import { useId, useState, type CSSProperties } from "react";
import type { SoloColor } from "../protocol";
import { SOLO_MAX, SOLO_MIN, SOLO_STEP, SOLO_TIERS, clampElo, soloTier } from "../solo";
import { store, type AppState } from "../store";
import "./solo.css";

const COLORS: { value: SoloColor; label: string }[] = [
  { value: "white", label: "Blancs" },
  { value: "black", label: "Noirs" },
  { value: "random", label: "Aléatoire" },
];

/** Carte « Jouer contre l'IA » : niveau d'Elo, couleur, lancement. Aucun compte requis. */
export function SoloCard({ state }: { state: Pick<AppState, "solo" | "soloPending"> }) {
  const { solo, soloPending } = state;
  const [elo, setElo] = useState(solo.elo);
  const [draft, setDraft] = useState(String(solo.elo));
  const [color, setColor] = useState<SoloColor>(solo.color);
  const id = useId();
  const tier = soloTier(elo);
  const tierIdx = SOLO_TIERS.indexOf(tier);

  const pick = (value: number) => {
    const next = clampElo(value);
    setElo(next);
    setDraft(String(next));
  };
  // Pendant la frappe on suit la valeur sans la corriger ; la correction se fait à la sortie du champ.
  const type = (text: string) => {
    setDraft(text);
    const n = Number(text);
    if (text.trim() !== "" && Number.isFinite(n) && n >= SOLO_MIN && n <= SOLO_MAX) setElo(clampElo(n));
  };

  return (
    <section className="card lb-solo" aria-labelledby={`${id}-h`}>
      <div className="lb-solo-head">
        <h2 id={`${id}-h`} className="lb-h2">
          Jouer contre l'IA
        </h2>
        <span className="tag">Entraînement</span>
      </div>

      <div className="lb-solo-level">
        <div className="lb-solo-row">
          <label className="field-label" htmlFor={`${id}-elo`}>
            Niveau (Elo)
          </label>
          <input
            id={`${id}-elo`}
            className="input mono lb-solo-num"
            type="number"
            inputMode="numeric"
            min={SOLO_MIN}
            max={SOLO_MAX}
            step={SOLO_STEP}
            value={draft}
            onChange={(e) => type(e.target.value)}
            onBlur={() => pick(Number(draft))}
          />
        </div>
        <input
          className="lb-range"
          type="range"
          aria-label="Niveau de l'IA"
          aria-valuetext={`${elo} Elo, ${tier.name}`}
          min={SOLO_MIN}
          max={SOLO_MAX}
          step={SOLO_STEP}
          value={elo}
          onChange={(e) => pick(Number(e.target.value))}
          style={{ "--pct": `${((elo - SOLO_MIN) / (SOLO_MAX - SOLO_MIN)) * 100}%` } as CSSProperties}
        />
        <div className="lb-ticks" aria-hidden="true">
          {SOLO_TIERS.map((t, i) => (
            <i
              key={t.name}
              className={i <= tierIdx ? "on" : ""}
              style={{ flexGrow: (SOLO_TIERS[i + 1]?.min ?? SOLO_MAX + SOLO_STEP) - t.min }}
            />
          ))}
        </div>
        <p className="lb-tier" aria-live="polite">
          <strong>{tier.name}</strong>
          <span className="muted"> · {tier.blurb}</span>
        </p>
      </div>

      <div>
        <span className="field-label" id={`${id}-c`}>
          Votre couleur
        </span>
        <div className="seg" role="group" aria-labelledby={`${id}-c`}>
          {COLORS.map((c) => (
            <button
              key={c.value}
              type="button"
              aria-pressed={color === c.value}
              className={color === c.value ? "on" : ""}
              onClick={() => setColor(c.value)}
            >
              {c.label}
            </button>
          ))}
        </div>
      </div>

      <button type="button" className="btn lb-main" disabled={soloPending} onClick={() => store.startSolo(elo, color)}>
        {soloPending ? "Création de la partie…" : "Commencer"}
      </button>
      <p className="muted lb-note">Sans horloge, sans Elo en jeu, sans récompense. Aucun compte nécessaire.</p>
    </section>
  );
}
