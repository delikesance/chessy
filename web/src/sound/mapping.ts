// Association événements d'une action -> sons. Fonctions pures, sans Web Audio.
import type { Color, GameEvent } from "../protocol";
import { skillSfx, type SfxName } from "./names";

export interface EventCtx {
  me: Color;
  actor?: Color;
  /** Le camp au trait est en échec après l'action (les événements ne le disent pas). */
  check?: boolean;
}

/**
 * Sons d'une action, dans l'ordre. Règles :
 * - une compétence joue son propre son (les coups internes à la compétence ne jouent pas `move`) ;
 * - sinon : roque > capture > coup simple ; la promotion s'ajoute (`capture` + `promote` se cumulent) ;
 * - pièges, repoussé, sauvé, disparition s'ajoutent ; `check` ferme la liste ; pas de doublons.
 */
export function mapEventsToSfx(events: GameEvent[], ctx: EventCtx): SfxName[] {
  const out: SfxName[] = [];
  const add = (n: SfxName) => {
    if (!out.includes(n)) out.push(n);
  };
  const skill = events.find((e): e is Extract<GameEvent, { type: "skill_used" }> => e.type === "skill_used");
  const has = (t: GameEvent["type"]) => events.some((e) => e.type === t);

  if (skill) {
    add(skillSfx(skill.skill));
    if (has("captured")) add("capture");
  } else if (has("castled")) {
    add("castle");
  } else if (has("captured")) {
    add("capture");
  } else if (has("moved")) {
    // Une promotion sans capture remplace le simple « tock » par l'arpège.
    if (!has("promoted")) add("move");
  }
  if (has("promoted")) add("promote");
  if (has("trap_sprung")) add("trap_sprung");
  if (has("pushed")) add("pushed");
  if (has("saved")) add("saved");
  if (has("vanished")) add("vanish");
  // Bouclier apparu sans lancement de compétence visible (déclenchement d'effet).
  if (!skill && events.some((e) => e.type === "effect_added" && (e.effect === "immune" || e.effect === "forcefield" || e.effect === "celestial"))) {
    add("shield");
  }
  if (ctx.check) add("check");
  return out;
}

export interface Planned {
  name: SfxName;
  /** Secondes après l'appel. */
  delay: number;
  volume: number;
}

/** Les sons de pose tombent quand la pièce arrive (~40 % du glissement) ; les conséquences s'enchaînent. */
const LAND_DELAY: Partial<Record<SfxName, number>> = { move: 0.12, capture: 0.14, castle: 0.12, promote: 0.2 };

export function planSfx(names: SfxName[], ctx: EventCtx): Planned[] {
  const volume = ctx.actor !== undefined && ctx.actor !== ctx.me ? 0.88 : 1;
  let at = 0;
  return names.slice(0, 4).map((name, i) => {
    const base = LAND_DELAY[name] ?? 0;
    const delay = i === 0 ? base : Math.max(at + 0.17, base);
    at = delay;
    return { name, delay, volume };
  });
}
