use super::{Skill, SkillId, SkillKind, SkillTarget};
use crate::position::Position;
use crate::types::*;

/// Unique skill: brings back up to three of your captured pawns as a protective
/// wall on your third or second rank. They cannot move until your next turn.
pub struct Wall;

/// Free squares for the wall pawns, best first: the third rank before the
/// second, the files closest to the king first.
fn candidates(pos: &Position, color: Color) -> Vec<Square> {
    let king_file = pos.king_square(color).map_or(4, file_of);
    let ranks = match color {
        Color::White => [2, 1],
        Color::Black => [5, 6],
    };
    let mut out = Vec::new();
    for rank in ranks {
        let mut row: Vec<Square> = (0..8)
            .map(|f| sq(f, rank))
            .filter(|&s| pos.can_place(color, PieceKind::Pawn, s))
            .collect();
        row.sort_by_key(|&s| (file_of(s).abs_diff(king_file), file_of(s)));
        out.extend(row);
    }
    out
}

impl Skill for Wall {
    fn id(&self) -> SkillId {
        SkillId::Wall
    }

    fn kind(&self) -> SkillKind {
        SkillKind::Unique
    }

    fn targets(&self, pos: &Position, color: Color) -> Vec<SkillTarget> {
        if pos.captured_pawns[color.index()] > 0 && !candidates(pos, color).is_empty() {
            vec![SkillTarget::None]
        } else {
            Vec::new()
        }
    }

    fn apply(&self, pos: &mut Position, color: Color, _target: SkillTarget, ev: &mut Vec<Event>) {
        let squares = candidates(pos, color);
        let n = (pos.captured_pawns[color.index()] as usize)
            .min(3)
            .min(squares.len());
        for &square in &squares[..n] {
            let id = pos.alloc_id();
            let mut piece = Piece::new(id, PieceKind::Pawn, color, square);
            piece.wall = true;
            pos.board[square as usize] = Some(piece);
            ev.push(Event::Spawned { square, piece });
            // Locked until the owner's next turn.
            let locked = pos.add_effect(EffectKind::Locked, id, 2);
            ev.push(locked);
        }
        pos.captured_pawns[color.index()] -= n as u8;
    }
}
