use super::{Skill, SkillId, SkillTarget};
use crate::position::Position;
use crate::types::{Color, EffectKind, Event, PieceKind};

/// One of your pieces (not the king) cannot be captured for the opponent's next turn.
pub struct Imune;

impl Skill for Imune {
    fn id(&self) -> SkillId {
        SkillId::Imune
    }

    fn targets(&self, pos: &Position, color: Color) -> Vec<SkillTarget> {
        pos.pieces(color)
            .filter(|(_, p)| p.kind != PieceKind::King)
            .map(|(square, _)| SkillTarget::Piece { square })
            .collect()
    }

    fn apply(&self, pos: &mut Position, _color: Color, target: SkillTarget, ev: &mut Vec<Event>) {
        let SkillTarget::Piece { square } = target else {
            return;
        };
        let id = pos.board[square as usize].expect("immune target").id;
        ev.push(pos.add_effect(EffectKind::Immune, id, 2));
    }
}
