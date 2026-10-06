//! Search over plain chess moves (skills are not searched here).
//!
//! Iterative-deepening negamax with alpha-beta pruning, a transposition table,
//! killer/history/MVV-LVA move ordering, a quiescence search on captures and
//! light late-move reductions. Scores are centipawns from the point of view of
//! the side to move; mates are `±(MATE - ply)`.
//!
//! The search is pure and deterministic: there is no clock and no randomness.
//! Callers bound the work with a node budget ([`Limits::nodes`]) and may give a
//! `stop` closure (for instance one that looks at a deadline) which is polled
//! every few thousand nodes. The first iteration always completes, so a result
//! is available whatever the budget.

use crate::position::Position;
use crate::types::*;

pub const MATE: i32 = 100_000;
const INF: i32 = MATE + 1_000;
/// Scores beyond this are forced mates.
pub const MATE_BOUND: i32 = MATE - 1_000;
const MAX_PLY: usize = 64;
const TT_DEFAULT_BITS: u32 = 16;

pub fn is_mate_score(score: i32) -> bool {
    score.abs() >= MATE_BOUND
}

// ---- evaluation ------------------------------------------------------------

fn piece_value(kind: PieceKind) -> i32 {
    match kind {
        PieceKind::Pawn => 100,
        PieceKind::Knight => 320,
        PieceKind::Bishop => 330,
        PieceKind::Rook => 500,
        PieceKind::Queen => 900,
        PieceKind::King => 0,
    }
}

// Piece-square tables, written as the board is drawn (rank 8 first, file a
// first) from White's point of view.
#[rustfmt::skip]
const PAWN: [i32; 64] = [
     0,  0,  0,  0,  0,  0,  0,  0,
    50, 50, 50, 50, 50, 50, 50, 50,
    10, 10, 20, 30, 30, 20, 10, 10,
     5,  5, 10, 25, 25, 10,  5,  5,
     0,  0,  0, 20, 20,  0,  0,  0,
     5, -5,-10,  0,  0,-10, -5,  5,
     5, 10, 10,-20,-20, 10, 10,  5,
     0,  0,  0,  0,  0,  0,  0,  0,
];
#[rustfmt::skip]
const KNIGHT: [i32; 64] = [
   -50,-40,-30,-30,-30,-30,-40,-50,
   -40,-20,  0,  0,  0,  0,-20,-40,
   -30,  0, 10, 15, 15, 10,  0,-30,
   -30,  5, 15, 20, 20, 15,  5,-30,
   -30,  0, 15, 20, 20, 15,  0,-30,
   -30,  5, 10, 15, 15, 10,  5,-30,
   -40,-20,  0,  5,  5,  0,-20,-40,
   -50,-40,-30,-30,-30,-30,-40,-50,
];
#[rustfmt::skip]
const BISHOP: [i32; 64] = [
   -20,-10,-10,-10,-10,-10,-10,-20,
   -10,  0,  0,  0,  0,  0,  0,-10,
   -10,  0,  5, 10, 10,  5,  0,-10,
   -10,  5,  5, 10, 10,  5,  5,-10,
   -10,  0, 10, 10, 10, 10,  0,-10,
   -10, 10, 10, 10, 10, 10, 10,-10,
   -10,  5,  0,  0,  0,  0,  5,-10,
   -20,-10,-10,-10,-10,-10,-10,-20,
];
#[rustfmt::skip]
const ROOK: [i32; 64] = [
     0,  0,  0,  0,  0,  0,  0,  0,
     5, 10, 10, 10, 10, 10, 10,  5,
    -5,  0,  0,  0,  0,  0,  0, -5,
    -5,  0,  0,  0,  0,  0,  0, -5,
    -5,  0,  0,  0,  0,  0,  0, -5,
    -5,  0,  0,  0,  0,  0,  0, -5,
    -5,  0,  0,  0,  0,  0,  0, -5,
     0,  0,  0,  5,  5,  0,  0,  0,
];
#[rustfmt::skip]
const QUEEN: [i32; 64] = [
   -20,-10,-10, -5, -5,-10,-10,-20,
   -10,  0,  0,  0,  0,  0,  0,-10,
   -10,  0,  5,  5,  5,  5,  0,-10,
    -5,  0,  5,  5,  5,  5,  0, -5,
     0,  0,  5,  5,  5,  5,  0, -5,
   -10,  5,  5,  5,  5,  5,  0,-10,
   -10,  0,  5,  0,  0,  0,  0,-10,
   -20,-10,-10, -5, -5,-10,-10,-20,
];
#[rustfmt::skip]
const KING_MID: [i32; 64] = [
   -30,-40,-40,-50,-50,-40,-40,-30,
   -30,-40,-40,-50,-50,-40,-40,-30,
   -30,-40,-40,-50,-50,-40,-40,-30,
   -30,-40,-40,-50,-50,-40,-40,-30,
   -20,-30,-30,-40,-40,-30,-30,-20,
   -10,-20,-20,-20,-20,-20,-20,-10,
    20, 20,  0,  0,  0,  0, 20, 20,
    20, 30, 10,  0,  0, 10, 30, 20,
];
#[rustfmt::skip]
const KING_END: [i32; 64] = [
   -50,-40,-30,-20,-20,-30,-40,-50,
   -30,-20,-10,  0,  0,-10,-20,-30,
   -30,-10, 20, 30, 30, 20,-10,-30,
   -30,-10, 30, 40, 40, 30,-10,-30,
   -30,-10, 30, 40, 40, 30,-10,-30,
   -30,-10, 20, 30, 30, 20,-10,-30,
   -30,-30,  0,  0,  0,  0,-30,-30,
   -50,-30,-30,-30,-30,-30,-30,-50,
];

