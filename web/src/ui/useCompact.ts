import { useSyncExternalStore } from "react";

/**
 * Mise en page « compacte » de l'écran de partie : téléphone en portrait, ou fenêtre très basse (téléphone en paysage).
 * Doit rester identique aux media queries de `screens/game.css`.
 */
export const COMPACT_QUERY = "(max-width: 820px), (orientation: landscape) and (max-height: 520px)";

function subscribe(onChange: () => void): () => void {
  if (typeof window === "undefined" || !window.matchMedia) return () => {};
  const mq = window.matchMedia(COMPACT_QUERY);
  mq.addEventListener("change", onChange);
  return () => mq.removeEventListener("change", onChange);
}

function snapshot(): boolean {
  return typeof window !== "undefined" && !!window.matchMedia && window.matchMedia(COMPACT_QUERY).matches;
}

/** Vrai en mise en page compacte ; suit les changements (rotation, redimensionnement). */
export function useCompact(): boolean {
  return useSyncExternalStore(subscribe, snapshot, () => false);
}
