//! The Solo opponent: a chess AI tuned by an Elo level that may also use skills.
//!
//! Everything goes through [`Game::legal_actions`] and [`Game::apply`], so the
//! AI plays any skill the engine knows without skill-specific code. The only
//! exception is a short list of skills that are useless to it (see
//! [`IGNORED_SKILLS`]), matched by identifier so this file does not depend on
//! variants that may not exist yet.
//!
//! The AI is pure and deterministic: given the same game, [`Strength`] and
//! seed it always answers the same. The caller bounds the work with the node
//! budget in [`Strength`] and may add a `stop` closure (for a wall-clock
//! deadline); the engine itself never reads a clock.

use crate::game::Game;
use crate::search::{self, Limits, MATE, MATE_BOUND};
use crate::skills::SkillId;
use crate::types::*;

pub const MIN_ELO: i32 = 400;
pub const MAX_ELO: i32 = 2800;

/// Skills the AI never plays: they only help a human (they reveal a move or
/// are meant to be combined with one).
pub const IGNORED_SKILLS: [&str; 2] = ["mind", "control"];

fn is_ignored(skill: SkillId) -> bool {
    let name = format!("{skill:?}").to_ascii_lowercase();
    IGNORED_SKILLS.contains(&name.as_str())
}

/// Everything an Elo level changes about how the AI plays.
#[derive(Clone, Copy, Debug, PartialEq)]
pub struct Strength {
    pub elo: i32,
    /// Search depth in plies.
    pub depth: u32,
    /// Node budget for one decision (deterministic stand-in for a time limit).
    pub node_budget: u64,
    /// Wall-clock budget in milliseconds. The engine never reads it; callers
    /// turn it into a `stop` closure.
    pub think_ms: u64,
    /// Moves within this many centipawns of the best are candidates.
    pub dispersion: i32,
    /// At most this many candidates are considered.
    pub candidates: usize,
    /// Probability (per mille) of a near-random move.
    pub blunder_permille: u32,
    /// A skill must improve the evaluation by this many centipawns to be played.
    pub skill_threshold: i32,
    /// Probability (per mille) that the AI even considers using a skill.
    pub skill_permille: u32,
    /// Use the full evaluation (pawn structure, king safety, mobility).
    pub full_eval: bool,
}

fn lerp(a: i32, b: i32, t: f64) -> i32 {
    (a as f64 + (b - a) as f64 * t).round() as i32
}

impl Strength {
    /// The level for `elo` (clamped to 400..=2800); see `docs/spec-v3.md` §5.
    pub fn from_elo(elo: i32) -> Strength {
        let elo = elo.clamp(MIN_ELO, MAX_ELO);
        // (first elo, last elo, depth, nodes, ms, dispersion lo/hi, candidates, blunder lo/hi)
        struct Tier {
            from: i32,
            to: i32,
            depth: u32,
            nodes: u64,
            ms: u64,
            dispersion: (i32, i32),
            candidates: usize,
            blunder: (i32, i32),
        }
        const TIERS: [Tier; 6] = [
            Tier {
                from: 400,
                to: 800,
                depth: 1,
                nodes: 20_000,
                ms: 300,
                dispersion: (400, 150),
                candidates: 8,
                blunder: (550, 300),
            },
            Tier {
                from: 800,
                to: 1200,
                depth: 2,
                nodes: 60_000,
                ms: 500,
                dispersion: (60, 30),
                candidates: 4,
                blunder: (100, 40),
            },
            Tier {
                from: 1200,
                to: 1600,
                depth: 3,
                nodes: 150_000,
                ms: 800,
                dispersion: (25, 10),
                candidates: 3,
                blunder: (30, 10),
            },
            Tier {
                from: 1600,
                to: 2000,
                depth: 4,
                nodes: 300_000,
                ms: 1_000,
                dispersion: (8, 0),
                candidates: 2,
                blunder: (10, 0),
            },
            Tier {
                from: 2000,
                to: 2400,
                depth: 5,
                nodes: 1_000_000,
                ms: 1_500,
                dispersion: (0, 0),
                candidates: 1,
                blunder: (0, 0),
            },
            Tier {
                from: 2400,
                to: 2800,
                depth: 6,
                nodes: 2_000_000,
                ms: 3_000,
                dispersion: (0, 0),
                candidates: 1,
                blunder: (0, 0),
            },
        ];
        let tier = TIERS
            .iter()
            .rev()
            .find(|t| elo >= t.from)
            .expect("elo is at least 400");
        let t = f64::from(elo - tier.from) / f64::from(tier.to - tier.from);
        let skill_t = f64::from(elo - MIN_ELO) / f64::from(MAX_ELO - MIN_ELO);
        Strength {
            elo,
            depth: tier.depth,
            node_budget: tier.nodes,
            think_ms: tier.ms,
            dispersion: lerp(tier.dispersion.0, tier.dispersion.1, t),
            candidates: tier.candidates,
            blunder_permille: lerp(tier.blunder.0, tier.blunder.1, t) as u32,
            skill_threshold: lerp(250, 60, skill_t),
            skill_permille: lerp(250, 1000, skill_t) as u32,
            full_eval: elo >= 2400,
        }
    }