/// Index into the drawn-from-above tables for a piece of `color` on `s`.
fn table_index(color: Color, s: Square) -> usize {
    let rank = rank_of(s) as usize;
    let file = file_of(s) as usize;
    match color {
        Color::White => (7 - rank) * 8 + file,
        Color::Black => rank * 8 + file,
    }
}

const PASSED_BONUS: [i32; 8] = [0, 5, 10, 20, 35, 60, 100, 0];

/// Game phase in 0..=24: 24 with every minor piece, rook and queen on the board.
fn phase_of(pos: &Position) -> i32 {
    let mut phase = 0;
    for p in pos.board.iter().flatten() {
        phase += match p.kind {
            PieceKind::Knight | PieceKind::Bishop => 1,
            PieceKind::Rook => 2,
            PieceKind::Queen => 4,
            _ => 0,
        };
    }
    phase.min(24)
}

/// Number of squares a slider or knight reaches (own pieces block, enemies can be taken).
fn reach(pos: &Position, from: Square, piece: &Piece) -> i32 {
    const KNIGHT_STEPS: [(i8, i8); 8] = [
        (1, 2),
        (2, 1),
        (2, -1),
        (1, -2),
        (-1, -2),
        (-2, -1),
        (-2, 1),
        (-1, 2),
    ];
    const DIAG: [(i8, i8); 4] = [(1, 1), (1, -1), (-1, 1), (-1, -1)];
    const ORTHO: [(i8, i8); 4] = [(1, 0), (-1, 0), (0, 1), (0, -1)];
    let step = |s: Square, df: i8, dr: i8| crate::position::offset(s, df, dr);
    let mut count = 0;
    if piece.kind == PieceKind::Knight {
        for (df, dr) in KNIGHT_STEPS {
            if let Some(t) = step(from, df, dr) {
                if pos.board[t as usize].is_none_or(|o| o.color != piece.color) {
                    count += 1;
                }
            }
        }
        return count;
    }
    let dirs: &[&[(i8, i8); 4]] = match piece.kind {
        PieceKind::Bishop => &[&DIAG],
        PieceKind::Rook => &[&ORTHO],
        PieceKind::Queen => &[&DIAG, &ORTHO],
        _ => return 0,
    };
    for set in dirs {
        for &(df, dr) in set.iter() {
            let mut cur = from;
            while let Some(t) = step(cur, df, dr) {
                cur = t;
                match pos.board[t as usize] {
                    None => count += 1,
                    Some(o) => {
                        if o.color != piece.color {
                            count += 1;
                        }
                        break;
                    }
                }
            }
        }
    }
    count
}

