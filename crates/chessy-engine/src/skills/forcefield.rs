use super::{Skill, SkillId, SkillTarget};
use crate::position::Position;
use crate::types::*;

/// One of your pieces (not the king) pushes its capturer back up to two
/// squares when it is taken. It is still captured.
pub struct Forcefield;

impl Skill for Forcefield {
    fn id(&self) -> SkillId {
        SkillId::Forcefield
    }

    fn targets(&self, pos: &Position, color: Color) -> Vec<SkillTarget> {
        pos.pieces(color)
            .filter(|(_, p)| p.kind != PieceKind::King)
            .filter(|(_, p)| !pos.has_effect(p.id, EffectKind::Forcefield))
            .map(|(square, _)| SkillTarget::Piece { square })
            .collect()
    }

    fn apply(&self, pos: &mut Position, _color: Color, target: SkillTarget, ev: &mut Vec<Event>) {
        let SkillTarget::Piece { square } = target else {
            return;
        };
        let id = pos.board[square as usize].expect("forcefield target").id;
        ev.push(pos.push_effect(ActiveEffect::new(EffectKind::Forcefield, id, NEVER)));
    }
}
