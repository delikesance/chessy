//! Measuring what a skill does to real positions.
//!
//! The skill is tried on a fixed set of positions (random games from the
//! start, always the same ones): for each, every target it can legally hit
//! (sampled when there are many) is played and the resulting position is
//! searched two plies deep. What counts is the **best** target, because that
//! is the one a player would pick. Everything is deterministic, so a skill
//! always measures the same.

use std::sync::OnceLock;

use super::composite::Composite;
use super::def::SkillDef;
use crate::ai::Rng;
use crate::analysis::{self, EVAL_CAP};
use crate::position::Position;
use crate::skills::{Skill, SkillId, SkillTarget};
use crate::types::Color;

/// Positions in the fixed sample.
pub const SAMPLE_SIZE: usize = 48;
/// Targets tried per position, at most.
const MAX_TARGETS: usize = 8;
/// Search depth of every evaluation, in plies.
const DEPTH: u32 = 2;
/// A swing this big (centipawns) usually decides a game.
const GAME_CHANGING: i32 = 250;

#[derive(Clone, Copy, Debug, PartialEq, Serialize, Deserialize)]
pub struct Measurement {
    /// Positions the skill was tried on.
    pub positions: u32,
    /// Share of them where it had at least one legal target.
    pub availability: f64,
    /// Mean swing of the best target, in centipawns (never negative).
    pub mean_swing: f64,
    /// Share of the positions where it was usable and its best target changes the game.
    pub flip_rate: f64,
    /// Mean change in the number of moves available to the player to move
    /// next, at the best target.
    pub mobility_shift: f64,
}

use serde::{Deserialize, Serialize};

fn sample() -> &'static [Position] {
    static SAMPLE: OnceLock<Vec<Position>> = OnceLock::new();
    SAMPLE.get_or_init(|| {
        (0..SAMPLE_SIZE as u64)
            .map(|k| {
                let mut rng = Rng::new(0xF026_E000 + k);
                let mut pos = Position::startpos();
                // Long enough for pieces to have been lost, short enough to
                // still be a middlegame.
                for _ in 0..(10 + rng.below(50)) {
                    let moves = pos.legal_moves();
                    if moves.is_empty() {
                        break;
                    }
                    let mv = moves[rng.below(moves.len() as u64) as usize];
                    pos.make_move(mv, &mut Vec::new());
                }
                pos
            })
            .collect()
    })
}

/// The legal targets of `skill` in `pos`, thinned out to at most
/// [`MAX_TARGETS`], each with the position it leads to.
fn legal_targets(skill: &dyn Skill, pos: &Position) -> Vec<Position> {
    let targets = skill.targets(pos, pos.side);
    if targets.is_empty() {
        return Vec::new();
    }
    let step = (targets.len() / (MAX_TARGETS * 4)).max(1);
    targets
        .into_iter()
        .step_by(step)
        .filter_map(|t: SkillTarget| pos.simulate_with(skill, t, false).map(|(next, _)| next))
        .take(MAX_TARGETS)
        .collect()
}

fn moves_for(pos: &Position, color: Color) -> i32 {
    let mut probe = pos.clone();
    probe.side = color;
    probe.legal_moves().len() as i32
}

/// Measures `def` on the first `positions` positions of the sample.
pub fn measure(def: &SkillDef, positions: usize) -> Measurement {
    let skill = Composite {
        id: SkillId::Forged(u32::MAX),
        def: def.clone(),
        name: "",
    };
    measure_skill(&skill, positions)
}

/// Measures any skill, hand-written ones included (this is how the 27 are
/// compared with the forged ones). A skill that only reports something
/// measures as nothing.
pub fn measure_skill(skill: &dyn Skill, positions: usize) -> Measurement {
    let sample = &sample()[..positions.min(SAMPLE_SIZE)];
    let (mut usable, mut flips) = (0u32, 0u32);
    let (mut swing_sum, mut mobility_sum) = (0.0, 0.0);
    for pos in sample {
        let nexts = if skill.informational() {
            Vec::new()
        } else {
            legal_targets(skill, pos)
        };
        if nexts.is_empty() {
            continue;
        }
        usable += 1;
        let caster = pos.side;
        let before = analysis::search_position(pos, DEPTH, &|| false).score;
        let best = nexts
            .iter()
            .map(|next| {
                let after = analysis::value_after(next, caster, DEPTH, &|| false);
                let swing = analysis::cap(after) - analysis::cap(before);
                let mobility = moves_for(next, next.side) - moves_for(pos, next.side);
                (swing, mobility)
            })
            .max_by_key(|&(swing, _)| swing)
            .expect("at least one target");
        let swing = best.0.clamp(-EVAL_CAP, EVAL_CAP);
        swing_sum += f64::from(swing.max(0));
        mobility_sum += f64::from(best.1);
        if swing >= GAME_CHANGING {
            flips += 1;
        }
    }
    let n = sample.len().max(1) as f64;
    let u = f64::from(usable.max(1));
    Measurement {
        positions: sample.len() as u32,
        availability: f64::from(usable) / n,
        mean_swing: swing_sum / u,
        flip_rate: f64::from(flips) / u,
        mobility_shift: mobility_sum / u,
    }
}

impl SkillDef {
    /// Whether what the skill does cannot be taken back.
    pub fn irreversible(&self) -> bool {
        use super::def::Effect::*;
        matches!(
            self.effect,
            Promote | Remove { .. } | Convert | Duplicate | Revive { .. } | Mirror
        )
    }
}

impl Measurement {
    /// How much the skill changes the nature of a game, 0 to 100: the size
    /// and frequency of the swings it causes, how much it changes what the
    /// opponent can do, and whether it can be undone.
    pub fn tone_index(&self, irreversible: bool) -> f64 {
        let swing = (self.mean_swing / 500.0).min(1.0);
        let mobility = (self.mobility_shift.abs() / 15.0).min(1.0);
        let irreversible = if irreversible { 1.0 } else { 0.0 };
        let raw = 0.45 * swing + 0.25 * self.flip_rate + 0.15 * mobility + 0.15 * irreversible;
        // A skill that is rarely usable is worth less, though not nothing.
        100.0 * raw * (0.5 + 0.5 * self.availability)
    }
}