/// Material, piece-square tables and (when `full`) pawn structure, king
/// safety, rook files, bishop pair and mobility. White minus Black.
fn white_minus_black(pos: &Position, full: bool) -> i32 {
    let phase = phase_of(pos);
    let mut score = 0;
    // Pawns per file and per colour, for structure terms.
    let mut pawn_files = [[0u8; 8]; 2];
    // Per colour and file: (lowest, highest) pawn rank.
    let mut pawn_rank_min_max = [[(7u8, 0u8); 8]; 2];
    let mut bishops = [0; 2];
    let mut kings: [Option<Square>; 2] = [None, None];
    for (s, p) in pos.board.iter().enumerate() {
        let Some(p) = p else { continue };
        let s = s as Square;
        let c = p.color.index();
        if p.kind == PieceKind::Pawn {
            pawn_files[c][file_of(s) as usize] += 1;
            let r = rank_of(s);
            let e = &mut pawn_rank_min_max[c][file_of(s) as usize];
            e.0 = e.0.min(r);
            e.1 = e.1.max(r);
        }
    }
    for (s, p) in pos.board.iter().enumerate() {
        let Some(p) = p else { continue };
        let s = s as Square;
        let idx = table_index(p.color, s);
        let sign = if p.color == Color::White { 1 } else { -1 };
        let table = match p.kind {
            PieceKind::Pawn => PAWN[idx],
            PieceKind::Knight => KNIGHT[idx],
            PieceKind::Bishop => BISHOP[idx],
            PieceKind::Rook => ROOK[idx],
            PieceKind::Queen => QUEEN[idx],
            PieceKind::King => (KING_MID[idx] * phase + KING_END[idx] * (24 - phase)) / 24,
        };
        let mut value = piece_value(p.kind) + table;
        let c = p.color.index();
        let f = file_of(s) as usize;
        let enemy = 1 - c;
        if full {
            match p.kind {
                PieceKind::Pawn => {
                    if pawn_files[c][f] > 1 {
                        value -= 12;
                    }
                    let left = f.checked_sub(1).map_or(0, |l| pawn_files[c][l]);
                    let right = if f < 7 { pawn_files[c][f + 1] } else { 0 };
                    if left == 0 && right == 0 {
                        value -= 10;
                    }
                    // Passed: no enemy pawn ahead on this or an adjacent file.
                    let rank = rank_of(s);
                    let ahead = |er: u8| {
                        if p.color == Color::White {
                            er > rank
                        } else {
                            er < rank
                        }
                    };
                    let mut passed = true;
                    for ef in f.saturating_sub(1)..=(f + 1).min(7) {
                        if pawn_files[enemy][ef] > 0 {
                            let (lo, hi) = pawn_rank_min_max[enemy][ef];
                            if ahead(lo) || ahead(hi) {
                                passed = false;
                            }
                        }
                    }
                    if passed {
                        let adv = if p.color == Color::White {
                            rank
                        } else {
                            7 - rank
                        };
                        value += PASSED_BONUS[adv as usize];
                    }
                }
                PieceKind::Rook => {
                    if pawn_files[c][f] == 0 {
                        value += if pawn_files[enemy][f] == 0 { 15 } else { 8 };
                    }
                    value += reach(pos, s, p);
                }
                PieceKind::Knight => value += 4 * (reach(pos, s, p) - 4),
                PieceKind::Bishop => {
                    bishops[c] += 1;
                    value += 3 * (reach(pos, s, p) - 6);
                }
                PieceKind::Queen => value += reach(pos, s, p) / 2,
                PieceKind::King => kings[c] = Some(s),
            }
        }
        score += sign * value;
    }
    if full {
        for color in Color::BOTH {
            let c = color.index();
            let sign = if color == Color::White { 1 } else { -1 };
            if bishops[c] >= 2 {
                score += sign * 30;
            }
            // King safety: friendly pawns shielding the king, middlegame only.
            if let Some(k) = kings[c] {
                let kf = file_of(k) as i32;
                let kr = rank_of(k) as i32;
                let fwd = color.forward() as i32;
                let mut shield = 0;
                for df in -1..=1 {
                    let f = kf + df;
                    if !(0..8).contains(&f) {
                        continue;
                    }
                    let mut found = 0;
                    for step in 1..=2 {
                        let r = kr + fwd * step;
                        if (0..8).contains(&r)
                            && matches!(pos.board[sq(f as u8, r as u8) as usize],
                                Some(p) if p.color == color && p.kind == PieceKind::Pawn)
                        {
                            found = if step == 1 { 10 } else { 5 };
                            break;
                        }
                    }
                    shield += found;
                    if pawn_files[c][f as usize] == 0 && pawn_files[1 - c][f as usize] == 0 {
                        shield -= 8; // open file next to the king
                    }
                }
                score += sign * shield * phase / 24;
            }
        }
    }
    score
}

