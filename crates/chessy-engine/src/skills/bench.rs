use super::{Skill, SkillId, SkillTarget};
use crate::position::Position;
use crate::types::*;

/// One of your pieces (not the king) leaves the board for a turn and comes back
/// on the free square closest to where it stood.
pub struct Bench;

impl Skill for Bench {
    fn id(&self) -> SkillId {
        SkillId::Bench
    }

    fn targets(&self, pos: &Position, color: Color) -> Vec<SkillTarget> {
        pos.pieces(color)
            .filter(|(_, p)| p.kind != PieceKind::King)
            // Pieces with a countdown that changes them are kept on the board.
            .filter(|(_, p)| {
                !pos.effects.iter().any(|e| {
                    e.piece == p.id
                        && matches!(
                            e.kind,
                            EffectKind::Vanish | EffectKind::Morphed | EffectKind::ColorLoan
                        )
                })
            })
            .map(|(square, _)| SkillTarget::Piece { square })
            .collect()
    }

    fn apply(&self, pos: &mut Position, _color: Color, target: SkillTarget, ev: &mut Vec<Event>) {
        let SkillTarget::Piece { square } = target else {
            return;
        };
        let piece = pos.board[square as usize].take().expect("bench target");
        pos.benched.push(BenchedPiece {
            piece,
            square,
            back_at: pos.ply + 2,
        });
        ev.push(Event::Benched { square, piece });
    }
}
