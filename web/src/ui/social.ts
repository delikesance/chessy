// Petites fonctions pures partagées par les écrans sociaux (classement, amis, profil).
import type { Presence, RecentGame, Relation } from "../protocol";

export function initialOf(name: string): string {
  return (name.trim().charAt(0) || "?").toUpperCase();
}

/** Pourcentage de victoires arrondi, ou null sans partie. */
export function winRate(wins: number, games: number): number | null {
  return games > 0 ? Math.round((wins / games) * 100) : null;
}

/** Interprète les horodatages serveur : RFC 3339, ou SQLite « AAAA-MM-JJ HH:MM:SS » (UTC). */
export function parseServerDate(value: string): Date | null {
  if (!value) return null;
  let v = value.trim();
  if (/^\d{4}-\d{2}-\d{2} \d{2}:\d{2}/.test(v)) v = v.replace(" ", "T");
  if (/T\d{2}:\d{2}(:\d{2}(\.\d+)?)?$/.test(v)) v += "Z";
  const d = new Date(v);
  return Number.isNaN(d.getTime()) ? null : d;
}

const dateFmt = new Intl.DateTimeFormat("fr-FR", { day: "numeric", month: "long", year: "numeric" });
const monthFmt = new Intl.DateTimeFormat("fr-FR", { month: "long", year: "numeric" });

/** « à l'instant », « il y a 5 min », « hier », « il y a 3 j », sinon date complète. */
export function relativeTime(value: string, now: Date = new Date()): string {
  const d = parseServerDate(value);
  if (!d) return "";
  const diff = Math.max(0, now.getTime() - d.getTime());
  const min = Math.floor(diff / 60_000);
  if (min < 1) return "à l'instant";
  if (min < 60) return `il y a ${min} min`;
  const h = Math.floor(min / 60);
  if (h < 24) return `il y a ${h} h`;
  const days = Math.floor(h / 24);
  if (days === 1) return "hier";
  if (days < 7) return `il y a ${days} j`;
  return dateFmt.format(d);
}

export function memberSince(value: string): string {
  const d = parseServerDate(value);
  return d ? `Membre depuis ${monthFmt.format(d)}` : "";
}

const REASONS: Record<string, { win: string; loss: string; draw: string }> = {
  checkmate: { win: "Échec et mat", loss: "Échec et mat", draw: "Échec et mat" },
  resignation: { win: "Abandon de l'adversaire", loss: "Vous avez abandonné", draw: "Abandon" },
  timeout: { win: "Temps écoulé (adversaire)", loss: "Temps écoulé", draw: "Temps écoulé" },
  agreed_draw: { win: "Nulle par accord", loss: "Nulle par accord", draw: "Nulle par accord" },
  stalemate: { win: "Pat", loss: "Pat", draw: "Pat" },
  fifty_moves: { win: "Règle des 50 coups", loss: "Règle des 50 coups", draw: "Règle des 50 coups" },
  repetition: { win: "Répétition de position", loss: "Répétition de position", draw: "Répétition de position" },
  insufficient_material: {
    win: "Matériel insuffisant",
    loss: "Matériel insuffisant",
    draw: "Matériel insuffisant",
  },
  disconnect: { win: "Adversaire déconnecté", loss: "Déconnexion", draw: "Déconnexion" },
};

export function reasonText(reason: string, result: RecentGame["result"]): string {
  return REASONS[reason]?.[result] ?? reason;
}

export const RESULT_LABEL: Record<RecentGame["result"], string> = {
  win: "Victoire",
  loss: "Défaite",
  draw: "Nulle",
};

export function formatDelta(delta: number | null): string {
  if (delta === null) return "—";
  if (delta === 0) return "±0";
  return delta > 0 ? `+${delta}` : `−${Math.abs(delta)}`;
}

export function presenceLabel(presence: Presence, lastSeen: string | null, now: Date = new Date()): string {
  if (presence === "online") return "En ligne";
  if (presence === "in_game") return "En partie";
  const seen = lastSeen ? relativeTime(lastSeen, now) : "";
  return seen ? `Hors ligne · ${seen}` : "Hors ligne";
}

const PRESENCE_RANK: Record<Presence, number> = { online: 0, in_game: 1, offline: 2 };

/** Tri de la liste d'amis : en ligne, en partie, hors ligne, puis pseudo. */
export function sortFriends<T extends { username: string; presence: Presence }>(friends: T[]): T[] {
  return [...friends].sort(
    (a, b) => PRESENCE_RANK[a.presence] - PRESENCE_RANK[b.presence] || a.username.localeCompare(b.username, "fr"),
  );
}

export const RELATION_LABEL: Record<Relation, string> = {
  none: "",
  friend: "Ami",
  incoming: "Vous a invité",
  outgoing: "Demande envoyée",
  self: "Vous",
};

export function sameUser(a: string | null | undefined, b: string | null | undefined): boolean {
  return !!a && !!b && a.toLowerCase() === b.toLowerCase();
}
