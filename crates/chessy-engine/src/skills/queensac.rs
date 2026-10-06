use super::{Skill, SkillId, SkillTarget};
use crate::position::Position;
use crate::types::*;

/// When your king is in check: the king takes the queen's square and the queen
/// dies on the king's. The king must be safe on arrival.
pub struct Queensac;

fn queens(pos: &Position, color: Color) -> Vec<Square> {
    pos.pieces(color)
        .filter(|(_, p)| p.kind == PieceKind::Queen)
        .map(|(s, _)| s)
        .collect()
}

/// The board after sacrificing the queen on `queen`.
fn sacrificed(pos: &Position, king: Square, queen: Square) -> Position {
    let mut next = pos.clone();
    let mut piece = next.board[king as usize].take().expect("king");
    piece.prev = None;
    next.board[queen as usize] = Some(piece);
    next
}

impl Skill for Queensac {
    fn id(&self) -> SkillId {
        SkillId::Queensac
    }

    fn targets(&self, pos: &Position, color: Color) -> Vec<SkillTarget> {
        if pos.in_check(color) && !queens(pos, color).is_empty() {
            vec![SkillTarget::None]
        } else {
            Vec::new()
        }
    }

    fn apply(&self, pos: &mut Position, color: Color, _target: SkillTarget, ev: &mut Vec<Event>) {
        let Some(king) = pos.king_square(color) else {
            return;
        };
        let all = queens(pos, color);
        // The first queen whose sacrifice makes the king safe; else the first.
        let queen = all
            .iter()
            .copied()
            .find(|&q| !sacrificed(pos, king, q).in_check(color))
            .or_else(|| all.first().copied());
        let Some(queen) = queen else { return };
        let dead = pos.board[queen as usize].expect("queen");
        *pos = sacrificed(pos, king, queen);
        pos.effects.retain(|e| e.piece != dead.id);
        ev.push(Event::Swapped { a: king, b: queen });
        ev.push(Event::Captured {
            square: king,
            piece: dead,
        });
    }
}
