import { useCallback, useEffect, useMemo, useState } from "react";
import {
  activateSkill,
  cancelSpawn,
  chooseSpawn,
  click,
  highlights,
  IDLE,
  type Highlights,
  type Interaction,
  type PendingPromotion,
  type PendingSpawn,
} from "../../interaction";
import type { Action, PieceKind, SkillId, SpawnKind, Square, StateView } from "../../protocol";

const NONE: Highlights = { selectable: [], selected: null, targets: [] };

/**
 * Clic-clic sur le plateau d'exploration, avec la même machine à états que la partie (`interaction.ts`).
 * `view.you` doit être le camp au trait ; `onAction` reçoit l'action choisie (coup ou compétence).
 * `resetKey` change à chaque nouvelle position : la sélection en cours est alors abandonnée.
 */
export function useBoardInteraction(view: StateView | null, onAction: (action: Action) => void, enabled: boolean, resetKey: string) {
  const [interaction, setInteraction] = useState<Interaction>(IDLE);
  const [promotion, setPromotion] = useState<PendingPromotion | null>(null);
  const [spawn, setSpawn] = useState<PendingSpawn | null>(null);

  useEffect(() => {
    setInteraction(IDLE);
    setPromotion(null);
    setSpawn(null);
  }, [resetKey]);

  const reset = useCallback(() => {
    setInteraction(IDLE);
    setPromotion(null);
    setSpawn(null);
  }, []);

  const onSquare = useCallback(
    (square: Square) => {
      if (!view || !enabled || promotion || spawn) return;
      const result = click(view, interaction, square);
      setInteraction(result.interaction);
      if (result.promotion) setPromotion(result.promotion);
      if (result.spawn) setSpawn(result.spawn);
      if (result.send) onAction(result.send);
    },
    [view, enabled, interaction, promotion, spawn, onAction],
  );

  const toggleSkill = useCallback(
    (skill: SkillId) => {
      if (!view || !enabled) return;
      const result = activateSkill(view, interaction, skill);
      setSpawn(null);
      setInteraction(result.interaction);
      if (result.send) onAction(result.send);
    },
    [view, enabled, interaction, onAction],
  );

  const pickPromotion = useCallback(
    (kind: PieceKind) => {
      if (!promotion) return;
      onAction({ type: "move", from: promotion.from, to: promotion.to, promo: kind });
      setPromotion(null);
    },
    [promotion, onAction],
  );

  const pickSpawn = useCallback(
    (kind: SpawnKind) => {
      if (!spawn) return;
      const result = chooseSpawn(spawn, kind);
      setSpawn(null);
      setInteraction(result.interaction);
      if (result.send) onAction(result.send);
    },
    [spawn, onAction],
  );

  const cancelSpawnPick = useCallback(() => {
    if (!spawn) return;
    setInteraction(cancelSpawn(spawn));
    setSpawn(null);
  }, [spawn]);

  const hl = useMemo(() => (view && enabled ? highlights(view, interaction) : NONE), [view, enabled, interaction]);

  return {
    highlights: hl,
    onSquare,
    toggleSkill,
    promotion,
    spawn,
    activeSkill: interaction.kind === "skill" ? interaction.skill : null,
    pickPromotion,
    pickSpawn,
    cancelPromotion: () => setPromotion(null),
    cancelSpawn: cancelSpawnPick,
    reset,
  };
}

export type BoardInteraction = ReturnType<typeof useBoardInteraction>;
