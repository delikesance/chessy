use super::{Skill, SkillId, SkillKind, SkillTarget};
use crate::position::Position;
use crate::types::{Color, Event, PieceKind};

/// Unique skill: removes an enemy pawn from the board, unless that checkmates.
pub struct Remover;

impl Skill for Remover {
    fn id(&self) -> SkillId {
        SkillId::Remover
    }

    fn kind(&self) -> SkillKind {
        SkillKind::Unique
    }

    fn forbids_mate(&self) -> bool {
        true
    }

    fn targets(&self, pos: &Position, color: Color) -> Vec<SkillTarget> {
        pos.pieces(color.opposite())
            .filter(|(_, p)| p.kind == PieceKind::Pawn)
            .map(|(square, _)| SkillTarget::Piece { square })
            .collect()
    }

    fn apply(&self, pos: &mut Position, _color: Color, target: SkillTarget, ev: &mut Vec<Event>) {
        let SkillTarget::Piece { square } = target else {
            return;
        };
        let piece = pos.board[square as usize].take().expect("remover target");
        pos.effects.retain(|e| e.piece != piece.id);
        ev.push(Event::Removed { square, piece });
    }
}
