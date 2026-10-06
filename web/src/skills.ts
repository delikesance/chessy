import { skillEntry, type Family } from "./catalog";
import type { SkillId } from "./protocol";

export interface SkillInfo {
  name: string;
  unique: boolean;
  description: string;
  family: Family;
  implemented: boolean;
}

/** Fiche d'une compétence (tolère les identifiants inconnus du client). */
export function skillInfo(id: string): SkillInfo {
  const { name, unique, description, family, implemented } = skillEntry(id);
  return { name, unique, description, family, implemented };
}

export const SKILLS: Record<SkillId, SkillInfo> = new Proxy({} as Record<SkillId, SkillInfo>, {
  get: (_t, id) => (typeof id === "string" ? skillInfo(id) : undefined),
});

export function skillName(id: string): string {
  return skillEntry(id).name;
}
