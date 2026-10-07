import type { CSSProperties } from "react";
import { RARITY_LABEL, type Rarity } from "../forged";

/** Étiquette de rareté d'une compétence forgée. */
export function RarityTag({ rarity }: { rarity: Rarity }) {
  return (
    <span className="tag rar-tag" style={{ "--rar": `var(--rar-${rarity})` } as CSSProperties}>
      {RARITY_LABEL[rarity]}
    </span>
  );
}
