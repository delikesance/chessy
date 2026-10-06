import type { Analysis, Color, GameRecord } from "../../protocol";
import { seatName } from "../../replay/frames";
import { formatAccuracy, LABEL_ORDER, LABEL_SHORT, summarySentence } from "../../replay/labels";
import { LabelChip } from "./MoveList";

export type AnalysisState =
  | { status: "idle" }
  | { status: "loading"; depth: number }
  | { status: "ready"; depth: number; data: Analysis }
  | { status: "error"; depth: number; error: string };

export const DEPTHS = [2, 3, 4] as const;

interface Props {
  record: GameRecord;
  state: AnalysisState;
  depth: number;
  onDepth: (depth: number) => void;
  onAnalyse: () => void;
  onCancel: () => void;
}

function DepthPicker({ depth, onDepth, disabled }: { depth: number; onDepth: (d: number) => void; disabled?: boolean }) {
  return (
    <div className="rp-depth">
      <span className="field-label" id="rp-depth-l">
        Profondeur
      </span>
      <div className="seg" role="group" aria-labelledby="rp-depth-l">
        {DEPTHS.map((d) => (
          <button key={d} type="button" className={depth === d ? "on" : undefined} aria-pressed={depth === d} onClick={() => onDepth(d)} disabled={disabled}>
            {d}
          </button>
        ))}
      </div>
    </div>
  );
}

function AccuracyTile({ color, name, value }: { color: Color; name: string; value: number }) {
  return (
    <div className="rp-acc">
      <span className={`rp-dot ${color}`} aria-hidden="true" />
      <span className="rp-acc-name">{name}</span>
      <strong className="mono rp-acc-val">{formatAccuracy(value)}</strong>
      <span className="sr-only">de précision pour les {color === "white" ? "blancs" : "noirs"}</span>
    </div>
  );
}

/** Lancement de l'analyse, état de chargement/erreur, précision des joueurs et résumé par étiquette. */
export function AnalysisPanel({ record, state, depth, onDepth, onAnalyse, onCancel }: Props) {
  const white = seatName(record.white);
  const black = seatName(record.black);
  const noMoves = record.plies === 0;

  return (
    <section className="gm-panel card rp-analysis" aria-labelledby="rp-analysis-h">
      <div className="gm-panel-head">
        <h2 id="rp-analysis-h" className="gm-h">
          Analyse
        </h2>
        {state.status === "ready" && <span className="mono muted">profondeur {state.data.depth}</span>}
      </div>

      {state.status === "loading" && (
        <div className="rp-loading" role="status" aria-live="polite">
          <span className="rp-spinner" aria-hidden="true" />
          <div>
            <strong>Analyse en cours…</strong>
            <p className="muted">Le moteur évalue chaque coup, jusqu'à 25 secondes.</p>
          </div>
          <button type="button" className="btn sm ghost" onClick={onCancel}>
            Annuler
          </button>
        </div>
      )}

      {state.status === "error" && (
        <div className="rp-inline-error" role="alert">
          <p>{state.error}</p>
        </div>
      )}

      {(state.status === "idle" || state.status === "error") && (
        <>
          {state.status === "idle" && <p className="muted rp-help">Le moteur note chaque coup (meilleur, bon, imprécision, erreur, gaffe) et calcule la précision de chaque joueur.</p>}
          <DepthPicker depth={depth} onDepth={onDepth} />
          <button type="button" className="btn pri rp-wide" onClick={onAnalyse} disabled={noMoves}>
            {state.status === "error" ? "Réessayer l'analyse" : "Analyser la partie"}
          </button>
        </>
      )}

      {state.status === "ready" && (
        <>
          <div className="rp-accs" role="group" aria-label="Précision des joueurs">
            <AccuracyTile color="white" name={white} value={state.data.accuracy.white} />
            <AccuracyTile color="black" name={black} value={state.data.accuracy.black} />
          </div>
          <table className="rp-sum">
            <caption className="sr-only">Nombre de coups par étiquette et par camp</caption>
            <thead>
              <tr>
                <th scope="col">
                  <span className="sr-only">Étiquette</span>
                </th>
                <th scope="col">Blancs</th>
                <th scope="col">Noirs</th>
              </tr>
            </thead>
            <tbody>
              {LABEL_ORDER.map((label) => (
                <tr key={label}>
                  <th scope="row">
                    <LabelChip label={label} compact />
                    <span className="rp-sum-name">{LABEL_SHORT[label]}</span>
                  </th>
                  <td className="mono">{state.data.summary.white[label]}</td>
                  <td className="mono">{state.data.summary.black[label]}</td>
                </tr>
              ))}
            </tbody>
          </table>
          <p className="muted rp-help">
            {white} : {summarySentence(state.data.summary.white)}.<br />
            {black} : {summarySentence(state.data.summary.black)}.
          </p>
          <details className="rp-redo">
            <summary>Relancer à une autre profondeur</summary>
            <DepthPicker depth={depth} onDepth={onDepth} />
            <button type="button" className="btn sm rp-wide" onClick={onAnalyse}>
              Réanalyser
            </button>
          </details>
        </>
      )}
    </section>
  );
}
