use super::{Skill, SkillId, SkillTarget};
use crate::position::Position;
use crate::types::*;

/// One of your pieces (not the king) is hidden from the opponent for two of
/// their turns.
pub struct Invisibility;

impl Skill for Invisibility {
    fn id(&self) -> SkillId {
        SkillId::Invisibility
    }

    fn targets(&self, pos: &Position, color: Color) -> Vec<SkillTarget> {
        pos.pieces(color)
            .filter(|(_, p)| p.kind != PieceKind::King)
            .filter(|(_, p)| !pos.has_effect(p.id, EffectKind::Invisible))
            .map(|(square, _)| SkillTarget::Piece { square })
            .collect()
    }

    fn apply(&self, pos: &mut Position, _color: Color, target: SkillTarget, ev: &mut Vec<Event>) {
        let SkillTarget::Piece { square } = target else {
            return;
        };
        let id = pos.board[square as usize].expect("invisibility target").id;
        ev.push(pos.add_effect(EffectKind::Invisible, id, 4));
    }
}
