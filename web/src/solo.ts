// Logique pure du mode Solo (jouer contre l'IA) : niveaux d'Elo, paliers, réglage mémorisé.

import type { SoloColor } from "./protocol";

export const SOLO_MIN = 400;
export const SOLO_MAX = 2800;
export const SOLO_STEP = 50;
export const SOLO_KEY = "chessy.solo";

export interface SoloSetting {
  elo: number;
  color: SoloColor;
}

export const SOLO_DEFAULT: SoloSetting = { elo: 1200, color: "random" };

export interface SoloTier {
  name: string;
  /** Elo minimal du palier. */
  min: number;
  /** Comportement de l'IA à ce niveau. */
  blurb: string;
}

export const SOLO_TIERS: readonly SoloTier[] = [
  { name: "Débutant", min: SOLO_MIN, blurb: "Voit un coup à l'avance et se trompe souvent : idéal pour découvrir les compétences." },
  { name: "Amateur", min: 800, blurb: "Anticipe deux coups et laisse parfois une pièce en prise." },
  { name: "Club", min: 1200, blurb: "Joue solidement, rarement de grosses erreurs, utilise ses compétences à bon escient." },
  { name: "Expert", min: 1600, blurb: "Calcule quatre coups et punit presque toutes les imprécisions." },
  { name: "Maître", min: 2000, blurb: "Réfléchit plus longtemps, joue avec précision et exploite chaque compétence." },
  { name: "Grand Maître", min: 2400, blurb: "Le plus fort : calcul profond, évaluation complète, quasiment aucune erreur." },
];

/** Palier nommé d'un niveau (< 800 Débutant, < 1200 Amateur, < 1600 Club, < 2000 Expert, < 2400 Maître, sinon Grand Maître). */
export function soloTier(elo: number): SoloTier {
  let tier = SOLO_TIERS[0];
  for (const t of SOLO_TIERS) if (elo >= t.min) tier = t;
  return tier;
}

/** Ramène une valeur dans [400, 2800] sur la grille de 50. Non numérique : niveau par défaut. */
export function clampElo(value: number): number {
  if (!Number.isFinite(value)) return SOLO_DEFAULT.elo;
  const snapped = Math.round(value / SOLO_STEP) * SOLO_STEP;
  return Math.min(SOLO_MAX, Math.max(SOLO_MIN, snapped));
}

export function isSoloColor(value: unknown): value is SoloColor {
  return value === "white" || value === "black" || value === "random";
}

type KeyValueStore = Pick<Storage, "getItem" | "setItem">;

function defaultStorage(): KeyValueStore | null {
  try {
    return typeof localStorage === "undefined" ? null : localStorage;
  } catch {
    return null;
  }
}

/** Dernier réglage mémorisé (valeurs corrigées), sinon le réglage par défaut. */
export function readSolo(storage: KeyValueStore | null = defaultStorage()): SoloSetting {
  try {
    const raw = storage?.getItem(SOLO_KEY);
    if (!raw) return SOLO_DEFAULT;
    const data = JSON.parse(raw) as Partial<SoloSetting> | null;
    return {
      elo: typeof data?.elo === "number" ? clampElo(data.elo) : SOLO_DEFAULT.elo,
      color: isSoloColor(data?.color) ? data.color : SOLO_DEFAULT.color,
    };
  } catch {
    return SOLO_DEFAULT;
  }
}

export function writeSolo(setting: SoloSetting, storage: KeyValueStore | null = defaultStorage()) {
  try {
    storage?.setItem(SOLO_KEY, JSON.stringify(setting));
  } catch {
    // Stockage indisponible (navigation privée) : le réglage ne sera pas retenu.
  }
}
