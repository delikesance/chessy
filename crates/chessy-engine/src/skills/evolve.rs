use super::{Skill, SkillId, SkillKind, SkillTarget};
use crate::position::Position;
use crate::types::*;

/// Unique skill: one of your pieces (not the king or a queen) becomes a queen.
pub struct Evolve;

impl Skill for Evolve {
    fn id(&self) -> SkillId {
        SkillId::Evolve
    }

    fn kind(&self) -> SkillKind {
        SkillKind::Unique
    }

    fn targets(&self, pos: &Position, color: Color) -> Vec<SkillTarget> {
        pos.pieces(color)
            .filter(|(_, p)| !matches!(p.kind, PieceKind::King | PieceKind::Queen))
            .map(|(square, _)| SkillTarget::Piece { square })
            .collect()
    }

    fn apply(&self, pos: &mut Position, _color: Color, target: SkillTarget, ev: &mut Vec<Event>) {
        let SkillTarget::Piece { square } = target else {
            return;
        };
        let piece = pos.board[square as usize].as_mut().expect("evolve target");
        piece.kind = PieceKind::Queen;
        let id = piece.id;
        // The change is for good: a pending Morph must not undo it.
        pos.effects
            .retain(|e| !(e.piece == id && e.kind == EffectKind::Morphed));
        ev.push(Event::Transformed {
            square,
            kind: PieceKind::Queen,
        });
    }
}
