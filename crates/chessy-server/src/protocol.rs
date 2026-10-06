//! WebSocket messages, JSON-encoded as `{"type": "...", ...}`.
//! Squares are indices `0..64` with `a1 = 0` and `h8 = 63`.

use chessy_engine::{
    Action, ActiveEffect, Color, Event, Move, Outcome, Piece, SkillId, SkillTarget, Square,
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
    /// `ranked` defaults to true for accounts and is forced to false for guests.
    QueueJoin {
        #[serde(default)]
        ranked: Option<bool>,
    },
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
    OfferDraw,
    RespondDraw {
        accept: bool,
    },
    Chat {
        text: String,
    },
    RematchRequest,
    RematchRespond {
        accept: bool,
    },
    // Social messages: accounts only.
    FriendRequest {
        username: String,
    },
    FriendRespond {
        username: String,
        accept: bool,
    },
    FriendRemove {
        username: String,
    },
    FriendsList,
    UserSearch {
        query: String,
    },
    Challenge {
        username: String,
    },
    ChallengeRespond {
        username: String,
        accept: bool,
    },
    ChallengeCancel,
    /// Starts a friendly game against the bot. `elo` is 400..=2800.
    SoloStart {
        elo: i64,
        #[serde(default)]
        color: SoloColor,
    },
}

/// Which side the human takes in a solo game.
#[derive(Clone, Copy, Debug, Default, Deserialize, PartialEq, Eq)]
#[serde(rename_all = "snake_case")]
pub enum SoloColor {
    White,
    Black,
    #[default]
    Random,
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
    Queued { ranked: bool },
    RoomWaiting { code: String },
}

/// The signed-in player (`GET /api/me`, `welcome.account`).
#[derive(Clone, Debug, Serialize, PartialEq, Eq)]
pub struct Me {
    pub player_id: PlayerId,
    pub username: Option<String>,
    pub guest: bool,
    pub elo: i32,
    /// Rank among registered accounts; `None` for guests.
    pub rank: Option<u32>,
    pub games: u32,
    pub wins: u32,
    pub draws: u32,
    pub losses: u32,
}

#[derive(Clone, Debug, Serialize, PartialEq, Eq)]
pub struct OpponentInfo {
    pub username: Option<String>,
    pub elo: Option<i32>,
    pub guest: bool,
    /// The opponent is the Solo bot. Omitted (false) for people.
    #[serde(skip_serializing_if = "std::ops::Not::not")]
    pub bot: bool,
}

#[derive(Clone, Copy, Debug, Serialize)]
pub struct ClockView {
    pub white_ms: u64,
    pub black_ms: u64,
    pub running: Option<Color>,
}

#[derive(Clone, Copy, Debug, Serialize, PartialEq, Eq)]
#[serde(rename_all = "snake_case")]
pub enum DrawOffer {
    None,
    You,
    Them,
}

#[derive(Clone, Copy, Debug, Serialize, PartialEq, Eq)]
pub struct EloView {
    pub you_before: i32,
    pub you_after: i32,
    pub opp_before: i32,
    pub opp_after: i32,
}

#[derive(Clone, Copy, Debug, Serialize, PartialEq, Eq)]
#[serde(rename_all = "snake_case")]
pub enum Presence {
    Online,
    InGame,
    Offline,
}

#[derive(Clone, Debug, Serialize)]
pub struct FriendInfo {
    pub username: String,
    pub elo: i32,
    pub presence: Presence,
    pub last_seen: Option<String>,
}

#[derive(Clone, Debug, Serialize)]
pub struct UserRef {
    pub username: String,
    pub elo: i32,
}

#[derive(Clone, Debug, Serialize)]
pub struct NameRef {
    pub username: String,
}

#[derive(Clone, Copy, Debug, Serialize, PartialEq, Eq)]
#[serde(rename_all = "snake_case")]
pub enum Relation {
    None,
    Friend,
    Incoming,
    Outgoing,
    #[serde(rename = "self")]
    SelfUser,
}

#[derive(Clone, Debug, Serialize)]
pub struct SearchResult {
    pub username: String,
    pub elo: i32,
    pub relation: Relation,
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

/// One of your skills with how often it has been used.
#[derive(Clone, Debug, Serialize, PartialEq, Eq)]
pub struct SkillSlotView {
    pub skill: SkillId,
    /// True once `uses` reached `max_uses`.
    pub used: bool,
    pub uses: u8,
    pub max_uses: u8,
}

/// Geomancy terrain: `owner`'s pieces cross it freely, the others cannot.
#[derive(Clone, Copy, Debug, Serialize, PartialEq, Eq)]
pub struct TerrainView {
    pub square: Square,
    pub owner: Color,
    pub expires_at: u32,
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
    pub my_skills: Vec<SkillSlotView>,
    pub opponent_skills: OpponentSkills,
    /// Effects on pieces (terrain is in `terrain`); effects on pieces hidden
    /// from you are left out.
    pub effects: Vec<ActiveEffect>,
    /// Your own traps (the opponent's are secret).
    pub traps: Vec<Square>,
    /// Your own pieces currently on the bench.
    pub benched: Vec<Piece>,
    pub terrain: Vec<TerrainView>,
    pub outcome: Outcome,
    /// What the last action did, for animation. Empty on resume.
    pub events: Vec<Event>,
    pub opponent_connected: bool,
    pub clock: ClockView,
    /// False when the game has no clock (Solo): `clock.running` is then null.
    pub clock_enabled: bool,
    pub rated: bool,
    pub opponent: OpponentInfo,
    pub draw_offer: DrawOffer,
    pub ply_count: u32,
}

#[derive(Clone, Debug, Serialize)]
#[serde(tag = "type", rename_all = "snake_case")]
pub enum ServerMsg {
    Welcome {
        player_id: PlayerId,
        token: String,
        deck: Vec<SkillId>,
        pending_reward: Option<RewardOffer>,
        account: Me,
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
        opponent: OpponentInfo,
        rated: bool,
    },
    State(Box<StateView>),
    OpponentStatus {
        connected: bool,
    },
    GameOver {
        outcome: Outcome,
        reward: Option<RewardOffer>,
        rated: bool,
        elo: Option<EloView>,
        reason: String,
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
    Friends {
        friends: Vec<FriendInfo>,
        incoming: Vec<UserRef>,
        outgoing: Vec<NameRef>,
    },
    UserResults {
        query: String,
        users: Vec<SearchResult>,
    },
    /// A short event for a toast; `username` names the other party when relevant.
    Notice {
        code: String,
        #[serde(skip_serializing_if = "Option::is_none")]
        username: Option<String>,
    },
    ChallengeReceived {
        from: UserRef,
    },
    ChallengeSent {
        username: String,
    },
    DrawOffered {},
    DrawDeclined {},
    Chat {
        text: String,
        mine: bool,
    },
    RematchOffered {},
    RematchDeclined {},
}

impl ServerMsg {
    pub fn notice(code: &str, username: Option<&str>) -> Self {
        ServerMsg::Notice {
            code: code.to_string(),
            // Often an echo of what the client typed: keep it short.
            username: username.map(|u| u.chars().take(32).collect()),
        }
    }

    pub fn error(code: &str, message: &str) -> Self {
        ServerMsg::Error {
            code: code.to_string(),
            message: message.to_string(),
        }
    }
}
