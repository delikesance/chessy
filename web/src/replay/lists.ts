// Logique pure des listes : « Mes parties » (pagination, filtre) et « En direct » (tri, étiquettes).

import type { Color, GameSummary, LiveGame, Seat } from "../protocol";
import { kindLabel, opposite, seatName } from "./frames";

// ---- Mes parties -------------------------------------------------------------

export type GamesFilter = "all" | "ranked" | "friendly" | "solo";

export const GAMES_FILTERS: { id: GamesFilter; label: string }[] = [
  { id: "all", label: "Toutes" },
  { id: "ranked", label: "Classées" },
  { id: "friendly", label: "Amicales" },
  { id: "solo", label: "Solo" },
];

export const GAMES_PAGE = 20;

export function matchesFilter(game: Pick<GameSummary, "kind" | "rated">, filter: GamesFilter): boolean {
  switch (filter) {
    case "all":
      return true;
    case "ranked":
      return game.kind !== "solo" && game.rated;
    case "friendly":
      return game.kind !== "solo" && !game.rated;
    case "solo":
      return game.kind === "solo";
  }
}

export function filterGames(games: GameSummary[], filter: GamesFilter): GameSummary[] {
  return filter === "all" ? games : games.filter((g) => matchesFilter(g, filter));
}

export function countByFilter(games: GameSummary[]): Record<GamesFilter, number> {
  return {
    all: games.length,
    ranked: filterGames(games, "ranked").length,
    friendly: filterGames(games, "friendly").length,
    solo: filterGames(games, "solo").length,
  };
}

/** Ajoute une page au début de liste déjà chargée, sans doublon (une partie qui se termine décale les pages). */
export function mergePage(current: GameSummary[], page: GameSummary[], offset: number): GameSummary[] {
  if (offset === 0) return page;
  const seen = new Set(current.map((g) => g.game_id));
  return [...current, ...page.filter((g) => !seen.has(g.game_id))];
}

/** Reste-t-il des parties à charger ? Une page vide arrête la pagination même si `total` est inexact. */
export function hasMore(loaded: number, total: number, lastPageSize: number): boolean {
  return lastPageSize > 0 && loaded < total;
}

/** L'adversaire du demandeur dans une partie. */
export function opponentSeat(game: Pick<GameSummary, "white" | "black" | "color">): Seat {
  return game[opposite(game.color)];
}

/** Libellé de l'adversaire : pseudo, « IA (niveau 1400) » ou « Invité ». */
export function opponentLabel(game: Pick<GameSummary, "white" | "black" | "color">): string {
  const seat = opponentSeat(game);
  if (seat.bot) return seat.elo !== null ? `IA (niveau ${seat.elo})` : "IA";
  return seatName(seat);
}

/** Message d'une liste vide selon le filtre actif. */
export function emptyGamesText(filter: GamesFilter, loaded: number): string {
  if (loaded === 0) return "Vous n'avez pas encore terminé de partie.";
  switch (filter) {
    case "ranked":
      return "Aucune partie classée parmi les parties chargées.";
    case "friendly":
      return "Aucune partie amicale parmi les parties chargées.";
    case "solo":
      return "Aucune partie solo parmi les parties chargées.";
    default:
      return "Aucune partie.";
  }
}

/** Variation d'Elo seulement pour une partie classée qui compte. */
export function showsDelta(game: Pick<GameSummary, "kind" | "rated" | "elo_delta">): boolean {
  return game.kind !== "solo" && game.rated && game.elo_delta !== null;
}

// ---- En direct ---------------------------------------------------------------

/** Elo moyen des deux joueurs ; un bot ou un invité sans Elo compte pour ce qui est connu. */
export function averageElo(game: Pick<LiveGame, "white" | "black">): number {
  const values = [game.white.elo, game.black.elo].filter((e): e is number => e !== null);
  return values.length ? values.reduce((a, b) => a + b, 0) / values.length : 0;
}

/** Elo moyen décroissant, puis partie la plus ancienne d'abord (même ordre que le serveur). */
export function sortLive(games: LiveGame[]): LiveGame[] {
  return [...games].sort(
    (a, b) =>
      averageElo(b) - averageElo(a) ||
      (a.started_at < b.started_at ? -1 : a.started_at > b.started_at ? 1 : 0) ||
      a.game_id.localeCompare(b.game_id),
  );
}

export const liveTag = (game: Pick<LiveGame, "kind" | "rated">): string => kindLabel(game.kind, game.rated);

export function plyText(ply: number): string {
  return ply === 0 ? "Pas encore de coup" : `${ply} coup${ply > 1 ? "s" : ""}`;
}

export function spectatorsText(n: number): string {
  if (n <= 0) return "Aucun spectateur";
  return `${n} spectateur${n > 1 ? "s" : ""}`;
}

/** « Retransmission différée de 30 s », ou `null` en direct strict. */
export function delayText(delayMs: number): string | null {
  if (!(delayMs > 0)) return null;
  const s = Math.round(delayMs / 1000);
  return s >= 120 ? `Retransmission différée de ${Math.round(s / 60)} min` : `Retransmission différée de ${s} s`;
}

/** Qui gagne : texte de résultat neutre pour un spectateur. */
export function winnerText(winner: Color | null): string {
  if (winner === null) return "Partie nulle";
  return winner === "white" ? "Victoire des blancs" : "Victoire des noirs";
}
