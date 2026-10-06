//! Alpha-beta search over plain chess moves (skills are not searched here).
//!
//! Scores are centipawns from the point of view of the side to move.

use crate::position::Position;
use crate::types::*;

pub const MATE: i32 = 100_000;

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

/// Small positional bonus: centralisation for minor pieces, advancement for pawns.
fn positional(piece: &Piece, sq: Square) -> i32 {
    let file = file_of(sq) as i32;
    let rank = rank_of(sq) as i32;
    let centre = 7 - ((2 * file - 7).abs() + (2 * rank - 7).abs()) / 2; // 0..7
    let advance = if piece.color == Color::White {
        7 - rank
    } else {
        rank
    };
    match piece.kind {
        PieceKind::Knight | PieceKind::Bishop => centre * 6,
        PieceKind::Pawn => advance * 6 + centre,
        PieceKind::Queen => centre * 2,
        PieceKind::Rook | PieceKind::King => 0,
    }
}

/// Static evaluation for the side to move.
pub fn evaluate(pos: &Position) -> i32 {
    let mut score = 0;
    for (sq, p) in pos.board.iter().enumerate() {
        let Some(p) = p else { continue };
        let value = piece_value(p.kind) + positional(p, sq as Square);
        if p.color == pos.side {
            score += value;
        } else {
            score -= value;
        }
    }
    score
}

fn order(pos: &Position, moves: &mut [Move]) {
    moves.sort_by_key(|m| {
        let victim = pos.board[m.to as usize].map_or(0, |p| piece_value(p.kind));
        let mover = pos.board[m.from as usize].map_or(0, |p| piece_value(p.kind));
        let promo = m.promo.map_or(0, piece_value);
        -(victim * 10 - mover + promo)
    });
}

fn negamax(
    pos: &Position,
    depth: u32,
    mut alpha: i32,
    beta: i32,
    ply: i32,
    nodes: &mut u64,
) -> i32 {
    *nodes += 1;
    let mut moves = pos.legal_moves();
    if moves.is_empty() {
        return if pos.in_check(pos.side) {
            -MATE + ply
        } else {
            0
        };
    }
    if depth == 0 {
        return evaluate(pos);
    }
    order(pos, &mut moves);
    let mut sink = Vec::new();
    let mut best = -MATE;
    for mv in moves {
        let mut next = pos.clone();
        sink.clear();
        next.make_move(mv, &mut sink);
        let score = -negamax(&next, depth - 1, -beta, -alpha, ply + 1, nodes);
        best = best.max(score);
        alpha = alpha.max(score);
        if alpha >= beta {
            break;
        }
    }
    best
}

/// Every legal move with its score (best first), searched `depth` plies deep.
pub fn score_moves(pos: &Position, depth: u32) -> Vec<(Move, i32)> {
    let mut moves = pos.legal_moves();
    order(pos, &mut moves);
    let mut sink = Vec::new();
    let mut nodes = 0;
    let mut scored: Vec<(Move, i32)> = moves
        .into_iter()
        .map(|mv| {
            let mut next = pos.clone();
            sink.clear();
            next.make_move(mv, &mut sink);
            let score = -negamax(&next, depth.saturating_sub(1), -MATE, MATE, 1, &mut nodes);
            (mv, score)
        })
        .collect();
    scored.sort_by_key(|&(_, s)| -s);
    scored
}

/// The best move for the side to move, or `None` when there is none.
pub fn best_move(pos: &Position, depth: u32) -> Option<Move> {
    score_moves(pos, depth.max(1)).first().map(|&(mv, _)| mv)
}
