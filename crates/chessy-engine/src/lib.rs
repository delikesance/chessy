//! Chessy rules engine: standard chess plus a skill/effect system.
//!
//! The engine is pure (no I/O). [`Position`] holds the board state and knows
//! the chess rules; [`Game`] adds skill loadouts, outcome detection and
//! repetition tracking on top.

pub mod ai;
pub mod game;
pub mod position;
pub mod search;
pub mod skills;
pub mod types;

pub use game::{Game, Loadout, SkillSlot};
pub use position::{Position, Snapshot, START_FEN};
pub use skills::{skill, Skill, SkillId, SkillKind, SkillTarget};
pub use types::*;
