//! Engine analysis of a whole game (docs/spec-v4.md §2): each action is
//! compared with the best simple move of the side to move, in centipawns.
//! Synchronous and CPU-bound: callers run it in `spawn_blocking`.
//!
//! * `eval_cp` of ply `p` is the evaluation (White's point of view, bounded to
//!   ±2000, a mate being ±2000) of the position *after* action `p`;
//! * `best` is the engine's best simple move *before* the action, searched to
//!   the requested depth, and `loss_cp` how much worse the played action is:
//!   a move or skill is valued by the search of the position it produces to
//!   `depth − 1` (at least 1), which is what the same move scores at the root
//!   of a depth-`depth` search;
//! * if the game is too long for the time budget, the depth drops for the
//!   remaining plies (`reduced_from_ply`).

use std::sync::atomic::{AtomicUsize, Ordering};
use std::sync::Mutex;
use std::time::{Duration, Instant};

use chessy_engine::analysis::{
    accuracy, cap, label_for, search_position, terminal_score, value_after, white_pov, Counts,
    Label, Searched,
};
use chessy_engine::notation::simulated_move_notation;
use chessy_engine::{Action, Color, Move};
use serde::Serialize;

use crate::replay::{BestView, Replay};

/// The whole analysis may take this long.
pub const BUDGET: Duration = Duration::from_secs(25);

#[derive(Clone, Debug, Serialize)]
pub struct PlyAnalysis {
    pub ply: u32,
    pub eval_cp: i32,
    pub best: Option<BestView>,
    pub loss_cp: i32,
    pub label: Label,
}

#[derive(Clone, Debug, Serialize)]
pub struct PerSide<T> {
    pub white: T,
    pub black: T,
}

#[derive(Clone, Debug, Serialize)]
pub struct Analysis {
    pub depth: u32,
    pub plies: Vec<PlyAnalysis>,
    pub accuracy: PerSide<u32>,
    pub summary: PerSide<Counts>,
    /// First ply analysed at a lower depth because the time budget ran out.
    #[serde(skip_serializing_if = "Option::is_none")]
    pub reduced_from_ply: Option<u32>,
}

/// Threads one analysis may use: positions are independent of each other.
fn worker_count() -> usize {
    std::thread::available_parallelism()
        .map(|n| n.get())
        .unwrap_or(1)
        .clamp(1, 4)
}

/// `work(0..n)` spread over `threads` scoped threads; results in index order.
fn parallel_map<T: Send>(n: usize, threads: usize, work: impl Fn(usize) -> T + Sync) -> Vec<T> {
    let next = AtomicUsize::new(0);
    let slots: Vec<Mutex<Option<T>>> = (0..n).map(|_| Mutex::new(None)).collect();
    std::thread::scope(|scope| {
        for _ in 0..threads.clamp(1, n.max(1)) {
            scope.spawn(|| loop {
                let i = next.fetch_add(1, Ordering::Relaxed);
                if i >= n {
                    break;
                }
                let value = work(i);
                *slots[i].lock().unwrap_or_else(|e| e.into_inner()) = Some(value);
            });
        }
    });
    slots
        .into_iter()
        .map(|slot| {
            slot.into_inner()
                .unwrap_or_else(|e| e.into_inner())
                .expect("every index was worked")
        })
        .collect()
}

/// How deep to search now: starts at the requested depth and drops by one
/// whenever the positions done so far say the rest would not fit in time.
struct Pace {
    depth: u32,
    since: Instant,
    /// Positions finished since `since`.
    done: u32,
    /// Positions finished in all.
    finished: usize,
}

impl Pace {
    fn depth_now(&mut self, total: usize, end: Instant) -> u32 {
        if self.depth > 1 && self.done >= 2 {
            let per = self.since.elapsed() / self.done;
            let left = end.saturating_duration_since(Instant::now());
            let remaining = (total - self.finished.min(total)) as u32;
            if per * remaining > left {
                self.depth -= 1;
                self.since = Instant::now();
                self.done = 0;
            }
        }
        self.depth
    }

