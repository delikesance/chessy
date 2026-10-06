// Contrat sonore (voir docs/spec-v4.md §4). Ce fichier est un STUB sans effet :
// l'implémentation (Web Audio synthétisé) remplace ce fichier en gardant ces exports.
import type { Color, GameEvent, SkillId } from "../protocol";

export type SfxName =
  | "move"
  | "capture"
  | "check"
  | "castle"
  | "promote"
  | "illegal"
  | "your_turn"
  | "game_start"
  | "game_win"
  | "game_lose"
  | "game_draw"
  | "low_time"
  | "match_found"
  | "chat"
  | "friend_request"
  | "challenge"
  | "notice"
  | "ui_click"
  | "trap_sprung"
  | "shield"
  | "pushed"
  | "saved"
  | "vanish"
  | `skill_${SkillId}`;

export interface SoundSettings {
  enabled: boolean;
  master: number;
  effects: number;
  ui: boolean;
  yourTurn: boolean;
}

export interface Sfx {
  play(name: SfxName, opts?: { volume?: number }): void;
  /** Joue les sons d'une action à partir de ses événements. `me` = camp du client, `actor` = camp qui a agi. */
  playEvents(events: GameEvent[], ctx: { me: Color; actor?: Color }): void;
  getSettings(): SoundSettings;
  setSettings(patch: Partial<SoundSettings>): void;
  subscribe(fn: () => void): () => void;
}

const DEFAULTS: SoundSettings = { enabled: true, master: 0.7, effects: 1, ui: true, yourTurn: true };

export const sfx: Sfx = {
  play() {},
  playEvents() {},
  getSettings: () => DEFAULTS,
  setSettings() {},
  subscribe: () => () => {},
};