/// Static evaluation for the side to move (full: pawn structure, king safety,
/// mobility).
pub fn evaluate(pos: &Position) -> i32 {
    evaluate_with(pos, true)
}

/// Like [`evaluate`]; `full = false` keeps only material and piece-square tables.
pub fn evaluate_with(pos: &Position, full: bool) -> i32 {
    let s = white_minus_black(pos, full);
    if pos.side == Color::White {
        s
    } else {
        -s
    }
}

// ---- position keys ---------------------------------------------------------

pub(crate) fn splitmix(mut x: u64) -> u64 {
    x = x.wrapping_add(0x9E37_79B9_7F4A_7C15);
    x = (x ^ (x >> 30)).wrapping_mul(0xBF58_476D_1CE4_E5B9);
    x = (x ^ (x >> 27)).wrapping_mul(0x94D0_49BB_1331_11EB);
    x ^ (x >> 31)
}

/// A hash of what makes two positions interchangeable for the search: the
/// pieces (identity, kind, colour, square), side to move, castling rights, the
/// en-passant square and the remaining life of active effects. It reads only
/// stable public fields of [`Position`].
pub fn position_key(pos: &Position) -> u64 {
    let mut h = 0u64;
    for (s, p) in pos.board.iter().enumerate() {
        if let Some(p) = p {
            let v = (s as u64)
                | (p.kind as u64) << 8
                | (p.color.index() as u64) << 12
                | (p.id as u64) << 16;
            h ^= splitmix(v.wrapping_add(1) << 1);
        }
    }
    h ^= splitmix(0x1000 + pos.side.index() as u64);
    h ^= splitmix(0x2000 + pos.castling as u64);
    h ^= splitmix(0x3000 + pos.en_passant.map_or(0xFF, u64::from));
    for e in &pos.effects {
        let remaining = e.expires_at.saturating_sub(pos.ply) as u64;
        let sq = pos
            .board
            .iter()
            .position(|p| p.is_some_and(|p| p.id == e.piece))
            .unwrap_or(64) as u64;
        let kind = {
            use std::hash::{Hash, Hasher};
            let mut hasher = std::hash::DefaultHasher::new();
            e.kind.hash(&mut hasher);
            hasher.finish()
        };
        h ^= splitmix(kind ^ splitmix(remaining << 8 | sq));
    }
    h
}

// ---- search ----------------------------------------------------------------

