import type { RecentGame } from "../protocol";
import { hrefFor } from "../router";
import { formatDelta, reasonText, relativeTime, RESULT_LABEL } from "./social";
import "./recentgames.css";

interface Props {
  games: RecentGame[];
  /** Limite d'affichage (par défaut : tout). */
  limit?: number;
}

/** Liste des dernières parties d'un joueur : résultat, adversaire, variation d'Elo, motif, date. */
export function RecentGames({ games, limit }: Props) {
  const shown = limit ? games.slice(0, limit) : games;
  if (shown.length === 0) return <p className="rg-empty muted">Aucune partie terminée pour l'instant.</p>;
  return (
    <ul className="rg-list">
      {shown.map((g) => (
        <li key={g.game_id} className="rg-row">
          <span className={`rg-result ${g.result}`}>{RESULT_LABEL[g.result]}</span>
          <span className="rg-main">
            <span className="rg-opp">
              contre{" "}
              {g.opponent ? (
                <a href={hrefFor({ name: "profile", param: g.opponent })}>{g.opponent}</a>
              ) : (
                <span className="muted">Invité</span>
              )}
            </span>
            <span className="rg-meta">
              {reasonText(g.reason, g.result)} · {g.color === "white" ? "Blancs" : "Noirs"} · {relativeTime(g.at)}
            </span>
          </span>
          <span className="rg-side">
            <span className="rg-delta mono" aria-label={g.rated ? `Variation d'Elo ${formatDelta(g.elo_delta)}` : undefined}>
              {g.rated ? formatDelta(g.elo_delta) : "—"}
            </span>
            <span className="tag">{g.rated ? "Classée" : "Amicale"}</span>
          </span>
        </li>
      ))}
    </ul>
  );
}
