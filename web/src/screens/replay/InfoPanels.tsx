import type { BestMove, MoveInfo, PlyAnalysis } from "../../protocol";
import { currentResponse, exploreErrorText, lineEntries, MAX_LINE, type ExploreState } from "../../replay/explore";
import { bestMoveSentence, formatEval, type Subject } from "../../replay/labels";
import { COLOR_FR } from "../../replay/frames";
import { LabelChip } from "./MoveList";

interface MovePanelProps {
  /** Dernière action jouée (celle qui a mené à la position affichée), `null` à la position initiale. */
  move: MoveInfo | null;
  analysis: PlyAnalysis | undefined;
  subject: Subject;
  /** Évaluation de la position affichée (point de vue des blancs), si l'analyse est faite. */
  evalCp: number | null;
  /** Meilleur coup depuis la position affichée (action suivante). */
  bestHere: BestMove | null;
  showBest: boolean;
  onShowBest: (on: boolean) => void;
  /** Revenir à la position avant le coup joué pour voir le meilleur coup en flèche. */
  onSeeAlternative: () => void;
}

/** Ce qui s'est passé au dernier coup : phrase « Vous avez joué X ; le meilleur coup était Y (+0,8) ». */
export function MovePanel({ move, analysis, subject, evalCp, bestHere, showBest, onShowBest, onSeeAlternative }: MovePanelProps) {
  const sentence = move ? bestMoveSentence(move, analysis, subject) : null;
  const alternative = !!move && !!analysis && analysis.label !== "best" && !!analysis.best && analysis.best.notation !== move.notation;
  return (
    <section className="gm-panel card rp-now" aria-labelledby="rp-now-h">
      <div className="gm-panel-head">
        <h2 id="rp-now-h" className="gm-h">
          {move ? `Coup ${move.ply}` : "Position initiale"}
        </h2>
        {analysis && <LabelChip label={analysis.label} />}
      </div>
      <div aria-live="polite">
        {move ? (
          <p className="rp-now-move">
            <span className={`rp-dot ${move.color}`} aria-hidden="true" /> <span className="mono">{move.notation}</span>
            <span className="muted"> · {COLOR_FR[move.color]}</span>
          </p>
        ) : (
          <p className="muted">Avant le premier coup.</p>
        )}
        {sentence && <p className="rp-sentence">{sentence}</p>}
        {!analysis && move && <p className="muted rp-help">Lancez l'analyse pour voir la qualité de ce coup.</p>}
      </div>
      {alternative && (
        <button type="button" className="btn sm rp-wide" onClick={onSeeAlternative}>
          Voir le meilleur coup sur l'échiquier
        </button>
      )}
      {evalCp !== null && (
        <p className="rp-eval">
          Évaluation <strong className="mono">{formatEval(evalCp)}</strong> <span className="muted">(côté blancs)</span>
        </p>
      )}
      {bestHere && (
        <label className="rp-check">
          <input type="checkbox" checked={showBest} onChange={(e) => onShowBest(e.target.checked)} />
          <span>
            Flèche du meilleur coup ici : <strong className="mono">{bestHere.notation}</strong> <span className="muted">({formatEval(bestHere.eval_cp)})</span>
          </span>
        </label>
      )}
    </section>
  );
}

interface ExplorePanelProps {
  state: ExploreState;
  pending: boolean;
  error: string | null;
  onUndo: () => void;
  onExit: () => void;
}

/** Variation en cours d'exploration : coups joués, annulation, retour, évaluation et meilleur coup du moteur. */
export function ExplorePanel({ state, pending, error, onUndo, onExit }: ExplorePanelProps) {
  const res = currentResponse(state);
  const entries = lineEntries(state);
  const toMove = res.frame?.to_move ?? "white";
  return (
    <section className="gm-panel card rp-explore" aria-labelledby="rp-explore-h">
      <div className="gm-panel-head">
        <h2 id="rp-explore-h" className="gm-h">
          Exploration
        </h2>
        <span className="tag">Variation</span>
      </div>
      <p className="muted rp-help">
        À partir du coup {state.ply}. Jouez des coups ou des compétences sur l'échiquier : la partie enregistrée n'est pas modifiée.
      </p>

      <div className="rp-variation" aria-label="Variation jouée">
        {entries.length === 0 ? (
          <span className="muted">Aucun coup joué : c'est aux {COLOR_FR[toMove]} de jouer.</span>
        ) : (
          <ol className="rp-line-list">
            {entries.map((e) => (
              <li key={e.ply} className={e.color}>
                <span className="mono muted">{e.ply}</span>
                <span className={`rp-dot ${e.color}`} aria-hidden="true" />
                <span className="mono">{e.notation}</span>
              </li>
            ))}
          </ol>
        )}
      </div>

      <div className="rp-eval-now" aria-live="polite">
        <p>
          Évaluation <strong className="mono">{formatEval(res.eval_cp)}</strong> <span className="muted">(côté blancs)</span>
        </p>
        {res.best ? (
          <p>
            Meilleur coup des {COLOR_FR[toMove]} : <strong className="mono">{res.best.notation}</strong> <span className="muted">({formatEval(res.best.eval_cp)})</span>
          </p>
        ) : (
          <p className="muted">Aucun coup simple à proposer.</p>
        )}
      </div>

      {pending && (
        <p className="muted" role="status">
          Le moteur réfléchit…
        </p>
      )}
      {error && (
        <p className="rp-inline-error" role="alert">
          {error}
        </p>
      )}
      {state.line.length >= MAX_LINE && <p className="muted">{exploreErrorText("too_long")}</p>}

      <div className="gm-row">
        <button type="button" className="btn sm" onClick={onUndo} disabled={pending || state.line.length === 0}>
          Annuler le dernier coup
        </button>
        <button type="button" className="btn sm pri" onClick={onExit}>
          Retour à la partie
        </button>
      </div>
    </section>
  );
}
