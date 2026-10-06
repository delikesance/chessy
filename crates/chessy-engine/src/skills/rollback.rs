use super::{Skill, SkillId, SkillTarget};
use crate::position::Position;
use crate::types::{Color, Event, PieceKind};

/// Sends one of your pieces (not the king) back to the square it last moved
/// from, if that square is empty. Captured pieces are not restored.
pub struct Rollback;

impl Skill for Rollback {
    fn id(&self) -> SkillId {
        SkillId::Rollback
    }

    fn targets(&self, pos: &Position, color: Color) -> Vec<SkillTarget> {
        pos.pieces(color)
            .filter(|(_, p)| p.kind != PieceKind::King)
            .filter(|(_, p)| !pos.is_frozen(p.id))
            .filter(|(_, p)| {
                p.prev
                    .is_some_and(|prev| pos.can_place(color, p.kind, prev))
            })
            .map(|(square, _)| SkillTarget::Piece { square })
            .collect()
    }

    fn apply(&self, pos: &mut Position, _color: Color, target: SkillTarget, ev: &mut Vec<Event>) {
        let SkillTarget::Piece { square } = target else {
            return;
        };
        let mut piece = pos.board[square as usize].take().expect("rollback target");
        let back = piece.prev.take().expect("rollback has a previous square");
        pos.board[back as usize] = Some(piece);
        ev.push(Event::RolledBack {
            from: square,
            to: back,
        });
    }
}