    fn finish(&mut self) {
        self.done += 1;
        self.finished += 1;
    }
}

/// Analyses a replayed game to `depth` within `budget`.
pub fn analyze(replay: &Replay, depth: u32, budget: Duration) -> Analysis {
    let started = Instant::now();
    let hard = started + budget;
    let stop = || Instant::now() >= hard;
    let n = replay.steps.len();
    let depth = depth.max(1);
    let threads = worker_count();

    // Phase 1: the best move and score of every position, getting shallower
    // when the projected time would not fit (a fifth of the budget is kept
    // for phase 2, the search of the played actions).
    let phase1_end = started + budget.mul_f64(0.8);
    let pace = Mutex::new(Pace {
        depth,
        since: started,
        done: 0,
        finished: 0,
    });
    let searched = parallel_map(n + 1, threads, |i| {
        let now = pace
            .lock()
            .unwrap_or_else(|e| e.into_inner())
            .depth_now(n + 1, phase1_end);
        let point = replay.point(i);
        let root = match terminal_score(point.outcome, point.pos.side) {
            Some(_) => None,
            None => Some(search_position(&point.pos, now, &stop)),
        };
        pace.lock().unwrap_or_else(|e| e.into_inner()).finish();
        (root, now)
    });
    let roots: Vec<Option<Searched>> = searched.iter().map(|&(r, _)| r).collect();
    let depths: Vec<u32> = searched.iter().map(|&(_, d)| d).collect();
    let reduced_from = depths.iter().position(|&d| d < depth).map(|i| i as u32 + 1);

    // Phase 2: rate every action against the best move of its position.
    let rated = parallel_map(n, threads, |i| {
        let step = &replay.steps[i];
        let before = replay.point(i);
        let after = replay.point(i + 1);
        let side = before.pos.side;
        let best_root = roots[i].expect("playable positions are searched");
        let best_cp = cap(best_root.score);

        let after_side = after.pos.side;
        let eval_after = match (terminal_score(after.outcome, after_side), roots[i + 1]) {
            (Some(t), _) => t,
            (None, Some(r)) => r.score,
            (None, None) => 0,
        };

        let is_best = match (step.action, best_root.best) {
            (Action::Move { from, to, promo }, Some(b)) => b == (Move { from, to, promo }),
            _ => false,
        };
        let loss = if is_best {
            0
        } else {
            let value = match terminal_score(after.outcome, after_side) {
                Some(t) if after_side == step.mover => t,
                Some(t) => -t,
                None => value_after(
                    &after.pos,
                    step.mover,
                    depths[i].saturating_sub(1).max(1),
                    &stop,
                ),
            };
            (best_cp - cap(value)).max(0)
        };
        let label = label_for(loss, is_best);
        let best = best_root.best.map(|mv| BestView {
            action: mv.into(),
            notation: simulated_move_notation(&before.pos, mv),
            eval_cp: cap(white_pov(best_root.score, side)),
        });
        (
            side,
            PlyAnalysis {
                ply: i as u32 + 1,
                eval_cp: cap(white_pov(eval_after, after_side)),
                best,
                loss_cp: loss,
                label,
            },
        )
    });

    let mut losses: [Vec<i32>; 2] = [Vec::new(), Vec::new()];
    let mut summary = PerSide {
        white: Counts::default(),
        black: Counts::default(),
    };
    let mut plies = Vec::with_capacity(n);
    for (side, ply) in rated {
        summary_of(&mut summary, side, ply.label);
        losses[side.index()].push(ply.loss_cp);
        plies.push(ply);
    }

    Analysis {
        depth,
        plies,
        accuracy: PerSide {
            white: accuracy(&losses[Color::White.index()]),
            black: accuracy(&losses[Color::Black.index()]),
        },
        summary,
        reduced_from_ply: reduced_from,
    }
}

fn summary_of(summary: &mut PerSide<Counts>, side: Color, label: Label) {
    match side {
        Color::White => summary.white.add(label),
        Color::Black => summary.black.add(label),
    }
}
