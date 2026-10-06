// Mirrors crates/chessy-server/src/protocol.rs and the engine's serialized types.
// Squares are indices 0..63 with a1 = 0 and h8 = 63 (rank * 8 + file).

export type Square = number;
export type Color = "white" | "black";
export type PieceKind = "pawn" | "knight" | "bishop" | "rook" | "queen" | "king";

export type SkillId =
  | "teleportation"
  | "imune"
  | "freeze"
  | "rollback"
  | "clone"
  | "destiny_swapper"
  | "remover";

export interface Piece {
  id: number;
  kind: PieceKind;
  color: Color;
}

export interface Move {
  from: Square;
  to: Square;
  promo?: PieceKind;
}

export type SkillTarget =
  | { kind: "none" }
  | { kind: "piece"; square: Square }
  | { kind: "piece_to"; from: Square; to: Square }
  | { kind: "pair"; a: Square; b: Square };

export type Action =
  | { type: "move"; from: Square; to: Square; promo?: PieceKind }
  | { type: "skill"; skill: SkillId; target: SkillTarget };

export type EffectKind = "immune" | "frozen";

export interface ActiveEffect {
  kind: EffectKind;
  piece: number;
  expires_at: number;
}

export type GameEvent =
  | { type: "moved"; from: Square; to: Square; piece: number }
  | { type: "captured"; square: Square; piece: Piece }
  | { type: "promoted"; square: Square; to: PieceKind }
  | { type: "castled"; rook_from: Square; rook_to: Square }
  | { type: "skill_used"; color: Color; skill: SkillId; target: SkillTarget }
  | { type: "teleported"; from: Square; to: Square }
  | { type: "cloned"; from: Square; to: Square; piece: Piece }
  | { type: "swapped"; a: Square; b: Square }
  | { type: "removed"; square: Square; piece: Piece }
  | { type: "rolled_back"; from: Square; to: Square }
  | { type: "effect_added"; piece: number; effect: EffectKind; expires_at: number };

export type Outcome =
  | { type: "ongoing" }
  | { type: "checkmate"; winner: Color }
  | { type: "resignation"; winner: Color }
  | { type: "stalemate" }
  | { type: "fifty_moves" }
  | { type: "repetition" }
  | { type: "insufficient_material" };

export interface SkillSlot {
  skill: SkillId;
  used: boolean;
}

export interface SkillOptions {
  skill: SkillId;
  targets: SkillTarget[];
}

export interface StateView {
  game_id: string;
  you: Color;
  ply: number;
  to_move: Color;
  in_check: boolean;
  board: (Piece | null)[];
  moves: Move[];
  skill_options: SkillOptions[];
  my_skills: SkillSlot[];
  opponent_skills: { total: number; used: SkillId[] };
  effects: ActiveEffect[];
  outcome: Outcome;
  events: GameEvent[];
  opponent_connected: boolean;
}

export interface RewardOffer {
  deck: SkillId[];
  steal_options: SkillId[];
  deck_full: boolean;
}

export type LobbyStatus =
  | { type: "idle" }
  | { type: "queued" }
  | { type: "room_waiting"; code: string };

export interface DeckSelectInfo {
  game_id: string;
  you: Color;
  deck: SkillId[];
  max_picks: number;
  seconds: number;
  submitted: boolean;
}

export type ServerMsg =
  | { type: "welcome"; player_id: string; token: string; deck: SkillId[]; pending_reward: RewardOffer | null }
  | { type: "lobby"; status: LobbyStatus }
  | ({ type: "deck_select" } & DeckSelectInfo)
  | ({ type: "state" } & StateView)
  | { type: "opponent_status"; connected: boolean }
  | { type: "game_over"; outcome: Outcome; reward: RewardOffer | null }
  | { type: "deck_update"; deck: SkillId[]; gained: SkillId | null; lost: SkillId | null }
  | { type: "game_cancelled"; reason: string }
  | { type: "error"; code: string; message: string };

export type RewardChoice =
  | { kind: "steal"; skill: SkillId; replace?: SkillId }
  | { kind: "random"; replace?: SkillId }
  | { kind: "skip" };

export type ClientMsg =
  | { type: "hello"; token?: string }
  | { type: "queue_join" }
  | { type: "create_room" }
  | { type: "join_room"; code: string }
  | { type: "leave_lobby" }
  | { type: "select_deck"; skills: SkillId[] }
  | { type: "action"; action: Action }
  | { type: "resign" }
  | { type: "reward_choice"; choice: RewardChoice };
