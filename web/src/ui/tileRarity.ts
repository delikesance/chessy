import { skillEntry } from "../catalog";
import type { Rarity } from "../forged";

/** Cadre de médaillon d'une compétence : sa rareté si elle est forgée, doré si elle est unique, sinon commun. */
export function tileRarity(id: string): Rarity {
  const e = skillEntry(id);
  if (e.rarity) return e.rarity;
  return e.unique ? "legendary" : "common";
}
