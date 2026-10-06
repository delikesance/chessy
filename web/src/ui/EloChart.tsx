import type { PublicProfile } from "../protocol";
import { buildChart } from "./eloChartPath";
import "./elochart.css";

const BOX = { width: 640, height: 200, padX: 16, padY: 20 };

interface Props {
  history: PublicProfile["history"];
  /** Texte alternatif ; par défaut un résumé généré. */
  label?: string;
}

/** Courbe d'évolution de l'Elo (polyline SVG, sans dépendance). */
export function EloChart({ history, label }: Props) {
  const geo = buildChart(
    history.map((h) => h.elo),
    BOX,
  );
  if (!geo) return <p className="elo-empty muted">Pas encore de parties classées.</p>;

  const last = geo.points[geo.points.length - 1];
  const first = geo.points[0];
  const aria =
    label ?? `Évolution de l'Elo sur ${history.length} points : de ${first.elo} à ${last.elo}, minimum ${geo.min}, maximum ${geo.max}.`;
  const baseY = BOX.height - BOX.padY;
  const topY = BOX.padY;
  const midY = (baseY + topY) / 2;

  return (
    <figure className="elo-chart">
      <svg viewBox={`0 0 ${BOX.width} ${BOX.height}`} role="img" aria-label={aria} preserveAspectRatio="xMidYMid meet">
        {[topY, midY, baseY].map((y) => (
          <line key={y} className="elo-grid" x1={BOX.padX} x2={BOX.width - BOX.padX} y1={y} y2={y} />
        ))}
        <polyline className="elo-line" points={geo.polyline} fill="none" />
        <circle className="elo-dot" cx={last.x} cy={last.y} r={4.5} />
      </svg>
      <figcaption className="elo-legend mono">
        <span>Min {geo.min}</span>
        <span>Actuel {last.elo}</span>
        <span>Max {geo.max}</span>
      </figcaption>
    </figure>
  );
}
