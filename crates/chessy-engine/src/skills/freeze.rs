use super::{Skill, SkillId, SkillTarget};
use crate::position::Position;
use crate::types::{Color, EffectKind, Event, PieceKind};

/// An enemy piece (not the king) cannot move during the opponent's next two turns.
pub struct Freeze;

impl Skill for Freeze {
    fn id(&self) -> SkillId {
        SkillId::Freeze
    }

    fn targets(&self, pos: &Position, color: Color) -> Vec<SkillTarget> {
        pos.pieces(color.opposite())
            .filter(|(_, p)| p.kind != PieceKind::King)
            .map(|(square, _)| SkillTarget::Piece { square })
            .collect()
    }

    fn apply(&self, pos: &mut Position, _color: Color, target: SkillTarget, ev: &mut Vec<Event>) {
        let SkillTarget::Piece { square } = target else {
            return;
        };
        let id = pos.board[square as usize].expect("freeze target").id;
        ev.push(pos.add_effect(EffectKind::Frozen, id, 4));
    }
}
