//! The Solo bot, server side: its identity, deck, thinking jobs and draw policy.
//!
//! The decision itself is `chessy_engine::ai::choose_action`; this module only
//! prepares what it needs (a snapshot of the game, a seed, a deadline) so the
//! search can run off the hub lock, in `spawn_blocking`.

use std::time::{Duration, Instant};

use chessy_engine::ai::{self, Strength, MAX_ELO, MIN_ELO};
use chessy_engine::search::{self, Limits};
use chessy_engine::{Action, Color, Game, Position, SkillId, SkillKind};
use rand::seq::SliceRandom;

use crate::protocol::{OpponentInfo, PlayerId};

/// The name the bot shows.
pub const BOT_NAME: &str = "Sage";
/// Player ids of bots start with this; real players never have such an id.
pub const BOT_ID_PREFIX: &str = "bot:";
/// Classic skills the bot brings.
pub const BOT_PICKS: usize = 3;
/// The bot only accepts a draw once this many actions have been played...
pub const DRAW_MIN_PLIES: u32 = 40;
/// ...and when its evaluation is within this many centipawns of equal.
pub const DRAW_WINDOW: i32 = 30;

pub fn is_valid_elo(elo: i64) -> bool {
    (i64::from(MIN_ELO)..=i64::from(MAX_ELO)).contains(&elo)
}

/// The id standing for the bot in a session's player list.
pub fn bot_id(game_id: &str) -> PlayerId {
    format!("{BOT_ID_PREFIX}{game_id}")
}

pub fn is_bot_id(id: &str) -> bool {
    id.starts_with(BOT_ID_PREFIX)
}

/// What the human sees of the bot.
pub fn info(elo: i32) -> OpponentInfo {
    OpponentInfo {
        username: Some(BOT_NAME.to_string()),
        elo: Some(elo),
        guest: true,
        bot: true,
    }
}

/// Three distinct classic skills picked at random (never a unique one).
pub fn pick_deck() -> Vec<SkillId> {
    let mut classic: Vec<SkillId> = SkillId::ALL
        .into_iter()
        .filter(|s| s.kind() == SkillKind::Classic)
        .collect();
    classic.shuffle(&mut rand::rng());
    classic.truncate(BOT_PICKS);
    classic
}

/// A seed that depends on the game and the ply only, so the same position in
/// the same game always gets the same answer.
pub fn seed_for(game_id: &str, ply: u32) -> u64 {
    // FNV-1a over the id, then mix in the ply.
    let mut h: u64 = 0xcbf2_9ce4_8422_2325;
    for b in game_id.bytes() {
        h ^= u64::from(b);
        h = h.wrapping_mul(0x0100_0000_01b3);
    }
    h ^ u64::from(ply).wrapping_mul(0x9E37_79B9_7F4A_7C15)
}

/// Everything the search needs, detached from the hub.
pub struct BotJob {
    pub game: Game,
    pub strength: Strength,
    pub seed: u64,
    /// Wall-clock cap for the whole decision.
    pub max_think: Duration,
}

/// Runs the AI. Blocking: call from `spawn_blocking`.
pub fn think(job: &BotJob) -> Option<Action> {
    let deadline = Instant::now() + job.max_think;
    ai::choose_action_with(&job.game, &job.strength, job.seed, &|| {
        Instant::now() >= deadline
    })
}

/// Whether the bot (playing `bot`) accepts a draw in `pos`: at least
/// `min_plies` actions in, and an evaluation within `window` centipawns of equal.
pub fn accepts_draw(pos: &Position, bot: Color, min_plies: u32, window: i32) -> bool {
    if pos.ply < min_plies {
        return false;
    }
    let result = search::search(pos, &Limits::depth(2));
    let Some((_, score)) = result.best() else {
        return false;
    };
    // Scores are from the side to move's point of view.
    let bot_score = if pos.side == bot { score } else { -score };
    (-window..=window).contains(&bot_score)
}
