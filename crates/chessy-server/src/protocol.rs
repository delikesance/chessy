//! WebSocket messages, JSON-encoded as `{"type": "...", ...}`.
//! Squares are indices `0..64` with `a1 = 0` and `h8 = 63`.

use chessy_engine::{
    Action, ActiveEffect, Color, Event, Move, Outcome, Piece, SkillId, SkillSlot, SkillTarget,
};
use serde::{Deserialize, Serialize};

pub type PlayerId = String;

#[derive(Debug, Deserialize)]
#[serde(tag = "type", rename_all = "snake_case")]
pub enum ClientMsg {
    /// Must be the first message. Without a known token a new player is created.
    Hello {
        token: Option<String>,
    },
    QueueJoin,
    CreateRoom,
    JoinRoom {
        code: String,
    },
    LeaveLobby,
    /// Classic skills to bring (at most 3); unique skills in the deck come along for free.
    SelectDeck {
        skills: Vec<SkillId>,
    },
    Action {
        action: Action,
    },
    Resign,
    RewardChoice {
        choice: RewardChoice,
    },
}

/// What the winner takes. `replace` names the skill to drop when the deck is full.
#[derive(Debug, Deserialize)]
#[serde(tag = "kind", rename_all = "snake_case")]
pub enum RewardChoice {
    /// Take a specific skill from the loser's deck.
    Steal {
        skill: SkillId,
        replace: Option<SkillId>,
    },
    /// Roll a random skill from the global pool; the loser loses a random one.
    Random {
        replace: Option<SkillId>,
    },
    Skip,
}

#[derive(Clone, Debug, Serialize)]
#[serde(tag = "type", rename_all = "snake_case")]
pub enum LobbyStatus {
    Idle,
    Queued,
    RoomWaiting { code: String },
}

#[derive(Clone, Debug, Serialize)]
pub struct RewardOffer {
    pub deck: Vec<SkillId>,
    pub steal_options: Vec<SkillId>,
    pub deck_full: bool,
}

/// A skill and everywhere it can currently be aimed.
#[derive(Clone, Debug, Serialize)]
pub struct SkillOptions {
    pub skill: SkillId,
    pub targets: Vec<SkillTarget>,
}

#[derive(Clone, Debug, Serialize)]
pub struct OpponentSkills {
    pub total: usize,
    pub used: Vec<SkillId>,
}

#[derive(Clone, Debug, Serialize)]
pub struct StateView {
    pub game_id: String,
    pub you: Color,
    pub ply: u32,
    pub to_move: Color,
    pub in_check: bool,
    pub board: Vec<Option<Piece>>,
    /// Empty unless it is your turn.
    pub moves: Vec<Move>,
    pub skill_options: Vec<SkillOptions>,
    pub my_skills: Vec<SkillSlot>,
    pub opponent_skills: OpponentSkills,
    pub effects: Vec<ActiveEffect>,
    pub outcome: Outcome,
    /// What the last action did, for animation. Empty on resume.
    pub events: Vec<Event>,
    pub opponent_connected: bool,
}

#[derive(Clone, Debug, Serialize)]
#[serde(tag = "type", rename_all = "snake_case")]
pub enum ServerMsg {
    Welcome {
        player_id: PlayerId,
        token: String,
        deck: Vec<SkillId>,
        pending_reward: Option<RewardOffer>,
    },
    Lobby {
        status: LobbyStatus,
    },
    DeckSelect {
        game_id: String,
        you: Color,
        deck: Vec<SkillId>,
        max_picks: usize,
        seconds: u64,
        submitted: bool,
    },
    State(Box<StateView>),
    OpponentStatus {
        connected: bool,
    },
    GameOver {
        outcome: Outcome,
        reward: Option<RewardOffer>,
    },
    /// Your deck changed (reward applied, or you lost a skill).
    DeckUpdate {
        deck: Vec<SkillId>,
        gained: Option<SkillId>,
        lost: Option<SkillId>,
    },
    GameCancelled {
        reason: String,
    },
    Error {
        code: String,
        message: String,
    },
}

impl ServerMsg {
    pub fn error(code: &str, message: &str) -> Self {
        ServerMsg::Error {
            code: code.to_string(),
            message: message.to_string(),
        }
    }
}
