//! Building blocks to analyse a finished game: scoring a position, grading a
//! loss in centipawns and turning losses into an accuracy. Read-only on top of
//! [`crate::search`]; nothing here changes the search itself.
//!
//! Scores handled here are in centipawns. Searches report them from the point
//! of view of the side to move; [`white_pov`] flips them, and [`cap`] bounds
//! them to `±EVAL_CAP` (a mate is exactly `±EVAL_CAP`).

use serde::{Deserialize, Serialize};

use crate::position::Position;
use crate::search::{self, Limits, MATE};
use crate::types::*;

/// Largest evaluation reported; a forced mate is exactly this.
pub const EVAL_CAP: i32 = 2000;

/// Bounds a score to `±EVAL_CAP` (mates included).
pub fn cap(score: i32) -> i32 {
    score.clamp(-EVAL_CAP, EVAL_CAP)
}

/// The score seen from White's side, given the score of the side to move.
pub fn white_pov(score_for_side_to_move: i32, side_to_move: Color) -> i32 {
    match side_to_move {
        Color::White => score_for_side_to_move,
        Color::Black => -score_for_side_to_move,
    }
}

/// The score of a game that is over, for the side to move: `None` while it is
/// not decided by the rules (resignation, timeout and agreed draws say
/// nothing about the position).
pub fn terminal_score(outcome: Outcome, side_to_move: Color) -> Option<i32> {
    match outcome {
        Outcome::Checkmate { winner } => Some(if winner == side_to_move { MATE } else { -MATE }),
        Outcome::Stalemate
        | Outcome::FiftyMoves
        | Outcome::Repetition
        | Outcome::InsufficientMaterial => Some(0),
        _ => None,
    }
}

/// A searched position.
#[derive(Clone, Copy, Debug, PartialEq, Eq)]
pub struct Searched {
    /// Best simple move, `None` when there is no legal move.
    pub best: Option<Move>,
    /// Its score for the side to move (`-MATE` when mated, 0 when stalemated).
    pub score: i32,
}

/// Searches `pos` to `depth` plies (`stop` is polled during the search; the
/// first iteration always completes).
pub fn search_position(pos: &Position, depth: u32, stop: &dyn Fn() -> bool) -> Searched {
    let result = search::search_with(pos, &Limits::depth(depth.max(1)), &[], stop);
    match result.best() {
        Some((mv, score)) => Searched {
            best: Some(mv),
            score,
        },
        None => Searched {
            best: None,
            score: if pos.in_check(pos.side) { -MATE } else { 0 },
        },
    }
}

/// How good the position `next` is for `mover`, who has just acted in it:
/// the search of `next` to `depth` plies, seen from `mover`. Use it to rate
/// an action by the position it produces.
pub fn value_after(next: &Position, mover: Color, depth: u32, stop: &dyn Fn() -> bool) -> i32 {
    let searched = search_position(next, depth, stop);
    if next.side == mover {
        searched.score
    } else {
        -searched.score
    }
}

/// How a move compares with the best one.
#[derive(Clone, Copy, Debug, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "snake_case")]
pub enum Label {
    Best,
    Good,
    Inaccuracy,
    Mistake,
    Blunder,
}

/// The label of an action that cost `loss_cp` centipawns; `is_best` marks the
/// engine's own choice.
pub fn label_for(loss_cp: i32, is_best: bool) -> Label {
    match loss_cp {
        _ if is_best => Label::Best,
        l if l <= 10 => Label::Best,
        l if l <= 50 => Label::Good,
        l if l <= 120 => Label::Inaccuracy,
        l if l <= 300 => Label::Mistake,
        _ => Label::Blunder,
    }
}

/// Label counts of one side.
#[derive(Clone, Copy, Debug, Default, PartialEq, Eq, Serialize, Deserialize)]
pub struct Counts {
    pub best: u32,
    pub good: u32,
    pub inaccuracy: u32,
    pub mistake: u32,
    pub blunder: u32,
}

impl Counts {
    pub fn add(&mut self, label: Label) {
        match label {
            Label::Best => self.best += 1,
            Label::Good => self.good += 1,
            Label::Inaccuracy => self.inaccuracy += 1,
            Label::Mistake => self.mistake += 1,
            Label::Blunder => self.blunder += 1,
        }
    }
}

/// `100 · exp(−mean loss / 250)`, rounded; a side that never acted scores 100.
pub fn accuracy(losses: &[i32]) -> u32 {
    if losses.is_empty() {
        return 100;
    }
    let mean = losses.iter().map(|&l| f64::from(l.max(0))).sum::<f64>() / losses.len() as f64;
    (100.0 * (-mean / 250.0).exp()).round().clamp(0.0, 100.0) as u32
}