#[derive(Clone, Copy, Debug)]
pub struct Limits {
    /// Deepest iteration (plies).
    pub depth: u32,
    /// Stop starting new iterations (and abandon the running one) past this many nodes.
    pub nodes: u64,
    /// Root moves scoring more than `margin` below the best are only bounded,
    /// not scored exactly (`i32::MAX / 4` scores them all exactly).
    pub margin: i32,
    /// Use the full evaluation (see [`evaluate_with`]).
    pub full_eval: bool,
}

impl Limits {
    pub fn depth(depth: u32) -> Self {
        Limits {
            depth,
            nodes: u64::MAX,
            margin: 0,
            full_eval: true,
        }
    }
}

#[derive(Clone, Debug)]
pub struct SearchResult {
    /// Legal root moves, best first. Scores of moves more than `margin` below
    /// the best are upper bounds, the rest are exact for the searched depth.
    pub moves: Vec<(Move, i32)>,
    /// Depth of the last completed iteration.
    pub depth: u32,
    pub nodes: u64,
}

impl SearchResult {
    pub fn best(&self) -> Option<(Move, i32)> {
        self.moves.first().copied()
    }
}

#[derive(Clone, Copy, PartialEq, Eq)]
enum Bound {
    Exact,
    Lower,
    Upper,
}

#[derive(Clone, Copy)]
struct TtEntry {
    key: u64,
    mv: Option<Move>,
    score: i32,
    depth: i8,
    bound: Bound,
}

const EMPTY_TT: TtEntry = TtEntry {
    key: 0,
    mv: None,
    score: 0,
    depth: -1,
    bound: Bound::Exact,
};

struct Searcher<'a> {
    tt: Vec<TtEntry>,
    mask: usize,
    killers: [[Option<Move>; 2]; MAX_PLY + 2],
    history: [[[i32; 64]; 64]; 2],
    nodes: u64,
    max_nodes: u64,
    stop: &'a dyn Fn() -> bool,
    aborted: bool,
    can_abort: bool,
    path: Vec<u64>,
    full_eval: bool,
    ext_limit: usize,
}

fn is_capture(pos: &Position, mv: Move) -> bool {
    pos.board[mv.to as usize].is_some()
        || (Some(mv.to) == pos.en_passant
            && file_of(mv.from) != file_of(mv.to)
            && pos.board[mv.from as usize].is_some_and(|p| p.kind == PieceKind::Pawn))
}

fn victim_value(pos: &Position, mv: Move) -> i32 {
    match pos.board[mv.to as usize] {
        Some(p) => piece_value(p.kind),
        None => 100, // en passant
    }
}

fn play(pos: &Position, mv: Move) -> Position {
    let mut next = pos.clone();
    let mut sink = Vec::new();
    next.make_move(mv, &mut sink);
    next
}

fn insufficient_material(pos: &Position) -> bool {
    let mut minors = 0;
    for p in pos.board.iter().flatten() {
        match p.kind {
            PieceKind::King => {}
            PieceKind::Knight | PieceKind::Bishop => minors += 1,
            _ => return false,
        }
    }
    minors <= 1
}

impl<'a> Searcher<'a> {
    fn new(limits: &Limits, history: &[u64], stop: &'a dyn Fn() -> bool) -> Self {
        let bits = if limits.nodes == u64::MAX {
            TT_DEFAULT_BITS
        } else {
            (64 - (limits.nodes / 2).max(1).leading_zeros()).clamp(12, 20)
        };
        Searcher {
            tt: vec![EMPTY_TT; 1 << bits],
            mask: (1 << bits) - 1,
            killers: [[None; 2]; MAX_PLY + 2],
            history: [[[0; 64]; 64]; 2],
            nodes: 0,
            max_nodes: limits.nodes,
            stop,
            aborted: false,
            can_abort: false,
            path: history.to_vec(),
            full_eval: limits.full_eval,
            ext_limit: MAX_PLY,
        }
    }

