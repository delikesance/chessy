// Règles complètes des compétences (source : docs/skills.md) et filtres de l'encyclopédie.
import { CATALOG } from "../catalog";
import type { CatalogEntry, CatalogId, Family } from "../catalog";

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
  trap_card:
    "Place un piège sur une case vide, qui immobilise pendant deux tours la première pièce ennemie qui marche dessus. Chaque mouvement est une suite de déplacements case par case : un piège sur le chemin immobilise la pièce sur la case du piège.",
  the_bench:
    "Pendant un tour, la pièce est mise sur le banc (elle n'est plus sur l'échiquier). À son retour, elle est placée sur la case libre la plus proche de son ancienne case.",
  force_field:
    "Appliquée sur une pièce : quand elle est mangée, l'attaquant est repoussé de deux cases au maximum. La pièce mangée va au cimetière : elle n'est pas invincible.",
  transposition: "Échange la position de deux pièces sur l'échiquier, sans engendrer d'échec.",
  queen_sacrifice: "En cas de mat, transpose la reine avec le roi. La reine MEURT sur la position du roi.",
  temporal_distortion: "Permet à une pièce alliée de revenir dans le temps et de refaire son dernier mouvement. Impossible sur le roi.",
  geomancy: "Modifie la disposition de l'échiquier en déplaçant des cases pour créer des murs qui bloquent l'adversaire pendant trois tours.",
  celestial_intervention:
    "Une fois par partie, empêche une pièce alliée d'être capturée et la replace à sa position de départ. Impossible sur le roi.",
  god_help:
    "Une pièce apparaît aléatoirement sur le terrain, avec des capacités aléatoires, pendant trois tours. Elle n'appartient pas à l'échiquier de base ; ni la case d'apparition ni le type ne sont choisissables.",
  remover: "Retire un pion parmi les pions adverses. Impossible si la suppression engendre un mat.",
  wall:
    "Ramène à la vie des pions (uniquement des pions) sous forme de mur de protection. Ils sont jouables à partir du tour suivant. S'ils meurent à nouveau, ils ne peuvent pas être ramenés avec une autre compétence.",
  mirage:
    "Simule une pièce sur l'échiquier (pas le roi). Si elle meurt, elle disparaît. Elle ne peut ni engendrer de mat ni manger de pions, et elle empêche le déplacement si celui-ci n'est pas un déplacement du roi.",
  evolve: "Fait évoluer un pion comme s'il était passé sur une case d'évolution d'un terrain adverse. Utilisable sur toutes les pièces, sauf le roi.",
  switch_sides: "Fait changer de camp une pièce adverse sans portée ni ligne de vue. Impossible sur une pièce engendrant un mat.",
  mind_reading: "Donne le meilleur coup possible, trois fois dans la partie, quand le joueur le veut.",
  mind_control: "Prend le contrôle d'une pièce adverse pendant un tour complet, comme s'il s'agissait d'une de vos pièces. Ne fonctionne pas sur le roi ennemi.",
};

export const UNIQUE_NOTE =
  "Compétence unique : elle n'existe que dans un seul deck au monde et ne compte pas dans les trois compétences sélectionnées pour une partie. Beaucoup plus puissante qu'une compétence de base.";
export const CLASSIC_NOTE =
  "Compétence classique : elle compte parmi les trois compétences sélectionnées avant la partie, choisies dans votre deck de 7 au maximum.";

export type KindFilter = "all" | "unique" | "classic";
export type FamilyFilter = Family | "all";

export function filterCatalog(
  family: FamilyFilter,
  kind: KindFilter,
  catalog: readonly CatalogEntry[] = CATALOG,
): CatalogEntry[] {
  return catalog.filter(
    (c) => (family === "all" || c.family === family) && (kind === "all" || (kind === "unique" ? c.unique : !c.unique)),
  );
}
