import { useEffect, useRef, type CSSProperties } from "react";
import { FAMILY_LABEL } from "../../catalog";
import { formatDelta, resultFor, resultHeadline } from "../../outcome";
import type { Color, EloChange, Outcome, PieceKind, SpawnKind } from "../../protocol";
import { skillInfo } from "../../skills";
import { navigate } from "../../router";
import { store } from "../../store";
import { PieceIcon, SkillArt } from "../../ui/SkillArt";

const PROMO_LABEL: Record<string, string> = { queen: "Dame", rook: "Tour", bishop: "Fou", knight: "Cavalier" };

export function PromotionPicker({ options, onPick, onCancel }: { options: PieceKind[]; onPick: (k: PieceKind) => void; onCancel: () => void }) {
  const first = useRef<HTMLButtonElement>(null);
  useEffect(() => {
    first.current?.focus();
  }, []);
  return (
    <div className="gm-veil" role="dialog" aria-modal="true" aria-label="Promotion">
      <div className="gm-promo card">
        <p className="eyebrow">Promotion</p>
        <div className="gm-promo-row">
          {options.map((kind, i) => (
            <button key={kind} type="button" className="btn gm-promo-btn" ref={i === 0 ? first : undefined} onClick={() => onPick(kind)}>
              <PieceIcon kind={kind} size={34} />
              <span>{PROMO_LABEL[kind] ?? kind}</span>
            </button>
          ))}
        </div>
        <button type="button" className="btn sm ghost" onClick={onCancel}>
          Annuler
        </button>
      </div>
    </div>
  );
}

const SPAWN_LABEL: Record<string, string> = { pawn: "Pion", knight: "Cavalier", bishop: "Fou", rook: "Tour", queen: "Dame" };

/** Mirage / Morph : choix du type de pièce une fois la case choisie (comme la promotion). */
export function SpawnPicker({
  skill,
  options,
  onPick,
  onCancel,
}: {
  skill: string;
  options: SpawnKind[];
  onPick: (k: SpawnKind) => void;
  onCancel: () => void;
}) {
  const first = useRef<HTMLButtonElement>(null);
  useEffect(() => {
    first.current?.focus();
  }, []);
  const info = skillInfo(skill);
  return (
    <div className="gm-veil" role="dialog" aria-modal="true" aria-label={`${info.name} : type de pièce`}>
      <div className="gm-promo card" style={{ "--fam": `var(--fam-${info.family})` } as CSSProperties}>
        <p className="eyebrow">{info.name}</p>
        <p className="gm-promo-ask">Choisissez le type de pièce</p>
        <div className="gm-promo-row">
          {options.map((kind, i) => (
            <button key={kind} type="button" className="btn gm-promo-btn" ref={i === 0 ? first : undefined} onClick={() => onPick(kind)}>
              <PieceIcon kind={kind} size={34} />
              <span>{SPAWN_LABEL[kind] ?? kind}</span>
            </button>
          ))}
        </div>
        <button type="button" className="btn sm ghost" onClick={onCancel}>
          Annuler
        </button>
      </div>
    </div>
  );
}

/** Grande carte centrale affichée quand une compétence est lancée (~1,9 s). */
export function LaunchCard({ skill, mine }: { skill: string; mine: boolean }) {
  const info = skillInfo(skill);
  return (
    <div className="gm-launch" role="status" aria-label={`${mine ? "Vous lancez" : "L'adversaire lance"} ${info.name}`}>
      <div className="gm-launch-card card" style={{ "--fam": `var(--fam-${info.family})` } as CSSProperties}>
        <p className="eyebrow">{mine ? "Vous lancez" : "L'adversaire lance"}</p>
        <div className="gm-launch-art">
          <SkillArt id={skill} size={132} />
        </div>
        <h3 className="gm-launch-name">{info.name}</h3>
        <p className="gm-launch-fam eyebrow">{FAMILY_LABEL[info.family]}</p>
        <p className="gm-launch-desc">{info.description}</p>
        {info.unique && <span className="tag gm-launch-unique">compétence unique</span>}
      </div>
    </div>
  );
}

interface ResultProps {
  outcome: Outcome;
  you: Color;
  rated: boolean;
  /** Partie contre l'IA : ni Elo ni récompense, revanche immédiate. */
  solo?: boolean;
  elo: EloChange | null;
  rematch: "none" | "offered" | "received";
  onHide: () => void;
  /** Partie enregistrée : active « Revoir la partie » et « Analyser » (replay, docs/spec-v4.md §5). */
  gameId?: string;
}

export function ResultPanel({ outcome, you, rated, solo = false, elo, rematch, onHide, gameId }: ResultProps) {
  const { title, reason } = resultHeadline(outcome, you);
  const result = resultFor(outcome, you);
  const delta = elo ? elo.you_after - elo.you_before : null;
  const first = useRef<HTMLButtonElement>(null);
  useEffect(() => {
    first.current?.focus();
  }, []);

  return (
    <div className="gm-veil" role="dialog" aria-modal="true" aria-labelledby="res-title">
      <div className={`gm-result card ${result ?? ""}`}>
        <p className="eyebrow">Partie terminée</p>
        <h2 id="res-title" className="gm-result-title">
          {title}
        </h2>
        <p className="muted">{reason}</p>

        {solo ? (
          <p className="muted gm-elo-none">Partie d'entraînement : ni Elo ni récompense en jeu.</p>
        ) : rated && elo && delta !== null ? (
          <div className="gm-elo">
            <span className="gm-elo-delta mono">{formatDelta(delta)}</span>
            <span className="muted">
              Nouvel Elo <strong className="mono gm-elo-new">{elo.you_after}</strong>
            </span>
          </div>
        ) : (
          <p className="muted gm-elo-none">{rated ? "Partie classée non comptabilisée." : "Partie amicale : aucun Elo en jeu."}</p>
        )}

        <div className="gm-result-actions">
          {rematch === "received" ? (
            <>
              <p className="gm-rematch-msg">L'adversaire propose une revanche.</p>
              <div className="gm-result-row">
                <button type="button" className="btn pri" ref={first} onClick={() => store.respondRematch(true)}>
                  Accepter la revanche
                </button>
                <button type="button" className="btn" onClick={() => store.respondRematch(false)}>
                  Refuser
                </button>
              </div>
            </>
          ) : (
            <button type="button" className="btn pri" ref={first} disabled={rematch === "offered"} onClick={() => store.requestRematch()}>
              {rematch === "offered" ? (solo ? "Nouvelle partie…" : "Revanche proposée…") : "Revanche"}
            </button>
          )}
          {gameId && (
            <div className="gm-result-row">
              <button
                type="button"
                className="btn"
                onClick={() => {
                  store.leaveGame();
                  navigate({ name: "replay", param: gameId });
                }}
              >
                Revoir la partie
              </button>
              <button
                type="button"
                className="btn"
                onClick={() => {
                  store.leaveGame();
                  navigate({ name: "replay", param: gameId, sub: "analyse" });
                }}
              >
                Analyser
              </button>
            </div>
          )}
          <div className="gm-result-row">
            <button type="button" className="btn ghost" onClick={onHide}>
              Revoir l'échiquier
            </button>
            <button type="button" className="btn ghost" onClick={() => store.leaveGame()}>
              Retour au lobby
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