    fn eval(&self, pos: &Position) -> i32 {
        evaluate_with(pos, self.full_eval)
    }

    fn tick(&mut self) {
        self.nodes += 1;
        if self.can_abort
            && (self.nodes > self.max_nodes || (self.nodes & 2047 == 0 && (self.stop)()))
        {
            self.aborted = true;
        }
    }

    fn tt_get(&self, key: u64) -> Option<TtEntry> {
        let e = self.tt[key as usize & self.mask];
        (e.key == key).then_some(e)
    }

    fn tt_put(&mut self, key: u64, mv: Option<Move>, score: i32, depth: i32, bound: Bound) {
        let slot = &mut self.tt[key as usize & self.mask];
        if slot.key == key && slot.depth as i32 > depth && mv.is_none() {
            return;
        }
        *slot = TtEntry {
            key,
            mv: mv.or(if slot.key == key { slot.mv } else { None }),
            score,
            depth: depth.clamp(0, 100) as i8,
            bound,
        };
    }

    fn order_score(&self, pos: &Position, mv: Move, tt_move: Option<Move>, ply: usize) -> i32 {
        if Some(mv) == tt_move {
            return 10_000_000;
        }
        let mover = pos.board[mv.from as usize].map_or(0, |p| piece_value(p.kind));
        let promo = mv.promo.map_or(0, piece_value);
        if is_capture(pos, mv) {
            return 1_000_000 + victim_value(pos, mv) * 10 - mover + promo;
        }
        if promo > 0 {
            return 900_000 + promo;
        }
        if self.killers[ply][0] == Some(mv) {
            return 800_000;
        }
        if self.killers[ply][1] == Some(mv) {
            return 700_000;
        }
        self.history[pos.side.index()][mv.from as usize][mv.to as usize]
    }

    fn order(&self, pos: &Position, moves: &mut [Move], tt_move: Option<Move>, ply: usize) {
        moves.sort_by_cached_key(|&m| -self.order_score(pos, m, tt_move, ply));
    }

    fn is_draw(&self, pos: &Position) -> bool {
        if pos.halfmove >= 100 || insufficient_material(pos) {
            return true;
        }
        let key = position_key(pos);
        self.path
            .iter()
            .rev()
            .take(pos.halfmove as usize)
            .any(|&k| k == key)
    }

    fn quiesce(&mut self, pos: &Position, mut alpha: i32, beta: i32, ply: usize, qd: u32) -> i32 {
        self.tick();
        if self.aborted {
            return 0;
        }
        let in_check = pos.in_check(pos.side);
        let mut best;
        let mut moves;
        if in_check {
            moves = pos.legal_moves();
            if moves.is_empty() {
                return -MATE + ply as i32;
            }
            best = -INF;
        } else {
            let stand = self.eval(pos);
            if stand >= beta || ply >= MAX_PLY || qd >= 10 {
                return stand;
            }
            alpha = alpha.max(stand);
            best = stand;
            let color = pos.side;
            let mut pseudo = Vec::with_capacity(32);
            pos.pseudo_moves(&mut pseudo);
            moves = Vec::new();
            let mut sink = Vec::new();
            for mv in pseudo {
                if !is_capture(pos, mv) && mv.promo != Some(PieceKind::Queen) {
                    continue;
                }
                // Delta pruning: even winning the victim cannot reach alpha.
                if stand + victim_value_or_zero(pos, mv) + 200 < alpha && mv.promo.is_none() {
                    continue;
                }
                let mut next = pos.clone();
                sink.clear();
                next.make_move(mv, &mut sink);
                if !next.in_check(color) {
                    moves.push(mv);
                }
            }
        }
        self.order(pos, &mut moves, None, ply.min(MAX_PLY));
        for mv in moves {
            let next = play(pos, mv);
            let score = -self.quiesce(&next, -beta, -alpha, ply + 1, qd + 1);
            if self.aborted {
                return 0;
            }
            if score > best {
                best = score;
                if score > alpha {
                    alpha = score;
                    if alpha >= beta {
                        break;
                    }
                }
            }
        }
        best
    }

