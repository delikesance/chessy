// Règles complètes des compétences (source : docs/skills.md) et fonctions de l'historique de la collection.
import type { CatalogId } from "../catalog";
import type { SkillHistoryEntry } from "../protocol";
import { parseServerDate } from "../ui/social";

export const RULES: Record<CatalogId, string> = {
  teleportation: "Déplace une pièce vers n'importe quelle case de l'échiquier, sans tenir compte des obstacles.",
  imune: "Rend une pièce invulnérable aux attaques ennemies pendant un tour.",
  rollback: "Annule le mouvement réel d'une pièce, qui retourne d'où elle venait. Impossible sur le roi.",
  clone: "Crée une copie d'une pièce sur une case vide adjacente. Possible uniquement si la cible dispose d'une case adjacente vide.",
  morph: "Transforme une pièce en une autre : pendant un tour si la cible est ennemie, pendant deux tours sinon.",
  canceller:
    "Annule l'effet d'une compétence ennemie utilisée au tour précédent. La liste des compétences ennemies du tour précédent vous est proposée pour choisir celle à annuler.",
  tornado: "Déplace toutes les pièces de l'échiquier dans un sens de rotation, sauf les rois.",
  invisibility: "Rend une pièce invisible pendant deux tours.",
  freeze: "Empêche une pièce ennemie de se déplacer pendant deux tours.",
  terminator:
    "Crée, pour un tour, une copie d'une pièce ennemie aléatoire avec toutes ses capacités, placée au même endroit mais de votre côté du plateau. Si la case n'est pas disponible, l'opération est impossible.",
  destiny_swapper: "Échange les positions de deux pièces alliées.",
  trap:
    "Place un piège sur une case vide, qui immobilise pendant deux tours la première pièce ennemie qui marche dessus. Chaque mouvement est une suite de déplacements case par case : un piège sur le chemin immobilise la pièce sur la case du piège.",
  bench:
    "Pendant un tour, la pièce est mise sur le banc (elle n'est plus sur l'échiquier). À son retour, elle est placée sur la case libre la plus proche de son ancienne case.",
  forcefield:
    "Appliquée sur une pièce : quand elle est mangée, l'attaquant est repoussé de deux cases au maximum. La pièce mangée va au cimetière : elle n'est pas invincible.",
  transposition: "Échange la position de deux pièces sur l'échiquier, sans engendrer d'échec.",
  queensac: "En cas de mat, transpose la reine avec le roi. La reine MEURT sur la position du roi.",
  temporal: "Permet à une pièce alliée de revenir dans le temps et de refaire son dernier mouvement. Impossible sur le roi.",
  geomancy: "Modifie la disposition de l'échiquier en déplaçant des cases pour créer des murs qui bloquent l'adversaire pendant trois tours.",
  celestial:
    "Une fois par partie, empêche une pièce alliée d'être capturée et la replace à sa position de départ. Impossible sur le roi.",
  godhelp:
    "Une pièce apparaît aléatoirement sur le terrain, avec des capacités aléatoires, pendant trois tours. Elle n'appartient pas à l'échiquier de base ; ni la case d'apparition ni le type ne sont choisissables.",
  remover: "Retire un pion parmi les pions adverses. Impossible si la suppression engendre un mat.",
  wall:
    "Ramène à la vie des pions (uniquement des pions) sous forme de mur de protection. Ils sont jouables à partir du tour suivant. S'ils meurent à nouveau, ils ne peuvent pas être ramenés avec une autre compétence.",
  mirage:
    "Simule une pièce sur l'échiquier (pas le roi). Si elle meurt, elle disparaît. Elle ne peut ni engendrer de mat ni manger de pions, et elle empêche le déplacement si celui-ci n'est pas un déplacement du roi.",
  evolve: "Fait évoluer un pion comme s'il était passé sur une case d'évolution d'un terrain adverse. Utilisable sur toutes les pièces, sauf le roi.",
  switch: "Fait changer de camp une pièce adverse sans portée ni ligne de vue. Impossible sur une pièce engendrant un mat.",
  mind: "Donne le meilleur coup possible, trois fois dans la partie, quand le joueur le veut.",
  control: "Prend le contrôle d'une pièce adverse pendant un tour complet, comme s'il s'agissait d'une de vos pièces. Ne fonctionne pas sur le roi ennemi.",
};

