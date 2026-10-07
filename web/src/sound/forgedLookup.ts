// Retrouve la recette d'un son `skill_forged_<n>` à partir de la définition reçue du serveur.
import { forgedDef } from "../forged";
import { composeRecipe, forgedLevel } from "./forgedRecipe";
import type { SkillRecipe } from "./skillRecipes";

const PREFIX = "skill_";
const cache = new Map<string, SkillRecipe>();

/** `undefined` tant que la définition n'est pas arrivée (le son sera joué la prochaine fois). */
export function forgedRecipeFor(name: string): SkillRecipe | undefined {
  if (!name.startsWith(`${PREFIX}forged_`)) return undefined;
  const cached = cache.get(name);
  if (cached) return cached;
  const def = forgedDef(name.slice(PREFIX.length));
  if (!def) return undefined;
  const recipe = composeRecipe(def.sound);
  cache.set(name, recipe);
  return recipe;
}

/** Le gain d'un son forgé, ou `undefined` si ce n'en est pas un (ou si sa définition manque encore). */
export function forgedLevelFor(name: string): number | undefined {
  if (!name.startsWith(`${PREFIX}forged_`)) return undefined;
  const def = forgedDef(name.slice(PREFIX.length));
  return def ? forgedLevel(def.sound.effect) : undefined;
}