    fn negamax(
        &mut self,
        pos: &Position,
        mut depth: i32,
        mut alpha: i32,
        mut beta: i32,
        ply: usize,
    ) -> i32 {
        if self.aborted {
            return 0;
        }
        let in_check = pos.in_check(pos.side);
        if in_check && ply < self.ext_limit {
            depth += 1;
        }
        if ply > 0 && self.is_draw(pos) {
            return 0;
        }
        if depth <= 0 || ply >= MAX_PLY {
            return self.quiesce(pos, alpha, beta, ply, 0);
        }
        self.tick();
        if self.aborted {
            return 0;
        }
        // Mate-distance pruning.
        alpha = alpha.max(-MATE + ply as i32);
        beta = beta.min(MATE - ply as i32 - 1);
        if alpha >= beta {
            return alpha;
        }
        let key = position_key(pos);
        let mut tt_move = None;
        if let Some(e) = self.tt_get(key) {
            tt_move = e.mv;
            if e.depth as i32 >= depth {
                let score = from_tt(e.score, ply);
                match e.bound {
                    Bound::Exact => return score,
                    Bound::Lower if score >= beta => return score,
                    Bound::Upper if score <= alpha => return score,
                    _ => {}
                }
            }
        }
        let mut moves = pos.legal_moves();
        if moves.is_empty() {
            return if in_check { -MATE + ply as i32 } else { 0 };
        }
        self.order(pos, &mut moves, tt_move, ply);
        self.path.push(key);
        let original_alpha = alpha;
        let mut best = -INF;
        let mut best_move = None;
        for (i, &mv) in moves.iter().enumerate() {
            let next = play(pos, mv);
            let quiet = !is_capture(pos, mv) && mv.promo.is_none();
            let mut score;
            if i == 0 {
                score = -self.negamax(&next, depth - 1, -beta, -alpha, ply + 1);
            } else {
                let reduce = if depth >= 3 && i >= 4 && quiet && !in_check {
                    1
                } else {
                    0
                };
                score = -self.negamax(&next, depth - 1 - reduce, -alpha - 1, -alpha, ply + 1);
                if score > alpha && !self.aborted && (reduce > 0 || score < beta) {
                    score = -self.negamax(&next, depth - 1, -beta, -alpha, ply + 1);
                }
            }
            if self.aborted {
                self.path.pop();
                return 0;
            }
            if score > best {
                best = score;
                best_move = Some(mv);
                if score > alpha {
                    alpha = score;
                    if alpha >= beta {
                        if quiet {
                            if self.killers[ply][0] != Some(mv) {
                                self.killers[ply][1] = self.killers[ply][0];
                                self.killers[ply][0] = Some(mv);
                            }
                            let h = &mut self.history[pos.side.index()][mv.from as usize]
                                [mv.to as usize];
                            *h = (*h + depth * depth).min(500_000);
                        }
                        break;
                    }
                }
            }
        }
        self.path.pop();
        let bound = if best >= beta {
            Bound::Lower
        } else if best > original_alpha {
            Bound::Exact
        } else {
            Bound::Upper
        };
        self.tt_put(key, best_move, to_tt(best, ply), depth, bound);
        best
    }

    /// One iteration over the root moves, already ordered. `None` when aborted.
    fn root(
        &mut self,
        pos: &Position,
        moves: &[Move],
        depth: i32,
        margin: i32,
    ) -> Option<Vec<(Move, i32)>> {
        self.ext_limit = (2 * depth as usize + 4).min(MAX_PLY);
        let mut out = Vec::with_capacity(moves.len());
        let mut best = -INF;
        for (i, &mv) in moves.iter().enumerate() {
            let next = play(pos, mv);
            let alpha = if i == 0 {
                -INF
            } else {
                best.saturating_sub(margin).saturating_sub(1).max(-INF)
            };
            let score = -self.negamax(&next, depth - 1, -INF, -alpha, 1);
            if self.aborted {
                return None;
            }
            best = best.max(score);
            out.push((mv, score));
        }
        Some(out)
    }
}