export const UNIQUE_NOTE =
  "Compétence unique : elle n'existe que dans un seul deck au monde et ne compte pas dans les trois compétences sélectionnées pour une partie. Beaucoup plus puissante qu'une compétence de base.";
export const CLASSIC_NOTE =
  "Compétence classique : elle compte parmi les trois compétences sélectionnées avant la partie, choisies dans votre deck de 7 au maximum.";

export type HistoryFilter = "all" | "forged" | "obtained" | "lost";

export const HISTORY_FILTERS: { id: HistoryFilter; label: string }[] = [
  { id: "all", label: "Tout" },
  { id: "forged", label: "Forgées" },
  { id: "obtained", label: "Obtenues" },
  { id: "lost", label: "Perdues" },
];

/** Ce que raconte une ligne : « Forgée », « Volée à bob », « Prise par alice »… */
export function describeEntry(e: SkillHistoryEntry): string {
  const who = e.other ?? "un joueur sans compte";
  switch (e.source) {
    case "forged":
      return "Forgée après une victoire";
    case "stolen":
      return `Volée à ${who}`;
    case "won":
      return "Gagnée après une victoire";
    case "starter":
      return "Deck de départ";
    case "refill":
      return "Offerte : votre deck était vide";
    case "earlier":
      return "Déjà dans votre deck";
    case "taken":
      return e.other ? `Prise par ${e.other} après une défaite` : "Prise par votre adversaire après une défaite";
    case "replaced":
      return "Remplacée pour faire de la place";
  }
}

/** Les lignes qui correspondent au filtre (l'ordre est conservé). */
export function filterHistory(entries: readonly SkillHistoryEntry[], filter: HistoryFilter): SkillHistoryEntry[] {
  return entries.filter((e) => {
    switch (filter) {
      case "all":
        return true;
      case "forged":
        return e.change === "gained" && e.source === "forged";
      case "obtained":
        return e.change === "gained" && e.source !== "forged";
      case "lost":
        return e.change === "lost";
    }
  });
}

export interface HistoryStats {
  forged: number;
  obtained: number;
  lost: number;
}

export function historyStats(entries: readonly SkillHistoryEntry[]): HistoryStats {
  return {
    forged: filterHistory(entries, "forged").length,
    obtained: filterHistory(entries, "obtained").length,
    lost: filterHistory(entries, "lost").length,
  };
}

/** Le jour d'une date serveur, en clair : « Aujourd'hui », « Hier » ou la date. */
export function dayLabel(value: string, now: Date = new Date()): string {
  const d = parseServerDate(value);
  if (!d) return "Date inconnue";
  const start = (x: Date) => new Date(x.getFullYear(), x.getMonth(), x.getDate()).getTime();
  const days = Math.round((start(now) - start(d)) / 86_400_000);
  if (days <= 0) return "Aujourd'hui";
  if (days === 1) return "Hier";
  return new Intl.DateTimeFormat("fr-FR", { day: "numeric", month: "long", year: "numeric" }).format(d);
}

export interface HistoryDay {
  label: string;
  entries: SkillHistoryEntry[];
}

/** Regroupe par jour, en gardant l'ordre (le plus récent d'abord). */
export function groupByDay(entries: readonly SkillHistoryEntry[], now: Date = new Date()): HistoryDay[] {
  const days: HistoryDay[] = [];
  for (const e of entries) {
    const label = dayLabel(e.at, now);
    const last = days[days.length - 1];
    if (last && last.label === label) last.entries.push(e);
    else days.push({ label, entries: [e] });
  }
  return days;
}

