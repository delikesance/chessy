use super::{Skill, SkillId, SkillTarget};
use crate::position::Position;
use crate::types::*;

/// One of your pieces (not the king) is saved from its next capture: the
/// capturer still takes the square, but the piece goes back to its starting
/// square. Works once.
pub struct Celestial;

impl Skill for Celestial {
    fn id(&self) -> SkillId {
        SkillId::Celestial
    }

    fn targets(&self, pos: &Position, color: Color) -> Vec<SkillTarget> {
        pos.pieces(color)
            .filter(|(_, p)| p.kind != PieceKind::King)
            .filter(|(_, p)| !pos.has_effect(p.id, EffectKind::Celestial))
            .map(|(square, _)| SkillTarget::Piece { square })
            .collect()
    }

    fn apply(&self, pos: &mut Position, _color: Color, target: SkillTarget, ev: &mut Vec<Event>) {
        let SkillTarget::Piece { square } = target else {
            return;
        };
        let id = pos.board[square as usize].expect("celestial target").id;
        ev.push(pos.push_effect(ActiveEffect::new(EffectKind::Celestial, id, NEVER)));
    }
}
