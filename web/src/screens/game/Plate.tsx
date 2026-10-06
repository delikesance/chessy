import { useEffect, useState } from "react";
import { capturedPieces, evalShare, formatClock, materialBalance, remainingMs } from "../../game/logic";
import type { Clock as ClockState, Color, Piece, SkillId, StateView } from "../../protocol";
import { skillInfo } from "../../skills";
import { PieceIcon, SkillArt } from "../../ui/SkillArt";
import { initialOf } from "../../ui/NavBar";

/** Horloge interpolée côté client entre deux messages du serveur. */
export function ClockFace({ clock, color, stamp, label }: { clock: ClockState; color: Color; stamp: number; label: string }) {
  const running = clock.running === color;
  const [now, setNow] = useState(() => performance.now());

  useEffect(() => {
    if (!running) return;
    setNow(performance.now());
    const timer = setInterval(() => setNow(performance.now()), 100);
    return () => clearInterval(timer);
  }, [running, clock]);

  const ms = remainingMs(clock, color, running ? now - stamp : 0);
  const cls = ["gm-clock", "mono", running ? "on" : "", ms < 30_000 ? "low" : ""].filter(Boolean).join(" ");
  return (
    <span className={cls} role="timer" aria-label={label}>
      {formatClock(ms)}
    </span>
  );
}

interface PlateProps {
  name: string;
  elo: number | null;
  color: Color;
  board: (Piece | null)[];
  clock: ClockState;
  stamp: number;
  active: boolean;
  /** Compétences utilisées par ce joueur. */
  used: SkillId[];
  /** Compétences encore disponibles (adversaire : nombre seulement). */
  remaining: number;
  disconnected?: boolean;
  you?: boolean;
  /** Adversaire IA : étiquette « IA » et Elo présenté comme un niveau. */
  bot?: boolean;
  /** Faux en solo : l'horloge n'est ni affichée ni interpolée. */
  clockEnabled?: boolean;
  clockLabel: string;
}

export function Plate({ name, elo, color, board, clock, stamp, active, used, remaining, disconnected, you, bot, clockEnabled = true, clockLabel }: PlateProps) {
  // Les pièces que ce joueur a prises sont les pièces manquantes de l'autre camp.
  const taken = capturedPieces(board, color === "white" ? "black" : "white");
  const lead = materialBalance(board, color);
  return (
    <div className={`gm-plate card${active ? " turn" : ""}`}>
      <span className={`avatar${you ? " solid" : ""}`}>{initialOf(name)}</span>
      <div className="gm-plate-main">
        <div className="gm-plate-name">
          <strong>{name}</strong>
          {elo !== null && (
            <span className="mono muted">
              {bot ? "· " : ""}
              {elo}
            </span>
          )}
          {bot && <span className="tag">IA</span>}
          {disconnected && <span className="tag">déconnecté</span>}
          {active && <span className="tag gm-turn-tag">au trait</span>}
        </div>
        <div className="gm-plate-sub">
          <span className="gm-taken" aria-label={taken.length ? `${taken.length} pièces prises` : "Aucune pièce prise"}>
            {taken.map((kind, i) => (
              <PieceIcon key={i} kind={kind} size={15} />
            ))}
            {lead > 0 && <span className="mono gm-lead">+{lead}</span>}
          </span>
          <span className="gm-used" aria-label="Compétences utilisées">
            {used.map((s) => (
              <span key={s} className="gm-used-ico" title={`${skillInfo(s).name} (utilisée)`}>
                <SkillArt id={s} size={20} />
              </span>
            ))}
            {remaining > 0 && (
              <span className="mono muted gm-remaining">
                {remaining} restante{remaining > 1 ? "s" : ""}
              </span>
            )}
          </span>
        </div>
      </div>
      {clockEnabled && <ClockFace clock={clock} color={color} stamp={stamp} label={clockLabel} />}
    </div>
  );
}

/** Barre d'évaluation matérielle, du point de vue du joueur (sa part en bas). */
export function EvalBar({ view }: { view: StateView }) {
  const balance = materialBalance(view.board, view.you);
  const share = evalShare(balance);
  const text = balance === 0 ? "égalité matérielle" : balance > 0 ? `avantage de ${balance} pour vous` : `avantage de ${-balance} pour l'adversaire`;
  return (
    <div className="gm-eval" role="img" aria-label={`Évaluation matérielle : ${text}`} title={text}>
      <i style={{ height: `${Math.round(share * 100)}%` }} className={view.you} />
    </div>
  );
}
