// Clics d'interface discrets sur les boutons principaux (délégation d'événement unique, au niveau du document).
import { sfx } from "./index";

const PRIMARY = 'button.btn, a.btn, .nav-tab, .seg > button, .nav-chip, [data-sfx="click"]';
const SILENT = '[data-sfx="off"], .gm-veil, .gm-board';

interface Closest {
  closest(selector: string): Closest | null;
  matches?(selector: string): boolean;
  hasAttribute?(name: string): boolean;
}

/** Ce clic mérite-t-il le petit son d'interface ? (pur sur un élément duck-typé, testable sans DOM) */
export function shouldClickSound(target: unknown): boolean {
  const el = target as Closest | null;
  if (!el || typeof el.closest !== "function") return false;
  const hit = el.closest(PRIMARY);
  if (!hit) return false;
  if (hit.closest(SILENT)) return false;
  if (hit.hasAttribute?.("disabled") || hit.hasAttribute?.("aria-disabled")) return false;
  return true;
}

/** Installe l'écouteur ; renvoie la fonction de retrait. */
export function installUiClicks(doc: Pick<Document, "addEventListener" | "removeEventListener"> = document): () => void {
  const onClick = (e: Event) => {
    if (shouldClickSound(e.target)) sfx.play("ui_click");
  };
  doc.addEventListener("click", onClick, true);
  return () => doc.removeEventListener("click", onClick, true);
}
