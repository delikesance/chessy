// Logique pure du classement.
import type { LeaderboardEntry } from "../protocol";
import { sameUser } from "../ui/social";

export type RankingFilter = "all" | "friends";

/**
 * Filtre « Amis » : les amis plus soi-même. Les rangs affichés sont alors les positions
 * dans ce sous-classement (l'ordre du serveur est conservé).
 */
export function filterEntries(
  entries: LeaderboardEntry[],
  filter: RankingFilter,
  friendNames: string[],
  me: string | null,
): LeaderboardEntry[] {
  if (filter === "all") return entries;
  return entries.filter((e) => sameUser(e.username, me) || friendNames.some((f) => sameUser(f, e.username)));
}

/** Rang à afficher : rang global, ou position dans la liste filtrée. */
export function displayRank(entry: LeaderboardEntry, index: number, filter: RankingFilter): number {
  return filter === "all" ? entry.rank : index + 1;
}

/** Noms d'amis (hors soi) encore absents des entrées déjà chargées. */
export function missingFriends(entries: LeaderboardEntry[], friendNames: string[]): string[] {
  return friendNames.filter((f) => !entries.some((e) => sameUser(e.username, f)));
}