    fn limits(&self, depth: u32, nodes: u64, margin: i32) -> Limits {
        Limits {
            depth,
            nodes,
            margin,
            full_eval: self.full_eval,
        }
    }
}

/// A tiny xorshift64* generator: deterministic, no dependencies.
#[derive(Clone, Debug)]
pub struct Rng(u64);

impl Rng {
    pub fn new(seed: u64) -> Rng {
        let s = search::splitmix(seed);
        Rng(if s == 0 { 0x9E37_79B9_7F4A_7C15 } else { s })
    }

    pub fn next_u64(&mut self) -> u64 {
        let mut x = self.0;
        x ^= x >> 12;
        x ^= x << 25;
        x ^= x >> 27;
        self.0 = x;
        x.wrapping_mul(0x2545_F491_4F6C_DD1D)
    }

    /// Uniform in `0..n` (`n > 0`).
    pub fn below(&mut self, n: u64) -> u64 {
        self.next_u64() % n
    }

    /// True with probability `permille / 1000`.
    pub fn chance(&mut self, permille: u32) -> bool {
        self.below(1000) < u64::from(permille)
    }
}

/// The action the AI plays, or `None` when the side to move has none.
/// Deterministic for a given `(game, strength, seed)`.
pub fn choose_action(game: &Game, strength: &Strength, seed: u64) -> Option<Action> {
    choose_action_with(game, strength, seed, &|| false)
}

/// [`choose_action`] with a `stop` condition polled during the search (for a
/// wall-clock deadline). A search cut short still returns a legal action.
pub fn choose_action_with(
    game: &Game,
    strength: &Strength,
    seed: u64,
    stop: &dyn Fn() -> bool,
) -> Option<Action> {
    let actions = game.legal_actions();
    if actions.is_empty() {
        return None;
    }
    let color = game.side_to_move();
    let move_count = actions
        .iter()
        .filter(|a| matches!(a, Action::Move { .. }))
        .count();
    if move_count == 0 {
        // Only skills can be played (e.g. in check with no legal move).
        return Some(best_skill_only(game, strength, &actions, color, stop));
    }
    if actions.len() == 1 {
        return Some(actions[0]);
    }

    let mut rng = Rng::new(seed);
    let searched = search::search_with(
        &game.pos,
        &strength.limits(strength.depth, strength.node_budget, strength.dispersion),
        &[],
        stop,
    );
    let (best_mv, best_score) = searched.best()?;

    // A forced mate is always played (from the level that can see it).
    if strength.elo >= 800 && best_score >= MATE_BOUND {
        return Some(best_mv.into());
    }

    // Deliberate mistakes: a near-random move.
    if rng.chance(strength.blunder_permille) {
        let moves: Vec<Action> = actions
            .iter()
            .copied()
            .filter(|a| matches!(a, Action::Move { .. }))
            .collect();
        return Some(moves[rng.below(moves.len() as u64) as usize]);
    }

    // Skills: played only when clearly better than the best move.
    if rng.chance(strength.skill_permille) {
        if let Some(skill) = best_skill(game, strength, &actions, color, best_score, &mut rng, stop)
        {
            return Some(skill);
        }
    }

    // Pick among the near-best moves with weights falling with the gap.
    let dispersion = strength.dispersion.max(0);
    let candidates: Vec<(Move, i32)> = searched
        .moves
        .iter()
        .copied()
        .take(strength.candidates.max(1))
        .filter(|&(_, s)| best_score - s <= dispersion)
        .collect();
    if candidates.len() <= 1 || dispersion == 0 {
        return Some(best_mv.into());
    }
    let weights: Vec<u64> = candidates
        .iter()
        .map(|&(_, s)| (dispersion - (best_score - s) + 1) as u64)
        .collect();
    let total: u64 = weights.iter().sum();
    let mut roll = rng.below(total);
    for (&(mv, _), &w) in candidates.iter().zip(&weights) {
        if roll < w {
            return Some(mv.into());
        }
        roll -= w;
    }
    Some(best_mv.into())
}

