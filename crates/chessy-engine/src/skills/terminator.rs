use super::{Skill, SkillId, SkillTarget};
use crate::position::Position;
use crate::types::*;

/// An enemy piece (not the king) is copied onto its mirror square (same file,
/// rank `7 - r`), on your side of the board. The copy fights for you during
/// your next turn and then disappears.
pub struct Terminator;

fn mirror(s: Square) -> Square {
    sq(file_of(s), 7 - rank_of(s))
}

impl Skill for Terminator {
    fn id(&self) -> SkillId {
        SkillId::Terminator
    }

    fn targets(&self, pos: &Position, color: Color) -> Vec<SkillTarget> {
        pos.pieces(color.opposite())
            .filter(|(_, p)| p.kind != PieceKind::King)
            .filter(|&(square, p)| pos.can_place(color, p.kind, mirror(square)))
            .map(|(square, _)| SkillTarget::Piece { square })
            .collect()
    }

    fn apply(&self, pos: &mut Position, color: Color, target: SkillTarget, ev: &mut Vec<Event>) {
        let SkillTarget::Piece { square } = target else {
            return;
        };
        let source = pos.board[square as usize].expect("terminator target");
        let at = mirror(square);
        let id = pos.alloc_id();
        let mut copy = Piece::new(id, source.kind, color, at);
        copy.mirage = source.mirage;
        copy.temp = true;
        pos.board[at as usize] = Some(copy);
        ev.push(Event::Spawned {
            square: at,
            piece: copy,
        });
        // Usable on the caster's next turn, gone right after it.
        ev.push(pos.add_effect(EffectKind::Vanish, id, 3));
    }
}