fn to_tt(score: i32, ply: usize) -> i32 {
    if score >= MATE_BOUND {
        score + ply as i32
    } else if score <= -MATE_BOUND {
        score - ply as i32
    } else {
        score
    }
}

fn from_tt(score: i32, ply: usize) -> i32 {
    if score >= MATE_BOUND {
        score - ply as i32
    } else if score <= -MATE_BOUND {
        score + ply as i32
    } else {
        score
    }
}

fn victim_value_or_zero(pos: &Position, mv: Move) -> i32 {
    if is_capture(pos, mv) {
        victim_value(pos, mv)
    } else {
        0
    }
}

/// Iterative-deepening search of `pos`. `history` holds the keys
/// ([`position_key`]) of the positions played before `pos` (oldest first, `pos`
/// excluded) so repetitions are scored as draws; pass `&[]` when unknown.
/// `stop` is polled during the search; once it returns true the running
/// iteration is dropped and the last completed one is returned.
pub fn search_with(
    pos: &Position,
    limits: &Limits,
    history: &[u64],
    stop: &dyn Fn() -> bool,
) -> SearchResult {
    let mut moves = pos.legal_moves();
    if moves.is_empty() {
        return SearchResult {
            moves: Vec::new(),
            depth: 0,
            nodes: 0,
        };
    }
    let mut searcher = Searcher::new(limits, history, stop);
    let root_key = position_key(pos);
    searcher.path.push(root_key);
    searcher.order(pos, &mut moves, None, 0);
    let mut result = SearchResult {
        moves: moves.iter().map(|&m| (m, 0)).collect(),
        depth: 0,
        nodes: 0,
    };
    for depth in 1..=limits.depth.max(1) {
        searcher.can_abort = depth > 1;
        let order: Vec<Move> = result.moves.iter().map(|&(m, _)| m).collect();
        let Some(mut scored) = searcher.root(pos, &order, depth as i32, limits.margin) else {
            break;
        };
        // Best first; ties keep the previous ordering (stable sort).
        scored.sort_by_key(|&(_, s)| -s);
        result.moves = scored;
        result.depth = depth;
        if let Some(&(mv, score)) = result.moves.first() {
            searcher.tt_put(
                root_key,
                Some(mv),
                to_tt(score, 0),
                depth as i32,
                Bound::Exact,
            );
            if limits.margin == 0 && score >= MATE - depth as i32 && depth >= 2 {
                break; // a shorter forced mate than the horizon: nothing to improve
            }
        }
        if searcher.nodes > limits.nodes {
            break;
        }
    }
    result.nodes = searcher.nodes;
    result
}

/// [`search_with`] with no history and no stop condition.
pub fn search(pos: &Position, limits: &Limits) -> SearchResult {
    search_with(pos, limits, &[], &|| false)
}

/// Margin used by [`score_moves`]: moves further below the best than this are
/// only bounded, which keeps tactical positions fast.
pub const SCORE_MOVES_MARGIN: i32 = 100;

/// Every legal move with its score (best first), searched `depth` plies deep.
/// Scores of moves more than [`SCORE_MOVES_MARGIN`] below the best are upper
/// bounds; use [`search`] with a different margin for exact scores.
pub fn score_moves(pos: &Position, depth: u32) -> Vec<(Move, i32)> {
    let limits = Limits {
        margin: SCORE_MOVES_MARGIN,
        ..Limits::depth(depth.max(1))
    };
    search(pos, &limits).moves
}

/// The best move for the side to move, or `None` when there is none.
pub fn best_move(pos: &Position, depth: u32) -> Option<Move> {
    search(pos, &Limits::depth(depth.max(1)))
        .best()
        .map(|(m, _)| m)
}
