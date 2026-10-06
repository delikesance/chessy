import type { SkillId } from "./protocol";

export interface SkillInfo {
  name: string;
  unique: boolean;
  description: string;
}

// Descriptions follow docs/skills.md.
export const SKILLS: Record<SkillId, SkillInfo> = {
  teleportation: {
    name: "Teleportation",
    unique: false,
    description: "Déplace une de vos pièces vers n'importe quelle case vide, sans tenir compte des obstacles.",
  },
  imune: {
    name: "Imune",
    unique: false,
    description: "Rend une de vos pièces (pas le roi) invulnérable pendant le prochain tour adverse.",
  },
  freeze: {
    name: "Freeze",
    unique: false,
    description: "Empêche une pièce ennemie (pas le roi) de se déplacer pendant deux de ses tours.",
  },
  rollback: {
    name: "Rollback",
    unique: false,
    description: "Ramène une de vos pièces (pas le roi) sur la case d'où elle vient, si elle est libre.",
  },
  clone: {
    name: "Clone",
    unique: false,
    description: "Copie une de vos pièces (pas le roi) sur une case vide adjacente.",
  },
  destiny_swapper: {
    name: "Destiny Swapper",
    unique: false,
    description: "Échange les positions de deux de vos pièces.",
  },
  remover: {
    name: "Remover",
    unique: true,
    description: "Retire un pion adverse de l'échiquier, sauf si cela provoque un mat.",
  },
};

export function skillName(id: SkillId): string {
  return SKILLS[id]?.name ?? id;
}
