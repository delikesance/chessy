// « Mastering » : gain propre à chaque son, appliqué par-dessus sa recette.
// Calculé hors ligne (rendu complet de la chaîne avec les réglages par défaut : volume général 0,5, effets 1) pour que
// la hiérarchie soit nette et que rien ne soit agressif. Crêtes visées (pleine échelle = 1) :
//   interface (clics, chat, notifications)     0,04 - 0,08
//   coups, roque                               0,18 - 0,22
//   prises, échecs, pièges, boucliers          0,18 - 0,27
//   début/fin de partie                        0,20 - 0,32
//   compétences                                0,27 maximum et RMS (100 ms) <= 0,07, un peu plus présentes qu'un coup
// Aucun son ne dépasse un RMS (100 ms) de 0,10. Un test (sound.test.ts) vérifie ces plafonds sur le rendu hors ligne ;
// si une recette change, recalculer le gain correspondant.
import type { SfxName } from "./names";

export const LEVELS: Record<SfxName, number> = {
  move: 0.45,
  capture: 0.49,
  check: 1.34,
  castle: 0.59,
  promote: 1.65,
  illegal: 0.58,
  your_turn: 1.75,
  game_start: 1.02,
  game_win: 0.79,
  game_lose: 1.09,
  game_draw: 1.01,
  low_time: 0.43,
  match_found: 1.65,
  chat: 0.54,
  friend_request: 1.22,
  challenge: 0.89,
  notice: 0.66,
  ui_click: 0.41,
  trap_sprung: 0.53,
  shield: 0.76,
  pushed: 0.57,
  saved: 1.18,
  vanish: 1.61,
  skill_teleportation: 0.86,
  skill_imune: 0.9,
  skill_freeze: 2.15,
  skill_rollback: 1.17,
  skill_clone: 1.73,
  skill_destiny_swapper: 2.13,
  skill_remover: 0.73,
  skill_wall: 0.59,
  skill_mirage: 1.6,
  skill_evolve: 1.48,
  skill_switch: 1.95,
  skill_mind: 1.4,
  skill_control: 0.88,
  skill_morph: 2.97,
  skill_canceller: 0.96,
  skill_tornado: 1.48,
  skill_invisibility: 2.87,
  skill_terminator: 0.82,
  skill_trap: 0.62,
  skill_bench: 1.31,
  skill_forcefield: 0.96,
  skill_transposition: 2.33,
  skill_queensac: 0.64,
  skill_temporal: 0.95,
  skill_geomancy: 0.74,
  skill_celestial: 2.45,
  skill_godhelp: 0.42,
};

export const levelOf = (name: SfxName): number => LEVELS[name] ?? 1;