/// Value (for `color`) of the position after playing a skill `action`,
/// searched `depth` plies, or `None` when it is not worth looking at (not a
/// skill, it keeps the turn, it loses the game, or the engine rejects it).
///
/// This simulates on the position directly ([`crate::Position::try_skill`]) rather
/// than through [`Game::apply`], which re-derives the outcome by trying every
/// skill target and would be far too slow to repeat for each candidate.
fn skill_value(
    game: &Game,
    action: Action,
    color: Color,
    strength: &Strength,
    depth: u32,
    nodes: u64,
    stop: &dyn Fn() -> bool,
) -> Option<i32> {
    let Action::Skill { skill, target } = action else {
        return None;
    };
    let (next, _) = game.pos.try_skill(skill, target)?;
    if next.side == color {
        return None; // the skill kept the turn: not comparable with a move
    }
    if next.legal_moves().is_empty() {
        // Mate or stalemate on the board (the opponent's own skills are ignored).
        return Some(if next.in_check(next.side) { MATE } else { 0 });
    }
    let r = search::search_with(&next, &strength.limits(depth, nodes, 0), &[], stop);
    r.best().map(|(_, score)| -score)
}

/// Skill actions examined per decision at most.
const MAX_SKILL_CANDIDATES: usize = 96;

/// The best skill action when it beats `best_score` by the level's threshold.
fn best_skill(
    game: &Game,
    strength: &Strength,
    actions: &[Action],
    color: Color,
    best_score: i32,
    rng: &mut Rng,
    stop: &dyn Fn() -> bool,
) -> Option<Action> {
    let mut skills: Vec<Action> = actions
        .iter()
        .copied()
        .filter(|a| matches!(a, Action::Skill { skill, .. } if !is_ignored(*skill)))
        .collect();
    if skills.is_empty() {
        return None;
    }
    // Stage 1: a shallow look at (a deterministic sample of) the targets.
    if skills.len() > MAX_SKILL_CANDIDATES {
        for i in 0..MAX_SKILL_CANDIDATES {
            let j = i + rng.below((skills.len() - i) as u64) as usize;
            skills.swap(i, j);
        }
        skills.truncate(MAX_SKILL_CANDIDATES);
    }
    let mut shallow: Vec<(Action, i32)> = Vec::new();
    for &a in &skills {
        if stop() {
            return None;
        }
        if let Some(v) = skill_value(game, a, color, strength, 1, 2_000, stop) {
            shallow.push((a, v));
        }
    }
    shallow.sort_by_key(|&(_, v)| -v);
    // Stage 2: the most promising few, searched as deep as the move search.
    let depth = strength.depth.saturating_sub(1).max(1);
    let nodes = (strength.node_budget / 4).max(2_000);
    let mut best: Option<(Action, i32)> = None;
    for &(a, shallow_value) in shallow.iter().take(3) {
        if stop() {
            break;
        }
        let v = if depth <= 1 {
            shallow_value
        } else {
            match skill_value(game, a, color, strength, depth, nodes, stop) {
                Some(v) => v,
                None => continue,
            }
        };
        if best.is_none_or(|(_, bv)| v > bv) {
            best = Some((a, v));
        }
    }
    let (action, value) = best?;
    (value - best_score >= strength.skill_threshold).then_some(action)
}

/// No move is legal: play the skill that looks best.
fn best_skill_only(
    game: &Game,
    strength: &Strength,
    actions: &[Action],
    color: Color,
    stop: &dyn Fn() -> bool,
) -> Action {
    let mut best: Option<(Action, i32)> = None;
    for &a in actions {
        let v = skill_value(game, a, color, strength, 1, 2_000, stop).unwrap_or(-MATE);
        if best.is_none_or(|(_, bv)| v > bv) {
            best = Some((a, v));
        }
    }
    best.map(|(a, _)| a).unwrap_or(actions[0])
}
